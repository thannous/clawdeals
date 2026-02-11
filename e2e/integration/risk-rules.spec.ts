import { test, expect } from "@playwright/test";

import { assertIntegrationEnv } from "./helpers/env";
import { randomId } from "./helpers/ids";
import { createSupabaseAdmin, setupAgent, OPS_CONSOLE_OWNER_ID } from "./helpers/supabase";

assertIntegrationEnv();

function buildAuditRow({
  occurredAt,
  agentId,
  event,
  statusCode
}: {
  occurredAt: string;
  agentId: string;
  event: string;
  statusCode: number;
}) {
  return {
    occurred_at: occurredAt,
    actor: { type: "system", id: "itest-risk-rules" },
    auth: { agent_id: agentId },
    request: {
      method: "POST",
      path: "/itest",
      status_code: statusCode
    },
    action: {
      route_group: "itest.risk-rules",
      event
    },
    security: {},
    policy: {},
    payload: {},
    outcome: statusCode >= 400 ? "FAILURE" : "SUCCESS",
    payload_fingerprint: `itest_${randomId()}`,
    hash_algo: "hmac-sha256"
  };
}

async function runRiskRulesCron(request: any, dryRun = false) {
  return request.post("/api/internal/cron/risk-rules", {
    headers: {
      "x-cron-secret": process.env.INTERNAL_CRON_SECRET as string
    },
    data: {
      dry_run: dryRun
    }
  });
}

