export type ApprovalAction = "approve" | "deny" | "revoke";
export type ApprovalActionInput = { note?: string; amount?: number };
export type ApprovalAttempt = { action: ApprovalAction; body: string; key: string };
export type ApprovalRecovery = {
  ownerId: string;
  approvalId: string;
  amount?: string;
  pending?: ApprovalAttempt;
};

function storageKey(ownerId: string, approvalId: string) {
  return `clawdeals:approval-recovery:v1:${ownerId}:${approvalId}`;
}

// Recovery stays in the original tab and is never exposed in a URL or shared
// between accounts. The server remains authoritative for ownership and policy.
export function readApprovalRecovery(ownerId: string, approvalId: string): ApprovalRecovery | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(ownerId, approvalId)) || "null");
    if (!value || value.ownerId !== ownerId || value.approvalId !== approvalId) return null;
    if (value.amount !== undefined && (typeof value.amount !== "string" || value.amount.length > 32)) return null;
    if (value.pending) {
      const { action, body, key } = value.pending;
      if (!["approve", "deny", "revoke"].includes(action) || typeof key !== "string" || !key || key.length > 200 || typeof body !== "string" || body.length > 2_000) return null;
      const input = JSON.parse(body);
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(field => !["amount", "note"].includes(field))) return null;
      if (input.note !== undefined && (typeof input.note !== "string" || input.note.length > 400)) return null;
      if (input.amount !== undefined && (action !== "approve" || !Number.isSafeInteger(input.amount) || input.amount < 0 || input.amount > 2_147_483_647)) return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeApprovalRecovery(value: ApprovalRecovery): boolean {
  try {
    const key = storageKey(value.ownerId, value.approvalId);
    const serialized = JSON.stringify(value);
    sessionStorage.setItem(key, serialized);
    return sessionStorage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

export function clearApprovalRecovery(ownerId: string, approvalId: string) {
  try { sessionStorage.removeItem(storageKey(ownerId, approvalId)); } catch { /* Safe to replay the same request if removal fails. */ }
}
