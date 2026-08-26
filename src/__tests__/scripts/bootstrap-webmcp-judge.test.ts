import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPublicSandboxBootstrap,
  createSecretFileStore,
  createSupabaseBootstrapStore,
  generateSandboxApiKey,
  JUDGE_AGENT_ID,
  JUDGE_OWNER_ID,
  PUBLIC_SANDBOX_URL,
  redactBootstrapSecrets,
  requestJudgeReset,
  resolveBootstrapConfig,
  TARGET_LISTING_ID,
  TARGET_THREAD_ID,
  validateStableJudgeResets
} from "../../../scripts/lib/bootstrap-webmcp-judge.mjs";

const STAGING_REF = "abcdefghijklmnopqrst";
const OTHER_STAGING_REF = "zyxwvutsrqponmlkjihg";
const PRODUCTION_REF = "gztfmpuqtpvncdcuhqxy";
const SELLER_AGENT_ID = "95000000-0000-4000-8000-000000000001";
const SELLER_OWNER_ID = "96000000-0000-4000-8000-000000000001";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    CLAWDEALS_ENV: "sandbox",
    API_KEY_NAMESPACE: "cd_sandbox",
    NEXT_PUBLIC_WEBMCP_ENABLED: "1",
    PUBLIC_SANDBOX_URL,
    NEXT_PUBLIC_APP_URL: PUBLIC_SANDBOX_URL,
    NEXT_PUBLIC_API_BASE_URL: PUBLIC_SANDBOX_URL,
    SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    WEBMCP_JUDGE_AGENT_ID: JUDGE_AGENT_ID,
    ...overrides
  };
}

function resetPayload({ sellerAgentId = SELLER_AGENT_ID, listingIds }: { sellerAgentId?: string; listingIds?: string[] } = {}) {
  const resolvedListingIds = listingIds || [
    TARGET_LISTING_ID,
    "90000000-0000-4000-8000-000000000002",
    "90000000-0000-4000-8000-000000000003",
    "90000000-0000-4000-8000-000000000004",
    "90000000-0000-4000-8000-000000000005",
    "90000000-0000-4000-8000-000000000006",
    "90000000-0000-4000-8000-000000000007"
  ];
  return {
    ok: true,
    counts: { deals: 3, listings: 7, watchlists: 3, threads: 1, messages: 1 },
    actors: {
      buyer_agent_id: JUDGE_AGENT_ID,
      seller_agent_id: sellerAgentId,
      seller_owner_id: SELLER_OWNER_ID
    },
    thread: {
      thread_id: TARGET_THREAD_ID,
      listing_id: TARGET_LISTING_ID
    },
    listings: resolvedListingIds.map((listing_id) => ({ listing_id }))
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    status,
    redirected: false,
    text: vi.fn(async () => JSON.stringify(payload))
  };
}

