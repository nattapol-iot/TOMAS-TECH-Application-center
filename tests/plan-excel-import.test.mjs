import assert from "node:assert/strict";
import test from "node:test";
import { cellsToGrid, importChanges, importDate, importDays, readPlanTable } from "../lib/plan-excel-import.ts";

const today = "2026-11-24";
// The team's Gantt file: a title block, the header row, then headings and tasks; Excel day numbers for dates.
const grid = [
  ["[ OEE Monitoring ] Project Schedule"],
  ["[ SIAM CHUYO ]"],
  ["PJ260210 [ OS2611002 ]"],
  [],
  ["WBS", "TASK", "PIC", "START", "END", "DAYS", "% DONE", "WORK DAYS", 1, 2, 3],
  ["1", "Kick-off", "", 46345, 46358, 14, "", 10],
  ["1.1", "Kick-off meeting after PO", "SC/Tomas", 46345, 46345, 1, 1, 1],
  ["1.2", "Schedule & Plan confirmation", "Tomas", "Thu 19/11/26", "06/12/26", 18, 0.75, 12],
  ["2", "System Design", "", "", "", "", "", ""],
  ["2.1", "Specification", "Tomas", "08/12/26", "", 5, "40%", 4],
  ["2.1.1", "Blueprint", "Tomas", "08/12/26", "07/12/26", "", 0, ""],
  [],
  ["", "Hardware", "", "", "", "", "", ""],
  ["", "Panel build", "Tomas", "", "", 3, "", ""],
];

test("the header row is found by TASK and START; the title block gives the project number", () => {
  const plan = readPlanTable(grid, today);
  assert.ok(plan);
  assert.equal(plan.projectNo, "PJ260210");
  assert.deepEqual(
    plan.rows.map((row) => `${row.wbs} ${row.name}`),
    ["1 Kick-off", "1.1 Kick-off meeting after PO", "1.2 Schedule & Plan confirmation", "2 System Design", "2.1 Specification", "2.1.1 Blueprint", "3 Hardware", "3.1 Panel build"],
  );
  assert.equal(
    readPlanTable(
      [
        ["Name", "Date"],
        ["x", 1],
      ],
      today,
    ),
    null,
    "no TASK + START header",
  );
});

test("dates, days and percentages read the way the team writes them", () => {
  const plan = readPlanTable(grid, today);
  const by = (wbs) => plan.rows.find((row) => row.wbs === wbs);
  assert.equal(by("1.1").start, "2026-11-19");
  assert.equal(by("1.1").percent, 100, "1 means 100%");
  assert.equal(by("1.2").start, "2026-11-19", "a weekday before the date is skipped");
  assert.equal(by("1.2").end, "2026-12-06");
  assert.equal(by("1.2").percent, 75);
  assert.equal(by("2.1").end, "2026-12-12", "END from START and DAYS");
  assert.equal(by("2.1").percent, 40);
  assert.equal(by("2.1.1").end, "2026-12-08", "END before START becomes START");
  assert.equal(by("1").parent, true);
  assert.equal(by("2.1.1").parent, false);
  assert.deepEqual(
    plan.warnings.map((item) => `${item.line} ${item.key}`),
    ["11 Sheet.importEndBeforeStart", "14 Sheet.importNoDates"],
  );
  assert.equal(importDate(46345, today), "2026-11-19");
  assert.equal(importDate("", today), null);
  assert.equal(importDays({ start: "2026-11-19", end: "2026-11-21" }), 3);
});

test("a row without a WBS is a heading when it has no PIC and no DAYS, else a task", () => {
  const plan = readPlanTable(grid, today);
  assert.equal(plan.rows.find((row) => row.name === "Hardware").level, 1);
  assert.equal(plan.rows.find((row) => row.name === "Panel build").level, 2);
});

