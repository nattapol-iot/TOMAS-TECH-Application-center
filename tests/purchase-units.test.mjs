import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOverdue, moduleRoom, PURCHASE_DISCIPLINES, unitLabel, unitOnSheet, unitTotals } from "../lib/purchase-units.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("a Unit is named by its discipline, drawing number and name; the general Unit has no drawing", () => {
  assert.equal(unitLabel({ discipline: "ME", drawingNo: "MZ08-U001", unitName: "MASTER VALVE UNIT" }), "ME · MZ08-U001 MASTER VALVE UNIT");
  assert.equal(unitLabel({ discipline: "EE", drawingNo: "", unitName: "General / Common" }), "EE · General / Common");
});

test("the Unit's budget on the sheet counts this request, and a draft being edited is not counted twice", () => {
  const unit = { budget: 15000, requested: 12000 };
  assert.deepEqual(unitOnSheet(unit, 2000), { budget: 15000, requestedElsewhere: 12000, thisRequest: 2000, remaining: 1000, over: false });
  assert.deepEqual(unitOnSheet(unit, 5000), { budget: 15000, requestedElsewhere: 12000, thisRequest: 5000, remaining: -2000, over: true });
  // The draft on the sheet had 12,000 saved for this Unit: those are its own, so the Unit has all 15,000 for it.
  assert.deepEqual(unitOnSheet(unit, 14000, 12000), { budget: 15000, requestedElsewhere: 0, thisRequest: 14000, remaining: 1000, over: false });
  // An empty sheet over a Unit that is already over says nothing yet.
  assert.equal(unitOnSheet({ budget: 100, requested: 500 }, 0).over, false);
});

test("a Module gives a Unit what its other Units have not taken", () => {
  const modules = [{ module: "Panel", budget: 25000, given: 24000, ungiven: 1000 }, { module: "Software", budget: 30000, given: 0, ungiven: 30000 }];
  assert.equal(moduleRoom(modules, "panel"), 1000);
  // A Unit being edited gets its own 9,000 back before it is given a new figure.
  assert.equal(moduleRoom(modules, "Panel", 9000), 10000);
  assert.equal(moduleRoom(modules, "Nowhere"), 0);
});

test("the disciplines and the rules are the same on both sides, and the database holds them (migration 113)", () => {
  const rules = read("backend-node/src/procurement-rules.ts");
  assert.ok(rules.includes(`export const PURCHASE_DISCIPLINES = [${PURCHASE_DISCIPLINES.map((code) => `"${code}"`).join(", ")}] as const;`));
  const migration = read("database/migrations/113_purchase_units.sql");
  assert.match(migration, /THROW 51113, 'Migration 112 must be applied before migration 113\.', 1;/);
  assert.ok(migration.includes(`CHECK (discipline IN (${PURCHASE_DISCIPLINES.map((code) => `N'${code}'`).join(", ")}))`));
  // A drawing number names one Unit of a discipline in a project; a Module has one general Unit per discipline.
  assert.match(migration, /UNIQUE INDEX UX_project_purchase_units_drawing ON dbo\.project_purchase_units\(project_id, discipline, drawing_no\) WHERE deleted_at IS NULL AND is_general = 0;/);
  assert.match(migration, /UNIQUE INDEX UX_project_purchase_units_general ON dbo\.project_purchase_units\(project_id, discipline, module\) WHERE deleted_at IS NULL AND is_general = 1;/);
  assert.match(migration, /ALTER TABLE dbo\.mat_prs ADD unit_id bigint NULL CONSTRAINT FK_mat_prs_unit FOREIGN KEY REFERENCES dbo\.project_purchase_units\(id\);/);
  assert.match(read("database/rollback/113_purchase_units.rollback.sql"), /DROP TABLE dbo\.project_purchase_units;\s+DELETE FROM dbo\.schema_versions WHERE version = 113;/);
  assert.ok(read("backend-node/src/migration-validation.ts").includes('{ version: 113, fileName: "113_purchase_units.sql", name: "Purchase units under a module" }'));
  assert.ok(read("database/scripts/020_deploy_fresh_database.sql").includes(":r database/migrations/113_purchase_units.sql"));
});

