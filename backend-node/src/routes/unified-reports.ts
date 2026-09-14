import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sql from 'mssql';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import type { Transaction } from 'mssql';
import { DatabaseCommitOutcomeUnknownError, type Database } from '../db.js';
import type { CurrentUserService } from '../users.js';
import type { CurrentUser } from '../types.js';
import { ApiError } from '../errors.js';
import { bodyObject, clampedInteger, positiveLong, requiredText } from '../http.js';
import { insertAudit } from '../audit.js';
import { issueDocumentNumber } from '../document-number.js';
import { clientIp, clientUserAgent } from '../signing-core.js';
import { reportTemplateSnapshot } from '../report-template-service.js';
import { contentTypeFor, deleteStoredFile, DOCUMENT_DOWNLOAD_RATE_LIMIT, DOCUMENT_UPLOAD_RATE_LIMIT, readMultipartUpload, sendStoredFile, storageKey, uploadedFileName, validateFileExtension, writeStoredFile } from '../document-storage.js';
import { CUSTOMER_CONSENT, TEAM_CONSENT, REPORT_TYPES, REPORT_SELECT, draftInput, eligibleReportSigners, reportSignerCapabilities, parseCustomerEvidence, readReport, reportAccess, reportDto, reportElevated, reportEvidenceReferences, reportHash, reportSnapshot, reportSource, reportVersion, reportPermissions, signReport, validateReportSource, validateCustomerPng, validateReportEvidenceFiles, validateReportForSubmission, type ReportRow } from '../unified-report-service.js';

