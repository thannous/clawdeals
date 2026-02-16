import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowseDeals } from "./useBrowseDeals";

const mocks = vi.hoisted(() => ({
  router: {
    isReady: true,
    query: {} as Record<string, any>,
    pathname: "/browse/deals",
    replace: vi.fn(),
  },
}));

vi.mock("next/router", () => ({
  useRouter: () => mocks.router,
}));

function mockFetchResponse(data: any) {
  return Promise.resolve({
    ok: true,
    json: async () => data,
  } as Response);
}

describe("useBrowseDeals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.router.isReady = true;
    mocks.router.query = {};
    mocks.router.pathname = "/browse/deals";
    mocks.router.replace = vi.fn();
  });

  it("fetches filtered deals on first render when URL query params exist", async () => {
    mocks.router.query = { status: "EXPIRED", q: "gpu" };
    globalThis.fetch = vi.fn().mockImplementation(() =>
      mockFetchResponse({
        data: [{ deal_id: "filtered-1", title: "Filtered deal" }],
        next_cursor: null,
      })
    ) as any;

    const { result } = renderHook(() =>
      useBrowseDeals({
        initialDeals: [{ deal_id: "seed-default", title: "SSR default list" }],
        initialNextCursor: null,
      })
    );

    await waitFor(() => {
      expect(result.current.deals[0]?.deal_id).toBe("filtered-1");
    });

    expect(globalThis.fetch).toHaveBeenCalled();
    const calledUrl = String((globalThis.fetch as any).mock.calls[0][0]);
    expect(calledUrl).toContain("/api/v1/public/deals?");
    expect(calledUrl).toContain("status=EXPIRED");
    expect(calledUrl).toContain("q=gpu");
  });

  it("resetFilters clears URL state atomically and does not re-add stale status", async () => {
    mocks.router.query = { status: "EXPIRED" };
    globalThis.fetch = vi.fn().mockImplementation(() =>
      mockFetchResponse({ data: [], next_cursor: null })
    ) as any;

    const { result } = renderHook(() =>
      useBrowseDeals({
        initialDeals: [{ deal_id: "seed-default" }],
        initialNextCursor: null,
      })
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    act(() => {
      result.current.setQ("gpu");
    });

    act(() => {
      result.current.resetFilters();
    });

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(result.current.q).toBe("");
    expect(result.current.status).toBe("");

    const replaceCalls = mocks.router.replace.mock.calls;
    expect(replaceCalls.length).toBeGreaterThan(0);
    const lastCallArg = replaceCalls[replaceCalls.length - 1][0];
    expect(lastCallArg).toEqual({
      pathname: "/browse/deals",
      query: {},
    });
  });
});
