import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/staged-commands", () => ({
  createStagedCommand: vi.fn()
}));

vi.mock("../../../../server/services/offers", () => ({
  getOffer: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/chat/[command]";
import { createStagedCommand } from "../../../../server/services/staged-commands";
import { getOffer } from "../../../../server/services/offers";

const createStagedCommandMock = vi.mocked(createStagedCommand);
const getOfferMock = vi.mocked(getOffer);

const baseCtx: any = {
  agentId: "00000000-0000-4000-a000-000000000111",
  ownerId: "00000000-0000-4000-a000-000000000222",
  actor: { type: "agent", id: "00000000-0000-4000-a000-000000000111" },
  authError: null
};

describe("POST /v1/chat/commands:stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires agent auth", async () => {
    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      body: { action_type: "watchlist.create", payload: {} },
      headers: {}
    };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("stages watchlist.create and returns a preview", async () => {
    createStagedCommandMock.mockResolvedValue({
      command_id: "00000000-0000-4000-a000-000000000333",
      state: "STAGED",
      action_type: "watchlist.create",
      expires_at: new Date(Date.now() + 600_000).toISOString()
    } as any);

    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      headers: {},
      body: {
        action_type: "watchlist.create",
        origin_context: { kind: "control_dm" },
        payload: {
          name: "My watch",
          active: true,
          criteria: {
            query: "iphone",
            tags: ["apple"],
            price_max: 1000,
            geo: { lat: 48.8566, lon: 2.3522 },
            distance_km: 10
          }
        }
      }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(result.body.command_id).toBe("00000000-0000-4000-a000-000000000333");
    expect(result.body.action_type).toBe("watchlist.create");
    expect(result.body.preview?.title).toContain("Create watchlist");
    expect(Array.isArray(result.body.buttons)).toBe(true);

    expect(ctx.auditEvent).toBe("chat.command_staged");
    expect(ctx.auditEntityType).toBe("staged_command");
    expect(ctx.auditEntityId).toBe("00000000-0000-4000-a000-000000000333");
    expect(ctx.outcome).toEqual({ type: "STAGED", reason: "control_dm_allowed" });
    expect(result.body.origin_context?.kind).toBe("CONTROL_DM");
    expect(result.body.authority?.decision).toBe("EXECUTED");
    expect(createStagedCommandMock).toHaveBeenCalledTimes(1);
    expect(createStagedCommandMock.mock.calls[0]?.[0]?.payload?.origin_context?.kind).toBe("CONTROL_DM");
  });

  it("requires explicit origin_context", async () => {
    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      headers: {},
      body: {
        action_type: "watchlist.create",
        payload: {
          name: "No origin",
          active: true,
          criteria: { query: "iphone" }
        }
      }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("ORIGIN_CONTEXT_REQUIRED");
    expect(createStagedCommandMock).not.toHaveBeenCalled();
  });

  it("public/group context stages with control-DM guidance", async () => {
    createStagedCommandMock.mockResolvedValue({
      command_id: "00000000-0000-4000-a000-000000000333",
      state: "STAGED",
      action_type: "watchlist.create",
      expires_at: new Date(Date.now() + 600_000).toISOString()
    } as any);

    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      headers: {},
      body: {
        action_type: "watchlist.create",
        origin_context: { kind: "public_group" },
        payload: {
          name: "My watch",
          active: true,
          criteria: {
            query: "iphone",
            tags: ["apple"],
            price_max: 1000
          }
        }
      }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(201);
    expect(result.body.authority?.decision).toBe("STAGED");
    expect(result.body.authority?.requires_control_dm_confirm).toBe(true);
    expect(result.body.guidance?.required_origin_context).toBe("CONTROL_DM");
    expect(ctx.outcome).toEqual({ type: "STAGED", reason: "public_group_requires_control_dm" });
  });

  it("blocks disallowed actions in negotiation context", async () => {
    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      headers: {},
      body: {
        action_type: "watchlist.create",
        origin_context: { kind: "negotiation_thread" },
        payload: {
          name: "Nope",
          active: true,
          criteria: { query: "iphone" }
        }
      }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("ORIGIN_CONTEXT_BLOCKED");
    expect(createStagedCommandMock).not.toHaveBeenCalled();
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "negotiation_action_not_allowed" });
  });

  it("blocks invalid explicit origin context", async () => {
    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      headers: {},
      body: {
        action_type: "watchlist.create",
        origin_context: { kind: "not_real" },
        payload: {
          name: "Nope",
          active: true,
          criteria: { query: "iphone" }
        }
      }
    };

    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(403);
    expect(result.body.error.code).toBe("ORIGIN_CONTEXT_BLOCKED");
    expect(ctx.outcome).toEqual({ type: "BLOCKED", reason: "origin_context_unknown" });
  });

  it("offer.counter staging is anti-enumeration safe (404 for non-party)", async () => {
    getOfferMock.mockResolvedValue({
      offer_id: "00000000-0000-4000-a000-000000000333",
      listing_id: "00000000-0000-4000-a000-000000000444",
      buyer_agent_id: "00000000-0000-4000-a000-000000000555",
      seller_agent_id: "00000000-0000-4000-a000-000000000666"
    } as any);

    const req: any = {
      method: "POST",
      query: { command: "commands:stage" },
      headers: {},
      body: {
        action_type: "offer.counter",
        origin_context: { kind: "control_dm" },
        payload: {
          offer_id: "00000000-0000-4000-a000-000000000333",
          amount: 123,
          currency: "EUR",
          expires_at: new Date(Date.now() + 60_000).toISOString()
        }
      }
    };

    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("OFFER_NOT_FOUND");
    expect(createStagedCommandMock).not.toHaveBeenCalled();
  });
});
