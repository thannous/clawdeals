export function trackApprovalsViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] approvals.viewed", params);
}

export function trackApprovalDetailViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] approval.detail_viewed", params);
}

export function trackApprovalsFilterChanged(params: Record<string, unknown>) {
  console.debug("[telemetry] approvals.filter_changed", params);
}

export function trackApprovalAction(params: Record<string, unknown>) {
  console.debug("[telemetry] approval.action", params);
}
