import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/inquiry-queue.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { defaultInquiryQueueScope, inquiryNextAction } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("engineers start from owned inquiries while managers retain the team queue", () => {
  assert.equal(defaultInquiryQueueScope("Engineer"), "mine");
  assert.equal(defaultInquiryQueueScope("Engineering Manager"), "team");
  assert.equal(defaultInquiryQueueScope("Admin"), "team");
  assert.equal(defaultInquiryQueueScope("Sales Engineer"), "team");
});

test("next action follows the recorded workflow state", () => {
  assert.equal(inquiryNextAction("New", false), "review_inputs");
  assert.equal(inquiryNextAction("New", true), "complete_costs");
  assert.equal(inquiryNextAction("Waiting Supplier Price", true), "follow_supplier");
  assert.equal(inquiryNextAction("Estimate Completed", true), "submit_review");
  assert.equal(inquiryNextAction("Engineering Review", true), "engineering_review");
  assert.equal(inquiryNextAction("Approved", true), "handover_project");
  assert.equal(inquiryNextAction("Cancelled", false), "closed");
  assert.equal(inquiryNextAction("Estimating", true, "Cancelled"), "review_cancellation");
  assert.equal(inquiryNextAction("New", false, "Deleted"), "restore_estimate");
  assert.equal(inquiryNextAction("Cancelled", true, "Cancelled"), "closed");
});
