import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn(),
  upsertPolicy: vi.fn()
}));

import { handler } from "./policies";
import { getPolicyOrDefault, upsertPolicy } from "../../../server/services/policies";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

function ownerCtx() {
  return { ownerId, actor: { type: "owner" }, authError: null } as any;
}

const getPolicyOrDefaultMock = vi.mocked(getPolicyOrDefault);
const upsertPolicyMock = vi.mocked(upsertPolicy);

describe("/v1/policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner auth", async () => {
    const req = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, { actor: { type: "agent" } });
    expect(result.status).toBe(401);
  });

  it("returns policy for GET", async () => {
    getPolicyOrDefaultMock.mockResolvedValue({ policy_json: { version: 1, budgets: {} } } as any);
    const req = { method: "GET", headers: {}, query: {} };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.version).toBe(1);
  });

  it("validates policy input on PUT", async () => {
    const req = { method: "PUT", headers: {}, body: "bad" };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
  });

  it("updates policy on PUT", async () => {
    upsertPolicyMock.mockResolvedValue({ policy_json: { version: 2, budgets: {} }, version: 2 } as any);
    const req = { method: "PUT", headers: { "if-match": "1" }, body: { version: 1 } };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.version).toBe(2);
  });

  it("returns 400 when If-Match is not an integer", async () => {
    const req = { method: "PUT", headers: { "if-match": "abc" }, body: { version: 1 } };
    const result: any = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
    expect(result.body.error.message).toContain("If-Match");
  });

  it("passes expectedVersion from If-Match to upsertPolicy", async () => {
    upsertPolicyMock.mockResolvedValue({ policy_json: { version: 3, budgets: {} }, version: 3 } as any);
    const req = { method: "PUT", headers: { "if-match": "2" }, body: { version: 2 } };
    await handler(req, null, ownerCtx());
    expect(upsertPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 2 })
    );
  });
});
