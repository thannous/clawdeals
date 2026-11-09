import test from "node:test";
import assert from "node:assert/strict";
import { buildObjectTransformManifest, validateObjectTransformManifest } from "./object-transform-manifest.mjs";
import { digest, sha256 } from "./transfer-contract.mjs";
const id = name => ({ schema: "public", kind: "TABLE", name, identity_arguments: "", parent_identity: null });
function fixture() {
  const prefix = Buffer.from("-- synthetic envelope\n"), a = Buffer.from("CREATE TABLE public.a (id integer);\n"), b = Buffer.from("CREATE TABLE public.b (id integer);\n");
  const replacement = Buffer.from("CREATE TABLE public.b (id bigint);\n");
  return {
    source: { archive_sha256: sha256("fixture archive"), artifact_sha256: sha256(Buffer.concat([prefix, a, b])), artifact: Buffer.concat([prefix, a, b]), redacted: false, metadata_sha256: sha256("fixture metadata"), objects: [
      { identity: id("a"), start: prefix.length, end: prefix.length + a.length, definition_sha256: sha256(a) },
      { identity: id("b"), start: prefix.length + a.length, end: prefix.length + a.length + b.length, definition_sha256: sha256(b) }
    ] },
    replacements: [{ identity: id("b"), definition: replacement, definition_sha256: sha256(replacement), redacted: false }],
    reviews: [
      { source_identity: id("a"), source_definition_sha256: sha256(a), action: "keep", target_identity: id("a"), target_definition_sha256: sha256(a), review_reference: "fixture-review/1" },
      { source_identity: id("b"), source_definition_sha256: sha256(b), action: "replace", target_identity: id("b"), target_definition_sha256: sha256(replacement), review_reference: "fixture-review/2" }
    ], ordering: [id("a"), id("b")]
  };
}
test("explicit complete decisions bind source, replacements and order without SQL output", () => {
  const inputs = fixture(), manifest = buildObjectTransformManifest(inputs);
  assert.deepEqual(validateObjectTransformManifest(manifest, inputs, digest(manifest)), { valid_review_binding: true, executable: false, restore_eligible: false, cutover_eligible: false });
  assert.ok(!JSON.stringify(manifest).includes("CREATE TABLE"));
  assert.equal(manifest.ordered_transformations[1].ordinal, 1);
});
test("changed archive, metadata, byte envelope, source object or replacement invalidates approval", () => {
  for (const mutate of [
    x => { x.source.archive_sha256 = sha256("other archive"); },
    x => { x.source.metadata_sha256 = sha256("other metadata"); },
    x => { x.source.artifact[0] ^= 1; },
    x => { x.source.artifact[x.source.objects[0].start] ^= 1; },
    x => { x.replacements[0].definition[0] ^= 1; },
    x => { x.ordering.reverse(); },
    x => { x.reviews[0].review_reference = "new-review"; }
  ]) {
    const inputs = fixture(), manifest = buildObjectTransformManifest(inputs), approved = digest(manifest); mutate(inputs);
    assert.throws(() => validateObjectTransformManifest(manifest, inputs, approved));
  }
});
test("even consistently updated object hashes cannot reuse a previous manifest approval", () => {
  const inputs = fixture(), manifest = buildObjectTransformManifest(inputs), approved = digest(manifest);
  inputs.source.artifact[inputs.source.objects[0].start] ^= 1;
  inputs.source.artifact_sha256 = sha256(inputs.source.artifact);
  const o = inputs.source.objects[0]; o.definition_sha256 = sha256(inputs.source.artifact.subarray(o.start, o.end));
  inputs.reviews[0].source_definition_sha256 = o.definition_sha256;
  inputs.reviews[0].target_definition_sha256 = o.definition_sha256;
  const changed = buildObjectTransformManifest(inputs);
  assert.throws(() => validateObjectTransformManifest(changed, inputs, approved));
});
test("missing/unexpected/duplicate decisions, objects, replacements and order refused", () => {
  for (const mutate of [
    x => x.reviews.pop(),
    x => x.reviews.push(x.reviews[0]),
    x => { x.reviews[0].source_identity = id("unknown"); },
    x => { x.reviews[0].action = "candidate"; },
    x => { x.reviews[0].action = "omit"; },
    x => x.source.objects.push(x.source.objects[0]),
    x => { x.source.objects[1].start = 0; },
    x => { x.source.objects[1].identity = id("a"); },
    x => x.replacements.push({ ...x.replacements[0], identity: id("unused") }),
    x => { x.ordering[1] = id("a"); },
    x => { x.ordering[1] = id("unknown"); },
    x => { x.reviews[1].target_identity = id("other"); }
  ]) { const inputs = fixture(); mutate(inputs); assert.throws(() => buildObjectTransformManifest(inputs)); }
});
test("redactions and unverified redaction attestations cannot be approved away", () => {
  for (const mutate of [
    x => { x.source.redacted = true; },
    x => { x.replacements[0].redacted = true; },
    x => { x.source.artifact = Buffer.from("REDACTED_FOR_REVIEW_1"); x.source.artifact_sha256 = sha256(x.source.artifact); },
    x => { x.replacements[0].definition = Buffer.from("REDACTED_FOR_REVIEW_2"); x.replacements[0].definition_sha256 = sha256(x.replacements[0].definition); }
  ]) { const inputs = fixture(); mutate(inputs); assert.throws(() => buildObjectTransformManifest(inputs)); }
});
test("forged execution flags or extra manifest fields never validate", () => {
  const inputs = fixture(), original = buildObjectTransformManifest(inputs);
  for (const manifest of [{ ...original, executable: true }, { ...original, restore_eligible: true }, { ...original, bypass: true }]) assert.throws(() => validateObjectTransformManifest(manifest, inputs, digest(manifest)));
});


