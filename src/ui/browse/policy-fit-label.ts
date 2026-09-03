import type { ListingPolicyFit } from "../../webmcp/ui-bridge";

export type PolicyFitBadge = {
  labelKey: string;
  labelValues?: Record<string, string | number>;
  tone: "fit" | "warn" | "reject";
  details: Array<{ key: string; values?: Record<string, string | number> }>;
};

const ISSUE_LABELS: Record<string, string> = {
  over_hard_budget: "policyFit.issues.overHardBudget",
  over_preferred_price: "policyFit.issues.overPreferredPrice",
  requirements_unverified: "policyFit.issues.requirementsUnverified",
  battery_below_requirement: "policyFit.issues.batteryTooLow",
  battery_health_below_requirement: "policyFit.issues.batteryTooLow",
  out_of_radius: "policyFit.issues.outOfRadius"
};

function describeIssue(issue: string): { key: string; values?: Record<string, string> } {
  const knownKey = ISSUE_LABELS[issue];
  return knownKey
    ? { key: knownKey }
    : { key: "policyFit.issues.unknown", values: { issue: issue.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) } };
}

/**
 * Turns the agent-facing `policy_fit` verdict into the badge the human sees on the same card.
 * The first blocking issue wins; soft issues (preferred price, unverified requirements) stay eligible.
 */
export function describePolicyFit(fit: ListingPolicyFit): PolicyFitBadge {
  const details = fit.issues.map(describeIssue);
  if (!fit.eligible) {
    const blocking = fit.issues.find((issue) => issue !== "requirements_unverified" && issue !== "over_preferred_price");
    const label = blocking ? describeIssue(blocking) : { key: "policyFit.outsideMission" };
    return { labelKey: label.key, labelValues: label.values, tone: "reject", details };
  }
  if (fit.issues.includes("over_preferred_price")) {
    return { labelKey: "policyFit.abovePreferredPrice", tone: "warn", details };
  }
  if (fit.issues.includes("requirements_unverified")) {
    return { labelKey: "policyFit.fitsConfirm", tone: "fit", details };
  }
  if (fit.issues.length > 0) {
    const label = describeIssue(fit.issues[0]);
    return { labelKey: label.key, labelValues: label.values, tone: "warn", details };
  }
  return { labelKey: "policyFit.fits", tone: "fit", details };
}
