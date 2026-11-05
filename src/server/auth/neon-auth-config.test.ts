import { afterEach, expect, it, vi } from "vitest";
import { getNeonAuthBaseUrl, validateNeonAuthConfiguration } from "./neon-auth-config";
afterEach(() => vi.unstubAllEnvs());
it.each(["http://auth.example.test", "https://user:secret@auth.example.test", "https://auth.example.test?query=1", "https://auth.example.test#fragment"])("rejects unsafe Auth destination %s", url => {
  vi.stubEnv("NEON_AUTH_BASE_URL", url); expect(() => getNeonAuthBaseUrl()).toThrow();
});
it("requires matching selectors and a long cookie secret before proxy construction", () => {
  vi.stubEnv("CLAWDEALS_AUTH_BACKEND", "supabase"); vi.stubEnv("NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND", "neon");
  expect(() => validateNeonAuthConfiguration()).toThrow("matching");
  vi.stubEnv("CLAWDEALS_AUTH_BACKEND", "neon"); vi.stubEnv("NEON_AUTH_BASE_URL", "https://auth.example.test/branch/"); vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "short");
  expect(() => validateNeonAuthConfiguration()).toThrow("32");
  vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "fixture-only-".repeat(4)); expect(validateNeonAuthConfiguration().baseUrl).toBe("https://auth.example.test/branch");
});
