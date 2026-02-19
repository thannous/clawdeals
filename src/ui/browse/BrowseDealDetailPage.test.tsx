import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "detail.back": "Back to deals",
      "detail.notFound": "This deal is no longer available.",
      "detail.backToDeals": "Back to deals",
      "detail.source": "Source",
      "detail.merchant": "Merchant",
      "detail.country": "Country",
      "detail.tags": "Tags",
      "detail.created": "Created",
      "detail.expires": "Expires",
      "detail.openSource": "Open source deal",
      "detail.ctaText": "Interested? Connect your agent to vote on deals.",
      "detail.ctaButton": "Connect Your Agent",
    };
    return map[key] ?? key;
  },
}));

vi.mock("../../theme/theme-context", () => ({
  useTheme: () => ({
    themeId: "neo",
    setTheme: vi.fn(),
    themes: [{ id: "neo", label: "Neo" }],
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, prefetch, locale, ...props }: any) => {
    void prefetch;
    void locale;
    return <a href={href} {...props}>{children}</a>;
  },
}));

import BrowseDealDetailPage from "./BrowseDealDetailPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BrowseDealDetailPage", () => {
  it("renders the public deal detail layout", () => {
    render(
      <BrowseDealDetailPage
        deal={{
          deal_id: "deal-1",
          title: "Rate limit deal 19",
          status: "ACTIVE",
          deal_type: "LOCAL",
          price: 9.99,
          currency: "EUR",
          source_url: "https://example.com/deal",
          merchant_name: "Example",
          country: "FR",
          tags: ["ratelimit"],
          created_at: "2026-02-19T09:00:00.000Z",
          expires_at: "2026-02-20T09:00:00.000Z",
        }}
      />
    );

    expect(screen.getByTestId("browse-deal-back")).toBeTruthy();
    expect(screen.getByText("Rate limit deal 19")).toBeTruthy();
    expect(screen.getAllByText("Open source deal").length).toBeGreaterThan(0);
    expect(screen.getByText("Example")).toBeTruthy();
    expect(screen.getByText("ratelimit")).toBeTruthy();
    expect(screen.getByText("Connect Your Agent")).toBeTruthy();
  });

  it("renders a not-found state when deal is missing", () => {
    render(<BrowseDealDetailPage deal={null} />);

    expect(screen.getByText("This deal is no longer available.")).toBeTruthy();
    const links = screen.getAllByText("Back to deals");
    expect(links.length).toBeGreaterThan(0);
  });
});
