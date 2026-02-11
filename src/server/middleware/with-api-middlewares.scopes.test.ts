import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/api-keys", () => ({
  authenticateApiKey: vi.fn()
}));

vi.mock("../services/installation-scopes-cache", () => ({
  getInstallationOauthScopes: vi.fn()
}));

vi.mock("../audit/singleton", () => ({
  safeAuditLog: vi.fn(async () => {})
}));

import { withApiMiddlewares } from "./with-api-middlewares";
import { jsonResponse } from "../http/response";
import { authenticateApiKey } from "../services/api-keys";
import { getInstallationOauthScopes } from "../services/installation-scopes-cache";
import { safeAuditLog } from "../audit/singleton";

function makeRes() {
  const res: any = {
    statusCode: 0,
    writableEnded: false,
    _body: null as any,
    setHeader: vi.fn(),
    end: vi.fn((body?: string) => {
      res.writableEnded = true;
      res._body = body || null;
    })
  };
  return res;
}

describe("withApiMiddlewares scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks installation-scoped agent requests missing required scopes", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "00000000-0000-4000-a000-000000000111",
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);
    vi.mocked(getInstallationOauthScopes).mockResolvedValue(["watchlists:read"] as any);

    const handler = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "listings.create",
      enableRateLimit: false,
      enableIdempotency: false,
      enableAudit: false
    });

    const req: any = {
      method: "POST",
      url: "/api/v1/listings",
      headers: {
        "x-clawdeals-api-key": "cd_live_abcdefgh.secret"
      },
      query: {},
      body: { title: "x" }
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(String(res._body || "{}"));
    expect(body?.error?.code).toBe("INSUFFICIENT_SCOPE");
    expect(body?.error?.details?.required_scopes).toEqual(["listings:write"]);
    expect(body?.error?.details?.installation_id).toBe("00000000-0000-4000-a000-000000000111");
  });

  it("allows installation-scoped requests when required scopes are granted", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "00000000-0000-4000-a000-000000000222",
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);
    vi.mocked(getInstallationOauthScopes).mockResolvedValue(["listings:write"] as any);

    const handler = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "listings.create",
      enableRateLimit: false,
      enableIdempotency: false,
      enableAudit: false
    });

    const req: any = {
      method: "POST",
      url: "/api/v1/listings",
      headers: {
        "x-clawdeals-api-key": "cd_live_abcdefgh.secret"
      },
      query: {},
      body: { title: "x" }
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  it("does not enforce scopes for legacy/global keys without installation_id", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: null,
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);

    const handler = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "listings.create",
      enableRateLimit: false,
      enableIdempotency: false,
      enableAudit: false
    });

    const req: any = {
      method: "POST",
      url: "/api/v1/listings",
      headers: {
        "x-clawdeals-api-key": "cd_live_abcdefgh.secret"
      },
      query: {},
      body: { title: "x" }
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getInstallationOauthScopes)).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("writes an audit log for installation-scope denials", async () => {
    vi.mocked(authenticateApiKey).mockResolvedValue({
      ok: true,
      agentId: "agent-1",
      ownerId: "owner-1",
      installationId: "00000000-0000-4000-a000-000000000333",
      apiKeyId: "key-1",
      keyState: "ACTIVE"
    } as any);
    vi.mocked(getInstallationOauthScopes).mockResolvedValue(["watchlists:read"] as any);

    const handler = vi.fn(async () => jsonResponse(200, { ok: true }));
    const wrapped = withApiMiddlewares(handler, {
      routeGroup: "listings.create",
      enableRateLimit: false,
      enableIdempotency: false,
      enableAudit: true
    });

    const req: any = {
      method: "POST",
      url: "/api/v1/listings",
      headers: {
        "x-clawdeals-api-key": "cd_live_abcdefgh.secret"
      },
      query: {},
      body: { title: "x" }
    };
    const res = makeRes();

    await wrapped(req, res);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(safeAuditLog).toHaveBeenCalledTimes(1);
    const event = vi.mocked(safeAuditLog).mock.calls[0][0] as any;
    expect(event?.outcome).toBe("BLOCKED");
    expect(event?.security?.missing_scopes).toEqual(["listings:write"]);
    expect(event?.security?.installation_id).toBe("00000000-0000-4000-a000-000000000333");
  });
});
