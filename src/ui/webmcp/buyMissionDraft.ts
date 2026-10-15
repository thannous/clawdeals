import { z } from "zod";

const DRAFT_KEY = "clawdeals:buy-mission-draft:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
export function readBuyMissionDraft(source: string): BuyMissionDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.source !== source || typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) return null;
    const parsed = draftSchema.safeParse(saved.draft);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveBuyMissionDraft(source: string, draft: BuyMissionDraft): boolean {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ source, at: Date.now(), draft }));
    return true;
  } catch {
    return false;
  }
}

export function clearBuyMissionDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nothing is persisted when storage is unavailable.
  }
}
