import { afterEach, describe, expect, it } from "vitest";

import { isInternalCronAuthorized } from "./internal-cron-auth";

describe("isInternalCronAuthorized", () => {
  const originalSecret = process.env.INTERNAL_CRON_SECRET;
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.INTERNAL_CRON_SECRET;
    } else {
      process.env.INTERNAL_CRON_SECRET = originalSecret;
    }
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it("fails closed when INTERNAL_CRON_SECRET is missing", () => {
    delete process.env.INTERNAL_CRON_SECRET;

    expect(
      isInternalCronAuthorized({
        headers: { "x-cron-secret": "secret-1" }
      })
    ).toBe(false);
  });

  it("fails when x-cron-secret is missing", () => {
    process.env.INTERNAL_CRON_SECRET = "secret-1";

    expect(isInternalCronAuthorized({ headers: {} })).toBe(false);
  });

  it("fails when x-cron-secret does not match", () => {
    process.env.INTERNAL_CRON_SECRET = "secret-1";

    expect(
      isInternalCronAuthorized({
        headers: { "x-cron-secret": "secret-2" }
      })
    ).toBe(false);
  });

  it("fails closed when x-cron-secret is not a string", () => {
    process.env.INTERNAL_CRON_SECRET = "secret-1";

    expect(
      isInternalCronAuthorized({
        headers: { "x-cron-secret": 123 as any }
      })
    ).toBe(false);
  });

  it("authorizes a matching x-cron-secret", () => {
    process.env.INTERNAL_CRON_SECRET = "secret-1";

    expect(
      isInternalCronAuthorized({
        headers: { "x-cron-secret": "secret-1" }
      })
    ).toBe(true);
  });

  it("authorizes a Vercel cron bearer using CRON_SECRET", () => {
    delete process.env.INTERNAL_CRON_SECRET;
    process.env.CRON_SECRET = "vercel-secret";

    expect(
      isInternalCronAuthorized({
        headers: { authorization: "Bearer vercel-secret" }
      })
    ).toBe(true);
  });

  it("rejects a bearer that does not match CRON_SECRET", () => {
    delete process.env.INTERNAL_CRON_SECRET;
    process.env.CRON_SECRET = "vercel-secret";

    expect(
      isInternalCronAuthorized({
        headers: { authorization: "Bearer wrong-secret" }
      })
    ).toBe(false);
  });

  it("uses the first header value when x-cron-secret is an array", () => {
    process.env.INTERNAL_CRON_SECRET = "secret-1";

    expect(
      isInternalCronAuthorized({
        headers: { "x-cron-secret": ["secret-1", "secret-2"] }
      })
    ).toBe(true);
    expect(
      isInternalCronAuthorized({
        headers: { "x-cron-secret": ["secret-2", "secret-1"] }
      })
    ).toBe(false);
  });

  it("does not authorize a spoofed Vercel cron User-Agent without the secret", () => {
    process.env.INTERNAL_CRON_SECRET = "secret-1";

    expect(
      isInternalCronAuthorized({
        headers: { "user-agent": "vercel-cron/1.0" }
      })
    ).toBe(false);
  });
});
