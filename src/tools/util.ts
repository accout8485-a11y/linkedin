import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

/** Wraps a handler so thrown errors come back as tool errors Claude can read. */
export function safe<A>(fn: (args: A) => Promise<unknown>): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    try {
      return ok(await fn(args));
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
      };
    }
  };
}

const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/**
 * Converts plain text to LinkedIn's "little text" commentary format: reserved
 * characters are escaped, and `#word` becomes a real hashtag.
 */
export function toLittleText(text: string): string {
  return text
    .split(/(#[\p{L}\p{N}_]+)/u)
    .map((part) =>
      /^#[\p{L}\p{N}_]+$/u.test(part)
        ? `{hashtag|\\#|${part.slice(1).replace(RESERVED, (c) => `\\${c}`)}}`
        : part.replace(RESERVED, (c) => `\\${c}`),
    )
    .join("");
}
