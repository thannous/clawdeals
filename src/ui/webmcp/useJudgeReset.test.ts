import { describe, expect, it } from "vitest";

import { isJudgeResetHost } from "./useJudgeReset";

describe("isJudgeResetHost", () => {
  it("allows sandbox, preview and local hosts", () => {
    expect(isJudgeResetHost("sandbox.clawdeals.com")).toBe(true);
    expect(isJudgeResetHost("clawdeals-sandbox.vercel.app")).toBe(true);
    expect(isJudgeResetHost("localhost")).toBe(true);
    expect(isJudgeResetHost("127.0.0.1")).toBe(true);
    expect(isJudgeResetHost("app.localhost")).toBe(true);
  });

  it("does not probe the production hosts", () => {
    expect(isJudgeResetHost("clawdeals.com")).toBe(false);
    expect(isJudgeResetHost("app.clawdeals.com")).toBe(false);
    expect(isJudgeResetHost("www.clawdeals.com")).toBe(false);
    expect(isJudgeResetHost("")).toBe(false);
  });
});
