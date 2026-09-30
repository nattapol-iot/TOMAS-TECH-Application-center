import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";
import { buildScheduleWorkbook, excelDate, scheduleWorkbookName } from "../lib/schedule-workbook.ts";

const decoder = new TextDecoder();
const columns = ["WBS", "Task", "Kind", "Visibility", "Plan start", "Plan finish", "Work days", "PIC", "Plan MD", "Actual MD", "Progress", "Status", "Actual start", "Actual finish", "Forecast finish", "Remark"];
const row = (change) => ({ wbs: "1.1", depth: 1, kind: "task", name: "Kick-off", visibility: "Customer", planStart: "2026-09-30", planFinish: "2026-10-02",
  workDays: 3, pics: "", planManDays: 0, actualManDays: 0, percentComplete: 0, status: "Not Started", actualStart: null, actualFinish: null, forecastFinish: null, remark: null, ...change });
const fixture = () => ({
  projectNo: "PJ260192", projectName: "Demo-kit SJ Bar Modification", exportedOn: "2026-09-30", planStart: "2026-09-29", planFinish: "2026-10-19", percentComplete: 12.4,
  labels: { title: "PROJECT SCHEDULE", project: "Project", exported: "Exported", planPeriod: "Plan", progress: "Progress", columns },
  rows: [
    row({ wbs: "1", depth: 0, kind: "phase", name: "Master Plan", planStart: "2026-09-30", planFinish: "2026-10-19", workDays: 14 }),
    row({}),
    row({ wbs: "2.1", name: "Supplier <confirmation> & PO", visibility: "Internal", pics: "Nattawat Hannok, สมชาย ใจดี", planManDays: 1.5, actualManDays: 0.5,
      percentComplete: 40, status: "In Progress", actualStart: "2026-09-29", remark: "รอ PO จากลูกค้า" }),
  ],
});
const sheetOf = (bytes) => decoder.decode(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);

test("Excel dates are day serials from 1899-12-30", () => {
  assert.equal(excelDate("1900-03-01"), 61);
  assert.equal(excelDate("2026-09-30"), 46295);
  assert.equal(excelDate(null), null);
  assert.equal(excelDate("not a date"), null);
});

test("the workbook is a complete package with one Schedule sheet", () => {
  const files = unzipSync(buildScheduleWorkbook(fixture()));
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) assert.ok(files[part], part);
  const workbook = decoder.decode(files["xl/workbook.xml"]);
  assert.match(workbook, /<sheet name="Schedule" sheetId="1" r:id="rId1"\/>/);
  assert.match(workbook, /Schedule!\$A\$5:\$P\$8/);
  assert.match(decoder.decode(files["xl/styles.xml"]), /<cellXfs count="15">/);
  assert.equal((decoder.decode(files["xl/styles.xml"]).match(/<xf /g) ?? []).length, 16, "one style xf plus fifteen cell xfs");
});

test("each schedule row is written with real dates, numbers and escaped text", () => {
  const sheet = sheetOf(buildScheduleWorkbook(fixture()));
  assert.match(sheet, /<autoFilter ref="A5:P8"\/>/);
  assert.match(sheet, /<pane xSplit="2" ySplit="5" topLeftCell="C6"/);
  // Header, then a bold phase, then an indented task.
  assert.match(sheet, /<c r="A5" s="3" t="inlineStr"><is><t xml:space="preserve">WBS<\/t>/);
  assert.match(sheet, /<c r="B6" s="5" t="inlineStr"><is><t xml:space="preserve">Master Plan<\/t>/);
  assert.match(sheet, /<c r="B7" s="9" t="inlineStr"><is><t xml:space="preserve">Kick-off<\/t>/);
  assert.match(sheet, /<c r="E7" s="6"><v>46295<\/v><\/c>/);
  assert.match(sheet, /<c r="G7" s="13"><v>3<\/v><\/c>/);
  // Row 8: escaped markup, Thai names, figures, a fraction for the percent, and an empty forecast.
  assert.match(sheet, /Supplier &lt;confirmation&gt; &amp; PO/);
  assert.match(sheet, /Nattawat Hannok, สมชาย ใจดี/);
  assert.match(sheet, /<c r="I8" s="7"><v>1.5<\/v><\/c><c r="J8" s="7"><v>0.5<\/v><\/c><c r="K8" s="8"><v>0.4<\/v><\/c>/);
  assert.match(sheet, /<c r="O8" s="6"\/>/);
  assert.match(sheet, /รอ PO จากลูกค้า/);
  assert.match(sheet, /Progress: 12%/);
});

test("control characters never reach the XML", () => {
  const input = fixture(); input.rows[1].name = "Line\u0007one";
  assert.match(sheetOf(buildScheduleWorkbook(input)), /Lineone/);
});

test("the file name is safe on every desktop", () => {
  assert.equal(scheduleWorkbookName("PJ 26/0192", "2026-09-30"), "PJ-26-0192_schedule_2026-09-30.xlsx");
});
