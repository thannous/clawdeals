import { z } from "zod";

const DRAFT_KEY = "clawdeals:buy-mission-draft:v1";
const ANONYMOUS_KEY = "clawdeals:buy-mission-draft:v2:anonymous";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ownerDraftKey = (ownerId: string) => `clawdeals:buy-mission-draft:v2:${ownerId}`;
const sourceDraftKey = (source: string, ownerId: string | null) => `clawdeals:buy-mission-draft:v3:${ownerId || "anonymous"}:${encodeURIComponent(source)}`;

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

// Undefined means ownership is unknown, not anonymous. Unmarked v1 drafts
// cannot be attributed by a separate request: the old singleton could contain
// somebody else's later edits. Keep those bytes quarantined and untouched.
function draftOwner(saved: { ownerId?: unknown }, fallback: string | null | undefined): string | null | undefined {
  if (saved.ownerId === undefined) return fallback;
  return typeof saved.ownerId === "string" && saved.ownerId ? saved.ownerId : undefined;
}

function candidates(source: string, ownerId: string | null): Array<[string, string | null | undefined]> {
  return [
    ...(ownerId ? [[sourceDraftKey(source, ownerId), ownerId], [ownerDraftKey(ownerId), ownerId]] as Array<[string, string]> : []),
    [sourceDraftKey(source, null), null], [ANONYMOUS_KEY, null], [DRAFT_KEY, undefined]
  ];
}

export function readBuyMissionDraft(source: string, ownerId: string | null = null): BuyMissionDraft | null {
  try {
    const compatible: Array<{ key: string; owner: string | null; saved: { source: string; at: number; draft: BuyMissionDraft; ownerId?: string } }> = [];
    for (const [key, fallback] of candidates(source, ownerId)) {
      let saved;
      try { saved = JSON.parse(sessionStorage.getItem(key) || "null"); } catch { continue; }
      if (!saved) continue;
      const savedOwner = draftOwner(saved, fallback);
      if (savedOwner === undefined || (savedOwner !== null && savedOwner !== ownerId)) continue;
      if (saved.source !== source || typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) continue;
      const parsed = draftSchema.safeParse(saved.draft);
      if (parsed.success) compatible.push({ key, owner: savedOwner, saved: { ...saved, draft: parsed.data } });
    }
    // A new anonymous continuation can be newer than the returning owner's
    // saved copy. Never overwrite that new brief with the older owned draft.
    const latest = compatible.sort((a, b) => b.saved.at - a.saved.at)[0];
    if (!latest) return null;
    const destination = sourceDraftKey(source, latest.owner);
    // Migration preserves age and the fallback. Avoid replacing any existing
    // destination here; save handles claims and edits after restoration.
    if (latest.key !== destination && !sessionStorage.getItem(destination)) {
      try { sessionStorage.setItem(destination, JSON.stringify({ ...latest.saved, ...(latest.owner ? { ownerId: latest.owner } : {}) })); } catch {}
    }
    return latest.saved.draft;
  } catch { return null; }
}

export function saveBuyMissionDraft(source: string, draft: BuyMissionDraft, ownerId: string | null = null): boolean {
  try {
    // Claim only explicitly anonymous copies of this exact source. Never
    // rewrite or infer ownership of an unmarked v1 draft.
    if (ownerId) for (const [key, fallback] of candidates(source, null)) {
      const prior = JSON.parse(sessionStorage.getItem(key) || "null");
      if (prior?.source === source && draftOwner(prior, fallback) === null) {
        const claimed = JSON.stringify({ ...prior, ownerId });
        sessionStorage.setItem(key, claimed);
        if (sessionStorage.getItem(key) !== claimed) return false;
      }
    }
    const key = sourceDraftKey(source, ownerId);
    const prior = JSON.parse(sessionStorage.getItem(key) || "null");
    // A previous failed claim may still leave the owner's only copy in the
    // anonymous slot. Preserve it before starting new anonymous work here.
    if (!ownerId && prior?.ownerId && typeof prior.ownerId === "string") {
      const ownedKey = sourceDraftKey(source, prior.ownerId);
      if (!sessionStorage.getItem(ownedKey)) {
        const retained = JSON.stringify(prior);
        sessionStorage.setItem(ownedKey, retained);
        if (sessionStorage.getItem(ownedKey) !== retained) return false;
      }
    }
    const unchanged = prior?.source === source && draftOwner(prior, ownerId) === ownerId && JSON.stringify(prior.draft) === JSON.stringify(draft);
    const saved = JSON.stringify({ source, at: unchanged ? prior.at : Date.now(), draft, ...(ownerId ? { ownerId } : {}) });
    sessionStorage.setItem(key, saved);
    return sessionStorage.getItem(key) === saved;
  } catch { return false; }
}

export function clearBuyMissionDraft(source: string, ownerId: string | null = null) {
  try {
    for (const [key, fallback] of candidates(source, ownerId)) {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved?.source === source && draftOwner(saved, fallback) === ownerId) sessionStorage.removeItem(key);
    }
  } catch {
    // Retained copies stay isolated if storage is unavailable.
  }
}
