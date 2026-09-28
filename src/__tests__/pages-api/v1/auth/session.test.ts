import { describe, expect, it } from "vitest";

import { handler } from "../../../../pages/api/v1/auth/session";
import { matchRouteGroup } from "../../../../server/routes/route-groups";

const ownerId = "11111111-1111-1111-1111-111111111111";

describe("GET /v1/auth/session", () => {

  it("does not treat agent actors as owner sessions", async () => {
    const result: any = await handler({ method: "GET" }, null, { ownerId, actor: { type: "agent", id: "agent-1" } });
    expect(result.body.data.authenticated).toBe(false);
  });
});
