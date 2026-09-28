import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/agent-installations", () => ({
  revokeInstallationForOwner: vi.fn(),
  getInstallationById: vi.fn()
}));

vi.mock("../../../../server/services/api-keys", () => ({
  rotateInstallationApiKeyForOwner: vi.fn()
}));

import { handler } from "../../../../pages/api/v1/installations/[id_action]";
import { rotateInstallationApiKeyForOwner } from "../../../../server/services/api-keys";

const rotateInstallationApiKeyForOwnerMock = vi.mocked(rotateInstallationApiKeyForOwner);

const ownerId = "c1cb3c39-7e2f-4c2d-9d0b-53b77339b8de";
const installationId = "11111111-1111-4111-8111-111111111111";

function makeOwnerCtx(): any {
  return {
    ownerId,
    actor: { type: "owner", id: ownerId }
  };
}

describe("POST /v1/installations/:installation_id:rotate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when grace_seconds is invalid", async () => {
    const invalidValues = [-1, "1.5", "1e3", "120abc"];

    for (const value of invalidValues) {
      const req: any = {
        method: "POST",
        query: { id_action: `${installationId}:rotate` },
        headers: { "idempotency-key": "idem" },
        body: { grace_seconds: value }
      };

      const result: any = await handler(req, null, makeOwnerCtx());
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
    }

    expect(rotateInstallationApiKeyForOwnerMock).not.toHaveBeenCalled();
  });
});
