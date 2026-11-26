import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript-api";

const require = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const filename = path.resolve(relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loadedModule = { exports: {} };
  modules.set(filename, loadedModule);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = (specifier) => (specifier.startsWith(".") ? load(path.resolve(path.dirname(filename), `${specifier}.ts`)) : require(specifier));
  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const screens = read("app/system/production/CoreScreens.tsx");
const portfolio = screens.slice(screens.indexOf("const PORTFOLIO_CHIP_COPY"), screens.indexOf("// Deleting is offered only after"));
const ui = read("app/system/ui.tsx");
// Since 2026-11-25 the list draws on @tomas-tc/ui; ProductionProjects keeps the data, the filters and the dialogs.
const kit = read("app/system/tomas-ui/ProjectList.tsx");

test("the portfolio loads the unpaged overview endpoint once per closed toggle", () => {
  const client = read("app/system/project-overview-client.ts");
  assert.match(client, /export interface ProjectOverviewItem extends ProjectSummary/);
  assert.match(client, /export const listProjectOverview = \(\{ includeClosed = false \}/);
  assert.match(client, /`\/api\/v1\/projects\/overview\$\{includeClosed \? "\?includeClosed=1" : ""\}`/);
  for (const field of [
    "progressSource",
    "plannedProgress",
    "slipDays",
    "overdueCount",
    "blockedCount",
    "pendingRequests",
    "lastProgressAt",
    "canChangeStatus",
    "allowedStatuses",
    "nextMilestone",
    "scheduleError",
  ]) {
    assert.match(client, new RegExp(`\\b${field}[?]?:`), field);
  }
  assert.match(portfolio, /await listProjectOverview\(\{ includeClosed \}\)/);
  assert.doesNotMatch(portfolio, /listProjects\(\{ page, pageSize/, "the table no longer pages on the server");
  // The end-user dialog still reloads its one record through the paged list.
  assert.match(portfolio, /listProjects\(\{ search: endUserProject\.number, pageSize: 100 \}\)/);
});

test("sortable headers are buttons with aria-sort and the sort is remembered per user", () => {
  assert.match(kit, /aria-sort=\{sort\.key === key \? \(sort\.direction === "asc" \? "ascending" : "descending"\) : undefined\}/);
  assert.match(kit, /<button type="button" onClick=\{\(\) => props\.onSort\(key\)\}/);
  for (const column of ["health", "number", "name", "pm", "target", "slip", "progress", "lastUpdate"]) assert.match(kit, new RegExp(`sortHead\\("${column}"`), column);
  assert.match(portfolio, /onSort=\{changeSort\}/);
  assert.match(portfolio, /portfolioSortStorageKey\(bootstrap\.user\.id\)/);
  assert.match(portfolio, /try \{\s*return parsePortfolioSort\(window\.localStorage\.getItem\(sortStorageKey\)\);\s*\} catch \{\s*return DEFAULT_PORTFOLIO_SORT;\s*\}/);
  assert.match(portfolio, /try \{\s*window\.localStorage\.setItem\(sortStorageKey, JSON\.stringify\(next\)\);\s*\} catch/);
});

test("rows open worst health first and page on the client with the 10-row default", () => {
  const lib = read("lib/project-portfolio.ts");
  assert.match(lib, /PORTFOLIO_HEALTH_ORDER: readonly PortfolioHealth\[\] = \["Delayed", "At Risk", "No plan", "On Track", "On Hold", "Completed"\]/);
  assert.match(lib, /DEFAULT_PORTFOLIO_SORT: PortfolioSort = \{ key: "health", direction: "asc" \}/);
  assert.match(portfolio, /sortPortfolio\(view\.rows, sort\)/);
  assert.match(portfolio, /const \[pageSize, setPageSize\] = useLinkedState\("rows", 10, numberLink\)/);
  assert.match(portfolio, /perPage=\{pageSize\}/);
  assert.match(kit, /<Pagination page=\{props\.page\} perPage=\{props\.perPage\} total=\{props\.total\} perPageOptions=\{\[10, 25, 50, 100\]\}/);
  assert.match(portfolio, /sorted\.slice\(\(currentPage - 1\) \* pageSize, currentPage \* pageSize\)/);
});

test("SegmentBar and FilterChips are shared components; the portfolio draws its own on @tomas-tc/ui", () => {
  assert.match(ui, /export function SegmentBar\(/);
  assert.match(ui, /export function FilterChips\(/);
  assert.doesNotMatch(ui, /import\s+["'][^"']+\.css["']/, "ui.tsx stays loadable without a bundler");
  assert.match(screens, /import "\.\.\/segment-filters\.css";/);
  // The portfolio's health bar and attention chips are the kit's (ProjectListHead): a chip pressed again clears.
  assert.match(kit, /onClick=\{\(\) => props\.chips\.onPick\(on \? null : chip\.key\)\}/);
  assert.match(kit, /disabled=\{!chip\.value && !on\}/, "an empty chip is disabled unless it is the active one");
  assert.match(portfolio, /chips=\{\{\s*label: uiText\("Portfolio\.attention"\)/);
  const css = read("app/system/segment-filters.css");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, "tokens only");
});

test("SegmentBar and FilterChips press, clear and skip empty values accessibly", () => {
  const { translate, LanguageContext } = load("app/system/i18n.ts");
  const { SegmentBar, FilterChips } = load("app/system/ui.tsx");
  const h = React.createElement;
  const render = (lang, child) => renderToStaticMarkup(h(LanguageContext.Provider, { value: { lang, setLang() {}, t: (text) => translate(text, lang) } }, child));
  const items = [
    { key: "Delayed", label: "ProjectHealth.Delayed", value: 3, tone: "red" },
    { key: "At Risk", label: "ProjectHealth.At Risk", value: 0, tone: "amber" },
    { key: "On Track", label: "ProjectHealth.On Track", value: 5, tone: "green" },
  ];
  const bar = render("TH", h(SegmentBar, { items, active: "Delayed", onPick() {}, label: "Portfolio.healthBar" }));
  assert.equal((bar.match(/class="segment-bar-seg /g) ?? []).length, 2, "an empty value draws no segment");
  assert.match(bar, /class="segment-bar-seg red active"/);
  assert.match(bar, /aria-pressed="true"/);
  assert.ok(bar.includes(`aria-label="${translate("Portfolio.healthBar", "TH")}"`));
  assert.ok(bar.includes(translate("ProjectHealth.Delayed", "TH")));
  assert.equal((bar.match(/<li>/g) ?? []).length, 3, "the legend lists every value, empty ones included");

  const chips = render(
    "EN",
    h(FilterChips, {
      items: [
        { key: "overdue", label: "Portfolio.chipOverdue", value: 4, tone: "red" },
        { key: "blocked", label: "Portfolio.chipBlocked", value: 0, tone: "red" },
        { key: "waiting", label: "Portfolio.chipWaiting", value: 0, tone: "amber" },
      ],
      active: "waiting",
      onPick() {},
    }),
  );
  assert.match(chips, /<button type="button" aria-pressed="false" class="filter-chip red"><span>Overdue tasks<\/span><strong>4<\/strong><\/button>/);
  assert.match(chips, /aria-pressed="false" disabled="" class="filter-chip red"><span>Blocked tasks/);
  assert.match(chips, /aria-pressed="true" class="filter-chip amber active"><span>Waiting for PM/, "the active chip stays enabled so it can be cleared");
  // Picking the active value again clears the filter.
  assert.match(ui, /onPick\(active === key \? null : key\)/);
  assert.match(ui, /onPick\(active === item\.key \? null : item\.key\)/);
});

test("the portfolio reports its sub-view, opens the schedule, changes stage and closes from the row menu", () => {
  // List and Timeline are separate sub-views, so the usage data can tell them apart.
  assert.match(portfolio, /useActivitySubView\(timelineMode \? "projects-timeline" : "projects-portfolio"\)/);
  assert.match(screens, /import \{ useActivitySubView \} from "\.\.\/use-activity-presence";/);
  assert.match(portfolio, /openProjectSchedule\?: \(id: number, taskId\?: number\) => void/);
  // The number and the name open the project's page, or its plan where no page is offered.
  assert.match(portfolio, /onOpen: openProjectPage \? \(\) => openProjectPage\(projectPageKey\(item\)\) : openProjectSchedule \? \(\) => openProjectSchedule\(item\.id\) : null,/);
  // The stage is a menu of every other stage; picking one saves. Non-editors still see a badge.
  assert.match(
    portfolio,
    /options: item\.canChangeStatus && item\.allowedStatuses\.length \? item\.allowedStatuses\.map\(\(value\) => \(\{ value, label: uiText\(value\), onSelect: \(\) => changeStage\(item, value\) \}\)\) : null,/,
  );
  assert.match(kit, /\) : \(\s*<Badge variant="outline">\{row\.stage\.label\}<\/Badge>\s*\)\}/);
  assert.match(portfolio, /if \(next === "Closed"\) setClosingProject\(item\)/);
  // Closing is its own row action from any open stage, and the dialog says how much work is left.
  assert.match(
    portfolio,
    /item\.canChangeStatus && item\.allowedStatuses\.includes\("Closed"\)\s*\? \[\{ key: "close", label: "Portfolio\.closeTitle", icon: "checkCircle" as const, onSelect: \(\) => setClosingProject\(item\) \}\]/,
  );
  assert.match(portfolio, /const unfinished = project\.taskCount - project\.doneCount;/);
  assert.match(portfolio, /updateProject\(item\.id, \{ rowVersion: item\.rowVersion, status: next/);
  assert.match(portfolio, /failure instanceof ApiClientError && failure\.status === 409/);
  // The row's actions live in one menu, the kit's dropdown.
  assert.match(portfolio, /label: `\$\{uiText\("Portfolio\.more"\)\} \$\{item\.number\}`,/);
  assert.match(kit, /data-guide="project\.rowMenu"/);
  for (const action of ["edit", "end-user", "members", "documents", "delete"]) assert.match(portfolio, new RegExp(`key: "${action}"`), action);
  // Plain task language instead of infrastructure jargon.
  for (const jargon of [/Live SQL Server data/, /Loading from production API/, /NAS/, /folder metadata/]) assert.doesNotMatch(portfolio, jargon);
});

test("row menus are fixed-position disclosures the table cannot clip", () => {
  const disclosure = portfolio.slice(portfolio.indexOf("function RowDisclosure"), portfolio.indexOf("// Closing needs the date"));
  assert.ok(disclosure.length > 500, "RowDisclosure moved");
  // A disclosure, not an ARIA menu: no menu roles without the menu keyboard pattern.
  assert.doesNotMatch(portfolio, /role="menu"|role="menuitem"|aria-haspopup/);
  assert.match(disclosure, /aria-expanded=\{open\}\s+aria-controls=\{open \? panelId : undefined\}/);
  assert.match(disclosure, /className="menu portfolio-menu" role="group" aria-label=\{label\}/);
  // Placed from the trigger's box with the menu's measured height, against the layout viewport (no scrollbar);
  // the row-index heuristic is gone.
  assert.match(disclosure, /rowMenuPlacement\(anchor\.getBoundingClientRect\(\), \{ width: viewport\.clientWidth, height: viewport\.clientHeight \}, menu\.offsetHeight\)/);
  assert.doesNotMatch(disclosure, /window\.innerWidth|window\.innerHeight/);
  assert.doesNotMatch(portfolio, /paged\.length > 3|index >= paged\.length|portfolio-menu\$\{up/);
  const css = read("app/system/production/project-portfolio.css");
  assert.match(css, /\.menu\.portfolio-menu \{\s*position: fixed;\s*overflow-y: auto;\s*\}/);
  assert.doesNotMatch(css, /\.portfolio-menu\.up/);
  // Scroll outside the menu or a resize closes it; Escape closes it and gives focus back to the trigger.
  assert.match(disclosure, /window\.addEventListener\("scroll", onScroll, true\)/);
  assert.match(disclosure, /window\.addEventListener\("resize", dismiss\)/);
  assert.match(disclosure, /if \(event\.key === "Escape"\) \{\s*dismiss\(\);\s*button\.current\?\.focus\(\);\s*\}/);
  // Tabbing out of the group closes it.
  assert.match(disclosure, /onBlur=\{\(event\) => \{/);
  assert.match(disclosure, /if \(open && next instanceof Node && !event\.currentTarget\.contains\(next\)\) setOpen\(false\)/);
});

test("PM, team and status filters only apply values the controls can show", () => {
  assert.match(portfolio, /const activeManagerId = effectiveOption\(managerId, managerIds\)/);
  assert.match(portfolio, /const activeTeam = effectiveOption\(team, teams\)/);
  assert.match(portfolio, /const activeStatus = effectiveStatusFilter\(status, includeClosed\)/);
  assert.match(portfolio, /managerId: activeManagerId, team: activeTeam, mineUserId: mine \? bootstrap\.user\.id : null, status: activeStatus/);
  // The head's filter buttons (List and Timeline alike) show the values in force.
  assert.match(portfolio, /value: activeManagerId === null \? null : String\(activeManagerId\),/);
  assert.match(portfolio, /value: activeTeam,/);
  assert.match(portfolio, /value: activeStatus,/);
  assert.match(
    portfolio,
    /const toggleClosed = \(next: boolean\) => \{\s*setIncludeClosed\(next\);\s*if \(!next && status === "Closed"\) setStatus\("All status"\);/,
    "unticking Show closed clears a Closed filter",
  );
});

test("the project name opens the schedule only for users who can read it", () => {
  const shell = read("app/system/ProductionApp.tsx");
  assert.match(
    shell,
    /<ProductionProjects\s+\{\.\.\.common\}\s+teamTestMode=\{IS_TEAM_TEST_MODE\}\s+openProjectSchedule=\{bootstrap\.permissions\.includes\("schedule\.read"\) \? openProjectSchedule : undefined\}\s+openProjectPage=\{openProjectPage\}\s+openCreatePage=\{\(\) => changeProjectTab\("create"\)\}\s+\{\.\.\.\(seesProjectCost \? \{ openCeoSummary: \(\) => openCeoSummary\(\) \} : \{\}\)\}\s*\/>/,
  );
  // Without a way to open it, the name is plain text.
  assert.match(kit, /\) : \(\s*<strong className="truncate font-medium">\{row\.name\}<\/strong>\s*\)\}/);
});

test("Overview has a List | Timeline toggle on the shared Gantt, remembered per user", () => {
  const shell = read("app/system/ProductionApp.tsx");
  // The mode is on the link and remembered per person (screen-link.tsx useLinkedState).
  assert.match(portfolio, /const \[mode, changeMode\] = useLinkedState<PortfolioMode>\("view", initialMode \?\? "list", PORTFOLIO_MODE_LINK\)/);
  assert.match(portfolio, /value: mode,\s*onChange: changeMode,/);
  assert.match(read("app/system/tomas-ui/Segmented.tsx"), /role="radio"\s+aria-checked=\{option\.value === value\}/);
  // Timeline draws the same filtered, sorted rows as the list.
  assert.match(portfolio, /<ProjectPortfolioGantt\s+key=\{overview\?\.loadedAt \?\? 0\}\s+rows=\{sorted\}/);
  // The timeline sorts with the same sort as the list (it has no column headers of its own).
  assert.match(portfolio, /PORTFOLIO_SORT_KEYS\.map\(\(key\) => \(\s*<option key=\{key\} value=\{key\}>/);
  const gantt = read("app/system/production/ProjectPortfolioGantt.tsx");
  assert.match(gantt, /from "\.\/GanttChart"/);
  // Tasks load only when a project is expanded, one schedule per expanded project.
  assert.match(gantt, /apiRequest<ProjectSchedule>\(`\/api\/v1\/projects\/\$\{projectId\}\/schedule`\)/);
  assert.match(gantt, /if \(opening && \(!loaded \|\| loaded\.status === "error"\)\) void load\(projectId\);/);
  // A task bar opens the plan on that task.
  assert.match(gantt, /onOpen: \(\) => openPlan\(item\.id, task\.id\)/);
  assert.match(gantt, /const openPlan = openProjectSchedule\s*\? \(id: number, taskId\?: number\) => \{\s*void fullscreen\.exit\(\);\s*openProjectSchedule\(id, taskId\);\s*\}/);
  // The old Project Timeline menu opens the portfolio in Timeline mode; the old screen is gone.
  assert.match(shell, /view === "project-timeline" \? \(?\s*<ProjectScope>\s*<ProductionProjects key="project-timeline" \{\.\.\.common\} teamTestMode=\{IS_TEAM_TEST_MODE\} initialMode="timeline"/);
  assert.doesNotMatch(shell, /ProductionProjectTimeline/);
});

test("the row menu and stage come before the project name, so a small screen needs no sideways scroll to reach them", () => {
  const head = kit.slice(kit.indexOf("<TableHeader>"), kit.indexOf("</TableHeader>"));
  assert.ok(head.indexOf("labels.actions") < head.indexOf("labels.stage"));
  assert.ok(head.indexOf("labels.stage") < head.indexOf('sortHead("name"'));
  const row = kit.slice(kit.indexOf("<TableRow key={row.id}>"), kit.indexOf("</TableRow>", kit.indexOf("<TableRow key={row.id}>")));
  assert.ok(row.indexOf('data-guide="project.rowMenu"') < row.indexOf("row.stage.options"));
  assert.ok(row.indexOf("row.stage.options") < row.indexOf("{row.name}"));
});

test("the portfolio's PM, slip and hours columns give way on a phone", () => {
  assert.match(kit, /const PHONE_HIDDEN = "max-\[720px\]:hidden";/);
  assert.match(kit, /sortHead\("pm", undefined, PHONE_HIDDEN\)/);
  // The project's name keeps 12rem on a 1366 px laptop instead of shrinking to its padding; the table scrolls instead.
  assert.match(kit, /sortHead\("name", undefined, "w-\[34%\] min-w-48 max-w-0"\)/);
  assert.match(kit, /sortHead\("slip", undefined, PHONE_HIDDEN\)/);
  assert.match(kit, /<TableHead className=\{PHONE_HIDDEN\}>\{labels\.hours\}<\/TableHead>/);
  assert.match(kit, /<TableCell className=\{PHONE_HIDDEN\}>\{row\.pm\}<\/TableCell>/);
});

test("every portfolio string has Thai and Japanese copy", () => {
  const { translate } = load("app/system/i18n.ts");
  const keys = new Set([...portfolio.matchAll(/"(Portfolio\.[A-Za-z]+)"/g)].map((match) => match[1]));
  assert.ok(keys.size >= 40, `expected the portfolio copy, found ${keys.size} keys`);
  keys.add("Portfolio.typedProgress");
  for (const key of keys) {
    assert.notEqual(translate(key, "EN"), key, `${key} has no English`);
    assert.notEqual(translate(key, "TH"), key, `${key} has no Thai`);
    assert.notEqual(translate(key, "JP"), key, `${key} has no Japanese`);
  }
  assert.match(screens, /<LocalizedText text=\{"Portfolio\.typedProgress"\} \/>/, "the typed progress field says when it is used");
});
