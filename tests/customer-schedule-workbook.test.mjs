import assert from "node:assert/strict";
import test from "node:test";
import { columnName, CUSTOMER_SCHEDULE_COPYRIGHT, customerScheduleDays, customerScheduleFileName, customerScheduleSheet, excelSerial } from "../lib/customer-schedule-workbook.ts";

const rows = [
  { wbs: "1", level: 1, heading: true, name: "Design", party: "", member: "", start: "2026-11-25", end: "2026-12-04", days: 10, percent: null, workDays: 8 },
  { wbs: "1.1", level: 2, heading: false, name: "Layout drawing", party: "TOMAS", member: "Somchai P.", start: "2026-11-25", end: "2026-11-27", days: 3, percent: 40, workDays: 3 },
  { wbs: "1.2", level: 2, heading: false, name: "Approval", party: "Customer", member: "", start: "2026-11-30", end: "2026-11-30", days: 1, percent: 100, workDays: 1, after: "1.1" },
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

// The team's master file (PJ260210 Gantt chart R1): title block in rows 1-3, plan facts and the calendar in 4-6,
// headers in 7, the plan from row 8; PREDECESSOR hidden, a narrow blank column, the days from K.
test("the customer file's title block, headers and file name follow the team's master Gantt file", () => {
  const sheet = customerScheduleSheet(input);
  assert.equal(cellAt(sheet, 0, 0).value, "[ OEE Monitoring ] Project Schedule");
  assert.equal(cellAt(sheet, 0, 10).value, CUSTOMER_SCHEDULE_COPYRIGHT);
  assert.equal(cellAt(sheet, 1, 0).value, " [ SIAM CHUYO ]");
  assert.equal(cellAt(sheet, 2, 0).value, "PJ260210 [ OS2611002 ]");
  assert.equal(cellAt(sheet, 3, 1).value, "Project Start Date ");
  assert.equal(cellAt(sheet, 3, 2).value, excelSerial("2026-11-25"));
  assert.equal(cellAt(sheet, 3, 6).value, "Display Week ");
  assert.equal(cellAt(sheet, 3, 7).value, 1, "today is in week 1");
  assert.equal(cellAt(sheet, 4, 1).value, "Project Lead ");
  assert.equal(cellAt(sheet, 4, 2).value, "Tachapon");
  assert.deepEqual(
    sheet.rows[6].slice(0, 9).map((cell) => cell.value),
    ["WBS", "TASK", "PIC", "PREDECESSOR", "START", "END", "DAYS", "% DONE", "WORK DAYS"],
  );
  assert.equal(cellAt(sheet, 3, 10).value, "Week 1");
  assert.equal(cellAt(sheet, 3, 17).value, "Week 2");
  assert.equal(cellAt(sheet, 4, 10).value, excelSerial("2026-11-23"), "the Monday of the week");
  assert.equal(cellAt(sheet, 5, 10).value, excelSerial("2026-11-23"), "one date per day");
  assert.equal(cellAt(sheet, 5, 13).style, 8, "today's date in red");
  assert.equal(cellAt(sheet, 6, 10).value, "จ");
  assert.equal(sheet.widths[3].hidden, true, "PREDECESSOR is hidden");
  assert.equal(sheet.widths[9].width, 1.89, "the narrow blank column");
  assert.equal(sheet.widths[10].width, 2.44);
  assert.deepEqual(sheet.frozen, { columns: 0, rows: 7 });
  assert.equal(customerScheduleFileName("PJ260210"), "PJ260210 Project Schedule.xlsx");
  assert.equal(customerScheduleFileName('PJ/26:02"10'), "PJ-26-02-10 Project Schedule.xlsx");
  const member = customerScheduleSheet({ ...input, withMember: true, lang: "en" });
  assert.deepEqual(
    member.rows[6].slice(0, 10).map((cell) => cell.value),
    ["WBS", "TASK", "PIC", "MEMBER", "PREDECESSOR", "START", "END", "DAYS", "% DONE", "WORK DAYS"],
  );
  assert.equal(member.rows[8][3].value, "Somchai P.");
  assert.equal(member.rows[3][11].value, "Week 1");
  assert.equal(member.rows[6][11].value, "M");
  assert.equal(member.widths[4].hidden, true);
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
    left = 10;
  const style = (row, day) => sheet.rows[row][left + days.indexOf(day)].style;
  // Row 7 is the heading, 8 the 40% task, 9 the finished one.
  assert.equal(style(7, "2026-11-25"), 24);
  assert.equal(style(8, "2026-11-25"), 21);
  assert.equal(style(8, "2026-11-27"), 21);
  assert.equal(style(8, "2026-11-28"), 20, "a weekend outside the bar");
  assert.equal(style(8, "2026-11-26"), 21, "today inside the bar stays the bar");
  assert.equal(style(9, "2026-11-26"), 25, "today outside a bar");
  assert.equal(style(9, "2026-11-30"), 22);
  assert.equal(style(9, "2026-12-07"), 26, "a company holiday");
  assert.equal(sheet.rows[8][4].value, excelSerial("2026-11-25"));
  assert.equal(excelSerial("2026-11-25"), 46351);
  assert.equal(sheet.rows[8][7].value, 0.4);
  assert.equal(sheet.rows[9][3].value, "1.1", "PREDECESSOR carries the row it follows");
  assert.equal(sheet.rows[9][9].style, 29, "the blank column");
  assert.equal(sheet.rows[7][7].value, undefined, "a heading has no % DONE of its own");
  assert.equal(sheet.rows[7][2].value, "", "a heading has no PIC");
});

test("column names run past Z", () => {
  assert.equal(columnName(1), "A");
  assert.equal(columnName(27), "AA");
});
