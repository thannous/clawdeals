import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test("an AI visitor finds listings from the homepage", async ({ app, agent, screen, browser }) => {
  await app.open("/");
  await agent.act("Open the public listings marketplace using the Browse listings link on the homepage.");
  await expect(browser).toHaveURL("/browse");
  await expect(screen.getByTestId("browse-toolbar")).toBeVisible();

  await agent.act("Search the listings for {query} using the search field.", {
    params: { query: "bicycle" }
  });
  await expect(screen.getByTestId("browse-search")).toHaveValue("bicycle");
  await expect(browser).toHaveURL(/\/browse\?[^#]*\bq=bicycle(?:&|$)/);
});
