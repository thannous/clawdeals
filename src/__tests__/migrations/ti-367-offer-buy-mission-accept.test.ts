import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260826120000_ti_367_offer_buy_mission_accept.sql"
);
const sql = fs.readFileSync(migrationPath, "utf8");

function functionBody(name: string) {
  const marker = `create or replace function public.${name}(`;
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFn = sql.indexOf("create or replace function public.", start + marker.length);
  return nextFn === -1 ? sql.slice(start) : sql.slice(start, nextFn);
}

describe("TI-367 offer buy mission accept migration", () => {
  it("adds a nullable buy_mission_id FK to watchlists without rewriting history", () => {
    expect(sql).toMatch(/add column if not exists buy_mission_id uuid references public\.watchlists\(watchlist_id\)/i);
    expect(sql).toMatch(/on delete set null/i);
    expect(sql).toContain("offers_buy_mission_id_idx");
    expect(sql).not.toMatch(/alter column buy_mission_id set not null/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/drop column/i);
  });

  it("copies buy_mission_id onto the counter offer while the previous offer is locked", () => {
    const body = functionBody("counter_offer_v0");
    const lockIndex = body.indexOf("where o.offer_id = p_previous_offer_id");
    const copyIndex = body.indexOf("v_previous.buy_mission_id");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(copyIndex).toBeGreaterThan(lockIndex);
    expect(body).toContain("proposed_by_agent_id, previous_offer_id, buy_mission_id");
    expect(body).toContain("OFFER_NOT_COUNTERABLE:EXPIRED");
  });

  it("lets the non-proposing seller or buyer accept under policy or mission constraints", () => {
    const body = functionBody("offer_accept_v0");
    expect(body).toContain("offer_row.seller_agent_id is distinct from p_actor_agent_id");
    expect(body).toContain("offer_row.buyer_agent_id is distinct from p_actor_agent_id");
    expect(body).toContain("OFFER_NOT_ACTIONABLE:SELF_PROPOSED");
    expect(body).toContain("'offer.accept'");
    expect(body).toContain("p.owner_id::text = listing_row.owner_id");
    expect(body).toContain("OFFER_POLICY_REQUIRED");
    expect(body).toContain("MISSION_APPROVAL_REQUIRED");
    expect(body).toContain("watchlist_row.agent_id is distinct from offer_row.buyer_agent_id");
    expect(body).toContain("watchlist_row.active is not true");
    expect(body).toContain("v_mission_expires <= v_now");
    expect(body).toContain("offer_row.amount::numeric > v_hard_budget");
    expect(body).toContain("v_mission_currency is distinct from offer_row.currency");
    expect(body).toContain("? 'make_offer'");
    expect(body).toContain("upper(coalesce(v_mission->>'kind', '')) <> 'BUY'");
  });

  it("declines every other CREATED offer on the listing in its own thread after an atomic accept", () => {
    const body = functionBody("offer_accept_v0");
    const policyIndex = body.indexOf("'offer.accept'");
    const missionIndex = body.indexOf("MISSION_APPROVAL_REQUIRED");
    const mutationIndex = body.indexOf("set status = 'ACCEPTED'");
    const declineIndex = body.indexOf("o.listing_id = offer_row.listing_id");
    const uniqueIndex = body.indexOf("unique_violation");
    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(missionIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThan(Math.max(policyIndex, missionIndex));
    expect(declineIndex).toBeGreaterThan(mutationIndex);
    expect(uniqueIndex).toBeGreaterThan(mutationIndex);
    expect(body).toContain("and o.status = 'CREATED'");
    expect(body).toContain("returning o.offer_id, o.thread_id");
    expect(body).toContain("select d.thread_id");
    expect(body).toContain("p_actor_agent_id");
    expect(body).toContain("LISTING_LOCKED");
    expect(body).not.toContain("o.thread_id = offer_row.thread_id");
  });
});
