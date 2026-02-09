import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/staged-commands", () => ({
  createStagedCommand: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/chat/commands:stage";
import { createStagedCommand } from "../../../../server/services/staged-commands";

const createStagedCommandMock = vi.mocked(createStagedCommand);

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
    const req: any = { method: "POST", body: { action_type: "watchlist.create", payload: {} }, headers: {} };
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
      headers: {},
      body: {
        action_type: "watchlist.create",
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
  });
});

