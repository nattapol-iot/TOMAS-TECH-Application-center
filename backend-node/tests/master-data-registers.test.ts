import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "../src/db.js";
import { readMasterPage, type MasterKind } from "../src/erp-master-data.js";
import type { ErpMasterSync } from "../src/erp-master-sync.js";
import type { MasterDataClient } from "../src/master-data/client.js";
import { createProjectSearch, projectHits } from "../src/master-data/project-search.js";
import { REGISTER_SYNC_FIRST_RUN_MS } from "../src/master-data/constants.js";
import { createRegisterSchedule } from "../src/master-data/register-sync.js";
import { createMasterRegisterGateway, registerRowOf } from "../src/master-data/registers.js";

const customer = (fields: Record<string, unknown>) => ({
  id: 101, customer_code: "CUS-0101", customer_name: "ABC Co., Ltd.", customer_name_th: null, tax_id: "0105540000001",
  address: "1 Road", country: "TH", phone: "02-000-0000", email: "info@abc.test", contact_person: "Khun A", deleted_at: null,
  updated_at: "2026-11-20T00:00:00Z", ...fields,
});

test("a master customer reads through the ERP register parser with the same key, code and names", () => {
  const page = readMasterPage("customers", { customers: [
    registerRowOf("customers", customer({})),
    registerRowOf("customers", customer({ id: 102, customer_code: "CUS-0102", customer_name: "บริษัท สยาม จำกัด", deleted_at: "2026-11-01T00:00:00Z" })),
    registerRowOf("customers", customer({ id: 103, customer_name: "Thai Yamaha", customer_name_th: "ไทยยามาฮ่า" })),
  ], next_cursor: null, server_time: null });
  assert.deepEqual(page.records.map((record) => [record.key, record.code, record.nameEn, record.nameTh, record.isActive, record.contactName]), [
    ["101", "CUS-0101", "ABC Co., Ltd.", "", true, "Khun A"],
    ["102", "CUS-0102", "", "บริษัท สยาม จำกัด", false, "Khun A"],
    ["103", "CUS-0101", "Thai Yamaha", "ไทยยามาฮ่า", true, "Khun A"],
  ]);
  assert.equal(page.nextCursor, null);
});

test("a master supplier keeps its supplier id and code", () => {
  const row = registerRowOf("suppliers", { id: 41, supplier_code: "SUP-0041", supplier_name: "Omron Electronics", deleted_at: null });
  const [record] = readMasterPage("suppliers", { suppliers: [row] }).records;
  assert.deepEqual([record!.key, record!.code, record!.nameEn, record!.isActive], ["41", "SUP-0041", "Omron Electronics", true]);
});

test("the register gateway reads every page of master's list, deleted rows included, and reports an outage", async () => {
  const asked: string[] = [];
  let down = false;
  const client: MasterDataClient = {
    get: async () => ({}),
    async listAll(path) { asked.push(path); if (down) throw new Error("down"); return [customer({}), "junk"]; },
  };
  const gateway = createMasterRegisterGateway(client);
  const answer = await gateway.call<{ customers: unknown[] }>("anyone", "customers_list", {});
  assert.equal(answer.ok, true);
  assert.equal(answer.ok && answer.data.customers.length, 1);
  assert.deepEqual(asked, ["/api/v1/customers?presence=all"]);
  assert.equal((await gateway.call("anyone", "projects_list", {})).ok, false);
  down = true;
  const failed = await gateway.call("anyone", "suppliers_list", {});
  assert.equal(failed.ok, false);
  assert.equal(!failed.ok && failed.kind, "unavailable");
});

test("project hits come from master's live projects, each number once, cancelled and deleted ones left out", async () => {
  const page = { total: 4, items: [
    { pj_no: "PJ260172", pj_name: "Line 3  retrofit", customer_name: "ABC Co., Ltd.", status: "IN_PROGRESS" },
    { pj_no: "PJ260172", pj_name: "duplicate", customer_name: "", status: "ACTIVE" },
    { pj_no: "PJ260100", pj_name: "Cancelled", customer_name: "X", status: "CANCELLED" },
    { pj_no: "PJ260099", pj_name: "Deleted", customer_name: "X", status: "ACTIVE", erp_is_deleted: true },
    { pj_name: "no number" },
  ] };
  assert.deepEqual(projectHits(page), [{ number: "PJ260172", name: "Line 3 retrofit", customerName: "ABC Co., Ltd." }]);
  assert.deepEqual(projectHits({ detail: "nope" }), []);

  const asked: string[] = [];
  const search = createProjectSearch({ get: async (path) => { asked.push(path); return page; }, listAll: async () => [] });
  await search.search("PJ26");
  await search.search("");
  assert.equal(asked[0], "/api/v1/projects?limit=30&sort=updated_at&direction=desc&search=PJ26");
  assert.equal(asked[1], "/api/v1/projects?limit=30&sort=updated_at&direction=desc");
});

test("the hourly register round syncs both registers as the master data sync account", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const rounds: { kind: string; actor: unknown; force: boolean }[] = [];
  const registers = {
    sync: async (kind: MasterKind, actor: unknown, force: boolean) => { rounds.push({ kind, actor, force }); return { kind, state: "synced" as const, changed: false }; },
  } as unknown as ErpMasterSync;
  const database = { query: async () => ({ recordset: [{ id: "77" }] }) } as unknown as Database;
  const schedule = createRegisterSchedule(registers, database, (error) => { throw error; });
  schedule.start();
  context.mock.timers.tick(REGISTER_SYNC_FIRST_RUN_MS);
  context.mock.timers.reset();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  schedule.stop();
  assert.deepEqual(rounds, [
    { kind: "customers", actor: { id: 77, entraObjectId: "" }, force: false },
    { kind: "suppliers", actor: { id: 77, entraObjectId: "" }, force: false },
  ]);
});