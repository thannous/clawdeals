import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/services/psp-config", () => ({
  getPspConfig: vi.fn()
}));

vi.mock("../../../../server/psp", () => ({
  createPspAdapter: vi.fn()
}));

vi.mock("../../../../server/services/escrows", () => ({
  getEscrowById: vi.fn(),
  markEscrowDelivered: vi.fn(),
  setEscrowPayment: vi.fn()
}));

vi.mock("../../../../server/services/psp-webhook-events", () => ({
  claimOrphanedPspWebhookEvents: vi.fn()
}));

vi.mock("../../../../server/services/psp-webhook-replay", () => ({
  replayPendingEscrowEvents: vi.fn()
}));

vi.mock("../../../../server/sse/store", () => ({
  publishSseEvent: vi.fn()
}));

import { handler as markDeliveredHandler } from "../../../../pages/api/v1/escrows/[escrow_id]/mark-delivered";
import { handler as payHandler } from "../../../../pages/api/v1/escrows/[escrow_id]/pay";
import { createPspAdapter } from "../../../../server/psp";
import {
  getEscrowById,
  markEscrowDelivered,
  setEscrowPayment
} from "../../../../server/services/escrows";
import { getPspConfig } from "../../../../server/services/psp-config";
import { claimOrphanedPspWebhookEvents } from "../../../../server/services/psp-webhook-events";
import { replayPendingEscrowEvents } from "../../../../server/services/psp-webhook-replay";
import { publishSseEvent } from "../../../../server/sse/store";

const createPspAdapterMock = vi.mocked(createPspAdapter);
const getEscrowByIdMock = vi.mocked(getEscrowById);
const markEscrowDeliveredMock = vi.mocked(markEscrowDelivered);
const setEscrowPaymentMock = vi.mocked(setEscrowPayment);
const getPspConfigMock = vi.mocked(getPspConfig);
const claimOrphanedPspWebhookEventsMock = vi.mocked(claimOrphanedPspWebhookEvents);
const replayPendingEscrowEventsMock = vi.mocked(replayPendingEscrowEvents);
const publishSseEventMock = vi.mocked(publishSseEvent);
const createCheckoutSessionMock = vi.fn();

const ESCROW_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SELLER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function request(headers: any = { "idempotency-key": "idem-1" }) {
  return {
    method: "POST",
    headers,
    query: { escrow_id: ESCROW_ID },
    body: {}
  } as any;
}

function context(agentId: string | null) {
  return {
    authError: null,
    agentId,
    actor: agentId ? { type: "agent", id: agentId } : null
  } as any;
}

function baseEscrow(overrides: any = {}) {
  return {
    escrow_id: ESCROW_ID,
    tx_id: "22222222-2222-4222-8222-222222222222",
    buyer_agent_id: BUYER_ID,
    seller_agent_id: SELLER_ID,
    status: "CREATED",
    amount_gross_minor: 12345,
    currency: "EUR",
    psp_payment_id: null,
    ...overrides
  };
}

