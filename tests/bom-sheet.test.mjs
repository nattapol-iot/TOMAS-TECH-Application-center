import assert from "node:assert/strict";
import test from "node:test";
import { BOM_SHEET_HEADERS, bomSheetRows, toBuyValue } from "../lib/bom-sheet.ts";

const header = { number: "BOM-2611-0002", revision: 0, projectNumber: "PJ260017", projectName: "AMR fleet", estimateNumber: "EST-2611-0004", estimateRevision: 0 };
const line = (over) => ({ module: "Panel", sectionCode: "HW.EL", itemCode: "PLC-01", estimateItemCode: "PLC-01", partNumber: "KV-X520", description: "PLC", brand: "Keyence",
  quantityRequired: 2, unit: "pcs", estimatedUnitCost: 1000, budget: 2000, requested: 0, purchaseRequired: 2, ...over });

test("a BOM exports as one sheet: notes, the header on the sixth row, then its lines", () => {
  const rows = bomSheetRows(header, [
    line({}),
    line({ itemCode: null, estimateItemCode: "SET-A", partNumber: null, brand: null, description: "Equipment Set A", unit: "set", quantityRequired: 1, estimatedUnitCost: 150000, budget: 150000, requested: 1, purchaseRequired: 0 }),
    line({ sectionCode: "OUT", module: "Install", itemCode: null, estimateItemCode: null, description: "Site wiring", unit: "lot", quantityRequired: 1, estimatedUnitCost: 100000.555, budget: 100000.555, purchaseRequired: 1 }),
  ], "2026-11-20");
  assert.equal(rows[0][0], "BOM BOM-2611-0002 R0 · PJ260017 AMR fleet");
  assert.equal(rows[1][0], "Estimate EST-2611-0004 R0 · exported 2026-11-20");
  // Money is added up; quantities are not, because pcs, set and lot do not add.
  assert.equal(rows[2][0], "Lines 3 · Budget THB 252000.56");
  assert.equal(rows[3][0], "Still to buy 2 lines · THB 102000.56");
  assert.deepEqual(rows[4], []);
  assert.deepEqual(rows[5], BOM_SHEET_HEADERS);
  assert.deepEqual(rows[6], [1, "PLC-01", "PLC", "KV-X520", "Keyence", "Panel", "HW.EL", 2, "pcs", 1000, 2000, 0, 2]);
  assert.deepEqual(rows[7], [2, "SET-A", "Equipment Set A", "", "", "Panel", "HW.EL", 1, "set", 150000, 150000, 1, 0]);
  assert.equal(rows.length, 9);
  assert.equal(BOM_SHEET_HEADERS.length, rows[6].length);
});

test("what is still to buy is valued at the estimate's cost and never below zero", () => {
  assert.equal(toBuyValue({ purchaseRequired: 3, estimatedUnitCost: 50 }), 150);
  assert.equal(toBuyValue({ purchaseRequired: -1, estimatedUnitCost: 50 }), 0);
});
