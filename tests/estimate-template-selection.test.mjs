import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  estimateApplyOwnerId,
  estimateForbiddenSections,
  moduleTemplateApplyBlocker,
} from "../lib/estimate-ux.ts";

/* Applying a module template or a labor package is a bulk line create, and the
   API authorises it exactly like a hand-typed line. These cases pin the two
   rules a picker has to honour before it posts: who the new lines belong to,
   and which estimate sections the template is allowed to write. */

const elevated = { canEditAllSections: true, editableSections: [] };
const assignedToElectrical = { canEditAllSections: false, editableSections: ["03"] };

const ESTIMATE_OWNER = 7;
const ASSIGNED_ENGINEER = 12;

test("an assigned engineer applies a template in their own name, not the estimate owner's", () => {
  assert.equal(estimateApplyOwnerId(assignedToElectrical, ESTIMATE_OWNER, ASSIGNED_ENGINEER), ASSIGNED_ENGINEER);
});

test("the estimate owner, an engineering manager and an administrator keep writing for the estimate owner", () => {
  assert.equal(estimateApplyOwnerId(elevated, ESTIMATE_OWNER, ESTIMATE_OWNER), ESTIMATE_OWNER);
  assert.equal(estimateApplyOwnerId(elevated, ESTIMATE_OWNER, 99), ESTIMATE_OWNER);
});

test("forbidden sections are reported once, in the order the template lists them", () => {
  assert.deepEqual(estimateForbiddenSections(assignedToElectrical, ["03", "01", "03", "02", "01"]), ["01", "02"]);
  assert.deepEqual(estimateForbiddenSections(assignedToElectrical, ["03", "03"]), []);
  assert.deepEqual(estimateForbiddenSections(elevated, ["01", "02", "10"]), []);
});

const blocker = (overrides = {}) => moduleTemplateApplyBlocker({
  status: "Active",
  lineSections: ["03"],
  canEditCostItems: true,
  capabilities: assignedToElectrical,
  ...overrides,
});

test("a template the estimator may actually apply reports no blocker", () => {
  assert.equal(blocker(), null);
  assert.equal(blocker({ capabilities: elevated, lineSections: ["01", "06"] }), null);
});

test("a template that cannot be applied says why before the estimator fills anything in", () => {
  assert.match(blocker({ canEditCostItems: false }), /cannot add cost lines/i);
  assert.match(blocker({ status: "Retired" }), /retired/i);
  assert.match(blocker({ status: "Draft" }), /published templates/i);
  assert.match(blocker({ lineSections: [] }), /no lines/i);
});

test("a multi-discipline template is blocked on the line sections, not on its primary discipline", () => {
  const message = blocker({ lineSections: ["03", "01"] });
  assert.match(message, /section 01/);
  assert.doesNotMatch(message, /section 03/);
});

/* Source guard. Both library pickers add lines without an owner field, so the
   estimator has no way to correct a wrong owner: a regression here is invisible
   until the API answers 403 on a form that has already been filled in. The
   module template picker is one function inside a large screen file, so it is
   read by name rather than by scanning the whole file. */

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function functionSource(source, declaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${declaration} is gone — update this guard with it.`);
  const next = source.indexOf("\nfunction ", start + declaration.length);
  return source.slice(start, next === -1 ? source.length : next);
}

const pickerSources = () => [
  ["ApplyModuleTemplateModal", functionSource(readSource("app/system/production/EstimateScreens.tsx"), "function ApplyModuleTemplateModal(")],
  ["ApplyLaborPackageModal", readSource("app/system/production/LaborPackagePicker.tsx")],
];

test("no estimate library picker posts the estimate owner as the new line owner", () => {
  for (const [name, source] of pickerSources()) {
    for (const [index, line] of source.split(/\r?\n/).entries()) {
      if (!/\bownerId:\s*workspace\.header\.ownerId/.test(line)) continue;
      assert.fail(`${name} line ${index + 1} sends the estimate owner as the new line owner; use estimateApplyOwnerId().`);
    }
  }
});

test("both library applies resolve the owner through the shared rule", () => {
  for (const [name, source] of pickerSources()) {
    assert.ok(source.includes("estimateApplyOwnerId("), `${name} no longer resolves the apply owner through estimateApplyOwnerId().`);
  }
});
