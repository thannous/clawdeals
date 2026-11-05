import { canonical, digest, sha256 } from "./transfer-contract.mjs";

const FORMAT = "clawdeals-object-transform-review-v1";
const HASH = /^[a-f0-9]{64}$/;
function assert(condition, message) { if (!condition) throw new Error(message); }
function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `Invalid ${label}`);
  assert(Object.keys(value).sort().join("|") === [...keys].sort().join("|"), `Unexpected or missing ${label} fields`);
}
function identity(value) {
  exactKeys(value, ["schema", "kind", "name", "identity_arguments", "parent_identity"], "object identity");
  const text = (v, empty = false) => typeof v === "string" && (empty || v.length > 0) && v.length <= 4096 && !/[\r\n\0]/.test(v);
  assert([value.schema, value.kind, value.name].every(v => text(v)), "Invalid object identity text");
  assert(text(value.identity_arguments, true), "Explicit identity arguments required");
  const routine = ["FUNCTION", "PROCEDURE", "AGGREGATE"].includes(value.kind);
  assert(routine || value.identity_arguments === "", "Nonroutine identity arguments must be empty");
  // Relation-scoped names (e.g. triggers) and attachments require an explicit
  // parent relation identity; no hidden name concatenation convention.
  const scoped = ["TRIGGER", "CONSTRAINT", "FK CONSTRAINT", "POLICY", "RULE", "TABLE ATTACH", "INDEX ATTACH"].includes(value.kind);
  if (value.parent_identity !== null) {
    exactKeys(value.parent_identity, ["schema", "name"], "parent relation identity");
    assert(text(value.parent_identity.schema) && text(value.parent_identity.name), "Invalid parent relation identity");
  }
  assert(!scoped || value.parent_identity !== null, "Explicit parent relation identity required");
  assert(scoped || value.parent_identity === null, "Unexpected parent identity for unscoped object");
  return { schema: value.schema, kind: value.kind, name: value.name, identity_arguments: value.identity_arguments, parent_identity: value.parent_identity === null ? null : { ...value.parent_identity } };
}
function bytes(value, label) {
  assert(Buffer.isBuffer(value) && value.length > 0, `${label} must be nonempty bytes`);
  // Current export's explicit markers. External redaction attestation is also
  // required: arbitrary/unknown masking cannot be detected by this check.
  assert(!/REDACTED_FOR_REVIEW_[0-9]+/i.test(value.toString("utf8")), "Redacted review bytes cannot enter a transformation manifest");
  return value;
}
function hash(value, label) { assert(typeof value === "string" && HASH.test(value), `Invalid ${label} digest`); return value; }

/** Pure metadata builder. Does not parse/execute/emit SQL, read files, or approve DDL.
 * Source spans must come from separately reviewed structural extraction. Identity
 * labels are assertions, not inferred SQL identities. Full bytes bind even gaps. */