test("an import by WBS changes the rows the plan has and adds the others", () => {
  const plan = readPlanTable(grid, today);
  const current = [
    { wbs: "1", kind: "phase", name: "Kick-off", party: "", start: "2026-11-19", end: "2026-12-02", percent: 0, rollup: true },
    { wbs: "1.1", kind: "task", name: "Kick-off meeting after PO", party: "SC/Tomas", start: "2026-11-19", end: "2026-11-19", percent: 100, rollup: false },
    { wbs: "1.2", kind: "task", name: "Schedule & Plan confirmation", party: "Tomas", start: "2026-11-19", end: "2026-12-04", percent: 50, rollup: false },
    { wbs: "9", kind: "phase", name: "Only in the app", party: "", start: null, end: null, percent: 0, rollup: false },
  ];
  const { changes, kept } = importChanges(plan.rows, current);
  const status = Object.fromEntries(changes.map((item) => [item.row.wbs, item.status]));
  assert.equal(status["1"], "same");
  assert.equal(status["1.1"], "same");
  assert.equal(status["1.2"], "update");
  assert.equal(status["2.1"], "add");
  assert.equal(kept, 1);
});

test("worksheet cells by reference become rows", () => {
  assert.deepEqual(cellsToGrid({ A1: { value: "WBS" }, B1: { value: "TASK" }, B3: { value: 5 }, AA2: { value: "x" } }), [["WBS", "TASK"], Object.assign([], { 26: "x" }), Object.assign([], { 1: 5 })]);
});

test("a file exported for the customer imports back as the same plan", async () => {
  const { customerScheduleSheet } = await import("../lib/customer-schedule-workbook.ts");
  const rows = [
    { wbs: "1", level: 1, heading: true, name: "Design", party: "", member: "", start: "2026-11-25", end: "2026-12-04", days: 10, percent: null, workDays: 8 },
    { wbs: "1.1", level: 2, heading: false, name: "Layout drawing", party: "TOMAS", member: "", start: "2026-11-25", end: "2026-11-27", days: 3, percent: 40, workDays: 3 },
    { wbs: "1.2", level: 2, heading: false, name: "Approval", party: "Customer", member: "", start: "2026-11-30", end: "2026-11-30", days: 1, percent: 100, workDays: 1 },
  ];
  const sheet = customerScheduleSheet({
    projectName: "OEE",
    customerName: "SIAM",
    projectNo: "PJ260210",
    poNumber: "OS1",
    projectStart: "2026-11-25",
    lead: "T",
    today,
    lang: "th",
    withMember: false,
    holidays: [],
    rows,
  });
  const plan = readPlanTable(
    sheet.rows.map((line) => line.map((cell) => cell.value)),
    today,
  );
  assert.equal(plan.projectNo, "PJ260210");
  assert.deepEqual(
    plan.rows.map((row) => [row.wbs, row.name, row.party, row.start, row.end, row.parent ? null : row.percent]),
    [
      ["1", "Design", "", "2026-11-25", "2026-12-04", null],
      ["1.1", "Layout drawing", "TOMAS", "2026-11-25", "2026-11-27", 40],
      ["1.2", "Approval", "Customer", "2026-11-30", "2026-11-30", 100],
    ],
  );
});

test("the file's own WBS is kept, so a new heading 5 never lands on the plan's heading 2", () => {
  const plan = readPlanTable(
    [
      ["WBS", "TASK", "PIC", "START", "END"],
      ["1", "Design", "", "", ""],
      ["5", "Training", "", "", ""],
      ["5.1", "Operator training", "Tomas", "15/02/27", "16/02/27"],
      ["", "Handover", "Tomas", "17/02/27", "17/02/27"],
    ],
    today,
  );
  assert.deepEqual(
    plan.rows.map((row) => row.wbs),
    ["1", "5", "5.1", "5.2"],
  );
  const { changes } = importChanges(plan.rows, [
    { wbs: "1", kind: "phase", name: "Design", party: "", start: null, end: null, percent: 0, rollup: true },
    { wbs: "2", kind: "phase", name: "Manufacturing", party: "", start: null, end: null, percent: 0, rollup: true },
    { wbs: "5", kind: "phase", name: "Old name", party: "", start: null, end: null, percent: 0, rollup: true },
  ]);
  assert.deepEqual(
    changes.map((item) => `${item.row.wbs}:${item.status}${item.was ? `:${item.was}` : ""}`),
    ["1:same", "5:update:Old name", "5.1:add", "5.2:add"],
  );
});

