import assert from "node:assert/strict";
import test from "node:test";
import { costItemPatchFromLookup, filterSuppliers, lookupQueryReady, matchSupplierExactly } from "../lib/cost-item-lookup.ts";

const record = {
  sourceKind: "Estimate",
  sourceNumber: "EST-2026-0001",
  projectName: "Line 3 upgrade",
  itemCode: "PLC-01",
  description: "PLC and HMI",
  brand: "Siemens",
  model: "S7-1500",
  specification: null,
  supplierId: 5,
  unit: "Set",
  unitCost: 48000,
  priceDate: "2026-08-14",
};

const suppliers = [
  { id: 5, code: "SUP-005", name: "Schneider Thailand" },
  { id: 6, code: "SUP-006", name: "Siemens Thailand" },
  { id: 7, code: "SCH-01", name: "ABC Automation" },
  { id: 8, code: "SUP-008", name: "Schmalz" },
];

test("a pick carries the whole reference line the way the Price Library does", () => {
  const patch = costItemPatchFromLookup(record, suppliers);
  assert.deepEqual(patch, {
    itemCode: "PLC-01", description: "PLC and HMI", brand: "Siemens", model: "S7-1500", specification: "",
    supplierId: 5, unit: "Set", unitCost: 48000, priceSource: "Price Library",
    referenceNumber: "EST-2026-0001", referenceProject: "Line 3 upgrade", priceDate: "2026-08-14",
  });
});

test("purchase history becomes a Purchase Price reference and an inactive supplier is dropped", () => {
  const patch = costItemPatchFromLookup({ ...record, sourceKind: "Historical Purchase", supplierId: 99, priceDate: null, specification: "16 DI / 16 DO" }, suppliers);
  assert.equal(patch.priceSource, "Purchase Price");
  assert.equal(patch.supplierId, undefined, "an id the API would reject must not be submitted");
  assert.equal(patch.specification, "16 DI / 16 DO");
  assert.equal("priceDate" in patch, false, "no price date means the form keeps its own");
});

test("lookups start at two characters so a single key does not query every estimate", () => {
  assert.equal(lookupQueryReady(" "), false);
  assert.equal(lookupQueryReady("P"), false);
  assert.equal(lookupQueryReady(" PL "), true);
});

test("suppliers rank name prefix, then code prefix, then contains; empty needle browses the list", () => {
  assert.deepEqual(filterSuppliers(suppliers, "sch").map((supplier) => supplier.name), ["Schmalz", "Schneider Thailand", "ABC Automation"]);
  assert.deepEqual(filterSuppliers(suppliers, "sup-00").map((supplier) => supplier.id), [8, 5, 6], "same rank falls back to name order");
  assert.deepEqual(filterSuppliers(suppliers, "thai").map((supplier) => supplier.id), [5, 6]);
  assert.deepEqual(filterSuppliers(suppliers, "").length, 4);
  assert.deepEqual(filterSuppliers(suppliers, "", 2).length, 2);
  assert.deepEqual(filterSuppliers(suppliers, "zzz"), []);
});

test("blur commits only an exact name or code match", () => {
  assert.equal(matchSupplierExactly(suppliers, "siemens thailand")?.id, 6);
  assert.equal(matchSupplierExactly(suppliers, "sch-01")?.id, 7);
  assert.equal(matchSupplierExactly(suppliers, "Siemens"), undefined);
  assert.equal(matchSupplierExactly(suppliers, ""), undefined);
});
