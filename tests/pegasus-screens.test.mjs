import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ADMIN_SCREENS_COPY } from "../app/system/production/admin-screens-copy.ts";
import { FORM_COPY } from "../app/system/production/form-copy.ts";
import { createRequire } from "node:module";
import ts from "typescript-api";

// The Team & Knowledge and System menus in the Pegasus ERP look (owner 2026-11-21): a screen wears "pg-skin pg-screen"
// (PegasusScreen), pegasus-skin.css draws the shared parts and pegasus-screens.css the rest.
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("pegasus-screens.css reaches only a screen that wears .pg-screen, and uses only tokens that exist there", async () => {
  const [sheet, skin] = await Promise.all([read("app/system/production/pegasus-screens.css"), read("app/system/production/pegasus-skin.css")]);
  const css = withoutComments(sheet);
  // @keyframes steps (from/to) are not selectors of the page.
  const rules = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const heads = [...rules.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((head) => !head.startsWith("@"));
  assert.ok(heads.length > 250, `the stylesheet was read (${heads.length} rules)`);
  for (const head of heads) {
    // A comma inside :is(...) belongs to one selector.
    for (const selector of head.split(/,(?![^()]*\))/).map((part) => part.trim())) assert.match(selector, /^(?:\.pg-skin)?\.pg-screen(?:$|[.\s:])/, selector);
  }
  // Its own --pgs-* values are defined in the file; a --pg-* value must be one the skin's tokens carry on the main branch
  // (pegasus-skin.css there, the shared pegasus-tokens.css once that lands).
  const own = new Set([...css.matchAll(/(--pgs-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const [, name] of css.matchAll(/var\((--pgs-[a-z0-9-]+)/g)) assert.ok(own.has(name), `${name} is used but not defined`);
  const shared = ["background", "foreground", "primary", "primary-fg", "muted", "muted-fg", "accent", "accent-fg", "destructive", "border", "input", "ring",
    "emerald-fg", "red-fg", "amber-fg", "slate-fg", "violet-fg", "pink-fg", "success-bg", "danger-bg", "warning-bg", "neutral-bg", "violet-bg", "pink-bg",
    "ease", "divider", "row-line", "primary-10", "row-hover", "focus"];
  for (const [, name] of css.matchAll(/var\(--pg-([a-z0-9-]+)/g)) assert.ok(shared.includes(name), `--pg-${name} is not one of the skin's tokens`);
  assert.match(skin, /\.pg-skin \.pg-act \{/, "the quiet row action the screens use comes from the skin");
});

test("the app's tokens are set to Pegasus values inside the wrapper, so token-built rules need no copy", async () => {
  const css = withoutComments(await read("app/system/production/pegasus-screens.css"));
  const block = /\.pg-skin\.pg-screen \{([^}]+)\}/.exec(css)?.[1] ?? "";
  for (const token of ["--ink", "--ink-soft", "--muted", "--line", "--line-soft", "--surface", "--blue", "--blue-soft", "--blue-text", "--green-soft", "--green-text",
    "--amber-soft", "--amber-text", "--red-soft", "--red-text", "--violet-soft", "--violet-text", "--fs-sm", "--fs-md", "--r-sm", "--r-md", "--r-lg"]) {
    assert.match(block, new RegExp(`${token}:`), `${token} is remapped`);
  }
  // Type follows Pegasus B.2: nothing under 12px, body at 14px.
  assert.match(block, /--fs-3xs: 12px; --fs-2xs: 12px; --fs-xs: 12px; --fs-sm: 14px; --fs-md: 14px;/);
});

test("the ten menu screens wear the look and keep the title of their menu entry", async () => {
  const [i18n, shell, wrapper, activity, performance, admin, knowledge, downloads, core] = await Promise.all([
    read("app/system/i18n.ts"), read("app/system/ProductionApp.tsx"), read("app/system/production/PegasusScreen.tsx"), read("app/system/production/TeamActivityScreen.tsx"),
    read("app/system/production/PerformanceScreen.tsx"), read("app/system/production/AdminAnalyticsScreens.tsx"), read("app/system/production/KnowledgeScreens.tsx"),
    read("app/system/production/DownloadCenterScreen.tsx"), read("app/system/production/CoreScreens.tsx"),
  ]);
  assert.match(wrapper, /import "\.\/pegasus-skin\.css";\s+import "\.\/pegasus-screens\.css";/);
  assert.match(wrapper, /"pg-skin pg-screen"/);
  // Screens with a root element of their own carry the classes on it and load the two stylesheets themselves.
  for (const [name, source, own] of [["Team Activity", activity, "team-activity"], ["KPI & Growth", performance, "performance-page"], ["Download Center", downloads, "stack download-center"]]) {
    assert.ok(source.includes(`className="pg-skin pg-screen ${own}"`), `${name} wears the look`);
    assert.match(source, /import ['"]\.\/pegasus-skin\.css['"];\s+import ['"]\.\/pegasus-screens\.css['"];/, `${name} loads the stylesheets`);
  }
  assert.doesNotMatch(performance, /<div className="performance-page">/, "both KPI states wear the look");
  for (const [name, source, count] of [["reports, audit and settings", admin, 6], ["Knowledge Hub", knowledge, 2]]) {
    assert.equal(source.split("<PegasusScreen>").length - 1, count, `${name}: every return is wrapped`);
  }
  // Only the System menu's three master screens: Customers and the entries that left the menu keep the app's look.
  assert.match(core, /const pegasus = tab === "team" \|\| tab === "employees" \|\| tab === "suppliers";/);
  assert.match(core, /return pegasus \? <PegasusScreen>\{screen\}<\/PegasusScreen> : screen;/);

  // Pegasus 0.7: the page title is the menu label.
  const labels = [...shell.matchAll(/"?label"?:\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const label of ["Team Activity & Workload", "KPI & Growth", "Summary Reports", "Knowledge Hub", "Download Center", "User Accounts & Permissions", "Employees", "Suppliers", "Audit Log", "System Settings"]) {
    assert.ok(labels.includes(label), `${label} is a menu entry`);
  }
  assert.ok(activity.includes("<h1>{s('กิจกรรมและภาระงานทีม','Team Activity & Workload','チーム活動と作業負荷')}</h1>"));
  assert.ok(i18n.includes(`"Team Activity & Workload": { th: "กิจกรรมและภาระงานทีม", jp: "チーム活動と作業負荷" }`), "the title is the menu label in all three languages");
  assert.match(performance, /title="KPI & Growth"/);
  assert.match(admin, /<PageHeader title=\{uiText\("Summary Reports"\)\}/);
  assert.match(admin, /<PageHeader title=\{uiText\("Audit Log"\)\}/);
  assert.match(admin, /<PageHeader title=\{uiText\("System Settings"\)\}/);
  assert.match(knowledge, /title=\{uiText\("Knowledge Hub"\)\}/);
  assert.match(downloads, /<PageHeader title="Download Center"/);
  assert.match(core, /destination === "team" \? "User Accounts & Permissions"/);
});

test("lists follow the ERP: a record opens from its number, row actions are quiet icons in a left column", async () => {
  const [core, knowledge, downloads, shell, admin] = await Promise.all([
    read("app/system/production/CoreScreens.tsx"), read("app/system/production/KnowledgeScreens.tsx"), read("app/system/production/DownloadCenterScreen.tsx"),
    read("app/system/ProductionApp.tsx"), read("app/system/production/AdminAnalyticsScreens.tsx"),
  ]);
  const master = core.slice(core.indexOf("function SupplierMasterTab"), core.indexOf("function UserRoleModal"));
  // Suppliers: the code opens the edit dialog; edit and delete are icons with a name for the pointer and the screen reader.
  assert.match(master, /<button className="pg-doclink mono" type="button" onClick=\{\(\) => setEditingSupplier\(supplier\)\}>\{supplier\.code\}<\/button>/);
  assert.match(master, /\{canWrite \? <th className="pg-acts"><span className="sr-only">\{uiText\("Actions"\)\}<\/span><\/th> : null\}<th><LocalizedText text=\{"Code"\} \/>/);
  assert.match(master, /<button className="pg-act danger" type="button" title=\{uiText\("Delete"\)\} aria-label=/);
  assert.match(master, /supplier\.erpCode \? null : <button className="pg-act danger"/, "an ERP supplier is still not deleted here");
  assert.doesNotMatch(master, /style=\{\{ color: "#dc2626" \}\}/);
  // The edit dialog's buttons sit in its divided footer, the primary one last (D.8), and its labels go through the dictionary.
  assert.match(master, /footer=\{<>\s*<button className="btn ghost" type="button" onClick=\{onClose\}>\{uiText\("Cancel"\)\}<\/button>\s*<button className="btn primary" type="submit" form="supplier-edit-form"/);
  assert.doesNotMatch(master, /<span>(?:Code \(read-only\)|Name \*|Contact|Brands \(comma-separated\))<\/span>/);
  // Employees: Actions, then the status, then the rest (0.3).
  assert.match(master, /\{canWrite \? <th className="pg-acts">.*?<\/th> : null\}<th>\{t\("Status"\)\}<\/th><th>\{t\("Employee"\)\}<\/th>/);
  // Every icon-only row action has a title and an aria-label (E.1).
  const actions = [...master.matchAll(/<button className="pg-act[^>]*>/g)].map((match) => match[0]);
  assert.ok(actions.length >= 7, `row actions were found (${actions.length})`);
  for (const action of actions) assert.match(action, /title=\{[^>]*aria-label=\{/, action);

  // Knowledge Hub: the document number is the link, so the rows carry no Open button.
  assert.equal(knowledge.split('className="link-button mono"').length - 1, 2);
  assert.doesNotMatch(knowledge, /<button className="btn ghost sm" type="button" onClick=\{\(\) => (?:setOpenDocumentId\(row\.id\)|onOpen\(row\.id\)|setOpenId\(article\.id\))\}>/);
  // Download Center: one quiet download icon per file, on the left, still the guide's target.
  assert.match(downloads, /<td className="pg-acts">\s*<button className="pg-act" type="button" data-guide="dl\.file"/);
  assert.doesNotMatch(downloads, /className="btn primary sm" type="button" data-guide="dl\.file"/);
  // Summary Reports: the way back sits in the page header, not above it.
  assert.match(shell, /<ProductionReports \{\.\.\.moduleProps\} onBack=\{async \(\) => \{ await setView\("reports"\); \}\} \/>/);
  assert.match(admin, /actions=\{onBack \? <button className="btn ghost" type="button" onClick=\{onBack\}><Icon name="arrowLeft" \/>\{uiText\("Back to reports"\)\}<\/button> : undefined\}/);
});

test("statuses keep one meaning per tone, and the labels added for these screens exist in three languages", async () => {
  const [sheet, i18n] = await Promise.all([read("app/system/production/pegasus-screens.css"), read("app/system/i18n.ts")]);
  const css = withoutComments(sheet);
  // Pegasus B.1: done green, waiting amber, counted in part pink, overdue red, not due grey.
  for (const [status, tone] of [["ON_TIME", "success-bg"], ["PENDING", "warning-bg"], ["LATE", "pink-bg"], ["MISSING", "danger-bg"]]) {
    assert.match(css, new RegExp(`\\.pg-screen \\.activity-status\\.${status} \\{ background: var\\(--pg-${tone}\\);`), `${status} -> ${tone}`);
  }
  for (const key of ["Back to reports", "Create access", "As of", "NAS connection & destination", "Active document storage", "Share name", "Destination path", "NAS username"]) {
    // The key is the English text; the entry adds Thai and Japanese.
    assert.match(i18n, new RegExp(`"${key}": \\{ th: "[^"]+", jp: "[^"]+" \\}`), `${key} has Thai and Japanese`);
  }
});

test("System Settings, Summary Reports, Audit Log and the supplier dialog ask only for keys that exist in three languages", async () => {
  const [admin, core, i18n] = await Promise.all([read("app/system/production/AdminAnalyticsScreens.tsx"), read("app/system/production/CoreScreens.tsx"), read("app/system/i18n.ts")]);
  assert.match(i18n, /import \{ ADMIN_SCREENS_COPY \} from "\.\/production\/admin-screens-copy";/);
  assert.match(i18n, /\.\.\.ADMIN_SCREENS_COPY,/);
  const asked = new Set([...`${admin}\n${core}`.matchAll(/"((?:Settings|Reports|Audit|Supplier)\.[A-Za-z]+)"/g)].map((match) => match[1]));
  assert.ok(asked.size >= 45, `keys were found (${asked.size})`);
  for (const key of asked) {
    const entry = ADMIN_SCREENS_COPY[key];
    assert.ok(entry, `${key} has an entry`);
    for (const lang of ["en", "th", "jp"]) assert.ok(entry[lang]?.trim(), `${key} has ${lang}`);
    // A value the screen fills in keeps its placeholders in every language.
    for (const [placeholder] of entry.en.matchAll(/\{[a-z]+\}/g)) {
      assert.ok(entry.th.includes(placeholder) && entry.jp.includes(placeholder), `${key} keeps ${placeholder}`);
    }
  }
  // Settings no longer prints Thai-only words in English and Japanese sessions.
  const settings = admin.slice(admin.indexOf("function StorageCheckPanel"));
  assert.doesNotMatch(settings, /\p{Script=Thai}/u);
  // The authentication row names the sign-in this build uses: TMT ID on the shared host, not always Entra.
  assert.match(admin, /import \{ IS_TMT_ID_MODE \} from "\.\.\/tmt-id\.constants";/);
  assert.match(settings, /: IS_TMT_ID_MODE \? \{ text: "Settings\.authTmtId", badge: "Settings\.badgeTmtId"/);
});

test("the project cost report names every figure instead of printing field names", async () => {
  const admin = await read("app/system/production/AdminAnalyticsScreens.tsx");
  assert.doesNotMatch(admin, /Object\.entries\(report\.(?:budget|procurement)\)/);
  const typeBlock = (name) => new RegExp(`${name}: \\{([^}]+)\\}`).exec(admin.slice(admin.indexOf("type ProjectCostReport")))?.[1] ?? "";
  const fields = (name) => [...typeBlock(name).matchAll(/(\w+): number/g)].map((match) => match[1]).sort();
  const rows = (name) => [...(new RegExp(`const ${name}[^=]*= \\[([\\s\\S]*?)\\];`).exec(admin)?.[1] ?? "").matchAll(/\["(\w+)", "Reports\.\w+"\]/g)].map((match) => match[1]).sort();
  assert.deepEqual(rows("PROJECT_BUDGET_ROWS"), fields("budget"));
  assert.deepEqual(rows("PROJECT_PROCUREMENT_ROWS"), fields("procurement"));
  // The project is a section heading under the page title, not a second page title.
  assert.doesNotMatch(admin, /<PageHeader title=\{`\$\{report\.project\.number\}/);
  assert.match(admin, /<div className="pg-report-head">\s*<h2>\{report\.project\.number\} · \{report\.project\.name\}<\/h2>/);
});

test("the Add supplier dialog is titled New supplier and saves from its footer", async () => {
  const core = await read("app/system/production/CoreScreens.tsx");
  const form = core.slice(core.indexOf("function SupplierCreateForm"), core.indexOf("function InventoryItemMasterTab"));
  assert.match(form, /<Modal title="Supplier\.new" subtitle="ใช้ใน Cost item และ Preferred supplier" size="md" onClose=\{onClose\} footer=\{<>/);
  assert.match(form, /<button className="btn primary" type="submit" form="supplier-create-form" disabled=\{busy\}>\{localizeCopy\(busy \? "Saving…" : "Save"\)\}<\/button>/);
  assert.match(form, /<form id="supplier-create-form" noValidate onSubmit=\{onSubmit\}>/);
  assert.doesNotMatch(form, /Create supplier|<Panel title="Add supplier"/);
  // Name is the record's identity: full width, after the short code and the category.
  assert.ok(form.indexOf('"Category *"') < form.indexOf('"Supplier name *"'));
  assert.match(form, /<label className="field span-2"><span><LocalizedText text=\{"Supplier name \*"\} \/>/);
});

test("a read-only detail captions only each pair's label, so names and badges keep their own case", async () => {
  const css = withoutComments(await read("app/system/production/pegasus-screens.css"));
  assert.match(css, /\.pg-screen \.detail-grid span \{[^}]*text-transform: none;/);
  assert.match(css, /\.pg-screen \.detail-grid > div > span:first-child \{ color: var\(--pg-muted-fg\); font-size: 12px; font-weight: 500; \}/);
  assert.doesNotMatch(css, /callout > span > br/, "no rule hides line breaks: two text nodes would run together");
});

// Pegasus 0.5 and D.2 on the ten screens: a save is never disabled because the form is incomplete; pressing it shows a
// bubble on each field that is missing, and a failed save opens the error dialog instead of red text on the page.
const SCREEN_FILES = ["CoreScreens", "AdminAnalyticsScreens", "TeamActivityScreen", "PerformanceScreen", "KnowledgeScreens", "SourceRepositories"]
  .map((name) => `app/system/production/${name}.tsx`);

test("no save on the ten screens is disabled because a field is still empty", async () => {
  const sources = Object.fromEntries(await Promise.all(SCREEN_FILES.map(async (file) => [file, await read(file)])));
  const all = Object.values(sources).join("\n");
  for (const gate of [
    "disabled={busy || !valid}", "disabled={busy||!source||!mask}", "disabled={busy||(!ids.length&&values.some(value=>value!==0))}",
    "disabled={busy || !note.trim()}", "disabled={selected.length === 0}", "disabled={!Number(entityId)}", "disabled={busy || !content.trim()}",
    "disabled={busy || !reviewerId || !approverId}", "disabled={busy || !file || !summary.trim()}", "!form.server || !form.share",
    "!extraCode || !extraReason.trim() || extraBusy", "disabled={!valid || busy}", "disabled={files.length === 0",
  ]) assert.ok(!all.includes(gate), `still gated: ${gate}`);
  // Each screen checks its fields with the shared helper, and the forms that submit natively leave the checking to it.
  for (const file of SCREEN_FILES) assert.match(sources[file], /from "\.\/form-bubbles";|from '\.\/form-bubbles';/, `${file} uses form-bubbles`);
  assert.equal((all.match(/checkFields\(/g) ?? []).length >= 20, true, "every save checks its fields");
  for (const form of all.matchAll(/<form [^>]*onSubmit=\{[^>]*>/g)) {
    if (form[0].includes("production-document-form") || form[0].includes("onSubmit={(event) => { void submit(event); }}")) continue;
    if (/supplier-|employee-master-form|activity-/.test(form[0])) assert.match(form[0], /noValidate/, form[0].slice(0, 120));
  }
  // What the browser cannot check is a rule with its own bubble.
  assert.match(sources["app/system/production/TeamActivityScreen.tsx"], /\{invalid:!mask,at:'\[data-bubble-anchor="weekdays"\]',message:t\('Form\.chooseOne'\)\}/);
  assert.match(sources["app/system/production/PerformanceScreen.tsx"], /if \(submit && \(!checkFields\(editor\.current, t, rules\) \|\| !valid\)\) return;/);
  assert.match(sources["app/system/production/KnowledgeScreens.tsx"], /\{ invalid: selected\.length === 0, at: "\.check-grid", message: t\("Form\.chooseOne"\) \}/);
});

test("a failed save on these screens opens the error dialog, not a red box on the page", async () => {
  const sources = Object.fromEntries(await Promise.all(SCREEN_FILES.map(async (file) => [file, await read(file)])));
  const core = sources["app/system/production/CoreScreens.tsx"];
  const master = core.slice(core.indexOf("function SupplierMasterTab"), core.indexOf("function InventoryItemMasterTab"))
    + core.slice(core.indexOf("function EmployeeModal"));
  assert.doesNotMatch(master, /<MasterFormError|callout danger/);
  assert.match(core, /const fail = \(message: string\) => \{ if \(failureTitle\) void failureDialog\(message, failureTitle\); else setError\(message\); \};/);
  const activity = sources["app/system/production/TeamActivityScreen.tsx"];
  // Only the two load errors (the screen and a member's dialog) stay on the page; no form shows one.
  assert.equal((activity.match(/className="activity-error"/g) ?? []).length, 2);
  assert.doesNotMatch(sources["app/system/production/PerformanceScreen.tsx"], /className="callout error"/);
  const settings = sources["app/system/production/AdminAnalyticsScreens.tsx"].slice(sources["app/system/production/AdminAnalyticsScreens.tsx"].indexOf("function StorageCheckPanel"));
  assert.doesNotMatch(settings, /callout error|setErr\(/);
  const knowledge = sources["app/system/production/KnowledgeScreens.tsx"];
  for (const name of ["ArticleEditorModal", "CategoryEditorModal", "SequenceEditorModal", "CreateDocumentModal"]) {
    const start = knowledge.indexOf(`function ${name}`);
    const body = knowledge.slice(start, knowledge.indexOf("\nfunction ", start + 10));
    assert.doesNotMatch(body, /callout error|setError\(/, name);
    assert.match(body, /failureDialog\(errorText\(requestError\), t\("Form\.errorTitle"\)\)/, name);
  }
});

test("the bubble helper decides by its rules without a DOM, and every message exists in three languages", async () => {
  const require = createRequire(import.meta.url);
  const source = await read("app/system/production/form-bubbles.ts");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} }, opened = [];
  new Function("require", "module", "exports", code)((name) => name === "../dialogs" ? { alertDialog: async (text, options) => { opened.push({ text, ...options }); } } : require(name), mod, mod.exports);
  const { checkFields, failureDialog } = mod.exports;
  const t = (key) => key;
  assert.equal(checkFields(null, t), true);
  assert.equal(checkFields(null, t, [{ invalid: false, at: "x", message: "m" }]), true);
  assert.equal(checkFields(null, t, [{ invalid: false, at: "x", message: "m" }, { invalid: true, at: "y", message: "n" }]), false);
  await failureDialog("Server said no", "Could not complete");
  assert.deepEqual(opened, [{ text: "Server said no", tone: "error", title: "Could not complete" }]);
  // The bubble anchors on the field's wrapper, never on an input (which has no ::after), and dismisses on the next gesture.
  assert.match(source, /const ANCHORS = "\[data-bubble-anchor\], \.field, \.activity-field, \.performance-area-evidence, \.performance-comment";/);
  for (const event of ["focusin", "pointerdown", "keydown"]) assert.ok(source.includes(`addEventListener("${event}"`), event);
  // DateInput's hidden calendar input repeats the visible one's check, so it is skipped.
  assert.match(source, /control\.getAttribute\("aria-hidden"\) === "true"/);

  const css = withoutComments(await read("app/system/production/pegasus-screens.css"));
  assert.match(css, /\.pg-screen \[data-invalid\]::after \{\s*content: attr\(data-invalid\); position: absolute; z-index: 40; top: calc\(100% \+ 8px\);/);
  assert.match(css, /\.pg-screen \[data-shake\] \{ animation: pgs-shake 280ms ease-in-out; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.pg-screen \[data-invalid\]::after, \.pg-screen \[data-invalid\]::before, \.pg-screen \[data-shake\] \{ animation: none; \}/);

  const asked = new Set();
  for (const file of [...SCREEN_FILES, "app/system/production/form-bubbles.ts"]) for (const match of (await read(file)).matchAll(/["'](Form\.[A-Za-z]+)["']/g)) asked.add(match[1]);
  assert.ok(asked.size >= 8, `keys were found (${asked.size})`);
  for (const key of asked) {
    const entry = FORM_COPY[key];
    assert.ok(entry, `${key} has an entry`);
    for (const lang of ["en", "th", "jp"]) assert.ok(entry[lang]?.trim(), `${key} has ${lang}`);
    for (const [placeholder] of entry.en.matchAll(/\{[a-z]+\}/g)) assert.ok(entry.th.includes(placeholder) && entry.jp.includes(placeholder), `${key} keeps ${placeholder}`);
  }
  assert.match(await read("app/system/i18n.ts"), /\.\.\.FORM_COPY,/);
});
