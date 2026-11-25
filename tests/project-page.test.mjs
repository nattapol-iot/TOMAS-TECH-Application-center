import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("the project page's Overview is the @tomas-tc/ui boxes: the figures row and the eight boxes, each a way on (task doc 5.3)", async () => {
  const [core, kit] = await Promise.all([source("app/system/production/CoreScreens.tsx"), source("app/system/tomas-ui/ProjectOverviewBoxes.tsx")]);
  const tab = core.slice(core.indexOf("function ProjectOverviewTab("), core.indexOf("// Deleting is offered only after the API"));
  assert.match(core, /const ProjectOverviewBoxes = lazy\(\(\) => import\("\.\.\/tomas-ui\/ProjectOverviewBoxes"\)/);
  assert.match(tab, /apiRequest<PageOverview>\(`\/api\/v1\/projects\/\$\{item\.id\}\/page-overview`\)/);
  for (const key of ["dates", "headings", "hours", "purchase", "team", "documents", "payments", "activity"]) assert.match(tab, new RegExp(`key: "${key}",`), key);
  for (const key of ["progress", "slip", "follow", "hours", "milestone", "requests"]) assert.match(tab, new RegExp(`key: "${key}",`), key);
  // Purchase requests open the Cost tab only for those who see it; payments open Edit project only for writers.
  assert.match(tab, /onOpen: seesCost \? \(\) => onTab\("cost"\) : null,/);
  assert.match(tab, /onOpen: onEdit,/);
  // Money is never shown here.
  const code = tab.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(code, /amount|baht|THB|฿/i);
  // A box is a kit Card keyed by data-box, never a class its own content uses (a box once became .po-dates).
  assert.match(kit, /<Card key=\{box\.key\} className="gap-3 py-4" data-box=\{box\.key\}>/);
  for (const mark of ["projectPage.summary", "projectPage.boxes"]) assert.ok(kit.includes(`data-guide="${mark}"`), mark);
});

test("the Cost tab: views, four figures that open them, the man-day curve, by task and by person (task doc 6.1)", async () => {
  const screen = await source("app/system/production/ProjectCostScreen.tsx");
  assert.match(screen, /const COST_VIEWS: CostView\[\] = \["overview", "tasks", "people", "bought"\];/);
  assert.match(screen, /<ProjectCostPage \{\.\.\.useProjectCostDetail\(projectId\)\} \/>/);
  for (const mark of ["cost.views", "cost.cells"]) assert.ok(screen.includes(`data-guide="${mark}"`), mark);
  // The confirmed line stops at today; the plan runs on.
  assert.match(screen, /if \(point\.week <= today\) doneUpTo = index;/);
  const copy = await source("app/system/production/project-cost-copy.ts");
  for (const key of ["Cost.view.overview", "Cost.view.tasks", "Cost.view.people", "Cost.view.bought", "Cost.curveTitle", "Cost.noHours"]) assert.ok(copy.includes(`"${key}"`), key);
});
