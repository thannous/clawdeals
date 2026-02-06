// TODO: Replace with real analytics (PostHog, Mixpanel, etc.)
export function trackDealsViewed({ sort, statuses, tags, q, pageSize } = {}) {
  console.debug("[telemetry] deals.viewed", { sort, statuses, tags, q, pageSize });
}
