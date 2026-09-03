import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    // Return plausible values for keys that get parsed
    if (key.endsWith("Count")) return "2";
    if (key.endsWith(".type")) return "bot";
    return key;
  }
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicStub() {
      return null;
    };
  }
}));

vi.mock("next/link", () => ({
  default: ({ children, href, prefetch, locale, ...props }) => {
    void prefetch;
    void locale;
    return (
      <a href={typeof href === "string" ? href : "#"} {...props}>
        {children}
      </a>
    );
  }
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    locale: "en",
    asPath: "/",
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn()
  })
}));

vi.mock("../theme/theme-context", () => ({
  useTheme: () => ({
    themeId: "neo",
    setTheme: vi.fn(),
    themes: [{ id: "neo", label: "Neo" }]
  })
}));

import Landing from "./Landing";

describe("Landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(cleanup);

  it("renders current variant CTAs by default", () => {
    const { container } = render(
      <Landing
        locale="en"
        buildTimeIso="2026-02-11T12:00:00.000Z"
        appVersion="0.0.1"
        deploySha="abcdef1234567890"
      />
    );

    expect(screen.queryByText("future.bannerTitle")).toBeNull();
    expect(screen.getByTestId("navbar-connect-desktop")).toBeTruthy();
    expect(container.querySelector('a[href="/start"]')).toBeTruthy();
  });

  it("renders future variant and hides connect CTAs", () => {
    const { container } = render(
      <Landing
        locale="en"
        buildTimeIso="2026-02-11T12:00:00.000Z"
        appVersion="0.0.1"
        deploySha="abcdef1234567890"
        futureMode
      />
    );

    expect(screen.getByText("future.bannerTitle")).toBeTruthy();
    expect(screen.getAllByText("future.badge").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("navbar-connect-desktop")).toBeNull();
    expect(container.querySelector('a[href="/start"]')).toBeNull();
  });

  it("tells one story: audience line, single marketplace showcase, two connect CTAs", () => {
    const { container } = render(
      <Landing
        locale="en"
        buildTimeIso="2026-02-11T12:00:00.000Z"
        appVersion="0.0.1"
        deploySha="abcdef1234567890"
      />
    );

    expect(screen.getByTestId("hero-audience").textContent).toBe("hero.audience");
    expect(screen.getByTestId("landing-core-ideas")).toBeTruthy();
    expect(screen.getByTestId("landing-visitor-steps")).toBeTruthy();
    expect(screen.getByTestId("landing-final-cta")).toBeTruthy();

    // The deal-feed tab and the interactive demos no longer live on the landing.
    expect(screen.queryByRole("tab", { name: /MARKET_WATCH/ })).toBeNull();
    expect(screen.queryByText("hero.deals.title")).toBeNull();
    expect(screen.getByTestId("showcase-browse-cta").getAttribute("href")).toBe("/browse");

    const connectCtas = Array.from(container.querySelectorAll("main a[href='/start']"));
    expect(connectCtas).toHaveLength(2);
  });
});
