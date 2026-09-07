import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';
import { bodyObject, oneOf, requiredText } from './http.js';

export const SUPPORT_CATEGORIES = ['Application','Equipment','Documents','Coordination','Other'] as const;
export const SUPPORT_STATUSES = ['New','Acknowledged','InProgress','WaitingForReporter','Resolved','Closed','Cancelled'] as const;
export type SupportStatus = typeof SUPPORT_STATUSES[number];
export const SUPPORT_MAX_FILE = 10 * 1024 * 1024;
export function supportText(value:unknown,min:number,max:number,label:string) {
 const text=requiredText(value,max,label);
 if(text.length<min)throw new ApiError(400,'support_validation',`${label} must contain at least ${min} characters.`);
 return text;
}
export function requestKey(value:unknown) {
 if(typeof value!=='string'||! /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value))throw new ApiError(400,'support_request_key','A request ID is required.');
 return value.toLowerCase();
}
export const supportHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function supportContext(value:unknown) {
 if(value==null)return {};
 const source=bodyObject(value),result:Record<string,string>={};
 // Never capture URLs, query strings, auth headers or source form payloads.
 for(const [key,max]of [['module',80],['reference',160],['steps',600],['expected',600],['location',160]] as const) {
  if(source[key]!==undefined)result[key]=typeof source[key]==='string'?String(source[key]).trim().slice(0,max):'';
 }
 if(JSON.stringify(result).length>2000)throw new ApiError(400,'support_validation','Page context is too long.');
 return result;
}
export function recognitionInput(value:unknown) {
 const body=bodyObject(value);
 for(const key of ['useful','detailed','actionable'])if(typeof body[key]!=='boolean')throw new ApiError(400,'support_criteria','Select valid recognition criteria.');
 const useful=body.useful as boolean,detailed=body.detailed as boolean,actionable=body.actionable as boolean;
 if(!useful&&(detailed||actionable))throw new ApiError(400,'support_criteria','Bonus criteria require useful information.');
 return {useful,detailed,actionable,points:useful?5+(detailed?3:0)+(actionable?2:0):0,message:supportText(body.message,10,1000,'Thank-you message')};
}
export function nextSupportStatus(current:string,target:unknown,own:boolean,operator:boolean,manager:boolean,reason:string) {
 const next=oneOf(requiredText(target,30,'Status'),'Status',SUPPORT_STATUSES) as SupportStatus;
 const ownerAllowed=own&&((current==='Resolved'&&next==='Closed')||(['Resolved','Closed'].includes(current)&&next==='InProgress')||(!['Closed','Cancelled'].includes(current)&&next==='Cancelled'));
 const allowed:Record<string,string[]>={New:['Acknowledged','Cancelled'],Acknowledged:['InProgress','WaitingForReporter','Resolved','Cancelled'],InProgress:['WaitingForReporter','Resolved','Cancelled'],WaitingForReporter:['InProgress','Resolved','Cancelled'],Resolved:['InProgress','Closed','Cancelled'],Closed:['InProgress'],Cancelled:[]};
 if(!ownerAllowed&&!(operator&&allowed[current]?.includes(next)&&(next!=='Closed'||manager)))throw new ApiError(409,'support_transition','This status change is not available.');
 if(!reason.trim())throw new ApiError(400,'support_reason','Provide a reason or resolution.');
 return next;
}
export function validateSupportFile(bytes:Buffer,extension:string,mime:string) {
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const pdf=bytes.subarray(0,5).toString('ascii')==='%PDF-';
 const valid=(extension==='.png'&&mime==='image/png'&&png)||(['.jpg','.jpeg'].includes(extension)&&mime==='image/jpeg'&&jpg)||(extension==='.pdf'&&mime==='application/pdf'&&pdf);
 if(!valid)throw new ApiError(415,'support_file_type','Use a valid PNG, JPEG or PDF file with a matching file type.');
}
