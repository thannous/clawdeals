import { describe, expect, it, vi } from "vitest";

import {
  parsePublicAcquisitionEvent,
  recordAgentMilestone,
  recordFirstMatches} from "./acquisition";

const acquisitionId = "018f3c2a-1e4b-4f8a-9ac0-0123456789ab";

describe("acquisition funnel service", () => {
  it("accepts only privacy-minimized public events", () => {
    expect(parsePublicAcquisitionEvent({
      acquisition_id: acquisitionId,
      event_name: "organic_entry",
      landing_path: "/es/mcp?query=private",
      locale: "es",
      market_code: "FR",
      source: "google.es",
      medium: "organic",
      campaign: null,
      referrer_host: "google.es",
      cta_location: "hero",
      interaction_type: "auxclick",
      email: "ignored@example.com"
    })).toEqual({
      acquisition_id: acquisitionId,
      event_name: "organic_entry",
      landing_path: "/es/mcp",
      locale: "es",
      market_code: "ES",
      source: "google.es",
      medium: "organic",
      channel: "organic_search",
      campaign: null,
      referrer_host: "google.es",
      cta_location: null,
      interaction_type: null
    });

    expect(() => parsePublicAcquisitionEvent({
      acquisition_id: "invalid",
      event_name: "landing_view"
    })).toThrow("acquisition_id must be a UUID");
    expect(() => parsePublicAcquisitionEvent({
      acquisition_id: acquisitionId,
      event_name: "agent_connected",
      landing_path: "/"
    })).toThrow("event_name is not allowed");
  });

  it("records only the first acquired watchlist and match per agent", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const latestQuery: any = {
      select: vi.fn(() => latestQuery),
      eq: vi.fn(() => latestQuery),
      order: vi.fn(() => latestQuery),
      limit: vi.fn(() => latestQuery),
      maybeSingle: vi.fn().mockResolvedValue({ data: { acquisition_id: acquisitionId }, error: null })
    };
    let milestoneReadPending = true;
    const milestoneClient = {
      from: vi.fn(() => {
        if (milestoneReadPending) {
          milestoneReadPending = false;
          return latestQuery;
        }
        return { upsert };
      })
    };

    await recordAgentMilestone({
      eventName: "watchlist_created",
      agentId: "agent-1",
      watchlistId: "watchlist-1",
      marketCode: "ES",
      client: milestoneClient
    });

    const sessionsQuery: any = {
      select: vi.fn(() => sessionsQuery),
      in: vi.fn(() => sessionsQuery),
      eq: vi.fn(() => sessionsQuery),
      order: vi.fn().mockResolvedValue({
        data: [
          { acquisition_id: acquisitionId, agent_id: "agent-1", occurred_at: "2026-07-27T10:00:00Z" }
        ],
        error: null
      })
    };
    const batchUpsert = vi.fn().mockResolvedValue({ error: null });
    let batchReadPending = true;
    const batchClient = {
      from: vi.fn(() => {
        if (batchReadPending) {
          batchReadPending = false;
          return sessionsQuery;
        }
        return { upsert: batchUpsert };
      })
    };

    await expect(recordFirstMatches({
      matches: [
        { agentId: "agent-1", watchlistMatchId: "match-1", marketCode: "ES" },
        { agentId: "agent-1", watchlistMatchId: "match-2", marketCode: "ES" }
      ],
      client: batchClient
    })).resolves.toEqual({ recorded: 1 });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: "watchlist_created", market_code: "ES" }),
      expect.any(Object)
    );
    expect(batchUpsert).toHaveBeenCalledWith(
      [expect.objectContaining({ event_name: "first_match", watchlist_match_id: "match-1" })],
      { onConflict: "acquisition_id,event_name", ignoreDuplicates: true }
    );
  });
});
