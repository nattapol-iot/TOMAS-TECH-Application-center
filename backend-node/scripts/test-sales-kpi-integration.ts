import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {Database} from '../src/db.js';
import {CurrentUserService} from '../src/users.js';
import {registerPerformanceRoutes} from '../src/routes/performance.js';
import {registerErrorHandler} from '../src/errors.js';
// Requires a disposable database provisioned by the fresh migration runner.
const name=process.env.KPI_UAT_DATABASE ?? '';
assert.match(name,/^IoTTeamCenter_SalesKpi_UAT_[0-9_]+$/);
const db=new Database({connectionString:`Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`,trustServerCertificate:true});
const app=Fastify({logger:true}),tag=randomUUID().slice(0,8);
app.addHook('onRequest',async req=>{req.identity={mode:'Development',value:`kpi-${tag}-${String(req.headers['x-test-actor']??'sales')}`,partitionKey:'isolated-kpi'};});
registerErrorHandler(app);registerPerformanceRoutes(app,db,new CurrentUserService(db));
let checks=0;
async function api(actor:string,url:string,method:'GET'|'POST'|'PUT'='GET',payload?:object,status=200){
 const r=await app.inject({method,url,headers:{'x-test-actor':actor},...(payload?{payload}:{})});
 assert.equal(r.statusCode,status,`${actor} ${method} ${url}: ${r.body}`);checks++;return r.json();
}
try{
 const ids:Record<string,{id:number,employee:number}>={};
 for(const [label,role]of [['sales','Sales Engineer'],['peer','Sales Engineer'],['manager','Sales Manager'],['engineering','Engineering Manager'],['admin','Admin']]){
  const id=Number((await db.query<{id:number}>(`INSERT dbo.users(entra_object_id,email,name,role_id) OUTPUT inserted.id SELECT N'kpi-${tag}-${label}',N'kpi-${tag}-${label}@test.invalid',N'TEST ONLY KPI ${label}',id FROM dbo.roles WHERE code=N'${role}'`)).recordset[0]!.id);
  const employee=Number((await db.query<{id:number}>(`INSERT dbo.employees(employee_no,name_en,department,job_title,email,start_work_date,position,user_id,created_by,updated_by) OUTPUT inserted.id VALUES(${id+10000},N'TEST ONLY KPI ${label}',N'UAT',N'UAT',N'kpi-${tag}-${label}@test.invalid','2026-01-01',N'UAT',${id},${id},${id})`)).recordset[0]!.id);
  ids[label!]={id,employee};
 }
 const cycle=(await api('manager','/api/v1/performance/cycles','POST',{code:`UAT-${tag}`,name:'TEST ONLY Sales KPI',periodStart:'2026-07-01',periodEnd:'2026-12-31',reviewDueDate:'2027-01-10'},201)).id;
 const url=(actor:string)=>`/api/v1/performance/assessments/${ids[actor]!.employee}`;
 const overview=(actor:string)=>api(actor,`/api/v1/performance/overview?cycleId=${cycle}`);
 const own=await overview('sales');assert.equal(own.assessments.length,1);assert.equal(own.assessments[0].frameworkCode,'SALES');
 const mgr=await overview('manager');assert.ok(mgr.assessments.length>=3);assert.ok(mgr.assessments.every((r:any)=>r.frameworkCode==='SALES'));
 const evidence=await api('sales',`/api/v1/performance/evidence/${ids.sales!.employee}?cycleId=${cycle}`);assert.equal(evidence.frameworkCode,'SALES');assert.ok(evidence.areas.every((a:any)=>a.suggestedScore===null));
 await api('peer',`/api/v1/performance/evidence/${ids.sales!.employee}?cycleId=${cycle}`,'GET',undefined,403);
 await api('engineering',`/api/v1/performance/evidence/${ids.sales!.employee}?cycleId=${cycle}`,'GET',undefined,403);
 const payload={cycleId:cycle,summary:'UAT summary',developmentGoal:'UAT support plan',scores:['PIPELINE','CUSTOMER','FORECAST','COMMERCIAL','HANDOVER'].map(areaCode=>({areaCode,score:3,evidence:''})),submit:false};
 await api('sales',url('sales'),'PUT',{...payload,submit:true,scores:payload.scores.map(s=>({...s,score:5}))},400);
 await api('manager',url('sales'),'PUT',payload,409);
 let draft=await api('sales',url('sales'),'PUT',{...payload,scores:payload.scores.map(s=>({...s,score:0}))});assert.equal(draft.status,'SELF_REVIEW');
 const partial=(await overview('sales')).assessments[0];assert.ok(partial.selfScores.every((s:any)=>s===null));
 await api('sales',url('sales'),'PUT',{...payload,rowVersion:draft.rowVersion,submit:true,scores:payload.scores.map(s=>({...s,score:0}))},400);
 const firstVersion=draft.rowVersion;
 draft=await api('sales',url('sales'),'PUT',{...payload,rowVersion:draft.rowVersion});
 await api('sales',url('sales'),'PUT',{...payload,rowVersion:firstVersion},409);
 const submitted=await api('sales',url('sales'),'PUT',{...payload,rowVersion:draft.rowVersion,submit:true});assert.equal(submitted.status,'MANAGER_REVIEW');
 await api('sales',url('sales'),'PUT',{...payload,rowVersion:submitted.rowVersion},409);
 await api('engineering',url('sales'),'PUT',{...payload,rowVersion:submitted.rowVersion},403);
 const reviewPayload={...payload,summary:'Private manager rationale',scores:payload.scores.map(s=>({...s,score:4,evidence:'Private manager evidence'}))};
 let manager=await api('manager',url('sales'),'PUT',{...reviewPayload,rowVersion:submitted.rowVersion});
 let visible=(await overview('sales')).assessments[0];assert.ok(visible.managerScores.every((s:any)=>s===null));assert.ok(visible.managerEvidence.every((s:any)=>s===''));assert.equal(visible.managerSummary,'');
 manager=await api('manager',url('sales'),'PUT',{...reviewPayload,rowVersion:manager.rowVersion,submit:true});
 const completed=await api('manager',`${url('sales')}/complete`,'POST',{cycleId:cycle,rowVersion:manager.rowVersion,calibrationNote:'Reviewed against actual context'});assert.equal(completed.status,'COMPLETED');
 visible=(await overview('sales')).assessments[0];assert.ok(visible.managerScores.every((s:any)=>s===4));assert.match(visible.managerSummary,/Private manager rationale/);
 await api('manager',url('sales'),'PUT',{...payload,rowVersion:completed.rowVersion},409);
 await assert.rejects(db.query(`UPDATE dbo.kpi_assessment_scores SET manager_score=3 WHERE assessment_id=${completed.id}`));checks++;
 let ownManager=await api('manager',url('manager'),'PUT',{...payload,submit:true});
 ownManager=await api('admin',url('manager'),'PUT',{...payload,rowVersion:ownManager.rowVersion,summary:'Private manager review',submit:true});
 const privateOwn=(await overview('manager')).assessments.find((r:any)=>r.userId===ids.manager!.id);assert.equal(privateOwn.managerSummary,'');assert.ok(privateOwn.managerScores.every((s:any)=>s===null));
 await api('manager',`${url('manager')}/complete`,'POST',{cycleId:cycle,rowVersion:ownManager.rowVersion,calibrationNote:'Self completion is prohibited'},403);
 await api('admin',`${url('manager')}/complete`,'POST',{cycleId:cycle,rowVersion:ownManager.rowVersion,calibrationNote:'Independent reviewer confirmed'});
 assert.ok(Number((await db.query<{n:number}>(`SELECT COUNT(*) n FROM dbo.audit_log WHERE entity_type=N'KpiAssessment'`)).recordset[0]!.n)>=9);checks++;
 console.log(`PASS ${checks} isolated KPI API/SQL checks: Sales grants/scope, missing evidence, self submit, manager scoring, trigger-compatible updates, concurrency, privacy, independent completion and frozen scores.`);
} finally{await app.close();await db.close();}
