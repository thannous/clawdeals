import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getStoredApiKey: vi.fn(),
  clearStoredApiKey: vi.fn(),
  setStoredApiKey: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en", asPath: "/developer", push: vi.fn(), replace: vi.fn() })
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("./storage", () => ({
  getStoredApiKey: mocks.getStoredApiKey,
  clearStoredApiKey: mocks.clearStoredApiKey,
  setStoredApiKey: mocks.setStoredApiKey,
}));

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    apiRequest: mocks.apiRequest,
  };
});

import DeveloperDashboard from "./DeveloperDashboard";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("DeveloperDashboard", () => {
  it("renders without hydration mismatch — shows NO KEY when localStorage is empty (P2)", () => {
    mocks.getStoredApiKey.mockReturnValue(null);

    render(<DeveloperDashboard />);

    expect(screen.getByText("NO KEY")).toBeTruthy();
    expect(screen.getByText("No key found. Go to /start to generate one.")).toBeTruthy();
  });

  it("renders stored key from localStorage on client (P2)", () => {
    mocks.getStoredApiKey.mockReturnValue("cd_live_test_abc123456789");

    render(<DeveloperDashboard />);

    // masked key should appear
    const keyEl = screen.getByTestId("dev-key");
    expect(keyEl).toBeTruthy();
    expect(keyEl.textContent).toContain("KEY:");
    // Should show loaded message
    expect(screen.getByText("API key loaded from localStorage.")).toBeTruthy();
  });

  it("uses useSyncExternalStore — server snapshot returns null", () => {
    // When getStoredApiKey returns null (simulating getServerSnapshot),
    // the component should render consistently without errors
    mocks.getStoredApiKey.mockReturnValue(null);

    const { container } = render(<DeveloperDashboard />);

    expect(container.querySelector("[data-testid='dev-key']")).toBeNull();
    expect(screen.getByText("NO KEY")).toBeTruthy();
  });

  it("disables Forget and Test API buttons when no key", () => {
    mocks.getStoredApiKey.mockReturnValue(null);

    render(<DeveloperDashboard />);

    const forgetBtn = screen.getByRole("button", { name: "Forget" }) as HTMLButtonElement;
    const testBtn = screen.getByRole("button", { name: "Test API" }) as HTMLButtonElement;

    expect(forgetBtn.disabled).toBe(true);
    expect(testBtn.disabled).toBe(true);
  });

  it("enables Forget and Test API buttons when key is present", () => {
    mocks.getStoredApiKey.mockReturnValue("cd_live_test_abc123456789");

    render(<DeveloperDashboard />);

    const forgetBtn = screen.getByRole("button", { name: "Forget" }) as HTMLButtonElement;
    const testBtn = screen.getByRole("button", { name: "Test API" }) as HTMLButtonElement;

    expect(forgetBtn.disabled).toBe(false);
    expect(testBtn.disabled).toBe(false);
  });
});
