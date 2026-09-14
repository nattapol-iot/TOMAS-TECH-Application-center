import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import sql from 'mssql';
import type { Transaction } from 'mssql';
import type { FastifyRequest } from 'fastify';
import type { Database } from './db.js';
import type { CurrentUser } from './types.js';
import { ApiError } from './errors.js';
import { bodyObject, dateOnly, parseDateOnly, parseRowVersion, positiveLong, requiredText } from './http.js';
import { activeSpecimenId, evaluateSigningAssurance, clientIp, clientUserAgent } from './signing-core.js';

export const REPORT_TYPES = ['INSTALLATION','UAT','SERVICE','INSPECTION','POC'] as const;
export const CUSTOMER_CONSENT = 'I have read this exact report revision and consent to record my acknowledgment or signature, identity and date against it.';
export const TEAM_CONSENT = 'I have reviewed this exact report revision and authorize use of my own signature specimen for this action.';
export const reportHash = (value:string|Buffer) => createHash('sha256').update(value).digest('hex');
export const reportElevated = (actor:CurrentUser) => ['Engineering Manager','Admin'].includes(actor.role);
// Match CurrentUserService: additional business roles grant only the signing
// capabilities exposed by the view, never broad source access or report approval.
export async function reportPermissions(tx:Transaction,userId:number) {
 const q=new sql.Request(tx);q.input('user',sql.BigInt,userId);
 return new Set((await q.query<{code:string}>(`SELECT p.code FROM dbo.users u JOIN dbo.role_permissions rp ON rp.role_id=u.role_id JOIN dbo.permissions p ON p.id=rp.permission_id WHERE u.id=@user UNION SELECT code FROM dbo.user_signing_permissions WHERE user_id=@user`)).recordset.map(p=>p.code));
}
export type ReportRow = {
 id:number; report_no:string; report_type:string; inquiry_id:number|null; project_id:number|null; schedule_task_id:number|null;
 current_revision:number; created_by:number; revision_id:number; revision:number; title:string; report_date:Date; locale:string;
 body_json:string; state:string; prepared_by:number; reviewer_id:number|null; approver_id:number; row_version:Buffer;
 submitted_at:Date|null; reviewed_at:Date|null; approved_at:Date|null; completed_at:Date|null; created_at:Date; updated_at:Date;
 snapshot_json:string|null; snapshot_sha256:string|null; decision_note:string;
 template_id:number|null;template_version:number|null;template_name:string|null;
};
export const REPORT_SELECT = `SELECT h.id,h.report_no,h.report_type,h.inquiry_id,h.project_id,h.schedule_task_id,h.current_revision,h.created_by,h.template_id,h.template_version,h.template_name,
 r.id revision_id,r.revision,r.title,r.report_date,r.locale,r.body_json,r.state,r.prepared_by,r.reviewer_id,r.approver_id,r.row_version,
 r.submitted_at,r.reviewed_at,r.approved_at,r.completed_at,r.created_at,r.updated_at,r.snapshot_json,r.snapshot_sha256,r.decision_note
 FROM dbo.unified_reports h JOIN dbo.unified_report_revisions r ON r.report_id=h.id`;
