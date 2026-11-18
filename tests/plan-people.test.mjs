import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { addDays, applyPeople, dayDiff, figureText, fillPeople, isWorkDay, mondayOf, overbookedDays, parsePastedBlock, peopleManDays, peopleOn, sameSpan, usualPeople } from "../lib/plan-people.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");
const edits = (pairs) => new Map(Object.entries(pairs));
// Mon 7 Dec 2026 to Fri 11 Dec 2026; Thu 10 Dec is a holiday.
const week = { start: "2026-12-07", days: 5, people: [] };
const holidays = new Set(["2026-12-10"]);

test("days: adding, counting, the week's Monday and what is a work day", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(dayDiff("2026-12-07", "2026-12-11"), 4);
  assert.equal(mondayOf("2026-12-13"), "2026-12-07");
  assert.equal(mondayOf("2026-12-07"), "2026-12-07");
  assert.deepEqual(["2026-12-09", "2026-12-10", "2026-12-12", "2026-12-13"].map((day) => isWorkDay(day, holidays)), [true, false, false, false]);
});

test("peopleOn: null outside the row's dates, 0 inside them with nobody set", () => {
  const span = { start: "2026-12-07", days: 5, people: [3, 0, 2] };
  assert.deepEqual(["2026-12-06", "2026-12-07", "2026-12-08", "2026-12-09", "2026-12-11", "2026-12-12"].map((day) => peopleOn(span, day)), [null, 3, 0, 2, 0, null]);
  assert.equal(peopleOn(null, "2026-12-07"), null);
  assert.equal(peopleManDays(span.people), 5);
});

test("applyPeople: typing inside the dates keeps them; the rest of the row stays as it was", () => {
  assert.deepEqual(applyPeople(week, edits({ "2026-12-08": 3 })), { start: "2026-12-07", days: 5, people: [0, 3] });
  assert.deepEqual(applyPeople({ ...week, people: [2, 2, 2, 2, 2] }, edits({ "2026-12-09": 0 })), { start: "2026-12-07", days: 5, people: [2, 2, 0, 2, 2] });
});

test("applyPeople: a figure outside the dates stretches the row to that day", () => {
  assert.deepEqual(applyPeople({ ...week, people: [2, 2, 2, 2, 2] }, edits({ "2026-12-05": 6, "2026-12-13": 1 })),
    { start: "2026-12-05", days: 9, people: [6, 0, 2, 2, 2, 2, 2, 0, 1] });
});

test("applyPeople: clearing the first or last days takes them off the row, down to one day", () => {
  const full = { ...week, people: [2, 2, 2, 2, 2] };
  assert.deepEqual(applyPeople(full, edits({ "2026-12-07": 0, "2026-12-08": 0, "2026-12-11": 0 })), { start: "2026-12-09", days: 2, people: [2, 2] });
  assert.deepEqual(applyPeople(full, edits({ "2026-12-07": 0, "2026-12-08": 0, "2026-12-09": 0, "2026-12-10": 0, "2026-12-11": 0 })), { start: "2026-12-11", days: 1, people: [] });
  assert.deepEqual(applyPeople(week, edits({ "2026-12-01": 0 })), { start: "2026-12-07", days: 5, people: [] }, "clearing outside the dates changes nothing");
});

test("applyPeople: a row with no dates takes them from the figures typed", () => {
  assert.equal(applyPeople(null, edits({ "2026-12-08": 0 })), null);
  assert.deepEqual(applyPeople(null, edits({ "2026-12-08": 4, "2026-12-10": 4 })), { start: "2026-12-08", days: 3, people: [4, 0, 4] });
});

test("fillPeople: People/day goes on every work day and on days that already have people", () => {
  const span = { start: "2026-12-05", days: 7, people: [6] };    // Sat 5 to Fri 11; Sat has people already
  assert.deepEqual(fillPeople(span, 3, holidays), { start: "2026-12-05", days: 7, people: [3, 0, 3, 3, 3, 0, 3] });
  assert.equal(usualPeople([3, 0, 3, 5]), 3);
  assert.equal(usualPeople([0, 0]), null);
  assert.equal(sameSpan({ start: "2026-12-05", days: 2, people: [1, 0] }, { start: "2026-12-05", days: 2, people: [1] }), true);
});

test("parsePastedBlock: rows and tabs from a spreadsheet; anything that is not a figure is skipped", () => {
  assert.deepEqual(parsePastedBlock("3\t3\t\r\n6\tx\t10\r\n"), [[3, 3, null], [6, null, 10]]);
  assert.deepEqual(parsePastedBlock("0.5\t0,5\t1.25"), [[0.5, 0.5, null]]);
});

test("shares: one person on two tasks a day is 0.5 on each, kept to one decimal place", () => {
  assert.deepEqual(applyPeople(week, edits({ "2026-12-07": 0.5, "2026-12-08": 0.26 })), { start: "2026-12-07", days: 5, people: [0.5, 0.3] });
  assert.equal(peopleManDays([0.1, 0.2, 0.5, 0.5]), 1.3);
  assert.deepEqual(["0.5", "0,5", "12.55", "1.2.3", "ab", ".5", "1234"].map(figureText), ["0.5", "0.5", "12.5", "1.2", "", ".5", "123"]);
});

test("overbookedDays: the same PIC on several rows for more than one man-day on a day, and only then", () => {
  const somchai = { id: 1, name: "Somchai" }, wanida = { id: 2, name: "Wanida" };
  const found = overbookedDays([
    { people: [somchai], cells: [1, 0.5, 3, null] },          // leads a crew of three on the third day: he is one of them
    { people: [somchai, wanida], cells: [1, 0.5, 2, 1] },     // two PICs share the row's figure
    { people: [], cells: [5, 5, 5, 5] },                      // no PIC, or an outsourced row: nobody to double-book
  ]);
  assert.deepEqual([...found.keys()].sort(), [0, 1]);
  assert.deepEqual([...found.get(0).keys()], [0, 2], "1 + 0.5 and 1 + 1 are over; 0.5 + 0.25 is not");
  assert.deepEqual(found.get(0).get(0), { name: "Somchai", total: 1.5 });
  assert.deepEqual([...found.get(1).keys()], [0, 2]);
  assert.equal(overbookedDays([{ people: [somchai], cells: [0.5] }, { people: [somchai], cells: [0.5] }]).size, 0, "half and half is one day");
});

test("Plan screen: the People table is a view of Projects > Plan and locks man-days that come from it", async () => {
  const screen = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(screen, /type PlanLevel = "team" \| "master" \| "member" \| "people";/);
  assert.match(screen, /peopleView \? <PlanPeopleGrid projectId=\{activeSchedule\.projectId\}/);
  assert.match(screen, /disabled=\{Boolean\(task\.peopleByDay\?\.length\)\}/, "Edit row does not take man-days for a row that has people per day");
  const grid = await source("app/system/production/PlanPeopleGrid.tsx");
  assert.match(grid, /data-guide="plan\.people"/);
  assert.match(grid, /\/api\/v1\/projects\/\$\{projectId\}\/schedule\/people/);
  assert.doesNotMatch(grid, /THB|baht|฿|dailyRate|lineCost|price/i, "no money in the People table");
  const css = await source("app/system/production/my-work.css");
  assert.match(css, /\.people-table \.people-row\.work td\.people-day\.out \{/);
  const guide = await source("app/system/production/guide-catalog.ts");
  assert.match(guide, /target: "plan\.people"/);
});
