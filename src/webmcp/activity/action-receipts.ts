import { sanitizeToolOutput } from "../security/sanitize";
import { canonicalJsonStringify, randomUuid } from "../utils";

export const ACTION_RECEIPT_VERSION = "1" as const;
export const ACTION_RECEIPT_TOOL_VERSION = "2026-08-26";
export const ACTION_RECEIPT_STORAGE_KEY = "clawdeals:webmcp:action-receipts:v1";
export const ACTION_RECEIPT_MAX_ENTRIES = 50;

export type ActionReceiptActor = "public" | "agent" | "owner";
export type ActionReceiptConfirmation = "not_required" | "pending" | "approved" | "denied";
export type ActionReceiptOutcome = "pending" | "success" | "denied" | "unknown";

export type ActionReceipt = {
  receipt_version: typeof ACTION_RECEIPT_VERSION;
  receipt_id: string;
  request_id: string;
  tool: {
    name: string;
    version: string;
  };
  actor: ActionReceiptActor;
  arguments_summary: unknown;
  input_hash: string;
  policy: unknown;
  confirmation: ActionReceiptConfirmation;
  approval_ids: string[];
  outcome: ActionReceiptOutcome;
  best_effort_error: string | null;
  result: unknown;
  timestamp: string;
  link: string | null;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem"> &
  Partial<Pick<Storage, "removeItem">>;

type PendingReceiptInput = {
  requestId: string;
  toolName: string;
  toolVersion?: string;
  actor: ActionReceiptActor;
  args: unknown;
  policy: unknown;
  confirmation: ActionReceiptConfirmation;
  timestamp?: string;
  link?: string | null;
};

type FinalizeReceiptInput = {
  outcome: Exclude<ActionReceiptOutcome, "pending">;
  confirmation?: ActionReceiptConfirmation;
  approvalIds?: string[];
  result?: unknown;
  bestEffortError?: string | null;
  timestamp?: string;
  link?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function redactSecretStrings(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "[REDACTED]")
    .replace(/\bcd_(?:live|test|sandbox)_[A-Za-z0-9_-]+\b/gi, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, "[REDACTED]")
    .replace(/\bAKIA[A-Z0-9]{16}\b/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/([?&](?:access_token|api_key|authorization|code|key|secret|token)=)[^&#\s]+/gi, "$1[REDACTED]");
}

function compact(value: unknown, depth = 0): unknown {
  const sanitized = depth === 0 ? sanitizeToolOutput(value) : value;
  if (sanitized === null || sanitized === undefined) return sanitized ?? null;
  if (typeof sanitized === "string") {
    const redacted = redactSecretStrings(sanitized);
    return redacted.length > 240 ? `${redacted.slice(0, 237)}...` : redacted;
  }
  if (typeof sanitized === "number" || typeof sanitized === "boolean") return sanitized;
  if (depth >= 5) return "[Truncated]";
  if (Array.isArray(sanitized)) {
    const rows = sanitized.slice(0, 12).map((entry) => compact(entry, depth + 1));
    if (sanitized.length > 12) rows.push(`[+${sanitized.length - 12} more]`);
    return rows;
  }
  if (!isRecord(sanitized)) return String(sanitized);

  const out: Record<string, unknown> = {};
  const entries = Object.entries(sanitized).slice(0, 24);
  for (const [key, entry] of entries) out[key] = compact(entry, depth + 1);
  if (Object.keys(sanitized).length > entries.length) {
    out._truncated = `${Object.keys(sanitized).length - entries.length} field(s)`;
  }
  return out;
}

function safeIso(value?: string): string {
  const date = value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function safeReceiptLink(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    /[\u0000-\u001f\u007f]/.test(path) ||
    compact(path) !== path
  ) {
    return null;
  }
  return path.length <= 500 ? path : null;
}

function safeApprovalIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
    )
  ).slice(0, 20);
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function redactAndHashInput(args: unknown): Promise<{
  argumentsSummary: unknown;
  inputHash: string;
}> {
  const argumentsSummary = compact(args);
  return {
    argumentsSummary,
    inputHash: await sha256(canonicalJsonStringify(argumentsSummary))
  };
}

export function extractApprovalIds(value: unknown): string[] {
  const found: string[] = [];
  const visit = (entry: unknown, depth: number) => {
    if (depth > 6 || entry === null || entry === undefined) return;
    if (Array.isArray(entry)) {
      for (const item of entry.slice(0, 30)) visit(item, depth + 1);
      return;
    }
    if (!isRecord(entry)) return;
    for (const [key, child] of Object.entries(entry)) {
      if (key === "approval_id" && typeof child === "string") found.push(child);
      if (key === "approval_ids" && Array.isArray(child)) {
        for (const id of child) if (typeof id === "string") found.push(id);
      }
      visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return safeApprovalIds(found);
}

export function sanitizeActionReceipt(receipt: ActionReceipt): ActionReceipt {
  return {
    receipt_version: ACTION_RECEIPT_VERSION,
    receipt_id: String(compact(String(receipt.receipt_id || ""))).slice(0, 180),
    request_id: String(compact(String(receipt.request_id || ""))).slice(0, 180),
    tool: {
      name: String(compact(String(receipt.tool?.name || "unknown"))).slice(0, 128),
      version: String(compact(String(receipt.tool?.version || ACTION_RECEIPT_TOOL_VERSION))).slice(0, 64)
    },
    actor: ["public", "agent", "owner"].includes(receipt.actor) ? receipt.actor : "public",
    arguments_summary: compact(receipt.arguments_summary),
    input_hash: /^sha256:[a-f0-9]{64}$/i.test(String(receipt.input_hash || ""))
      ? String(receipt.input_hash).toLowerCase()
      : "sha256:unavailable",
    policy: compact(receipt.policy),
    confirmation: ["not_required", "pending", "approved", "denied"].includes(receipt.confirmation)
      ? receipt.confirmation
      : "not_required",
    approval_ids: safeApprovalIds(receipt.approval_ids),
    outcome: ["pending", "success", "denied", "unknown"].includes(receipt.outcome)
      ? receipt.outcome
      : "unknown",
    best_effort_error:
      typeof receipt.best_effort_error === "string"
        ? String(compact(receipt.best_effort_error)).slice(0, 240)
        : null,
    result: compact(receipt.result),
    timestamp: safeIso(receipt.timestamp),
    link: safeReceiptLink(receipt.link)
  };
}

export async function createPendingActionReceipt(input: PendingReceiptInput): Promise<ActionReceipt> {
  const hashed = await redactAndHashInput(input.args);
  return sanitizeActionReceipt({
    receipt_version: ACTION_RECEIPT_VERSION,
    receipt_id: `rcpt_${input.requestId || randomUuid()}`,
    request_id: input.requestId,
    tool: {
      name: input.toolName,
      version: input.toolVersion || ACTION_RECEIPT_TOOL_VERSION
    },
    actor: input.actor,
    arguments_summary: hashed.argumentsSummary,
    input_hash: hashed.inputHash,
    policy: input.policy,
    confirmation: input.confirmation,
    approval_ids: [],
    outcome: "pending",
    best_effort_error: null,
    result: { status: "pending" },
    timestamp: safeIso(input.timestamp),
    link: input.link ?? null
  });
}

export function finalizeActionReceipt(
  receipt: ActionReceipt,
  input: FinalizeReceiptInput
): ActionReceipt {
  return sanitizeActionReceipt({
    ...receipt,
    confirmation: input.confirmation ?? receipt.confirmation,
    approval_ids: input.approvalIds ?? receipt.approval_ids,
    outcome: input.outcome,
    best_effort_error: input.bestEffortError ?? receipt.best_effort_error,
    result: input.result ?? receipt.result,
    timestamp: safeIso(input.timestamp),
    link: input.link === undefined ? receipt.link : input.link
  });
}

function isStoredReceipt(value: unknown): value is ActionReceipt {
  if (!isRecord(value)) return false;
  return (
    value.receipt_version === ACTION_RECEIPT_VERSION &&
    typeof value.receipt_id === "string" &&
    typeof value.request_id === "string" &&
    isRecord(value.tool) &&
    typeof value.tool.name === "string" &&
    typeof value.timestamp === "string"
  );
}

export class ActionReceiptStore {
  private receipts: ActionReceipt[] = [];
  private readonly storage: StorageLike | null;
  private readonly storageKey: string;
  private readonly maxEntries: number;

  constructor(options: {
    storage?: StorageLike | null;
    storageKey?: string;
    maxEntries?: number;
  } = {}) {
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey || ACTION_RECEIPT_STORAGE_KEY;
    this.maxEntries = Math.max(1, options.maxEntries || ACTION_RECEIPT_MAX_ENTRIES);
    this.load();
  }

  private load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) return;
      if (raw.length > 1_000_000) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.receipts = parsed
        .filter(isStoredReceipt)
        .map((receipt) => sanitizeActionReceipt(receipt))
        .slice(0, this.maxEntries);
    } catch {
      this.receipts = [];
    }
  }

  list(): ActionReceipt[] {
    return this.receipts;
  }

  getByReceiptId(receiptId: string): ActionReceipt | null {
    return this.receipts.find((receipt) => receipt.receipt_id === receiptId) || null;
  }

  getByRequestId(requestId: string): ActionReceipt | null {
    return this.receipts.find((receipt) => receipt.request_id === requestId) || null;
  }

  upsert(receipt: ActionReceipt): ActionReceipt {
    const safe = sanitizeActionReceipt(receipt);
    const withoutCurrent = this.receipts.filter(
      (entry) => entry.receipt_id !== safe.receipt_id && entry.request_id !== safe.request_id
    );
    this.receipts = [safe, ...withoutCurrent].slice(0, this.maxEntries);

    if (!this.storage) {
      const fallback = sanitizeActionReceipt({ ...safe, best_effort_error: "receipt_storage_unavailable" });
      this.receipts = [fallback, ...withoutCurrent].slice(0, this.maxEntries);
      return fallback;
    }

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.receipts));
      return safe;
    } catch {
      const fallback = sanitizeActionReceipt({ ...safe, best_effort_error: "receipt_storage_write_failed" });
      this.receipts = [fallback, ...withoutCurrent].slice(0, this.maxEntries);
      return fallback;
    }
  }

  clear(): boolean {
    this.receipts = [];
    if (!this.storage) return false;
    try {
      if (this.storage.removeItem) {
        this.storage.removeItem(this.storageKey);
      } else {
        this.storage.setItem(this.storageKey, "[]");
      }
      return true;
    } catch {
      return false;
    }
  }
}

export function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
