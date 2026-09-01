import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
let apiCalls = 0;
function load(relative) {
  const filename = path.resolve(relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} };
  modules.set(filename, mod);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = specifier => {
    if (specifier === "../api-client") return { apiRequest() { apiCalls++; throw new Error("Rendering must not fetch or save data"); }, ApiClientError: Error };
    if (!specifier.startsWith(".")) return require(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const resolved = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
    assert.ok(resolved, `Missing dependency: ${specifier}`);
    return load(resolved);
  };
  new Function("require", "module", "exports", compiled)(localRequire, mod, mod.exports);
  return mod.exports;
}
const { EndUserCompanyField, EndUserEditModal, canEditEndUser } = load("app/system/production/EndUserCompanyField.tsx");
const { CustomerEntryModal } = load("app/system/production/InquiryCustomerFields.tsx");
const h = React.createElement;
const noop = () => {};
const customers = Object.freeze([
  Object.freeze({ id: 11, code: "PARTNER", name: "Contracting partner" }),
  Object.freeze({ id: 22, code: "FACTORY", name: "Factory end user" }),
]);
const bootstrap = { customers, permissions: ["intake.write"] };
const pickerProps = { bootstrap, customerId: 11, value: null, onChange: noop, refreshBootstrap: async () => {}, notify: noop };
const render = (component, props) => renderToStaticMarkup(h(component, props));

test("unknown end user stays unselected even when the contracting company is selected", () => {
  let changes = 0;
  const html = render(EndUserCompanyField, { ...pickerProps, onChange() { changes++; } });
  assert.match(html, /<option value="" selected="">/);
  assert.doesNotMatch(html, /<option value="11" selected="">/);
  assert.match(html, /Same customer/);
  assert.equal(changes, 0);
  assert.equal(apiCalls, 0);
});

test("editing keeps contracting customer and actual end user in distinct roles without mutating the record", () => {
  const record = Object.freeze({ id: 1, customerId: 11, customerName: "Contracting partner", endUserCustomerId: 22, endUserName: "Factory end user", rowVersion: "AAAAAQ==", status: "Planning" });
  const html = render(EndUserEditModal, { kind: "projects", record, bootstrap, refreshBootstrap: async () => {}, notify: noop, onClose: noop, onSaved: async () => {}, reloadRecord: async () => record });
  assert.match(html, /Contracting customer: Contracting partner/);
  assert.match(html, /<option value="22" selected="">FACTORY — Factory end user<\/option>/);
  assert.doesNotMatch(html, /<option value="11" selected="">/);
  assert.equal(record.customerId, 11);
  assert.equal(record.endUserCustomerId, 22);
  assert.equal(apiCalls, 0);
});

test("company-only creation exposes company data while the regular customer form retains its contact fields", () => {
  const props = { kind: "customer", customers, directory: null, onClose: noop, onRefresh: async () => {}, onExistingCustomer: noop, onExistingContact: noop, onCustomerSaved: noop, onContactSaved: noop };
  const companyOnly = render(CustomerEntryModal, { ...props, companyOnly: true });
  const regular = render(CustomerEntryModal, props);
  for (const field of ["ชื่อบริษัท ภาษาไทย", "Company name English", "会社名 日本語", "รหัสลูกค้า", "ที่อยู่ลูกค้า"]) assert.ok(companyOnly.includes(`aria-label="${field}"`));
  for (const field of ["ชื่อผู้ติดต่อหลัก ภาษาไทย", "Primary contact English", "Primary contact Japanese", "อีเมลผู้ติดต่อ", "เบอร์โทรผู้ติดต่อ"]) {
    assert.ok(!companyOnly.includes(`aria-label="${field}"`));
    assert.ok(regular.includes(`aria-label="${field}"`));
  }
  assert.equal(apiCalls, 0);
});

test("company creation is hidden without its scoped permission and an unavailable selected company remains visible", () => {
  const html = render(EndUserCompanyField, { ...pickerProps, bootstrap: { customers, permissions: ["inquiry.write"] }, value: 999 });
  assert.doesNotMatch(html, /New company/);
  assert.match(html, /<option value="999" selected="">[^<]*Selected company #999<\/option>/);
  assert.doesNotMatch(html, /<option value="" selected="">/);
});

test("closed, cancelled and rejected records keep editing controls disabled", () => {
  for (const status of ["Closed", "Cancelled", "Canceled", "Rejected", " CLOSED "]) assert.equal(canEditEndUser(status), false);
  assert.equal(canEditEndUser("Planning"), true);
  const record = { id: 1, customerId: 11, customerName: "Contracting partner", endUserCustomerId: 22, rowVersion: "AAAAAQ==", status: "Closed" };
  const html = render(EndUserEditModal, { kind: "inquiries", record, bootstrap, refreshBootstrap: async () => {}, notify: noop, onClose: noop, onSaved: async () => {}, reloadRecord: async () => record });
  assert.match(html, /<select[^>]*disabled=""/);
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.equal(apiCalls, 0);
});
