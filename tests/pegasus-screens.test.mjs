import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ADMIN_SCREENS_COPY } from "../app/system/production/admin-screens-copy.ts";

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
  assert.match(form, /<form id="supplier-create-form" onSubmit=\{onSubmit\}>/);
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
