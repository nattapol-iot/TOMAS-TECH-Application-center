import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calendarLagToWorking, linkText, mondayOn, parseDays, parseLink, parsePercent, parseSheetDate, sheetOrder, shiftDay, spanDays, workingLagToCalendar } from "../lib/plan-sheet.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");
const today = "2026-11-24";

test("dates typed in a cell: the team's day/month forms, ISO, Buddhist-era years, Excel day numbers and +N", () => {
  assert.equal(parseSheetDate("19/11/26", today), "2026-11-19");
  assert.equal(parseSheetDate("19/11/2026", today), "2026-11-19");
  assert.equal(parseSheetDate(" 19.11.26 ", today), "2026-11-19");
  assert.equal(parseSheetDate("2026-11-19", today), "2026-11-19");
  assert.equal(parseSheetDate("19/11/69", today), "2026-11-19", "two-digit Buddhist era");
  assert.equal(parseSheetDate("19/11/2569", today), "2026-11-19", "four-digit Buddhist era");
  assert.equal(parseSheetDate("46345", today), "2026-11-19", "an Excel day number");
  // No year: the one nearest the reference date.
  assert.equal(parseSheetDate("19/11", today), "2026-11-19");
  assert.equal(parseSheetDate("5/1", today), "2027-01-05");
  assert.equal(parseSheetDate("20/12", "2027-02-10"), "2026-12-20");
  // A month over 12 reads the other way round, as a US-ordered date.
  assert.equal(parseSheetDate("11/13/26", today), "2026-11-13");
  assert.equal(parseSheetDate("+3", today, "2026-11-19"), "2026-11-22");
  assert.equal(parseSheetDate("+3", today), null, "+N needs a day to count from");
  assert.equal(parseSheetDate("", today), "");
  assert.equal(parseSheetDate("31/02/26", today), null);
  assert.equal(parseSheetDate("next week", today), null);
});

test("percentages and day counts typed in a cell", () => {
  assert.equal(parsePercent("50"), 50);
  assert.equal(parsePercent("50%"), 50);
  assert.equal(parsePercent("100 %"), 100);
  assert.equal(parsePercent("33.6"), 34);
  assert.equal(parsePercent("101"), null);
  assert.equal(parsePercent("-1"), null);
  assert.equal(parsePercent("half"), null);
  assert.equal(parseDays("5"), 5);
  assert.equal(parseDays("0"), null);
  assert.equal(parseDays("1.5"), null);
  assert.equal(parseDays("3651"), null);
  assert.equal(shiftDay("2026-12-30", 3), "2027-01-02");
  assert.equal(spanDays("2026-11-19", "2026-11-19"), 1);
  assert.equal(spanDays("2026-11-19", "2026-11-25"), 7);
  assert.equal(mondayOn("2026-11-26"), "2026-11-23");
  assert.equal(mondayOn("2026-11-23"), "2026-11-23");
  assert.equal(mondayOn("2026-11-29"), "2026-11-23");
});

test("a gap typed in work days is stored as the calendar days the API counts (owner 2026-11-24)", () => {
  const none = new Set();
  // The predecessor ends on Friday 20 Nov 2026.
  assert.equal(workingLagToCalendar("2026-11-20", 0, none), 0, "no gap stays 0: the next work day wherever the predecessor moves");
  assert.equal(workingLagToCalendar("2026-11-20", 2, none), 4, "Mon and Tue skipped, the row starts on Wednesday 25");
  assert.equal(workingLagToCalendar("2026-11-20", 2, new Set(["2026-11-24"])), 5, "a company holiday is not a work day either");
  assert.equal(workingLagToCalendar("2026-11-20", -1, none), -1, "an overlap stays calendar days");
  assert.equal(calendarLagToWorking("2026-11-20", 4, none), 2);
  assert.equal(calendarLagToWorking("2026-11-20", 5, new Set(["2026-11-24"])), 2);
  assert.equal(calendarLagToWorking("2026-11-20", 0, none), 0);
  for (const lag of [1, 3, 7, 12]) assert.equal(calendarLagToWorking("2026-11-18", workingLagToCalendar("2026-11-18", lag, none), none), lag, `round trip of +${lag}`);
});

