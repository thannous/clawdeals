import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useMyThreads: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>
}));

vi.mock("next/router", () => ({
  useRouter: () => ({ locale: "en", asPath: "/my/threads", push: vi.fn(), replace: vi.fn() })
}));

vi.mock("./useMyThreads", () => ({
  useMyThreads: mocks.useMyThreads,
}));

vi.mock("./MyThreadsToolbar", () => ({
  default: () => <div data-testid="toolbar">toolbar</div>
}));

import MyThreadsPage from "./MyThreadsPage";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

function buildHookState(overrides: Record<string, any> = {}) {
  return {
    items: [],
    status: null,
    setStatus: vi.fn(),
    nextCursor: null,
    fetchState: "done",
    loadMoreState: "idle",
    error: null,
    loadMore: vi.fn(),
    refetch: vi.fn(),
    ...overrides,
  };
}

describe("MyThreadsPage", () => {
  describe("P3 — Contextual empty states", () => {
    it("shows 'noThreadsYet' when no filter is active and no data", () => {
      mocks.useMyThreads.mockReturnValue(buildHookState({ status: null, items: [] }));

      render(<MyThreadsPage />);

      expect(screen.getByText("noThreadsYet")).toBeTruthy();
      expect(screen.getByText("noThreadsHint")).toBeTruthy();
    });

    it("shows 'noThreads' with 'adjustFilters' when a filter is active", () => {
      mocks.useMyThreads.mockReturnValue(buildHookState({ status: "OPEN", items: [] }));

      render(<MyThreadsPage />);

      expect(screen.getByText("noThreads")).toBeTruthy();
      expect(screen.getByText("adjustFilters")).toBeTruthy();
    });

    it("does not show empty state when items are present", () => {
      mocks.useMyThreads.mockReturnValue(buildHookState({
        items: [{ thread_id: "t1", listing_id: "l1", buyer_agent_id: "b1", seller_agent_id: "s1", status: "OPEN", created_at: "2025-01-01" }],
      }));

      render(<MyThreadsPage />);

      expect(screen.queryByText("noThreadsYet")).toBeNull();
      expect(screen.queryByText("noThreads")).toBeNull();
    });
  });

  it("renders AppNav with current='threads'", () => {
    mocks.useMyThreads.mockReturnValue(buildHookState());

    render(<MyThreadsPage />);

    const threadsLink = screen.getByText("nav.threads");
    expect(threadsLink.getAttribute("aria-current")).toBe("page");
  });
});
