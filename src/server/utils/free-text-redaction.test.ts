import { describe, expect, it } from "vitest";

import { redactEmailsAndPhones } from "./free-text-redaction";

describe("utils/free-text-redaction", () => {
  it("redacts email addresses", () => {
    const result = redactEmailsAndPhones("Contact seller at test@leak.example.com");
    expect(result.redacted).toBe(true);
    expect(result.text).toBe("Contact seller at [REDACTED]");
    expect(result.matchCount).toBe(1);
  });

  it("redacts mailto tokens", () => {
    const result = redactEmailsAndPhones("Email via mailto:test@leak.example.com now");
    expect(result.redacted).toBe(true);
    expect(result.text).toBe("Email via [REDACTED] now");
  });

  it("redacts phone-like strings with >= 10 digits", () => {
    const result = redactEmailsAndPhones("Call me at +33 6 12 34 56 78 please");
    expect(result.redacted).toBe(true);
    expect(result.text).toBe("Call me at [REDACTED] please");
  });

  it("does not redact urls or domains", () => {
    const url = "Visit https://malicious.example.com for details";
    const domain = "Check malicious.example.com/pay";
    expect(redactEmailsAndPhones(url).text).toBe(url);
    expect(redactEmailsAndPhones(domain).text).toBe(domain);
  });

  it("supports custom replaceWith token", () => {
    const result = redactEmailsAndPhones("Email me at scam@example.com", { replaceWith: "[X]" });
    expect(result.text).toBe("Email me at [X]");
  });
});

