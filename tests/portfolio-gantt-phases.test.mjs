import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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

test("a row keeps the height of its card when the chart scrolls, so the next row never covers the card's last line", async () => {
  // The chart is a flex column capped at 70vh: a row that may shrink is squeezed to its min-height once the projects
  // pass that height (owner 2026-11-26: "ตัวหนังสือมันยังซ้อนกันอยู่").
  const css = await source("app/system/production/gantt.css");
  assert.match(css, /\.gantt \{[^}]*display: flex;[^}]*max-height: 70vh;/);
  assert.match(css, /\.gantt-head,\s*\.gantt-row \{[^}]*flex: none;/);
});
