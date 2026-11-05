// Explicit SQL integration entry point (not part of the fast unit-test glob): customers and suppliers from the Pegasus ERP
// (migration 099). The ERP is a fake gateway; everything else is the real schema, the application role and the routes.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createErpMasterSync } from "../src/erp-master-sync.js";
import type { ErpGateway } from "../src/erp-purchasing.js";
import type { CurrentUser } from "../src/types.js";
import { createSqlIntegrationConfig } from "./sql-integration-config.js";

const sqlTest = createSqlIntegrationConfig("ErpMaster");
const name = sqlTest.databaseName;
const sqlArgs = sqlTest.sqlcmdArgs;
const run = (statement: string) => execFileSync("sqlcmd", [...sqlArgs, "-d", name, "-Q", statement], { ...sqlTest.sqlcmdOptions, encoding: "utf8" });
let application: Awaited<ReturnType<typeof buildApp>> | undefined;

type Call = { tool: string; args: Record<string, unknown> };
/** A Pegasus ERP that answers each tool with the next prepared page. */
function fakeErp(pages: Record<string, unknown[]>, calls: Call[]): ErpGateway {
  return { call: async <T>(_subject: string, tool: string, args: Record<string, unknown>) => {
    calls.push({ tool, args });
    const next = pages[tool]?.shift();
    if (next === undefined) throw new Error(`unexpected ${tool} call ${JSON.stringify(args)}`);
    return { ok: true as const, data: next as T };
  } };
}

