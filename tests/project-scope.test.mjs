import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Projects wear the Pegasus ERP look, and since 2026-11-25 only that look (owner: "ไม่ต้องมี V1,V2 แล้ว ใช้ V2 เป็น Main
 * หลักได้เลย"):
 * - the Overview is a Pegasus list (a count in the title, a health summary bar, filters in the column headers, Refresh and
 *   Show closed under More);
 * - the plan is edited on the Plan tab only, on the Sheet.
 */
test("a header funnel sets one value: ticking another replaces it, unticking or Clear clears it", async () => {
  const kit = await source("app/system/tomas-ui/ProjectList.tsx");
  assert.match(kit, /checked=\{filter\.value === option\.value\} onCheckedChange=\{\(checked\) => filter\.onChange\(checked \? option\.value : null\)\}/);
  assert.match(kit, /<DropdownMenuItem onSelect=\{\(\) => filter\.onChange\(null\)\}>\{filter\.clearLabel\}<\/DropdownMenuItem>/);
});

test("the Projects tabs and the old timeline link sit in the Pegasus frame, with no look switch left", async () => {
  const [shell, scope, css] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/system/production/ProjectScope.tsx"), source("app/system/production/project-v2.css")]);
  assert.match(shell, /\{view === "projects" \? \(\s*<ProjectScope>\s*\{\/\* Plan and Punchlist read the schedule/);
  assert.match(shell, /\{view === "project-timeline" \? \(\s*<ProjectScope>\s*<ProductionProjects key="project-timeline"/);
  assert.match(scope, /import "\.\/pegasus-skin\.css";\nimport "\.\/pegasus-screens\.css";\nimport "\.\/project-v2\.css";/);
  assert.match(scope, /<div className="pg-skin pg-screen project-v2">\{children\}<\/div>/);
  for (const gone of [/project-look/, /data-guide="project\.look/, /localStorage/]) assert.doesNotMatch(scope, gone);
  assert.doesNotMatch(css, /project-look/);
  // The tab's body is a 12px column: the Pegasus skin spaces only its own children and the body sits one level down (owner
  // 2026-11-22: "UI มันแปลกๆ", every block touched the next).
  assert.match(shell, /<div className="project-body">/);
  assert.match(css, /\.project-v2 > \.project-body \{\s*display: flex;\s*flex-direction: column;\s*gap: 12px;\s*\}/);
  // Two classes, so pegasus-skin.css linked after this sheet (as the build did) cannot win a tie.
  assert.match(css, /\.pg-skin\.project-v2 \{\s*display: flex;\s*flex-direction: column;\s*gap: 12px;\s*\}/);
  assert.doesNotMatch(css, /\n\.project-v2 \{/);
});

test("every rule of project-v2.css sits under .project-v2", async () => {
  const css = (await source("app/system/production/project-v2.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((match) => match[1].trim()).filter((selector) => selector && !selector.startsWith("@"));
  assert.ok(selectors.length > 5, "rules were read");
  for (const group of selectors)
    for (const selector of group.split(",").map((part) => part.trim()))
      assert.ok(selector === ".pg-skin.project-v2" || selector.startsWith(".project-v2 ") || selector.startsWith(".project-v2 >"), `unscoped selector: ${selector}`);
});

test("the Overview is a Pegasus list on @tomas-tc/ui: count in the title, health summary bar, More, and the filters in the column headers", async () => {
  const [core, kit] = await Promise.all([source("app/system/production/CoreScreens.tsx"), source("app/system/tomas-ui/ProjectList.tsx")]);
  const screen = core.slice(core.indexOf("export function ProductionProjects("), core.indexOf("// Deleting is offered only after the API"));
  assert.doesNotMatch(screen, /useProjectLook|\bv2 \?|\bv2 &&/);
  // The list's head and table are the kit's, loaded with the screen.
  assert.match(core, /const ProjectListHead = lazy\(\(\) => import\("\.\.\/tomas-ui\/ProjectList"\)/);
  assert.match(core, /const ProjectListTable = lazy\(\(\) => import\("\.\.\/tomas-ui\/ProjectList"\)/);
  assert.match(screen, /title=\{`\$\{uiText\("Projects"\)\} \(\$\{sorted\.length\}\)`\}/);
  // The health summary bar: each cell a filter; pressed again it clears.
  assert.match(kit, /role="group" aria-label=\{props\.summary\.label\} data-guide="project\.summary"/);
  assert.match(screen, /setHealth\(key === null \|\| health === key \? null : \(key as ProjectHealth\)\)/);
  assert.match(kit, /guide="project\.mine"/);
  // Refresh and Show closed sit under More; the CEO summary and Create are buttons of their own.
  assert.match(kit, /data-guide="project\.more"/);
  assert.match(screen, /key: "closed",[\s\S]{0,200}"Portfolio\.showClosed"[\s\S]{0,120}onSelect: \(\) => toggleClosed\(!includeClosed\)/);
  assert.match(screen, /\{ key: "refresh", label: uiText\("Refresh"\), onSelect: \(\) => void load\(\) \}/);
  assert.match(kit, /data-guide="project\.ceo"/);
  assert.match(kit, /data-guide="project\.create"/);
  assert.match(screen, /ceo=\{openCeoSummary \? \{ label: uiText\("CEO\.open"\), onSelect: openCeoSummary \} : null\}/);
  // The PM, team and stage filters are buttons in the head, the same in List and Timeline (owner 2026-11-26): no header
  // funnels in the table, no second set of lists above the chart.
  for (const guide of ["project.stageFilter", "project.pmFilter", "project.teamFilter"]) assert.match(screen, new RegExp(`guide: "${guide.replace(".", "\\.")}"`), guide);
  assert.match(
    screen,
    /filters=\{\{\s*label: uiText\("Portfolio\.filters"\),\s*pm: managerFilter,\s*team: teamFilter,\s*stage: stageFilter,\s*clear: filtered \? \{ label: uiText\("Portfolio\.clearFilters"\), onSelect: clearFilters \} : null,\s*\}\}/,
  );
  assert.match(kit, /<FilterButton filter=\{props\.filters\.pm\} \/>\s*<FilterButton filter=\{props\.filters\.team\} \/>\s*<FilterButton filter=\{props\.filters\.stage\} \/>/);
  assert.doesNotMatch(kit, /Funnel/);
  assert.doesNotMatch(screen, /filterSelects|mode === "timeline" \? <Toolbar>/);
  assert.doesNotMatch(screen, /<label className="checkbox-row">/);
});

test("the plan is edited in one place: the row opens the Plan tab, Edit project leaves the plan alone", async () => {
  const [core, plan] = await Promise.all([source("app/system/production/CoreScreens.tsx"), source("app/system/production/PlanningPricingScreens.tsx")]);
  assert.match(core, /key: "open-plan", label: "CRM\.openProjectSchedule", icon: "calendar" as const, guide: "project\.openPlan", onSelect: \(\) => openProjectSchedule\(item\.id\)/);
  assert.doesNotMatch(core, /guide: "project\.editPlan"/, "no Edit Master Plan in the row menu");
  // Edit project: no plan sections, a pointer to the Plan tab, and an untouched plan is never sent.
  assert.match(core, /withPlan = true,/);
  assert.match(core, /withPlan=\{false\}/);
  assert.match(core, /\{!withPlan \? \(\s*<p className="info-strip project-plan-elsewhere" data-guide="project\.planElsewhere">/);
  assert.match(core, /const planBody = \(\) => \(planChanged \? \{ \.\.\.planPayload\(headings\), scheduleVersion: plan!\.snapshot\.scheduleVersion \} : \{\}\);/);
  // The Plan tab opens on the Sheet; old links to the Team or Master Plan view open the Sheet too.
  assert.match(plan, /useLinkedState<PlanLevel>\("level", "sheet", PLAN_LEVEL_LINK\)/);
  assert.match(plan, /const PLAN_LEVEL_LINK = choiceLink<PlanLevel>\(\["sheet", "member", "people"\]\);/);
  assert.match(plan, /\{\(\["sheet", "member", "people"\] as const\)\.map\(/);
  assert.doesNotMatch(plan, /useProjectLook|EditMasterPlanModal|plan-table|setPlanTableOpen|data-guide="plan\.add"/);
});

test("the overview guide walks the list and every step finds its element", async () => {
  const guide = await source("app/system/production/guide-catalog.ts");
  const block = guide.slice(guide.indexOf("const PROJECT_OVERVIEW: Guide"), guide.indexOf("export const GUIDES"));
  for (const target of ["project.summary", "project.pmFilter", "project.rowMenu"]) assert.match(block, new RegExp(`target: "${target.replace(".", "\\.")}"`), target);
  assert.doesNotMatch(block, /project\.look|\bV1\b|\bV2\b/);
  assert.match(guide, /\n {2}ESTIMATE_LOOK_V2,\n {2}PROJECT_OVERVIEW,\n/);
});
