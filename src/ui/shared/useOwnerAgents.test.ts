import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function mockFetchResponse(payload: any): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe("useOwnerAgents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reuses the in-flight request across unmount/remount", async () => {
    const responseDeferred = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValue(responseDeferred.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { useOwnerAgents } = await import("./useOwnerAgents");

    const first = renderHook(() => useOwnerAgents());
    expect(first.result.current.loading).toBe(true);
    first.unmount();

    const second = renderHook(() => useOwnerAgents());
    expect(second.result.current.loading).toBe(true);

    responseDeferred.resolve(
      mockFetchResponse({
        data: {
          agents: [{ agent_id: "agent-1", name: "Agent One" }],
        },
      })
    );

    await waitFor(() => {
      expect(second.result.current.loading).toBe(false);
      expect(second.result.current.agents).toEqual([{ id: "agent-1", name: "Agent One" }]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("serves cached agents without refetching on later mounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockFetchResponse({
        data: {
          agents: [{ agent_id: "agent-2", name: "Agent Two" }],
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { useOwnerAgents } = await import("./useOwnerAgents");
    const first = renderHook(() => useOwnerAgents());

    await waitFor(() => {
      expect(first.result.current.loading).toBe(false);
      expect(first.result.current.agents).toEqual([{ id: "agent-2", name: "Agent Two" }]);
    });
    first.unmount();

    const second = renderHook(() => useOwnerAgents());
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.agents).toEqual([{ id: "agent-2", name: "Agent Two" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
