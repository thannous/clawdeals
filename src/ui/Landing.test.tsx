import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicStub() {
      return null;
    };
  }
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  )
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

describe("Landing Mission Select", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates active mission context when a mission is clicked", () => {
    render(
      <Landing
        locale="en"
        buildTimeIso="2026-02-11T12:00:00.000Z"
        appVersion="0.0.1"
        deploySha="abcdef1234567890"
      />
    );

    expect(screen.getByRole("tab", { name: /MARKET_WATCH/ })).toBeTruthy();
    expect(screen.getByText("Monitoring active. 3 criteria configured.")).toBeTruthy();

    const adminCoreTab = screen.getByRole("tab", { name: /ADMIN_CORE/ });
    fireEvent.click(adminCoreTab);

    expect(screen.getByRole("tab", { name: /ADMIN_CORE/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /MARKET_WATCH/ }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("Listing created: MacBook Pro M3 14\"")).toBeTruthy();
  });
});
