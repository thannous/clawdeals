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

vi.mock("../../../server/services/watchlist-matching", () => ({
  matchDealToWatchlists: vi.fn().mockResolvedValue(null)
}));

import { handler } from "../../../pages/api/v1/deals";
import { createDeal, findRecentDealDuplicate } from "../../../server/services/deals";
import { getDealById } from "../../../server/services/deal-detail";
import { listDeals } from "../../../server/services/deals-list";
import { matchDealToWatchlists } from "../../../server/services/watchlist-matching";
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

  it("requires Idempotency-Key", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: validBody
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires agent authentication", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: validBody
    };
    const result: any = await handler(req, null, { ...baseCtx, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("validates price", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, price: 0 }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("PRICE_INVALID");
  });

  it("validates expires_at", async () => {
    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: { ...validBody, expires_at: new Date(Date.now() - 1000).toISOString() }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("EXPIRES_AT_INVALID");
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

  it("creates deal and returns deal", async () => {
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
      creator_agent_id: "agent-1",
      created_at: "2026-02-05T12:00:00Z"
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: validBody
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(201);
    expect(result.body.deal.deal_id).toBe("b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4");
    expect(result.body.data).toBeUndefined();
    expect(createDeal).toHaveBeenCalled();
    expect(matchDealToWatchlists).toHaveBeenCalledWith(
      expect.objectContaining({
        deal: expect.objectContaining({ deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4" })
      })
    );
  });

  it("returns 200 with existing deal when recent fingerprint match exists", async () => {
    const nowIso = new Date("2026-02-05T12:00:00.000Z").toISOString();
    findRecentDealDuplicateMock.mockResolvedValue({
      deal_id: "11111111-1111-1111-1111-111111111111",
      created_at: nowIso
    } as any);
    getDealByIdMock.mockResolvedValue({
      deal_id: "11111111-1111-1111-1111-111111111111",
      title: "Existing deal",
      source_url: "https://example.com/deal",
      price: "399.00",
      currency: "EUR",
      expires_at: "2026-02-06T12:00:00Z",
      tags: ["gpu", "nvidia"],
      status: "NEW",
      temperature: 10,
      votes_up: 0,
      votes_down: 0,
      created_at: nowIso
    } as any);

    const req = {
      method: "POST",
      headers: { "idempotency-key": "abc" },
      body: validBody
    };
    const ctx: any = { ...baseCtx };
    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body.deal.deal_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.body.meta.duplicate).toBe(true);
    expect(result.body.meta.existing_deal_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(createDeal).not.toHaveBeenCalled();
    expect(matchDealToWatchlists).not.toHaveBeenCalled();
    expect(ctx.auditEvent).toBe("deal.duplicate_returned");
    expect(ctx.outcome?.type).toBe("OK");
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

  it("requires authentication", async () => {
    const req = {
      method: "GET",
      query: {}
    };
    const result: any = await handler(req, null, { ...baseCtx, ownerId: null, agentId: null });
    expect(result.status).toBe(401);
    expect(result.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for malformed cursor", async () => {
    const req = {
      method: "GET",
      query: { cursor: "bad-cursor" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("cursor");
  });

  it("returns items + next_cursor and masks temperature for NEW", async () => {
    listDealsMock.mockResolvedValue({
      items: [
        {
          deal_id: "b8b9dfe7-9c84-4d45-a3ce-4dbfef9cc0e4",
          title: "RTX 4070 - 399€",
          source_url: "https://example.com/deal",
          price: "399.00",
          currency: "EUR",
          expires_at: "2026-02-06T12:00:00Z",
          tags: ["gpu", "nvidia"],
          status: "NEW",
          temperature: 50,
          votes_up: 0,
          votes_down: 0,
          created_at: "2026-02-05T12:00:00Z"
        }
      ],
      nextCursor: "cursor-abc"
    } as any);

    const ctx: any = { ...baseCtx };
    const req = {
      method: "GET",
      query: { sort: "new" }
    };
    const result: any = await handler(req, null, ctx);
    expect(result.status).toBe(200);
    expect(ctx.auditEvent).toBe("deals.listed");
    expect(result.body.items).toHaveLength(1);
    expect(result.body.items[0].temperature).toBeNull();
    expect(result.body.items[0].price).toBe(399);
    expect(result.body.next_cursor).toBe("cursor-abc");
    expect(listDeals).toHaveBeenCalledWith({
      sort: "new",
      statuses: ["NEW", "ACTIVE"],
      q: null,
      tags: [],
      priceMax: null,
      includeHidden: false,
      minTemperature: 0,
      limit: 30,
      cursor: null
    });
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

  it("passes price_max to listDeals", async () => {
    listDealsMock.mockResolvedValue({ items: [], nextCursor: null } as any);

    const req = {
      method: "GET",
      query: { sort: "new", price_max: "499.99" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(200);
    expect(listDeals).toHaveBeenCalledWith(
      expect.objectContaining({
        priceMax: 499.99
      })
    );
  });

  it("validates price_max (non-number \u2192 400)", async () => {
    const req = {
      method: "GET",
      query: { price_max: "xyz" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toBe("price_max must be a number");
    expect(listDeals).not.toHaveBeenCalled();
  });

  it("validates price_max (negative \u2192 400)", async () => {
    const req = {
      method: "GET",
      query: { price_max: "-1" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.message).toBe("price_max must be >= 0");
    expect(listDeals).not.toHaveBeenCalled();
  });

  it("rejects status filter for temp", async () => {
    const req = {
      method: "GET",
      query: { sort: "temp", status: "NEW" }
    };
    const result: any = await handler(req, null, { ...baseCtx });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(listDeals).not.toHaveBeenCalled();
  });
});
