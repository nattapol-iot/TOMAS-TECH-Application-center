import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const requisitions = read("backend-node/src/routes/purchase-requisitions.ts");

test("a request takes the app's own REQ number, for its project and Unit (migration 114, owner 2026-11-20)", () => {
  // No request is numbered from the old PR sequence any more: it read like the ERP's own PR number.
  assert.ok(!requisitions.includes('issueDocumentNumber(transaction, "PR"'));
  assert.ok(requisitions.includes("const number = await issueRequestNumber(transaction, projectId, unitId);"));
  // Rounds count every request ever raised for the Unit, and a number another project holds is skipped.
  assert.ok(requisitions.includes("pr.pr_no LIKE N'REQ-%' AND ((@unit IS NULL AND pr.unit_id IS NULL) OR pr.unit_id=@unit)) raised"));
  assert.ok(requisitions.includes("SELECT TOP(1) id FROM dbo.mat_prs WITH (UPDLOCK,HOLDLOCK) WHERE pr_no=@number;"));
  // A draft moved to another Unit is renumbered for it.
  assert.ok(requisitions.includes("const number = sameUnit ? h.pr_no : await issueRequestNumber(transaction, Number(h.project_id), unitId);"));
  const migration = read("database/migrations/114_request_numbers.sql");
  assert.match(migration, /THROW 51114, 'Migration 113 must be applied before migration 114\.', 1;/);
  assert.match(migration, /ALTER TABLE dbo\.mat_prs ALTER COLUMN pr_no nvarchar\(50\) NOT NULL;/);
  assert.match(migration, /ALTER TABLE dbo\.mat_prs ADD over_budget_reason nvarchar\(2000\) NULL;/);
  assert.match(read("database/rollback/114_request_numbers.rollback.sql"), /IF NOT EXISTS \(SELECT 1 FROM dbo\.mat_prs WHERE LEN\(pr_no\) > 30\)/);
  assert.ok(read("backend-node/src/migration-validation.ts").includes('{ version: 114, fileName: "114_request_numbers.sql", name: "Request numbers and over-budget reason" }'));
  assert.ok(read("database/scripts/020_deploy_fresh_database.sql").includes(":r database/migrations/114_request_numbers.sql"));
});

test("a request over budget is submitted with its requester's reason, which the approvers read", () => {
  assert.match(requisitions, /if \(over\.length && !reason\?\.trim\(\)\)\s*throw new ApiError\(422, "justification_required"/);
  // A reason given before is kept, so a corrected request goes again without asking twice.
  assert.ok(requisitions.includes("const reason = over.length ? (justification ?? h.over_budget_reason) : null;"));
  const editor = read("app/system/production/PurchaseRequestEditor.tsx"),
    material = read("app/system/production/MaterialScreens.tsx");
  assert.ok(editor.includes('const overBudget = Boolean(unitBudget?.over) || statuses.some((status) => status.level !== "ok" && status.thisRequest > 0);'));
  // The sheet asks for it and does not send without it; saving a draft needs none.
  assert.ok(editor.includes('data-guide="pr.submit" disabled={busy || !selected.length || issues.size > 0 || needsReason}'));
  assert.ok(editor.includes("justification: overBudget ? justification.trim() : undefined"));
  // MaterialScreens.tsx is oxfmt-formatted: the markup is matched with its line breaks folded.
  assert.ok(material.replace(/\s+/g, " ").includes('<strong> <LocalizedText text={"เกินงบ · เหตุผลของผู้ขอ"} /> </strong> {detail.purchaseRequisition.overBudgetReason}'));
});
