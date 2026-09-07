import sql from 'mssql/msnodesqlv8.js';
import type { Transaction } from 'mssql';
import type { FastifyRequest } from 'fastify';
import type { CurrentUser } from './types.js';
import type { CurrentUserService } from './users.js';
import { ApiError } from './errors.js';
import { bodyObject, positiveLong, requiredText, parseRowVersion } from './http.js';
import { parseReportBody, readReport, reportAccess, reportPermissions } from './unified-report-service.js';
import { sanitizeReportTemplate } from './report-template-rules.js';

export type ReportTemplateRow={id:number;name:string;description:string;report_type:string;locale:string;body_json:string;version:number;is_active:boolean;created_by:number;row_version:Buffer};
export function safeTemplateBody(reportType:string,body:unknown) {
 try {parseReportBody(body);return sanitizeReportTemplate(reportType,body);}catch(error){throw new ApiError(400,'report_template_body',error instanceof Error?error.message:'Invalid reusable template body.');}
}
export function templateLocale(value:unknown) {
 const locale=value??'en';if(typeof locale!=='string'||!['en','th','ja'].includes(locale))throw new ApiError(400,'report_template_locale','Select en, th or ja.');return locale;
}
export function templateMetadata(value:unknown) {
 const b=bodyObject(value);if(b.description!=null&&(typeof b.description!=='string'||b.description.length>2000))throw new ApiError(400,'report_template_description','Description must be text under 2000 characters.');
 return {name:requiredText(b.name,200,'Template name'),description:typeof b.description==='string'?b.description.trim():''};
}
export function canManageTemplate(row:ReportTemplateRow,actor:CurrentUser,permissions:Set<string>) {
 return permissions.has('report.write')&&(Number(row.created_by)===actor.id||permissions.has('master.write'));
}
export function templateDto(row:ReportTemplateRow,actor:CurrentUser,permissions:Set<string>) {
 return {id:Number(row.id),name:row.name,description:row.description,reportType:row.report_type,locale:row.locale,body:JSON.parse(row.body_json),version:row.version,isActive:Boolean(row.is_active),rowVersion:row.row_version.toString('base64'),canEdit:Boolean(row.is_active)&&canManageTemplate(row,actor,permissions)};
}
export async function templateRow(tx:Transaction,id:number) {
 const q=new sql.Request(tx);q.input('id',sql.BigInt,id);
 const row=(await q.query<ReportTemplateRow>('SELECT * FROM dbo.report_templates WITH(UPDLOCK,HOLDLOCK) WHERE id=@id')).recordset[0];
 if(!row)throw new ApiError(404,'report_template_missing','Template not found.');return row;
}
export function templateVersion(row:ReportTemplateRow,value:unknown) {
 if(!row.row_version.equals(parseRowVersion(value)))throw new ApiError(409,'concurrency_conflict','The template changed. Refresh before saving.');
}
export async function templateInput(tx:Transaction,users:CurrentUserService,request:FastifyRequest,actor:CurrentUser,value:unknown) {
 const b=bodyObject(value);
 if(b.sourceReportId!=null) {
  if(b.body!==undefined)throw new ApiError(400,'report_template_source','Supply sourceReportId or an explicit body, not both. Preview then edit the sanitized body.');
  const id=positiveLong(String(b.sourceReportId),'Source report');
  let revision:number|undefined;
  if(b.sourceRevision!==undefined){if(typeof b.sourceRevision!=='number'||!Number.isSafeInteger(b.sourceRevision)||b.sourceRevision<0)throw new ApiError(400,'report_template_revision','Source revision must be a non-negative integer.');revision=b.sourceRevision;}
  const report=await readReport(tx,id,revision);await users.demandPermission(request,report.project_id?'project.read':'inquiry.read');await reportAccess(tx,report,actor);
  return {reportType:report.report_type,locale:report.locale,body:safeTemplateBody(report.report_type,JSON.parse(report.body_json))};
 }
 const reportType=requiredText(b.reportType,20,'Report type');return {reportType,locale:templateLocale(b.locale),body:safeTemplateBody(reportType,b.body)};
}
/** Locks the selected version until the caller snapshots it into the new report. */
export async function reportTemplateSnapshot(tx:Transaction,id:unknown,version:unknown,reportType:string,actor:CurrentUser) {
 const row=await templateRow(tx,positiveLong(String(id),'Template'));
 if(!(await reportPermissions(tx,actor.id)).has('report.read'))throw new ApiError(403,'report_template_read','Report read permission is required to use a template.');
 if(!row.is_active)throw new ApiError(409,'report_template_archived','This template is archived. Choose an active template.');
 if(row.report_type!==reportType)throw new ApiError(400,'report_template_type','Template type must match the new report.');
 if(typeof version!=='number'||!Number.isSafeInteger(version)||version<1)throw new ApiError(400,'report_template_version','Template version is required.');
 if(version!==row.version)throw new ApiError(409,'report_template_changed','The selected template has a newer version. Preview it again.');
 return {id:Number(row.id),name:row.name,version:row.version,locale:row.locale,bodyJson:JSON.stringify(safeTemplateBody(row.report_type,JSON.parse(row.body_json)))};
}
