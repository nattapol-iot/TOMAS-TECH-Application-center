import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PROJECT_LOOK_DEFAULT, parseProjectLook, projectLookKey, singleFilterValue } from "../lib/project-look.ts";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * Projects in two looks (owner 2026-11-22): V1 is the screen as it was. V2 is the Pegasus ERP look, leaner:
 * - the Overview is a Pegasus list (a count in the title, a health summary bar, filters in the column headers, Refresh and
 *   Show closed under More);
 * - the plan is edited on the Plan tab only.
 * Everyone starts on V1.
 */
test("everyone starts on V1, the choice is per person and apart from Estimating and Sales", () => {
  assert.equal(PROJECT_LOOK_DEFAULT, "v1");
  for (const value of [null, undefined, "", "V2", "v3", 2]) assert.equal(parseProjectLook(value), "v1");
  assert.equal(parseProjectLook("v2"), "v2");
  assert.equal(projectLookKey(42), "tomas-tech-project-look:42");
});

test("a header funnel sets one value: the one ticked last, or none when cleared", () => {
  assert.equal(singleFilterValue(null, []), null);
  assert.equal(singleFilterValue(null, ["7"]), "7");
  assert.equal(singleFilterValue("7", ["7", "9"]), "9");
  assert.equal(singleFilterValue("7", ["7"]), "7");
  assert.equal(singleFilterValue("7", []), null);
});

