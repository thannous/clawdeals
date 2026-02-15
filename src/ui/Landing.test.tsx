import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
    // With mock translations, bot text is the key string
    expect(screen.getByText("chat.missions.market_watch.message_0.text")).toBeTruthy();

    const adminCoreTab = screen.getByRole("tab", { name: /ADMIN_CORE/ });
    fireEvent.click(adminCoreTab);

    expect(screen.getByRole("tab", { name: /ADMIN_CORE/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /MARKET_WATCH/ }).getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("chat.missions.admin_core.message_0.text")).toBeTruthy();
  });
});
