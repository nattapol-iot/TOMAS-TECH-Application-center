import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("migration 042 adds a forced decimal aggregate guard without changing the totals view", async () => {
  const [migration, manifest, deploy, grants, verifier, fixture, invalidBaseline] = await Promise.all([
    readFile(new URL("database/migrations/042_estimate_total_guard.sql", root), "utf8"),
    readFile(new URL("backend-node/src/migration-validation.ts", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
    readFile(new URL("database/tests/estimate-total-boundaries.sql", root), "utf8"),
    readFile(new URL("database/tests/estimate-total-invalid-baseline.sql", root), "utf8"),
  ]);

  assert.match(migration, /CREATE OR ALTER PROCEDURE dbo\.assert_estimate_totals/);
  assert.match(migration, /WITH EXECUTE AS OWNER/);
  assert.match(migration, /DECLARE @validated TABLE/);
  for (const column of ["material_total", "engineering_total", "outsource_total", "transportation_total", "accommodation_total", "other_total", "base_total", "overhead_hourly_rate", "overhead_total", "contingency_total", "total"]) {
    assert.match(migration, new RegExp(`CONVERT\\(decimal\\(19,4\\), ${column}\\)`), `${column} must be forced through decimal(19,4)`);
  }
  assert.match(migration, /internal_direct_hours decimal\(38,6\)/);
  assert.match(migration, /IF ERROR_NUMBER\(\) = 8115[\s\S]*THROW 51420/);
  assert.match(migration, /SELECT id FROM dbo\.estimates WHERE deleted_at IS NULL/);
  assert.match(migration, /EXEC dbo\.assert_estimate_totals @estimate_id = @estimate_id/);
  assert.match(migration, /IF NOT EXISTS \(SELECT 1 FROM dbo\.schema_versions WHERE version = 42\)[\s\S]*VALUES\(42,/);
  assert.doesNotMatch(migration, /CREATE OR ALTER VIEW dbo\.v_estimate_totals/);

  assert.match(manifest, /version: 42, fileName: "042_estimate_total_guard\.sql"/);
  assert.match(deploy, /:r database\/migrations\/042_estimate_total_guard\.sql/);
  assert.match(deploy, /version BETWEEN 1 AND 70\) <> 70/);
  assert.match(grants, /REVOKE EXECUTE ON OBJECT::dbo\.assert_estimate_totals FROM \[public\]/);
  assert.match(grants, /GRANT EXECUTE ON OBJECT::dbo\.assert_estimate_totals TO \[iot_team_app_role\]/);
  assert.match(verifier, /OBJECT_ID\(N'dbo\.assert_estimate_totals', N'P'\)/);
  assert.match(verifier, /\(N'assert_estimate_totals', N'EXECUTE'\)/);
  assert.match(fixture, /999999999999999\.9998/);
  assert.match(fixture, /999999999999999\.9999/);
  assert.match(fixture, /overhead_state=N'Missing' AND overhead_total IS NULL/);
  assert.match(fixture, /ERROR_NUMBER\(\)<>51420/);
  assert.match(fixture, /EXECUTE AS USER=N'estimate_total_guard_test'/);
  assert.match(fixture, /ROLLBACK TRANSACTION/);
  assert.match(invalidBaseline, /CostPreflightCI_/);
  assert.match(invalidBaseline, /version=41/);
  assert.match(invalidBaseline, /version=42/);
  assert.match(invalidBaseline, /600000000000000\.0000/);
  assert.match(invalidBaseline, /COMMIT TRANSACTION/);
});

/**
 * Source-level boundary for COST-01.
 *
 * `dbo.assert_estimate_totals` is invoked by the Node application, not enforced as
 * database-wide DML. `docs/planning/COST_TOTAL_GUARD.md` therefore states that future
 * monetary write paths must call the shared guard. The checks below turn that sentence
 * into a failing test: any source file that writes a table feeding `v_estimate_totals`
 * has to reference `assertEstimateTotals`, or be an explicitly listed shared writer
 * whose every caller does.
 */
const backendSrc = new URL("backend-node/src/", root);

/**
 * Tables whose rows are summed by dbo.v_estimate_totals, directly or through a view it reads.
 * estimate_module_details joined in 061: a summary module's cost_multiplier scales its lines.
 */
const MONETARY_LINE_TABLES = ["cost_items", "estimate_module_details", "estimate_overhead_snapshots", "expense_lines", "manhour_lines", "other_cost_lines"];

/** Columns of dbo.estimates that change the canonical totals. */
const ESTIMATE_TOTAL_COLUMNS = /\b(?:contingency_rate|revision)\b/i;

const GUARD_CALL = /\bassertEstimateTotals\s*\(/;

const WRITE_STATEMENT = /\b(?:INSERT\s+(?:INTO\s+)?|UPDATE\s+|DELETE\s+FROM\s+|MERGE\s+(?:INTO\s+)?)(?:dbo\.)?([A-Za-z_][A-Za-z0-9_]*)/g;

/**
 * Shared helpers that write a totals-feeding table but deliberately leave the guard to
 * their callers, because they run inside a caller-owned transaction. Every importer is
 * checked instead. Add an entry only with the same caller-side proof.
 */
const SHARED_TOTALS_WRITERS = new Map([["overhead.ts", "snapshotOverheadPolicy"]]);

/** Write paths inventoried in docs/planning/COST_TOTAL_GUARD.md. Anchors the scanner against silently matching nothing. */
const DOCUMENTED_WRITE_PATHS = [
  "overhead.ts",
  "routes/estimate-cost-write.ts",
  "routes/estimate-excel-import.ts",
  "routes/estimate-workspace-write.ts",
  "routes/estimates.ts",
  "routes/site-visit-reports.ts",
];

async function collectSourceFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(new URL(`${entry.name}/`, directory), `${prefix}${entry.name}/`)));
    else if (entry.name.endsWith(".ts")) files.push({ path: `${prefix}${entry.name}`, url: new URL(entry.name, directory) });
  }
  return files;
}

