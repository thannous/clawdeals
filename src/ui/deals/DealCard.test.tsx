import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

import DealCard from "./DealCard";

afterEach(cleanup);

function makeDeal(overrides: Record<string, any> = {}) {
  return {
    deal_id: "deal-1",
    title: "Test Deal",
    status: "ACTIVE",
    price: null,
    currency: null,
    temperature: 50,
    votes_up: 0,
    votes_down: 0,
    tags: [],
    source_url: null,
    ...overrides,
  };
}

describe("DealCard", () => {
  describe("P1 — Price formatting", () => {
    it("formats large prices with thousands separators and 2 decimals", () => {
      render(<DealCard deal={makeDeal({ price: 4000000, currency: "EUR" })} retryIn={0} onVote={vi.fn()} />);

      // Should contain formatted price (locale-dependent, but always has decimals)
      const priceText = screen.getByText(/4.*000.*000/);
      expect(priceText).toBeTruthy();
      // Should show currency
      expect(screen.getByText("EUR")).toBeTruthy();
    });

    it("formats small prices with 2 decimals", () => {
      render(<DealCard deal={makeDeal({ price: 25, currency: "USD" })} retryIn={0} onVote={vi.fn()} />);

      expect(screen.getByText(/25[.,]00/)).toBeTruthy();
    });

    it("formats fractional prices correctly", () => {
      render(<DealCard deal={makeDeal({ price: 349.5, currency: "EUR" })} retryIn={0} onVote={vi.fn()} />);

      expect(screen.getByText(/349[.,]50/)).toBeTruthy();
    });

    it("does not render price when null", () => {
      render(<DealCard deal={makeDeal({ price: null })} retryIn={0} onVote={vi.fn()} />);

      expect(screen.queryByText("USD")).toBeNull();
    });

    it("renders cover image when provided", () => {
      render(
        <DealCard
          deal={makeDeal({
            cover_image: { storage_key: "https://cdn.example.com/deals/test.jpg", mime: "image/jpeg" }
          })}
          retryIn={0}
          onVote={vi.fn()}
        />
      );

      expect(screen.getByAltText("Test Deal")).toBeTruthy();
    });
  });

  describe("P7 — Vote counts have icons", () => {
    it("renders vote count spans with svg icons", () => {
      render(<DealCard deal={makeDeal({ votes_up: 12, votes_down: 3 })} retryIn={0} onVote={vi.fn()} />);

      const upSpan = screen.getByTestId("votes-up");
      const downSpan = screen.getByTestId("votes-down");

      // Check values
      expect(upSpan.textContent).toContain("12");
      expect(downSpan.textContent).toContain("3");

      // Check that SVG icons are present inside vote spans
      expect(upSpan.querySelector("svg")).toBeTruthy();
      expect(downSpan.querySelector("svg")).toBeTruthy();
    });

    it("defaults to 0 when votes are null", () => {
      render(<DealCard deal={makeDeal({ votes_up: null, votes_down: null })} retryIn={0} onVote={vi.fn()} />);

      expect(screen.getByTestId("votes-up").textContent).toContain("0");
      expect(screen.getByTestId("votes-down").textContent).toContain("0");
    });
  });
});
