import { expect, test } from "bun:test";
import { envBindings, fetch } from "./http.ts";

const origin = "http://127.0.0.1:3000";
const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "hermes", version: "1.18.2" },
};

function mcpPost(headers: Record<string, string>, body: Record<string, unknown>) {
  return fetch(new Request(origin + "/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }));
}

function modernPost(headers: Record<string, string>, body: {
  jsonrpc: string;
  id: number;
  method: string;
  params?: Record<string, unknown>;
}) {
  const toolName = body.method === "tools/call" ? body.params?.name : undefined;
  return mcpPost({
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": body.method,
    ...(typeof toolName === "string" ? { "Mcp-Name": toolName } : {}),
    ...headers,
  }, { ...body, params: { ...body.params, _meta: meta } });
}

const legacyInitialize = {
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "hermes", version: "1.18.2" },
  },
};
const listWorkspaces = {
  jsonrpc: "2.0", id: 4, method: "tools/call",
  params: { name: "list_workspaces", arguments: {} },
};

function upstream(status: number, body: unknown) {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

test("HTTP host forwards the message content limit into request config", () => {
  const previous = process.env.MCP_MAX_MESSAGE_CONTENT_CHARS;
  process.env.MCP_MAX_MESSAGE_CONTENT_CHARS = "321";
  try {
    expect(envBindings().MCP_MAX_MESSAGE_CONTENT_CHARS).toBe("321");
  } finally {
    if (previous === undefined) delete process.env.MCP_MAX_MESSAGE_CONTENT_CHARS;
    else process.env.MCP_MAX_MESSAGE_CONTENT_CHARS = previous;
  }
});

test("transitional legacy initialize works but does not retain a cross-request session", async () => {
  const init = await mcpPost({ Authorization: "Bearer key-a" }, legacyInitialize);
  expect(init.status).toBe(200);
  expect(init.headers.get("mcp-session-id")).toBeNull();
  const missing = await modernPost({}, { jsonrpc: "2.0", id: 10, method: "tools/list" });
  expect(missing.status).toBe(401);
  const other = await modernPost({ Authorization: "Bearer key-b" }, {
    jsonrpc: "2.0", id: 11, method: "tools/list",
  });
  expect(other.status).toBe(200);
});

test("2026 rejects conflicting protocol headers rather than silently downgrading", async () => {
  const response = await modernPost(
    { Authorization: "Bearer test", "MCP-Protocol-Version": "2099-01-01" },
    { jsonrpc: "2.0", id: 12, method: "tools/list" },
  );
  expect(response.status).toBe(400);
});

test("MCP requests disable the idle timeout", async () => {
  const disabled: string[] = [];
  const server = {
    timeout(request: Request, seconds: number) {
      if (seconds === 0) disabled.push(new URL(request.url).pathname);
    },
  };
  await fetch(new Request(origin + "/health"), server);
  await fetch(new Request(origin + "/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
  }), server);
  expect(disabled).toEqual(["/mcp"]);
});

test("a stateless tool call carries the caller's plugin header", async () => {
  const identity = {
    Authorization: "Bearer key-c",
    "User-Agent": "Cursor/1.0.0",
    "X-Honcho-Plugin": "cursor-honcho/0.2.0",
  };
  const seen: Headers[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, reqInit) => {
    seen.push(new Headers(reqInit?.headers as HeadersInit));
    return new Response(JSON.stringify({
      items: [], page: 1, size: 10, total: 0, pages: 0,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const call = await modernPost(identity, {
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "list_workspaces", arguments: {} },
    });
    expect(call.status).toBe(200);
    await call.text();
  } finally {
    globalThis.fetch = original;
  }
  expect(seen.length).toBeGreaterThan(0);
  expect(seen[0].get("X-Honcho-Plugin")).toBe("cursor-honcho/0.2.0 (Cursor/1.0.0)");
  expect(seen[0].get("X-Honcho-Host")).toMatch(/^honcho-mcp\//);
});

test("concurrent stateless OAuth access token failures independently return 401", async () => {
  const headers = { Authorization: "Bearer hch-at-expired" };
  const original = globalThis.fetch;
  globalThis.fetch = upstream(401, { detail: "Invalid or expired access token" });
  try {
    const responses = await Promise.all([
      modernPost(headers, listWorkspaces),
      modernPost(headers, { ...listWorkspaces, id: 5 }),
    ]);
    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.headers.get("WWW-Authenticate") || "").toContain('error="invalid_token"');
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("a non-expired OAuth permission error or API key 401 stays a tool error", async () => {
  const cases = [
    { token: "hch-plain-api-key", detail: "Invalid JWT" },
    { token: "hch-at-live", detail: "Resource requires admin privileges" },
  ];
  for (const item of cases) {
    const original = globalThis.fetch;
    globalThis.fetch = upstream(401, { detail: item.detail });
    try {
      const r = await modernPost({ Authorization: "Bearer " + item.token }, listWorkspaces);
      expect(r.status).toBe(200);
      const payload = await r.json() as { result: { isError?: boolean } };
      expect(payload.result.isError).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  }
});

test("a successful write overlapping a rejected read retains its 200", async () => {
  const headers = { Authorization: "Bearer hch-at-expiring" };
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });
  const row = {
    id: "x", metadata: {}, configuration: {},
    created_at: "2026-10-19T00:00:00Z",
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
    if (path.endsWith("/workspaces/list")) {
      return json(401, { detail: "Invalid or expired access token" });
    }
    if (path.endsWith("/messages")) {
      await held;
      return json(201, [{ ...row, content: "hi", peer_id: "p", session_id: "s" }]);
    }
    return json(200, row);
  };
  try {
    const write = modernPost(headers, {
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: {
        name: "add_messages_to_session",
        arguments: {
          workspace_id: "w", session_id: "s",
          messages: [{ peer_id: "p", content: "hi" }],
        },
      },
    });
    const read = await modernPost(headers, listWorkspaces);
    expect(read.status).toBe(401);
    release();
    const response = await write;
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Messages added to session successfully");
  } finally {
    globalThis.fetch = original;
    release();
  }
});
