import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const untestableDiagnostic = "Not testable: server does not list the diagnostic tool ";

export function classifyChecks(checks, runnerExit) {
  const counts = {};
  for (const check of checks) {
    const status = check.status ?? "UNKNOWN";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  const failures = checks.filter((check) => check.status === "FAILURE");
  const fixtureGaps = failures.filter((check) =>
    typeof check.errorMessage === "string" &&
    check.errorMessage.startsWith(untestableDiagnostic)
  );
  const realFailures = failures.length - fixtureGaps.length;
  let outcome;
  if (checks.length === 0) outcome = "UNKNOWN_NO_CHECKS";
  else if (realFailures > 0) outcome = "FAIL_PROTOCOL_CHECKS";
  else if (fixtureGaps.length > 0) outcome = "PARTIAL_MISSING_FIXTURES";
  else if (runnerExit !== 0) outcome = "UNKNOWN_RUNNER_ERROR";
  else if ((counts.SKIPPED ?? 0) > 0 || (counts.WARNING ?? 0) > 0) {
    outcome = "PARTIAL_UNVERIFIED";
  } else outcome = "PASS_SCENARIO_ONLY";

  return {
    outcome,
    counts,
    realFailures,
    fixtureGaps: fixtureGaps.map((check) => check.id),
    runnerExit,
    scope: "one official scenario only; never full MCP specification certification",
  };
}

function findChecks(dir) {
  const matches = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) matches.push(...findChecks(path));
    else if (item.isFile() && item.name === "checks.json") matches.push(path);
  }
  return matches;
}

function main() {
  const [directory, exitRaw, reportFile] = process.argv.slice(2);
  if (!directory || !Number.isInteger(Number(exitRaw))) {
    throw new Error("Usage: node classify.mjs <scenario-results-dir> <runner-exit-code> [report-json]");
  }
  const paths = findChecks(directory);
  // Multiple output sets are ambiguous. Fail visibly instead of silently
  // selecting a stale report and declaring success.
  if (paths.length > 1) throw new Error("Ambiguous conformance checks.json files: " + paths.join(", "));
  const checks = paths.length === 1 ? JSON.parse(readFileSync(paths[0], "utf8")) : [];
  if (!Array.isArray(checks)) throw new Error("Conformance checks must be an array");
  const outcome = classifyChecks(checks, Number(exitRaw));
  if (reportFile) writeFileSync(reportFile, JSON.stringify(outcome, null, 2) + "\n");
  console.log("MODERN_2026_SINGLE_SCENARIO=" + outcome.outcome);
  console.log("RUNNER_EXIT=" + outcome.runnerExit);
  console.log("COUNTS=" + JSON.stringify(outcome.counts));
  console.log("REAL_FAILURES=" + outcome.realFailures);
  console.log("MISSING_FIXTURE_CHECKS=" + JSON.stringify(outcome.fixtureGaps));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
