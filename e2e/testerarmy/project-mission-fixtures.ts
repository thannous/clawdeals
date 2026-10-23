import type { ProjectBrief, ProjectCandidate, ProjectFacts, ProjectSlot } from "../../src/shared/project-missions";

// Synthetic catalogue for browser presentation/consent coverage. Persistence,
// ownership and atomic message delivery are verified separately against SQL.
export const PROJECT_OWNER = "ba100000-0000-4000-8000-000000000001";
export const PROJECT_OTHER_OWNER = "ba100000-0000-4000-8000-000000000002";
export const PROJECT_ID = "ba200000-0000-4000-8000-000000000001";
export const PROJECT_DATE = "2099-10-24";
export const PROJECT_NOW = "2026-10-23T12:00:00.000Z";

export const officeBrief: ProjectBrief = {
  version: 1,
  use_case: "home_office",
  description: "Équipe mon bureau pour télétravailler, avec un écran HDMI.",
  budget_cents: 50_000,
  market_code: "FR",
  currency: "EUR",
  location: { lat: 48.8566, lon: 2.3522, radius_km: 20, label: "Paris" },
  desk_max_width_cm: 140,
  desk_max_depth_cm: 80,
  laptop_connector: "HDMI",
  pickup_by: PROJECT_DATE,
  optional_slots: []
};

function item(index: number, slot: ProjectSlot, title: string, price: number, facts: Partial<ProjectFacts> = {}): ProjectCandidate {
  return {
    listing_id: `ba300000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    seller_agent_id: `ba400000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title,
    slot,
    price_cents: price,
    market_code: "FR",
    currency: "EUR",
    status: "LIVE",
    updated_at: PROJECT_NOW,
    distance_km: index,
    delivery_method: "PICKUP",
    facts: {
      provenance: "user_confirmed",
      confirmed_at: PROJECT_NOW,
      delivery_fee_cents: 0,
      desk_width_cm: slot === "desk" ? 120 : undefined,
      desk_depth_cm: slot === "desk" ? 60 : undefined,
      connectors: slot === "monitor" ? ["HDMI"] : undefined,
      pickup_available_by: PROJECT_DATE,
      comfort_score: 1,
      ...facts
    }
  };
}

export function officeCatalogue(): ProjectCandidate[] {
  return [
    item(1, "desk", "Bureau compact 120 cm", 10_000),
    item(2, "chair", "Chaise de bureau réglable", 5_000),
    item(3, "monitor", "Écran HDMI 24 pouces", 10_000),
    item(4, "desk", "Bureau réglable 130 cm", 16_000, { comfort_score: 5 }),
    item(5, "chair", "Chaise ergonomique avec accoudoirs", 12_000, { comfort_score: 5 }),
    item(6, "monitor", "Écran HDMI réglable 27 pouces", 15_000, { comfort_score: 5 }),
    item(7, "lamp", "Lampe de bureau", 2_000),
    item(8, "keyboard", "Clavier compact", 3_000)
  ];
}
