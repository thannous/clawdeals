import crypto from "crypto";
import { hmacSha256 } from "../utils/hmac";
import type {
  PSPAdapter,
  PspMode,
  PspWebhookEvent,
  VerifyWebhookSignatureInput
} from "./psp-adapter";

function safeHeader(headers: any, name: string) {
  if (!headers) return null;
  const direct = headers[name];
  if (Array.isArray(direct)) return direct[0] || null;
  if (direct) return direct;
  const lower = headers[String(name).toLowerCase()];
  if (Array.isArray(lower)) return lower[0] || null;
  return lower || null;
}

function isIsoString(value: any) {
  if (!value || typeof value !== "string") return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function assertNonEmptyString(value: any, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function coerceEventId(value: any) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value == null) return crypto.randomUUID();
  return String(value);
}

function coerceCreatedAt(value: any) {
  if (isIsoString(value)) return value;
  return new Date().toISOString();
}

function parseAccountUpdated(body: any): PspWebhookEvent {
  const externalAccountId = assertNonEmptyString(body?.data?.external_account_id, "data.external_account_id");
  const kycStatus = assertNonEmptyString(body?.data?.kyc_status, "data.kyc_status").toUpperCase();
  if (!["NOT_STARTED", "PENDING", "VERIFIED", "REJECTED"].includes(kycStatus)) {
    throw new Error("data.kyc_status is invalid");
  }
  return {
    id: coerceEventId(body?.id),
    type: "account.updated",
    created_at: coerceCreatedAt(body?.created_at),
    data: {
      external_account_id: externalAccountId,
      kyc_status: kycStatus as any,
      requirements_due: body?.data?.requirements_due ?? null
    }
  };
}

function parsePaymentSucceeded(body: any): PspWebhookEvent {
  const paymentId = assertNonEmptyString(body?.data?.payment_id, "data.payment_id");
  const holdIdRaw = body?.data?.hold_id;
  const holdExpiresAtRaw = body?.data?.hold_expires_at;
  const holdId = typeof holdIdRaw === "string" && holdIdRaw.trim() ? holdIdRaw.trim() : null;
  const holdExpiresAt =
    typeof holdExpiresAtRaw === "string" && holdExpiresAtRaw.trim() ? holdExpiresAtRaw.trim() : null;

  if (holdExpiresAt && !isIsoString(holdExpiresAt)) {
    throw new Error("data.hold_expires_at must be an ISO date");
  }

  return {
    id: coerceEventId(body?.id),
    type: "payment.succeeded",
    created_at: coerceCreatedAt(body?.created_at),
    data: {
      payment_id: paymentId,
      hold_id: holdId,
      hold_expires_at: holdExpiresAt
    }
  };
}

function parsePayoutSucceeded(body: any): PspWebhookEvent {
  const payoutId = assertNonEmptyString(body?.data?.payout_id, "data.payout_id");
  return {
    id: coerceEventId(body?.id),
    type: "payout.succeeded",
    created_at: coerceCreatedAt(body?.created_at),
    data: {
      payout_id: payoutId
    }
  };
}

export class MockPspAdapter implements PSPAdapter {
  provider: "mock" = "mock";
  mode: PspMode;

  constructor({ mode }: { mode: PspMode }) {
    this.mode = mode;
  }

  verifyWebhookSignature({ canonicalBody, headers, secret }: VerifyWebhookSignatureInput) {
    const signature = safeHeader(headers, "x-psp-signature");
    if (!signature || typeof signature !== "string") {
      return { ok: false, error: "missing_signature" } as const;
    }
    if (!secret) {
      return { ok: false, error: "missing_secret" } as const;
    }

    const expected = hmacSha256(secret, canonicalBody || "");
    if (signature !== expected) {
      return { ok: false, error: "invalid_signature" } as const;
    }
    return { ok: true } as const;
  }

  parseWebhookEvent(body: any): PspWebhookEvent {
    const type = assertNonEmptyString(body?.type, "type");
    switch (type) {
      case "account.updated":
        return parseAccountUpdated(body);
      case "payment.succeeded":
        return parsePaymentSucceeded(body);
      case "payout.succeeded":
        return parsePayoutSucceeded(body);
      default:
        throw new Error("type is invalid");
    }
  }

  async createSellerOnboarding({ ownerId }: { ownerId: string }) {
    const externalAccountId = `mock_acct_${ownerId}`;
    return {
      externalAccountId,
      kycStatus: "PENDING" as const,
      requirementsDue: { fields: ["identity_document"] },
      url: `https://mock-psp.local/onboarding/${encodeURIComponent(externalAccountId)}`
    };
  }

  async createCheckoutSession({ escrowId }: { escrowId: string; amountMinor: any; currency: string }) {
    const paymentId = `mock_pay_${escrowId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    return {
      paymentId,
      checkoutUrl: `https://mock-psp.local/checkout/${encodeURIComponent(paymentId)}`,
      expiresAt
    };
  }

  async release({ escrowId }: { escrowId: string; paymentId: string; amountMinor: any; currency: string }) {
    const payoutId = `mock_payout_${escrowId}`;
    return { payoutId };
  }
}

