import assert from "node:assert/strict";
import test from "node:test";
import { GANTT_ZOOMS, ganttFitWindow, ganttPoint, ganttSlip, ganttSpan, ganttWindow, shiftGanttAnchor } from "../lib/gantt.ts";

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} ≠ ${expected}`);

test("zoom presets: week columns for month and quarter, month columns for half-year and year", () => {
  // 2026-10-06 is a Tuesday; the week starts on Monday 2026-10-05.
  const month = ganttWindow("month", "2026-10-06");
  assert.equal(month.start, "2026-09-28", "one week of history");
  assert.equal(month.columns.length, 6);
  assert.ok(month.columns.every((column) => column.kind === "week"));
  assert.equal(month.end, "2026-11-08");
  assert.equal(month.days, 42);
  const quarter = ganttWindow("quarter", "2026-10-06");
  assert.equal(quarter.start, "2026-09-21");
  assert.equal(quarter.columns.length, 13);
  const half = ganttWindow("half", "2026-10-06");
  assert.deepEqual([half.start, half.end, half.columns.length], ["2026-09-01", "2027-02-28", 6]);
  assert.ok(half.columns.every((column) => column.kind === "month"));
  assert.equal(half.days, 181);
  const year = ganttWindow("year", "2026-10-06");
  assert.deepEqual([year.start, year.end, year.columns.length], ["2026-08-01", "2027-07-31", 12]);
  assert.deepEqual([...GANTT_ZOOMS], ["month", "quarter", "half", "year"]);
});

test("a span is placed in percent of the window and clipped at its edges", () => {
  const window = ganttWindow("month", "2026-10-06"); // 2026-09-28 .. 2026-11-08, 42 days
  const inside = ganttSpan("2026-09-28", "2026-10-04", window);
  close(inside.left, 0); close(inside.width, (7 / 42) * 100);
  assert.equal(inside.clippedStart, false); assert.equal(inside.clippedEnd, false);
  const clipped = ganttSpan("2026-09-01", "2026-09-30", window);
  close(clipped.left, 0); close(clipped.width, (3 / 42) * 100);
  assert.equal(clipped.clippedStart, true);
  const late = ganttSpan("2026-11-01", "2026-12-31", window);
  assert.equal(late.clippedEnd, true); close(late.left + late.width, 100);
  assert.equal(ganttSpan("2026-12-01", "2026-12-05", window), null, "outside");
  assert.equal(ganttSpan(null, "2026-10-01", window), null, "undated");
  assert.equal(ganttSpan("2026-10-05", "2026-10-01", window), null, "reversed");
  const oneDay = ganttSpan("2026-10-06", "2026-10-06", window);
  close(oneDay.width, (1 / 42) * 100, "a one-day task (a milestone) still has a width");
});

test("points mark one day, and nothing outside the window", () => {
  const window = ganttWindow("month", "2026-10-06");
  close(ganttPoint("2026-09-28", window), 0);
  close(ganttPoint("2026-10-06", window), (8 / 42) * 100);
  assert.equal(ganttPoint("2026-11-09", window), null);
  assert.equal(ganttPoint("2026-09-27", window), null);
  assert.equal(ganttPoint(null, window), null);
});

test("the slip tail runs from the day after the plan to a later forecast only", () => {
  const window = ganttWindow("month", "2026-10-06");
  const tail = ganttSlip("2026-10-09", "2026-10-14", window);
  close(tail.left, (12 / 42) * 100); close(tail.width, (5 / 42) * 100);
  assert.equal(ganttSlip("2026-10-09", "2026-10-09", window), null);
  assert.equal(ganttSlip("2026-10-09", "2026-10-01", window), null, "an earlier forecast is not a slip");
  assert.equal(ganttSlip(null, "2026-10-14", window), null);
});

test("fit shows the whole plan: weeks for a short plan, months for a long one, the quarter when undated", () => {
  const short = ganttFitWindow(["2026-10-12", "2026-11-20", null], "2026-10-06");
  assert.ok(short.columns.every((column) => column.kind === "week"));
  assert.ok(short.start <= "2026-10-05" && short.end >= "2026-11-27", `${short.start}..${short.end}`);
  const long = ganttFitWindow(["2026-10-12", "2027-06-30"], "2026-10-06");
  assert.ok(long.columns.every((column) => column.kind === "month"));
  assert.equal(long.start, "2026-10-01");
  assert.equal(long.end, "2027-07-31");
  const none = ganttFitWindow([null, undefined, "not-a-date"], "2026-10-06");
  assert.deepEqual([none.start, none.columns.length], [ganttWindow("quarter", "2026-10-06").start, 13]);
});

test("shifting moves most of one window and month windows ignore the day of the month", () => {
  assert.equal(shiftGanttAnchor("month", "2026-10-06", 1), "2026-11-03");
  assert.equal(shiftGanttAnchor("quarter", "2026-10-06", -1), "2026-07-21");
  assert.equal(shiftGanttAnchor("half", "2026-10-31", 1), "2027-03-01");
  assert.equal(shiftGanttAnchor("year", "2026-10-31", -1), "2025-12-01");
  // A shifted anchor always yields a valid window.
  for (const zoom of GANTT_ZOOMS) assert.ok(ganttWindow(zoom, shiftGanttAnchor(zoom, "2026-01-31", 1)).columns.length > 0, zoom);
});
