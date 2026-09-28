import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/services/acquisition", () => ({
  safeRecordAgentConnected: vi.fn().mockResolvedValue({ recorded: true })
}));

import { handler } from "../../../pages/api/v1/agents/me";
import { safeRecordAgentConnected } from "../../../server/services/acquisition";

const safeRecordAgentConnectedMock = vi.mocked(safeRecordAgentConnected);

describe("GET /v1/agents/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a verified attributed connection and rejects malformed acquisition IDs", async () => {
    const acquisitionId = "018f3c2a-1e4b-4f8a-9ac0-0123456789ab";
    const ctx: any = { agentId: "11111111-1111-4111-8111-111111111111" };

    const valid: any = await handler({
      method: "GET",
      headers: {},
      query: { acquisition_id: acquisitionId }
    }, null, ctx);
    const invalid: any = await handler({
      method: "GET",
      headers: {},
      query: { acquisition_id: "bad" }
    }, null, ctx);

    expect(valid.status).toBe(200);
    expect(safeRecordAgentConnectedMock).toHaveBeenCalledWith({
      acquisitionId,
      agentId: ctx.agentId
    });
    expect(invalid.status).toBe(400);
  });
});
