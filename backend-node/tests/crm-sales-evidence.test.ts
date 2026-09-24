import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import sql from "mssql";
import { inquiryEstimateOwner, salesEvidenceInput, validateSalesEvidence } from "../src/crm-sales-evidence.js";
import { crmAttention, crmDto, opportunityInput } from "../src/crm.js";
import { registerCrmRoutes } from "../src/routes/crm.js";
import { registerInquiryRoutes } from "../src/routes/inquiries.js";
import type { EmailService } from "../src/email.js";
import { registerErrorHandler } from "../src/errors.js";
import type { Database } from "../src/db.js";
import type { CurrentUserService } from "../src/users.js";
import type { AppConfig } from "../src/config.js";

const today="2026-09-24";
const input=(stage:string,extra:Record<string,unknown>={})=>({...salesEvidenceInput(extra),stage});

test("explicit estimator wins; an absent selection inherits the technical owner",()=>{
  assert.equal(inquiryEstimateOwner(22,11),22);
  assert.equal(inquiryEstimateOwner(undefined,11),11);
  assert.equal(inquiryEstimateOwner("",11),11);
  assert.equal(inquiryEstimateOwner(0,11),0); // invalid input must reach validation, not silently fall back
});

test("sales milestones require actual dated evidence, but old stages are not rewritten",()=>{
  for(const stage of ["PROPOSAL","NEGOTIATION","WON"]){
    assert.throws(()=>validateSalesEvidence(input(stage),null,today));
    assert.throws(()=>validateSalesEvidence(input(stage),{stage:"NEW"},today));
    assert.doesNotThrow(()=>validateSalesEvidence(input(stage),{stage},today));
  }
  assert.doesNotThrow(()=>validateSalesEvidence(input("PROPOSAL",{proposalSentOn:today,proposalReference:"QT-24 / sent by email"}),{stage:"ESTIMATING"},today));
  assert.doesNotThrow(()=>validateSalesEvidence(input("WON",{wonOn:today,wonReference:"PO-42"}),{stage:"NEGOTIATION"},today));
  for(const extra of [{proposalSentOn:today},{proposalReference:"QT-1"},{proposalSentOn:"2026-09-25",proposalReference:"QT-1"},{wonOn:today},{wonReference:"PO-1"}])
    assert.throws(()=>validateSalesEvidence(input("NEW",extra),null,today));
  assert.throws(()=>validateSalesEvidence(input("NEW"),{stage:"NEW",proposal_sent_on:today},today));
  assert.throws(()=>salesEvidenceInput({proposalSentOn:"2026-02-30"}));
});

test("quotation follow-up starts at dispatch, not internal approval or stage edits",()=>{
  const row={stage:"PROPOSAL",quiet_days:7,stage_changed_at:"2026-09-01",created_at:"2026-09-01",last_activity:"2026-09-01",next_action:"Call customer"};
  assert.ok(!crmAttention(row,today).includes("NeedsFollowup"));
  assert.ok(!crmAttention({...row,proposal_sent_on:"2026-09-23"},today).includes("NeedsFollowup"));
  assert.ok(crmAttention({...row,proposal_sent_on:"2026-09-10"},today).includes("NeedsFollowup"));
  assert.equal(crmDto({proposal_sent_on:new Date("2026-09-23T00:00:00Z")}).proposalSentOn,"2026-09-23");
});

