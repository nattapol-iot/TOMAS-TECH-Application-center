import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { buildCustomerScheduleWorkbook, columnName, customerScheduleDays, customerScheduleFileName, customerScheduleSheet, excelSerial } from "../lib/customer-schedule-workbook.ts";

const rows = [
  { wbs: "1", level: 1, heading: true, name: "Design", party: "", member: "", start: "2026-11-25", end: "2026-12-04", days: 10, percent: null, workDays: 8 },
  { wbs: "1.1", level: 2, heading: false, name: "Layout drawing", party: "TOMAS", member: "Somchai P.", start: "2026-11-25", end: "2026-11-27", days: 3, percent: 40, workDays: 3 },
  { wbs: "1.2", level: 2, heading: false, name: "Approval", party: "Customer", member: "", start: "2026-11-30", end: "2026-11-30", days: 1, percent: 100, workDays: 1 },
];
const input = {
  projectName: "OEE Monitoring",
  customerName: "SIAM CHUYO",
  projectNo: "PJ260210",
  poNumber: "OS2611002",
  projectStart: "2026-11-25",
  lead: "Tachapon",
  today: "2026-11-26",
  lang: "th",
  withMember: false,
  holidays: ["2026-12-07"],
  rows,
};
const cellAt = (sheet, row, col) => sheet.rows[row][col];

test("the customer file's title block, headers and file name follow the team's Gantt file", () => {
  const sheet = customerScheduleSheet(input);
  assert.equal(cellAt(sheet, 0, 0).value, "[ OEE Monitoring ] Project Schedule");
  assert.equal(cellAt(sheet, 1, 0).value, "[ SIAM CHUYO ]");
  assert.equal(cellAt(sheet, 2, 0).value, "PJ260210 [ OS2611002 ]");
  assert.deepEqual(
    sheet.rows[6].slice(0, 8).map((cell) => cell.value),
    ["WBS", "TASK", "PIC", "START", "END", "DAYS", "% DONE", "WORK DAYS"],
  );
  assert.equal(cellAt(sheet, 4, 8).value, "Week 1");
  assert.equal(cellAt(sheet, 5, 8).value, "23 พ.ย. 2026");
  assert.equal(cellAt(sheet, 7, 8).value, "จ");
  assert.deepEqual(sheet.frozen, { columns: 8, rows: 8 });
  assert.equal(customerScheduleFileName("PJ260210"), "PJ260210 Project Schedule.xlsx");
  assert.equal(customerScheduleFileName('PJ/26:02"10'), "PJ-26-02-10 Project Schedule.xlsx");
  const member = customerScheduleSheet({ ...input, withMember: true, lang: "en" });
  assert.deepEqual(
    member.rows[6].slice(0, 9).map((cell) => cell.value),
    ["WBS", "TASK", "PIC", "MEMBER", "START", "END", "DAYS", "% DONE", "WORK DAYS"],
  );
  assert.equal(member.rows[9][3].value, "Somchai P.");
  assert.equal(member.rows[5][9].value, "23 Nov 2026");
});

test("the days run from the plan's first Monday, whole weeks, a week past the last END", () => {
  const days = customerScheduleDays(input);
  assert.equal(days[0], "2026-11-23");
  assert.equal(days.length % 7, 0);
  assert.ok(days.length >= 28);
  assert.ok(days.includes("2026-12-07"), "a week past 4 Dec");
  assert.equal(customerScheduleDays({ rows: [], projectStart: null, today: "2026-11-26" })[0], "2026-11-23");
});

test("the plan is drawn as filled day cells: blue for work, gray when done, navy for a heading", () => {
  const sheet = customerScheduleSheet(input),
    days = customerScheduleDays(input),
    left = 8;
  const style = (row, day) => sheet.rows[row][left + days.indexOf(day)].style;
  // Row 8 is the heading, 9 the 40% task, 10 the finished one.
  assert.equal(style(8, "2026-11-25"), 24);
  assert.equal(style(9, "2026-11-25"), 21);
  assert.equal(style(9, "2026-11-27"), 21);
  assert.equal(style(9, "2026-11-28"), 20, "a weekend outside the bar");
  assert.equal(style(9, "2026-11-26"), 21, "today inside the bar stays the bar");
  assert.equal(style(10, "2026-11-26"), 25, "today outside a bar");
  assert.equal(style(10, "2026-11-30"), 22);
  assert.equal(style(10, "2026-12-07"), 26, "a company holiday");
  assert.equal(sheet.rows[9][3].value, excelSerial("2026-11-25"));
  assert.equal(excelSerial("2026-11-25"), 46351);
  assert.equal(sheet.rows[9][6].value, 0.4);
  assert.equal(sheet.rows[8][6].value, undefined, "a heading has no % DONE of its own");
  assert.equal(sheet.rows[8][2].value, "", "a heading has no PIC");
});

test("the workbook is a valid package with Thai or English dates, merged week headers and frozen panes", () => {
  const files = unzipSync(buildCustomerScheduleWorkbook(input));
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) assert.ok(files[part], part);
  const sheetXml = strFromU8(files["xl/worksheets/sheet1.xml"]);
  assert.match(sheetXml, /<mergeCell ref="I5:O5"\/>/, "Week 1 spans its seven days");
  assert.match(sheetXml, /<pane xSplit="8" ySplit="8" topLeftCell="I9"/);
  assert.match(sheetXml, /\[ OEE Monitoring \] Project Schedule/);
  assert.match(strFromU8(files["xl/styles.xml"]), /formatCode="\[\$-41E\]ddd dd\/mm\/yy"/);
  assert.match(strFromU8(unzipSync(buildCustomerScheduleWorkbook({ ...input, lang: "en" }))["xl/styles.xml"]), /formatCode="\[\$-409\]ddd dd\/mm\/yy"/);
  const count = Number(sheetXml.match(/<mergeCells count="(\d+)"/)[1]);
  assert.equal(count, sheetXml.match(/<mergeCell ref=/g).length);
  assert.equal(columnName(1), "A");
  assert.equal(columnName(27), "AA");
});
