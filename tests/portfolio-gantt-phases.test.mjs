import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calendarYearWindow, ganttColumns, ganttUnitChoices, ganttWindow, ganttYears, shiftGanttAnchor } from "../lib/gantt.ts";
import { customerShort, phaseColor } from "../lib/gantt-phase-colors.ts";

// The Projects timeline as the Application team's summary (owner 2026-11-26): a card per project and its main headings as
// one line of coloured, named phases.
const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("a phase takes the colour of its kind of work; a name that says none takes the palette by place", () => {
  assert.equal(phaseColor("Software development", 0).fill, "#ec4899");
  assert.equal(phaseColor("Internal Final Test", 0).fill, "#e11d48");
  assert.equal(phaseColor("Installation", 0).fill, "#16a34a");
  assert.equal(phaseColor("ติดตั้งหน้างาน", 0).fill, "#16a34a");
  assert.equal(phaseColor("Teaching for UT", 0).fill, "#f59e0b", "teaching before the customer's tests");
  assert.equal(phaseColor("User Testing & Trial", 0).fill, "#f97316", "the customer's tests before internal tests");
  assert.equal(phaseColor("Go Live", 0).fill, "#eab308");
  assert.equal(phaseColor("Go Live", 0).ink, "#422006", "dark words on yellow");
  assert.equal(phaseColor("Design & Spec", 0).fill, "#6366f1");
  assert.equal(phaseColor("Hardware order", 0).fill, "#8b5cf6");
  assert.notEqual(phaseColor("Meeting A", 0).fill, phaseColor("Meeting B", 1).fill, "neighbours with no kind still differ");
});

test("a customer's short name drops Co., Ltd. and the like", () => {
  assert.equal(customerShort("SIAM CHUYO CO., LTD."), "SIAM CHUYO");
  assert.equal(customerShort("TOMITA ASIA CO.,LTD"), "TOMITA ASIA");
  assert.equal(customerShort("Meiji (Thailand) Co., Ltd."), "MEIJI");
  assert.equal(customerShort(null), "");
});

test("the overview sends each project's main headings with their dates", async () => {
  const overview = await source("backend-node/src/project-overview.ts");
  assert.match(overview, /const phases: OverviewPhase\[\] = \(calculation\?\.roots \?\? \[\]\)/);
  assert.match(overview, /\.slice\(0, PHASE_LIMIT\)/);
  const route = await source("backend-node/src/routes/projects.ts");
  assert.match(route, /phases: summary\?\.phases \?\? \[\],/);
});

