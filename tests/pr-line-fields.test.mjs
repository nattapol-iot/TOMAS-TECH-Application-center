import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a request line keeps the PR-Form's fields and the line it is a part of (migration 115, owner 2026-11-20)", () => {
  const migration = read("database/migrations/115_pr_line_form_fields.sql");
  assert.match(migration, /THROW 51115, 'Migration 114 must be applied before migration 115\.', 1;/);
  for (const column of [
    "material nvarchar(200)",
    "treatment nvarchar(200)",
    "detail nvarchar(500)",
    "qty_per_set decimal(19,4)",
    "need_by date",
    "attachment_url nvarchar(500)",
    "parent_line_id bigint",
  ])
    assert.ok(migration.includes(`ADD ${column} NULL`), column);
  // A part belongs to a line of the same request, never to itself; a link is a web link.
  assert.match(migration, /FOREIGN KEY \(parent_line_id, pr_id\) REFERENCES dbo\.mat_pr_lines\(id, pr_id\)/);
  assert.match(migration, /parent_line_id IS NULL OR parent_line_id <> id/);
  assert.match(migration, /attachment_url LIKE N''https:\/\/%''/);
  assert.match(migration, /GRANT UPDATE \(parent_line_id\) ON OBJECT::dbo\.mat_pr_lines TO \[iot_team_app_role\];/);
  assert.match(read("database/rollback/115_pr_line_form_fields.rollback.sql"), /THROW 51915, 'Roll back the migrations after 115 first\.', 1;/);
  assert.ok(read("backend-node/src/migration-validation.ts").includes('{ version: 115, fileName: "115_pr_line_form_fields.sql", name: "PR line form fields and part lines" }'));
  assert.ok(read("database/scripts/020_deploy_fresh_database.sql").includes(":r database/migrations/115_pr_line_form_fields.sql"));
  assert.ok(read("database/scripts/010_application_login.sql").includes("GRANT UPDATE (parent_line_id) ON OBJECT::dbo.mat_pr_lines TO [iot_team_app_role];"));
  // The API writes the parts after the lines, by place, in the same transaction; the ERP hears of them in the remark.
  const routes = read("backend-node/src/routes/purchase-requisitions.ts");
  assert.match(routes, /UPDATE child SET child\.parent_line_id=head\.id/);
  assert.match(routes, /const parts = partLineProblem\(lines\.map\(\(line\) => line\.form\)\);/);
  assert.match(read("backend-node/src/erp-purchasing.ts"), /line\.part_of \? `Part of \$\{line\.part_of\}` : ""/);
});

test("the PR sheet shows the PR-Form's columns on demand and makes a row a part of the line above, with its guide steps", () => {
  const editor = read("app/system/production/PurchaseRequestEditor.tsx"),
    guides = read("app/system/production/guide-catalog.ts");
  assert.match(editor, /data-guide="pr\.form-fields" aria-pressed=\{showForm\}/);
  assert.match(editor, /data-guide="pr\.part" aria-pressed=\{Boolean\(parent\)\}/);
  assert.match(editor, /onClick=\{\(\) => setRows\(togglePart\(rows, row\.key\)\)\}/);
  assert.match(editor, /setRows\(withoutRows\(rows, new Set\(\[row\.key\]\)\)\)/);
  // The catalog is formatted one property per line; the step reads on one line once the line breaks are folded.
  const flatGuides = guides.replace(/\s+/g, " ");
  for (const target of ["pr.form-fields", "pr.part", "pr.import"]) assert.ok(flatGuides.includes(`target: "${target}", action: "next", view: "purchase"`), target);
  // The request page and the Unit overview read them too.
  assert.match(read("app/system/production/MaterialScreens.tsx"), /line\.attachmentUrl \? <small><a href=\{line\.attachmentUrl\} target="_blank" rel="noopener noreferrer">/);
  assert.match(read("backend-node/src/routes/purchase-units.ts"), /MIN\(CASE WHEN .* THEN COALESCE\(l\.need_by,pr\.required_date\) END\) need_by/);
});
