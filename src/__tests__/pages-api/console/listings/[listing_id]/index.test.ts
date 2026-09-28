import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../../../server/services/listings", () => ({
  getListing: vi.fn()
}));

import { handler } from "../../../../../pages/api/console/listings/[listing_id]/index";
import { getListing } from "../../../../../server/services/listings";

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: null,
  actor: { type: "owner", id: "owner-1" },
  authError: null
};

describe("GET /api/console/listings/[listing_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts PII in title", async () => {
    const listing = {
      listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7",
      title: "Reach me test@leak.example.com",
      description: null,
    };
    vi.mocked(getListing).mockResolvedValue(listing);

    const req = { method: "GET", query: { listing_id: "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7" } };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.listing.title).toBe("Reach me [REDACTED]");
    expect(result.body.listing.title_redacted).toBe(true);
    expect(result.body.listing.description).toBeNull();
    expect(result.body.listing.description_redacted).toBe(false);
  });
});
