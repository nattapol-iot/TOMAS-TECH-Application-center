import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addDays, choicesForDay, dayBody, dayState, lineForNote, lineFromChoice, lineProblems, linesFromRows, mondayOf, parseHours, pendingDates, sameAsDraft, shortReference,
} from "../lib/work-days.ts";
import { WORK_DAYS_COPY } from "../app/system/production/work-days-copy.ts";
import { GUIDES } from "../app/system/production/guide-catalog.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const day = (change = {}) => ({
  date: "2026-11-20", working: true, holiday: false, weekend: false, awayHours: 0, editable: true, future: false, confirmed: null,
  rows: [], draft: [], draftHours: 0, ...change,
});
const row = (change = {}) => ({ workKey: "Project-11", kind: "Project", projectId: 1, projectNo: "P-1", title: "Wiring", reference: "P-1 · 1.1", hours: 6, plannedHours: 6, ...change });

test("week helpers: Monday of any day, and days moved across a month", () => {
  assert.equal(mondayOf("2026-11-21"), "2026-11-16");
  assert.equal(mondayOf("2026-11-16"), "2026-11-16");
  assert.equal(mondayOf("2026-11-22"), "2026-11-16");
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
});

test("dayState: confirmed, a draft to confirm, an empty working day, a day off, a day to come, a day too old", () => {
  assert.equal(dayState(day({ confirmed: { at: "x", times: 1, hours: 8 } })), "confirmed");
  assert.equal(dayState(day({ draft: [row()] })), "toConfirm");
  assert.equal(dayState(day({ awayHours: 8 })), "toConfirm", "a day away is confirmed with no work");
  assert.equal(dayState(day()), "empty");
  assert.equal(dayState(day({ working: false })), "off");
  assert.equal(dayState(day({ future: true, editable: false, draft: [row()] })), "future");
  assert.equal(dayState(day({ future: true, editable: false, working: false })), "off", "a weekend to come is a day off");
  assert.equal(dayState(day({ editable: false, draft: [row()] })), "closed");
  const week = [day({ date: "2026-11-17", draft: [row()] }), day({ date: "2026-11-18" }), day({ date: "2026-11-19", confirmed: { at: "x", times: 1, hours: 8 } }), day({ date: "2026-11-20", draft: [row()] })];
  assert.deepEqual(pendingDates(week, "2026-11-20"), ["2026-11-17"], "today has its own button; empty and confirmed days are not pending");
});

test("shortReference: the project number is not said twice", () => {
  assert.equal(shortReference("P-1 · 2.3", "P-1"), "2.3");
  assert.equal(shortReference("P-1", "P-1"), "");
  assert.equal(shortReference("IS-202611-0004 #2", "P-1"), "IS-202611-0004 #2");
  assert.equal(shortReference("", null), "");
});

test("parseHours: quarter hours above 0 and up to 24", () => {
  assert.equal(parseHours("2"), 2); assert.equal(parseHours("2.25"), 2.25); assert.equal(parseHours("2,5"), 2.5); assert.equal(parseHours("24"), 24);
  for (const text of ["", " ", "0", "-1", "2.3", "24.25", "abc"]) assert.equal(parseHours(text), null, text);
});

