import { describe, expect, it } from "vitest";
import { requirePassportOwner } from "./smartphone-passport";
import { matchRouteGroup } from "../routes/route-groups";
import { resolveRequiredScopesForRouteGroup } from "../middleware/with-api-middlewares";

const owner = { actor: { type: "owner" }, ownerId: "22222222-2222-4222-8222-222222222222", ownerSessionId: "session" };
function request(headers: Record<string, string> = {}) {
  return { method: "PUT", headers: { host: "app.clawdeals.com", "x-forwarded-proto": "https", origin: "https://app.clawdeals.com", "content-type": "application/json", ...headers } };
}
// Same-site cookies alone cannot prove CSRF safety or detect identity-header
// bypasses; exercise the server guard independently of browser UI fixtures.
describe("passport owner boundary", () => {
  it("requires a real owner session, not an injected owner or agent identity", () => {
    expect(requirePassportOwner(request(), { ...owner, ownerSessionId: null }, true)?.status).toBe(401);
    expect(requirePassportOwner(request(), { ...owner, actor: { type: "agent" } }, true)?.status).toBe(401);
    expect(requirePassportOwner(request(), { ...owner, authError: { status: 401, code: "UNAUTHORIZED", message: "Expired" } }, true)?.status).toBe(401);
  });
  it.each([
    { origin: "https://evil.example" }, { origin: "null" }, { origin: "http://app.clawdeals.com" },
    { origin: "" }, { "sec-fetch-site": "cross-site" }
  ])("rejects a cross-origin or missing browser origin (%j)", (headers) => {
    expect(requirePassportOwner(request(headers), owner, true)?.status).toBe(403);
  });
  it("allows a trusted same-origin Referer fallback and JSON mutation", () => {
    expect(requirePassportOwner(request({ origin: "", referer: "https://app.clawdeals.com/my/listings/123" }), owner, true)).toBeNull();
    expect(requirePassportOwner(request(), owner, true)).toBeNull();
    expect(requirePassportOwner(request({ "content-type": "text/plain" }), owner, true)?.status).toBe(415);
  });
  it("maps mutations to bounded owner profiles and agents to listings:read", () => {
    const path = "/v1/owner/listings/11111111-1111-4111-8111-111111111111/passport";
    expect(matchRouteGroup("PUT", path, new URLSearchParams())).toBe("passport.owner.write");
    expect(matchRouteGroup("POST", `${path}/photos`, new URLSearchParams())).toBe("passport.photos.write");
    expect(matchRouteGroup("GET", "/v1/listings/11111111-1111-4111-8111-111111111111/passport", new URLSearchParams())).toBe("listings.read");
    expect(resolveRequiredScopesForRouteGroup("listings.read")).toEqual(["listings:read"]);
  });
});
