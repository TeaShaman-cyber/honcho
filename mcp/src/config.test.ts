import { expect, test } from "bun:test";
import {
  DEFAULT_MAX_MESSAGE_CONTENT_CHARS,
  parseEnvConfig,
  parseMaxMessageContentChars,
  sentryOptions,
} from "./config.ts";

test("HONCHO_TIMEOUT_MS sets the request timeout", () => {
  const base = { HONCHO_API_KEY: "k" };
  expect(parseEnvConfig({ ...base, HONCHO_TIMEOUT_MS: "90000" }).timeoutMs).toBe(90000);
  expect(parseEnvConfig({ ...base, HONCHO_TIMEOUT_MS: "nope" }).timeoutMs).toBeUndefined();
  expect(parseEnvConfig(base).timeoutMs).toBeUndefined();
});

test("message content limit is bounded and deterministic", () => {
  expect(parseMaxMessageContentChars(undefined)).toBe(DEFAULT_MAX_MESSAGE_CONTENT_CHARS);
  expect(parseMaxMessageContentChars(" 512 ")).toBe(512);
  for (const invalid of ["", "0", "-1", "1.5", "NaN", "0x10", "1e3", "+2", "100001"]) {
    expect(parseMaxMessageContentChars(invalid)).toBe(DEFAULT_MAX_MESSAGE_CONTENT_CHARS);
  }
  expect(
    parseEnvConfig({
      HONCHO_API_KEY: "k",
      MCP_MAX_MESSAGE_CONTENT_CHARS: "321",
    }).maxMessageContentChars,
  ).toBe(321);
});

test("Sentry events drop request headers and body", () => {
  const { beforeSend } = sentryOptions({});
  const event = beforeSend({
    type: undefined,
    request: {
      method: "POST",
      url: "https://mcp.honcho.dev/",
      headers: { authorization: "Bearer secret" },
      data: '{"content":"memory"}',
    },
  });
  expect(event.request).toEqual({ method: "POST", url: "https://mcp.honcho.dev/" });
});
