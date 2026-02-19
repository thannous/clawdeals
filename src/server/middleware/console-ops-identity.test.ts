import { describe, expect, it, vi } from "vitest";

import { injectConsoleOpsOwner } from "./console-ops-identity";

describe("injectConsoleOpsOwner", () => {
  it("injects trusted owner identity before invoking handler", async () => {
    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler, {
      ownerId: "00000000-0000-4000-a000-000000000123"
    });

    const req: any = { headers: {} };
    const res: any = {};
    await wrapped(req, res);

    expect(req.headers["x-owner-id"]).toBe("00000000-0000-4000-a000-000000000123");
    expect(req.__clawdealsTrustedIdentity).toEqual({
      ownerId: "00000000-0000-4000-a000-000000000123"
    });
    expect(apiHandler).toHaveBeenCalledWith(req, res);
  });

  it("overrides user-provided owner header", async () => {
    const apiHandler = vi.fn(async () => null);
    const wrapped = injectConsoleOpsOwner(apiHandler, {
      ownerId: "00000000-0000-4000-a000-000000000123"
    });

    const req: any = {
      headers: {
        "x-owner-id": "attacker-owner-id"
      }
    };

    await wrapped(req, {});

    expect(req.headers["x-owner-id"]).toBe("00000000-0000-4000-a000-000000000123");
    expect(req.__clawdealsTrustedIdentity).toEqual({
      ownerId: "00000000-0000-4000-a000-000000000123"
    });
  });
});
