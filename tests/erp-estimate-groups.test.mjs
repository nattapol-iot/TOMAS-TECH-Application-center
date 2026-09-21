import test from "node:test";
import assert from "node:assert/strict";
import { foldErpGroupLines, erpGroupsByMember, erpMemberKey, splitRowsByCategory, classifyErpGroups } from "../lib/erp-estimate-groups.ts";
import { buildEstimateCostBreakdown, breakdownModules } from "../lib/estimate-cost-breakdown.ts";

const line = (id, amount, category = "Hardware", description = "Item " + id) => ({
  sourceType: "CostItem", sourceId: id, description, amount, erpCategory: category,
  unitPrice: amount, quantity: 1, unit: "Pcs", supplier: "Supplier A", brand: "Omron", item: "IT-" + id, remark: null,
});
const group = (members, extra = {}) => ({
  id: 1, title: "Network accessories", quantity: 1, unit: "Lot", rowVersion: "AAAA",
  members: members.map(id => ({ sourceType: "CostItem", sourceId: id })), ...extra,
});

test("a merged line is one exported row that still carries the whole amount", () => {
  const lines = [line(1, 1000), line(2, 250), line(3, 4000)];
  const folded = foldErpGroupLines(lines, [group([1, 2])]);
  assert.equal(folded.length, 2);
  assert.equal(folded.reduce((sum, row) => sum + row.amount, 0), lines.reduce((sum, row) => sum + row.amount, 0));
  const [merged, untouched] = folded;
  assert.equal(merged.description, "Network accessories");
  assert.equal(merged.amount, 1250);
  assert.equal(merged.unitPrice, 1250);
  assert.equal(merged.unit, "Lot");
  // Nothing the members said is lost, and nothing is inherited from whichever came first.
  assert.equal(merged.remark, "Item 1; Item 2");
  assert.deepEqual([merged.supplier, merged.brand, merged.item], [null, null, null]);
  assert.deepEqual(untouched, line(3, 4000));
});

test("quantity divides the merged amount instead of multiplying it", () => {
  const [merged] = foldErpGroupLines([line(1, 900), line(2, 600)], [group([1, 2], { quantity: 3, unit: "Set" })]);
  assert.equal(merged.amount, 1500);
  assert.equal(merged.quantity, 3);
  assert.equal(merged.unit, "Set");
  assert.equal(merged.unitPrice * merged.quantity, merged.amount);
});

test("a merged line whose members disagree on a category is left alone", () => {
  // Folding these would move 250 baht from Service into Hardware on the sheet.
  const lines = [line(1, 1000, "Hardware"), line(2, 250, "Service")];
  assert.deepEqual(foldErpGroupLines(lines, [group([1, 2])]), lines);
});

test("a merged line that has lost all but one member exports as that line", () => {
  const lines = [line(1, 1000)];
  assert.deepEqual(foldErpGroupLines(lines, [group([1, 2])]), lines);
  assert.deepEqual(foldErpGroupLines(lines, []), lines);
});

test("members are indexed by the identity ERP mappings already use", () => {
  const index = erpGroupsByMember([group([1, 2])]);
  assert.equal(index.get("CostItem:1").title, "Network accessories");
  assert.equal(index.get(erpMemberKey({ sourceType: "CostItem", sourceId: 2 })).id, 1);
  assert.equal(index.get("CostItem:3"), undefined);
});

test("the summary shows one row for a merged line, whatever module its items came from", () => {
  const costItems = [
    { id: 1, module: "Rack", lineTotal: 1000 },
    { id: 2, module: "Camera", lineTotal: 250 },
    { id: 3, module: "Camera", lineTotal: 4000 },
  ].map(item => ({ ...item, categoryCode: "01", category: "Hardware", description: "Item " + item.id, brand: "", model: "", itemCode: "", quantity: 1, unitCost: item.lineTotal, unit: "Pcs" }));
  const [section] = buildEstimateCostBreakdown({ costItems, manhourLines: [], expenseLines: [], otherCostLines: [] },
    { manhour: "", expenses: "", other: "", manDayUnit: "" });

  assert.deepEqual(breakdownModules(section).map(entry => entry.title), ["Rack", "Camera"]);

  const merged = new Set(["cost:1", "cost:2"]);
  const modules = breakdownModules(section, line => merged.has(line.key) ? { id: 7, title: "Network accessories" } : null);
  assert.deepEqual(modules.map(entry => entry.title), ["Network accessories", "Camera"]);
  assert.deepEqual(modules.map(entry => entry.key), ["group:7", "category:01:Camera"]);
  assert.deepEqual(modules.map(entry => entry.merged), [7, null]);
  assert.equal(modules[0].amount, 1250);
  assert.equal(modules.reduce((sum, entry) => sum + entry.amount, 0), section.amount);
  assert.deepEqual(modules.flatMap(entry => entry.lines.map(row => row.key)).sort(), ["cost:1", "cost:2", "cost:3"]);
});

