import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as ui from "@tomas-tc/ui";
import { TOMAS_UI_DEMOS, TOMAS_UI_NOT_SHOWN, TOMAS_UI_SECTIONS } from "../app/system/production/design-system/tomas-ui/config/tomas-ui.coverage.ts";
import { TOMAS_UI_COPY } from "../app/system/production/design-system/tomas-ui/tomas-ui-copy.ts";

const MAIN_ENTRY = "@tomas-tc/ui";

// The subpath entries are read, not imported: route-map loads leaflet, which needs a browser window.
const exportsOf = (entry) =>
  readFileSync(fileURLToPath(import.meta.resolve(entry)), "utf8")
    .match(/export \{([^}]*)\};?\s*$/)[1]
    .split(",")
    .map((name) =>
      name
        .trim()
        .split(/\s+as\s+/)
        .pop(),
    )
    .filter(Boolean);

const ENTRIES = {
  [MAIN_ENTRY]: Object.keys(ui),
  "@tomas-tc/ui/file-viewer": exportsOf("@tomas-tc/ui/file-viewer"),
  "@tomas-tc/ui/route-map": exportsOf("@tomas-tc/ui/route-map"),
};

const root = "app/system/production/design-system/tomas-ui";
const sources = readdirSync(root, { recursive: true })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => readFileSync(path.join(root, file), "utf8"));

const importedFrom = (entry) =>
  new Set(
    sources.flatMap((source) =>
      [...source.matchAll(new RegExp(`import \\{([^}]*)\\} from "${entry}"`, "g"))].flatMap((match) =>
        match[1]
          .split(",")
          .map((name) => name.trim())
          .filter((name) => name && !name.startsWith("type ")),
      ),
    ),
  );

const entryOf = (demo) => demo.entry ?? MAIN_ENTRY;

test("every public export of each @tomas-tc/ui entry is shown once or listed as not shown with a reason", () => {
  for (const [entry, names] of Object.entries(ENTRIES)) {
    const catalogued = [...TOMAS_UI_DEMOS.filter((demo) => entryOf(demo) === entry).flatMap((demo) => demo.exports), ...(entry === MAIN_ENTRY ? TOMAS_UI_NOT_SHOWN.map((item) => item.name) : [])];
    assert.equal(new Set(catalogued).size, catalogued.length, `an export of ${entry} is catalogued twice`);
    assert.deepEqual([...catalogued].sort(), [...names].sort(), entry);
  }
  for (const item of TOMAS_UI_NOT_SHOWN) assert.ok(TOMAS_UI_COPY[item.reason], `${item.name} has no translated reason`);
});

test("a sample imports every export its demo claims to show, from the entry it is catalogued under", () => {
  const imported = Object.fromEntries(Object.keys(ENTRIES).map((entry) => [entry, importedFrom(entry)]));
  for (const demo of TOMAS_UI_DEMOS) {
    for (const name of demo.exports) {
      if (!demo.drawnInside?.[name]) assert.ok(imported[entryOf(demo)].has(name), `${demo.id} lists ${name} but no sample imports it from ${entryOf(demo)}`);
    }
  }
});

test("every catalogued demo is rendered and every section has one", () => {
  const rendered = new Set(sources.flatMap((source) => [...source.matchAll(/<TomasUiDemo id="([^"]+)"/g)].map((match) => match[1])));
  assert.deepEqual([...rendered].sort(), TOMAS_UI_DEMOS.map((demo) => demo.id).sort());
  for (const section of TOMAS_UI_SECTIONS)
    assert.ok(
      TOMAS_UI_DEMOS.some((demo) => demo.section === section.id),
      section.id,
    );
});

test("every TUI key the tab asks for reads in Thai, English and Japanese", () => {
  const keys = new Set([...sources.join("\n").matchAll(/"(TUI\.[A-Za-z]+)"/g)].map((match) => match[1]));
  for (const key of keys) {
    const entry = TOMAS_UI_COPY[key];
    assert.ok(entry?.th && entry.en && entry.jp, key);
  }
});
