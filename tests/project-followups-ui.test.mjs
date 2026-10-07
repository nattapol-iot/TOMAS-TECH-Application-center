import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

/* Project-area follow-ups: Timeline task search, the waiting-for-you inbox, inline acknowledge, the
   Inquiry work panel, document withdrawal, uncapped project pickers, the PM/Lead dropdown and CRM on
   the shared filter components. */

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
  const localRequire = (specifier) => specifier.startsWith(".")
    ? load(path.resolve(path.dirname(filename), `${specifier}.ts`)) : require(specifier);
  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const core = read("app/system/production/CoreScreens.tsx");
const gantt = read("app/system/production/ProjectPortfolioGantt.tsx");
const client = read("app/system/project-overview-client.ts");

test("the Timeline finds tasks across projects and shows only the matches with their parents", () => {
  assert.match(client, /\/api\/v1\/schedule\/search\?q=\$\{encodeURIComponent\(query\)\}/);
  assert.match(gantt, /const result = await searchScheduleTasks\(query, includeClosed\);/);
  // At least two characters, the same floor as the API.
  assert.match(gantt, /if \(query\.length < 2\) return;/);
  assert.match(gantt, /disabled=\{searching \|\| taskQuery\.trim\(\)\.length < 2\}/);
  // Only matching projects stay, the first EXPAND_LIMIT of them open, and a task shows when it or a child matches.
  assert.match(gantt, /const visibleRows = hits \? rows\.filter\(\(item\) => hits\.has\(item\.id\)\) : rows;/);
  assert.match(gantt, /open\(rows\.filter\(\(item\) => matches\.has\(item\.id\)\)\.slice\(0, EXPAND_LIMIT\)/);
  assert.match(gantt, /const taskMatches = \(task: ScheduleTask, hits: Set<number>\): boolean => hits\.has\(task\.id\) \|\| task\.children\.some/);
  assert.match(gantt, /if \(projectHits && !taskMatches\(task, projectHits\)\) continue;/);
  // Nothing is dropped silently: hidden-by-filter projects, unopened projects and the API cap are all said.
  for (const key of ["Gantt.searchHidden", "Gantt.expandLimit", "Gantt.searchTruncated", "Gantt.clearSearch"]) assert.ok(gantt.includes(`"${key}"`), key);
  // The closed-projects switch reaches the search.
  assert.match(core, /<ProjectPortfolioGantt key=\{overview\?\.loadedAt \?\? 0\} rows=\{sorted\} today=\{today\(\)\} canReadSchedule=\{[^}]+\} includeClosed=\{includeClosed\}/);
  const css = read("app/system/production/project-portfolio.css");
  assert.match(css, /\.portfolio-gantt-search \{/);
  assert.match(css, /\.portfolio-waiting \{/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, "tokens only");
});

test("day requests waiting for the signed-in PM or EM are listed above the portfolio", () => {
  assert.match(client, /export const listPendingDayRequests = \(\) => apiRequest<PendingDayRequest\[\]>\("\/api\/v1\/schedule\/day-requests\/pending"\)/);
  assert.match(core, /<details className="portfolio-waiting" open>/);
  assert.match(core, /onClick=\{\(\) => openProjectSchedule\(request\.projectId, request\.taskId\)\}/);
});

test("new assignments can be acknowledged in place, one at a time or as a group", () => {
  const workspace = read("app/system/production/ResourceTaskWorkspace.tsx");
  assert.match(workspace, /apiRequest\(`\/api\/v1\/resource-tasks\/\$\{task\.id\}\/acknowledge`,\{method:'POST',body:JSON\.stringify\(\{rowVersion:task\.rowVersion,scheduleVersion:task\.scheduleVersion\}\)\}\)/);
  assert.match(workspace, /className="new-assignment-child-actions"/);
  assert.match(workspace, /group\.items\.filter\(canAcknowledge\)\.length>1\?<div className="new-assignment-group-actions">/);
  const css = read("app/system/production/my-work.css");
  assert.match(css, /\.new-assignment-child > \.new-assignment-child-actions \{/, "the two buttons sit side by side, not in the info grid");
});

test("My Work keeps acknowledged Inquiry work, remembers its sort and says when nothing was reported", () => {
  const screens = read("app/system/production/PlanningPricingScreens.tsx");
  assert.match(screens, /\/api\/v1\/resource-tasks\?mine=true&filter=Approved&source=estimate&pageSize=100/);
  assert.match(screens, /`\/api\/v1\/resource-tasks\/\$\{[a-z.]+\}\/progress`/);
  assert.match(screens, /"MyWork\.inquiryWork"/);
  assert.match(screens, /tomas-tech-my-work-sort:\$\{/);
  assert.match(screens, /item\.lastProgressAt === null \? <LocalizedText text=\{"MyWork\.noReportYet"\} \/>/);
  assert.match(screens, /const workLastReport = \(item: MyWorkItem\) => item\.lastProgressAt \?\? item\.updatedAt;/);
});

test("a mistaken project document is withdrawn with a reason, never deleted", () => {
  const api = read("app/system/api-client.ts");
  assert.match(api, /export const withdrawProjectDocument = \(projectId: number, documentId: number, input: \{ rowVersion: string; reason: string \}\) =>/);
  assert.match(api, /\{ method: "DELETE", body: JSON\.stringify\(input\) \}/);
  assert.match(core, /\{document\.canWithdraw \? <button className="btn ghost sm" type="button"/);
  assert.match(core, /await withdrawProjectDocument\(project\.id, target\.id, \{ rowVersion: target\.rowVersion, reason: withdrawReason\.trim\(\) \}\);/);
  assert.match(core, /disabled=\{withdrawBusy \|\| !withdrawReason\.trim\(\)\}/);
  assert.match(core, /<textarea required maxLength=\{500\}/, "the API caps the reason at 500");
});

test("project pickers list every project in scope instead of the first page of 100", () => {
  const signing = read("app/system/production/SigningScreens.tsx");
  const material = read("app/system/production/MaterialScreens.tsx");
  const admin = read("app/system/production/AdminAnalyticsScreens.tsx");
  assert.match(signing, /useEndpoint<ProjectSummary\[\]>\(useCallback\(\(\) => listAllProjectsByNumber\(\), \[\]\)/);
  assert.doesNotMatch(signing, /listProjects\(\{ pageSize: 200 \}\)/);
  assert.match(material, /useEndpoint<ProjectPage>\(projectOverviewPath\(true\), \{ items: \[\] \}\)/);
  assert.match(admin, /void listAllProjectsByNumber\(\)/);
  for (const source of [material, admin]) assert.doesNotMatch(source, /\/api\/v1\/projects\/\?page=1&pageSize=100/);
});

test("pickers order projects newest number first, numerically", () => {
  // The comparator is pure; check it without loading the API client.
  const source = client.match(/export const newestProjectFirst = (\([^\n]+);/)[1];
  const compare = new Function(`return ${ts.transpile(source)}`)();
  const numbers = ["P-26-002", "P-26-010", "P-25-100", "P-26-001"].map((number) => ({ number }));
  assert.deepEqual(numbers.sort(compare).map((item) => item.number), ["P-26-010", "P-26-002", "P-26-001", "P-25-100"]);
});

test("Edit project lists PMs and leads by effective role and always shows who is assigned", () => {
  const bootstrap = read("backend-node/src/routes/bootstrap.ts");
  assert.match(bootstrap, /SELECT STRING_AGG\(effective\.code, N'\|'\) FROM dbo\.user_effective_roles effective WHERE effective\.user_id = app_user\.id\) AS effective_roles/);
  assert.match(bootstrap, /roles: row\.effective_roles \? row\.effective_roles\.split\("\|"\) : \[row\.role\]/);
  assert.match(core, /member\.id === keepId \|\| \(member\.roles \?\? \[member\.role\]\)\.some\(\(role\) => roles\.includes\(role\)\)/);
  assert.match(core, /managers\.some\(\(member\) => member\.id === project\.managerId\) \? null : <option value=\{project\.managerId\}>\{project\.managerName\}<\/option>/);
  assert.match(core, /engineers\.some\(\(member\) => member\.id === project\.leadEngineerId\) \? null : <option value=\{project\.leadEngineerId\}>\{project\.leadEngineerName\}<\/option>/);
});

test("CRM's pipeline bar and attention chips are the shared SegmentBar and FilterChips", () => {
  const crm = read("app/system/production/CrmScreens.tsx");
  const css = read("app/system/production/crm.css");
  assert.match(crm, /<SegmentBar label="CRM\.pipelineOverview" items=\{items\}/);
  assert.match(crm, /return <FilterChips items=\{ATTENTION_KEYS\.map/);
  assert.match(crm, /import "\.\.\/segment-filters\.css";/);
  assert.doesNotMatch(css, /\.crm-(seg|legend|dot|chip|distribution-bar|distribution-head)\b/, "no second copy of the shared styles");
  assert.doesNotMatch(crm, /crm-(seg|legend|dot|chip)\b/);

  // The stage ramp keeps its chart colours through FilterItem.color.
  const { translate, LanguageContext } = load("app/system/i18n.ts");
  const { SegmentBar } = load("app/system/ui.tsx");
  const h = React.createElement;
  const markup = renderToStaticMarkup(h(LanguageContext.Provider, { value: { lang: "EN", setLang() {}, t: (text) => translate(text, "EN") } },
    h(SegmentBar, { items: [{ key: "NEW", label: "New", value: 2, tone: "slate", color: "var(--c8)" }, { key: "WON", label: "Won", value: 1, tone: "green" }], active: null, onPick() {} })));
  assert.match(markup, /style="flex-grow:2;background:var\(--c8\)"/);
  assert.match(markup, /class="segment-bar-dot slate" style="background:var\(--c8\)"/);
  assert.match(markup, /class="segment-bar-dot green"><\/i>/, "without a colour the tone draws it");
});

test("review fixes: one quiet-days clock, Inquiry cards that only offer what they keep, and errors that stay visible", () => {
  const screens = read("app/system/production/PlanningPricingScreens.tsx");
  // The "Needs update" count, filter and badge read the same last report as the card's "Update due".
  assert.match(screens, /const workNeedsUpdate = \(item: MyWorkItem\) => myWorkNeedsAttention\(\{ \.\.\.item, canUpdate: true, updatedAt: workLastReport\(item\) \}/);
  // A resource task keeps no note or forecast, so its card offers neither, and a Blocked one changes status first.
  assert.match(screens, /editable=\{inquirySaving === null\} taskNotes=\{false\}/);
  assert.match(screens, /\{taskNotes && \(late \|\| target\.forecastFinish\) \? <label className="forecast-inline">/);
  assert.match(screens, /\{taskNotes \? <input\r?\n\s+key=\{`\$\{target\.key\}:note:/);
  assert.match(screens, /\(target\.status === "Blocked" && \(value === 100 \|\| !taskNotes\)\)/);
  // The saved task (and its new row version) replaces the card; only a success or a conflict reloads.
  const save = screens.slice(screens.indexOf("const saveInquiryProgress"), screens.indexOf("const patchProgress = useCallback"));
  assert.ok(save.length > 200, "saveInquiryProgress sits just before patchProgress");
  assert.match(save, /const saved = await apiRequest<ResourceTask>/);
  assert.match(save, /rowVersion: saved\.rowVersion/);
  assert.doesNotMatch(save, /finally \{[^}]*load\(\)/, "a refused save is not followed by a reload that clears its error");

  const workspace = read("app/system/production/ResourceTaskWorkspace.tsx");
  const acknowledge = workspace.slice(workspace.indexOf("const acknowledge=async"), workspace.indexOf("const acknowledge=async") + 900);
  assert.match(acknowledge, /catch\(e\)\{failures\.push/, "one refusal does not stop the rest");
  assert.ok(acknowledge.indexOf("await load()") < acknowledge.indexOf("if(failures.length)setError"), "the error is set after the reload that clears it");

  // A cleared or superseded search cannot come back, and both counts describe the projects shown.
  assert.match(gantt, /if \(request !== searchSequence\.current\) return;/);
  assert.match(gantt, /const clearSearch = \(\) => \{ searchSequence\.current \+= 1;/);
  assert.match(gantt, /visibleRows\.reduce\(\(sum, item\) => sum \+ \(hits\.get\(item\.id\)\?\.size \?\? 0\), 0\)/);

  // Edit project's stage choices count additional roles; the waiting list loads once per portfolio load.
  assert.match(core, /const elevated = \(bootstrap\.user\.roles \?\? \[bootstrap\.user\.role\]\)\.some/);
  assert.match(core, /if \(!canAnswer \|\| !overview\?\.loadedAt\) return;/);
  assert.match(core, /notify\(`\$\{target\.fileName\} · \$\{localizeCopy\("ProjectDocs\.withdrawn"\)\}`\)/);
});

test("review fixes: one progress-report definition, a locked signing read and a guarded, indexed 069", () => {
  const service = read("backend-node/src/schedule-service.ts");
  assert.match(service, /export const PROGRESS_REPORT_FIELDS_SQL = \["percent_complete", "status", "actual_start", "actual_finish", "forecast_finish", "blocked_reason", "remark", "progress"\]/);
  assert.match(read("backend-node/src/routes/schedule.ts"), /field IN \(\$\{PROGRESS_REPORT_FIELDS_SQL\}\) GROUP BY task_id/);
  assert.match(read("backend-node/src/routes/projects.ts"), /u\.field IN\(\$\{PROGRESS_REPORT_FIELDS_SQL\}\) THEN u\.occurred_at END\) last_progress_at/);
  assert.match(read("backend-node/src/routes/signing.ts"), /FROM dbo\.project_docs d\$\{transaction \? " WITH \(UPDLOCK, HOLDLOCK\)" : ""\}/);
  const migration = read("database/migrations/069_withdraw_project_document.sql");
  assert.match(migration, /IF @document_id IS NULL OR @project_id IS NULL OR @actor IS NULL OR @expected_row_version IS NULL\n\s+THROW 51696,/);
  assert.match(migration, /CREATE INDEX IX_document_files_project_doc ON dbo\.document_files\(project_doc_id\);/);
  assert.match(migration, /CREATE INDEX IX_signature_marks_scan_doc ON dbo\.signature_marks\(scan_project_doc_id\);/);
  assert.equal((migration.match(/THROW 51695,/g) ?? []).length, 1, "each THROW number names one failure");
  assert.doesNotMatch(read("backend-node/src/errors.ts") + read("backend-node/src/routes/schedule.ts"), /primary role is Engineering Manager/);
});

test("the Projects menu badge counts open Delayed and At Risk projects, not every open project", () => {
  const shell = read("app/system/ProductionApp.tsx");
  assert.match(shell, /apiRequest<\{ attention: number \}>\("\/api\/v1\/projects\/attention"\)/);
  assert.match(shell, /if \(!bootstrap\?\.permissions\.includes\("project\.read"\)\) return;/);
  assert.match(shell, /if \(view === "projects"\) return projectAttentionCount;/);
  assert.doesNotMatch(shell, /if \(view === "projects"\) return bootstrap\.counts\.activeProjects;/);
  assert.equal((shell.match(/badgeFor\(item\.view, bootstrap, myWorkUrgentCount \+ taskAcknowledgmentCount, projectAttentionCount\)/g) ?? []).length, 2, "the condition and the number agree");
  // The endpoint the badge reads uses the portfolio's own health rule and scope.
  const routes = read("backend-node/src/routes/projects.ts");
  assert.match(routes, /app\.get\("\/api\/v1\/projects\/attention"/);
  assert.match(routes, /AND p\.status NOT IN \(N'Closed',N'On Hold'\)/);
});

test("the portfolio Timeline goes full screen, with an overlay where the browser has no element full screen", () => {
  const hook = read("app/system/use-fullscreen.ts");
  // The browser's full screen first; a refusal or a missing API falls back to the page's own overlay.
  assert.match(hook, /if \(document\.fullscreenEnabled && typeof element\.requestFullscreen === "function"\) \{\s*try \{ await element\.requestFullscreen\(\); return; \} catch/);
  assert.match(hook, /setOverlay\(true\);/);
  // State follows the browser (Esc, F11) and Escape leaves the overlay; the page under it does not scroll.
  assert.match(hook, /document\.addEventListener\("fullscreenchange", sync\)/);
  assert.match(hook, /if \(event\.key === "Escape"\) setOverlay\(false\);/);
  assert.match(hook, /document\.body\.classList\.add\(OVERLAY_BODY_CLASS\)/);
  assert.match(hook, /document\.body\.classList\.remove\(OVERLAY_BODY_CLASS\)/);
  assert.match(read("app/globals.css"), /body\.fullscreen-overlay-open \{ overflow: hidden; \}/);

  // The whole block goes full screen, sort included, and the button says which way it goes.
  assert.match(gantt, /<div ref=\{fullscreen\.ref\} className=\{`portfolio-gantt\$\{fullscreen\.active \? " is-fullscreen" : ""\}\$\{fullscreen\.overlay \? " is-overlay" : ""\}`\}>\r?\n\s+\{controls\}/);
  assert.match(gantt, /aria-pressed=\{fullscreen\.active\}/);
  assert.match(gantt, /<Icon name=\{fullscreen\.active \? "minimize" : "maximize"\} \/>\{t\(fullscreen\.active \? "Gantt\.exitFullScreen" : "Gantt\.fullScreen"\)\}/);
  assert.match(core, /controls=\{\/\* The sort sits inside the timeline so it stays at hand in full screen\. \*\/\r?\n\s+<div className="portfolio-gantt-sort">/);
  const ui = read("app/system/ui.tsx");
  assert.match(ui, /^\s+maximize: </m);
  assert.match(ui, /^\s+minimize: </m);

  // In full screen the chart takes the window height; the overlay stays under dialogs and toasts.
  const css = read("app/system/production/project-portfolio.css");
  assert.match(css, /\.portfolio-gantt\.is-fullscreen \.gantt \{ flex: 1; min-height: 0; max-height: none; \}/);
  assert.match(css, /\.portfolio-gantt\.is-overlay \{ position: fixed; inset: 0; z-index: 90;/);
  assert.match(read("app/globals.css"), /\.overlay \{\r?\n\s+position: fixed;\r?\n\s+inset: 0;\r?\n\s+z-index: 100;/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, "tokens only");

  const { translate } = load("app/system/i18n.ts");
  for (const key of ["Gantt.fullScreen", "Gantt.exitFullScreen"]) {
    for (const lang of ["EN", "TH", "JP"]) assert.notEqual(translate(key, lang), key, `${key} has no ${lang}`);
  }
  assert.equal(translate("Gantt.fullScreen", "TH"), "เต็มจอ");
});

test("the Gantt name column can be dragged wider, keyed, remembered per chart and reset", () => {
  const chart = read("app/system/production/GanttChart.tsx");
  // Only a press on the column edge starts a drag; anywhere else stays a normal click.
  assert.match(chart, /const onEdge = \(clientX: number\) => \{ const head = sideHead\(\); return head !== null && Math\.abs\(clientX - head\.getBoundingClientRect\(\)\.right\) <= 5; \};/);
  assert.match(chart, /if \(event\.button !== 0 \|\| !chart \|\| !head \|\| !onEdge\(event\.clientX\)\) return;/);
  assert.match(chart, /chart\.setPointerCapture\(event\.pointerId\);/);
  // The drag moves only the CSS variable and commits the width on release; the track never drops below TRACK_MIN.
  assert.match(chart, /chart\.style\.setProperty\("--gantt-side", `\$\{width\}px`\);/);
  assert.match(chart, /setResizing\(false\); setSide\(width\); saveSide\(label, width\);/);
  assert.match(chart, /"--gantt-side": `min\(\$\{side\}px, calc\(100% - \$\{TRACK_MIN\}px\)\)`/);
  assert.match(chart, /const SIDE_MIN = 160;\r?\nconst SIDE_MAX = 900;/);
  // Remembered per chart in this browser, read and written behind try/catch.
  assert.match(chart, /const sideStorageKey = \(label: string\) => `tomas-tech-gantt-side:\$\{label\}`;/);
  assert.match(chart, /function readSide\(label: string\): number \| null \{\r?\n\s+try \{/);
  // The grip is a real button: arrow keys, Home and End resize it; a double-click on the edge resets.
  assert.match(chart, /<button type="button" className="gantt-resizer" aria-label=\{t\("Gantt\.resizeColumn"\)\} title=\{t\("Gantt\.resizeColumnHint"\)\} onKeyDown=\{resizeByKey\} \/>/);
  assert.match(chart, /event\.key === "ArrowLeft" \? current - SIDE_STEP : event\.key === "ArrowRight" \? current \+ SIDE_STEP/);
  assert.match(chart, /onPointerDown=\{startResize\} onDoubleClick=\{resetSide\}/);
  // A cut-off name shows in full on hover.
  assert.match(chart, /className="gantt-label" title=\{row\.title\} onClick=\{row\.onOpen\}/);
  const css = read("app/system/production/gantt.css");
  assert.match(css, /\.gantt-side::after \{ content: ""; position: absolute; top: 0; right: -4px; bottom: 0; width: 8px; cursor: col-resize;/);
  assert.match(css, /\.gantt-resizer \{[^}]*touch-action: none;/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,6}\b/, "tokens only");
  const { translate } = load("app/system/i18n.ts");
  for (const key of ["Gantt.resizeColumn", "Gantt.resizeColumnHint"]) {
    for (const lang of ["EN", "TH", "JP"]) assert.notEqual(translate(key, lang), key, `${key} has no ${lang}`);
  }
});

test("every new follow-up string has English, Thai and Japanese copy", () => {
  const { translate } = load("app/system/i18n.ts");
  const keys = [
    "Gantt.taskSearch", "Gantt.findTasks", "Gantt.clearSearch", "Gantt.searchResult", "Gantt.searchHidden", "Gantt.searchTruncated",
    "Portfolio.waitingForYou", "Portfolio.reviewRequest", "MyWork.noReportYet", "MyWork.inquiryWork", "MyWork.inquiryWorkHint",
    "ResourceTasks.acknowledge", "ResourceTasks.acknowledgeAll", "ResourceTasks.acknowledged",
    "ProjectDocs.withdraw", "ProjectDocs.withdrawTitle", "ProjectDocs.withdrawHint", "ProjectDocs.withdrawReason", "ProjectDocs.withdrawn",
  ];
  for (const key of keys) {
    for (const lang of ["EN", "TH", "JP"]) assert.notEqual(translate(key, lang), key, `${key} has no ${lang}`);
  }
  assert.match(translate("ResourceTasks.acknowledgeAll", "TH"), /\{n\}/);
  for (const lang of ["EN", "TH", "JP"]) {
    const text = translate("Gantt.searchResult", lang);
    assert.ok(text.includes("{tasks}") && text.includes("{projects}"), lang);
  }
});

test("a task history shows the change, drops the importer's text, and only a day request, its answer and a baseline keep a quoted reason", () => {
  const planning = read("app/system/production/PlanningPricingScreens.tsx");
  const helpers = ["historyReason", "historyNoteFields", "historyValue", "historyShown"].map((name) => {
    const line = planning.match(new RegExp(`^const ${name} = .*$`, "m"))?.[0];
    assert.ok(line, name);
    return line;
  }).join("\n");
  const code = ts.transpileModule(`${helpers}\nreturn { historyReason, historyValue, historyShown };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const { historyReason, historyValue, historyShown } = new Function(code)();
  const imported = "Imported from Overall Project Plan row 1054; source WBS 3.3; source status Delay";
  assert.equal(historyReason({ field: "status", comment: imported }), "");
  assert.equal(historyReason({ field: "percent_complete", comment: "Waiting for parts" }), "");
  assert.equal(historyReason({ field: "request", comment: "Supplier late" }), " · “Supplier late”");
  assert.equal(historyReason({ field: "request_answer", comment: "OK, two days" }), " · “OK, two days”");
  assert.equal(historyReason({ field: "baseline", comment: null }), "");
  assert.equal(historyValue("remark", imported), null);
  assert.equal(historyValue("remark", "Site closed"), "Site closed");
  assert.equal(historyValue("status", "Done"), "Done");
  assert.equal(historyValue("blocked_reason", imported), null);
  assert.equal(historyValue("blocked_reason", "Imported source status: Delay"), null);
  assert.equal(historyValue("blocked_reason", "No access to site"), "No access to site");
  // A row that only moved the importer's text is left out; a real reason still shows.
  assert.equal(historyShown({ field: "blocked_reason", fromValue: imported, toValue: null }), false);
  assert.equal(historyShown({ field: "blocked_reason", fromValue: "Imported source status: Delay", toValue: imported }), false);
  assert.equal(historyShown({ field: "blocked_reason", fromValue: null, toValue: "No access to site" }), true);
  assert.equal(historyShown({ field: "remark", fromValue: imported, toValue: "Cable on order" }), true);
  assert.equal(historyShown({ field: "status", fromValue: "Blocked", toValue: "In Progress" }), true);
  // The project history, the task drawer and My Updates all go through the helpers.
  assert.doesNotMatch(planning, /(?:update|entry)\.comment \? ` · “/);
  assert.equal(planning.match(/\{historyReason\((?:update|entry)\)\}/g)?.length, 3);
  assert.match(planning, /const visibleUpdates = updates\.filter\(historyShown\);/);
  assert.match(planning, /!taskById\.has\(update\.taskId\)\) && historyShown\(update\)\)\.slice\(0, 20\)/);
  assert.match(planning, /update\.taskId === task\.id && historyShown\(update\)\)/);
});
