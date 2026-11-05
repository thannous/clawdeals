import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { sha256 } from "./transfer-contract.mjs";

/** Metadata-only review, never an executable transform or a dependency proof. */
export function reviewSchema(sql) {
  const objects = [];
  for (const block of String(sql).split(/^-- Name: /m).slice(1)) {
    const header = block.slice(0, block.indexOf("\n"));
    const match = header.match(/^(.*); Type: (.*); Schema: (.*); Owner: (.*)$/);
    if (!match) throw new Error("Unrecognized dump object header");
    const [, name, kind, schema, owner] = match;
    const reasons = [], references = [...new Set([...block.matchAll(/\b(public|private|extensions|auth|storage|realtime|vault|cron|net)\.([a-z_][a-z0-9_]*)/gi)].map(m => `${m[1]}.${m[2]}`))].sort();
    let classification = "portable-candidate";
    if (references.some(r => /^(?:net|vault|cron|auth|storage|realtime)\./.test(r))) {
      classification = "blocked"; reasons.push("Provider dependency needs explicit replacement and behavioral proof");
    }
    if (/\bEXECUTE\b/i.test(block) && kind === "FUNCTION") {
      classification = "blocked"; reasons.push("Dynamic SQL dependency closure needs manual structural review");
    }
    if (["POLICY", "ROW SECURITY"].includes(kind)) {
      classification = "adaptation-required"; reasons.push("Review authorization model; source policies do not prove Neon runtime grants");
    }
    if (references.some(r => r.startsWith("extensions."))) reasons.push("Requires verified PostGIS extension namespace and supported version");
    if (/\bSECURITY DEFINER\b/i.test(block)) reasons.push("Security-definer owner/search_path/EXECUTE grants require explicit review");
    if (["TABLE ATTACH", "INDEX ATTACH"].includes(kind)) reasons.push("Partition dependency closure and future maintenance must be preserved");
    if (/REDACTED_FOR_REVIEW_[0-9]+/.test(block)) { classification = "blocked"; reasons.push("Redacted artifact is review-only; never restore placeholder definitions"); }
    if (kind === "FUNCTION" || kind === "VIEW" || kind === "TRIGGER" || kind === "CONSTRAINT" || kind === "FK CONSTRAINT" || kind === "INDEX") reasons.push("Executable or relational dependencies need full structural closure before admission");
    objects.push({ schema, name, kind, source_owner: owner, classification, reasons, textual_references: references, definition_sha256: sha256(block) });
  }
  // Conservative transitive closure of explicit qualified references only.
  // Overloaded names may resolve to several objects; no inferred edge is proof.
  let changed = true;
  while (changed) {
    changed = false;
    const blockedNames = new Set(objects.filter(o => o.classification === "blocked").map(o => `${o.schema}.${o.name.split("(")[0]}`));
    for (const object of objects) {
      if (object.classification !== "portable-candidate") continue;
      const dependencies = object.textual_references.filter(r => blockedNames.has(r));
      if (dependencies.length) {
        object.classification = "blocked";
        object.reasons.push("Qualified reference reaches blocked object: " + dependencies.join(", "));
        changed = true;
      }
    }
  }
  const counts = {};
  for (const object of objects) counts[object.kind] = (counts[object.kind] || 0) + 1;
  return { format: "clawdeals-schema-review-inventory-v1", artifact_sha256: sha256(sql), review_only: true, source_rows_included: false, dependency_closure_verified: false, source_ownership_and_acl_verified: false, restore_eligible: false, counts, objects };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw new Error("Provide one authorized schema-only review file");
  console.log(JSON.stringify(reviewSchema(fs.readFileSync(process.argv[2], "utf8")), null, 2));
}
