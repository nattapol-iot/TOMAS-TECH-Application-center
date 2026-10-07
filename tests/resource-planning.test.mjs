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
const { planningWeeks, workingDays, planningLoad, resourceCsv, DEFAULT_WEEKLY_CAPACITY, weeklyCapacity, FINISHED_WORK_STATUSES, isOpenWork } =
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
  assert.match(screen, /<WorkList items=\{person\.items\}/);
  assert.match(screen, /const capacity = weeklyCapacity\(saved\);/);
  assert.match(screen, /row\.saved === null \? <small>\{t\("Workload\.defaultCapacity"\)\}<\/small>/);
  // The page's styles ship with the lazy screen, not in globals.css.
  assert.match(screen, /import "\.\/workload\.css";/);
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.doesNotMatch(globals, /\.workload-|\.resource-plan-page|\.capacity-button/);
});
test("every Workload string the screen asks for has English, Thai and Japanese copy", async () => {
  const screen = await readFile(new URL("../app/system/production/ResourcePlanningScreen.tsx", import.meta.url), "utf8");
  const dictionary = await readFile(new URL("../app/system/i18n.ts", import.meta.url), "utf8");
  const keys = [...new Set([...screen.matchAll(/"(Workload\.[A-Za-z]+)"/g)].map((match) => match[1]))];
  assert.ok(keys.length >= 15, `${keys.length} keys`);
  for (const key of keys) {
    const pattern = String.raw`^\s*"` + key.replace(".", "\\.") + String.raw`": \{ en: "[^"]+", th: "[^"]+", jp: "[^"]+" \},$`;
    const entry = dictionary.match(new RegExp(pattern, "m"));
    assert.ok(entry, `${key} needs en, th and jp`);
  }
});
