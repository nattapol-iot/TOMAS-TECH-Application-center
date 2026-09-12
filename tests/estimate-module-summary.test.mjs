import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEstimateModuleOverview } from "../lib/estimate-module-overview.ts";

const workspace = {
  header: { totals: { total: 1000 } },
  costItems: [
    { id: 1, categoryCode: "01", category: "Hardware", module: "Control panel", itemCode: "SERVER", description: "Server", supplierId: 10, unitCost: 300, lineTotal: 300, ownerName: "Nattapol", updatedAt: "2026-09-10T08:00:00Z" },
    { id: 2, categoryCode: "01", category: "Hardware", module: "Control panel", itemCode: "UPS", description: "UPS", supplierId: null, unitCost: 200, lineTotal: 200, ownerName: "Nattapol", updatedAt: "2026-09-11T08:00:00Z" },
  ],
  manhourLines: [
    { id: 3, package: "Electrical installation", activity: "Drawing design", department: "Electrical", costType: "Installation", lineCost: 250, ownerName: "Taweesak", updatedAt: "2026-09-09T08:00:00Z" },
  ],
  expenseLines: [
    { id: 4, package: "Electrical installation", description: "Transportation", costType: "Installation", lineTotal: 100, ownerName: "Taweesak", updatedAt: "2026-09-12T08:00:00Z" },
  ],
  validationIssues: [{ entityType: "CostItem", entityId: 2 }],
};

test("Summary returns one aggregate per Module / Work Package without leaf item names", () => {
  const modules = buildEstimateModuleOverview(workspace);
  assert.equal(modules.length, 2);
  assert.deepEqual(modules.map((module) => module.name), ["Control panel", "Electrical installation"]);
  assert.equal(JSON.stringify(modules).includes("Server"), false);
  assert.equal(JSON.stringify(modules).includes("UPS"), false);
  assert.equal(JSON.stringify(modules).includes("Drawing design"), false);

  const panel = modules[0];
  assert.equal(panel.kind, "Module");
  assert.equal(panel.lineCount, 2);
  assert.equal(panel.amount, 500);
  assert.equal(panel.attentionCount, 1);
  assert.deepEqual(panel.ownerNames, ["Nattapol"]);
  assert.equal(panel.lastUpdated, "2026-09-11T08:00:00Z");
});

test("man-hour and expense lines in the same package become one Work Package", () => {
  const workPackage = buildEstimateModuleOverview(workspace).find((module) => module.kind === "Work Package");
  assert.equal(workPackage.lineCount, 2);
  assert.equal(workPackage.amount, 350);
  assert.equal(workPackage.targetTab, "manhour");
  assert.equal(workPackage.lastUpdated, "2026-09-12T08:00:00Z");
});

test("Cost Items Module Summary contains cost modules only", () => {
  const modules = buildEstimateModuleOverview(workspace, true);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].name, "Control panel");
  assert.equal(modules[0].focusKey, "01::Control panel");
});

test("line-level ERP detail lives in Cost Items and both tabs share the overview UI", () => {
  const screen = readFileSync(new URL("../app/system/production/EstimateScreens.tsx", import.meta.url), "utf8");
  const summaryBranch = screen.slice(screen.indexOf('{tab === "summary"'), screen.indexOf('{tab === "cost"'));
  const costBranch = screen.slice(screen.indexOf('{tab === "cost"'), screen.indexOf('{tab === "manhour"'));
  assert.doesNotMatch(summaryBranch, /EstimateErpSummaryPanel/);
  assert.match(summaryBranch, /EstimateSummaryTab/);
  assert.match(costBranch, /EstimateCostItemsTab/);
  assert.match(costBranch, /EstimateErpSummaryPanel/);
  assert.match(screen, /function EstimateModuleOverviewPanel/);
  assert.match(screen, /<EstimateModuleOverviewPanel workspace=\{workspace\} onOpen=\{onOpenModule\}/);
  assert.match(screen, /<EstimateModuleOverviewPanel workspace=\{workspace\} costOnly/);
  assert.match(screen, /แก้ไขรายละเอียด/);
  assert.match(screen, /group\.lines\.map/);
  assert.match(screen, /onEdit\(line\)/);
});
