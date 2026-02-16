import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

import AppNav from "./AppNav";

afterEach(cleanup);

describe("AppNav", () => {
  it("renders 6 nav items including offers (P4)", () => {
    render(<AppNav current="listings" />);

    const nav = screen.getByTestId("app-nav");
    const links = nav.querySelectorAll("a");
    expect(links.length).toBe(6);
  });

  it("renders offers link pointing to /my/offers (P4)", () => {
    render(<AppNav current="listings" />);

    const offersLink = screen.getByText("nav.offers");
    expect(offersLink).toBeTruthy();
    expect(offersLink.getAttribute("href")).toBe("/my/offers");
  });

  it("marks the current tab with aria-current=page", () => {
    render(<AppNav current="offers" />);

    const offersLink = screen.getByText("nav.offers");
    expect(offersLink.getAttribute("aria-current")).toBe("page");

    // Other links should NOT have aria-current
    const listingsLink = screen.getByText("nav.listings");
    expect(listingsLink.getAttribute("aria-current")).toBeNull();
  });

  it("has overflow-x-auto for mobile horizontal scroll (P6)", () => {
    render(<AppNav current="listings" />);

    const nav = screen.getByTestId("app-nav");
    expect(nav.className).toContain("overflow-x-auto");
  });

  it("has whitespace-nowrap on links to prevent wrapping (P6)", () => {
    render(<AppNav current="listings" />);

    const links = screen.getByTestId("app-nav").querySelectorAll("a");
    for (const link of links) {
      expect(link.className).toContain("whitespace-nowrap");
    }
  });

  it("renders offers between approvals and threads", () => {
    render(<AppNav current="listings" />);

    const links = screen.getByTestId("app-nav").querySelectorAll("a");
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"));
    const approvalsIdx = hrefs.indexOf("/my/approvals");
    const offersIdx = hrefs.indexOf("/my/offers");
    const threadsIdx = hrefs.indexOf("/my/threads");

    expect(offersIdx).toBe(approvalsIdx + 1);
    expect(threadsIdx).toBe(offersIdx + 1);
  });
});
