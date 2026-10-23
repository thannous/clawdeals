import {
  PROJECT_SLOTS,
  projectBriefSchema,
  projectCandidateSchema,
  requiredProjectSlots,
  type ProjectBrief,
  type ProjectCandidate,
  type ProjectCheck,
  type ProjectConfiguration,
  type ProjectPlan,
  type ProjectSellerGroup,
  type ProjectSlot,
  type ProjectVariant
} from "./types";

const CANDIDATES_PER_SLOT = 8;
const MAX_CATALOGUE_CANDIDATES = 250;
const SLOT_NAMES: Record<ProjectSlot, string> = {
  desk: "bureau", chair: "chaise", monitor: "écran", lamp: "lampe", keyboard: "clavier"
};

export function projectTodayInParis(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid project planning date");
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function projectPickupExpired(brief: Pick<ProjectBrief, "pickup_by">, now: Date = new Date()): boolean {
  return brief.pickup_by < projectTodayInParis(now);
}

/** Collision-free canonical identity for server revalidation, not an authorization token. */
export function canonicalProjectSnapshot(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalProjectSnapshot).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
      .map(key => `${JSON.stringify(key)}:${canonicalProjectSnapshot((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function candidateKey(candidate: ProjectCandidate) {
  return `${candidate.listing_id}:${candidate.slot}`;
}

export function projectCandidatePriceCents(candidate: ProjectCandidate): number {
  const quote = candidate.facts?.quoted_price_cents;
  const fresh = candidate.facts && Date.parse(candidate.facts.confirmed_at) >= Date.parse(candidate.updated_at);
  return fresh && quote != null ? quote : candidate.price_cents;
}

function totalKnown(candidate: ProjectCandidate) {
  return projectCandidatePriceCents(candidate) + (candidate.facts?.delivery_fee_cents ?? 0);
}

function pickupConfirmed(candidate: ProjectCandidate, brief: ProjectBrief) {
  return (candidate.delivery_method === "PICKUP" || candidate.delivery_method === "BOTH") &&
    Boolean(candidate.facts?.pickup_available_by && candidate.facts.pickup_available_by <= brief.pickup_by);
}

function pickupImpossible(candidate: ProjectCandidate, brief: ProjectBrief) {
  return candidate.delivery_method === "SHIPPING" ||
    Boolean(candidate.facts?.pickup_available_by && candidate.facts.pickup_available_by > brief.pickup_by);
}

function exclusionReason(candidate: ProjectCandidate, brief: ProjectBrief): string | null {
  if (candidate.status !== "LIVE") return "not_live";
  if (candidate.market_code !== brief.market_code || candidate.currency !== brief.currency) return "market_or_currency";
  if (candidate.distance_km === null) return "distance_unknown";
  if (candidate.distance_km > brief.location.radius_km) return "outside_radius";
  if (totalKnown(candidate) > brief.budget_cents) return "over_budget";
  if ((candidate.delivery_method === "PICKUP" || candidate.delivery_method === "BOTH") &&
    candidate.facts?.pickup_available_by && candidate.facts.pickup_available_by > brief.pickup_by) return "pickup_after_deadline";
  if (candidate.slot === "desk" && candidate.facts &&
    ((candidate.facts.desk_width_cm != null && candidate.facts.desk_width_cm > brief.desk_max_width_cm) ||
      (candidate.facts.desk_depth_cm != null && candidate.facts.desk_depth_cm > brief.desk_max_depth_cm))) return "desk_too_large";
  if (candidate.slot === "monitor" && candidate.facts?.connectors?.length &&
    !candidate.facts.connectors.includes(brief.laptop_connector)) return "connector_incompatible";
  return null;
}

export function projectCandidateChecks(candidate: ProjectCandidate, brief: ProjectBrief, variant: ProjectVariant, pickupExpired = projectPickupExpired(brief)): ProjectCheck[] {
  const checks: ProjectCheck[] = [];
  const add = (code: ProjectCheck["code"], confirmed: boolean, confirmedMessage: string, unknownMessage: string) => {
    checks.push({ code, status: confirmed ? "confirmed" : "unknown", listing_id: candidate.listing_id,
      message: confirmed ? confirmedMessage : unknownMessage });
  };
  add("fees", candidate.facts?.delivery_fee_cents != null,
    "Frais renseignés par vous.", "Frais de livraison ou de retrait à préciser ; le total reste incomplet.");
  add("delivery_method", candidate.delivery_method !== null,
    "Mode de remise indiqué dans l’annonce.", "Mode de remise à confirmer.");
  if (candidate.slot === "desk") {
    const width = candidate.facts?.desk_width_cm;
    const depth = candidate.facts?.desk_depth_cm;
    add("desk_dimensions", width != null && depth != null && width <= brief.desk_max_width_cm && depth <= brief.desk_max_depth_cm,
      "Dimensions renseignées par vous compatibles avec la place disponible.", "Largeur et profondeur du bureau à confirmer.");
  }
  if (candidate.slot === "monitor") {
    const videoCompatible = Boolean(candidate.facts?.connectors?.includes(brief.laptop_connector)) &&
      (brief.laptop_connector !== "USB_C" || candidate.facts?.video_verified === true);
    add("monitor_connector", videoCompatible,
      "Connectique renseignée par vous compatible avec votre ordinateur.", brief.laptop_connector === "USB_C"
        ? "Liaison vidéo USB-C avec votre ordinateur, câble compris, à vérifier."
        : `Entrée vidéo ${brief.laptop_connector} de l’écran à confirmer.`);
  }
  if (pickupExpired || variant === "weekend" || candidate.delivery_method === "PICKUP" || candidate.delivery_method === "BOTH") {
    add("pickup_date", !pickupExpired && pickupConfirmed(candidate, brief),
      "Retrait avant la date souhaitée renseigné par vous.", pickupExpired
        ? "La date de retrait souhaitée est passée. Actualisez la date du projet avant toute validation ou prise de contact."
        : `Possibilité de retrait au plus tard le ${brief.pickup_by} à confirmer.`);
  }
  return checks;
}

export function projectSellerGroups(items: ProjectCandidate[], checks: ProjectCheck[]): ProjectSellerGroup[] {
  const sellers = new Map<string, ProjectCandidate[]>();
  for (const candidate of items) sellers.set(candidate.seller_agent_id, [...(sellers.get(candidate.seller_agent_id) || []), candidate]);
  return [...sellers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sellerAgentId, candidates]) => {
    const unknown = checks.filter(check => candidates.some(candidate => candidate.listing_id === check.listing_id) && check.status === "unknown");
    const questions = ["Ces articles sont-ils disponibles ? Quel serait votre meilleur prix sans engagement ?"];
    if (unknown.some(check => check.code === "fees")) questions.push("Quels sont les frais exacts de livraison ou de retrait ?");
    if (unknown.some(check => check.code === "desk_dimensions")) questions.push("Pour le bureau : largeur et profondeur exactes en cm ?");
    if (unknown.some(check => check.code === "monitor_connector")) questions.push("Pour l’écran : entrées vidéo et câble inclus ? En USB-C, la vidéo fonctionne-t-elle avec mon ordinateur et ce câble ?");
    if (unknown.some(check => check.code === "delivery_method")) questions.push("Proposez-vous le retrait, la livraison, ou les deux ?");
    const pickupDate = unknown.find(check => check.code === "pickup_date")?.message.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    if (pickupDate) questions.push(`Le retrait est-il possible au plus tard le ${pickupDate} ?`);
    const intro = "Bonjour, je me renseigne sur :";
    const end = "Demande de renseignements uniquement, sans offre d’achat ni réservation.";
    const body = questions.map(question => `• ${question}`).join("\n");
    // Typed marketplace questions allow 800 characters. Allocate the remaining
    // space to titles, preserving every question and the non-binding boundary.
    const titleBudget = Math.max(0, 800 - intro.length - body.length - end.length - 3 - candidates.length * 3);
    const maxTitle = Math.min(40, Math.floor(titleBudget / candidates.length));
    const titles = candidates.map(candidate => {
      const title = candidate.title.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
      const short = title.length <= maxTitle ? title : `${title.slice(0, Math.max(0, maxTitle - 1))}…`;
      return `• ${short}`;
    }).join("\n");
    return {
      seller_agent_id: sellerAgentId,
      listing_ids: candidates.map(candidate => candidate.listing_id),
      questions,
      draft_message: `${intro}\n${titles}\n${body}\n${end}`
    };
  });
}

function emptyAlternatives(): Record<ProjectSlot, ProjectCandidate[]> {
  return { desk: [], chair: [], monitor: [], lamp: [], keyboard: [] };
}

function ranking(items: ProjectCandidate[], brief: ProjectBrief, variant: ProjectVariant): number[] {
  const feesUnknown = items.filter(item => item.facts?.delivery_fee_cents == null).length;
  const total = items.reduce((sum, item) => sum + totalKnown(item), 0);
  const unknownChecks = items.reduce((sum, item) => sum + projectCandidateChecks(item, brief, variant, false).filter(check => check.status === "unknown").length, 0);
  if (variant === "comfort") return [feesUnknown, -items.reduce((sum, item) => sum + (item.facts?.comfort_score ?? 0), 0), unknownChecks, total];
  if (variant === "weekend") return [items.filter(item => !pickupConfirmed(item, brief)).length, feesUnknown, unknownChecks,
    items.reduce((sum, item) => sum + (item.distance_km ?? brief.location.radius_km), 0), total];
  return [feesUnknown, total, unknownChecks];
}

function compareSelection(left: ProjectCandidate[], right: ProjectCandidate[], brief: ProjectBrief, variant: ProjectVariant) {
  const a = ranking(left, brief, variant);
  const b = ranking(right, brief, variant);
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return left.map(candidateKey).join("|").localeCompare(right.map(candidateKey).join("|"));
}

function shortList(candidates: ProjectCandidate[], brief: ProjectBrief) {
  if (candidates.length <= CANDIDATES_PER_SLOT) return candidates;
  // A small diverse set bounds the cross-product without discarding every
  // comfortable or collectable option in favour of the cheapest items.
  const selected = new Map<string, ProjectCandidate>();
  const take = (variant: ProjectVariant, count: number) => {
    for (const item of [...candidates].filter(candidate => variant !== "weekend" || !pickupImpossible(candidate, brief))
      .sort((a, b) => compareSelection([a], [b], brief, variant)).slice(0, count)) selected.set(item.listing_id, item);
  };
  take("economy", 4);
  take("comfort", 2);
  take("weekend", 2);
  for (const candidate of candidates) {
    if (selected.size >= CANDIDATES_PER_SLOT) break;
    selected.set(candidate.listing_id, candidate);
  }
  return [...selected.values()].sort((a, b) => candidateKey(a).localeCompare(candidateKey(b)));
}

function configuration(items: ProjectCandidate[], brief: ProjectBrief, variant: ProjectVariant, pickupExpired: boolean): ProjectConfiguration {
  const checks = items.flatMap(item => projectCandidateChecks(item, brief, variant, pickupExpired));
  const total = items.reduce((sum, item) => sum + totalKnown(item), 0);
  return {
    id: `${variant}:${items.map(item => item.listing_id).join(",")}`,
    variant,
    items,
    total_known_cents: total,
    unknown_fee_count: items.filter(item => item.facts?.delivery_fee_cents == null).length,
    remaining_cents: brief.budget_cents - total,
    ready_to_approve: !pickupExpired && checks.every(check => check.status === "confirmed") && total <= brief.budget_cents,
    checks,
    seller_groups: projectSellerGroups(items, checks)
  };
}

/** No network, messages, offers, reservations or mutable state. */
export function composeProjectPlan(rawBrief: ProjectBrief, rawCandidates: ProjectCandidate[], { now = new Date() }: { now?: Date } = {}): ProjectPlan {
  const brief = projectBriefSchema.parse(rawBrief);
  const pickupExpired = projectPickupExpired(brief, now);
  if (!Array.isArray(rawCandidates) || rawCandidates.length > MAX_CATALOGUE_CANDIDATES) {
    throw new Error(`A project catalogue must contain at most ${MAX_CATALOGUE_CANDIDATES} candidates`);
  }
  const candidates = rawCandidates.map(candidate => projectCandidateSchema.parse(candidate))
    .sort((a, b) => candidateKey(a).localeCompare(candidateKey(b)) || canonicalProjectSnapshot(a).localeCompare(canonicalProjectSnapshot(b)));
  const slots = requiredProjectSlots(brief);
  const alternatives = emptyAlternatives();
  const excluded: ProjectPlan["excluded"] = [];
  const corrections: ProjectCandidate[] = [];
  const seen = new Set<string>();
  for (const original of candidates) {
    const candidate = { ...original, facts: original.facts && Date.parse(original.facts.confirmed_at) < Date.parse(original.updated_at) ? null : original.facts };
    if (!slots.includes(candidate.slot)) continue;
    if (seen.has(candidate.listing_id)) { excluded.push({ listing_id: candidate.listing_id, slot: candidate.slot, reason: "duplicate_listing" }); continue; }
    seen.add(candidate.listing_id);
    const reason = exclusionReason(candidate, brief);
    if (reason) {
      excluded.push({ listing_id: candidate.listing_id, slot: candidate.slot, reason });
      if (candidate.facts && ["desk_too_large", "connector_incompatible", "over_budget", "pickup_after_deadline"].includes(reason)) corrections.push(candidate);
    } else alternatives[candidate.slot].push(candidate);
  }
  const missingSlots = slots.filter(slot => alternatives[slot].length === 0);
  const pools = slots.map(slot => shortList(alternatives[slot], brief));
  const searchLimited = slots.some(slot => alternatives[slot].length > CANDIDATES_PER_SLOT);
  const best: Partial<Record<ProjectVariant, ProjectCandidate[]>> = {};
  const variants: ProjectVariant[] = ["economy", "comfort", "weekend"];
  if (missingSlots.length === 0) {
    const visit = (selected: ProjectCandidate[], knownTotal: number) => {
      if (selected.length === pools.length) {
        for (const variant of variants) {
          if (variant === "weekend" && selected.some(item => pickupImpossible(item, brief))) continue;
          if (!best[variant] || compareSelection(selected, best[variant], brief, variant) < 0) best[variant] = [...selected];
        }
        return;
      }
      for (const candidate of pools[selected.length]) {
        const nextTotal = knownTotal + totalKnown(candidate);
        if (nextTotal > brief.budget_cents || selected.some(item => item.listing_id === candidate.listing_id)) continue;
        visit([...selected, candidate], nextTotal);
      }
    };
    visit([], 0);
  }
  const fingerprints = new Set<string>();
  const configurations: ProjectConfiguration[] = [];
  for (const variant of variants) {
    const selection = best[variant];
    if (!selection) continue;
    const identity = selection.map(item => item.listing_id).join(",");
    if (fingerprints.has(identity)) continue;
    fingerprints.add(identity);
    configurations.push(configuration(selection, brief, variant, pickupExpired));
  }
  for (const slot of PROJECT_SLOTS) alternatives[slot].sort((a, b) => compareSelection([a], [b], brief, "economy"));
  return {
    fingerprint: `project-plan-v1:${canonicalProjectSnapshot({ brief, candidates, pickup_expired: pickupExpired })}`,
    pickup_expired: pickupExpired,
    configurations,
    alternatives,
    missing_slots: missingSlots,
    excluded,
    corrections,
    search_limited: searchLimited
  };
}

export function projectSlotLabel(slot: ProjectSlot): string {
  return SLOT_NAMES[slot];
}

/** Conservative catalogue routing, not a claim about condition or compatibility. */
export function inferProjectSlot(title: string, category?: string | null): ProjectSlot | null {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ").replace(/[-_]/g, " ").trim();
  const text = normalize(title || "");
  if (!text) return null;
  // Accessory-only listings cannot fill the equipment slot they mention.
  if (/^(?:(?:lot|kit|un|une|le|la|les|2|deux)\s+)?(?:support|bras|pied|cable|adaptateur|housse|roulettes?|accoudoirs?|keycaps?|touches?|ampoules?|abat jour)\b/.test(text)) return null;
  const primary = text.replace(/\b(?:de|du) bureau\b/g, "");
  const patterns: [ProjectSlot, RegExp][] = [
    ["keyboard", /\b(?:clavier|keyboards?)\b/],
    ["lamp", /\b(?:lampes?|lamps?|luminaire)\b/],
    ["monitor", /\b(?:ecrans?|moniteurs?|monitors?)\b/],
    ["chair", /\b(?:chaises?|fauteuils?|chairs?)\b/],
    ["desk", /\b(?:bureaux?|desks?)\b/]
  ];
  const matches = patterns.filter(([, pattern]) => pattern.test(primary)).map(([slot]) => slot);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return null;
  const preciseCategory = normalize(category || "");
  const categories: Record<string, ProjectSlot> = {
    bureaux: "desk", desk: "desk", desks: "desk", chaises: "chair", fauteuils: "chair", chairs: "chair",
    ecrans: "monitor", moniteurs: "monitor", monitors: "monitor", lampes: "lamp", lamps: "lamp", claviers: "keyboard", keyboards: "keyboard"
  };
  return categories[preciseCategory] || null;
}
