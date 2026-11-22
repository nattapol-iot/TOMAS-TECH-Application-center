import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const plan = read("app/system/production/PlanningPricingScreens.tsx");
const gantt = read("app/system/production/GanttChart.tsx");
const i18n = read("app/system/i18n.ts");

test("a plan row that cannot be deleted keeps a dimmed bin that says why (SUP-2026-00014)", () => {
  const block = plan.slice(plan.indexOf("const deleteBlock"), plan.indexOf("const deleteRow"));
  assert.ok(block.length > 300, "deleteBlock / binFor moved");
  for (const key of ["Plan.deleteOthers", "Plan.deleteProgress", "Plan.deleteDetail", "Plan.deletePending", "Plan.deleteResourcePlan", "Plan.deleteFiltered"])
    assert.match(block, new RegExp(`"${key.replace(".", "\\.")}"`), key);
  // A blocked row explains instead of deleting; a reader who cannot change the plan sees no bin at all.
  assert.match(block, /if \(block\) \{\s*const reason = uiText\(block\);\s*return \{ label: uiText\("Plan\.deleteRow"\), reason, onRemove: \(\) => notify\(/);
  assert.match(block, /if \(!changesPlan \|\| movePending \|\| saving \|\| draftBusy\) return undefined;/);
  // The chart marks the blocked bin and shows the reason as its tooltip.
  assert.match(gantt, /remove\?: \{ label: string; onRemove: \(\) => void; reason\?: string \}/);
  assert.match(gantt, /className=\{`gantt-remove\$\{row\.remove\.reason \? " blocked" : ""\}`\}/);
  assert.match(gantt, /title=\{row\.remove\.reason \?\? row\.remove\.label\}/);
  for (const key of ["Plan.deletePending", "Plan.deleteResourcePlan", "Plan.deleteFiltered"]) {
    const line = i18n.split("\n").find((entry) => entry.includes(`"${key}"`));
    assert.ok(line && /en: "/.test(line) && /th: "/.test(line) && /jp: "/.test(line), `${key} in three languages`);
  }
});
