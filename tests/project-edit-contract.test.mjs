import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const read = (relative) => readFile(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

// The edit dialog opens from the row it was clicked on, so every field it writes back must already
// be on that row. A merge once dropped the extra columns from the list query while the TypeScript
// type still promised them, and the dialog crashed on the first undefined value it touched.
test("the project list returns every field the edit dialog writes back", async () => {
  const route = await read("../backend-node/src/routes/projects.ts");
  const listQuery = route.slice(route.indexOf('app.get("/api/v1/projects"'), route.indexOf('app.post("/api/v1/projects"'));
  assert.ok(listQuery.length > 0, "project list route not found");

  for (const column of [
    "p.manager_id", "p.lead_engineer_id", "p.po_no", "p.po_date",
    "p.actual_delivery", "p.site", "p.remark", "p.start_date", "p.target_delivery", "p.progress",
  ]) {
    assert.ok(listQuery.includes(column), `list query is missing ${column}`);
  }
  for (const field of [
    "managerId:", "leadEngineerId:", "purchaseOrderNumber:", "purchaseOrderDate:",
    "actualDelivery:", "site:", "remark:", "startDate:", "targetDelivery:", "progress:",
  ]) {
    assert.ok(listQuery.includes(field), `list response is missing ${field}`);
  }
  // lead_engineer_name is read through a join, so the join has to be there too.
  assert.match(listQuery, /INNER JOIN dbo\.users le ON le\.id=p\.lead_engineer_id/);
});

test("the edit dialog seeds every field defensively so one missing value cannot crash it", async () => {
  const screens = await read("../app/system/production/CoreScreens.tsx");
  const start = screens.indexOf("function EditProjectModal");
  assert.ok(start > -1, "EditProjectModal not found");
  const modal = screens.slice(start, screens.indexOf("function ProjectDocumentsModal", start));

  const state = modal.slice(modal.indexOf("const [form, setForm] = useState({"), modal.indexOf("});", modal.indexOf("const [form, setForm]")));
  for (const field of ["name", "projectType", "purchaseOrderNumber", "startDate", "targetDelivery", "site", "remark"]) {
    assert.match(state, new RegExp(`${field}: project\\.${field} \\?\\? ""`), `${field} is seeded without a fallback`);
  }
  // The submit guard calls .trim(), which is exactly what threw before the fallbacks were added.
  assert.match(modal, /!form\.name\.trim\(\)/);
  assert.match(modal, /!form\.site\.trim\(\)/);
});
