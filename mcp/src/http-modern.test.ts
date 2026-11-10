import { expect, test } from "bun:test";
import { fetch } from "./http.ts";

const origin = "http://127.0.0.1:3000";
const metadata = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "theseus-test", version: "1.0" },
};

function request(method: string, id: number, params: Record<string, unknown> = {}, headers = {}) {
  return new Request(origin + "/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
      Authorization: "Bearer conformance-canary",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: metadata } }),
  });
}

test("2026 server/discover advertises actual supported version with request-local auth", async () => {
  const r = await fetch(request("server/discover", 73));
  expect(r.status).toBe(200);
  expect(r.headers.get("mcp-session-id")).toBeNull();
  const data = await r.json() as { result?: { supportedVersions: string[]; capabilities: { tools: object } } };
  expect(data.result?.supportedVersions).toContain("2026-07-28");
  expect(data.result?.capabilities?.tools).toBeDefined();
});

test("2026 tools/list needs no prior initialize or session ID", async () => {
  const r = await fetch(request("tools/list", 74));
  expect(r.status).toBe(200);
  const data = await r.json() as { result?: { tools: { name: string }[] } };
  expect(data.result?.tools?.some(t => t.name === "search")).toBe(true);
});

test("2026 still rejects missing bearer before handling tools", async () => {
  const r = await fetch(request("tools/list", 75, {}, { Authorization: "" }));
  expect(r.status).toBe(401);
});

test("2026 rejects missing required _meta as invalid params", async () => {
  const req = request("tools/list", 76);
  const r = await fetch(new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({jsonrpc: "2.0", id: 76, method: "tools/list", params: {}}),
  }));
  expect(r.status).toBe(400);
  const data = await r.json() as { error?: { code: number } };
  expect(data.error?.code).toBe(-32602);
});
