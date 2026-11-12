import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("every menu entry carries a star beside its link, and starred entries repeat under Favourites", async () => {
  const shell = await source("app/system/ProductionApp.tsx");
  // The star is a real button next to the <a>, never inside it: a click on it must not navigate.
  assert.match(shell, /<\/a>\s*<button type="button" className="nav-star" aria-pressed=\{starred\} disabled=\{!starred && favoritesFull\} aria-label=\{starLabel\} title=\{starLabel\} onClick=\{\(\) => toggleFavorite\(item\.view\)\}><Icon name="star" \/><\/button>/);
  // Group entries keep nav.<view> for the guides; the copy under Favourites is nav.fav.<view>.
  assert.match(shell, /data-guide=\{favorite \? `nav\.fav\.\$\{item\.view\}` : `nav\.\$\{item\.view\}`\}/);
  assert.match(shell, /\{section\.items\.map\(\(item\) => navRow\(item\)\)\}/);
  // The section sits under the workspace label, before the first group, with its count, its entries or the hint.
  const nav = shell.slice(shell.indexOf('<nav className="nav"'), shell.indexOf("</nav>"));
  assert.ok(nav.indexOf('data-guide="nav.favorites"') > nav.indexOf("WORKSPACE_LABEL") && nav.indexOf('data-guide="nav.favorites"') < nav.indexOf("allowedNav.map"));
  assert.match(nav, /<small>\{favoriteEntries\.length\}\/\{MENU_FAVORITE_LIMIT\}<\/small>/);
  assert.match(nav, /favoriteEntries\.map\(\(entry\) => navRow\(entry\.item, \{ group: entry\.group \}\)\)/);
  assert.match(nav, /<p className="nav-favorites-empty"><strong>\{t\("Nav\.favEmptyTitle"\)\}<\/strong>\{t\("Nav\.favEmptyHint"\)\}<\/p>/);
});

