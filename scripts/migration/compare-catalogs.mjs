import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { canonical } from "./transfer-contract.mjs";
export function compareCatalogs(source, target) {
  const differences = [];
  for (const key of ["schemas", "relations", "routines", "extensions"]) {
    const normalize = entries => (entries || []).map(canonical).sort();
    const expected = new Set(normalize(source[key])), actual = new Set(normalize(target[key]));
    for (const item of expected) if (!actual.has(item)) differences.push({ domain: key, change: "missing-or-changed", definition: JSON.parse(item) });
    for (const item of actual) if (!expected.has(item)) differences.push({ domain: key, change: "extra-or-changed", definition: JSON.parse(item) });
  }
  return { matches: differences.length === 0, differences, row_data_verified: false, cutover_eligible: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = compareCatalogs(...process.argv.slice(2, 4).map(file => JSON.parse(fs.readFileSync(file, "utf8"))));
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.matches ? 0 : 1;
}
