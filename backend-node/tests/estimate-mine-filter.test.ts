import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import sql from "mssql";
import { registerEstimateRoutes } from "../src/routes/estimates.js";
import type { Database } from "../src/db.js";
import type { AppConfig } from "../src/config.js";
import type { CurrentUserService } from "../src/users.js";
for (const mine of [true,false]) test("estimate list mine="+mine,async()=>{
 const app=Fastify();let checked=false;
 const database={async query(statement:string,bind:(request:sql.Request)=>void){
  const request=new sql.Request();bind(request);
  assert.ok(request.parameters.mine_id);
  assert.ok(request.parameters.owner_id);
  assert.equal(request.parameters.mine_id.value,mine?17:null);
  assert.equal(request.parameters.owner_id.value,null);
  assert.match(statement,/e.owner_id=@mine_id OR EXISTS/);
  assert.match(statement,/a.estimate_id=e.id/);
  assert.match(statement,/a.owner_id=@mine_id OR a.support_id=@mine_id/);
  assert.doesNotMatch(statement,/a.status|a.progress/);
  checked=true;return {recordset:[]};
 }} as unknown as Database;
 const users={async demandPermission(){},async required(){return {id:17};}} as unknown as CurrentUserService;
 registerEstimateRoutes(app,{} as AppConfig,database,users);
 try {const response=await app.inject({method:"GET",url:"/api/v1/estimates?mine="+mine+"&mineId=99"});assert.equal(response.statusCode,200);assert.ok(checked);}finally{await app.close();}
});
