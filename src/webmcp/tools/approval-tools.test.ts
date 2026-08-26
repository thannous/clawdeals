import { afterEach, describe, expect, it, vi } from "vitest";

import { approvalIdFromPath, approvalTools } from "./approval-tools";

const APPROVAL_ID = "a2cb3c39-7e2f-4c2d-9d0b-53b77339b8de";

describe("owner approval WebMCP tool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("binds resolution to a specific owner approval path", () => {
    expect(approvalIdFromPath(`/my/approvals/${APPROVAL_ID}`)).toBe(APPROVAL_ID);
    expect(approvalIdFromPath(`/fr/my/approvals/${APPROVAL_ID}`)).toBe(APPROVAL_ID);
    expect(approvalIdFromPath("/my/approvals")).toBeNull();
    expect(approvalIdFromPath("/dev/webmcp")).toBeNull();
  });

  it("returns a context error without making a request outside the detail page", async () => {
    vi.stubGlobal("window", { location: { pathname: "/my/approvals" } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await approvalTools[0].execute(
      { decision: "approve", amount: 1290 },
      { requestId: "req-1", idempotencyKey: "idem-1" } as any
    );
    expect(result).toMatchObject({ ok: false, error: { code: "CONTEXT_MISMATCH" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses same-origin owner cookies and never adds an agent Authorization header", async () => {
    vi.stubGlobal("window", { location: { pathname: `/my/approvals/${APPROVAL_ID}` } });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            approval_id: APPROVAL_ID,
            action_type: "offer_over_budget",
            state: "APPROVED",
            resolved_at: "2026-08-26T10:00:00.000Z"
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await approvalTools[0].execute(
      { decision: "approve", amount: 1290 },
      { requestId: "req-1", idempotencyKey: "idem-1" } as any
    );

    expect(result).toMatchObject({
      ok: true,
      data: { approval_id: APPROVAL_ID, state: "APPROVED" }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.credentials).toBe("same-origin");
    expect(options.headers.authorization).toBeUndefined();
    expect(options.headers["idempotency-key"]).toBe("idem-1");
    expect(JSON.parse(String(options.body))).toEqual({ amount: 1290 });
  });
});
