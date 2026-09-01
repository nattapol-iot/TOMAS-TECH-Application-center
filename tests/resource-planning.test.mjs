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
const { planningWeeks, workingDays, planningLoad, planningBar, resourceCsv } =
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
test("timeline bars clip both boundaries and omit unscheduled work", () => {
  const weeks = planningWeeks(item.start, 1);
  assert.deepEqual(planningBar(item, weeks), { left: 0, width: 100 });
  assert.equal(planningBar({ ...item, start: null }, weeks), null);
  assert.equal(
    planningBar({ ...item, start: "2026-10-01", end: "2026-10-02" }, weeks),
    null,
  );
});
test("export escapes formulas, quotes and preserves Thai/Unicode", () => {
  const csv = resourceCsv([["=CMD()", "ไทย", "a,b", 'a"b']]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'=CMD()"));
  assert.ok(csv.includes('"a""b"'));
  assert.ok(csv.includes("ไทย"));
});
