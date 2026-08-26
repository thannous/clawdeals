import { afterEach, describe, expect, it } from "vitest";

import {
  isDealsSurface,
  isDemoRoute,
  isDevPlaygroundRoute,
  isListingsSurface,
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
    expect(isDemoRoute("/webmcp-challenge")).toBe(true);
    expect(shouldRegisterOnRoute("/webmcp-challenge")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/webmcp-challenge")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/dev/webmcp")).toBe(false);
  });

  it("registers on marketplace routes without the flag", () => {
    process.env.NEXT_PUBLIC_WEBMCP_ENABLED = "";
    expect(isMarketplaceSurface("/browse")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/browse")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/browse/deals")).toBe(true);
  });

  it("classifies listing and deal surfaces without overlap", () => {
    expect(isListingsSurface("/webmcp")).toBe(true);
    expect(isListingsSurface("/webmcp-challenge")).toBe(true);
    expect(isListingsSurface("/browse")).toBe(true);
    expect(isListingsSurface("/browse/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isListingsSurface("/marketplace")).toBe(true);
    expect(isListingsSurface("/browse/deals")).toBe(false);

    expect(isDealsSurface("/browse/deals")).toBe(true);
    expect(isDealsSurface("/deals/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isDealsSurface("/browse")).toBe(false);
  });

  it("keeps developer tools behind the runtime feature flag", () => {
    expect(isDevPlaygroundRoute("/dev/webmcp")).toBe(true);
    expect(isDevPlaygroundRoute("/developer/tools")).toBe(true);

    process.env.NEXT_PUBLIC_WEBMCP_ENABLED = "0";
    expect(isWebMcpRuntimeEnabled("/dev/webmcp")).toBe(false);
    expect(isWebMcpRuntimeEnabled("/developer/tools")).toBe(false);

    process.env.NEXT_PUBLIC_WEBMCP_ENABLED = "1";
    expect(isWebMcpRuntimeEnabled("/dev/webmcp")).toBe(true);
    expect(isWebMcpRuntimeEnabled("/developer/tools")).toBe(true);
  });
});
