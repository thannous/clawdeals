export type TrackingProvider = "mock";

export type TrackingEventStatus = "IN_TRANSIT" | "DELIVERED" | "EXCEPTION";

export type TrackingWebhookEvent = {
  id: string;
  carrier: string;
  tracking_number: string;
  status: TrackingEventStatus;
  occurred_at: string;
  location: string | null;
};

export type VerifyTrackingSignatureInput = {
  canonicalBody: string;
  headers: any;
  secret: string;
};

export type VerifyTrackingSignatureResult = { ok: true } | { ok: false; error: string };

// A tracking provider reports where a parcel is. It says nothing about what
// the parcel contained, so no adapter method resolves a dispute.
export interface TrackingAdapter {
  provider: TrackingProvider;
  verifyWebhookSignature(input: VerifyTrackingSignatureInput): VerifyTrackingSignatureResult;
  parseWebhookEvent(body: any): TrackingWebhookEvent;
}
