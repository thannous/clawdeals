import { describe, expect, it } from "vitest";

import { maskEmail, maskPhoneE164 } from "./contact-masking";

describe("contact masking (TI-203)", () => {
  it("masks emails", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j***@e******.com");
    expect(maskEmail("a@b.co")).toBe("a***@b**.co");
    expect(maskEmail("long.email.address@subdomain.example.org")).toBe("l***@s******.org");
  });

  it("masks E.164 phone numbers", () => {
    expect(maskPhoneE164("+33612345678")).toBe("+33 ** ** ** 56 78");
    expect(maskPhoneE164("+14155551234")).toBe("+1 ** ** ** 12 34");
    expect(maskPhoneE164("+447911123456")).toBe("+44 ** ** ** 34 56");
  });
});

