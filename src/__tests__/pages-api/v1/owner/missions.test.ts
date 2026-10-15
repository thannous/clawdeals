import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/owner-buy-missions", () => ({
  createOwnerBuyMission: vi.fn(), listOwnerBuyMissions: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/missions";
import { createOwnerBuyMission, listOwnerBuyMissions } from "../../../../server/services/owner-buy-missions";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const body = { criteria: { query: "Private brief confirmed by A" } };
const context = (ownerId = OWNER_A) => ({ ownerId, actor: { type: "owner", id: ownerId } });
const request = (expectedOwner: unknown = OWNER_A) => ({
  method: "POST", body, headers: { "idempotency-key": "original-attempt", "x-expected-owner-id": expectedOwner }
});

// Browser interception can verify the submitted precondition, but cannot prove
// a cookie race is rejected by the server before its creation service runs.
describe("owner mission creation identity precondition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createOwnerBuyMission).mockResolvedValue({ watchlist_id: "created" } as any);
  });

  it("rejects a cookie account change after the browser probe before any insertion", async () => {
    const response = await handler(request(), null, context(OWNER_B));
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: "OWNER_SESSION_CHANGED" } });
    expect(createOwnerBuyMission).not.toHaveBeenCalled();
  });

  it.each([null, "", "not-a-uuid", [OWNER_A, OWNER_B]].map(expectedOwner => ({ expectedOwner })))("rejects missing or ambiguous expected identity $expectedOwner", async ({ expectedOwner }) => {
    const response = await handler(request(expectedOwner), null, context());
    expect(response.status).toBe(400);
    expect(createOwnerBuyMission).not.toHaveBeenCalled();
  });

  it("passes the authenticated identity and unchanged brief on a matching request or retry", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      expect((await handler(request(), null, context())).status).toBe(201);
    }
    expect(createOwnerBuyMission).toHaveBeenCalledTimes(2);
    expect(createOwnerBuyMission).toHaveBeenLastCalledWith({ ownerId: OWNER_A, body });
    // Replay deduplication is handled by the middleware, not this handler.
  });

  it("does not treat the expected owner header as authentication", async () => {
    expect((await handler(request(), null, {})).status).toBe(401);
    expect(createOwnerBuyMission).not.toHaveBeenCalled();
  });

  it("keeps authenticated reads compatible without a write precondition", async () => {
    vi.mocked(listOwnerBuyMissions).mockResolvedValue({ items: [], next_cursor: null });
    expect((await handler({ method: "GET", query: {} }, null, context())).status).toBe(200);
    expect(createOwnerBuyMission).not.toHaveBeenCalled();
  });
});
