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


## 2026 SDK transition candidate (Honcho #10)

The modernization candidate replaces the old TypeScript v1 SDK with the
official v2 packages. It uses the SDK createMcpHandler HTTP factory for
request-local modern (2026-07-28) metadata, discovery, version negotiation
and error handling, with its built-in stateless 2025 compatibility mode
only for the empirically observed Hermes transition. The Cloudflare
Worker entry and stdio entry must also be compiled/checked: this repo
contains multiple MCP hosts, not just the Dockerized Bun HTTP entry.

Do not interpret a passing legacy initializer as proof of the older
sessionful MCP contract: v2 stateless legacy has no Mcp-Session-Id and
cannot promise historic session-resumption behavior. Real Hermes 1.18.2
and the separate Python recall hook still require integration verification
before the production container can be replaced. An isolated GitHub PR
is not a deployment. Keep the official 2026 stateless failures visible
even when a narrow smoke turns green. Do not replace the Honcho data
backend or introduce a federation layer in this protocol migration.


## Distinguish protocol failures from unavailable official fixtures

The official 2026 stateless runner requires diagnostic tool names that are
not part of the Honcho public tool API. CI does not add test-only tools to
the public server to manufacture an all-green result. Instead it classifies
the exact checks.json by outcome and preserves the runner exit code:
- FAIL_PROTOCOL_CHECKS: at least one real protocol check failed.
- PARTIAL_MISSING_FIXTURES: no confirmed protocol failure, but required
  diagnostic probes could not run.
- PARTIAL_UNVERIFIED: checks have warnings or skips; never full pass.
- PASS_SCENARIO_ONLY: one scenario passed, not the whole protocol.
- UNKNOWN_*: incomplete/missing evidence or unexplained runner error.

Counts, blocking IDs and both original and derived artifacts are retained.
The conformance runner's raw errors and exact source SHA remain authoritative.

## Python client compatibility

The CI probe hermes-python-sdk-smoke.py runs via uv with mcp==2.3.0,
the Python MCP version declared by upstream Hermes. It confirms both
the 2025-era initialize + tools/list and the 2026-07-28 server/discover
+ tools/list against the isolated Bun HTTP host. The test bearer is
synthetic and loopback-only. The SDK 2.3.0 does not accept a direct
headers= argument on streamable_http_client: it needs an httpx2.AsyncClient.
Do not claim this covers the exact installed Hermes binary, its auto
negotiation configuration, OAuth refresh or a real Honcho backend.
A separate isolated cloud canary with a mocked Honcho backend has shown
successful search + bounded provenance for both SDK 2.3.0 handshake
methods. Those positive tool calls remain non-CI evidence until a
portable fake-backend test fixture is introduced.

## Positive cross-language search probe

The CI-only `fake-honcho-backend.ts` runs on loopback **inside the same
disposable Docker container** as the MCP server. It is bound to
`127.0.0.1:8000`; only the MCP HTTP port is published to the ephemeral
GitHub runner. The Python `mcp==2.3.0` smoke runs legacy initialize and
modern discover independently, then `tools/list` and bounded `tools/call`
`search` with `max_result_json_bytes=2048`. It asserts one literal
synthetic message, `honcho_search_bounded_v1` and returned coverage.

This validates the Python client → transport → real MCP tool dispatcher →
synthetic Honcho response → bounded evidence path; it is not a substitute
for acceptance against the installed Hermes client, real Honcho API
permissions, persistence, OAuth refresh or live data. The fixture may
never be used as a production backend.
