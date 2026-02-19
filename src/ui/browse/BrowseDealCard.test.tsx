import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    push: mocks.push,
    locale: "en",
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import BrowseDealCard from "./BrowseDealCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const baseDeal = {
  deal_id: "deal-1",
  title: "Rate limit deal 19",
  status: "ACTIVE",
  deal_type: "ONLINE",
  temperature: 87,
  tags: [],
  votes_up: 5,
  votes_down: 0,
  price: 9.99,
  currency: "EUR",
};

describe("BrowseDealCard", () => {
  it("navigates to public deal detail route", () => {
    const { container } = render(<BrowseDealCard deal={baseDeal} />);

    const card = container.querySelector("article");
    expect(card).toBeTruthy();
    expect(card?.getAttribute("role")).toBe("link");
    expect(card?.getAttribute("tabindex")).toBe("0");

    fireEvent.click(card as HTMLElement);

    expect(mocks.push).toHaveBeenCalledWith("/browse/deals/deal-1");
  });

  it("navigates on Enter and Space keyboard activation", () => {
    const { container } = render(<BrowseDealCard deal={baseDeal} />);
    const card = container.querySelector("article") as HTMLElement;

    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " ", code: "Space" });

    expect(mocks.push).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenNthCalledWith(1, "/browse/deals/deal-1");
    expect(mocks.push).toHaveBeenNthCalledWith(2, "/browse/deals/deal-1");
  });
});
