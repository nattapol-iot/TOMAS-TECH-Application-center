import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  buildErpEstimateWorkbook,
  ErpEstimateWorkbookValidationError,
} from "../lib/erp-estimate-workbook.ts";

const decoder = new TextDecoder();

function fixture() {
  return {
    metadata: {
      projectName: "Factory upgrade",
      customer: "Example Customer",
      shortName: "Upgrade",
      projectNumber: "PJ-001",
      revision: "R02",
      revisionDescription: "Approved",
      creator: "Nattapol",
      exportDate: "2026-09-11",
    },
    summary: {
      categories: [
        { category: "Hardware", amount: 20000, lineCount: 1 }, { category: "Software", amount: 0, lineCount: 0 },
        { category: "Service", amount: 0, lineCount: 0 }, { category: "Installation", amount: 0, lineCount: 0 },
        { category: "License", amount: 3000, lineCount: 1 }, { category: "Maintenance", amount: 0, lineCount: 0 },
        { category: "Training", amount: 5000, lineCount: 1 },
      ],
      unmapped: { amount: 0, lineCount: 0 }, classifiedTotal: 28000, canonicalTotal: 30000,
      difference: 0, reconciled: true, capabilities: { canExport: true },
      lines: [
        { sourceType: "OtherCostLine", sourceId: 1, internalCategory: "Training", amount: 5000, erpCategory: "Training", mappingRowVersion: "AA==", copiedFromRevision: null, description: "Operator training", unitPrice: 5000, quantity: 1, unit: "Lot" },
        { sourceType: "CostItem", sourceId: 2, internalCategory: "Electrical", amount: 20000, erpCategory: "Hardware", mappingRowVersion: "AQ==", copiedFromRevision: 1, description: "PLC", modelPartNumber: "FX5U", supplier: "Supplier A", brand: "Mitsubishi", unitPrice: 10000, quantity: 2, unit: "EA" },
        { sourceType: "CostItem", sourceId: 3, internalCategory: "Software", amount: 3000, erpCategory: "License", mappingRowVersion: "Ag==", copiedFromRevision: null, description: "Runtime license", unit: "License" },
      ],
    },
    approvedOverhead: { amount: 2000, approved: true },
  };
}

function workbookXml(input = fixture()) {
  const files = unzipSync(buildErpEstimateWorkbook(input));
  return Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, decoder.decode(bytes)]));
}

test("creates one standalone Summary cost sheet with ERP-compatible headers", () => {
  const files = workbookXml();
  assert.match(files["xl/workbook.xml"], /sheet name="Summary cost"/);
  assert.match(files["xl/workbook.xml"], /_xlnm.Print_Area[^>]*>'Summary cost'!\$C\$1:\$O\$28/);
  assert.match(files["xl/worksheets/sheet1.xml"], /<c r="C8"[^>]*>.*Item/);
  assert.match(files["xl/worksheets/sheet1.xml"], /Model\/Part Number/);
  assert.match(files["xl/worksheets/sheet1.xml"], /Discription\/Detial/);
  assert.match(files["xl/worksheets/sheet1.xml"], /Suppier/);
  assert.match(files["xl/worksheets/sheet1.xml"], /Total \(BATH\)/);
  assert.doesNotMatch(files["xl/worksheets/sheet1.xml"], /Sale Price Guide|Profit \(%/);
  assert.doesNotMatch(files["xl/worksheets/sheet1.xml"], /<f>|externalLink|#REF!/);
  for (const merge of ["C1:O1", "F2:F6", "N2:O2", "N3:O6", "C6:D6", "C7:O7", "N8:O8"]) {
    assert.match(files["xl/worksheets/sheet1.xml"], new RegExp(`<mergeCell ref="${merge}"/>`));
  }
  assert.match(files["xl/worksheets/sheet1.xml"], />000<\/t>/);
  assert.match(files["xl/worksheets/sheet1.xml"], />Page<\/t>/);
});

test("emits all seven category blocks in fixed ERP order and literal reconciled totals", () => {
  const sheet = workbookXml()["xl/worksheets/sheet1.xml"];
  const positions = ["Hardware", "Software", "Service", "Installation", "License", "Maintenance", "Training"]
    .map(category => sheet.indexOf(`>${category}</t>`));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(sheet, />Approved Overhead<\/t>/);
  assert.match(sheet, />Sub Total<\/t>/);
  assert.match(sheet, />Grand Total<\/t>/);
  assert.match(sheet, /<v>30000<\/v>/);
  assert.match(sheet, /<mergeCell ref="C11:K11"\/>/);
});

test("blocks unmapped rows, unapproved overhead, and totals outside the 0.01 tolerance", () => {
  const unmapped = fixture();
  unmapped.summary.lines[0].erpCategory = "Unmapped";
  unmapped.summary.unmapped = { amount: 5000, lineCount: 1 };
  assert.throws(() => buildErpEstimateWorkbook(unmapped), error => error instanceof ErpEstimateWorkbookValidationError && error.issues.some(issue => issue.includes("unmapped")));

  const overhead = fixture();
  overhead.approvedOverhead.approved = false;
  assert.throws(() => buildErpEstimateWorkbook(overhead), /Overhead must be approved/);

  const mismatch = fixture();
  mismatch.summary.canonicalTotal = 30000.02;
  assert.throws(() => buildErpEstimateWorkbook(mismatch), /does not reconcile/);
});

test("exports approved overhead only once in the footer", () => {
  const input = fixture();
  assert.equal(input.summary.lines.some((line) => line.sourceType === "Overhead"), false);
  assert.doesNotThrow(() => buildErpEstimateWorkbook(input));
  const sheet = workbookXml(input)["xl/worksheets/sheet1.xml"];
  assert.equal((sheet.match(/>Approved Overhead<\/t>/g) ?? []).length, 1);
  assert.equal((sheet.match(/<v>2000<\/v>/g) ?? []).length, 1);
});

test("accepts reconciliation differences of exactly 0.01", () => {
  const input = fixture();
  input.summary.canonicalTotal = 30000.01;
  assert.doesNotThrow(() => buildErpEstimateWorkbook(input));
});

test("ERP workbook preserves saved line order within each fixed category", () => {
 const input=fixture();
 const hardware=input.summary.lines.find(line=>line.erpCategory==="Hardware");
 input.summary.lines=input.summary.lines.filter(line=>line!==hardware);
 input.summary.lines.push({...hardware,sourceId:99,description:"Z FIRST",amount:10000,quantity:1},{...hardware,sourceId:1,description:"A SECOND",amount:10000,quantity:1});
 const xml=workbookXml(input)["xl/worksheets/sheet1.xml"];
 assert.ok(xml.indexOf("Z FIRST") < xml.indexOf("A SECOND"));
});

/*
 * These tests read the sheet's contents. They all passed while Excel was opening
 * the file as "[Repaired]" and throwing every row away, because none of them asked
 * whether the package was one Excel would accept. These do.
 */
const CT_WORKSHEET = ["sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData",
  "sheetCalcPr", "sheetProtection", "protectedRanges", "scenarios", "autoFilter", "sortState",
  "dataConsolidate", "customSheetViews", "mergeCells", "phoneticPr", "conditionalFormatting",
  "dataValidations", "hyperlinks", "printOptions", "pageMargins", "pageSetup", "headerFooter"];

function sheetOf(input) {
  const parts = unzipSync(buildErpEstimateWorkbook(input));
  return { parts, sheet: decoder.decode(parts["xl/worksheets/sheet1.xml"]) };
}

test("the worksheet keeps its children in the order the format fixes for them", () => {
  const { sheet } = sheetOf(fixture());
  const order = [];
  for (const match of sheet.matchAll(/<(\w+)[ />]/g)) {
    if (CT_WORKSHEET.includes(match[1]) && order.at(-1) !== match[1]) order.push(match[1]);
  }
  const positions = order.map((name) => CT_WORKSHEET.indexOf(name));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right),
    `worksheet children out of schema order: ${order.join(" > ")}`);
  // The pair that was wrong, named so the regression is unmistakable.
  assert.ok(sheet.indexOf("<autoFilter") < sheet.indexOf("<mergeCells"), "autoFilter must precede mergeCells");
});

