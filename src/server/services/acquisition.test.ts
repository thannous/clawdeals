import { describe, expect, it, vi } from "vitest";

import {
  parsePublicAcquisitionEvent,
  recordAgentConnected,
  recordAgentMilestone,
  recordFirstMatches,
  recordPublicAcquisitionEvent
} from "./acquisition";

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
      email: "ignored@example.com"
    })).toEqual({
      acquisition_id: acquisitionId,
      event_name: "organic_entry",
      landing_path: "/es/mcp",
      locale: "es",
      market_code: "ES",
      source: "google.es",
      medium: "organic",
      campaign: null,
      referrer_host: "google.es",
      cta_location: null
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

  it.each([
    "landing_activation",
    "mcp_activation",
    "openclaw_activation",
    "comparison_activation"
  ] as const)("preserves the %s CTA location", (ctaLocation) => {
    expect(parsePublicAcquisitionEvent({
      acquisition_id: acquisitionId,
      event_name: "connect_cta_clicked",
      landing_path: "/fr/mcp",
      locale: "fr",
      source: "google.fr",
      medium: "organic",
      cta_location: ctaLocation
    })).toEqual(expect.objectContaining({
      event_name: "connect_cta_clicked",
      cta_location: ctaLocation
    }));
  });

  it("deduplicates public events by acquisition and milestone", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) };
    const event = parsePublicAcquisitionEvent({
      acquisition_id: acquisitionId,
      event_name: "landing_view",
      landing_path: "/fr",
      locale: "fr",
      source: "direct",
      medium: "none"
    });

    await recordPublicAcquisitionEvent(event, client);

    expect(client.from).toHaveBeenCalledWith("acquisition_funnel_events");
    expect(upsert).toHaveBeenCalledWith(event, {
      onConflict: "acquisition_id,event_name",
      ignoreDuplicates: true
    });
  });

  it("links a completed connection to its acquisition ID", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const connectQuery: any = {
      select: vi.fn(() => connectQuery),
      eq: vi.fn(() => connectQuery),
      maybeSingle: vi.fn().mockResolvedValue({ data: { acquisition_id: acquisitionId }, error: null })
    };
    const client = {
      from: vi.fn((table: string) => (
        table === "connect_sessions" ? connectQuery : { upsert }
      ))
    };

    await expect(recordAgentConnected({
      sessionId: "11111111-1111-4111-8111-111111111111",
      agentId: "22222222-2222-4222-8222-222222222222",
      occurredAt: new Date("2026-07-27T10:00:00.000Z"),
      client
    })).resolves.toEqual({ recorded: true });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisition_id: acquisitionId,
        event_name: "agent_connected",
        agent_id: "22222222-2222-4222-8222-222222222222"
      }),
      { onConflict: "acquisition_id,event_name", ignoreDuplicates: true }
    );
  });

  it("records only the first acquired watchlist and match per agent", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const latestQuery: any = {
      select: vi.fn(() => latestQuery),
      eq: vi.fn(() => latestQuery),
      not: vi.fn(() => latestQuery),
      order: vi.fn(() => latestQuery),
      limit: vi.fn(() => latestQuery),
      maybeSingle: vi.fn().mockResolvedValue({ data: { acquisition_id: acquisitionId }, error: null })
    };
    const milestoneClient = {
      from: vi.fn((table: string) => (
        table === "connect_sessions" ? latestQuery : { upsert }
      ))
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
      not: vi.fn(() => sessionsQuery),
      order: vi.fn().mockResolvedValue({
        data: [
          { acquisition_id: acquisitionId, agent_id: "agent-1", delivered_at: "2026-07-27T10:00:00Z" }
        ],
        error: null
      })
    };
    const batchUpsert = vi.fn().mockResolvedValue({ error: null });
    const batchClient = {
      from: vi.fn((table: string) => (
        table === "connect_sessions" ? sessionsQuery : { upsert: batchUpsert }
      ))
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
