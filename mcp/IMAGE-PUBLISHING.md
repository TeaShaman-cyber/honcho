# Container artifact separation (Honcho fork)

Canonical coordination: TeaShaman-cyber/honcho#6.

- Python application: repository-root Dockerfile, port 8000, existing GHCR
  image ghcr.io/teashaman-cyber/honcho. The existing workflow remains enabled
  for tag releases and non-MCP changes; MCP-only main changes do not rebuild it.
- MCP server: mcp/Dockerfile, Bun 1.4.4, port 3000. New image:
  ghcr.io/teashaman-cyber/honcho-mcp with immutable source SHA tag and latest.
  PR builds do not publish; main publishing uses MCP context ./mcp.
- Existing mcp-qa.yml runs Bun QA and builds production MCP image as a
  separate check. Publishing is not live container deployment.
- A main commit changing both root service and MCP may start both builds.
  Root v* tag release behavior remains unchanged; MCP image has no v* tag
  release trigger.
- Live honcho-mcp-probe should only be replaced after an isolated MCP
  initialize/tools/list/tools/call probe and verified rollback image.
