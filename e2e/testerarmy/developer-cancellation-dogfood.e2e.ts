import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

const oldKey = "cd_test_cancelled_synthetic_only";
const newKey = "cd_test_current_synthetic_only";

beforeEach(async ({ app, browser }) => {
  const origin = new URL(app.baseUrl!).origin;
  await browser.route("**/*", async route => {
    const url = new URL(route.request.url);
    if (url.origin !== origin || !["GET", "HEAD"].includes(route.request.method)) {
      await route.abort();
      return;
    }
    await route.continue();
  });
});

test("API key entry keeps its field and actions inside the viewport", async ({ app, screen, browser }) => {
  await app.open("/developer");
  await screen.getByRole("button", "Paste key").tap();
  await screen.getByLabel("API key").fill(newKey);
  await app.screenshot("developer-key-entry");
  const layout = await browser.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    cancelRight: Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Cancel")!.getBoundingClientRect().right
  }));
  expect(layout.content).toBeLessThanOrEqual(layout.viewport);
  expect(layout.cancelRight).toBeLessThanOrEqual(layout.viewport);
  await screen.getByRole("button", "Cancel").tap();
  await expect(screen.getByLabel("API key")).toHaveCount(0);
});

for (const replacesKey of [false, true]) {
  for (const lateStatus of [200, 401]) {
    test(`cancelled key validation ignores a late ${lateStatus} response ${replacesKey ? "after saving a replacement" : "without another action"}`, async ({ app, screen, browser }) => {
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      let requests = 0;
      await browser.route("**/api/v1/deals?limit=1", async route => {
        requests += 1;
        if (requests === 1) {
          await pending;
          await route.fulfill({ status: lateStatus, json: lateStatus === 200 ? { data: [] } : {
            error: { code: "UNAUTHORIZED", message: "Synthetic cancelled key rejected" }
          } });
          return;
        }
        await route.fulfill({ json: { data: [] } });
      });
      try {
        await app.open("/developer");
        await screen.getByRole("button", "Paste key").tap();
        await screen.getByLabel("API key").fill(oldKey);
        await screen.getByRole("button", "Save").tap();
        await expect.poll(() => requests).toBe(1);
        await screen.getByRole("button", "Cancel").tap();
        // Cancellation must finish immediately, while the original request is held.
        await expect(screen.getByRole("button", "Test API")).toBeVisible();
        if (replacesKey) {
          await screen.getByRole("button", "Paste key").tap();
          await screen.getByLabel("API key").fill(newKey);
          await screen.getByRole("button", "Save").tap();
          await expect(screen.getByText("Key saved.")).toBeVisible();
        }
        const response = browser.waitForResponse("**/api/v1/deals?limit=1");
        release();
        await (await response).json();
        // Wait through browser rendering after the delayed fetch settles.
        await browser.evaluate(() => new Promise<null>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
        expect(await browser.evaluate(() => localStorage.getItem("clawdeals_api_key"))).toBe(replacesKey ? newKey : null);
        await expect(screen.getByText("Key saved.")).toHaveCount(replacesKey ? 1 : 0);
        await expect(screen.getByText("Synthetic cancelled key rejected")).toHaveCount(0);
        await browser.reload();
        if (replacesKey) await expect(screen.getByTestId("dev-key")).toContainText("cd_tes…only");
        else {
          await expect(screen.getByText("NO KEY")).toBeVisible();
          await expect(screen.getByRole("button", "Test API")).toBeDisabled();
        }
        expect(await browser.evaluate(() => localStorage.getItem("clawdeals_api_key"))).toBe(replacesKey ? newKey : null);
        await app.screenshot(`cancelled-key-late-${lateStatus}-${replacesKey ? "replaced" : "alone"}`);
      } finally {
        release();
      }
    });
  }
}

test("forgetting a key during an API test ignores its late success", async ({ app, screen, browser }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await browser.route("**/api/v1/deals?limit=1", async route => {
    started = true;
    await pending;
    await route.fulfill({ json: { data: [] } });
  });
  try {
    await app.open("/developer");
    await browser.evaluate(key => { localStorage.setItem("clawdeals_api_key", key); return null; }, oldKey);
    await browser.reload();
    await screen.getByRole("button", "Test API").tap();
    await expect.poll(() => started).toBe(true);
    await screen.getByRole("button", "Forget").tap();
    await expect(screen.getByText("NO KEY")).toBeVisible();
    const response = browser.waitForResponse("**/api/v1/deals?limit=1");
    release();
    await (await response).json();
    await browser.evaluate(() => new Promise<null>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
    expect(await browser.evaluate(() => localStorage.getItem("clawdeals_api_key"))).toBeNull();
    await expect(screen.getByText("OK: API reachable with your key.")).toHaveCount(0);
    await expect(screen.getByRole("button", "Test API")).toBeDisabled();
    await app.screenshot("forgotten-key-pending-test");
  } finally {
    release();
  }
});
