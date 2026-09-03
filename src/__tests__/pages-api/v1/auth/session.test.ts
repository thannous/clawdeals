import { describe, expect, it } from "vitest";

import { handler } from "../../../../pages/api/v1/auth/session";
import { matchRouteGroup } from "../../../../server/routes/route-groups";

const ownerId = "11111111-1111-1111-1111-111111111111";

describe("GET /v1/auth/session", () => {
  it("rejects non-GET", async () => {
    const result: any = await handler({ method: "POST" }, null, {});
    expect(result.status).toBe(405);
  });

  it("answers 200 with authenticated=false for anonymous visitors", async () => {
    const result: any = await handler({ method: "GET" }, null, { ownerId: null, actor: null });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ authenticated: false, owner_id: null });
    expect(result.headers["Cache-Control"]).toBe("no-store");
  });

  it("answers 200 with authenticated=false when the session is invalid", async () => {
    const ctx = { ownerId, actor: { type: "owner", id: ownerId }, authError: { status: 401, code: "UNAUTHORIZED" } };
    const result: any = await handler({ method: "GET" }, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.authenticated).toBe(false);
  });

  it("does not treat agent actors as owner sessions", async () => {
    const result: any = await handler({ method: "GET" }, null, { ownerId, actor: { type: "agent", id: "agent-1" } });
    expect(result.body.data.authenticated).toBe(false);
  });

  it("answers authenticated=true with the owner id for owner sessions", async () => {
    const result: any = await handler({ method: "GET" }, null, { ownerId, actor: { type: "owner", id: ownerId }, authError: null });
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ authenticated: true, owner_id: ownerId });
  });

  it("shares the auth.me.read route group with /v1/auth/me", () => {
    const sp = new URLSearchParams();
    expect(matchRouteGroup("GET", "/api/v1/auth/session", sp)).toBe("auth.me.read");
    expect(matchRouteGroup("GET", "/api/v1/auth/me", sp)).toBe("auth.me.read");
  });
});
