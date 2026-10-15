import { z } from "zod";
import { buyMissionZodSchema } from "../../webmcp/tools/mission-tools";
import type { BuyMissionInput } from "../webmcp/BuyMissionPanel";
import { missionPayload } from "./missionClient";

export type PendingMissionRequest = { fingerprint: string; key: string; input: BuyMissionInput; ownerId: string; draftSource?: string };
const LEGACY_KEY = "clawdeals:buy-mission-request:v1";
const ownerKey = (ownerId: string) => `clawdeals:buy-mission-request:v2:${ownerId}`;
// Creation's relative expiry checks do not apply to an already-sent request.
// The server can replay its cached result even after the mission has expired.
const inputSchema = z.object(buyMissionZodSchema.shape).strict().refine(input =>
  input.autonomous_actions.includes("search") &&
  (input.preferred_price_max === undefined || input.preferred_price_max <= input.hard_budget_max));

function parse(raw: string | null): PendingMissionRequest | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    const input = inputSchema.safeParse(saved?.input);
    if (!z.string().uuid().safeParse(saved?.ownerId).success || typeof saved?.key !== "string" || !saved.key ||
      (saved.draftSource !== undefined && (typeof saved.draftSource !== "string" || !saved.draftSource)) ||
      !input.success || saved.fingerprint !== JSON.stringify(missionPayload(input.data))) return null;
    return saved;
  } catch { return null; }
}

export function readMissionRequest(ownerId: string): PendingMissionRequest | null {
  const raw = sessionStorage.getItem(ownerKey(ownerId));
  const saved = parse(raw);
  if (raw && (!saved || saved.ownerId !== ownerId)) throw new Error("Invalid recovery state");
  const legacy = parse(sessionStorage.getItem(LEGACY_KEY));
  const ownedLegacy = legacy?.ownerId === ownerId ? legacy : null;
  if (saved && ownedLegacy && (saved.key !== ownedLegacy.key || saved.fingerprint !== ownedLegacy.fingerprint)) {
    throw new Error("Conflicting recovery state");
  }
  if (saved) return saved;
  if (!ownedLegacy) return null;
  // Keep the legacy copy until a confirmed result. Its missing draftSource
  // stays unknown; an unrelated current URL cannot supply that provenance.
  const serialized = JSON.stringify(ownedLegacy);
  sessionStorage.setItem(ownerKey(ownerId), serialized);
  if (sessionStorage.getItem(ownerKey(ownerId)) !== serialized) throw new Error("Recovery storage unavailable");
  return ownedLegacy;
}

export function writeMissionRequest(request: PendingMissionRequest): boolean {
  try {
    const prior = readMissionRequest(request.ownerId);
    if (prior && (prior.key !== request.key || prior.fingerprint !== request.fingerprint || prior.draftSource !== request.draftSource)) return false;
    const saved = JSON.stringify(request);
    if (!parse(saved)) return false;
    sessionStorage.setItem(ownerKey(request.ownerId), saved);
    return sessionStorage.getItem(ownerKey(request.ownerId)) === saved;
  } catch { return false; }
}

export function clearMissionRequest(request: PendingMissionRequest): boolean {
  try {
    for (const key of [ownerKey(request.ownerId), LEGACY_KEY]) {
      const saved = parse(sessionStorage.getItem(key));
      if (saved?.ownerId === request.ownerId && saved.key === request.key && saved.fingerprint === request.fingerprint) {
        sessionStorage.removeItem(key);
        if (sessionStorage.getItem(key) !== null) return false;
      }
    }
    return true;
  } catch { return false; }
}
