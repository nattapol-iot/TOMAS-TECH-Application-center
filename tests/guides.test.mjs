import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { GUIDE_AREAS, GUIDES, NO_GUIDE, guideSelector, guidesFor } from "../app/system/production/guide-catalog.ts";
import { guideCardPosition } from "../app/system/production/guide-geometry.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const screens = [
  "app/system/ProductionApp.tsx",
  ...readdirSync(new URL("app/system/production/", root))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `app/system/production/${name}`),
  // Parts built on @tomas-tc/ui (app/system/tomas-ui, owner 2026-11-25).
  ...readdirSync(new URL("app/system/tomas-ui/", root))
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => `app/system/tomas-ui/${name}`),
].map((path) => ({ path, text: read(path) }));
const shell = read("app/system/ProductionApp.tsx");
const views = new Set([...shell.matchAll(/\{ view: "([a-z-]+)"|\{"view":"([a-z-]+)"/g)].map((match) => match[1] ?? match[2]));
// data-guide="x" on an element, guide="x" on Panel/Field/Fields, guide:"x" on a CRM form field.
const marked = new Set(screens.flatMap(({ text }) => [...text.matchAll(/(?:data-guide|guide)\s*[=:]\s*"([^"]+)"/g)].map((match) => match[1])));
const crm = read("app/system/tomas-ui/CrmPages.tsx");
const crmForms = read("app/system/tomas-ui/CrmForms.tsx");
// Screens a guide may name that are not menu entries of their own.
const subViews = new Set(["sales-intake", "crm-pipeline", "command-center"]);
// Parts of the menus themselves: the star on an entry and the Favourites section (menu-favorites guide), and the
// "?" help button in the top bar (support-ticket guide).
const menuParts = new Set(["nav.star", "nav.favorites", "nav.help"]);

test("every guide step points at something a screen still marks", () => {
  const missing = [];
  for (const guide of GUIDES)
    for (const [index, step] of guide.steps.entries()) {
      const where = `${guide.id} step ${index + 1}`;
      if (!step.target) continue;
      const tab = /^\[data-tab="([a-z-]+)"\]$/.exec(step.target);
      if (tab) {
        // Tabs marks each tab with its id; the id must still be a tab somewhere.
        if (!screens.some(({ text }) => text.includes(`id: "${tab[1]}"`))) missing.push(`${where}: no tab ${tab[1]}`);
        continue;
      }
      assert.ok(!step.target.startsWith("["), `${where}: only data-tab selectors are expected, use a data-guide name`);
      if (menuParts.has(step.target)) {
        if (!shell.includes(`"${step.target}"`)) missing.push(`${where}: the menu does not mark ${step.target}`);
      } else if (step.target.startsWith("nav.")) {
        if (!views.has(step.target.slice(4))) missing.push(`${where}: no menu entry ${step.target}`);
      } else if (step.target.startsWith("intake.to.")) {
        if (!read("app/system/production/SiteVisitScreens.tsx").includes(`"${step.target.slice(10)}"`)) missing.push(`${where}: no intake status ${step.target}`);
      } else if (step.target.startsWith("crm.tab.")) {
        // The deal page's tabs (CrmPages.tsx) are kit TabsTriggers marked crm.tab.<id>, one per entry of DEAL_TABS.
        const dealTabs = /const DEAL_TABS = \[((?:"[a-z]+",?\s*)+)\];/.exec(crm);
        if (!/<TabsTrigger key=\{k\} value=\{k\} data-guide=\{`crm\.tab\.\$\{k\}`\}>/.test(crm)) missing.push(`${where}: the deal tabs are not marked`);
        if (!dealTabs?.[1].includes(`"${step.target.slice(8)}"`)) missing.push(`${where}: no deal tab ${step.target}`);
      } else if (!marked.has(step.target)) missing.push(`${where}: nothing marked ${step.target}`);
    }
  assert.deepEqual(missing, []);
  // The copy of an entry under Favourites is marked nav.fav.<view>, so nav.<view> names one element.
  assert.match(shell, /data-guide=\{favorite \? `nav\.fav\.\$\{item\.view\}` : `nav\.\$\{item\.view\}`\}/);
  assert.match(read("app/system/production/SiteVisitScreens.tsx"), /data-guide=\{`intake\.to\.\$\{target\}`\}/);
  // CRM forms (on @tomas-tc/ui since the CRM UX audit 2026-11-26) mark a field through its spec's guide, a group of
  // fields through FieldGrid's guide, and Save through the dialog shell, "crm.save" unless a form names another.
  assert.match(crmForms, /<div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2" data-guide=\{guide\}>/);
  assert.match(crmForms, /data-guide=\{field\.guide\}/);
  assert.match(crmForms, /const DEFAULT_SAVE = \{ guide: "crm\.save" \} as const;/);
  assert.match(crmForms, /saveGuide = DEFAULT_SAVE\.guide/);
  assert.match(crmForms, /type="submit" form=\{formId\}[^>]*data-guide=\{saveGuide\}/);
  assert.match(read("app/system/ui.tsx"), /role="tab" type="button" aria-selected=\{active === tab\.id\} data-tab=\{tab\.id\}/);
  assert.match(read("app/system/ui.tsx"), /<div className=\{`field\$\{span \? ` span-\$\{span\}` : ""\}`\} data-guide=\{guide\}>/);
  assert.match(read("app/system/ui.tsx"), /<section className=\{`panel\$\{className \? ` \$\{className\}` : ""\}`\} data-guide=\{guide\}>/);
  assert.match(read("app/system/ui.tsx"), /<label className="search-field" data-guide=\{guide\}>/);
});

test("every menu screen has a guide, or a stated reason in NO_GUIDE (owner rule 2026-11-02)", () => {
  // A new feature or screen ships with its How-to guide. When a screen truly needs none, NO_GUIDE says why.
  const covered = new Set(GUIDES.flatMap((guide) => [...guide.views, ...guide.steps.map((step) => step.view), ...(guide.invite ? [guide.invite] : [])]));
  const unguided = [...views].filter((view) => !covered.has(view) && !NO_GUIDE[view]);
  assert.deepEqual(unguided, [], "add a guide to guide-catalog.ts for these screens, or a NO_GUIDE reason");
  for (const [view, reason] of Object.entries(NO_GUIDE)) {
    assert.ok(views.has(view), `NO_GUIDE names ${view}, which is not a menu screen`);
    assert.ok(!covered.has(view), `NO_GUIDE excuses ${view}, but a guide covers it: drop the entry`);
    assert.ok(reason.trim().length >= 10, `NO_GUIDE ${view} needs a real reason`);
  }
});

test("the catalog holds the guides the owner chose, in the order the work happens, each with all three languages and a known screen", () => {
  // Six daily-work guides (2026-10-30), four CRM guides (2026-11-01), fourteen for the rest of the app (2026-11-02) and
  // attaching a file to an existing inquiry (2026-11-02, when engineers got inquiry.write in migration 094).
  assert.deepEqual(
    GUIDES.map((guide) => guide.id),
    [
      // What needs doing now, and finding an activity (CRM UX audit 2026-11-26).
      "crm-find-work",
      "crm-deal-create",
      "crm-activity-followup",
      "crm-find-activity",
      "crm-send-estimate",
      "inquiry-create",
      "inquiry-attach",
      // Assigning an inquiry's owner moves its estimate too (2026-11-26).
      "inquiry-assign-owner",
      "site-visit-request",
      "crm-proposal-won",
      // The V1 / V2 switch of the Sales screens; V2 is the Pegasus ERP look (2026-11-21).
      "sales-look-v2",
      "estimate-create",
      "supplier-quotation",
      "price-library",
      "project-create",
      "project-delete",
      "project-cost",
      // My week: time booked on the app's calendar goes into Outlook and drafts the day (2026-11-23).
      "my-week-book",
      "my-hours-confirm",
      // An outside supplier's people per day on outsourced rows (task doc 3.6, 2026-11-25).
      "vendor-hours",
      // A project's own page with its tabs (task doc 5.2, 2026-11-25).
      "project-page",
      "project-plan",
      // Editing the Master Plan of a project that already exists (2026-11-03).
      "project-master-plan",
      // A project registered under PJ000000 takes its ERP number from the ERP project search (2026-11-06).
      "project-erp-number",
      // Customer issue batches on the Punchlist: record one, then start and close its issues (2026-11-18).
      "punchlist-issues",
      "punchlist-close-issue",
      "team-overview-task",
      // Team week: everyone's hours from My week, with the allocation queue beside it (2026-11-23).
      "team-week",
      // One head names the people of every project, from the queue on Team overview > Allocation (2026-11-22).
      "allocation-assign",
      "bom-release",
      // Approving an estimate sends it to Pegasus ERP as a Cost Sheet (2026-11-02).
      "estimate-approve",
      // Opening an earlier estimate revision and continuing from it (2026-11-18).
      "estimate-revision-back",
      // An old Excel Estimate Cost imported afterwards as the Draft estimate of its project (2026-11-25).
      "estimate-historical-import",
      // The V1 / V2 switch of the Estimating screens; V2 is the Pegasus ERP look (2026-11-19).
      "estimate-look-v2",
      // The Projects overview: summary bar, header funnels, hours and follow-ups (the only look since 2026-11-25).
      "project-overview",
      "purchase-request",
      "pr-approve",
      // An approved PR the ERP refused or deleted is taken back to Draft or cancelled (2026-11-02).
      "pr-fix",
      "my-work-progress",
      "site-visit-work",
      "report-create",
      "sign-document",
      "knowledge-find",
      "downloads-skill",
      "site-monitor-check",
      // Fleet with its approved script jobs, and the Command Center wall screen (migration 133, 2026-11-25).
      "fleet-run-script",
      "command-center",
      "asset-register",
      // Customers and suppliers from Pegasus ERP (2026-11-05).
      "erp-customers-suppliers",
      // The header funnel of the Suppliers and Employees lists, filtered on the server (2026-11-21).
      "list-column-filter",
      // Starring menu entries into the Favourites section (2026-11-10).
      "menu-favorites",
      "support-ticket",
      // Following your tickets on Report & Track Issues in the Pegasus look (2026-11-21).
      "support-follow",
      // Giving a person a role, such as Leader, on User Accounts & Permissions (2026-11-26).
      "user-role",
      // A head, a Leader included, assesses a team member's KPI (2026-11-26).
      "kpi-review",
    ],
  );
  const copies = [];
  for (const guide of GUIDES) {
    // The API accepts this shape only (backend-node/src/routes/user-guides.ts).
    assert.match(guide.id, /^[a-z][a-z0-9-]{1,59}$/);
    assert.ok(GUIDE_AREAS.includes(guide.area), `${guide.id}: unknown area ${guide.area}`);
    assert.ok(guide.steps.length >= 3 && guide.steps.length <= 100, guide.id);
    copies.push(guide.title, guide.summary, ...guide.steps.flatMap((step) => [step.title, step.body, ...(step.missing ? [step.missing] : [])]));
    for (const view of [...guide.views, ...(guide.invite ? [guide.invite] : []), ...guide.steps.map((step) => step.view)])
      assert.ok(views.has(view) || subViews.has(view), `${guide.id}: unknown screen ${view}`);
    // The last step is where the person decides to save; it always has a way out for practice. A browse-only guide
    // saves nothing, so it may end on a note.
    if (!guide.browse) assert.equal(guide.steps.at(-1).action, "click", guide.id);
  }
  // Every area has guides, so the team table never shows an empty area.
  for (const area of GUIDE_AREAS)
    assert.ok(
      GUIDES.some((guide) => guide.area === area),
      area,
    );
  for (const copy of copies) for (const lang of ["th", "en", "jp"]) assert.ok(copy[lang]?.trim(), JSON.stringify(copy));
  // Only one guide invites per screen, so a screen never asks twice.
  const invites = GUIDES.filter((guide) => guide.invite).map((guide) => guide.invite);
  assert.equal(new Set(invites).size, invites.length);
});

test("a guide is offered only to people who can do the task", () => {
  // Everyone can download files, star menu entries and report a problem.
  assert.deepEqual(
    guidesFor([]).map((guide) => guide.id),
    ["downloads-skill", "menu-favorites", "support-ticket", "support-follow"],
  );
  assert.deepEqual(
    guidesFor(["inquiry.read", "estimate.write"]).map((guide) => guide.id),
    // The Sales V1 / V2 switch lives on the RFQ list since CRM moved to @tomas-tc/ui (2026-11-26).
    ["sales-look-v2", "estimate-create", "downloads-skill", "menu-favorites", "support-ticket", "support-follow"],
  );
  assert.ok(guidesFor(["inquiry.write", "inquiry.read", "intake.read", "intake.write"]).some((guide) => guide.id === "site-visit-request"));
  // Engineers hold inquiry.write since 094_engineer_inquiry_write.sql: they receive RFQs and attach files.
  assert.deepEqual(
    guidesFor(["inquiry.write"]).map((guide) => guide.id),
    ["inquiry-create", "inquiry-attach", "inquiry-assign-owner", "downloads-skill", "menu-favorites", "support-ticket", "support-follow"],
  );
  // An engineer reads CRM and logs activities (053_crm.sql); sales also write deals and send them for estimating.
  assert.deepEqual(
    guidesFor(["crm.read", "crm.activity.write"]).map((guide) => guide.id),
    ["crm-find-work", "crm-activity-followup", "crm-find-activity", "downloads-skill", "menu-favorites", "support-ticket", "support-follow"],
  );
  assert.deepEqual(
    guidesFor(["crm.read", "crm.write", "crm.activity.write", "crm.convert"]).map((guide) => guide.id),
    [
      "crm-find-work",
      "crm-deal-create",
      "crm-activity-followup",
      "crm-find-activity",
      "crm-send-estimate",
      "crm-proposal-won",
      "downloads-skill",
      "menu-favorites",
      "support-ticket",
      "support-follow",
    ],
  );
  // A planner sees the plan guide; a head who approves PRs sees the approval guide.
  assert.ok(guidesFor(["schedule.read", "schedule.plan"]).some((guide) => guide.id === "project-plan"));
  assert.ok(guidesFor(["procurement.approve"]).some((guide) => guide.id === "pr-approve"));
  assert.equal(guideSelector("inquiry.save"), '[data-guide="inquiry.save"]');
  assert.equal(guideSelector('[data-tab="cost"]'), '[data-tab="cost"]');
  assert.equal(guideSelector("intake.to.Pending Technical Review"), '[data-guide="intake.to.Pending Technical Review"]');
});

test("the shell opens the guides from the top bar and loads the layer after first paint", () => {
  assert.match(
    shell,
    /<button className="btn default sm topbar-guide" type="button" aria-haspopup="dialog"[^>]*onClick=\{\(\) => setGuideOpen\(true\)\}>\s*<Icon name="play" \/>\s*<span className="label">\{t\("Guide\.open"\)\}<\/span>\s*<\/button>/,
  );
  assert.match(shell, /<GuideLayer\s+view=\{view\}\s+permissions=\{bootstrap\.permissions\}\s+duties=\{guideDuties\}\s+userId=\{bootstrap\.user\.id\}\s+open=\{guideOpen\}/);
  assert.match(shell, /data-guide="topbar\.report" onClick=\{\(\) => setSupportCreate\(true\)\}/);
  const lazy = read("app/system/production/LazyScreens.tsx");
  // A loading component keeps vinext's error boundary: a missing guide chunk shows nothing instead of blanking the app.
  assert.match(lazy, /export const GuideLayer = dynamic\(\(\) => import\("\.\/GuideLayer"\)\.then\(\(m\) => m\.GuideLayer\), \{ loading: \(\) => null \}\);/);
  const i18n = read("app/system/i18n.ts");
  assert.match(i18n, /"Guide\.open": \{ en: "How-to guides", th: "สอนการใช้งาน", jp: "使い方ガイド" \}/);
});

test("a running guide lights the target without blocking the page and follows a modal dialog", () => {
  const layer = read("app/system/production/GuideLayer.tsx");
  const css = read("app/system/production/guide.css");
  assert.match(css, /\.guide-spot \{[^}]*pointer-events: none;[^}]*box-shadow:\s*0 0 0 3px var\(--blue\),\s*0 0 0 9999px/s);
  // A @tomas-tc/ui dialog (Radix) turns pointer events off on <body>; the guide's cards stay clickable over it.
  assert.match(css, /\.guide-pop,\s*\.guide-card \{\s*pointer-events: auto;\s*\}/);
  // A click step moves on after the page has handled the click.
  assert.match(layer, /document\.addEventListener\("click", onClick, true\)/);
  assert.match(layer, /window\.setTimeout\(advance, 0\)/);
  // A <dialog> opened with showModal() is above every z-index, so the guide draws inside it.
  assert.match(layer, /element\?\.closest\("dialog\[open\]"\) \?\? document\.querySelector\("dialog\[open\]"\) \?\? document\.body/);
  // Getting ahead of the guide skips forward only on the open screen, and never right after Back.
  assert.match(layer, /candidate\.view === view/);
  assert.match(layer, /steppedBack\.current !== index/);
  // Progress and the one-time invitation are recorded on the server.
  assert.match(layer, /apiRequest<\{ items: GuideProgress\[\] \}>\("\/api\/v1\/guides\/progress"\)/);
  assert.match(layer, /report\(invited, "invite-closed"\)/);
  assert.match(layer, /permissions\.includes\("performance\.manage"\)/);
  // Two dozen guides: the list groups them by area, and the team table shows one area or a summary per area.
  assert.match(layer, /GUIDE_AREAS\.map\(\(area\) => \{\s*const list = other\.filter\(\(guide\) => guide\.area === area\)/);
  assert.match(layer, /const \[area, setArea\] = useState<GuideArea \| "all">\("all"\)/);
});

test("the card sits below the lit spot, else above, else beside, and never leaves the screen", () => {
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const card = { width: 340, height: 200 },
    desk = { width: 1440, height: 900 };
  // Room below: under the target, centred on it (6 px outline + 14 px gap).
  assert.deepEqual(guideCardPosition(rect(500, 100, 120, 36), card, desk), { left: 390, top: 156 });
  // A Save button at the bottom of the screen: above it.
  assert.deepEqual(guideCardPosition(rect(1200, 820, 120, 36), card, desk), { left: 1090, top: 600 });
  // A tall panel: beside it, on the right when there is room, otherwise on the left.
  assert.deepEqual(guideCardPosition(rect(240, 40, 600, 820), card, desk), { left: 860, top: 350 });
  assert.deepEqual(guideCardPosition(rect(900, 40, 520, 820), card, desk), { left: 540, top: 350 });
  // A menu entry at the left edge: the card is pulled back inside the screen.
  assert.equal(guideCardPosition(rect(0, 200, 60, 40), card, desk).left, 8);
  // Nothing to light: bottom centre.
  assert.deepEqual(guideCardPosition(null, card, desk), { left: 550, top: 684 });
  // A phone: docked at the bottom, and above the target when the target sits there.
  const phone = { width: 390, height: 800 };
  assert.deepEqual(guideCardPosition(rect(20, 100, 200, 40), { width: 374, height: 220 }, phone), { left: 8, top: 564 });
  assert.deepEqual(guideCardPosition(rect(20, 700, 200, 40), { width: 374, height: 220 }, phone), { left: 8, top: 466 });
});
