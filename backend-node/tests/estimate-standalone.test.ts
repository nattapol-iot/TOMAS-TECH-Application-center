import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import sql from "mssql";
import { registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";
import { registerErrorHandler } from "../src/errors.js";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
const version=Buffer.from("0000000000000001","hex");
for(const moduleName of ["", "   ", undefined, "Existing module", "x".repeat(201)]) test("create cost item with module: "+String(moduleName).slice(0,25),async t=>{
 let written=false;
 t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
  if(statement.includes("FROM dbo.estimates WITH"))return {recordset:[{estimate_no:"EST-1",revision:0,owner_id:7,status:"Draft",row_version:version}]};
  if(statement.includes("owner_valid"))return {recordset:[{owner_valid:true,supplier_valid:true}]};
  if(statement.includes("INSERT INTO dbo.cost_items")){written=true;assert.equal(this.parameters.module!.value,moduleName?.trim()??"");return {recordset:[{id:1,row_version:version}]};}
  if(statement.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:version}]};
  if(statement.includes("SELECT id,category_code"))return {recordset:[{id:1,module:moduleName?.trim()??"",row_version:version}]};
  if(/audit_log|activity_events|assert_estimate_totals/.test(statement))return {recordset:[]};
  throw Error("Unexpected query");
 });
 const database={async transaction(action:(transaction:object)=>Promise<unknown>){return action({});}} as unknown as Database;
 const users={async demandPermission(){},async required(){return {id:7,role:"Engineer"};}} as unknown as CurrentUserService;
 const app=Fastify();registerErrorHandler(app);registerEstimateCostWriteRoutes(app,database,users);
 try{const response=await app.inject({method:"POST",url:"/api/v1/estimates/1/cost-items",payload:{estimateRowVersion:version.toString("base64"),module:moduleName,categoryCode:"01",itemCode:"PC",description:"PC standalone",quantity:1,unit:"Pcs",unitCost:100,priceSource:"Manual Estimate",ownerId:7}});assert.equal(response.statusCode,moduleName?.length===201?400:201);assert.equal(written,moduleName?.length!==201);}finally{await app.close();}
});
