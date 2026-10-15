import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ownerId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const approvalId = "33333333-3333-4333-8333-333333333333";

// Actual Pages Router navigation and read-only runtime inspection. Only API
// responses are fixtures: no router replacement, injected React state or email.
for (const locale of ["fr", "es"] as const) {
  for (const trigger of ["anonymous reload", "queue request expires"] as const) {
    test(`${locale} approval filters survive ${trigger} and the real login return`, async ({ app, browser, screen }) => {
      const origin = new URL(app.baseUrl!).origin;
      let authenticated = true;
      let expireNextRead = false;
      const reads: { state: string | null; agentId: string | null }[] = [];
      await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
        ? route.continue() : route.abort());
      await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: {
        authenticated, owner_id: authenticated ? ownerId : null,
      } } }));
      await browser.route("**/api/v1/owner/agents*", route => route.fulfill({ json: { data: {
        agents: [{ agent_id: agentId, name: "Recovery agent" }],
      } } }));
      await browser.route("**/api/v1/approvals?*", async route => {
        const params = new URL(route.request.url).searchParams;
        reads.push({ state: params.get("state"), agentId: params.get("agent_id") });
        if (expireNextRead) {
          expireNextRead = false;
          authenticated = false;
          await route.fulfill({ status: 401, json: { error: { code: "SESSION_EXPIRED", message: "Session expired" } } });
          return;
        }
        await route.fulfill({ json: { data: { approvals: [{
          approval_id: approvalId, owner_id: ownerId, state: params.get("state") || "PENDING",
          action_type: "offer_over_budget", created_by_agent_id: agentId, created_at: "2026-10-15T10:00:00Z",
        }], next_cursor: null } } });
      });

      const initialPath = `/my/approvals?state=APPROVED&agent_id=${agentId}#queue`;
      await app.open(`/${locale}${initialPath}`);
      await expect(screen.getByTestId("my-approvals-page")).toBeVisible();
      await expect.poll(() => reads.at(-1)).toEqual({ state: "APPROVED", agentId });
      const runtime = await browser.evaluate(() => {
        const router = (window as any).next.router;
        return { asPath: router.asPath, locale: router.locale, isReady: router.isReady, browserPath: location.pathname + location.search + location.hash, width: innerWidth };
      });
      expect(runtime.asPath).toBe(initialPath);
      expect(runtime.locale).toBe(locale);
      expect(runtime.isReady).toBe(true);
      expect(runtime.browserPath).toBe(`/${locale}${initialPath}`);
      writeFileSync(join(process.env.PARITY_OUTPUT!, `router-${locale}-${trigger.replaceAll(" ", "-")}-${runtime.width}.json`), JSON.stringify(runtime, null, 2) + "\n");

      let expectedReturn = `/${locale}${initialPath}`;
      if (trigger === "anonymous reload") {
        authenticated = false;
        await browser.reload();
      } else {
        expireNextRead = true;
        expectedReturn = `/${locale}/my/approvals?state=DENIED&agent_id=${agentId}`;
        await screen.getByTestId("my-approvals-toolbar").getByRole("button", locale === "fr" ? "Refusé" : "Rechazada").tap();
      }
      await expect(screen.getByTestId("auth-login-email")).toBeVisible();
      await expect(browser).toHaveURL(`/${locale}/auth/login?next=${encodeURIComponent(expectedReturn)}`);
      expect(new URL(await browser.url()).searchParams.get("next")).toBe(expectedReturn);
      await app.screenshot(`approval-${locale}-login-return`);

      // A restored owner session drives LoginPage's actual redirect. The test
      // never navigates directly to its own expected destination.
      authenticated = true;
      await browser.reload();
      await expect(browser).toHaveURL(expectedReturn);
      await expect(screen.getByTestId("my-approvals-page")).toBeVisible();
      await expect(screen.getByTestId("agent-dropdown")).toContainText("Recovery agent");
      await expect.poll(() => reads.at(-1)).toEqual({ state: trigger === "anonymous reload" ? "APPROVED" : "DENIED", agentId });
    });
  }
}
