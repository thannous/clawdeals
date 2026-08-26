import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import { getWebMcpOriginTrialMeta, getWebMcpOriginTrialToken } from "./origin-trial";

describe("WebMCP origin trial meta", () => {
  const original = process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN;
      return;
    }
    process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN = original;
  });

  it("omits the meta when the public token is absent or blank", () => {
    expect(getWebMcpOriginTrialToken({})).toBeNull();
    expect(getWebMcpOriginTrialMeta({})).toBeNull();
    expect(getWebMcpOriginTrialMeta({ NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: "" })).toBeNull();
    expect(getWebMcpOriginTrialMeta({ NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: "   " })).toBeNull();
  });

  it("renders the exact origin-trial meta when a public token is present", () => {
    const env = { NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN: " example-public-token " };
    expect(getWebMcpOriginTrialToken(env)).toBe("example-public-token");
    expect(renderToStaticMarkup(getWebMcpOriginTrialMeta(env))).toBe(
      '<meta http-equiv="origin-trial" content="example-public-token"/>'
    );
  });
});
