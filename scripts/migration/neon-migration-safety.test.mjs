import test from "node:test";
import assert from "node:assert/strict";
import { transformSupabasePublicDump } from "./neon-portability.mjs";
import { compareCatalogs } from "./compare-catalogs.mjs";
test("multiline policy removed atomically, function body and COPY unchanged", () => {
  const copy = "COPY public.t (v) FROM stdin;\nCREATE POLICY text in row\n\\.\n";
  const output = transformSupabasePublicDump("CREATE POLICY p\n ON public.t USING (true);\n" + copy);
  assert.equal(output.counts.create_policy, 1); assert.ok(output.sql.includes(copy));
});
test("private queue dependencies remain explicit blockers", () => {
  assert.ok(transformSupabasePublicDump("SELECT private.send_queue_wake_v1('q');").blockers.length);
});
test("catalog comparison never infers row parity", () => {
  assert.equal(compareCatalogs({}, {}).row_data_verified, false);
  assert.equal(compareCatalogs({ relations: [{ name: "x" }] }, {}).matches, false);
});
