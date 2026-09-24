import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

// The live view of an estimate counts changes by rowversion. These tables feed the
// workspace but carry no rowversion of their own -- estimate_module_details is even
// deleted outright -- so the only way a write to them is ever noticed is that it also
// touches dbo.estimates, which does. Every write path does today. A new one that
// forgets would leave every other open screen quietly stale, and nothing else would
// ever say so.
const UNVERSIONED_WORKSPACE_TABLES = ["estimate_module_details", "estimate_erp_groups", "estimate_erp_mappings", "estimate_overhead_snapshots"];
const WRITES = (table) => new RegExp(String.raw`\b(?:INSERT(?:\s+INTO)?|UPDATE|DELETE(?:\s+FROM)?|MERGE(?:\s+INTO)?)\s+dbo\.${table}\b`);
const TOUCHES_HEADER = /touchEstimate\w*\(|UPDATE dbo\.estimates\b/;

test("every route that writes an unversioned workspace table also moves the estimate's rowversion", async () => {
  const directory = new URL("backend-node/src/routes/", root);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".ts"));
  const offenders = [];
  let inspected = 0;
  for (const name of files) {
    const source = await readFile(new URL(name, directory), "utf8");
    const starts = [...source.matchAll(/app\.(?:post|put|patch|delete)\(/g)].map((match) => match.index);
    for (const [index, start] of starts.entries()) {
      const handler = source.slice(start, starts[index + 1] ?? source.length);
      const written = UNVERSIONED_WORKSPACE_TABLES.filter((table) => WRITES(table).test(handler));
      if (!written.length) continue;
      inspected += 1;
      // A helper called from the handler counts only if the helper itself touches.
      const helpers = [...handler.matchAll(/await (\w+)\(/g)].map((match) => match[1]);
      const touchesThroughHelper = helpers.some((helper) => {
        const body = source.match(new RegExp(String.raw`async function ${helper}\([\s\S]*?\n\}`));
        return body ? TOUCHES_HEADER.test(body[0]) : false;
      });
      if (!TOUCHES_HEADER.test(handler) && !touchesThroughHelper) {
        offenders.push(`${name}:${source.slice(0, start).split("\n").length} writes ${written.join(", ")}`);
      }
    }
  }
  assert.ok(inspected >= 4, `the scan found the handlers it exists to watch (${inspected})`);
  assert.deepEqual(offenders, []);
});

test("the scan above flags a handler that writes an unversioned table without touching", () => {
  const handler = 'app.put("/x", async () => { await q.query(`UPDATE dbo.estimate_module_details SET quantity=1`); });';
  assert.ok(WRITES("estimate_module_details").test(handler));
  assert.ok(!TOUCHES_HEADER.test(handler));
});

test("the workspace hands out its sync cursor from before it reads anything", async () => {
  const route = await read("backend-node/src/routes/estimate-workspace-read.ts");
  const cursor = route.indexOf("DECLARE @sync_cursor binary(8) = MIN_ACTIVE_ROWVERSION();");
  assert.ok(cursor > 0);
  assert.ok(route.indexOf("FROM dbo.estimates e", cursor) > cursor, "declared before the first read");
  assert.match(route, /syncCursor: \(headerRow\.sync_cursor as Buffer\)\.toString\("hex"\)/);
});

test("migration 062 is applied, counted and named everywhere a fresh database is built", async () => {
  const [deploy, validation, migration] = await Promise.all([
    read("database/scripts/020_deploy_fresh_database.sql"),
    read("backend-node/src/migration-validation.ts"),
    read("database/migrations/062_record_presence.sql"),
  ]);
  assert.match(deploy, /:r database\/migrations\/062_record_presence\.sql/);
  // The exact total is pinned by the older guardrails and moves with every migration;
  // what this one needs is only that the guard reaches 062 and states one number twice.
  const guard = deploy.match(/version BETWEEN 1 AND (\d+)\) <> (\d+)/);
  assert.ok(guard && guard[1] === guard[2] && Number(guard[1]) >= 62, "the count guard covers 062");
  assert.match(deploy, /\(62, N'Record-level presence for estimates and inquiries'\)/);
  assert.match(validation, /version: 62, fileName: "062_record_presence\.sql"/);
  assert.match(migration, /VALUES \(62, N'Record-level presence for estimates and inquiries'\)/);
  // The production runner sends each GO batch through sp_executesql, so a transaction
  // must open and close inside one batch.
  for (const batch of migration.split(/^\s*GO\s*$/m)) {
    assert.equal((batch.match(/\bBEGIN TRANSACTION\b/g) ?? []).length, (batch.match(/\bCOMMIT TRANSACTION\b/g) ?? []).length);
  }
});
