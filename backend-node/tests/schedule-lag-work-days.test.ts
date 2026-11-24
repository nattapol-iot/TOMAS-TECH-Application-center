import assert from "node:assert/strict";
import test from "node:test";
import { linkedWorkStart, resolveSchedule, shiftWorkDays, workLagBetween, type ScheduleCalculationTask } from "../src/schedule-calculator.js";
import { datesWouldLoop, linksInput, storedLinks } from "../src/schedule-service.js";

// Owner 2026-11-24, migration 125: "+N" after the row a task follows counts working days.
const holidays = new Set(["2026-11-24"]);
const row = (patch: Partial<ScheduleCalculationTask>): ScheduleCalculationTask => ({
  id: 1,
  parentId: null,
  sortOrder: 1,
  planStart: "2026-11-16",
  planDays: 5,
  startMode: "manual",
  predecessorId: null,
  lagDays: 0,
  actualStart: null,
  actualFinish: null,
  forecastFinish: null,
  percentComplete: 0,
  status: "Not Started",
  ...patch,
});

test("a working-day gap skips weekends and company holidays, both ways", () => {
  // Friday 20 Nov ends; the next working day is Monday 23, then Wednesday 25 (Tuesday 24 is a holiday).
  assert.equal(linkedWorkStart("2026-11-20", 0, holidays), "2026-11-23");
  assert.equal(linkedWorkStart("2026-11-20", 1, holidays), "2026-11-25");
  assert.equal(linkedWorkStart("2026-11-20", 2, holidays), "2026-11-26");
  assert.equal(linkedWorkStart("2026-11-20", -1, holidays), "2026-11-20", "an overlap of one working day");
  assert.equal(shiftWorkDays("2026-11-23", -2, holidays), "2026-11-19");
  for (const lag of [-3, -1, 0, 1, 4, 9]) assert.equal(workLagBetween("2026-11-20", linkedWorkStart("2026-11-20", lag, holidays), holidays), lag, `round trip ${lag}`);
});

test("a gap saved before migration 125 keeps its calendar start and is read back in working days", () => {
  const before = row({ id: 1, planStart: "2026-11-16", planDays: 5 });
  // Ends Friday 20; four calendar days later is Tuesday 24, a holiday, so Wednesday 25 = one working day after Monday.
  const calendar = row({ id: 2, sortOrder: 2, planStart: null, planDays: 2, startMode: "linked", predecessorId: 1, lagDays: 3, lagWorkDays: false });
  const working = row({ id: 3, sortOrder: 3, planStart: null, planDays: 2, startMode: "linked", predecessorId: 1, lagDays: 1 });
  const { byId } = resolveSchedule([before, calendar, working], holidays);
  assert.equal(byId.get(2)!.planStart, "2026-11-25");
  assert.equal(byId.get(2)!.lagWorkDays, 1, "the calendar gap as working days");
  assert.equal(byId.get(3)!.planStart, "2026-11-25", "the same start from +1 working day");
  assert.equal(byId.get(3)!.lagWorkDays, 1);
  assert.equal(byId.get(1)!.lagWorkDays, null, "not linked");
});

test("a row waiting for several rows starts after the latest of them (migration 126)", () => {
  const a = row({ id: 1, planStart: "2026-11-16", planDays: 5 }); // ends Fri 20 Nov
  const b = row({ id: 2, sortOrder: 2, planStart: "2026-11-23", planDays: 4 }); // ends Thu 26 Nov
  const c = row({ id: 3, sortOrder: 3, planStart: null, planDays: 1, startMode: "linked", predecessorId: 1, lagDays: 0, extraLinks: [{ predecessorId: 2, lagDays: 1 }] });
  const gone = row({ id: 4, sortOrder: 4, planStart: null, planDays: 1, startMode: "linked", predecessorId: 1, lagDays: 0, extraLinks: [{ predecessorId: 99, lagDays: 0 }] });
  const { byId } = resolveSchedule([a, b, c, gone], new Set());
  assert.equal(byId.get(3)!.planStart, "2026-11-30", "Fri 27 is the first day after B, +1 working day is Mon 30");
  assert.equal(byId.get(3)!.lagWorkDays, 0, "the first link's own gap is reported");
  assert.equal(byId.get(4)!.planStart, "2026-11-23", "a row no longer in the plan is passed over");
});

test("extra links are read and checked: no repeats, not the first link, at most ten", () => {
  assert.deepEqual(storedLinks('[{"predecessorId":5,"lagDays":2},{"predecessorId":"x"}]'), [{ predecessorId: 5, lagDays: 2 }]);
  assert.deepEqual(storedLinks("not json"), []);
  assert.deepEqual(storedLinks(null), []);
  assert.deepEqual(linksInput([{ predecessorId: 7, lagDays: -1 }], 3), [{ predecessorId: 7, lagDays: -1 }]);
  assert.throws(() => linksInput([{ predecessorId: 3 }], 3), /named once/);
  assert.throws(() => linksInput([{ predecessorId: 7 }, { predecessorId: 7 }], 3), /named once/);
  assert.throws(
    () =>
      linksInput(
        Array.from({ length: 11 }, (_, index) => ({ predecessorId: index + 10 })),
        3,
      ),
    /at most/,
  );
  assert.throws(() => linksInput([{ predecessorId: 7 }], null), /requires a predecessor/);
});

test("a loop through an extra link is found", () => {
  const rows = new Map([
    [1, { parent: null, predecessor: null, startMode: "manual" }],
    [2, { parent: null, predecessor: 1, startMode: "linked", extras: [3] }],
    [3, { parent: null, predecessor: 1, startMode: "linked", extras: [2] }],
  ]);
  assert.equal(datesWouldLoop(rows), true);
  rows.set(3, { parent: null, predecessor: 1, startMode: "linked", extras: [] });
  assert.equal(datesWouldLoop(rows), false);
});
