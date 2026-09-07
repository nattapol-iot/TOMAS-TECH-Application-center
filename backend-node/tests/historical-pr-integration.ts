import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import Fastify from "fastify";
import { Database } from "../src/db.js";
import { CurrentUserService } from "../src/users.js";
import { registerAuthentication } from "../src/auth.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerHistoricalPrRoutes } from "../src/routes/historical-pr.js";
import type { AppConfig } from "../src/config.js";
import { historicalFixture } from "./historical-pr.test.js";

const name = `IoTTeamCenter_HistoricalPrCI_${randomUUID().replaceAll("-", "")}`;
assert.match(name, /^IoTTeamCenter_HistoricalPrCI_[a-f0-9]{32}$/);
const args = ["-S", "localhost", "-E", "-C", "-I", "-b"];
const run = (query: string, db = name) => execFileSync("sqlcmd", [...args, "-d", db, "-Q", query], { stdio: "pipe" });
let database: Database | undefined;
const app = Fastify({ bodyLimit: 12 * 1024 * 1024 });
let checks = 0;
try {
  run(`CREATE DATABASE [${name}]`, "master");
  run(`CREATE TABLE dbo.schema_versions(version int PRIMARY KEY,name nvarchar(200));
    CREATE TABLE dbo.roles(id bigint PRIMARY KEY,code nvarchar(50));
    INSERT dbo.roles VALUES(1,N'Admin'),(2,N'Engineer'),(3,N'Viewer');
    CREATE TABLE dbo.users(id bigint PRIMARY KEY,entra_object_id nvarchar(64),email nvarchar(256),name nvarchar(200),role_id bigint,department nvarchar(100),is_active bit,deleted_at datetimeoffset);
    INSERT dbo.users VALUES(1,N'admin',N'admin@test.invalid',N'TEST Admin',1,N'',1,NULL),(2,N'outsider',N'outsider@test.invalid',N'TEST Outsider',2,N'',1,NULL),(3,N'viewer',N'viewer@test.invalid',N'TEST Viewer',3,N'',1,NULL);
    CREATE TABLE dbo.permissions(id bigint PRIMARY KEY,code nvarchar(100)); INSERT dbo.permissions VALUES(1,N'procurement.read'),(2,N'procurement.request');
    CREATE TABLE dbo.role_permissions(role_id bigint,permission_id bigint); INSERT dbo.role_permissions VALUES(1,1),(1,2),(2,1),(2,2),(3,1);
    CREATE TABLE dbo.user_signing_permissions(user_id bigint,code nvarchar(100));
    CREATE TABLE dbo.projects(id bigint PRIMARY KEY,project_no nvarchar(100),name nvarchar(300),manager_id bigint,lead_engineer_id bigint,estimate_id bigint,deleted_at datetimeoffset);
    INSERT dbo.projects VALUES(1,N'TEST-PR',N'TEST Closed Project',1,1,1,NULL),(2,N'OTHER',N'TEST Other Project',2,2,2,NULL);
    CREATE TABLE dbo.project_members(project_id bigint,user_id bigint);
    CREATE TABLE dbo.estimates(id bigint PRIMARY KEY,estimate_no nvarchar(100),revision int,deleted_at datetimeoffset);
    INSERT dbo.estimates VALUES(1,N'TEST-EST',1,NULL),(2,N'OTHER-EST',1,NULL);
    CREATE TABLE dbo.cost_items(id bigint PRIMARY KEY,estimate_id bigint,revision int,module nvarchar(200),item_code nvarchar(100),description nvarchar(500),qty decimal(19,4),unit_cost decimal(19,4),unit nvarchar(50),deleted_at datetimeoffset);
    INSERT dbo.cost_items VALUES(1,1,1,N'Test module',N'PART-10',N'Test item',1,210,N'Pcs.',NULL),(2,2,1,N'Other module',N'OTHER',N'Other item',1,300,N'Pcs.',NULL);
    CREATE TABLE dbo.audit_log(id bigint IDENTITY PRIMARY KEY,actor_id bigint,entity_type nvarchar(50),entity_id bigint,entity_no nvarchar(50),action nvarchar(100),before_json nvarchar(max),after_json nvarchar(max));
    CREATE ROLE iot_team_app_role;`);
  execFileSync("sqlcmd", [...args, "-d", name, "-i", resolve("database/migrations/033_historical_pr_import.sql")], { stdio: "pipe" });
  const password = randomUUID().replaceAll("-", "");
  run(`CREATE APPLICATION ROLE hpr_ci_app WITH PASSWORD='${password}'; ALTER ROLE iot_team_app_role ADD MEMBER hpr_ci_app;
    GRANT SELECT ON dbo.schema_versions TO hpr_ci_app; GRANT SELECT ON dbo.roles TO hpr_ci_app; GRANT SELECT ON dbo.users TO hpr_ci_app;
    GRANT SELECT ON dbo.permissions TO hpr_ci_app; GRANT SELECT ON dbo.role_permissions TO hpr_ci_app; GRANT SELECT ON dbo.user_signing_permissions TO hpr_ci_app;
    GRANT SELECT ON dbo.projects TO hpr_ci_app; GRANT SELECT ON dbo.project_members TO hpr_ci_app; GRANT SELECT ON dbo.estimates TO hpr_ci_app;
    GRANT SELECT ON dbo.cost_items TO hpr_ci_app; GRANT SELECT,INSERT ON dbo.audit_log TO hpr_ci_app;`);
  const config: AppConfig = { environment: "development", host: "127.0.0.1", port: 0, allowedHosts: ["localhost"], corsOrigins: [], businessTimeZone: "Asia/Bangkok", auth: { mode: "Development" },
    database: { connectionString: `Server=localhost;Database=${name};Integrated Security=true`, trustServerCertificate: true, applicationRoleName: "hpr_ci_app", applicationRolePassword: password },
    documentStorage: { mode: "Local", rootPath: resolve("tmp"), maxFileSizeBytes: 8000000 }, email: { mode: "Disabled" } };
  database = new Database(config.database); registerAuthentication(app, config); registerErrorHandler(app); registerHistoricalPrRoutes(app, database, new CurrentUserService(database));
  async function api(method: "POST" | "GET" | "PUT", url: string, payload?: object, expected = 200, actor = "admin") {
    const r = await app.inject({ method, url, headers: { "x-dev-user-id": actor }, ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, expected, `${method} ${url} ${r.body}`); checks++; return r.json();
  }
  const bytes = historicalFixture(); const payload = { sourceName: "TEST-PR.xlsx", fileBase64: bytes.toString("base64"), documentReference: "TEST-REF", expectedCurrentId: null };
  const preview = await api("POST", "/api/v1/historical-pr/preview", payload);
  assert.equal(preview.workbook.lines.length, 3); assert.equal(preview.existingId, null);
  assert.equal((await api("GET", "/api/v1/historical-pr")).length, 0);
  await api("POST", "/api/v1/historical-pr/preview", payload, 403, "outsider");
  await api("POST", "/api/v1/historical-pr", payload, 403, "viewer");
  const created = await api("POST", "/api/v1/historical-pr", payload, 201);
  const duplicate = await api("POST", "/api/v1/historical-pr", { ...payload, sourceName: "renamed.xlsx" }); assert.equal(duplicate.id, created.id); assert.equal(duplicate.alreadyImported, true);
  const detail = await api("GET", `/api/v1/historical-pr/${created.id}`); assert.equal(detail.workbook.lines[0].status, "Cancelled");
  await api("GET", `/api/v1/historical-pr/${created.id}`, undefined, 403, "outsider");
  const source = await app.inject({ method: "GET", url: `/api/v1/historical-pr/${created.id}/source`, headers: { "x-dev-user-id": "admin" } }); assert.equal(source.statusCode, 200); assert.deepEqual(source.rawPayload, bytes); checks++;
  const link = { rowVersion: detail.rowVersion, links: { "001_PR!9": { estimateLineId: 1, replacementKey: "001_PR!10" } } };
  await api("PUT", `/api/v1/historical-pr/${created.id}/links`, { ...link, links: { "001_PR!9": { estimateLineId: 2 } } }, 400);
  await api("PUT", `/api/v1/historical-pr/${created.id}/links`, { ...link, links: { "001_PR!9": { replacementKey: "001_PR!9" } } }, 400);
  await api("PUT", `/api/v1/historical-pr/${created.id}/links`, link);
  await api("PUT", `/api/v1/historical-pr/${created.id}/links`, link, 409);
  const newer = { ...payload, fileBase64: historicalFixture("Cancelled", "TEST-PR", 5000).toString("base64") };
  await api("POST", "/api/v1/historical-pr", newer, 409);
  const updated = await api("POST", "/api/v1/historical-pr", { ...newer, expectedCurrentId: created.id }, 201);
  const old = await api("GET", `/api/v1/historical-pr/${created.id}`); assert.equal(old.isCurrent, false); assert.equal(old.links["001_PR!9"].replacementKey, "001_PR!10");
  const latest = await api("GET", `/api/v1/historical-pr/${updated.id}`); assert.equal(latest.versions.length, 2); assert.deepEqual(latest.links, {});
  assert.equal((await api("GET", "/api/v1/historical-pr")).length, 1);
  await api("PUT", `/api/v1/historical-pr/${created.id}/links`, { ...link, rowVersion: old.rowVersion }, 409);
  const missingPayload = { ...payload, documentReference: "UNLINKED", fileBase64: historicalFixture("Cancelled", "MISSING-PR").toString("base64") };
  const unlinked = await api("POST", "/api/v1/historical-pr", missingPayload, 201);
  const unlinkedDetail = await api("GET", `/api/v1/historical-pr/${unlinked.id}`); assert.equal(unlinkedDetail.projectId, null);
  await api("POST", `/api/v1/historical-pr/${unlinked.id}/link-project`, { rowVersion: unlinkedDetail.rowVersion }, 409);
  run("INSERT dbo.projects VALUES(3,N'MISSING-PR',N'TEST Late Project',1,1,1,NULL);");
  await api("POST", `/api/v1/historical-pr/${unlinked.id}/link-project`, { rowVersion: unlinkedDetail.rowVersion });
  assert.equal((await api("GET", `/api/v1/historical-pr/${unlinked.id}`)).projectId, 3);
  assert.equal((await api("GET", "/api/v1/historical-pr", undefined, 200, "outsider")).length, 0);
  // The later project's membership does not grant access to an earlier, unlinked archive.
  const restrictedPayload = { ...payload, documentReference: "PRIVATE-ARCHIVE", fileBase64: historicalFixture("Cancelled", "LATER-PR").toString("base64") };
  const restricted = await api("POST", "/api/v1/historical-pr", restrictedPayload, 201);
  run("INSERT dbo.projects VALUES(4,N'LATER-PR',N'TEST Later Membership',2,2,1,NULL);");
  await api("POST", "/api/v1/historical-pr/preview", restrictedPayload, 403, "outsider");
  await api("POST", "/api/v1/historical-pr", restrictedPayload, 403, "outsider");
  await api("GET", `/api/v1/historical-pr/${restricted.id}`, undefined, 403, "outsider");
  const nextRestricted = await api("POST", "/api/v1/historical-pr", { ...restrictedPayload, expectedCurrentId: restricted.id, fileBase64: historicalFixture("Cancelled", "LATER-PR", 5010).toString("base64") }, 201);
  const memberDetail = await api("GET", `/api/v1/historical-pr/${nextRestricted.id}`, undefined, 200, "outsider");
  assert.deepEqual(memberDetail.versions.map((v: { id: number }) => v.id), [nextRestricted.id]); checks++;
  // Estimate revision changes invalidate mappings; a stale line cannot be silently saved.
  run("UPDATE dbo.estimates SET revision=2 WHERE id=1; INSERT dbo.cost_items VALUES(3,1,2,N'New module',N'PART-10',N'Revised item',1,220,N'Pcs.',NULL);");
  const changedEstimate = await api("GET", `/api/v1/historical-pr/${updated.id}`);
  assert.equal(changedEstimate.estimateLines[0].id, 3);
  await api("PUT", `/api/v1/historical-pr/${updated.id}/links`, { rowVersion: changedEstimate.rowVersion, links: { "001_PR!10": { estimateLineId: 1 } } }, 400);
  await api("PUT", `/api/v1/historical-pr/${updated.id}/links`, { rowVersion: changedEstimate.rowVersion, links: { "001_PR!10": { estimateLineId: 3 } } });
  await assert.rejects(database.query("UPDATE dbo.historical_pr_imports SET payload=N'{}';")); checks++;
  console.log(`Historical PR SQL/API integration passed: ${checks} checks (preview, import, duplicate, scope, links, stale writes, versions, original file and delayed Project link).`);
} finally {
  await app.close(); await database?.close();
  // Only the uniquely named disposable database created by this test is removed.
  assert.match(name, /^IoTTeamCenter_HistoricalPrCI_[a-f0-9]{32}$/);
  run(`IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`, "master");
}
