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
// oxfmt writes a rule one declaration per line; the checks below read each rule on one line, as the sheet was written.
const flatCss = (css) =>
  css
    .replace(/\r\n/g, "\n")
    .replace(/\{\n\s*/g, "{ ")
    .replace(/:\n\s+/g, ": ")
    .replace(/;\n\s*/g, "; ")
    .replace(/,\n\s*(?=\S)/g, ", ")
    .replace(/\n\s*\}/g, " }");
const readCss = async (path) => flatCss(await read(path));

test("pegasus-screens.css reaches only a screen that wears .pg-screen, and uses only tokens that exist there", async () => {
  const [sheet, skin] = await Promise.all([readCss("app/system/production/pegasus-screens.css"), read("app/system/production/pegasus-skin.css")]);
  const css = withoutComments(sheet);
  // @keyframes steps (from/to) are not selectors of the page.
  const rules = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const heads = [...rules.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((head) => !head.startsWith("@"));
  assert.ok(heads.length > 250, `the stylesheet was read (${heads.length} rules)`);
  for (const head of heads) {
    // A comma inside :is(...) belongs to one selector.
    // The sticky header rule names the page it sits in, so it starts from .page. The select's list is drawn in the body (or a
    // native dialog), so .pg-select-panel is its own root.
    for (const selector of head.split(/,(?![^()]*\))/).map((part) => part.trim()))
      assert.match(selector, /^(?:(?:\.page > )?(?:\.pg-skin)?\.pg-screen(?:$|[.\s:])|(?:\.pg-skin)?\.pg-select-panel(?:$|[.\s:]))/, selector);
  }
  // Its own --pgs-* values are defined in the file; a --pg-* value must be one the skin's tokens carry on the main branch
  // (pegasus-skin.css there, the shared pegasus-tokens.css once that lands).
  const own = new Set([...css.matchAll(/(--pgs-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
  for (const [, name] of css.matchAll(/var\((--pgs-[a-z0-9-]+)/g)) assert.ok(own.has(name), `${name} is used but not defined`);
  const shared = [
    "background",
    "foreground",
    "primary",
    "primary-fg",
    "muted",
    "muted-fg",
    "accent",
    "accent-fg",
    "destructive",
    "border",
    "input",
    "ring",
    "emerald-fg",
    "red-fg",
    "amber-fg",
    "slate-fg",
    "violet-fg",
    "pink-fg",
    "success-bg",
    "danger-bg",
    "warning-bg",
    "neutral-bg",
    "violet-bg",
    "pink-bg",
    "ease",
    "divider",
    "row-line",
    "primary-10",
    "row-hover",
    "focus",
  ];
  for (const [, name] of css.matchAll(/var\(--pg-([a-z0-9-]+)/g)) assert.ok(shared.includes(name), `--pg-${name} is not one of the skin's tokens`);
  assert.match(skin, /\.pg-skin \.pg-act \{/, "the quiet row action the screens use comes from the skin");
});

test("the app's tokens are set to Pegasus values inside the wrapper, so token-built rules need no copy", async () => {
  const css = withoutComments(await readCss("app/system/production/pegasus-screens.css"));
  const block = /\.pg-skin\.pg-screen \{([^}]+)\}/.exec(css)?.[1] ?? "";
  for (const token of [
    "--ink",
    "--ink-soft",
    "--muted",
    "--line",
    "--line-soft",
    "--surface",
    "--blue",
    "--blue-soft",
    "--blue-text",
    "--green-soft",
    "--green-text",
    "--amber-soft",
    "--amber-text",
    "--red-soft",
    "--red-text",
    "--violet-soft",
    "--violet-text",
    "--fs-sm",
    "--fs-md",
    "--r-sm",
    "--r-md",
    "--r-lg",
  ]) {
    assert.match(block, new RegExp(`${token}:`), `${token} is remapped`);
  }
  // Type follows Pegasus B.2: nothing under 12px, body at 14px.
  assert.match(block, /--fs-3xs: 12px; --fs-2xs: 12px; --fs-xs: 12px; --fs-sm: 14px; --fs-md: 14px;/);
});

test("the ten menu screens wear the look and keep the title of their menu entry", async () => {
  const [i18n, shell, wrapper, activity, performance, admin, knowledge, downloads, core] = await Promise.all([
    read("app/system/i18n.ts"),
    read("app/system/ProductionApp.tsx"),
    read("app/system/production/PegasusScreen.tsx"),
    read("app/system/production/TeamActivityScreen.tsx"),
    read("app/system/production/PerformanceScreen.tsx"),
    read("app/system/production/AdminAnalyticsScreens.tsx"),
    read("app/system/production/KnowledgeScreens.tsx"),
    read("app/system/production/DownloadCenterScreen.tsx"),
    read("app/system/production/CoreScreens.tsx"),
  ]);
  assert.match(wrapper, /import "\.\/pegasus-skin\.css";\s+import "\.\/pegasus-screens\.css";/);
  assert.match(wrapper, /"pg-skin pg-screen"/);
  // Screens with a root element of their own carry the classes on it and load the two stylesheets themselves.
  for (const [name, source, own] of [
    ["Team Activity", activity, "team-activity"],
    ["KPI & Growth", performance, "performance-page"],
    ["Download Center", downloads, "stack download-center"],
  ]) {
    assert.ok(source.includes(`className="pg-skin pg-screen ${own}"`), `${name} wears the look`);
    assert.match(source, /import ['"]\.\/pegasus-skin\.css['"];\s+import ['"]\.\/pegasus-screens\.css['"];/, `${name} loads the stylesheets`);
  }
  assert.doesNotMatch(performance, /<div className="performance-page">/, "both KPI states wear the look");
  for (const [name, source, count] of [
    ["reports, audit and settings", admin, 6],
    ["Knowledge Hub", knowledge, 2],
  ]) {
    assert.equal(source.split("<PegasusScreen>").length - 1, count, `${name}: every return is wrapped`);
  }
  // Only the System menu's three master screens: Customers and the entries that left the menu keep the app's look.
  assert.match(core, /const pegasus = tab === "team" \|\| tab === "employees" \|\| tab === "suppliers";/);
  assert.match(core, /return pegasus \? <PegasusScreen>\{screen\}<\/PegasusScreen> : screen;/);

  // Pegasus 0.7: the page title is the menu label.
  const labels = [...shell.matchAll(/"?label"?:\s*"([^"]+)"/g)].map((match) => match[1]);
  for (const label of [
    "Team Activity & Workload",
    "KPI & Growth",
    "Summary Reports",
    "Knowledge Hub",
    "Download Center",
    "User Accounts & Permissions",
    "Employees",
    "Suppliers",
    "Audit Log",
    "System Settings",
  ]) {
    assert.ok(labels.includes(label), `${label} is a menu entry`);
  }
  assert.ok(activity.includes('<h1>{s("กิจกรรมและภาระงานทีม", "Team Activity & Workload", "チーム活動と作業負荷")}</h1>'));
  assert.ok(i18n.includes(`"Team Activity & Workload": { th: "กิจกรรมและภาระงานทีม", jp: "チーム活動と作業負荷" }`), "the title is the menu label in all three languages");
  assert.match(performance, /title="KPI & Growth"/);
  assert.match(admin, /<PageHeader\s+title=\{uiText\("Summary Reports"\)\}/);
  assert.match(admin, /<PageHeader\s+title=\{uiText\("Audit Log"\)\}/);
  assert.match(admin, /<PageHeader title=\{uiText\("System Settings"\)\}/);
  assert.match(knowledge, /title=\{uiText\("Knowledge Hub"\)\}/);
  assert.match(downloads, /<PageHeader title="Download Center"/);
  assert.match(core, /destination === "team" \? "User Accounts & Permissions"/);
});

test("lists follow the ERP: a record opens from its number, row actions are quiet icons in a left column", async () => {
  const [core, knowledge, downloads, shell, admin] = await Promise.all([
    read("app/system/production/CoreScreens.tsx"),
    read("app/system/production/KnowledgeScreens.tsx"),
    read("app/system/production/DownloadCenterScreen.tsx"),
    read("app/system/ProductionApp.tsx"),
    read("app/system/production/AdminAnalyticsScreens.tsx"),
  ]);
  const master = core.slice(core.indexOf("function SupplierMasterTab"), core.indexOf("function UserRoleModal"));
  // Suppliers: the code opens the edit dialog; edit and delete are icons with a name for the pointer and the screen reader.
  assert.match(master, /<button className="pg-doclink mono" type="button" onClick=\{\(\) => setEditingSupplier\(supplier\)\}>\s*\{supplier\.code\}\s*<\/button>/);
  assert.match(
    master,
    /\{canWrite \? \(\s*<th className="pg-acts">\s*<span className="sr-only">\{uiText\("Actions"\)\}<\/span>\s*<\/th>\s*\) : null\}\s*<th>\s*<span className="pg-th">\s*<LocalizedText text=\{"Code"\} \/>/,
  );
  assert.match(master, /<button\s+className="pg-act danger"\s+type="button"\s+title=\{uiText\("Delete"\)\}\s+aria-label=/);
  assert.match(master, /supplier\.erpCode \? null : \(\s*<button\s+className="pg-act danger"/, "an ERP supplier is still not deleted here");
  assert.doesNotMatch(master, /style=\{\{ color: "#dc2626" \}\}/);
  // The edit dialog's buttons sit in its divided footer, the primary one last (D.8), and its labels go through the dictionary.
  assert.match(
    master,
    /footer=\{\s*<>\s*<button\s+className="btn ghost"\s+type="button"\s+onClick=\{\(\) => \{\s*void close\(\);\s*\}\}\s*>\s*\{uiText\("Cancel"\)\}\s*<\/button>\s*<button className="btn primary" type="submit" form="supplier-edit-form"/,
  );
  assert.doesNotMatch(master, /<span>(?:Code \(read-only\)|Name \*|Contact|Brands \(comma-separated\))<\/span>/);
  // Employees: Actions, then the status, then the rest (0.3).
  assert.match(master, /\{canWrite \? \(\s*<th className="pg-acts">[\s\S]*?<\/th>\s*\) : null\}\s*<th>\s*<span className="pg-th">\s*\{t\("Status"\)\}[\s\S]*?<\/th>\s*<th>\{t\("Employee"\)\}<\/th>/);
  // Every icon-only row action has a title and an aria-label (E.1).
  const actions = [...master.matchAll(/<button\s+className="pg-act[^>]*>/g)].map((match) => match[0]);
  assert.ok(actions.length >= 7, `row actions were found (${actions.length})`);
  for (const action of actions) assert.match(action, /title=\{[^>]*aria-label=\{/, action);

  // Knowledge Hub: the document number is the link, so the rows carry no Open button.
  assert.equal(knowledge.split('className="link-button mono"').length - 1, 2);
  assert.doesNotMatch(knowledge, /<button className="btn ghost sm" type="button" onClick=\{\(\) => (?:setOpenDocumentId\(row\.id\)|onOpen\(row\.id\)|setOpenId\(article\.id\))\}>/);
  // Download Center: one quiet download icon per file, on the left, still the guide's target.
  assert.match(downloads, /<td className="pg-acts">\s*<button className="pg-act" type="button" data-guide="dl\.file"/);
  assert.doesNotMatch(downloads, /className="btn primary sm" type="button" data-guide="dl\.file"/);
  // Summary Reports: the way back sits in the page header, not above it.
  assert.match(shell, /<ProductionReports\s+\{\.\.\.moduleProps\}\s+onBack=\{async \(\) => \{\s*await setView\("reports"\);\s*\}\}\s*\/>/);
  assert.match(
    admin,
    /actions=\{\s*onBack \? \(\s*<button className="btn ghost" type="button" onClick=\{onBack\}>\s*<Icon name="arrowLeft" \/>\s*\{uiText\("Back to reports"\)\}\s*<\/button>\s*\) : undefined\s*\}/,
  );
});

test("statuses keep one meaning per tone, and the labels added for these screens exist in three languages", async () => {
  const [sheet, i18n] = await Promise.all([readCss("app/system/production/pegasus-screens.css"), read("app/system/i18n.ts")]);
  const css = withoutComments(sheet);
  // Pegasus B.1: done green, waiting amber, counted in part pink, overdue red, not due grey.
  for (const [status, tone] of [
    ["ON_TIME", "success-bg"],
    ["PENDING", "warning-bg"],
    ["LATE", "pink-bg"],
    ["MISSING", "danger-bg"],
  ]) {
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
  assert.match(settings, /: IS_TMT_ID_MODE\s*\? \{ text: "Settings\.authTmtId", badge: "Settings\.badgeTmtId"/);
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
  assert.match(admin, /<div className="pg-report-head">\s*<h2>\s*\{report\.project\.number\} · \{report\.project\.name\}\s*<\/h2>/);
});

test("the Add supplier dialog is titled New supplier and saves from its footer", async () => {
  const core = await read("app/system/production/CoreScreens.tsx");
  const form = core.slice(core.indexOf("function SupplierCreateForm"), core.indexOf("function InventoryItemMasterTab"));
  assert.match(form, /<Modal\s+title="Supplier\.new"\s+subtitle="ใช้ใน Cost item และ Preferred supplier"\s+size="md"\s+onClose=\{\(\) => \{\s*void close\(\);\s*\}\}\s+footer=\{\s*<>/);
  assert.match(form, /<button className="btn primary" type="submit" form="supplier-create-form" disabled=\{busy\}>\s*\{localizeCopy\(busy \? "Saving…" : "Save"\)\}\s*<\/button>/);
  assert.match(form, /<form id="supplier-create-form" noValidate onSubmit=\{onSubmit\}>/);
  assert.doesNotMatch(form, /Create supplier|<Panel title="Add supplier"/);
  // Name is the record's identity: full width, after the short code and the category.
  assert.ok(form.indexOf('"Category *"') < form.indexOf('"Supplier name *"'));
  assert.match(form, /<label className="field span-2">\s*<span>\s*<LocalizedText text=\{"Supplier name \*"\} \/>/);
});

test("a read-only detail captions only each pair's label, so names and badges keep their own case", async () => {
  const css = withoutComments(await readCss("app/system/production/pegasus-screens.css"));
  assert.match(css, /\.pg-screen \.detail-grid span \{[^}]*text-transform: none;/);
  assert.match(css, /\.pg-screen \.detail-grid > div > span:first-child \{ color: var\(--pg-muted-fg\); font-size: 12px; font-weight: 500; \}/);
  assert.doesNotMatch(css, /callout > span > br/, "no rule hides line breaks: two text nodes would run together");
});

// Pegasus 0.5 and D.2 on the ten screens: a save is never disabled because the form is incomplete; pressing it shows a
// bubble on each field that is missing, and a failed save opens the error dialog instead of red text on the page.
const SCREEN_FILES = ["CoreScreens", "AdminAnalyticsScreens", "TeamActivityScreen", "PerformanceScreen", "KnowledgeScreens", "SourceRepositories"].map((name) => `app/system/production/${name}.tsx`);

test("no save on the ten screens is disabled because a field is still empty", async () => {
  const sources = Object.fromEntries(await Promise.all(SCREEN_FILES.map(async (file) => [file, await read(file)])));
  const all = Object.values(sources).join("\n");
  for (const gate of [
    "disabled={busy || !valid}",
    "disabled={busy||!source||!mask}",
    "disabled={busy||(!ids.length&&values.some(value=>value!==0))}",
    "disabled={busy || !note.trim()}",
    "disabled={selected.length === 0}",
    "disabled={!Number(entityId)}",
    "disabled={busy || !content.trim()}",
    "disabled={busy || !reviewerId || !approverId}",
    "disabled={busy || !file || !summary.trim()}",
    "!form.server || !form.share",
    "!extraCode || !extraReason.trim() || extraBusy",
    "disabled={!valid || busy}",
    "disabled={files.length === 0",
  ])
    assert.ok(!all.includes(gate), `still gated: ${gate}`);
  // Each screen checks its fields with the shared helper, and the forms that submit natively leave the checking to it.
  for (const file of SCREEN_FILES) assert.match(sources[file], /from "\.\/form-bubbles";|from '\.\/form-bubbles';/, `${file} uses form-bubbles`);
  assert.equal((all.match(/checkFields\(/g) ?? []).length >= 20, true, "every save checks its fields");
  for (const form of all.matchAll(/<form [^>]*onSubmit=\{[^>]*>/g)) {
    if (form[0].includes("production-document-form") || form[0].includes("onSubmit={(event) => { void submit(event); }}")) continue;
    if (/supplier-|employee-master-form|activity-/.test(form[0])) assert.match(form[0], /noValidate/, form[0].slice(0, 120));
  }
  // What the browser cannot check is a rule with its own bubble.
  assert.match(sources["app/system/production/TeamActivityScreen.tsx"], /\{ invalid: !mask, at: '\[data-bubble-anchor="weekdays"\]', message: t\("Form\.chooseOne"\) \}/);
  assert.match(sources["app/system/production/PerformanceScreen.tsx"], /if \(submit && \(!checkFields\(editor\.current, t, rules\) \|\| !valid\)\) return;/);
  assert.match(sources["app/system/production/KnowledgeScreens.tsx"], /\{ invalid: selected\.length === 0, at: "\.check-grid", message: t\("Form\.chooseOne"\) \}/);
});

test("a failed save on these screens opens the error dialog, not a red box on the page", async () => {
  const sources = Object.fromEntries(await Promise.all(SCREEN_FILES.map(async (file) => [file, await read(file)])));
  const core = sources["app/system/production/CoreScreens.tsx"];
  const master = core.slice(core.indexOf("function SupplierMasterTab"), core.indexOf("function InventoryItemMasterTab")) + core.slice(core.indexOf("function EmployeeModal"));
  assert.doesNotMatch(master, /<MasterFormError|callout danger/);
  assert.match(core, /const fail = \(message: string\) => \{\s*if \(failureTitle\) void failureDialog\(message, failureTitle\);\s*else setError\(message\);\s*\};/);
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
  const mod = { exports: {} },
    opened = [];
  new Function("require", "module", "exports", code)(
    (name) =>
      name === "../dialogs"
        ? {
            alertDialog: async (text, options) => {
              opened.push({ text, ...options });
            },
          }
        : require(name),
    mod,
    mod.exports,
  );
  const { checkFields, failureDialog } = mod.exports;
  const t = (key) => key;
  assert.equal(checkFields(null, t), true);
  assert.equal(checkFields(null, t, [{ invalid: false, at: "x", message: "m" }]), true);
  assert.equal(
    checkFields(null, t, [
      { invalid: false, at: "x", message: "m" },
      { invalid: true, at: "y", message: "n" },
    ]),
    false,
  );
  await failureDialog("Server said no", "Could not complete");
  assert.deepEqual(opened, [{ text: "Server said no", tone: "error", title: "Could not complete" }]);
  // The bubble anchors on the field's wrapper, never on an input (which has no ::after), and dismisses on the next gesture.
  assert.match(source, /const ANCHORS = "\[data-bubble-anchor\], \.field, \.activity-field, \.performance-area-evidence, \.performance-comment";/);
  for (const event of ["focusin", "pointerdown", "keydown"]) assert.ok(source.includes(`addEventListener("${event}"`), event);
  // DateInput's hidden calendar input repeats the visible one's check, so it is skipped.
  assert.match(source, /control\.getAttribute\("aria-hidden"\) === "true"/);

  const css = withoutComments(await readCss("app/system/production/pegasus-screens.css"));
  assert.match(css, /\.pg-screen \[data-invalid\]::after \{\s*content: attr\(data-invalid\); position: absolute; z-index: 40; top: calc\(100% \+ 8px\);/);
  assert.match(css, /\.pg-screen \[data-shake\] \{ animation: pgs-shake 280ms ease-in-out; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.pg-screen \[data-invalid\]::after, \.pg-screen \[data-invalid\]::before, \.pg-screen \[data-shake\] \{ animation: none; \}/);

  const asked = new Set();
  for (const file of [...SCREEN_FILES, "app/system/production/form-bubbles.ts", "app/system/production/form-draft.ts"])
    for (const match of (await read(file)).matchAll(/["'](Form\.[A-Za-z]+)["']/g)) asked.add(match[1]);
  assert.ok(asked.size >= 8, `keys were found (${asked.size})`);
  for (const key of asked) {
    const entry = FORM_COPY[key];
    assert.ok(entry, `${key} has an entry`);
    for (const lang of ["en", "th", "jp"]) assert.ok(entry[lang]?.trim(), `${key} has ${lang}`);
    for (const [placeholder] of entry.en.matchAll(/\{[a-z]+\}/g)) assert.ok(entry.th.includes(placeholder) && entry.jp.includes(placeholder), `${key} keeps ${placeholder}`);
  }
  assert.match(await read("app/system/i18n.ts"), /\.\.\.FORM_COPY,/);
});

test("the page header stays under the top bar while the page scrolls, only when the screen opens the page", async () => {
  const css = withoutComments(await readCss("app/system/production/pegasus-screens.css"));
  assert.match(
    css,
    /\.page > \.pg-skin\.pg-screen:first-child > :is\(\.page-header, \.activity-heading\):first-child \{\s*position: sticky; top: var\(--topbar-h\); z-index: 20; margin: -20px -24px 0; padding: 16px 24px 8px; background: var\(--canvas\);\s*\}/,
  );
  // The negative margins match the page padding the template sets, and the top bar sits above it.
  const globals = await read("app/globals.css");
  assert.match(globals, /\.page \{\s*padding: 20px 24px 32px;\s*gap: 16px;\s*\}/);
  assert.match(globals, /\.topbar \{\s*position: sticky;\s*top: 0;\s*z-index: 30;/);
  assert.match(css, /@media print \{ \.page > \.pg-skin\.pg-screen:first-child > :is\(\.page-header, \.activity-heading\):first-child \{ position: static; margin: 0; padding: 0; \} \}/);
});

// Pegasus 0.6 "never lose typed data": what is typed is kept in this browser until it is saved, a dialog with a draft opens
// again after a reload, and leaving a changed form asks Keep editing or Discard changes.
async function loadDrafts() {
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(await read("app/system/production/form-draft.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const items = new Map(),
    asked = [];
  const localStorage = {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
  let answer = true;
  // A tiny hook runner: state survives renders, effects run after each render.
  let states = [],
    cursor = 0,
    effects = [];
  const react = {
    useState(init) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof init === "function" ? init() : init;
      return [
        states[index],
        (next) => {
          states[index] = typeof next === "function" ? next(states[index]) : next;
        },
      ];
    },
    useEffect(effect) {
      effects.push(effect);
    },
    useCallback: (fn) => fn,
  };
  const dialogs = {
    confirmDialog: async (text, options) => {
      asked.push({ text, ...options });
      return answer;
    },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", "window", code)((name) => (name === "react" ? react : name === "../dialogs" ? dialogs : require(name)), mod, mod.exports, { localStorage });
  const render = (hook) => {
    cursor = 0;
    effects = [];
    const result = hook();
    for (const effect of effects) effect();
    return result;
  };
  const remount = () => {
    states = [];
  };
  return {
    drafts: mod.exports,
    items,
    asked,
    render,
    remount,
    answer: (value) => {
      answer = value;
    },
  };
}

test("a field is kept while it differs from where the form started, and comes back after a remount", async () => {
  const { drafts, items, render, remount } = await loadDrafts();
  const hook = () => drafts.useDraftField("employee:new:", "nameEn", "");
  let [value, set] = render(hook);
  assert.equal(value, "");
  assert.equal(items.size, 0, "opening a form stores nothing");
  set("Somchai");
  [value] = render(hook);
  assert.equal(value, "Somchai");
  assert.deepEqual(JSON.parse(items.get("tomas-tech-draft:employee:new:")).values, { nameEn: "Somchai" });
  assert.equal(drafts.hasDraft("employee:new:"), true);
  assert.deepEqual(drafts.draftKeys("employee:new"), ["employee:new:"]);
  // A reload: a fresh form starts from the draft.
  remount();
  [value, set] = render(hook);
  assert.equal(value, "Somchai");
  // Typing it back to the start removes the field, and with it the draft.
  set("");
  render(hook);
  assert.equal(drafts.hasDraft("employee:new:"), false);
  // A saved draft is cleared, and an old one is dropped.
  set("x");
  render(hook);
  assert.equal(drafts.hasDraft("employee:new:"), true);
  drafts.clearDraft("employee:new:");
  assert.equal(drafts.hasDraft("employee:new:"), false);
  items.set("tomas-tech-draft:old", JSON.stringify({ savedAt: Date.now() - 15 * 24 * 3600_000, values: { a: 1 } }));
  assert.equal(drafts.readDraft("old"), null);
  assert.equal(items.has("tomas-tech-draft:old"), false);
  // A whole form kept as one object gets any field added since it was kept.
  items.set("tomas-tech-draft:supplier:new", JSON.stringify({ savedAt: Date.now(), values: { form: { code: "S1" } } }));
  remount();
  assert.deepEqual(render(() => drafts.useDraftField("supplier:new", "form", { code: "", name: "" }))[0], { code: "S1", name: "" });
  items.clear();
  // Without a key the field is plain state and writes nothing.
  remount();
  const plainHook = () => drafts.useDraftField(null, "x", "");
  const [, plain] = render(plainHook);
  plain("typed");
  assert.equal(render(plainHook)[0], "typed");
  assert.equal(items.size, 0);
});

test("leaving a changed form asks Keep editing or Discard changes; an unchanged one closes without asking", async () => {
  const { drafts, items, asked, answer } = await loadDrafts();
  const copy = { title: "Unsaved changes", body: "Keep editing, or discard them?", keep: "Keep editing", discard: "Discard changes" };
  assert.equal(await drafts.confirmLeave("supplier:new", copy), true);
  assert.equal(asked.length, 0, "nothing to lose, nothing asked");
  items.set("tomas-tech-draft:supplier:new", JSON.stringify({ savedAt: Date.now(), values: { form: { code: "S1" } } }));
  answer(false);
  assert.equal(await drafts.confirmLeave("supplier:new", copy), false);
  assert.deepEqual(asked[0], { text: copy.body, title: copy.title, confirmText: "Discard changes", cancelText: "Keep editing", danger: true });
  assert.equal(drafts.hasDraft("supplier:new"), true, "Keep editing keeps the draft");
  answer(true);
  assert.equal(await drafts.confirmLeave(["knowledge:doc:7:comment", null, "supplier:new"], copy), true);
  assert.equal(drafts.hasDraft("supplier:new"), false, "Discard changes drops it");
  assert.equal(asked.length, 2, "one question for a panel of forms");
  assert.deepEqual(
    drafts.leaveCopy((key) => key),
    { title: "Form.unsavedTitle", body: "Form.unsavedBody", keep: "Form.keepEditing", discard: "Form.discard" },
  );
});

test("the unsaved-changes words use exactly Keep editing and Discard changes in three languages", () => {
  assert.equal(FORM_COPY["Form.keepEditing"].en, "Keep editing");
  assert.equal(FORM_COPY["Form.discard"].en, "Discard changes");
  for (const key of ["Form.unsavedTitle", "Form.unsavedBody", "Form.keepEditing", "Form.discard"])
    for (const language of ["en", "th", "jp"]) assert.ok(FORM_COPY[key]?.[language], `${language} ${key}`);
});

test("every form on the ten screens keeps its draft, asks before closing with changes, and reopens after a reload", async () => {
  const sources = Object.fromEntries(await Promise.all(SCREEN_FILES.map(async (file) => [file, await read(file)])));
  for (const file of SCREEN_FILES) assert.match(sources[file], /from ["']\.\/form-draft["'];/, `${file} uses form-draft`);
  const all = Object.values(sources).join("\n");
  assert.ok((all.match(/useDraftField(<[^>(]+>)?\(/g) ?? []).length >= 60, "the fields are kept");
  assert.ok((all.match(/confirmLeave\(/g) ?? []).length >= 15, "closing asks");
  assert.ok((all.match(/clearDraft\(/g) ?? []).length >= 20, "a save clears");
  const core = sources["app/system/production/CoreScreens.tsx"];
  assert.ok(core.includes('const [createOpen, setCreateOpen] = useState(() => canCreate && hasDraft("supplier:new"));'));
  assert.ok(core.includes('useDraftField("supplier:new", "form", BLANK_SUPPLIER)'));
  assert.ok(core.includes('const draftKey = employee ? `employee:edit:${employee.id}` : `employee:new:${prefill?.email ?? ""}`;'));
  assert.ok(core.includes("const [editing, setEditing] = useState<TeamMember | null>(() => (canManageRoles ? (bootstrap.team.find((member) => hasDraft(`role:${member.id}`)) ?? null) : null));"));
  // Supplier edit no longer reads uncontrolled inputs, so its fields can be kept.
  assert.doesNotMatch(core, /defaultValue=\{supplier\./);
  const kpi = sources["app/system/production/PerformanceScreen.tsx"];
  assert.ok(kpi.includes('draftKey={selectedCycle ? `kpi:assessment:${selectedCycle.id}:${editingId}:${editingAsManager ? "manager" : "self"}` : undefined}'));
  assert.ok(kpi.includes("try { await onSave(scores, evidence, submit, summary, developmentGoal); clearDraft(key); }"));
  const knowledge = sources["app/system/production/KnowledgeScreens.tsx"];
  assert.match(knowledge, /const closeDrawer = async \(\) => \{\s*if \(await confirmLeave\(draftKeys\(draftPrefix\), leaveCopy\(t\)\)\) onClose\(\);\s*\};/);
  assert.ok(knowledge.includes('const [creating, setCreating] = useState(() => canUpload && hasDraft("knowledge:document:new"));'));
  const activity = sources["app/system/production/TeamActivityScreen.tsx"];
  assert.ok(activity.includes("const discardDraft = async () => (!form && !reportRule) || (await confirmLeave(openKey, leaveCopy(t)));"));
  assert.ok(activity.includes("const draftKey = `activity:${rule.userId}:report:${rule.id}`;"));
  assert.doesNotMatch(activity, /confirmDialog/);
  // The NAS form compares with what the server holds, so opening the page is not a change.
  assert.ok(sources["app/system/production/AdminAnalyticsScreens.tsx"].includes('const [form, setForm] = useDraftField<NasSettingsInput>("settings:nas", "form", saved);'));
});

// D.3 on the ten screens: the browser's select list is replaced by the Pegasus select, a button that opens the app's list.
async function loadSelect() {
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(await read("app/system/production/PegasusSelect.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  const stubs = { "../i18n": { useT: () => (key) => key }, "../ui": { Icon: () => null } };
  new Function("require", "module", "exports", code)((name) => stubs[name] ?? require(name), mod, mod.exports);
  return { select: mod.exports, react: require("react") };
}

test("the Pegasus select reads <option> children the way the browser does", async () => {
  const { select, react } = await loadSelect();
  const h = react.createElement;
  const options = select.readOptions([
    h("option", { key: "a", value: "" }, "All projects"),
    h(react.Fragment, { key: "f" }, [h("option", { key: 1, value: 12 }, "PJ260091 · Wire duct"), h("option", { key: 2, value: 13, disabled: true }, "Closed")]),
    h(
      "optgroup",
      { key: "g", label: "Languages" },
      ["EN", "TH"].map((value) => h("option", { key: value }, value)),
    ),
    h(
      "option",
      { key: "l", value: 0 },
      h(
        function LocalizedText() {
          return null;
        },
        { text: "Select project" },
      ),
    ),
    h("option", { key: "x", value: "", hidden: true }, "Choose"),
    "stray text",
  ]);
  assert.deepEqual(
    options.map(({ value, text, disabled, hidden }) => ({ value, text, disabled, hidden })),
    [
      { value: "", text: "All projects", disabled: false, hidden: false },
      { value: "12", text: "PJ260091 · Wire duct", disabled: false, hidden: false },
      { value: "13", text: "Closed", disabled: true, hidden: false },
      // No value attribute: the value is the text.
      { value: "EN", text: "EN", disabled: false, hidden: false },
      { value: "TH", text: "TH", disabled: false, hidden: false },
      { value: "0", text: "Select project", disabled: false, hidden: false },
      { value: "", text: "Choose", disabled: false, hidden: true },
    ],
  );
  assert.equal(select.textOf(["Rev ", 3, h("b", null, " draft")]), "Rev 3 draft");
});

test("the Pegasus select keeps the form's checks, the dialog's Escape and the D.3 look", async () => {
  const source = await read("app/system/production/PegasusSelect.tsx");
  // A hidden, inert native select carries name, required and value for checkFields, FormData and rules.
  assert.match(source, /<select className="pg-select-native" tabIndex=\{-1\} inert name=\{name\} required=\{required\} disabled=\{disabled\} value=\{value\} onChange=\{\(\) => undefined\}>/);
  assert.match(source, /role="combobox"\s+aria-haspopup="listbox"\s+aria-expanded=\{open\}/);
  // Escape closes the list only: Modal skips a prevented Escape, and a native dialog skips its cancel.
  assert.match(source, /else if \(key === "Escape"\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*close\(true\);\s*\}/);
  // Inside a native dialog (top layer) the list is drawn in the dialog, otherwise in the body.
  assert.match(source, /trigger\.current\?\.closest\("dialog"\) \?\? document\.body/);
  assert.match(source, /const withSearch = searchable \?\? visible\.length > 8;/);
  const css = await readCss("app/system/production/pegasus-screens.css");
  assert.match(css, /\.pg-screen \.pg-select-trigger \{[^}]*height: 36px;[^}]*border: 1px solid var\(--pg-input\);[^}]*border-radius: 6px;/);
  assert.match(css, /\.pg-screen \.pg-select\[data-open\] \.pg-select-trigger > \.icon \{ transform: rotate\(180deg\); \}/);
  assert.match(css, /\.pg-skin\.pg-select-panel \{ position: fixed; z-index: 300;[^}]*min-width: 176px;/);
  assert.match(css, /\.pg-select-panel \.pg-select-list \{ position: relative; max-height: 240px; overflow-y: auto; padding: 4px; \}/);
  assert.match(css, /\.pg-select-panel \.pg-select-option \{[^}]*padding: 6px 8px 6px 32px;/);
  assert.match(css, /\.pg-select-panel \.pg-select-option\.active, \.pg-select-panel \.pg-select-option\.chosen \{ background: var\(--pg-accent\);/);
  for (const key of ["Form.select", "Form.search", "Form.noResults"]) for (const language of ["en", "th", "jp"]) assert.ok(FORM_COPY[key]?.[language], `${language} ${key}`);
});

test("no browser select list is left on the ten screens", async () => {
  const body = (source, name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, name);
    const next = source.indexOf("\nfunction ", start + 10);
    return source.slice(start, next < 0 ? undefined : next);
  };
  for (const name of ["KnowledgeScreens", "TeamActivityScreen", "SourceRepositories"]) {
    const source = await read(`app/system/production/${name}.tsx`);
    assert.doesNotMatch(source, /<select[\s>]/, name);
    assert.match(source, /import \{ PgSelect \} from "\.\/PegasusSelect";/, name);
  }
  // Knowledge Hub > Solutions & Sales Materials draws its filters from SolutionLibrary.
  const solutions = await read("app/system/SolutionLibrary.tsx");
  assert.doesNotMatch(solutions, /<select[\s>]/);
  assert.match(solutions, /import \{ PgSelect \} from "\.\/production\/PegasusSelect";/);
  const core = await read("app/system/production/CoreScreens.tsx");
  for (const name of ["ChoiceSelect", "UserRoleModal"]) {
    assert.doesNotMatch(body(core, name), /<select[\s>]/, name);
    assert.match(body(core, name), /<PgSelect\s/, name);
  }
  const reports = body(await read("app/system/production/AdminAnalyticsScreens.tsx"), "ProductionReports");
  assert.doesNotMatch(reports, /<select[\s>]/);
  assert.match(reports, /<PgSelect value=\{projectId\}/);
});

// Pegasus 0.3 and D.7: Suppliers and Employees are searched, filtered and paged on the server, with a funnel in the header.
test("a column filter is sent as repeated parameters, and an empty one is left out", async () => {
  const code = ts.transpileModule(await read("app/system/list-api.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(() => ({ apiRequest: async (path) => calls.push(path) }), mod, mod.exports);
  const { listQuery, listSuppliersPage, listEmployeesPage } = mod.exports;
  assert.equal(listQuery({ search: "", category: [], page: 1 }), "?page=1");
  assert.equal(listQuery({ category: ["Sensors", "Pneumatics"], page: 2, pageSize: 25 }), "?category=Sensors&category=Pneumatics&page=2&pageSize=25");
  await listSuppliersPage({ search: "th", source: ["erp"], page: 1, pageSize: 50 });
  await listEmployeesPage({ status: ["active"], department: [""], page: 1, pageSize: 50 });
  assert.deepEqual(calls, ["/api/v1/master/suppliers?search=th&source=erp&page=1&pageSize=50", "/api/v1/master/employees?status=active&department=&page=1&pageSize=50"]);
});

test("the server pages, searches and filters both lists, and counts the values each funnel offers", async () => {
  const master = await read("backend-node/src/routes/master.ts");
  // Every filter value is a parameter read through OPENJSON; nothing from the query is put into the SQL text.
  assert.match(master, /app\.get\("\/api\/v1\/master\/suppliers", async \(request\) => \{\s*await users\.demandPermission\(request, "master\.read"\);/);
  assert.match(master, /supplier\.category IN \(SELECT value FROM OPENJSON\(@categories\) WITH \(value nvarchar\(100\) '\$'\)\)/);
  assert.match(master, /const sources = filterChoices\(query\.source, "Source", \["erp", "local"\]\);/);
  assert.match(master, /OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;/);
  assert.match(master, /const pageSize = clampedInteger\(query\.pageSize, 50, 1, 100\);/);
  // The employees route keeps its plain list for the pickers; a page parameter turns on paging, filters and facets.
  assert.match(master, /const paged = query\.page !== undefined;/);
  assert.match(master, /if \(!paged\) return items;/);
  assert.match(master, /employee\.department IN \(SELECT value FROM OPENJSON\(@departments\) WITH \(value nvarchar\(200\) '\$'\)\)/);
  assert.match(master, /facets: facetsOf\(facets, \["status", "department", "position", "account"\]\)/);
  assert.match(master, /if \(values\.length > 100\) throw new ApiError\(400, "validation_failed"/);
});

test("the funnel follows D.7: faint until used, All first, rows that toggle, a search past eight values and Clear", async () => {
  const filter = await read("app/system/production/ColumnFilter.tsx");
  assert.match(filter, /className=\{`pg-col-filter\$\{active \? " active" : ""\}`\}/);
  assert.match(filter, /const withSearch = options\.length > 8;/);
  assert.match(filter, /const toggle = \(item: string\) => onChange\(value\.includes\(item\) \? value\.filter\(\(entry\) => entry !== item\) : \[\.\.\.value, item\]\);/);
  assert.match(filter, /aria-pressed=\{!active\} onClick=\{\(\) => onChange\(\[\]\)\}/);
  assert.match(filter, /t\("Form\.filterClear"\)/);
  assert.match(filter, /button\.current\?\.closest\("dialog"\) \?\? document\.body/);
  const css = await readCss("app/system/production/pegasus-screens.css");
  assert.match(css, /\.pg-screen \.pg-col-filter \{[^}]*opacity: 0\.4;/);
  assert.match(css, /\.pg-screen \.pg-col-filter\.active \{ color: var\(--pg-primary\); opacity: 1; \}/);
  assert.match(css, /\.pg-select-panel \.pg-filter-list \{ max-height: 224px; overflow: auto; padding: 4px; \}/);
  assert.match(css, /\.pg-select-panel \.pg-filter-option:not\(\.chosen\) > \.icon \{ opacity: 0; \}/);
  for (const key of ["Form.filterColumn", "Form.filterSearch", "Form.filterAll", "Form.filterClear", "Form.filterBlank"])
    for (const language of ["en", "th", "jp"]) assert.ok(FORM_COPY[key]?.[language], `${language} ${key}`);
  for (const key of ["Supplier.source", "Supplier.sourceErp", "Supplier.sourceLocal"]) for (const language of ["en", "th", "jp"]) assert.ok(ADMIN_SCREENS_COPY[key]?.[language], `${language} ${key}`);
});

test("Suppliers and Employees read one page at a time, keep the table when a filter finds nothing, and edit with every field", async () => {
  const core = await read("app/system/production/CoreScreens.tsx");
  const suppliers = core.slice(core.indexOf("function SupplierMasterTab("), core.indexOf("function SupplierEditModal("));
  assert.match(suppliers, /const next = await listSuppliersPage\(\{ search: search\.trim\(\), category, source, page, pageSize \}\);/);
  // A delete that emptied the last page goes back to the page that is now last (no setState inside an effect).
  assert.match(suppliers, /if \(!next\.items\.length && next\.total && page > 1\) setPage\(Math\.ceil\(next\.total \/ pageSize\)\);/);
  assert.doesNotMatch(suppliers, /bootstrap\.suppliers\.filter/);
  assert.match(suppliers, /<ColumnFilter column=\{uiText\("Category"\)\} options=\{categoryOptions\} value=\{category\} onChange=\{filterBy\(setCategory\)\} guide="list\.columnFilter" \/>/);
  assert.match(suppliers, /\{rows\.length \|\| \(list && filtered\) \? \(/);
  assert.match(suppliers, /<td className="pg-empty-row" colSpan=\{canWrite \? 4 : 3\}>/);
  // The edit dialog starts from the row, so a save no longer blanks contact, email, phone and brands.
  assert.match(core, /contact: supplier\.contact \?\? "",\s*email: supplier\.email \?\? "",\s*phone: supplier\.phone \?\? "",\s*brands: \(supplier\.brands \?\? \[\]\)\.join\(", "\),/);
  const employees = core.slice(core.indexOf("function EmployeeMasterTab("), core.indexOf("function EmployeeModal("));
  assert.match(employees, /listEmployeesPage\(\{ search: search\.trim\(\), status, department, position, page, pageSize \}\)/);
  assert.match(employees, /const \[status, setStatus\] = useState<string\[\]>\(\["active"\]\);/);
  assert.doesNotMatch(employees, /activeOnly|visibleEmployees/);
  for (const column of ["Status", "Department", "Level"]) assert.match(employees, new RegExp(`<ColumnFilter\\s+column=\\{t\\("${column}"\\)\\}`), column);
  // An employee with an edit draft opens again even when it is not on the first page.
  assert.match(employees, /const match = ids\.length \? \(kept\(next\.items\) \?\? kept\(await listEmployees\(\)\)\) : undefined;/);
});
