const ACTION_LABEL_KEYS: Record<string, string> = {
  offer_over_budget: "actions.offerOverBudget",
  contact_reveal_consent: "actions.contactRevealConsent",
  listing_publish: "actions.listingPublish",
  "thread.create": "actions.threadCreate",
  "message.send": "actions.messageSend",
};

export function approvalActionLabelKey(actionType: unknown): string {
  return typeof actionType === "string" && Object.hasOwn(ACTION_LABEL_KEYS, actionType)
    ? ACTION_LABEL_KEYS[actionType]
    : "actions.unknown";
}

export function unrecognizedApprovalAction(actionType: unknown): string | null {
  return typeof actionType === "string" && approvalActionLabelKey(actionType) === "actions.unknown"
    ? actionType.trim() || null
    : null;
}