test.describe.serial("Integration: Risk rules engine (TI-274)", () => {
  test.setTimeout(120000);

  test("multi-agent robustness + cooldown + disabled rule + manual unflag", async ({ request }) => {
    test.skip(!process.env.INTERNAL_CRON_SECRET, "INTERNAL_CRON_SECRET is required");

    const supabase = createSupabaseAdmin();
    const now = new Date();
    const withinOneHour = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const withinOneDay = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const withinOneWeek = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [agentA, agentB, agentC, agentD, agentE] = await Promise.all([
      setupAgent(supabase),
      setupAgent(supabase),
      setupAgent(supabase),
      setupAgent(supabase),
      setupAgent(supabase)
    ]);

    const rateRuleKey = "rate_limit_triggers_1h";
    const duplicatesRuleKey = "duplicates_detected_24h";
    const disputesRuleKey = "disputes_opened_7d";

    const { data: seededRules, error: rulesError } = await supabase
      .from("risk_rules")
      .upsert(
        [
          {
            rule_key: rateRuleKey,
            signal_type: "rate_limit_triggers",
            threshold: 12,
            window_seconds: 3600,
            cooldown_seconds: 3600,
            flag: "noisy_client",
            enabled: true,
            updated_at: now.toISOString()
          },
          {
            rule_key: duplicatesRuleKey,
            signal_type: "duplicates_detected",
            threshold: 4,
            window_seconds: 86400,
            cooldown_seconds: 86400,
            flag: "under_review",
            enabled: true,
            updated_at: now.toISOString()
          },
          {
            rule_key: disputesRuleKey,
            signal_type: "disputes_opened",
            threshold: 3,
            window_seconds: 604800,
            cooldown_seconds: 604800,
            flag: "restricted",
            enabled: true,
            updated_at: now.toISOString()
          }
        ],
        { onConflict: "rule_key" }
      )
      .select("risk_rule_id,rule_key");
    if ((rulesError as any)?.code === "PGRST205") {
      test.skip(true, "risk_rules migration not applied in integration database");
    }
    expect(rulesError).toBeNull();
    expect((seededRules || []).length).toBeGreaterThanOrEqual(3);

    const auditRows: any[] = [];
    for (let i = 0; i < 12; i += 1) {
      auditRows.push(
        buildAuditRow({
          occurredAt: withinOneHour,
          agentId: agentA.agent.id,
          event: "api.rate_limited",
          statusCode: 429
        })
      );
    }
    for (let i = 0; i < 4; i += 1) {
      auditRows.push(
        buildAuditRow({
          occurredAt: withinOneDay,
          agentId: agentB.agent.id,
          event: "listing.duplicate_detected",
          statusCode: 409
        })
      );
    }
    for (let i = 0; i < 3; i += 1) {
      auditRows.push(
        buildAuditRow({
          occurredAt: withinOneWeek,
          agentId: agentC.agent.id,
          event: "dispute.opened",
          statusCode: 201
        })
      );
    }
    // Below threshold.
    for (let i = 0; i < 11; i += 1) {
      auditRows.push(
        buildAuditRow({
          occurredAt: withinOneHour,
          agentId: agentD.agent.id,
          event: "api.rate_limited",
          statusCode: 429
        })
      );
    }

    const { error: auditInsertError } = await supabase.from("audit_logs").insert(auditRows);
    expect(auditInsertError).toBeNull();

    const firstRun = await runRiskRulesCron(request, false);
    expect(firstRun.status()).toBe(200);
    const firstRunBody = await firstRun.json();
    expect(firstRunBody.flags_applied).toBeGreaterThanOrEqual(3);

    const { data: trustRows, error: trustRowsError } = await supabase
      .from("agents")
      .select("id,trust_flags")
      .in("id", [agentA.agent.id, agentB.agent.id, agentC.agent.id, agentD.agent.id, agentE.agent.id]);
    expect(trustRowsError).toBeNull();

    const trustMap = new Map((trustRows || []).map((row: any) => [row.id, Array.isArray(row.trust_flags) ? row.trust_flags : []]));
    expect(trustMap.get(agentA.agent.id)).toContain("noisy_client");
    expect(trustMap.get(agentB.agent.id)).toContain("under_review");
    expect(trustMap.get(agentC.agent.id)).toContain("restricted");
    expect(trustMap.get(agentD.agent.id)).not.toContain("noisy_client");
    expect(trustMap.get(agentE.agent.id)).not.toContain("noisy_client");

    const [parallel1, parallel2] = await Promise.all([runRiskRulesCron(request, false), runRiskRulesCron(request, false)]);
    expect(parallel1.status()).toBe(200);
    expect(parallel2.status()).toBe(200);
    const parallelBody1 = await parallel1.json();
    const parallelBody2 = await parallel2.json();
    expect(parallelBody1.flags_applied + parallelBody2.flags_applied).toBe(0);

    const immediateRun = await runRiskRulesCron(request, false);
    expect(immediateRun.status()).toBe(200);
    const immediateBody = await immediateRun.json();
    expect(immediateBody.flags_applied).toBe(0);
    expect(immediateBody.skipped_cooldown).toBeGreaterThanOrEqual(1);

    const disableRateRuleRes = await request.patch("/api/console/risk-rules", {
      headers: { "x-owner-id": OPS_CONSOLE_OWNER_ID }
    });
    // sanity: endpoint should still be protected by method/route setup
    expect(disableRateRuleRes.status()).toBe(405);

    const { data: rateRule, error: rateRuleFetchError } = await supabase
      .from("risk_rules")
      .select("risk_rule_id")
      .eq("rule_key", rateRuleKey)
      .maybeSingle();
    expect(rateRuleFetchError).toBeNull();
    expect(rateRule?.risk_rule_id).toBeTruthy();

    const disableRuleRes = await request.patch(`/api/console/risk-rules/${rateRule.risk_rule_id}`, {
      headers: {
        "x-owner-id": OPS_CONSOLE_OWNER_ID,
        "Content-Type": "application/json"
      },
      data: { enabled: false }
    });
    expect(disableRuleRes.status()).toBe(200);

    const eSignals: any[] = [];
    for (let i = 0; i < 20; i += 1) {
      eSignals.push(
        buildAuditRow({
          occurredAt: withinOneHour,
          agentId: agentE.agent.id,
          event: "api.rate_limited",
          statusCode: 429
        })
      );
    }
    const { error: eSignalsError } = await supabase.from("audit_logs").insert(eSignals);
    expect(eSignalsError).toBeNull();

    const disabledRuleRun = await runRiskRulesCron(request, false);
    expect(disabledRuleRun.status()).toBe(200);

    const { data: agentEAfter, error: agentEAfterError } = await supabase
      .from("agents")
      .select("trust_flags")
      .eq("id", agentE.agent.id)
      .maybeSingle();
    expect(agentEAfterError).toBeNull();
    expect(Array.isArray(agentEAfter?.trust_flags) ? agentEAfter.trust_flags : []).not.toContain("noisy_client");

    const unflagRes = await request.post("/api/console/risk-rules/unflag", {
      headers: {
        "x-owner-id": OPS_CONSOLE_OWNER_ID,
        "Content-Type": "application/json"
      },
      data: {
        agent_id: agentC.agent.id,
        flag: "restricted",
        reason: "manual override test"
      }
    });
    expect(unflagRes.status()).toBe(200);

    const { data: agentCAfter, error: agentCAfterError } = await supabase
      .from("agents")
      .select("trust_flags")
      .eq("id", agentC.agent.id)
      .maybeSingle();
    expect(agentCAfterError).toBeNull();
    expect(Array.isArray(agentCAfter?.trust_flags) ? agentCAfter.trust_flags : []).not.toContain("restricted");

    const { data: unflagAudit, error: unflagAuditError } = await supabase
      .from("audit_logs")
      .select("action,payload")
      .eq("action->>event", "risk_rule.flag_removed_manual")
      .eq("payload->>agent_id", agentC.agent.id)
      .order("occurred_at", { ascending: false })
      .limit(1);
    expect(unflagAuditError).toBeNull();
    expect((unflagAudit || []).length).toBeGreaterThanOrEqual(1);
  });
});
