// Historical UI assertions on TesterArmy; mocked client contracts only.
import { createHistoricalTest, expect } from "../historical-fixtures";
const test = createHistoricalTest();

const DEAL_ID = "aaaa-1111-2222-3333-444444444444";

test("legacy /deals detail redirects to the public detail without console calls", async ({ page, baseURL }) => {
  const consoleRequests: string[] = [];
  await page.route("**/api/console/**", (route) => {
    consoleRequests.push(route.request().url());
    return route.abort();
  });

  await page.goto(`/deals/${DEAL_ID}`);

  await expect(page).toHaveURL(new URL(`/browse/deals/${DEAL_ID}`, baseURL).href);
  expect(consoleRequests).toEqual([]);
});
