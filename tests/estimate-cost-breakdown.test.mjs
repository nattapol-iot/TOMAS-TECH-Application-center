import assert from "node:assert/strict";
import test from "node:test";
import { breakdownModules, breakdownLineCount, buildEstimateCostBreakdown } from "../lib/estimate-cost-breakdown.ts";

const labels = { manhour: "Engineering man-hour", expenses: "Project expenses", other: "Other project cost", manDayUnit: "Man-day" };

const input = {
  costItems: [
    { id: 11, categoryCode: "03", category: "Electrical", module: "Main Panel", itemCode: "MP-01", description: "Control Panel", brand: "Rittal", model: "AE", specification: null, supplierName: null, quantity: 2, unit: "Set", unitCost: 63288.79, lineTotal: 126577.58 },
    { id: 12, categoryCode: "01", category: "Hardware", module: "PLC", itemCode: "PLC-01", description: "PLC and HMI", brand: "Siemens", model: "S7-1500", specification: "16 DI", supplierName: "Schneider Thailand", quantity: 2, unit: "Set", unitCost: 258000, lineTotal: 516000 },
    { id: 13, categoryCode: "01", category: "Hardware", module: "PLC", itemCode: "TV-01", description: "TV monitor", brand: "", model: "", specification: null, supplierName: null, quantity: 2, unit: "Set", unitCost: 0, lineTotal: 0 },
  ],
  manhourLines: [
    { id: 21, package: "Design", activity: "Drawing Design", department: "Electrical", level: "Senior Engineer", provider: "Internal", supplierName: null, engineers: 1, manDays: 8, dailyRate: 3500, lineCost: 28000 },
    { id: 22, package: "Install", activity: "Wiring and Installation", department: "Electrical", level: "", provider: "Supplier", supplierName: "ABC Electric", engineers: 4, manDays: 5, dailyRate: 4000, lineCost: 80000 },
  ],
  expenseLines: [
    { id: 31, package: "Install", expenseType: "Accommodation", description: "Accommodation + Transport", supplierName: null, quantity: 9, unit: "Day", unitCost: 2500, lineTotal: 22500 },
  ],
  otherCostLines: [
    { id: 41, category: "Outsource", description: "Wiring subcontract", quantity: 1, unit: "Job", unitCost: 434250, lineTotal: 434250 },
  ],
};

test("sections follow ERP order: cost categories by code, then man-hour, expenses and other cost", () => {
  const sections = buildEstimateCostBreakdown(input, labels);
  assert.deepEqual(sections.map((section) => [section.ordinal, section.title]), [
    [1, "Hardware"], [2, "Electrical"], [3, "Engineering man-hour"], [4, "Project expenses"], [5, "Other project cost"],
  ]);
  assert.equal(breakdownLineCount(sections), 7);
});

test("lines are numbered section-line and carry the in-house / outsourced split", () => {
  const [hardware, electrical, manhour, , other] = buildEstimateCostBreakdown(input, labels);
  assert.deepEqual(hardware.lines.map((line) => line.number), ["1-1", "1-2"]);
  assert.equal(hardware.lines[0].source, "outsourced");
  assert.equal(hardware.lines[0].supplierName, "Schneider Thailand");
  assert.equal(hardware.lines[1].source, "in-house");
  assert.equal(hardware.lines[1].awaitingPrice, true, "a zero unit cost is flagged instead of shown as a real ฿0");
  assert.deepEqual([hardware.outsourcedAmount, hardware.outsourcedCount, hardware.inHouseAmount, hardware.inHouseCount], [516000, 1, 0, 1]);
  assert.equal(hardware.amount, 516000);

  assert.equal(electrical.lines[0].number, "2-1");
  assert.deepEqual(electrical.lines[0].details, ["Main Panel", "MP-01", "Rittal · AE"]);

  assert.equal(manhour.lines[0].quantity, 8, "man-hour quantity is engineers × man-days");
  assert.equal(manhour.lines[0].unit, "Man-day");
  assert.equal(manhour.lines[1].source, "outsourced");
  assert.equal(manhour.lines[1].supplierName, "ABC Electric");
  assert.equal(manhour.amount, 108000);

  assert.equal(other.lines[0].source, "outsourced", "the Outsource category is outsourced even without a named supplier");
});

