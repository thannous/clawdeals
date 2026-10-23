import { describe, expect, it } from "vitest";
import { composeProjectPlan as compose, projectTodayInParis, projectPickupExpired, inferProjectSlot, projectCandidatePriceCents, projectBriefSchema, type ProjectBrief, type ProjectCandidate, type ProjectSlot } from "./index";

const composeProjectPlan: typeof compose = (brief, candidates, options = { now: new Date("2026-10-23T12:00:00.000Z") }) => compose(brief, candidates, options);

const brief: ProjectBrief = {
  version: 1, use_case: "home_office", description: "Équiper mon bureau pour 500 €", budget_cents: 50_000,
  currency: "EUR", market_code: "FR", location: { lat: 48.85, lon: 2.35, radius_km: 25, label: "Paris" },
  desk_max_width_cm: 140, desk_max_depth_cm: 70, laptop_connector: "HDMI", pickup_by: "2026-10-25", optional_slots: []
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function candidate(slot: ProjectSlot, n: number, price = 10_000): ProjectCandidate {
  return {
    listing_id: id(n), seller_agent_id: id(n + 100), slot, title: `${slot} ${n}`, price_cents: price,
    currency: "EUR", market_code: "FR", status: "LIVE", updated_at: "2026-10-20T12:00:00.000Z", distance_km: 2,
    delivery_method: "PICKUP", facts: { provenance: "user_confirmed", confirmed_at: "2026-10-23T12:00:00.000Z",
      delivery_fee_cents: 0, desk_width_cm: 120, desk_depth_cm: 60, connectors: ["HDMI"], pickup_available_by: "2026-10-24", comfort_score: 1 }
  };
}
function catalogue() { return [candidate("desk", 1), candidate("chair", 2), candidate("monitor", 3)]; }

// Arithmetic and source invalidation are security-relevant server boundaries.
// Browser journeys cannot exhaust fractional/overflow input or all catalogue orderings.
describe("project composition budget and evidence boundaries", () => {
  it("excludes a complete combination when its combined fees exceed the exact shared budget", () => {
    const items = catalogue();
    items[0].price_cents = 29_999;
    items[0].facts.delivery_fee_cents = 2;
    const plan = composeProjectPlan(brief, items);
    expect(plan.missing_slots).toEqual([]);
    expect(plan.configurations).toEqual([]);
    items[0].facts.delivery_fee_cents = 1;
    const exact = composeProjectPlan(brief, items).configurations[0];
    expect(exact.total_known_cents).toBe(50_000);
    expect(exact.remaining_cents).toBe(0);
    expect(exact.ready_to_approve).toBe(true);
  });

  it("never treats missing costs as a complete zero-fee quote", () => {
    const items = catalogue();
    items[1].facts.delivery_fee_cents = null;
    const plan = composeProjectPlan(brief, items).configurations[0];
    expect(plan.total_known_cents).toBe(30_000);
    expect(plan.unknown_fee_count).toBe(1);
    expect(plan.ready_to_approve).toBe(false);
    expect(plan.checks).toContainEqual(expect.objectContaining({ code: "fees", status: "unknown", listing_id: id(2) }));
  });

  it("rejects fractional cents and unsafe amounts instead of rounding a budget upward", () => {
    expect(() => composeProjectPlan({ ...brief, budget_cents: 50_000.01 }, catalogue())).toThrow();
    expect(() => composeProjectPlan(brief, [candidate("desk", 1, Number.MAX_SAFE_INTEGER), ...catalogue().slice(1)])).toThrow();
  });

  it("excludes confirmed incompatibilities and preserves unknown compatibility as a blocker", () => {
    const items = catalogue();
    items.push(candidate("desk", 4));
    items[0].facts.desk_width_cm = 150;
    items[3].facts.desk_width_cm = null;
    const plan = composeProjectPlan(brief, items);
    expect(plan.excluded).toContainEqual({ listing_id: id(1), slot: "desk", reason: "desk_too_large" });
    expect(plan.configurations[0].ready_to_approve).toBe(false);
    items[2].facts.connectors = ["VGA"];
    const incompatible = composeProjectPlan(brief, items);
    expect(incompatible.missing_slots).toContain("monitor");
    expect(incompatible.configurations).toEqual([]);
  });

  it("does not infer video compatibility from a USB-C connector alone", () => {
    const items = catalogue();
    items[2].facts.connectors = ["USB_C"];
    const usbBrief = { ...brief, laptop_connector: "USB_C" } as ProjectBrief;
    expect(composeProjectPlan(usbBrief, items).configurations[0].ready_to_approve).toBe(false);
    items[2].facts.video_verified = true;
    expect(composeProjectPlan(usbBrief, items).configurations[0].ready_to_approve).toBe(true);
  });

  it("invalidates previously confirmed facts when the listing changed afterwards", () => {
    const items = catalogue();
    const before = composeProjectPlan(brief, items);
    items[0].updated_at = "2026-10-23T13:00:00.000Z";
    const after = composeProjectPlan(brief, items);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    expect(after.configurations[0].items[0].facts).toBeNull();
    expect(after.configurations[0].ready_to_approve).toBe(false);
  });

  it("deduplicates configurations and is deterministic across catalogue order", () => {
    const items = catalogue();
    const plan = composeProjectPlan(brief, items);
    expect(plan.configurations).toHaveLength(1);
    expect(composeProjectPlan(brief, [...items].reverse())).toEqual(plan);
    expect(plan.configurations[0].items.map(item => item.slot)).toEqual(["desk", "chair", "monitor"]);
  });

  it("creates distinct useful variants when different catalogue options actually exist", () => {
    const items = catalogue();
    items[0].distance_km = 10;
    const comfortable = candidate("desk", 4, 15_000);
    comfortable.facts.comfort_score = 5;
    comfortable.distance_km = 15;
    const nearby = candidate("desk", 5, 11_000);
    nearby.distance_km = 0.5;
    const plan = composeProjectPlan(brief, [...items, comfortable, nearby]);
    expect(plan.configurations.map(config => [config.variant, config.items[0].listing_id]))
      .toEqual([["economy", id(1)], ["comfort", id(4)], ["weekend", id(5)]]);
  });

  it("does not produce a complete basket from unavailable or duplicate listings", () => {
    const items = catalogue();
    items[2].status = "RESERVED";
    const plan = composeProjectPlan(brief, [...items, { ...items[0], slot: "chair" }]);
    expect(plan.configurations).toEqual([]);
    expect(plan.missing_slots).toContain("monitor");
    expect(plan.excluded).toContainEqual(expect.objectContaining({ listing_id: id(1), reason: "duplicate_listing" }));
  });

  it("groups seller questions without producing an offer or a reservation", () => {
    const items = catalogue();
    items[1].seller_agent_id = items[0].seller_agent_id;
    items[1].facts.delivery_fee_cents = null;
    const groups = composeProjectPlan(brief, items).configurations[0].seller_groups;
    expect(groups).toHaveLength(2);
    expect(groups[0].listing_ids).toEqual([id(1), id(2)]);
    expect(groups[0].questions.some(question => question.includes("frais exacts"))).toBe(true);
  });

  it("keeps an unspecified monitor port list unknown when other facts are saved", () => {
    const items = catalogue();
    items[2].facts.connectors = [];
    const plan = composeProjectPlan(brief, items);
    expect(plan.missing_slots).toEqual([]);
    expect(plan.configurations[0].ready_to_approve).toBe(false);
    expect(plan.alternatives.monitor).toHaveLength(1);
  });

  it("recalculates the aggregate from discussed prices and revokes stale quotes", () => {
    const items = catalogue();
    items[0].price_cents = 35_000;
    expect(composeProjectPlan(brief, items).configurations).toEqual([]);
    items[0].facts.quoted_price_cents = 18_000;
    const negotiated = composeProjectPlan(brief, items).configurations[0];
    expect(negotiated.total_known_cents).toBe(38_000);
    expect(negotiated.ready_to_approve).toBe(true);
    expect(negotiated.items[0].price_cents).toBe(35_000);
    items[0].facts.quoted_price_cents = 30_001;
    expect(composeProjectPlan(brief, items).configurations).toEqual([]);
    items[0].facts.quoted_price_cents = 18_000;
    items[0].updated_at = "2026-10-24T00:00:00.000Z";
    expect(projectCandidatePriceCents(items[0])).toBe(35_000);
    expect(composeProjectPlan(brief, items).configurations).toEqual([]);
  });

  it("fits the real 800-character messaging contract even with five extreme titles", () => {
    const items = [...catalogue(), candidate("lamp", 4), candidate("keyboard", 5)];
    for (const item of items) {
      item.seller_agent_id = id(100);
      item.title = "Écran ".repeat(333);
      item.facts = null;
      item.delivery_method = null;
    }
    const groups = composeProjectPlan({ ...brief, optional_slots: ["lamp", "keyboard"] }, items).configurations[0].seller_groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].listing_ids).toHaveLength(5);
    expect(groups[0].draft_message.length).toBeLessThanOrEqual(800);
    expect(groups[0].draft_message).toContain("sans offre d’achat ni réservation");
    expect(groups[0].questions).toHaveLength(5);
  });

  it("routes actual equipment rather than office modifiers or screen accessories", () => {
    expect(inferProjectSlot("Chaise de bureau ergonomique")).toBe("chair");
    expect(inferProjectSlot("Lampe de bureau LED")).toBe("lamp");
    expect(inferProjectSlot("Bureau d’angle 140 cm")).toBe("desk");
    expect(inferProjectSlot("Bureau avec chaise")).toBeNull();
    expect(inferProjectSlot("Support double écran")).toBeNull();
    expect(inferProjectSlot("Écran Dell avec pied inclus")).toBe("monitor");
    expect(inferProjectSlot("Dell U2419H", "moniteurs")).toBe("monitor");
    expect(inferProjectSlot("Dell U2419H", "electronics")).toBeNull();
  });

  it("retains incompatible user-entered facts for correction without offering that item", () => {
    const items = catalogue();
    items[0].facts.desk_width_cm = 150;
    const rejected = composeProjectPlan(brief, items);
    expect(rejected.configurations).toEqual([]);
    expect(rejected.alternatives.desk).toEqual([]);
    expect(rejected.corrections.map(item => item.listing_id)).toEqual([id(1)]);
    rejected.corrections[0].facts.desk_width_cm = 120;
    const fixed = composeProjectPlan(brief, [rejected.corrections[0], ...items.slice(1)]);
    expect(fixed.corrections).toEqual([]);
    expect(fixed.configurations[0].ready_to_approve).toBe(true);
  });

  it("expires the project after its Paris collection day, including the daylight-saving boundary", () => {
    expect(projectTodayInParis(new Date("2026-10-24T22:30:00.000Z"))).toBe("2026-10-25");
    expect(projectTodayInParis(new Date("2026-10-25T22:30:00.000Z"))).toBe("2026-10-25");
    expect(projectPickupExpired(brief, new Date("2026-10-25T22:59:59.999Z"))).toBe(false);
    expect(projectPickupExpired(brief, new Date("2026-10-25T23:00:00.000Z"))).toBe(true);
    const items = catalogue();
    const lastMinute = composeProjectPlan(brief, items, { now: new Date("2026-10-25T22:59:59.999Z") });
    const expired = composeProjectPlan(brief, items, { now: new Date("2026-10-25T23:00:00.000Z") });
    expect(lastMinute.pickup_expired).toBe(false);
    expect(lastMinute.configurations[0].ready_to_approve).toBe(true);
    expect(expired.pickup_expired).toBe(true);
    expect(expired.configurations[0].ready_to_approve).toBe(false);
    expect(expired.configurations[0].checks).toContainEqual(expect.objectContaining({ code: "pickup_date", status: "unknown" }));
    expect(expired.fingerprint).not.toBe(lastMinute.fingerprint);
    expect(composeProjectPlan(brief, items, { now: new Date("2026-10-24T12:00:00.000Z") }).fingerprint).toBe(lastMinute.fingerprint);
    expect(composeProjectPlan(brief, items, { now: new Date("2026-10-27T12:00:00.000Z") }).fingerprint).toBe(expired.fingerprint);
  });

  it("also blocks approval of shipping options once the project's requested date has expired", () => {
    const items = catalogue().map(item => ({ ...item, delivery_method: "SHIPPING" as const }));
    const plan = composeProjectPlan(brief, items, { now: new Date("2026-10-26T12:00:00.000Z") });
    expect(plan.configurations).toHaveLength(1);
    expect(plan.pickup_expired).toBe(true);
    expect(plan.configurations[0].ready_to_approve).toBe(false);
  });

  it("requires all chosen optional objects and rejects impossible collection dates", () => {
    const plan = composeProjectPlan({ ...brief, optional_slots: ["lamp", "keyboard"] }, catalogue());
    expect(plan.missing_slots).toEqual(["lamp", "keyboard"]);
    expect(plan.configurations).toEqual([]);
    expect(projectBriefSchema.safeParse({ ...brief, pickup_by: "2026-02-30" }).success).toBe(false);
    const items = catalogue();
    items[0].facts.pickup_available_by = "2026-10-26";
    expect(composeProjectPlan(brief, items).excluded).toContainEqual({ listing_id: id(1), slot: "desk", reason: "pickup_after_deadline" });
  });
});
