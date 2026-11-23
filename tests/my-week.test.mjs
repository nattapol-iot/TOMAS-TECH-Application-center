import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { blockBody, dayBooked, dayItems, freeSlot, gridWindow, hoursLeft, laneOf, overlapsBlocks, shownDates, timeChoices, weekSummary } from "../lib/my-week.ts";
import { MY_WEEK_COPY } from "../app/system/production/my-week-copy.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * My week (owner decision 2026-11-23): people plan their week on the app's calendar instead of typing it into Outlook.
 * The blocks they book go into Outlook and draft the day's hours; the day is confirmed in its footing.
 */
const block = (change) => ({
  id: 1,
  date: "2026-11-25",
  start: "08:30",
  end: "10:00",
  workKey: "Project-11",
  kind: "Project",
  projectId: 1,
  projectNo: "PJ260101",
  title: "Wiring",
  reference: "PJ260101 · 2.1",
  outlookState: "Synced",
  outlookError: null,
  ...change,
});
const week = (change = {}) => ({
  blocks: [block({}), block({ id: 2, start: "13:00", end: "15:00", workKey: "Project-12", title: "PLC" })],
  meetings: [
    { id: 70, subject: "Vendor call", location: null, private: false, allDay: false, start: "2026-11-25T14:00:00", end: "2026-11-25T15:00:00", linkedWorkKey: null },
    { id: 71, subject: "Fair", location: null, private: false, allDay: true, start: "2026-11-26T00:00:00", end: "2026-11-27T00:00:00", linkedWorkKey: null },
  ],
  teamTasks: [
    { id: 50, kind: "Away", title: "Dentist", projectNo: null, start: "2026-11-27", end: "2026-11-27", slot: "AM", startTime: null, endTime: null },
    { id: 51, kind: "Appointment", title: "Site survey", projectNo: "PJ260114", start: "2026-11-24", end: "2026-11-24", slot: "Time", startTime: "10:00", endTime: "11:30" },
  ],
  leave: [],
  ...change,
});

test("a day's calendar: blocks, meetings and team tasks at their times, whole-day items above the grid", () => {
  const wednesday = dayItems("2026-11-25", week());
  assert.deepEqual(
    wednesday.timed.map((item) => [item.key, item.start, item.end]),
    [
      ["b1", 510, 600],
      ["b2", 780, 900],
      ["m70", 840, 900],
    ],
  );
  assert.deepEqual(
    dayItems("2026-11-26", week()).allDay.map((item) => item.key),
    ["m71"],
    "an all-day meeting sits above the grid, on its own day only",
  );
  assert.equal(dayItems("2026-11-27", week()).allDay.length, 0);
  assert.deepEqual(
    dayItems("2026-11-27", week()).timed.map((item) => [item.type, item.start, item.end]),
    [["leave", 510, 720]],
    "a morning away is 08:30-12:00",
  );
  assert.deepEqual(
    dayItems("2026-11-24", week()).timed.map((item) => [item.type, item.start, item.end]),
    [["task", 600, 690]],
  );
  // Overlapping items sit side by side.
  assert.deepEqual(laneOf(wednesday.timed), { lanes: [0, 0, 1], count: 2 });
  assert.deepEqual(gridWindow(wednesday.timed), { start: 480, end: 1080 });
  assert.deepEqual(gridWindow([{ start: 420, end: 1230 }]), { start: 420, end: 1260 }, "the grid widens to whole hours around early or late work");
});

test("booking: the first free hour of the day, around lunch and what is booked; overlaps with blocks are refused", () => {
  const wednesday = dayItems("2026-11-25", week()).timed;
  assert.deepEqual(freeSlot(wednesday), { start: 600, end: 660 });
  assert.deepEqual(freeSlot(wednesday, 60, 690), { start: 900, end: 960 }, "11:30-12:00 is too short, then lunch, then the afternoon is booked until 15:00");
  assert.deepEqual(freeSlot([{ type: "block", start: 510, end: 1050 }]), null);
  assert.equal(overlapsBlocks(week().blocks, "2026-11-25", 540, 570), true);
  assert.equal(overlapsBlocks(week().blocks, "2026-11-25", 600, 780), false, "touching ends do not overlap");
  assert.equal(overlapsBlocks(week().blocks, "2026-11-25", 540, 570, 1), false, "a block may move inside its own time");
  assert.deepEqual(blockBody({ date: "2026-11-25", start: "10:00", end: "11:00", workKey: "Project-11", note: "", projectId: "" }), {
    date: "2026-11-25",
    start: "10:00",
    end: "11:00",
    workKey: "Project-11",
  });
  assert.deepEqual(blockBody({ date: "2026-11-25", start: "10:00", end: "11:00", workKey: "", note: " Training ", projectId: "4" }), {
    date: "2026-11-25",
    start: "10:00",
    end: "11:00",
    note: "Training",
    projectId: 4,
  });
  assert.equal(timeChoices(false)[0], "00:00");
  assert.equal(timeChoices(true).at(-1), "24:00");
  assert.equal(hoursLeft({ budgetHours: 40, confirmedHours: 6 }), 34);
  assert.equal(hoursLeft({ budgetHours: null, confirmedHours: 6 }), null);
});

