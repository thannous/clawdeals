export function trackThreadsViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] threads.viewed", params);
}

export function trackThreadDetailViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] thread.detail_viewed", params);
}

export function trackThreadsFilterChanged(params: Record<string, unknown>) {
  console.debug("[telemetry] threads.filter_changed", params);
}