test("the Projects tabs and the old timeline link wear the switch; V1 is display: contents", async () => {
  const [shell, scope, css] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/system/production/ProjectLook.tsx"), source("app/system/production/project-v2.css")]);
  assert.match(shell, /\{view === "projects" \? \(\s*<ProjectLookScope userId=\{bootstrap\.user\.id\}>\s*\{\/\* Plan and Punchlist read the schedule/);
  assert.match(shell, /\{view === "project-timeline" \? \(\s*<ProjectLookScope userId=\{bootstrap\.user\.id\}>\s*<ProductionProjects key="project-timeline"/);
  assert.match(scope, /import "\.\/pegasus-skin\.css";\nimport "\.\/pegasus-screens\.css";\nimport "\.\/project-v2\.css";/);
  assert.match(scope, /look === "v2" \? "pg-skin pg-screen project-v2" : "project-look-v1"/);
  assert.match(scope, /data-guide="project\.look"/);
  assert.match(scope, /data-guide="project\.lookV2"/);
  assert.match(css, /\.project-look-v1 \{\s*display: contents;\s*\}/);
  // The tab's body: 14px under the tabs in V1, as before. In V2 a 12px column, because the Pegasus skin spaces only its own
  // children and the body sits one level down (owner 2026-11-22: "UI มันแปลกๆ", every block touched the next).
  assert.match(shell, /<div className="project-look-body">/);
  assert.match(css, /\.project-look-body \{\s*margin-top: 14px;/);
  assert.match(css, /\.project-v2 > \.project-look-body \{\s*display: flex;\s*flex-direction: column;\s*gap: 12px;\s*margin-top: 0;\s*\}/);
  // V2: the switch shares the tabs' row instead of a row of its own.
  assert.match(css, /\.project-v2 > \.project-look-bar \{\s*grid-column: 2;\s*grid-row: 1;/);
  assert.match(css, /\.project-v2 > \.tabs \{\s*grid-column: 1;\s*grid-row: 1;\s*\}/);
  // Two classes, so pegasus-skin.css linked after this sheet (as the build did) cannot turn the grid back into its flex column.
  assert.match(css, /\.pg-skin\.project-v2 \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(css, /\n\.project-v2 \{/);
});

test("every rule of project-v2.css is the switch's own or sits under .project-v2", async () => {
  const css = (await source("app/system/production/project-v2.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((match) => match[1].trim()).filter((selector) => selector && !selector.startsWith("@"));
  assert.ok(selectors.length > 20, "rules were read");
  for (const group of selectors)
    for (const selector of group.split(",").map((part) => part.trim()))
      assert.ok(selector === ".pg-skin.project-v2" || selector.startsWith(".project-v2 ") || selector.startsWith(".project-look-"), `unscoped selector: ${selector}`);
});

test("the V2 Overview is a Pegasus list: count in the title, health summary bar, More, and the filters in the column headers", async () => {
  const core = await source("app/system/production/CoreScreens.tsx");
  const screen = core.slice(core.indexOf("export function ProductionProjects("), core.indexOf("// Deleting is offered only after the API"));
  assert.match(screen, /const v2 = useProjectLook\(\) === "v2";/);
  assert.match(screen, /title=\{`\$\{uiText\("Projects"\)\} \(\$\{sorted\.length\}\)`\}/);
  assert.match(screen, /<div className="pg-summary project-summary" role="group" aria-label=\{uiText\("Portfolio\.healthBar"\)\} data-guide="project\.summary">/);
  assert.match(screen, /setHealth\(health === item\.key \? null : \(item\.key as ProjectHealth\)\)/, "a pressed cell clears on a second press");
  assert.match(screen, /data-guide="project\.mine"/);
  // Refresh and Show closed moved under More; the create button stays the last action.
  assert.match(screen, /guide="project\.more"/);
  assert.match(screen, /key: "closed",[\s\S]{0,200}"Portfolio\.showClosed"[\s\S]{0,120}onSelect: \(\) => toggleClosed\(!includeClosed\)/);
  assert.match(screen, /key: "refresh",\s*label: "Refresh"/);
  // Task doc 5.1: the CEO summary is a button of its own between More and Create, for Leaders and above.
  assert.match(
    screen,
    /\{openCeoSummary \? \(\s*<button type="button" className="btn default" data-guide="project\.ceo" onClick=\{openCeoSummary\}>[\s\S]{0,160}\) : null\}\s*\{createButton\}\s*<\/div>/,
  );
  assert.doesNotMatch(screen, /key: "ceo", label: "CEO\.open"/, "no longer hidden under More");
  // The PM, team and stage filters are header funnels in the list, and lists above the chart in Timeline.
  for (const guide of ["project.stageFilter", "project.pmFilter"]) assert.match(screen, new RegExp(`guide="${guide.replace(".", "\\.")}"`), guide);
  assert.match(screen, /column="name"[^\n]*filter=\{v2 \? teamFilter : undefined\}/);
  assert.match(screen, /column="pm"[^\n]*filter=\{v2 \? managerFilter : undefined\}/);
  assert.match(screen, /\{mode === "timeline" \? <Toolbar>\{filterSelects\}<\/Toolbar> : null\}/);
  // V1 keeps its toolbar, built from the same three lists.
  assert.match(screen, /placeholder="Portfolio\.search"\s*\/>\s*\{filterSelects\}\s*<label className="checkbox-row">/);
});

test("V2 edits the plan in one place: the row opens the Plan tab, Edit project leaves the plan alone, the table editor sits on the Plan tab", async () => {
  const [core, plan] = await Promise.all([source("app/system/production/CoreScreens.tsx"), source("app/system/production/PlanningPricingScreens.tsx")]);
  // V1 keeps Edit Master Plan in the row menu; V2 offers Open Project Schedule instead.
  assert.match(core, /key: "open-plan", label: "CRM\.openProjectSchedule", icon: "calendar" as const, guide: "project\.openPlan", onSelect: \(\) => openProjectSchedule\(item\.id\)/);
  assert.match(core, /key: "plan", label: "CRM\.editMasterPlan", icon: "calendar" as const, guide: "project\.editPlan", onSelect: \(\) => setPlanningProject\(item\)/);
  // Edit project in V2: no plan sections, a pointer to the Plan tab, and an untouched plan is never sent.
  assert.match(core, /withPlan = true,/);
  assert.match(core, /\{\.\.\.\(v2\s*\?\s*\{\s*withPlan: false,/);
  assert.match(core, /\{!withPlan \? \(\s*<p className="info-strip project-plan-elsewhere" data-guide="project\.planElsewhere">/);
  assert.match(core, /const planBody = \(\) => \(planChanged \? \{ \.\.\.planPayload\(headings\), scheduleVersion: plan!\.snapshot\.scheduleVersion \} : \{\}\);/);
  // Task doc 1.10: V2 edits the plan on the Sheet alone; the table editor dialog stays for V1's row menu only.
  assert.match(core, /export function EditMasterPlanModal\(/);
  assert.match(plan, /import \{ RowDisclosure, type PortfolioAction \} from "\.\/CoreScreens";/);
  assert.doesNotMatch(plan, /EditMasterPlanModal|plan-table|setPlanTableOpen/);
});

test("the guide walks through V2 and every step finds its element", async () => {
  const guide = await source("app/system/production/guide-catalog.ts");
  const block = guide.slice(guide.indexOf("const PROJECT_LOOK_V2: Guide"), guide.indexOf("export const GUIDES"));
  for (const target of ["project.lookV2", "project.summary", "project.pmFilter", "project.rowMenu", "project.look"]) assert.match(block, new RegExp(`target: "${target.replace(".", "\\.")}"`), target);
  assert.match(guide, /\n {2}ESTIMATE_LOOK_V2,\n {2}PROJECT_LOOK_V2,\n/);
});
