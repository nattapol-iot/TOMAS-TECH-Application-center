import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { suggestedImportProject } from "../lib/estimate-excel-import.ts";

// Historical import (owner request 2026-11-25): an old Excel Estimate Cost becomes the Draft estimate of a project
// that has none, linked to it, through the same checked workbook parser as the import into an open estimate.

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("the workbook's project number, else its job name, suggests the project", () => {
  const projects = [
    { id: 1, projectNo: "PJ260068", name: "AGV line for Kiriu plant" },
    { id: 2, projectNo: "PJ000000", name: "Warehouse WMS" },
    { id: 3, projectNo: "PJ250011", name: "IoT" },
  ];
  assert.equal(suggestedImportProject(projects, "PJ260068_Estimate cost_R2.xlsx", "Something else")?.id, 1);
  assert.equal(suggestedImportProject(projects, "estimate.xlsx", "Warehouse WMS phase 2")?.id, 2);
  // Too short a name matches nothing rather than everything.
  assert.equal(suggestedImportProject(projects, "estimate.xlsx", "IoT dashboard"), undefined);
  assert.equal(suggestedImportProject(projects, "estimate.xlsx", ""), undefined);
});

test("migration 134 marks imported estimates and lets the API link them to a project", async () => {
  const [migration, rollback, validation, deploy, login] = await Promise.all([
    source("database/migrations/134_estimate_historical_import.sql"),
    source("database/rollback/134_estimate_historical_import.rollback.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
    source("database/scripts/010_application_login.sql"),
  ]);
  assert.match(migration, /ALTER TABLE dbo\.estimates ADD historical_source nvarchar\(500\) NULL;/);
  assert.match(migration, /GRANT UPDATE \(estimate_id, inquiry_id\) ON OBJECT::dbo\.projects TO \[iot_team_app_role\];/);
  // 133 belongs to another change; this one needs only 132, so either order of deploy works.
  assert.match(migration, /WHERE version = 132\)\n\s+THROW 51342/);
  assert.doesNotMatch(migration, /WHERE version = 133\)/);
  assert.match(migration, /VALUES \(134, N'Estimate historical import'\)/);
  assert.match(rollback, /ALTER TABLE dbo\.estimates DROP COLUMN historical_source;/);
  assert.match(validation, /\{ version: 134, fileName: "134_estimate_historical_import\.sql", name: "Estimate historical import" \}/);
  assert.match(deploy, /:r database\/migrations\/134_estimate_historical_import\.sql/);
  assert.match(login, /-- database\/migrations\/134_estimate_historical_import\.sql\nGRANT UPDATE \(estimate_id, inquiry_id\) ON OBJECT::dbo\.projects/);
});

test("the import writes one Draft estimate for a project without one, from the uploaded bytes, in one transaction", async () => {
  const [route, excel, app, list] = await Promise.all([
    source("backend-node/src/routes/estimate-historical-import.ts"),
    source("backend-node/src/routes/estimate-excel-import.ts"),
    source("backend-node/src/app.ts"),
    source("backend-node/src/routes/estimates.ts"),
  ]);
  assert.match(app, /registerEstimateHistoricalImportRoutes\(app, database, users, config\);/);
  // The server reads the uploaded workbook again; the browser's preview decides nothing.
  assert.match(route, /validateOriginalEstimateWorkbook\(input, await readFile\(upload\.file\.filepath\)/);
  // The project is locked and must still have no estimate; a retry of the same file returns the estimate it made.
  assert.match(route, /FROM dbo\.projects WITH\(UPDLOCK,HOLDLOCK\) WHERE id=@id AND deleted_at IS NULL/);
  assert.match(route, /"project_has_estimate"/);
  assert.match(route, /alreadyImported: true/);
  // A Draft R00 dated from the workbook, marked with its file, and its rows through the shared writer.
  assert.match(route, /VALUES\(@number,@inquiry,@customer,@name,@type,@owner,0,@date,@due,N'Draft',0,@contingency,@source,@actor,@actor\)/);
  assert.match(route, /await writeImportedWorkbook\(transaction, \{ id, number, revision: 0,/);
  assert.match(excel, /export async function writeImportedWorkbook\(/);
  assert.match(excel, /const after = await writeImportedWorkbook\(transaction, \{ id, number: e\.estimate_no, revision: e\.revision/);
  // An estimate needs an inquiry: the project's own, or one recorded for the import.
  assert.match(route, /issueDocumentNumber\(transaction, "INQ", today\)/);
  assert.match(route, /UPDATE dbo\.projects SET estimate_id=@estimate,inquiry_id=@inquiry,updated_by=@actor,updated_at=SYSUTCDATETIME\(\) WHERE id=@project AND estimate_id IS NULL/);
  // The list says which estimates were imported and can show only those.
  assert.match(list, /AND \(@historical_only=0 OR e\.historical_source IS NOT NULL\)/);
  assert.match(list, /historicalSource: row\.historical_source \?\? null/);
});

test("the estimate list offers the import, tags imported rows and filters them", async () => {
  const [screens, modal, guides] = await Promise.all([
    source("app/system/production/EstimateScreens.tsx"),
    source("app/system/production/EstimateHistoricalImport.tsx"),
    source("app/system/production/guide-catalog.ts"),
  ]);
  assert.match(screens, /data-guide="estimate\.historical-import" onClick=\{\(\) => setHistoricalOpen\(true\)\}/);
  assert.match(screens, /historical: historicalOnly \|\| undefined,/);
  assert.match(screens, /\{item\.historicalSource \? \(\s*<span className="pill est-historical"/);
  assert.match(screens, /<HistoricalEstimateImportModal\s+bootstrap=\{bootstrap\}/);
  for (const mark of ["estimate.historical-project", "estimate.historical-file", "estimate.historical-preview", "estimate.historical-save"]) assert.ok(modal.includes(`"${mark}"`), mark);
  assert.match(modal, /<EstimateImportPreviewDetails preview=\{preview\} \/>/);
  assert.match(guides, /id: "estimate-historical-import",/);
});
