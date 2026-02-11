export const RISK_SIGNAL_TYPE_VALUES = [
  "rate_limit_triggers",
  "duplicates_detected",
  "disputes_opened"
] as const;

export type RiskSignalType = (typeof RISK_SIGNAL_TYPE_VALUES)[number];

export const RISK_FLAG_VALUES = ["noisy_client", "under_review", "restricted"] as const;

export type RiskFlag = (typeof RISK_FLAG_VALUES)[number];

