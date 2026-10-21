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
const { boardDays, dailyLoad, loadBand, weekTotals, freestOn, withExtra, defaultTaskManDays, dueGroup, covers } =
  await import(moduleUrl((await read("lib/team-board.ts")).replace(`from "./resource-planning"`, `from "${planningUrl}"`)));

const work = (change) => ({ key: "k", workKey: "k", type: "Project", entityId: 1, ownerId: 7, reference: "", title: "", customer: "",
  start: "2026-10-19", end: "2026-10-23", manDays: 4, progress: 0, status: "In Progress", ...change });

test("the board shows weekdays from the Monday of the week, with holidays and today marked", () => {
  const days = boardDays("2026-10-21", 2, ["2026-10-23"], "2026-10-21");
  assert.equal(days.length, 10);
  assert.deepEqual(days.map((day) => day.date).slice(0, 6), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26"]);
  assert.deepEqual(days.filter((day) => day.holiday).map((day) => day.date), ["2026-10-23"]);
  assert.deepEqual(days.filter((day) => day.today).map((day) => day.date), ["2026-10-21"]);
  assert.deepEqual(days.filter((day) => day.weekStart).map((day) => day.date), ["2026-10-19", "2026-10-26"]);
});

test("a day's load spreads each item over its working days, as the weekly workload does, and leave is not deducted", () => {
  const days = boardDays("2026-10-19", 1, ["2026-10-23"], "2026-10-21");
  // 4 MD over Monday to Thursday (Friday is a holiday): 1 MD a day; a 4-day week gives 0.8 MD a day.
  const load = dailyLoad([work({}), work({ key: "done", status: "Done" }), work({ key: "unknown", manDays: null })], days, 4, ["2026-10-23"]);
  assert.deepEqual(load.map((day) => Number(day.manDays.toFixed(2))), [1, 1, 1, 1, 0]);
  assert.deepEqual(load.map((day) => day.available), [0.8, 0.8, 0.8, 0.8, 0]);
  assert.equal(Math.round(load[0].utilisation), 125);
  // A holiday with nothing planned has no load at all; work on a holiday is infinitely over; a full day on a working day is 100%.
  assert.equal(load[4].utilisation, null);
  assert.equal(dailyLoad([work({ start: "2026-10-23", end: "2026-10-23", manDays: 1 })], days, 5, []).at(-1).utilisation, Infinity);
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
  // Wednesday 21 October.
  assert.deepEqual(["2026-10-20", "2026-10-25", "2026-10-26", "2026-11-01", "2026-11-02", null].map((end) => dueGroup(end, "2026-10-21")),
    ["late", "thisWeek", "nextWeek", "nextWeek", "later", "none"]);
  assert.equal(covers("2026-10-20", "2026-10-22", "2026-10-21"), true);
  assert.equal(covers("2026-10-20", null, "2026-10-20"), true);
  assert.equal(covers(null, null, "2026-10-20"), false);
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
  // The load check offers people with more room when the chosen one would be over 100%, their own team first.
  assert.match(board, /freestOn\(people\.filter\(\(entry\) => entry\.userId !== person\.userId/);
  assert.match(board, /draft\.startDate, 3, \(entry\) => entry\.user\.department === person\.user\.department\)/);
  // Saves update the board in place; a conflict reloads it.
  assert.match(board, /failure\.status === 409 \|\| failure\.status === 404\)\) \{ notify\(t\("TeamBoard\.conflict"\)\); await load\(\);/);
  assert.doesNotMatch(board, /<datalist|KpiCard/);
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
