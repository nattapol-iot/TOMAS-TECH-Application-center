import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/inquiry-visit-flow.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { seedVisitRequest, visitNextAction } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("request uses the existing inquiry and keeps site-review inputs independent", () => {
  const base = { customerId: 99, contact: { contactPhone: "", contactEmail: "" }, requirement: { expectedResult: "" }, machine: { safetyRequirement: "" }, visitTypeIds: [] };
  const inquiry = { id: 42, customerId: 7, projectName: "Conveyor", rfqNo: "RFQ-1", priority: "High", dueDate: "2026-09-20", targetDelivery: null, contact: "Customer contact", siteLocation: "Factory A", requirement: "Inspect conveyor", scopeSummary: "Control retrofit", background: "Existing PLC", special: "Shutdown only", technical: "Drawing required" };
  const before = structuredClone(base);
  const result = seedVisitRequest(base, inquiry, 12);
  assert.equal(result.relatedInquiryId, 42);
  assert.equal(result.customerId, 7);
  assert.equal(result.salesOwnerId, 12);
  assert.equal(result.subject, "Conveyor");
  assert.equal(result.requirement.problemStatement, "Inspect conveyor");
  assert.equal(result.contact.siteName, "Factory A");
  assert.equal(result.requirement.expectedResult, "");
  assert.equal(result.machine.safetyRequirement, "");
  assert.deepEqual(base, before);
});

test("closed visit prompts follow-up even if preparation still says Scheduled", () => {
  assert.match(visitNextAction({ status: "Scheduled", visitStatus: "Closed" }), /ดูผลสำรวจ/);
  assert.match(visitNextAction({ status: "Scheduled", visitStatus: "Report Pending" }), /ส่งรายงาน/);
  assert.match(visitNextAction({ status: "Ready to Schedule", visitStatus: null }), /นัดหมาย/);
  assert.match(visitNextAction({ status: "Cancelled", visitStatus: "Closed" }), /ยกเลิก/);
});

test("nullable customer reference does not invent a reference on the request", () => {
  const result = seedVisitRequest({ contact: {}, requirement: {} }, { rfqNo: null }, 1);
  assert.equal(result.customerReferenceNo, undefined);
});