describe("escrow action API contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPspConfigMock.mockResolvedValue({ provider: "mock", mode: "sandbox" } as any);
    getEscrowByIdMock.mockResolvedValue(baseEscrow() as any);
    markEscrowDeliveredMock.mockResolvedValue(
      baseEscrow({
        status: "DELIVERED",
        delivered_at: "2026-07-23T12:00:00.000Z"
      }) as any
    );
    setEscrowPaymentMock.mockResolvedValue(
      baseEscrow({ status: "CREATED", psp_payment_id: "payment-1" }) as any
    );
    claimOrphanedPspWebhookEventsMock.mockResolvedValue(0);
    replayPendingEscrowEventsMock.mockResolvedValue(undefined);
    publishSseEventMock.mockResolvedValue({ ok: true } as any);
    createCheckoutSessionMock.mockResolvedValue({
      paymentId: "payment-1",
      checkoutUrl: "https://psp.test/checkout/payment-1",
      expiresAt: "2026-07-23T13:00:00.000Z"
    });
    createPspAdapterMock.mockReturnValue({
      provider: "mock",
      createCheckoutSession: createCheckoutSessionMock
    } as any);
  });

  it("hides escrow existence when a non-seller tries to mark delivery", async () => {
    const result: any = await markDeliveredHandler(request(), null, context(BUYER_ID));

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("ESCROW_NOT_FOUND");
    expect(markEscrowDeliveredMock).not.toHaveBeenCalled();
    expect(publishSseEventMock).not.toHaveBeenCalled();
  });

  it("marks delivery atomically and notifies both participants", async () => {
    const ctx = context(SELLER_ID);

    const result: any = await markDeliveredHandler(request(), null, ctx);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      escrow_id: ESCROW_ID,
      status: "DELIVERED",
      delivered_at: "2026-07-23T12:00:00.000Z"
    });
    expect(markEscrowDeliveredMock).toHaveBeenCalledWith({
      escrowId: ESCROW_ID,
      actorAgentId: SELLER_ID
    });
    expect(publishSseEventMock).toHaveBeenCalledTimes(2);
    expect(publishSseEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "escrow.state_changed",
        payload: { status: "DELIVERED", transition: "delivered" }
      })
    );
    expect(ctx.body).toMatchObject({ escrow_id: ESCROW_ID, status: "DELIVERED" });
  });

  it("fails closed when PSP configuration is absent", async () => {
    getPspConfigMock.mockResolvedValue(null);

    const result: any = await payHandler(request(), null, context(BUYER_ID));

    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("PSP_NOT_CONFIGURED");
    expect(getEscrowByIdMock).not.toHaveBeenCalled();
    expect(createPspAdapterMock).not.toHaveBeenCalled();
  });

  it("hides escrow existence when a non-buyer tries to pay", async () => {
    const result: any = await payHandler(request(), null, context(SELLER_ID));

    expect(result.status).toBe(404);
    expect(result.body.error.code).toBe("ESCROW_NOT_FOUND");
    expect(createPspAdapterMock).not.toHaveBeenCalled();
    expect(setEscrowPaymentMock).not.toHaveBeenCalled();
  });

  it("replays an existing payment id without creating a second checkout session", async () => {
    getEscrowByIdMock.mockResolvedValue(
      baseEscrow({ status: "HOLD", psp_payment_id: "payment-existing" }) as any
    );

    const result: any = await payHandler(request(), null, context(BUYER_ID));

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      escrow_id: ESCROW_ID,
      status: "HOLD",
      psp: {
        payment_id: "payment-existing",
        checkout_url: "https://mock-psp.local/checkout/payment-existing",
        expires_at: null
      }
    });
    expect(createPspAdapterMock).toHaveBeenCalledTimes(1);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
    expect(setEscrowPaymentMock).not.toHaveBeenCalled();
  });

  it("claims and replays orphaned webhooks before returning the refreshed escrow status", async () => {
    const initial = baseEscrow();
    const refreshed = baseEscrow({ status: "HOLD", psp_payment_id: "payment-1" });
    getEscrowByIdMock
      .mockResolvedValueOnce(initial as any)
      .mockResolvedValueOnce(refreshed as any);
    claimOrphanedPspWebhookEventsMock.mockResolvedValue(2);

    const result: any = await payHandler(request(), null, context(BUYER_ID));

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("HOLD");
    expect(setEscrowPaymentMock).toHaveBeenCalledWith({
      escrowId: ESCROW_ID,
      actorAgentId: BUYER_ID,
      provider: "mock",
      paymentId: "payment-1"
    });
    expect(claimOrphanedPspWebhookEventsMock).toHaveBeenCalledWith({
      escrowId: ESCROW_ID,
      paymentId: "payment-1"
    });
    expect(replayPendingEscrowEventsMock).toHaveBeenCalledWith({
      escrowId: ESCROW_ID,
      adapter: expect.objectContaining({ provider: "mock" })
    });
    expect(getEscrowByIdMock).toHaveBeenCalledTimes(2);
  });

  it("preserves checkout success when orphan webhook replay fails", async () => {
    claimOrphanedPspWebhookEventsMock.mockResolvedValue(1);
    replayPendingEscrowEventsMock.mockRejectedValue(new Error("replay unavailable"));
    getEscrowByIdMock
      .mockResolvedValueOnce(baseEscrow() as any)
      .mockRejectedValueOnce(new Error("refresh unavailable"));

    const result: any = await payHandler(request(), null, context(BUYER_ID));

    expect(result.status).toBe(200);
    expect(result.body.status).toBe("CREATED");
    expect(result.body.psp.payment_id).toBe("payment-1");
  });
});
