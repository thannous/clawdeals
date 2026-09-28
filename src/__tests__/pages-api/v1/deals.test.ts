import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/deals", () => ({
  createDeal: vi.fn(),
  findRecentDealDuplicate: vi.fn()
}));

vi.mock("../../../server/services/deals-list", () => ({
  listDeals: vi.fn(),
  DEALS_DEFAULT_LIMIT: 30,
  DEALS_MAX_LIMIT: 100
}));

vi.mock("../../../server/services/deal-detail", () => ({
  getDealById: vi.fn()
}));

vi.mock("../../../server/trustscore/context", () => ({
  resolveTrustContext: vi.fn().mockResolvedValue(null)
}));

import { handler } from "../../../pages/api/v1/deals";
import { createDeal, findRecentDealDuplicate } from "../../../server/services/deals";
import { getDealById } from "../../../server/services/deal-detail";
import { listDeals } from "../../../server/services/deals-list";
import { fingerprintUrl, normalizeDealUrl } from "../../../server/utils/deals";

const createDealMock = vi.mocked(createDeal);
const findRecentDealDuplicateMock = vi.mocked(findRecentDealDuplicate);
const listDealsMock = vi.mocked(listDeals);
const getDealByIdMock = vi.mocked(getDealById);

const baseCtx: any = {
  ownerId: "owner-1",
  agentId: "agent-1",
  actor: { type: "agent", id: "agent-1" },
  authError: null
};

const validBody = {
  title: "RTX 4070 - 399€",
  url: "https://example.com/deal?utm_source=unit",
  price: 399.0,
  currency: "EUR",
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  tags: ["GPU", "nvidia"]
};

describe("POST /v1/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts images and defaults cover_image_index to 0", async () => {
    findRecentDealDuplicateMock.mockResolvedValue(null as any);
    createDealMock.mockResolvedValue({
      deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4",
      title: "RTX 4070 - 399€",
      source_url: "https://example.com/deal?utm_source=unit",
      price: "399.00",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      tags: ["gpu", "nvidia"],
      status: "NEW",
      new_until: "2026-02-05T12:10:00Z",
      temperature: null,
      votes_up: 0,
      votes_down: 0,
      images: [
        { storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" },
        { storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }
      ],
      cover_image_index: 0,
      creator_agent_id: "agent-1",
      created_at: "2026-02-05T12:00:00Z"
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: {
        ...validBody,
        images: [
          { storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" },
          { storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }
        ]
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(createDealMock).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          { storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" },
          { storage_key: "deals/d-1/2.jpg", mime: "image/jpeg" }
        ],
        coverImageIndex: 0
      })
    );
  });

  it("rejects more than 8 images", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: {
        ...validBody,
        images: Array.from({ length: 9 }, (_, i) => ({ storage_key: `deals/d-1/${i}.jpg`, mime: "image/jpeg" }))
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects out-of-bounds cover_image_index", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: {
        ...validBody,
        images: [{ storage_key: "deals/d-1/1.jpg", mime: "image/jpeg" }],
        cover_image_index: 1
      }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("treats utm_* variants as duplicates (fingerprint normalization)", async () => {
    const normalized = normalizeDealUrl(validBody.url);
    expect(normalized).not.toContain("utm_source");

    const expectedFingerprint = fingerprintUrl(normalized);
    const withoutUtmFingerprint = fingerprintUrl(normalizeDealUrl("https://example.com/deal"));
    expect(withoutUtmFingerprint).toBe(expectedFingerprint);

    findRecentDealDuplicateMock.mockResolvedValue({
      deal_id: "22222222-2222-2222-2222-222222222222",
      created_at: new Date("2026-02-05T11:00:00.000Z").toISOString()
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: validBody
    };
    await handler(req, null, { ...baseCtx });

    expect(findRecentDealDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        fingerprint: expectedFingerprint
      })
    );
  });
});

describe("GET /v1/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves enriched media fields from listDeals", async () => {
    const coverImage = { storage_key: "deals/d-1/cover.jpg", mime: "image/jpeg" };
    listDealsMock.mockResolvedValue({
      items: [
        {
          deal_id: "deal-1",
          title: "Enriched deal",
          source_url: "https://example.com/deal-1",
          price: "199.00",
          currency: "EUR",
          expires_at: "2026-02-06T12:00:00Z",
          tags: ["gpu"],
          status: "ACTIVE",
          temperature: 42,
          votes_up: 5,
          votes_down: 1,
          images_count: 3,
          cover_image: coverImage,
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: null
    } as any);

    const req = {
      method: "GET",
      query: { sort: "new" }
    };
    const result: any = await handler(req, null, { ...baseCtx });

    expect(result.status).toBe(200);
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].images_count).toBe(3);
    expect(result.body.items[0].cover_image).toEqual(coverImage);
  });
});
