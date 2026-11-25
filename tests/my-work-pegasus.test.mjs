import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// My Work, lean and in the Pegasus look (owner 2026-11-21, /pegasus-design). The page keeps its behaviour and guide
// marks; these checks hold the shape the owner asked for.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const screen = read("app/system/production/PlanningPricingScreens.tsx");
const page = screen.slice(screen.indexOf("export function ProductionMyWork"), screen.indexOf("type QuickProgressTarget"));
const group = screen.slice(screen.indexOf("function ProductionScheduleWorkGroup"), screen.indexOf("function ProductionMyTaskRow"));

test("the page sits in the Pegasus scope, with the guidance as its subtitle instead of a strip", () => {
  assert.match(screen, /import "\.\/pegasus-skin\.css";\nimport "\.\/my-work\.css";/);
  assert.match(page, /return \(?\s*<div className="pg-skin my-work-pg">/);
  assert.match(page, /: uiText\("You update the tasks assigned to you\./);
  assert.doesNotMatch(page, /my-work-guidance/);
});

test("one summary bar replaces the five stat cards and the All open row; each cell is the filter it counts", () => {
  assert.doesNotMatch(screen, /MyWorkStat|my-work-kpis|my-work-filter-row" role="group"/);
  // The counts show with the assigned work only (2026-11-23): a hidden attribute lost to the bar's own display rule.
  assert.match(page, /\{ASSIGNED_TABS\.includes\(tab\) \? \(\s*<div className="pg-summary my-work-summary" role="group" aria-label=\{localizeCopy\("Task overview"\)\} data-guide="work\.summary">/);
  for (const id of ["open", "late", "blocked", "attention", "week", "waiting"]) assert.match(page, new RegExp(`\\{ id: "${id}", label: "`));
  assert.match(page, /aria-pressed=\{tab === "active" && taskFilter === cell\.id\}/);
  assert.match(page, /onClick=\{\(\) => \{\s*setTab\("active"\);\s*setSourceFilter\("all"\);\s*setTaskFilter\(cell\.id\);\s*\}\}/);
});

test("source, project, sort and the one search box share one toolbar row on the canvas", () => {
  assert.doesNotMatch(page, /my-work-source-filter/);
  assert.match(page, /<div className="toolbar my-work-toolbar">/);
  assert.match(page, /aria-label=\{localizeCopy\("Filter by source"\)\}/);
  const toolbar = page.slice(page.indexOf('className="toolbar my-work-toolbar"'), page.indexOf("{error ? <LoadError"));
  assert.ok(toolbar.indexOf("my-work-source") < toolbar.indexOf("my-work-project-filter") && toolbar.indexOf("my-work-sort") < toolbar.indexOf("<SearchInput"), "filters first, search last");
  const panel = page.slice(page.indexOf("<Panel\n"), page.indexOf("</Panel>"));
  assert.doesNotMatch(panel, /<SearchInput|my-work-toolbar|<select/, "the list panel holds the list only");
});

test("a work group's header is its toggle, the focus task opens its update, and there is no primary button in it", () => {
  assert.match(group, /<button className="schedule-work-group-toggle" type="button" aria-expanded=\{expanded\}/);
  assert.match(group, /data-guide="work\.group"/);
  assert.match(group, /className="pg-doclink" type="button" disabled=\{saving\.has\(focus\.taskId\)\} title=\{uiText\("Update progress"\)\} onClick=\{\(\) => onEdit\(focus\)\}/);
  assert.doesNotMatch(group, /btn primary/);
  assert.doesNotMatch(group, /"Expand"|"Collapse"/);
  assert.match(group, /<WorkGroupMeta\s/);
  assert.match(screen, /function WorkGroupMeta\(/);
});

test("the guide explains the summary bar, and the card rules use the Pegasus tokens", () => {
  const guides = read("app/system/production/guide-catalog.ts");
  assert.match(guides, /target: "work\.summary",\s*action: "next",\s*view: "my-work"/);
  const css = read("app/system/production/my-work.css");
  const pegasus = css.slice(css.indexOf("My Work in the Pegasus look"));
  assert.ok(pegasus.length > 1000);
  assert.doesNotMatch(pegasus, /#[0-9a-fA-F]{3,6}\b/, "no raw colours in the Pegasus section");
  assert.match(pegasus, /\.my-work-pg :is\(\.schedule-work-group, \.estimate-work-group\)\.urgency-1 \{\s*border-left-color: var\(--pg-red-fg\);\s*\}/);
});
