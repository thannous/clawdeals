import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const spec = YAML.parse(fs.readFileSync("docs/openapi-v1.yaml", "utf8"));
const manifest = JSON.parse(fs.readFileSync("docs/openapi-route-coverage.json", "utf8"));
const exceptions = new Map(manifest.routes.map((entry) => [entry.file, entry]));
const normalize = (route) => route.replace(/\{[^}]+\}/g, "{}");
const paths = new Set(Object.keys(spec.paths).map(normalize));
const root = "src/pages/api/v1";
const files = fs.readdirSync(root, { recursive: true }).filter((file) => file.endsWith(".ts"));
const failures = [];
for (const relative of files) {
  const file = path.posix.join(root, relative);
  const route = "/v1/" + relative.replace(/(?:\/index)?\.ts$/, "").replace(/\[([^\]]+)\]/g, "{$1}");
  if (paths.has(normalize(route))) continue;
  const entry = exceptions.get(file);
  if (!entry || (!entry.exclusion && !entry.covered_paths?.length)) failures.push(`Unclassified route: ${file}`);
}
for (const entry of manifest.routes) {
  if (!fs.existsSync(entry.file)) failures.push(`Removed handler: ${entry.file}`);
  for (const route of entry.covered_paths) {
    if (!spec.paths[route]) failures.push(`Removed contract path: ${route}`);
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log(`${files.length} v1 handlers classified against ${Object.keys(spec.paths).length} OpenAPI paths; explicit exclusions in docs/openapi-route-coverage.json.`);
