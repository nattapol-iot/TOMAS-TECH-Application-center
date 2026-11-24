import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("the project page's Overview boxes never take a class their own content uses (task doc 5.3)", async () => {
  const core = await source("app/system/production/CoreScreens.tsx");
  const css = await source("app/system/production/project-portfolio.css");
  // A box named after its key once became .po-dates, the dates list's two-column grid, and split its own header.
  assert.match(core, /<section key=\{key\} className=\{`po-box po-box-\$\{key\}`\}>/);
  assert.doesNotMatch(css, /\.po-box-[a-z]+\s*\{/, "the per-box class is a hook, not styled by name");
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
