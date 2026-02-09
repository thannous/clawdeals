import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock Supabase client
const mockFrom = vi.fn();
const mockClient = { from: mockFrom };

vi.mock("../../server/db/supabase", () => ({
  getSupabaseServiceClient: () => mockClient
}));

vi.mock("../../server/services/supabase-errors", () => ({
  mapSupabaseError: (err) => ({
    message: err.message || "DB error",
    status: err.status || 500,
    code: err.code || "DB_ERROR"
  })
}));

vi.mock("../../server/sse/store", () => ({
  publishSseEvent: vi.fn()
}));

vi.mock("../../server/services/api-keys", () => ({
  revokeApiKeyForAgent: vi.fn()
}));

vi.mock("../../server/services/api-key-auth-cache", () => ({
  deleteCachedApiKeyAuthRecord: vi.fn()
}));

import {
  hideEntity,
  unhideEntity,
  suspendAgent,
  unsuspendAgent,
  revokeApiKeyOps,
  getModerationState,
  listModerationActions
} from "../../server/services/moderation";
import { publishSseEvent } from "../../server/sse/store";
import { revokeApiKeyForAgent } from "../../server/services/api-keys";
import { deleteCachedApiKeyAuthRecord } from "../../server/services/api-key-auth-cache";

// Helpers for building Supabase chain mocks
function mockChain(overrides: Record<string, any> = {}) {
  const chain: any = {
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(overrides.single || { data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue(overrides.maybeSingle || { data: null, error: null }),
    then: overrides.then
  };
  // If "then" isn't provided, default to resolving with data/error for query chains
  if (!chain.then && overrides.query) {
    chain.then = undefined;
    // Override the last call to resolve
  }
  return chain;
}

const UUID = "2b079372-0a7a-4fa1-93e0-1f269ea0f1d7";
const OWNER = "owner-1";

describe("moderation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- hideEntity ---
  describe("hideEntity", () => {
    it("throws when required params missing", async () => {
      await expect(hideEntity({ entityType: null, entityId: UUID, performedBy: OWNER })).rejects.toThrow();
    });

    it("upserts moderation_state and logs action", async () => {
      const modState = { entity_type: "listing", entity_id: UUID, hidden: true };

      // moderation_states upsert chain
      const upsertChain = mockChain();
      upsertChain.single.mockResolvedValue({ data: modState, error: null });

      // moderation_actions insert chain
      const insertChain = mockChain();
      insertChain.then = undefined;

      mockFrom.mockImplementation((table) => {
        if (table === "moderation_states") return upsertChain;
        if (table === "moderation_actions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return mockChain();
      });

      const result = await hideEntity({
        entityType: "listing",
        entityId: UUID,
        reason: "spam",
        performedBy: OWNER
      });

      expect(result).toEqual(modState);
      expect(upsertChain.upsert).toHaveBeenCalled();
      expect(publishSseEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "moderation.entity_hidden" })
      );
    });
  });

  // --- unhideEntity ---
  describe("unhideEntity", () => {
    it("throws when required params missing", async () => {
      await expect(unhideEntity({ entityType: "listing", entityId: null, performedBy: OWNER })).rejects.toThrow();
    });

    it("throws NOT_FOUND when no moderation state", async () => {
      const updateChain = mockChain();
      updateChain.maybeSingle.mockResolvedValue({ data: null, error: null });

      mockFrom.mockImplementation(() => updateChain);

      await expect(
        unhideEntity({ entityType: "listing", entityId: UUID, performedBy: OWNER })
      ).rejects.toThrow(/not found/i);
    });

    it("updates and returns moderation state", async () => {
      const modState = { entity_type: "listing", entity_id: UUID, hidden: false };
      const updateChain = mockChain();
      updateChain.maybeSingle.mockResolvedValue({ data: modState, error: null });

      mockFrom.mockImplementation((table) => {
        if (table === "moderation_states") return updateChain;
        if (table === "moderation_actions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return mockChain();
      });

      const result = await unhideEntity({
        entityType: "listing",
        entityId: UUID,
        reason: "reinstated",
        performedBy: OWNER
      });

      expect(result).toEqual(modState);
      expect(publishSseEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "moderation.entity_unhidden" })
      );
    });
  });

  // --- suspendAgent ---
  describe("suspendAgent", () => {
    it("throws when required params missing", async () => {
      await expect(suspendAgent({ agentId: null, performedBy: OWNER })).rejects.toThrow();
    });

    it("suspends agent, adds trust flag, revokes keys", async () => {
      const agent = { agent_id: UUID, trust_flags: [] };

      // First call: agents update → returns agent
      const agentUpdateChain = mockChain();
      agentUpdateChain.maybeSingle.mockResolvedValue({ data: agent, error: null });

      // Second call: agents update trust_flags → ok
      const flagUpdateChain = mockChain();

      // Third call: api_keys select → returns keys
      const keysSelectChain = mockChain();

      let fromCallCount = 0;
      mockFrom.mockImplementation((table) => {
        if (table === "agents") {
          fromCallCount++;
          if (fromCallCount === 1) return agentUpdateChain;
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        if (table === "api_keys") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [{ api_key_id: "key-1", key_prefix: "pk_" }], error: null })
              })
            })
          };
        }
        if (table === "moderation_actions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return mockChain();
      });

      vi.mocked(revokeApiKeyForAgent).mockResolvedValue({ key_prefix: "pk_" });

      const result = await suspendAgent({
        agentId: UUID,
        reason: "abuse",
        performedBy: OWNER
      });

      expect(result.agentId).toBe(UUID);
      expect(result.suspended_at).toBeDefined();
      expect(revokeApiKeyForAgent).toHaveBeenCalledWith({ agentId: UUID, apiKeyId: "key-1" });
      expect(publishSseEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "moderation.agent_suspended" })
      );
    });

    it("throws NOT_FOUND when agent doesn't exist", async () => {
      const updateChain = mockChain();
      updateChain.maybeSingle.mockResolvedValue({ data: null, error: null });

      mockFrom.mockImplementation(() => updateChain);

      await expect(
        suspendAgent({ agentId: UUID, performedBy: OWNER })
      ).rejects.toThrow(/not found/i);
    });
  });

  // --- unsuspendAgent ---
  describe("unsuspendAgent", () => {
    it("throws when required params missing", async () => {
      await expect(unsuspendAgent({ agentId: null, performedBy: OWNER })).rejects.toThrow();
    });

    it("unsuspends agent and removes suspended flag", async () => {
      const agent = { agent_id: UUID, trust_flags: ["suspended", "quarantined"] };
      const updateChain = mockChain();
      updateChain.maybeSingle.mockResolvedValue({ data: agent, error: null });

      let fromCallCount = 0;
      mockFrom.mockImplementation((table) => {
        if (table === "agents") {
          fromCallCount++;
          if (fromCallCount === 1) return updateChain;
          return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
        }
        if (table === "moderation_actions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return mockChain();
      });

      const result = await unsuspendAgent({
        agentId: UUID,
        reason: "reinstated",
        performedBy: OWNER
      });

      expect(result.agentId).toBe(UUID);
      expect(result.unsuspended).toBe(true);
      expect(publishSseEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "moderation.agent_unsuspended" })
      );
    });
  });

  // --- revokeApiKeyOps ---
  describe("revokeApiKeyOps", () => {
    it("throws when required params missing", async () => {
      await expect(revokeApiKeyOps({ agentId: null, apiKeyId: "k", performedBy: OWNER })).rejects.toThrow();
    });

    it("revokes key and clears cache", async () => {
      vi.mocked(revokeApiKeyForAgent).mockResolvedValue({ key_prefix: "pk_test" });
      vi.mocked(deleteCachedApiKeyAuthRecord).mockResolvedValue(undefined);

      mockFrom.mockImplementation((table) => {
        if (table === "moderation_actions") {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return mockChain();
      });

      const result = await revokeApiKeyOps({
        agentId: UUID,
        apiKeyId: "key-99",
        reason: "compromised",
        performedBy: OWNER
      });

      expect(revokeApiKeyForAgent).toHaveBeenCalledWith({ agentId: UUID, apiKeyId: "key-99" });
      expect(deleteCachedApiKeyAuthRecord).toHaveBeenCalledWith("pk_test");
      expect(publishSseEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "moderation.key_revoked" })
      );
    });
  });

  // --- getModerationState ---
  describe("getModerationState", () => {
    it("throws when params missing", async () => {
      await expect(getModerationState({ entityType: null, entityId: UUID })).rejects.toThrow();
    });

    it("returns null when no state found", async () => {
      const chain = mockChain();
      chain.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getModerationState({ entityType: "listing", entityId: UUID });
      expect(result).toBeNull();
    });

    it("returns state when found", async () => {
      const state = { entity_type: "listing", entity_id: UUID, hidden: true };
      const chain = mockChain();
      chain.maybeSingle.mockResolvedValue({ data: state, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await getModerationState({ entityType: "listing", entityId: UUID });
      expect(result).toEqual(state);
    });
  });

  // --- listModerationActions ---
  describe("listModerationActions", () => {
    function mockListChain(data: any[]) {
      // listModerationActions chains: from().select().order().limit() then optionally .eq() / .lt()
      // The chain must be fully chainable and resolve as a thenable at the end.
      const chain: any = {};
      const methods = ["select", "order", "limit", "eq", "lt"];
      for (const m of methods) {
        chain[m] = vi.fn().mockReturnValue(chain);
      }
      // Make the chain thenable so `await query` resolves
      chain.then = (resolve, reject) => {
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return chain;
    }

    it("returns actions with cursor", async () => {
      const items = Array.from({ length: 51 }, (_, i) => ({
        action_id: `action-${i}`,
        created_at: `2026-02-09T${String(i).padStart(2, "0")}:00:00Z`
      }));

      mockFrom.mockReturnValue(mockListChain(items));

      const result = await listModerationActions({ entityType: "listing", limit: 50 });

      expect(result.actions).toHaveLength(50);
      expect(result.nextCursor).toBeDefined();
    });

    it("returns null nextCursor when no more items", async () => {
      const items = [{ action_id: "a-1", created_at: "2026-02-09T00:00:00Z" }];

      mockFrom.mockReturnValue(mockListChain(items));

      const result = await listModerationActions({ limit: 50 });

      expect(result.actions).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });
  });
});
