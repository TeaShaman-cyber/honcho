# Container artifact separation (Honcho fork)

Canonical coordination: TeaShaman-cyber/honcho#6.

- Python application: repository-root Dockerfile, port 8000, existing GHCR
  image ghcr.io/teashaman-cyber/honcho. The existing workflow remains enabled
  for tag releases and non-MCP changes; MCP-only main changes do not rebuild it.
- MCP server: mcp/Dockerfile, Bun 1.4.4, port 3000. Separate image:
  ghcr.io/teashaman-cyber/honcho-mcp with latest and a source-commit SHA tag.
  Tags are mutable registry pointers; use the published content digest
  (sha256:...) for a reproducible candidate and rollback.
- Existing mcp-qa.yml runs Bun QA and builds the production MCP image on PRs
  without publishing. The release workflow publishes only from main, using
  context ./mcp and no PR registry-write permissions. Publishing is not live
  container deployment.
- A main commit changing both root service and MCP may start both builds.
  Root v* tag release behavior remains unchanged; MCP image has no v* tag
  release trigger.
- Live honcho-mcp-probe should only be replaced after an isolated MCP
  initialize/tools/list/tools/call probe and verified rollback image.
