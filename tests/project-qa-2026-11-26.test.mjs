import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { actualDiscipline, rowDisciplines } from "../backend-node/src/project-cost-model.ts";

// The owner's QA round on PJ260210 (2026-11-26): seven findings on the project pages.
const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("one discipline rule: typed on the row or above, an installation heading, else the PICs' departments", () => {
  const rows = new Map(
    [
      { id: 1, parentId: null, kind: "phase", name: "ติดตั้งหน้างาน", discipline: null },
      { id: 2, parentId: 1, kind: "task", name: "Cable pulling", discipline: null },
      { id: 3, parentId: null, kind: "phase", name: "Design", discipline: null },
      { id: 4, parentId: 3, kind: "task", name: "PLC program", discipline: null },
      { id: 5, parentId: 4, kind: "detail", name: "IO list", discipline: null },
      { id: 6, parentId: 3, kind: "task", name: "Panel", discipline: "Electrical" },
      { id: 7, parentId: 3, kind: "task", name: "Nobody yet", discipline: null },
    ].map((row) => [row.id, row]),
  );
  const departments = new Map([
    [2, ["Electrical Engineer Dept."]],
    [4, ["IoT Engineer Dept.", "Mechanical Engineer Dept."]],
    [6, ["IoT Engineer Dept."]],
  ]);
  assert.deepEqual(rowDisciplines(2, rows, departments), ["Installation"], "under an installation heading, whoever does it");
  assert.deepEqual(rowDisciplines(4, rows, departments), ["Software", "Mechanical"], "two PICs split the row");
  assert.deepEqual(rowDisciplines(5, rows, departments), ["Software", "Mechanical"], "a sub row takes its task's PICs");
  assert.deepEqual(rowDisciplines(6, rows, departments), ["Electrical"], "typed beats the PIC's department");
  assert.deepEqual(rowDisciplines(7, rows, departments), ["Unassigned"]);
  assert.equal(actualDiscipline({ workKey: "Project-2", department: "IoT Engineer Dept." }, rows), "Installation");
  assert.equal(actualDiscipline({ workKey: null, department: "IoT Engineer Dept." }, rows), "Software");
});

test("the Plan sheet splits hours by discipline with that rule, and keeps one 'no discipline' entry", async () => {
  const sheet = await source("app/system/production/PlanSheet.tsx");
  const cost = await source("backend-node/src/project-cost.ts");
  // The server's own split and the sheet read the one function.
  assert.match(cost, /export \{ actualDiscipline, rowDisciplines \};/);
  assert.match(sheet, /import \{ rowDisciplines, type DisciplineRow, type LaborDiscipline \} from "\.\.\/\.\.\/\.\.\/backend-node\/src\/project-cost-model";/);
  assert.match(sheet, /rowDisciplines\(row\.task\.id, disciplineRows, picDepartments\)/);
  // The Estimate's unclassified labor and the plan's rows with no discipline are one entry.
  assert.match(sheet, /entry\(line\.discipline === "Other" \? "Unassigned" : line\.discipline\)\.budget/);
  assert.doesNotMatch(sheet, /"None"/);
  // Confirmed hours come from the server, counted as the Overview counts them.
  assert.match(sheet, /for \(const line of serverActual \?\? \[\]\) entry\(line\.discipline\)\.actual \+= line\.hours;/);
  // The filter shows the rows the strip counted.
  assert.match(sheet, /!\(shares\.get\(row\.task\.id\) \?\? \[\]\)\.some\(\(value\) => value === disciplineFilter\)/);
  const route = await source("backend-node/src/routes/schedule.ts");
  assert.match(route, /const actualByDiscipline = await readActualByDiscipline\(transaction, projectId, tasks\);/);
  const pics = await source("backend-node/src/schedule-service.ts");
  assert.match(pics, /SELECT pic\.task_id,u\.id,u\.name,u\.email,u\.department,/);
  // The Overview names the disciplines as the sheet does.
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /uiText\(row\.discipline === "Unassigned" \? "Plan\.mhDiscipline\.Other" : `Discipline\.\$\{row\.discipline\}`\)/);
});

test("rows to chase and the plan's To follow up have their own names, and the plan says which is which", async () => {
  const i18n = await source("app/system/i18n.ts");
  assert.match(i18n, /"Portfolio\.colFollow": \{ en: "Rows to chase", th: "งานต้องตาม"/);
  assert.match(i18n, /"Portfolio\.followRule":/);
  const sheet = await source("app/system/production/PlanSheet.tsx");
  assert.match(sheet, /const CHASE_GROUPS = new Set\(\["late", "blocked", "due", "noMember", "noPr"\]\);/);
  assert.match(sheet, /t\("Sheet\.followRows"\)\.replace\("\{n\}", String\(chaseCount\)\)/);
  // The same five kinds the server counts for the list.
  const overview = await source("backend-node/src/project-overview.ts");
  assert.match(overview, /if \(late \|\| leaf\.status === "Blocked" \|\| due \|\| noMember \|\| noRequest\) count \+= 1;/);
});

test("the project page is one column no wider than the page: a wide plan scrolls in its own sheet", async () => {
  const css = await source("app/system/production/project-portfolio.css");
  assert.match(css, /\.project-page \{\n {2}display: grid;\n[^}]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.project-page > \* \{\n {2}min-width: 0;\n\}/);
});

test("back from a project's page, the list keeps its search, filters, page and place", async () => {
  const app = await source("app/system/ProductionApp.tsx");
  assert.match(app, /if \(view === "projects" && projectTab === "portfolio"\) projectListReturn\.current = \{ opened: \{ \.\.\.screenLink\.current\.params \}, scrollY: window\.scrollY \};/);
  assert.match(app, /if \(saved\) screenLink\.current = \{ view: "projects", path: \[\], params: \{\}, opened: saved\.opened, fromLink: true \};/);
  assert.match(app, /onBack=\{backToProjectList\}/);
  const core = await source("app/system/production/CoreScreens.tsx");
  assert.match(core, /const \[page, setPage\] = useLinkedState\("page", 1, numberLink, \{ remember: false \}\);/);
});

test("the Overview's activity says what changed in words, and files under one name are told apart", async () => {
  const core = await source("app/system/production/CoreScreens.tsx");
  const words = await source("app/system/production/schedule-change-text.ts");
  for (const field of ["percent_complete", "actual_finish", "people"]) assert.match(words, new RegExp(`  ${field}: \\["`), field);
  assert.match(core, /"Edited in the People table": \["แก้ในตารางคน"/);
  assert.ok(core.includes("activityText(entry, copy, { lang, t: uiText, day: formatDay })"), "the Overview reads the shared words");
  assert.match(core, /formatDateTime\(document\.uploadedAt\)/);
  const route = await source("backend-node/src/routes/projects.ts");
  assert.ok(route.includes("LEFT(s.from_value,2000) from_value,LEFT(s.to_value,2000) to_value"), "enough of a plan row to say what changed");
  assert.match(route, /ROW_NUMBER\(\) OVER\(PARTITION BY d\.name ORDER BY d\.uploaded_at,d\.id\) copy_no/);
  const docs = await source("app/system/tomas-ui/ProjectDocumentsTab.tsx");
  assert.match(docs, /t\("ProjectDocs\.copyOf"\)/);
});
