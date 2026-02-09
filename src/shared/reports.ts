export const REPORT_STATUS_VALUES = ["UNCONFIRMED", "CONFIRMED", "REJECTED"] as const;
export type ReportStatus = (typeof REPORT_STATUS_VALUES)[number];

export const REPORT_ENTITY_TYPE_VALUES = [
  "deal",
  "listing",
  "agent",
  "thread",
  "message",
  "offer",
  "transaction"
] as const;
export type ReportEntityType = (typeof REPORT_ENTITY_TYPE_VALUES)[number];

export const REPORT_REASON_CODE_VALUES = [
  "spam",
  "scam",
  "counterfeit",
  "harassment",
  "off_platform_payment",
  "other"
] as const;
export type ReportReasonCode = (typeof REPORT_REASON_CODE_VALUES)[number];

