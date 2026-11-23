import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CHIP_LABEL, plannerDay, plannerTotals } from "../lib/team-week.ts";
import { TEAM_WEEK_COPY } from "../app/system/production/team-week-copy.ts";
import { MY_WEEK_COPY } from "../app/system/production/my-week-copy.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Team planner (owner decision 2026-11-23): the daily grid and Team week in one table, in hours, over one, two or four
 * weeks, the allocation queue beside it. Each cell shows one figure: the hours confirmed, else booked on My week, else
 * planned. My Work keeps three tabs, with active work, new assignments and the work order under Assigned to me.
 */
const week = (change = {}) => ({ date: "2026-11-25", working: true, booked: 0, meetings: 0, tasks: 0, away: 0, total: 0, free: 8, confirmed: null, chips: [], ...change });
const day = (change = {}) => ({ date: "2026-11-25", today: "2026-11-25", planManDays: 0, availableManDays: 1, awayAllDay: false, week: week(), ...change });

test("a cell shows one figure: the hours confirmed, else booked on My week, else the plan, never added together", () => {
  // Planned 0.75 MD with a 1.5 h meeting already in the board's load: 6 h, from the plan.
  assert.deepEqual(plannerDay(day({ planManDays: 0.75 })), { hours: 6, capacity: 8, away: 0, source: "plan", over: false, pending: true });
  // Booked on My week: Team week's total (blocks, meetings and team tasks), not the plan as well.
  assert.deepEqual(plannerDay(day({ planManDays: 0.75, week: week({ booked: 5, meetings: 2, total: 7 }) })), { hours: 7, capacity: 8, away: 0, source: "booked", over: false, pending: true });
  // Confirmed beats both, even below what was planned or booked.
  const confirmed = plannerDay(day({ planManDays: 1.25, week: week({ booked: 9, total: 9, confirmed: 7.5 }) }));
  assert.deepEqual([confirmed.hours, confirmed.source, confirmed.over, confirmed.pending], [7.5, "confirmed", false, false]);
  // Over what the day offers: more than its hours, or work on a day away all day.
  assert.equal(plannerDay(day({ planManDays: 1.25 })).over, true);
  assert.deepEqual(plannerDay(day({ planManDays: 1, week: week({ away: 8 }) })), { hours: 8, capacity: 0, away: 8, source: "plan", over: true, pending: false });
  // Half a day away takes four hours off the day.
  assert.deepEqual([plannerDay(day({ planManDays: 0.5, week: week({ away: 4 }) })).capacity, plannerDay(day({ planManDays: 0.5, week: week({ away: 4 }) })).over], [4, false]);
  // A weekend offers nothing and is never over; booked weekend work still shows.
  const weekend = plannerDay(day({ availableManDays: 0, week: week({ working: false, booked: 3, total: 3 }) }));
  assert.deepEqual([weekend.hours, weekend.capacity, weekend.over, weekend.pending], [3, 0, false, false]);
  // A day to come is never waiting for confirmation; without Team week the board's leave still takes the day.
  assert.equal(plannerDay(day({ date: "2026-11-26" })).pending, false);
  assert.deepEqual(plannerDay(day({ week: null, awayAllDay: true })), { hours: 0, capacity: 0, away: 8, source: "plan", over: false, pending: false });
});

test("a person's days on show: hours against capacity, and the filters they fall under", () => {
  const days = [
    plannerDay(day({ date: "2026-11-23", planManDays: 1, week: week({ date: "2026-11-23", confirmed: 8 }) })),
    plannerDay(day({ date: "2026-11-24", planManDays: 1, week: week({ date: "2026-11-24", booked: 9, total: 10 }) })),
    plannerDay(day({ date: "2026-11-25", planManDays: 0.25, week: week({ away: 4 }) })),
    plannerDay(day({ date: "2026-11-26", planManDays: 0 })),
  ];
  const totals = plannerTotals(days);
  assert.deepEqual([totals.total, totals.capacity, totals.pendingDays], [20, 28, 2]);
  // Over on one day though the total has room; 8 hours free over the days; a day awaiting confirmation; half a day away.
  assert.deepEqual(totals.flags, { over: true, free: true, pending: true, leave: true });
  assert.deepEqual(plannerTotals([plannerDay(day({ planManDays: 0.5, date: "2026-11-26" }))]).flags, { over: false, free: false, pending: false, leave: false });
  for (const key of Object.values(CHIP_LABEL)) assert.ok(TEAM_WEEK_COPY[key], `${key} needs words`);
});

