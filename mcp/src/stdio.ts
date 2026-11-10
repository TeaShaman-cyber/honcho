import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as Sentry from "@sentry/bun";
import { honchoClients, parseEnvConfig, sentryOptions } from "./config.js";
import { createServer } from "./server.js";

declare const process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};

Sentry.init(sentryOptions({ SENTRY_DSN: process.env.SENTRY_DSN }));

try {
  const config = parseEnvConfig({
    HONCHO_API_KEY: process.env.HONCHO_API_KEY,
    HONCHO_API_URL: process.env.HONCHO_API_URL,
    HONCHO_WORKSPACE_ID: process.env.HONCHO_WORKSPACE_ID,
    HONCHO_TIMEOUT_MS: process.env.HONCHO_TIMEOUT_MS,
    MCP_MAX_MESSAGE_CONTENT_CHARS: process.env.MCP_MAX_MESSAGE_CONTENT_CHARS,
  });
  // No HTTP caller on stdio, so only X-Honcho-Host is sent.
  await serveStdio(() => createServer({ config, ...honchoClients(config) }));
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(message);
  process.exit(1);
}
