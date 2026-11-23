import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CHIP_LABEL, available, byLoad, rowFlags } from "../lib/team-week.ts";
import { TEAM_WEEK_COPY } from "../app/system/production/team-week-copy.ts";
import { MY_WEEK_COPY } from "../app/system/production/my-week-copy.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Team week (owner decision 2026-11-23, part 2 of the My week design): everyone's week in hours on Team overview, the
 * allocation queue beside it; My Work keeps three tabs, with active work, new assignments and the work order under
 * Assigned to me.
 */
const day = (change = {}) => ({ date: "2026-11-23", working: true, booked: 0, meetings: 0, tasks: 0, away: 0, total: 0, free: 8, confirmed: null, chips: [], ...change });
const row = (change = {}) => ({ userId: 7, days: [day()], total: 0, away: 0, capacity: 40, confirmed: 0, unconfirmedDays: 0, ...change });

test("who falls under each filter: over capacity, 8 hours free, hours not confirmed, away", () => {
  assert.deepEqual(rowFlags(row({ total: 41 })), { over: true, free: false, pending: false, leave: false });
  assert.equal(rowFlags(row({ total: 20, days: [day({ total: 9 })] })).over, true, "one day over 8 hours is over capacity");
  assert.equal(rowFlags(row({ total: 30, away: 4, days: [day({ total: 6, away: 4 })] })).over, true, "time away counts against the day");
  assert.deepEqual(rowFlags(row({ total: 28, unconfirmedDays: 2 })), { over: false, free: true, pending: true, leave: false });
  assert.equal(rowFlags(row({ total: 25, away: 8 })).free, false, "time away is taken off what is free");
  assert.equal(available(row({ away: 8 })), 32);
  const people = [
    { name: "B", row: row({ total: 20 }) },
    { name: "A", row: row({ total: 20 }) },
    { name: "C", row: row({ total: 38 }) },
  ];
  assert.deepEqual(
    [...people].sort(byLoad).map((person) => person.name),
    ["C", "A", "B"],
  );
  for (const key of Object.values(CHIP_LABEL)) assert.ok(TEAM_WEEK_COPY[key], `${key} needs words`);
});

test("Team overview opens on Team week, with the allocation queue beside it and every word in three languages", async () => {
  const screen = await source("app/system/production/ResourcePlanningScreen.tsx");
  assert.match(screen, /type ResourceTab = "week" \| "board" \| "list" \| "workload" \| "tasks";/);
  assert.match(screen, /const BOARD_TABS: readonly ResourceTab\[\] = \["week", "board", "list"\];/);
  assert.match(screen, /RESOURCE_TABS, "week"\)/);
  assert.match(screen, /\{ id: "week" as const, label: "TeamWeek\.tab" \},/);
  assert.match(screen, /<TeamWeek bootstrap=\{bootstrap\} queue=\{canRead \? queuePanel : null\} \/>/);
  assert.match(screen, /const wantsData = canRead && \(tab === "workload" \|\| tab === "week"\) && data === null && !error;/);
  assert.equal(screen.match(/\{queuePanel\}/g)?.length, 1, "Allocation · weekly keeps the same queue");
  const week = await source("app/system/production/TeamWeekScreen.tsx");
  assert.match(week, /apiRequest<TeamWeekData>\(`\/api\/v1\/team-week\?from=\$\{monday\}&to=\$\{addDays\(monday, 4\)\}`\)/);
  const used = new Set([...week.matchAll(/"(TeamWeek\.[A-Za-z]+)"/g)].map((match) => match[1]));
  assert.ok(used.size > 10);
  for (const key of used) {
    const entry = TEAM_WEEK_COPY[key];
    assert.ok(entry && entry.en && entry.th && entry.jp, `${key} needs th / en / jp`);
  }
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
