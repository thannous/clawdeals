import { describe, expect, it } from "vitest";

import { decodeAuditCursor, encodeAuditCursor } from "./audit-cursor";
import { decodeListingsCursor, encodeListingsCursor } from "./listings-cursor";
import { decodeMessagesCursor, encodeMessagesCursor } from "./messages-cursor";
import { decodeThreadsCursor, encodeThreadsCursor } from "./threads-cursor";

describe("pagination cursor compatibility", () => {
  const created_at = "2026-11-07T12:00:00.123456Z";
  const id = "10000000-0000-4000-8000-000000000001";
  const token = (fields: object) => Buffer.from(JSON.stringify(fields), "utf8").toString("base64url");

  it("keeps old message links when a query parser replaced a base64 plus with a space", () => {
    const fields = { created_at, message_id: "~~🤖" };
    const legacy = Buffer.from(JSON.stringify(fields), "utf8").toString("base64");
    expect(legacy).toContain("+");
    expect(decodeMessagesCursor(legacy.replace(/\+/g, " "))).toEqual({ value: fields });
    expect(encodeMessagesCursor(fields)).toBe(token(fields));
    expect(decodeThreadsCursor(legacy)).toEqual({ error: "Invalid cursor" });
    const thread = { created_at, thread_id: "channel-thread" };
    expect(decodeThreadsCursor(encodeThreadsCursor(thread))).toEqual({ value: thread });
  });

  it("keeps audit precision and each listing sort's distinct validation", () => {
    const audit = { occurred_at: created_at, id };
    expect(decodeAuditCursor(encodeAuditCursor(audit))).toEqual({ value: audit });
    expect(decodeAuditCursor(token({ occurred_at: "2026-11-07", id }))).toEqual({ error: "Invalid cursor" });
    const rank = { sort: "rank", listing_id: id, created_at, as_of: created_at, rank_score: "82.123456" };
    expect(decodeListingsCursor(encodeListingsCursor(rank))).toEqual({ value: rank });
    const distance = { sort: "distance", listing_id: id, lat: 0, lng: 0, distance_m: 0 };
    expect(decodeListingsCursor(token(distance))).toEqual({ value: { ...distance, distance_km: null } });
    expect(decodeListingsCursor(token({ ...distance, distance_km: 301 }))).toEqual({ error: "Invalid cursor" });
    expect(decodeListingsCursor(token({ ...rank, sort: "recent", listing_id: "bad" }))).toEqual({ error: "Invalid cursor" });
  });

  it("distinguishes a missing page token from a malformed one", () => {
    for (const read of [decodeAuditCursor, decodeListingsCursor, decodeMessagesCursor, decodeThreadsCursor]) {
      expect(read("")).toBeNull();
      expect(read("a")).toEqual({ error: "Invalid cursor" });
      expect(read("bnVsbA==")).toEqual({ error: "Invalid cursor" });
    }
  });
});
