export function trackReportsViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] reports.viewed", params);
}

export function trackReportsFilterChanged(params: Record<string, unknown>) {
  console.debug("[telemetry] reports.filter_changed", params);
}

export function trackReportAction(params: Record<string, unknown>) {
  console.debug("[telemetry] report.action", params);
}

export function trackReportBulkAction(params: Record<string, unknown>) {
  console.debug("[telemetry] report.bulk_action", params);
}
