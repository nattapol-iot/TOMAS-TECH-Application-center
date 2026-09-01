import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { parseHistoricalPr } from "../src/historical-pr.js";

export function historicalFixture(status = "Cancelled", project = "TEST-PR", pendingCost = 4800): Buffer {
  const cell = (r: string, v: string | number, attrs = "") => typeof v === "number" ? `<c r="${r}" ${attrs}><v>${v}</v></c>` : `<c r="${r}" t="inlineStr" ${attrs}><is><t>${v}</t></is></c>`;
  const row = (r: number, cells: string) => `<row r="${r}">${cells}</row>`;
  const item = (r: number, price: number, po: string, state: string, struck = false) => row(r,
    cell(`B${r}`, "△1") + cell(`E${r}`, `PART-${r}`, struck ? 's="1"' : "") + cell(`F${r}`, "Description") + cell(`L${r}`, 1) + cell(`M${r}`, "Pcs.") + cell(`O${r}`, "SUPPLIER") + cell(`R${r}`, price) + `<c r="S${r}"><f>R${r}*L${r}</f><v>${price}</v></c>` + cell(`T${r}`, "THB") + cell(`U${r}`, price) + cell(`V${r}`, po) + cell(`W${r}`, state));
  return Buffer.from(zipSync(Object.fromEntries(Object.entries({
    "xl/workbook.xml": '<workbook><sheets><sheet name="Hidden" sheetId="1" state="hidden" r:id="h"/><sheet name="001_PR" sheetId="2" r:id="p"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="p" Target="worksheets/sheet2.xml"/><Relationship Id="h" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/styles.xml": '<styleSheet><fonts><font/><font><strike/></font></fonts><cellXfs><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="e"><v>#REF!</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml": `<worksheet><sheetData>${row(2, cell("C2", "Project Number") + cell("F2", project))}${row(3, cell("I3", "△1") + cell("M3", "Original engineer") + cell("N3", 46155) + cell("T3", 0))}${row(8, cell("E8", "Model/Part Number") + cell("V8", "PO Number"))}${item(9, 100, "OLD-PO", status, true)}${item(10, 200, "NEW-PO", "Already Approved")}${item(11, pendingCost, "PENDING-PO", "Wait Approved")}${row(12, cell("L12", 0) + cell("S12", 0))}</sheetData></worksheet>`,
  }).map(([k, v]) => [k, strToU8(v)]))));
}
test("cancelled PO keeps demand; issued strike never removes item; totals separate pending", () => {
  const p = parseHistoricalPr(historicalFixture(), "example.xlsx");
  assert.equal(p.lines.length, 3); assert.equal(p.lines[0]!.prIssued, true); assert.equal(p.lines[0]!.status, "Cancelled");
  assert.deepEqual(p.totals, { approved: 200, pending: 4800, cancelled: 100, unknown: 0, active: 5000, all: 5100 });
  assert.equal(p.estimate, null); assert.equal(p.lines[0]!.issuedBy, "Original engineer"); assert.equal(p.lines[0]!.issuedDate, "2026-05-13");
  assert.equal(p.referenceFromFilename, true); assert.equal(p.sourceHash.length, 64);
});
test("struck approved rows remain approved and unknown status never becomes approved", () => {
  assert.equal(parseHistoricalPr(historicalFixture("Already Approved"), "pr.xlsx").totals.approved, 300);
  const p = parseHistoricalPr(historicalFixture("Something else"), "pr.xlsx");
  assert.equal(p.totals.unknown, 100); assert.equal(p.totals.active, 5000);
});
test("invalid workbooks and unsafe XML are rejected", () => {
  assert.throws(() => parseHistoricalPr(Buffer.from("invalid zip"), "pr.xlsx"));
  assert.throws(() => parseHistoricalPr(historicalFixture(), "pr.xlsm"));
  assert.throws(() => parseHistoricalPr(historicalFixture("Cancelled", "<!DOCTYPE x>"), "pr.xlsx"));
  assert.throws(() => parseHistoricalPr(historicalFixture("Cancelled", "P".repeat(101)), "pr.xlsx"), /100/);
});
test("missing formula cache and inconsistent totals cannot silently become zero", () => {
  for (const replacement of ["<f>R9*L9</f>", "<f>R9*L9</f><v>99</v>"]) {
    const archive = unzipSync(historicalFixture());
    const key = "xl/worksheets/sheet2.xml";
    archive[key] = strToU8(strFromU8(archive[key]!).replace("<f>R9*L9</f><v>100</v>", replacement));
    assert.throws(() => parseHistoricalPr(zipSync(archive), "bad.xlsx"));
  }
});
