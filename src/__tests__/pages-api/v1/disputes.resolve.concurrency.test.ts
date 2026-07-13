import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../server/config/ops", () => ({
  getOpsConsoleOwnerId: vi.fn(),
}));

vi.mock("../../../server/services/disputes", () => ({
  beginResolveDispute: vi.fn(),
  getDisputeById: vi.fn(),
  rollbackResolveDisputeLock: vi.fn(),
  resolveDispute: vi.fn(),
}));

vi.mock("../../../server/services/evidence", () => ({
  confirmEvidenceUpload: vi.fn(),
  getEscrow: vi.fn(),
  initEvidenceUpload: vi.fn(),
  isAllowedEvidenceContentType: vi.fn(),
  isValidSha256Hex: vi.fn(),
  listEvidenceBundle: vi.fn(),
}));

vi.mock("../../../server/services/psp-config", () => ({
  getPspConfig: vi.fn(),
}));

vi.mock("../../../server/psp", () => ({
  createPspAdapter: vi.fn(),
}));

import { handler } from "../../../pages/api/v1/disputes/[dispute_id]/[action]";
import { getOpsConsoleOwnerId } from "../../../server/config/ops";
import { createPspAdapter } from "../../../server/psp";
import { beginResolveDispute, getDisputeById, resolveDispute, rollbackResolveDisputeLock } from "../../../server/services/disputes";
import { getEscrow } from "../../../server/services/evidence";
import { getPspConfig } from "../../../server/services/psp-config";

const getOpsConsoleOwnerIdMock = vi.mocked(getOpsConsoleOwnerId);
const getDisputeByIdMock = vi.mocked(getDisputeById);
const beginResolveDisputeMock = vi.mocked(beginResolveDispute);
const rollbackResolveDisputeLockMock = vi.mocked(rollbackResolveDisputeLock);
const resolveDisputeMock = vi.mocked(resolveDispute);
const getEscrowMock = vi.mocked(getEscrow);
const getPspConfigMock = vi.mocked(getPspConfig);
const createPspAdapterMock = vi.mocked(createPspAdapter);

const OPS_OWNER_ID = "00000000-0000-4000-8000-0000000000aa";
const DISPUTE_ID = "00000000-0000-4000-8000-000000000001";
const ESCROW_ID = "00000000-0000-4000-8000-000000000002";

