import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { parseCostMove, registerEstimateOrderRoutes } from "../src/routes/estimate-order.js";
const version=Buffer.from("0000000000000001","hex"), next=Buffer.from("0000000000000002","hex");
test("move input rejects invalid destinations and non-cost ledgers", () => {
 assert.equal(parseCostMove(undefined,"CostItem",[1,2]),null);
 assert.deepEqual(parseCostMove({lineId:1,targetLineId:2},"CostItem",[1,2]),{lineId:1,targetLineId:2});
 for(const value of [null,{}, {lineId:1,targetLineId:1},{lineId:1,targetLineId:3},{lineId:"1",targetLineId:2}]) assert.throws(()=>parseCostMove(value,"CostItem",[1,2]));
 assert.throws(()=>parseCostMove({lineId:1,targetLineId:2},"ManhourLine",[1,2]));
});
for(const scenario of ["success","approved","stale","unassigned","missing target","audit failure"]) {
 test("cost drag transaction: "+scenario,async t=>{
  let committed=false,moves=0,orders=0,audits=0;
  t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
   if(statement.includes("FROM dbo.estimates WITH"))return {recordset:[{estimate_no:"EST-1",revision:2,owner_id:7,status:scenario==="approved"?"Approved":"Draft",row_version:scenario==="stale"?next:version}]};
   if(statement.includes("FROM dbo.estimate_assignments"))return {recordset:[]};
   if(statement.includes("SELECT id,sort_order"))return {recordset:scenario==="missing target"?[{id:1}]:[{id:1,sort_order:0,module:"A",category_code:"01"},{id:2,sort_order:1,module:"B",category_code:"02"}]};
   if(statement.includes("UPDATE moving SET")){
    moves++;assert.equal(this.parameters.moving_id!.value,1);assert.equal(this.parameters.target_id!.value,2);
    assert.match(statement,/module=target.module/);assert.match(statement,/category_code=target.category_code/);
    assert.match(statement,/target.revision=@revision/);assert.match(statement,/moving.revision=@revision/);
    assert.doesNotMatch(statement,/qty=|unit_cost=|supplier_id=|owner_id=|price_source=|estimate_erp_mappings/);
    return {recordset:[]};
   }
   if(statement.includes("UPDATE line SET sort_order")){orders++;assert.equal(moves,1);assert.equal(this.parameters.ids!.value,"[2,1]");return {recordset:[]};}
   if(statement.includes("audit_log")){audits++;if(scenario==="audit failure")throw Error("Audit unavailable");return {recordset:[]};}
   if(statement.includes("activity_events")||statement.includes("assert_estimate_totals"))return {recordset:[]};
   if(statement.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:next}]};
   throw Error("Unexpected query: "+statement);
  });
  const db={async transaction(action:(transaction:object)=>Promise<unknown>){const result=await action({});committed=true;return result;}} as unknown as Database;
  const users={async demandPermission(){},async required(){return {id:scenario==="unassigned"?8:7,role:"Engineer"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerEstimateOrderRoutes(app,db,users);
  try {
   const response=await app.inject({method:"PUT",url:"/api/v1/estimates/1/line-order",payload:{estimateRowVersion:version.toString("base64"),sourceType:"CostItem",orderedIds:[2,1],move:{lineId:1,targetLineId:2}}});
   assert.equal(response.statusCode,scenario==="success"?200:scenario==="unassigned"?403:scenario==="audit failure"?500:409);
   assert.equal(committed,scenario==="success");
   if(committed){assert.equal(moves,1);assert.equal(orders,1);assert.equal(audits,1);}
   if(!["success","audit failure"].includes(scenario)){assert.equal(moves,0);assert.equal(orders,0);}
  } finally {await app.close();}
 });
}
