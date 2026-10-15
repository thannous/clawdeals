import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const initialPolicy = {
  version: 3,
  budgets: { max_offer: 1300, preferred_offer: 800, currency: "EUR" },
  approval_thresholds: { offer_amount_gt: 900, contact_reveal: "always" },
  auto_approve: { message_types: ["answer"], actions: [] },
  mission_defaults: { radius_km: 25, autonomous_actions: ["search", "ask_question", "make_offer"] },
  quiet_hours: { enabled: false, start: "22:00", end: "08:00", timezone: "Europe/Paris" },
  allowlist_agent_ids: ["synthetic-seller"],
  denylist_agent_ids: []
};

type Policy = typeof initialPolicy;

// The actual settings UI runs against controlled API responses. All writes and
// external requests are intercepted; no owner policy is changed on the server.
for (const outcome of ["saved", "rejected"] as const) {
  test(`policy edits made during a pending ${outcome} response remain available for a validated retry`, {
    tags: ["dogfood", "policy", "network-recovery"], requires: ["browser"]
  }, async ({ app, screen, browser }) => {
    const origin = new URL(app.baseUrl!).origin;
    let policy = structuredClone(initialPolicy);
    const writes: { version: string; body: Policy }[] = [];
    let releaseFirst!: () => void;
    const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
    await browser.route("**/*", async route => {
      const url = new URL(route.request.url);
      if (url.origin === origin && ["GET", "HEAD"].includes(route.request.method)) await route.continue();
      else await route.abort();
    });
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: {
      authenticated: true, owner_id: "11111111-1111-4111-8111-111111111111"
    } } }));
    await browser.route("**/api/v1/owner/policy-decisions?limit=20", route => route.fulfill({ json: { data: { decisions: [] } } }));
    await browser.route("**/api/v1/policies", async route => {
      if (route.request.method === "GET") {
        await route.fulfill({ json: { data: policy } });
        return;
      }
      if (route.request.method !== "PUT") { await route.abort(); return; }
      const body = JSON.parse(route.request.postData || "{}") as Policy;
      writes.push({ version: route.request.headers["if-match"], body });
      if (writes.length === 1) {
        await firstResponse;
        if (outcome === "rejected") {
          await route.fulfill({ status: 503, json: { error: { message: "Temporary policy service failure" } } });
          return;
        }
      }
      policy = { ...body, version: policy.version + 1 };
      await route.fulfill({ json: { data: policy } });
    });

    try {
      await app.open("/settings/policy");
      await screen.getByLabel("Hard ceiling").fill("1250");
      await screen.getByLabel("Allowlist").fill("synthetic-seller, synthetic-seller");
      await screen.getByRole("button", "Save changes").tap();
      await expect.poll(() => writes.length).toBe(1);
      await expect(screen.getByRole("button", "Saving…")).toBeDisabled();
      await screen.getByLabel("Hard ceiling").fill("1000");
      await screen.getByLabel("Default radius km").fill("40");
      await screen.getByRole("checkbox", /Make policy-compliant offers/).uncheck();
      await screen.getByLabel("Denylist").fill("synthetic-blocked-seller");
      await expect(screen.getByLabel("Hard ceiling")).toHaveValue("1000");
      await app.screenshot(`policy-${outcome}-pending-with-new-edits`);
      const response = browser.waitForResponse("**/api/v1/policies");
      releaseFirst();
      expect((await response).status).toBe(outcome === "saved" ? 200 : 503);
      await expect(screen.getByRole("button", "Save changes")).toBeEnabled();
  
      // A delayed response must not restore the older budget or enable offers.
      await expect(screen.getByLabel("Hard ceiling")).toHaveValue("1000");
      await expect(screen.getByLabel("Default radius km")).toHaveValue("40");
      await expect(screen.getByRole("checkbox", /Make policy-compliant offers/)).not.toBeChecked();
      await expect(screen.getByLabel("Denylist")).toHaveValue("synthetic-blocked-seller");
      if (outcome === "saved") {
        await expect(screen.getByLabel("Allowlist")).toHaveValue("synthetic-seller");
        await expect(screen.getByRole("status")).toContainText("Unsaved changes");
      } else {
        await expect(screen.getByTestId("policy-form").getByRole("alert")).toContainText("Temporary policy service failure");
      }
      expect(writes[0]).toMatchObject({ version: "3", body: {
        budgets: { max_offer: 1250 }, mission_defaults: { radius_km: 25, autonomous_actions: ["search", "ask_question", "make_offer"] },
        denylist_agent_ids: []
      } });
  
      // Preserving a draft never bypasses the existing numeric range validation.
      await screen.getByLabel("Default radius km").fill("301");
      await screen.getByRole("button", "Save changes").tap();
      expect(await browser.evaluate(() => (document.querySelector('[name="radius_km"]') as HTMLInputElement).validity.rangeOverflow)).toBe(true);
      expect(writes).toHaveLength(1);
      await screen.getByLabel("Default radius km").fill("40");
      await screen.getByRole("button", "Save changes").tap();
      await expect.poll(() => writes.length).toBe(2);
      await expect(screen.getByRole("button", "Save changes")).toBeEnabled();
      expect(writes[1]).toMatchObject({ version: outcome === "saved" ? "4" : "3", body: {
        budgets: { max_offer: 1000, preferred_offer: 800 },
        approval_thresholds: { offer_amount_gt: 900, contact_reveal: "always" },
        mission_defaults: { radius_km: 40, autonomous_actions: ["search", "ask_question"] },
        denylist_agent_ids: ["synthetic-blocked-seller"]
      } });
      await expect(screen.getByRole("status")).toHaveCount(0);
      await app.screenshot(`policy-${outcome}-new-edits-saved`);
      await browser.reload();
      await expect(screen.getByLabel("Hard ceiling")).toHaveValue("1000");
      await expect(screen.getByLabel("Default radius km")).toHaveValue("40");
      await expect(screen.getByRole("checkbox", /Make policy-compliant offers/)).not.toBeChecked();
      await expect(screen.getByLabel("Denylist")).toHaveValue("synthetic-blocked-seller");
    } finally {
      releaseFirst();
    }
  });
}
