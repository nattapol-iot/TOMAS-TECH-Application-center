import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { FastifyRequest } from "fastify";
import type { Database } from "../src/db.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import type { CurrentUserService } from "../src/users.js";
import { customerCodeFromName, demandSalesCustomerPermission, registerSalesCustomerRoutes, salesContactInput, salesCustomerInput } from "../src/routes/sales-customers.js";
import { customerInput } from "../src/routes/master.js";

const ROW_VERSION = Buffer.alloc(8).toString("base64");

test("company contact roles preserve Thai, English and Japanese and require an identified person", () => {
  for (const parse of [salesCustomerInput, customerInput]) {
    const input = parse({ code: "ROLE-TEST", nameTh: "บริษัท ทดสอบ", nameEn: "Test Co., Ltd.", nameJa: "テスト株式会社", contactNameTh: "สมชาย ใจดี", contactNameEn: "Somchai Jaidee", contactNameJa: "ソムチャイ", department: "  技術部  ", position: " Sales Engineer " });
    assert.equal(input.name, "Test Co., Ltd."); assert.equal(input.nameTh, "บริษัท ทดสอบ"); assert.equal(input.nameJa, "テスト株式会社");
    assert.equal(input.contact, "Somchai Jaidee"); assert.equal(input.contactNameTh, "สมชาย ใจดี"); assert.equal(input.contactNameJa, "ソムチャイ");
    assert.equal(input.department, "技術部"); assert.equal(input.position, "Sales Engineer");
    for (const field of ["department", "position"]) {
      for (const value of [123, {}, "x".repeat(201)]) assert.throws(() => parse({ code: "ROLE-TEST", name: "Test", contact: "Person", [field]: value }), ApiError);
      assert.throws(() => parse({ code: "ROLE-TEST", name: "Test", [field]: "Role" }), ApiError);
    }
  }
});

test("sales company validation generates bounded unique codes and requires contact identity", () => {
  const first = salesCustomerInput({ name: "  Tomas   Tech  " });
  assert.equal(first.code, "TOMAS-TECH");
  assert.notEqual(first.code, salesCustomerInput({ name: "Other" }).code);
  assert.equal(first.name, "Tomas Tech");
  assert.equal(salesCustomerInput({ name: "Client", code: "cus-01", contact: "Jane", email: "Jane@Example.com" }).email, "jane@example.com");
  assert.equal(salesCustomerInput({ name: "Client", code: "cus-01" }).code, "CUS-01");
  for (const body of [{ name: "" }, { name: "Client", code: "bad code" }, { name: "Client", phone: "123" }, { name: "Client", email: "a@example.com" }, { name: "Client", contact: "Jane", email: "Jane <a@example.com>" }, { name: "Client", site: "x".repeat(301) }]) {
    assert.throws(() => salesCustomerInput(body), (error: unknown) => error instanceof ApiError && error.statusCode === 400);
  }
});

test("sales contact validation handles optional fields and rejects malformed values", () => {
  assert.deepEqual(salesContactInput({ name: " Jane   Doe ", email: "JANE@Example.com" }), { name: "Jane Doe", nameTh: "", nameEn: "", nameJa: "", titleTh: "", titleEn: "", titleJa: "", email: "jane@example.com", phone: "", department: "", position: "" });
  assert.deepEqual(salesContactInput({ nameTh: "สมชาย", nameEn: "Somchai", nameJa: "ソムチャイ" }), { name: "Somchai", nameTh: "สมชาย", nameEn: "Somchai", nameJa: "ソムチャイ", titleTh: "", titleEn: "", titleJa: "", email: "", phone: "", department: "", position: "" });
  for (const body of [{ name: "" }, { name: "Jane", email: "bad" }, { name: "Jane", phone: 123 }, { name: "Jane", department: "x".repeat(201) }]) assert.throws(() => salesContactInput(body));
});

test("permission fallback accepts only explicit permission-denied, never auth or database failures", async () => {
  const calls: string[] = [];
  const users = { async demandPermission(_request: unknown, permission: string) { calls.push(permission); if (permission !== "master.write") throw new ApiError(403, "permission_denied", "Denied"); } } as unknown as CurrentUserService;
  await demandSalesCustomerPermission(users, {} as FastifyRequest, true);
  assert.deepEqual(calls, ["intake.write", "master.write"]);
  for (const error of [new ApiError(401, "unauthenticated", "Login required"), new Error("Database unavailable")]) {
    let count = 0;
    const failing = { async demandPermission() { count++; throw error; } } as unknown as CurrentUserService;
    await assert.rejects(demandSalesCustomerPermission(failing, {} as FastifyRequest, true), (received) => received === error);
    assert.equal(count, 1);
  }
});

