import { test } from "node:test";
import { strict as assert } from "node:assert";
import { summarize } from "./verify-report.mjs";

const report = (mutants, file = "src/types.ts") => ({
  files: { [file]: { mutants } },
});

test("complete targeted report is accepted and counted", () => {
  assert.deepEqual(summarize(report([{ status: "Killed" }, { status: "Survived" }])), {
    total: 2,
    counts: { Killed: 1, Survived: 1, NoCoverage: 0, Timeout: 0, CompileError: 0, RuntimeError: 0 },
  });
});

test("missing, empty, and unrelated reports fail closed", () => {
  assert.throws(() => summarize({}), /files/);
  assert.throws(() => summarize(report([])), /zero mutants/);
  assert.throws(() => summarize(report([{ status: "Killed" }], "src/config.ts")), /types.ts/);
});

test("pending, ignored, and undefined mutant results fail closed", () => {
  for (const status of ["Pending", "Ignored", undefined]) {
    assert.throws(() => summarize(report([{ status }])), /unexecuted or unknown/);
  }
});

test("missing mutant array fails closed", () => {
  assert.throws(() => summarize({ files: { "src/types.ts": {} } }), /mutants array missing/);
});
