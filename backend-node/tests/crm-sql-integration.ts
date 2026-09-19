// Invoked only by scripts/Test-CrmLocalDb.ps1 against its newly created instance.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve,dirname,basename } from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import sql from "mssql";
import type { Database } from "../src/db.js";
import type { AppConfig } from "../src/config.js";
import { CurrentUserService } from "../src/users.js";
import { registerErrorHandler } from "../src/errors.js";
import { registerCrmRoutes } from "../src/routes/crm.js";
import { registerCrmCustomerRoutes } from "../src/routes/crm-customers.js";
import { registerCrmDocumentRoutes } from "../src/routes/crm-documents.js";
import { registerInquiryRoutes } from "../src/routes/inquiries.js";
import { registerSalesCustomerRoutes } from "../src/routes/sales-customers.js";
import type { CurrentUser } from "../src/types.js";

if(!/^\(localdb\)\\IoTCrmCI_[a-f0-9]{16}$/.test(process.env.CRM_TEST_SERVER??""))throw Error("Private CRM LocalDB instance required");
const bridge=spawn("pwsh",["-NoProfile","-File",fileURLToPath(new URL("./helpers/crm-sql-bridge.ps1",import.meta.url))],{stdio:["pipe","pipe","inherit"],windowsHide:true});
const lines=createInterface({input:bridge.stdout});
type Result={recordset:Record<string,unknown>[];recordsets:Record<string,unknown>[][];output:Record<string,unknown>};
const queue:{resolve:(r:Result)=>void;reject:(e:Error)=>void}[]=[];
lines.on("line",line=>{const pending=queue.shift();if(!pending)return;try{const result=JSON.parse(line,(_key,value)=>value&&typeof value==="object"&&"__binary"in value?Buffer.from(value.__binary,"base64"):value&&typeof value==="object"&&"__date"in value?new Date(value.__date):value);if(result.error)pending.reject(new Error(result.error));else pending.resolve({...result,recordset:result.recordsets?.[0]??[]});}catch(error){pending.reject(error as Error);}});
bridge.on("exit",code=>{for(const pending of queue.splice(0))pending.reject(Error(`SQL bridge exited: ${code}`));});
function run(statement:string,request?:sql.Request,procedure=false):Promise<Result>{
 const parameters=Object.fromEntries(Object.entries(request?.parameters??{}).map(([name,p])=>{
   const type=(typeof p.type==="function"?p.type:p.type.type) as {name:string};
   const typeName=type.name;
   return [name,{type:typeName,length:p.length??(typeName==="NVarChar"?-1:undefined),output:p.io===2,...(Buffer.isBuffer(p.value)?{binary:p.value.toString("base64")}:{value:p.value??null})}];
 }));
 return new Promise((resolve,reject)=>{queue.push({resolve,reject});bridge.stdin.write(JSON.stringify({sql:statement,parameters,procedure})+"\n");});
}
const originalQuery=sql.Request.prototype.query,originalExecute=sql.Request.prototype.execute;
sql.Request.prototype.query=function(this:sql.Request,statement:string){return run(statement,this);} as typeof originalQuery;
sql.Request.prototype.execute=function(this:sql.Request,statement:string){return run(statement,this,true);} as typeof originalExecute;
const database={
 async query(statement:string,bind?:(q:sql.Request)=>void){const q=new sql.Request();bind?.(q);return run(statement,q);},
 async transaction<T>(fn:(tx:sql.Transaction)=>Promise<T>){await run("BEGIN TRANSACTION");try{const result=await fn(new sql.Transaction());await run("COMMIT");return result;}catch(error){await run("IF @@TRANCOUNT>0 ROLLBACK");throw error;}}
} as unknown as Database;
const storageRoot=await mkdtemp(resolve(tmpdir(),"iot-crm-docs-"));
async function cleanupStorage(){
 if(dirname(resolve(storageRoot))!==resolve(tmpdir())||!basename(storageRoot).startsWith("iot-crm-docs-"))throw Error("Unexpected CRM test storage path");
 await rm(storageRoot,{recursive:true,force:true});
}
const users=new CurrentUserService(database),config={businessTimeZone:"Asia/Bangkok",documentStorage:{mode:"Local",rootPath:storageRoot,maxFileSizeBytes:1048576}} as AppConfig;
const app=Fastify({forceCloseConnections:true});registerErrorHandler(app);
await app.register(multipart);
app.addHook("onError",async(_request,_reply,error)=>{if(!error.statusCode||error.statusCode>=500)console.error("CRM test route error:",error.message);});
let actors:CurrentUser[]=[];
let stopVisual: (()=>void)|undefined;
app.addHook("onRequest",async (request,reply)=>{
  const actor=actors.find(a=>a.name===(request.headers["x-test-actor"]??(process.env.CRM_VISUAL_TEST==="1"?"Admin":undefined)));if(actor)request.currentUser=actor;
  if(process.env.CRM_VISUAL_TEST==="1")reply.header("Access-Control-Allow-Origin","http://localhost:3000").header("Access-Control-Allow-Credentials","true").header("Access-Control-Allow-Headers","Content-Type").header("Access-Control-Allow-Methods","GET,POST,PUT,OPTIONS");
});
if(process.env.CRM_VISUAL_TEST==="1"){
 app.options("*",async(_request,reply)=>reply.code(204).send());
 app.get("/test-bootstrap",async()=>({user:actors.find(a=>a.name==="Admin"),team:actors,customers:(await run("SELECT id,code,name FROM dbo.customers WHERE code='CRM-INTEGRATION'")).recordset,permissions:(await run("SELECT code FROM dbo.permissions")).recordset.map(r=>r.code)}));
 app.post("/test-stop",async()=>{setTimeout(()=>stopVisual?.(),50);return {stopped:true};});
}
registerCrmRoutes(app,config,database,users);registerCrmCustomerRoutes(app,database,users);registerCrmDocumentRoutes(app,config,database,users);registerInquiryRoutes(app,config,database,users);registerSalesCustomerRoutes(app,database,users);
async function call(method:"GET"|"POST"|"PUT",url:string,actor="Sales",body?:unknown,status=200){const response=await app.inject({method,url:`/api/v1${url}`,headers:{"x-test-actor":actor},...(body?{payload:body}:{})});assert.equal(response.statusCode,status,`${method} ${url}: ${response.body}`);return response.json();}
try {
 await run(`INSERT dbo.users(entra_object_id,email,name,role_id,department) SELECT 'crm-api-'+v.name,'crm-api-'+v.name+'@example.invalid',v.name,r.id,v.department FROM (VALUES('Sales','Sales Engineer','Sales'),('Engineer','Engineer','Engineering'),('Other','Engineer','Other'),('Admin','Admin','Admin'))v(name,role,department) JOIN dbo.roles r ON r.code=v.role;`);
 actors=(await run("SELECT u.id,u.name,u.email,u.department,r.code role FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.email LIKE 'crm-api-%@example.invalid'")).recordset.map(r=>({id:Number(r.id),name:String(r.name),email:String(r.email),department:String(r.department),role:String(r.role),roles:[String(r.role)],isActive:true,entraObjectId:""}));
 const sales=actors.find(a=>a.name==="Sales")!,engineer=actors.find(a=>a.name==="Engineer")!;
 const customer=await call("POST","/sales/customers","Sales",{name:"CRM Integration Customer",code:"CRM-INTEGRATION"},201);
 const customerId=Number(customer.id);assert.ok(customerId);
 const site=await call("POST",`/crm/customers/${customerId}/sites`,"Sales",{name:"Factory",code:"FACTORY",country:"Thailand"},201);
 const contact=await call("POST",`/sales/customers/${customerId}/contacts`,"Sales",{nameEn:"Customer Engineer",siteId:site.id,email:"contact@example.invalid"},201);
 const op=await call("POST","/crm/opportunities","Sales",{name:"Vision system",customerId,siteId:site.id,contactId:contact.id,salesOwnerId:sales.id,technicalOwnerId:engineer.id,expectedValue:620000},201);
 assert.match(op.opportunityNo,/^OPP-CRM-INTEGRATION-\d{4}-\d+$/);assert.equal(Number(op.expectedValue),620000);
 const engineerDetail=await call("GET",`/crm/opportunities/${op.id}`,"Engineer");assert.equal(engineerDetail.opportunity.expectedValue,undefined);
 await call("GET",`/crm/opportunities/${op.id}`,"Other",undefined,404);
 assert.equal((await call("GET","/crm/opportunities?page=1&pageSize=30","Other")).total,0);
 assert.equal((await call("GET","/crm/opportunities?search=Vision","Engineer")).total,1);
 await call("PUT",`/crm/opportunities/${op.id}`,"Engineer",{rowVersion:op.rowVersion,stage:"WON"},403);
 await call("PUT",`/crm/opportunities/${op.id}`,"Sales",{rowVersion:op.rowVersion,stage:"LOST"},400);
 const updated=await call("PUT",`/crm/opportunities/${op.id}`,"Sales",{rowVersion:op.rowVersion,stage:"QUALIFICATION"});
 await call("PUT",`/crm/opportunities/${op.id}`,"Sales",{rowVersion:op.rowVersion,name:"Stale overwrite"},409);
 const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
 await call("POST","/crm/activities","Engineer",{customerId,opportunityId:op.id,contactId:contact.id,activityType:"Meeting",occurredAt:new Date().toISOString(),summary:"Customer requirements confirmed",nextAction:{action:"Send proposal",ownerId:sales.id,dueDate:yesterday}},201);
 const work=await call("GET","/crm/my-work","Sales");assert.equal(work.actions.length,1);assert.equal(work.actions[0].action,"Send proposal");
 assert.equal(work.actions[0].dueDate,yesterday);
 const dashboard=await call("GET","/crm/dashboard","Sales");assert.equal(Number(dashboard.Overdue),1);
 assert.equal((await call("GET","/crm/opportunities?attention=Overdue","Sales")).total,1);
 const converted=await call("POST","/inquiries","Sales",{opportunityId:op.id,opportunityRowVersion:updated.rowVersion,projectType:"IoT",dueDate:tomorrow},201);
 const source=await call("GET",`/crm/inquiries/${converted.id}/source`,"Engineer");assert.equal(source.id,op.id);
 await call("POST","/crm/activities","Other",{customerId,inquiryId:converted.id,activityType:"Note",occurredAt:new Date().toISOString(),summary:"Cross-scope reference"},422);
 const boundary="crm-fixture-boundary",fileBytes="CRM fixture document";
 const payload=`--${boundary}\r\nContent-Disposition: form-data; name="customerId"\r\n\r\n${customerId}\r\n--${boundary}\r\nContent-Disposition: form-data; name="opportunityId"\r\n\r\n${op.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="crm-test.txt"\r\nContent-Type: text/plain\r\n\r\n${fileBytes}\r\n--${boundary}--\r\n`;
 const upload=await app.inject({method:"POST",url:"/api/v1/crm/documents",headers:{"x-test-actor":"Engineer","content-type":`multipart/form-data; boundary=${boundary}`},payload});assert.equal(upload.statusCode,201,upload.body);
 const download=await app.inject({method:"GET",url:`/api/v1/crm/documents/${upload.json().id}/content`,headers:{"x-test-actor":"Sales"}});assert.equal(download.statusCode,200,download.body);assert.equal(download.body,fileBytes);
 await call("GET",`/crm/documents/${upload.json().id}/content`,"Other",undefined,404);
 const detail=await call("GET",`/crm/opportunities/${op.id}`,"Sales");assert.equal(detail.links[0].inquiryId,converted.id);assert.ok(detail.history.some((h:{action:string})=>h.action==="ConvertedToInquiry"));
 const inquiry=(await run(`SELECT customer_id,customer_site_id,customer_contact_id,project_name,estimate_owner_id FROM dbo.inquiries WHERE id=${Number(converted.id)}`)).recordset[0]!;
 assert.equal(Number(inquiry.customer_id),customerId);assert.equal(Number(inquiry.customer_site_id),site.id);assert.equal(Number(inquiry.customer_contact_id),contact.id);assert.equal(inquiry.project_name,"Vision system");assert.equal(Number(inquiry.estimate_owner_id),engineer.id);
 const c360=await call("GET",`/crm/customers/${customerId}`,"Sales");assert.equal(c360.inquiries.length,1);assert.ok(c360.contacts.length);assert.ok(c360.sites.length);
 const admin=actors.find(a=>a.name==="Admin")!;
 await run(`DECLARE @estimate bigint,@project bigint,@report bigint;
 INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,created_by,updated_by)
 VALUES('CRM-EST-FIXTURE',${converted.id},${customerId},'Service fixture','IoT',${engineer.id},CONVERT(date,GETUTCDATE()),CONVERT(date,GETUTCDATE()),'Approved',${admin.id},${admin.id});SET @estimate=SCOPE_IDENTITY();
 INSERT dbo.projects(project_no,name,customer_id,project_type,status,manager_id,lead_engineer_id,inquiry_id,estimate_id,po_no,po_date,start_date,target_delivery,folder_path,created_by,updated_by)
 VALUES('CRM-PROJECT-FIXTURE','Service fixture',${customerId},'IoT','Planning',${admin.id},${engineer.id},${converted.id},@estimate,'TEST-PO',GETUTCDATE(),GETUTCDATE(),GETUTCDATE(),'test',${admin.id},${admin.id});SET @project=SCOPE_IDENTITY();
 INSERT dbo.unified_reports(report_no,report_type,project_id,created_by) VALUES('CRM-SERVICE-FIXTURE','SERVICE',@project,${engineer.id});SET @report=SCOPE_IDENTITY();
 INSERT dbo.unified_report_revisions(report_id,revision,title,report_date,locale,body_json,prepared_by,approver_id) VALUES(@report,0,'Service visit',CONVERT(date,GETUTCDATE()),'en','{}',${engineer.id},${admin.id});`);
 const admin360=await call("GET",`/crm/customers/${customerId}`,"Admin");assert.equal(admin360.projects.length,1);assert.equal(admin360.service.length,1);assert.equal(admin360.service[0].reportNo,"CRM-SERVICE-FIXTURE");
 const other360=await call("GET",`/crm/customers/${customerId}`,"Other");assert.equal(other360.projects.length,0);assert.equal(other360.service.length,0);
 const historyYear=await call("GET",`/crm/customers/${customerId}?year=2001`,"Admin");assert.equal(historyYear.service.length,0);
 assert.equal((await call("GET",`/crm/activities?customerId=${customerId}&year=2001`,"Admin")).total,0);
 assert.equal((await call("GET",`/crm/documents?customerId=${customerId}&year=2001`,"Admin")).length,0);
 const options=await call("GET","/crm/options","Engineer");assert.equal(options.find((r:{kind:string;code:string})=>r.kind==="stage"&&r.code==="NEW").labelJa,"新規");
 const oldOption=options.find((r:{kind:string;code:string})=>r.kind==="stage"&&r.code==="NEW");await call("PUT","/crm/options/stage/NEW","Admin",{...oldOption,quietDays:9});
 assert.equal((await call("GET","/crm/options","Admin")).find((r:{kind:string;code:string})=>r.kind==="stage"&&r.code==="NEW").quietDays,9);
 await call("PUT",`/crm/customers/${customerId}`,"Sales",{...c360.customer,nameEn:"Customer renamed",nameTh:"ลูกค้าทดสอบ",nameJa:"試験顧客",accountOwnerId:sales.id});
 const contactMeta=c360.contacts.find((r:{id:number})=>r.id===contact.id);await call("PUT",`/crm/contacts/${contact.id}/metadata`,"Sales",{...contactMeta,contactRole:"Technical",note:"UAT contact"});
 await call("PUT",`/crm/customers/${customerId}/sites/${site.id}`,"Sales",{...site,name:"Factory renamed"});
 await call("GET","/crm/contacts?search=Customer","Sales");await call("GET",`/crm/activities?customerId=${customerId}`,"Sales");await call("GET",`/crm/documents?customerId=${customerId}`,"Engineer");
 const current=detail.opportunity;
 await call("PUT",`/crm/opportunities/${op.id}`,"Sales",{rowVersion:current.rowVersion,stage:"LOST",lostReason:"Other",lostDetail:"Customer postponed funding"});
 assert.equal((await call("GET","/crm/opportunities?stage=LOST","Sales")).total,1);
 assert.equal((await call("GET","/crm/my-work","Sales")).actions.length,0);
 console.log("CRM authenticated route/SQL integration passed: create, scopes, commercial redaction, stale update, activity + next action, My Work, dashboard, conversion + shared references, Customer 360, Lost and audit.");
 if(process.env.CRM_VISUAL_TEST==="1"){
  for(const [name,stage,value] of [["Vision inspection — phase 2","PROPOSAL",620000],["Factory traceability upgrade","REQUIREMENT",350000],["PLC line expansion","NEGOTIATION",180000]] as const)await call("POST","/crm/opportunities","Sales",{name,stage,customerId,salesOwnerId:sales.id,technicalOwnerId:engineer.id,expectedValue:value,expectedClose:tomorrow},201);
  await app.listen({host:"127.0.0.1",port:4601});console.log("Private CRM visual API ready at http://127.0.0.1:4601");await new Promise<void>(resolve=>{stopVisual=resolve;});
 }
} finally {
 await app.close();sql.Request.prototype.query=originalQuery;sql.Request.prototype.execute=originalExecute;
 bridge.stdin.end();await new Promise<void>(resolve=>{if(bridge.exitCode!==null)resolve();else bridge.once("exit",()=>resolve());});lines.close();
 await cleanupStorage();
}