test("HTTP create endpoints reject read-only users before any write or actor lookup", async () => {
  let touchedDatabase = false;
  const database = { async transaction() { touchedDatabase = true; throw new Error("Unexpected database access"); } } as unknown as Database;
  const users = { async demandPermission() { throw new ApiError(403, "permission_denied", "Denied"); }, async required() { throw new Error("Unexpected actor lookup"); } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerSalesCustomerRoutes(app, database, users);
  try {
    for (const url of ["/api/v1/sales/customers", "/api/v1/sales/customers/1/contacts"]) {
      const response = await app.inject({ method: "POST", url, payload: { name: "Client" } });
      assert.equal(response.statusCode, 403); assert.equal(response.json().code, "permission_denied");
    }
    assert.equal(touchedDatabase, false);
  } finally { await app.close(); }
});

test("Sales intake.write can reach validation without master.write; malformed site and contact writes stop before transaction", async () => {
  let touchedDatabase = false;
  const granted: string[] = [];
  const database = { async transaction() { touchedDatabase = true; throw new Error("Unexpected transaction"); } } as unknown as Database;
  const users = { async demandPermission(_request: unknown, permission: string) { granted.push(permission); assert.equal(permission, "intake.write"); }, async required() { return { id: 1 }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerSalesCustomerRoutes(app, database, users);
  try {
    const company = await app.inject({ method: "POST", url: "/api/v1/sales/customers", payload: { name: "Client", email: "a@example.com" } });
    assert.equal(company.statusCode, 400);
    for (const siteId of [0, -1, "1", 1.5]) {
      const response = await app.inject({ method: "POST", url: "/api/v1/sales/customers/1/contacts", payload: { name: "Jane", siteId } });
      assert.equal(response.statusCode, 400);
    }
    assert.equal(touchedDatabase, false); assert.equal(granted.length, 5);
  } finally { await app.close(); }
});

test("contact titles stay separate, optional, bounded and require a named person", () => {
  for (const parse of [salesCustomerInput, customerInput]) {
    const result = parse({code:"TITLE",name:"Company",contact:"Somchai",contactTitleTh:" นาย ",contactTitleEn:"Mr.",contactTitleJa:"様"});
    assert.equal(result.contact,"Somchai"); assert.equal(result.contactTitleTh,"นาย"); assert.equal(result.contactTitleEn,"Mr."); assert.equal(result.contactTitleJa,"様");
    for(const key of ["contactTitleTh","contactTitleEn","contactTitleJa"]){
      for(const value of [123,{},"x".repeat(51)]) assert.throws(()=>parse({code:"TITLE",name:"Company",contact:"Somchai",[key]:value}),ApiError);
      assert.throws(()=>parse({code:"TITLE",name:"Company",[key]:"Dr."}),ApiError);
    }
  }
  const contact=salesContactInput({name:"山田",titleJa:"様"});
  assert.equal(contact.name,"山田"); assert.equal(contact.titleJa,"様");
});

test("contact edit and removal reject read-only users before any write or actor lookup", async () => {
  let touchedDatabase = false;
  const database = { async transaction() { touchedDatabase = true; throw new Error("Unexpected database access"); } } as unknown as Database;
  const users = { async demandPermission() { throw new ApiError(403, "permission_denied", "Denied"); }, async required() { throw new Error("Unexpected actor lookup"); } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerSalesCustomerRoutes(app, database, users);
  try {
    const edit = await app.inject({ method: "PUT", url: "/api/v1/sales/customers/1/contacts/2", payload: { name: "Jane", rowVersion: ROW_VERSION } });
    assert.equal(edit.statusCode, 403); assert.equal(edit.json().code, "permission_denied");
    const removal = await app.inject({ method: "DELETE", url: `/api/v1/sales/customers/1/contacts/2?rowVersion=${encodeURIComponent(ROW_VERSION)}` });
    assert.equal(removal.statusCode, 403); assert.equal(removal.json().code, "permission_denied");
    assert.equal(touchedDatabase, false);
  } finally { await app.close(); }
});

test("contact edit and removal validate identity, row version and the main-contact flag before the transaction", async () => {
  let touchedDatabase = false;
  const database = { async transaction() { touchedDatabase = true; throw new Error("Unexpected transaction"); } } as unknown as Database;
  const users = { async demandPermission() {}, async required() { return { id: 1 }; } } as unknown as CurrentUserService;
  const app = Fastify(); registerErrorHandler(app); registerSalesCustomerRoutes(app, database, users);
  try {
    // A person must still be named in at least one language.
    const nameless = await app.inject({ method: "PUT", url: "/api/v1/sales/customers/1/contacts/2", payload: { rowVersion: ROW_VERSION } });
    assert.equal(nameless.statusCode, 400); assert.equal(nameless.json().code, "validation_failed");
    // An edit without a usable row version cannot silently overwrite a concurrent change.
    for (const rowVersion of [undefined, "", "not-base64", Buffer.alloc(4).toString("base64")]) {
      const response = await app.inject({ method: "PUT", url: "/api/v1/sales/customers/1/contacts/2", payload: { name: "Jane", rowVersion } });
      assert.equal(response.statusCode, 400); assert.equal(response.json().code, "invalid_row_version");
    }
    // Promotion is an explicit boolean, never a truthy string.
    for (const isPrimary of ["true", 1, null]) {
      const response = await app.inject({ method: "PUT", url: "/api/v1/sales/customers/1/contacts/2", payload: { name: "Jane", rowVersion: ROW_VERSION, isPrimary } });
      assert.equal(response.statusCode, 400); assert.equal(response.json().code, "validation_failed");
    }
    // Both routes reject a contact or customer id that is not a positive integer.
    for (const url of ["/api/v1/sales/customers/1/contacts/0", "/api/v1/sales/customers/0/contacts/2", "/api/v1/sales/customers/1/contacts/1.5"]) {
      const edit = await app.inject({ method: "PUT", url, payload: { name: "Jane", rowVersion: ROW_VERSION } });
      assert.equal(edit.statusCode, 400);
      const removal = await app.inject({ method: "DELETE", url: `${url}?rowVersion=${encodeURIComponent(ROW_VERSION)}` });
      assert.equal(removal.statusCode, 400);
    }
    // Removal carries the row version on the query string, so a missing one stops here.
    const unguarded = await app.inject({ method: "DELETE", url: "/api/v1/sales/customers/1/contacts/2" });
    assert.equal(unguarded.statusCode, 400); assert.equal(unguarded.json().code, "invalid_row_version");
    assert.equal(touchedDatabase, false);
  } finally { await app.close(); }
});

test("a generated customer code reads like the ones already in the master", () => {
  // Legal-form words are dropped; the rest of the name survives in order.
  assert.equal(customerCodeFromName("DAISO SIAM INTERNATIONAL CO.,LTD."), "DAISO-SIAM-INTERNATIONAL");
  assert.equal(customerCodeFromName("DAIICHI JITSUGYO (THAILAND) CO., LTD."), "DAIICHI-JITSUGYO-THAILAND");
  assert.equal(customerCodeFromName("DAIICHI JITSUGYO INDIA PVT. LTD."), "DAIICHI-JITSUGYO-INDIA");
  assert.equal(customerCodeFromName("CIMTOPS CORPORATION THAILAND"), "CIMTOPS-THAILAND");
  // A long name is cut to 25 characters so a uniqueness suffix still fits nvarchar(30).
  const long = customerCodeFromName("CIMTOPS CORPORATION THAILAND REPRESENTATIVE OFFICE");
  assert.equal(long, "CIMTOPS-THAILAND-REPRESEN");
  assert.ok(long.length <= 25);
  // Every generated code passes the same validation a typed one must pass.
  for (const name of ["DAISO SIAM INTERNATIONAL CO.,LTD.", "3M (Thailand) Limited", "A.N.I. LOGISTICS, LTD."]) {
    assert.match(salesCustomerInput({ name }).code, /^[A-Z0-9][A-Z0-9._/-]*$/);
    assert.ok(salesCustomerInput({ name }).code.length <= 30);
  }
  // A name with no Latin characters cannot make a readable code, so the opaque one remains.
  assert.equal(customerCodeFromName("ไดโซ สยาม อินเตอร์เนชั่นแนล จำกัด"), "");
  assert.match(salesCustomerInput({ nameTh: "ไดโซ สยาม" }).code, /^CUS-[A-F0-9]{12}$/);
  assert.match(salesCustomerInput({ nameJa: "株式会社サンプル" }).code, /^CUS-[A-F0-9]{12}$/);
  // A name that is only legal-form words leaves nothing to build from.
  assert.equal(customerCodeFromName("CO., LTD."), "");
});
