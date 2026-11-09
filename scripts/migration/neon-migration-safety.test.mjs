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

test("schema review inventory contains metadata, not function bodies or literals", async () => {
  const { reviewSchema } = await import("./review-schema.mjs");
  const inventory = reviewSchema("-- Name: worker(); Type: FUNCTION; Schema: private; Owner: -\nCREATE FUNCTION private.worker() RETURNS void LANGUAGE sql AS $$SELECT net.http_post('synthetic-secret-value')$$;\n");
  assert.equal(inventory.objects[0].classification, "blocked");
  assert.equal(inventory.dependency_closure_verified, false);
  assert.ok(!JSON.stringify(inventory).includes("synthetic-secret-value"));
  assert.ok(!JSON.stringify(inventory).includes("CREATE FUNCTION"));
});
