import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function loadModule(file) {
  if (cache.has(file)) return cache.get(file);
  const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} }; cache.set(file, mod.exports);
  new Function("require", "module", "exports", compiled)(name => name.endsWith(".css") ? {} : name === "./report-locale" ? loadModule("app/system/production/report-locale.ts") : require(name), mod, mod.exports);
  return mod.exports;
}
const mod = { exports: loadModule("app/system/production/ReportDocumentForm.tsx") };
const Form = mod.exports.ReportDocumentForm;
const fields = (...keys) => keys.map(key => ({ key, label: key }));
const sections = [
  { key: "context", label: "Context", fields: fields("contact", "start", "end") },
  { key: "overview", label: "Scope", fields: fields("objective", "summary") },
  { key: "scenarios", label: "Scenarios", repeat: true, fields: [...fields("scenario", "step", "expected", "actual"), { key: "result", label: "Result", options: ["PASS", "FAIL", "PARTIAL"] }] },
  { key: "punchlist", label: "Punchlist", repeat: true, fields: fields("issue", "owner") },
  { key: "evidence", label: "Evidence", repeat: true, fields: [{ key: "url", label: "Evidence URL", type: "url" }] },
];
const render = props => renderToStaticMarkup(React.createElement(Form, { reportType: "UAT", locale: "en", sections, ...props }));

test("blank editable report renders a usable table without creating records or preselecting a result", () => {
  const body = Object.freeze({});
  let writes = 0;
  const html = render({ body, onChange() { writes++; } });
  assert.ok(html.includes("<table"));
  assert.ok(html.includes('aria-label="UAT sheets"'));
  assert.ok(!html.includes('value="PASS" selected'));
  assert.ok(!html.includes('selected="" value="PASS"'));
  assert.equal(writes, 0);
  assert.deepEqual(body, {});
});

test("readonly document includes every UAT sheet and long evidence while rejecting unsafe links", () => {
  const longResult = "Observed evidence ".repeat(200);
  const body = {
    context: { contact: "Actual contact" }, overview: { objective: "Purpose", summary: "Summary" },
    scenarios: [{ scenario: "Scenario", step: "Step", expected: "Expected", actual: longResult, result: "FAIL" }],
    punchlist: [{ issue: "Unresolved issue", owner: "Responsible person" }],
    evidence: [{ url: "javascript:alert(1)" }], preservedExtension: { source: "keep" },
  };
  const before = JSON.stringify(body);
  const html = render({ body, readOnly: true });
  for (const value of ["Actual contact", "Unresolved issue", longResult.trim(), "FAIL"]) assert.ok(html.includes(value));
  assert.ok(!html.includes("<textarea"));
  assert.ok(!html.includes("<select"));
  assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes("hidden="));
  assert.equal(JSON.stringify(body), before);
});

test("reusable template rendering exposes only allowed instructions, never customer or captured results", () => {
  const body = { context: { contact: "PRIVATE CONTACT" }, scenarios: [{ scenario: "Reusable procedure", expected: "Expected output", actual: "PRIVATE RESULT", result: "PASS" }] };
  const html = render({ body, readOnly: true, reusableOnly: true, sections: [{ key: "scenarios", label: "Tests", repeat: true, fields: fields("scenario", "expected") }] });
  assert.ok(html.includes("Reusable procedure"));
  assert.ok(html.includes("Expected output"));
  assert.ok(!html.includes("PRIVATE CONTACT"));
  assert.ok(!html.includes("PRIVATE RESULT"));
  assert.ok(!html.includes("Ticket / CR"));
});

test("report language controls every sheet in editable and print views while preserving entered facts", () => {
  const body = {context:{contact:"บริษัทจริง / Customer 日本"}, overview:{objective:"ข้อมูลที่ผู้ใช้กรอก", summary:"User text"}, scenarios:[{scenario:"Actual scenario", step:"Step", expected:"Expected", actual:"Actual", result:"FAIL"}]};
  for (const readOnly of [false, true]) {
    for (const [locale, expected, rejected] of [["th", "หัวข้อทดสอบ", "試験項目"], ["en", "scenario", "หัวข้อทดสอบ"], ["ja", "試験項目", "หัวข้อทดสอบ"]]) {
      const html = render({body, readOnly, locale});
      assert.ok(html.includes(`lang="${locale}"`));
      assert.ok(html.includes(expected)); assert.ok(!html.includes(rejected));
      assert.ok(html.includes("บริษัทจริง / Customer 日本")); assert.ok(html.includes("ข้อมูลที่ผู้ใช้กรอก"));
      if (!readOnly) assert.ok(html.includes('value="FAIL"')); // API enum remains canonical in every language.
      if (readOnly && locale === "ja") assert.ok(html.includes("不合格"));
    }
  }
  assert.equal(body.scenarios[0].result,"FAIL");
});

test("Service form translates section names and does not leak Thai scaffolding into English or Japanese", () => {
  const serviceSections = [{key:"context",label:"Work details",fields:fields("site", "start", "end")},{key:"overview",label:"Scope",fields:fields("objective","summary")},{key:"service",label:"Service",fields:fields("symptom","action","verification","testResult","backup","rollback")}];
  for (const readOnly of [true, false]) for (const locale of ["en", "ja"]) {
    const html = render({reportType:"SERVICE",sections:serviceSections,body:{},readOnly,locale});
    assert.doesNotMatch(html, /[\u0E00-\u0E7F]/);
    assert.ok(html.includes(locale === "en" ? "Problem &amp; resolution" : "問題と解決内容"));
  }
});

test("report timestamp uses the saved document locale and Bangkok time", () => {
  const {reportTimestamp} = loadModule("app/system/production/report-locale.ts");
  assert.match(reportTimestamp("en", "2026-09-06T00:00:00Z"), /2026/);
  assert.match(reportTimestamp("ja", "2026-09-06T00:00:00Z"), /2026/);
  assert.match(reportTimestamp("th", "2026-09-06T00:00:00Z"), /2569/);
});
