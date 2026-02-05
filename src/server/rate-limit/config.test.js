import { describe, expect, it } from "vitest";
import { formatLimitLabel } from "./config";

describe("formatLimitLabel", () => {
  it("formats seconds and minutes", () => {
    expect(formatLimitLabel(30, 600)).toBe("30/10m");
  });
});