test("every line lands under exactly one heading, and a row that disagrees is split", () => {
  const rows = [
    { key: "category:01:Rack", title: "Rack", lines: [{ key: "cost:1", amount: 1000 }, { key: "cost:2", amount: 250 }] },
    { key: "category:01:Camera", title: "Camera", lines: [{ key: "cost:3", amount: 4000 }] },
  ];
  const agreed = splitRowsByCategory(rows, () => "Hardware");
  assert.deepEqual(agreed.map(part => [part.key, part.category]), [["category:01:Rack", "Hardware"], ["category:01:Camera", "Hardware"]]);

  // cost:2 was classified as Service, so the Rack row appears under both headings.
  const split = splitRowsByCategory(rows, line => line.key === "cost:2" ? "Service" : "Hardware");
  assert.deepEqual(split.map(part => [part.key, part.category, part.lines.map(line => line.key)]), [
    ["category:01:Rack@Hardware", "Hardware", ["cost:1"]],
    ["category:01:Rack@Service", "Service", ["cost:2"]],
    ["category:01:Camera", "Hardware", ["cost:3"]],
  ]);
  // No line is lost and none is counted twice.
  const placed = split.flatMap(part => part.lines.map(line => line.key));
  assert.deepEqual(placed.sort(), ["cost:1", "cost:2", "cost:3"]);
  assert.equal(split.reduce((sum, part) => sum + part.lines.reduce((total, line) => total + line.amount, 0), 0), 5250);
  // Keys stay unique, so two parts of one row never collide in a list.
  assert.equal(new Set(split.map(part => part.key)).size, split.length);
  assert.deepEqual(splitRowsByCategory([], () => "Hardware"), []);
});

test("a merged line is drawn exactly when it will be written, and says why when it is not", () => {
  const lines = [line(1, 1000), line(2, 250), line(3, 4000)];
  const saved = row => row.erpCategory;

  const whole = classifyErpGroups(lines, [group([1, 2])], saved);
  assert.deepEqual(whole.foldable.map(entry => entry.id), [1]);
  assert.deepEqual(whole.broken, []);

  // One member was deleted from the revision: two lines are what makes a merge.
  const gone = classifyErpGroups([line(1, 1000), line(3, 4000)], [group([1, 2])], saved);
  assert.deepEqual(gone.foldable, []);
  assert.deepEqual(gone.broken.map(entry => entry.reason), ["gone"]);

  // The members stopped agreeing: writing them as one line would move money.
  const mixed = classifyErpGroups([line(1, 1000, "Hardware"), line(2, 250, "Service")], [group([1, 2])], saved);
  assert.deepEqual(mixed.foldable, []);
  assert.deepEqual(mixed.broken.map(entry => entry.reason), ["mixed"]);
  // And the export agrees with that verdict, line for line.
  assert.deepEqual(foldErpGroupLines([line(1, 1000, "Hardware"), line(2, 250, "Service")], [group([1, 2])]).map(row => row.description), ["Item 1", "Item 2"]);

  /* The screen asks about the category a person has chosen but not saved, so a
     merge that is about to break is shown as broken before the save, not after. */
  const draft = { "CostItem:2": "Service" };
  const pending = classifyErpGroups(lines, [group([1, 2])], row => draft[`${row.sourceType}:${row.sourceId}`] ?? row.erpCategory);
  assert.deepEqual(pending.broken.map(entry => entry.reason), ["mixed"]);
  assert.deepEqual(classifyErpGroups(lines, [group([1, 2])], saved).broken, []);
});

test("a price set stays one row: its components follow the header instead of becoming a ghost", () => {
  /* The ERP side never carries the components of a price set — they are priced
     inside the header — so they have no category of their own. Treating that as
     "Unmapped" put a second row, holding every component and no money, under a
     heading the file never writes. */
  const rows = [{
    key: "category:01:Master PLC", title: "Master PLC",
    lines: [
      { key: "cost:1", amount: 336000, header: true },
      ...[2, 3, 4, 5, 6, 7].map(id => ({ key: `cost:${id}`, amount: 0, header: false })),
    ],
  }];
  const categoryOf = line => line.header ? "Hardware" : null;
  const split = splitRowsByCategory(rows, categoryOf);
  assert.equal(split.length, 1);
  assert.equal(split[0].category, "Hardware");
  assert.equal(split[0].key, "category:01:Master PLC");
  assert.equal(split[0].lines.length, 7);

  // A row the ERP side knows nothing about at all still appears, under the fallback.
  const orphan = splitRowsByCategory([{ key: "category:01:Spare", lines: [{ key: "cost:9", amount: 0 }] }], () => null);
  assert.deepEqual(orphan.map(part => [part.key, part.category, part.lines.length]), [["category:01:Spare", "Unmapped", 1]]);

  // A genuine disagreement still splits, and the followers stay with the first part.
  const mixed = splitRowsByCategory([{
    key: "category:01:Mixed",
    lines: [{ key: "cost:1", tag: "Hardware" }, { key: "cost:2", tag: null }, { key: "cost:3", tag: "Service" }],
  }], line => line.tag);
  assert.deepEqual(mixed.map(part => [part.category, part.lines.map(line => line.key)]), [
    ["Hardware", ["cost:1", "cost:2"]],
    ["Service", ["cost:3"]],
  ]);
});