const sections:Record<string,string[]>={INSTALLATION:['hardware','software','commissioning'],UAT:['scenarios','steps','punchlist','summary'],SERVICE:['hardware','software','issues','verification'],INSPECTION:['checkpoints','correctiveActions'],POC:['hypothesis','criteria','baseline','trial','result','limitations']};
const REPORT_EVIDENCE_MAX_FILE=8*1024*1024;
const REPORT_IMAGE_EXTENSIONS=new Set(['.jpg','.jpeg','.png']);
const REPORT_EXPORT_EXTENSIONS=new Set(['.pdf','.pptx']);
function validateReportEvidenceImage(bytes:Buffer,extension:string) {
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(!(extension==='.png'&&png||['.jpg','.jpeg'].includes(extension)&&jpeg))throw new ApiError(415,'report_evidence_type','Use a valid JPEG or PNG image.');
}
export function registerUnifiedReportRoutes(app:FastifyInstance,config:AppConfig,db:Database,users:CurrentUserService) {
 const actorFor=async(request:FastifyRequest,permission='report.read')=>{await users.demandPermission(request,permission);return users.required(request);};
 const requireSourcePermission=async(request:FastifyRequest,r:{project_id:number|null})=>users.demandPermission(request,r.project_id?'project.read':'inquiry.read');
 const detail=async(tx:Transaction,id:number,request:FastifyRequest)=>reportDto(tx,await readReport(tx,id),await users.required(request));
 const publicOptions={config:{public:true,rateLimit:{max:20,timeWindow:'1 minute'}},logLevel:'silent' as const};
 const publicImageOptions={config:{public:true,rateLimit:{max:120,timeWindow:'1 minute'}},logLevel:'silent' as const};

 app.get('/api/v1/reports/workspace/templates',async request=>{
  await actorFor(request);
  return {version:1,teamConsent:TEAM_CONSENT,customerConsent:CUSTOMER_CONSENT,templates:REPORT_TYPES.map(reportType=>({reportType,sourceKinds:reportType==='POC'?['INQUIRY']:reportType==='INSPECTION'?['INQUIRY','PROJECT']:['PROJECT'],commonSections:['purpose','scope','participants','workPerformed','findings','nextActions'],sections:sections[reportType],body:{},supportsDynamicRows:true}))};
 });
 app.get('/api/v1/reports/workspace/people',async request=>{
  const actor=await actorFor(request),b=request.query as Record<string,unknown>,kind=requiredText(b.sourceKind,20,'Source'),sourceId=positiveLong(b.sourceId,'Source');
  if(!['PROJECT','INQUIRY'].includes(kind))throw new ApiError(400,'report_source','Select Inquiry or Project.');
  await users.demandPermission(request,kind==='PROJECT'?'project.read':'inquiry.read');
  return db.transaction(async tx=>{
   await reportSource(tx,actor,kind,sourceId);const rows=(await new sql.Request(tx).query<{id:number;name:string;role:string}>('SELECT u.id,u.name,r.code role FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.is_active=1 AND u.deleted_at IS NULL ORDER BY u.name')).recordset;
   const items=[];for(const row of rows) {
    const p=await reportPermissions(tx,Number(row.id));if(!p.has('report.review')&&!p.has('report.approve'))continue;
    try{await reportSource(tx,{id:Number(row.id),role:row.role} as CurrentUser,kind,sourceId);}catch(error){if(error instanceof ApiError&&error.statusCode===403)continue;throw error;}
    items.push({id:Number(row.id),name:row.name,...reportSignerCapabilities(p)});
   }return {items};
  });
 });
 app.get('/api/v1/reports/workspace/sources',async request=>{
  const actor=await actorFor(request),q=request.query as Record<string,unknown>,page=clampedInteger(q.page,1,1,100000),pageSize=clampedInteger(q.pageSize,50,1,100),search=String(q.search??'').slice(0,200);
  const can=(permission:string)=>db.query<{allowed:number}>(`SELECT COUNT(*) allowed FROM dbo.users u JOIN dbo.role_permissions rp ON rp.role_id=u.role_id JOIN dbo.permissions p ON p.id=rp.permission_id WHERE u.id=@actor AND p.code=@permission`,s=>s.input('actor',sql.BigInt,actor.id).input('permission',sql.NVarChar(100),permission));
  const [iq,pj]=await Promise.all([can('inquiry.read'),can('project.read')]);
  const result=await db.query<Record<string,unknown>>(`WITH sources AS (
   SELECT i.id,N'INQUIRY' sourceKind,i.inquiry_no reference,i.project_name title FROM dbo.inquiries i WHERE @iq=1 AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected') AND (@elevated=1 OR i.created_by=@actor OR i.estimate_owner_id=@actor)
   UNION ALL SELECT p.id,N'PROJECT',p.project_no,p.name FROM dbo.projects p WHERE @pj=1 AND p.deleted_at IS NULL AND p.status<>N'Closed' AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)))
   SELECT *,COUNT(*) OVER() total FROM sources WHERE reference LIKE N'%'+@search+N'%' OR title LIKE N'%'+@search+N'%' ORDER BY sourceKind,reference OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,s=>s.input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,reportElevated(actor)).input('iq',sql.Bit,Number(iq.recordset[0]?.allowed)>0).input('pj',sql.Bit,Number(pj.recordset[0]?.allowed)>0).input('search',sql.NVarChar(200),search).input('offset',sql.Int,(page-1)*pageSize).input('limit',sql.Int,pageSize));
  return {items:result.recordset.map(r=>({id:Number(r.id),sourceKind:r.sourceKind,reference:r.reference,title:r.title})),page,pageSize,total:Number(result.recordset[0]?.total??0)};
 });
 app.get('/api/v1/reports/workspace',async request=>{
  const actor=await actorFor(request),b=request.query as Record<string,unknown>,page=clampedInteger(b.page,1,1,100000),pageSize=clampedInteger(b.pageSize,50,1,100);
  return db.transaction(async tx=>{
   const q=new sql.Request(tx);q.input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,reportElevated(actor)).input('search',sql.NVarChar(200),String(b.search??'').slice(0,200)).input('type',sql.NVarChar(20),String(b.reportType??'')).input('status',sql.NVarChar(30),String(b.status??'')).input('offset',sql.Int,(page-1)*pageSize).input('limit',sql.Int,pageSize);
   const predicate=` WHERE r.revision=h.current_revision AND (@type=N'' OR h.report_type=@type) AND (@status=N'' OR r.state=@status) AND (r.title LIKE N'%'+@search+N'%' OR h.report_no LIKE N'%'+@search+N'%')
   AND EXISTS(SELECT 1 FROM dbo.users u JOIN dbo.role_permissions rp ON rp.role_id=u.role_id JOIN dbo.permissions perm ON perm.id=rp.permission_id WHERE u.id=@actor AND perm.code=CASE WHEN h.project_id IS NULL THEN N'inquiry.read' ELSE N'project.read' END)
   AND ((h.project_id IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.projects p WHERE p.id=h.project_id AND p.deleted_at IS NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))))
   OR (h.inquiry_id IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.inquiries i WHERE i.id=h.inquiry_id AND i.deleted_at IS NULL AND (@elevated=1 OR i.created_by=@actor OR i.estimate_owner_id=@actor OR r.prepared_by=@actor OR r.reviewer_id=@actor OR r.approver_id=@actor))))`;
   const rows=(await q.query<ReportRow>(`${REPORT_SELECT}${predicate} ORDER BY r.updated_at DESC,h.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;SELECT COUNT(*) total FROM dbo.unified_reports h JOIN dbo.unified_report_revisions r ON r.report_id=h.id ${predicate};`));
   const items=[];for(const row of rows.recordsets[0] as ReportRow[])items.push(await reportDto(tx,row,actor));
   return {items,page,pageSize,total:Number((rows.recordsets[1] as unknown as {total:number}[])[0]?.total??0)};
  },sql.ISOLATION_LEVEL.READ_COMMITTED);
 });
 app.get('/api/v1/reports/workspace/:id',async request=>{
  const actor=await actorFor(request),id=positiveLong((request.params as {id:string}).id,'Report'),query=request.query as Record<string,unknown>;
  const revision=query.revision===undefined?undefined:clampedInteger(query.revision,0,0,100000);
  return db.transaction(async tx=>{const r=await readReport(tx,id,revision);await requireSourcePermission(request,r);return reportDto(tx,r,actor);});
 });
 // Creating a report immediately inserts a real DRAFT row (see the handler below) --
 // the "New report" wizard calls this once a type + source is picked, before any real
 // content is entered, so a preparer who restarts or picks the wrong source ends up
 // with a stray empty draft. Let the frontend warn and offer to reopen it instead of
 // silently accumulating clutter.
 app.get('/api/v1/reports/workspace/existing-draft',async request=>{
  const actor=await actorFor(request,'report.write'),q=request.query as Record<string,unknown>;
  const type=requiredText(q.reportType,20,'Report type'),kind=requiredText(q.sourceKind,20,'Source kind'),sourceId=positiveLong(String(q.sourceId),'Source');
  validateReportSource(type,kind);
  const column=kind==='PROJECT'?'h.project_id':'h.inquiry_id';
  const rows=(await db.query<{id:number;report_no:string;title:string;created_at:Date}>(`
   SELECT h.id,h.report_no,r.title,h.created_at
   FROM dbo.unified_reports h
   JOIN dbo.unified_report_revisions r ON r.report_id=h.id AND r.revision=h.current_revision
   WHERE h.report_type=@type AND ${column}=@source AND r.state='DRAFT' AND r.prepared_by=@actor
   ORDER BY h.id DESC`,
   s=>s.input('type',sql.NVarChar(20),type).input('source',sql.BigInt,sourceId).input('actor',sql.BigInt,actor.id),
  )).recordset;
  return {items:rows.map(row=>({id:Number(row.id),number:row.report_no,title:row.title,createdAt:row.created_at}))};
 });
 app.post('/api/v1/reports/workspace',async(request,reply)=>{
  const actor=await actorFor(request,'report.write'),b=bodyObject(request.body),input=draftInput(b.templateId==null?b:{...b,body:{}}),type=requiredText(b.reportType,20,'Report type'),kind=requiredText(b.sourceKind,20,'Source kind'),sourceId=positiveLong(String(b.sourceId),'Source');
  if(b.templateId==null&&b.templateVersion!=null)throw new ApiError(400,'report_template_version','Template id and version must be supplied together.');
  validateReportSource(type,kind);await users.demandPermission(request,kind==='PROJECT'?'project.read':'inquiry.read');
  const scheduleId=b.scheduleTaskId==null?null:positiveLong(String(b.scheduleTaskId),'Schedule task');
  const result=await db.transaction(async tx=>{
   await reportSource(tx,actor,kind,sourceId,true);const source={project_id:kind==='PROJECT'?sourceId:null,inquiry_id:kind==='INQUIRY'?sourceId:null};
   await eligibleReportSigners(tx,source,actor.id,input.reviewerId,input.approverId);
   const template=b.templateId==null?null:await reportTemplateSnapshot(tx,b.templateId,b.templateVersion,type,actor);
   if(template){input.bodyJson=template.bodyJson;if(b.locale==null)input.locale=template.locale;}
   const q=new sql.Request(tx);q.input('project',sql.BigInt,source.project_id).input('inquiry',sql.BigInt,source.inquiry_id).input('task',sql.BigInt,scheduleId);
   if(scheduleId&&(!source.project_id||!(await q.query('SELECT id FROM dbo.schedule_tasks WHERE id=@task AND project_id=@project AND deleted_at IS NULL')).recordset.length))throw new ApiError(400,'report_task_source','Schedule task must belong to this project.');
   const number=await issueDocumentNumber(tx,'RPT',input.reportDate);
   q.input('number',sql.NVarChar(40),number).input('type',sql.NVarChar(20),type).input('actor',sql.BigInt,actor.id).input('template',sql.BigInt,template?.id??null).input('templateVersion',sql.Int,template?.version??null).input('templateName',sql.NVarChar(200),template?.name??null);
   const id=Number((await q.query<{id:number}>('INSERT dbo.unified_reports(report_no,report_type,inquiry_id,project_id,schedule_task_id,created_by,template_id,template_version,template_name) OUTPUT inserted.id VALUES(@number,@type,@inquiry,@project,@task,@actor,@template,@templateVersion,@templateName)')).recordset[0]!.id);
   await insertRevision(tx,id,0,actor.id,input);
   await insertAudit(tx,actor.id,'Report',id,number,'Created',null,{type,sourceKind:kind,sourceId});return detail(tx,id,request);
  });return reply.status(201).send(result);
 });
 app.put('/api/v1/reports/workspace/:id',async request=>{
  const actor=await actorFor(request,'report.write'),id=positiveLong((request.params as {id:string}).id,'Report'),b=bodyObject(request.body),input=draftInput(b);
  return db.transaction(async tx=>{const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor,true);reportVersion(r,b.rowVersion);
   if(r.state!=='DRAFT'||Number(r.prepared_by)!==actor.id)throw new ApiError(409,'report_draft_owner','Only the preparer may edit a draft.');
   await eligibleReportSigners(tx,r,actor.id,input.reviewerId,input.approverId);const q=bindDraft(tx,input);q.input('revision',sql.BigInt,r.revision_id);
   await q.query('UPDATE dbo.unified_report_revisions SET title=@title,report_date=@date,locale=@locale,body_json=@body,reviewer_id=@reviewer,approver_id=@approver,updated_at=SYSUTCDATETIME() WHERE id=@revision');
   await insertAudit(tx,actor.id,'Report',id,r.report_no,'Draft updated',null,{revision:r.revision});return detail(tx,id,request);
  });
 });
 app.post('/api/v1/reports/workspace/:id/evidence',{config:{rateLimit:DOCUMENT_UPLOAD_RATE_LIMIT}},async(request,reply)=>{
  const actor=await actorFor(request,'report.write'),id=positiveLong((request.params as {id:string}).id,'Report');
  await db.transaction(async tx=>{const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor,true);if(r.state!=='DRAFT'||r.revision!==r.current_revision||Number(r.prepared_by)!==actor.id)throw new ApiError(409,'report_evidence_draft','Evidence images can be added only by the preparer of the current draft.');});
  const upload=await readMultipartUpload(request,Math.min(REPORT_EVIDENCE_MAX_FILE,config.documentStorage.maxFileSizeBytes)),name=uploadedFileName(upload.file.filename),extension=validateFileExtension(name,REPORT_IMAGE_EXTENSIONS),mime=contentTypeFor(name);
  validateReportEvidenceImage(await readFile(upload.file.filepath),extension);
  const storage=storageKey(`reports/${id}/evidence`,extension),write=await writeStoredFile(config.documentStorage,storage,upload.file.filepath);
  let keep=false;
  try {
   const attachment=await db.transaction(async tx=>{
    const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor,true);
    if(r.state!=='DRAFT'||r.revision!==r.current_revision||Number(r.prepared_by)!==actor.id)throw new ApiError(409,'report_evidence_draft','The report is no longer an editable draft.');
    const q=new sql.Request(tx).input('report',sql.BigInt,id).input('actor',sql.BigInt,actor.id);
    const count=Number((await q.query<{total:number}>('SELECT COUNT(*) total FROM dbo.unified_report_evidence_files WHERE report_id=@report')).recordset[0]?.total??0);
    if(count>=100)throw new ApiError(400,'report_evidence_limit','A report can contain at most 100 uploaded evidence images across its revisions.');
    q.input('name',sql.NVarChar(500),name).input('mime',sql.NVarChar(100),mime).input('storage',sql.NVarChar(1000),storage).input('size',sql.BigInt,write.sizeBytes).input('sha',sql.Char(64),write.sha256);
    const file=(await q.query<{id:number}>(`INSERT dbo.unified_report_evidence_files(report_id,uploaded_by,file_name,content_type,storage_key,size_bytes,sha256) OUTPUT inserted.id VALUES(@report,@actor,@name,@mime,@storage,@size,@sha)`)).recordset[0]!;
    await insertAudit(tx,actor.id,'Report',id,r.report_no,'Evidence image uploaded',null,{attachmentId:Number(file.id),fileName:name,sizeBytes:write.sizeBytes,sha256:write.sha256});
    return {attachmentId:Number(file.id),attachmentName:name,attachmentContentType:mime,attachmentSizeBytes:write.sizeBytes,attachmentSha256:write.sha256};
   });keep=true;return reply.status(201).send(attachment);
  }catch(error){if(error instanceof DatabaseCommitOutcomeUnknownError){keep=true;request.log.error({storageKey:storage,reportId:id},'Report evidence upload commit unknown; retained for reconciliation');}throw error;}
  finally{if(!keep)await deleteStoredFile(config.documentStorage,storage);}
 });
 app.get('/api/v1/reports/workspace/:id/evidence/:attachmentId/content',{config:{rateLimit:DOCUMENT_DOWNLOAD_RATE_LIMIT}},async(request,reply)=>{
  const actor=await actorFor(request),params=request.params as {id:string;attachmentId:string},id=positiveLong(params.id,'Report'),attachmentId=positiveLong(params.attachmentId,'Evidence image');
  const file=await db.transaction(async tx=>{const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor);const value=(await new sql.Request(tx).input('report',sql.BigInt,id).input('file',sql.BigInt,attachmentId).query<{file_name:string;content_type:string;storage_key:string;size_bytes:number;sha256:string}>('SELECT file_name,content_type,storage_key,size_bytes,sha256 FROM dbo.unified_report_evidence_files WHERE report_id=@report AND id=@file')).recordset[0];if(!value)throw new ApiError(404,'report_evidence_missing','The evidence image is unavailable.');return value;});
  return sendStoredFile(request,reply,config.documentStorage,{storageKey:file.storage_key,fileName:file.file_name,contentType:file.content_type,sizeBytes:Number(file.size_bytes),sha256:file.sha256},{inline:true});
 });
 app.post('/api/v1/reports/workspace/:id/exports',{config:{rateLimit:DOCUMENT_UPLOAD_RATE_LIMIT}},async(request,reply)=>{
  const actor=await actorFor(request),id=positiveLong((request.params as {id:string}).id,'Report');
  await db.transaction(async tx=>{const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor);});
  const upload=await readMultipartUpload(request,config.documentStorage.maxFileSizeBytes),name=uploadedFileName(upload.file.filename),extension=validateFileExtension(name,REPORT_EXPORT_EXTENSIONS),mime=contentTypeFor(name),format=extension==='.pdf'?'pdf':'pptx';
  const storage=storageKey(`reports/${id}/exports`,extension),write=await writeStoredFile(config.documentStorage,storage,upload.file.filepath);
  let keep=false;
  try {
   const record=await db.transaction(async tx=>{
    const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor);
    const q=new sql.Request(tx).input('report',sql.BigInt,id).input('revision',sql.Int,r.revision).input('format',sql.NVarChar(10),format).input('actor',sql.BigInt,actor.id).input('name',sql.NVarChar(500),name).input('mime',sql.NVarChar(150),mime).input('storage',sql.NVarChar(1000),storage).input('size',sql.BigInt,write.sizeBytes).input('sha',sql.Char(64),write.sha256);
    const row=(await q.query<{id:number}>(`INSERT dbo.unified_report_exports(report_id,revision,format,generated_by,file_name,content_type,storage_key,size_bytes,sha256) OUTPUT inserted.id VALUES(@report,@revision,@format,@actor,@name,@mime,@storage,@size,@sha)`)).recordset[0]!;
    await insertAudit(tx,actor.id,'Report',id,r.report_no,'Export archived',null,{exportId:Number(row.id),format,fileName:name,sizeBytes:write.sizeBytes,sha256:write.sha256});
    return {id:Number(row.id),format,fileName:name,contentType:mime,sizeBytes:write.sizeBytes,sha256:write.sha256,revision:r.revision,createdAt:new Date().toISOString()};
   });keep=true;return reply.status(201).send(record);
  }catch(error){if(error instanceof DatabaseCommitOutcomeUnknownError){keep=true;request.log.error({storageKey:storage,reportId:id},'Report export upload commit unknown; retained for reconciliation');}throw error;}
  finally{if(!keep)await deleteStoredFile(config.documentStorage,storage);}
 });
 app.get('/api/v1/reports/workspace/:id/exports',async request=>{
  const actor=await actorFor(request),id=positiveLong((request.params as {id:string}).id,'Report');
  return db.transaction(async tx=>{
   const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor);
   const rows=(await new sql.Request(tx).input('report',sql.BigInt,id).query<{id:number;revision:number;format:string;file_name:string;content_type:string;size_bytes:number;sha256:string;created_at:Date}>('SELECT id,revision,format,file_name,content_type,size_bytes,sha256,created_at FROM dbo.unified_report_exports WHERE report_id=@report ORDER BY id DESC')).recordset;
   return {items:rows.map(row=>({id:Number(row.id),revision:row.revision,format:row.format,fileName:row.file_name,contentType:row.content_type,sizeBytes:Number(row.size_bytes),sha256:row.sha256,createdAt:row.created_at}))};
  });
 });
 app.get('/api/v1/reports/workspace/:id/exports/:exportId/content',{config:{rateLimit:DOCUMENT_DOWNLOAD_RATE_LIMIT}},async(request,reply)=>{
  const actor=await actorFor(request),params=request.params as {id:string;exportId:string},id=positiveLong(params.id,'Report'),exportId=positiveLong(params.exportId,'Export');
  const file=await db.transaction(async tx=>{const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor);const value=(await new sql.Request(tx).input('report',sql.BigInt,id).input('export',sql.BigInt,exportId).query<{file_name:string;content_type:string;storage_key:string;size_bytes:number;sha256:string}>('SELECT file_name,content_type,storage_key,size_bytes,sha256 FROM dbo.unified_report_exports WHERE report_id=@report AND id=@export')).recordset[0];if(!value)throw new ApiError(404,'report_export_missing','The exported document is unavailable.');return value;});
  return sendStoredFile(request,reply,config.documentStorage,{storageKey:file.storage_key,fileName:file.file_name,contentType:file.content_type,sizeBytes:Number(file.size_bytes),sha256:file.sha256},{inline:false});
 });
 app.post('/api/v1/reports/workspace/:id/:action',async request=>{
  const {id:rawId,action}=request.params as {id:string;action:string},id=positiveLong(rawId,'Report'),b=bodyObject(request.body);
  if(!['submit','review','approve','return','revise','void','discard','customer-link','revoke-customer-link'].includes(action))throw new ApiError(400,'report_action','Unknown report action.');
  const permission=action==='review'?'report.review':['approve','void'].includes(action)?'report.approve':action==='return'?'report.read':'report.write';
  const actor=await actorFor(request,permission),note=typeof b.note==='string'?b.note.trim().slice(0,2000):'';
  return db.transaction(async tx=>{
   const r=await readReport(tx,id);await requireSourcePermission(request,r);await reportAccess(tx,r,actor,true);reportVersion(r,b.rowVersion);
   const q=new sql.Request(tx);q.input('revision',sql.BigInt,r.revision_id).input('id',sql.BigInt,id).input('note',sql.NVarChar(2000),note);
   let next=r.state;
   if(action==='submit') {
    if(r.state!=='DRAFT'||Number(r.prepared_by)!==actor.id)throw new ApiError(409,'report_transition','Only the preparer may submit a draft.');
    validateReportForSubmission(r.report_type,r.body_json);
    await validateReportEvidenceFiles(tx,r);
    await eligibleReportSigners(tx,r,Number(r.prepared_by),r.reviewer_id===null?null:Number(r.reviewer_id),Number(r.approver_id));
    const snapshot=reportSnapshot(r,await reportAccess(tx,r,actor));
    await signReport(tx,db,request,actor,r,'PREPARE',snapshot,b.consent);next='SUBMITTED';
    q.input('snapshot',sql.NVarChar(sql.MAX),snapshot).input('hash',sql.Char(64),reportHash(snapshot));
    await q.query('UPDATE dbo.unified_report_revisions SET submitted_at=SYSUTCDATETIME(),snapshot_json=@snapshot,snapshot_sha256=@hash WHERE id=@revision');
   } else if(action==='review') {
    if(r.state!=='SUBMITTED'||Number(r.reviewer_id)!==actor.id||Number(r.prepared_by)===actor.id)throw new ApiError(409,'report_transition','Only the assigned reviewer may review this submission.');
    if(b.sign!==false)await signReport(tx,db,request,actor,r,'REVIEW',r.snapshot_json!,b.consent);
    next='REVIEWED';await q.query('UPDATE dbo.unified_report_revisions SET reviewed_at=SYSUTCDATETIME() WHERE id=@revision');
   } else if(action==='approve') {
    if(r.state!==(r.reviewer_id===null?'SUBMITTED':'REVIEWED')||Number(r.approver_id)!==actor.id||Number(r.prepared_by)===actor.id)throw new ApiError(409,'report_transition','Only the assigned approver may approve after the required review.');
    await signReport(tx,db,request,actor,r,'APPROVE',r.snapshot_json!,b.consent);next='APPROVED';await q.query('UPDATE dbo.unified_report_revisions SET approved_at=SYSUTCDATETIME() WHERE id=@revision');
   } else if(action==='return') {
    const reviewer=r.state==='SUBMITTED'&&Number(r.reviewer_id)===actor.id,approver=['SUBMITTED','REVIEWED'].includes(r.state)&&Number(r.approver_id)===actor.id;
    if(!note||!reviewer&&!approver)throw new ApiError(409,'report_transition','Assigned reviewer or approver must provide a reason to request changes.');
    await users.demandPermission(request,reviewer?'report.review':'report.approve');next='CHANGES_REQUESTED';
   } else if(action==='revise') {
    if(!['CHANGES_REQUESTED','APPROVED','COMPLETED','VOID'].includes(r.state)||Number(r.prepared_by)!==actor.id||!note)throw new ApiError(409,'report_revision','The preparer must provide a reason to create a new revision. Revoke an active customer link first.');
    const input={title:r.title,reportDate:r.report_date.toISOString().slice(0,10),locale:r.locale,bodyJson:r.body_json,reviewerId:r.reviewer_id===null?null:Number(r.reviewer_id),approverId:Number(r.approver_id)};
    // A historical signer may have left or lost authority. Start an editable draft
    // so the preparer can replace them; draft save and submission still validate signers.
    await insertRevision(tx,id,r.current_revision+1,actor.id,input);
    await q.query('UPDATE dbo.unified_report_customer_links SET revoked_at=SYSUTCDATETIME() WHERE revision_id=@revision AND consumed_at IS NULL AND revoked_at IS NULL;UPDATE dbo.unified_reports SET current_revision=current_revision+1,updated_at=SYSUTCDATETIME() WHERE id=@id');
    await insertAudit(tx,actor.id,'Report',id,r.report_no,'New revision',{revision:r.revision},{revision:r.current_revision+1,note});return detail(tx,id,request);
   } else if(action==='void') {
    if(['COMPLETED','VOID'].includes(r.state)||Number(r.approver_id)!==actor.id||!note)throw new ApiError(409,'report_void','Assigned approver must provide a reason; completed evidence cannot be voided.');next='VOID';
    await q.query('UPDATE dbo.unified_report_customer_links SET revoked_at=SYSUTCDATETIME() WHERE revision_id=@revision AND consumed_at IS NULL AND revoked_at IS NULL');
   } else if(action==='discard') {
    // The preparer's own never-submitted draft: nothing signed, nothing reviewed, no
    // customer ever saw it. Mark it VOID (same terminal state 'void' uses) rather than
    // deleting so the audit trail stays intact, but no approver/note requirement --
    // this is just the preparer tidying up a report they decided not to continue.
    if(r.state!=='DRAFT'||Number(r.prepared_by)!==actor.id)throw new ApiError(409,'report_discard','Only the preparer may discard their own unsubmitted draft.');
    next='VOID';
   } else if(action==='customer-link') {
    if(r.state!=='APPROVED'||![Number(r.prepared_by),Number(r.approver_id)].includes(actor.id))throw new ApiError(409,'report_customer_link','Only the preparer or approver may issue a link for an approved revision.');
    const token=randomBytes(32).toString('base64url'),hours=clampedInteger(b.expiresInHours,72,1,168),expiresAt=new Date(Date.now()+hours*3600000);
    q.input('token',sql.Char(64),reportHash(token)).input('expires',sql.DateTimeOffset,expiresAt).input('actor',sql.BigInt,actor.id);
    await q.query(`UPDATE dbo.unified_report_customer_links SET revoked_at=SYSUTCDATETIME() WHERE revision_id=@revision AND consumed_at IS NULL AND revoked_at IS NULL;INSERT dbo.unified_report_customer_links(revision_id,token_hash,expires_at,created_by) VALUES(@revision,@token,@expires,@actor);UPDATE dbo.unified_report_revisions SET state=N'AWAITING_CUSTOMER',updated_at=SYSUTCDATETIME() WHERE id=@revision`);
    await insertAudit(tx,actor.id,'Report',id,r.report_no,'Customer link created',null,{revision:r.revision,expiresAt:expiresAt.toISOString()});
    return {report:await detail(tx,id,request),token,expiresAt:expiresAt.toISOString(),acknowledgmentPath:`/api/v1/report-acknowledgments/${token}`};
   } else {
    if(r.state!=='AWAITING_CUSTOMER'||![Number(r.prepared_by),Number(r.approver_id)].includes(actor.id))throw new ApiError(409,'report_customer_link','Only the preparer or approver may revoke an unused customer link.');
    await q.query('UPDATE dbo.unified_report_customer_links SET revoked_at=SYSUTCDATETIME() WHERE revision_id=@revision AND consumed_at IS NULL AND revoked_at IS NULL');next='APPROVED';
   }
   q.input('state',sql.NVarChar(30),next);await q.query('UPDATE dbo.unified_report_revisions SET state=@state,decision_note=@note,updated_at=SYSUTCDATETIME() WHERE id=@revision');
   await insertAudit(tx,actor.id,'Report',id,r.report_no,action,{revision:r.revision,status:r.state},{status:next,note});return detail(tx,id,request);
  });
 });
 // Suppress automatic request logging: the path contains a one-use bearer token.
 app.get('/api/v1/report-acknowledgments/:token',publicOptions,async request=>db.transaction(async tx=>{
  const {r}=await customerRevision(tx,(request.params as {token:string}).token);
  const snapshot=JSON.parse(r.snapshot_json!) as Record<string,unknown>;
  return {number:r.report_no,reportType:r.report_type,revision:r.revision,title:r.title,reportDate:snapshot.reportDate,locale:r.locale,body:snapshot.body,sourceReference:snapshot.sourceReference,sourceTitle:snapshot.sourceTitle,customer:snapshot.customer,endUserCustomerId:snapshot.endUserCustomerId??null,endUserName:snapshot.endUserName??null,endUserCode:snapshot.endUserCode??null,snapshotSha256:r.snapshot_sha256,consentText:CUSTOMER_CONSENT,assurance:'CUSTOMER_SELF_ASSERTED_LINK',modes:['ACKNOWLEDGMENT','DRAWN_SIGNATURE']};
 }));
 app.get('/api/v1/report-acknowledgments/:token/evidence/:attachmentId',publicImageOptions,async(request,reply)=>{
  const params=request.params as {token:string;attachmentId:string},attachmentId=positiveLong(params.attachmentId,'Evidence image');
  const file=await db.transaction(async tx=>{
   const {r}=await customerRevision(tx,params.token),snapshot=JSON.parse(r.snapshot_json!) as {body?:Record<string,unknown>},reference=reportEvidenceReferences(JSON.stringify(snapshot.body??{})).find(item=>item.id===attachmentId);
   if(!reference)throw new ApiError(404,'report_evidence_missing','The evidence image is not part of this approved report.');
   const value=(await new sql.Request(tx).input('report',sql.BigInt,r.id).input('file',sql.BigInt,attachmentId).query<{file_name:string;content_type:string;storage_key:string;size_bytes:number;sha256:string}>('SELECT file_name,content_type,storage_key,size_bytes,sha256 FROM dbo.unified_report_evidence_files WHERE report_id=@report AND id=@file')).recordset[0];
   if(!value||value.sha256!==reference.sha256)throw new ApiError(404,'report_evidence_missing','The evidence image is unavailable.');return value;
  });
  return sendStoredFile(request,reply,config.documentStorage,{storageKey:file.storage_key,fileName:file.file_name,contentType:file.content_type,sizeBytes:Number(file.size_bytes),sha256:file.sha256},{inline:true});
 });
 app.post('/api/v1/report-acknowledgments/:token',{...publicOptions,bodyLimit:400000},async request=>{
  const input=parseCustomerEvidence(request.body),b=bodyObject(request.body);await validateCustomerPng(input.image);
  return db.transaction(async tx=>{
   const {r,linkId}=await customerRevision(tx,(request.params as {token:string}).token);
   if(b.snapshotSha256!==r.snapshot_sha256)throw new ApiError(409,'report_snapshot_changed','Review this exact report before acknowledging it.');
   const evidence=JSON.stringify({assurance:'CUSTOMER_SELF_ASSERTED_LINK',name:input.name,title:input.title,company:input.company,statedDate:input.date,consent:CUSTOMER_CONSENT,mode:input.mode,signatureSha256:input.image?reportHash(input.image):null,snapshotSha256:r.snapshot_sha256,occurredAt:new Date().toISOString(),ip:clientIp(request),userAgent:clientUserAgent(request)?.slice(0,400)??null});
   const q=new sql.Request(tx);q.input('revision',sql.BigInt,r.revision_id).input('link',sql.BigInt,linkId).input('name',sql.NVarChar(200),input.name).input('title',sql.NVarChar(200),input.title).input('company',sql.NVarChar(300),input.company).input('date',sql.Date,input.date).input('consent',sql.NVarChar(1000),CUSTOMER_CONSENT).input('mode',sql.NVarChar(30),input.mode).input('image',sql.VarBinary(sql.MAX),input.image).input('imageHash',sql.Char(64),input.image?reportHash(input.image):null).input('snapshot',sql.Char(64),r.snapshot_sha256).input('evidence',sql.NVarChar(sql.MAX),evidence).input('hash',sql.Char(64),reportHash(evidence));
   await q.query(`INSERT dbo.unified_report_acknowledgments(revision_id,link_id,signer_name,signer_title,signer_company,stated_date,consent_text,mode,signature_png,signature_sha256,snapshot_sha256,evidence_json,evidence_sha256) VALUES(@revision,@link,@name,@title,@company,@date,@consent,@mode,@image,@imageHash,@snapshot,@evidence,@hash);
    UPDATE dbo.unified_report_customer_links SET consumed_at=SYSUTCDATETIME() WHERE id=@link;
    UPDATE dbo.unified_report_revisions SET state=N'COMPLETED',completed_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@revision;`);
   return {status:'COMPLETED',number:r.report_no,revision:r.revision,snapshotSha256:r.snapshot_sha256,evidenceSha256:reportHash(evidence),assurance:'CUSTOMER_SELF_ASSERTED_LINK'};
  });
 });
}

function bindDraft(tx:Transaction,input:ReturnType<typeof draftInput>) {
 return new sql.Request(tx).input('title',sql.NVarChar(500),input.title).input('date',sql.Date,input.reportDate).input('locale',sql.NVarChar(5),input.locale).input('body',sql.NVarChar(sql.MAX),input.bodyJson).input('reviewer',sql.BigInt,input.reviewerId).input('approver',sql.BigInt,input.approverId);
}
async function insertRevision(tx:Transaction,id:number,revision:number,author:number,input:ReturnType<typeof draftInput>) {
 const q=bindDraft(tx,input);q.input('report',sql.BigInt,id).input('rev',sql.Int,revision).input('actor',sql.BigInt,author);
 await q.query('INSERT dbo.unified_report_revisions(report_id,revision,title,report_date,locale,body_json,prepared_by,reviewer_id,approver_id) VALUES(@report,@rev,@title,@date,@locale,@body,@actor,@reviewer,@approver)');
}
async function customerRevision(tx:Transaction,token:string) {
 const missing=()=>new ApiError(404,'customer_link_unavailable','This customer link is invalid, expired or no longer available.');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw missing();
 const q=new sql.Request(tx);q.input('hash',sql.Char(64),reportHash(token));
 // Header-before-link lock order matches internal lifecycle routes.
 const found=(await q.query<{report_id:number;revision:number;id:number}>(`SELECT l.id,r.report_id,r.revision FROM dbo.unified_report_customer_links l WITH(READCOMMITTEDLOCK) JOIN dbo.unified_report_revisions r WITH(READCOMMITTEDLOCK) ON r.id=l.revision_id WHERE l.token_hash=@hash`)).recordset[0];
 if(!found)throw missing();
 const r=await readReport(tx,Number(found.report_id),found.revision);
 const valid=(await q.query('SELECT id FROM dbo.unified_report_customer_links WITH(UPDLOCK,HOLDLOCK) WHERE token_hash=@hash AND expires_at>SYSUTCDATETIME() AND consumed_at IS NULL AND revoked_at IS NULL')).recordset[0];
 if(!valid||r.state!=='AWAITING_CUSTOMER'||r.revision!==r.current_revision||!r.snapshot_json||reportHash(r.snapshot_json)!==r.snapshot_sha256)throw missing();
 return {r,linkId:Number(found.id)};
}
