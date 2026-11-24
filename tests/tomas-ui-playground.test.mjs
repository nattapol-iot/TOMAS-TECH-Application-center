import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import * as ui from "@tomas-tc/ui";
import { TOMAS_UI_DEMOS, TOMAS_UI_NOT_SHOWN, TOMAS_UI_SECTIONS } from "../app/system/production/design-system/tomas-ui/config/tomas-ui.coverage.ts";
import { TOMAS_UI_COPY } from "../app/system/production/design-system/tomas-ui/tomas-ui-copy.ts";

const root = "app/system/production/design-system/tomas-ui";
const sources = readdirSync(root, { recursive: true })
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => readFileSync(path.join(root, file), "utf8"));
const imported = new Set(
  sources.flatMap((source) =>
    [...source.matchAll(/import \{([^}]*)\} from "@tomas-tc\/ui"/g)].flatMap((match) =>
      match[1]
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name && !name.startsWith("type ")),
    ),
  ),
);

test("every public export of @tomas-tc/ui is shown once or listed as not shown with a reason", () => {
  const catalogued = [...TOMAS_UI_DEMOS.flatMap((demo) => demo.exports), ...TOMAS_UI_NOT_SHOWN.map((item) => item.name)];
  assert.equal(new Set(catalogued).size, catalogued.length, "an export is catalogued twice");
  assert.deepEqual([...catalogued].sort(), Object.keys(ui).sort());
  for (const item of TOMAS_UI_NOT_SHOWN) assert.ok(TOMAS_UI_COPY[item.reason], `${item.name} has no translated reason`);
});

test("a sample imports every export its demo claims to show", () => {
  for (const demo of TOMAS_UI_DEMOS) {
    for (const name of demo.exports) {
      if (!demo.drawnInside?.[name]) assert.ok(imported.has(name), `${demo.id} lists ${name} but no sample imports it`);
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
