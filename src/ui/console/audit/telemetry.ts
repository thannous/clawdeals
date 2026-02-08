export function trackAuditViewed(params: Record<string, unknown>) {
  console.debug("[telemetry] console.audit.viewed", params);
}

export function trackAuditFilterApplied(params: Record<string, unknown>) {
  console.debug("[telemetry] console.audit.filter_applied", params);
}

export function trackAuditExportRequested(params: Record<string, unknown>) {
  console.debug("[telemetry] console.audit.export_requested", params);
}

export function trackAuditExportSuccess(params: Record<string, unknown>) {
  console.debug("[telemetry] console.audit.export_success", params);
}

export function trackAuditExportError(params: Record<string, unknown>) {
  console.debug("[telemetry] console.audit.export_error", params);
}

export function trackAuditError(params: Record<string, unknown>) {
  console.debug("[telemetry] console.audit.error", params);
}