// 1 heading > 1.1 task, 1.2 task after 1.1 > 1.2.1 sub task, 1.3 task after 1.1.
const rows = [
  { id: 1, parentId: null, wbs: "1", kind: "phase", predecessorId: null, startMode: "manual" },
  { id: 2, parentId: 1, wbs: "1.1", kind: "task", predecessorId: null, startMode: "manual" },
  { id: 3, parentId: 1, wbs: "1.2", kind: "task", predecessorId: 2, startMode: "linked" },
  { id: 4, parentId: 3, wbs: "1.2.1", kind: "task", predecessorId: null, startMode: "manual" },
  { id: 5, parentId: 1, wbs: "1.3", kind: "task", predecessorId: 2, startMode: "linked" },
];

test("the After cell: what it shows and what typing in it means", () => {
  assert.equal(linkText(rows[2], rows, 2), "1.1+2");
  assert.equal(linkText(rows[2], rows, 0), "1.1");
  assert.equal(linkText(rows[1], rows, 0), "", "a row typed by hand follows nothing");
  assert.deepEqual(parseLink("", rows[2], rows), { predecessorId: null, lagDays: 0 });
  assert.deepEqual(parseLink("1.1+2", rows[2], rows), { predecessorId: 2, lagDays: 2 });
  assert.deepEqual(parseLink("1.1 + 2", rows[2], rows), { predecessorId: 2, lagDays: 2 });
  assert.deepEqual(parseLink("1.1-1", rows[2], rows), { predecessorId: 2, lagDays: -1 });
  assert.deepEqual(parseLink("after 1.1", rows[2], rows), { error: "Sheet.linkUnreadable" });
  assert.deepEqual(parseLink("9.9", rows[2], rows), { error: "Sheet.linkMissing", wbs: "9.9" });
  assert.deepEqual(parseLink("1.2", rows[2], rows), { error: "Sheet.linkSelf", wbs: "1.2" });
  assert.deepEqual(parseLink("1", rows[2], rows), { error: "Sheet.linkHeading", wbs: "1" });
  assert.deepEqual(parseLink("1.2.1", rows[2], rows), { error: "Sheet.linkFamily", wbs: "1.2.1" });
  assert.deepEqual(parseLink("1.2", rows[3], rows), { error: "Sheet.linkFamily", wbs: "1.2" });
  assert.deepEqual(parseLink("1.3", rows[1], rows), { error: "Sheet.linkLoop", wbs: "1.3" }, "1.3 already waits for 1.1");
  // 1.2 takes its dates from its sub task, so its own link does not count and 1.1 may follow it.
  assert.deepEqual(parseLink("1.2", rows[1], rows), { predecessorId: 3, lagDays: 0 });
});

test("rows read heading first, then what sits under it", () => {
  const tree = [
    {
      id: 1,
      children: [
        { id: 2, children: [] },
        { id: 3, children: [{ id: 4, children: [] }] },
      ],
    },
    { id: 5, children: [] },
  ];
  assert.deepEqual(
    sheetOrder(tree).map((row) => row.id),
    [1, 2, 3, 4, 5],
  );
});

test("the Sheet is the V2 plan's first view, with its guide marks and copy", async () => {
  const screen = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(screen, /useLinkedState<PlanLevel>\("level", v2 \? "sheet" : "team", PLAN_LEVEL_LINK\)/);
  assert.match(screen, /const level: PlanLevel = !v2 && storedLevel === "sheet" \? "team" : storedLevel;/, "V1 has no Sheet");
  assert.match(screen, /v2 \? \(\["sheet", "team", "master", "member", "people"\] as const\) : \(\["team", "master", "member", "people"\] as const\)/);
  const sheet = await source("app/system/production/PlanSheet.tsx");
  for (const mark of ["plan.sheet", "plan.sheetAdd", "plan.sheetAfter"]) assert.ok(sheet.includes(`data-guide="${mark}"`), mark);
  const keys = [...sheet.matchAll(/"(Sheet\.[A-Za-z]+)"/g)].map((match) => match[1]);
  const copy = await source("app/system/production/plan-sheet-copy.ts");
  for (const key of new Set(keys)) assert.match(copy, new RegExp(`\\[\\s*"${key.replace(".", "\\.")}",`), `${key} has copy`);
  assert.match(await source("app/system/i18n.ts"), /\.\.\.PLAN_SHEET_COPY,/);
});

test("a task under a main heading may wait for its member (owner 2026-11-24)", async () => {
  const routes = await source("backend-node/src/routes/schedule.ts");
  assert.match(routes, /if \(parent\.kind === "phase"\) return \[\];/);
  assert.ok(!routes.includes(`"schedule_member_required", "A task under a main heading`));
});