test("the week in hours: capacity less time away, booked blocks and meetings, and what is confirmed", () => {
  const day = (date, change = {}) => ({
    date,
    working: true,
    holiday: false,
    weekend: false,
    awayHours: 0,
    editable: true,
    future: false,
    confirmed: null,
    rows: [],
    draft: [],
    draftHours: 0,
    ...change,
  });
  const dates = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27"];
  const data = {
    ...week(),
    today: "2026-11-25",
    editableFrom: "2026-10-26",
    hoursPerDay: 8,
    choices: [],
    projects: [],
    backlog: [],
    outlookWrite: { state: "ok", waiting: 0 },
    days: [
      day(dates[0], { confirmed: { at: "", times: 1, hours: 8 } }),
      day(dates[1]),
      day(dates[2]),
      day(dates[3]),
      day(dates[4], { awayHours: 4 }),
      day("2026-11-28", { working: false }),
      day("2026-11-29", { working: false }),
    ],
  };
  // Wednesday: 1.5 h + 2 h of blocks and a 1 h meeting.
  assert.equal(dayBooked("2026-11-25", data), 4.5);
  assert.deepEqual(weekSummary(data, dates), { capacity: 40, booked: 4.5, away: 4, free: 31.5, confirmed: 8 });
  assert.deepEqual(shownDates("2026-11-23", data), dates, "an empty weekend is not shown");
  assert.equal(shownDates("2026-11-23", { ...data, blocks: [...data.blocks, block({ id: 9, date: "2026-11-28" })] }).length, 6);
});

test("My Work opens on My week; the hours strip moved into the calendar; every word is in three languages", async () => {
  const myWork = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(myWork, /type MyWorkTab = "week" \| "new" \| "active" \| "queue" \| "updates";/);
  assert.match(myWork, /useState<MyWorkTab>\("week"\)/);
  assert.match(myWork, /\{ id: "week", label: "MyWeek\.tab" \},\n\s*\{ id: "new", label: "New Assignments"/);
  assert.match(myWork, /\{tab === "week" \? <MyWeek notify=\{notify\} \/> : null\}/);
  assert.doesNotMatch(myWork, /<WorkDaysPanel/);
  const screen = await source("app/system/production/MyWeekScreen.tsx");
  const used = new Set([...screen.matchAll(/"(MyWeek\.[A-Za-z]+)"/g)].map((match) => match[1]));
  assert.ok(used.size > 30);
  for (const key of used) {
    const entry = MY_WEEK_COPY[key];
    assert.ok(entry && entry.en && entry.th && entry.jp, `${key} needs th / en / jp`);
  }
  const i18n = await source("app/system/i18n.ts");
  assert.match(i18n, /import \{ MY_WEEK_COPY \} from "\.\/production\/my-week-copy";/);
  assert.match(i18n, /\.\.\.WORK_DAYS_COPY,\n\s*\.\.\.MY_WEEK_COPY,/);
  // The day's footing confirms with one press and opens the day dialog to change it.
  assert.match(screen, /apiRequest\("\/api\/v1\/me\/work-days\/confirm", \{ method: "POST", body: JSON\.stringify\(\{ dates: \[date\] \}\) \}\)/);
  assert.match(screen, /<WorkDayDialog/);
  assert.match(await source("app/system/production/WorkDaysPanel.tsx"), /export function WorkDayDialog\(/);
});

test("migration 124 is registered and can be undone", async () => {
  const migration = await source("database/migrations/124_my_week_calendar.sql");
  assert.match(migration, /CREATE TABLE dbo\.work_blocks/);
  assert.match(migration, /CREATE TABLE dbo\.outlook_event_links/);
  assert.match(migration, /VALUES \(124, N'My week calendar'\)/);
  assert.match(await source("database/rollback/124_my_week_calendar.rollback.sql"), /DROP TABLE dbo\.work_blocks/);
  assert.match(await source("backend-node/src/migration-validation.ts"), /\{ version: 124, fileName: "124_my_week_calendar\.sql", name: "My week calendar" \}/);
  assert.match(await source("database/scripts/020_deploy_fresh_database.sql"), /:r database\/migrations\/123_plan_row_discipline\.sql\n:r database\/migrations\/124_my_week_calendar\.sql/);
  assert.match(await source("backend-node/src/app.ts"), /registerWorkBlockRoutes\(app, database, users, email\);/);
});
