import { afterEach, describe, expect, it } from "vitest";

import {
  isDemoRoute,
  isMarketplaceSurface,
  isWebMcpRuntimeEnabled,
  shouldRegisterOnRoute
} from "./config";

describe("webmcp config", () => {
  const original = process.env.NEXT_PUBLIC_WEBMCP_ENABLED;

  afterEach(() => {
    process.env.NEXT_PUBLIC_WEBMCP_ENABLED = original;
  });

  it("treats /webmcp as a demo surface even when the flag is off", () => {
    process.env.NEXT_PUBLIC_WEBMCP_ENABLED = "0";
    expect(isDemoRoute("/webmcp")).toBe(true);
    expect(shouldRegisterOnRoute("/webmcp")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/webmcp")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/dev/webmcp")).toBe(false);
  });

  it("registers on marketplace routes without the flag", () => {
    process.env.NEXT_PUBLIC_WEBMCP_ENABLED = "";
    expect(isMarketplaceSurface("/browse")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/browse")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/browse/deals")).toBe(true);
  });
});
