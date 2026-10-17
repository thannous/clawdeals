import { test } from "@e2e-dev/web";
import { expect } from "e2e";

const ownerId = "11111111-1111-4111-8111-111111111111";
const approvalId = "22222222-2222-4222-8222-222222222222";
const recoveryKey = `clawdeals:approval-recovery:v1:${ownerId}:${approvalId}`;
const path = `/fr/my/approvals/${approvalId}`;
const approval = {
  approval_id: approvalId, owner_id: ownerId, state: "PENDING", action_type: "offer_over_budget",
  action_ref: { mission_id: "44444444-4444-4444-8444-444444444444", amount: 1350, currency: "EUR" },
  action_payload_redacted: { offer: { amount: 1350, currency: "EUR" }, policy: { hard_budget_max: 1300 } },
  created_at: "2026-10-15T08:00:00Z"
};

// These fixtures exercise real UI recovery with controlled API responses only.
// No authentication provider or backend mutation is contacted.
// API states remain raw; the French detail page renders translated status labels.
for (const code of ["APPROVAL_EXPIRED", "APPROVAL_INVALID", "APPROVAL_STALE", "APPROVAL_ALREADY_RESOLVED"]) {
  for (const interrupted of [false, true]) {
    test(`a definitive ${code} after a ${interrupted ? "lost response" : "fresh request"} releases approval recovery`, async ({ app, browser, screen }) => {
      const origin = new URL(app.baseUrl!).origin;
      let current = structuredClone(approval);
      let reads = 0;
      const writes: { action: string; key: string; body: string }[] = [];
      await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
        ? route.continue() : route.abort());
      await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerId } } }));
      await browser.route(`**/api/v1/approvals/${approvalId}`, route => {
        reads += 1;
        return route.fulfill({ json: { data: current } });
      });
      await browser.route(`**/api/v1/approvals/${approvalId}:*`, async route => {
        const action = new URL(route.request.url).pathname.split(":").at(-1)!;
        writes.push({ action, key: route.request.headers["idempotency-key"], body: route.request.postData || "" });
        if (interrupted && writes.length === 1) return route.abort();
        if (action === "deny") {
          current = { ...current, state: "DENIED" };
          return route.fulfill({ json: { data: current } });
        }
        if (code === "APPROVAL_ALREADY_RESOLVED") current = { ...current, state: "DENIED" };
        await route.fulfill({ status: 409, json: { error: { code, message: `Definitive refusal: ${code}` } } });
      });
      await app.open(path);
      await screen.getByTestId("approval-offer-amount").fill("1290");
      if (interrupted) {
        await screen.getByRole("button", "Approuver").tap();
        await expect(screen.getByRole("button", "Vérifier le résultat")).toBeEnabled();
        await browser.reload();
        await expect(screen.getByRole("button", "Vérifier le résultat")).toBeEnabled();
      }
      const readsBeforeRefusal = reads;
      await screen.getByRole("button", interrupted ? "Vérifier le résultat" : "Approuver").tap();
      await expect(screen.getByRole("alert").filter({ hasText: `Definitive refusal: ${code}` })).toBeVisible();
      if (interrupted) expect(writes[1]).toEqual(writes[0]);
      await expect.poll(() => browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null")?.pending ?? null, recoveryKey)).toBeNull();
      await expect.poll(() => reads).toBe(readsBeforeRefusal + 1);
      await expect(screen.getByRole("button", "Vérifier le résultat")).toHaveCount(0);
      await expect(screen.getByTestId("approval-offer-amount")).toHaveValue("1290");
      if (code !== "APPROVAL_ALREADY_RESOLVED") {
        // Expiry/invalidity/staleness can leave the approval PENDING. A refusal
        // must remain possible instead of silently replaying the failed approval.
        await expect(screen.getByRole("button", "Refuser")).toBeEnabled();
        await screen.getByRole("button", "Refuser").tap();
        await expect(screen.getByText("Refusé", { exact: true })).toBeVisible();
        expect(writes.at(-1)?.action).toBe("deny");
        expect(writes.at(-1)?.key).not.toBe(writes[0].key);
      } else {
        await expect(screen.getByText("Refusé", { exact: true })).toBeVisible();
        await expect(screen.getByRole("button", "Approuver")).toHaveCount(0);
      }
      const finalWrites = writes.length;
      await browser.reload();
      await expect(screen.getByText("Refusé", { exact: true })).toBeVisible();
      await expect(screen.getByRole("button", "Vérifier le résultat")).toHaveCount(0);
      expect(writes).toHaveLength(finalWrites);
      await app.screenshot(`approval-definitive-${code}-${interrupted ? "replay" : "fresh"}`);
    });
  }
}

