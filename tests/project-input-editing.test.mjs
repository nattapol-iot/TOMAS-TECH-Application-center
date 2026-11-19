import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { progressForStatus } from "../backend-node/src/project-lifecycle.ts";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (source) => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

test("project and task percent inputs preserve clearing, then typing 90, and send numeric 90", () => {
  for (const [path, marker, setter] of [
    ["app/system/production/CoreScreens.tsx", 'set("progress",', "project"],
    ["app/system/production/PlanningPricingScreens.tsx", "changePercent(event.target", "task"],
  ]) {
    const source = read(path);
    const file = ts.createSourceFile("screen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let handler;
    function visit(node) {
      if (ts.isJsxAttribute(node) && node.name.getText(file) === "onChange" && node.getText(file).includes(marker))
        handler = node.initializer.expression.getText(file);
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.ok(handler, path);
    let value = 50;
    const change = new Function("set", "changePercent", `return (${handler});`)(
      (key, next) => { assert.equal(key, "progress"); value = next; }, (next) => { value = next; },
    );
    change({ target: { value: "" } });
    assert.equal(value, "", "clearing must not insert a zero");
    change({ target: { value: "9" } });
    assert.equal(value, 9);
    change({ target: { value: "90" } });
    assert.equal(value, 90);
    const payloadExpression = setter === "project"
      ? /progress: (Number\(form.progress\)),/.exec(source)?.[1]
      : /percentComplete: (Number\(percent\)),/.exec(source)?.[1];
    assert.ok(payloadExpression, "numeric save payload");
    const saved = new Function("form", "percent", `return ${payloadExpression};`)({ progress: value }, value);
    assert.equal(saved, 90);
    assert.equal(progressForStatus("In Progress", saved), 90);
  }
});

// Small hook harness: exercise the actual DateInput handlers, including the native input event it emits.
function dateHarness(initial, withTime = false) {
  const state = [], refs = [];
  let stateIndex = 0, refIndex = 0, tree, value = initial;
  const changes = [];
  const hooks = {
    useState: (initialValue) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initialValue;
      return [state[index], (next) => { state[index] = next; }];
    },
    useRef: (initialValue) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initialValue }),
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compile(read("app/system/DateInput.tsx")))(
    (id) => id === "react" ? hooks : id === "./i18n" ? { useT: () => (key) => key }
      : id === "./ui" ? { Icon: () => null } : require(id), module, module.exports,
  );
  class NativeInput {
    get value() { return this.iso; }
    set value(next) { this.iso = next; }
    dispatchEvent() { tree.props.children[2].props.onChange({ target: this }); }
  }
  const native = new NativeInput();
  function render() {
    stateIndex = 0; refIndex = 0;
    tree = module.exports.DateInput({ value, withTime, onChange: (event) => { value = event.target.value; changes.push(value); } });
    tree.props.children[2].props.ref.current = native;
    return tree.props.children[0].props;
  }
  const previous = globalThis.HTMLInputElement;
  globalThis.HTMLInputElement = NativeInput;
  return { render, changes, restore: () => { globalThis.HTMLInputElement = previous; } };
}

test("deleting a day/month digit keeps the exact text; complete input saves without reformatting mid-edit", () => {
  const h = dateHarness("2026-11-13");
  try {
    h.render().onChange({ target: { value: "1/11/2026" } });
    assert.equal(h.render().value, "1/11/2026");
    assert.deepEqual(h.changes, []);
    h.render().onChange({ target: { value: "26/11/2026" } });
    assert.equal(h.render().value, "26/11/2026");
    assert.deepEqual(h.changes, ["2026-11-26"]);
    h.render().onChange({ target: { value: "26/1/2026" } });
    assert.equal(h.render().value, "26/1/2026");
    assert.equal(h.changes.length, 1);
    h.render().onBlur({});
    assert.equal(h.render().value, "26/01/2026");
    assert.equal(h.changes.at(-1), "2026-01-26");
    h.render().onChange({ target: { value: "31/02/2026" } });
    h.render().onBlur({});
    assert.equal(h.render().value, "31/02/2026");
    assert.equal(h.changes.at(-1), "2026-01-26");
    h.render().onChange({ target: { value: "" } });
    assert.equal(h.render().value, "");
    assert.equal(h.changes.at(-1), "");
  } finally { h.restore(); }
});

test("datetime editing preserves incomplete hours until blur", () => {
  const h = dateHarness("2026-11-13T09:30", true);
  try {
    h.render().onChange({ target: { value: "13/11/2026 9:30" } });
    assert.equal(h.render().value, "13/11/2026 9:30");
    assert.deepEqual(h.changes, []);
    h.render().onBlur({});
    assert.equal(h.render().value, "13/11/2026 09:30");
  } finally { h.restore(); }
});
