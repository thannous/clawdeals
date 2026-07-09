import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimitMiddlewareMock = vi.hoisted(() => vi.fn());
const beginIdempotencyMock = vi.hoisted(() => vi.fn());
const finalizeIdempotencyMock = vi.hoisted(() => vi.fn());

vi.mock("../rate-limit/middleware", () => ({
  rateLimitMiddleware: rateLimitMiddlewareMock
}));

vi.mock("../idempotency/middleware", () => ({
  beginIdempotency: beginIdempotencyMock,
  finalizeIdempotency: finalizeIdempotencyMock
}));

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

import { withApiMiddlewares } from "./with-api-middlewares";
import { jsonResponse } from "../http/response";
import { rateLimitMiddleware } from "../rate-limit/middleware";
import { beginIdempotency } from "../idempotency/middleware";

function makeRes() {
  const res: any = {
    statusCode: 0,
    writableEnded: false,
    _body: null as string | null,
    setHeader: vi.fn(),
    end: vi.fn((body?: string) => {
      res.writableEnded = true;
      res._body = body || null;
    })
  };
  return res;
}

function makeReq(path = "/api/v1/listings/listing-1/offers") {
  return {
    method: "POST",
    url: path,
    headers: {
      "idempotency-key": "idem-1",
      "x-agent-id": "agent-1"
    },
    query: {},
    body: { amount_cents: 1000 }
  } as any;
}

function parseBody(res: any) {
  return JSON.parse(String(res._body || "{}"));
}

describe("withApiMiddlewares fail-closed protections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMiddlewareMock.mockResolvedValue({
      status: 200,
      headers: null,
      body: null,
      meta: {
        group: "offers.create",
        scope: "agent",
        identity: "agent-1"
      }
    });
    beginIdempotencyMock.mockResolvedValue({ action: "skip" });
    finalizeIdempotencyMock.mockResolvedValue(undefined);
  });

  it("passes failOpen=false to rate limit and idempotency for sensitive route groups", async () => {
    const handler = vi.fn(async () => jsonResponse(201, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "offers.create",
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq(), res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(rateLimitMiddleware).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        routeGroup: "offers.create",
        failOpen: false
      })
    );
    expect(vi.mocked(beginIdempotency).mock.calls[0][2]).toEqual(
      expect.objectContaining({
        failOpen: false
      })
    );
  });

  it.each([
    "agents.keys.rotate",
    "auth.session.confirm",
    "channels.pairing_confirm",
    "channels.pairings.write",
    "console.moderation.write",
    "console.reports.write",
    "console.risk_rules.write",
    "connect.sessions.create_ip",
    "installations.rotate",
    "ops.psp.write",
    "owner.identities.write",
    "owner.verify_email_confirm",
    "policies.write",
    "psp.webhooks",
    "ratings.create",
    "reports.create",
    "sellers.psp.write"
  ])("passes failOpen=false for high-risk route group %s", async (routeGroup) => {
    const handler = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup,
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq(`/api/test/${routeGroup}`), res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(vi.mocked(rateLimitMiddleware).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        routeGroup,
        failOpen: false
      })
    );
    expect(vi.mocked(beginIdempotency).mock.calls[0][2]).toEqual(
      expect.objectContaining({
        failOpen: false
      })
    );
  });

  it("blocks sensitive route groups before handler side effects when rate limit is unavailable", async () => {
    rateLimitMiddlewareMock.mockRejectedValueOnce(new Error("redis down"));
    const handler = vi.fn(async () => jsonResponse(201, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "escrows.pay",
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq("/api/v1/escrows/escrow-1/pay"), res);

    expect(handler).not.toHaveBeenCalled();
    expect(beginIdempotencyMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(parseBody(res)?.error?.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("blocks newly covered sensitive route groups before handler side effects when rate limit is unavailable", async () => {
    rateLimitMiddlewareMock.mockRejectedValueOnce(new Error("redis down"));
    const handler = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "installations.rotate",
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq("/api/v1/installations/installation-1:rotate"), res);

    expect(handler).not.toHaveBeenCalled();
    expect(beginIdempotencyMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(parseBody(res)?.error?.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("blocks sensitive route groups before handler side effects when idempotency is unavailable", async () => {
    beginIdempotencyMock.mockRejectedValueOnce(new Error("idempotency store down"));
    const handler = vi.fn(async () => jsonResponse(201, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "contact_reveal.request",
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq("/api/v1/transactions/tx-1/request-contact-reveal"), res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(parseBody(res)?.error?.code).toBe("IDEMPOTENCY_UNAVAILABLE");
  });

  it("blocks sensitive route groups when idempotency returns an unavailable response", async () => {
    beginIdempotencyMock.mockResolvedValueOnce({
      action: "error",
      response: jsonResponse(
        503,
        { error: { code: "IDEMPOTENCY_UNAVAILABLE", message: "Idempotency actor unavailable" } },
        { "Retry-After": "1" }
      )
    });
    const handler = vi.fn(async () => jsonResponse(201, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "installations.rotate",
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq("/api/v1/installations/installation-1:rotate"), res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(parseBody(res)?.error?.code).toBe("IDEMPOTENCY_UNAVAILABLE");
  });

  it("keeps fail-open defaults for non-sensitive route groups", async () => {
    rateLimitMiddlewareMock.mockResolvedValueOnce({
      status: 200,
      headers: null,
      body: null,
      meta: {
        group: "listings.create",
        scope: "agent",
        identity: "agent-1"
      }
    });
    const handler = vi.fn(async () => jsonResponse(201, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "listings.create",
      enableAudit: false
    });
    const res = makeRes();

    await wrapped(makeReq("/api/v1/listings"), res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(rateLimitMiddleware).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        routeGroup: "listings.create",
        failOpen: true
      })
    );
    expect(vi.mocked(beginIdempotency).mock.calls[0][2]).toEqual(
      expect.objectContaining({
        failOpen: true
      })
    );
  });
});
