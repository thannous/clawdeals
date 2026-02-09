export function trackModerationViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] moderation.viewed", params);
}

export function trackModerationFilterChanged(params: Record<string, unknown>) {
  console.debug("[telemetry] moderation.filter_changed", params);
}

export function trackModerationAction(params: Record<string, unknown>) {
  console.debug("[telemetry] moderation.action", params);
}
