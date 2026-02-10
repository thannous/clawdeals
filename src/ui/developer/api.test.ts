import { describe, expect, it, vi } from "vitest";
import { apiRequest, maskApiKey } from "./api";

describe("developer api", () => {
  it("masks api keys", () => {
    expect(maskApiKey("")).toBe("…");
    expect(maskApiKey("short")).toBe("sh…");
    expect(maskApiKey("cd_live_abcdefghijklmnopqrstuvwxyz")).toMatch(/^cd_liv…/);
  });

  it("adds Authorization header when apiKey is provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }) as any
    );

    await apiRequest({ path: "/v1/deals?limit=1", method: "GET", apiKey: "cd_live_123" });

    const init = fetchSpy.mock.calls[0]?.[1] as any;
    expect(init.headers.Authorization).toBe("Bearer cd_live_123");

    fetchSpy.mockRestore();
  });
});
