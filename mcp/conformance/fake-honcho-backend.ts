/**
 * Disposable, private CI fixture for positive MCP search calls.
 * No network exposure, user corpus, real API key or persistent state.
 * Run inside the same isolated Docker container as the MCP server.
 */
declare const Bun: {
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request): Response;
  }): unknown;
};

Bun.serve({
  hostname: "127.0.0.1",
  port: 8000,
  fetch(request: Request): Response {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/v3/workspaces") {
      return Response.json({
        id: "mcp-conformance",
        metadata: {},
        configuration: {},
        created_at: "2026-11-10T00:00:00Z",
      });
    }
    if (request.method === "POST" && path === "/v3/workspaces/mcp-conformance/search") {
      return Response.json([
        {
          id: "synthetic-mcp-message-1",
          peer_id: "fake-peer",
          session_id: "fake-session",
          content: "synthetic-MCP-canary-message",
          metadata: {},
          created_at: "2026-11-10T00:00:00Z",
        },
      ]);
    }
    return Response.json({ detail: "Synthetic fixture does not implement this API route" }, { status: 404 });
  },
});
