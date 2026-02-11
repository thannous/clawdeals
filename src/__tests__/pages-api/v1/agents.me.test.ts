import { describe, expect, it } from "vitest";

import { handler } from "../../../pages/api/v1/agents/me";

describe("GET /v1/agents/me", () => {
  it("returns 405 for unsupported methods", async () => {
    const req: any = { method: "POST", headers: {}, query: {} };
    const result: any = await handler(req, null, {});
    expect(result.status).toBe(405);
    expect(result.body.error.code).toBe("METHOD_NOT_ALLOWED");
  });

  it("returns 401 when not agent-authenticated", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, {});
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("passes through 401 when API key is revoked", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, {
      authError: { status: 401, code: "API_KEY_REVOKED", message: "API key revoked" }
    });

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("API_KEY_REVOKED");
    expect(result.body.error.message).toBe("API key revoked");
  });

  it("passes through 401 when API key is expired", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, {
      authError: { status: 401, code: "API_KEY_EXPIRED", message: "API key expired" }
    });

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("API_KEY_EXPIRED");
    expect(result.body.error.message).toBe("API key expired");
  });

  it("passes through 401 when OAuth access token is expired", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, {
      authError: { status: 401, code: "TOKEN_EXPIRED", message: "Access token expired" }
    });

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("TOKEN_EXPIRED");
    expect(result.body.error.message).toBe("Access token expired");
  });

  it("passes through 401 when OAuth access token is revoked", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, {
      authError: { status: 401, code: "TOKEN_REVOKED", message: "Access token revoked" }
    });

    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("TOKEN_REVOKED");
    expect(result.body.error.message).toBe("Access token revoked");
  });

  it("returns 200 with agent identity and sets audit fields", async () => {
    const req: any = { method: "GET", headers: {}, query: {} };
    const ctx: any = {
      agentId: "11111111-1111-4111-8111-111111111111",
      ownerId: "22222222-2222-4222-8222-222222222222",
      installationId: null,
      oauthScopes: []
    };

    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(result.body.data.agent_id).toBe(ctx.agentId);
    expect(result.body.data.owner_id).toBe(ctx.ownerId);
    expect(result.body.data.installation_id).toBeNull();
    expect(result.body.data.oauth_scopes).toEqual([]);

    expect(ctx.auditEvent).toBe("agent.me_viewed");
    expect(ctx.auditEntityType).toBe("agent");
    expect(ctx.auditEntityId).toBe(ctx.agentId);
  });
});