test("routine overloads require explicit structured identity arguments", () => {
  const inputs = fixture();
  const first = { ...id("lookup"), kind: "FUNCTION", identity_arguments: "uuid" };
  const second = { ...id("lookup"), kind: "FUNCTION", identity_arguments: "uuid, text" };
  inputs.source.objects[0].identity = first; inputs.source.objects[1].identity = second;
  inputs.reviews[0].source_identity = first; inputs.reviews[0].target_identity = first;
  inputs.reviews[1].source_identity = second; inputs.reviews[1].target_identity = second;
  inputs.replacements[0].identity = second; inputs.ordering = [first, second];
  const manifest = buildObjectTransformManifest(inputs);
  assert.equal(manifest.source_objects.length, 2);
  assert.equal(validateObjectTransformManifest(manifest, inputs, digest(manifest)).valid_review_binding, true);
  inputs.source.objects[1].identity = first;
  assert.throws(() => buildObjectTransformManifest(inputs), /Duplicate source identity/);
  const missing = fixture(); delete missing.source.objects[0].identity.identity_arguments;
  assert.throws(() => buildObjectTransformManifest(missing));
});

test("relation-scoped trigger and attachment identities bind explicit parents", () => {
  for (const kind of ["TRIGGER", "INDEX ATTACH", "TABLE ATTACH"]) {
    const inputs = fixture();
    const first = { ...id("same_name"), kind, parent_identity: { schema: "public", name: "parent_one" } };
    const second = { ...first, parent_identity: { schema: "public", name: "parent_two" } };
    inputs.source.objects[0].identity = first; inputs.source.objects[1].identity = second;
    inputs.reviews[0].source_identity = first; inputs.reviews[0].target_identity = first;
    inputs.reviews[1].source_identity = second; inputs.reviews[1].target_identity = second;
    inputs.replacements[0].identity = second; inputs.ordering = [first, second];
    const manifest = buildObjectTransformManifest(inputs);
    assert.equal(validateObjectTransformManifest(manifest, inputs, digest(manifest)).valid_review_binding, true);
    inputs.source.objects[0].identity = { ...first, parent_identity: null };
    assert.throws(() => buildObjectTransformManifest(inputs), /parent relation identity required/);
  }
});