test("Units split a Module's budget, a request is raised for a Unit, and going over it is the approver's call", () => {
  const routes = read("backend-node/src/routes/purchase-units.ts");
  // The Units of a Module together stay within the Module's budget, which is the BOM's own lines as everywhere else.
  assert.match(routes, /if \(round2\(given \+ input\.budget\) > round2\(budget\[1\]\)\) throw new ApiError\(422, "unit_budget_over_module"/);
  assert.ok(routes.includes("bl.section_code<>N'SVC'"));
  // A Unit with requests stays.
  assert.match(routes, /if \(requests\) throw new ApiError\(409, "unit_in_use"/);
  const rules = read("backend-node/src/procurement-rules.ts");
  assert.ok(rules.includes("flags.push(...unitBudgetFlags(await unitBudgetOf(transaction, prId)));"));
  assert.ok(rules.includes('return [{ code: "over_unit_budget", level: "manager",'));
  const requisitions = read("backend-node/src/routes/purchase-requisitions.ts");
  assert.ok(requisitions.includes("await assertUnitOfProject(transaction, unitId, projectId);"));
  // The screens: the Units panel in the BOM, the picker and the budget line on the sheet, the Unit on the request.
  const material = read("app/system/production/MaterialScreens.tsx"), editor = read("app/system/production/PurchaseRequestEditor.tsx"), panel = read("app/system/production/PurchaseUnitsPanel.tsx");
  assert.ok(material.includes('<PurchaseUnitsPanel projectId={bom.projectId} canEdit={canReserve && bom.status !== "Superseded"} notify={notify} />'));
  assert.ok(panel.includes('guide="bom.units"') && panel.includes('data-guide="bom.unit-add"'));
  assert.ok(editor.includes('<Field label="Unit ที่ขอซื้อให้" guide="pr.unit"') && editor.includes('data-guide="pr.unit-budget"'));
  assert.ok(editor.includes("erpDepartment: department || undefined, unitId, lines: payloadLines(live) };"));
  assert.ok(material.includes("{item.unitLabel ? <span className=\"muted\">{item.unitLabel}</span> : null}"));
});

test("the project's picture per Unit: what still waits, when it is needed, and the total of every Unit (owner 2026-11-20)", () => {
  assert.equal(isOverdue("2026-11-19", "2026-11-20"), true);
  assert.equal(isOverdue("2026-11-20", "2026-11-20"), false, "needed today is not late yet");
  assert.equal(isOverdue("2026-11-19T00:00:00.000Z", "2026-11-20"), true);
  assert.equal(isOverdue(null, "2026-11-20"), false);
  const unit = (over) => ({ id: 1, module: "Panel", discipline: "ME", drawingNo: "D", unitName: "U", isGeneral: false, budget: 0, requests: 0, requested: 0, approved: 0, ordered: 0, remaining: 0, rowVersion: "", ...over });
  assert.deepEqual(unitTotals([unit({ budget: 15000, requested: 17500.5, approved: 12000, ordered: 6000, remaining: -2500.5, waitingLines: 3, nearestNeedBy: "2026-12-05" }),
    unit({ budget: 9000, requested: 0, remaining: 9000 }), unit({ budget: 1000.25, requested: 500, approved: 500, ordered: 0, remaining: 500.25, waitingLines: 1, nearestNeedBy: "2026-11-30" })]),
    { budget: 25000.25, requested: 18000.5, approved: 12500, ordered: 6000, remaining: 6999.75, waitingLines: 4, nearestNeedBy: "2026-11-30" });
  const routes = read("backend-node/src/routes/purchase-units.ts"), panel = read("app/system/production/PurchaseUnitsPanel.tsx");
  // Waiting is read from what was last synced: this endpoint never asks the ERP.
  assert.ok(!routes.includes("gateway") && !routes.includes("erp-request-list"));
  assert.ok(routes.includes("(l.erp_line_status IS NULL OR l.erp_line_status IN(N'WAITING',N'IN_PR')) THEN 1 ELSE 0 END),0) waiting"));
  assert.ok(panel.includes("isOverdue(needBy, today)") && panel.includes("unitTotals(data.units)"));
});