try {
  execFileSync("sqlcmd", [...sqlArgs, "-i", sqlTest.freshDatabaseScript, "-v", `DatabaseName=${name}`], sqlTest.sqlcmdOptions);
  run(`DECLARE @adminRole bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin');
    INSERT dbo.users(entra_object_id,email,name,role_id,department) VALUES (N'erp-admin',N'admin@erp-master.test',N'ERP Master Admin',@adminRole,N'IoT');
    DECLARE @admin bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'erp-admin');
    INSERT dbo.customers(code,name,name_en,created_by,updated_by) VALUES
      (N'DJT',N'Daiichi Jitsugyo (Thailand)',N'Daiichi Jitsugyo (Thailand)',@admin,@admin),
      (N'YAMAHA',N'Thai Yamaha',N'Thai Yamaha',@admin,@admin),
      (N'TWIN-1',N'Twin Industries',N'Twin Industries',@admin,@admin),
      (N'TWIN-2',N'TWIN INDUSTRIES CO., LTD.',N'TWIN INDUSTRIES CO., LTD.',@admin,@admin),
      (N'APP-ONLY',N'Prospect Only',N'Prospect Only',@admin,@admin);
    INSERT dbo.suppliers(code,name,tax_id,created_by,updated_by) VALUES
      (N'OE',N'Omron Electronics',N'0105536000000',@admin,@admin),
      (N'MS',N'Misumi',N'',@admin,@admin);`);
  const rolePassword = randomUUID().replaceAll("-", "") + "Aa1!";
  run(`CREATE APPLICATION ROLE erp_master_ci_role WITH PASSWORD='${rolePassword}';`);
  execFileSync("sqlcmd", [...sqlArgs, "-d", name, "-i", sqlTest.applicationLoginScript, "-v", `DatabaseName=${name}`, "AppLogin=erp_master_ci_role"], sqlTest.sqlcmdOptions);
  const config: AppConfig = { environment: "development", host: "127.0.0.1", port: 0, allowedHosts: ["localhost"], corsOrigins: ["http://localhost:3000"],
    businessTimeZone: "Asia/Bangkok", auth: { mode: "Development" }, database: { connectionString: sqlTest.connectionString, trustServerCertificate: true,
      applicationRoleName: "erp_master_ci_role", applicationRolePassword: rolePassword },
    documentStorage: { mode: "Local", rootPath: sqlTest.storageRoot, maxFileSizeBytes: 10_000_000 }, email: { mode: "Disabled" }, pdfParserUrl: "http://pdf-parser:8000" };
  application = await buildApp(config);
  const { app, database } = application;
  const adminId = Number((await database.query<{ id: number }>("SELECT id FROM dbo.users WHERE entra_object_id=N'erp-admin'")).recordset[0]!.id);
  const actor: CurrentUser = { id: adminId, entraObjectId: "erp-admin", email: "admin@erp-master.test", name: "ERP Master Admin", role: "Admin", roles: ["Admin"], department: "IoT", isActive: true };
  const customer = async (code: string) => (await database.query<Record<string, unknown>>(`SELECT * FROM dbo.customers WHERE code=@code`, (q) => q.input("code", code))).recordset[0]!;
  const api = async (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, expected = 200) => {
    const response = await app.inject({ method, url, headers: { "x-dev-user-id": "erp-admin" }, ...(payload ? { payload } : {}) });
    assert.equal(response.statusCode, expected, response.body);
    return response.json();
  };

  // The server here has no ERP link: the screens are told so and nothing is read.
  assert.equal((await api("POST", "/api/v1/erp/master-data/customers/sync", {})).state, "off");
  const overview = await api("GET", "/api/v1/erp/master-data");
  assert.equal(overview.canSettle, true); assert.deepEqual(overview.registers.map((item: { kind: string }) => item.kind), ["customers", "suppliers"]);

  // First round: the whole register in two pages.
  const calls: Call[] = [];
  const pages: Record<string, unknown[]> = { customers_list: [
    { customers: [
      { customer_code: "C-0001", name_en: "DAIICHI JITSUGYO (THAILAND) CO., LTD.", name_th: "บริษัท ไดอิจิ จิตสึเกียว (ประเทศไทย) จำกัด", tax_id: "0105540000001",
        address: "1 Rama 4 Road", province: "Bangkok", postal_code: "10110", is_active: true, merged_into: null, updated_at: "2026-11-01T00:00:00Z" },
      { customer_code: "C-0002", name_en: "Thai Yamaha Motor Co., Ltd.", is_active: true },
      { customer_code: "C-0003", name_en: "Twin Industries Co., Ltd.", is_active: true },
    ], next_cursor: "p2", server_time: "2026-11-05T05:00:00Z" },
    { customers: [
      { customer_code: "C-0004", name_th: "บริษัท สยามเทค จำกัด", is_active: true },
      { customer_code: "C-0005", name_en: "Closed Long Ago Ltd.", is_active: false },
      { customer_code: "C-0006", name_en: "New Customer Ltd.", website: "newcustomer.co.th", is_active: true },
      { name_en: "No key, skipped" },
    ], next_cursor: null, server_time: "2026-11-05T05:00:03Z" },
  ] };
  let master = createErpMasterSync(database, fakeErp(pages, calls));
  const first = await master.sync("customers", actor, false);
  assert.equal(first.state, "synced", JSON.stringify(first));
  assert.deepEqual(first.counts, { read: 6, created: 2, linked: 1, updated: 0, review: 2, closed: 0 });
  assert.deepEqual(calls.map((call) => call.args), [{ limit: 200 }, { limit: 200, cursor: "p2" }]);
  const linked = await customer("DJT");
  assert.equal(linked.erp_customer_code, "C-0001"); assert.equal(linked.name, "DAIICHI JITSUGYO (THAILAND) CO., LTD.");
  assert.equal(linked.site, "1 Rama 4 Road Bangkok 10110");
  const thai = await customer("C-0004");
  assert.equal(thai.name, "บริษัท สยามเทค จำกัด"); assert.equal(thai.erp_customer_code, "C-0004"); assert.equal(thai.country, "Thailand");
  assert.equal((await customer("C-0006")).website, "https://newcustomer.co.th");
  assert.equal((await database.query("SELECT 1 FROM dbo.customers WHERE erp_customer_code=N'C-0005'")).recordset.length, 0, "a closed ERP customer is not added");
  const state = (await database.query<{ updated_since: string; page_cursor: string | null }>("SELECT updated_since,page_cursor FROM dbo.erp_master_sync WHERE kind=N'customers'")).recordset[0]!;
  assert.deepEqual({ ...state }, { updated_since: "2026-11-05T05:00:00Z", page_cursor: null });

  // Within 15 minutes nobody reads the ERP again, unless an Admin asks.
  assert.equal((await master.sync("customers", actor, false)).state, "fresh");
  assert.equal(calls.length, 2);

  // Changes since the last round: a rename, a merge into a record the app does not have yet, and a merge into a linked one.
  pages.customers_list!.push({ customers: [
    { customer_code: "C-0001", name_en: "DAIICHI JITSUGYO THAILAND CO., LTD.", tax_id: "0105540000001", address: "1 Rama 4 Road", province: "Bangkok", postal_code: "10110", is_active: true },
    { customer_code: "C-0004", name_th: "บริษัท สยามเทค จำกัด", is_active: false, merged_into: "C-0099" },
    { customer_code: "C-0006", name_en: "New Customer Ltd.", is_active: false, merged_into: "C-0001" },
  ], next_cursor: null, server_time: "2026-11-05T06:00:00Z" });
  const second = await master.sync("customers", actor, true);
  assert.equal(second.state, "synced", JSON.stringify(second));
  assert.deepEqual(calls.at(-1)!.args, { limit: 200, updated_since: "2026-11-05T05:00:00Z", include_inactive: true });
  assert.equal((await customer("DJT")).name_en, "DAIICHI JITSUGYO THAILAND CO., LTD.");
  const moved = await customer("C-0004");
  assert.equal(moved.erp_customer_code, "C-0099", "the app record follows the merge"); assert.equal(moved.is_active, true);
  assert.equal((await customer("C-0006")).is_active, false, "merged into a customer the app already has: closed, not deleted");
  // The surviving record arrives later and takes over the moved app record.
  pages.customers_list!.push({ customers: [{ customer_code: "C-0099", name_en: "Siam Tech Group Co., Ltd.", is_active: true }], next_cursor: null, server_time: "2026-11-05T07:00:00Z" });
  await master.sync("customers", actor, true);
  assert.equal((await customer("C-0004")).name, "Siam Tech Group Co., Ltd.");

  // An Admin settles what resembled more than one record, or one only doubtfully.
  const review = await master.reviewList("customers");
  assert.deepEqual(review.items.map((item) => item.key).sort(), ["C-0002", "C-0003"]);
  const yamaha = await customer("YAMAHA");
  assert.deepEqual(review.items.find((item) => item.key === "C-0002")!.candidateIds, [Number(yamaha.id)]);
  assert.equal(review.items.find((item) => item.key === "C-0003")!.candidateIds.length, 2);
  await api("POST", "/api/v1/erp/master-data/customers/review/C-0002", { action: "link", id: Number(yamaha.id) });
  assert.equal((await customer("YAMAHA")).erp_customer_code, "C-0002"); assert.equal((await customer("YAMAHA")).name, "Thai Yamaha Motor Co., Ltd.");
  const added = await api("POST", "/api/v1/erp/master-data/customers/review/C-0003", { action: "create" });
  assert.equal(added.code, "C-0003");
  await api("POST", "/api/v1/erp/master-data/customers/review/C-0003", { action: "create" }, 409);
  assert.equal((await api("GET", "/api/v1/erp/master-data")).registers[0].review, 0);

  // A linked customer keeps the ERP's name, address and state; it is closed in the ERP, not deleted here.
  const djt = await customer("DJT");
  const saved = await api("PUT", `/api/v1/crm/customers/${djt.id}`, { rowVersion: (djt.row_version as Buffer).toString("base64"), nameEn: "Renamed here", nameJa: "第一実業",
    site: "Somewhere else", isActive: false, country: "Thailand" });
  assert.equal(saved.name, "DAIICHI JITSUGYO THAILAND CO., LTD."); assert.equal(saved.nameJa, "第一実業"); assert.equal(saved.site, "1 Rama 4 Road Bangkok 10110"); assert.equal(saved.isActive, true);
  const after = await customer("DJT");
  const removed = await app.inject({ method: "DELETE", url: `/api/v1/crm/customers/${after.id}?rowVersion=${encodeURIComponent((after.row_version as Buffer).toString("base64"))}`, headers: { "x-dev-user-id": "erp-admin" } });
  assert.equal(removed.statusCode, 409, removed.body); assert.equal(removed.json().code, "customer_in_erp");
  const appOnly = await customer("APP-ONLY");
  assert.equal(appOnly.erp_customer_code, null, "a prospect the ERP does not have stays in the app");

  // Suppliers: a tax ID links whatever the spelling; ERP ids are numbers; there is no server_time.
  const supplierCalls: Call[] = [];
  master = createErpMasterSync(database, fakeErp({ suppliers_list: [{ suppliers: [
    { supplier_id: 41, supplier_code: "SUP-041", name_en: "OMRON ELECTRONICS CO., LTD.", tax_id: "0-1055-36000-00-0", phone: "02-000-0000", approval_status: "APPROVED" },
    { supplier_id: 42, name_en: "MISUMI (THAILAND) CO., LTD." },
    { supplier_id: 43, supplier_code: "SUP-043", supplier_name: "Keyence (Thailand) Co., Ltd.", contact_name: "Sales desk" },
  ], next_cursor: null }] }, supplierCalls));
  const suppliers = await master.sync("suppliers", actor, false);
  assert.deepEqual(suppliers.counts, { read: 3, created: 1, linked: 1, updated: 0, review: 1, closed: 0 });
  const omron = (await database.query<Record<string, unknown>>("SELECT * FROM dbo.suppliers WHERE code=N'OE'")).recordset[0]!;
  assert.equal(omron.erp_supplier_id, "41"); assert.equal(omron.name, "OMRON ELECTRONICS CO., LTD."); assert.equal(omron.phone, "02-000-0000");
  const keyence = (await database.query<Record<string, unknown>>("SELECT * FROM dbo.suppliers WHERE erp_supplier_id=N'43'")).recordset[0]!;
  assert.equal(keyence.code, "SUP-043"); assert.equal(keyence.name, "Keyence (Thailand) Co., Ltd."); assert.equal(keyence.contact, "Sales desk");
  assert.equal((await database.query<{ updated_since: string | null }>("SELECT updated_since FROM dbo.erp_master_sync WHERE kind=N'suppliers'")).recordset[0]!.updated_since, null);
  // A supplier from the ERP keeps its name and cannot be deleted here.
  await api("PUT", `/api/v1/master/suppliers/${omron.id}`, { name: "Renamed here", category: "Automation" });
  assert.equal((await database.query<{ name: string }>(`SELECT name FROM dbo.suppliers WHERE id=${Number(omron.id)}`)).recordset[0]!.name, "OMRON ELECTRONICS CO., LTD.");
  await api("DELETE", `/api/v1/master/suppliers/${omron.id}`, undefined, 409);

  // A failed call is kept for the screens and asked again only after a pause.
  master = createErpMasterSync(database, { call: async () => ({ ok: false as const, kind: "denied" as const, message: "No purchasing access." }) });
  const denied = await master.sync("suppliers", actor, true);
  assert.equal(denied.state, "failed"); assert.match(denied.message!, /No purchasing access/);
  assert.equal((await master.status()).find((item) => item.kind === "suppliers")!.error, "No purchasing access.");
  console.log("ERP MASTER DATA INTEGRATION PASSED: paged first read, 15-minute window, rename/merge/close, Admin link and add, CRM and supplier guards, tax ID match, failure kept.");
} finally {
  if (application) { await application.app.close(); await application.database.close(); }
  execFileSync("sqlcmd", [...sqlArgs, "-d", "master", "-Q", `IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END;`], sqlTest.sqlcmdOptions);
  rmSync(sqlTest.storageRoot, { recursive: true, force: true });
}
