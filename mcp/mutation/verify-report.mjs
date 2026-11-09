import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const TERMINAL = new Set(["Killed", "Survived", "NoCoverage", "Timeout", "CompileError", "RuntimeError"]);

export function summarize(report) {
  if (!report || typeof report.files !== "object" || !report.files) {
    throw new Error("missing Stryker files collection");
  }
  const entries = Object.entries(report.files);
  if (!entries.length || !entries.some(([path]) => path.endsWith("src/types.ts"))) {
    throw new Error("expected src/types.ts in mutation report");
  }
  const counts = Object.fromEntries([...TERMINAL].map((status) => [status, 0]));
  let total = 0;
  for (const [file, details] of entries) {
    if (!Array.isArray(details?.mutants)) {
      throw new Error("mutants array missing for " + file);
    }
    for (const mutant of details.mutants) {
      if (!TERMINAL.has(mutant.status)) {
        throw new Error("unexecuted or unknown mutant status: " + String(mutant.status));
      }
      counts[mutant.status] += 1;
      total += 1;
    }
  }
  if (total === 0) throw new Error("zero mutants: no test of test sensitivity occurred");
  return { total, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const path = process.argv[2] ?? "reports/mutation/mutation.json";
    console.log("MUTATION_REPORT_VERIFIED " + JSON.stringify(summarize(JSON.parse(readFileSync(path, "utf8")))));
  } catch (error) {
    console.error("MUTATION_REPORT_INVALID: " + error.message);
    process.exitCode = 1;
  }
}
