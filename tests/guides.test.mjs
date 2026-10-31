import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { GUIDES, guideSelector, guidesFor } from "../app/system/production/guide-catalog.ts";
import { guideCardPosition } from "../app/system/production/guide-geometry.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const screens = ["app/system/ProductionApp.tsx", ...readdirSync(new URL("app/system/production/", root)).filter((name) => name.endsWith(".tsx")).map((name) => `app/system/production/${name}`)]
  .map((path) => ({ path, text: read(path) }));
const shell = read("app/system/ProductionApp.tsx");
const views = new Set([...shell.matchAll(/\{ view: "([a-z-]+)"|\{"view":"([a-z-]+)"/g)].map((match) => match[1] ?? match[2]));
const marked = new Set(screens.flatMap(({ text }) => [...text.matchAll(/(?:data-guide|guide)="([^"]+)"/g)].map((match) => match[1])));

test("every guide step points at something a screen still marks", () => {
  const missing = [];
  for (const guide of GUIDES) for (const [index, step] of guide.steps.entries()) {
    const where = `${guide.id} step ${index + 1}`;
    if (!step.target) continue;
    const tab = /^\[data-tab="([a-z-]+)"\]$/.exec(step.target);
    if (tab) {
      // Tabs marks each tab with its id; the id must still be a tab somewhere.
      if (!screens.some(({ text }) => text.includes(`id: "${tab[1]}"`))) missing.push(`${where}: no tab ${tab[1]}`);
      continue;
    }
    assert.ok(!step.target.startsWith("["), `${where}: only data-tab selectors are expected, use a data-guide name`);
    if (step.target.startsWith("nav.")) {
      if (!views.has(step.target.slice(4))) missing.push(`${where}: no menu entry ${step.target}`);
    } else if (step.target.startsWith("intake.to.")) {
      if (!read("app/system/production/SiteVisitScreens.tsx").includes(`"${step.target.slice(10)}"`)) missing.push(`${where}: no intake status ${step.target}`);
    } else if (!marked.has(step.target)) missing.push(`${where}: nothing marked ${step.target}`);
  }
  assert.deepEqual(missing, []);
  assert.match(shell, /data-guide=\{`nav\.\$\{item\.view\}`\}/);
  assert.match(read("app/system/production/SiteVisitScreens.tsx"), /data-guide=\{`intake\.to\.\$\{target\}`\}/);
  assert.match(read("app/system/ui.tsx"), /role="tab" type="button" aria-selected=\{active === tab\.id\} data-tab=\{tab\.id\}/);
  assert.match(read("app/system/ui.tsx"), /<div className=\{`field\$\{span \? ` span-\$\{span\}` : ""\}`\} data-guide=\{guide\}>/);
  assert.match(read("app/system/ui.tsx"), /<section className=\{`panel\$\{className \? ` \$\{className\}` : ""\}`\} data-guide=\{guide\}>/);
});

test("the catalog holds the six guides the owner chose, each with all three languages and a known screen", () => {
  assert.deepEqual(GUIDES.map((guide) => guide.id), ["inquiry-create", "site-visit-request", "estimate-create", "purchase-request", "my-work-progress", "support-ticket"]);
  const copies = [];
  for (const guide of GUIDES) {
    // The API accepts this shape only (backend-node/src/routes/user-guides.ts).
    assert.match(guide.id, /^[a-z][a-z0-9-]{1,59}$/);
    assert.ok(guide.steps.length >= 3 && guide.steps.length <= 100, guide.id);
    copies.push(guide.title, guide.summary, ...guide.steps.flatMap((step) => [step.title, step.body, ...(step.missing ? [step.missing] : [])]));
    for (const view of [...guide.views, ...(guide.invite ? [guide.invite] : []), ...guide.steps.map((step) => step.view)]) assert.ok(views.has(view) || view === "sales-intake", `${guide.id}: unknown screen ${view}`);
    // The last step is where the person decides to save; it always has a way out for practice.
    assert.equal(guide.steps.at(-1).action, "click", guide.id);
  }
  for (const copy of copies) for (const lang of ["th", "en", "jp"]) assert.ok(copy[lang]?.trim(), JSON.stringify(copy));
  // Only one guide invites per screen, so a screen never asks twice.
  const invites = GUIDES.filter((guide) => guide.invite).map((guide) => guide.invite);
  assert.equal(new Set(invites).size, invites.length);
});

test("a guide is offered only to people who can do the task", () => {
  assert.deepEqual(guidesFor([]).map((guide) => guide.id), ["support-ticket"]);
  assert.deepEqual(guidesFor(["inquiry.read", "estimate.write"]).map((guide) => guide.id), ["estimate-create", "support-ticket"]);
  assert.ok(guidesFor(["inquiry.write", "inquiry.read", "intake.read", "intake.write"]).some((guide) => guide.id === "site-visit-request"));
  assert.equal(guideSelector("inquiry.save"), '[data-guide="inquiry.save"]');
  assert.equal(guideSelector('[data-tab="cost"]'), '[data-tab="cost"]');
  assert.equal(guideSelector("intake.to.Pending Technical Review"), '[data-guide="intake.to.Pending Technical Review"]');
});

test("the shell opens the guides from the top bar and loads the layer after first paint", () => {
  assert.match(shell, /<button className="btn default sm topbar-guide" type="button" aria-haspopup="dialog"[^>]*onClick=\{\(\) => setGuideOpen\(true\)\}><Icon name="play" \/><span className="label">\{t\("Guide\.open"\)\}<\/span><\/button>/);
  assert.match(shell, /<GuideLayer view=\{view\} permissions=\{bootstrap\.permissions\} userId=\{bootstrap\.user\.id\} open=\{guideOpen\}/);
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
  assert.match(css, /\.guide-spot \{[^}]*pointer-events: none;[^}]*box-shadow: 0 0 0 3px var\(--blue\), 0 0 0 9999px/s);
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
});

test("the card sits below the lit spot, else above, else beside, and never leaves the screen", () => {
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const card = { width: 340, height: 200 }, desk = { width: 1440, height: 900 };
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
