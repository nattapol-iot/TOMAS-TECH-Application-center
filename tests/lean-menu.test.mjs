import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

/* Lean menu phase 1 (owner request 2026-11-12): the sidebar in the order the work flows. Only grouping moved. */
const GROUPS = [
  [null, ["dashboard", "my-work", "resources"]],
  ["NavGroup.sales", ["crm-dashboard", "crm-customers", "crm-contacts", "crm-opportunities", "crm-activities", "inquiries", "site-visits", "my-assignments", "visit-master", "customers"]],
  ["NavGroup.estimating", ["estimates", "price", "quotations", "missing", "module-templates", "labor-packages", "rates"]],
  ["NavGroup.projects", ["projects", "reports", "signing", "documents", "stamps", "schedule-templates", "installed-base", "site-monitor"]],
  // Lean procurement (owner 2026-11-19): the PR list and Approvals; BOM is a tab of the PR screen, the rest is done in Pegasus ERP.
  ["NavGroup.procurement", ["purchase", "approvals"]],
  ["NavGroup.team", ["activity", "performance", "summary-reports", "knowledge", "downloads"]],
  ["NavGroup.system", ["user-accounts", "employees", "suppliers", "audit", "settings", "design-system"]],
];
const HELP = ["manual", "support"];
const viewsIn = (text) => [...text.matchAll(/\{ view: "([a-z-]+)"|\{"view":"([a-z-]+)"/g)].map((match) => match[1] ?? match[2]);

test("the sidebar holds the 41 entries in seven work-order groups; nothing is twice", async () => {
  const shell = await source("app/system/ProductionApp.tsx");
  const nav = shell.slice(shell.indexOf("const NAV:"), shell.indexOf("/** The one rule for which menu entries"));
  const sections = nav.split(/\n {2}\{\s+(?=items: \[|group: ")/).slice(1);
  assert.equal(sections.length, GROUPS.length);
  for (const [index, [group, views]] of GROUPS.entries()) {
    assert.equal(/^group: "([^"]+)"/.exec(sections[index])?.[1] ?? null, group);
    assert.deepEqual(viewsIn(sections[index]), views, group ?? "top");
  }
  const all = viewsIn(nav);
  assert.equal(all.length, 41);
  assert.equal(new Set(all).size, 41);
  // The two help screens are entries of the "?" menu, and stay open to everyone.
  const help = shell.slice(shell.indexOf("const HELP_NAV"), shell.indexOf("function allowedViews"));
  assert.deepEqual(viewsIn(help), HELP);
  assert.match(shell, /allowed\.push\("profile", "signature", \.\.\.HELP_NAV\.map\(\(?item\)? => item\.view\)\);/);
  // Every one of the 43 is still a view the shell knows.
  const viewType = shell.slice(shell.indexOf("type View ="), shell.indexOf("/** unlessPermission hides"));
  for (const view of [...all, ...HELP]) assert.ok(view.startsWith("crm-") || viewType.includes(`"${view}"`), `unknown view ${view}`);
});

test("moving an entry kept its permission rule", async () => {
  const shell = await source("app/system/ProductionApp.tsx");
  const nav = shell.slice(shell.indexOf("const NAV:"), shell.indexOf("const IS_AUTH_CONFIGURED"));
  for (const entry of [
    '{ view: "dashboard", label: "Dashboard", icon: "grid" }',
    '{ view: "my-work", label: "My Work", icon: "user", anyPermissions: ["schedule.progress", "crm.read"] }',
    '{ view: "resources", label: "Team overview", icon: "users", anyPermissions: ["team.board", "schedule.read"] }',
    '{ view: "inquiries", label: "RFQ intake & estimating", icon: "inbox", permission: "inquiry.read" }',
    '{ view: "my-assignments", label: "My Assignments", icon: "play", permission: "visit.read" }',
    '{ view: "visit-master", label: "Site Visit Reference Data", icon: "layers", permission: "visit.read" }',
    '{ view: "customers", label: "Customers", icon: "users", permission: "master.read", unlessPermission: "crm.read" }',
    '{ view: "estimates", label: "Estimate Cost", icon: "file", permission: "estimate.read" }',
    '{ view: "rates", label: "Engineering rates", icon: "chart", permission: "master.read", rateAccess: true }',
    '{ view: "projects", label: "Projects", icon: "folder", permission: "project.read" }',
    '{ view: "schedule-templates", label: "Master Schedule", icon: "calendar" }',
    '{ view: "installed-base", label: "Installed Base", icon: "layers", permission: "asset.read" }',
    '{ view: "site-monitor", label: "Site Monitor", icon: "cpu", permission: "monitor.read" }',
    '{ view: "approvals", label: "Approvals", icon: "checkCircle", permission: "procurement.approve" }',
    '{ view: "knowledge", label: "Knowledge Hub", icon: "book", permission: "knowledge.view" }',
    '{ view: "downloads", label: "Download Center", icon: "download" }',
    '{ view: "employees", label: "Employees", icon: "user", permission: "master.read" }',
    '{ view: "suppliers", label: "Suppliers", icon: "truck", permission: "master.read" }',
    '{ view: "manual", label: "Employee Manual", icon: "book" }',
    '{ view: "support", label: "Report & Track Issues", icon: "inbox" }',
  ])
    assert.ok(nav.includes(entry), entry);
});

test("groups start closed, show their count, and the old stored names are not read", async () => {
  const [shell, css, i18n] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/globals.css"), source("app/system/i18n.ts")]);
  assert.match(shell, /const NAV_GROUP_STORAGE_KEY = "tomas-tech-collapsed-nav-groups-v3";/);
  assert.match(shell, /const DEFAULT_COLLAPSED_GROUPS = NAV_GROUPS;/);
  assert.match(shell, /const saved = stored === null \? DEFAULT_COLLAPSED_GROUPS : JSON\.parse\(stored\);/);
  assert.match(shell, /saved\.filter\(\(group\): group is string => NAV_GROUPS\.includes\(group\)\)/);
  // A group opens or closes only from its heading (owner 2026-11-22): a menu click never opens or closes one by itself,
  // so the menu does not move under the pointer. A closed group holding the open screen marks its heading instead.
  assert.match(shell, /const collapsed = Boolean\(section\.group && collapsedNavGroups\.includes\(section\.group\)\);/);
  assert.doesNotMatch(shell, /collapsedActiveGroup/i);
  // Only the stored choice and the heading change a group; opening a screen (setView) does not.
  assert.equal(shell.match(/setCollapsedNavGroups\(/g)?.length, 2);
  assert.match(css, /\.active-group > \.nav-group-toggle\[aria-expanded="false"\] \{\s*background: var\(--nav-accent\);\s*box-shadow: inset 3px 0 0 var\(--nav-primary\);\s*\}/);
  assert.match(shell, /aria-expanded=\{!collapsed\}\s+aria-controls=\{`nav-group-\$\{sectionIndex\}`\}\s+title=\{t\(section\.group\)\}/);
  assert.match(shell, /<span>\{t\(section\.group\)\}<\/span>\s*<small>\{section\.items\.length\}<\/small>\s*<Icon name="chevronDown" \/>/);
  assert.match(css, /\.nav-group-toggle small \{\s*margin-left: auto;/);
  assert.match(css, /\.sidebar-collapsed \.nav-group-toggle small \{\s*display: none;\s*\}/);
  for (const [key, en, th] of [
    ["NavGroup.sales", "SALES", "งานขาย"],
    ["NavGroup.estimating", "ESTIMATING", "ประมาณราคา"],
    ["NavGroup.projects", "PROJECTS & DELIVERY", "โครงการและส่งมอบ"],
    ["NavGroup.procurement", "PROCUREMENT & STOCK", "จัดซื้อและคลัง"],
    ["NavGroup.team", "TEAM & KNOWLEDGE", "ทีมและความรู้"],
    ["NavGroup.system", "SYSTEM", "ตั้งค่าระบบ"],
    ["Nav.help", "Help", "ช่วยเหลือ"],
  ])
    assert.match(i18n, new RegExp(`"${key.replace(".", "\\.")}": \\{ en: "${en}", th: "${th}", jp: "[^"]+" \\}`), key);
});

test("the top bar ? menu opens the manual, the guides, the issue list and the download center", async () => {
  const [shell, ui] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/system/ui.tsx")]);
  assert.match(
    shell,
    /<button\s+className="icon-btn"\s+type="button"\s+data-guide="nav\.help"\s+aria-haspopup="menu"\s+aria-expanded=\{helpOpen\}\s+aria-label=\{t\("Nav\.help"\)\}\s+title=\{t\("Nav\.help"\)\}/,
  );
  assert.match(shell, /\{helpOpen \? \(?\s*<div className="menu" role="menu" aria-label=\{t\("Nav\.help"\)\}>/);
  assert.match(
    shell,
    /role="menuitem"\s+data-guide="nav\.manual"\s+onClick=\{async \(\) => \{\s*setHelpOpen\(false\);\s*\(?await setView\("manual"\)\)?;\s*\}\}\s*>\s*<Icon name="book" \/>\s*\{employeeManualLabel\(language\)\}/,
  );
  assert.match(shell, /role="menuitem"\s+onClick=\{\(\) => \{\s*setHelpOpen\(false\);\s*setGuideOpen\(true\);\s*\}\}\s*>\s*<Icon name="play" \/>\s*\{t\("Guide\.open"\)\}/);
  assert.match(
    shell,
    /role="menuitem"\s+data-guide="nav\.support"\s+onClick=\{\(\) => \{\s*setHelpOpen\(false\);\s*void openSupport\(null\);\s*\}\}\s*>\s*<Icon name="inbox" \/>\s*\{t\("Report & Track Issues"\)\}/,
  );
  assert.match(shell, /role="menuitem"\s+onClick=\{async \(\) => \{\s*setHelpOpen\(false\);\s*\(?await setView\("downloads"\)\)?;\s*\}\}\s*>\s*<Icon name="download" \/>\s*\{t\("Download Center"\)\}/);
  // It closes on Escape and on a press outside, and the three top-bar menus never stay open together.
  assert.match(shell, /if \(event\.key === "Escape"\) setHelpOpen\(false\);/);
  assert.match(shell, /!event\.target\.closest\('\[data-menu="help"\]'\)\) setHelpOpen\(false\);/);
  assert.match(shell, /setUserOpen\(\(value\) => !value\);\s*setNotificationOpen\(false\);\s*setHelpOpen\(false\);/);
  // The profile menu keeps its four entries.
  assert.match(
    shell,
    /\{userOpen \? \(?\s*<div className="menu" role="menu">[\s\S]{0,400}t\("My Profile"\)[\s\S]{0,400}t\("My signature"\)[\s\S]{0,400}employeeManualLabel\(language\)[\s\S]{0,400}t\("Logout"\)/,
  );
  assert.match(ui, /help: \(\s*<>\s*<circle cx="12" cy="12" r="10" \/>/);
});

test("procurement is one menu entry for engineers: BOM and PR history are tabs of it, and an old BOM link lands there (owner 2026-11-19)", async () => {
  const [shell, material, api] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/system/production/MaterialScreens.tsx"), source("backend-node/src/routes/bootstrap.ts")]);
  const nav = shell.slice(shell.indexOf("const NAV:"), shell.indexOf("/** The one rule for which menu entries"));
  for (const gone of ["procurement", "boms", "pos", "inventory", "receiving", "issues", "material-master"]) {
    assert.ok(!viewsIn(nav).includes(gone), gone);
    assert.doesNotMatch(api.slice(api.indexOf("export const MENU_VIEWS"), api.indexOf("];", api.indexOf("export const MENU_VIEWS"))), new RegExp(`"${gone}"`));
  }
  assert.match(shell, /const target = next === "master" \? "customers" : next === "boms" \? "purchase" : next;/);
  // The screens themselves are kept, so an entry put back in the menu opens again.
  assert.match(shell, /\{view === "pos" \? <ProductionPurchaseOrders \{\.\.\.moduleProps\} \/> : null\}/);
  assert.match(material, /\{ id: "requests", label: "Purchase Requisitions", count: endpoint\.data\.length \}, \{ id: "boms", label: "Bill of Materials" \}, \{ id: "history", label: "PR ย้อนหลัง" \}/);
  assert.match(material, /tab === "boms" \? <ProductionBoms bootstrap=\{bootstrap\} notify=\{notify\} embedded onRequest=/);
  // The BOM tab keeps its own link names, so the PR list's search and open record do not leak into it.
  assert.match(material, /useLinkedState\(embedded \? "bom" : "open", null, idLink/);
  assert.match(material, /<SearchInput link=\{embedded \? "bq" : "q"\}/);
  // Stock approvals moved to the ERP: their panels show only while something still waits.
  assert.match(material, /\{waitingMirs\.length \? <Panel title="Material issue approvals"/);
  assert.match(material, /\{canAdjust && waitingAdjustments\.length \? <Panel title="Stock adjustment approvals"/);
});
