import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/owner-sessions", () => ({
  getOwnerSessionByTokenHash: vi.fn(),
  markOwnerSessionExpired: vi.fn(),
  markOwnerSessionRevoked: vi.fn(),
  touchOwnerSession: vi.fn()
}));

vi.mock("../services/owners", () => ({
  getOwner: vi.fn()
}));

vi.mock("../utils/session-tokens", () => ({
  hashOwnerSessionToken: vi.fn((token) => `hash:${token}`),
  isOwnerSessionToken: vi.fn((token) => typeof token === "string" && token.startsWith("cd_os_"))
}));

import { injectConsoleOpsOwner } from "./console-ops-identity";
import { getOwnerSessionByTokenHash, touchOwnerSession } from "../services/owner-sessions";
import { getOwner } from "../services/owners";

const OPS_OWNER_ID = "00000000-0000-4000-a000-000000000123";
const NON_OPS_OWNER_ID = "00000000-0000-4000-a000-000000000456";
const VALID_SESSION_TOKEN = "cd_os_valid";

function createJsonResponse() {
  const res: any = {
    body: null,
    headers: {},
    statusCode: null,
    status: vi.fn(function status(code) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn(function json(payload) {
      res.body = payload;
      return res;
    }),
    setHeader: vi.fn(function setHeader(name, value) {
      res.headers[String(name).toLowerCase()] = value;
    }),
    end: vi.fn(function end(payload) {
      res.body = payload;
      return res;
    })
  };
  return res;
}

function activeSession(ownerId = OPS_OWNER_ID) {
  return {
    session_id: "session-1",
    owner_id: ownerId,
    status: "ACTIVE",
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    last_used_at: new Date(Date.now() - 600_000).toISOString()
  };
}

function useProductionConsoleOpsEnv() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CONSOLE_OPS_ENABLED", "true");
  vi.stubEnv("CONSOLE_OPS_OWNER_ID", OPS_OWNER_ID);
}

describe("injectConsoleOpsOwner", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("injects trusted owner identity before invoking handler", async () => {
    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler, {
      ownerId: OPS_OWNER_ID
    });

    const req: any = { headers: {} };
    const res: any = {};
    await wrapped(req, res);

    expect(req.headers["x-owner-id"]).toBe(OPS_OWNER_ID);
    expect(req.__clawdealsTrustedIdentity).toEqual({
      ownerId: OPS_OWNER_ID
    });
    expect(apiHandler).toHaveBeenCalledWith(req, res);
  });

  it("overrides user-provided owner header", async () => {
    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler, {
      ownerId: OPS_OWNER_ID
    });

    const req: any = {
      headers: {
        "x-owner-id": "attacker-owner-id"
      }
    };

    await wrapped(req, {});

    expect(req.headers["x-owner-id"]).toBe(OPS_OWNER_ID);
    expect(req.__clawdealsTrustedIdentity).toEqual({
      ownerId: OPS_OWNER_ID
    });
  });

  it("returns 404 in production when console ops are disabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CONSOLE_OPS_ENABLED", "false");
    vi.stubEnv("CONSOLE_OPS_OWNER_ID", OPS_OWNER_ID);

    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler);
    const res = createJsonResponse();

    await wrapped({ headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found" } });
    expect(apiHandler).not.toHaveBeenCalled();
  });

  it("rejects production console ops when no owner session cookie is present", async () => {
    useProductionConsoleOpsEnv();

    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler);
    const res = createJsonResponse();

    await wrapped({ headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHORIZED", message: "Owner session required" } });
    expect(apiHandler).not.toHaveBeenCalled();
  });

  it("rejects production console ops when the owner session is not allowlisted", async () => {
    useProductionConsoleOpsEnv();
    vi.mocked(getOwnerSessionByTokenHash).mockResolvedValue(activeSession(NON_OPS_OWNER_ID) as any);
    vi.mocked(getOwner).mockResolvedValue({ owner_id: NON_OPS_OWNER_ID } as any);

    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler);
    const res = createJsonResponse();

    await wrapped({ headers: { cookie: `cd_owner_session=${VALID_SESSION_TOKEN}` } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: "Console ops owner required" } });
    expect(apiHandler).not.toHaveBeenCalled();
    expect(touchOwnerSession).not.toHaveBeenCalled();
  });

  it("allows production console ops for a valid allowlisted owner session", async () => {
    useProductionConsoleOpsEnv();
    vi.mocked(getOwnerSessionByTokenHash).mockResolvedValue(activeSession(OPS_OWNER_ID) as any);
    vi.mocked(getOwner).mockResolvedValue({ owner_id: OPS_OWNER_ID } as any);

    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler);
    const req: any = {
      headers: {
        cookie: `cd_owner_session=${VALID_SESSION_TOKEN}`,
        "x-owner-id": "attacker-owner-id"
      }
    };

    await wrapped(req, {});

    expect(req.headers["x-owner-id"]).toBe(OPS_OWNER_ID);
    expect(req.__clawdealsTrustedIdentity).toEqual({ ownerId: OPS_OWNER_ID });
    expect(touchOwnerSession).toHaveBeenCalledWith("session-1", expect.any(Date));
    expect(apiHandler).toHaveBeenCalledWith(req, {});
  });
});
