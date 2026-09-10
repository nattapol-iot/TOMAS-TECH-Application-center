import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  assert.match(deploy, /40, 41, 42\)\) <> 42/);
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
