// TODO: Replace with real analytics (PostHog, Mixpanel, etc.)
export function trackDealsViewed({ sort, statuses, tags, q, pageSize } = {}) {
  console.debug("[telemetry] deals.viewed", { sort, statuses, tags, q, pageSize });
}

export function trackDealViewed({ dealId } = {}) {
  console.debug("[telemetry] deal.viewed", { dealId });
}

export function trackDealCommentCreated({ dealId } = {}) {
  console.debug("[telemetry] deal.comment_created", { dealId });
}
