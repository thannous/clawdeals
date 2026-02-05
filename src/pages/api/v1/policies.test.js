import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../../server/services/policies", () => ({
  getPolicyOrDefault: vi.fn(),
  upsertPolicy: vi.fn()
}));

import { handler } from "./policies";
import { getPolicyOrDefault, upsertPolicy } from "../../../server/services/policies";

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

function ownerCtx() {
  return { ownerId, actor: { type: "owner" }, authError: null };
}

describe("/v1/policies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires owner auth", async () => {
    const req = { method: "GET", headers: {}, query: {} };
    const result = await handler(req, null, { actor: { type: "agent" } });
    expect(result.status).toBe(401);
  });

  it("returns policy for GET", async () => {
    getPolicyOrDefault.mockResolvedValue({ policy_json: { version: 1, budgets: {} } });
    const req = { method: "GET", headers: {}, query: {} };
    const result = await handler(req, null, ownerCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.version).toBe(1);
  });

  it("validates policy input on PUT", async () => {
    const req = { method: "PUT", headers: {}, body: "bad" };
    const result = await handler(req, null, ownerCtx());
    expect(result.status).toBe(400);
  });

  it("updates policy on PUT", async () => {
    upsertPolicy.mockResolvedValue({ policy_json: { version: 2, budgets: {} }, version: 2 });
    const req = { method: "PUT", headers: { "if-match": "1" }, body: { version: 1 } };
    const result = await handler(req, null, ownerCtx());
    expect(result.status).toBe(200);
    expect(result.body.data.version).toBe(2);
  });
});
