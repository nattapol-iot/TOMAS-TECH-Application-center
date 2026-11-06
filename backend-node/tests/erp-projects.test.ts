import assert from "node:assert/strict";
import test from "node:test";
import { erpProjectArguments, readErpProjects } from "../src/erp-projects.js";

test("the ERP project search sends what was typed, trimmed, or nothing", () => {
  assert.deepEqual(erpProjectArguments("  PJ2601 "), { q: "PJ2601" });
  assert.deepEqual(erpProjectArguments(""), {});
  assert.deepEqual(erpProjectArguments(undefined), {});
  assert.equal((erpProjectArguments("x".repeat(300)).q as string).length, 100);
});

test("each ERP project comes once, spelled as the ERP spells its number", () => {
  assert.deepEqual(readErpProjects({ projects: [
    { project_no: "PJ260172", project_name: "  AI   Camera ", customer_name: "Unimicron (Thailand) Co., Ltd." },
    { project_no: "PJ260172", project_name: "duplicate" },
    { project_name: "no number" }, null, "text",
    { project_no: "PJ260173" },
  ] }), [
    { number: "PJ260172", name: "AI Camera", customerName: "Unimicron (Thailand) Co., Ltd." },
    { number: "PJ260173", name: "", customerName: "" },
  ]);
  assert.deepEqual(readErpProjects({ projects: [] }), []);
  assert.equal(readErpProjects({ items: [] }), null, "an answer without the list is not an empty search");
  assert.equal(readErpProjects(null), null);
});
