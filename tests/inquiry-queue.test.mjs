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
  assert.equal(inquiryNextAction("Approved", true), "follow_sales");
  assert.equal(inquiryNextAction("Cancelled", false), "closed");
  assert.equal(inquiryNextAction("Estimating", true, "Cancelled"), "review_cancellation");
  assert.equal(inquiryNextAction("New", false, "Deleted"), "restore_estimate");
  assert.equal(inquiryNextAction("Cancelled", true, "Cancelled"), "closed");
});


test("approved costs follow sales evidence and project handover independently", () => {
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"PROPOSAL"}), "verify_sales");
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"PROPOSAL",proposalSentOn:"2026-09-24"}), "follow_customer");
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"WON",wonOn:"2026-09-24"}), "handover_project");
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"WON"}), "verify_order");
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"WON",hasProject:true}), "project_created");
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"LOST"}), "review_cancellation");
  assert.equal(inquiryNextAction("Approved", true, "Approved", {stage:"ON_HOLD"}), "follow_sales");
  assert.equal(inquiryNextAction("Estimating", true, "Estimating", {stage:"PROPOSAL"}), "complete_costs");
});


test("Won never bypasses cost approval and an existing project remains the next destination", () => {
  for (const status of ["Draft", "Engineering Input", "Engineering Review", "Revision Required", null]) {
    assert.equal(inquiryNextAction("Estimating", true, status, {stage:"WON",wonOn:"2026-09-29"}), "await_cost_approval");
    assert.equal(inquiryNextAction("Approved", true, status, {stage:"WON",wonOn:"2026-09-29"}), "await_cost_approval");
  }
  assert.equal(inquiryNextAction("Approved", true, "Locked", {stage:"WON",wonOn:"2026-09-29"}), "handover_project");
  assert.equal(inquiryNextAction("Estimating", true, "Locked", {stage:"WON",wonOn:"2026-09-29"}), "handover_project");
  assert.equal(inquiryNextAction("Estimating", true, "Revision Required", {stage:"WON",hasProject:true}), "project_created");
});