describe("POST /v1/disputes/:id/resolve concurrency guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOpsConsoleOwnerIdMock.mockReturnValue(OPS_OWNER_ID);
    getPspConfigMock.mockResolvedValue({ provider: "mock", mode: "sandbox" } as any);
    getDisputeByIdMock.mockResolvedValue({
      dispute_id: DISPUTE_ID,
      escrow_id: ESCROW_ID,
      status: "OPEN",
      resolution: "NONE_YET",
      resolved_at: null,
    } as any);
    getEscrowMock.mockResolvedValue({
      escrow_id: ESCROW_ID,
      status: "DISPUTE_OPEN",
      psp_payment_id: "mock_pay_escrow",
      amount_gross_minor: 12345,
      currency: "EUR",
      psp_payout_id: null,
      psp_refund_id: null,
    } as any);
  });

  it("returns 409 when dispute is already being resolved and does not call PSP", async () => {
    beginResolveDisputeMock.mockRejectedValue(
      Object.assign(new Error("Dispute resolution in progress"), {
        status: 409,
        code: "DISPUTE_RESOLUTION_IN_PROGRESS",
      })
    );

    const req: any = {
      method: "POST",
      query: { action: "resolve", dispute_id: DISPUTE_ID },
      headers: { "idempotency-key": "k1" },
      body: { resolution: "REFUND", notes: "ok" },
    };
    const ctx: any = { ownerId: OPS_OWNER_ID, actor: { type: "owner", id: OPS_OWNER_ID }, authError: null };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(409);
    expect(result.body?.error?.code).toBe("DISPUTE_RESOLUTION_IN_PROGRESS");
    expect(createPspAdapterMock).not.toHaveBeenCalled();
    expect(resolveDisputeMock).not.toHaveBeenCalled();
  });

  it("releases the resolving lock when the PSP call fails", async () => {
    beginResolveDisputeMock.mockResolvedValue({ state: "locked" } as any);
    rollbackResolveDisputeLockMock.mockResolvedValue({ ok: true } as any);
    createPspAdapterMock.mockReturnValue({
      refund: vi.fn(async () => {
        throw Object.assign(new Error("psp down"), { status: 502, code: "PSP_DOWN" });
      }),
      release: vi.fn(),
    } as any);

    const req: any = {
      method: "POST",
      query: { action: "resolve", dispute_id: DISPUTE_ID },
      headers: { "idempotency-key": "k1" },
      body: { resolution: "REFUND", notes: "ok" },
    };
    const ctx: any = { ownerId: OPS_OWNER_ID, actor: { type: "owner", id: OPS_OWNER_ID }, authError: null };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(502);
    expect(rollbackResolveDisputeLockMock).toHaveBeenCalledTimes(1);
    expect(rollbackResolveDisputeLockMock).toHaveBeenCalledWith({ disputeId: DISPUTE_ID });
    expect(resolveDisputeMock).not.toHaveBeenCalled();
  });

  it("returns 200 without PSP side-effects when already resolved with same resolution", async () => {
    beginResolveDisputeMock.mockResolvedValue({
      state: "already_resolved",
      dispute: {
        dispute_id: DISPUTE_ID,
        status: "RESOLVED",
        resolution: "REFUND",
        resolved_at: "2026-02-09T00:00:00.000Z",
      },
    } as any);

    const req: any = {
      method: "POST",
      query: { action: "resolve", dispute_id: DISPUTE_ID },
      headers: { "idempotency-key": "k1" },
      body: { resolution: "REFUND", notes: "ok" },
    };
    const ctx: any = { ownerId: OPS_OWNER_ID, actor: { type: "owner", id: OPS_OWNER_ID }, authError: null };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body?.status).toBe("RESOLVED");
    expect(result.body?.resolution).toBe("REFUND");
    expect(createPspAdapterMock).not.toHaveBeenCalled();
    expect(resolveDisputeMock).not.toHaveBeenCalled();
  });

  it("returns 200 for same-resolution replay when escrow already moved past DISPUTE_OPEN", async () => {
    getDisputeByIdMock.mockResolvedValue({
      dispute_id: DISPUTE_ID,
      escrow_id: ESCROW_ID,
      status: "RESOLVED",
      resolution: "REFUND",
      resolved_at: "2026-02-09T00:00:00.000Z",
    } as any);
    getEscrowMock.mockResolvedValue({
      escrow_id: ESCROW_ID,
      status: "REFUND_PENDING",
      psp_payment_id: "mock_pay_escrow",
      amount_gross_minor: 12345,
      currency: "EUR",
      psp_payout_id: null,
      psp_refund_id: "mock_refund_1",
    } as any);

    const req: any = {
      method: "POST",
      query: { action: "resolve", dispute_id: DISPUTE_ID },
      headers: { "idempotency-key": "k1" },
      body: { resolution: "REFUND", notes: "ok" },
    };
    const ctx: any = { ownerId: OPS_OWNER_ID, actor: { type: "owner", id: OPS_OWNER_ID }, authError: null };

    const result: any = await handler(req, null, ctx);

    expect(result.status).toBe(200);
    expect(result.body?.status).toBe("RESOLVED");
    expect(result.body?.resolution).toBe("REFUND");
    expect(result.body?.escrow_status).toBe("REFUND_PENDING");
    expect(beginResolveDisputeMock).not.toHaveBeenCalled();
    expect(createPspAdapterMock).not.toHaveBeenCalled();
    expect(resolveDisputeMock).not.toHaveBeenCalled();
  });
});
