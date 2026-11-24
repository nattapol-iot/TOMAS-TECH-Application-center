import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { fillCustomerSchedule } from "../lib/customer-schedule-template.ts";
import { excelSerial } from "../lib/customer-schedule-workbook.ts";
import { cellsToGrid, readPlanTable } from "../lib/plan-excel-import.ts";

// The team's master Gantt workbook (PJ260210 "Gantt chart" R1), cleaned by scripts/build-customer-schedule-template.mjs.
const template = new Uint8Array(readFileSync(new URL("../public/templates/customer-schedule.xlsx", import.meta.url)));
const today = "2026-11-24";
const all = [
  { wbs: "1", level: 1, heading: true, name: "Design & <Review>", party: "", member: "", start: "2026-11-25", end: "2026-12-04", days: 10, percent: null, workDays: 8 },
  { wbs: "1.1", level: 2, heading: false, name: "Layout drawing", party: "Tomas", member: "Somchai P.", start: "2026-11-25", end: "2026-11-27", days: 3, percent: 40, workDays: 3 },
  { wbs: "1.1.1", level: 3, heading: false, name: "Sheet A", party: "Tomas", member: "Nida R.", start: "2026-11-25", end: "2026-11-26", days: 2, percent: 0, workDays: 2 },
  { wbs: "1.2", level: 2, heading: false, name: "Approval", party: "SC", member: "", start: "2026-11-30", end: "2026-11-30", days: 1, percent: 100, workDays: 1, after: "1.1" },
  { wbs: "2", level: 1, heading: true, name: "Install", party: "", member: "", start: null, end: null, days: 0, percent: null, workDays: 0 },
  { wbs: "2.1", level: 2, heading: false, name: "No dates yet", party: "Tomas", member: "", start: null, end: null, days: 0, percent: 0, workDays: 0 },
];
const input = {
  projectName: "OEE Monitoring",
  customerName: "SIAM CHUYO",
  projectNo: "PJ260210",
  poNumber: "OS2611002",
  projectStart: "2026-11-19",
  lead: "Tachapon",
  today,
  lang: "en",
  withMember: false,
  holidays: [],
  rows: all.filter((row) => row.level <= 2),
  taskList: null,
};
/** The cells of each sheet, values as Excel stores them (the import reads the same; its parser needs a browser). */
const sheetsOf = (bytes) => {
  const files = unzipSync(bytes);
  const relations = Object.fromEntries([...strFromU8(files["xl/_rels/workbook.xml.rels"]).matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((match) => [match[1], match[2]]));
  return [...strFromU8(files["xl/workbook.xml"]).matchAll(/<sheet name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map(([, name, id]) => {
    const cells = {};
    for (const [, ref, attributes, inner = ""] of strFromU8(files[`xl/${relations[id]}`]).matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const raw = attributes.includes("inlineStr") ? [...inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((part) => part[1]).join("") : (inner.match(/<v[^>]*>([^<]*)<\/v>/)?.[1] ?? "");
      const value = raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      if (value !== "") cells[ref] = { value: attributes.includes('t="') ? value : Number(value) };
    }
    return { name, cells };
  });
};
/** One cell's XML, so a failed check prints the cell and not the whole sheet. */
const cell = (xml, ref) => {
  const start = xml.indexOf(`<c r="${ref}"`);
  if (start < 0) return "";
  const close = xml.indexOf(">", start);
  return xml[close - 1] === "/" ? xml.slice(start, close + 1) : xml.slice(start, xml.indexOf("</c>", start) + 4);
};

test("the template is the team's master, cleaned: no outside links, broken names, SharePoint data or old project", () => {
  const files = unzipSync(template);
  assert.ok(!Object.keys(files).some((name) => /externalLink|customXml|calcChain|docProps\/custom/.test(name)));
  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.doesNotMatch(workbook, /#REF!|externalReference|sharepoint/i);
  assert.match(workbook, /fullCalcOnLoad="1"/);
  const all = Object.entries(files)
    .filter(([name]) => name.endsWith(".xml"))
    .map(([, data]) => strFromU8(data))
    .join("");
  assert.doesNotMatch(all, /SIAM|CHUYO|OEE|PJ260210|Kick-off/i, "nothing of the master's own project");
  const plan = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(plan, /<conditionalFormatting sqref="K8:KY9"><cfRule type="expression"[^>]*><formula>AND\(NOT\(ISBLANK\(\$E8\)\)/, "the Gantt bar rule");
  assert.match(plan, /Copyright© TOMAS TECH CORPORATION/);
});

test("the plan fills the master's Plan sheet and keeps its formulas, bars and scroll bar", async () => {
  const bytes = fillCustomerSchedule(template, input);
  const files = unzipSync(bytes);
  const plan = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.ok(!files["xl/worksheets/sheet2.xml"], "no Task list unless asked");
  assert.doesNotMatch(strFromU8(files["xl/workbook.xml"]), /Task list/);
  assert.doesNotMatch(strFromU8(files["[Content_Types].xml"]), /sheet2|drawing2|comments2|ctrlProp2/);
  assert.match(cell(plan, "A1"), /<t xml:space="preserve">\[ OEE Monitoring \] Project Schedule<\/t>/);
  assert.match(cell(plan, "C4"), /<v>46345<\/v>/, "project start");
  assert.match(cell(plan, "C5"), /Tachapon/);
  assert.match(cell(plan, "E9"), new RegExp(`<v>${excelSerial("2026-11-25")}</v>`));
  assert.match(cell(plan, "F9"), /<f>IF\(ISBLANK\(E9\)," - ",IF\(G9=0,E9,E9\+G9-1\)\)<\/f><v>46353<\/v>/, "END stays the master's formula");
  assert.match(cell(plan, "I9"), /NETWORKDAYS\(E9,F9\)\)<\/f><v>3<\/v>/);
  assert.match(cell(plan, "H9"), /<v>0\.4<\/v>/);
  assert.match(cell(plan, "D10"), /<t xml:space="preserve">1\.1<\/t>/, "PREDECESSOR");
  assert.match(cell(plan, "B8"), /Design &amp; &lt;Review&gt;/);
  assert.match(cell(plan, "F12"), /t="str"><f>.*<\/f><v xml:space="preserve"> - <\/v>/, "no dates, as the master shows it");
  assert.match(plan, /<conditionalFormatting sqref="K8:KY12">/, "the bars reach the last row");
  assert.match(plan, /<xm:sqref>H8:H12<\/xm:sqref>/);
  assert.match(plan, /<control shapeId="\d+" r:id="rId\d+" name="Scroll Bar/);
  assert.match(strFromU8(files["xl/workbook.xml"]), /Plan!\$A\$1:\$EE\$12</);
  assert.match(strFromU8(files["xl/styles.xml"]), /numFmtId="191" formatCode="\[\$-409\]ddd/);
  // Every row the file has, read back the way Import from Excel reads it.
  const [sheet] = sheetsOf(bytes);
  const read = readPlanTable(cellsToGrid(sheet.cells), today);
  assert.equal(read.projectNo, "PJ260210");
  assert.deepEqual(
    read.rows.map((row) => [row.wbs, row.name, row.party, row.start, row.end, row.parent ? null : row.percent]),
    [
      ["1", "Design & <Review>", "", "2026-11-25", "2026-12-04", null],
      ["1.1", "Layout drawing", "Tomas", "2026-11-25", "2026-11-27", 40],
      ["1.2", "Approval", "SC", "2026-11-30", "2026-11-30", 100],
      ["2", "Install", "", null, null, null],
      ["2.1", "No dates yet", "Tomas", null, null, 0],
    ],
  );
});

test("the Task list sheet carries every row and its member when asked, in Thai dates", async () => {
  const bytes = fillCustomerSchedule(template, { ...input, lang: "th", taskList: all });
  const files = unzipSync(bytes);
  assert.match(strFromU8(files["xl/styles.xml"]), /numFmtId="191" formatCode="\[\$-41E\]ddd/);
  const sheets = sheetsOf(bytes);
  assert.deepEqual(
    sheets.map((sheet) => sheet.name),
    ["Plan", "Task list"],
  );
  const tasks = readPlanTable(cellsToGrid(sheets[1].cells), today);
  assert.deepEqual(
    tasks.rows.map((row) => [row.wbs, row.name, row.party, row.start]),
    [
      ["1", "Design & <Review>", "", "2026-11-25"],
      ["1.1", "Layout drawing", "Tomas", null],
      ["1.1.1", "Sheet A", "Nida R.", "2026-11-25"],
      ["1.2", "Approval", "SC", "2026-11-30"],
      ["2", "Install", "", null],
      ["2.1", "No dates yet", "Tomas", null],
    ],
  );
  const list = strFromU8(files["xl/worksheets/sheet2.xml"]);
  assert.match(list, /<c r="C4" s="\d+"><f>Plan!C4<\/f><v>46345<\/v><\/c>/);
  assert.match(list, /<conditionalFormatting sqref="J8:GX13">/);
});

test("only the header help notes stay, and the Task list weeks are seven days each", () => {
  const files = unzipSync(template);
  for (const name of ["xl/comments1.xml", "xl/comments2.xml"]) {
    const rows = [...strFromU8(files[name]).matchAll(/<comment ref="[A-Z]+(\d+)"/g)].map((match) => Number(match[1]));
    assert.ok(rows.length > 0 && rows.every((row) => row === 7), `${name}: ${rows}`);
  }
  assert.doesNotMatch(strFromU8(files["docProps/core.xml"]) + strFromU8(files["xl/comments1.xml"]), /nattapol/i);
  const list = strFromU8(files["xl/worksheets/sheet2.xml"]);
  assert.match(cell(list, "FH4"), /<v>Week 23<\/v>/);
  assert.match(list, /<mergeCell ref="FH4:FN4"\/>/);
  assert.doesNotMatch(list, /<mergeCell ref="FH4:FK4"\/>/);
});

test("a later start moves the cached header dates with it; an empty plan still makes a file", () => {
  const bytes = fillCustomerSchedule(template, { ...input, projectStart: "2027-03-03", rows: [] });
  const plan = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
  const monday = excelSerial("2027-03-01");
  assert.match(cell(plan, "K6"), new RegExp(`<v>${monday}</v>`));
  assert.match(cell(plan, "L6"), new RegExp(`<v>${monday + 1}</v>`));
  assert.match(cell(plan, "R5"), new RegExp(`<v>${monday + 7}</v>`));
  assert.match(plan, /<dimension ref="A1:KY8"\/>/);
  assert.doesNotMatch(plan, /<row r="8"/, "no plan rows");
  const text = strFromU8(unzipSync(fillCustomerSchedule(template, { ...input, projectName: "Bad\u0001name" }))["xl/worksheets/sheet1.xml"]);
  assert.match(cell(text, "A1"), /\[ Badname \]/, "control characters are dropped");
});