describe("resolveBootstrapConfig", () => {
  it("validates an isolated public sandbox without needing a service role in dry-run", () => {
    const config = resolveBootstrapConfig(baseEnv(), {
      cwd: "/repo",
      secretsFile: ".env.webmcp-judge.local"
    });

    expect(config).toMatchObject({
      apply: false,
      sandboxUrl: PUBLIC_SANDBOX_URL,
      supabaseRef: STAGING_REF,
      serviceRoleKey: "",
      secretsPath: "/repo/.env.webmcp-judge.local",
      judgeAgentId: JUDGE_AGENT_ID,
      judgeOwnerId: JUDGE_OWNER_ID
    });
  });

  it("requires the service role only for explicit apply", () => {
    expect(() =>
      resolveBootstrapConfig(baseEnv(), {
        apply: true,
        cwd: "/repo"
      })
    ).toThrow(/service_role_key is required/i);

    expect(
      resolveBootstrapConfig(baseEnv({
        SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
        SUPABASE_SERVICE_ROLE_PROJECT_REF: STAGING_REF
      }), {
        apply: true,
        cwd: "/repo"
      }).apply
    ).toBe(true);
  });

  it.each([
    ["production host", { PUBLIC_SANDBOX_URL: "https://clawdeals.com" }, /must equal/i],
    ["Vercel host", { PUBLIC_SANDBOX_URL: "https://clawdeals-staging.vercel.app" }, /must equal/i],
    ["legacy identity", { AUTH_ALLOW_LEGACY_IDENTITY_HEADERS: "1" }, /must remain unset/i],
    ["live namespace", { API_KEY_NAMESPACE: "cd_live" }, /must equal cd_sandbox/i],
    ["disabled WebMCP", { NEXT_PUBLIC_WEBMCP_ENABLED: "0" }, /must equal 1/i],
    [
      "production Supabase",
      {
        SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`
      },
      /production supabase ref/i
    ],
    [
      "mismatched Supabase refs",
      { NEXT_PUBLIC_SUPABASE_URL: `https://${OTHER_STAGING_REF}.supabase.co` },
      /same branch ref/i
    ],
    ["unknown Supabase host", { SUPABASE_URL: "https://db.example.com" }, /branch-specific/i]
  ])("rejects %s", (_label, overrides, pattern) => {
    expect(() => resolveBootstrapConfig(baseEnv(overrides), { cwd: "/repo" })).toThrow(pattern);
  });

  it("rejects non-origin Supabase URLs even when their hostname has a valid ref", () => {
    expect(() =>
      resolveBootstrapConfig(
        baseEnv({ SUPABASE_URL: `https://${STAGING_REF}.supabase.co/rest/v1` }),
        { cwd: "/repo" }
      )
    ).toThrow(/exact HTTPS project origin/i);
  });

  it("keeps the secret file inside the repo and under the ignored .env.* convention", () => {
    expect(() =>
      resolveBootstrapConfig(baseEnv(), { cwd: "/repo", secretsFile: "../judge-secret" })
    ).toThrow(/inside the repository/i);
    expect(() =>
      resolveBootstrapConfig(baseEnv(), { cwd: "/repo", secretsFile: "judge-secret.txt" })
    ).toThrow(/gitignored/i);
  });
});

describe("sandbox key and output safety", () => {
  it("generates the production-compatible sandbox key shape without exposing the secret to the hash input", async () => {
    const randomBytes = vi
      .fn()
      .mockReturnValueOnce(Buffer.from("010203040506", "hex"))
      .mockReturnValueOnce(Buffer.alloc(32, 7));
    const hash = vi.fn(async () => "$2a$10$hash");

    const result = await generateSandboxApiKey({ randomBytes, hash });

    expect(result.apiKey).toMatch(/^cd_sandbox_[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]+$/);
    expect(result.prefix).toHaveLength(8);
    expect(result.keyHash).toBe("$2a$10$hash");
    expect(hash).toHaveBeenCalledWith(result.apiKey.split(".")[1], 10);
  });

  it("redacts API keys, bearer values, JWTs, and explicit service-role values", () => {
    const serviceRole = "service-role-value-123";
    const apiKey = "cd_sandbox_abcdefgh.abcdefghijklmnopqrstuvwxyz0123456789ABCDE";
    const jwt = "eyJabcdefghijklmno1.abcdefghijklmnop2.abcdefghijklmnop3";
    const output = redactBootstrapSecrets(
      `key=${apiKey} Authorization: Bearer ${apiKey} jwt=${jwt} role=${serviceRole}`,
      [serviceRole]
    );

    expect(output).not.toContain(apiKey);
    expect(output).not.toContain(jwt);
    expect(output).not.toContain(serviceRole);
    expect(output).toContain("[REDACTED]");
  });

  it("refuses any reset host other than the exact sandbox origin before fetch", async () => {
    const fetchImpl = vi.fn();
    await expect(
      requestJudgeReset({
        fetchImpl,
        sandboxUrl: "https://clawdeals.com",
        apiKey: "cd_sandbox_abcdefgh.secret"
      })
    ).rejects.toThrow(/must equal/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("applyPublicSandboxBootstrap", () => {
  function applyConfig() {
    return resolveBootstrapConfig(
      baseEnv({
        SUPABASE_SERVICE_ROLE_KEY: "staging-service-role",
        SUPABASE_SERVICE_ROLE_PROJECT_REF: STAGING_REF
      }),
      { apply: true, cwd: "/repo" }
    );
  }

  it("reserves the secret file first, rotates both actors, and proves two stable resets", async () => {
    const events: string[] = [];
    const store = {
      upsertJudge: vi.fn(async () => events.push("upsert-judge")),
      rotateApiKey: vi.fn(async ({ agentId }) => events.push(`rotate:${agentId}`)),
      revokeApiKeyByPrefix: vi.fn(async () => undefined)
    };
    const secretFiles = {
      reserve: vi.fn(async () => {
        events.push("reserve");
        return { id: "handle" };
      }),
      commit: vi.fn(async (_handle, content) => {
        events.push("commit");
        expect(content).toContain("PUBLIC_SANDBOX_JUDGE_KEY=cd_sandbox_buyer001.buyer-secret");
        expect(content).toContain("PUBLIC_SANDBOX_SELLER_KEY=cd_sandbox_seller01.seller-secret");
      }),
      cleanup: vi.fn(async () => undefined)
    };
    const keyFactory = vi
      .fn()
      .mockResolvedValueOnce({
        apiKey: "cd_sandbox_buyer001.buyer-secret",
        prefix: "buyer001",
        keyHash: "buyer-hash"
      })
      .mockResolvedValueOnce({
        apiKey: "cd_sandbox_seller01.seller-secret",
        prefix: "seller01",
        keyHash: "seller-hash"
      });
    const fetchImpl = vi.fn(async (_url, init) => {
      events.push("reset");
      expect(init).toMatchObject({ method: "POST", redirect: "manual" });
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer cd_sandbox_buyer001.buyer-secret"
      });
      return jsonResponse(resetPayload());
    });

    const result = await applyPublicSandboxBootstrap(applyConfig(), {
      store,
      fetchImpl,
      keyFactory,
      secretFiles,
      now: new Date("2026-08-26T12:00:00.000Z")
    });

    expect(events).toEqual([
      "reserve",
      "upsert-judge",
      `rotate:${JUDGE_AGENT_ID}`,
      "reset",
      `rotate:${SELLER_AGENT_ID}`,
      "reset",
      "commit"
    ]);
    expect(result).toMatchObject({
      ok: true,
      reset_count: 2,
      seller_agent_id: SELLER_AGENT_ID,
      target_listing_id: TARGET_LISTING_ID,
      target_thread_id: TARGET_THREAD_ID
    });
    expect(JSON.stringify(result)).not.toContain("buyer-secret");
    expect(JSON.stringify(result)).not.toContain("seller-secret");
    expect(secretFiles.cleanup).not.toHaveBeenCalled();
  });

  it("rolls back issued keys and removes the reserved file when a later reset fails", async () => {
    const store = {
      upsertJudge: vi.fn(async () => undefined),
      rotateApiKey: vi.fn(async () => undefined),
      revokeApiKeyByPrefix: vi.fn(async () => undefined)
    };
    const handle = { id: "handle" };
    const secretFiles = {
      reserve: vi.fn(async () => handle),
      commit: vi.fn(async () => undefined),
      cleanup: vi.fn(async () => undefined)
    };
    const keyFactory = vi
      .fn()
      .mockResolvedValueOnce({
        apiKey: "cd_sandbox_buyer001.buyer-secret",
        prefix: "buyer001",
        keyHash: "buyer-hash"
      })
      .mockResolvedValueOnce({
        apiKey: "cd_sandbox_seller01.seller-secret",
        prefix: "seller01",
        keyHash: "seller-hash"
      });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(resetPayload()))
      .mockResolvedValueOnce(jsonResponse({ error: { code: "BROKEN" } }, 500));

    await expect(
      applyPublicSandboxBootstrap(applyConfig(), {
        store,
        fetchImpl,
        keyFactory,
        secretFiles
      })
    ).rejects.toThrow(/status 500/i);

    expect(store.revokeApiKeyByPrefix).toHaveBeenNthCalledWith(1, expect.objectContaining({ prefix: "seller01" }));
    expect(store.revokeApiKeyByPrefix).toHaveBeenNthCalledWith(2, expect.objectContaining({ prefix: "buyer001" }));
    expect(secretFiles.cleanup).toHaveBeenCalledWith(handle, "/repo/.env.webmcp-judge.local");
    expect(secretFiles.commit).not.toHaveBeenCalled();
  });

  it("fails when the second reset changes deterministic actors or IDs", () => {
    expect(() =>
      validateStableJudgeResets(
        resetPayload(),
        resetPayload({ sellerAgentId: "97000000-0000-4000-8000-000000000001" })
      )
    ).toThrow(/changed synthetic seller actors/i);
    expect(() =>
      validateStableJudgeResets(
        resetPayload(),
        resetPayload({
          listingIds: [
            TARGET_LISTING_ID,
            "90000000-0000-4000-8000-000000000002",
            "90000000-0000-4000-8000-000000000003",
            "90000000-0000-4000-8000-000000000004",
            "90000000-0000-4000-8000-000000000005",
            "90000000-0000-4000-8000-000000000006",
            "98000000-0000-4000-8000-000000000001"
          ]
        })
      )
    ).toThrow(/changed deterministic listing/i);
  });

  it("rejects a reset that claims seven listings but does not return seven unique IDs", () => {
    const duplicateIds = Array(7).fill(TARGET_LISTING_ID);
    expect(() => validateStableJudgeResets(resetPayload(), resetPayload({ listingIds: duplicateIds }))).toThrow(
      /7 unique listing IDs/i
    );
  });
});

describe("createSupabaseBootstrapStore", () => {
  it("uses idempotent upserts, revokes old keys, inserts the replacement, and supports rollback", async () => {
    const calls: Array<{ table: string; operation: string; value?: unknown; filters?: unknown }> = [];
    const client = {
      from(table: string) {
        return {
          async upsert(value: unknown, options: unknown) {
            calls.push({ table, operation: "upsert", value, filters: options });
            return { error: null };
          },
          insert(value: unknown) {
            calls.push({ table, operation: "insert", value });
            return Promise.resolve({ error: null });
          },
          update(value: unknown) {
            const filters: unknown[] = [];
            calls.push({ table, operation: "update", value, filters });
            const chain = {
              eq(column: string, filterValue: unknown) {
                filters.push(["eq", column, filterValue]);
                return chain;
              },
              in(column: string, filterValue: unknown) {
                filters.push(["in", column, filterValue]);
                return Promise.resolve({ error: null });
              },
              then(resolve: (value: unknown) => unknown) {
                return Promise.resolve({ error: null }).then(resolve);
              }
            };
            return chain;
          }
        };
      }
    };
    const store = createSupabaseBootstrapStore(client);

    await store.upsertJudge({
      ownerId: JUDGE_OWNER_ID,
      agentId: JUDGE_AGENT_ID,
      nowIso: "2026-08-26T12:00:00.000Z",
      agedCreatedAt: "2026-08-16T12:00:00.000Z"
    });
    await store.rotateApiKey({
      agentId: JUDGE_AGENT_ID,
      prefix: "buyer001",
      keyHash: "buyer-hash",
      nowIso: "2026-08-26T12:00:00.000Z"
    });
    await store.revokeApiKeyByPrefix({
      prefix: "buyer001",
      nowIso: "2026-08-26T12:01:00.000Z"
    });

    expect(calls.map((call) => `${call.table}:${call.operation}`)).toEqual([
      "owners:upsert",
      "agents:upsert",
      "api_keys:update",
      "api_keys:insert",
      "api_keys:update"
    ]);
    expect(calls[0].filters).toEqual({ onConflict: "owner_id" });
    expect(calls[1].filters).toEqual({ onConflict: "id" });
    expect(calls[2].filters).toEqual([
      ["eq", "agent_id", JUDGE_AGENT_ID],
      ["in", "key_state", ["ACTIVE", "GRACE"]]
    ]);
    expect(calls[4].filters).toEqual([
      ["eq", "key_prefix", "buyer001"],
      ["eq", "key_state", "ACTIVE"]
    ]);
  });
});

describe("createSecretFileStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
  });

  it("uses exclusive create and enforces mode 0600", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "clawdeals-webmcp-bootstrap-"));
    tempDirs.push(directory);
    const filePath = path.join(directory, ".env.webmcp-judge.local");
    const store = createSecretFileStore();

    const handle = await store.reserve(filePath);
    await store.commit(handle, "SECRET=value\n");

    expect(await fs.readFile(filePath, "utf8")).toBe("SECRET=value\n");
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    await expect(store.reserve(filePath)).rejects.toMatchObject({ code: "EEXIST" });
  });
});
