import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { linkedStart, workLagBetween } from "../lib/gantt.ts";
import { linkText, mondayOn, parseDays, parseLink, parsePercent, parseSheetDate, sheetOrder, shiftDay, spanDays } from "../lib/plan-sheet.ts";

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

test("a gap typed in work days is stored as work days, as the API counts it (owner 2026-11-24, migration 125)", () => {
  const none = new Set();
  // The predecessor ends on Friday 20 Nov 2026.
  assert.equal(linkedStart("2026-11-20", 0, none), "2026-11-23", "no gap: the next work day wherever the predecessor moves");
  assert.equal(linkedStart("2026-11-20", 2, none), "2026-11-25", "Mon and Tue skipped, the row starts on Wednesday 25");
  assert.equal(linkedStart("2026-11-20", 2, new Set(["2026-11-24"])), "2026-11-26", "a company holiday is not a work day either");
  assert.equal(linkedStart("2026-11-20", -1, none), "2026-11-20", "an overlap of one work day");
  for (const lag of [-2, 0, 1, 3, 7, 12]) assert.equal(workLagBetween("2026-11-18", linkedStart("2026-11-18", lag, none), none), lag, `round trip of ${lag}`);
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
  assert.deepEqual(parseLink("", rows[2], rows), { predecessorId: null, lagDays: 0, extraLinks: [] });
  assert.deepEqual(parseLink("1.1+2", rows[2], rows), { predecessorId: 2, lagDays: 2, extraLinks: [] });
  assert.deepEqual(parseLink("1.1 + 2", rows[2], rows), { predecessorId: 2, lagDays: 2, extraLinks: [] });
  assert.deepEqual(parseLink("1.1-1", rows[2], rows), { predecessorId: 2, lagDays: -1, extraLinks: [] });
  assert.deepEqual(parseLink("after 1.1", rows[2], rows), { error: "Sheet.linkUnreadable" });
  assert.deepEqual(parseLink("9.9", rows[2], rows), { error: "Sheet.linkMissing", wbs: "9.9" });
  assert.deepEqual(parseLink("1.2", rows[2], rows), { error: "Sheet.linkSelf", wbs: "1.2" });
  assert.deepEqual(parseLink("1", rows[2], rows), { error: "Sheet.linkHeading", wbs: "1" });
  assert.deepEqual(parseLink("1.2.1", rows[2], rows), { error: "Sheet.linkFamily", wbs: "1.2.1" });
  assert.deepEqual(parseLink("1.2", rows[3], rows), { error: "Sheet.linkFamily", wbs: "1.2" });
  assert.deepEqual(parseLink("1.3", rows[1], rows), { error: "Sheet.linkLoop", wbs: "1.3" }, "1.3 already waits for 1.1");
  // 1.2 takes its dates from its sub task, so its own link does not count and 1.1 may follow it.
  assert.deepEqual(parseLink("1.2", rows[1], rows), { predecessorId: 3, lagDays: 0, extraLinks: [] });
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

test("the After cell takes several rows: the row starts after the latest (migration 126)", () => {
  // 1.3 waits for 1.1 and 1.2.1; 1.2 cannot be named while 1.2.1 sits under it, so 1.2.1 is used.
  assert.deepEqual(parseLink("1.1, 1.2.1+3", rows[4], rows), { predecessorId: 2, lagDays: 0, extraLinks: [{ predecessorId: 4, lagDays: 3 }] });
  assert.deepEqual(parseLink("1.1；1.2.1", rows[4], rows), { error: "Sheet.linkUnreadable" }, "only commas and semicolons split");
  assert.deepEqual(parseLink("1.1; 1.2.1", rows[4], rows), { predecessorId: 2, lagDays: 0, extraLinks: [{ predecessorId: 4, lagDays: 0 }] });
  assert.deepEqual(parseLink("1.1, 1.1+2", rows[4], rows), { error: "Sheet.linkTwice", wbs: "1.1" });
  assert.deepEqual(parseLink("1.1, 9", rows[4], rows), { error: "Sheet.linkMissing", wbs: "9" });
  assert.deepEqual(parseLink(Array.from({ length: 12 }, () => "1.1").join(","), rows[4], rows), { error: "Sheet.linkTooMany" });
  // 1.1 waiting for 1.3 as a second row would loop: 1.3 already waits for 1.1.
  const loop = parseLink("1.2.1, 1.3", rows[1], rows);
  assert.equal(loop.error, "Sheet.linkLoop");
  assert.equal(
    linkText(
      {
        startMode: "linked",
        predecessorId: 2,
        extraLinks: [
          { predecessorId: 4, lagDays: 3 },
          { predecessorId: 99, lagDays: 0 },
        ],
      },
      rows,
      1,
    ),
    "1.1+1, 1.2.1+3",
    "a row no longer in the plan is left out",
  );
});

test("planned hours are typed as hours or man-days (task doc 3.1)", async () => {
  const { parseHours, hoursText } = await import("../lib/plan-sheet.ts");
  assert.equal(parseHours("16"), 16);
  assert.equal(parseHours("16h"), 16);
  assert.equal(parseHours("16 ชม."), 16);
  assert.equal(parseHours("2 MD"), 16);
  assert.equal(parseHours("2md"), 16);
  assert.equal(parseHours("1.5 วัน"), 12);
  assert.equal(parseHours("3 days"), 24);
  assert.equal(parseHours("2,5"), 2.5);
  assert.equal(parseHours("1,000"), 1000, "a thousands separator");
  assert.equal(parseHours(""), 0);
  assert.equal(parseHours("two"), null);
  assert.equal(parseHours("-4"), null);
  assert.equal(hoursText(0), "");
  assert.equal(hoursText(12.34), "12.3");
});
