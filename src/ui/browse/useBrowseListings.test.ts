import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowseListings } from "./useBrowseListings";

const routerMock: any = {
  isReady: true,
  query: {},
  pathname: "/browse",
  replace: vi.fn(),
};

vi.mock("next/router", () => ({
  useRouter: () => routerMock,
}));

describe("useBrowseListings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routerMock.isReady = true;
    routerMock.query = {};
    routerMock.pathname = "/browse";
    routerMock.replace = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches on first hydrated render when URL filters are present", async () => {
    routerMock.query = { q: "gpu", sort: "price_desc" };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [{ listing_id: "from-api" }],
        next_cursor: null,
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const { result } = renderHook(() =>
      useBrowseListings({
        initialListings: [{ listing_id: "from-ssr" }],
        initialNextCursor: null,
      })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock.mock.calls[0][0]).toContain("sort=price_desc");
    expect(fetchMock.mock.calls[0][0]).toContain("q=gpu");

    await waitFor(() => {
      expect(result.current.listings[0]?.listing_id).toBe("from-api");
    });
  });

  it("does not let stale debounced callbacks revert newer URL params", async () => {
    vi.useFakeTimers();
    routerMock.query = {};

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        data: [],
        next_cursor: null,
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const { result } = renderHook(() =>
      useBrowseListings({
        initialListings: [],
        initialNextCursor: null,
      })
    );

    act(() => {
      result.current.setQ("gpu");
    });
    act(() => {
      result.current.setSort("price_desc");
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    const calls = vi.mocked(routerMock.replace).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toMatchObject({
      pathname: "/browse",
      query: expect.objectContaining({
        q: "gpu",
        sort: "price_desc",
      }),
    });
  });

  it("keeps existing listings visible when load-more request fails", async () => {
    routerMock.query = {};

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue({
        error: { message: "temporary outage" },
      }),
    });
    (globalThis as any).fetch = fetchMock;

    const { result } = renderHook(() =>
      useBrowseListings({
        initialListings: [{ listing_id: "kept-item" }],
        initialNextCursor: "cursor-1",
      })
    );

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.loadMoreState).toBe("error");
    });

    expect(result.current.fetchState).toBe("done");
    expect(result.current.listings).toHaveLength(1);
    expect(result.current.listings[0]?.listing_id).toBe("kept-item");
  });
});
