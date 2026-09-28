import { describe, expect, it } from "vitest";
import { SseParser } from "./sse-parser";

describe("SseParser", () => {
  it("joins multi-line data with newlines", () => {
    const parser = new SseParser();
    const frames = parser.feed("data: a\ndata: b\ndata: c\n\n");
    expect(frames[0]?.data).toBe("a\nb\nc");
  });

  it("handles chunk boundaries", () => {
    const parser = new SseParser();
    const a = parser.feed("id: 2-0\ndata: {\"a\":");
    expect(a).toEqual([]);
    const b = parser.feed("1}\n\n");
    expect(b).toEqual([{ id: "2-0", event: "message", data: "{\"a\":1}" }]);
  });
});
