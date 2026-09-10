import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function loadPure(file) {
  const mod = { exports: {} };
  const output = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", output)(require, mod, mod.exports);
  return mod.exports;
}

const { selectPerformancePulseCards } = loadPure("app/system/production/performance-pulse.ts");
const insight = (reasonCode, kind, facts, source = null) => ({
  reasonCode, kind, facts, source, areaCode: "DELIVERY", confidence: "HIGH", priority: 10,
});

test("Pulse presents one strength, one supported attention item and one controllable next step", () => {
  const cards = selectPerformancePulseCards([
    insight("DELIVERY_EARLY", "STRENGTH", { earlyProjectCount: 1, deliveredProjectCount: 3 }, { type: "PROJECT", id: 22, label: "PJ260022" }),
    insight("DELIVERY_REVIEW", "ATTENTION", { overdueCount: 2, dueCount: 8 }, { type: "TASK", id: 7, label: "Commissioning" }),
    insight("TECHNICAL_CONTRIBUTION", "STRENGTH", { completedCount: 9 }),
  ], "TH");
  assert.equal(cards.length, 3);
  assert.deepEqual(cards.map(card => card.kind), ["strength", "attention", "next"]);
  assert.match(cards[0].headline, /ก่อนกำหนด.*1\/3/);
  assert.match(cards[1].headline, /2\/8.*เลยกำหนด/);
  assert.match(cards[1].body, /ไม่ได้สรุปสาเหตุ/);
  assert.equal(cards[2].source.label, "Commissioning");
});

test("assigned Issues are described as handling or workload and never as employee-caused defects", () => {
  const strong = selectPerformancePulseCards([
    insight("ISSUE_HANDLING_STRONG", "STRENGTH", { closedIssueCount: 4, issueCount: 5 }),
  ], "EN");
  assert.match(strong[0].headline, /4\/5 assigned Issues closed/);
  assert.match(strong[0].body, /without attributing who caused them/i);

  const review = selectPerformancePulseCards([
    insight("ISSUE_WORKLOAD_REVIEW", "ATTENTION", { openIssueCount: 3, issueCount: 6 }),
  ], "TH");
  const copy = review.map(card => `${card.headline} ${card.body}`).join(" ");
  assert.match(copy, /ภาระงาน|รับผิดชอบ/);
  assert.doesNotMatch(copy, /งานของคุณมีปัญหา|คุณทำให้เกิด|ผลงานแย่/);
});

test("Sales Pulse rewards distinct workflow coverage rather than meeting volume", () => {
  const cards = selectPerformancePulseCards([
    insight("CUSTOMER_FOLLOWUP_COVERED", "STRENGTH", { inquiriesWithMeetingCount: 4, activeInquiryCount: 5 }, { type: "INQUIRY", id: 12, label: "INQ260012" }),
    insight("HANDOVER_REVIEW", "ATTENTION", { handoverCount: 1, approvedCount: 2 }, { type: "INQUIRY", id: 19, label: "INQ260019" }),
  ], "EN");
  assert.match(cards[0].headline, /4\/5 active Inquiries/);
  assert.match(cards[0].body, /coverage, not raw meeting volume/);
  assert.match(cards[1].headline, /1\/2 approved opportunities handed over/);
  assert.match(cards[2].body, /Link an approved opportunity/);
});

test("forecast stays context-only and never invents accuracy", () => {
  const cards = selectPerformancePulseCards([
    insight("FORECAST_CONTEXT", "CONTEXT", { approvedCount: 2, cancelledCount: 1 }),
  ], "JP");
  assert.deepEqual(cards.map(card => card.kind), ["context", "next"]);
  assert.match(cards[0].headline, /承認2件.*キャンセル1件/);
  assert.match(cards[0].body, /Forecast精度は算出しません/);
});

test("unknown or empty facts never become generic praise or a no-problem claim", () => {
  assert.deepEqual(selectPerformancePulseCards([], "TH"), []);
  assert.deepEqual(selectPerformancePulseCards([
    insight("NO_ISSUES_RECORDED", "STRENGTH", { issueCount: 0 }),
  ], "TH"), []);
});

test("the same structured reasons have complete Thai, English and Japanese presentation", () => {
  const input = [insight("DELIVERY_ON_TIME", "STRENGTH", { onTimeCount: 8, dueCount: 9 })];
  const copies = ["TH", "EN", "JP"].map(language => selectPerformancePulseCards(input, language).map(card => `${card.headline} ${card.body}`).join(" "));
  assert.ok(copies.every(copy => copy.length > 40));
  assert.equal(new Set(copies).size, 3);
  assert.match(copies[0], /8\/9/);
  assert.match(copies[1], /8\/9/);
  assert.match(copies[2], /9件中8件/);
});
