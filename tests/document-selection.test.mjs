import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as navigation from "../lib/estimate-navigation.ts";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

test("Inquiry list, create and detail events report the selected record to the shell", () => {
  const source = read("app/system/production/InquiryScreens.tsx");
  const ast = ts.createSourceFile("InquiryScreens.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entry = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ProductionInquiries");
  let state;
  const useState = initial => { state ??= initial(); return [state, next => { state = next; }]; };
  const runtime = { jsx: (type, props) => ({ type, props }) };
  const mod = { exports: {} };
  new Function("require", "exports", "useState", "InquiryList", "InquiryCreate", "InquiryDetailScreen", compile(entry.getText(ast)))(
    () => runtime, mod.exports, useState, "list", "create", "detail",
  );
  const selected = [];
  const render = () => mod.exports.ProductionInquiries({ onSelectInquiry: id => selected.push(id) });
  render().props.onOpen(42);
  assert.equal(render().props.id, 42);
  render().props.onBack();
  assert.equal(render().type, "list");
  render().props.onCreate();
  render().props.onCreated(43);
  assert.equal(render().props.id, 43);
  assert.deepEqual(selected, [42, null, 43]);
});

test("Estimate selection and return to list report IDs; tab changes keep the current document", () => {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const react = {
    useCallback: callback => callback,
    useEffect: effect => effects.push(effect),
    useState(initial) {
      const index = cursor++;
      slots[index] ??= initial;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
  };
  const mod = { exports: {} };
  new Function("require", "exports", compile(read("app/system/production/use-estimate-navigation.ts")))(
    name => name === "react" ? react : navigation, mod.exports,
  );
  const selected = [];
  const render = () => { cursor = 0; return mod.exports.useEstimateNavigation(7, 24, id => selected.push(id)); };
  render().selectEstimate(42);
  assert.equal(render().estimateId, 42);
  render().selectTab("manhour");
  assert.equal(render().estimateId, 42);
  assert.equal(render().tab, "manhour");
  render().selectEstimate(null);
  assert.equal(render().estimateId, null);
  assert.deepEqual(selected, [42, null]);
});
