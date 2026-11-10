import assert from "node:assert/strict";
import http from "node:http";
import { afterEach, test } from "node:test";
import { createConformanceAuthProxy } from "./auth-proxy.mjs";

const servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function onRandomPort(server) {
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}

test("forwards MCP JSON-RPC body/session/version/status, while adding only test bearer", async () => {
  let requestSeen;
  const upstreamPort = await onRandomPort(http.createServer(async (req, res) => {
    const body = [];
    for await (const chunk of req) body.push(chunk);
    requestSeen = {
      method: req.method,
      url: req.url,
      auth: req.headers.authorization,
      protocol: req.headers["mcp-protocol-version"],
      data: Buffer.concat(body).toString("utf8"),
    };
    res.writeHead(202, {
      "Content-Type": "application/json",
      "Mcp-Session-Id": "session-007",
    });
    res.end('{"jsonrpc":"2.0","id":1,"result":{}}');
  }));
  const proxyPort = await onRandomPort(createConformanceAuthProxy({
    upstreamPort,
  }));
  const payload = '{"jsonrpc":"2.0","id":1,"method":"initialize"}';
  const response = await fetch('http://127.0.0.1:'+proxyPort+'/mcp', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
    },
    body: payload,
  });
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("mcp-session-id"), "session-007");
  assert.equal(await response.text(), '{"jsonrpc":"2.0","id":1,"result":{}}');
  assert.deepEqual(requestSeen, {
    method: "POST",
    url: "/mcp",
    auth: "Bearer conformance-local-only",
    protocol: "2025-11-25",
    data: payload,
  });
});

test("propagates JSON-RPC 400 errors without rewriting them", async () => {
  const upstreamPort = await onRandomPort(http.createServer((_req, res) => {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end('{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"wrong version"}}');
  }));
  const proxyPort = await onRandomPort(createConformanceAuthProxy({upstreamPort}));
  const response = await fetch('http://127.0.0.1:'+proxyPort+'/mcp', {
    method: "POST", body: "{}", headers: {"Content-Type":"application/json"},
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, -32600);
});
