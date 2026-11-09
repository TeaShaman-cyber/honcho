import { expect, test } from "bun:test";
import type { Message, Conclusion } from "@honcho-ai/sdk";
import { boundedSearchResponse } from "./search-budget.ts";

function message(content: string, id: string, metadata: Record<string, unknown> = {}): Message {
  return {
    id,
    content,
    metadata,
    peerId: "semyon",
    sessionId: "session-a",
    createdAt: new Date("2026-11-09T00:00:00Z"),
  } as Message;
}

function conclusion(content: string, id = "c1", sourceIds = ["premise-1"]): Conclusion {
  return {
    id,
    content,
    level: "explicit",
    sourceIds,
    sourceMessageIds: ["m1"],
    timesDerived: 3,
    observerId: "svarog",
    observedId: "semyon",
    sessionId: "session-a",
    createdAt: new Date("2026-11-09T00:00:00Z"),
  } as Conclusion;
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

test("long conclusion has a JSON-byte bound and retains source attribution", () => {
  const input = conclusion('😀"\\\n'.repeat(1600));
  const result = boundedSearchResponse([], [input], 1000, 2000);
  expect(utf8Bytes(result)).toBeLessThanOrEqual(1000);
  expect(result.format).toBe("honcho_search_bounded_v1");
  expect(result.coverage).toMatchObject({
    retrieved_conclusions: 1,
    returned_conclusions: 1,
    omitted_conclusions: 0,
    total_matches: null,
    total_matches_status: "UNKNOWN_UPSTREAM",
  });
  expect(result.conclusions[0]).toMatchObject({
    id: "c1",
    source_ids: ["premise-1"],
    source_message_ids: ["m1"],
    times_derived: 3,
    content_truncated: true,
    content_chars: Array.from(input.content).length,
  });
});

test("oversized message metadata is explicitly omitted before losing the message", () => {
  const result = boundedSearchResponse(
    [message("important finding", "m1", { private_notes: "x".repeat(8000) })],
    [],
    850,
    2000,
  );
  expect(utf8Bytes(result)).toBeLessThanOrEqual(850);
  expect(result.coverage).toMatchObject({
    returned_messages: 1,
    omitted_messages: 0,
  });
  expect(result.messages[0]).toMatchObject({
    id: "m1",
    content: "important finding",
    metadata: null,
    metadata_omitted: true,
    content_truncated: false,
  });
});

test("window overflow omits only accounted-for records, not silent search matches", () => {
  const messages = Array.from({ length: 15 }, (_, i) => message("x".repeat(350), "m" + i));
  const conclusions = Array.from({ length: 15 }, (_, i) =>
    conclusion("summary" + i, "c" + i),
  );
  const result = boundedSearchResponse(messages, conclusions, 512, 2000);
  expect(utf8Bytes(result)).toBeLessThanOrEqual(512);
  expect(result.coverage.returned_messages + result.coverage.omitted_messages).toBe(15);
  expect(result.coverage.returned_conclusions + result.coverage.omitted_conclusions).toBe(15);
  expect(result.coverage.omitted_messages + result.coverage.omitted_conclusions).toBeGreaterThan(0);
  expect(result.coverage.total_matches).toBeNull();
  expect(result.coverage.total_matches_status).toBe("UNKNOWN_UPSTREAM");
});

test("if identifying provenance cannot fit, record omission is still visible", () => {
  const unboundedSource = Array.from({ length: 400 }, (_, i) => "premise-" + i);
  const result = boundedSearchResponse([], [conclusion("small", "c1", unboundedSource)], 512, 1000);
  expect(result.coverage).toMatchObject({
    retrieved_conclusions: 1,
    returned_conclusions: 0,
    omitted_conclusions: 1,
  });
  expect(result.conclusions).toHaveLength(0);
  expect(utf8Bytes(result)).toBeLessThanOrEqual(512);
});

test("hostile escaping and emoji remain strict JSON and deterministic", () => {
  const messages = [message('newline\nquote" slash\\ emoji😀'.repeat(90), "m1")];
  const result = boundedSearchResponse(messages, [], 650, 2000);
  const text = JSON.stringify(result);
  const parsed = JSON.parse(text);
  expect(parsed.messages[0].created_at).toBe("2026-11-09T00:00:00.000Z");
  expect(parsed.messages[0].content_truncated).toBe(true);
  expect(utf8Bytes(result)).toBeLessThanOrEqual(650);
  expect(boundedSearchResponse(messages, [], 650, 2000)).toEqual(result);
  expect(result.messages[0]?.content_truncated).toBe(true);
  expect(result.messages[0]?.content_chars).toBe(Array.from(messages[0].content).length);
});

test("invalid budgets never silently fall back to an unbounded response", () => {
  for (const budget of [0, 511, 65537, 1000.5, Number.NaN]) {
    expect(() => boundedSearchResponse([], [], budget, 2000)).toThrow(RangeError);
  }
  expect(() => boundedSearchResponse([], [], 600, 0)).toThrow(RangeError);
});
