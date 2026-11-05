import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Evaluate the actual Next config using only synthetic env and an inert optional
// analyzer. No .env loading, provider constructors, browser or build is needed.
const source = readFileSync("next.config.js", "utf8");
function config(env: Record<string, string> = {}) {
  const configModule = { exports: {} as { env: Record<string, string> } };
  runInNewContext(source, {
    module: configModule, process: { env },
    require: (name: string) => {
      if (name === "@next/bundle-analyzer") return () => (value: unknown) => value;
      throw new Error(`Unexpected config dependency: ${name}`);
    }
  });
  return configModule.exports;
}

describe("compiled public database selector", () => {
  it.each([
    ["supabase", "supabase"], ["neon", "supabase"],
    ["supabase", "neon"], ["neon", "neon"]
  ])("reflects server DB=%s without conflating Auth=%s", (database, auth) => {
    const built = config({ CLAWDEALS_DATABASE_BACKEND: database, CLAWDEALS_AUTH_BACKEND: auth, NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND: auth });
    expect(built.env.NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND).toBe(database);
  });
  it("preserves the server Supabase default during auth-first migration", () => {
    expect(config({ CLAWDEALS_AUTH_BACKEND: "neon", NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND: "neon" }).env.NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND).toBe("supabase");
  });
  it("normalizes matching selectors and emits only non-secret public values", () => {
    const built = config({ CLAWDEALS_DATABASE_BACKEND: " NEON ", NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: " neon ", DATABASE_URL: "fake-secret-not-to-expose" });
    expect(built.env).toEqual({ NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: "neon", NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE: "false" });
  });
  it.each([
    { CLAWDEALS_DATABASE_BACKEND: "supabase", NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: "neon" },
    { CLAWDEALS_DATABASE_BACKEND: "neon", NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: "supabase" },
    { NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: "neon" },
    { CLAWDEALS_DATABASE_BACKEND: "typo" },
    { NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: "typo" }
  ])("refuses contradictory or invalid selectors %j", (env) => {
    expect(() => config(env)).toThrow(/DATABASE_BACKEND/);
  });
  it("keeps the rehearsal marker and DB selector together", () => {
    const built = config({ CLAWDEALS_DATABASE_BACKEND: "neon", CLAWDEALS_REHEARSAL_MODE: "true", NEXT_PUBLIC_CLAWDEALS_AUTH_BACKEND: "neon" });
    expect(built.env).toEqual({ NEXT_PUBLIC_CLAWDEALS_DATABASE_BACKEND: "neon", NEXT_PUBLIC_CLAWDEALS_REHEARSAL_MODE: "true" });
  });
});
