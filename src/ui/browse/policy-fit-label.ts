import type { ListingPolicyFit } from "../../webmcp/ui-bridge";

export type PolicyFitBadge = {
  label: string;
  tone: "fit" | "warn" | "reject";
  details: string[];
};

const ISSUE_LABELS: Record<string, string> = {
  over_hard_budget: "Over hard budget",
  over_preferred_price: "Above preferred price",
  requirements_unverified: "Requirements to confirm",
  battery_below_requirement: "Battery too low",
  battery_health_below_requirement: "Battery too low",
  out_of_radius: "Out of radius"
};

function humanizeIssue(issue: string): string {
  return ISSUE_LABELS[issue] || issue.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Turns the agent-facing `policy_fit` verdict into the badge the human sees on the same card.
 * The first blocking issue wins; soft issues (preferred price, unverified requirements) stay eligible.
 */
export function describePolicyFit(fit: ListingPolicyFit): PolicyFitBadge {
  const details = fit.issues.map(humanizeIssue);
  if (!fit.eligible) {
    const blocking = fit.issues.find((issue) => issue !== "requirements_unverified" && issue !== "over_preferred_price");
    return { label: blocking ? humanizeIssue(blocking) : "Outside mission", tone: "reject", details };
  }
  if (fit.issues.includes("over_preferred_price")) {
    return { label: "Above preferred price", tone: "warn", details };
  }
  if (fit.issues.includes("requirements_unverified")) {
    return { label: "Fits · confirm requirements", tone: "fit", details };
  }
  if (fit.issues.length > 0) {
    return { label: humanizeIssue(fit.issues[0]), tone: "warn", details };
  }
  return { label: "Fits mission", tone: "fit", details };
}
