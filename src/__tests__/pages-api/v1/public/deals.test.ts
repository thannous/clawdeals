import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/deals-list", () => ({
  listDeals: vi.fn(),
}));

vi.mock("../../../../server/services/deals-cursor", () => ({
  decodeDealsCursor: vi.fn(),
}));

import handler from "../../../../pages/api/v1/public/deals";
import { listDeals } from "../../../../server/services/deals-list";

const listDealsMock = vi.mocked(listDeals);

function mockReq(method: string, query: Record<string, string> = {}) {
  return { method, query } as any;
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as any,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe("GET /api/v1/public/deals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-ACTIVE status for temp/trend sort", async () => {
    const res = mockRes();
    await handler(mockReq("GET", { sort: "temp", status: "EXPIRED" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("status must be ACTIVE for this sort");
    expect(listDealsMock).not.toHaveBeenCalled();
  });

  it("rejects invalid status values", async () => {
    const res = mockRes();
    await handler(mockReq("GET", { sort: "new", status: "REMOVED" }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("status is invalid");
    expect(listDealsMock).not.toHaveBeenCalled();
  });

  it("accepts ACTIVE status for temp sort and forwards ACTIVE only", async () => {
    listDealsMock.mockResolvedValue({ items: [], nextCursor: null } as any);
    const res = mockRes();

    await handler(mockReq("GET", { sort: "temp", status: "ACTIVE" }), res);

    expect(res.statusCode).toBe(200);
    expect(listDealsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: "temp",
        statuses: ["ACTIVE"],
      })
    );
  });
});
