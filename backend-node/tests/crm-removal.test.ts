import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { registerCrmCustomerRoutes } from "../src/routes/crm-customers.js";
import { registerSalesCustomerRoutes } from "../src/routes/sales-customers.js";

const version=Buffer.alloc(8,1);
const customerUrl=`/api/v1/crm/customers/7?rowVersion=${encodeURIComponent(version.toString("base64"))}`;
const contactUrl=`/api/v1/sales/customers/7/contacts/9?rowVersion=${encodeURIComponent(version.toString("base64"))}`;

for(const kind of ["customer","contact"] as const){
  for(const scenario of ["denied","missing","stale","in-use","success",...(kind==="contact"?["primary"]:[])]){
    test(`${kind} deletion: ${scenario}`,async t=>{
      const statements:string[]=[];
      let isolation:unknown;
      t.mock.method(sql.Request.prototype,"query",async function(statement:string){
        statements.push(statement);
        if(statement.includes("SELECT * FROM dbo.customers WITH"))return {recordset:scenario==="missing"?[]:[{id:7,code:"C7",row_version:scenario==="stale"?Buffer.alloc(8,2):version}]};
        if(statement.includes("SELECT id,site FROM dbo.customers"))return {recordset:[{id:7,site:""}]};
        if(statement.includes("SELECT sc.id,sc.site_id"))return {recordset:scenario==="missing"?[]:[{id:9,site_id:3,is_primary:scenario==="primary",row_version:version}]};
        if(statement.includes("END in_use"))return {recordset:[{in_use:scenario==="in-use"?1:0}]};
        if(statement.includes("OUTPUT inserted.id WHERE id=@id"))return {recordset:scenario==="stale"?[]:[{id:9}]};
        return {recordset:[]};
      });
      const database={
        async query(){return {recordset:[{code:"crm.contact.write"}]};},
        async transaction(action:(tx:object)=>Promise<unknown>,level:unknown){isolation=level;return action({});},
      } as unknown as Database;
      const users={async demandPermission(){if(scenario==="denied")throw new ApiError(403,"permission_denied","Denied");},async required(){return {id:1,department:"Sales"};}} as unknown as CurrentUserService;
      const app=Fastify();registerErrorHandler(app);
      registerCrmCustomerRoutes(app,database,users);registerSalesCustomerRoutes(app,database,users);
      try{
        const response=await app.inject({method:"DELETE",url:kind==="customer"?customerUrl:contactUrl});
        const expected=scenario==="success"?200:scenario==="denied"?403:scenario==="missing"?404:409;
        assert.equal(response.statusCode,expected,response.body);
        if(scenario==="success"){
          assert.equal(response.json().removed,true);
          assert.equal(isolation,sql.ISOLATION_LEVEL.SERIALIZABLE);
          assert.ok(statements.some(s=>s.includes("INSERT INTO dbo.audit_log")));
          assert.ok(statements.some(s=>s.includes("deleted_at=SYSUTCDATETIME()")));
          assert.ok(!statements.some(s=>/\bDELETE\s+FROM\b/i.test(s)));
          if(kind==="customer")assert.ok(statements.some(s=>s.includes("UPDATE dbo.customer_sites")&&s.includes("UPDATE co")));
        }else{
          assert.ok(!statements.some(s=>s.includes("INSERT INTO dbo.audit_log")));
          if(scenario!=="stale")assert.ok(!statements.some(s=>s.includes("UPDATE ")));
        }
        if(scenario==="in-use")assert.equal(response.json().code,`${kind}_in_use`);
        if(scenario==="stale")assert.equal(response.json().code,"concurrency_conflict");
      }finally{await app.close();}
    });
  }
}

test("customer deletion requires row version",async()=>{
  const users={async demandPermission(){},async required(){return {id:1};}} as unknown as CurrentUserService;
  const database={async query(){return {recordset:[]};},async transaction(){throw Error("Must not mutate without version");}} as unknown as Database;
  const app=Fastify();registerErrorHandler(app);registerCrmCustomerRoutes(app,database,users);
  try{assert.equal((await app.inject({method:"DELETE",url:"/api/v1/crm/customers/7"})).statusCode,400);}finally{await app.close();}
});
