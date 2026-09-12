import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildEstimateModuleSummary } from "../lib/estimate-module-summary.ts";

const workspace = {
  header: { totals: { total: 1000 }, updatedAt: "2026-09-12T08:00:00Z" },
  costItems: [
    { id: 1, categoryCode: "01", category: "Hardware", module: "Control panel", lineTotal: 300, supplierId: 10, ownerName: "Nattapol", updatedAt: "2026-09-10T08:00:00Z" },
    { id: 2, categoryCode: "01", category: "Hardware", module: "Control panel", lineTotal: 200, supplierId: null, ownerName: "Nattapol", updatedAt: "2026-09-11T08:00:00Z" },
  ],
  manhourLines: [
    { id: 3, package: "Electrical installation", department: "Electrical", costType: "Installation", provider: "Internal", lineCost: 250, ownerName: "Taweesak", updatedAt: "2026-09-09T08:00:00Z" },
  ],
  expenseLines: [
    { id: 4, package: "Electrical installation", expenseType: "Transportation", costType: "Installation", supplierId: 11, lineTotal: 100, ownerName: "Taweesak", updatedAt: "2026-09-12T08:00:00Z" },
  ],
  otherCostLines: [
    { id: 5, category: "Other Cost", lineTotal: 150 },
  ],
  assignments: [],
  validationIssues: [
    { entityType: "CostItem", entityId: 2, severity: "Warning" },
    { entityType: "ManhourLine", entityId: 3, severity: "Error" },
  ],
};

const erpSummary = {
  lines: [
    { sourceType: "CostItem", sourceId: 1, erpCategory: "Hardware" },
    { sourceType: "CostItem", sourceId: 2, erpCategory: "Unmapped" },
    { sourceType: "ManhourLine", sourceId: 3, erpCategory: "Installation" },
    { sourceType: "ExpenseLine", sourceId: 4, erpCategory: "Installation" },
    { sourceType: "OtherCostLine", sourceId: 5, erpCategory: "Service" },
  ],
};

test("summary returns one aggregate per module and never one record per cost item", () => {
  const modules = buildEstimateModuleSummary(workspace, erpSummary);
  assert.equal(modules.length, 2);
  assert.equal(modules.some((module) => module.moduleName === "Other Cost"), false);

  const panel = modules.find((module) => module.moduleName === "Control panel");
  assert.equal(panel.lineCount, 2);
  assert.equal(panel.amount, 500);
  assert.equal(panel.share, 50);
  assert.equal(panel.inHouseAmount, 0);
  assert.equal(panel.outsourcedAmount, 300);
  assert.equal(panel.unclassifiedAmount, 200, "supplierless material remains unclassified instead of being reported as in-house");
  assert.equal(panel.erpStatus, "Partial");
  assert.equal(panel.warningCount, 1);
  assert.deepEqual(panel.responsibleEngineers, ["Nattapol"]);
  assert.equal(panel.lastUpdated, "2026-09-11T08:00:00Z");
});

test("man-hour and expense lines with the same package are merged into one work package", () => {
  const workPackage = buildEstimateModuleSummary(workspace, erpSummary).find((entry) => entry.moduleName === "Electrical installation");
  assert.equal(workPackage.lineCount, 2);
  assert.equal(workPackage.amount, 350);
  assert.equal(workPackage.inHouseAmount, 250);
  assert.equal(workPackage.outsourcedAmount, 100);
  assert.equal(workPackage.erpStatus, "Mapped");
  assert.deepEqual(workPackage.erpCategories, ["Installation"]);
  assert.equal(workPackage.errorCount, 1);
  assert.equal(workPackage.targetTab, "manhour");
});

test("ERP state stays Loading until the line-level mapping summary is available", () => {
  const modules = buildEstimateModuleSummary(workspace, null);
  assert.ok(modules.every((module) => module.erpStatus === "Loading"));
});

test("same-named Engineering and Installation packages remain separate work packages", () => {
  const engineeringTwin = { ...workspace.manhourLines[0], id: 30, costType: "Engineering", lineCost: 50 };
  const modules = buildEstimateModuleSummary({ ...workspace, manhourLines: [...workspace.manhourLines, engineeringTwin] }, erpSummary)
    .filter((entry) => entry.moduleName === "Electrical installation");
  assert.equal(modules.length, 2);
  assert.deepEqual(modules.map((entry) => entry.section), ["06 Engineering", "07 Installation"]);
});

test("supplierless category 07 cost items remain outsourced", () => {
  const outsourceLine = { ...workspace.costItems[0], id: 9, categoryCode: "07", category: "Outsource", module: "External programming", supplierId: null, lineTotal: 80 };
  const modules = buildEstimateModuleSummary({ ...workspace, costItems: [outsourceLine] }, erpSummary);
  const outsource = modules.find((entry) => entry.moduleName === "External programming");
  assert.equal(outsource.inHouseAmount, 0);
  assert.equal(outsource.outsourcedAmount, 80);
});

test("line-level ERP summary is mounted in Cost Items rather than Estimate Summary", () => {
  const screen = readFileSync(new URL("../app/system/production/EstimateScreens.tsx", import.meta.url), "utf8");
  const summaryBranch = screen.slice(screen.indexOf('{tab === "summary"'), screen.indexOf('{tab === "cost"'));
  const costBranch = screen.slice(screen.indexOf('{tab === "cost"'), screen.indexOf('{tab === "manhour"'));
  assert.doesNotMatch(summaryBranch, /EstimateErpSummaryPanel/);
  assert.match(summaryBranch, /EstimateSummaryTab/);
  assert.match(costBranch, /EstimateErpSummaryPanel/);
  assert.match(costBranch, /EstimateCostItemsTab/);
});

test("Summary and Cost Items share module cards while item editing stays in Cost Items", () => {
  const screen = readFileSync(new URL("../app/system/production/EstimateScreens.tsx", import.meta.url), "utf8");
  const summaryComponent = screen.slice(screen.indexOf("function EstimateSummaryTab"), screen.indexOf("function EstimateCostItemsTab"));
  const costComponent = screen.slice(screen.indexOf("function EstimateCostItemsTab"), screen.indexOf("function costSeedFromLine"));
  assert.match(summaryComponent, /EstimateModuleCard/);
  assert.doesNotMatch(summaryComponent, /\.map\(\(line/);
  assert.match(costComponent, /Module Overview/);
  assert.match(costComponent, /EstimateModuleCard/);
  assert.match(costComponent, /group\.lines\.map/);
  assert.match(costComponent, /onEdit\(line\)/);
  assert.match(screen, /function CostModuleEditor/);
  assert.match(screen, /updateEstimateCostModule/);
  assert.match(screen, /identityLocked=\{Boolean\(line\)\}/);
  assert.match(screen, /readOnly=\{Boolean\(line\)\}/);
});
