import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { buildApp } from "../src/app.js";

const name = `IoTTeamCenter_OriginalCI_${randomUUID().replaceAll("-", "")}`;
const args = ["-S", "localhost", "-E", "-C", "-I", "-b"];
const storageRoot = resolve("tmp", name);
const run = (query: string) => execFileSync("sqlcmd", [...args, "-d", name, "-Q", query], { stdio: "pipe" });
let application: Awaited<ReturnType<typeof buildApp>> | undefined;
function files(path: string): string[] { return existsSync(path) ? readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(resolve(path, item.name)) : [resolve(path, item.name)]) : []; }
try {
  execFileSync("sqlcmd", [...args, "-i", "database/scripts/020_deploy_fresh_database.sql", "-v", `DatabaseName=${name}`], { stdio: "pipe" });
  run(`INSERT dbo.users(entra_object_id,email,name,role_id) SELECT 'original-admin','original@test.invalid','TEST ONLY Original',id FROM dbo.roles WHERE code='Admin';
  DECLARE @actor bigint=(SELECT id FROM dbo.users WHERE entra_object_id='original-admin');
  INSERT dbo.customers(code,name,created_by,updated_by) VALUES('ORIGINAL-CI','TEST ONLY Original customer',@actor,@actor);
  DECLARE @customer bigint=SCOPE_IDENTITY();
  INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by) VALUES('ORIGINAL-CI',GETUTCDATE(),@customer,'TEST ONLY Original','IoT',@actor,'2027-01-01','Normal','Estimating',@actor,@actor);
  DECLARE @inquiry bigint=SCOPE_IDENTITY();
  INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,created_by,updated_by) VALUES('ORIGINAL-CI',@inquiry,@customer,'TEST ONLY Original','IoT',@actor,GETUTCDATE(),'2027-01-01','Draft',@actor,@actor);`);
  application = await buildApp({ environment: "development", host: "127.0.0.1", port: 0, allowedHosts: ["localhost"], corsOrigins: ["http://localhost:3000"], businessTimeZone: "Asia/Bangkok", auth: { mode: "Development" }, database: { connectionString: `Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`, trustServerCertificate: true }, documentStorage: { mode: "Local", rootPath: storageRoot, maxFileSizeBytes: 1000000 }, email: { mode: "Disabled" } });
  const { app, database } = application;
  const row = (await database.query<{ id: number; row_version: Buffer }>("SELECT id,row_version FROM dbo.estimates WHERE estimate_no='ORIGINAL-CI'")).recordset[0]!;
  const body = { estimateRowVersion: row.row_version.toString("base64"), sourceName: "original.xlsx", sourceDate: "2026-09-10", sourceTotal: 100, hoursPerDay: 8, lines: [{ kind: "cost", categoryCode: "01", itemCode: "ORIGINAL-1", module: "Hardware", quantity: 2, unitCost: 50, description: "TEST ONLY sensor", unit: "Pcs", source: "Sheet1!A1" }] };
  const original = Buffer.from("PK\x03\x04 TEST ONLY exact original bytes");
  const boundary = `----original-${randomUUID()}`;
  const multipart = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(body)}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="original.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`), original, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const request = { method: "POST" as const, url: `/api/v1/estimates/${row.id}/excel-import`, headers: { "x-dev-user-id": "original-admin", "content-type": `multipart/form-data; boundary=${boundary}` }, payload: multipart };
  const imported = await app.inject(request); assert.equal(imported.statusCode, 201, imported.body);
  const receipt = imported.json(); assert.equal(receipt.originalAvailable, true); assert.equal(receipt.originalSha256, createHash("sha256").update(original).digest("hex")); assert.equal(receipt.sourceFile, undefined);
  const again = await app.inject(request); assert.equal(again.statusCode, 200, again.body); assert.equal(again.json().alreadyImported, true); assert.equal(files(storageRoot).length, 1);
  const url = `/api/v1/estimates/${row.id}/excel-imports/${receipt.revision}/${receipt.sourceHash}/content`;
  const download = await app.inject({ url, headers: { "x-dev-user-id": "original-admin" } }); assert.equal(download.statusCode, 200, download.body); assert.deepEqual(download.rawPayload, original);
  const missing = await app.inject({ url: url.replace(receipt.sourceHash, "a".repeat(64)), headers: { "x-dev-user-id": "original-admin" } }); assert.equal(missing.statusCode, 404);
  const wrongEstimate = await app.inject({ url: url.replace(`/estimates/${row.id}/`, `/estimates/${row.id + 1}/`), headers: { "x-dev-user-id": "original-admin" } }); assert.equal(wrongEstimate.statusCode, 404);
  const list = await app.inject({ url: `/api/v1/estimates/${row.id}/excel-imports`, headers: { "x-dev-user-id": "original-admin" } }); assert.equal(list.statusCode, 200); assert.equal(list.json()[0].originalAvailable, true); assert.equal(list.body.includes("storageKey"), false);
  const changed = multipart.toString("binary").replace("TEST ONLY sensor", "TEST ONLY changed");
  const stale = await app.inject({ ...request, payload: Buffer.from(changed, "binary") }); assert.equal(stale.statusCode, 409, stale.body); assert.equal(files(storageRoot).length, 1, "failed import must clean staged original");
  const headers = { "x-dev-user-id": "original-admin" };
  const template = { code: "ORIGINAL-TPL", name: "TEST ONLY stable template", categoryCode: "01", status: "Draft", lines: [{ categoryCode: "01", itemCode: "TPL-1", description: "TEST ONLY item", quantityPerModule: 1, unit: "Pcs", referenceUnitCost: 10 }] };
  const draft = await app.inject({ method: "POST", url: "/api/v1/module-templates", headers, payload: template }); assert.equal(draft.statusCode, 201, draft.body);
  const templateId = draft.json().id;
  const editable = (await database.query<{ owner_id: number; row_version: Buffer }>(`SELECT owner_id,row_version FROM dbo.estimates WHERE id=${row.id}`)).recordset[0]!;
  const applyRequest = { method: "POST" as const, url: `/api/v1/estimates/${row.id}/apply-template`, headers, payload: { templateId, estimateRowVersion: editable.row_version.toString("base64"), module: "TEST ONLY module", modules: 1, ownerId: Number(editable.owner_id) } };
  const applyDraft = await app.inject(applyRequest); assert.equal(applyDraft.statusCode, 409, applyDraft.body); assert.equal(applyDraft.json().code, "module_template_not_published");
  const detail = (await app.inject({ url: `/api/v1/module-templates/${templateId}`, headers })).json();
  const publish = await app.inject({ method: "PUT", url: `/api/v1/module-templates/${templateId}`, headers, payload: { ...template, status: "Active", rowVersion: detail.rowVersion } }); assert.equal(publish.statusCode, 200, publish.body);
  const applyPublished = await app.inject(applyRequest); assert.equal(applyPublished.statusCode, 201, applyPublished.body);
  const overwrite = await app.inject({ method: "PUT", url: `/api/v1/module-templates/${templateId}`, headers, payload: { ...template, status: "Active", rowVersion: publish.json().rowVersion } }); assert.equal(overwrite.statusCode, 409, overwrite.body); assert.equal(overwrite.json().code, "published_template_locked");
  console.log("Original Excel SQL integration passed: byte hash, download, duplicate import, revision/estimate isolation, private storage key.");
} finally {
  if (application) { await application.app.close(); await application.database.close(); }
  assert.match(name, /^IoTTeamCenter_OriginalCI_[a-f0-9]{32}$/);
  execFileSync("sqlcmd", [...args, "-d", "master", "-Q", `IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`], { stdio: "pipe" });
  const expected = resolve("tmp", name); assert.equal(storageRoot, expected); rmSync(storageRoot, { recursive: true, force: true });
}
