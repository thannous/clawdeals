import { describe, expect, it } from "vitest";
import { neonCronPaths } from "../../workers/neon-cron-schedule";
describe("Neon hourly wake consolidation", () => {
  it("keeps hourly, six-hour and daily work in one hourly window", () => {
    expect(neonCronPaths("2 * * * *", Date.parse("2026-11-05T12:02:00Z"))).toHaveLength(9);
    expect(neonCronPaths("2 * * * *", Date.parse("2026-11-05T02:02:00Z"))).toHaveLength(13);
    expect(neonCronPaths("2 * * * *", Date.parse("2026-11-05T03:02:00Z"))).toHaveLength(8);
    for (const trigger of ["17 * * * *", "0 */6 * * *", "10 2 * * *"]) expect(neonCronPaths(trigger, Date.now())).toEqual([]);
  });
});
