import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { buildApp as buildSourceApp } from '../src/app.js';
import { pathToFileURL } from 'node:url';
import type { AppConfig } from '../src/config.js';

const repo=process.cwd(),name=`IoTTeamCenter_SupportCI_${randomUUID().replaceAll('-','')}`;
const buildApp:typeof buildSourceApp=process.env.SUPPORT_TEST_APP ? (await import(pathToFileURL(process.env.SUPPORT_TEST_APP).href)).buildApp : buildSourceApp;
assert.match(name,/^IoTTeamCenter_SupportCI_[a-f0-9]{32}$/);
const args=['-S','localhost','-E','-C','-I','-b'];
const run=(statement:string)=>execFileSync('sqlcmd',[...args,'-d',name,'-Q',statement],{cwd:repo,stdio:'pipe',encoding:'utf8'});
let application:Awaited<ReturnType<typeof buildApp>>|undefined,checks=0;
const storage=resolve(repo,'tmp',name);
try {
 execFileSync('sqlcmd',[...args,'-i','database/scripts/020_deploy_fresh_database.sql','-v',`DatabaseName=${name}`],{cwd:repo,stdio:'pipe',encoding:'utf8'});
 execFileSync('sqlcmd',[...args,'-d',name,'-i','tests/integration/drawing-fixture.sql'],{cwd:repo,stdio:'pipe',encoding:'utf8'});
 const password=randomUUID().replaceAll('-','');run(`CREATE APPLICATION ROLE support_ci_role WITH PASSWORD='${password}';`);
 execFileSync('sqlcmd',[...args,'-d',name,'-i','database/scripts/010_application_login.sql','-v',`DatabaseName=${name}`,'AppLogin=support_ci_role'],{cwd:repo,stdio:'pipe',encoding:'utf8'});
 const config:AppConfig={environment:'development',host:'127.0.0.1',port:0,allowedHosts:['localhost'],corsOrigins:['http://localhost:3000'],businessTimeZone:'Asia/Bangkok',auth:{mode:'Development'},database:{connectionString:`Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`,trustServerCertificate:true,applicationRoleName:'support_ci_role',applicationRolePassword:password},documentStorage:{mode:'Local',rootPath:storage,maxFileSizeBytes:10485760},email:{mode:'Disabled'},pdfParserUrl:'http://pdf-parser:8000'};
 mkdirSync(storage,{recursive:true});application=await buildApp(config);const {app,database}=application;
 const actors=Object.fromEntries((await database.query<{id:number;entra_object_id:string}>('SELECT id,entra_object_id FROM dbo.users')).recordset.map(u=>[u.entra_object_id.replace('drawing-',''),Number(u.id)]));
 async function api(actor:string|null,url:string,body?:object,expected=200) {
  const response=await app.inject({method:body?'POST':'GET',url,headers:actor?{'x-dev-user-id':`drawing-${actor}`}:{},...(body?{payload:body}:{})});assert.equal(response.statusCode,expected,`Support check ${checks+1} ${url}: ${response.body}`);checks++;return response.json();
 }
 const create={category:'Application',subject:'TEST ONLY cannot save estimate',description:'TEST ONLY precise reproduction steps',impact:'PartlyBlocked',context:{module:'Estimate Cost',token:'do not persist'},requestKey:randomUUID()};
 // Development auth supplies its configured default identity; it is deliberately unregistered here.
 await api(null,'/api/v1/support/tickets',undefined,403);
 await api('member','/api/v1/support/tickets?scope=queue',undefined,403);
 let ticket=await api('member','/api/v1/support/tickets',create,201);assert.match(ticket.ticketNo,/^SUP-\d{4}-\d{5,}$/);assert.equal(ticket.context.token,undefined);
 const id=ticket.id,path=`/api/v1/support/tickets/${id}`;
 const repeated=await api('member','/api/v1/support/tickets',create,201);assert.equal(repeated.id,id);
 await api('member','/api/v1/support/tickets',{...create,subject:'Changed request payload'},409);
 await api('other',path,undefined,404);await api('leader',path,undefined,404);
 const memberMeta=await api('member','/api/v1/support/bootstrap');assert.equal(memberMeta.queue,false);
 await api('admin','/api/v1/support/members',{category:'Application',userId:actors.leader,enabled:true,canAward:false});
 ticket=await api('leader',path);assert.equal(ticket.permissions.award,false);assert.equal(ticket.permissions.claim,true);
 ticket=await api('leader',`${path}/assign`,{assigneeId:actors.leader,reason:'TEST ONLY taking ownership',rowVersion:ticket.rowVersion,requestKey:randomUUID()});assert.equal(ticket.status,'Acknowledged');
 await api('admin','/api/v1/support/members',{category:'Application',userId:actors.leader,enabled:false,canAward:false},409);
 const stale=ticket.rowVersion;
 const internal={message:'TEST ONLY INTERNAL confidential note',internal:true,rowVersion:ticket.rowVersion,requestKey:randomUUID()};ticket=await api('leader',`${path}/comments`,internal);assert.ok(ticket.events.some((e:{internal:boolean})=>e.internal));
 const own=await api('member',path);assert.ok(!JSON.stringify(own).includes('confidential note'));
 await api('member',`${path}/comments`,{message:'Trying internal',internal:true,rowVersion:own.rowVersion,requestKey:randomUUID()},403);
 await api('leader',`${path}/transition`,{status:'InProgress',reason:'Start work',rowVersion:stale,requestKey:randomUUID()},409);
 await api('member',`${path}/transition`,{status:'Resolved',reason:'Cannot self resolve',rowVersion:own.rowVersion,requestKey:randomUUID()},409);
 const rubric={useful:true,detailed:true,actionable:false,message:'TEST ONLY thank you for the reproduction details.'};
 await api('leader',`${path}/recognition`,{...rubric,rowVersion:ticket.rowVersion,requestKey:randomUUID()},403);
 await api('admin','/api/v1/support/members',{category:'Application',userId:actors.leader,enabled:true,canAward:true});
 const award={...rubric,rowVersion:ticket.rowVersion,requestKey:randomUUID()};ticket=await api('leader',`${path}/recognition`,award);assert.equal(ticket.recognition.points,8);
 const awardReplay=await api('leader',`${path}/recognition`,award);assert.equal(awardReplay.recognition.points,8);
 await api('leader',`${path}/recognition`,{...rubric,rowVersion:ticket.rowVersion,requestKey:randomUUID()},409);
 const points=await api('member','/api/v1/me/support-contributions');assert.equal(points.points,8);assert.equal(points.total,1);
 const otherPoints=await api('other','/api/v1/me/support-contributions');assert.equal(otherPoints.points,0);
 const recognitionVersion=ticket.recognition.rowVersion;
 ticket=await api('admin',`${path}/recognition/adjust`,{...rubric,actionable:true,reason:'TEST ONLY additional actionable evidence',rowVersion:ticket.rowVersion,recognitionVersion,requestKey:randomUUID()});assert.equal(ticket.recognition.points,10);
 const adjusted=await api('member','/api/v1/me/support-contributions');assert.equal(adjusted.points,10);
 const events=ticket.events.filter((e:{kind:string})=>e.kind==='RecognitionAdjusted');assert.equal(events[0].details.delta,2);
 await api('admin',`${path}/recognition/adjust`,{...rubric,reason:'TEST ONLY stale recognition',rowVersion:ticket.rowVersion,recognitionVersion,requestKey:randomUUID()},409);
 ticket=await api('leader',`${path}/transition`,{status:'WaitingForReporter',reason:'Please provide the file name',rowVersion:ticket.rowVersion,requestKey:randomUUID()});
 ticket=await api('member',`${path}/comments`,{message:'The file is TEST ONLY.pdf',internal:false,rowVersion:ticket.rowVersion,requestKey:randomUUID()});assert.equal(ticket.status,'InProgress');
 async function upload(actor:string,internal:boolean,key=randomUUID(),mime='image/png',bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'),expected=201){const boundary='SupportBoundary',payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="requestKey"\r\n\r\n${key}\r\n--${boundary}\r\nContent-Disposition: form-data; name="internal"\r\n\r\n${internal}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="TEST.png"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);const response=await app.inject({method:'POST',url:`${path}/attachments`,headers:{'x-dev-user-id':`drawing-${actor}`,'content-type':`multipart/form-data; boundary=${boundary}`},payload});assert.equal(response.statusCode,expected,response.body);checks++;return response.json();}
 const uploadKey=randomUUID(),file=await upload('member',false,uploadKey);const duplicateFile=await upload('member',false,uploadKey);assert.equal(duplicateFile.id,file.id);
 const internalFile=await upload('leader',true);await api('member',`${path}/attachments/${internalFile.id}/content`,undefined,404);await api('other',`${path}/attachments/${file.id}/content`,undefined,404);
 const download=await app.inject({url:`${path}/attachments/${file.id}/content`,headers:{'x-dev-user-id':'drawing-member'}});assert.equal(download.statusCode,200);assert.equal(download.headers['content-type'],'image/png');checks++;
 await upload('member',false,randomUUID(),'image/png',Buffer.from('<script>bad</script>'),415);
 ticket=await api('leader',path);ticket=await api('leader',`${path}/transition`,{status:'Resolved',reason:'TEST ONLY fixed and verified',rowVersion:ticket.rowVersion,requestKey:randomUUID()});
 ticket=await api('member',`${path}/transition`,{status:'Closed',reason:'TEST ONLY verified fixed',rowVersion:ticket.rowVersion,requestKey:randomUUID()});
 await api('member',`${path}/comments`,{message:'Should be closed',rowVersion:ticket.rowVersion,requestKey:randomUUID()},409);
 ticket=await api('member',`${path}/transition`,{status:'InProgress',reason:'TEST ONLY problem recurred',rowVersion:ticket.rowVersion,requestKey:randomUUID()});assert.equal(ticket.recognition.points,10);
 const self=await api('admin','/api/v1/support/tickets',{...create,requestKey:randomUUID()},201);const assignedSelf=await api('admin',`/api/v1/support/tickets/${self.id}/assign`,{assigneeId:actors.admin,reason:'TEST ONLY self issue',rowVersion:self.rowVersion,requestKey:randomUUID()});
 await api('admin',`/api/v1/support/tickets/${self.id}/recognition`,{...rubric,rowVersion:assignedSelf.rowVersion,requestKey:randomUUID()},403);
 ticket=await api('admin',path);ticket=await api('admin',`${path}/assign`,{assigneeId:actors.admin,category:'Equipment',priority:'High',reason:'TEST ONLY category transfer',rowVersion:ticket.rowVersion,requestKey:randomUUID()});
 await api('leader',path,undefined,404);await api('leader',`${path}/attachments/${internalFile.id}/content`,undefined,404);
 const queue=await api('leader','/api/v1/support/tickets?scope=queue');assert.ok(!queue.items.some((item:{id:number})=>item.id===id));
 const mine=await api('member','/api/v1/support/tickets?pageSize=1');assert.equal(mine.total,1);assert.equal(mine.items.length,1);
 const notifications=await api('member','/api/v1/me/notifications/?limit=100');assert.ok(notifications.some((n:{kind:string})=>n.kind==='SUPPORT_RECOGNITION'));assert.ok(!JSON.stringify(notifications).includes('confidential note'));
 await assert.rejects(()=>database.query(`UPDATE dbo.support_events SET body=N'tamper' WHERE ticket_id=${id}`));checks++;
 const ready=await api(null,'/health/ready');assert.equal(ready.schemaVersion,36);
 console.log(`PASS ${checks} isolated Support SQL/API checks, including application-role grants.`);
} finally {
 if(application)await application.app.close();
 execFileSync('sqlcmd',[...args,'-d','master','-Q',`IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;DROP DATABASE [${name}];END`],{stdio:'pipe',encoding:'utf8'});
 const allowed=resolve(repo,'tmp')+sep;assert.ok(storage.startsWith(allowed)&&storage.endsWith(name));rmSync(storage,{recursive:true,force:true});
}
