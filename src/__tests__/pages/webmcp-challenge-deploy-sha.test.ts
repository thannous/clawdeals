import { describe, expect, it } from "vitest";

import { resolveDeploySha } from "../../pages/webmcp-challenge";

describe("resolveDeploySha", () => {
  it("uses the documented deployment precedence and normalizes case", () => {
    expect(
      resolveDeploySha({
        NEXT_PUBLIC_DEPLOY_SHA: "ABCDEF1234567",
        VERCEL_GIT_COMMIT_SHA: "1111111"
      })
    ).toBe("abcdef1234567");
  });

  it("skips malformed values and accepts the next valid provider SHA", () => {
    expect(
      resolveDeploySha({
        NEXT_PUBLIC_DEPLOY_SHA: "not-a-sha",
        VERCEL_GIT_COMMIT_SHA: "425B414"
      })
    ).toBe("425b414");
  });

  it("returns null instead of exposing arbitrary environment data", () => {
    expect(resolveDeploySha({ GIT_COMMIT_SHA: "secret=value" })).toBeNull();
    expect(resolveDeploySha({ GIT_COMMIT_SHA: "a".repeat(41) })).toBeNull();
  });
});
