import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/owners", () => ({
  getOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/auth/me";
import { getOwner } from "../../../../server/services/owners";

const ownerId = "11111111-1111-1111-1111-111111111111";

function makeCtx(overrides: any = {}) {
  return { authError: null, ownerId, actor: { type: "owner", id: ownerId }, ...overrides } as any;
}

describe("GET /v1/auth/me", () => {

  it("returns 401 for non-owner actors even with ownerId", async () => {
    const result: any = await handler(
      { method: "GET" },
      null,
      makeCtx({ actor: { type: "agent", id: "agent-1" } })
    );
    expect(result.status).toBe(401);
  });
});
