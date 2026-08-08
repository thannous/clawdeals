import { describe, expect, it } from "vitest";

import {
  findNeonBlockers,
  transformSupabasePublicDump
} from "../../../scripts/migration/neon-portability.mjs";

describe("Neon SQL portability preparation", () => {
  it("removes Supabase Data API policies and forced RLS from a public dump", () => {
    const input = `
CREATE TABLE public.watchlist_signups (id uuid primary key, email text not null);
ALTER TABLE public.watchlist_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_signups FORCE ROW LEVEL SECURITY;
CREATE POLICY deny_all ON public.watchlist_signups TO anon, authenticated USING (false);
INSERT INTO public.watchlist_signups VALUES ('00000000-0000-4000-8000-000000000001', 'a@example.com');
`;

    const result = transformSupabasePublicDump(input);

    expect(result.blockers).toEqual([]);
    expect(result.counts).toMatchObject({ create_policy: 1, enable_rls: 1, force_rls: 1 });
    expect(result.sql).toContain("create extension if not exists postgis with schema extensions");
    expect(result.sql).toContain("INSERT INTO public.watchlist_signups");
    expect(result.sql).not.toMatch(/\bCREATE POLICY\b/);
  });

  it("fails closed when a Supabase-owned schema or role remains", () => {
    const blockers = findNeonBlockers(`
      update storage.buckets set public = false;
      grant select on public.items to service_role;
    `);

    expect(blockers).toContain("Supabase storage schema");
    expect(blockers).toContain("Supabase API role");
  });
});
