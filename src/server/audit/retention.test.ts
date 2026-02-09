import { afterEach, describe, expect, it, vi } from "vitest";

import { runAuditRetention } from "./retention";

function okResponse(contentRange: string | null) {
  const headers: Record<string, string> = {};
  if (contentRange !== null) headers["content-range"] = contentRange;
  return new Response("", { status: 200, headers });
}

describe("runAuditRetention", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips when Supabase credentials are missing", async () => {
    const result = await runAuditRetention({ env: {}, now: new Date("2026-02-09T00:00:00Z") });
    expect(result).toEqual({
      skipped: true,
      reason: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
    });
  });

  it("skips when no retention env vars are configured", async () => {
    const result = await runAuditRetention({
      env: {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-key"
      },
      now: new Date("2026-02-09T00:00:00Z")
    });
    expect(result).toEqual({ skipped: true, reason: "No retention env vars configured." });
  });

  it("issues DELETE/PATCH requests with expected bodies and returns affected counts", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch" as any)
      .mockResolvedValueOnce(okResponse("0-0/12"))
      .mockResolvedValueOnce(okResponse("0-0/34"))
      .mockResolvedValueOnce(okResponse(null))
      .mockResolvedValueOnce(okResponse("0-0/0"));

    const env = {
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      AUDIT_RETENTION_DAYS: "7",
      AUDIT_PAYLOAD_RETENTION_DAYS: "30",
      AUDIT_IP_FULL_RETENTION_DAYS: "1",
      AUDIT_USER_AGENT_RETENTION_DAYS: "2"
    };
    const now = new Date("2026-02-09T00:00:00.000Z");

    const result: any = await runAuditRetention({ env, now });

    expect(fetchSpy).toHaveBeenCalledTimes(4);

    const cutoffDelete = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffPayload = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffIp = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const cutoffUa = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const [deleteUrl, deleteInit]: any[] = fetchSpy.mock.calls[0];
    const deleteParsed = new URL(String(deleteUrl));
    expect(deleteParsed.origin).toBe("https://example.supabase.co");
    expect(deleteParsed.pathname).toBe("/rest/v1/audit_logs");
    expect(deleteParsed.searchParams.get("occurred_at")).toBe(`lt.${cutoffDelete}`);
    expect(deleteParsed.searchParams.get("select")).toBe("id");
    expect(deleteInit.method).toBe("DELETE");
    expect(deleteInit.body).toBeUndefined();

    const [payloadUrl, payloadInit]: any[] = fetchSpy.mock.calls[1];
    const payloadParsed = new URL(String(payloadUrl));
    expect(payloadParsed.searchParams.get("occurred_at")).toBe(`lt.${cutoffPayload}`);
    expect(payloadInit.method).toBe("PATCH");
    expect(payloadInit.headers.Authorization).toBe("Bearer service-key");
    expect(payloadInit.headers.apikey).toBe("service-key");
    expect(JSON.parse(payloadInit.body)).toEqual({ payload: {}, redacted: true });

    const [ipUrl, ipInit]: any[] = fetchSpy.mock.calls[2];
    const ipParsed = new URL(String(ipUrl));
    expect(ipParsed.searchParams.get("occurred_at")).toBe(`lt.${cutoffIp}`);
    expect(JSON.parse(ipInit.body)).toEqual({ ip_full: null });

    const [uaUrl, uaInit]: any[] = fetchSpy.mock.calls[3];
    const uaParsed = new URL(String(uaUrl));
    expect(uaParsed.searchParams.get("occurred_at")).toBe(`lt.${cutoffUa}`);
    expect(JSON.parse(uaInit.body)).toEqual({ user_agent: null });

    expect(result.delete).toEqual({
      retentionDays: 7,
      cutoff: cutoffDelete,
      affected: 12
    });
    expect(result.payload).toEqual({
      retentionDays: 30,
      cutoff: cutoffPayload,
      affected: 34
    });
    expect(result.ip_full).toEqual({
      retentionDays: 1,
      cutoff: cutoffIp,
      affected: null
    });
    expect(result.user_agent).toEqual({
      retentionDays: 2,
      cutoff: cutoffUa,
      affected: 0
    });
  });

  it("throws a helpful error when the REST call fails", async () => {
    vi.spyOn(globalThis, "fetch" as any).mockResolvedValue(
      new Response("nope", { status: 400 })
    );

    await expect(
      runAuditRetention({
        env: {
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-key",
          AUDIT_RETENTION_DAYS: "1"
        },
        now: new Date("2026-02-09T00:00:00Z")
      })
    ).rejects.toThrow(/Retention DELETE on audit_logs failed: 400/);

  });
});
