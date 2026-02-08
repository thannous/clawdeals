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
  ip?: string
): Promise<APIResponse> {
  const headers: Record<string, string> = { "x-owner-id": ownerId, "Idempotency-Key": idempotencyKey };
  if (ip) headers["x-forwarded-for"] = ip;

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
