import { describe, expect, it } from "vitest";

import { createDefaultPolicy, normalizePolicyInput, validatePolicyInput } from "./policy";

describe("owner policy editor fields", () => {
  it("adds safe mission and quiet-hour defaults to legacy policies", () => {
    const normalized = normalizePolicyInput({
      budgets: { max_offer: 1300, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1200, contact_reveal: "always" }
    });

    expect(normalized).toMatchObject({
      budgets: { max_offer: 1300, preferred_offer: null, currency: "EUR" },
      mission_defaults: {
        radius_km: 25,
        autonomous_actions: ["search", "ask_question", "make_offer"]
      },
      quiet_hours: {
        enabled: false,
        start: "22:00",
        end: "08:00",
        timezone: "UTC"
      }
    });
  });

  it("normalizes all editor fields without dropping existing policy controls", () => {
    const normalized = normalizePolicyInput({
      budgets: { max_offer: 1300, preferred_offer: 1200, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1250, contact_reveal: "always" },
      auto_approve: { message_types: ["answer"], actions: ["listing.create"] },
      mission_defaults: {
        radius_km: 40,
        autonomous_actions: ["search", "ask_question", "make_offer", "not-allowed"]
      },
      quiet_hours: {
        enabled: true,
        start: "21:30",
        end: "07:15",
        timezone: "Europe/Paris"
      },
      allowlist_agent_ids: ["agent-1"],
      denylist_agent_ids: ["agent-2"]
    });

    expect(normalized).toEqual({
      budgets: { max_offer: 1300, preferred_offer: 1200, currency: "EUR" },
      approval_thresholds: { offer_amount_gt: 1250, contact_reveal: "always" },
      auto_approve: { message_types: ["answer"], actions: ["listing.create"] },
      mission_defaults: {
        radius_km: 40,
        autonomous_actions: ["search", "ask_question", "make_offer"]
      },
      quiet_hours: {
        enabled: true,
        start: "21:30",
        end: "07:15",
        timezone: "Europe/Paris"
      },
      allowlist_agent_ids: ["agent-1"],
      denylist_agent_ids: ["agent-2"]
    });
  });

  it("rejects contradictory budgets and invalid mission defaults", () => {
    const errors = validatePolicyInput({
      budgets: { max_offer: 1000, preferred_offer: 1200, currency: "EUR" },
      mission_defaults: { radius_km: 0, autonomous_actions: ["make_offer"] },
      quiet_hours: {
        enabled: true,
        start: "25:00",
        end: "08:00",
        timezone: "Not/A_Timezone"
      }
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "budgets.preferred_offer" }),
        expect.objectContaining({ field: "mission_defaults.radius_km" }),
        expect.objectContaining({
          field: "mission_defaults.autonomous_actions"
        }),
        expect.objectContaining({ field: "quiet_hours.start" }),
        expect.objectContaining({ field: "quiet_hours.timezone" })
      ])
    );
  });

  it("rejects an enabled quiet-hours window with identical bounds", () => {
    expect(
      validatePolicyInput({
        quiet_hours: {
          enabled: true,
          start: "22:00",
          end: "22:00",
          timezone: "Europe/Paris"
        }
      })
    ).toContainEqual(
      expect.objectContaining({
        field: "quiet_hours",
        message: "start and end must differ when quiet hours are enabled"
      })
    );
  });

  it("includes editor defaults in newly created policies", () => {
    expect(createDefaultPolicy()).toMatchObject({
      version: 1,
      budgets: { preferred_offer: null },
      mission_defaults: {
        radius_km: 25,
        autonomous_actions: ["search", "ask_question", "make_offer"]
      }
    });
  });
});
