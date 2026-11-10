import { createMcpHandler } from "@modelcontextprotocol/server";
import * as Sentry from "@sentry/bun";
import {
  HEADER_PLUGIN,
  honchoClients,
  identityHeaders,
  parseConfig,
  type Env,
  type HonchoConfig,
  sentryOptions,
} from "./config.js";
import { createServer } from "./server.js";
import { invalidTokenResponse } from "./types.js";
declare const process: {
  env: Record<string, string | undefined>;
};

type BunServer = { timeout(request: Request, seconds: number): void };

declare const Bun: {
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request, server: BunServer): Response | Promise<Response>;
  }): { hostname: string; port: number };
};

const CORS_ORIGIN = "*";
const CORS_METHODS = "GET, POST, DELETE, OPTIONS";
const CORS_ALLOWED_HEADERS =
  "Content-Type, Authorization, X-Honcho-Workspace-ID, X-Honcho-Plugin, Mcp-Method, Mcp-Name, mcp-session-id, mcp-protocol-version, last-event-id";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": CORS_METHODS,
  "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
  "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id",
};

const PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
const MCP_PATHS = new Set(["/", "/mcp"]);

export function envBindings(): Env {
  return {
    HONCHO_API_URL: process.env.HONCHO_API_URL,
    HONCHO_TIMEOUT_MS: process.env.HONCHO_TIMEOUT_MS,
    MCP_MAX_MESSAGE_CONTENT_CHARS: process.env.MCP_MAX_MESSAGE_CONTENT_CHARS,
  };
}

function authorizationServer(): string {
  return process.env.HONCHO_API_URL?.trim() || "https://api.honcho.dev";
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

function configForRequest(request: Request) {
  return parseConfig(request, envBindings());
}

function configOrUnauthorized(request: Request): HonchoConfig | Response {
  try {
    return configForRequest(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid request";
    return unauthorized(request, message);
  }
}

function rejectedToken(request: Request): Response {
  const resourceMetadata = `${new URL(request.url).origin}${PROTECTED_RESOURCE_PATH}`;
  return invalidTokenResponse(resourceMetadata, CORS_HEADERS);
}

function unauthorized(request: Request, message: string): Response {
  const resourceMetadata = `${new URL(request.url).origin}${PROTECTED_RESOURCE_PATH}`;
  return jsonResponse(
    { error: message },
    401,
    {
      "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
    },
  );
}

async function handleMcp(request: Request): Promise<Response> {
  const config = configOrUnauthorized(request);
  if (config instanceof Response) return config;

  // A modern request has no protocol session. Create the request-bound
  // identity and tools factory here, rather than binding one token to
  // multiple requests. The SDK owns _meta/version/JSON-RPC validation.
  let rejected = false;
  const identity = identityHeaders(
    request.headers.get("User-Agent"),
    request.headers.get(HEADER_PLUGIN),
  );
  const handler = createMcpHandler(
    () => createServer({
      config,
      ...honchoClients(config, identity),
      onUnauthorized: () => { rejected = true; },
    }),
    {
      // Transitional handshake for the observed Hermes client. This is
      // not a promise to retain the full legacy stateful session model.
      legacy: "stateless",
    },
  );
  const response = await handler.fetch(request);
  if (rejected) return rejectedToken(request);
  return withCors(response);
}

export async function fetch(
  request: Request,
  server?: BunServer,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const pathname = new URL(request.url).pathname;

  if (pathname === "/health") {
    return jsonResponse({ status: "ok" }, 200);
  }

  if (pathname === PROTECTED_RESOURCE_PATH) {
    return jsonResponse(
      {
        resource: new URL(request.url).origin,
        authorization_servers: [authorizationServer()],
        bearer_methods_supported: ["header"],
        scopes_supported: ["read", "write"],
      },
      200,
    );
  }

  if (!MCP_PATHS.has(pathname)) {
    return jsonResponse({ error: "Not Found" }, 404);
  }

  // A tool call writes nothing until it finishes, so Bun's 10s idle timeout
  // would drop any call slower than that.
  server?.timeout(request, 0);

  try {
    return await handleMcp(request);
  } catch (e) {
    Sentry.captureException(e);
    const message =
      e instanceof Error ? e.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
}

const isMain = Boolean((import.meta as { main?: boolean }).main);
if (isMain) {
  Sentry.init(sentryOptions({ SENTRY_DSN: process.env.SENTRY_DSN }));
  const hostname = process.env.HOST?.trim() || "0.0.0.0";
  const port = Number(process.env.PORT) || 3000;
  Bun.serve({ hostname, port, fetch });
  console.error(`honcho-mcp listening on http://${hostname}:${port}`);
}
