import assert from "node:assert/strict";
import test from "node:test";
import { headingRisk, itemManDays, planFit, taskFit } from "../lib/capacity-plan.ts";

/*
 * Part-time planning (owner decisions 2026-11-25): a task holds hours in a window; they are spread over the window's
 * working days; the member's other work, on every project, and their time away decide whether the hours fit.
 */
const work = (over) => ({
  key: over.key,
  workKey: over.workKey ?? over.key,
  type: "Project",
  entityId: 1,
  ownerId: 3,
  reference: over.reference ?? "",
  title: over.title ?? "",
  customer: "",
  start: over.start,
  end: over.end,
  manDays: over.manDays ?? null,
  progress: 0,
  status: "Not Started",
  ...over,
});
const holidays = ["2026-12-07", "2026-12-10"];

// The mockup's example: Tachapon, 2.2 PLC software, 40 hours in 1-11 Dec; installation report on PJ260204 (8 h over
// 30 Nov-3 Dec), UAT fixes on PJ260196 (16 h over 2-9 Dec) and leave on the afternoon of 9 Dec.
const items = [
  work({ key: "this", workKey: "Project-22", start: "2026-12-01", end: "2026-12-11", manDays: 5 }),
  work({ key: "report", workKey: "Project-91", reference: "PJ260204", title: "Installation report", start: "2026-11-30", end: "2026-12-03", manDays: 1 }),
  work({ key: "uat", workKey: "Project-92", reference: "PJ260196", title: "UAT", start: "2026-12-02", end: "2026-12-09", manDays: 2 }),
  // Somebody else's work and a row with no hours take none of Tachapon's time.
  work({ key: "theirs", ownerId: 9, start: "2026-12-01", end: "2026-12-11", manDays: 9 }),
  work({ key: "nohours", workKey: "Project-23", start: "2026-12-07", end: "2026-12-16", manDays: null }),
];
const base = {
  items,
  isThisTask: (item) => item.workKey === "Project-22",
  userId: 3,
  start: "2026-12-01",
  end: "2026-12-11",
  effortHours: 40,
  doneHours: 0,
  daysPerWeek: null,
  away: new Map([["2026-12-09", 0.5]]),
  holidays,
  today: "2026-11-25",
};

test("an item's man-days on a date: spread over its working days, or typed per day, none without hours", () => {
  assert.equal(itemManDays(items[1], "2026-12-01", holidays), 0.25);
  assert.equal(itemManDays(items[1], "2026-12-05", holidays), 0, "a Saturday");
  assert.equal(itemManDays(items[4], "2026-12-08", holidays), 0, "no hours, no time");
  assert.equal(itemManDays({ start: "2026-12-01", end: "2026-12-05", manDays: 3, byDay: { "2026-12-05": 0.5 } }, "2026-12-05"), 0.5);
});

test("40 hours over 7 working days is 5.7 h a day; the member has 30 h free, so 10 h are short and it finishes on 15 Dec", () => {
  const fit = taskFit(base);
  assert.equal(fit.workDays, 7, "1-11 Dec less the weekend and the holidays of 7 and 10 Dec");
  assert.equal(fit.perDayHours, 5.71);
  assert.equal(fit.percentOfDay, 71);
  assert.deepEqual(
    fit.days.map((day) => [day.date, day.capacity, day.otherHours, day.free]),
    [
      ["2026-12-01", 8, 2, 6],
      ["2026-12-02", 8, 5.2, 2.8],
      ["2026-12-03", 8, 5.2, 2.8],
      ["2026-12-04", 8, 3.2, 4.8],
      ["2026-12-08", 8, 3.2, 4.8],
      ["2026-12-09", 4, 3.2, 0.8],
      ["2026-12-11", 8, 0, 8],
    ],
  );
  assert.equal(fit.freeHours, 30);
  assert.equal(fit.shortHours, 10);
  assert.equal(fit.fits, false);
  assert.equal(fit.forecastFinish, "2026-12-15", "8 h free on the 14th, the last 2 h on the 15th");
  assert.equal(fit.late, true);
  assert.deepEqual(
    fit.weeks.map((week) => [week.start, week.workDays, week.need, week.other, week.away, week.free, week.short]),
    [
      ["2026-11-30", 4, 22.84, 15.6, 0, 16.4, 6.44],
      ["2026-12-07", 3, 17.13, 6.4, 4, 13.6, 3.53],
    ],
  );
  assert.deepEqual(
    fit.days[1].other.map((row) => [row.reference, row.hours]),
    [
      ["PJ260196", 3.2],
      ["PJ260204", 2],
    ],
  );
});

