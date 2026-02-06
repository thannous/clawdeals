// TODO: Replace with real analytics (PostHog, Mixpanel, etc.)
type TrackDealsViewedParams = {
  sort?: string;
  statuses?: string[];
  tags?: string[];
  q?: string;
  pageSize?: number;
};

type TrackDealViewedParams = {
  dealId?: string;
};

export function trackDealsViewed({ sort, statuses, tags, q, pageSize }: TrackDealsViewedParams = {}) {
  console.debug("[telemetry] deals.viewed", { sort, statuses, tags, q, pageSize });
}

export function trackDealViewed({ dealId }: TrackDealViewedParams = {}) {
  console.debug("[telemetry] deal.viewed", { dealId });
}

export function trackDealCommentCreated({ dealId }: TrackDealViewedParams = {}) {
  console.debug("[telemetry] deal.comment_created", { dealId });
}
