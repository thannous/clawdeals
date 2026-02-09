import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

import { randomId } from "./ids";

export async function expectStatus(response: APIResponse, expected: number) {
  const status = response.status();
  if (status !== expected) {
    const body = await response.text();
    expect(status, body).toBe(expected);
  }
  expect(status).toBe(expected);
}

export async function createOwner(api: APIRequestContext, ownerId: string) {
  const email = `itest+${ownerId}@example.com`;
  const res = await api.patch("/api/v1/owner", {
    headers: { "x-owner-id": ownerId },
    data: { email }
  });
  expect(res.status()).toBe(200);
}

export async function createOwnerWithContact(
  api: APIRequestContext,
  ownerId: string,
  { email, phone }: { email?: string; phone?: string }
) {
  const body: Record<string, unknown> = {};
  if (email) body.email = email;
  if (phone) body.phone = phone;

  const res = await api.patch("/api/v1/owner", {
    headers: { "x-owner-id": ownerId },
    data: body
  });
  expect(res.status()).toBe(200);
}

export async function registerAgent(
  api: APIRequestContext,
  ownerId: string,
  idempotencyKey: string,
  name = "Integration Agent",
  ip?: string,
  options: { requestId?: string } = {}
): Promise<APIResponse> {
  const headers: Record<string, string> = { "x-owner-id": ownerId, "Idempotency-Key": idempotencyKey };
  if (ip) headers["x-forwarded-for"] = ip;
  if (options.requestId) headers["x-request-id"] = options.requestId;

  return api.post("/api/v1/agents", {
    headers,
    data: { name }
  });
}

export async function createListing(
  api: APIRequestContext,
  apiKey: string,
  overrides: Record<string, unknown> = {},
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post("/api/v1/listings", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {
      title: `Integration listing ${randomId()}`,
      description: "",
      category: "unknown",
      condition: "GOOD",
      price: { amount: 0, currency: "EUR" },
      // Default to drafts to keep non-listing tests from creating approvals.
      publish: false,
      ...overrides
    }
  });
}

export async function patchListing(
  api: APIRequestContext,
  apiKey: string,
  listingId: string,
  patch: Record<string, unknown> = {},
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.patch(`/api/v1/listings/${encodeURIComponent(listingId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: patch
  });
}

export async function createOffer(
  api: APIRequestContext,
  apiKey: string,
  listingId: string,
  {
    threadId,
    amount,
    currency,
    expiresAt
  }: { threadId?: string | null; amount: number; currency: string; expiresAt: string },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  const data: Record<string, unknown> = {
    amount,
    currency,
    expires_at: expiresAt
  };

  if (threadId) {
    data.thread_id = threadId;
  }

  return api.post(`/api/v1/listings/${encodeURIComponent(listingId)}/offers`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data
  });
}

export async function createCounterOffer(
  api: APIRequestContext,
  apiKey: string,
  offerId: string,
  { amount, currency, expiresAt }: { amount: number; currency: string; expiresAt: string },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/offers/${encodeURIComponent(offerId)}/counter`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {
      amount,
      currency,
      expires_at: expiresAt
    }
  });
}

