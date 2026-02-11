import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TimelinePage from "./TimelinePage";
import { useTimeline } from "./useTimeline";
import { useReplay } from "./useReplay";

vi.mock("./useTimeline", () => ({
  useTimeline: vi.fn()
}));

vi.mock("./useReplay", () => ({
  useReplay: vi.fn()
}));

const baseTimelineState = {
  entityType: "listing",
  setEntityType: vi.fn(),
  entityId: "11111111-2222-3333-8444-555555555555",
  setEntityId: vi.fn(),
  includeCorrelated: true,
  setIncludeCorrelated: vi.fn(),
  items: [],
  nextCursor: null,
  fetchState: "done" as const,
  loadMoreState: "idle" as const,
  error: null,
  correlation: { request_ids: [], idempotency_keys: [], correlated_entity_count: 0 },
  loadMore: vi.fn(),
  refetch: vi.fn()
};

describe("TimelinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("replays using the selected entry entity context", () => {
    const loadReplay = vi.fn();
    const correlatedEntry = {
      audit_id: "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee",
      ts: "2026-02-07T12:00:01Z",
      actor: { type: "agent", id: "agent-1" },
      action: "deal.created",
      entity: { type: "deal", id: "22222222-2222-3333-8444-555555555555" },
      outcome: "success",
      metadata: { hash: "abc123", redacted: false },
      request_id: "req-123",
      idempotency_key: null,
      is_primary: false,
      correlation_source: "request_id"
    };

    vi.mocked(useTimeline).mockReturnValue({
      ...baseTimelineState,
      items: [correlatedEntry]
    } as any);

    vi.mocked(useReplay).mockReturnValue({
      replay: null,
      replayState: "idle",
      replayError: null,
      loadReplay,
      clearReplay: vi.fn()
    } as any);

    render(<TimelinePage />);

    fireEvent.click(screen.getByText("deal.created"));
    fireEvent.click(screen.getByRole("button", { name: "Replay to this point" }));

    expect(loadReplay).toHaveBeenCalledTimes(1);
    expect(loadReplay).toHaveBeenCalledWith(
      "deal",
      "22222222-2222-3333-8444-555555555555",
      "aaaaaaaa-bbbb-1ccc-9ddd-eeeeeeeeeeee"
    );
  });
});
