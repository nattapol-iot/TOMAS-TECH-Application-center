import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Projects > Plan, the lean header (owner, 2026-11-18): three bands above the Gantt instead of seven, nothing removed.
const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");
const count = (text, needle) => text.split(needle).length - 1;

test("the Plan opens on one row: a project box that searches, the plan in brief and More", async () => {
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.equal(count(plan, '<PageHeader eyebrow="PROJECT CONTROL"'), 1, "the page title stays only on the no-permission notice");
  assert.match(
    plan,
    /<div className="plan-project-picker" data-guide="plan\.project" style=\{lockedProject \? \{ display: "none" \} : undefined\}>\s*<SearchSelect\s+value=\{selectedId === null \? "" : String\(selectedId\)\}/,
  );
  assert.doesNotMatch(plan, /projectQuery|filteredProjects/, "the separate search box is gone");
  assert.match(plan, /<span className="plan-brief" aria-label=\{uiText\("Plan\.summary"\)\}>/);
  assert.doesNotMatch(plan, /className="plan-summary"/);
  assert.match(plan, /<Panel flush>\n\s*\{rows\.length \|\| sheetView \? \(?\s*<div ref=\{fullscreenRef\}/, "the panel no longer repeats the project's name");
  // Rows are added on the Sheet itself; the old Add heading button of the Team Plan Gantt is gone (2026-11-25).
  assert.doesNotMatch(plan, /data-guide="plan\.add"/);
  assert.match(plan, /<RowDisclosure\s+label=\{uiText\("Plan\.more"\)\}\s+triggerClassName="btn default"\s+guide="plan\.more"/);
});

test("More holds what is used now and then: Excel, baseline, full screen and refresh", async () => {
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  const more = plan.slice(plan.indexOf("const moreActions: PortfolioAction[] = ["), plan.indexOf("const summary = activeSchedule?.summary;"));
  for (const key of [/key: "export", label: "Schedule\.exportExcel"/, /key: "baseline"/, /key: "fullscreen",\s*label: "Gantt\.fullScreen"/, /key: "refresh",\s*label: "Refresh"/])
    assert.match(more, key);
  assert.match(more, /activeSchedule\?\.canBaseline && rows\.length/, "a baseline is offered only to those who may take one");
  assert.match(plan, /const exportPlan = \(\) => \{\n\s*if \(!activeSchedule\) return;/);
  // The Gantt covers the page in full screen, More included, so the way back stays on the Gantt.
  assert.match(plan, /\{fullscreenActive \? \(?\s*<button\s+type="button"\s+className="btn ghost sm"\s+title=\{uiText\("Gantt\.exitFullScreen"\)\}/);
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /export function RowDisclosure\(/);
});

test("the controls keep to one row: one range list, one fold button, and a colour key that opens on request", async () => {
  const plan = await source("app/system/production/PlanningPricingScreens.tsx");
  assert.match(plan, /<GanttToolbar\s+zoom=\{zoom\}\s+allowFit\s+compact\s+onZoom=/);
  assert.match(plan, /onClick=\{anyFolded \? expandAll : collapseAll\}\s*>/);
  assert.equal(count(plan, 'uiText("Gantt.collapseAll")'), 0, "the label flips inside one button");
  assert.match(plan, /uiText\(anyFolded \? "Expand all" : "Gantt\.collapseAll"\)/);
  assert.match(plan, /const \[legendOpen, setLegendOpen\] = useState\(\(\) => typeof window !== "undefined" && readLegendOpen\(\)\);/);
  assert.match(plan, /\{peopleView \|\| sheetView \|\| !legendOpen \? null : \(?\s*<GanttLegend baseline=/);
  assert.match(plan, /aria-expanded=\{legendOpen\} onClick=\{toggleLegend\}/);
  const gantt = await source("app/system/production/GanttChart.tsx");
  assert.match(gantt, /compact \? <label className="select-field gantt-zoom-select"><select value=\{zoom\} aria-label=\{t\("Gantt\.zoom"\)\}/);
  assert.match(gantt, /: <div className="chip-select" role="group" aria-label=\{t\("Gantt\.zoom"\)\}>/, "other Gantts keep a button per range");
});

test("the new words are in three languages and the guide says where things went", async () => {
  const copy = await source("app/system/production/crm-copy.ts");
  assert.match(copy, /\["Plan\.more", "More", "เพิ่มเติม", "その他"\]/);
  assert.match(copy, /\["Plan\.legendToggle", "Colour key", "คำอธิบายสี", "色の説明"\]/);
  const guide = await source("app/system/production/guide-catalog.ts");
  const step = guide.slice(guide.indexOf('target: "plan.view"'), guide.indexOf('target: "plan.view"') + 2200);
  assert.match(step, /Export Excel, Create baseline, เต็มจอ และ Refresh อยู่ในปุ่ม 'เพิ่มเติม'/);
  assert.match(step, /Full screen and Refresh are under More\./);
  assert.match(step, /「その他」にあります/);
});
