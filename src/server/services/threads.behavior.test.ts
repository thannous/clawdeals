import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  publishThreadEvent: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: mocks.getSupabaseServiceClient
}));

vi.mock("./thread-events", () => ({
  publishThreadEvent: mocks.publishThreadEvent
}));

import {
  createOrGetControlDmThread,
  createOrGetThread,
  createSystemWarningMessage} from "./threads";

function createQuery(result: any) {
  const query: any = {
    eq: vi.fn(() => query),
    insert: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result)
  };
  query.then = (resolve: (value: any) => void, reject: (reason: any) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

const ownerId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";

describe("threads service behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishThreadEvent.mockResolvedValue(undefined);
  });

  it("creates marketplace threads and recovers the winner of a duplicate race", async () => {
    const lookup = createQuery({ data: null, error: null });
    const inserted = { thread_id: "thread_created" };
    const insert = createQuery({ data: inserted, error: null });
    const client = {
      from: vi.fn().mockReturnValueOnce(lookup).mockReturnValueOnce(insert)
    };
    mocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      createOrGetThread({
        listingId: "listing_1",
        ownerId: "owner_1",
        buyerAgentId: "buyer_1",
        sellerAgentId: "seller_1"
      })
    ).resolves.toEqual({ thread: inserted, created: true });
    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({
      thread_type: "MARKETPLACE",
      listing_id: "listing_1",
      owner_id: "owner_1",
      status: "OPEN"
    }));

    const firstLookup = createQuery({ data: null, error: null });
    const duplicate = createQuery({
      data: null,
      error: { message: "duplicate key value violates unique constraint" }
    });
    const winner = { thread_id: "thread_winner" };
    const secondLookup = createQuery({ data: winner, error: null });
    const racingClient = {
      from: vi.fn()
        .mockReturnValueOnce(firstLookup)
        .mockReturnValueOnce(duplicate)
        .mockReturnValueOnce(secondLookup)
    };
    mocks.getSupabaseServiceClient.mockReturnValue(racingClient);

    await expect(
      createOrGetThread({
        listingId: "listing_1",
        ownerId: "owner_1",
        buyerAgentId: "buyer_1",
        sellerAgentId: "seller_1"
      })
    ).resolves.toEqual({ thread: winner, created: false });
  });

  it("recovers a concurrent control-DM creation and rejects a missing fallback", async () => {
    const missing = createQuery({ data: null, error: null });
    const duplicate = createQuery({
      data: null,
      error: { message: "duplicate key value violates unique constraint" }
    });
    const winner = { thread_id: "control_winner" };
    const winnerLookup = createQuery({ data: winner, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(missing)
        .mockReturnValueOnce(duplicate)
        .mockReturnValueOnce(winnerLookup)
    };
    mocks.getSupabaseServiceClient.mockReturnValue(client);
    await expect(
      createOrGetControlDmThread({ ownerId, agentId })
    ).resolves.toEqual({ thread: winner, created: false });

    const missingAgain = createQuery({ data: null, error: null });
    const emptyInsert = createQuery({ data: null, error: null });
    const stillMissing = createQuery({ data: null, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({
      from: vi.fn()
        .mockReturnValueOnce(missingAgain)
        .mockReturnValueOnce(emptyInsert)
        .mockReturnValueOnce(stillMissing)
    });
    await expect(
      createOrGetControlDmThread({ ownerId, agentId })
    ).rejects.toMatchObject({ status: 500, code: "ERROR" });
  });

  it("keeps message persistence successful when SSE publication fails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    mocks.publishThreadEvent.mockRejectedValueOnce(new Error("event store unavailable"));
    const message = {
      message_id: "message_2",
      thread_id: "thread_1",
      sender_type: "system",
      sender_id: null,
      type: "warning",
      payload: { text: "warning" },
      redacted: false
    };
    const query = createQuery({ data: message, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => query) });

    await expect(createSystemWarningMessage({ threadId: "thread_1" })).resolves.toEqual(message);
    expect(info).toHaveBeenCalledWith("thread_events.publish_failed", {
      type: "message.sent",
      error: "event store unavailable"
    });
    info.mockRestore();
  });
});
