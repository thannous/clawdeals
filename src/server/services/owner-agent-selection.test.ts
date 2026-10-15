import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
import { getSupabaseServiceClient } from "../db/supabase";
import { getAgentIdByOwnerId } from "./agents";

type Agent = { id: string; owner_id: string; created_at: string; suspended_at: string | null };
const own = (id: string, suspended_at: string | null = null, created_at = "2026-10-01T00:00:00Z"): Agent => ({
  id, owner_id: "owner", suspended_at, created_at,
});

// A browser's mocked owner API cannot reproduce unordered PostgREST limit(1).
// Exercise the real Supabase request builder against a bounded transport that
// applies PostgREST owner filtering, ordering and limit to adversarial rows.
function database(rows: Agent[]) {
  const client = createClient("http://agent-selection.test", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/agents" || (init?.method || "GET") !== "GET") throw new Error("Unexpected agent write.");
      let selected = rows.filter(row => `eq.${row.owner_id}` === url.searchParams.get("owner_id"));
      const ordering = (url.searchParams.get("order") || "").split(",").filter(Boolean);
      selected = [...selected].sort((a, b) => {
        for (const term of ordering) {
          const [field, direction, nulls] = term.split(".");
          const left = a[field as keyof Agent];
          const right = b[field as keyof Agent];
          if (left === right) continue;
          if (left === null) return nulls === "nullsfirst" ? -1 : 1;
          if (right === null) return nulls === "nullsfirst" ? 1 : -1;
          const comparison = left.localeCompare(right);
          if (comparison) return direction === "desc" ? -comparison : comparison;
        }
        return 0;
      });
      return Response.json(selected.slice(0, Number(url.searchParams.get("limit") || selected.length)));
    } },
  });
  vi.mocked(getSupabaseServiceClient).mockReturnValue(client);
}

afterEach(() => vi.resetAllMocks());

describe("owner mission agent selection", () => {
  it("prefers an owned unsuspended agent over an older suspended agent and a foreign agent", async () => {
    database([
      { ...own("foreign"), owner_id: "someone-else" },
      own("suspended", "2026-10-14T00:00:00Z", "2026-01-01T00:00:00Z"),
      own("available"),
    ]);
    expect(await getAgentIdByOwnerId("owner", { preferUnsuspended: true })).toBe("available");
  });

  it.each([false, true])("selects deterministically among available agents (reversed=%s)", async reverse => {
    const rows = [own("agent-b"), own("agent-newer", null, "2026-10-14T00:00:00Z"), own("agent-a")];
    database(reverse ? rows.reverse() : rows);
    expect(await getAgentIdByOwnerId("owner", { preferUnsuspended: true })).toBe("agent-a");
  });

  it("returns a suspended agent when that is all the owner has, preserving the service's refusal", async () => {
    database([own("suspended", "2026-10-14T00:00:00Z")]);
    expect(await getAgentIdByOwnerId("owner", { preferUnsuspended: true })).toBe("suspended");
  });

  it("returns null for an owner without agents without changing legacy selection", async () => {
    database([own("first", "2026-10-14T00:00:00Z"), own("available")]);
    expect(await getAgentIdByOwnerId("owner")).toBe("first");
    expect(await getAgentIdByOwnerId("absent", { preferUnsuspended: true })).toBeNull();
  });
});
