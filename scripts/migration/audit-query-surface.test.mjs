import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditQuerySurface } from "./audit-query-surface.mjs";

test("census covers fluent continuations and whitespace relationships without counting Buffer/Array/storage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawdeals-census-"));
  try {
    fs.mkdirSync(path.join(root, "src/server"), { recursive: true }); fs.mkdirSync(path.join(root, "src/pages/api"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/server/fixture.ts"), `
      const selection = flag ? 'id, agents (owner_id), owners(owner_id,suspended_at)' : '*';
      const query = client.from('agent_installations').select(selection);
      query.eq('id','x').textSearch('name','x');
      query.filter('id','fts','query').order('id',{referencedTable:'agents'});
      client.from('watchlists').select('owners(secret)');
      client.from(table).select(columns);
      Array.from(values).map(x=>x); Buffer.from('x').toString(); client.storage.from('bucket').download('x');
    `);
    const report = auditQuerySurface(root);
    assert.equal(report.queries.length, 3);
    assert(report.continuations.some((entry) => entry.method === "eq"));
    assert(report.unsupported.some((entry) => entry.method === "textSearch"));
    assert(report.unsupported.some((entry) => entry.table === "watchlists" && entry.relation === "owners"));
    assert(!report.unsupported.some((entry) => entry.table === "agent_installations"));
    assert(report.dynamic.some((entry) => entry.kind === "projection"));
    assert(report.unsupported.some((entry) => entry.operator === "fts"));
    assert(report.unsupported.some((entry) => entry.option === "referencedTable"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