test("Team overview opens on Team planner, with the allocation queue beside it and every word in three languages", async () => {
  const screen = await source("app/system/production/ResourcePlanningScreen.tsx");
  assert.match(screen, /type ResourceTab = "week" \| "board" \| "list" \| "workload" \| "tasks";/);
  assert.match(screen, /const BOARD_TABS: readonly ResourceTab\[\] = \["week", "list"\];/);
  assert.match(screen, /RESOURCE_TABS, "week"\)/);
  assert.match(screen, /\{ id: "week" as const, label: "TeamWeek\.tab" \}/);
  assert.match(screen, /<TeamBoard\s+bootstrap=\{bootstrap\}\s+notify=\{notify\}\s+mode="board"/);
  assert.match(screen, /queue=\{canRead \? queuePanel : null\}\s+queueCount=\{canRead \? waiting\.length : 0\}/);
  assert.doesNotMatch(screen, /TeamWeekScreen|mode="actions"/);
  assert.match(screen, /const wantsData = canRead && \(tab === "workload" \|\| tab === "week"\) && data === null && !error;/);
  assert.equal(screen.match(/\{queuePanel\}/g)?.length, 1, "Allocation · weekly keeps the same queue");
  const board = await source("app/system/production/TeamBoard.tsx");
  assert.match(board, /export type TeamBoardMode = "board" \| "list";/);
  // The guide marks Team week's steps used stay on the planner.
  assert.match(board, /data-guide="teamweek\.table"/);
  assert.match(board, /data-guide="teamweek\.chips"/);
  const used = new Set([...board.matchAll(/"(TeamWeek\.[A-Za-z]+)"/g)].map((match) => match[1]));
  assert.ok(used.size >= 5);
  for (const key of used) {
    const entry = TEAM_WEEK_COPY[key];
    assert.ok(entry && entry.en && entry.th && entry.jp, `${key} needs th / en / jp`);
  }
  assert.equal(TEAM_WEEK_COPY["TeamWeek.tab"].th, "แผนงานทีม");
  assert.match(await source("app/system/i18n.ts"), /\.\.\.MY_WEEK_COPY,\n\s*\.\.\.TEAM_WEEK_COPY,/);
  assert.match(await source("backend-node/src/app.ts"), /registerTeamWeekRoutes\(app, database, users\);/);
});

test("My Work has three tabs; active work, new assignments and the work order sit under Assigned to me", async () => {
  const myWork = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(myWork, /const ASSIGNED_TABS: readonly MyWorkTab\[\] = \["active", "new", "queue"\];/);
  assert.match(
    myWork,
    /\{ id: "week", label: "MyWeek\.tab" \},\n\s*\{ id: "assigned", label: "MyWork\.assignedTab", count: newAssignmentCount \+ open\.length \+ actionableEstimateAssignments\.length \},\n\s*\{ id: "updates", label: "My Updates", count: updates\.length \},/,
  );
  assert.match(myWork, /onChange=\{\(next\) => pickTab\(next === "assigned" \? "active" : next\)\}/);
  assert.match(myWork, /\{ id: "active", label: "My Active Work"[^\n]*\n\s*\{ id: "new", label: "New Assignments", count: newAssignmentCount \},\n\s*\{ id: "queue", label: "WorkQueue\.myTab" \},/);
  const entry = MY_WEEK_COPY["MyWork.assignedTab"];
  assert.ok(entry && entry.th === "งานที่ได้รับ" && entry.en && entry.jp);
});
