import http from "node:http";
import { fileURLToPath } from "node:url";

/**
 * Local-only conformance adapter.
 * Supplies test bearer for the isolated Honcho container but preserves MCP
 * wire bodies, protocol-version headers, statuses and session headers.
 * This is NOT an OAuth/bearer conformance test and must not run externally.
 */
export function createConformanceAuthProxy({ upstreamPort = 3000 } = {}) {
  return http.createServer((clientReq, clientRes) => {
    const forwardedHeaders = {
      ...clientReq.headers,
      host: "127.0.0.1:" + upstreamPort,
      authorization: "Bearer conformance-local-only",
    };
    const upstream = http.request({
      hostname: "127.0.0.1",
      port: upstreamPort,
      path: clientReq.url,
      method: clientReq.method,
      headers: forwardedHeaders,
    }, (response) => {
      clientRes.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(clientRes);
    });
    upstream.on("error", () => {
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { "Content-Type": "text/plain" });
      }
      clientRes.end("conformance upstream unavailable");
    });
    clientReq.pipe(upstream);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.CONFORMANCE_PROXY_PORT || 3001);
  createConformanceAuthProxy().listen(port, "127.0.0.1", () => {
    console.log("Conformance-only bearer adapter at 127.0.0.1:" + port);
  });
}
