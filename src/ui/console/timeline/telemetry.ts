export function trackTimelineViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] console.timeline.viewed", params);
}

export function trackTimelineSearched(params: Record<string, unknown>) {
  console.debug("[telemetry] console.timeline.searched", params);
}

export function trackTimelineReplayViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] console.timeline.replay_viewed", params);
}
