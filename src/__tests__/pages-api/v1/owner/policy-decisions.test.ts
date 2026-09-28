import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/policy-decisions", () => ({
  listPolicyDecisionsForOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/owner/policy-decisions";
import { listPolicyDecisionsForOwner } from "../../../../server/services/policy-decisions";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function ownerCtx(overrides: any = {}) {
  return {
    authError: null,
    ownerId: OWNER_ID,
    actor: { type: "owner", id: OWNER_ID },
    ...overrides
  } as any;
}

describe("GET /v1/owner/policy-decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards a request_id for an owner-scoped receipt lookup", async () => {
    vi.mocked(listPolicyDecisionsForOwner).mockResolvedValue([]);

    await handler(
      { method: "GET", query: { limit: "1", request_id: "req-owned" } },
      null,
      ownerCtx()
    );

    expect(listPolicyDecisionsForOwner).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      limit: 1,
      requestId: "req-owned"
    });
  });
});
