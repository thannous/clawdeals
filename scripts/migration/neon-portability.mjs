const STRIPPED_LINE_RULES = [
  ["create_policy", /^CREATE POLICY\b/i],
  ["alter_policy", /^ALTER POLICY\b/i],
  ["comment_policy", /^COMMENT ON POLICY\b/i],
  ["enable_rls", /^ALTER TABLE\b.*\bENABLE ROW LEVEL SECURITY;\s*$/i],
  ["force_rls", /^ALTER TABLE\b.*\bFORCE ROW LEVEL SECURITY;\s*$/i]
];

const PRELUDE = `-- Clawdeals Neon portable baseline
-- Generated from a pg_dump restricted to the public schema.
-- RLS/Data API policies are intentionally rebuilt after Neon Auth validation.
create schema if not exists extensions;
create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;

`;

export function findNeonBlockers(sql) {
  const checks = [
    ["Supabase auth schema", /\bauth\.[a-z_][a-z0-9_]*\b/i],
    ["Supabase storage schema", /\bstorage\.[a-z_][a-z0-9_]*\b/i],
    ["Supabase realtime schema", /\brealtime\.[a-z_][a-z0-9_]*\b/i],
    ["Supabase API role", /\b(?:anon|authenticated|service_role|supabase_admin)\b/i],
    ["remaining RLS policy", /\b(?:CREATE|ALTER) POLICY\b/i],
    ["remaining forced RLS", /\b(?:ENABLE|FORCE) ROW LEVEL SECURITY\b/i]
  ];
  return checks
    .filter(([, pattern]) => pattern.test(sql))
    .map(([name]) => name);
}

export function transformSupabasePublicDump(input) {
  const counts = Object.fromEntries(STRIPPED_LINE_RULES.map(([name]) => [name, 0]));
  const outputLines = [];

  for (const line of String(input).split(/\r?\n/)) {
    const trimmed = line.trim();
    const rule = STRIPPED_LINE_RULES.find(([, pattern]) => pattern.test(trimmed));
    if (rule) {
      counts[rule[0]] += 1;
      outputLines.push(`-- stripped Supabase ${rule[0]} statement`);
      continue;
    }
    outputLines.push(line);
  }

  const sql = `${PRELUDE}${outputLines.join("\n")}\n`;
  return { sql, counts, blockers: findNeonBlockers(sql) };
}
