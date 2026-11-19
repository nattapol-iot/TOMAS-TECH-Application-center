import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { unzipSync } from "fflate";
import {
  applyPaste, batchProgress, blankDraftRow, categoryFromText, draftErrors, draftPayload, draftRowIsBlank, hoursToManDays, ISSUE_STATE_TONE,
  parseLooseDate, parseTsv, personFromText,
} from "../lib/issue-batches.ts";
import { buildIssueWorkbook, issueWorkbookName } from "../lib/issue-workbook.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const team = [{ id: 1, name: "Arunwit I." }, { id: 2, name: "Pimchanok S." }, { id: 3, name: "Nattapol P." }, { id: 4, name: "Natthida K." }];
let seq = 0;
const key = () => `k${seq++}`;

test("Excel's tab-separated copy is read with quoted cells that hold line breaks and quotes", () => {
  assert.deepEqual(parseTsv("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTsv('"two\nlines"\t"say ""hi"""\nx'), [["two\nlines", 'say "hi"'], ["x"]]);
  assert.deepEqual(parseTsv(""), []);
});

test("dates come in as Excel shows them: ISO, day first, Buddhist years, 21-Oct-25", () => {
  assert.equal(parseLooseDate("2026-11-20"), "2026-11-20");
  assert.equal(parseLooseDate("20/11/2026"), "2026-11-20");
  assert.equal(parseLooseDate("20/11/2569"), "2026-11-20");
  assert.equal(parseLooseDate("21-Oct-25"), "2025-10-21");
  assert.equal(parseLooseDate("31/02/2026"), null);
  assert.equal(parseLooseDate("soon"), null);
});

test("a category and a person are read from text, and only when it is clear", () => {
  assert.equal(categoryFromText("Requirement"), "Requirement");
  assert.equal(categoryFromText("ขอเพิ่มรายงาน"), "Requirement");
  assert.equal(categoryFromText("Problem"), "Problem");
  assert.equal(categoryFromText("bug"), "Problem");
  assert.equal(categoryFromText("?"), null);
  assert.equal(personFromText("Arunwit", team), 1);
  assert.equal(personFromText("nattapol p.", team), 3);
  assert.equal(personFromText("Nat", team), null, "two people start with Nat");
  assert.equal(personFromText("", team), null);
});

test("rows pasted from Excel fill the line in focus and new lines below, column by column", () => {
  const rows = [blankDraftRow(key()), blankDraftRow(key())];
  const pasted = "Requirement\tPacking list\tAdd Net weight total\tPimchanok\t20/11/2026\t21/11/2026\t6\nProblem\tLogin\tLogs out every 5 minutes\tnobody\tlater\t\tabc";
  const next = applyPaste(rows, { row: 1, field: "category" }, pasted, team, key);
  assert.equal(next.length, 3);
  assert.deepEqual(next[0], rows[0], "the line above is untouched");
  assert.deepEqual([next[1].category, next[1].functionName, next[1].description, next[1].assigneeId, next[1].planStart, next[1].planEnd, next[1].planHours],
    ["Requirement", "Packing list", "Add Net weight total", 2, "2026-11-20", "2026-11-21", "6"]);
  // What cannot be read (an unknown person, "later", "abc") is left empty rather than guessed.
  assert.deepEqual([next[2].category, next[2].description, next[2].assigneeId, next[2].planStart, next[2].planHours], ["Problem", "Logs out every 5 minutes", null, "", ""]);
  // Starting further right shifts the columns: the first pasted cell lands in the description.
  const shifted = applyPaste([blankDraftRow(key())], { row: 0, field: "description" }, "Gross weight wrong\tArunwit", team, key);
  assert.deepEqual([shifted[0].description, shifted[0].assigneeId], ["Gross weight wrong", 1]);
});

test("a blank line is left out; the first thing to fix on each line is named", () => {
  const rows = [
    blankDraftRow(key(), { description: "ok", planStart: "2026-11-20", planHours: "4" }),
    blankDraftRow(key()),
    blankDraftRow(key(), { functionName: "Report" }),
    blankDraftRow(key(), { description: "x", planEnd: "2026-11-20" }),
    blankDraftRow(key(), { description: "x", planStart: "2026-11-21", planEnd: "2026-11-20" }),
    blankDraftRow(key(), { description: "x", planHours: "-2" }),
    blankDraftRow(key(), { description: "x", planHours: "1.5.2" }),
  ];
  assert.equal(draftRowIsBlank(rows[1]), true);
  assert.equal(draftRowIsBlank(rows[1], 1), false, "a line with a picture is not blank");
  assert.deepEqual(draftErrors(rows).map((error) => [error.row, error.field, error.message]), [
    [2, "description", "Issues.errDescription"], [3, "planStart", "Issues.errStartFirst"], [4, "planEnd", "Issues.errEndBeforeStart"],
    [5, "planHours", "Issues.errHours"], [6, "planHours", "Issues.errHours"],
  ]);
  const { items, keys } = draftPayload(rows.slice(0, 2));
  assert.deepEqual(keys, [rows[0].key]);
  assert.deepEqual(items, [{ category: "Problem", functionName: "", description: "ok", assigneeId: null, planStart: "2026-11-20", planEnd: "2026-11-20", planHours: 4 }]);
});

test("hours, progress and colours follow the team's rules", () => {
  assert.equal(hoursToManDays(12), 1.5);
  assert.deepEqual(batchProgress({ itemCount: 4, doneCount: 2, droppedCount: 1 }), { finished: 3, total: 4, percent: 75 });
  assert.deepEqual(batchProgress({ itemCount: 0, doneCount: 0, droppedCount: 0 }), { finished: 0, total: 0, percent: 0 });
  // Pegasus status tones (DESIGN.md B.1).
  assert.deepEqual(ISSUE_STATE_TONE, { Approval: "warning", Open: "outline", Doing: "soft", Done: "success", Cancelled: "neutral", Rejected: "danger" });
});

const decoder = new TextDecoder();
test("the export is the team's Issues Table: three title lines, a two-row heading of 21 columns, one row per issue", () => {
  const bytes = buildIssueWorkbook({
    projectNo: "PJ250029", projectName: "Packing List System", customer: "NTMV", updatedOn: "2026-11-18", picturesLabel: (n) => `${n} picture(s)`,
    rows: [{ issuedOn: "2026-10-21", category: "Problem", functionName: "Slip to", pictures: 2, description: "Filter <Bill to> can't load", solution: "Fixed query & index",
      inCharge: "Arunwit I.", planStart: "2026-10-30", planEnd: "2026-11-04", actualStart: "2026-10-30", actualEnd: "2026-11-04", status: "100%" }],
  });
  const files = unzipSync(bytes);
  const sheet = decoder.decode(files["xl/worksheets/sheet1.xml"]);
  assert.match(decoder.decode(files["xl/workbook.xml"]), /<sheet name="Issues Table" sheetId="1" r:id="rId1"\/>/);
  assert.match(sheet, /Issues Table for Project : NTMV PJ250029/);
  assert.match(sheet, /<mergeCell ref="A1:U1"\/>/);
  assert.match(sheet, /<mergeCell ref="J4:K4"\/><mergeCell ref="L4:O4"\/>/);
  assert.match(sheet, /<mergeCell ref="Q4:S4"\/>/);
  assert.match(sheet, /<mergeCell ref="A4:A5"\/>/);
  for (const head of ["Issuing Date", "Picture/Screen shot", "Cause of a problem T/L", "Problem solving T/L", "Customer Confirmation", "Actual Start"]) assert.ok(sheet.includes(head), head);
  // The issue row: text escaped, dates as Excel serials, the picture count in words.
  assert.match(sheet, /<row r="6">/);
  assert.match(sheet, /Filter &lt;Bill to&gt; can&apos;t load/);
  assert.match(sheet, /Fixed query &amp; index/);
  assert.match(sheet, /<c r="B6" s="6"><v>46316<\/v><\/c>/);
  assert.match(sheet, /2 picture\(s\)/);
  assert.equal((sheet.match(/<row r="6">.*?<\/row>/)?.[0].match(/<c r=/g) ?? []).length, 21);
  assert.equal(issueWorkbookName("PJ250029", "2026-11-18"), "PJ250029_issues_20261118.xlsx");
  assert.equal(issueWorkbookName("Old line 3/2019", "2026-11-18"), "Old-line-3-2019_issues_20261118.xlsx");
});

test("the Punchlist is the issue batch page alone, Pegasus-styled on this page only", async () => {
  const shell = await source("app/system/ProductionApp.tsx");
  assert.match(shell, /projectTab === "punchlist" \? <IssueBatchScreen /);
  assert.doesNotMatch(shell, /import \{ ResourceTaskWorkspace \}/);
  const screen = await source("app/system/production/IssueBatchScreen.tsx");
  // The old single-issue tab is gone (owner 2026-11-19); old is_issue tasks still list with the team's other tasks.
  assert.doesNotMatch(screen, /ResourceTaskWorkspace|issueview|role="tablist"/);
  const workspace = await source("app/system/production/ResourceTaskWorkspace.tsx");
  assert.doesNotMatch(workspace, /issues\?:boolean|isIssue:issue|issues:String\(issues\)/);
  assert.match(screen, /import "\.\/issue-batch\.css";/);
  // Dialogs are portalled into a layer of their own that carries the scope.
  assert.match(screen, /createPortal\(<div className="pg pg-layer">/);
  const css = await source("app/system/production/issue-batch.css");
  // Every rule is under .pg and the tokens are --pg-*, so nothing reaches another screen.
  const selectors = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "").match(/(^|\})\s*([^{}@]+)\{/g) ?? [];
  for (const raw of selectors) {
    const selector = raw.replace(/^\}?\s*/, "").replace(/\{$/, "").trim();
    for (const part of selector.split(",")) assert.match(part.trim(), /^\.pg\b/, `unscoped selector: ${part.trim()}`);
  }
  assert.doesNotMatch(css.replace(/--pg-[\w-]+/g, ""), /var\(--(?!pg-)/, "only --pg-* tokens");
});

test("issues show on the Plan Gantt apart from the plan, in My Work and on the team's load", async () => {
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(plan, /const chartRows = memberView \? memberRows : \[\.\.\.ganttRows, \.\.\.issueRows\];/);
  assert.match(plan, /<MyIssuesPanel notify=\{notify\} openIssueBatch=\{openIssueBatch\} \/>/);
  const workload = await source("backend-node/src/resource-workload.ts");
  assert.match(workload, /WHERE i\.state IN\(N'Open',N'Doing'\) AND i\.assignee_id IS NOT NULL AND i\.plan_start IS NOT NULL/);
  assert.match(workload, /manDays: hours === null \? null : Math\.round\(\(hours \/ 8\) \* 100\) \/ 100/);
});
