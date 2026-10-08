import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
const source = await readFile(
  new URL("../lib/resource-planning.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { planningWeeks, workingDays, planningLoad, resourceCsv, DEFAULT_WEEKLY_CAPACITY, weeklyCapacity, FINISHED_WORK_STATUSES, isOpenWork, orderWork, projectWork } =
  await import(
    "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
  );
const item = {
  key: "1",
  type: "Project",
  entityId: 1,
  ownerId: 1,
  reference: "P1",
  title: "Task",
  customer: "Test",
  start: "2026-09-07",
  end: "2026-09-18",
  manDays: 10,
  progress: 0,
  status: "Not Started",
};
test("weeks align to Monday across year boundaries", () => {
  assert.deepEqual(planningWeeks("2027-01-01", 2), [
    { start: "2026-12-28", end: "2027-01-03" },
    { start: "2027-01-04", end: "2027-01-10" },
  ]);
});
test("weekends and holidays are excluded; invalid intervals do not hang", () => {
  assert.equal(workingDays(item.start, item.end, ["2026-09-07"]).length, 9);
  assert.deepEqual(workingDays("bad", "bad"), []);
  assert.deepEqual(workingDays(item.end, item.start), []);
});
test("effort is conserved and clipped to selected horizon", () => {
  const w = planningWeeks(item.start, 2),
    r = planningLoad([item], w, 5, "2026-09-09");
  assert.equal(r.committed, 10);
  assert.equal(r.peak, 100);
  assert.equal(r.weekly[0].manDays, 5);
  assert.equal(planningLoad([item], w.slice(1), 5, "2026-09-09").committed, 5);
});
test("holidays reduce available capacity without discarding committed effort", () => {
  const r = planningLoad([item], planningWeeks(item.start, 2), 5, item.start, [
    "2026-09-07",
  ]);
  assert.equal(r.weekly[0].available, 4);
  assert.ok(Math.abs(r.committed - 10) < 1e-9);
  assert.ok(r.peak > 100);
});
test("unknown effort and unset/zero capacity are not silently treated as free capacity", () => {
  assert.equal(
    planningLoad([item], planningWeeks(item.start, 2), null, item.start).peak,
    null,
  );
  assert.equal(
    planningLoad([item], planningWeeks(item.start, 2), 0, item.start).peak,
    Infinity,
  );
  assert.equal(
    planningLoad(
      [{ ...item, manDays: null }],
      planningWeeks(item.start, 2),
      5,
      item.start,
    ).unknown,
    1,
  );
});
test("overdue excludes closed work and future due dates", () => {
  const r = planningLoad(
    [item, { ...item, key: "2", status: "Closed" }],
    planningWeeks(item.start, 2),
    5,
    "2026-09-19",
  );
  assert.equal(r.overdue, 1);
  assert.equal(r.open, 1);
});
test("export escapes formulas, quotes and preserves Thai/Unicode", () => {
  const csv = resourceCsv([["=CMD()", "ไทย", "a,b", 'a"b']]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes('"a""b"'));
  assert.ok(csv.includes("ไทย"));
});
test("anyone without a saved capacity works the default 5 days, as the server assumes", async () => {
  assert.equal(DEFAULT_WEEKLY_CAPACITY, 5);
  assert.equal(weeklyCapacity(null), 5);
  assert.equal(weeklyCapacity(undefined), 5);
  assert.equal(weeklyCapacity(0), 0);
  assert.equal(weeklyCapacity(2.5), 2.5);
  const server = await readFile(new URL("../backend-node/src/resource-workload.ts", import.meta.url), "utf8");
  assert.match(server, /export const DEFAULT_WEEKLY_CAPACITY = 5;/);
  // One list decides what is finished, on both sides.
  const list = server.match(/export const FINISHED_WORK_STATUSES = (\[[^\]]+\])/)?.[1];
  assert.deepEqual(JSON.parse(list), FINISHED_WORK_STATUSES);
  assert.equal(isOpenWork({ progress: 40, status: "In Progress" }), true);
  assert.equal(isOpenWork({ progress: 100, status: "In Progress" }), false);
  assert.equal(isOpenWork({ progress: 0, status: "Rejected" }), false);
});
test("the Workload screen reads once, opens on the workload and lists each person's work in a drawer", async () => {
  const screen = await readFile(new URL("../app/system/production/ResourcePlanningScreen.tsx", import.meta.url), "utf8");
  // One request instead of every inquiry, every estimate workspace and every project schedule.
  assert.match(screen, /setData\(await loadWorkload\(\)\)/);
  assert.doesNotMatch(screen, /loadEstimateCostWorkspace|loadSchedules|listInquiries|listEstimates|resource-tasks\/commitments/);
  // Two tabs, Workload first, and the last one used is remembered per person.
  assert.match(screen, /\{ id: "workload", label: "Workload\.title" \},\s*\{ id: "tasks", label: "Workload\.tabTasks" \}/);
  assert.match(screen, /tomas-tech-resource-plan-tab:\$\{userId\}/);
  assert.doesNotMatch(screen, /id: "gantt"|id: "items"|KpiCard|BarChart/);
  // Chips filter the one table; a person opens a drawer with their open work and the effort and capacity edits.
  assert.match(screen, /<FilterChips label="Workload\.chips" items=\{chipItems\}/);
  assert.match(screen, /onClick=\{\(\) => setPersonId\(row\.user\.id\)\}/);
  assert.match(screen, /<WorkQueue\s+items=\{person\.items\}\s+order=\{person\.order\}/);
  assert.match(screen, /const capacity = weeklyCapacity\(saved\);/);
  assert.match(screen, /row\.saved === null \? <small>\{t\("Workload\.defaultCapacity"\)\}<\/small>/);
  // The page's styles ship with the lazy screen, not in globals.css.
  assert.match(screen, /import "\.\/workload\.css";/);
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(globals, /\.workload-|\.resource-plan-page|\.capacity-button/);
});
test("every Workload and work order string has English, Thai and Japanese copy", async () => {
  const files = ["ResourcePlanningScreen.tsx", "WorkQueue.tsx", "WorkloadGantt.tsx", "PlanningPricingScreens.tsx"];
  const sources = await Promise.all(files.map((file) => readFile(new URL(`../app/system/production/${file}`, import.meta.url), "utf8")));
  const dictionary = await readFile(new URL("../app/system/i18n.ts", import.meta.url), "utf8");
  const keys = [...new Set(sources.flatMap((source) => [...source.matchAll(/"((?:Workload|WorkQueue)\.[A-Za-z]+)"/g)].map((match) => match[1])))];
  assert.ok(keys.length >= 40, `${keys.length} keys`);
  for (const key of keys) {
    const pattern = String.raw`^\s*"` + key.replace(".", "\\.") + String.raw`": \{ en: "[^"]+", th: "[^"]+", jp: "[^"]+" \},$`;
    const entry = dictionary.match(new RegExp(pattern, "m"));
    assert.ok(entry, `${key} needs en, th and jp`);
  }
});
const work = (key, change = {}) => ({ ...item, key, workKey: key, reference: key, start: "2026-10-05", end: "2026-10-09", manDays: 5, progress: 0, ...change });
test("a person's order comes first, the rest by due date, and finished work drops out", () => {
  const items = [work("A", { end: "2026-10-20" }), work("B", { end: "2026-10-09" }), work("C", { end: "2026-10-12" }), work("D", { progress: 100 })];
  assert.deepEqual(orderWork(items, ["C"]).map((entry) => entry.key), ["C", "B", "A"]);
  assert.deepEqual(orderWork(items, []).map((entry) => entry.key), ["B", "C", "A"]);
  // A saved key for work that has gone changes nothing.
  assert.deepEqual(orderWork(items, ["gone", "A"]).map((entry) => entry.key), ["A", "B", "C"]);
});
test("working in a chosen order shows which overlapping work finishes late, and by how much", () => {
  const a = work("A"), b = work("B");
  // Monday 5 October: both are due Friday and each needs the whole week.
  let projected = projectWork([a, b], 5, "2026-10-05");
  assert.deepEqual(projected.get("A"), { start: "2026-10-05", finish: "2026-10-09", lateDays: 0 });
  assert.deepEqual(projected.get("B"), { start: "2026-10-12", finish: "2026-10-16", lateDays: 5 });
  projected = projectWork([b, a], 5, "2026-10-05");
  assert.equal(projected.get("B").lateDays, 0);
  assert.equal(projected.get("A").lateDays, 5);
  // Work already reported done is not counted again: A has 2 MD left, so B starts on Wednesday.
  projected = projectWork([work("A", { progress: 60 }), b], 5, "2026-10-05");
  assert.equal(projected.get("A").finish, "2026-10-06");
  assert.deepEqual(projected.get("B"), { start: "2026-10-07", finish: "2026-10-13", lateDays: 2 });
  // Half capacity doubles the time; a company holiday is not a working day.
  assert.equal(projectWork([a], 2.5, "2026-10-05").get("A").finish, "2026-10-16");
  assert.deepEqual(projectWork([a], 5, "2026-10-05", ["2026-10-07"]).get("A"), { start: "2026-10-05", finish: "2026-10-12", lateDays: 1 });
});
test("work does not start before its planned start, and the day goes to the next item meanwhile", () => {
  const later = work("Later", { start: "2026-10-12", end: "2026-10-16" });
  const now = work("Now", { end: "2026-10-09" });
  const projected = projectWork([later, now], 5, "2026-10-05");
  assert.deepEqual(projected.get("Now"), { start: "2026-10-05", finish: "2026-10-09", lateDays: 0 });
  assert.deepEqual(projected.get("Later"), { start: "2026-10-12", finish: "2026-10-16", lateDays: 0 });
});
test("work without effort, or a person without capacity, gets no guessed date", () => {
  assert.deepEqual(projectWork([work("A", { manDays: null })], 5, "2026-10-05").get("A"), { start: null, finish: null, lateDays: null, reason: "effort" });
  assert.equal(projectWork([work("A", { manDays: 0 })], 5, "2026-10-05").get("A").reason, "effort");
  assert.equal(projectWork([work("A")], 0, "2026-10-05").get("A").reason, "capacity");
  assert.equal(projectWork([work("A", { manDays: 5000 })], 5, "2026-10-05").get("A").reason, "horizon");
});
test("the Workload shows a Gantt, a work order per person, and My Work has its own order tab", async () => {
  const [screen, queue, gantt, myWork, lazy, client] = await Promise.all([
    "../app/system/production/ResourcePlanningScreen.tsx", "../app/system/production/WorkQueue.tsx", "../app/system/production/WorkloadGantt.tsx",
    "../app/system/production/PlanningPricingScreens.tsx", "../app/system/production/LazyScreens.tsx", "../app/system/resource-workload-client.ts",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  // Table or Gantt, remembered per person; the Gantt shows the same people, each in their own order.
  assert.match(screen, /tomas-tech-workload-view:\$\{userId\}/);
  assert.match(screen, /<WorkloadGantt people=\{shown\} today=\{todayIso\} onPerson=\{setPersonId\} onOpen=\{open\} \/>/);
  assert.match(gantt, /forecastFinish: projected\?\.finish \?\? null/);
  assert.match(gantt, /label="Workload\.ganttLabel"/);
  // The drawer's order is editable by the person or a manager; only the person asks the PM for more days.
  assert.match(screen, /editable=\{person\.user\.id === bootstrap\.user\.id \|\| manages\}/);
  assert.match(screen, /canRequestDays=\{person\.user\.id === bootstrap\.user\.id && bootstrap\.permissions\.includes\("schedule\.progress"\)\}/);
  assert.match(screen, /const MANAGER_ROLES = \["Admin", "Engineering Manager", "Project Manager"\];/);
  // Moving saves the whole order; plan dates move only through the day request the PM answers.
  assert.match(client, /\/api\/v1\/resource-planning\/work-order\/\$\{userId\}`, \{ method: "PUT", body: JSON\.stringify\(\{ keys \}\) \}/);
  assert.match(queue, /\/api\/v1\/schedule\/tasks\/\$\{taskId\}\/day-requests`/);
  assert.doesNotMatch(queue, /\/schedule\/tasks\/\$\{[^}]+\}\/(?:progress|plan)|method: "PATCH"/);
  // My Work's tab loads the queue on first use, with only the caller's own work.
  assert.match(myWork, /\{ id: "queue", label: "WorkQueue\.myTab" \}/);
  assert.match(myWork, /import \{ MyWorkQueue \} from "\.\/LazyScreens";/);
  assert.match(lazy, /export const MyWorkQueue = dynamic\(\(\) => import\("\.\/WorkQueue"\)\.then\(\(m\) => m\.MyWorkQueue\), screen\);/);
  assert.match(queue, /loadWorkload\(\{ mine: true \}\)/);
});
test("estimate sections and tasks awaiting approval show up, and a section's engineer plans its effort", async () => {
  const [screen, queue, gantt] = await Promise.all([
    "../app/system/production/ResourcePlanningScreen.tsx", "../app/system/production/WorkQueue.tsx", "../app/system/production/WorkloadGantt.tsx",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  // Awaiting approval is marked wherever the work is listed.
  assert.match(queue, /\{item\.tentative \? <Badge tone="amber">\{t\("Workload\.awaitingApproval"\)\}<\/Badge> : null\}/);
  assert.match(screen, /\{item\.tentative \? <Badge tone="amber">\{t\("Workload\.awaitingApproval"\)\}<\/Badge> : null\}/);
  assert.match(gantt, /item\.tentative \? `\$\{item\.title\} · \$\{t\("Workload\.awaitingApproval"\)\}` : item\.title/);
  // One effort dialog, saved where the item says its effort lives.
  assert.match(queue, /export function EffortModal\(/);
  assert.match(queue, /`\/api\/v1\/resource-planning\/\$\{item\.effort\.kind\}\/\$\{item\.effort\.id\}`/);
  assert.match(screen, /import \{ EffortModal, WorkQueue \} from "\.\/WorkQueue";/);
  assert.doesNotMatch(screen, /function EffortModal/);
  // A section's own engineer plans it from the Workload drawer or My Work; planners plan the rest.
  assert.match(screen, /item\.effort\.kind === "EstimateSection" && item\.ownerId === bootstrap\.user\.id/);
  assert.match(queue, /canPlanEffort=\{\(item\) => item\.effort\?\.kind === "EstimateSection"\}/);
});
