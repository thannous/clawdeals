import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getSupabaseServiceClient: vi.fn(),
  getNeonSql: vi.fn(),
  neonQuery: vi.fn()
}));

vi.mock("../db/supabase", () => ({
  getSupabaseServiceClient: dependencyMocks.getSupabaseServiceClient
}));

vi.mock("../db/neon", () => ({
  getNeonSql: dependencyMocks.getNeonSql
}));

import { createWatchlistSignup } from "./watchlist-signups";

function makeClient(result: any) {
  const single = vi.fn(async () => result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const client = { from: vi.fn(() => ({ insert })) };
  return { client, insert };
}

describe("createWatchlistSignup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLAWDEALS_DATABASE_BACKEND;
    dependencyMocks.getNeonSql.mockReturnValue(dependencyMocks.neonQuery);
  });

  it("sends a localized confirmation email after a successful signup", async () => {
    const { client } = makeClient({ data: { watchlist_signup_id: "s1" }, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);
    const sendEmail = vi.fn(async () => ({ ok: true }));

    const result = await createWatchlistSignup({
      email: "new@example.test",
      locale: "fr-FR",
      source: "landing",
      sendEmail
    });

    expect(result.status).toBe("created");
    expect(sendEmail).toHaveBeenCalledOnce();
    const [mail] = sendEmail.mock.calls[0] as any[];
    expect(mail.toEmail).toBe("new@example.test");
    expect(mail.subject).toContain("liste d'attente");
    expect(mail.text).toContain("Merci");
  });

  it("does not email again for an already registered address", async () => {
    const { client } = makeClient({ data: null, error: { code: "23505", message: "duplicate key value" } });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);
    const sendEmail = vi.fn(async () => ({ ok: true }));

    const result = await createWatchlistSignup({ email: "dup@example.test", sendEmail });

    expect(result.status).toBe("already_registered");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still succeeds when the confirmation email fails or the provider is unconfigured", async () => {
    const { client } = makeClient({ data: { watchlist_signup_id: "s1" }, error: null });
    dependencyMocks.getSupabaseServiceClient.mockReturnValue(client);

    const failing = vi.fn(async () => ({ ok: false, status: 500, error: "HTTP 500" }));
    await expect(
      createWatchlistSignup({ email: "a@example.test", sendEmail: failing })
    ).resolves.toMatchObject({ status: "created" });

    const throwing = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      createWatchlistSignup({ email: "b@example.test", sendEmail: throwing })
    ).resolves.toMatchObject({ status: "created" });
  });

  it("uses a parameterized Neon query only when explicitly enabled", async () => {
    process.env.CLAWDEALS_DATABASE_BACKEND = "neon";
    dependencyMocks.neonQuery.mockResolvedValue([
      { watchlist_signup_id: "s-neon", email: "neon@example.test" }
    ]);
    const sendEmail = vi.fn(async () => ({ ok: true }));

    const result = await createWatchlistSignup({
      email: "neon@example.test",
      locale: " fr ",
      source: " landing ",
      sendEmail
    });

    expect(result).toEqual({
      status: "created",
      data: { watchlist_signup_id: "s-neon", email: "neon@example.test" }
    });
    expect(dependencyMocks.neonQuery).toHaveBeenCalledOnce();
    expect(dependencyMocks.neonQuery.mock.calls[0].slice(1)).toEqual([
      "neon@example.test",
      "fr",
      "landing"
    ]);
    expect(dependencyMocks.getSupabaseServiceClient).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("preserves duplicate signup semantics on Neon", async () => {
    process.env.CLAWDEALS_DATABASE_BACKEND = "neon";
    dependencyMocks.neonQuery.mockRejectedValue(
      Object.assign(new Error("duplicate key value"), { code: "23505" })
    );

    await expect(
      createWatchlistSignup({ email: "duplicate@example.test" })
    ).resolves.toEqual({ status: "already_registered", data: null });
  });
});