test("the timeline draws a card and the phases on one line, which a toggle can stack", async () => {
  const gantt = await source("app/system/production/ProjectPortfolioGantt.tsx");
  assert.match(gantt, /oneLane: oneLine,/);
  assert.match(gantt, /const color = phaseColor\(phase\.name, index\);/);
  assert.match(gantt, /data-guide="project\.oneLine" aria-pressed=\{oneLine\}/);
  assert.match(gantt, /footer: \(?\s*<>\s*<HealthBadge/);
  const chart = await source("app/system/production/GanttChart.tsx");
  assert.match(chart, /if \(oneLane\) return \{ shown: shown\.map\(\(entry\) => \(\{ \.\.\.entry, lane: 0 \}\)\), count: 1 \};/);
  assert.match(chart, /\{segment\.label \? <span>\{segment\.label\}<\/span> : null\}/);
  const guides = await source("app/system/production/guide-catalog.ts");
  assert.match(guides, /target: "project\.oneLine",/);
});

test("a picked year shows January to December, a column a month", () => {
  const window = calendarYearWindow(2026);
  assert.equal(window.start, "2026-01-01");
  assert.equal(window.end, "2026-12-31");
  assert.equal(window.columns.length, 12);
  assert.equal(window.days, 365);
  assert.equal(calendarYearWindow(2028).days, 366, "a leap year");
});

test("2 years: 24 months around today, or two calendar years from a picked one; the arrows move 20 months", () => {
  const rolling = ganttWindow("twoYears", "2026-11-27");
  assert.equal(rolling.start, "2026-09-01");
  assert.equal(rolling.end, "2028-08-31");
  assert.equal(rolling.columns.length, 24);
  const picked = calendarYearWindow(2026, 2);
  assert.equal(picked.start, "2026-01-01");
  assert.equal(picked.end, "2027-12-31");
  assert.equal(shiftGanttAnchor("twoYears", "2026-11-27", 1), "2028-07-01");
});

test("a window can be drawn by day, week, month or quarter; only units of 2 to 31 columns are offered", () => {
  const year = calendarYearWindow(2026);
  assert.deepEqual(
    ganttColumns(year, "quarter").map((column) => [column.start, column.end]),
    [
      ["2026-01-01", "2026-03-31"],
      ["2026-04-01", "2026-06-30"],
      ["2026-07-01", "2026-09-30"],
      ["2026-10-01", "2026-12-31"],
    ],
  );
  // A window that starts mid-quarter still begins with that whole quarter; the chart clips it.
  assert.equal(ganttColumns(ganttWindow("year", "2026-11-27"), "quarter")[0].start, "2026-07-01");
  // Weeks start on Monday, even before the window.
  assert.equal(ganttColumns({ start: "2026-11-04", end: "2026-11-30" }, "week")[0].start, "2026-11-02");
  assert.deepEqual(ganttUnitChoices(year), ["month", "quarter"], "52 weeks are too many for a year");
  assert.deepEqual(ganttUnitChoices(calendarYearWindow(2026, 2)), ["month", "quarter"]);
  assert.deepEqual(ganttUnitChoices(ganttWindow("week", "2026-11-27")), ["day", "week"], "no half-month columns in two weeks");
  assert.deepEqual(ganttUnitChoices(ganttWindow("month", "2026-11-27")), ["week"], "42 days are too many day columns");
  assert.deepEqual(ganttUnitChoices(ganttWindow("quarter", "2026-11-27")), ["week", "month"]);
  assert.deepEqual(ganttUnitChoices(ganttWindow("half", "2026-11-27")), ["week", "month", "quarter"]);
});

test("the year list runs from the earliest date to the latest with this year in it, a stray date kept from stretching it", () => {
  assert.deepEqual(ganttYears(["2025-03-01", "2027-06-30", null], "2026-11-27"), [2025, 2026, 2027]);
  assert.deepEqual(ganttYears([], "2026-11-27"), [2026], "no projects: this year alone");
  assert.deepEqual(ganttYears(["2024-01-05"], "2026-11-27"), [2024, 2025, 2026], "the years between are listed too");
  const stray = ganttYears(["2062-01-01", "2026-05-01"], "2026-11-27", 5);
  assert.equal(stray.length, 5);
  assert.deepEqual(stray, [2026, 2027, 2028, 2029, 2030], "kept nearest this year; 2062 is left out");
});

test("Original plan draws each phase's baseline under it; the year list sits beside the ranges", async () => {
  const gantt = await source("app/system/production/ProjectPortfolioGantt.tsx");
  assert.match(gantt, /data-guide="project\.baseline" aria-pressed=\{showBaseline\}/);
  assert.match(gantt, /\.\.\.\(showBaseline \? \{ baselineStart: phase\.baselineStart \?\? null, baselineFinish: phase\.baselineFinish \?\? null \} : \{\}\),/);
  assert.match(gantt, /<GanttLegend baseline=\{expanded\.size > 0 \|\| showBaseline\} target \/>/);
  assert.match(gantt, /year=\{\{ value: year, options: yearOptions, onChange: pickYear \}\}/);
  // A range button or Today leaves the picked year; the arrows step a year while one is picked.
  assert.match(gantt, /const changeZoom = \(next: GanttZoomChoice\) => \{\s*if \(next !== "year" && next !== "twoYears"\) setYear\(null\);\s*setZoom\(next\);/);
  // 2 years and the column unit (owner 2026-11-27).
  assert.match(gantt, /calendarYearWindow\(year, zoom === "twoYears" \? 2 : 1\)/);
  assert.match(gantt, /zooms=\{GANTT_LONG_ZOOMS\}/);
  assert.match(gantt, /unit=\{\{ value: shownUnit, options: unitChoices, onChange: setUnit \}\}/);
  assert.match(gantt, /const shownUnit: GanttUnit = unit !== null && unitChoices\.includes\(unit\) \? unit : baseWindow\.columns\[0\]!\.kind;/);
  assert.match(gantt, /year !== null \? setYear\(year \+ direction\)/);
  const chart = await source("app/system/production/GanttChart.tsx");
  assert.match(chart, /className="gantt-baseline phase"/);
  assert.match(chart, /<label className=\{`select-field gantt-year-select\$\{year\.value === null \? "" : " on"\}`\} data-guide="project\.year">/);
  const guides = await source("app/system/production/guide-catalog.ts");
  assert.match(guides, /target: "project\.baseline",/);
  assert.match(guides, /target: "project\.unit",/);
  assert.match(chart, /data-guide="project\.unit"/);
});

test("a row keeps the height of its card when the chart scrolls, so the next row never covers the card's last line", async () => {
  // The chart is a flex column capped at 70vh: a row that may shrink is squeezed to its min-height once the projects
  // pass that height (owner 2026-11-26: "ตัวหนังสือมันยังซ้อนกันอยู่").
  const css = await source("app/system/production/gantt.css");
  assert.match(css, /\.gantt \{[^}]*display: flex;[^}]*max-height: 70vh;/);
  assert.match(css, /\.gantt-head,\s*\.gantt-row \{[^}]*flex: none;/);
});
