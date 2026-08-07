import { afterEach, describe, expect, it } from "vitest";

import {
  getAuthBackend,
  getDatabaseBackend,
  getEvidenceStorageBackend,
  getListingStorageBackend,
  getObjectStorageBackend
} from "./backends";

const ENV_NAMES = [
  "CLAWDEALS_DATABASE_BACKEND",
  "CLAWDEALS_AUTH_BACKEND",
  "CLAWDEALS_OBJECT_STORAGE_BACKEND",
  "CLAWDEALS_LISTING_STORAGE_BACKEND",
  "CLAWDEALS_EVIDENCE_STORAGE_BACKEND"
];

afterEach(() => {
  for (const name of ENV_NAMES) delete process.env[name];
});

describe("migration backend selectors", () => {
  it("keeps Supabase as the rollback-safe default", () => {
    expect(getDatabaseBackend()).toBe("supabase");
    expect(getAuthBackend()).toBe("supabase");
    expect(getObjectStorageBackend()).toBe("supabase");
    expect(getListingStorageBackend()).toBe("supabase");
    expect(getEvidenceStorageBackend()).toBe("supabase");
  });

  it("allows listings and evidence to switch independently", () => {
    process.env.CLAWDEALS_OBJECT_STORAGE_BACKEND = "vercel-blob";
    process.env.CLAWDEALS_EVIDENCE_STORAGE_BACKEND = "supabase";

    expect(getListingStorageBackend()).toBe("vercel-blob");
    expect(getEvidenceStorageBackend()).toBe("supabase");
  });

  it("selects the staged replacement backends explicitly", () => {
    process.env.CLAWDEALS_DATABASE_BACKEND = "neon";
    process.env.CLAWDEALS_AUTH_BACKEND = "neon";
    process.env.CLAWDEALS_OBJECT_STORAGE_BACKEND = "vercel-blob";

    expect(getDatabaseBackend()).toBe("neon");
    expect(getAuthBackend()).toBe("neon");
    expect(getObjectStorageBackend()).toBe("vercel-blob");
  });

  it("rejects misspelled backend names instead of silently falling back", () => {
    process.env.CLAWDEALS_DATABASE_BACKEND = "neonn";
    expect(() => getDatabaseBackend()).toThrow(
      "CLAWDEALS_DATABASE_BACKEND must be one of: supabase, neon"
    );
  });
});
