// Explicit integration entry point (not part of fast unit-test glob).
// Creates/drops only its own uniquely named fresh CI database; never the live UAT DB.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app.js";
import { PDFDocument } from "pdf-lib";
import type { AppConfig } from "../src/config.js";

const repo = resolve(import.meta.dirname,"../..");
const name = `IoTTeamCenter_DrawingCI_${randomUUID().replaceAll("-", "")}`;
assert.match(name,/^IoTTeamCenter_DrawingCI_[a-f0-9]{32}$/);
const sqlArgs = ["-S","localhost","-E","-C","-I","-b"];
function sqlFile(path:string) { execFileSync("sqlcmd", [...sqlArgs,"-d",name,"-i",path,"-v",`DatabaseName=${name}`],{cwd:repo,stdio:"inherit"}); }
const config: AppConfig = {environment:"development",host:"127.0.0.1",port:0,allowedHosts:["localhost"],corsOrigins:["http://localhost:3000"],businessTimeZone:"Asia/Bangkok",auth:{mode:"Development"},database:{connectionString:`Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`,trustServerCertificate:true},documentStorage:{mode:"Local",rootPath:resolve(repo,"tmp",name),maxFileSizeBytes:10_000_000},email:{mode:"Disabled"},pdfParserUrl:"http://pdf-parser:8000"};
let application: Awaited<ReturnType<typeof buildApp>> | undefined;
try {
  execFileSync("sqlcmd",[...sqlArgs,"-i","database/scripts/020_deploy_fresh_database.sql","-v",`DatabaseName=${name}`],{cwd:repo,stdio:"pipe"});
  sqlFile("tests/integration/drawing-fixture.sql");
  const rolePassword=randomUUID().replaceAll("-","");
  execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-Q",`CREATE APPLICATION ROLE drawing_ci_role WITH PASSWORD='${rolePassword}';`],{stdio:"pipe"});
  execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-i","database/scripts/010_application_login.sql","-v",`DatabaseName=${name}`,"AppLogin=drawing_ci_role"],{cwd:repo,stdio:"pipe"});
  config.database.applicationRoleName="drawing_ci_role";config.database.applicationRolePassword=rolePassword;
  application=await buildApp(config);
  const {app,database}=application;
  const actors = Object.fromEntries((await database.query<{id:number;entra_object_id:string}>("SELECT id,entra_object_id FROM dbo.users;")).recordset.map(u=>[u.entra_object_id,Number(u.id)]));
  const project=Number((await database.query<{id:number}>("SELECT id FROM dbo.projects;")).recordset[0]!.id);
  const task=Number((await database.query<{id:number}>("SELECT id FROM dbo.schedule_tasks;")).recordset[0]!.id);
  async function api(actor:string,url:string,body?:object,method:"GET"|"POST"|"PUT"=body?"POST":"GET",expected=200) {
    const response=await app.inject({method,url,headers:{"x-dev-user-id":`drawing-${actor}`},...(body ? {payload:body}: {})});
    assert.equal(response.statusCode,expected,`${method} ${url}: ${response.body}`);
    return response.json();
  }
  const stampImage=readFileSync(resolve(repo,"output/pdf/test-only-stamp.png")).toString("base64");
  // Exercise the real API with the SQL consistency trigger enabled, not only fixture SQL.
  const schedule=await api("manager",`/api/v1/projects/${project}/schedule`);
  const plan={name:"TEST ONLY API Design task",kind:"task",visibility:"Internal",startMode:"manual",parentId:null,sortOrder:10,planStart:"2026-09-07",planDays:1,lagDays:0,planManDays:1,picUserIds:[actors["drawing-other"]],scheduleVersion:schedule.scheduleVersion};
  const apiTask=await api("manager",`/api/v1/projects/${project}/schedule/tasks`,plan,"POST",201);
  const edited=await api("manager",`/api/v1/schedule/tasks/${apiTask.id}`,{...plan,name:"TEST ONLY updated API task",rowVersion:apiTask.rowVersion,scheduleVersion:apiTask.scheduleVersion},"PUT");
  await api("other",`/api/v1/schedule/tasks/${apiTask.id}/updates`,{rowVersion:edited.rowVersion,scheduleVersion:edited.scheduleVersion,percentComplete:10,status:"In Progress",actualStart:"2026-09-07",actualFinish:null,forecastFinish:null,remark:"TEST ONLY trigger-safe progress"});
  for(const actor of ["member","leader","manager"]) await api(actor,"/api/v1/me/signature",{source:"UPLOADED",imageBase64:stampImage,initialsBase64:stampImage,initialsText:"TEST"},"PUT");
  const stamp=await api("admin","/api/v1/master/company-stamps",{code:"TEST-ONLY",nameTh:"TEST ONLY",nameEn:"TEST ONLY",nameJa:"TEST ONLY",legalEntity:"TEST ONLY - NOT A COMPANY",custodianRole:"Engineering Manager",scope:["DRAWING"],validFrom:"2026-01-01"},"POST",201);
  const stamps=await api("manager","/api/v1/master/company-stamps");
  await api("manager",`/api/v1/master/company-stamps/${stamp.id}/image`,{imageBase64:stampImage,rowVersion:stamps.find((s:{id:number})=>s.id===stamp.id).rowVersion},"PUT");
  await api("manager",`/api/v1/master/company-stamps/${stamp.id}/authorities`,{holderKind:"USER",holderId:actors["drawing-manager"],documentClass:"DRAWING",validFrom:"2026-01-01"},"POST",201);
  assert.equal((await api("member",`/api/v1/projects/${project}/drawing-tasks`)).length,1);
  assert.equal((await api("other",`/api/v1/projects/${project}/drawing-tasks`)).length,1);
  async function upload(actor:string,expected=201) {
    const boundary="drawing-ci-boundary";
    const fields={folderCode:"02",documentType:"Drawing",taskId:String(task)};
    const prefix=Object.entries(fields).map(([k,v])=>`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`).join("")+`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test-only-drawing.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
    const response=await app.inject({method:"POST",url:`/api/v1/projects/${project}/documents`,headers:{"x-dev-user-id":`drawing-${actor}`,"content-type":`multipart/form-data; boundary=${boundary}`},payload:Buffer.concat([Buffer.from(prefix),readFileSync(resolve(repo,"output/pdf/test-only-drawing.pdf")),Buffer.from(`\r\n--${boundary}--\r\n`)])});
    assert.equal(response.statusCode,expected,response.body); return response.json();
  }
  await upload("other",403);
  const file=await upload("member");
  const input={documentClass:"DRAWING",documentLocale:"en",projectDocumentId:file.id,taskId:task,title:"TEST ONLY Drawing Release",revisionLabel:"R00"};
  await api("other","/api/v1/signing/documents",input,"POST",403);
  const doc=await api("member","/api/v1/signing/documents",input,"POST",201);
  const detail=()=>api("member",`/api/v1/signing/documents/${doc.id}`);
  let workspace=await detail();
  await api("leader",`/api/v1/signing/documents/${doc.id}/request`,{rowVersion:workspace.document.rowVersion},"POST",403);
  await api("member",`/api/v1/signing/documents/${doc.id}/request`,{rowVersion:workspace.document.rowVersion,companyStampId:stamp.id});
  workspace=await detail();
  assert.deepEqual(workspace.liveRequest.steps.map((s:{assigneeUserId:number})=>s.assigneeUserId),[actors["drawing-member"],actors["drawing-leader"],actors["drawing-manager"]]);
  const steps=workspace.liveRequest.steps;
  await api("manager",`/api/v1/signing/steps/${steps[2].id}/sign`,{rowVersion:steps[2].rowVersion},"POST",409);
  await api("other",`/api/v1/signing/steps/${steps[0].id}/sign`,{rowVersion:steps[0].rowVersion},"POST",403);
  await api("member",`/api/v1/signing/steps/${steps[0].id}/sign`,{rowVersion:steps[0].rowVersion});
  workspace=await detail();
  const leaderStep=workspace.liveRequest.steps[1];
  await api("leader",`/api/v1/signing/steps/${leaderStep.id}/return`,{rowVersion:leaderStep.rowVersion,reason:"TEST ONLY: revise dimensions"});
  workspace=await detail();
  assert.equal(workspace.document.signingState,"DRAFT");
  const revised=await upload("member");
  await api("member",`/api/v1/signing/documents/${doc.id}/revisions`,{projectDocumentId:revised.id,revisionLabel:"R01",rowVersion:workspace.document.rowVersion});
  workspace=await detail();
  await api("member",`/api/v1/signing/documents/${doc.id}/request`,{rowVersion:workspace.document.rowVersion,companyStampId:stamp.id});
  for(const actor of ["member","leader","manager"]) {
    workspace=await detail();
    const pending=workspace.liveRequest.steps.find((s:{state:string})=>s.state==="PENDING");
    await api(actor,`/api/v1/signing/steps/${pending.id}/sign`,{rowVersion:pending.rowVersion,note:"TEST ONLY approval"});
  }
  workspace=await detail();
  assert.equal(workspace.document.signingState,"SIGNED");
  assert.equal(workspace.revisions.length,2);
  assert.equal(workspace.chainVerified,true);
  const output=(await database.query<{storage_key:string}>("SELECT TOP(1) storage_key FROM dbo.signed_documents ORDER BY id DESC;")).recordset[0]!;
  const certificatePath=resolve(config.documentStorage.rootPath,output.storage_key);
  const certificate=readFileSync(certificatePath,"utf8");
  assert.match(certificate,/data:image\/png;base64,/);
  assert.match(certificate,/TEST ONLY/);
  await copyFile(certificatePath,resolve(repo,"output/pdf/test-only-drawing-approval.html"));
  const verified=await api("member",`/api/v1/signing/verify/${workspace.output.verifyCode}`);
  assert.equal(verified.chainVerified,true);
  assert.equal((await database.query<{count:number}>("SELECT COUNT(*) count FROM dbo.signature_marks WHERE kind=N'STAMP';")).recordset[0]!.count,1);
  // Same identity retains Admin, but only an explicit business grant permits signing.
  const adminBefore=await api("admin","/api/v1/bootstrap");
  assert.equal(adminBefore.user.role,"Admin");
  assert.equal(adminBefore.permissions.includes("signing.sign"),false);
  await api("admin","/api/v1/signing/steps/0/sign",{},"POST",403);
  const adminId=actors["drawing-admin"]!;
  assert.ok(Number.isSafeInteger(adminId));
  await assert.rejects(database.query(`INSERT dbo.user_business_roles(user_id,role_id,granted_by,reason) SELECT ${adminId},id,${adminId},N'forbidden app write' FROM dbo.roles WHERE code=N'Management';`));
  execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-Q",`INSERT dbo.user_business_roles(user_id,role_id,granted_by,reason) SELECT ${adminId},id,${adminId},N'TEST ONLY explicit grant' FROM dbo.roles WHERE code=N'Management'; UPDATE dbo.projects SET manager_id=${adminId} WHERE id=${project};`],{stdio:"pipe"});
  const adminAfter=await api("admin","/api/v1/bootstrap");
  assert.equal(adminAfter.user.role,"Admin");
  assert.ok(adminAfter.permissions.includes("master.write"));
  assert.ok(adminAfter.permissions.includes("signing.sign"));
  await api("admin","/api/v1/me/signature",{source:"UPLOADED",imageBase64:stampImage,initialsBase64:stampImage,initialsText:"TEST"},"PUT");
  const nextFile=await upload("member");
  const nextDoc=await api("member","/api/v1/signing/documents",{...input,projectDocumentId:nextFile.id,title:"TEST ONLY Admin plus Management"},"POST",201);
  const nextDetail=()=>api("member",`/api/v1/signing/documents/${nextDoc.id}`);
  let next=await nextDetail();
  await api("member",`/api/v1/signing/documents/${nextDoc.id}/request`,{rowVersion:next.document.rowVersion});
  next=await nextDetail();
  assert.equal(next.liveRequest.steps[2].assigneeUserId,adminId);
  await api("admin",`/api/v1/signing/steps/${next.liveRequest.steps[0].id}/sign`,{rowVersion:next.liveRequest.steps[0].rowVersion},"POST",403);
  await api("admin",`/api/v1/signing/steps/${next.liveRequest.steps[2].id}/sign`,{rowVersion:next.liveRequest.steps[2].rowVersion},"POST",409);
  for(const actor of ["member","leader"]) {
    next=await nextDetail();
    const pending=next.liveRequest.steps.find((s:{state:string})=>s.state==="PENDING");
    const previewPath=`/api/v1/signing/documents/${nextDoc.id}/preview?fileId=${next.revisions[0].id}&stepId=${pending.id}`;
    await api("other",previewPath,undefined,"GET",403);
    const preview=await api(actor,previewPath);
    assert.equal(preview.pageCount,1);assert.ok(preview.specimen.imageBase64);
    const positioned={rowVersion:pending.rowVersion,sourceSha256:preview.sourceSha256,previewSpecimenId:preview.specimen.id,placement:{page:1,x:actor==="member"?.1:.4,y:.8,width:.2,height:.08}};
    await api(actor,`/api/v1/signing/steps/${pending.id}/sign`,{...positioned,placement:{...positioned.placement,page:2}},"POST",400);
    await api(actor,`/api/v1/signing/steps/${pending.id}/sign`,{...positioned,sourceSha256:"0".repeat(64)},"POST",409);
    await api(actor,`/api/v1/signing/steps/${pending.id}/sign`,positioned);
  }
  next=await nextDetail();
  const finalStep=next.liveRequest.steps[2];
  execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-Q",`UPDATE dbo.user_business_roles SET revoked_at=SYSUTCDATETIME() WHERE user_id=${adminId};`],{stdio:"pipe"});
  await api("admin",`/api/v1/signing/steps/${finalStep.id}/sign`,{rowVersion:finalStep.rowVersion},"POST",403);
  execFileSync("sqlcmd",[...sqlArgs,"-d",name,"-Q",`UPDATE dbo.user_business_roles SET revoked_at=NULL WHERE user_id=${adminId};`],{stdio:"pipe"});
  const finalPreview=await api("admin",`/api/v1/signing/documents/${nextDoc.id}/preview?fileId=${next.revisions[0].id}&stepId=${finalStep.id}`);
  await api("admin",`/api/v1/signing/steps/${finalStep.id}/sign`,{rowVersion:finalStep.rowVersion,note:"TEST ONLY named Management approval",sourceSha256:finalPreview.sourceSha256,previewSpecimenId:finalPreview.specimen.id,placement:{page:1,x:.7,y:.8,width:.2,height:.08}});
  assert.equal((await nextDetail()).document.signingState,"SIGNED");
  const signedPdf=(await database.query<{storage_key:string;content_type:string}>("SELECT TOP(1) storage_key,content_type FROM dbo.signed_documents ORDER BY id DESC;")).recordset[0]!;
  assert.equal(signedPdf.content_type,"application/pdf");
  const signedPath=resolve(config.documentStorage.rootPath,signedPdf.storage_key);
  const parsed=await PDFDocument.load(readFileSync(signedPath));assert.ok(parsed.getPageCount()>=2);
  await copyFile(signedPath,resolve(repo,"output/pdf/test-only-positioned-drawing.pdf"));
  await api("admin",`/api/v1/signing/steps/${finalStep.id}/sign`,{rowVersion:finalStep.rowVersion},"POST",409);
  const download=await app.inject({method:"GET",url:`/api/v1/signing/requests/${next.liveRequest.id}/output`,headers:{"x-dev-user-id":"drawing-admin"}});
  assert.equal(download.statusCode,200);assert.match(String(download.headers["content-type"]),/application\/pdf/);
  const denied=await app.inject({method:"GET",url:`/api/v1/signing/requests/${next.liveRequest.id}/output`});assert.equal(denied.statusCode,403); // Development's default identity is unregistered.
  console.log("POSITIONED PDF PASSED: scoped preview, original hash, invalid page, named specimen, persisted coordinates, immutable signed PDF and authorized download.");
  console.log("MANAGEMENT INTEGRATION PASSED: explicit grant, primary Admin preserved, no app self-grant, step ownership, sequence, immediate revoke and named final approval.");
  console.log("DRAWING INTEGRATION PASSED: import, task scope, named approvers, ordering, return, revision, three approvals, TEST ONLY stamp, signed output and chain verification.");
} finally {
  await application?.app.close(); await application?.database.close();
  if(/^IoTTeamCenter_DrawingCI_[a-f0-9]{32}$/.test(name)) execFileSync("sqlcmd",[...sqlArgs,"-d","master","-Q",`IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END;`],{stdio:"pipe"});
}
