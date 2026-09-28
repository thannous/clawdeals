import { describe, expect, it } from "vitest";

import { validatePolicyInput } from "./policy";

describe("owner policy editor fields", () => {

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
});
