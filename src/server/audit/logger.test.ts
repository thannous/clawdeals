import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAuditLogger } from "./logger";

describe("createAuditLogger", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws when AUDIT_HMAC_SECRET is missing and hmacSecret is not provided", () => {
    delete process.env.AUDIT_HMAC_SECRET;
    expect(() => createAuditLogger({ write: vi.fn() })).toThrow(/AUDIT_HMAC_SECRET/);
  });
});

