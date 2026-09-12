import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ESTIMATE_ASSIGNMENT_SECTION_CODES, ESTIMATE_ASSIGNMENT_SECTIONS } from "../src/estimate-sections.js";

test("estimate work is assigned per discipline: Electrical, Mechanical and Software only", () => {
  assert.deepEqual(ESTIMATE_ASSIGNMENT_SECTIONS.map(([, name]) => name), ["Electrical", "Mechanical", "Software"]);
  assert.deepEqual([...ESTIMATE_ASSIGNMENT_SECTION_CODES], ["03", "04", "02"]);
  for (const code of ESTIMATE_ASSIGNMENT_SECTION_CODES) assert.match(code, /^\d{2}$/, "codes stay two digits so stored 'NN Name' sections keep resolving");
});

test("the front-end copy of the discipline list matches the API's", async () => {
  const shared = await readFile(new URL("../../lib/estimate-sections.ts", import.meta.url), "utf8");
  for (const [code, name] of ESTIMATE_ASSIGNMENT_SECTIONS) assert.match(shared, new RegExp(`\\["${code}", "${name}"\\]`));
  const listed = [...shared.matchAll(/\["(\d{2})", "([A-Za-z ]+)"\]/g)].map((match) => String(match[1]));
  assert.deepEqual(listed, [...ESTIMATE_ASSIGNMENT_SECTION_CODES], "lib/estimate-sections.ts lists the same codes in the same order");
});

test("assignment creation validates against the discipline list and no route auto-creates category assignments", async () => {
  const route = (name: string) => readFile(new URL(`../src/routes/${name}.ts`, import.meta.url), "utf8");
  const [workspaceWrite, costWrite, copy] = await Promise.all([route("estimate-workspace-write"), route("estimate-cost-write"), route("estimate-copy")]);
  assert.match(workspaceWrite, /const estimateSectionCodes = ESTIMATE_ASSIGNMENT_SECTION_CODES;/);
  for (const source of [costWrite, copy]) assert.doesNotMatch(source, /INSERT INTO dbo\.estimate_assignments/);
  assert.doesNotMatch(costWrite, /upsertCategoryAssignment/);
});
