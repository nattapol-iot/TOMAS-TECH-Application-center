import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
// The CSS is read as written, whatever line endings the checkout uses.
const flat = (text) => text.replace(/\r\n/g, "\n");

/*
 * The sidebar wears the Pegasus ERP shell (tomastech-ui-design-system §3, owner request 2026-11-22):
 * - a white 220 px sidebar under the blue logo block;
 * - 12 px entries 32 px high, and 28 px inside a group;
 * - the open screen on the light-blue sidebar accent with a primary icon;
 * - red pills for counts that ask for action, grey pills for plain totals.
 */
test("the sidebar tokens are the Pegasus sidebar colours", async () => {
  const css = flat(await source("app/globals.css"));
  for (const [token, value] of [
    ["--sidebar-w", "220px"],
    ["--nav-fg", "#3f3f46"],
    ["--nav-accent", "#e6f4ff"],
    ["--nav-accent-fg", "#4d4d4d"],
    ["--nav-primary", "#0071c2"],
    ["--nav-logo", "rgb\\(0 112 192\\)"],
    ["--nav-hot-fg", "#dc2626"],
  ])
    assert.match(css, new RegExp(`\\n  ${token}: ${value};`), token);
  assert.match(css, /\.brand \{\s*gap: 12px;\s*min-height: var\(--topbar-h\);\s*padding: 0 16px;\s*background: var\(--nav-logo\);/);
});

test("entries are 32 px (28 px inside a group) and the open one sits on the accent with a primary icon", async () => {
  const css = flat(await source("app/globals.css"));
  assert.match(css, /\.nav-item \{\s*gap: 8px;\s*min-height: 32px;\s*padding: 8px;\s*border-radius: 6px;\s*color: var\(--nav-fg\);\s*font-size: 12px;/);
  assert.match(css, /\.nav-subitems \.nav-item \{\s*min-height: 28px;\s*padding-block: 6px;\s*\}/);
  assert.match(css, /\.nav-item\.active \{\s*background: var\(--nav-accent\);\s*color: var\(--nav-accent-fg\);\s*font-weight: 500;/);
  assert.match(css, /\.nav-item\.active \.icon \{\s*color: var\(--nav-primary\);\s*\}/);
  // The grey guide line, not a blue one, runs down a group's entries.
  assert.match(css, /\.nav-subitems \{\s*margin-left: 10px;\s*padding-left: 6px;\s*border-left: 1px solid var\(--nav-border\);\s*\}/);
});

test("counts that wait on the person are red pills; Inquiry and Estimate Cost totals stay grey", async () => {
  const [shell, css] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/globals.css")]);
  assert.match(shell, /const ACTION_COUNT_VIEWS: ReadonlySet<View> = new Set<View>\(\["my-work", "projects", "approvals", "crm-opportunities"\]\);/);
  assert.match(shell, /<em className=\{ACTION_COUNT_VIEWS\.has\(item\.view\) \? "hot" : undefined\}>\{menuBadge\}<\/em>/);
  // The totals badgeFor hands out for these two are every open record, not work waiting on anyone.
  assert.match(shell, /if \(view === "inquiries"\) return bootstrap\.counts\.inquiries;/);
  assert.match(shell, /if \(view === "estimates"\) return bootstrap\.counts\.estimates;/);
  const flatCss = flat(css);
  assert.match(flatCss, /\.nav-item em\.hot,\n\.nav-item\.active em\.hot \{\s*background: var\(--nav-hot\);\s*color: var\(--nav-hot-fg\);\s*\}/);
  // The pill shape belongs to the full desktop sidebar; the icon-only and phone layouts keep their corner badge.
  assert.match(flatCss, /@media \(min-width: 981px\) \{\s*\.app:not\(\.sidebar-collapsed\) \.nav-item em \{\s*display: inline-flex;[^}]*height: 20px;\s*min-width: 20px;/);
});
