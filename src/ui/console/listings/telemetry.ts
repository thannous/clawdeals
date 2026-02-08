export function trackListingsViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] listings.viewed", params);
}

export function trackListingDetailViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] listing.detail_viewed", params);
}

export function trackListingsFilterChanged(params: Record<string, unknown>) {
  console.debug("[telemetry] listings.filter_changed", params);
}
