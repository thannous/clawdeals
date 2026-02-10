import { isUuid } from "../../utils/validators";

function toBase36(n: number) {
  return Math.trunc(n).toString(36);
}

function fromBase36(raw: string) {
  if (!raw) return null;
  const n = Number.parseInt(raw, 36);
  if (!Number.isFinite(n)) return null;
  return n;
}

function stripUuidHyphens(uuid: string) {
  return uuid.toLowerCase().replace(/-/g, "");
}

function insertUuidHyphens(uuid32: string) {
  const s = uuid32.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(s)) return null;
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function parseEpochMicros(createdAt: string | Date) {
  if (createdAt instanceof Date) {
    const ms = createdAt.getTime();
    return Number.isFinite(ms) ? ms * 1000 : null;
  }

  const raw = String(createdAt || "").trim();
  if (!raw) return null;

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;

  // Preserve up to 6 fractional digits when present (Postgres timestamptz is microsecond resolution).
  // JS Date.parse() only keeps milliseconds, so we manually recover the last 3 digits.
  const fracMatch = raw.match(/\.(\d{1,6})/);
  const frac = fracMatch?.[1] || "";
  const padded = frac.padEnd(6, "0").slice(0, 6);
  const microsRemainder = padded.length === 6 ? Number.parseInt(padded.slice(3), 10) : 0;
  if (!Number.isFinite(microsRemainder) || microsRemainder < 0 || microsRemainder > 999) return null;

  return ms * 1000 + microsRemainder;
}

function formatIsoWithMicros(epochMicros: number) {
  const us = Math.trunc(epochMicros);
  const ms = Math.floor(us / 1000);
  const rem = us - ms * 1000;
  const iso = new Date(ms).toISOString(); // always ends with ".sssZ"
  const suffix = String(rem).padStart(3, "0");
  return iso.replace(/\.(\d{3})Z$/, (_m, ms3) => `.${ms3}${suffix}Z`);
}

// Compact cursor token for Telegram callback_data (64 bytes max).
// Format: "<ts36_us>.<uuid32>" where uuid32 has no hyphens.
export function encodeApprovalsCursorToken({
  createdAt,
  approvalId
}: {
  createdAt: string | Date;
  approvalId: string;
}): string | null {
  if (!createdAt || !approvalId) return null;
  if (!isUuid(approvalId)) return null;

  const epochMicros = parseEpochMicros(createdAt);
  if (epochMicros === null) return null;

  const ts = toBase36(epochMicros);
  const id = stripUuidHyphens(approvalId);
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  return `${ts}.${id}`;
}

export function decodeApprovalsCursorToken(
  token: unknown
): { value: { created_at: string; approval_id: string } } | { error: string } | null {
  if (!token || typeof token !== "string") return null;
  const raw = token.trim();
  if (!raw) return null;

  const dot = raw.indexOf(".");
  if (dot === -1) return { error: "Invalid cursor" };
  const tsPart = raw.slice(0, dot).trim();
  const idPart = raw.slice(dot + 1).trim();
  if (!tsPart || !idPart) return { error: "Invalid cursor" };

  const epochMicros = fromBase36(tsPart);
  if (epochMicros === null) return { error: "Invalid cursor" };
  if (!Number.isFinite(epochMicros) || epochMicros < 0) return { error: "Invalid cursor" };

  const approvalId = insertUuidHyphens(idPart);
  if (!approvalId || !isUuid(approvalId)) return { error: "Invalid cursor" };

  return {
    value: {
      created_at: formatIsoWithMicros(epochMicros),
      approval_id: approvalId
    }
  };
}
