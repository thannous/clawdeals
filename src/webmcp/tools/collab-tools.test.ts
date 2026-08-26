import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../http", () => ({
  callPublicWebmcp: vi.fn()
}));

vi.mock("../ui-bridge", () => ({
  applyDealsSearchUi: vi.fn(),
  applyListingsSearchUi: vi.fn(),
  applyOpenDealUi: vi.fn(),
  applyOpenListingUi: vi.fn(),
  getPageContext: vi.fn(() => ({ path: "/browse" }))
}));

import { callPublicWebmcp } from "../http";
import { collabTools } from "./collab-tools";

describe("public collaboration tools", () => {
  beforeEach(() => {
    vi.mocked(callPublicWebmcp).mockReset();
  });

  it.each(["search_listings", "search_deals"])(
    "%s exposes a maximum of five results and marks them untrusted",
    async (name) => {
      const tool = collabTools.find((candidate) => candidate.name === name)!;
      const idKey = name === "search_listings" ? "listing_id" : "deal_id";
      vi.mocked(callPublicWebmcp).mockResolvedValue({
        ok: true,
        data: {
          data: Array.from({ length: 8 }, (_, index) => ({
            [idKey]: `id-${index}`,
            title: `Item ${index}`
          })),
          next_cursor: "next"
        },
        meta: { request_id: "req-public" }
      } as any);

      expect((tool.inputJsonSchema as any).properties.limit.maximum).toBe(5);
      expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });

      const result = await tool.execute(
        {},
        { requestId: "req-public", idempotencyKey: null }
      );

      expect(result.ok).toBe(true);
      if (result.ok) expect((result.data as any).items).toHaveLength(5);
      expect(callPublicWebmcp).toHaveBeenCalledWith(
        expect.objectContaining({ query: expect.objectContaining({ limit: 5 }) })
      );
    }
  );
});
