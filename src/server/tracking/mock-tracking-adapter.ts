import crypto from "crypto";
import { hmacSha256 } from "../utils/hmac";
import type {
  TrackingAdapter,
  TrackingEventStatus,
  TrackingWebhookEvent,
  VerifyTrackingSignatureInput
} from "./tracking-adapter";

const STATUSES: TrackingEventStatus[] = ["IN_TRANSIT", "DELIVERED", "EXCEPTION"];

function safeHeader(headers: any, name: string) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function requireString(value: any, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return value.trim();
}

export class MockTrackingAdapter implements TrackingAdapter {
  provider: "mock" = "mock";

  verifyWebhookSignature({ canonicalBody, headers, secret }: VerifyTrackingSignatureInput) {
    const signature = safeHeader(headers, "x-tracking-signature");
    if (!signature || typeof signature !== "string") {
      return { ok: false, error: "missing_signature" } as const;
    }
    if (!secret) {
      return { ok: false, error: "missing_secret" } as const;
    }

    const expected = hmacSha256(secret, canonicalBody || "");
    const provided = signature.trim().toLowerCase();
    if (
      provided.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"))
    ) {
      return { ok: false, error: "invalid_signature" } as const;
    }
    return { ok: true } as const;
  }

  parseWebhookEvent(body: any): TrackingWebhookEvent {
    const status = requireString(body?.status, "status", 32).toUpperCase() as TrackingEventStatus;
    if (!STATUSES.includes(status)) {
      throw new Error("status is invalid");
    }

    const occurredAt = requireString(body?.occurred_at, "occurred_at", 64);
    const occurredMs = Date.parse(occurredAt);
    if (!Number.isFinite(occurredMs)) {
      throw new Error("occurred_at is invalid");
    }

    const location = typeof body?.location === "string" && body.location.trim() ? body.location.trim().slice(0, 120) : null;

    return {
      id: requireString(body?.id, "id", 128),
      carrier: requireString(body?.carrier, "carrier", 32),
      tracking_number: requireString(body?.tracking_number, "tracking_number", 64),
      status,
      occurred_at: new Date(occurredMs).toISOString(),
      location
    };
  }
}
