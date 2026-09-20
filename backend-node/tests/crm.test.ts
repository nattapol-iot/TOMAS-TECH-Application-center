import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import type { AppConfig } from "../src/config.js";
import { ApiError, registerErrorHandler } from "../src/errors.js";
import { crmAttention, crmDto, opportunityInput, followupInput, scopedOpportunity, bindAccess, CRM_STAGES } from "../src/crm.js";
import { registerCrmRoutes } from "../src/routes/crm.js";
import { registerCrmCustomerRoutes } from "../src/routes/crm-customers.js";
import { registerCrmDocumentRoutes } from "../src/routes/crm-documents.js";
import { registerInquiryRoutes } from "../src/routes/inquiries.js";
import sql from "mssql";

const base={name:"Vision inspection",customerId:1,salesOwnerId:2,stage:"NEW"};
test("quick creation needs only customer, name and sales owner; no next action is required",()=>{
 const value=opportunityInput(base,true);assert.equal(value.expectedValue,null);assert.equal(value.stage,"NEW");
 for(const change of [{name:""},{customerId:0},{salesOwnerId:0}])assert.throws(()=>opportunityInput({...base,...change},true),ApiError);
});
test("opportunity accepts an optional end user from the shared customer master",()=>{
 assert.equal(opportunityInput(base,true).endUserCustomerId,null);
 assert.equal(opportunityInput({...base,endUserCustomerId:42},true).endUserCustomerId,42);
 for(const endUserCustomerId of [0,-1,1.5,"invalid"])assert.throws(()=>opportunityInput({...base,endUserCustomerId},true),ApiError);
});
test("stable stages and Lost reason rules",()=>{
 for(const stage of CRM_STAGES) if(stage!=="LOST")assert.equal(opportunityInput({...base,stage},true).stage,stage);
 for(const change of [{stage:"LOST"},{stage:"LOST",lostReason:"Other"},{stage:"Unknown"}])assert.throws(()=>opportunityInput({...base,...change},true),ApiError);
 assert.equal(opportunityInput({...base,stage:"LOST",lostReason:"Other",lostDetail:"Budget moved to next year"},true).lostReason,"Other");
});
test("commercial values and dates validate without modifying estimate calculations",()=>{
 for(const value of [-1,Infinity,"NaN",1e18])assert.throws(()=>opportunityInput({...base,expectedValue:value},true),ApiError);
 assert.equal(opportunityInput({...base,expectedValue:620000},true).expectedValue,620000);
 assert.equal(opportunityInput({...base,expectedValue:620000},false).expectedValue,null);
 assert.throws(()=>opportunityInput({...base,expectedClose:"2026-02-30"},true),ApiError);
 assert.equal(opportunityInput({...base,expectedClose:"2026-10-31"},true).expectedClose,"2026-10-31");
});
test("commercial read redacts value and audit payloads; dates and ids round trip",()=>{
 const dto=crmDto({id:"42",owner_id:"3",expected_value:999,total:888,before_json:"secret",after_json:"secret",due_date:new Date("2026-09-20T00:00:00Z"),row_version:Buffer.alloc(8)},false);
 assert.equal(dto.id,42);assert.equal(dto.ownerId,3);assert.equal(dto.dueDate,"2026-09-20");assert.equal(dto.rowVersion,Buffer.alloc(8).toString("base64"));
 for(const key of ["expectedValue","total","beforeJson","afterJson"])assert.equal(dto[key],undefined);
});
test("follow-up validates owner, date and status; stale/invalid lifecycle cannot be injected",()=>{
 const valid={action:"Call customer",ownerId:2,dueDate:"2026-09-20"};assert.equal(followupInput(valid).status,"Open");
 for(const change of [{ownerId:0},{dueDate:"tomorrow"},{status:"Approved"},{action:""}])assert.throws(()=>followupInput({...valid,...change}),ApiError);
});
test("attention covers missing actions, inactivity, overdue and stage-specific dates without changing stage",()=>{
 const row={stage:"NEW",created_at:"2026-09-10",quiet_days:5};const flags=crmAttention(row,"2026-09-19");
 assert.ok(flags.includes("NeedsFollowup"));assert.ok(flags.includes("NoNextAction"));assert.ok(flags.includes("NoActivity"));assert.equal(row.stage,"NEW");
 assert.ok(crmAttention({...row,next_action:"Call",next_due:"2026-09-18",next_status:"WaitingCustomer"},"2026-09-19").includes("Overdue"));
 assert.ok(crmAttention({...row,next_action:"Call",next_due:"2026-09-19"},"2026-09-19").includes("DueToday"));
 assert.ok(crmAttention({...row,stage:"PROPOSAL",stage_changed_at:"2026-09-10",last_activity:"2026-09-19",quiet_days:7},"2026-09-19").includes("NeedsFollowup"));
 assert.ok(crmAttention({...row,stage:"ESTIMATING",quiet_days:null,estimate_due:"2026-09-20"},"2026-09-19").includes("NeedsFollowup"));
 for(const stage of ["WON","LOST","ON_HOLD"])assert.deepEqual(crmAttention({...row,stage},"2026-09-19"),[]);
});
test("scope query binds actor/team/all and rejects an inaccessible opportunity",async()=>{
 const parameters=new Map<string,unknown>();let statement="";
 const q={input(key:string,_type:unknown,value:unknown){parameters.set(key,value);return this;},async query(query:string){statement=query;return {recordset:[]};}} as unknown as sql.Request;
 bindAccess(q,{id:7,department:"Engineering",permissions:["crm.read","crm.read.team"]});
 await assert.rejects(()=>scopedOpportunity(q,55,true),e=>e instanceof ApiError&&e.statusCode===404);
 assert.equal(parameters.get("actor"),7);assert.equal(parameters.get("all"),false);assert.equal(parameters.get("team"),true);
 assert.match(statement,/UPDLOCK,HOLDLOCK/);assert.match(statement,/sales_owner_id=@actor/);assert.match(statement,/technical_owner_id=@actor/);assert.match(statement,/team_owner.department=@department/);
});
test("CRM endpoints and conversion reject unauthorized callers before SQL access",async()=>{
 let touched=false;const database={query(){touched=true;throw Error("Unexpected SQL");},transaction(){touched=true;throw Error("Unexpected SQL");}} as unknown as Database;
 const users={async demandPermission(){throw new ApiError(403,"permission_denied","Denied");},async required(){throw Error("Unexpected actor access");}} as unknown as CurrentUserService;
 const config={businessTimeZone:"Asia/Bangkok"} as AppConfig;
 const app=Fastify();registerErrorHandler(app);registerCrmRoutes(app,config,database,users);registerCrmCustomerRoutes(app,database,users);registerCrmDocumentRoutes(app,config,database,users);registerInquiryRoutes(app,config,database,users);
 try{
  const paths=["/crm/dashboard","/crm/options","/crm/opportunities","/crm/opportunities/1","/crm/customers","/crm/customers/1","/crm/contacts","/crm/activities","/crm/my-work","/crm/documents","/crm/documents/1/content","/crm/inquiries/1/source"];
  for(const path of paths){const response=await app.inject({method:"GET",url:`/api/v1${path}`});assert.equal(response.statusCode,403,path);}
  for(const path of ["/crm/opportunities","/crm/activities","/crm/opportunities/1/followups","/crm/customers/1/sites"]){const r=await app.inject({method:"POST",url:`/api/v1${path}`,payload:{}});assert.equal(r.statusCode,403,path);}
  for(const path of ["/crm/opportunities/1","/crm/opportunities/1/followups/1","/crm/customers/1","/crm/contacts/1/metadata","/crm/options/stage/NEW"]){const r=await app.inject({method:"PUT",url:`/api/v1${path}`,payload:{}});assert.equal(r.statusCode,403,path);}
  assert.equal((await app.inject({method:"POST",url:"/api/v1/inquiries",payload:{opportunityId:1}})).statusCode,403);assert.equal(touched,false);
 }finally{await app.close();}
});
