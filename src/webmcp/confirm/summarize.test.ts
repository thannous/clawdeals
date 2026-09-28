import { describe, expect, it } from "vitest";

import { applyPrimaryField } from "./summarize";

describe("applyPrimaryField", () => {
  const field = {
    key: "amount",
    labelKey: "confirm.fields.offerAmount",
    kind: "amount" as const,
    value: 1100,
    currency: "EUR"
  };

  it("rewrites the amount and validates integers", () => {
    expect(applyPrimaryField({ amount: 1100, listing_id: "l" }, field, "1250")).toEqual({
      args: { amount: 1250, listing_id: "l" },
      error: null
    });
    expect(applyPrimaryField({ amount: 1100 }, field, "12.5").error).toBe("confirm.errors.wholeAmount");
    expect(applyPrimaryField({ amount: 1100 }, field, "").error).toBe("confirm.errors.enterAmount");
  });

  it("rewrites text fields and rejects empty text", () => {
    const textField = {
      key: "text",
      labelKey: "confirm.fields.message",
      kind: "text" as const,
      value: "a",
      currency: null
    };
    expect(applyPrimaryField({ text: "a" }, textField, "Is the invoice available?").args).toEqual({
      text: "Is the invoice available?"
    });
    expect(applyPrimaryField({ text: "a" }, textField, "   ").error).toBeTruthy();
  });
});
