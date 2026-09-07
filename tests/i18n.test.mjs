import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const filename = path.resolve(relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loadedModule = { exports: {} };
  modules.set(filename, loadedModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith(".")
    ? load(path.resolve(path.dirname(filename), `${specifier}.ts`)) : require(specifier);
  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { translate, DICTIONARY, LanguageContext, applyDocumentLanguage, currentLocale } = load("app/system/i18n.ts");
const { LocalizedText } = load("app/system/LocalizedText.tsx");
const { SearchInput, Select, Field, PageHeader, Badge, HBarList } = load("app/system/ui.tsx");
const h = React.createElement;
function render(lang, child) {
  return renderToStaticMarkup(h(LanguageContext.Provider, {
    value: { lang, setLang() {}, t: text => translate(text, lang) },
  }, child));
}

test("static screen copy follows TH → JP → EN without adding DOM wrappers", () => {
  const child = h(LocalizedText, { text: "Save" });
  assert.equal(render("TH", child), "บันทึก");
  assert.equal(render("JP", child), "保存");
  assert.equal(render("EN", child), "Save");
});

test("required labels and authored language aliases follow the selected language", () => {
  for (const lang of ["TH", "JP", "EN"]) {
    assert.equal(translate("  customer name * ", lang), `${translate("Customer name", lang)} *`);
    assert.equal(translate("บันทึก", lang), translate("Save", lang));
  }
  assert.equal(translate("Save Thai Engineering Co., Ltd.", "JP"), "Save Thai Engineering Co., Ltd.");
});

test("dates see the selected locale immediately before the next React render", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { lang: "en" } } });
  try {
    for (const [lang, locale] of [["TH", "th-TH"], ["JP", "ja-JP"], ["EN", "en-GB"]]) {
      applyDocumentLanguage(lang);
      assert.equal(currentLocale(), locale);
      const date = new Date("2026-09-06T00:00:00Z");
      assert.equal(date.toLocaleDateString(currentLocale(), { timeZone: "UTC" }), date.toLocaleDateString(locale, { timeZone: "UTC" }));
    }
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else delete globalThis.document;
  }
});

test("shared labels and search hints change language while entered data stays intact", () => {
  const child = h("div", null,
    h(PageHeader, { title: "Estimate Cost" }),
    h(Field, { label: "Supplier" }, h("input", { defaultValue: "Supplier" })),
    h(SearchInput, { value: "CUSTOMER-123", onChange() {}, placeholder: "Search Price Library" }));
  for (const lang of ["TH", "JP", "EN"]) {
    const html = render(lang, child);
    assert.ok(html.includes(translate("Estimate Cost", lang)));
    assert.ok(html.includes(translate("Supplier", lang)));
    assert.ok(html.includes(`placeholder="${translate("Search Price Library", lang)}"`));
    assert.ok(html.includes(`aria-label="${translate("Clear search", lang)}"`));
    assert.ok(html.includes('value="CUSTOMER-123"'));
    assert.ok(html.includes('value="Supplier"'));
  }
});

test("translated filters retain canonical option values used by APIs", () => {
  for (const lang of ["TH", "JP", "EN"]) {
    const html = render(lang, h(Select, { label: "Status", value: "Active", options: ["Active", "Inactive"], onChange() {} }));
    assert.ok(html.includes(`value="Active" selected="">${translate("Active", lang)}</option>`));
    assert.ok(html.includes(`value="Inactive">${translate("Inactive", lang)}</option>`));
  }
});

test("dictionary has both translations and unknown business content is preserved", () => {
  for (const [key, entry] of Object.entries(DICTIONARY)) {
    assert.ok(entry.th?.trim(), `${key}: Thai missing`);
    assert.ok(entry.jp?.trim(), `${key}: Japanese missing`);
    assert.equal(translate(key, "EN"), entry.en ?? key);
  }
  for (const lang of ["TH", "JP", "EN"]) assert.equal(translate("ACME custom project 42", lang), "ACME custom project 42");
  for (const key of ["Refresh", "Project", "Total price"]) {
    assert.match(translate(key, "TH"), /[\u0E00-\u0E7F]/, `${key}: feature dictionaries must not overwrite shared Thai labels with English`);
  }
});