/** True when a write against dbo.estimates assigns a column that feeds the totals. */
function estimateWriteChangesTotals(statement) {
  const update = /^UPDATE\s+(?:dbo\.)?estimates\s+SET\s+([\s\S]*?)(?:\bOUTPUT\b|\bFROM\b|\bWHERE\b|$)/i.exec(statement);
  if (update) return ESTIMATE_TOTAL_COLUMNS.test(update[1]);
  const insert = /^INSERT\s+(?:INTO\s+)?(?:dbo\.)?estimates\s*\(([\s\S]*?)\)/i.exec(statement);
  if (insert) return ESTIMATE_TOTAL_COLUMNS.test(insert[1]);
  // DELETE, MERGE or an unrecognised shape: assume it moves the totals.
  return true;
}

/** `UPDATE moving SET ... FROM dbo.cost_items moving` writes cost_items through its alias. */
function aliasedUpdateTarget(statement, alias) {
  if (!/^UPDATE\s/i.test(statement)) return alias;
  const source = new RegExp(`\\b(?:FROM|JOIN)\\s+(?:dbo\\.)?([A-Za-z_][A-Za-z0-9_]*)\\s+(?:AS\\s+)?${alias}\\b`, "i").exec(statement);
  return source ? source[1].toLowerCase() : alias;
}

/** Tables feeding v_estimate_totals that the given source text writes to. */
function findTotalsWrites(text) {
  const tables = new Set();
  for (const match of text.matchAll(WRITE_STATEMENT)) {
    const terminator = text.indexOf(";", match.index);
    const statement = text.slice(match.index, terminator === -1 ? text.length : terminator);
    const table = aliasedUpdateTarget(statement, match[1].toLowerCase());
    if (MONETARY_LINE_TABLES.includes(table)) tables.add(table);
    else if (table === "estimates" && estimateWriteChangesTotals(statement)) tables.add("estimates");
  }
  return tables;
}

