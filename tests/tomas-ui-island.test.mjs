import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import tomasUiScope, { scopeSelector, splitSelectors } from "../scripts/postcss-tomas-ui-scope.mjs";

const root = new URL("../", import.meta.url);
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

/*
 * @tomas-tc/ui on the app's own page (owner 2026-11-25). The package's sheet carries Tailwind's preflight and :root
 * tokens; app/system/tomas-ui/tomas-ui-island.css is built with them and then moved under .tui, unlayered, so it styles
 * the parts built on the package and nothing else.
 */
test("selectors move under .tui; the document's roots become the island root", () => {
  assert.equal(scopeSelector(":root"), ".tui");
  assert.equal(scopeSelector(":host"), ".tui");
  assert.equal(scopeSelector("html"), ".tui");
  assert.equal(scopeSelector("body"), ".tui");
  assert.equal(scopeSelector("html:has([data-platform='pegasus'])"), ".tui:has([data-platform='pegasus'])");
  assert.equal(scopeSelector(":root .dark"), ".tui .dark");
  assert.equal(scopeSelector("*"), ".tui *");
  assert.equal(scopeSelector("::selection"), ".tui ::selection");
  assert.equal(scopeSelector(".bg-primary"), ".tui .bg-primary");
  assert.equal(scopeSelector("[data-platform='pegasus'] *"), ".tui [data-platform='pegasus'] *");
  assert.equal(scopeSelector(".tui"), ".tui", "already scoped");
  assert.equal(scopeSelector(".tuition"), ".tui .tuition", "a class that only starts with tui");
  assert.equal(scopeSelector("htmlx"), ".tui htmlx");
});

test("a selector list splits on its own commas only", () => {
  assert.deepEqual(splitSelectors("a, b"), ["a", "b"]);
  assert.deepEqual(splitSelectors(":where(a, b), c"), [":where(a, b)", "c"]);
  assert.deepEqual(splitSelectors('[title="a,b"], c'), ['[title="a,b"]', "c"]);
  assert.deepEqual(splitSelectors(".x:is(.a,.b) > .y"), [".x:is(.a,.b) > .y"]);
});

test("the built island: every rule under .tui, no @layer left, the package's utilities present, other files untouched", async () => {
  const require = createRequire(new URL("../package.json", import.meta.url));
  const postcss = require("postcss");
  const tailwind = require("@tailwindcss/postcss");
  const file = fileURLToPath(new URL("app/system/tomas-ui/tomas-ui-island.css", root));
  const result = await postcss([tailwind({ base: fileURLToPath(root) }), tomasUiScope()]).process(await readFile(file, "utf8"), { from: file });
  const selectors = [];
  result.root.walkRules((rule) => {
    const keyframes = rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name);
    if (!keyframes) selectors.push(...splitSelectors(rule.selector));
  });
  assert.ok(selectors.length > 500, `rules were built (${selectors.length})`);
  const loose = selectors.filter((selector) => selector !== ".tui" && !selector.startsWith(".tui ") && !selector.startsWith(".tui:") && !selector.startsWith(".tui."));
  assert.deepEqual(loose, [], "every rule sits under .tui");
  let layers = 0;
  result.root.walkAtRules("layer", () => (layers += 1));
  assert.equal(layers, 0, "unlayered, so the app's unlayered rules cannot win over the package's");
  assert.ok(selectors.includes(".tui .bg-primary"), "the package's classes were scanned");
  assert.ok(!selectors.some((selector) => /\.tui \.(btn|panel)\b/.test(selector)), "the old screens' class names are not scanned");
  // Any other file passes through the plugin unchanged.
  const other = await postcss([tomasUiScope()]).process("button { color: red }\n:root { --x: 1 }", { from: "/app/globals.css" });
  assert.equal(other.css, "button { color: red }\n:root { --x: 1 }");
});

test("the app's PostCSS runs Tailwind, then the scope; the island root wears Pegasus and portals stay inside an island", async () => {
  const [config, island, frame] = await Promise.all([source("postcss.config.mjs"), source("app/system/tomas-ui/tomas-ui-island.css"), source("app/system/tomas-ui/TomasUi.tsx")]);
  assert.match(config, /plugins: \[tailwind\(\), tomasUiScope\(\)\]/);
  assert.match(island, /@import "tailwindcss";\n@import "tw-animate-css";\n@import "@tomas-tc\/ui\/tokens\.css";/);
  assert.match(island, /@source "\.\.\/\.\.\/\.\.\/node_modules\/@tomas-tc\/ui";\n@source "\.\/";/);
  assert.doesNotMatch(island, /@source "\.\.\/production"/, "the old screens are not scanned");
  assert.doesNotMatch(island.replace(/\/\*[\s\S]*?\*\//g, ""), /@fontsource|font-size: 80%/, "the app's fonts and rem size");
  assert.match(frame, /import "\.\/tomas-ui-island\.css";/);
  assert.match(frame, /<div className=\{className \? `tui \$\{className\}` : "tui"\}>\s*<div data-platform="pegasus"/);
  assert.match(frame, /outer\.className = "tui tui-portal";/);
  assert.match(frame, /<PortalContainerProvider container=\{portal\}>/);
  assert.match(frame, /<UiIntlProvider locale=\{TOMAS_UI_LOCALE\[lang\]\}>/);
});
