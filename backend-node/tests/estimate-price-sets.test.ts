import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import sql from "mssql";
import {registerEstimatePriceSetRoutes,setNumber,validateSetMembers} from "../src/routes/estimate-price-sets.js";
import {registerErrorHandler} from "../src/errors.js";
import type {Database} from "../src/db.js";
import type {CurrentUserService} from "../src/users.js";
const version=Buffer.from("0000000000000001","hex");
const member={id:1,module:"Vision",category_code:"01",category:"Hardware",price_set_key:null,is_price_set:false,qty:1,qty_per_set:null,owner_id:7};
test("set input rejects invalid quantities and mixed or nested membership",()=>{
 for(const n of [0,-1,NaN,Infinity,1.23456,1000000001])assert.throws(()=>setNumber(n,"quantity"));
 assert.equal(setNumber(2,"quantity"),2);
 validateSetMembers([member],[1]);
 for(const ids of [[],[1,1],[2]])assert.throws(()=>validateSetMembers([member],ids));
 assert.throws(()=>validateSetMembers([member,{...member,id:2,module:"Other"}],[1,2]));
 assert.throws(()=>validateSetMembers([{...member,price_set_key:"existing"}],[1]));
});
for(const scenario of ["create","edit","approved","stale","unassigned","audit failure"])test("price set "+scenario,async t=>{
 let committed=false,headers=0,children=0;
 const key="11111111-1111-1111-1111-111111111111";
 t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
  if(statement.includes("FROM dbo.estimates WITH"))return {recordset:[{estimate_no:"EST-1",revision:0,owner_id:7,status:scenario==="approved"?"Approved":"Draft",row_version:scenario==="stale"?Buffer.alloc(8):version}]};
  if(statement.includes("FROM dbo.estimate_assignments"))return {recordset:[]};
  if(statement.includes("owner_valid"))return {recordset:[{owner_valid:true,supplier_valid:true}]};
  if(statement.includes("SELECT * FROM dbo.cost_items WITH"))return {recordset:scenario==="edit"?[{...member,price_set_key:key,qty:2,qty_per_set:1},{...member,id:2,price_set_key:key,is_price_set:true}]:[member]};
  if(statement.includes("INSERT dbo.cost_items")||statement.includes("SET description=@name")){headers++;assert.equal(this.parameters.price!.value,620000);assert.equal(this.parameters.qty!.value,2);assert.match(statement,/revision/);return {recordset:[]};}
  if(statement.includes("SET price_set_key=@key")){children++;assert.match(statement,/unit_cost=0/);assert.ok(statement.includes((scenario==="edit"?"qty_per_set":"qty")+"*@qty"));return {recordset:[]};}
  if(statement.includes("SELECT * FROM dbo.cost_items"))return {recordset:[]};
  if(statement.includes("audit_log")){if(scenario==="audit failure")throw Error("Audit unavailable");return {recordset:[]};}
  if(statement.includes("activity_events")||statement.includes("assert_estimate_totals"))return {recordset:[]};
  if(statement.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:version}]};
  throw Error("Unexpected SQL: "+statement);
 });
 const database={async transaction(action:(transaction:object)=>Promise<unknown>){const result=await action({});committed=true;return result;}}as unknown as Database;
 const users={async demandPermission(){},async required(){return {id:scenario==="unassigned"?8:7,role:"Engineer"};}}as unknown as CurrentUserService;
 const app=Fastify();registerErrorHandler(app);registerEstimatePriceSetRoutes(app,database,users);
 try{const response=await app.inject({method:"POST",url:"/api/v1/estimates/1/price-sets",payload:{estimateRowVersion:version.toString("base64"),lineIds:[1],setKey:scenario==="edit"?key:undefined,name:"Vision Set A",quantity:2,unitCost:620000,supplierId:4,referenceNumber:"Q-123"}});assert.equal(response.statusCode,["create","edit"].includes(scenario)?200:scenario==="unassigned"?403:scenario==="audit failure"?500:409,response.body);assert.equal(committed,["create","edit"].includes(scenario));assert.equal(headers,committed||scenario==="audit failure"?1:0);assert.equal(children,headers);}finally{await app.close();}
});

for(const failsAudit of [false,true]) test("detach component resets price with audit, failure="+failsAudit,async t=>{
 let committed=false,detached=false;
 const key="11111111-1111-1111-1111-111111111111";
 t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
  if(statement.includes("FROM dbo.estimates WITH"))return {recordset:[{estimate_no:"EST-1",revision:0,owner_id:7,status:"Draft",row_version:version}]};
  if(statement.includes("SELECT * FROM dbo.cost_items"))return {recordset:[{...member,price_set_key:key}]};
  if(statement.includes("SET price_set_key=NULL")){detached=true;assert.match(statement,/unit_cost=0/);assert.match(statement,/header.price_set_key=@key/);assert.match(statement,/NOT EXISTS/);assert.equal(this.parameters.key!.value,key);return {recordset:[]};}
  if(statement.includes("audit_log")){if(failsAudit)throw Error("Audit failed");return {recordset:[]};}
  if(statement.includes("activity_events")||statement.includes("assert_estimate_totals"))return {recordset:[]};
  if(statement.includes("UPDATE dbo.estimates"))return {recordset:[{row_version:version}]};
  throw Error("Unexpected SQL "+statement);
 });
 const database={async transaction(action:(transaction:object)=>Promise<unknown>){const result=await action({});committed=true;return result;}}as unknown as Database;
 const users={async demandPermission(){},async required(){return {id:7,role:"Engineer"};}}as unknown as CurrentUserService;
 const app=Fastify();registerErrorHandler(app);registerEstimatePriceSetRoutes(app,database,users);
 try{const response=await app.inject({method:"POST",url:"/api/v1/estimates/1/price-set-detach",payload:{lineId:1,estimateRowVersion:version.toString("base64")}});assert.equal(response.statusCode,failsAudit?500:200);assert.ok(detached);assert.equal(committed,!failsAudit);}finally{await app.close();}
});
