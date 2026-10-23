import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedGrants, evaluate, parseQueryOutput } from "./check-db-grants.mjs";

const table = (name, extra = {}) => ({ name, kind: "r", partition: false, rls: true, service_role: ["SELECT", "INSERT", "UPDATE", "DELETE"], exposed: [], ...extra });

test("passes a locked-down schema and reports views", () => {
  const result = evaluate({
    relations: [
      table("deals"),
      table("audit_logs", { kind: "p" }),
      table("audit_logs_2026_10", { partition: true, service_role: ["SELECT"] }),
      { name: "deal_summary", kind: "v", partition: false, rls: false, service_role: ["SELECT"], exposed: [] },
    ],
    functions: [{ signature: "claim_job(uuid)", public_exec: false, anon_exec: false, authenticated_exec: false, service_role_exec: true }],
  });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.views, ["public.deal_summary (view): service_role SELECT; anon/authenticated none"]);
  assert.deepEqual(result.notes, []);
});

test("fails a table or partition without RLS or an explicit service_role grant", () => {
  const { failures } = evaluate({
    relations: [
      table("no_rls", { rls: false }),
      table("audit_logs_2026_11", { partition: true, service_role: [] }),
      table("trigger_only", { service_role: ["TRIGGER", "REFERENCES"] }),
    ],
    functions: [],
  });
  assert.deepEqual(failures, [
    "public.no_rls (table): row level security is not enabled",
    "public.audit_logs_2026_11 (partition): no explicit service_role grant (select, insert, update or delete)",
    "public.trigger_only (table): no explicit service_role grant (select, insert, update or delete)",
  ]);
});

test("fails anon or authenticated table privileges unless the allowlist names them", () => {
  const relations = [table("deals", { exposed: ["anon:SELECT", "authenticated:INSERT"] })];
  assert.deepEqual(evaluate({ relations, functions: [] }).failures, [
    "public.deals: anon:SELECT is granted, and supabase/db-grants-allowlist.json does not list it",
    "public.deals: authenticated:INSERT is granted, and supabase/db-grants-allowlist.json does not list it",
  ]);
  const allowlist = { tables: [{ table: "deals", grants: ["anon:SELECT"], reason: "public catalogue" }] };
  assert.deepEqual(evaluate({ relations, functions: [] }, allowlist).failures, [
    "public.deals: authenticated:INSERT is granted, and supabase/db-grants-allowlist.json does not list it",
  ]);
});

test("MAINTAIN counts as a table privilege", () => {
  const { failures } = evaluate({ relations: [table("deals", { exposed: ["authenticated:MAINTAIN"] })], functions: [] });
  assert.deepEqual(failures, ["public.deals: authenticated:MAINTAIN is granted, and supabase/db-grants-allowlist.json does not list it"]);
});

test("a column-level grant is a privilege like any other", () => {
  const { failures } = evaluate({ relations: [table("deals", { exposed: ["anon:SELECT(columns)"] })], functions: [] });
  assert.deepEqual(failures, ["public.deals: anon:SELECT(columns) is granted, and supabase/db-grants-allowlist.json does not list it"]);
});

test("an empty public schema after the reset fails", () => {
  assert.deepEqual(evaluate({ relations: [], functions: [] }).failures, ["public: no tables after the reset, so the migrations were not applied"]);
});

test("a view exposed to anon fails like a table", () => {
  const { failures, views } = evaluate({
    relations: [table("deals"), { name: "v", kind: "v", partition: false, rls: false, service_role: [], exposed: ["anon:SELECT"] }],
    functions: [],
  });
  assert.equal(views.length, 1);
  assert.deepEqual(failures, ["public.v: anon:SELECT is granted, and supabase/db-grants-allowlist.json does not list it"]);
});

test("fails security definer functions PUBLIC or anon can execute, reports authenticated", () => {
  const { failures, notes } = evaluate({
    relations: [table("deals")],
    functions: [
      { signature: "open_door()", public_exec: true, anon_exec: true, authenticated_exec: true, service_role_exec: true },
      { signature: "for_users()", public_exec: false, anon_exec: false, authenticated_exec: true, service_role_exec: true },
    ],
  });
  assert.deepEqual(failures, [
    "public.open_door() (security definer): PUBLIC can execute it",
    "public.open_door() (security definer): anon can execute it",
  ]);
  assert.deepEqual(notes, [
    "public.open_door() (security definer): authenticated can execute it",
    "public.for_users() (security definer): authenticated can execute it",
  ]);
});

test("an allowlist entry needs a reason", () => {
  assert.throws(() => allowedGrants({ tables: [{ table: "deals", grants: ["anon:SELECT"] }] }), /needs table, grants and a reason/);
  assert.equal(allowedGrants({ tables: [] }).size, 0);
});

test("parses supabase db query JSON after a preamble", () => {
  assert.deepEqual(parseQueryOutput('note\n{"boundary":"x","rows":[{"a":1}]}'), [{ a: 1 }]);
  assert.throws(() => parseQueryOutput("nothing"), /printed no JSON/);
});

test("parses native CLI row arrays and still rejects an unsafe schema", () => {
  assert.deepEqual(parseQueryOutput('[\n  {\n    "ok": 1\n  }\n]\n'), [{ ok: 1 }]);
  const relations = parseQueryOutput(`note\n${JSON.stringify([table("deals", { rls: false })])}`);
  const functions = parseQueryOutput("[]\n");
  assert.deepEqual(evaluate({ relations, functions }).failures, [
    "public.deals (table): row level security is not enabled",
  ]);
});

test("rejects query output without rows or with trailing non-JSON content", () => {
  assert.throws(() => parseQueryOutput('{"message":"not rows"}'), /returned no rows array/);
  assert.throws(() => parseQueryOutput('[{"ok":1}]\nnot JSON'), SyntaxError);
});
