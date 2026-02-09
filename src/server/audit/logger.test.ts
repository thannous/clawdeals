import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHmacFingerprint } from "./fingerprint";
import { createAuditLogger, createConsoleAuditWriter } from "./logger";

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

  it("builds a row, applies redaction, and fingerprints the redacted payload", async () => {
    const write = vi.fn(async () => {});
    const secret = "hmac-1";

    const logger = createAuditLogger({
      write,
      hmacSecret: secret,
      now: () => new Date("2026-02-09T00:00:00.000Z")
    });

    const event: any = {
      occurredAt: "2026-02-09T00:00:00Z",
      actor: { type: "agent", id: "agent-1" },
      auth: { agent_id: "agent-1", owner_id: "owner-1", api_key_id: "key-1" },
      request: {
        id: "req-1",
        ip: "1.2.3.4",
        userAgent: "ua-1",
        method: "POST",
        path: "/api/v1/listings/l1",
        query: { a: "1" }
      },
      action: {
        event: "listing.viewed",
        entity_type: "listing",
        entity_id: "l1"
      },
      security: { origin: "mcp" },
      policy: { allow: true },
      payload: { authorization: "Bearer secret", ok: true },
      rateLimit: { group: "listing.viewed", scope: "ip" },
      idempotency: { key: "idem-1", replayed: false },
      outcome: "SUCCESS"
    };

    const row: any = await logger(event);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(row);

    expect(row.occurred_at).toBe("2026-02-09T00:00:00.000Z");
    expect(row.actor).toEqual({ type: "agent", id: "agent-1" });
    expect(row.request_id).toBe("req-1");
    expect(row.ip_full).toBe("1.2.3.4");
    expect(row.user_agent).toBe("ua-1");

    expect(row.payload.authorization).toBe("[REDACTED]");
    expect(row.payload.ok).toBe(true);
    expect(row.redacted).toBe(true);

    expect(row.payload_fingerprint).toBe(createHmacFingerprint({ data: row.payload, secret }));
    expect(row.hash_algo).toBe("hmac-sha256");
  });

  it("uses now() when occurredAt is missing", async () => {
    const write = vi.fn(async () => {});
    const logger = createAuditLogger({
      write,
      hmacSecret: "hmac-1",
      now: () => new Date("2026-02-09T12:34:56.000Z")
    });

    const row: any = await logger({
      actor: { type: "owner", id: "owner-1" },
      request: { id: "req-1" },
      action: { event: "test" },
      payload: {},
      outcome: "SUCCESS"
    });

    expect(row.occurred_at).toBe("2026-02-09T12:34:56.000Z");
  });

  it("throws when occurredAt is invalid", async () => {
    const write = vi.fn(async () => {});
    const logger = createAuditLogger({ write, hmacSecret: "hmac-1" });

    await expect(
      logger({
        occurredAt: "not-a-date",
        actor: { type: "owner", id: "owner-1" },
        request: { id: "req-1" },
        action: { event: "test" },
        payload: {}
      })
    ).rejects.toThrow(/occurredAt/i);
  });
});

describe("createConsoleAuditWriter", () => {
  it("logs JSON-serialized rows", async () => {
    const logger = { info: vi.fn() };
    const writer = createConsoleAuditWriter({ logger });

    await writer({ a: 1 });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("[audit]", "{\"a\":1}");
  });
});

