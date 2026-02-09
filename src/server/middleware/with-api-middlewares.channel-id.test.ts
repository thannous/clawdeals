import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../rate-limit/middleware", () => ({
  rateLimitMiddleware: vi.fn(async (_req: any, options: any) => ({
    status: 200,
    headers: null,
    body: null,
    meta: {
      group: options.routeGroup || null,
      scope: "channel",
      identity: options.channelId || null,
    },
  })),
}));

import { withApiMiddlewares } from "./with-api-middlewares";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { jsonResponse } from "../http/response";

function makeRes() {
  const res: any = {
    statusCode: 0,
    writableEnded: false,
    setHeader: vi.fn(),
    end: vi.fn(() => {
      res.writableEnded = true;
    }),
  };
  return res;
}

describe("withApiMiddlewares channelId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes x-clawdeals-channel-id to rateLimitMiddleware as channelId", async () => {
    const wrapped = withApiMiddlewares(
      async () => {
        return jsonResponse(200, { ok: true });
      },
      { enableIdempotency: false, enableAudit: false, routeGroup: "channels.telegram.webhook" }
    );

    const req: any = {
      method: "POST",
      url: "/api/v1/channels/telegram/webhook",
      headers: {
        "x-clawdeals-channel-id": "telegram:hash-user",
      },
      query: {},
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(rateLimitMiddleware).toHaveBeenCalledTimes(1);
    const options: any = vi.mocked(rateLimitMiddleware).mock.calls[0][1];
    expect(options.channelId).toBe("telegram:hash-user");
  });
});

