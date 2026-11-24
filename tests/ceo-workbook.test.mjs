import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { buildCeoWorkbook, ceoWorkbookName, ceoWorkbookSheets } from "../lib/ceo-workbook.ts";
import { columnName, sheetName } from "../lib/simple-workbook.ts";

const labor = { budgetManDays: 40, plannedManDays: 46, forecastManDays: 48, actualManDays: 14, toDateManDays: 12, disciplines: [] };
const item = (id, number) => ({
  id,
  number,
  name: `Line ${id}`,
  customerName: "SIAM",
  managerName: "Nattapol",
  status: "Development",
  hardware: { budget: 120000, requested: 95000, approved: 60000, ordered: 30000 },
  outsource: { budget: null, requested: null, approved: null, ordered: null },
  labor,
  ceoNote: id === 7 ? { text: "Waiting for sign-off", by: "Nattapol", at: "2026-11-24T08:00:00Z" } : null,
});
const input = {
  shown: [item(7, "PJ260091")],
  all: [item(7, "PJ260091"), item(8, "PJ260088")],
  details: new Map([
    [
      7,
      {
        people: [{ id: 3, name: "Tachapon", discipline: "Electrical", hours: 80, days: 10, lastDay: "2026-11-24" }],
        plan: [{ id: 1, name: "Design", planStart: "2026-10-05", planFinish: "2026-11-20", percentComplete: 60, plannedManDays: 20, outsourcedManDays: 0, toDateManDays: 12 }],
        requests: [{ id: 11, number: "REQ-1", status: "Approved", requiredDate: "2026-12-01", unit: null, amount: 95000, lines: 3 }],
      },
    ],
  ]),
  schedule: new Map([[7, { status: "Development", slipDays: 3 }]]),
  hoursPerManDay: 8,
  today: "2026-11-25",
  t: (key) => key,
};

test("the CEO workbook has the five sheets of task doc 6.4, from the figures on screen", () => {
  const sheets = ceoWorkbookSheets(input);
  assert.deepEqual(
    sheets.map((sheet) => sheet.name),
    ["CEO.sheet.summary", "CEO.sheet.people", "CEO.sheet.tasks", "CEO.sheet.requests", "CEO.sheet.all"],
  );
  const summary = sheets[0];
  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0][0], "PJ260091 · Line 7");
  // A figure the viewer may not see stays an empty cell; people reads the plan or forecast, whichever is more.
  assert.deepEqual(summary.rows[0].slice(4, 10), [95000, 120000, null, null, 48, 40]);
  assert.match(summary.rows[0][10], /CEO\.late/);
  assert.equal(summary.rows[0][11], "Waiting for sign-off (Nattapol)");
  assert.deepEqual(sheets[1].rows, [["PJ260091 · Line 7", "Tachapon", "Cost.discipline.Electrical", 80, 10, 10, "2026-11-24"]]);
  assert.equal(sheets[3].rows[0][1], "REQ-1");
  assert.equal(sheets[4].rows.length, 2, "All projects lists every project, not only the one shown");
});

test("the workbook opens as xlsx: one worksheet per sheet, numbers kept as numbers", () => {
  const files = unzipSync(buildCeoWorkbook(input));
  assert.ok(files["xl/worksheets/sheet5.xml"]);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  assert.equal((workbook.match(/<sheet /g) ?? []).length, 5);
  const summary = strFromU8(files["xl/worksheets/sheet1.xml"]);
  // A title, a blank row, the header on row 3: the first project is row 4.
  assert.match(summary, /<c r="E4" s="4"><v>95000<\/v><\/c>/);
  assert.equal(ceoWorkbookName(null, "2026-11-25"), "CEO-cost-summary_all-projects_20261125.xlsx");
  assert.equal(ceoWorkbookName("PJ260091", "2026-11-25"), "CEO-cost-summary_PJ260091_20261125.xlsx");
});

test("sheet names Excel accepts and column letters", () => {
  const taken = new Set();
  assert.equal(sheetName("Summary", taken), "Summary");
  assert.equal(sheetName("summary", taken), "summary 2");
  assert.equal(sheetName("a/b:c", taken), "a b c");
  assert.equal(columnName(1), "A");
  assert.equal(columnName(27), "AA");
});
