import assert from "node:assert/strict";
import test from "node:test";
import { costSummarySheet, parseEstimateWorkbook } from "../lib/estimate-excel-import.ts";
const c = (value, formula) => ({ value, ...(formula ? { formula } : {}) });
function fixture() {
  return [
    {
      name: "Summary cost",
      cells: {
        E2: c("Example project"),
        E3: c("Example customer"),
        L3: c(46000),
        D9: c("Electrical material"),
        E9: c("Control panel"),
        J9: c(125, "'002 EE cost'!L13"),
        K9: c(2),
        L9: c(250),
        D10: c("Electrical labour"),
        E10: c("Design"),
        F10: c("TOMAS"),
        J10: c(5000),
        K10: c(3),
        L10: c(15000),
        E11: c("Unused option"),
        J11: c(999),
        K11: c(0),
        L11: c(0),
        L12: c(15250, "SUM(L9:L11)"),
        D13: c("Profit"),
      },
    },
    { name: "002 EE cost", cells: { D10: c("A-1"), E10: c("Part"), J10: c(50), K10: c(2), L10: c(100), E11: c("Fixed safety"), L11: c(25), L13: c(125, "(SUM(L10:L12))") } },
  ];
}
test("expands only active detail scope and multiplies BOM quantity once; retains fixed amount and Summary labor", () => {
  const p = parseEstimateWorkbook(fixture(), "Example_R3.xlsx");
  assert.deepEqual(p.errors, []);
  assert.equal(p.total, 15250);
  assert.equal(p.sourceRevision, "R3");
  assert.deepEqual(
    p.lines.map((l) => [l.kind, l.quantity, l.unitCost]),
    [
      ["cost", 4, 50],
      ["cost", 2, 25],
      ["manhour", 3, 5000],
    ],
  );
  assert.equal(p.excluded.length, 1);
});
test("blocks inconsistent Summary instead of importing partial totals", () => {
  const s = fixture();
  s[0].cells.L9 = c(251);
  assert.ok(parseEstimateWorkbook(s, "x.xlsx").errors.length);
});
test("blocks missing cached active formulas", () => {
  const s = fixture();
  s[1].cells.L10 = { value: "", formula: "J10*K10", missingCache: true };
  assert.ok(parseEstimateWorkbook(s, "x.xlsx").errors.some((x) => x.includes("L10")));
});
test("ignores nonfinancial text error but rejects active numeric errors", () => {
  const s = fixture();
  s[0].cells.E11 = { value: "#NAME?", error: true };
  delete s[0].cells.J11;
  delete s[0].cells.K11;
  delete s[0].cells.L11;
  assert.deepEqual(parseEstimateWorkbook(s, "x.xlsx").errors, []);
  s[0].cells.L9 = { value: "#REF!", error: true };
  assert.ok(parseEstimateWorkbook(s, "x.xlsx").errors.length);
});
test("keeps customer supplied item as zero cost reference", () => {
  const s = fixture();
  Object.assign(s[0].cells, { E11: c("Customer device", "'002 EE cost'!E20"), K11: c(2), L11: c(0) });
  Object.assign(s[1].cells, { E20: c("Customer device"), D20: c("DEV-1"), N20: c("Customer provide") });
  const p = parseEstimateWorkbook(s, "x.xlsx");
  assert.deepEqual(p.errors, []);
  assert.equal(p.lines.at(-1).kind, "reference");
  assert.equal(p.lines.at(-1).quantity, 2);
  assert.equal(p.total, 15250);
});
test("does not guess unsupported workbook layout", () => assert.equal(parseEstimateWorkbook([{ name: "Random", cells: {} }], "x.xlsx"), null));

// A short presentation "Summary cost" whose figures are formulas into the full "001_Summary cost" (NTN-PT workbook,
// 2026-11-25): the full one is read, with every line under its Sub Total, and not the presentation copy.
function twoSummaries() {
  const s = fixture();
  s[0].name = "001_Summary cost";
  return [
    {
      name: "Summary cost",
      cells: {
        E2: c("Example project", "'001_Summary cost'!E2"),
        L3: c(46010),
        D9: c("Electrical material"),
        E9: c("Control panel", "'001_Summary cost'!E9"),
        J9: c(250, "'001_Summary cost'!L9"),
        K9: c(1),
        L9: c(250),
        L10: c(250, "SUM(L9:L9)"),
        D12: c("Infrastructure"),
        E12: c("Shown below the total"),
        J12: c(15000, "'001_Summary cost'!L10"),
        K12: c(1),
        L12: c(15000),
      },
    },
    ...s,
  ];
}
test("reads the full Summary when a presentation Summary takes its figures from it", () => {
  const p = parseEstimateWorkbook(twoSummaries(), "Example_R1.xlsx");
  assert.deepEqual(p.errors, []);
  assert.equal(p.sourceTotal, 15250);
  assert.equal(p.total, 15250);
  assert.ok(
    p.lines.every((l) => !l.source.startsWith("Summary cost!")),
    "no line comes from the presentation copy",
  );
  assert.ok(p.lines.some((l) => l.source === "001_Summary cost!10"));
});
test("Infrastructure work comes in as 07 Outsource, its detail lines included, and the preview says so (owner 2026-11-25)", () => {
  const s = fixture();
  // The detail-backed row becomes an Infrastructure package; the labour row keeps its own heading.
  s[0].cells.D9 = c("Infrastructure");
  const p = parseEstimateWorkbook(s, "x.xlsx");
  assert.deepEqual(p.errors, []);
  assert.deepEqual(
    p.lines.map((l) => [l.source, l.kind, l.categoryCode]),
    [
      ["002 EE cost!10", "cost", "07"],
      ["002 EE cost!11", "cost", "07"],
      ["Summary cost!10", "manhour", "06"],
    ],
  );
  assert.ok(p.warnings.includes("งาน Infrastructure นำเข้าเป็นหมวด 07 Outsource"));
  assert.ok(!parseEstimateWorkbook(fixture(), "x.xlsx").warnings.some((w) => w.includes("Infrastructure")));
});
test("the Summary sheet to read: the one fed by no other Summary, else the first", () => {
  const sheets = twoSummaries();
  assert.equal(costSummarySheet(sheets).name, "001_Summary cost");
  assert.equal(costSummarySheet(fixture()).name, "Summary cost");
  assert.equal(
    costSummarySheet([
      { name: "Summary_cost", cells: { J9: c(1, "Detail!L5") } },
      { name: "Summary cost 2", cells: { J9: c(1, "Summary_cost!L9") } },
    ]).name,
    "Summary_cost",
    "an unquoted sheet name counts too",
  );
  assert.equal(costSummarySheet([{ name: "Random", cells: {} }]), undefined);
});
