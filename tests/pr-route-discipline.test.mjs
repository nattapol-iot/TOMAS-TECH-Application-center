import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a request's first approver follows its Unit's discipline (migration 116, owner 2026-11-20)", () => {
  const migration = read("database/migrations/116_pr_discipline_approvers.sql");
  assert.match(migration, /THROW 51116, 'Migration 115 must be applied before migration 116\.', 1;/);
  // Mechanical to Warit, Electrical to Taweesak, Software to Tachapon; Installation has no head, so it goes to the final approver alone.
  assert.match(migration, /\(N'ME', N'warit\.c@tomastc\.com',\s+CAST\(0 AS bit\)\)/);
  assert.match(migration, /\(N'EE', N'taweesak\.s@tomastc\.com', CAST\(0 AS bit\)\)/);
  assert.match(migration, /\(N'SW', N'tachapon\.m@tomastc\.com', CAST\(1 AS bit\)\)/);
  assert.doesNotMatch(migration, /\(N'IN',/);
  assert.match(migration, /GRANT SELECT ON OBJECT::dbo\.pr_discipline_approvers TO \[iot_team_app_role\];/);
  assert.match(read("database/rollback/116_pr_discipline_approvers.rollback.sql"), /THROW 51916, 'Roll back the migrations after 116 first\.', 1;/);
  assert.ok(read("backend-node/src/migration-validation.ts").includes('{ version: 116, fileName: "116_pr_discipline_approvers.sql", name: "PR approvers by discipline" }'));
  assert.ok(read("database/scripts/020_deploy_fresh_database.sql").includes(":r database/migrations/116_pr_discipline_approvers.sql"));
  assert.ok(read("database/scripts/010_application_login.sql").includes("GRANT SELECT ON OBJECT::dbo.pr_discipline_approvers TO [iot_team_app_role];"));

  // A request for a Unit takes the discipline's head, a request with no Unit the requester's department head.
  const routes = read("backend-node/src/routes/purchase-requisitions.ts");
  assert.match(routes, /CASE WHEN u\.id IS NOT NULL THEN da\.approver_id ELSE d\.approver_id END head_id/);
  assert.match(routes, /LEFT JOIN dbo\.pr_discipline_approvers da ON da\.discipline=u\.discipline/);
  assert.match(routes, /await approvalRoute\(transaction, requesterId, unitId === null \? null : Number\(unitId\)\)/);
  assert.match(routes, /const route = await approvalRoute\(transaction, actor\.id, unitId\);/);
  // The PR sheet asks for the route of the Unit it is for.
  assert.match(read("app/system/production/PurchaseRequestEditor.tsx"), /approval-route\$\{unitId \? `\?unitId=\$\{unitId\}` : ""\}/);
});
