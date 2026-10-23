import { beforeEach, test } from "@e2e-dev/web";
import { expect } from "e2e";

// This client navigation contract uses synthetic responses, without creating
// real agents or sending requests to the supplied continuation destinations.
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
  await browser.route("**/api/v1/auth/session", route => route.fulfill({
    status: 200, json: { data: { authenticated: false } }
  }));
  await browser.route("**/api/v1/agents", route => route.fulfill({
    status: 201,
    json: { data: { agent_id: "11111111-1111-4111-8111-111111111111", api_key: "cd_test_keys_navigation_only" } }
  }));
});

const rejected = [
  ["suffix lookalike", "https://evilclawdeals.com/mcp"],
  ["hostname suffix", "https://clawdeals.com.evil.example/mcp"],
  ["backslash authority", "/\\evil.example/mcp"],
  ["protocol-relative authority", "//evil.example/mcp"],
  ["tab authority", "/\t/evil.example/mcp"],
  ["newline authority", "/\n/evil.example/mcp"],
  ["non-HTTP scheme", "ftp://clawdeals.com/mcp"],
  ["script scheme", "javascript://clawdeals.com/%0Aalert(1)"],
  ["user information", "https://clawdeals.com@evil.example/mcp"],
  ["normalized double slash", "/a/..//evil.example/mcp"]
] as const;

for (const [label, destination] of rejected) {
  test(`API key continuation rejects ${label} before and after generation`, async ({ app, screen }) => {
    await app.open(`/keys?next=${encodeURIComponent(destination)}`);
    await expect(screen.getByRole("link", "MCP")).toHaveAttribute("href", "/mcp");
    await screen.getByRole("button", "Generate key").tap();
    await expect(screen.getByRole("link", "Continue to MCP setup")).toHaveAttribute("href", "/mcp");
    await expect(screen.getByRole("link", "MCP")).toHaveAttribute("href", "/mcp");
  });
}

const allowed = [
  ["/fr/mcp?step=2#setup", "/fr/mcp?step=2#setup"],
  ["https://clawdeals.com/mcp?step=2#setup", "https://clawdeals.com/mcp?step=2#setup"],
  ["https://www.clawdeals.com/mcp", "https://www.clawdeals.com/mcp"],
  ["https://APP.CLAWDEALS.COM/mcp", "https://app.clawdeals.com/mcp"],
  ["http://docs.clawdeals.com:8080/mcp", "http://docs.clawdeals.com:8080/mcp"],
  ["http://localhost:4318/mcp", "http://localhost:4318/mcp"]
] as const;

for (const [destination, expected] of allowed) {
  test(`API key continuation preserves ${destination}`, async ({ app, screen }) => {
    await app.open(`/keys?next=${encodeURIComponent(destination)}`);
    await expect(screen.getByRole("link", "MCP")).toHaveAttribute("href", expected);
    await screen.getByRole("button", "Generate key").tap();
    await expect(screen.getByRole("link", "Continue to MCP setup")).toHaveAttribute("href", expected);
  });
}

test("API key continuation falls back for duplicate query values and follows a safe local path", async ({ app, browser, screen }) => {
  await app.open("/keys?next=%2Fmcp&next=https%3A%2F%2Fevilclawdeals.com");
  await expect(screen.getByRole("link", "MCP")).toHaveAttribute("href", "/mcp");
  await app.open("/keys?next=%2Fmcp%3Fstep%3D2%23setup");
  await screen.getByRole("button", "Generate key").tap();
  await screen.getByRole("link", "Continue to MCP setup").tap();
  await expect(browser).toHaveURL(new URL("/mcp?step=2#setup", app.baseUrl).href);
});

test("API key validation preserves the safe default continuation", async ({ app, browser, screen }) => {
  await browser.route("**/api/v1/deals?limit=1", route => route.fulfill({
    status: 200, json: { data: [] }
  }));
  await app.open("/keys");
  await expect(screen.getByRole("link", "MCP")).toHaveAttribute("href", "/mcp");
  await screen.getByRole("button", "I have a key").tap();
  await screen.getByLabel("API key").fill("cd_test_keys_navigation_only");
  await screen.getByRole("button", "Validate").tap();
  await expect(screen.getByRole("link", "Continue to MCP setup")).toHaveAttribute("href", "/mcp");
});
