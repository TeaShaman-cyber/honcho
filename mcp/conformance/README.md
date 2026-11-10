# MCP conformance: versioned evidence, not universal certification

See Honcho issue #8.

The HTTP server uses MCP SDK 1.26.0 and the stateful initialize and
Mcp-Session-Id wire. The latest dated 2026-07-28 spec is instead stateless,
uses per-request metadata, and does not rely on initialize.

A pinned official conformance runner @modelcontextprotocol/conformance
version 0.2.0-alpha.12 is used. Its npm latest tag (0.1.16 on 2026-11-10)
did not yet provide the current 2026-07-28 revision's requirements.
Update runner version deliberately in a reviewed PR, never implicitly.

The isolated GitHub Actions workflow checks two required legacy scenarios
(2025-11-25 initialize and tools/list) and reports, without concealing,
the status of the newer 2026-07-28 stateless scenario. A failure on the
new protocol is a recorded gap, NOT a passing status or certification.
The single-scenario result is not a full revision conformance score.

The CI adapter supplies a constant synthetic bearer to an isolated
container on runner loopback. It forwards JSON-RPC, version/session headers,
response codes and bodies intact, but authentication/OAuth conformance
is NOT covered. Neither the real Honcho backend nor local Hermes is used.

The broader upstream conformance suite contains feature/tool fixtures and
OAuth cases not covered by these smokes. Expand gates only with evidenced
requirements, representative fixtures and an explicit version policy.
Review the results artifact and exact commit SHA before trusting the report.

For reproducibility the workload uses Node.js 22 and builds the existing
mcp/Dockerfile runtime stage. No deployed endpoint is involved.
