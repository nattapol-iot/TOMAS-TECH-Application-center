import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { TEAM_BOARD_COPY } from "../app/system/production/team-board-copy.ts";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const moduleUrl = (source) => "data:text/javascript;base64," + Buffer.from(
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
// lib/team-board.ts imports lib/resource-planning.ts; both are compiled and the import pointed at the compiled copy.
const planningUrl = moduleUrl(await read("lib/resource-planning.ts"));
const { boardDays, dailyLoad, loadBand, weekTotals, spanLoad, freestOn, withExtra, defaultTaskManDays, dueGroup, covers, timeRange, tableTsv, tableHtml, outlookDates, outlookManDays, outlookLoad, withOutlook } =
  await import(moduleUrl((await read("lib/team-board.ts")).replace(`from "./resource-planning"`, `from "${planningUrl}"`)));

const work = (change) => ({ key: "k", workKey: "k", type: "Project", entityId: 1, ownerId: 7, reference: "", title: "", customer: "",
  start: "2026-10-19", end: "2026-10-23", manDays: 4, progress: 0, status: "In Progress", ...change });

test("the board shows Monday to Sunday from the Monday of the week, with holidays, weekends and today marked", () => {
  const days = boardDays("2026-10-21", 2, ["2026-10-23"], "2026-10-21");
  assert.equal(days.length, 14);
  assert.deepEqual(days.map((day) => day.date).slice(0, 8), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26"]);
  assert.deepEqual(days.filter((day) => day.weekend).map((day) => day.date), ["2026-10-24", "2026-10-25", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(days.filter((day) => day.holiday).map((day) => day.date), ["2026-10-23"]);
  assert.deepEqual(days.filter((day) => day.today).map((day) => day.date), ["2026-10-21"]);
  assert.deepEqual(days.filter((day) => day.weekStart).map((day) => day.date), ["2026-10-19", "2026-10-26"]);
});

test("a day's load spreads each item over its working days, as the weekly workload does, and leave is not deducted", () => {
  const days = boardDays("2026-10-19", 1, ["2026-10-23"], "2026-10-21");
  // 4 MD over Monday to Thursday (Friday is a holiday): 1 MD a day; a 4-day week gives 0.8 MD a day.
  const load = dailyLoad([work({}), work({ key: "done", status: "Done" }), work({ key: "unknown", manDays: null })], days, 4, ["2026-10-23"]);
  assert.deepEqual(load.map((day) => Number(day.manDays.toFixed(2))), [1, 1, 1, 1, 0, 0, 0]);
  // Saturday and Sunday offer nothing, like the holiday, and nothing is spread onto them.
  assert.deepEqual(load.map((day) => day.available), [0.8, 0.8, 0.8, 0.8, 0, 0, 0]);
  assert.deepEqual(load.slice(5).map((day) => day.utilisation), [null, null]);
  assert.equal(Math.round(load[0].utilisation), 125);
  // A holiday with nothing planned has no load at all; work on a holiday is infinitely over; a full day on a working day is 100%.
  assert.equal(load[4].utilisation, null);
  assert.equal(dailyLoad([work({ start: "2026-10-23", end: "2026-10-23", manDays: 1 })], days, 5, []).at(4).utilisation, Infinity);
  assert.equal(dailyLoad([work({ start: "2026-10-22", end: "2026-10-22", manDays: 1 })], days, 5, []).at(3).utilisation, 100);
  assert.deepEqual([loadBand(null), loadBand(40), loadBand(85), loadBand(100), loadBand(101)], ["none", "ok", "full", "full", "over"]);
  const week = weekTotals(load, "2026-10-19", "2026-10-23");
  assert.deepEqual([week.manDays, Number(week.available.toFixed(1)), Math.round(week.utilisation)], [4, 3.2, 125]);
  assert.equal(Math.round(withExtra(load[0], 0.5)), 188);
});

test("the freest people that day are offered first, never someone away or with no time", () => {
  const days = boardDays("2026-10-19", 1, [], "2026-10-19");
  const person = (userId, manDays, away = false) => ({ userId, away: () => away, load: dailyLoad(manDays ? [work({ manDays })] : [], days, 5, []) });
  const people = [person(1, 5), person(2, 1), person(3, 0, true), person(4, 2), person(5, 0), person(6, 4.5)];
  assert.deepEqual(freestOn(people, "2026-10-20", 3).map(({ person: p, utilisation }) => [p.userId, utilisation]), [[5, 0], [2, 20], [4, 40]]);
  // Someone from the chosen person's own team comes first while they have room (90% does not count as room).
  assert.deepEqual(freestOn(people, "2026-10-20", 3, (p) => p.userId === 4 || p.userId === 6).map(({ person: p }) => p.userId), [4, 5, 2]);
});

test("a new task's default effort and the list's due groups", () => {
  assert.equal(defaultTaskManDays("2026-10-22", "2026-10-26", "Day", ["2026-10-23"]), 2);
  assert.equal(defaultTaskManDays("2026-10-22", "2026-10-22", "PM"), 0.5);
  assert.equal(defaultTaskManDays("2026-10-24", "2026-10-24", "Day"), 1);
  assert.equal(defaultTaskManDays("2026-10-24", "2026-10-22", "Day"), 0);
  // A one-day time range, as the server works it out: 2.5 hours is a quarter day; 11:00-14:00 leaves lunch out.
  assert.deepEqual([defaultTaskManDays("2026-10-22", "2026-10-22", "Time", [], "09:00", "11:30"), defaultTaskManDays("2026-10-22", "2026-10-22", "Time", [], "11:00", "14:00"),
    defaultTaskManDays("2026-10-22", "2026-10-22", "Time", [], "08:30", "17:30"), defaultTaskManDays("2026-10-22", "2026-10-22", "Time", [], "11:00", "10:00")], [0.25, 0.25, 1, 0]);
  assert.equal(timeRange({ slot: "Time", startTime: "09:00", endTime: "11:30" }), "09:00–11:30");
  assert.equal(timeRange({ slot: "AM", startTime: null, endTime: null }), "");
  // Wednesday 21 October.
  assert.deepEqual(["2026-10-20", "2026-10-25", "2026-10-26", "2026-11-01", "2026-11-02", null].map((end) => dueGroup(end, "2026-10-21")),
    ["late", "thisWeek", "nextWeek", "nextWeek", "later", "none"]);
  assert.equal(covers("2026-10-20", "2026-10-22", "2026-10-21"), true);
  assert.equal(covers("2026-10-20", null, "2026-10-20"), true);
  assert.equal(covers(null, null, "2026-10-20"), false);
});

test("a copied table pastes as columns into Excel and as a table into Outlook, never as a formula", () => {
  const rows = [["Kind", "Work"], ["Task", "Survey\tLine 2\nnote"], ["Task", "=HYPERLINK(\"x\")"], ["Task", "<b>&"]];
  assert.equal(tableTsv(rows), "Kind\tWork\r\nTask\tSurvey Line 2 note\r\nTask\t'=HYPERLINK(\"x\")\r\nTask\t<b>&");
  assert.equal(tableHtml(rows.slice(0, 1).concat([rows[3]])), '<table border="1" cellspacing="0" cellpadding="4"><tr><th>Kind</th><th>Work</th></tr><tr><td>Task</td><td>&lt;b&gt;&amp;</td></tr></table>');
});

test("Team overview replaces Resource Plan in the menu and opens on the board for everyone with team.board", async () => {
  const [shell, screen, board, client] = await Promise.all([
    read("app/system/ProductionApp.tsx"), read("app/system/production/ResourcePlanningScreen.tsx"),
    read("app/system/production/TeamBoard.tsx"), read("app/system/resource-workload-client.ts"),
  ]);
  assert.match(shell, /\{ view: "resources", label: "Team overview", icon: "users", anyPermissions: \["team\.board", "schedule\.read"\] \}/);
  assert.doesNotMatch(shell, /label: "Resource Plan"|group: "PLANNING"/);
  // A team task given to someone opens the board from their notification.
  assert.match(shell, /if \(item\.entityType === "TeamTask"\) setView\("resources"\);/);
  assert.match(screen, /const canBoard = bootstrap\.permissions\.includes\("team\.board"\);/);
  assert.match(screen, /<TeamBoard bootstrap=\{bootstrap\} notify=\{notify\} mode=\{tab\} onMode=\{changeTab\} today=\{todayIso\} openItem=\{open\} onChanged=\{\(\) => setData\(null\)\} \/>/);
  // Work the reader cannot open, and team tasks, never navigate away.
  assert.match(screen, /item\.type === "Task" \|\| item\.hidden\s+\? undefined/);
  assert.match(client, /apiRequest<TeamBoardData>\(`\/api\/v1\/team-board\?from=\$\{from\}&to=\$\{to\}`\)/);
  // Clicking a day adds work for that person and day; chips open the task or the work; names list the person's work.
  assert.match(board, /onClick=\{\(\) => setAdding\(\{ assigneeId: userId, date: day\.date \}\)\}/);
  assert.match(board, /aria-label=\{fill\(t\("TeamBoard\.addFor"\), \{ name, date: longDate\(day\.date\) \}\)\}/);
  assert.match(board, /onClick=\{\(\) => \{ setPersonId\(person\.userId\); onMode\("list"\); \}\}/);
  // Copy (2026-10-22): a task starts a new one from all its fields; the table copies what is on screen.
  assert.match(board, /const copyTask = \(task: TeamTask\) => \{ setEditing\(null\); setAdding\(\{ assigneeId: null, date: task\.startDate, copy: task \}\); \};/);
  assert.match(board, /const start = copyFrom \? \{ \.\.\.draftOf\(copyFrom\), status: "Planned" as const \} : initial \?\? draftOf\(null, preset\);/);
  assert.match(board, /navigator\.clipboard\.write\(\[new ClipboardItem\(\{ "text\/plain": new Blob\(\[text\]/);
  assert.match(board, /else await navigator\.clipboard\.writeText\(text\);/);
  // A Gantt view of the same people and filtered work, remembered per person.
  assert.match(board, /<TeamBoardGantt people=\{ganttPeople\} today=\{today\} \/>/);
  assert.match(board, /work: listRows\.filter\(\(row\) => row\.ownerIds\.includes\(person\.userId\)\)\.map\(ganttWork\)/);
  const gantt = await read("app/system/production/TeamBoardGantt.tsx");
  assert.match(gantt, /<GanttChart rows=\{rows\} range=\{range\} today=\{today\} sideHeader="TeamBoard\.person" label="TeamBoard\.ganttLabel" \/>/);
  // A person's own row draws all their work on one line (2026-10-22), not one long bar from the first to the last.
  assert.match(gantt, /start: null, finish: null, tone: "slate",\s+segments: person\.work\.map\(\(work\) => \(\{ key: work\.key, start: work\.start, finish: work\.end \?\? work\.start, tone: work\.tone/);
  // Full screen fills the window; the chart scrolls inside it.
  const boardCss = await read("app/system/production/team-board.css");
  assert.match(boardCss, /\.board-gantt\.is-fullscreen \.gantt \{ flex: 1; min-height: 0; max-height: none; \}/);
  const chart = await read("app/system/production/GanttChart.tsx");
  assert.match(chart, /const bar = row\.milestone \|\| segments \? null : ganttSpan\(start, finish, range\);/);
  assert.match(chart, /top: segments\.count > 1 \? 8 \+ lane \* 10 : 15/);
  // More than one team at once (2026-10-22); none ticked is everyone, and the choice is remembered per person.
  assert.match(board, /<TeamFilter departments=\{departments\} counts=\{teamCounts\} value=\{teams\} onChange=\{pickTeams\} \/>/);
  assert.match(board, /const inDepartment = \(userId: number\) => !teams\.length \|\| teams\.includes\(/);
  assert.match(board, /const teams = chosenTeams\.filter\(\(team\) => departments\.includes\(team\)\);/);
  assert.match(board, /try \{ window\.localStorage\.setItem\(teamsKey\(me\), JSON\.stringify\(next\)\); \} catch/);
  assert.doesNotMatch(board, /setDepartment\(/);
  // A time range (2026-10-22): a fourth choice beside the whole day, the morning and the afternoon, with from and until.
  assert.match(board, /\{ slot: "Time", label: "TeamBoard\.slotTime" \}/);
  assert.match(board, /\{draft\.slot === "Time" \? \(\s*<div className="board-time-range">/);
  assert.match(board, /startTime: draft\.kind !== "Away" && draft\.slot === "Time" \? draft\.startTime \|\| null : null,/);
  assert.match(board, /if \(!draft\.startTime \|\| !draft\.endTime\) return "TeamBoard\.timeNeeded";/);
  // Several people on a task (2026-10-22): picked with the shared multi-person picker, each with their load that day.
  assert.match(board, /<SearchMultiPicker options=\{personOptions\} value=\{draft\.assigneeIds\} onChange=\{\(assigneeIds\) => set\(\{ \.\.\.draft, assigneeIds \}\)\}/);
  assert.match(board, /\{loads\.map\(\(\{ person, now, after, away, off \}\) => \(/);
  // Saturday and Sunday are on the grid (2026-10-24): shaded, with no load, and a day off rather than an overload in the form.
  assert.match(board, /day\.holiday \? "holiday" : day\.weekend \? "weekend" :/);
  assert.match(board, /\{away \? t\("TeamBoard\.awayShort"\) : off \? t\("TeamBoard\.holiday"\) :/);
  // Changing a saved task does not count its own share twice.
  assert.match(board, /manDays: Math\.max\(0, saved\.manDays - ownShare\(person\.userId\)\)/);
  assert.match(board, /<TaskFields draft=\{draft\} set=\{setDraft\} context=\{context\} disabled=\{!canChange \|\| busy\} original=\{task\} \/>/);
  // The fullest person can be swapped for someone with more room, their own team first.
  assert.match(board, /freestOn\(people\.filter\(\(entry\) => !draft\.assigneeIds\.includes\(entry\.userId\)/);
  assert.match(board, /draft\.startDate, 3, \(entry\) => entry\.user\.department === worst\.person\.user\.department\)/);
  assert.match(board, /onClick=\{\(\) => swap\(worst\.person\.userId, other\.userId\)\}/);
  // A task with several people counts for each of them, on each of their rows.
  assert.match(board, /\(task\.assigneeIds\.length \? task\.assigneeIds : \[null\]\)\.map\(\(ownerId\) => \(\{/);
  assert.match(board, /for \(const userId of task\.assigneeIds\.length \? task\.assigneeIds : \[null\]\)/);
  // Saves update the board in place; a conflict reloads it.
  assert.match(board, /failure\.status === 409 \|\| failure\.status === 404\)\) \{ notify\(t\("TeamBoard\.conflict"\)\); await load\(\);/);
  assert.doesNotMatch(board, /<datalist|KpiCard/);
  // Outlook (owner decision 2026-10-22): the form says the person gets it in Outlook; the toast says whether it got there.
  assert.match(board, /\{draft\.kind !== "Away" && loads\.length \? <p className="muted small board-outlook"><Icon name="calendar" \/>\{t\("TeamBoard\.outlookHint"\)\}<\/p> : null\}/);
  assert.match(board, /notify\(`\$\{t\("TeamBoard\.added"\)\}\$\{outlook\(saved\.calendar\)\}`\)/);
  assert.match(client, /calendar: CalendarDelivery \}>\("\/api\/v1\/team-tasks"/);
  assert.match(board, /import "\.\/team-board\.css";/);
});

test("every team board string has English, Thai and Japanese, and no key is short enough to hijack the alias map", async () => {
  const sources = await Promise.all(["app/system/production/TeamBoard.tsx", "app/system/production/ResourcePlanningScreen.tsx", "app/system/ProductionApp.tsx",
    "app/system/production/WorkQueue.tsx", "app/system/activity-client.ts"].map(read));
  const used = new Set(sources.flatMap((text) => [...text.matchAll(/["'](TeamBoard\.[A-Za-z]+)["']/g)].map((match) => match[1])));
  used.add("Team overview");
  for (const key of used) for (const language of ["en", "th", "jp"]) assert.ok(TEAM_BOARD_COPY[key]?.[language]?.trim(), `${key}: ${language}`);
  // A short Latin word ("MD", "OK") would answer for every screen that translates it; Japanese two-character words cannot collide that way.
  for (const [key, entry] of Object.entries(TEAM_BOARD_COPY))
    for (const value of [key, entry.en, entry.th, entry.jp]) if (/^[\x20-\x7e]+$/.test(value)) assert.ok(value.trim().length > 2, `${key}: "${value}" is too short`);
  const i18n = await read("app/system/i18n.ts");
  assert.match(i18n, /\.\.\.INSTALLED_BASE_COPY,\r?\n {2}\.\.\.TEAM_BOARD_COPY,/);
});

test("Outlook meetings count by their hours, lunch left out, a whole day at most", async () => {
  const meeting = { userId: 7, start: "2026-10-28T09:00:00", end: "2026-10-28T13:30:00", allDay: false };
  assert.deepEqual(outlookDates(meeting), ["2026-10-28"]);
  assert.equal(outlookManDays(meeting, "2026-10-28"), 3.5 / 8, "09:00–13:30 less the lunch hour");
  const allDay = { userId: 7, start: "2026-10-29T00:00:00", end: "2026-10-31T00:00:00", allDay: true };
  assert.deepEqual(outlookDates(allDay), ["2026-10-29", "2026-10-30"], "an all-day event ends the day before its end");
  const load = outlookLoad([meeting, { ...meeting, start: "2026-10-28T08:00:00", end: "2026-10-28T17:00:00" }, allDay]);
  assert.equal(load.get("7|2026-10-28"), 1, "a day holds at most one man-day of meetings");
  assert.equal(load.get("7|2026-10-30"), 1);
  const [day] = withOutlook([{ date: "2026-10-28", manDays: 0.5, available: 1, utilisation: 50 }], () => 0.25);
  assert.deepEqual(day, { date: "2026-10-28", manDays: 0.75, available: 1, utilisation: 75 });
});

test("only Admins, Leaders and managers add work on other people's rows; new work names its work and detail", async () => {
  const board = await read("app/system/production/TeamBoard.tsx");
  // The + in a cell: on your own row, the unassigned row, or anyone's for someone who may assign others.
  assert.match(board, /\{canAssignOthers \|\| userId === me \|\| userId === null \? \(/);
  assert.match(board, /const assignable = useMemo\(\(\) => \(canAssignOthers \? null : \[me\]\), \[canAssignOthers, me\]\);/);
  assert.match(board, /\.filter\(\(user\) => assignable === null \|\| assignable\.includes\(user\.id\) \|\| Boolean\(original\?\.assigneeIds\.includes\(user\.id\)\)\)/);
  // Which work it is for, chosen every time, and a brief detail; a day away needs neither.
  assert.match(board, /const draftMissing = \(draft: Draft\): string\[\] => draft\.kind === "Away" \? \[\] : \[/);
  assert.match(board, /const draftReady = \(draft: Draft\) => Boolean\(draft\.title\.trim\(\) && draft\.startDate\) && !draftProblem\(draft\) && !draftMissing\(draft\)\.length;/);
  assert.match(board, /\["project", "TeamBoard\.workProject", work\.canProjects\], \["inquiry", "TeamBoard\.workInquiry", work\.canInquiries\], \["other", "TeamBoard\.workOther", true\]/);
  // Outlook: on the cells, in the load, and a button to read the calendars now.
  assert.match(board, /add\(event\.userId, date, \{ kind: "outlook", key: `outlook-\$\{event\.id\}`, event, late: false \}\);/);
  assert.match(board, /const load = withOutlook\(dailyLoad\(items, days, capacity, data\.holidays\), \(date\) => outlookMd\.get/);
  assert.match(board, /const result = await syncOutlookCalendars\(\);/);
});

test("a plan row's span is loaded like the grid: effort spread over working days, Outlook added, holidays offering nothing", () => {
  // 4 MD over Mon 19 – Fri 23 Oct, so 0.8 a day; the span Wed 21 – Tue 27 holds three of those days.
  const items = [work({ ownerId: 7 })];
  const span = spanLoad(items, "2026-10-21", "2026-10-27", 5, ["2026-10-26"]);
  // Working days in the span: 21, 22, 23 and 27 (26 is a holiday, 24–25 the weekend).
  assert.equal(span.available, 4);
  assert.ok(Math.abs(span.manDays - 2.4) < 1e-9);
  assert.ok(Math.abs(span.utilisation - 60) < 1e-9);
  const withMeeting = spanLoad(items, "2026-10-21", "2026-10-27", 5, ["2026-10-26"], (date) => (date === "2026-10-27" ? 0.5 : 0));
  assert.ok(Math.abs(withMeeting.manDays - 2.9) < 1e-9);
  // A span longer than a week from a Sunday still reaches its last day.
  assert.equal(spanLoad([], "2026-10-25", "2026-11-09", 5).available, 11);
  assert.equal(spanLoad([], "2026-10-24", "2026-10-25", 5).utilisation, null, "a weekend offers nothing");
});
