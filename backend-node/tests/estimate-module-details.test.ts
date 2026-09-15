
import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";
const version=Buffer.from("0000000000000001","hex");
for(const scenario of ["labor", "summary", "package", "rename", "collision", "approved", "stale", "unassigned", "audit failure", "quantity", "unit only", "scale back"]) {
 test("module details: "+scenario, async t=>{
  let committed=false, writes=0, audits=0;
  t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request, statement:string){
   if(statement.includes("FROM dbo.estimates WITH")) return {recordset:[{estimate_no:"EST-1",revision:2,owner_id:7,status:scenario==="approved"?"Approved":"Draft",row_version:scenario==="stale"?Buffer.alloc(8):version}]};
   if(statement.includes("FROM dbo.estimate_assignments")) return {recordset:[]};
   if(statement.includes("SELECT module_key,title,remark")) return {recordset: scenario === "scale back" ? [{ quantity: 2, unit: "Set" }] : []};
   if(statement.includes("SELECT id,qty,unit,unit_cost")) return {recordset:[{id:1,qty:scenario === "scale back" ? 4 : 2}]};
   if(statement.includes("SELECT id FROM dbo.cost_items")) return {recordset:[{id:1}]};
   if(statement.includes("SELECT id,owner_id FROM dbo.manhour_lines")) return {recordset:[{id:1,owner_id:7},{id:2,owner_id:7}]};
   if(statement.includes("UPDATE dbo.manhour_lines SET package")) {writes++;assert.match(statement,/UPDATE dbo.expense_lines SET package/);assert.doesNotMatch(statement,/daily_rate=/);return {recordset:[]};}
   if(statement.includes("SELECT TOP(1) id")) return {recordset:scenario==="collision"?[{id:2}]:[]};
   if(statement.includes("SET qty=@quantity")) { writes++; assert.equal(this.parameters.quantity!.value, scenario === "scale back" ? 2 : 4); assert.match(statement, /estimate_id=@estimate AND revision=@revision/); assert.doesNotMatch(statement, /unit_cost=/); return {recordset:[]}; }
   if(statement.includes("UPDATE dbo.cost_items")) {writes++; assert.match(statement,/revision=@revision AND deleted_at IS NULL/); return {recordset:[]};}
   if(statement.includes("UPDATE dbo.estimate_module_details")) {writes++; assert.equal(this.parameters.revision!.value,2);assert.equal(this.parameters.remark!.value,"Visible remark");assert.equal(this.parameters.description_rows!.value,'["First detail","Second detail"]');assert.match(statement,/CASE WHEN @key=N'summary' THEN @remark/);return {recordset:[]};}
   if(statement.includes("audit_log")) {audits++;if(scenario==="audit failure")throw Error("Audit unavailable");return {recordset:[]};}
   if(statement.includes("activity_events")||statement.includes("assert_estimate_totals"))return {recordset:[]};
   if(statement.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:version}]};
   throw Error("Unexpected query");
  });
  const db={async transaction(action:(transaction:object)=>Promise<unknown>){const result=await action({});committed=true;return result;}} as unknown as Database;
  const users={async demandPermission(){},async required(){return {id:scenario==="unassigned"?8:7,role:"Engineer"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerEstimateCostWriteRoutes(app,db,users);
  try{
   const response=await app.inject({method:"PUT",url:"/api/v1/estimates/1/module-details",payload:{...(["quantity","unit only","scale back"].includes(scenario) ? {quantity:scenario === "quantity" ? 2 : 1,unit:"Job"} : {}),moduleKey:scenario === "summary" ? "summary" : scenario === "package" ? "package:Engineering:Original" : ["rename","collision","quantity","unit only","scale back"].includes(scenario)?"category:01:Original":"labor:Software",title:"Updated module",remark:"Visible remark",descriptionRows:["First detail","Second detail"],estimateRowVersion:version.toString("base64")}});
   assert.equal(response.statusCode,["labor","rename","summary","package","quantity","unit only","scale back"].includes(scenario)?200:scenario==="unassigned"?403:scenario==="audit failure"?500:409);
   assert.equal(committed,["labor","rename","summary","package","quantity","unit only","scale back"].includes(scenario));
   if(committed){assert.equal(audits,1);assert.ok(writes>0);}
   if(["approved","stale","unassigned","collision"].includes(scenario))assert.equal(writes,0);
  }finally{await app.close();}
 });
}

import { scaleModuleQuantities } from "../src/estimate-module-details.js";
test("module quantity scales set header and all components without changing per-set counts", () => {
 const rows=[{id:1,qty:1},{id:2,qty:3},{id:3,qty:2}];
 const doubled=scaleModuleQuantities(rows,1,2);
 assert.deepEqual(doubled.map(row=>row.quantity),[2,6,4]);
 assert.deepEqual(scaleModuleQuantities(doubled.map(row=>({id:row.id,qty:row.quantity})),2,1).map(row=>row.quantity),[1,3,2]);
 assert.throws(()=>scaleModuleQuantities([{id:1,qty:1}],3,1),/four decimal/);
 assert.throws(()=>scaleModuleQuantities([{id:1,qty:1}],2,1),/fractional/);
 assert.throws(()=>scaleModuleQuantities([{id:1,qty:0.0001}],2,1),/four decimal/);
});