for (const code of ["IDEMPOTENCY_IN_PROGRESS", "IDEMPOTENCY_KEY_REUSE", "CONFLICT"]) {
  test(`an uncertain ${code} retains the exact approval attempt across reload`, async ({ app, browser, screen }) => {
    const origin = new URL(app.baseUrl!).origin;
    let current = structuredClone(approval);
    let reads = 0;
    const writes: { key: string; body: string }[] = [];
    await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
      ? route.continue() : route.abort());
    await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerId } } }));
    await browser.route(`**/api/v1/approvals/${approvalId}`, route => {
      reads += 1;
      return route.fulfill({ json: { data: current } });
    });
    await browser.route(`**/api/v1/approvals/${approvalId}:approve`, async route => {
      writes.push({ key: route.request.headers["idempotency-key"], body: route.request.postData || "" });
      if (writes.length === 1) return route.fulfill({ status: 409, json: { error: { code, message: `Uncertain conflict: ${code}` } } });
      current = { ...current, state: "APPROVED" };
      await route.fulfill({ json: { data: current } });
    });
    await app.open(path);
    await screen.getByTestId("approval-offer-amount").fill("1290");
    const readsBeforeConflict = reads;
    await screen.getByRole("button", "Approuver").tap();
    await expect(screen.getByRole("alert").filter({ hasText: `Uncertain conflict: ${code}` })).toBeVisible();
    await expect(screen.getByRole("button", "Vérifier le résultat")).toBeEnabled();
    await expect(screen.getByTestId("approval-offer-amount")).toBeDisabled();
    expect(reads).toBe(readsBeforeConflict);
    const pending = await browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null")?.pending ?? null, recoveryKey);
    expect(pending).toMatchObject({ action: "approve", ...writes[0] });
    await browser.reload();
    await expect(screen.getByRole("button", "Vérifier le résultat")).toBeEnabled();
    await screen.getByRole("button", "Vérifier le résultat").tap();
    await expect(screen.getByText("Approuvé", { exact: true })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
    await expect(screen.getByRole("button", "Vérifier le résultat")).toHaveCount(0);
  });
}

test("a definitive queue conflict refreshes resolved rows and releases other decisions", async ({ app, browser, screen }) => {
  const otherId = "66666666-6666-4666-8666-666666666666";
  const origin = new URL(app.baseUrl!).origin;
  let rows = [approval, { ...approval, approval_id: otherId }];
  let reads = 0;
  let writes = 0;
  await browser.route("**/*", route => new URL(route.request.url).origin === origin && ["GET", "HEAD"].includes(route.request.method)
    ? route.continue() : route.abort());
  await browser.route("**/api/v1/auth/session", route => route.fulfill({ json: { data: { authenticated: true, owner_id: ownerId } } }));
  await browser.route("**/api/v1/me/agents**", route => route.fulfill({ json: { data: { agents: [] } } }));
  await browser.route("**/api/v1/approvals**", async route => {
    if (route.request.method === "POST") {
      writes += 1;
      rows = rows.filter(row => row.approval_id !== approvalId);
      await route.fulfill({ status: 409, json: { error: { code: "APPROVAL_ALREADY_RESOLVED", message: "Approval already resolved" } } });
    } else {
      reads += 1;
      await route.fulfill({ json: { data: { approvals: rows, next_cursor: null } } });
    }
  });
  await app.open("/fr/my/approvals");
  await expect(screen.getByRole("button", "Approuver")).toHaveCount(2);
  const readsBeforeRefusal = reads;
  await screen.getByRole("button", "Approuver").first().tap();
  await expect(screen.getByRole("alert").filter({ hasText: "Approval already resolved" })).toBeVisible();
  await expect.poll(() => reads).toBe(readsBeforeRefusal + 1);
  await expect(screen.getByRole("button", "Approuver")).toHaveCount(1);
  await expect(screen.getByRole("button", "Approuver")).toBeEnabled();
  await expect.poll(() => browser.evaluate(key => JSON.parse(sessionStorage.getItem(key) || "null")?.pending ?? null, recoveryKey)).toBeNull();
  // The error keeps its link to the resolved detail for inspection; it must
  // not keep the other pending row locked behind the rejected attempt.
  await expect(screen.getByRole("link", "Ouvrir l’approbation pour continuer")).toHaveAttribute("href", path);
  expect(writes).toBe(1);
});
