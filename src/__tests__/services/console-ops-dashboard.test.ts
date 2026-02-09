import { describe, expect, it } from "vitest";

import { getConsoleOpsDashboard } from "../../server/services/console-ops-dashboard";

describe("getConsoleOpsDashboard()", () => {
  it("rejects non-integer strings (15abc)", async () => {
    await expect(getConsoleOpsDashboard({ windowMinutes: "15abc" })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });

  it("rejects decimal strings (15.5)", async () => {
    await expect(getConsoleOpsDashboard({ windowMinutes: "15.5" })).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR"
    });
  });
});

