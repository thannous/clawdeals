import { describe, expect, it } from "vitest";

describe("TI-265 SSE utilities", () => {

  it("extracts multiple frames from a buffered stream (\\n\\n delimited)", async () => {
    const { extractSseFrames } = await import("../../../scripts/agents/ti-265-utils.mjs");
    const input = ': ping\n\nid: 2\nevent: watchlist.match\ndata: {"v":1}\n\n';
    const { frames, rest } = extractSseFrames(input);
    expect(rest).toBe("");
    expect(frames).toEqual([
      { type: "comment", comment: "ping" },
      { type: "event", id: "2", event: "watchlist.match", data: '{"v":1}' }
    ]);
  });

  it("times out when no frames are received", async () => {
    const { waitForSseEvent } = await import("../../../scripts/agents/ti-265-utils.mjs");

    const res: any = {
      body: {
        getReader() {
          return {
            read() {
              return new Promise(() => {});
            }
          };
        }
      }
    };

    await expect(waitForSseEvent(res, { timeoutMs: 25 })).rejects.toThrow(/Timed out/i);
  });
});

