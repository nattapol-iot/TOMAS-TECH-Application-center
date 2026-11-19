import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { workingDayFinish } from "../lib/resource-planning.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("plan days count working days (SUP-2026-00013)", () => {
  // The ticket: start Sat 17 Oct 2026, 8 days, must finish Wed 28 Oct.
  assert.equal(workingDayFinish("2026-10-17", 8), "2026-10-28");
  assert.equal(workingDayFinish("2026-10-19", 1), "2026-10-19");
  assert.equal(workingDayFinish("2026-10-19", 5), "2026-10-23");
  // A company holiday is skipped too.
  assert.equal(workingDayFinish("2026-10-19", 5, ["2026-10-23"]), "2026-10-26");
  assert.equal(workingDayFinish("2026-10-19", 0), null);
  assert.equal(workingDayFinish("not a date", 3), null);
});

test("the edit form types working days but leaves untouched rows on their stored span", () => {
  const plan = read("app/system/production/PlanningPricingScreens.tsx");
  const span = plan.slice(plan.indexOf("function draftSpan"), plan.indexOf("function draftSpan") + 900);
  assert.match(span, /workingDayFinish\(from, Math\.max\(1, workDays\), schedule\.holidays \?\? \[\]\)/);
  assert.match(plan, /const storedWorkDays = Math\.max\(1, Number\(task\.workDays\) \|\| task\.planDays\);/);
  // Unchanged days and start send the stored calendar span back, so existing plans do not move.
  assert.match(plan, /if \(planDays === storedWorkDays && !task\.isMilestone && JSON\.stringify\(start\) === JSON\.stringify\(initialStart\)\) return task\.planDays;/);
  assert.match(plan, /return span\.from && span\.to \? Math\.max\(1, periodDays\(span\.from, span\.to\)\) : planDays;/);
  assert.match(plan, /datesLocked \? task\.planDays : calendarDays\(\)/);
  // The backend still reads plan_days as a calendar span: no stored row changes meaning.
  const calculator = read("backend-node/src/schedule-calculator.ts");
  assert.match(calculator, /const planFinish = planStart \? addDays\(planStart, Math\.max\(1, task\.planDays\) - 1\) : null;/);
  assert.match(plan, /data-guide="plan\.workDays"/);
});
