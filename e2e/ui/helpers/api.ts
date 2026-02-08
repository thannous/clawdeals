import type { Page, Request } from "@playwright/test";

type ExpectedQuery = Record<string, string | RegExp>;

function toUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function matchesQuery(searchParams: URLSearchParams, expected: ExpectedQuery) {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = searchParams.get(key);
    if (expectedValue instanceof RegExp) {
      if (!actual || !expectedValue.test(actual)) return false;
      continue;
    }
    if (actual !== expectedValue) return false;
  }
  return true;
}

export function waitForApiGet(page: Page, pathname: string, expectedQuery: ExpectedQuery) {
  return page.waitForRequest((req: Request) => {
    if (req.method() !== "GET") return false;
    const url = toUrl(req.url());
    if (!url) return false;
    if (url.pathname !== pathname) return false;
    return matchesQuery(url.searchParams, expectedQuery);
  });
}

export function waitForApiPostJson(
  page: Page,
  pathname: string,
  expectedJson: Record<string, unknown>
) {
  return page.waitForRequest((req: Request) => {
    if (req.method() !== "POST") return false;
    const url = toUrl(req.url());
    if (!url) return false;
    if (url.pathname !== pathname) return false;

    let body: any;
    try {
      body = req.postDataJSON();
    } catch {
      return false;
    }

    for (const [key, expectedValue] of Object.entries(expectedJson)) {
      if (body?.[key] !== expectedValue) return false;
    }
    return true;
  });
}

