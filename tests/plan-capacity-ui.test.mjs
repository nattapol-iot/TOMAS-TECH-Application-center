import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BOARD_MAX_DAYS, boardAway, boardWindow } from "../app/system/production/plan-capacity.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Part-time planning on the Sheet (owner decisions 2026-11-25, mockup boards 19-22): the hours a day of each row, its
 * member's free time over every project, the forecast past the row's end, the follow-up lists, and the time of a row in a
 * panel built on @tomas-tc/ui.
 */
test("the board is read from the plan's first day (not before today) to its end and the forecast's room, at most 400 days", () => {
  assert.deepEqual(boardWindow("2026-12-01", "2026-12-16", "2026-11-25"), { from: "2026-12-01", to: "2027-04-15" });
  assert.deepEqual(boardWindow("2026-11-01", "2026-12-16", "2026-11-25"), { from: "2026-11-25", to: "2027-04-15" });
  const long = boardWindow("2026-11-25", "2028-01-01", "2026-11-25");
  assert.ok(long.to <= "2027-11-25", `capped (${long.to}); BOARD_MAX_DAYS ${BOARD_MAX_DAYS}`);
  assert.equal(boardWindow(null, "2026-12-16", "2026-11-25"), null);
});

test("time away is the days away and the Away team tasks, a morning or an afternoon as half a day", () => {
  assert.deepEqual(
    boardAway({
      away: [{ userId: 3, start: "2026-12-01", end: "2026-12-02" }],
      tasks: [
        { kind: "Away", status: "Planned", assigneeIds: [3, 4], startDate: "2026-12-09", endDate: "2026-12-09", slot: "PM" },
        { kind: "Away", status: "Cancelled", assigneeIds: [3], startDate: "2026-12-10", endDate: "2026-12-10", slot: "Day" },
        { kind: "Task", status: "Planned", assigneeIds: [3], startDate: "2026-12-11", endDate: "2026-12-11", slot: "Day" },
      ],
    }),
    [
      { userId: 3, start: "2026-12-01", end: "2026-12-02", slot: "Day" },
      { userId: 3, start: "2026-12-09", end: "2026-12-09", slot: "PM" },
      { userId: 4, start: "2026-12-09", end: "2026-12-09", slot: "PM" },
    ],
  );
});

test("the Sheet has A day and Free time after Plan h, read-only, and reads the board over the plan's dates", async () => {
  const sheet = await source("app/system/production/PlanSheet.tsx");
  assert.match(
    sheet,
    /\{ key: "hplan"[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*\{ key: "hday", label: "Sheet\.colPerDay", sub: "Sheet\.subPerDay"[^\n]*\n\s*\{ key: "fit", label: "Sheet\.colFit", sub: "Sheet\.subFit"/,
  );
  assert.match(sheet, /column === "hday" \|\| column === "fit"\) return "Sheet\.calculated";/);
  assert.match(sheet, /const capacity = usePlanCapacity\(planSpan, schedule\.scheduleVersion \?\? ""\);/);
  assert.match(sheet, /planFit\(\s*\{\s*id: row\.task\.id,\s*start: row\.start,\s*end: row\.finish,\s*picIds: row\.fields\.picUserIds,\s*planHours: row\.planHours,\s*actualHours: row\.actualHours,/);
  // A heading is judged against the customer's dates: its own stored dates.
  assert.match(sheet, /row\.task\.storedPlanStart \? shiftDay\(row\.task\.storedPlanStart, Math\.max\(1, row\.task\.planDays\) - 1\) : row\.finish/);
  // The forecast past the row's end is hatched on the Gantt.
  assert.match(sheet, /<div key="fc" className="gb fc"/);
  // Follow-ups: free time short, past the customer's dates, and rows with a member and no hours (not counted).
  for (const key of ["short", "pastHeading", "noEffort"]) assert.match(sheet, new RegExp(`\\{ key: "${key}", rows: \\[\\] \\}`), key);
  // The row's time opens in the @tomas-tc/ui panel, loaded when first opened.
  assert.match(sheet, /const AllocationPanel = lazy\(\(\) => import\("\.\.\/tomas-ui\/AllocationPanel"\)/);
  assert.match(sheet, /onClick=\{\(\) => setAllocFor\(task\.id\)\}/);
  // Week by week: the People table's figures, 8 hours a person-day, saved with the plan's version.
  assert.match(sheet, /\/api\/v1\/projects\/\$\{schedule\.projectId\}\/schedule\/people/);
  assert.match(sheet, /rows: \[\{ taskId: allocRow\.task\.id, plan: \{ planStart: start, planDays: span, people \} \}\]/);
});

test("the panel is built on @tomas-tc/ui inside a TomasUi root, with its guide marks", async () => {
  const panel = await source("app/system/tomas-ui/AllocationPanel.tsx");
  assert.match(panel, /from "@tomas-tc\/ui";/);
  assert.match(panel, /<TomasUi>\s*<Sheet open=\{props\.open\}/);
  for (const mark of ["plan.alloc", "plan.allocWeeks", "plan.allocLoad", "plan.allocFixes", "plan.allocWeeklyToggle", "plan.allocWeekly", "plan.allocPerDay"])
    assert.ok(panel.includes(`data-guide="${mark}"`), mark);
  // Nothing moves by itself: each fix is a button the planner presses.
  assert.match(panel, /onClick=\{\(\) => props\.onFix\(fix\)\}/);
});

test("rows with no hours take nobody's time on the board, the planner and Allocation", async () => {
  const [planning, board] = await Promise.all([source("lib/resource-planning.ts"), source("lib/team-board.ts")]);
  assert.doesNotMatch(planning, /impliedEffort/);
  assert.doesNotMatch(board, /impliedEffort|fullDay/);
  assert.match(board, /noHours: !typed && item\.type === "Project"/);
});
