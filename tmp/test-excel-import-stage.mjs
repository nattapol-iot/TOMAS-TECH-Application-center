import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from "file:///C:/Work/002.%20Project/99999.%20TOMAS%20TECH/02.%20IoT%20Team%20application/.claude/worktrees/estimate-cost-management-ui-632fcb/backend-node/tmp/excel-import-stage-1788693821572/dist/src/app.js";
import { parseEstimateWorkbook } from '../lib/estimate-excel-import.ts';
const name='IoTTeamCenter_ExcelImport_UAT_20260906';
assert.match(name,/^IoTTeamCenter_ExcelImport_UAT_/);
const application=await buildApp({environment:'development',host:'127.0.0.1',port:0,allowedHosts:['localhost'],corsOrigins:['http://localhost:3000'],businessTimeZone:'Asia/Bangkok',auth:{mode:'Development'},database:{connectionString:`Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`,trustServerCertificate:true},documentStorage:{mode:'Local',rootPath:resolve('tmp/excel-import-uat-documents'),maxFileSizeBytes:10000000},email:{mode:'Disabled'}});
const {app,database:db}=application;
let count=0;
const tag=randomUUID().slice(0,8);
async function api(url,payload,status=200,actor='admin',method=payload?'POST':'GET') {const r=await app.inject({url,method,headers:{'x-dev-user-id':`excel-${tag}-${actor}`},...(payload?{payload}:{})});assert.equal(r.statusCode,status,`${method} ${url}: ${r.body}`);count++;return r.json();}
try {
 await db.query(`INSERT dbo.users(entra_object_id,email,name,role_id) SELECT N'excel-${tag}-'+v.actor,N'excel-${tag}-'+v.actor+N'@test.invalid',N'TEST ONLY Excel '+v.actor,r.id FROM (VALUES(N'admin',N'Admin'),(N'outsider',N'Engineer'),(N'sales',N'Sales Engineer'))v(actor,role) JOIN dbo.roles r ON r.code=v.role;`);
 const actor=Number((await db.query(`SELECT id FROM dbo.users WHERE entra_object_id=N'excel-${tag}-admin'`)).recordset[0].id);
 const customer=Number((await db.query(`INSERT dbo.customers(code,name,created_by,updated_by) OUTPUT inserted.id VALUES(N'XL-${tag}',N'TEST ONLY Excel customer',${actor},${actor});`)).recordset[0].id);
 async function createEstimate(suffix) {const inquiry=Number((await db.query(`INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by) OUTPUT inserted.id VALUES(N'XL-${tag}-${suffix}',CONVERT(date,GETUTCDATE()),${customer},N'TEST ONLY Excel',N'IoT',${actor},'2027-01-01',N'Normal',N'Estimating',${actor},${actor});`)).recordset[0].id);return Number((await db.query(`INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,created_by,updated_by) OUTPUT inserted.id VALUES(N'XL-${tag}-${suffix}',${inquiry},${customer},N'TEST ONLY Excel',N'IoT',${actor},CONVERT(date,GETUTCDATE()),'2027-01-01',N'Draft',${actor},${actor});`)).recordset[0].id);}
 const version=async id=>(await db.query(`SELECT row_version FROM dbo.estimates WHERE id=${id}`)).recordset[0].row_version.toString('base64');
 const howa=parseEstimateWorkbook(JSON.parse(readFileSync('tmp/pj260022-parser-fixture.json','utf8')),'HOWA.xlsx');
 const toyo=parseEstimateWorkbook(JSON.parse(readFileSync('tmp/pj260035-parser-fixture.json','utf8')),'TOYO_R3.xlsx');
 for(const [label,p,expected] of [['HOWA',howa,60950],['TOYO',toyo,618944.01]]) {
  assert.deepEqual(p.errors,[]);const id=await createEstimate(label);
  const payload={sourceName:`${label}.xlsx`,sourceDate:p.sourceDate,sourceTotal:p.sourceTotal,hoursPerDay:8,sourceRevision:p.sourceRevision,lines:p.lines,estimateRowVersion:await version(id)};
  await api(`/api/v1/estimates/${id}/excel-import`,payload,403,'outsider');
  const imported=await api(`/api/v1/estimates/${id}/excel-import`,payload,201);
  const again=await api(`/api/v1/estimates/${id}/excel-import`,payload);assert.equal(again.alreadyImported,true);
  const totals=(await db.query(`SELECT * FROM dbo.v_estimate_totals WHERE estimate_id=${id}`)).recordset[0];assert.ok(Math.abs(Number(totals.total)-expected)<.011,JSON.stringify(totals));
  const mh=(await db.query(`SELECT * FROM dbo.manhour_lines WHERE estimate_id=${id}`)).recordset;assert.equal(mh.length,p.lines.filter(l=>l.kind==='manhour').length);
  let validation=await api(`/api/v1/estimates/${id}/validation`);assert.ok(!validation.issues.some(x=>['internal_rate_mismatch','engineering_manhour_required'].includes(x.code)),JSON.stringify(validation));
  const m=mh[0];
  await api(`/api/v1/estimates/${id}/manhour-lines/${m.id}`,{estimateRowVersion:await version(id),lineRowVersion:m.row_version.toString('base64'),package:m.package,activity:m.activity,department:m.department,level:m.level,costType:m.cost_type,provider:'Internal',supplierId:null,quotationNumber:null,priceDate:p.sourceDate,engineers:1,manDays:Number(m.man_days)+1,hoursPerDay:8,dailyRate:1,ownerId:actor,remark:'TEST ONLY quantity change'},200,'admin','PUT');
  const afterEdit=(await db.query(`SELECT daily_rate,price_date FROM dbo.manhour_lines WHERE id=${m.id}`)).recordset[0];assert.equal(Number(afterEdit.daily_rate),Number(m.daily_rate));assert.equal(afterEdit.price_date.toISOString().slice(0,10),p.sourceDate);
  await db.query(`UPDATE dbo.manhour_lines SET man_days=man_days-1 WHERE id=${m.id}`);
  const changed={...payload,estimateRowVersion:await version(id),lines:payload.lines.map((l,i)=>i===0?{...l,remark:'changed'}:l)};
  await api(`/api/v1/estimates/${id}/excel-import`,changed,409);
  await db.query(`UPDATE dbo.manhour_lines SET daily_rate=daily_rate+1 WHERE id=${mh[0].id}`);
  validation=await api(`/api/v1/estimates/${id}/validation`);assert.ok(validation.issues.some(x=>x.code==='internal_rate_mismatch'));
  await db.query(`UPDATE dbo.manhour_lines SET daily_rate=daily_rate-1 WHERE id=${mh[0].id};UPDATE dbo.estimates SET status=N'Locked' WHERE id=${id}`);
  await api(`/api/v1/estimates/${id}/excel-import`,{...changed,estimateRowVersion:await version(id)},409);
  await api(`/api/v1/estimates/${id}/create-revision`,{rowVersion:await version(id),comment:'TEST ONLY clone imported rates'});
  validation=await api(`/api/v1/estimates/${id}/validation`);assert.ok(!validation.issues.some(x=>x.code==='internal_rate_mismatch'),JSON.stringify(validation));
  assert.equal((await api(`/api/v1/estimates/${id}/excel-imports`))[0].references.length,p.lines.filter(l=>l.kind==='reference').length);
  const removable=(await db.query(`SELECT TOP(1) id,row_version FROM dbo.manhour_lines WHERE estimate_id=${id} AND revision=1`)).recordset[0];
  await api(`/api/v1/estimates/${id}/manhour-lines/${removable.id}/remove`,{estimateRowVersion:await version(id),lineRowVersion:removable.row_version.toString('base64'),reason:'TEST ONLY remove imported line'});
  assert.equal(imported.created.length,p.lines.filter(l=>l.kind!=='reference').length);
 }
 const id=await createEstimate('rollback');const p=howa;
 const lines=p.lines.filter(l=>l.kind==='cost').slice(0,2).map((l,i)=>i===1?{...l,supplierId:99999999}:l);
 let payload={sourceName:'Rollback.xlsx',sourceDate:p.sourceDate,sourceTotal:Math.round(lines.reduce((s,l)=>s+l.quantity*l.unitCost,0)*100)/100,hoursPerDay:8,lines,estimateRowVersion:await version(id)};
 await api(`/api/v1/estimates/${id}/excel-import`,payload,400);
 assert.equal(Number((await db.query(`SELECT COUNT(*) n FROM dbo.cost_items WHERE estimate_id=${id}`)).recordset[0].n),0);
 await db.query(`UPDATE dbo.estimates SET updated_at=SYSUTCDATETIME() WHERE id=${id}`);
 await api(`/api/v1/estimates/${id}/excel-import`,payload,409);
 console.log(`PASS ${count} API checks; real workbook totals, owner permission, idempotency, transaction rollback, stale version, locked revision, clone provenance and tampered rate rejection.`);
}finally {await app.close();await db.close();}

