import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260713010000_security_offer_invariants.sql"
);

describe("offer security invariants migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("persists and validates the proposal author", () => {
    expect(sql).toContain("proposed_by_agent_id");
    expect(sql).toContain("alter column proposed_by_agent_id set not null");
    expect(sql).toContain("OFFER_PROPOSER_NOT_PARTICIPANT");
    expect(sql).toContain("offer_row.proposed_by_agent_id = p_actor_agent_id");
    expect(sql).toContain("OFFER_NOT_ACTIONABLE:SELF_PROPOSED");
  });

  it("checks expiry while the previous offer is locked", () => {
    const lockIndex = sql.indexOf("where o.offer_id = p_previous_offer_id");
    const expiryIndex = sql.indexOf("v_previous.expires_at <= v_now");
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(expiryIndex).toBeGreaterThan(lockIndex);
    expect(sql).toContain("OFFER_NOT_COUNTERABLE:EXPIRED");
  });

  it("requires the current owner policy before acceptance mutations", () => {
    const policyIndex = sql.indexOf("'offer.accept'");
    const mutationIndex = sql.indexOf("set status = 'ACCEPTED'");
    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(mutationIndex).toBeGreaterThan(policyIndex);
    expect(sql).toContain("OFFER_POLICY_REQUIRED");
  });
});
