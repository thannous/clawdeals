// A bounded, model-free dogfood session, not a CLI qualification report.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "e2e";
import { openHost } from "e2e/runner";
import { describeError, reserveOutput } from "./evidence.mjs";
import { safeFile, sha256 } from "./manifest.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const script = "e2e/testerarmy/explore-host.mjs";
const git = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Cannot identify dogfood source.");
  return result.stdout.trim();
};
const version = (name) =>
  JSON.parse(
    readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
  ).version;
const source = () => ({
  revision: git(["rev-parse", "HEAD"]),
  dirty: Boolean(git(["status", "--porcelain"])),
  harnessSha256: sha256(readFileSync(join(root, script))),
});
const fileReceipt = (absolute) => {
  const path = relative(root, absolute);
  const bytes = readFileSync(safeFile(root, path));
  assert.ok(bytes.length > 0, "Evidence file must not be empty.");
  return { path, bytes: bytes.length, sha256: sha256(bytes) };
};

assert.equal(
  process.argv.length,
  2,
  "Set E2E_BASE_URL and PARITY_OUTPUT through the environment; no positional arguments.",
);
const base = new URL(process.env.E2E_BASE_URL || "http://localhost:4327");
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
    ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password &&
    !base.search &&
    !base.hash &&
    base.pathname === "/",
  "This dogfood pilot attaches only to a running local app origin.",
);
const output = reserveOutput(
  root,
  process.env.PARITY_OUTPUT,
  "host-exploration",
);
Object.assign(process.env, {
  E2E_BASE_URL: base.origin,
  PARITY_OUTPUT: `${output}/sdk`,
  TESTERARMY_AI: "0",
  TESTERARMY_HISTORICAL: "0",
  TESTERARMY_MISSION_LIVE: "0",
  TESTERARMY_PRODUCTION_PUBLIC: "0",
});
const receipt = {
  format: "clawdeals-host-exploration-v1",
  qualification: "exploratory sessions; not an e2e CLI run",
  startedAt: new Date().toISOString(),
  node: process.version,
  runner: { name: "e2e", version: version("e2e") },
  engine: { name: "@e2e-dev/web", version: version("@e2e-dev/web") },
  sourceBefore: source(),
  sourceTracking:
    "Revision and harness hash only; not the complete application input graph.",
  command: [process.execPath, script],
  target: "mobile",
  baseURL: base.origin,
  output,
  fixtures:
    "No API mocks or database fixtures; only an inert synthetic cookie/localStorage marker.",
  runId: null,
  sessions: [],
  errors: [],
  hostCloseErrors: [],
};
writeFileSync(
  join(root, output, "host-command.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { flag: "wx" },
);
const marker = { key: "clawdeals_host_isolation_probe", value: randomUUID() };
const readMarker = (browser) =>
  browser.evaluate(
    ({ key }) => ({
      cookiePresent: document.cookie
        .split(";")
        .some((cookie) => cookie.trim().startsWith(`${key}=`)),
      storage: localStorage.getItem(key),
    }),
    marker,
  );

let host;
try {
  host = await openHost({
    cwd: root,
    config: "e2e.config.ts",
    target: "mobile",
    signal: AbortSignal.timeout(180_000),
  });
  receipt.runId = host.runId;
  for (const locale of ["fr", "es"]) {
    let session;
    const record = {
      locale,
      attemptId: null,
      screenshots: [],
      steps: [],
      errors: [],
      closeErrors: [],
    };
    receipt.sessions.push(record);
    try {
      session = await host.openSession({
        name: `Public catalogue and isolated storage (${locale})`,
        timeout: 60_000,
      });
      record.attemptId = session.attemptId;
      const { app, browser, screen } = session.fixtures;
      const messages = JSON.parse(
        readFileSync(join(root, `messages/${locale}.json`), "utf8"),
      ).browse;
      await app.open(`/${locale}/browse`);
      await expect(browser.locator("h1")).toContainText(messages.title);
      await expect(screen.getByTestId("browse-search")).toHaveAttribute(
        "placeholder",
        messages.search,
      );
      record.initialMarker = await readMarker(browser);
      assert.deepEqual(
        record.initialMarker,
        { cookiePresent: false, storage: null },
        "A new hosted session must not inherit the preceding session's state.",
      );
      if (locale === "fr") {
        await browser.setCookies([
          {
            name: marker.key,
            value: marker.value,
            url: base.origin,
            sameSite: "Lax",
          },
        ]);
        await browser.evaluate(({ key, value }) => {
          localStorage.setItem(key, value);
          return null;
        }, marker);
        await browser.reload();
        record.persistedMarker = await readMarker(browser);
        assert.deepEqual(
          record.persistedMarker,
          { cookiePresent: true, storage: marker.value },
          "The probe must survive reload before testing session isolation.",
        );
      }
      await screen.getByTestId("browse-filters-toggle").tap();
      await expect(screen.getByTestId("browse-filters-toggle")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await screen.getByTestId("condition-GOOD").tap();
      await expect(browser).toHaveURL(/condition=GOOD/);
      await screen.getByTestId("browse-price-max").fill("500");
      await expect(browser).toHaveURL(/price_max=500/);
      await screen.getByTestId("sort-price_asc").tap();
      await expect(screen.getByTestId("sort-price_asc")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      const query = `clawdealshostabsent${marker.value.replaceAll("-", "")}`;
      await screen.getByTestId("browse-search").fill(query);
      await expect(browser).toHaveURL(new RegExp(`q=${query}`));
      await expect(screen.getByTestId("browse-empty")).toBeVisible();
      // The button's CSS renders uppercase; preserve the localized wording.
      await expect(screen.getByTestId("browse-reset-filters")).toHaveText(
        new RegExp(`^${messages.resetFilters}$`, "i"),
      );
      record.screenshots.push(
        fileReceipt(
          resolve(
            session.artifactsDir,
            await app.screenshot(`${locale}-filtered-empty`),
          ),
        ),
      );
      await screen.getByTestId("browse-reset-filters").tap();
      await expect(screen.getByTestId("browse-search")).toHaveValue("");
      await expect(screen.getByTestId("browse-price-max")).toHaveValue("");
      await expect(screen.getByTestId("condition-GOOD")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(browser).toHaveURL(`/${locale}/browse?sort=price_asc`);
      await expect(screen.getByTestId("browse-loading")).not.toBeVisible();
      await expect(screen.getByTestId("browse-error")).not.toBeVisible();
      record.finalURL = await browser.url();
      record.screenshots.push(
        fileReceipt(
          resolve(
            session.artifactsDir,
            await app.screenshot(`${locale}-recovered`),
          ),
        ),
      );
    } catch (error) {
      record.errors.push(describeError(error));
    } finally {
      if (session) {
        try {
          record.closeErrors = await session.close();
        } catch (error) {
          record.closeErrors.push(describeError(error));
        }
        record.steps = session.steps();
        record.tracePath = session.tracePath;
        try {
          record.trace = fileReceipt(session.tracePath);
        } catch (error) {
          record.errors.push(describeError(error));
        }
      }
    }
    console.log(
      JSON.stringify({
        locale,
        attemptId: record.attemptId,
        steps: record.steps.length,
        errors: record.errors,
        closeErrors: record.closeErrors,
      }),
    );
    if (record.closeErrors.length) break;
  }
} catch (error) {
  receipt.errors.push(describeError(error));
} finally {
  if (host) {
    try {
      receipt.hostCloseErrors = await host.close();
    } catch (error) {
      receipt.hostCloseErrors.push(describeError(error));
    }
  }
}
receipt.sourceAfter = source();
receipt.finishedAt = new Date().toISOString();
// 0.21 records model calls as events; metrics/model provenance are optional
// on deterministic steps. Unknown shapes fail closed instead of implying zero.
const exactKinds = new Set([
  "locator",
  "assertion",
  "screen",
  "app",
  "session",
  "resource",
]);
const modelFree = receipt.sessions
  .flatMap((session) => session.steps)
  .every(
    (step) =>
      exactKinds.has(step.kind) &&
      Array.isArray(step.events) &&
      step.events.every((event) => event.kind !== "model") &&
      step.metrics === undefined &&
      step.model === undefined,
  );
receipt.modelCalls = modelFree ? 0 : null;
receipt.passed =
  receipt.sessions.length === 2 &&
  receipt.errors.length === 0 &&
  receipt.hostCloseErrors.length === 0 &&
  receipt.modelCalls === 0 &&
  receipt.sessions.every(
    (session) =>
      session.attemptId &&
      session.trace &&
      !session.errors.length &&
      !session.closeErrors.length &&
      session.steps.length > 0 &&
      session.steps.every(
        (step) => step.status === "passed" && step.kind !== "agent",
      ),
  );
writeFileSync(
  join(root, output, "host-result.json"),
  JSON.stringify(receipt, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    output,
    passed: receipt.passed,
    runId: receipt.runId,
    sessions: receipt.sessions.length,
    modelCalls: receipt.modelCalls,
  }),
);
if (!receipt.passed) process.exitCode = 1;
