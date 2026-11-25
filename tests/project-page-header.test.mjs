import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * A project's page head on @tomas-tc/ui (owner 2026-11-25): back, number and name, health and customer, the stage menu,
 * Edit project, More, the facts and the tabs. The dialogs it opens stay the app's, outside the island.
 */
test("the page head is the @tomas-tc/ui ProjectPageHeader, loaded with the page, with the guide marks the guides use", async () => {
  const [core, header] = await Promise.all([source("app/system/production/CoreScreens.tsx"), source("app/system/tomas-ui/ProjectPageHeader.tsx")]);
  assert.match(core, /const ProjectPageHeader = lazy\(\(\) => import\("\.\.\/tomas-ui\/ProjectPageHeader"\)/);
  assert.match(core, /<Suspense fallback=\{back\}>\s*<ProjectPageHeader/);
  assert.doesNotMatch(core.slice(core.indexOf("export function ProjectPage("), core.indexOf("function ProjectOverviewTab(")), /<PageHeader|<Tabs<ProjectPageTab>/);
  assert.match(header, /from "@tomas-tc\/ui";/);
  assert.match(header, /<TomasUi className="project-page-head">/);
  for (const mark of ["projectPage.header", "projectPage.stage", "projectPage.edit", "projectPage.more"]) assert.ok(header.includes(`data-guide="${mark}"`), mark);
  // Each tab keeps its data-tab, which links and guides open.
  assert.match(header, /<TabsTrigger key=\{tab\.id\} value=\{tab\.id\} data-tab=\{tab\.id\}>/);
  // Closing asks for the actual delivery in the app's dialog; other stages save at once.
  assert.match(core, /onSelect: \(\) => \(value === "Closed" \? setClosing\(true\) : void saveStage\(item, value\)\)/);
});
