import { afterEach, describe, expect, it } from "vitest";

import { getPublicAppEntryPath } from "./urls";

const ORIGINAL_APP_ENTRY_PATH = process.env.NEXT_PUBLIC_APP_ENTRY_PATH;

describe("shared/urls", () => {
  afterEach(() => {
    if (ORIGINAL_APP_ENTRY_PATH === undefined) {
      delete process.env.NEXT_PUBLIC_APP_ENTRY_PATH;
      return;
    }
    process.env.NEXT_PUBLIC_APP_ENTRY_PATH = ORIGINAL_APP_ENTRY_PATH;
  });

  it("defaults app entry path to /start", () => {
    delete process.env.NEXT_PUBLIC_APP_ENTRY_PATH;
    expect(getPublicAppEntryPath()).toBe("/start");
  });

  it("normalizes configured app entry path", () => {
    process.env.NEXT_PUBLIC_APP_ENTRY_PATH = "console/";
    expect(getPublicAppEntryPath()).toBe("/console");
  });
});
