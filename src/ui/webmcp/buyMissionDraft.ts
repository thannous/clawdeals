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
