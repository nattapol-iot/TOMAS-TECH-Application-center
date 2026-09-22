import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";
const version=Buffer.from("0000000000000001","hex"), set="11111111-1111-4111-8111-111111111111";
for(const scenario of ["success","default order","approved","stale","unassigned","collision","empty","partial set","same name","audit failure","metadata failure","total failure"]) {
 test("copy module: "+scenario,async t=>{
  let committed=false,inserts=0,mappings=0,metadata=0,audits=0;const keys:unknown[]=[];
  t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,s:string){
   assert.doesNotMatch(s,/UPDATE dbo.cost_items|DELETE FROM dbo.cost_items/);
   if(s.includes("FROM dbo.estimates WITH"))return {recordset:[{estimate_no:"EST-1",revision:2,owner_id:7,status:scenario==="approved"?"Approved":"Draft",row_version:scenario==="stale"?Buffer.alloc(8):version}]};
   if(s.includes("FROM dbo.estimate_assignments"))return {recordset:[]};
   if(s.includes("SELECT TOP(1) id FROM dbo.cost_items"))return {recordset:scenario==="collision"?[{id:9}]:[]};
   if(s.includes("SELECT id,price_set_key FROM")){assert.equal(this.parameters.module!.value,"Line K");assert.match(s,/ORDER BY sort_order,id/);return {recordset:scenario==="empty"?[]:[{id:11,price_set_key:set},{id:12,price_set_key:set},{id:13,price_set_key:null}]};}
   if(s.includes("SELECT TOP(1) c.id"))return {recordset:scenario==="partial set"?[{id:14}]:[]};
   if(s.includes("SELECT MAX(sort_order) maxSortOrder")) return {recordset:[{maxSortOrder:scenario === "default order" ? 2147483647 : 5}]};
   if(s.includes("INSERT dbo.cost_items")){
    if(scenario === "default order" && s.includes("COALESCE(MAX(sort_order),0)+1")) { const error = new sql.RequestError("Arithmetic overflow error converting expression to data type int.","EREQUEST"); error.number=8115; throw error; }
    inserts++;assert.equal(this.parameters.sort_order!.value,scenario === "default order" ? 2147483647 : 5+inserts);assert.equal(this.parameters.target!.value,"Line L");assert.equal(this.parameters.actor!.value,7);assert.equal(this.parameters.source_id!.value,10+inserts);assert.equal(this.parameters.revision!.value,2);assert.match(s,/supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,price_date/);assert.match(s,/@set_key,is_price_set,qty_per_set/);assert.match(s,/id=@source_id AND estimate_id=@id AND revision=@revision AND deleted_at IS NULL/);keys.push(this.parameters.set_key!.value);return {recordset:[{id:100+inserts}]};}
   if(s.includes("INSERT dbo.estimate_erp_mappings")){mappings++;assert.equal(this.parameters.new_id!.value,100+mappings);return {recordset:[]};}
   if(s.includes("INSERT dbo.estimate_module_details")){metadata++;assert.equal(this.parameters.source_key!.value,"category:01:Line K");assert.equal(this.parameters.target_key!.value,"category:01:Line L");assert.match(s,/description_rows,quantity,unit,cost_multiplier/);assert.doesNotMatch(s,/created_by/);if(scenario==="metadata failure")throw Error("Metadata failed");return {recordset:[]};}
   if(s.includes("assert_estimate_totals")){if(scenario==="total failure")throw Error("Totals failed");return {recordset:[]};}
   if(s.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:version}]};
   if(s.includes("audit_log")){audits++;if(scenario==="audit failure")throw Error("Audit failed");return {recordset:[]};}
   if(s.includes("activity_events"))return {recordset:[]};throw Error("Unexpected SQL: "+s);
  });
  const db={async transaction(action:(tx:object)=>Promise<unknown>){const result=await action({});committed=true;return result;}} as unknown as Database;
  const users={async demandPermission(_r:unknown,p:string){assert.equal(p,"estimate.write");},async required(){return {id:scenario==="unassigned"?8:7,role:"Engineer"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerEstimateCostWriteRoutes(app,db,users);
  try{const response=await app.inject({method:"POST",url:"/api/v1/estimates/1/cost-modules/copy",payload:{categoryCode:"01",module:"Line K",targetModule:scenario==="same name"?"Line K":"Line L",estimateRowVersion:version.toString("base64")}});
   assert.equal(response.statusCode,["success","default order"].includes(scenario)?200:scenario==="same name"?400:scenario==="unassigned"?403:scenario.endsWith("failure")?500:409,response.body);assert.equal(committed,["success","default order"].includes(scenario));
   if(["success","default order"].includes(scenario)){assert.equal(response.json().copied,3);assert.equal(inserts,3);assert.equal(mappings,3);assert.equal(metadata,1);assert.equal(audits,1);assert.notEqual(keys[0],set);assert.equal(keys[0],keys[1]);assert.equal(keys[2],null);}else if(!scenario.endsWith("failure"))assert.equal(inserts,0);
  }finally{await app.close();}
 });
}