export async function acceptOffer(
  api: APIRequestContext,
  apiKey: string,
  offerId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/offers/${encodeURIComponent(offerId)}/accept`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function declineOffer(
  api: APIRequestContext,
  apiKey: string,
  offerId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/offers/${encodeURIComponent(offerId)}/decline`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function cancelOffer(
  api: APIRequestContext,
  apiKey: string,
  offerId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/offers/${encodeURIComponent(offerId)}/cancel`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function markTransactionCompleted(
  api: APIRequestContext,
  apiKey: string,
  txId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/transactions/${encodeURIComponent(txId)}/mark-completed`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function createTransactionRating(
  api: APIRequestContext,
  apiKey: string,
  txId: string,
  {
    score,
    reasonCode,
    comment
  }: { score: number; reasonCode?: string | null; comment?: string | null },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  const data: Record<string, unknown> = { score };
  if (reasonCode) data.reason_code = reasonCode;
  if (comment !== undefined) data.comment = comment;

  return api.post(`/api/v1/transactions/${encodeURIComponent(txId)}/ratings`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data
  });
}

export async function configurePsp(
  api: APIRequestContext,
  ownerId: string,
  {
    provider = "mock",
    mode = "sandbox",
    webhookSecretRef,
    platformFeeBpsDefault = 400
  }: {
    provider?: string;
    mode?: "sandbox" | "production";
    webhookSecretRef: string;
    platformFeeBpsDefault?: number;
  },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post("/api/v1/ops/psp/configure", {
    headers: {
      "x-owner-id": ownerId,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {
      provider,
      mode,
      webhook_secret_ref: webhookSecretRef,
      platform_fee_bps_default: platformFeeBpsDefault
    }
  });
}

export async function pspOnboardSeller(
  api: APIRequestContext,
  ownerId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post("/api/v1/sellers/psp:onboard", {
    headers: {
      "x-owner-id": ownerId,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function getSellerPspStatus(api: APIRequestContext, ownerId: string): Promise<APIResponse> {
  return api.get("/api/v1/sellers/psp:status", {
    headers: { "x-owner-id": ownerId }
  });
}

export async function postPspWebhook(
  api: APIRequestContext,
  {
    signature,
    body
  }: {
    signature: string;
    body: any;
  }
): Promise<APIResponse> {
  return api.post("/api/v1/psp/webhooks", {
    headers: {
      "x-psp-signature": signature
    },
    data: body
  });
}

export async function createEscrow(
  api: APIRequestContext,
  apiKey: string,
  txId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/transactions/${encodeURIComponent(txId)}/escrow:create`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function payEscrow(
  api: APIRequestContext,
  apiKey: string,
  escrowId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/escrows/${encodeURIComponent(escrowId)}/pay`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function markDelivered(
  api: APIRequestContext,
  apiKey: string,
  escrowId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/escrows/${encodeURIComponent(escrowId)}/mark-delivered`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function confirmReceived(
  api: APIRequestContext,
  apiKey: string,
  escrowId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/escrows/${encodeURIComponent(escrowId)}/confirm-received`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function openDispute(
  api: APIRequestContext,
  apiKey: string,
  escrowId: string,
  {
    reasonCode,
    notes
  }: {
    reasonCode: string;
    notes?: string | null;
  },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/escrows/${encodeURIComponent(escrowId)}/disputes`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {
      reason_code: reasonCode,
      notes: notes ?? null
    }
  });
}

export async function resolveDispute(
  api: APIRequestContext,
  ownerId: string,
  disputeId: string,
  {
    resolution,
    notes
  }: {
    resolution: "REFUND" | "RELEASE";
    notes?: string | null;
  },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/disputes/${encodeURIComponent(disputeId)}/resolve`, {
    headers: {
      "x-owner-id": ownerId,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {
      resolution,
      notes: notes ?? null
    }
  });
}

export async function evidenceInit(
  api: APIRequestContext,
  apiKey: string,
  disputeId: string,
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {}
  });
}

export async function evidenceConfirm(
  api: APIRequestContext,
  apiKey: string,
  disputeId: string,
  {
    bucket,
    key,
    sha256,
    contentType,
    bytes
  }: {
    bucket: string;
    key: string;
    sha256: string;
    contentType: string;
    bytes: number;
  },
  options: { idempotencyKey?: string } = {}
): Promise<APIResponse> {
  return api.post(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence:confirm`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Idempotency-Key": options.idempotencyKey || randomId()
    },
    data: {
      bucket,
      key,
      sha256,
      content_type: contentType,
      bytes
    }
  });
}

export async function evidenceGet(api: APIRequestContext, apiKey: string, disputeId: string): Promise<APIResponse> {
  return api.get(`/api/v1/disputes/${encodeURIComponent(disputeId)}/evidence`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
}
