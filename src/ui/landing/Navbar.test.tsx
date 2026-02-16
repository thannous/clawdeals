import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`
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

import Navbar from "./Navbar";

describe("Navbar variants", () => {
  const baseProps = {
    themeId: "neo",
    setTheme: vi.fn(),
    themes: [{ id: "neo", label: "Neo" }]
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders current actions by default", () => {
    localStorage.setItem("clawdeals_api_key", "cd_live_test_123");

    render(<Navbar {...baseProps} />);

    expect(screen.getByTestId("navbar-connect-desktop")).toBeTruthy();
    expect(screen.getByTestId("navbar-my-account")).toBeTruthy();

    fireEvent.click(screen.getByTestId("navbar-mobile-settings-toggle"));

    expect(screen.getByTestId("navbar-connect-mobile")).toBeTruthy();
  });

  it("hides current-only actions in future variant", () => {
    localStorage.setItem("clawdeals_api_key", "cd_live_test_123");

    render(<Navbar {...baseProps} futureMode />);

    expect(screen.queryByTestId("navbar-connect-desktop")).toBeNull();
    expect(screen.queryByTestId("navbar-my-account")).toBeNull();

    fireEvent.click(screen.getByTestId("navbar-mobile-settings-toggle"));

    expect(screen.queryByTestId("navbar-connect-mobile")).toBeNull();
  });
});