export function buildObjectTransformManifest({ source, replacements, reviews, ordering }) {
  exactKeys(source, ["archive_sha256", "artifact_sha256", "artifact", "redacted", "objects", "metadata_sha256"], "source");
  const artifact = bytes(source.artifact, "Source artifact");
  assert(source.redacted === false, "Explicit non-redacted source attestation required");
  assert(sha256(artifact) === hash(source.artifact_sha256, "artifact"), "Source artifact bytes changed");
  hash(source.archive_sha256, "archive"); hash(source.metadata_sha256, "metadata");
  assert(Array.isArray(source.objects) && source.objects.length > 0, "Complete source object inventory required");
  const sources = new Map();
  let previousEnd = 0;
  for (const record of source.objects) {
    exactKeys(record, ["identity", "start", "end", "definition_sha256"], "source object");
    const id = identity(record.identity), key = canonical(id);
    assert(!sources.has(key), "Duplicate source identity");
    assert(Number.isSafeInteger(record.start) && Number.isSafeInteger(record.end) && record.start >= previousEnd && record.end > record.start && record.end <= artifact.length, "Invalid, overlapping or unordered source spans");
    const definition = bytes(artifact.subarray(record.start, record.end), "Object definition");
    assert(sha256(definition) === hash(record.definition_sha256, "definition"), "Source object definition changed");
    sources.set(key, { identity: id, start: record.start, end: record.end, definition_sha256: record.definition_sha256 });
    previousEnd = record.end;
  }
  assert(Array.isArray(replacements) && Array.isArray(reviews) && Array.isArray(ordering), "Explicit replacement/review/order lists required");
  const replacementMap = new Map();
  for (const record of replacements) {
    exactKeys(record, ["identity", "definition", "definition_sha256", "redacted"], "replacement");
    const id = identity(record.identity), key = canonical(id);
    assert(!replacementMap.has(key), "Duplicate replacement identity");
    assert(record.redacted === false, "Non-redacted replacement attestation required");
    assert(sha256(bytes(record.definition, "Replacement definition")) === hash(record.definition_sha256, "replacement"), "Replacement bytes changed");
    replacementMap.set(key, { identity: id, definition_sha256: record.definition_sha256 });
  }
  assert(reviews.length === sources.size && ordering.length === sources.size, "Every source object requires one explicit review and order entry");
  const decisions = new Map(), usedReplacements = new Set(), targets = new Set();
  for (const review of reviews) {
    exactKeys(review, ["source_identity", "source_definition_sha256", "action", "target_identity", "target_definition_sha256", "review_reference"], "review");
    const sourceId = identity(review.source_identity), sourceKey = canonical(sourceId), original = sources.get(sourceKey);
    assert(original && !decisions.has(sourceKey), "Unexpected or duplicate reviewed source object");
    assert(review.source_definition_sha256 === original.definition_sha256, "Review does not bind current source definition");
    assert(typeof review.review_reference === "string" && /^[a-zA-Z0-9._:/#-]{1,256}$/.test(review.review_reference), "Explicit nonsecret review reference required");
    const targetId = identity(review.target_identity), targetKey = canonical(targetId);
    assert(!targets.has(targetKey), "Duplicate output identity"); targets.add(targetKey);
    assert(review.action === "keep" || review.action === "replace", "Only explicit keep or replace supported; no implicit omissions");
    if (review.action === "keep") {
      assert(sourceKey === targetKey && review.target_definition_sha256 === original.definition_sha256, "Keep decision changed identity or definition");
    } else {
      const replacement = replacementMap.get(targetKey);
      assert(replacement && replacement.definition_sha256 === review.target_definition_sha256, "Exact reviewed replacement required");
      assert(!usedReplacements.has(targetKey), "Replacement reused"); usedReplacements.add(targetKey);
    }
    decisions.set(sourceKey, { source_identity: sourceId, source_definition_sha256: original.definition_sha256, action: review.action, target_identity: targetId, target_definition_sha256: review.target_definition_sha256, review_reference: review.review_reference });
  }
  assert(usedReplacements.size === replacementMap.size, "Unexpected or unused replacement");
  const ordered = [], seen = new Set();
  for (const item of ordering) {
    const key = canonical(identity(item));
    assert(decisions.has(key) && !seen.has(key), "Missing, duplicate or unexpected ordering entry");
    seen.add(key); ordered.push({ ordinal: ordered.length, ...decisions.get(key) });
  }
  return {
    format: FORMAT,
    source_archive_sha256: source.archive_sha256,
    source_artifact_sha256: source.artifact_sha256,
    source_artifact_bytes: artifact.length,
    source_metadata_sha256: source.metadata_sha256,
    source_objects: [...sources.values()],
    ordered_transformations: ordered,
    review_only: true,
    executable: false,
    structural_identities_verified: false,
    dependency_closure_verified: false,
    authorization_closure_verified: false,
    restore_eligible: false,
    cutover_eligible: false
  };
}

/** Approval digest must be retained independently by the reviewing orchestrator.
 * It detects changes; it is not an authentication signature or user authorization. */
export function validateObjectTransformManifest(manifest, inputs, approvedManifestSha256) {
  hash(approvedManifestSha256, "approved manifest");
  assert(digest(manifest) === approvedManifestSha256, "Reviewed manifest changed");
  const expected = buildObjectTransformManifest(inputs);
  assert(canonical(manifest) === canonical(expected), "Current artifacts, archive, metadata or decisions differ from reviewed manifest");
  return { valid_review_binding: true, executable: false, restore_eligible: false, cutover_eligible: false };
}
