import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,rmSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildApp as buildSourceApp} from '../src/app.js';
import {insertAudit} from '../src/audit.js';
import {activityDay,nextDay} from '../src/activity-rules.js';
import type {AppConfig} from '../src/config.js';

const repo=process.cwd(),name=`IoTTeamCenter_ActivityCI_${randomUUID().replaceAll('-','')}`,storage=resolve(repo,'tmp',name);
assert.match(name,/^IoTTeamCenter_ActivityCI_[a-f0-9]{32}$/);
const buildApp:typeof buildSourceApp=process.env.ACTIVITY_TEST_APP?(await import(pathToFileURL(process.env.ACTIVITY_TEST_APP).href)).buildApp:buildSourceApp;
const args=['-S','localhost','-E','-C','-I','-b'];
const run=(statement:string)=>execFileSync('sqlcmd',[...args,'-d',name,'-Q',statement],{cwd:repo,stdio:'pipe',encoding:'utf8'});
let application:Awaited<ReturnType<typeof buildApp>>|undefined,checks=0;
try{
 execFileSync('sqlcmd',[...args,'-i','database/scripts/020_deploy_fresh_database.sql','-v',`DatabaseName=${name}`],{cwd:repo,stdio:'pipe'});
 execFileSync('sqlcmd',[...args,'-d',name,'-i','database/migrations/035_team_activity.sql'],{cwd:repo,stdio:'pipe'});
 execFileSync('sqlcmd',[...args,'-d',name,'-i','tests/integration/drawing-fixture.sql'],{cwd:repo,stdio:'pipe'});
 run(`UPDATE dbo.users SET department=CASE WHEN entra_object_id=N'drawing-other' THEN N'Other department' ELSE N'Engineering' END;
 INSERT dbo.employees(employee_no,name_en,department,job_title,email,start_work_date,position,user_id,created_by,updated_by)
 SELECT id,name,department,N'Engineer',email,'20260101',N'Engineer',id,id,id FROM dbo.users;
 UPDATE dbo.activity_settings SET started_at=DATEADD(day,-60,SYSUTCDATETIME());`);
 const password=randomUUID().replaceAll('-','');run(`CREATE APPLICATION ROLE activity_ci_role WITH PASSWORD='${password}';`);
 execFileSync('sqlcmd',[...args,'-d',name,'-i','database/scripts/010_application_login.sql','-v',`DatabaseName=${name}`,'AppLogin=activity_ci_role'],{cwd:repo,stdio:'pipe'});
 const config:AppConfig={environment:'development',host:'127.0.0.1',port:0,allowedHosts:['localhost'],corsOrigins:['http://localhost:3000'],businessTimeZone:'Asia/Bangkok',auth:{mode:'Development'},database:{connectionString:`Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`,trustServerCertificate:true,applicationRoleName:'activity_ci_role',applicationRolePassword:password},documentStorage:{mode:'Local',rootPath:storage,maxFileSizeBytes:10485760},email:{mode:'Disabled'}};
 mkdirSync(storage,{recursive:true});application=await buildApp(config);const {app,database}=application;
 const actors=Object.fromEntries((await database.query<{id:number;entra_object_id:string}>('SELECT id,entra_object_id FROM dbo.users')).recordset.map(u=>[u.entra_object_id.replace('drawing-',''),Number(u.id)]));
 const task=Number((await database.query<{id:number}>('SELECT TOP(1) id FROM dbo.schedule_tasks')).recordset[0]!.id),project=Number((await database.query<{id:number}>('SELECT TOP(1) id FROM dbo.projects')).recordset[0]!.id);
 async function api(actor:string|null,url:string,body?:object,expected=200,method?:'PUT'|'POST'){
  const response=await app.inject({method:method??(body?'POST':'GET'),url,headers:actor?{'x-dev-user-id':`drawing-${actor}`}:{},...(body?{payload:body}:{})});assert.equal(response.statusCode,expected,`${++checks}: ${url}: ${response.body}`);return response.json();
 }
 const today=activityDay(),tomorrow=nextDay(today);
 await api(null,'/api/v1/activity/meta',undefined,403);
 const meta=await api('member','/api/v1/activity/meta');assert.equal(meta.members.length,1);assert.equal(meta.canManage,false);
 await api('member',`/api/v1/activity/members/${actors.other}`,undefined,404);
 const lead=await api('leader','/api/v1/activity/meta');assert.equal(lead.canManage,true);assert.ok(lead.members.some((m:{id:number})=>m.id===actors.member));
 for(let i=0;i<3;i++)await api('member','/api/v1/activity/presence',{module:'my-work',userId:actors.other,occurredAt:'2000-01-01'});
 const overview=await api('admin',`/api/v1/activity/overview?day=${today}`),member=overview.items.find((m:{id:number})=>m.id===actors.member);assert.equal(member.sessions,1);assert.equal(member.entered,true);assert.equal(member.updatedTasks,0);
 const own=await api('member',`/api/v1/activity/members/${actors.member}`);assert.ok(own.events.every((e:{actorId:number})=>e.actorId===actors.member));
 const scoped=await api('leader',`/api/v1/activity/overview?day=${today}`);assert.equal(scoped.items.find((m:{id:number})=>m.id===actors.member).accessVisible,false);
 const ruleBody={userId:actors.member,sourceType:'Schedule Task',sourceId:task,startsOn:tomorrow,endsOn:nextDay(tomorrow),weekdayMask:127,cutoffMinute:1020};
 const oversizedEnd=activityDay(new Date(new Date(`${tomorrow}T00:00:00Z`).getTime()+371*86400_000));
 await api('member',`/api/v1/activity/members/${actors.member}?start=${tomorrow}&end=${oversizedEnd}`,undefined,400);
 await api('leader','/api/v1/activity/rules',{...ruleBody,endsOn:oversizedEnd},400);
 await api('member','/api/v1/activity/rules',ruleBody,403);
 await api('leader','/api/v1/activity/rules',{...ruleBody,startsOn:today},400);
 const future=await api('leader','/api/v1/activity/rules',ruleBody);
 await api('leader','/api/v1/activity/rules',ruleBody,409);
 await api('admin','/api/v1/activity/reports',{ruleId:future.id,requestKey:randomUUID(),progress:'TEST progress',nextStep:'TEST next',evidence:'TEST evidence'},404);
 // Historical commitments and evidence below are synthetic fixtures only, never app backdating.
 run(`INSERT dbo.activity_rules(user_id,project_id,source_type,source_id,title,starts_on,ends_on,weekday_mask,cutoff_minute,created_by)
 VALUES(${actors.member},${project},N'Schedule Task',${task},N'TEST ONLY duty','${today}','${today}',127,1020,${actors.leader});`);
 const rule=Number((await database.query<{id:number}>('SELECT MAX(id) id FROM dbo.activity_rules')).recordset[0]!.id);
 const report={ruleId:rule,requestKey:randomUUID(),progress:'TEST ONLY I/O tested 18 of 24',nextStep:'TEST ONLY finish remaining I/O tomorrow',evidence:'TEST ONLY waiting for six sensors'};
 const saved=await api('member','/api/v1/activity/reports',report);const repeated=await api('member','/api/v1/activity/reports',report);assert.equal(saved.id,repeated.id);
 await api('member','/api/v1/activity/reports',{...report,progress:'different'},409);
 await api('member','/api/v1/activity/reports',{...report,requestKey:randomUUID()},409);
 await api('other','/api/v1/activity/reports',{...report,requestKey:randomUUID()},404);
 const updated=await api('admin',`/api/v1/activity/overview?day=${today}`);assert.equal(updated.items.find((m:{id:number})=>m.id===actors.member).updatedTasks,1);
 const proof=await api('leader',`/api/v1/activity/members/${actors.member}`);assert.ok(proof.events.some((e:{id:number})=>e.id===saved.id));assert.ok(proof.events.every((e:{projectId:number})=>e.projectId===project));assert.equal(proof.score,null);
 await api('leader','/api/v1/activity/exceptions',{userId:actors.member,day:today,reason:'TEST ONLY leave'},403);
 await api('manager','/api/v1/activity/exceptions',{userId:actors.other,day:today,reason:'TEST ONLY cross department'},403);
 await api('admin','/api/v1/activity/exceptions',{userId:actors.admin,day:today,reason:'TEST ONLY self'},403);
 await api('manager','/api/v1/activity/exceptions',{userId:actors.member,day:today,reason:'TEST ONLY approved leave'});
 await api('manager','/api/v1/activity/exceptions',{userId:actors.member,day:today,reason:'TEST ONLY approved leave'});
 const exempt=await api('member',`/api/v1/activity/members/${actors.member}`);assert.equal(exempt.days.find((d:{day:string})=>d.day===today).status,'EXEMPT');
 assert.equal(exempt.exceptions.find((e:{day:string})=>e.day===today).reason,'TEST ONLY approved leave');
 const leaderExempt=await api('leader',`/api/v1/activity/members/${actors.member}`);
 assert.equal(leaderExempt.days.find((d:{day:string})=>d.day===today).status,'EXEMPT');
 assert.equal(leaderExempt.exceptions.find((e:{day:string})=>e.day===today).reason,'');
 assert.ok(!JSON.stringify(leaderExempt).includes('TEST ONLY approved leave'));
 const managerExempt=await api('manager',`/api/v1/activity/members/${actors.member}`);
 assert.equal(managerExempt.exceptions.find((e:{day:string})=>e.day===today).reason,'TEST ONLY approved leave');
 const cycle=meta.cycles[0].id;
 await api('admin','/api/v1/activity/cycle-policy',{cycleId:cycle,mode:'ACTIVE'},409);
 const nextYear=Number(today.slice(0,4))+1;
 const createdCycle=await api('admin','/api/v1/performance/cycles',{code:'TEST NEXT',name:'TEST ONLY NEXT',periodStart:`${nextYear}-01-01`,periodEnd:`${nextYear}-06-30`,reviewDueDate:`${nextYear}-07-15`},201);
 await api('member','/api/v1/activity/cycle-policy',{cycleId:createdCycle.id,mode:'ACTIVE'},403);
 await api('admin','/api/v1/activity/cycle-policy',{cycleId:createdCycle.id,mode:'ACTIVE'});
 await api('admin','/api/v1/activity/cycle-policy',{cycleId:createdCycle.id,mode:'TRIAL'},409);
 const quality={userId:actors.member,cycleId:cycle,clarity:4,nextStep:4,evidence:4,note:'TEST ONLY concrete report evidence',evidenceIds:[saved.id]};
 await api('member','/api/v1/activity/quality',quality,403);
 await api('leader','/api/v1/activity/quality',quality,403);
 await api('manager','/api/v1/activity/quality',{...quality,evidenceIds:[999999]},400);
 await api('manager','/api/v1/activity/quality',quality);
 await api('manager','/api/v1/activity/quality',quality,409);
 const selfScore=await api('member',`/api/v1/activity/members/${actors.member}?cycleId=${cycle}`);assert.equal(selfScore.score.qualityReview,null);
 const review=await api('manager',`/api/v1/activity/members/${actors.member}?cycleId=${cycle}`);assert.equal(review.score.quality,12);
 await api('member','/api/v1/activity/clarifications',{cycleId:cycle,note:'TEST ONLY reporting from site'});
 const kpi=await api('admin',`/api/v1/performance/overview?cycleId=${cycle}`);assert.equal(kpi.assessments.find((m:{userId:number})=>m.userId===actors.member).activity.mode,'TRIAL');
 // Business rollback cannot leave a scored event behind.
 const beforeCount=Number((await database.query<{n:number}>('SELECT COUNT(*) n FROM dbo.activity_events')).recordset[0]!.n);
 await assert.rejects(()=>database.transaction(async tx=>{await insertAudit(tx,actors.member!,'Schedule Task',task,'TEST','Updated progress',{percentComplete:0},{percentComplete:20,status:'In Progress',remark:'TEST rollback'});throw Error('deliberate rollback');}));
 assert.equal(Number((await database.query<{n:number}>('SELECT COUNT(*) n FROM dbo.activity_events')).recordset[0]!.n),beforeCount);checks++;
 await database.transaction(async tx=>{await insertAudit(tx,actors.member!,'Schedule Task',task,'TEST','Updated progress',{percentComplete:0},{percentComplete:20,status:'In Progress',remark:'TEST native'});});
 const native=await api('member',`/api/v1/activity/members/${actors.member}`);assert.ok(native.events.some((e:{kind:string;summary:string})=>e.kind==='UPDATE'&&e.summary.includes('Updated progress')));
 await assert.rejects(()=>database.query(`UPDATE dbo.activity_events SET summary=N'tamper' WHERE id=${saved.id}`));checks++;
 // Snapshot guards stay effective at SQL layer and through review/exemption endpoints.
 const employeeId=kpi.assessments.find((m:{userId:number})=>m.userId===actors.member).employeeId;
 const assessmentBody={cycleId:cycle,submit:true,summary:'TEST ONLY review',scores:['DELIVERY','QUALITY','TECHNICAL','TEAMWORK'].map(areaCode=>({areaCode,score:4,evidence:'TEST ONLY evidence'}))};
 const selfReview=await api('member',`/api/v1/performance/assessments/${employeeId}`,assessmentBody,200,'PUT');
 const managerReview=await api('manager',`/api/v1/performance/assessments/${employeeId}`,{...assessmentBody,rowVersion:selfReview.rowVersion},200,'PUT');
 await api('manager',`/api/v1/performance/assessments/${employeeId}/complete`,{cycleId:cycle,calibrationNote:'TEST ONLY final calibration',rowVersion:managerReview.rowVersion});
 const finalized=await api('member',`/api/v1/activity/members/${actors.member}?cycleId=${cycle}`);assert.equal(finalized.score.frozen,true);assert.equal(finalized.score.quality,12);
 await api('manager','/api/v1/activity/quality',{...quality,rowVersion:review.score.qualityReview.rowVersion},409);
 await api('manager','/api/v1/activity/exceptions',{userId:actors.member,day:today,reason:'TEST frozen'},409);
 await api('member','/api/v1/activity/clarifications',{cycleId:cycle,note:'TEST frozen'},409);
 await assert.rejects(()=>database.query(`UPDATE dbo.activity_snapshots SET snapshot_json=N'{}' WHERE cycle_id=${cycle}`));checks++;
 // Exercise an ACTIVE completed cycle with sufficient historical fixture evidence.
 const pastStart=activityDay(new Date(Date.now()-21*86400_000)),pastEnd=activityDay(new Date(Date.now()-86400_000));
 const activeCycle=await api('admin','/api/v1/performance/cycles',{code:'TEST ACTIVE',name:'TEST ONLY ACTIVE',periodStart:pastStart,periodEnd:pastEnd,reviewDueDate:today},201);
 run(`INSERT dbo.activity_cycle_policies(cycle_id,mode,created_by) VALUES(${activeCycle.id},N'ACTIVE',${actors.admin});
 INSERT dbo.activity_rules(user_id,project_id,source_type,source_id,title,starts_on,ends_on,weekday_mask,cutoff_minute,created_by)
 VALUES(${actors.member},${project},N'Schedule Task',${task},N'TEST ONLY historical duty','${pastStart}','${pastEnd}',127,1020,${actors.leader});
 DECLARE @day date='${pastStart}';WHILE @day<='${pastEnd}' BEGIN
 INSERT dbo.activity_events(actor_id,project_id,kind,module,source_type,source_id,summary,occurred_at)
 VALUES(${actors.member},${project},N'UPDATE',N'my-work',N'Schedule Task',${task},N'TEST ONLY historical report',TODATETIMEOFFSET(DATEADD(hour,9,CONVERT(datetime2,@day)),'+07:00'));
 SET @day=DATEADD(day,1,@day);END;`);
 const activeProof=await api('manager',`/api/v1/activity/members/${actors.member}?start=${pastStart}&end=${pastEnd}&cycleId=${activeCycle.id}`);assert.equal(activeProof.score.eligible,true);assert.equal(activeProof.score.automatic,85);
 const activeBody={...assessmentBody,cycleId:activeCycle.id};
 const activeSelf=await api('member',`/api/v1/performance/assessments/${employeeId}`,activeBody,200,'PUT');
 const activeManager=await api('manager',`/api/v1/performance/assessments/${employeeId}`,{...activeBody,rowVersion:activeSelf.rowVersion},200,'PUT');
 const finalize={cycleId:activeCycle.id,calibrationNote:'TEST ONLY active calibration',rowVersion:activeManager.rowVersion};
 await api('manager',`/api/v1/performance/assessments/${employeeId}/complete`,finalize,409);
 await api('manager','/api/v1/activity/quality',{...quality,cycleId:activeCycle.id,clarity:0,nextStep:0,evidence:0,evidenceIds:[]},400);
 await api('manager','/api/v1/activity/quality',{...quality,cycleId:activeCycle.id,evidenceIds:[activeProof.events.find((e:{kind:string})=>e.kind==='UPDATE').id]});
 await api('manager',`/api/v1/performance/assessments/${employeeId}/complete`,finalize);
 const activeKpi=await api('member',`/api/v1/performance/overview?cycleId=${activeCycle.id}`);
 assert.ok(Math.abs(activeKpi.assessments[0].overallScore-4.088)<1e-8);assert.equal(activeKpi.assessments[0].activity.frozen,true);checks++;
 const leaderKpi=await api('leader',`/api/v1/performance/overview?cycleId=${activeCycle.id}`);
 const leaderMember=leaderKpi.assessments.find((a:{userId:number})=>a.userId===actors.member);
 assert.equal(leaderMember.activity,undefined);assert.equal(leaderMember.overallScore,null);
 for(const reviewer of ['manager','admin']){
  const scopedKpi=await api(reviewer,`/api/v1/performance/overview?cycleId=${activeCycle.id}`);
  const scopedMember=scopedKpi.assessments.find((a:{userId:number})=>a.userId===actors.member);
  assert.ok(Math.abs(scopedMember.overallScore-4.088)<1e-8);assert.equal(scopedMember.activity.frozen,true);
 }
 // A member who misses every duty must still be reviewable with an explained
 // zero-quality result, without inventing successful work-update evidence.
 const missingStart=activityDay(new Date(Date.now()-50*86400_000)),missingEnd=activityDay(new Date(Date.now()-30*86400_000));
 const missingCycle=await api('admin','/api/v1/performance/cycles',{code:'TEST MISSING',name:'TEST ONLY ALL MISSING',periodStart:missingStart,periodEnd:missingEnd,reviewDueDate:today},201);
 run(`INSERT dbo.activity_cycle_policies(cycle_id,mode,created_by) VALUES(${missingCycle.id},N'ACTIVE',${actors.admin});
 INSERT dbo.activity_rules(user_id,project_id,source_type,source_id,title,starts_on,ends_on,weekday_mask,cutoff_minute,created_by)
 VALUES(${actors.member},${project},N'Schedule Task',${task},N'TEST ONLY missed duty','${missingStart}','${missingEnd}',127,1020,${actors.leader});`);
 const missingProof=await api('manager',`/api/v1/activity/members/${actors.member}?start=${missingStart}&end=${missingEnd}&cycleId=${missingCycle.id}`);
 assert.equal(missingProof.score.eligible,true);assert.equal(missingProof.score.automatic,0);assert.equal(missingProof.events.filter((e:{kind:string})=>e.kind==='UPDATE').length,0);
 const zeroQuality={...quality,cycleId:missingCycle.id,clarity:0,nextStep:0,evidence:0,evidenceIds:[],note:'TEST ONLY no successful reports were submitted during the review period'};
 await api('manager','/api/v1/activity/quality',{...zeroQuality,clarity:1},400);
 await api('manager','/api/v1/activity/quality',zeroQuality);
 const missingBody={...assessmentBody,cycleId:missingCycle.id};
 const missingSelf=await api('member',`/api/v1/performance/assessments/${employeeId}`,missingBody,200,'PUT');
 const missingManager=await api('manager',`/api/v1/performance/assessments/${employeeId}`,{...missingBody,rowVersion:missingSelf.rowVersion},200,'PUT');
 await api('manager',`/api/v1/performance/assessments/${employeeId}/complete`,{cycleId:missingCycle.id,calibrationNote:'TEST ONLY all missing calibration',rowVersion:missingManager.rowVersion});
 const missingKpi=await api('member',`/api/v1/performance/overview?cycleId=${missingCycle.id}`);
 assert.equal(missingKpi.assessments[0].activity.frozen,true);assert.equal(missingKpi.assessments[0].activity.rating,1);
 assert.ok(Math.abs(missingKpi.assessments[0].overallScore-3.7)<1e-8);checks++;
 const ready=await api(null,'/health/ready');assert.equal(ready.schemaVersion,35);
 console.log(`PASS ${checks} isolated Activity SQL/API checks with restricted application-role grants.`);
}finally{
 if(application)await application.app.close();
 execFileSync('sqlcmd',[...args,'-d','master','-Q',`IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;DROP DATABASE [${name}];END`],{stdio:'pipe'});
 assert.ok(storage.startsWith(resolve(repo,'tmp')+sep)&&storage.endsWith(name));rmSync(storage,{recursive:true,force:true});
}
