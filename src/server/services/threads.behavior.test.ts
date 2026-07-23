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
  createMessage,
  createOrGetControlDmThread,
  createOrGetThread,
  createSystemWarningMessage,
  getControlDmThread,
  getThread,
  getThreadForBuyerListing,
  listMessages,
  listThreads
} from "./threads";

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

  it("gets buyer threads and maps Supabase failures", async () => {
    const found = { thread_id: "thread_1" };
    const success = createQuery({ data: found, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => success) });
    await expect(
      getThreadForBuyerListing({ listingId: "listing_1", buyerAgentId: "buyer_1" })
    ).resolves.toEqual(found);
    expect(success.eq).toHaveBeenCalledWith("thread_type", "MARKETPLACE");
    expect(success.eq).toHaveBeenCalledWith("listing_id", "listing_1");

    const failure = createQuery({
      data: null,
      error: { message: "database failed", code: "PGRST500" }
    });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => failure) });
    await expect(
      getThreadForBuyerListing({ listingId: "listing_1", buyerAgentId: "buyer_1" })
    ).rejects.toMatchObject({ message: "database failed" });
  });

  it("returns an existing marketplace thread without inserting", async () => {
    const existing = { thread_id: "thread_existing" };
    const lookup = createQuery({ data: existing, error: null });
    const client = { from: vi.fn(() => lookup) };
    mocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      createOrGetThread({
        listingId: "listing_1",
        ownerId: null,
        buyerAgentId: "buyer_1",
        sellerAgentId: "seller_1"
      })
    ).resolves.toEqual({ thread: existing, created: false });
    expect(lookup.insert).not.toHaveBeenCalled();
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

  it("validates control-DM identifiers and returns existing threads", async () => {
    await expect(
      getControlDmThread({ ownerId: "not-a-uuid", agentId })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    await expect(
      createOrGetControlDmThread({ ownerId, agentId: "not-a-uuid" })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });

    const existing = { thread_id: "control_existing" };
    const lookup = createQuery({ data: existing, error: null });
    mocks.getSupabaseServiceClient.mockReturnValue({ from: vi.fn(() => lookup) });
    await expect(
      createOrGetControlDmThread({ ownerId, agentId })
    ).resolves.toEqual({ thread: existing, created: false });
    expect(lookup.eq).toHaveBeenCalledWith("thread_type", "CONTROL_DM");
  });

  it("creates a control DM and persists its system greeting", async () => {
    const missing = createQuery({ data: null, error: null });
    const thread = { thread_id: "control_created" };
    const insertThread = createQuery({ data: thread, error: null });
    const message = {
      message_id: "message_greeting",
      thread_id: "control_created",
      sender_type: "system",
      sender_id: "00000000-0000-0000-0000-000000000000",
      type: "info",
      payload: { text: "Control channel connected." },
      redacted: false,
      created_at: "2026-07-23T12:00:00.000Z"
    };
    const insertMessage = createQuery({ data: message, error: null });
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(missing)
        .mockReturnValueOnce(insertThread)
        .mockReturnValueOnce(insertMessage)
    };
    mocks.getSupabaseServiceClient.mockReturnValue(client);

    await expect(
      createOrGetControlDmThread({ ownerId, agentId })
    ).resolves.toEqual({ thread, created: true });
    expect(insertMessage.insert).toHaveBeenCalledWith(expect.objectContaining({
      thread_id: "control_created",
      sender_type: "system",
      type: "info",
      payload: expect.objectContaining({
        quick_actions: ["Help", "Approvals", "Connected Apps"]
      })
    }));
    expect(mocks.publishThreadEvent).toHaveBeenCalledWith(expect.objectContaining({
      threadId: "control_created",
      type: "message.sent"
    }));
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

  it("gets threads and publishes sent or redacted message events", async () => {
    const thread = { thread_id: "thread_1" };
    const getQuery = createQuery({ data: thread, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => getQuery) });
    await expect(getThread("thread_1")).resolves.toEqual(thread);

    const message = {
      message_id: "message_1",
      thread_id: "thread_1",
      sender_type: "agent",
      sender_id: "agent_1",
      type: "text",
      payload: { text: "hello" },
      redacted: true,
      created_at: "2026-07-23T12:00:00.000Z"
    };
    const messageQuery = createQuery({ data: message, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => messageQuery) });
    await expect(createMessage({
      threadId: "thread_1",
      senderId: "agent_1",
      type: "text",
      payload: { text: "hello" },
      redacted: true
    })).resolves.toEqual(message);
    expect(messageQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      body: "hello",
      redacted: true
    }));
    expect(mocks.publishThreadEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "message.redacted",
      actor: { type: "agent", id: "agent_1" }
    }));
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

  it("filters and paginates threads with escaped cursor values", async () => {
    const rows = [
      { thread_id: "thread_3", created_at: "2026-07-23T12:03:00.000Z" },
      { thread_id: "thread_2", created_at: "2026-07-23T12:02:00.000Z" },
      { thread_id: "thread_1", created_at: "2026-07-23T12:01:00.000Z" }
    ];
    const query = createQuery({ data: rows, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => query) });

    const result = await listThreads({
      listingId: "listing_1",
      buyerAgentId: "buyer_1",
      sellerAgentId: "seller_1",
      status: "OPEN",
      limit: 2,
      cursor: {
        created_at: '2026-07-23T13:00:00.000"Z',
        thread_id: 'thread_"4'
      }
    });
    expect(query.eq).toHaveBeenCalledWith("thread_type", "MARKETPLACE");
    expect(query.eq).toHaveBeenCalledWith("listing_id", "listing_1");
    expect(query.eq).toHaveBeenCalledWith("buyer_agent_id", "buyer_1");
    expect(query.eq).toHaveBeenCalledWith("seller_agent_id", "seller_1");
    expect(query.eq).toHaveBeenCalledWith("status", "OPEN");
    expect(query.or).toHaveBeenCalledWith(
      'created_at.lt."2026-07-23T13:00:00.000\\"Z",and(created_at.eq."2026-07-23T13:00:00.000\\"Z",thread_id.lt."thread_\\"4")'
    );
    expect(result.items).toEqual(rows.slice(0, 2));
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it("paginates messages in ascending order and handles empty pages", async () => {
    const rows = [
      { message_id: "message_1", created_at: "2026-07-23T12:01:00.000Z" },
      { message_id: "message_2", created_at: "2026-07-23T12:02:00.000Z" }
    ];
    const query = createQuery({ data: rows, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => query) });
    const result = await listMessages({
      threadId: "thread_1",
      limit: 1,
      cursor: {
        created_at: "2026-07-23T12:00:00.000Z",
        message_id: "message_0"
      }
    });
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(query.or).toHaveBeenCalledWith(
      'created_at.gt."2026-07-23T12:00:00.000Z",and(created_at.eq."2026-07-23T12:00:00.000Z",message_id.gt."message_0")'
    );
    expect(result.items).toEqual([rows[0]]);
    expect(result.nextCursor).toEqual(expect.any(String));

    const empty = createQuery({ data: null, error: null });
    mocks.getSupabaseServiceClient.mockReturnValueOnce({ from: vi.fn(() => empty) });
    await expect(listMessages({ threadId: "thread_1" })).resolves.toEqual({
      items: [],
      nextCursor: null
    });
  });
});