test("empty ledgers produce no section and an empty estimate produces nothing", () => {
  const sections = buildEstimateCostBreakdown({ ...input, manhourLines: [], expenseLines: [], otherCostLines: [] }, labels);
  assert.deepEqual(sections.map((section) => section.kind), ["cost-items", "cost-items"]);
  assert.deepEqual(buildEstimateCostBreakdown({ costItems: [], manhourLines: [], expenseLines: [], otherCostLines: [] }, labels), []);
});

test("Summary aggregates main modules while retaining child identities and split totals", () => {
  const sections = buildEstimateCostBreakdown(input, labels);
  const modules = breakdownModules(sections[0]);
  assert.equal(modules.length, 1);
  assert.equal(modules[0].title, "PLC");
  assert.equal(modules[0].amount, 516000);
  assert.equal(modules[0].outsourced, 516000);
  assert.equal(modules[0].inHouse, 0);
  assert.deepEqual(modules[0].lines.map(line => line.key), ["cost:12", "cost:13"]);
  assert.deepEqual(breakdownModules(sections[2]).map(group => group.title), ["Design", "Install"]);
  assert.equal(sections.flatMap(breakdownModules).reduce((sum, group) => sum + group.amount, 0), sections.reduce((sum, section) => sum + section.amount, 0));
});
test("Standalone items retain their own titles, identities and totals across sections", () => {
  const sections = buildEstimateCostBreakdown({ ...input, costItems: input.costItems.map(line => ({ ...line, module: "" })) }, labels);
  assert.equal(breakdownModules(sections[0])[0].title, sections[0].lines[0].title);
  assert.equal(breakdownModules(sections[0]).length, sections[0].lines.length);
  assert.ok(breakdownModules(sections[0]).every(group => group.standalone && group.lines.length === 1));
  assert.equal(breakdownModules(sections[0]).reduce((sum, group) => sum + group.amount, 0), sections[0].amount);
  assert.notEqual(breakdownModules(sections[0])[0].key, breakdownModules(sections[1])[0].key);
});


test("ERP labor groups are one module per category and retain every source amount", async () => {
  const { groupErpLaborSections, LABOR_MODULE_NAMES } = await import("../lib/estimate-cost-breakdown.ts");
  const source = buildEstimateCostBreakdown({ ...input, manhourLines: [
    ...input.manhourLines.map(line => ({ ...line, costType: "Engineering" })),
    { ...input.manhourLines[0], id: 91, costType: "Engineering", package: "Another package", lineCost: 7000 },
    { ...input.manhourLines[0], id: 92, costType: "Installation", package: "Site package", provider: "Supplier", lineCost: 9000 },
  ] }, labels);
  const mapping = new Map(source.find(s => s.kind === "manhour").lines.map(l => [l.key, l.key === "manhour:92" ? "Installation" : "Software"]));
  const grouped = groupErpLaborSections(source, mapping);
  assert.equal(grouped.reduce((n,s) => n+s.amount,0), source.reduce((n,s) => n+s.amount,0));
  assert.deepEqual(grouped.flatMap(s => s.lines.map(l => l.key)).sort(), source.flatMap(s => s.lines.map(l => l.key)).sort());
  for (const category of ["Software", "Installation"]) {
    const modules = breakdownModules(grouped.find(s => s.title === category));
    assert.equal(modules.length,1);
    assert.equal(modules[0].title,LABOR_MODULE_NAMES[category]);
  }
  assert.deepEqual(grouped.filter(s => s.kind === "cost-items"), source.filter(s => s.kind === "cost-items"));
});

test("unmapped labor is retained without inventing an ERP category", async () => {
  const { groupErpLaborSections } = await import("../lib/estimate-cost-breakdown.ts");
  const source=buildEstimateCostBreakdown(input,labels);
  const result=groupErpLaborSections(source,new Map());
  assert.equal(result.reduce((sum,s)=>sum+s.amount,0),source.reduce((sum,s)=>sum+s.amount,0));
  assert.equal(result.find(s=>s.kind === "manhour").title,"Other labor");
});
