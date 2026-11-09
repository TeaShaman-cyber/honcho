# Bounded MCP mutation audit

Coordination: TeaShaman-cyber/honcho#2. Independent of Hermes and live Honcho.

This pilot mutates only message truncation/serialization in src/types.ts
(lines 127-159 at fork main dad6848). The existing Bun tests run through
StrykerJS 10.1.1 in command-runner mode. Command runner has no test-specific
coverage insight; every mutant runs bun test src/types.test.ts. Survivors
are audit findings, not an automatic PR blocker.

GitHub Actions uses Node 22, Bun 1.4.4 and pinned lockfile installations.
It runs unmutated MCP checks and negative tests for the JSON report verifier
before mutation execution. The report is retained as a CI artifact.
The verifier rejects missing/empty reports and pending/unknown statuses.

This does not cover conclusion size, total MCP response budget, other
transports or recall quality. Contract changes require a separate decision.
