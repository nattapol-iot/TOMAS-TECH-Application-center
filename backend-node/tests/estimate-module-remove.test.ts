import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";
const version = Buffer.from("0000000000000001", "hex"), next = Buffer.from("0000000000000002", "hex");
for (const scenario of ["success", "approved", "stale", "unassigned", "audit failure"]) {
 test(`module removal: ${scenario}`, async t => {
  let committed = false, writes = 0, audits = 0;
  t.mock.method(sql.Request.prototype, "query", async function(this: sql.Request, statement: string) {
   if(statement.includes("FROM dbo.estimates WITH")) return {recordset:[{estimate_no:"EST-1",revision:2,owner_id:7,status:scenario === "approved" ? "Approved":"Draft",row_version:scenario === "stale" ? next:version}]};
   if(statement.includes("FROM dbo.estimate_assignments")) return {recordset:[]};
   if(statement.includes("SELECT id,row_version FROM dbo.cost_items")) {
    assert.equal(this.parameters.category!.value,"01"); assert.equal(this.parameters.module!.value,"Main module");
    assert.match(statement,/revision=@revision AND deleted_at IS NULL AND category_code=@category/);
    assert.match(statement,/COLLATE Latin1_General_100_BIN2/);
    return {recordset:[{id:11,row_version:version},{id:12,row_version:version}]};
   }
   if(statement.includes("SELECT id,category_code")) return {recordset:[{id:this.parameters.line_id!.value,row_version:this.parameters.include_deleted!.value ? next:version}]};
   if(statement.includes("UPDATE dbo.cost_items")) {
    writes++; assert.match(statement,/OUTPUT inserted.id,inserted.row_version INTO @removed/);
    assert.match(statement,/revision=@revision AND deleted_at IS NULL AND category_code=@category/);
    return {recordset:[{id:11,row_version:next},{id:12,row_version:next}]};
   }
   if(statement.includes("audit_log")) { audits++; if(scenario === "audit failure") throw Error("Audit unavailable"); return {recordset:[]}; }
   if(statement.includes("activity_events")) return {recordset:[]};
   if(statement.includes("UPDATE dbo.estimates")) return {recordset:[{row_version:next}]};
   if(statement.includes("assert_estimate_totals")) return {recordset:[]};
   throw Error("Unexpected statement");
  });
  const db={async transaction(action:(transaction:object)=>Promise<unknown>) {const result=await action({});committed=true;return result;}} as unknown as Database;
  const users={async demandPermission(_request:unknown,permission:string) {assert.equal(permission,"estimate.write");},async required(){return {id:scenario === "unassigned" ? 8:7,role:"Engineer"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerEstimateCostWriteRoutes(app,db,users);
  try {
   const response=await app.inject({method:"POST",url:"/api/v1/estimates/1/cost-modules/remove",payload:{categoryCode:"01",module:"Main module",estimateRowVersion:version.toString("base64")}});
   assert.equal(response.statusCode,scenario === "success" ? 200:scenario === "unassigned" ? 403:scenario === "audit failure" ? 500:409);
   assert.equal(committed,scenario === "success");
   if(scenario === "success") {assert.equal(response.json().removed,2);assert.equal(audits,2);assert.equal(writes,1);}
   if(["approved","stale","unassigned"].includes(scenario)) assert.equal(writes,0);
  } finally {await app.close();}
 });
}
