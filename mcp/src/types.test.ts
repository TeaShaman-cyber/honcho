import { expect, test } from "bun:test";
import type { Message } from "@honcho-ai/sdk/resources/messages";
import { formatMessage, formatMessages, textResult } from "./types.ts";

function message(content: string, id = "m1"): Message {
  return {
    id,
    content,
    peerId: "semyon",
    sessionId: "session-1",
    metadata: { source: "test" },
    createdAt: new Date("2026-11-09T00:00:00.000Z"),
  } as Message;
}

test("formatMessage preserves short content and reports its size", () => {
  expect(formatMessage(message("short"), 5)).toEqual({
    id: "m1",
    content: "short",
    content_chars: 5,
    content_truncated: false,
    peer_id: "semyon",
    session_id: "session-1",
    metadata: { source: "test" },
    created_at: new Date("2026-11-09T00:00:00.000Z"),
  });
});

test("formatMessage truncates long content without splitting Unicode", () => {
  expect(formatMessage(message("😀abc"), 2)).toMatchObject({
    content: "😀…",
    content_chars: 4,
    content_truncated: true,
  });
});

test("formatMessages applies the bound to every record", () => {
  const result = formatMessages([message("abcdef", "m1"), message("xy", "m2")], 3);
  expect(result.map(({ id, content, content_chars, content_truncated }) => ({
    id,
    content,
    content_chars,
    content_truncated,
  }))).toEqual([
    { id: "m1", content: "ab…", content_chars: 6, content_truncated: true },
    { id: "m2", content: "xy", content_chars: 2, content_truncated: false },
  ]);
});

test("textResult remains strict JSON after truncating hostile text", () => {
  const dangerous = 'quote=" newline=\n slash=\\ emoji=😀 tail';
  const payload = { messages: formatMessages([message(dangerous)], 12) };
  const result = textResult(payload);
  expect(result.content).toHaveLength(1);
  const item = result.content[0];
  expect(item.type).toBe("text");
  if (item.type !== "text") throw new Error("expected text MCP content");

  const parsed = JSON.parse(item.text);
  expect(JSON.stringify(parsed)).toBe(item.text);
  expect(item.text.startsWith("```")).toBe(false);
  expect(parsed.messages[0]).toMatchObject({
    id: "m1",
    content_chars: Array.from(dangerous).length,
    content_truncated: true,
  });
});

test("formatMessage rejects an invalid bound", () => {
  expect(formatMessage(message("long"), 1)).toMatchObject({
    content: "…",
    content_chars: 4,
    content_truncated: true,
  });
  expect(() => formatMessage(message("text"), 0)).toThrow("positive integer");
  expect(() => formatMessage(message("text"), 1.5)).toThrow("positive integer");
});