for(const scenario of ["missing-evidence","valid-dispatch","stale","legacy-edit"] as const){
  test(`CRM update enforces evidence and concurrency: ${scenario}`,async t=>{
    const version=Buffer.alloc(8,1),statements:string[]=[];
    let saved:Record<string,unknown>|null=null;
    const before={id:7,opportunity_no:"OPP-7",name:"Job",customer_id:2,sales_owner_id:1,stage:scenario==="legacy-edit"?"PROPOSAL":"ESTIMATING",priority:"Normal",source:"DirectInquiry",row_version:version};
    t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
      statements.push(statement);
      if(statement.includes("SELECT o.*"))return {recordset:[before]};
      if(statement.includes("END valid"))return {recordset:[{valid:1}]};
      if(statement.includes("UPDATE dbo.crm_opportunities SET")){
        saved=Object.fromEntries(Object.entries(this.parameters).map(([key,p])=>[key,p.value]));
        return {recordset:[{...before,...saved}]};
      }
      return {recordset:[]};
    });
    const database={async query(){return {recordset:[{code:"crm.write"},{code:"crm.read.all"}]};},async transaction(action:(tx:object)=>Promise<unknown>){return action({});}} as unknown as Database;
    const users={async demandPermission(){},async required(){return {id:1,department:"Sales"};}} as unknown as CurrentUserService;
    const app=Fastify();registerErrorHandler(app);registerCrmRoutes(app,{businessTimeZone:"Asia/Bangkok"} as AppConfig,database,users);
    try{
      const response=await app.inject({method:"PUT",url:"/api/v1/crm/opportunities/7",payload:{stage:"PROPOSAL",rowVersion:Buffer.alloc(8,scenario==="stale"?2:1).toString("base64"),...(scenario==="valid-dispatch"?{proposalSentOn:"2020-01-01",proposalReference:"QT-7"}:{})}});
      assert.equal(response.statusCode,scenario==="missing-evidence"?422:scenario==="stale"?409:200,response.body);
      if(scenario==="missing-evidence"||scenario==="stale")assert.equal(saved,null);
      else {
        assert.ok(saved);
        assert.ok(statements.some(s=>s.includes("INSERT INTO dbo.audit_log")));
        if(scenario==="valid-dispatch")assert.equal((saved as Record<string,unknown>).proposalReference,"QT-7");
      }
    }finally{await app.close();}
  });
}

test("create input retains evidence so new advanced-stage records take the same guard",()=>{
  const value=opportunityInput({name:"Job",customerId:2,salesOwnerId:1,stage:"WON",wonOn:today,wonReference:"PO-7"},true);
  assert.doesNotThrow(()=>validateSalesEvidence(value,null,today));
  assert.equal(value.wonReference,"PO-7");
});

test("CRM conversion binds the estimator selected in the form instead of the source owner",async t=>{
  const version=Buffer.alloc(8,1);
  let owner:unknown;
  t.mock.method(sql.Request.prototype,"query",async function(this:sql.Request,statement:string){
    if(statement.includes("SELECT o.*"))return {recordset:[{id:7,name:"Job",customer_id:2,sales_owner_id:1,technical_owner_id:11,stage:"NEW",priority:"Normal",row_version:version}]};
    if(statement.includes("contact_name"))return {recordset:[{contact_name:"Buyer",sales_name:"Sales",site_address:"Site"}]};
    if(statement.includes("AS customer_valid")){
      owner=this.parameters.owner_id?.value;
      return {recordset:[{customer_valid:1,owner_valid:0}]}; // stop before numbering, inserts or notifications
    }
    return {recordset:[]};
  });
  const database={async query(){return {recordset:[{code:"crm.convert"},{code:"crm.read.all"}]};},async transaction(action:(tx:object)=>Promise<unknown>){return action({});}} as unknown as Database;
  const users={async demandPermission(){},async required(){return {id:1,department:"Sales"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerInquiryRoutes(app,{businessTimeZone:"Asia/Bangkok"} as AppConfig,database,users,{} as EmailService);
  try{
    const dueDate=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    const response=await app.inject({method:"POST",url:"/api/v1/inquiries",payload:{opportunityId:7,opportunityRowVersion:version.toString("base64"),estimateOwnerId:22,projectType:"Automation",dueDate}});
    assert.equal(response.statusCode,422,response.body);
    assert.equal(owner,22);
  }finally{await app.close();}
});

test("CRM list redacts linked inquiry metadata without inquiry permission",async()=>{
  let statement="";
  const database={async query(query:string){
    if(query.includes("user_effective_permissions"))return {recordset:[{code:"crm.read"}]};
    statement=query;
    return {recordset:[{id:7,name:"Job",stage:"NEW",inquiry_id:9,inquiry_no:"INQ-9",inquiry_status:"Approved",total_count:1}]};
  }} as unknown as Database;
  const users={async demandPermission(){},async required(){return {id:1,department:"Sales"};}} as unknown as CurrentUserService;
  const app=Fastify();registerErrorHandler(app);registerCrmRoutes(app,{businessTimeZone:"Asia/Bangkok"} as AppConfig,database,users);
  try{
    const response=await app.inject({method:"GET",url:"/api/v1/crm/opportunities?attention=Actionable"});
    assert.equal(response.statusCode,200,response.body);
    assert.equal(response.json().items[0].inquiryId,undefined);
    assert.equal(response.json().items[0].inquiryNo,undefined);
    assert.match(statement,/@attention='Actionable'/);
  }finally{await app.close();}
});
