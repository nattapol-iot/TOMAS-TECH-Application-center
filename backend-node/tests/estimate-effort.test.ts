import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { AppConfig } from "../src/config.js";
import type { EmailService } from "../src/email.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateWorkspaceWriteRoutes } from "../src/routes/estimate-workspace-write.js";
const version=Buffer.from("0000000000000001","hex"),next=Buffer.from("0000000000000002","hex");
for(const scenario of ["success", "approved", "review", "stale", "stale line", "not owner", "bad hours", "zero qty", "overflow", "audit failure"]) {
 test("inline effort: "+scenario,async t=>{
  let committed=false,writes=0,audits=0;
  t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
   if(statement.includes("FROM dbo.estimates WITH")) return {recordset:[{estimate_no:"EST-1",revision:2,owner_id:7,status:scenario==="approved"?"Approved":scenario==="review"?"Engineering Review":"Draft",row_version:scenario==="stale"?next:version}]};
   if(statement.includes("FROM dbo.estimate_assignments")) return {recordset:[]};
   if(statement.includes("SELECT id,package,activity")) return {recordset:[{id:1,owner_id:7,daily_rate:scenario==="overflow"?1e9:3500,engineers:writes?3:1,man_days:2,hours_per_day:8,row_version:scenario==="stale line"?next:writes?next:version}]};
   if(statement.includes("UPDATE dbo.manhour_lines SET engineers")) {
    writes++;assert.doesNotMatch(statement,/daily_rate=|price_date=|quotation_no=/);
    assert.match(statement,/revision=@revision/);assert.match(statement,/row_version=@version/);
    assert.equal(this.parameters.engineers!.value,3);assert.equal(this.parameters.man_days!.value,2);assert.equal(this.parameters.hours!.value,8);
    return {recordset:[{row_version:next}]};
   }
   if(statement.includes("audit_log")){audits++;if(scenario==="audit failure")throw Error("Audit unavailable");return {recordset:[]};}
   if(statement.includes("activity_events")||statement.includes("assert_estimate_totals"))return {recordset:[]};
   if(statement.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:next}]};
   throw Error("Unexpected query");
  });
  const db={async transaction(action:(transaction:object)=>Promise<unknown>){const result=await action({});committed=true;return result;}} as unknown as Database;
  const users={async demandPermission(){},async required(){return {id:scenario==="not owner"?8:7,role:"Engineer"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerEstimateWorkspaceWriteRoutes(app,{} as AppConfig,db,users,{} as EmailService);
  try {
   const response=await app.inject({method:"PUT",url:"/api/v1/estimates/1/manhour-lines/1/effort",payload:{estimateRowVersion:version.toString("base64"),lineRowVersion:version.toString("base64"),engineers:scenario==="zero qty"?0:scenario==="overflow"?1e6:3,manDays:scenario==="overflow"?1e6:2,hoursPerDay:scenario==="bad hours"?25:8}});
   assert.equal(response.statusCode,scenario==="success"?200:scenario==="not owner"?403:["bad hours","zero qty","overflow"].includes(scenario)?400:scenario==="audit failure"?500:409);
   assert.equal(committed,scenario==="success");
   if(committed){assert.equal(writes,1);assert.equal(audits,1);assert.equal(response.json().estimateRowVersion,next.toString("base64"));}
   if(!["success","audit failure"].includes(scenario))assert.equal(writes,0);
  }finally{await app.close();}
 });
}
