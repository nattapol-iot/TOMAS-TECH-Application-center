// Explicit SQL integration entry point (not part of the fast unit-test glob).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createSqlIntegrationConfig } from "./sql-integration-config.js";

const sqlTest=createSqlIntegrationConfig("Overhead");
const name=sqlTest.databaseName;
assert.match(name,/^IoTTeamCenter_OverheadCI_[a-f0-9]{32}$/);
const sqlArgs=sqlTest.sqlcmdArgs;
const run=(statement:string)=>execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-Q",statement],{...sqlTest.sqlcmdOptions,encoding:"utf8"});
const storageRoot=sqlTest.storageRoot;
let application:Awaited<ReturnType<typeof buildApp>>|undefined;

try {
  execFileSync("sqlcmd",[...sqlArgs,"-i",sqlTest.freshDatabaseScript,"-v",`DatabaseName=${name}`],sqlTest.sqlcmdOptions);
  run(`DECLARE @adminRole bigint=(SELECT id FROM dbo.roles WHERE code=N'Admin'),@engineerRole bigint=(SELECT id FROM dbo.roles WHERE code=N'Engineer'),
      @managerRole bigint=(SELECT id FROM dbo.roles WHERE code=N'Engineering Manager');
    INSERT dbo.users(entra_object_id,email,name,role_id,department) VALUES
      (N'overhead-admin',N'admin@overhead.test',N'Overhead Admin',@adminRole,N'IoT'),
      (N'overhead-engineer',N'engineer@overhead.test',N'Overhead Engineer',@engineerRole,N'IoT'),
      (N'overhead-manager',N'manager@overhead.test',N'Overhead Manager',@managerRole,N'IoT');
    DECLARE @admin bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'overhead-admin');
    INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'OH-CI',N'Overhead CI customer',@admin,@admin);
    INSERT dbo.engineering_rates(level,department,engineering_hourly,engineering_daily,installation_hourly,installation_daily,effective_from,created_by)
      VALUES(N'Engineer',N'IoT',100,800,120,960,'2020-01-01',@admin);`);
  const rolePassword=randomUUID().replaceAll("-","");
  run(`CREATE APPLICATION ROLE overhead_ci_role WITH PASSWORD='${rolePassword}';`);
  execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-i",sqlTest.applicationLoginScript,"-v",`DatabaseName=${name}`,"AppLogin=overhead_ci_role"],sqlTest.sqlcmdOptions);
  const config:AppConfig={environment:"development",host:"127.0.0.1",port:0,allowedHosts:["localhost"],corsOrigins:["http://localhost:3000"],
    businessTimeZone:"Asia/Bangkok",auth:{mode:"Development"},database:{connectionString:sqlTest.connectionString,trustServerCertificate:true,applicationRoleName:"overhead_ci_role",applicationRolePassword:rolePassword},
    documentStorage:{mode:"Local",rootPath:storageRoot,maxFileSizeBytes:10_000_000},email:{mode:"Disabled"},pdfParserUrl:"http://pdf-parser:8000"};
  application=await buildApp(config); const {app,database}=application;
  const users=Object.fromEntries((await database.query<{id:number;entra_object_id:string}>("SELECT id,entra_object_id FROM dbo.users WHERE entra_object_id LIKE N'overhead-%'")).recordset.map(row=>[row.entra_object_id,Number(row.id)]));
  const customerId=Number((await database.query<{id:number}>("SELECT id FROM dbo.customers WHERE code=N'OH-CI'")).recordset[0]!.id);
  const today=new Date(Date.now()+7*60*60*1000).toISOString().slice(0,10); const due=new Date(Date.now()+14*86_400_000).toISOString().slice(0,10);
  async function api(actor:string,method:"GET"|"POST",url:string,payload?:object,expected=200){const response=await app.inject({method,url,headers:{"x-dev-user-id":`overhead-${actor}`},...(payload?{payload}:{})});assert.equal(response.statusCode,expected,response.body);return response.json();}
  async function inquiry(suffix:string){
    const row=(await database.query<{id:number}>(`INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,contact,project_name,project_type,sales_owner,estimate_owner_id,due_date,priority,status,progress,created_by,updated_by)
      OUTPUT inserted.id VALUES(N'INQ-OH-${suffix}',@today,@customer,N'TEST',N'Overhead ${suffix}',N'IoT',N'Overhead Engineer',@owner,@due,N'Normal',N'New',0,@admin,@admin);`,request=>request.input("today",today).input("customer",customerId).input("owner",users["overhead-engineer"]).input("due",due).input("admin",users["overhead-admin"]))).recordset[0]!;
    return Number(row.id);
  }
  async function estimate(inquiryId:number){
    const item=await api("engineer","POST","/api/v1/estimates",{inquiryId,ownerId:users["overhead-engineer"],contingencyRate:5,dueDate:due},201);
    const effort=await api("engineer","POST",`/api/v1/estimates/${item.id}/manhour-lines`,{estimateRowVersion:item.rowVersion,package:"TEST",activity:"Design",department:"IoT",level:"Engineer",costType:"Engineering",provider:"Internal",supplierId:null,quotationNumber:null,priceDate:null,engineers:1,manDays:1,hoursPerDay:8,dailyRate:0,ownerId:users["overhead-engineer"],remark:"TEST ONLY"},201);
    return {...item,rowVersion:effort.estimateRowVersion};
  }

  let missing=await estimate(await inquiry("MISSING"));
  let workspace=await api("engineer","GET",`/api/v1/estimates/${missing.id}/cost-workspace`);
  assert.equal(workspace.header.overhead.state,"Missing"); assert.equal(workspace.header.totals.overhead,null);
  assert.ok(workspace.validationIssues.some((issue:{code:string;severity:string})=>issue.code==="overhead_policy_missing"&&issue.severity==="Warning"));
  const policy=await api("admin","POST","/api/v1/overhead-policies",{monthlyBudget:60_000,normalDirectHours:400,effectiveFrom:today,reason:"TEST ONLY budget divided by normal direct hours"},201);
  assert.equal(policy.hourlyRate,150); assert.equal((await api("engineer","GET","/api/v1/overhead-policies")).activePolicyId,policy.id);
  missing=await api("engineer","POST",`/api/v1/estimates/${missing.id}/submit`,{rowVersion:missing.rowVersion,comment:"TEST ONLY draft stays missing after policy creation"});
  assert.equal(missing.status,"Engineering Review");
  const frozenMissing=(await database.query<{snapshot_json:string;snapshot_sha256:string}>(`SELECT snapshot_json,snapshot_sha256 FROM dbo.estimate_submission_snapshots WHERE estimate_id=${missing.id} AND revision=0`)).recordset[0]!;
  assert.equal(JSON.parse(frozenMissing.snapshot_json).totals.overheadState,"Missing"); assert.match(frozenMissing.snapshot_sha256,/^[a-f0-9]{64}$/);
  assert.equal(Number((await database.query<{count:number}>(`SELECT COUNT(*) count FROM dbo.estimate_overhead_snapshots WHERE estimate_id=${missing.id}`)).recordset[0]!.count),0);
  let applied=await estimate(await inquiry("APPLIED"));
  workspace=await api("engineer","GET",`/api/v1/estimates/${applied.id}/cost-workspace`);
  assert.deepEqual({state:workspace.header.overhead.state,hours:workspace.header.overhead.eligibleDirectHours,rate:workspace.header.overhead.hourlyRate,amount:workspace.header.overhead.amount},
    {state:"Applied",hours:8,rate:150,amount:1200});
  assert.equal(workspace.header.totals.subtotal,800); assert.equal(workspace.header.totals.contingency,40); assert.equal(workspace.header.totals.total,2040);
  applied=await api("engineer","POST",`/api/v1/estimates/${applied.id}/submit`,{rowVersion:applied.rowVersion,comment:"TEST ONLY with overhead"});
  await api("manager","POST",`/api/v1/estimates/${applied.id}/approve`,{rowVersion:applied.rowVersion,comment:"TEST ONLY approved"});
  const approved=(await database.query<{total:number;description:string}>(`SELECT total,description FROM dbo.estimate_revisions WHERE estimate_id=${applied.id} AND revision=0`)).recordset[0]!;
  assert.equal(Number(approved.total),2040); assert.equal(JSON.parse(approved.description).totals.overhead,1200);
  const inquiryDetail=await api("engineer","GET",`/api/v1/inquiries/${await database.query<{id:number}>(`SELECT inquiry_id id FROM dbo.estimates WHERE id=${applied.id}`).then(result=>Number(result.recordset[0]!.id))}`);
  assert.equal(inquiryDetail.estimate.overheadState,"Applied"); assert.equal(inquiryDetail.estimate.overheadTotal,1200); assert.equal(inquiryDetail.estimate.total,2040);
  const project=await api("admin","POST","/api/v1/projects",{estimateId:applied.id,purchaseOrderNumber:"TEST-OH-PO",purchaseOrderDate:today,
    managerId:users["overhead-manager"],leadEngineerId:users["overhead-engineer"],startDate:today,targetDelivery:due,site:"TEST ONLY"},201);
  const carried=(await database.query<{storage_key:string}>(`SELECT storage_key FROM dbo.project_docs WHERE project_id=${project.id} AND document_type=N'Estimate cost' AND deleted_at IS NULL`)).recordset[0]!;
  const carriedText=readFileSync(resolve(storageRoot,carried.storage_key),"utf8");
  const carriedEstimate=JSON.parse(carriedText.slice(carriedText.indexOf("{")));
  assert.equal(Number(carriedEstimate.total),2040); assert.equal(Number(carriedEstimate.overhead_total),1200); assert.equal(Number(carriedEstimate.overhead_policy_version),1);
  console.log("OVERHEAD INTEGRATION PASSED: missing policy remains an explicit warning, active policy snapshots per revision, totals preserve contingency basis, submit freezes full evidence, approval and Project handover preserve total and policy provenance.");
} finally {
  if(application){await application.app.close();await application.database.close();}
  execFileSync("sqlcmd",[...sqlArgs,"-d","master","-Q",`IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END;`],sqlTest.sqlcmdOptions);
  rmSync(storageRoot,{recursive:true,force:true});
}