test("the day dialog: lines, what may be added, problems, the body sent and Back to the plan", () => {
  const draft = [row(), row({ workKey: "Outlook-70", kind: "Outlook", projectId: null, projectNo: null, title: "Review", reference: "", hours: 2, plannedHours: 2 })];
  const lines = linesFromRows(draft);
  assert.equal(sameAsDraft(lines, draft), true);
  assert.equal(new Set(lines.map((line) => line.key)).size, 2);

  const choices = [
    { workKey: "Project-11", kind: "Project", projectId: 1, projectNo: "P-1", title: "Wiring", reference: "P-1 · 1.1" },
    { workKey: "Project-12", kind: "Project", projectId: 1, projectNo: "P-1", title: "Labels", reference: "P-1 · 1.2" },
    { workKey: "Outlook-70", kind: "Outlook", projectId: null, projectNo: null, title: "Review", reference: "" },
    { workKey: "Outlook-71", kind: "Outlook", projectId: null, projectNo: null, title: "Another day's meeting", reference: "" },
  ];
  assert.deepEqual(choicesForDay(choices, { draft }, lines).map((choice) => choice.workKey), ["Project-12"]);
  assert.deepEqual(choicesForDay(choices, { draft }, lines.slice(0, 1)).map((choice) => choice.workKey), ["Project-12", "Outlook-70"]);

  const added = [...lines, lineFromChoice(choices[1]), lineForNote({ id: 1, projectNo: "P-1" })];
  assert.equal(sameAsDraft(added, draft), false);
  let problems = lineProblems(added);
  assert.equal(problems.line.get(added[2].key), "hours");
  assert.equal(problems.line.get(added[3].key), "hours");
  added[2] = { ...added[2], hours: "1" };
  added[3] = { ...added[3], hours: "0.5" };
  problems = lineProblems(added);
  assert.equal(problems.line.get(added[3].key), "note", "work typed by hand needs a note");
  added[3] = { ...added[3], title: "Helped Somchai" };
  problems = lineProblems(added);
  assert.equal(problems.line.size, 0); assert.equal(problems.total, 9.5); assert.equal(problems.tooMany, false);
  assert.deepEqual(dayBody(added), { rows: [
    { workKey: "Project-11", hours: 6 }, { workKey: "Outlook-70", hours: 2 }, { workKey: "Project-12", hours: 1 }, { projectId: 1, note: "Helped Somchai", hours: 0.5 },
  ] });
  assert.equal(lineProblems([{ ...added[0], hours: "20" }, { ...added[1], hours: "4.25" }]).tooMany, true);
  assert.deepEqual(dayBody([lineForNote(null)].map((line) => ({ ...line, title: " Training ", hours: "8" }))), { rows: [{ projectId: null, note: "Training", hours: 8 }] });
});

test("My Work shows the hours strip above its counts, and the panel talks to the three work-day routes", () => {
  const screens = read("app/system/production/PlanningPricingScreens.tsx");
  assert.match(screens, /import \{ WorkDaysPanel \} from "\.\/WorkDaysPanel";/);
  assert.match(screens, /<WorkDaysPanel notify=\{notify\} \/>\n\s+<section className="my-work-kpis"/);
  const panel = read("app/system/production/WorkDaysPanel.tsx");
  assert.match(panel, /`\/api\/v1\/me\/work-days\?from=\$\{monday\}&to=\$\{addDays\(monday, 6\)\}`/);
  assert.match(panel, /"\/api\/v1\/me\/work-days\/confirm", \{ method: "POST"/);
  assert.match(panel, /`\/api\/v1\/me\/work-days\/\$\{day\.date\}`, \{ method: "PUT"/);
  assert.match(read("app/system/production/PlanManHours.tsx"), /data\.actualManDays \? <span className="plan-manhours-actual"/);
});

test("every Hours copy key the panel asks for has Thai, English and Japanese, and the guide is listed", () => {
  // Plan.mh* words belong to the man-hour line and live in crm-copy.ts (tests/plan-manhours.test.mjs checks them).
  const used = new Set([...read("app/system/production/WorkDaysPanel.tsx").matchAll(/"(Hours\.[A-Za-z]+)"/g)].map((match) => match[1]));
  assert.ok(used.size > 30);
  const i18n = read("app/system/i18n.ts");
  assert.match(i18n, /import \{ WORK_DAYS_COPY \} from "\.\/production\/work-days-copy";/);
  assert.match(i18n, /\.\.\.WORK_DAYS_COPY,/);
  for (const key of used) {
    const entry = WORK_DAYS_COPY[key];
    assert.ok(entry && entry.en && entry.th && entry.jp, `${key} needs th / en / jp`);
  }
  const guide = GUIDES.find((item) => item.id === "my-hours-confirm");
  assert.ok(guide, "the My hours guide is in the catalog");
  assert.deepEqual(guide.steps.map((step) => step.target), ["nav.my-work", "hours.week", "hours.confirmToday", "hours.days", "hours.add", "hours.save"]);
});