test("hours confirmed come off, and what is left is spread over the days left from today", () => {
  const fit = taskFit({ ...base, doneHours: 12, today: "2026-12-08" });
  assert.equal(fit.remainingHours, 28);
  assert.equal(fit.workDays, 3, "8, 9 and 11 Dec");
  assert.equal(fit.perDayHours, 9.33);
  assert.equal(fit.freeHours, 13.6);
  assert.equal(fit.shortHours, 14.4);
});

test("hours that fit: no shortage, the forecast inside the window", () => {
  const fit = taskFit({ ...base, effortHours: 16 });
  assert.equal(fit.shortHours, 0);
  assert.equal(fit.fits, true);
  assert.equal(fit.forecastFinish, "2026-12-04", "6 + 2.8 + 2.8 + 4.8 reach 16 h on the 4th");
  assert.equal(fit.late, false);
});

test("a leader's week-by-week hours shape the need; a smaller capacity and full days away leave less time", () => {
  // 8 + 8 + 4 typed hours share out the 40 hours in the same proportions.
  const typed = taskFit({ ...base, byDayHours: { "2026-12-01": 8, "2026-12-02": 8, "2026-12-11": 4 } });
  assert.deepEqual(
    typed.days.filter((day) => day.need > 0).map((day) => [day.date, day.need]),
    [
      ["2026-12-01", 16],
      ["2026-12-02", 16],
      ["2026-12-11", 8],
    ],
  );
  const part = taskFit({ ...base, daysPerWeek: 2.5, away: new Map([["2026-12-11", 1]]) });
  assert.equal(part.days[0].capacity, 4);
  assert.equal(part.days.at(-1).capacity, 0);
});

test("a heading is at risk when a forecast under it passes its end, or a forecast is unknown", () => {
  assert.deepEqual(headingRisk("2026-12-16", ["2026-12-15", "2026-12-03"]), { atRisk: false, forecast: "2026-12-15" });
  assert.deepEqual(headingRisk("2026-12-04", ["2026-12-08", "2026-12-03"]), { atRisk: true, forecast: "2026-12-08" });
  assert.equal(headingRisk("2026-12-04", [null]).atRisk, true);
  assert.deepEqual(headingRisk(null, []), { atRisk: false, forecast: null });
});

test("a plan row's verdict: short, fits, no hours, outsourced or nothing to judge; two members share its hours", () => {
  const board = { items, capacities: [{ userId: 3, daysPerWeek: 5 }], holidays, away: [{ userId: 3, start: "2026-12-09", end: "2026-12-09", slot: "PM" }] };
  const row = { id: 22, start: "2026-12-01", end: "2026-12-11", picIds: [3], planHours: 40, actualHours: 0, outsourced: false };
  const short = planFit(row, board, "2026-11-25");
  assert.equal(short.status, "short");
  assert.equal(short.shortHours, 10);
  assert.equal(short.perDayHours, 5.71);
  assert.equal(short.percentOfDay, 71);
  assert.equal(short.forecastFinish, "2026-12-15");
  assert.equal(planFit({ ...row, planHours: 16 }, board, "2026-11-25").status, "fits");
  assert.equal(planFit({ ...row, planHours: 0 }, board, "2026-11-25").status, "noHours");
  assert.equal(planFit({ ...row, outsourced: true }, board, "2026-11-25").status, "outsourced");
  assert.equal(planFit({ ...row, picIds: [] }, board, "2026-11-25").status, "none");
  // Shared by two: each takes 20 hours; person 9 already has 9 MD of work over its 7 days, more than their time, so all 20 are short.
  const shared = planFit({ ...row, picIds: [3, 9] }, board, "2026-11-25");
  assert.deepEqual(
    shared.people.map((fit) => [fit.userId, fit.effortHours, fit.shortHours]),
    [
      [3, 20, 0],
      [9, 20, 20],
    ],
  );
  assert.equal(shared.status, "short");
});
