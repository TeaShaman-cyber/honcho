import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyChecks } from "./classify.mjs";

const check = (status, errorMessage = undefined) => ({status, errorMessage});
const fixture = (id) => ({
  ...check("FAILURE", "Not testable: server does not list the diagnostic tool '" + id + "' in tools/list"),
  id,
});

test("missing diagnostics are unverified, not a claimed protocol failure or pass", () => {
  const r = classifyChecks([check("SUCCESS"), fixture("test_logging_tool"), check("SKIPPED")], 1);
  assert.equal(r.outcome, "PARTIAL_MISSING_FIXTURES");
  assert.equal(r.counts.FAILURE, 1);
});

test("real protocol errors are reported even when some fixtures are unavailable", () => {
  const r = classifyChecks([fixture("test_logging_tool"), check("FAILURE", "Expected error -32602, got 200")], 1);
  assert.equal(r.outcome, "FAIL_PROTOCOL_CHECKS");
  assert.equal(r.realFailures, 1);
});

test("warning/skip prevents full single-scenario success", () => {
  assert.equal(classifyChecks([check("SUCCESS"), check("WARNING")], 0).outcome, "PARTIAL_UNVERIFIED");
  assert.equal(classifyChecks([check("SUCCESS"), check("SKIPPED")], 0).outcome, "PARTIAL_UNVERIFIED");
});

test("an unambiguous scenario passes only when runner and checks pass", () => {
  assert.equal(classifyChecks([check("SUCCESS")], 0).outcome, "PASS_SCENARIO_ONLY");
  assert.equal(classifyChecks([check("SUCCESS")], 1).outcome, "UNKNOWN_RUNNER_ERROR");
  assert.equal(classifyChecks([], 0).outcome, "UNKNOWN_NO_CHECKS");
});
