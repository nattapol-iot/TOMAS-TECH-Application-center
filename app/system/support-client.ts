import { apiRequest, ApiClientError } from './api-client';
import { supportLabel } from './support-copy';
import type { Lang } from './i18n';
export type SupportMeta={userId:number;categories:string[];manage:boolean;queue:boolean;categoryScope:string[];members:{id:number;name:string;category_code:string;can_award:boolean}[];users:{id:number;name:string;canManage:boolean}[];maxFileBytes:number};
export type SupportSummary={id:number;ticketNo:string;reporterId:number;reporterName:string;assigneeId:number|null;assigneeName:string|null;category:string;subject:string;impact:string;priority:string;status:string;createdAt:string;updatedAt:string;rowVersion:string;recognitionPoints?:number|null};
export type SupportRecognition={points:number;useful:boolean;detailed:boolean;actionable:boolean;message:string;evaluatorName:string;updatedAt:string;rowVersion:string};
export type SupportTicket=SupportSummary & {description:string;context:Record<string,string>;duplicateOf:number|null;events:{id:number;kind:string;body:string;internal:boolean;details:Record<string,unknown>;createdAt:string;actorName:string}[];attachments:{id:number;name:string;contentType:string;sizeBytes:number;internal:boolean;createdAt:string;uploadedByName:string}[];recognition:SupportRecognition|null;permissions:{own:boolean;staff:boolean;internal:boolean;operate:boolean;assign:boolean;claim:boolean;award:boolean;adjust:boolean;comment:boolean}};
export type ContributionPage={points:number;total:number;page:number;pageSize:number;items:{ticketId:number;ticketNo:string;points:number;message:string;updatedAt:string;evaluatorName:string}[]};
export type SupportPage={items:SupportSummary[];page:number;pageSize:number;total:number};
export const supportError=(error:unknown,lang:Lang)=>supportLabel(error instanceof ApiClientError?(error.status===409?'Conflict':error.status===404?'Unavailable':error.status===403?'Not allowed':[400,413,415,422].includes(error.status)?'Invalid input':'Failed'):'Failed',lang);
export const supportRead=(id:number)=>apiRequest<SupportTicket>(`/api/v1/support/tickets/${id}`);
export const supportMeta=()=>apiRequest<SupportMeta>('/api/v1/support/bootstrap');
export function supportRequestKey(){
 // Team Test runs on a private-LAN HTTP origin, where randomUUID is unavailable.
 const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