test("the totals-guard write inventory covers every input of dbo.v_estimate_totals", async () => {
  const migrations = [];
  for (const name of (await readdir(new URL("database/migrations/", root))).filter((file) => file.endsWith(".sql")).sort()) {
    migrations.push({ name, text: await readFile(new URL(`database/migrations/${name}`, root), "utf8") });
  }
  /** Tables the latest definition of a view reads, following any dbo.v_* view it reads in turn. */
  const viewInputs = (view, seen = new Set()) => {
    const create = new RegExp(`CREATE\\s+OR\\s+ALTER\\s+VIEW\\s+dbo\\.${view}\\b`, "i");
    const latest = migrations.filter((migration) => create.test(migration.text)).at(-1);
    assert.ok(latest, `no migration defines dbo.${view}`);
    const start = create.exec(latest.text).index;
    const rest = latest.text.slice(start + 1);
    // A definition ends at GO, at the next definition, or where its sp_executesql string closes.
    const end = [/CREATE\s+OR\s+ALTER\s/i, /\r?\nGO\b/, /';\r?\n/].map((pattern) => pattern.exec(rest)?.index ?? rest.length);
    const body = latest.text.slice(start, start + 1 + Math.min(...end));
    const tables = new Set();
    for (const [, reference] of body.matchAll(/\b(?:FROM|JOIN)\s+dbo\.([A-Za-z_][A-Za-z0-9_]*)/gi)) {
      const name = reference.toLowerCase();
      if (!name.startsWith("v_")) tables.add(name);
      else if (!seen.has(name)) { seen.add(name); for (const table of viewInputs(name, seen).tables) tables.add(table); }
    }
    return { tables, name: latest.name };
  };

  const { tables: referenced, name } = viewInputs("v_estimate_totals");
  const covered = new Set([...MONETARY_LINE_TABLES, "estimates"]);

  for (const table of referenced) {
    assert.ok(covered.has(table), `${name} feeds dbo.${table} into v_estimate_totals but the source guardrail does not watch writes to it`);
  }
  for (const table of covered) {
    assert.ok(referenced.has(table), `dbo.${table} is watched by the source guardrail but no longer feeds v_estimate_totals in ${name}`);
  }
});

test("every Node write path to a totals-feeding table calls assertEstimateTotals", async () => {
  const files = await collectSourceFiles(backendSrc);
  assert.ok(files.length > 0, "no backend sources were scanned");

  const writers = new Map();
  const sources = new Map();
  for (const file of files) {
    const text = await readFile(file.url, "utf8");
    sources.set(file.path, text);
    const tables = findTotalsWrites(text);
    if (tables.size > 0) writers.set(file.path, tables);
  }

  // The scanner must still see the write paths the design document inventories; a
  // pattern that silently stops matching would otherwise make this test vacuous.
  for (const documented of DOCUMENTED_WRITE_PATHS) {
    assert.ok(writers.has(documented), `${documented} is an inventoried estimate write path but the scanner found no monetary write in it`);
  }
  for (const table of [...MONETARY_LINE_TABLES, "estimates"]) {
    assert.ok([...writers.values()].some((tables) => tables.has(table)), `no scanned source writes dbo.${table}; the write detection for that table is no longer effective`);
  }

  const unguarded = [...writers.keys()].filter((path) => !SHARED_TOTALS_WRITERS.has(path) && !GUARD_CALL.test(sources.get(path)));
  assert.deepEqual(
    unguarded,
    [],
    `these sources write a table feeding v_estimate_totals without calling assertEstimateTotals: ${unguarded.join(", ")}. ` +
      "Call the shared guard inside the same transaction before commit (see docs/planning/COST_TOTAL_GUARD.md).",
  );

  // Allowlisted shared writers push the duty onto their callers, so prove the duty is met.
  for (const [path, helper] of SHARED_TOTALS_WRITERS) {
    const definition = sources.get(path);
    assert.ok(definition, `${path} is allowlisted as a shared totals writer but does not exist`);
    assert.ok(writers.has(path), `${path} is allowlisted as a shared totals writer but no longer writes a totals-feeding table; remove the allowlist entry`);
    assert.match(definition, new RegExp(`export\\s+async\\s+function\\s+${helper}\\b`), `${path} must export ${helper} for the caller-side guard rule to mean anything`);
    const callers = [...sources.entries()].filter(([candidate, text]) => candidate !== path && new RegExp(`\\b${helper}\\s*\\(`).test(text));
    assert.ok(callers.length > 0, `${helper} has no callers; remove the allowlist entry instead of leaving it unenforced`);
    for (const [caller, text] of callers) {
      assert.match(text, GUARD_CALL, `${caller} calls ${helper}, which writes a totals-feeding table, so it must also call assertEstimateTotals`);
    }
  }
});

test("the write-path scanner rejects an unguarded monetary write", () => {
  const unguardedRoute = "await request.query(`INSERT INTO dbo.cost_items(estimate_id,revision,qty) VALUES(@id,@revision,@qty);`);";
  const guardedRoute = `${unguardedRoute}\nawait assertEstimateTotals(transaction, id);`;
  const softDelete = 'await request.query("UPDATE dbo.manhour_lines SET deleted_at=SYSUTCDATETIME() WHERE id=@id;");';
  const contingency = 'await request.query("UPDATE dbo.estimates SET contingency_rate=@rate WHERE id=@id;");';
  const statusOnly = "await request.query(\"UPDATE dbo.estimates SET status=N'Approved' WHERE id=@id AND revision=@revision;\");";
  const readOnly = 'await request.query("SELECT total FROM dbo.v_estimate_totals WHERE estimate_id=@id;");';
  const aliasedMove = "await query.query(`UPDATE moving SET module=target.module FROM dbo.cost_items moving INNER JOIN dbo.cost_items target ON target.id=@target_id WHERE moving.estimate_id=@id;`);";
  const aliasedNonMonetary = "await query.query(`UPDATE t SET status=N'Done' FROM dbo.resource_tasks t WHERE t.id=@id;`);";

  assert.deepEqual([...findTotalsWrites(unguardedRoute)], ["cost_items"]);
  assert.ok(!GUARD_CALL.test(unguardedRoute), "the unguarded sample must not look guarded");
  assert.ok(GUARD_CALL.test(guardedRoute), "the guarded sample must look guarded");
  assert.deepEqual([...findTotalsWrites(softDelete)], ["manhour_lines"], "soft deletes change the totals and must be detected");
  assert.deepEqual([...findTotalsWrites(contingency)], ["estimates"], "a contingency change must be detected");
  assert.deepEqual([...findTotalsWrites(statusOnly)], [], "a non-monetary estimate update must not be flagged");
  assert.deepEqual([...findTotalsWrites(readOnly)], [], "reads must not be flagged");
  assert.deepEqual([...findTotalsWrites(aliasedMove)], ["cost_items"], "an UPDATE through a FROM alias writes the aliased table");
  assert.deepEqual([...findTotalsWrites(aliasedNonMonetary)], [], "an aliased update of another table must not be flagged");
});
