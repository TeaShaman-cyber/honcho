import { DEFAULT_MAX_MESSAGE_CONTENT_CHARS } from "./config.js";
import {
  formatConclusion,
  formatMessage,
  truncateMessageContent,
} from "./types.js";

/**
 * Opt-in bounded representation of an *upstream result window*. The upstream
 * search API does not expose how many matching records exist in total.
 * The bound applies to UTF-8 bytes of the JSON text carried in MCP content[0],
 * not the bytes of the enclosing JSON-RPC transport frame.
 */
type Message = Parameters<typeof formatMessage>[0];
type Conclusion = Parameters<typeof formatConclusion>[0];
type Kind = "messages" | "conclusions";
type Item = Record<string, unknown> & {
  content: string;
  content_chars: number;
  content_truncated: boolean;
};

type Coverage = {
  retrieved_messages: number;
  returned_messages: number;
  omitted_messages: number;
  retrieved_conclusions: number;
  returned_conclusions: number;
  omitted_conclusions: number;
  total_matches: null;
  total_matches_status: "UNKNOWN_UPSTREAM";
};

export type BoundedSearchResponse = {
  format: "honcho_search_bounded_v1";
  messages: Item[];
  conclusions: Item[];
  coverage: Coverage;
  max_result_json_bytes: number;
};

function byteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function tryAdd(
  result: BoundedSearchResponse,
  kind: Kind,
  item: Item,
  maxBytes: number,
): boolean {
  const returnedKey = kind === "messages" ? "returned_messages" : "returned_conclusions";
  const omittedKey = kind === "messages" ? "omitted_messages" : "omitted_conclusions";
  result[kind].push(item);
  result.coverage[returnedKey] += 1;
  result.coverage[omittedKey] -= 1;
  if (byteSize(result) <= maxBytes) return true;
  result[kind].pop();
  result.coverage[returnedKey] -= 1;
  result.coverage[omittedKey] += 1;
  return false;
}

function addBestFit(
  result: BoundedSearchResponse,
  kind: Kind,
  item: Item,
  originalContent: string,
  contentLimit: number,
  maxBytes: number,
): void {
  // Keep provider metadata when possible. If it is too large, explicitly
  // report its omission before considering shortening the content.
  const alternatives: Item[] =
    kind === "messages" && "metadata" in item
      ? [item, { ...item, metadata: null, metadata_omitted: true }]
      : [item];

  for (const candidate of alternatives) {
    if (tryAdd(result, kind, candidate, maxBytes)) return;

    // Search the largest safely representable prefix by Unicode code points.
    // Counting the final serialized JSON captures escaping and UTF-8 width.
    const chars = Array.from(originalContent);
    let low = 1;
    let high = Math.min(contentLimit, chars.length);
    let best: Item | null = null;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const bounded = truncateMessageContent(originalContent, middle);
      const shortened: Item = {
        ...candidate,
        content: bounded.content,
        content_chars: bounded.contentChars,
        content_truncated: bounded.contentTruncated,
      };
      if (tryAdd(result, kind, shortened, maxBytes)) {
        // Testing a candidate is reversible. Keep the last successful
        // prefix only after the binary search has completed.
        result[kind].pop();
        const key = kind === "messages" ? "returned_messages" : "returned_conclusions";
        const omitted = kind === "messages" ? "omitted_messages" : "omitted_conclusions";
        result.coverage[key] -= 1;
        result.coverage[omitted] += 1;
        best = shortened;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (best && tryAdd(result, kind, best, maxBytes)) return;
  }
  // There is insufficient room even for the identifying/provenance fields.
  // The record is omitted, with the omitted count retained in the envelope.
}

export function boundedSearchResponse(
  messages: Message[],
  conclusions: Conclusion[],
  maxJsonBytes: number,
  maxContentChars = DEFAULT_MAX_MESSAGE_CONTENT_CHARS,
): BoundedSearchResponse {
  if (!Number.isInteger(maxJsonBytes) || maxJsonBytes < 512 || maxJsonBytes > 65536) {
    throw new RangeError("maxJsonBytes must be an integer from 512 to 65536");
  }
  if (!Number.isInteger(maxContentChars) || maxContentChars <= 0) {
    throw new RangeError("maxContentChars must be positive");
  }

  const result: BoundedSearchResponse = {
    format: "honcho_search_bounded_v1",
    messages: [],
    conclusions: [],
    coverage: {
      retrieved_messages: messages.length,
      returned_messages: 0,
      omitted_messages: messages.length,
      retrieved_conclusions: conclusions.length,
      returned_conclusions: 0,
      omitted_conclusions: conclusions.length,
      total_matches: null,
      total_matches_status: "UNKNOWN_UPSTREAM",
    },
    max_result_json_bytes: maxJsonBytes,
  };
  if (byteSize(result) > maxJsonBytes) {
    throw new RangeError("budget too small for coverage envelope");
  }

  // Interleave by upstream rank; prioritize conclusion 1 before message 1
  // to avoid always starving conclusions behind all message candidates.
  for (let index = 0; index < Math.max(messages.length, conclusions.length); index++) {
    const conclusion = conclusions[index];
    if (conclusion) {
      const original = formatConclusion(conclusion);
      const bounded = truncateMessageContent(conclusion.content, maxContentChars);
      addBestFit(
        result,
        "conclusions",
        { ...original, content: bounded.content, content_chars: bounded.contentChars, content_truncated: bounded.contentTruncated },
        conclusion.content,
        maxContentChars,
        maxJsonBytes,
      );
    }
    const message = messages[index];
    if (message) {
      addBestFit(
        result,
        "messages",
        formatMessage(message, maxContentChars),
        message.content,
        maxContentChars,
        maxJsonBytes,
      );
    }
  }
  if (byteSize(result) > maxJsonBytes) {
    throw new Error("bounded-search serialization exceeded its own budget");
  }
  return result;
}
