import { describe, expect, it } from "vitest";

import { sanitizeToolOutput } from "./sanitize";

describe("webmcp sanitizeToolOutput", () => {
  it("redacts emails and phone-like strings", () => {
    const input: any = {
      description: "email me at test@example.com or call +33 6 12 34 56 78",
      nested: { ok: true }
    };

    const out: any = sanitizeToolOutput(input);
    expect(out.description).toContain("[REDACTED]");
    expect(out.description).not.toContain("test@example.com");
    expect(out.description).not.toContain("6 12 34 56 78");
  });

  it("redacts sensitive keys", () => {
    const input: any = {
      api_key: "cd_live_123",
      authorization: "Bearer xyz",
      geo: { lat: 48.8566, lng: 2.3522 },
      safe: "ok"
    };
    const out: any = sanitizeToolOutput(input);
    expect(out.api_key).toBe("[REDACTED]");
    expect(out.authorization).toBe("[REDACTED]");
    expect(out.geo).toBe("[REDACTED]");
    expect(out.safe).toBe("ok");
  });
});