export function validateReportSource(type:string,kind:string) {
 if(!REPORT_TYPES.includes(type as typeof REPORT_TYPES[number])||!['INQUIRY','PROJECT'].includes(kind)) throw new ApiError(400,'report_type','Select a valid report type and source.');
 if(type==='POC'&&kind!=='INQUIRY'||['INSTALLATION','UAT','SERVICE'].includes(type)&&kind!=='PROJECT') throw new ApiError(400,'report_source','This report type does not support the selected source.');
}
export function parseReportBody(value:unknown) {
 const body=bodyObject(value),encoded=JSON.stringify(body);
 if(Buffer.byteLength(encoded,'utf8')>200000)throw new ApiError(400,'report_body_large','Report content exceeds 200 KB.');
 return encoded;
}
export type ReportEvidenceReference={rowIndex:number;id:number;name:string;contentType:string;sizeBytes:number;sha256:string};
export function reportEvidenceReferences(bodyJson:string):ReportEvidenceReference[] {
 const body=JSON.parse(bodyJson) as Record<string,unknown>,evidence=Array.isArray(body.evidence)?body.evidence:[];
 return evidence.flatMap((value,rowIndex)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  const row=value as Record<string,unknown>;
  if(row.attachmentId==null)return [];
  return [{rowIndex,id:Number(row.attachmentId),name:String(row.attachmentName??''),contentType:String(row.attachmentContentType??''),sizeBytes:Number(row.attachmentSizeBytes),sha256:String(row.attachmentSha256??'')}];
 });
}
export async function validateReportEvidenceFiles(tx:Transaction,r:Pick<ReportRow,'id'|'body_json'>) {
 const references=reportEvidenceReferences(r.body_json);if(!references.length)return;
 const rows=(await new sql.Request(tx).input('report',sql.BigInt,r.id).query<{id:number;file_name:string;content_type:string;size_bytes:number;sha256:string}>('SELECT id,file_name,content_type,size_bytes,sha256 FROM dbo.unified_report_evidence_files WHERE report_id=@report')).recordset;
 const files=new Map(rows.map(file=>[Number(file.id),file]));
 const issues:{path:string;message:string}[]=[];
 references.forEach(reference=>{
  const file=files.get(reference.id);
  if(!file||file.file_name!==reference.name||file.content_type!==reference.contentType||Number(file.size_bytes)!==reference.sizeBytes||file.sha256!==reference.sha256)issues.push({path:`evidence[${reference.rowIndex}].attachmentId`,message:`Evidence image ${reference.rowIndex+1} is missing or its saved metadata does not match.`});
 });
 if(issues.length)throw new ApiError(422,'report_evidence_file','One or more evidence images are unavailable. Upload the images again before submitting.',{issues});
}
/** Drafts remain unrestricted. A signature may only freeze a usable report. */
export function validateReportForSubmission(reportType:string,bodyJson:string) {
 const issues:{path:string;message:string}[]=[];
 const problem=(path:string,message:string)=>issues.push({path,message});
 const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
 const present=(value:unknown)=>typeof value==='string'?value.trim().length>0:typeof value==='number'&&Number.isFinite(value);
 const blank=(value:unknown):boolean=>value===null||value===undefined||typeof value==='string'&&!value.trim()||Array.isArray(value)&&value.every(blank)||object(value)&&Object.values(value).every(blank);
 let body:Record<string,unknown>={};
 try {const parsed:unknown=JSON.parse(bodyJson);if(object(parsed))body=parsed;else problem('body','Report content must be an object.');}catch{problem('body','Report content must be valid JSON.');}
 const required=(row:Record<string,unknown>,fields:string[],path:string)=>{
  for(const field of fields)if(!present(row[field]))problem(`${path}.${field}`,`${path}.${field} is required.`);
 };
 for(const [section,fields] of [['overview',['objective','summary']],['context',['start','end']]] as const) {
  const value=body[section];required(object(value)?value:{},[...fields],section);
 }
 const context=object(body.context)?body.context:{};
 for(const field of ['start','end'])if(present(context[field])&&(typeof context[field]!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(context[field])||!Number.isFinite(Date.parse(context[field]))))problem(`context.${field}`,`Context ${field} must be a valid date and time.`);
 if(typeof context.start==='string'&&typeof context.end==='string'&&Date.parse(context.end)<Date.parse(context.start))problem('context.end','Work end must not precede work start.');
 const rows=(key:string,fields:string[],resultField?:string)=>{
  const value=body[key];if(value===undefined||value===null)return 0;
  if(!Array.isArray(value)){problem(key,`${key} must be a list of rows.`);return 0;}
  let count=0;
  value.forEach((row:unknown,index:number)=>{
   const path=`${key}[${index}]`;
   if(!object(row)){problem(path,`${path} must be a row object.`);return;}
   if(blank(row))return;
   count++;required(row,fields,path);
   if(resultField&&present(row[resultField])&&!['PASS','FAIL','PARTIAL'].includes(String(row[resultField])))problem(`${path}.${resultField}`,`${path}.${resultField} must be PASS, FAIL or PARTIAL.`);
  });return count;
 };
 if(!REPORT_TYPES.includes(reportType as typeof REPORT_TYPES[number]))problem('reportType','Select a supported report type.');
 if(['INSTALLATION','SERVICE'].includes(reportType)) {
  const hardware=rows('hardware',['item','action']),software=rows('software',['module','action']);
  if(reportType==='INSTALLATION') {
   const commissioning=rows('commissioning',['checkpoint','expected','observed','result'],'result');
   if(hardware+software+commissioning===0)problem('installation','Add at least one hardware, software or commissioning activity.');
  }
 }
 if(reportType==='SERVICE')required(object(body.service)?body.service:{},['symptom','action','verification','testResult'],'service');
 if(reportType==='UAT'&&rows('scenarios',['scenario','step','expected','actual','result'],'result')===0)problem('scenarios','Add at least one complete UAT scenario and step.');
 if(reportType==='INSPECTION'&&rows('checkpoints',['checkpoint','expected','observed','result'],'result')===0)problem('checkpoints','Add at least one complete inspection checkpoint.');
 if(reportType==='POC'&&rows('trials',['hypothesis','successCriteria','trial','result'])===0)problem('trials','Add at least one complete POC trial.');
 rows('deliverables',['item','status']);
 rows('issues',['issue','owner','status']);
 rows('punchlist',['scenario','step','issue','owner','status']);
 rows('evidence',['topic','description','purpose']);
 if(Array.isArray(body.evidence))body.evidence.forEach((row:unknown,index:number)=>{
  if(!object(row)||blank(row))return;
  const attachment=row.attachmentId;
  if(attachment!=null&&(!Number.isSafeInteger(attachment)||Number(attachment)<1||typeof row.attachmentName!=='string'||!row.attachmentName.trim()||!['image/jpeg','image/png'].includes(String(row.attachmentContentType))||!Number.isSafeInteger(row.attachmentSizeBytes)||Number(row.attachmentSizeBytes)<1||!/^[a-f\d]{64}$/.test(String(row.attachmentSha256))))problem(`evidence[${index}].attachmentId`,`Evidence image ${index+1} has invalid attachment metadata.`);
  if(!present(row.reference)&&!present(row.url)&&attachment==null)problem(`evidence[${index}].attachmentId`,`Evidence row ${index+1} needs an image, file/document reference or URL.`);
 });
 if(issues.length)throw new ApiError(422,'report_incomplete',`Report is incomplete: ${issues.slice(0,3).map(issue=>issue.message).join(' ')}${issues.length>3?` (${issues.length} items need attention.)`:''}`,{issues});
}
export function draftInput(value:unknown) {
 const b=bodyObject(value),locale=typeof b.locale==='string'?b.locale:'en';
 if(!['en','th','ja'].includes(locale))throw new ApiError(400,'report_locale','Select en, th or ja.');
 return {title:requiredText(b.title,500,'Title'),reportDate:parseDateOnly(b.reportDate,'Report date')!,locale,bodyJson:parseReportBody(b.body),reviewerId:b.reviewerId==null?null:positiveLong(String(b.reviewerId),'Reviewer'),approverId:positiveLong(String(b.approverId),'Approver')};
}
export async function readReport(tx:Transaction,id:number,revision?:number) {
 const q=new sql.Request(tx);q.input('id',sql.BigInt,id).input('revision',sql.Int,revision??null);
 // Lock the header first for one lifecycle mutation per report, including link rotation.
 await q.query('SELECT id FROM dbo.unified_reports WITH(UPDLOCK,HOLDLOCK) WHERE id=@id');
 const r=(await q.query<ReportRow>(`${REPORT_SELECT} WHERE h.id=@id AND r.revision=COALESCE(@revision,h.current_revision);`)).recordset[0];
 if(!r)throw new ApiError(404,'report_not_found','Report not found.');return r;
}
export function reportVersion(r:ReportRow,value:unknown) {
 if(!r.row_version.equals(parseRowVersion(value)))throw new ApiError(409,'concurrency_conflict','Report changed. Refresh before continuing.');
}
export async function reportSource(tx:Transaction,actor:CurrentUser,kind:string,id:number,write=false,assigned=false) {
 const q=new sql.Request(tx);q.input('id',sql.BigInt,id).input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,reportElevated(actor)).input('assigned',sql.Bit,assigned);
 const predicate=kind==='PROJECT'
 ? `SELECT p.status,p.project_no reference,p.name title,c.name customer,eu.id endUserCustomerId,eu.name endUserName,eu.code endUserCode,CAST(CASE WHEN @elevated=1 OR @assigned=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor) THEN 1 ELSE 0 END AS bit) allowed FROM dbo.projects p JOIN dbo.customers c ON c.id=p.customer_id LEFT JOIN dbo.customers eu ON eu.id=p.end_user_customer_id WHERE p.id=@id AND p.deleted_at IS NULL`
 : `SELECT i.status,i.inquiry_no reference,i.project_name title,c.name customer,eu.id endUserCustomerId,eu.name endUserName,eu.code endUserCode,CAST(CASE WHEN @elevated=1 OR @assigned=1 OR i.created_by=@actor OR i.estimate_owner_id=@actor THEN 1 ELSE 0 END AS bit) allowed FROM dbo.inquiries i JOIN dbo.customers c ON c.id=i.customer_id LEFT JOIN dbo.customers eu ON eu.id=i.end_user_customer_id WHERE i.id=@id AND i.deleted_at IS NULL`;
 const row=(await q.query<{status:string;reference:string;title:string;customer:string;endUserCustomerId:number|null;endUserName:string|null;endUserCode:string|null;allowed:boolean}>(predicate)).recordset[0];
 if(!row)throw new ApiError(404,'report_source_missing','Report source is unavailable.');
 if(!row.allowed)throw new ApiError(403,'report_scope','You are not assigned to this report source.');
 if(write&&['Closed','Cancelled','Rejected'].includes(row.status))throw new ApiError(409,'report_source_closed','This source is closed.');
 return row;
}
export async function reportAccess(tx:Transaction,r:ReportRow,actor:CurrentUser,write=false) {
 // Project membership is checked even for a previously assigned reviewer, so
 // removing a person from a project revokes their access immediately.
 return reportSource(tx,actor,r.project_id?'PROJECT':'INQUIRY',Number(r.project_id??r.inquiry_id),write,!r.project_id&&[Number(r.prepared_by),Number(r.reviewer_id),Number(r.approver_id)].includes(actor.id));
}
export function reportSignerCapabilities(permissions: ReadonlySet<string>) {
 return {canReview:permissions.has('report.review'),canApprove:permissions.has('report.approve')&&permissions.has('signing.sign')};
}
export async function eligibleReportSigners(tx:Transaction,r:{project_id:number|null;inquiry_id:number|null},author:number,reviewer:number|null,approver:number) {
 if(author===approver||reviewer!==null&&(reviewer===author||reviewer===approver))throw new ApiError(400,'report_signer_separation','Prepare, review and approval require different people.');
 for(const [id,permission] of [[reviewer,'report.review'],[approver,'report.approve']] as const) {
  if(id===null)continue;
  const q=new sql.Request(tx);q.input('id',sql.BigInt,id).input('permission',sql.NVarChar(100),permission);
  const user=(await q.query<{id:number;role:string}>(`SELECT u.id,r.code role FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.id=@id AND u.is_active=1 AND u.deleted_at IS NULL AND (EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.code=@permission) OR EXISTS(SELECT 1 FROM dbo.user_signing_permissions WHERE user_id=u.id AND code=@permission))`)).recordset[0];
  if(!user || permission==='report.approve' && !reportSignerCapabilities(await reportPermissions(tx,Number(user.id))).canApprove)throw new ApiError(422,'report_signer_ineligible','Select an active eligible reviewer or approver.');
  await reportSource(tx,{id:Number(user.id),role:user.role} as CurrentUser,r.project_id?'PROJECT':'INQUIRY',Number(r.project_id??r.inquiry_id));
 }
}
export function reportSnapshot(r:ReportRow,source:{reference:string;title:string;customer:string;endUserCustomerId?:number|null;endUserName?:string|null;endUserCode?:string|null}) {
 return JSON.stringify({reportId:Number(r.id),reportNumber:r.report_no,reportType:r.report_type,templateId:r.template_id==null?null:Number(r.template_id),templateVersion:r.template_version??null,templateName:r.template_name??null,template:r.template_id==null?null:{id:Number(r.template_id),name:r.template_name,version:r.template_version},sourceKind:r.project_id?'PROJECT':'INQUIRY',sourceId:Number(r.project_id??r.inquiry_id),sourceReference:source.reference,sourceTitle:source.title,customer:source.customer,endUserCustomerId:source.endUserCustomerId??null,endUserName:source.endUserName??null,endUserCode:source.endUserCode??null,scheduleTaskId:r.schedule_task_id?Number(r.schedule_task_id):null,revision:r.revision,title:r.title,reportDate:dateOnly(r.report_date),locale:r.locale,body:JSON.parse(r.body_json),preparedById:Number(r.prepared_by),reviewerId:r.reviewer_id===null?null:Number(r.reviewer_id),approverId:Number(r.approver_id)});
}
export async function signReport(tx:Transaction,db:Database,request:FastifyRequest,actor:CurrentUser,r:ReportRow,stage:string,snapshot:string,consent:unknown) {
 if(consent!==true)throw new ApiError(400,'report_consent_required','Explicit signature consent is required.');
 if(!(await reportPermissions(tx,actor.id)).has('signing.sign'))throw new ApiError(403,'signing_permission_required','Your account does not have business signing authority.');
 const assurance=evaluateSigningAssurance(request),specimen=await activeSpecimenId(db,actor.id,tx);
 if(!specimen)throw new ApiError(409,'specimen_required','Set your own signature specimen before signing a report.');
 const evidence=JSON.stringify({actorId:actor.id,actorName:actor.name,stage,specimenId:specimen,consent:TEAM_CONSENT,snapshotSha256:reportHash(snapshot),assurance:assurance.evidence,authenticatedAt:assurance.authenticatedAt.toISOString(),occurredAt:new Date().toISOString(),ip:clientIp(request),userAgent:clientUserAgent(request)?.slice(0,400)??null});
 const q=new sql.Request(tx);q.input('revision',sql.BigInt,r.revision_id).input('actor',sql.BigInt,actor.id).input('stage',sql.NVarChar(20),stage).input('specimen',sql.BigInt,specimen).input('snapshot',sql.NVarChar(sql.MAX),snapshot).input('hash',sql.Char(64),reportHash(snapshot)).input('evidence',sql.NVarChar(sql.MAX),evidence).input('evidenceHash',sql.Char(64),reportHash(evidence));
 await q.query('INSERT dbo.unified_report_signatures(revision_id,actor_id,stage,specimen_id,snapshot_json,snapshot_sha256,evidence_json,evidence_sha256) VALUES(@revision,@actor,@stage,@specimen,@snapshot,@hash,@evidence,@evidenceHash)');
}
export function parseCustomerEvidence(value:unknown) {
 const b=bodyObject(value);
 if(b.consent!==true)throw new ApiError(400,'customer_consent','Explicit customer consent is required.');
 const mode=requiredText(b.mode,30,'Mode');
 if(!['ACKNOWLEDGMENT','DRAWN_SIGNATURE'].includes(mode))throw new ApiError(400,'customer_mode','Choose acknowledgment or drawn signature.');
 let image:Buffer|null=null;
 if(mode==='DRAWN_SIGNATURE') {
  if(typeof b.signatureDataUrl!=='string'||b.signatureDataUrl.length>350000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.signatureDataUrl))throw new ApiError(400,'customer_signature','Provide a PNG signature under 256 KB.');
  image=Buffer.from(b.signatureDataUrl.slice(22),'base64');
  if(image.length<33||image.length>262144||image.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||image.toString('ascii',12,16)!=='IHDR'||image.readUInt32BE(16)<1||image.readUInt32BE(20)<1||image.readUInt32BE(16)>2048||image.readUInt32BE(20)>2048)throw new ApiError(400,'customer_signature','Invalid PNG signature dimensions or content.');
 }
 return {name:requiredText(b.name,200,'Customer name'),title:requiredText(b.title,200,'Customer title'),company:requiredText(b.company,300,'Customer company'),date:parseDateOnly(b.date,'Customer date')!,mode,image};
}
export async function validateCustomerPng(image:Buffer|null) {
 if(!image)return;
 try {const pdf=await PDFDocument.create();await pdf.embedPng(image);}catch{throw new ApiError(400,'customer_signature','The PNG signature cannot be decoded.');}
}
export async function reportDto(tx:Transaction,r:ReportRow,actor:CurrentUser) {
 const source=await reportAccess(tx,r,actor),q=new sql.Request(tx);q.input('report',sql.BigInt,r.id).input('revision',sql.BigInt,r.revision_id);
 const signatures=(await q.query<{stage:string;actor_id:number;actor_name:string;specimen_id:number;snapshot_sha256:string;evidence_sha256:string;occurred_at:Date}>(`SELECT stage,actor_id,JSON_VALUE(evidence_json,'$.actorName') actor_name,specimen_id,snapshot_sha256,evidence_sha256,occurred_at FROM dbo.unified_report_signatures WHERE revision_id=@revision ORDER BY id`)).recordset;
 const acknowledgment=(await q.query<Record<string,unknown> & {signature_png:Buffer|null}>('SELECT signer_name name,signer_title title,signer_company company,stated_date date,mode,signature_png,snapshot_sha256 snapshotSha256,evidence_sha256 evidenceSha256,occurred_at occurredAt FROM dbo.unified_report_acknowledgments WHERE revision_id=@revision')).recordset[0];
 const ack=acknowledgment?{name:acknowledgment.name,title:acknowledgment.title,company:acknowledgment.company,date:dateOnly(acknowledgment.date as Date),mode:acknowledgment.mode,snapshotSha256:acknowledgment.snapshotSha256,evidenceSha256:acknowledgment.evidenceSha256,occurredAt:acknowledgment.occurredAt,signatureDataUrl:acknowledgment.signature_png?`data:image/png;base64,${acknowledgment.signature_png.toString('base64')}`:null}:null;
 const revisions=(await q.query<{revision:number;state:string;title:string;created_at:Date}>('SELECT revision,state,title,created_at FROM dbo.unified_report_revisions WHERE report_id=@report ORDER BY revision DESC')).recordset;
 const participants=(await q.query<{id:number;name:string}>(`SELECT u.id,u.name FROM dbo.users u JOIN dbo.unified_report_revisions r ON r.id=@revision AND (u.id=r.prepared_by OR u.id=r.reviewer_id OR u.id=r.approver_id)`)).recordset;
 const person=(id:number|null)=>id===null?null:{id:Number(id),name:participants.find(p=>Number(p.id)===Number(id))?.name??''};
 const customerLink=(await q.query<{expiresAt:Date}>(`SELECT TOP(1) expires_at expiresAt FROM dbo.unified_report_customer_links WHERE revision_id=@revision AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>SYSUTCDATETIME() ORDER BY id DESC`)).recordset[0]??null;
 const permissions=await reportPermissions(tx,actor.id),allowedActions:string[]=[],preparer=Number(r.prepared_by)===actor.id,reviewer=Number(r.reviewer_id)===actor.id,approver=Number(r.approver_id)===actor.id;
 const frozen=r.snapshot_json?JSON.parse(r.snapshot_json) as {sourceReference:string;sourceTitle:string;customer:string;endUserCustomerId?:number|null;endUserName?:string|null;endUserCode?:string|null}:null;
 if(r.revision===r.current_revision&&!['Closed','Cancelled','Rejected'].includes(source.status)) {
  if(preparer&&permissions.has('report.write')) {
   if(r.state==='DRAFT'){allowedActions.push('edit','discard');if(permissions.has('signing.sign'))allowedActions.push('submit');}
   if(['CHANGES_REQUESTED','APPROVED','COMPLETED','VOID'].includes(r.state))allowedActions.push('revise');
  }
  if(reviewer&&r.state==='SUBMITTED'&&permissions.has('report.review'))allowedActions.push('review','return');
  if(approver&&permissions.has('report.approve')) {
   if(r.state===(r.reviewer_id===null?'SUBMITTED':'REVIEWED')&&permissions.has('signing.sign'))allowedActions.push('approve');
   if(['SUBMITTED','REVIEWED'].includes(r.state))allowedActions.push('return');
   if(!['COMPLETED','VOID'].includes(r.state))allowedActions.push('void');
  }
  if((preparer||approver)&&permissions.has('report.write')) {
   if(r.state==='APPROVED')allowedActions.push('customer-link');
   if(r.state==='AWAITING_CUSTOMER')allowedActions.push('revoke-customer-link');
  }
 }
 return {id:Number(r.id),number:r.report_no,reportType:r.report_type,templateId:r.template_id==null?null:Number(r.template_id),templateVersion:r.template_version??null,templateName:r.template_name??null,template:r.template_id==null?null:{id:Number(r.template_id),name:r.template_name,version:r.template_version},sourceKind:r.project_id?'PROJECT':'INQUIRY',sourceId:Number(r.project_id??r.inquiry_id),scheduleTaskId:r.schedule_task_id?Number(r.schedule_task_id):null,sourceReference:frozen?.sourceReference??source.reference,sourceTitle:frozen?.sourceTitle??source.title,customer:frozen?.customer??source.customer,endUserCustomerId:frozen?frozen.endUserCustomerId??null:source.endUserCustomerId,endUserName:frozen?frozen.endUserName??null:source.endUserName,endUserCode:frozen?frozen.endUserCode??null:source.endUserCode,revision:r.revision,currentRevision:r.current_revision,title:r.title,reportDate:dateOnly(r.report_date),locale:r.locale,body:JSON.parse(r.body_json),status:r.state,preparedById:Number(r.prepared_by),reviewerId:r.reviewer_id===null?null:Number(r.reviewer_id),approverId:Number(r.approver_id),preparedBy:person(r.prepared_by),reviewer:person(r.reviewer_id),approver:person(r.approver_id),allowedActions:[...new Set(allowedActions)],customerLink,rowVersion:r.row_version.toString('base64'),snapshotSha256:r.snapshot_sha256,decisionNote:r.decision_note,submittedAt:r.submitted_at,reviewedAt:r.reviewed_at,approvedAt:r.approved_at,completedAt:r.completed_at,createdAt:r.created_at,updatedAt:r.updated_at,signatures:signatures.map(s=>({stage:s.stage,actorId:Number(s.actor_id),actorName:s.actor_name,specimenId:Number(s.specimen_id),snapshotSha256:s.snapshot_sha256,evidenceSha256:s.evidence_sha256,occurredAt:s.occurred_at})),customerAcknowledgment:ack,revisions:revisions.map(v=>({revision:v.revision,status:v.state,title:v.title,createdAt:v.created_at}))};
}
