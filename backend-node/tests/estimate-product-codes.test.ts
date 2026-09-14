import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerEstimateCostWriteRoutes } from "../src/routes/estimate-cost-write.js";

test("repeated template applications preserve product codes including genuine numeric suffixes", async t => {
  const version=Buffer.from("0000000000000001","hex");
  const inserted: string[]=[];
  t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request, statement:string) {
    if(statement.includes("FROM dbo.estimates WITH")) return {recordset:[{estimate_no:"EST-1",revision:0,owner_id:7,status:"Draft",row_version:version}]};
    if(statement.includes("FROM dbo.module_templates")) return {recordset:[{code:"IO",name:"Remote IO",revision:1,status:"Active"}]};
    if(statement.includes("FROM dbo.module_template_lines")) return {recordset:["KV-EP02","REAL-MODEL-2"].map(item_code=>({category_code:"01",subcategory:"",item_code,description:"IO",brand:"Keyence",model:item_code,specification:null,supplier_id:null,qty_per_module:1,unit:"Pcs",ref_unit_cost:7900,ref_price_date:null,remark:null}))};
    if(statement.includes("owner_valid")) return {recordset:[{owner_valid:true,supplier_valid:true}]};
    if(statement.includes("INSERT INTO dbo.cost_items")) { inserted.push(String(this.parameters.item_code!.value)); return {recordset:[]}; }
    if(statement.includes("UPDATE dbo.estimates")) return {recordset:[{row_version:version}]};
    if(statement.includes("assert_estimate_totals")||statement.includes("audit_log")||statement.includes("activity_events"))return {recordset:[]};
    throw Error("Unexpected SQL: "+statement);
  });
  const database={async transaction(action:(tx:object)=>Promise<unknown>){return action({});}} as unknown as Database;
  const users={async demandPermission(){},async required(){return {id:7,role:"Admin"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerEstimateCostWriteRoutes(app,database,users);
  try {
    for(const moduleName of ["Group 1","Group 2","Group 3"]) {
      const response=await app.inject({method:"POST",url:"/api/v1/estimates/1/apply-template",payload:{estimateRowVersion:version.toString("base64"),templateId:1,module:moduleName,modules:1,ownerId:7}});
      assert.equal(response.statusCode,201,response.body);
    }
    assert.deepEqual(inserted,["KV-EP02","REAL-MODEL-2","KV-EP02","REAL-MODEL-2","KV-EP02","REAL-MODEL-2"]);
  } finally {await app.close();}
});
