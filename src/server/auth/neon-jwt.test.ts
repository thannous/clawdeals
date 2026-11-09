import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyExternalAuthIdentity } from "./external-identity";
vi.mock("../db/supabase", () => ({ getSupabaseServiceClient: vi.fn() }));
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let counter = 0;
let session: any;
let fetchMock: ReturnType<typeof vi.fn>;
const subject = "fixture-neon-subject";
const issuer = "https://auth.example.test";
async function token(changes: Record<string, unknown> = {}, signingKey: CryptoKey | Uint8Array = pair.privateKey, algorithm = "EdDSA") {
  return new SignJWT({ sub: subject, iss: issuer, aud: issuer, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, ...changes })
    .setProtectedHeader({ alg: algorithm, kid: "fixture-key" }).sign(signingKey);
}
async function verify(accessToken: string, cookieHeader = "cd_owner_session=must-not-forward; __Secure-neon-auth.session_token=fixture-cookie") {
  return verifyExternalAuthIdentity({ accessToken, cookieHeader });
}
beforeEach(async () => {
  pair = await generateKeyPair("EdDSA");
  const jwk = { ...await exportJWK(pair.publicKey), kid: "fixture-key", alg: "EdDSA", use: "sig" };
  vi.stubEnv("CLAWDEALS_AUTH_BACKEND", "neon"); vi.stubEnv("NEON_AUTH_BASE_URL", issuer);
  vi.stubEnv("NEON_AUTH_JWT_ISSUER", issuer); vi.stubEnv("NEON_AUTH_JWT_AUDIENCE", issuer);
  vi.stubEnv("NEON_AUTH_JWKS_URL", `${issuer}/fixture-jwks-${++counter}`);
  session = { session: { token: "opaque-is-not-bearer", userId: subject, expiresAt: "2099-01-01T00:00:00Z" }, user: { id: subject, email: "fixture@example.test", emailVerified: true } };
  fetchMock = vi.fn(async (url: any) => new Response(JSON.stringify(String(url).endsWith("/get-session") ? session : { keys: [jwk] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
// Cryptographic/authorization failures cannot be established with intercepted UI fixtures.
describe("Neon JWT plus live session", () => {
  it("accepts EdDSA signature with reviewed claims and same live user, forwarding only Neon cookies", async () => {
    expect(await verify(await token())).toMatchObject({ provider: "neon", subject });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "error", headers: { cookie: "__Secure-neon-auth.session_token=fixture-cookie" } });
  });
  it.each([{ sub: "other" }, { iss: "https://evil.test" }, { aud: "other-app" }, { exp: 1 }, { nbf: 9999999999 }, { iat: 9999999999 }])("rejects invalid claims %j", async changes => {
    expect(await verify(await token(changes))).toBeNull();
  });
  it("rejects unsigned/opaque tokens and a signature made by another key", async () => {
    expect(await verify("opaque-is-not-bearer")).toBeNull();
    const other = await generateKeyPair("EdDSA");
    expect(await verify(await token({}, other.privateKey))).toBeNull();
    expect(await verify("e30.e30.")).toBeNull();
  });
  it.each(["exp", "iat", "aud", "iss", "sub"])("requires claim %s", async claim => {
    expect(await verify(await token({ [claim]: undefined }))).toBeNull();
  });
  it("rejects wrong algorithm", async () => {
    expect(await verify(await token({}, new TextEncoder().encode("fixture-secret-fixture-secret-123"), "HS256"))).toBeNull();
  });
  it.each([{ userId: "other" }, { expiresAt: "2000-01-01" }, { expiresAt: "invalid" }, { expiresAt: null }, { token: null }])("rejects invalid live session %j", async change => {
    Object.assign(session.session, change); expect(await verify(await token())).toBeNull();
  });
  it("rejects missing cookie, banned user, revoked live session and missing configuration", async () => {
    const jwt = await token(); expect(await verify(jwt, "cd_owner_session=only-source")).toBeNull();
    session.user.banned = true; expect(await verify(jwt)).toBeNull();
    session.user.banned = false; vi.stubEnv("NEON_AUTH_JWT_AUDIENCE", ""); expect(await verify(jwt)).toBeNull();
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 })); expect(await verify(jwt)).toBeNull();
  });
  it("rejects untrusted JWKS origins before fetching them", async () => {
    vi.stubEnv("NEON_AUTH_JWKS_URL", "https://evil.test/keys");
    expect(await verify(await token())).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("rejects unsafe Auth URL before sending a cookie", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "http://auth.example.test");
    await expect(verify(await token())).rejects.toThrow("HTTPS"); expect(fetchMock).not.toHaveBeenCalled();
  });
});
