import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(new URL("../lib/site-visit-workspace.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { canRecordSurvey, surveyAnswerComplete, fillReportEvidence, reportEvidence } = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("completed surveys are read-only even when the engineer assignment is still active", () => {
  for (const status of ["Completed", "Closed", "Cancelled", "Report Under Review"]) assert.equal(canRecordSurvey({ canExecute: true, status }), false);
  assert.equal(canRecordSurvey({ canExecute: true, status: "In Progress" }), true);
  assert.equal(canRecordSurvey({ canExecute: false, status: "In Progress" }), false);
});
test("checklist counts zero and not-applicable, but not blanks or invalid numeric text", () => {
  assert.equal(surveyAnswerComplete({ value: "", numeric: "0", na: false }), true);
  assert.equal(surveyAnswerComplete({ value: "", numeric: "", na: true }), true);
  assert.equal(surveyAnswerComplete({ value: "No", numeric: "", na: false }), true);
  for (const numeric of ["", " ", "NaN", "Infinity"]) assert.equal(surveyAnswerComplete({ value: " ", numeric, na: false }), false);
});
test("report draft gets existing evidence without overwriting the engineer's writing", () => {
  const draft = { visitSummary: "My summary", findingsSummary: "", engineerConclusion: "Keep this conclusion" };
  const merged = fillReportEvidence(draft, { visitSummary: "Source note", findingsSummary: "Measured on site" });
  assert.equal(merged.visitSummary, "My summary");
  assert.equal(merged.findingsSummary, "Measured on site");
  assert.equal(merged.engineerConclusion, "Keep this conclusion");
  assert.equal(draft.findingsSummary, "");
});
test("report evidence includes saved checklist measurements, with units, excluding N/A", () => {
  const evidence = reportEvidence({ executionNote: "Site note", findings: [{ title: "Alignment", detail: "Offset seen", measurementValue: 0, measurementUnit: "mm" }], checklist: [
    { prompt: "Cycle", numericValue: 12, itemUnit: "sec", isNotApplicable: false },
    { prompt: "Unused", numericValue: 99, itemUnit: "kg", isNotApplicable: true },
  ] });
  assert.match(evidence.measurementSummary, /Alignment: 0 mm/);
  assert.match(evidence.measurementSummary, /Cycle: 12 sec/);
  assert.doesNotMatch(evidence.measurementSummary, /Unused/);
  assert.match(evidence.findingsSummary, /Offset seen/);
});
