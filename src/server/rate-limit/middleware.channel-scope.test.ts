import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./token-bucket", () => ({
  consumeTokenBucket: vi.fn(async () => ({
    allowed: true,
    remaining: 1,
    resetSeconds: 1,
    retryAfterSeconds: 0
  }))
}));

import { rateLimitMiddleware } from "./middleware";
import { consumeTokenBucket } from "./token-bucket";

describe("rateLimitMiddleware (channel scope)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses channelId as identity when profile scope=channel", async () => {
    const req: any = {
      method: "POST",
      url: "http://localhost/api/v1/channels/telegram/webhook",
      headers: {}
    };

    const result: any = await rateLimitMiddleware(req, {
      routeGroup: "channels.telegram.webhook",
      channelId: "telegram:hash-user",
      redis: {},
      env: {},
      ip: "127.0.0.1",
      nowMs: 0,
      // Avoid dev multiplier changing bucket ids in the assertion.
      limitMultiplier: 1
    });

    expect(result.status).toBe(200);
    expect(consumeTokenBucket).toHaveBeenCalled();
    const call: any = vi.mocked(consumeTokenBucket).mock.calls[0][0];
    expect(call.key).toContain("rl:channel:telegram:hash-user:channels.telegram.webhook");
  });
});

