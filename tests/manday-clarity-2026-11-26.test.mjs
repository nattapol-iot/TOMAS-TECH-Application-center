import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GANTT_ZOOMS, ganttWindow, shiftGanttAnchor } from "../lib/gantt.ts";

// The Man-Day questions of the UX audit, 2026-11-26 (owner: "ข้อ 3"): five places where a figure read as more than it is.
const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("(a) the Gantt has a week view: this week and next, a column a day, a week per step", () => {
  assert.equal(GANTT_ZOOMS[0], "week");
  const window = ganttWindow("week", "2026-11-26");
  assert.equal(window.start, "2026-11-23", "from this Monday");
  assert.equal(window.end, "2026-12-06");
  assert.equal(window.columns.length, 14);
  assert.ok(window.columns.every((column) => column.kind === "day" && column.start === column.end));
  assert.equal(shiftGanttAnchor("week", "2026-11-26", 1), "2026-12-03");
  assert.equal(shiftGanttAnchor("week", "2026-11-26", -1), "2026-11-19");
});

test("(a) the chart labels a day column and the plan's link accepts the week", async () => {
  const chart = await source("app/system/production/GanttChart.tsx");
  assert.match(chart, /week: "Gantt\.week"/);
  assert.match(chart, /kind === "day"\s*\? \{ weekday: "short", day: "numeric", timeZone: "UTC" \}/);
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(plan, /choiceLink<GanttZoomChoice>\(\["fit", "week", "month", "quarter", "half", "year"\]\)/);
});

test("(b) My week's figure says what it is: working hours less what is booked here and time away", async () => {
  const copy = await source("app/system/production/my-week-copy.ts");
  assert.match(copy, /\["MyWeek\.free", "Not booked yet", "ยังไม่ลงเวลา", "未予定"\]/);
  const screen = await source("app/system/production/MyWeekScreen.tsx");
  assert.match(screen, /<span className="myweek-figure free" title=\{t\("MyWeek\.freeHint"\)\}>/);
});

test("(c) the forecast says how much planned time nobody has confirmed", async () => {
  const screen = await source("app/system/production/ProjectCostScreen.tsx");
  assert.match(screen, /figures\.toDateManDays === null \? 0 : Math\.max\(0, figures\.toDateManDays - figures\.actualManDays\)/);
  assert.match(screen, /note: unconfirmedToDate\(labor\) >= 1 \/ HOURS_PER_MAN_DAY \? t\("Cost\.forecastUnconfirmed"\)/);
  // The formula itself is unchanged: actual plus the plan left.
  const cost = await source("backend-node/src/project-cost.ts");
  assert.match(cost, /round2\(actual \+ Math\.max\(0, planned - toDate\)\)/);
});

test("(d) budget with no discipline says where it comes from, on the Plan sheet and the Cost tab", async () => {
  const sheet = await source("app/system/production/PlanSheet.tsx");
  assert.match(sheet, /item\.discipline === "Unassigned" && item\.budget\s*\? t\("Sheet\.budgetUnclassified"\)/);
  const screen = await source("app/system/production/ProjectCostScreen.tsx");
  assert.match(screen, /note: t\("Cost\.unclassifiedBudget"\)/);
});

test("(e) the People table shows the plan's total beside its own and says how each counts", async () => {
  const grid = await source("app/system/production/PlanPeopleGrid.tsx");
  assert.match(grid, /planManDays !== null && Math\.abs\(planManDays - allManDays\) >= 0\.05 \? <p className="people-basis muted">\{t\("People\.basis"\)\}<\/p>/);
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(plan, /planManDays=\{activeSchedule\.manHours \? activeSchedule\.manHours\.plannedManDays \+ \(activeSchedule\.manHours\.outsourcedManDays \?\? 0\) : null\}/);
});
