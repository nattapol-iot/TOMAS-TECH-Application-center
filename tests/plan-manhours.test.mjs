import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { plannedShare, remainingForRow, remainingManDays } from "../lib/manhour-budget.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("remaining man-days: budget less plan, negative when over, nothing without a budget", () => {
  assert.equal(remainingManDays({ budgetManDays: 120, plannedManDays: 85.25 }), 34.75);
  assert.equal(remainingManDays({ budgetManDays: 40, plannedManDays: 52 }), -12);
  assert.equal(remainingManDays({ budgetManDays: null, plannedManDays: 10 }), null);
});

test("remaining for a row being edited: its saved man-days go back before the typed figure comes off", () => {
  const figures = { budgetManDays: 100, plannedManDays: 90 };
  assert.equal(remainingForRow(figures, 5, 5), 10, "unchanged row leaves the figure as it is");
  assert.equal(remainingForRow(figures, 5, 20), -5, "typing more than is left goes over");
  assert.equal(remainingForRow(figures, 0, 2.5), 7.5);
  assert.equal(remainingForRow(figures, 5, Number.NaN), 15, "an emptied field counts as 0");
  assert.equal(remainingForRow({ budgetManDays: null, plannedManDays: 90 }, 5, 5), null);
});

test("the bar fills with the planned share and stops at the budget", () => {
  assert.equal(plannedShare({ budgetManDays: 200, plannedManDays: 50 }), 25);
  assert.equal(plannedShare({ budgetManDays: 40, plannedManDays: 52 }), 100);
  assert.equal(plannedShare({ budgetManDays: null, plannedManDays: 52 }), 0);
  assert.equal(plannedShare({ budgetManDays: 0, plannedManDays: 0 }), 0);
});

test("Projects > Plan shows the man-hour budget line under the summary, and Edit row shows what is left", async () => {
  const [screen, line] = await Promise.all([source("app/system/production/PlanningPricingScreens.tsx"), source("app/system/production/PlanManHours.tsx")]);
  assert.match(screen, /<\/section>\n\s*\{activeSchedule\.manHours \? <PlanManHours projectId=\{activeSchedule\.projectId\} data=\{activeSchedule\.manHours\} onChanged=\{loadSchedule\} \/> : null\}/);
  // An older API sends no manHours: the line is simply left out.
  assert.match(screen, /manHours\?: PlanManHoursData;/);
  assert.match(screen, /const budgetLeft = schedule\.manHours && !task\.children\.length \? remainingForRow\(schedule\.manHours, Number\(task\.planManDays\), planManDays\) : null;/);
  assert.match(screen, /data-guide="plan\.manhoursRow"/);
  assert.match(line, /className="plan-manhours" data-guide="plan\.manhours"/);
  // Only a manager on a project with no estimated labor gets the button; the server decides (canSetBudget).
  assert.match(line, /\{data\.canSetBudget \? <button className="btn default sm" type="button" data-guide="plan\.manhoursSet"/);
  assert.match(line, /apiRequest\(`\/api\/v1\/projects\/\$\{projectId\}\/manhour-budget`, \{ method: "PUT", body: JSON\.stringify\(\{ manDays: typed \}\) \}\)/);
  // Internal engineering effort only: no money on this line.
  assert.doesNotMatch(line, /THB|baht|฿|dailyRate|lineCost|price/i);
});

test("every Plan.mh* text the line asks for is in the dictionary in English, Thai and Japanese", async () => {
  const [screen, line, copy] = await Promise.all([source("app/system/production/PlanningPricingScreens.tsx"), source("app/system/production/PlanManHours.tsx"), source("app/system/production/crm-copy.ts")]);
  const asked = new Set([...`${screen}\n${line}`.matchAll(/"(Plan\.mh[A-Za-z.]+)"/g)].map((match) => match[1]));
  for (const discipline of ["Electrical", "Mechanical", "Software", "Installation", "Other"]) asked.add(`Plan.mhDiscipline.${discipline}`);
  assert.ok(asked.size >= 20, `found ${asked.size} keys`);
  for (const key of asked) {
    const entry = copy.match(new RegExp(`\\["${key.replaceAll(".", "\\.")}", "([^"]+)", "([^"]+)", "([^"]+)"\\]`));
    assert.ok(entry, `${key} is missing from crm-copy.ts`);
  }
});

test("the plan guide has a step on the man-hour budget line", async () => {
  const guides = await source("app/system/production/guide-catalog.ts");
  const plan = guides.slice(guides.indexOf('id: "project-plan"'));
  const step = plan.indexOf('target: "plan.manhours"');
  assert.ok(step > 0 && step < plan.indexOf('target: "plan.gantt"'), "the step sits before the Gantt step");
});
