import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../server/retention/shared", () => ({
  parseRetentionDays: vi.fn(),
  computeCutoffDate: vi.fn(),
  restRequest: vi.fn()
}));

import { runReportsRetention } from "../../server/services/reports-retention";
import { parseRetentionDays, computeCutoffDate, restRequest } from "../../server/retention/shared";

describe("runReportsRetention", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns skipped when SUPABASE_URL is missing", async () => {
    const result = await runReportsRetention({
      env: { SUPABASE_SERVICE_ROLE_KEY: "key" }
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/SUPABASE_URL/);
  });

  it("returns skipped when no retention env vars", async () => {
    vi.mocked(parseRetentionDays).mockReturnValue(null);

    const result = await runReportsRetention({
      env: { SUPABASE_URL: "https://x.co", SUPABASE_SERVICE_ROLE_KEY: "key" }
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/No retention env vars/);
  });

  it("runs DELETE when REPORTS_RETENTION_DAYS is configured", async () => {
    const cutoffDate = new Date("2026-01-01T00:00:00Z");
    vi.mocked(parseRetentionDays).mockImplementation((val) =>
      val === "90" ? 90 : null
    );
    vi.mocked(computeCutoffDate).mockReturnValue(cutoffDate);
    vi.mocked(restRequest).mockResolvedValue({ affected: 5 });

    const result = await runReportsRetention({
      env: {
        SUPABASE_URL: "https://x.co",
        SUPABASE_SERVICE_ROLE_KEY: "key",
        REPORTS_RETENTION_DAYS: "90"
      },
      now: new Date("2026-04-01T00:00:00Z")
    });

    expect(result.delete).toBeDefined();
    expect(result.delete.retentionDays).toBe(90);
    expect(result.delete.affected).toBe(5);
    expect(restRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        table: "reports",
        timeColumn: "created_at",
        method: "DELETE",
        cutoff: cutoffDate
      })
    );
  });

  it("runs PATCH for PII redaction when REPORTS_PII_RETENTION_DAYS is configured", async () => {
    const cutoffDate = new Date("2026-01-15T00:00:00Z");
    vi.mocked(parseRetentionDays).mockImplementation((val) =>
      val === "30" ? 30 : null
    );
    vi.mocked(computeCutoffDate).mockReturnValue(cutoffDate);
    vi.mocked(restRequest).mockResolvedValue({ affected: 3 });

    const result = await runReportsRetention({
      env: {
        SUPABASE_URL: "https://x.co",
        SUPABASE_SERVICE_ROLE_KEY: "key",
        REPORTS_PII_RETENTION_DAYS: "30"
      },
      now: new Date("2026-02-14T00:00:00Z")
    });

    expect(result.pii_redaction).toBeDefined();
    expect(result.pii_redaction.retentionDays).toBe(30);
    expect(restRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        body: { free_text_redacted: null }
      })
    );
  });

  it("runs both DELETE and PII when both env vars set", async () => {
    const cutoffA = new Date("2025-10-01T00:00:00Z");
    const cutoffB = new Date("2025-12-01T00:00:00Z");
    vi.mocked(parseRetentionDays)
      .mockReturnValueOnce(90) // REPORTS_RETENTION_DAYS
      .mockReturnValueOnce(60); // REPORTS_PII_RETENTION_DAYS
    vi.mocked(computeCutoffDate)
      .mockReturnValueOnce(cutoffA)
      .mockReturnValueOnce(cutoffB);
    vi.mocked(restRequest)
      .mockResolvedValueOnce({ affected: 10 })
      .mockResolvedValueOnce({ affected: 2 });

    const result = await runReportsRetention({
      env: {
        SUPABASE_URL: "https://x.co",
        SUPABASE_SERVICE_ROLE_KEY: "key",
        REPORTS_RETENTION_DAYS: "90",
        REPORTS_PII_RETENTION_DAYS: "60"
      }
    });

    expect(result.delete).toBeDefined();
    expect(result.pii_redaction).toBeDefined();
    expect(restRequest).toHaveBeenCalledTimes(2);
  });
});
