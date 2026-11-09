import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), role: vi.fn(), waitUntil: vi.fn(), getDeadline: vi.fn() }));
vi.mock("../db/neon", () => ({ getNeonSql: () => ({ query: mocks.query }), ensureNeonRuntimeRole: mocks.role }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil, getDeadline: mocks.getDeadline }));
import { resolveNeonQueueOrigin, wakeNeonQueuesAfterCommit, withoutNeonQueueWakes } from "./neon-queue-wake";
let pending: Promise<unknown>[];
const env: NodeJS.ProcessEnv = { NODE_ENV: "test", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "clawdeals-hash-team.vercel.app", VERCEL_BRANCH_URL: "clawdeals-git-neon-team.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "app.clawdeals.com", CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://clawdeals-git-neon-team.vercel.app", QUEUE_DISPATCH_SECRET: "test-only-secret-long-enough-not-real" };
function configure() { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); }
beforeEach(() => {
  pending = [];
  mocks.waitUntil.mockImplementation((task) => pending.push(task));
  mocks.getDeadline.mockReturnValue(new Date(Date.now() + 60000));
  mocks.role.mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); });
describe("postcommit deployment-bound queue wakes", () => {
  it("accepts only explicit platform-bound origins", () => {
    expect(resolveNeonQueueOrigin(env)).toBe(env.CLAWDEALS_QUEUE_WAKE_ORIGIN);
    expect(resolveNeonQueueOrigin({ ...env, VERCEL_ENV: "production", CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://app.clawdeals.com" })).toBe("https://app.clawdeals.com");
  });
  it.each([
    { VERCEL: "" }, { VERCEL_ENV: "development" }, { VERCEL_URL: "" },
    { CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://evil.example" },
    { CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://app.clawdeals.com" },
    { CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://app.clawdeals.com", VERCEL_BRANCH_URL: "app.clawdeals.com" },
    { CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://a:b@clawdeals-git-neon-team.vercel.app" },
    { CLAWDEALS_QUEUE_WAKE_ORIGIN: "http://clawdeals-git-neon-team.vercel.app" },
    { CLAWDEALS_QUEUE_WAKE_ORIGIN: "https://clawdeals-git-neon-team.vercel.app/?target=evil" }
  ])("fails closed on invalid deployment configuration %j", (patch) => {
    expect(() => resolveNeonQueueOrigin({ ...env, ...patch })).toThrow();
  });
  it("does not schedule when disabled or recursively draining", async () => {
    vi.stubEnv("CLAWDEALS_QUEUE_WAKE_ORIGIN", ""); await wakeNeonQueuesAfterCommit();
    configure(); await withoutNeonQueueWakes(wakeNeonQueuesAfterCommit);
    expect(mocks.waitUntil).not.toHaveBeenCalled(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it.each([undefined, null, new Date(NaN), new Date(0)])("requires a live request deadline %s", async (deadline) => {
    configure(); mocks.getDeadline.mockReturnValue(deadline); vi.stubGlobal("fetch", vi.fn());
    await wakeNeonQueuesAfterCommit();
    expect(mocks.query).not.toHaveBeenCalled(); expect(mocks.waitUntil).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it("returns while its registered consumer promise remains pending", async () => {
    configure(); mocks.query.mockResolvedValue([{ queues: ["notifications-dispatch"] }]);
    let finish: (value: Response) => void;
    const started = new Promise<void>((resolve) => vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { finish = done; resolve(); }))));
    await wakeNeonQueuesAfterCommit(); await started;
    let done = false; pending[0].then(() => { done = true; }); await Promise.resolve();
    expect(done).toBe(false);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(`${env.CLAWDEALS_QUEUE_WAKE_ORIGIN}/api/internal/cron/notifications-dispatch`);
    finish(new Response(null, { status: 200 })); await pending[0]; expect(done).toBe(true);
  });
  it.each([401, 403, 307, 500])("never retries or bypasses response %s", async (status) => {
    configure(); mocks.query.mockResolvedValue([{ queues: ["notifications-dispatch"] }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await wakeNeonQueuesAfterCommit(); await pending[0];
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ redirect: "error", body: "{}", headers: { authorization: `Bearer ${env.QUEUE_DISPATCH_SECRET}` } });
    expect(console.warn).toHaveBeenCalledWith("queue.neon_wake_unavailable");
  });
  it("shares a bounded abort signal between query and consumers", async () => {
    configure(); mocks.getDeadline.mockReturnValue(new Date(Date.now() + 6000));
    mocks.query.mockResolvedValue([{ queues: ["notifications-dispatch"] }]);
    const controller = new AbortController(); const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }))));
    await wakeNeonQueuesAfterCommit(); await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(timeout.mock.calls[0][0]).toBeLessThanOrEqual(5000); expect(mocks.query.mock.calls[0][2].fetchOptions.signal).toBe(controller.signal);
    controller.abort(); await pending[0];
  });
  it("does not launch untracked work when lifetime registration fails", async () => {
    configure(); mocks.waitUntil.mockImplementation(() => { throw new Error("no context"); });
    await wakeNeonQueuesAfterCommit(); await Promise.resolve(); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rejects arbitrary paths returned by a malformed queue claim", async () => {
    configure(); mocks.query.mockResolvedValue([{ queues: ["../owners"] }]); vi.stubGlobal("fetch", vi.fn());
    await wakeNeonQueuesAfterCommit(); await pending[0]; expect(fetch).not.toHaveBeenCalled();
  });
});