test("status badges keep their semantic colour in every language", () => {
  for (const lang of ["TH", "JP", "EN"]) {
    const html = render(lang, h(Badge, null, "Approved"));
    assert.ok(html.includes('class="badge green"'));
    assert.ok(html.includes(translate("Approved", lang)));
  }
});

test("Thai-authored screens can provide English and Japanese without changing canonical API values", () => {
  assert.equal(translate("สร้าง Task", "TH"), "สร้าง Task");
  assert.equal(translate("สร้าง Task", "EN"), "Create task");
  assert.equal(translate("สร้าง Task", "JP"), "タスクを作成");
});

test("chart labels use the selected language", () => {
  for (const lang of ["TH", "JP", "EN"]) {
    const html = render(lang, h(HBarList, { data: [{ label: "Estimated Cost", value: 10 }] }));
    assert.ok(html.includes(translate("Estimated Cost", lang)));
  }
});

test("every literal tab label has complete TH, EN and JP behavior", () => {
  const roots = ["app/system/screens", "app/system/production"];
  const tsxFiles = ["app/system/App.tsx", "app/system/ProductionApp.tsx", ...roots.flatMap((root) => readdirSync(root)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => path.join(root, file)))];
  const labels = new Set();

  for (const filename of tsxFiles) {
    const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = new Map();
    function index(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const values = declarations.get(node.name.text) ?? [];
        values.push(node.initializer);
        declarations.set(node.name.text, values);
      }
      ts.forEachChild(node, index);
    }
    index(source);
    function collect(node, seen = new Set()) {
      if (ts.isPropertyAssignment(node) && node.name.getText().replaceAll('"', "") === "label" && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
        labels.add(node.initializer.text);
      }
      if (ts.isIdentifier(node) && declarations.has(node.text) && !seen.has(node.text)) {
        const next = new Set(seen).add(node.text);
        for (const initializer of declarations.get(node.text)) collect(initializer, next);
        return;
      }
      ts.forEachChild(node, (child) => collect(child, seen));
    }
    function visit(node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === "Tabs") {
        for (const attr of node.attributes.properties) {
          if (ts.isJsxAttribute(attr) && attr.name.text === "tabs" && attr.initializer && ts.isJsxExpression(attr.initializer) && attr.initializer.expression) collect(attr.initializer.expression);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }

  const missing = [];
  for (const label of labels) {
    if (!DICTIONARY[label]) missing.push(label);
    else {
      assert.notEqual(translate(label, "JP"), label, `${label}: Japanese tab label unchanged`);
      if (/[\u0E00-\u0E7F]/.test(label)) assert.ok(DICTIONARY[label].en?.trim(), `${label}: English tab label missing`);
      else assert.notEqual(translate(label, "TH"), label, `${label}: Thai tab label unchanged`);
    }
  }
  assert.deepEqual(missing.sort(), []);
  // Report tabs now use their scoped document/workspace translator and are
  // exercised by report-document-form tests instead of this literal audit.
  assert.ok(labels.size >= 70, `expected broad literal tab coverage, found ${labels.size}`);
});

test("the Thai-authored resource workspace has no bare Thai JSX copy", () => {
  const filename = "app/system/production/ResourceTaskWorkspace.tsx";
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bare = [];
  function visit(node) {
    if (ts.isJsxText(node) && /[\u0E00-\u0E7F]/.test(node.text)) {
      const parent = node.parent;
      const tag = ts.isJsxElement(parent) ? parent.openingElement.tagName.getText() : "";
      if (tag !== "LocalizedText") bare.push(node.text.trim());
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(bare, []);
});

test("the production login has complete TH and JP copy instead of a mixed-language footer", () => {
  const source = readFileSync("app/system/ProductionApp.tsx", "utf8");
  const phrases = [
    "IoT team workspace for inquiries, estimates, projects and materials with controlled access and an audit trail.",
    "Temporary test access",
    "For temporary UAT use. The access code stays only in this browser session, and Production does not enable this mode.",
  ];
  for (const phrase of phrases) {
    assert.notEqual(translate(phrase, "TH"), phrase);
    assert.notEqual(translate(phrase, "JP"), phrase);
  }
  assert.match(source, /t\(teamTestMode \? "Temporary test access" : "Production access"\)/);
  assert.doesNotMatch(source, /ใช้สำหรับ UAT ชั่วคราวเท่านั้น รหัสจะเก็บเฉพาะ session/);
});
