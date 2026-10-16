import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_ORIGIN, bridgeCookies, privateDestination, readProductionIdentity, validateCommerceTarget } from "../../../e2e/testerarmy/commerce-live/production-support";

const environment = () => ({
  TESTERARMY_COMMERCE_PRODUCTION: "1", CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS: "gztfmpuqtpvncdcuhqxy",
  SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co",
  UPSTASH_REDIS_REST_URL: "https://synthetic.upstash.io", UPSTASH_REDIS_REST_TOKEN: "synthetic-token", TESTERARMY_REDIS_FIXTURE: "production-real"
});
const cookie = () => `cd_owner_session=synthetic-cookie; Expires=${new Date(Date.now() + 3600_000).toUTCString()}; Path=/; HttpOnly; Secure; SameSite=Lax`;
afterEach(() => vi.unstubAllGlobals());

describe("production commerce fixture target boundary", () => {
  it("accepts only the explicitly selected canonical app and separately retains local support", () => {
    expect(validateCommerceTarget(environment(), APP_ORIGIN).production).toBe(true);
    expect(validateCommerceTarget({ ...environment(), TESTERARMY_COMMERCE_PRODUCTION: "" }, "http://localhost:4327").production).toBe(false);
  });
  it.each(["https://clawdeals.com", "https://app.clawdeals.com.evil.test", "https://app.clawdeals.com/path", "https://app.clawdeals.com?debug=1", "https://app.clawdeals.com#fragment", "https://user:pass@app.clawdeals.com", "http://localhost:4327"])("rejects a production target %s before any request", target => {
    expect(() => validateCommerceTarget(environment(), target)).toThrow("explicit app target");
  });
  it.each([
    { TESTERARMY_COMMERCE_PRODUCTION: "" }, { CLAWDEALS_ALLOW_DISPOSABLE_PRODUCTION_TESTS: "" },
    { SUPABASE_URL: "https://another.supabase.co" }, { NEXT_PUBLIC_SUPABASE_URL: "https://another.supabase.co" },
    { SUPABASE_URL: "https://gztfmpuqtpvncdcuhqxy.supabase.co/rest" }
  ])("rejects mismatched backend or missing authorization %j", overrides => {
    expect(() => validateCommerceTarget({ ...environment(), ...overrides }, APP_ORIGIN)).toThrow();
  });
  it.each([
    { UPSTASH_REDIS_REST_URL: "http://127.0.0.1:4413" }, { UPSTASH_REDIS_REST_URL: "https://localhost" },
    { UPSTASH_REDIS_REST_TOKEN: "" }, { TESTERARMY_REDIS_FIXTURE: "local-mock" },
    { UPSTASH_REDIS_REST_URL: "https://user:pass@synthetic.upstash.io" }
  ])("rejects unqualified Redis %j", overrides => {
    expect(() => validateCommerceTarget({ ...environment(), ...overrides }, APP_ORIGIN)).toThrow("real HTTPS Redis");
  });
});

describe("real bridge cookie installation", () => {
  it("preserves owner cookie security attributes without changing domain scope", () => {
    expect(bridgeCookies([cookie()], APP_ORIGIN)).toEqual([expect.objectContaining({
      name: "cd_owner_session", value: "synthetic-cookie", url: APP_ORIGIN, httpOnly: true, secure: true, sameSite: "Lax"
    })]);
    expect(bridgeCookies([`${cookie()}; Domain=.clawdeals.com`], APP_ORIGIN)[0]).toMatchObject({ domain: ".clawdeals.com", path: "/" });
  });
  it.each(["Secure", "HttpOnly", "SameSite=Lax"])("rejects missing %s without echoing cookie value", field => {
    expect(() => bridgeCookies([cookie().replace(`; ${field}`, "")], APP_ORIGIN)).toThrow("unexpected owner cookie");
  });
  it("rejects unrelated/expired cookies or foreign domains", () => {
    for (const value of [cookie().replace("cd_owner_session", "other"), `${cookie()}; Domain=.evil.test`, cookie().replace(/Expires=[^;]+/, "Expires=Thu, 01 Jan 1970 00:00:00 GMT")]) {
      expect(() => bridgeCookies([value], APP_ORIGIN)).toThrow("unexpected owner cookie");
    }
    expect(() => bridgeCookies([], APP_ORIGIN)).toThrow("exactly one");
  });
  it("restricts setup destinations to same-origin private pages and preserves filters", () => {
    expect(privateDestination("/fr/my/approvals?state=PENDING", APP_ORIGIN).href).toBe(`${APP_ORIGIN}/fr/my/approvals?state=PENDING`);
    for (const next of ["//evil.test/my", "https://evil.test/my", "/\\evil.test/my", "/fr/browse", "/api/v1/auth/login:start"]) {
      expect(() => privateDestination(next, APP_ORIGIN)).toThrow("private page");
    }
  });
});

describe("deployed app identity evidence", () => {
  const sha = "a".repeat(40);
  function transport(marketingBuild = "release-123", deploySha = sha) {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const app = new URL(input).origin === APP_ORIGIN;
      return new Response(`<script id="__NEXT_DATA__">${JSON.stringify({ buildId: app ? "release-123" : marketingBuild, props: { pageProps: app ? {} : { deploySha } } })}</script>`);
    }));
  }
  it("records the same app/marketing build and exact deployment SHA", async () => {
    transport();
    expect(await readProductionIdentity()).toMatchObject({ appBuildId: "release-123", marketingBuildId: "release-123", deploySha: sha });
    expect(fetch).toHaveBeenCalledWith(`${APP_ORIGIN}/fr/auth/login`, expect.objectContaining({ redirect: "error", cache: "no-store" }));
  });
  it.each([["other-build", sha], ["release-123", "short"]])("fails closed on mismatched identity %s", async (build, commit) => {
    transport(build, commit);
    await expect(readProductionIdentity()).rejects.toThrow("same release build");
  });
});
