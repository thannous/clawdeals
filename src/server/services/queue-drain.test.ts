import { describe, expect, it, vi } from "vitest";
import { withQueueDrainLease } from "./queue-drain";

// Browser E2E cannot deterministically race a webhook against its fallback cron.
// Protect duplicate sends, failed claims, thrown work and token-safe release.
describe("queue drain lease", () => {
  it("does not execute work when another consumer owns the lease", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const work = vi.fn();
    expect(await withQueueDrainLease("notifications-dispatch", work, { rpc })).toMatchObject({ skipped: "already_running" });
    expect(work).not.toHaveBeenCalled();
  });
  it("fails closed on a claim error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "offline" } });
    const work = vi.fn();
    await expect(withQueueDrainLease("notifications-dispatch", work, { rpc })).rejects.toThrow("claim");
    expect(work).not.toHaveBeenCalled();
  });
  it("releases the acquired token when work throws", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockResolvedValue({ error: null });
    await expect(withQueueDrainLease("notifications-dispatch", async () => { throw new Error("work failed"); }, { rpc })).rejects.toThrow("work failed");
    expect(rpc.mock.calls[1][0]).toBe("queue_drain_release_v1");
    expect(rpc.mock.calls[1][1]).toEqual(rpc.mock.calls[0][1]);
  });
  it("preserves a processed result if release fails, leaving TTL recovery", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true, error: null }).mockRejectedValue(new Error("offline"));
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await withQueueDrainLease("notifications-dispatch", async () => ({ processed_count: 2 }), { rpc })).toEqual({ processed_count: 2 });
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
