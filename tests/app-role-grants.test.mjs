import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { grantGaps, LOGIN_SCRIPT, loginScriptWithReplay, roleGrants } from "../scripts/app-role-grants.mjs";

const root = resolve(".");

test("the least-privilege application role covers every statement the Node API runs", () => {
  // Production still connects as sa; this keeps the switch to iot_team_app_role possible.
  // A new table or UPDATE column needs a GRANT in its migration, then `node scripts/app-role-grants.mjs --write`.
  assert.deepEqual(grantGaps(root), []);
});

test("010 replays every migration's grant, so running it alone is enough", () => {
  const committed = readFileSync(resolve(root, LOGIN_SCRIPT), "utf8").replace(/\r\n/g, "\n");
  assert.equal(committed, loginScriptWithReplay(root), "run: node scripts/app-role-grants.mjs --write");
});

test("column-level grants stay column-level where the API edits only some columns", () => {
  const grants = roleGrants(root);
  // users: role management only. First sign-in links through dbo.link_registered_sign_in.
  assert.equal(grants.get("users").operations.has("UPDATE"), false);
  assert.deepEqual([...grants.get("users").columns.get("UPDATE")].sort(), ["role_id", "updated_at"]);
  assert.equal(grants.get("link_registered_sign_in").operations.has("EXECUTE"), true);
  // projects: never created_by/created_at, the project number or the folder path.
  const projectColumns = grants.get("projects").columns.get("UPDATE");
  assert.equal(grants.get("projects").operations.has("UPDATE"), false);
  for (const fixed of ["project_no", "created_by", "created_at", "folder_path"]) assert.equal(projectColumns.has(fixed), false, fixed);
  // supplier quotations: the header, never the stored evidence file or its hash.
  const quotationColumns = grants.get("supplier_quotations").columns.get("UPDATE");
  assert.equal(grants.get("supplier_quotations").operations.has("UPDATE"), false);
  for (const evidence of ["storage_key", "sha256", "file_name", "size_bytes", "quotation_no"]) assert.equal(quotationColumns.has(evidence), false, evidence);
});
