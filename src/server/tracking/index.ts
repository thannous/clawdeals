import { MockTrackingAdapter } from "./mock-tracking-adapter";
import type { TrackingAdapter } from "./tracking-adapter";

export const TRACKING_WEBHOOK_SECRET_ENV = "TRACKING_WEBHOOK_SECRET";

// Only the mock provider exists; a real carrier aggregator replaces it here.
export function createTrackingAdapter(): TrackingAdapter {
  return new MockTrackingAdapter();
}

export function getTrackingWebhookSecret() {
  const value = process.env[TRACKING_WEBHOOK_SECRET_ENV];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