test("favourites are limited to 8, follow the menu's permission rule and are saved on the server, not in the browser", async () => {
  const [shell, client] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/system/api-client.ts")]);
  assert.match(shell, /const MENU_FAVORITE_LIMIT = 8;/);
  assert.match(shell, /const favoritesFull = favoriteViews\.length >= MENU_FAVORITE_LIMIT;/);
  assert.match(shell, /if \(!starred && favoritesFull\) return;/);
  // Only entries of the person's own menu (allowedNav is NAV through navItemAllowed) are drawn, counted and saved.
  assert.match(shell, /const favoriteSection = allowedNav\.find\(\(candidate\) => candidate\.items\.some\(\(item\) => item\.view === favorite\)\);/);
  // The list comes with bootstrap; a click shows at once, is saved by PUT, and comes back with a toast on failure.
  assert.match(shell, /favoriteEdit\?\.userId === bootstrap\.user\.id \? favoriteEdit\.views : bootstrap\?\.menuFavorites \?\? \[\]/);
  assert.match(shell, /await saveMenuFavorites\(nextFavorites\)/);
  assert.match(shell, /setToast\("Nav\.favSaveFailed"\)/);
  assert.match(client, /menuFavorites\?: string\[\];/);
  assert.match(client, /export const saveMenuFavorites = \(views: readonly string\[\]\) => apiRequest<\{ views: string\[\] \}>\("\/api\/v1\/me\/menu-favorites", \{\s*method: "PUT",/);
  const favoriteCode = shell.slice(shell.indexOf("Menu favourites (owner request"), shell.indexOf("const clearPreferredSchedule"));
  assert.doesNotMatch(favoriteCode, /localStorage|sessionStorage/);
});

test("the API keeps one list per person: known menu views only, at most 8, each once", async () => {
  const [shell, route, migration, validation] = await Promise.all([
    source("app/system/ProductionApp.tsx"),
    source("backend-node/src/routes/bootstrap.ts"),
    source("database/migrations/104_user_menu_favorites.sql"),
    source("backend-node/src/migration-validation.ts"),
  ]);
  assert.match(route, /app\.put\("\/api\/v1\/me\/menu-favorites", async \(request\) => \{/);
  assert.match(route, /export const MENU_FAVORITE_LIMIT = 8;/);
  assert.match(route, /if \(views\.length > MENU_FAVORITE_LIMIT\) throw invalid/);
  // A stored name that stopped being a menu entry is not handed back.
  assert.match(route, /menuFavorites: favorites\.map\(\(row\) => row\.view_key\)\.filter\(\(view\) => MENU_VIEWS\.includes\(view\)\),/);
  // The API's menu views are the frontend's menu entries, nothing more and nothing less.
  const menu = shell.slice(shell.indexOf("const NAV"), shell.indexOf("/** The one rule for which menu entries"));
  const menuViews = [...menu.matchAll(/\{ view: "([a-z-]+)"|\{"view":"([a-z-]+)"/g)].map((match) => match[1] ?? match[2]);
  const apiViews = [...route.slice(route.indexOf("export const MENU_VIEWS"), route.indexOf("];", route.indexOf("export const MENU_VIEWS"))).matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
  assert.ok(menuViews.length > 40);
  assert.deepEqual(apiViews, menuViews);
  // Screens reached from inside another screen are not menu entries and cannot be starred.
  for (const view of ["profile", "signature", "crm-pipeline", "project-timeline", "sales-intake", "manual", "support"]) assert.ok(!apiViews.includes(view), view);
  assert.match(migration, /CREATE TABLE dbo\.user_menu_favorites \(\s*user_id bigint NOT NULL,\s*view_key nvarchar\(64\) NOT NULL,\s*position int NOT NULL,/);
  assert.match(migration, /CONSTRAINT PK_user_menu_favorites PRIMARY KEY \(user_id, view_key\)/);
  assert.match(migration, /FOREIGN KEY \(user_id\) REFERENCES dbo\.users\(id\)/);
  assert.match(migration, /GRANT SELECT, INSERT, DELETE ON OBJECT::dbo\.user_menu_favorites TO \[iot_team_app_role\];/);
  assert.match(validation, /\{ version: 104, fileName: "104_user_menu_favorites\.sql", name: "Menu favourites per person" \}/);
});

test("the star hides until the entry is pointed at, stays lit when starred, and leaves the icon-only sidebar", async () => {
  const [css, ui, i18n] = await Promise.all([source("app/globals.css"), source("app/system/ui.tsx"), source("app/system/i18n.ts")]);
  assert.match(css, /\.nav-star \{[^}]*width: 28px; height: 28px;[^}]*opacity: 0;/s);
  assert.match(css, /\.nav-row:hover \.nav-star, \.nav-row:focus-within \.nav-star, \.nav-star\[aria-pressed="true"\] \{ opacity: 1; \}/);
  assert.match(css, /\.nav-star\[aria-pressed="true"\], \.nav-item\.active \+ \.nav-star\[aria-pressed="true"\] \{ color: var\(--brand-gold\); \}/);
  assert.match(css, /\.nav-star\[aria-pressed="true"\] \.icon \{ fill: currentColor; \}/);
  assert.match(css, /\.nav-star:focus-visible \{ outline: 2px solid var\(--blue\);/);
  assert.match(css, /\.sidebar-collapsed \.nav-star,\s*\.sidebar-collapsed \.nav-fav-group,\s*\.sidebar-collapsed \.nav-favorites-head,\s*\.sidebar-collapsed \.nav-favorites-empty,\s*\.sidebar-collapsed \.nav-favorites\.no-favorites \{ display: none; \}/);
  // No new colours: the favourites rules use tokens only.
  const block = css.slice(css.indexOf("/* Menu favourites:"), css.indexOf("/* Cost list & ERP"));
  assert.ok(block.length > 500);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(ui, /star: <polygon points="12 2 15\.09 8\.26 22 9\.27 17 14\.14 18\.18 21\.02 12 17\.77 5\.82 21\.02 7 14\.14 2 9\.27 8\.91 8\.26 12 2" \/>,/);
  for (const key of ["Nav.favorites", "Nav.favEmptyTitle", "Nav.favEmptyHint", "Nav.favAdd", "Nav.favRemove", "Nav.favFull", "Nav.favSaveFailed"]) {
    assert.match(i18n, new RegExp(`"${key.replace(".", "\\.")}": \\{ en: "[^"]+", th: "[^"]+", jp: "[^"]+" \\}`), key);
  }
});
