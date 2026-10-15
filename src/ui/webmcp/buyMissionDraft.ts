import { z } from "zod";
import { legacyMissionRequestOwner } from "../my-missions/missionRequestRecovery";

const DRAFT_KEY = "clawdeals:buy-mission-draft:v1";
const ANONYMOUS_KEY = "clawdeals:buy-mission-draft:v2:anonymous";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ownerDraftKey = (ownerId: string) => `clawdeals:buy-mission-draft:v2:${ownerId}`;

const draftSchema = z.object({
  query: z.string().max(80),
  marketCode: z.enum(["FR", "GB", "ES"]),
  cityPreset: z.string().max(30),
  locationLabel: z.string().max(80),
  latitude: z.string().max(30),
  longitude: z.string().max(30),
  radiusKm: z.string().max(10),
  preferredPriceMax: z.string().max(30),
  hardBudgetMax: z.string().max(30),
  requirements: z.string().max(1210),
  autonomousActions: z.array(z.enum(["search", "ask_question", "make_offer"])).max(3),
  expiresAt: z.string().max(30)
});

export type BuyMissionDraft = z.infer<typeof draftSchema>;

export function missionDraftSource(query: Record<string, string | string[] | undefined>): string {
  const one = (name: string) => Array.isArray(query[name]) ? query[name][0] : query[name];
  return one("from") ? `mission:${one("from")}`
    : one("listing") ? `listing:${JSON.stringify([one("listing"), one("price"), one("market"), one("lat"), one("lng")])}`
      : `search:${JSON.stringify([one("query") || "", one("price_max") || ""])}`;
}

// Called with the already validated local auth return URL. Match the same
// source as NewMissionPage, so an unrelated draft does not hide recovery help.
export function missionDraftSourceFromUrl(next: string): string | null {
  const url = new URL(next, "http://localhost");
  if (!/^\/(?:(?:en|fr|es)\/)?my\/missions\/new\/?$/.test(url.pathname)) return null;
  const query = Object.fromEntries([...url.searchParams.keys()].map(key => [key, url.searchParams.get(key) || ""]));
  return missionDraftSource(query);
}

// Tab-scoped storage survives sign-in redirects without putting a private brief
// in URLs or keeping it indefinitely on a shared computer.
function draftOwner(saved: { ownerId?: string } | null, key: string): string | null {
  return saved?.ownerId || (key === DRAFT_KEY ? legacyMissionRequestOwner() : null);
}

export function readBuyMissionDraft(source: string, ownerId: string | null = null): BuyMissionDraft | null {
  try {
    const keys = [...(ownerId ? [ownerDraftKey(ownerId)] : []), ANONYMOUS_KEY, DRAFT_KEY];
    for (const key of keys) {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!saved) continue;
      const savedOwner = draftOwner(saved, key);
      if (savedOwner && savedOwner !== ownerId) continue;
      if (saved.source !== source || typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) continue;
      const parsed = draftSchema.safeParse(saved.draft);
      if (parsed.success) return parsed.data;
    }
    return null;
  } catch { return null; }
}

// A legacy request is the only trustworthy owner evidence for an unmarked v1
// draft. Persist that evidence before the request can be cleared after a refusal.
export function claimLegacyBuyMissionDraft(ownerId: string): boolean {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
    if (!saved || saved.ownerId || legacyMissionRequestOwner() !== ownerId) return true;
    const claimed = JSON.stringify({ ...saved, ownerId });
    sessionStorage.setItem(DRAFT_KEY, claimed);
    return sessionStorage.getItem(DRAFT_KEY) === claimed;
  } catch { return false; }
}

export function saveBuyMissionDraft(source: string, draft: BuyMissionDraft, ownerId: string | null = null): boolean {
  try {
    // Attribute old anonymous copies before writing the owner's copy. A failed
    // removal must never make private edits available to a different account.
    if (ownerId) for (const key of [ANONYMOUS_KEY, DRAFT_KEY]) {
      const prior = JSON.parse(sessionStorage.getItem(key) || "null");
      const priorOwner = draftOwner(prior, key);
      if (prior?.source === source && (!priorOwner || priorOwner === ownerId)) {
        const claimed = JSON.stringify({ ...prior, ownerId });
        sessionStorage.setItem(key, claimed);
        if (sessionStorage.getItem(key) !== claimed) return false;
      }
    }
    // Anonymous work has its own slot: signing out must not overwrite an
    // unresolved legacy request/draft belonging to the previous account.
    const key = ownerId ? ownerDraftKey(ownerId) : ANONYMOUS_KEY;
    const saved = JSON.stringify({ source, at: Date.now(), draft, ...(ownerId ? { ownerId } : {}) });
    sessionStorage.setItem(key, saved);
    return sessionStorage.getItem(key) === saved;
  } catch { return false; }
}

export function clearBuyMissionDraft(ownerId: string | null = null) {
  try {
    if (ownerId) sessionStorage.removeItem(ownerDraftKey(ownerId));
    for (const key of [ANONYMOUS_KEY, DRAFT_KEY]) {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (draftOwner(saved, key) === ownerId) sessionStorage.removeItem(key);
    }
  } catch {
    // A retained owner-scoped draft remains isolated if storage is unavailable.
  }
}