test("review fixes: blank % keeps the plan's, whole-number columns, duplicate WBS, notes under the table, rows without WBS", () => {
  const plan = readPlanTable(
    [
      ["WBS", "TASK", "PIC", "START", "END", "% DONE"],
      ["1", "Design", "", "", "", ""],
      ["1.1", "Layout", "Tomas", "19/11/26", "20/11/26", ""],
      ["1.2", "Review", "Tomas", "21/11/26", "21/11/26", 1],
      ["1.3", "Approval", "Tomas", "22/11/26", "22/11/26", 40],
      ["1.1.1.1", "Deep step", "Tomas", "19/11/26", "19/11/26", ""],
      ["1.2", "Review again", "Tomas", "21/11/26", "21/11/26", ""],
      [],
      ["", "Remark: dates are planned", "", "", "", ""],
      ["", "Prepared by Somchai", "", "", "", ""],
    ],
    today,
  );
  const by = (wbs) => plan.rows.find((row) => row.wbs === wbs);
  assert.equal(by("1.1").percent, null, "a blank % keeps the plan's");
  assert.equal(by("1.2").percent, 1, "a column with 40 in it reads 1 as 1%");
  assert.equal(by("1.3").percent, 40);
  assert.equal(by("1.1.1.1").level, 4, "a deep WBS keeps its own number");
  assert.equal(plan.rows.filter((row) => row.wbs === "1.2").length, 1, "the duplicate 1.2 is left out");
  assert.ok(plan.warnings.some((item) => item.key === "Sheet.importDuplicate"));
  assert.ok(!plan.rows.some((row) => /Remark|Prepared/.test(row.name)), "notes under the table are not rows");
  const numbered = readPlanTable(
    [
      ["TASK", "PIC", "START", "END"],
      ["Design", "", "", ""],
      ["New first task", "Tomas", "19/11/26", "19/11/26"],
    ],
    today,
  );
  const { changes } = importChanges(numbered.rows, [
    { wbs: "1", kind: "phase", name: "Design", party: "", start: null, end: null, percent: 0, rollup: true },
    { wbs: "1.1", kind: "task", name: "Layout drawing", party: "", start: "2026-11-19", end: "2026-11-19", percent: 0, rollup: false },
  ]);
  assert.deepEqual(
    changes.map((item) => `${item.row.wbs}:${item.status}`),
    ["1:same", "1.1:add"],
    "a row numbered by place never renames another",
  );
});

test("the colour key under the team's master plan is not read as plan rows", () => {
  const grid = [
    ["WBS", "TASK", "PIC", "PREDECESSOR", "START", "END", "DAYS", "% DONE"],
    [1, "Design", "", "", 46351, 46360, 10, ""],
    ["1.1", "Layout drawing", "Tomas", "", 46351, 46353, 3, 0.4],
    [],
    ["", "[ Level 1 Task or Phase ]"],
    ["", ". [ Level 2 Task ]"],
    ["", ". . . [ Level 4 Task ]"],
    ["1.2", "[Level 2 PLC] program", "Tomas", "", 46354, 46355, 2, 0],
  ];
  const plan = readPlanTable(grid, "2026-11-24");
  assert.deepEqual(
    plan.rows.map((row) => row.name),
    ["Design", "Layout drawing", "[Level 2 PLC] program"],
  );
});