test("no two merged ranges claim the same cell, and the count matches the ranges", () => {
  const { sheet } = sheetOf(fixture());
  const refs = [...sheet.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((match) => match[1]);
  assert.equal(Number(/<mergeCells count="(\d+)"/.exec(sheet)[1]), refs.length);
  const column = (name) => [...name].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  const owner = new Map();
  for (const ref of refs) {
    const [, left, top, right, bottom] = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
    for (let row = Number(top); row <= Number(bottom); row += 1) {
      for (let col = column(left); col <= column(right); col += 1) {
        const cell = `${col}:${row}`;
        assert.equal(owner.get(cell), undefined, `${ref} overlaps ${owner.get(cell)} at ${cell}`);
        owner.set(cell, ref);
      }
    }
  }
});

test("a description carrying characters XML cannot hold still produces a readable sheet", () => {
  /* Descriptions arrive from imported workbooks and parsed PDFs; a stray control
     character cannot be written in XML at all, escaped or not. */
  const input = fixture();
  input.summary.lines[0].description = "Master PLC\u0007 : Data \u000bgateway <A&B> \"Q\"";
  const { sheet } = sheetOf(input);
  for (const [, text] of sheet.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)) {
    for (const character of text) {
      const code = character.charCodeAt(0);
      assert.ok(code > 0x1f || code === 0x09 || code === 0x0a || code === 0x0d,
        JSON.stringify(character) + " cannot be written in XML");
    }
  }
  assert.match(sheet, /Master PLC : Data gateway &lt;A&amp;B&gt; &quot;Q&quot;/);
  assert.equal((sheet.match(/&(?!amp;|lt;|gt;|quot;|apos;|#)/g) ?? []).length, 0, "every & is an entity");
});

test("every row is in ascending order and every cell sits in the row that declares it", () => {
  const { sheet } = sheetOf(fixture());
  const rows = [...sheet.matchAll(/<row r="(\d+)">(.*?)<\/row>/g)];
  assert.ok(rows.length > 0);
  let previous = 0;
  for (const [, number, body] of rows) {
    assert.ok(Number(number) > previous, `row ${number} follows ${previous}`);
    previous = Number(number);
    let column = 0;
    for (const [, ref] of body.matchAll(/<c r="([A-Z]+\d+)"/g)) {
      const [, letters, rowNumber] = /^([A-Z]+)(\d+)$/.exec(ref);
      assert.equal(rowNumber, number, `${ref} sits in row ${number}`);
      const index = [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
      assert.ok(index > column, `${ref} comes after column ${column}`);
      column = index;
    }
  }
});
