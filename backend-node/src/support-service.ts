import sql from 'mssql/msnodesqlv8.js';
import type { Transaction } from 'mssql';
import type { Database } from './db.js';
import type { CurrentUser } from './types.js';
import { ApiError } from './errors.js';
import { parseRowVersion } from './http.js';
import { insertAudit } from './audit.js';

export type SupportActor=CurrentUser & {manage:boolean;adjust:boolean;categories:string[];awardCategories:string[]};
export type TicketRow={id:number;ticket_no:string;reporter_id:number;category_code:string;assignee_id:number|null;subject:string;description:string;impact:string;priority:string;status:string;context_json:string;duplicate_of:number|null;created_at:Date;updated_at:Date;resolved_at:Date|null;closed_at:Date|null;row_version:Buffer;reporter_name:string;assignee_name:string|null};
export const ticketSelect=`SELECT t.*,u.name reporter_name,a.name assignee_name FROM dbo.support_tickets t JOIN dbo.users u ON u.id=t.reporter_id LEFT JOIN dbo.users a ON a.id=t.assignee_id`;
export const isStaff=(actor:SupportActor,row:TicketRow)=>actor.manage||actor.categories.includes(row.category_code);
export const isOperator=(actor:SupportActor,row:TicketRow)=>actor.manage||(isStaff(actor,row)&&Number(row.assignee_id)===actor.id);
export const checkVersion=(row:{row_version:Buffer},value:unknown)=>{if(!row.row_version.equals(parseRowVersion(value)))throw new ApiError(409,'concurrency_conflict','The ticket changed. Refresh and try again.');};
export async function supportActor(db:Database,user:CurrentUser):Promise<SupportActor> {
 const result=await db.query<{code:string}>(`SELECT p.code FROM dbo.users u JOIN dbo.role_permissions rp ON rp.role_id=u.role_id JOIN dbo.permissions p ON p.id=rp.permission_id WHERE u.id=@id AND p.code IN(N'support.manage',N'support.recognition.adjust');SELECT category_code,can_award FROM dbo.support_members WHERE user_id=@id;`,q=>q.input('id',sql.BigInt,user.id));
 const permissions=result.recordsets[0] as {code:string}[],members=result.recordsets[1] as unknown as {category_code:string;can_award:boolean}[];
 return {...user,manage:permissions.some(p=>p.code==='support.manage'),adjust:permissions.some(p=>p.code==='support.recognition.adjust'),categories:members.map(m=>m.category_code),awardCategories:members.filter(m=>m.can_award).map(m=>m.category_code)};
}
export async function readSupport(tx:Transaction,id:number,actor:SupportActor,lock=false) {
 const query=ticketSelect.replace('dbo.support_tickets t',`dbo.support_tickets t${lock?' WITH(UPDLOCK,HOLDLOCK)':''}`);
 const row=(await new sql.Request(tx).input('id',sql.BigInt,id).query<TicketRow>(`${query} WHERE t.id=@id`)).recordset[0];
 if(!row||Number(row.reporter_id)!==actor.id&&!isStaff(actor,row))throw new ApiError(404,'support_not_found','The ticket is unavailable.');
 return row;
}
export async function replaySupport(tx:Transaction,row:TicketRow,actor:SupportActor,key:string,hash:string) {
 const event=(await new sql.Request(tx).input('id',sql.BigInt,row.id).input('actor',sql.BigInt,actor.id).input('key',sql.UniqueIdentifier,key).query<{request_hash:string}>(`SELECT request_hash FROM dbo.support_events WHERE ticket_id=@id AND actor_id=@actor AND request_key=@key`)).recordset[0];
 if(event&&event.request_hash!==hash)throw new ApiError(409,'support_retry_changed','The request ID was already used for different data.');
 return Boolean(event);
}
export async function supportEvent(tx:Transaction,row:TicketRow,actor:SupportActor,kind:string,body:string,internal:boolean,details:unknown,key:string,hash:string) {
 const q=new sql.Request(tx).input('ticket',sql.BigInt,row.id).input('actor',sql.BigInt,actor.id).input('kind',sql.NVarChar(40),kind).input('body',sql.NVarChar(sql.MAX),body).input('internal',sql.Bit,internal).input('details',sql.NVarChar(sql.MAX),JSON.stringify(details)).input('key',sql.UniqueIdentifier,key).input('hash',sql.Char(64),hash);
 const event=(await q.query<{id:number}>(`INSERT dbo.support_events(ticket_id,actor_id,kind,body,is_internal,details_json,request_key,request_hash) OUTPUT inserted.id VALUES(@ticket,@actor,@kind,@body,@internal,@details,@key,@hash);UPDATE dbo.support_tickets SET updated_at=SYSUTCDATETIME() WHERE id=@ticket;`)).recordset[0]!;
 // In-app notifications are durable queue rows committed atomically with the event.
 // Keep their text generic so revoked category access cannot expose ticket content.
 q.input('event',sql.BigInt,event.id).input('reporter',sql.BigInt,row.reporter_id).input('owner',sql.BigInt,row.assignee_id).input('category',sql.NVarChar(30),row.category_code);
 await q.query(`INSERT dbo.notifications(user_id,kind,title,detail,entity_type,entity_id,dedupe_key)
 SELECT u.id,CASE WHEN @kind IN(N'Recognition',N'RecognitionAdjusted') THEN N'SUPPORT_RECOGNITION' ELSE N'SUPPORT_UPDATE' END,N'Support Center',N'Open Support Center to view the update.',N'SupportTicket',@ticket,CONCAT(N'support:',@event)
 FROM dbo.users u WHERE u.is_active=1 AND u.deleted_at IS NULL AND u.id<>@actor AND (
 (@internal=0 AND u.id=@reporter) OR u.id=@owner OR
 (@owner IS NULL AND (EXISTS(SELECT 1 FROM dbo.support_members m WHERE m.user_id=u.id AND m.category_code=@category) OR EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.code=N'support.manage'))))
 AND NOT(@internal=1 AND u.id=@reporter)
 AND NOT EXISTS(SELECT 1 FROM dbo.notifications n WHERE n.user_id=u.id AND n.dedupe_key=CONCAT(N'support:',@event));`);
 await insertAudit(tx,actor.id,'SupportTicket',Number(row.id),row.ticket_no,kind,null,{eventId:Number(event.id),internal});
}
export function supportSummary(row:TicketRow) {
 return {id:Number(row.id),ticketNo:row.ticket_no,reporterId:Number(row.reporter_id),reporterName:row.reporter_name,assigneeId:row.assignee_id==null?null:Number(row.assignee_id),assigneeName:row.assignee_name,category:row.category_code,subject:row.subject,impact:row.impact,priority:row.priority,status:row.status,createdAt:row.created_at,updatedAt:row.updated_at,rowVersion:row.row_version.toString('base64')};
}
export async function supportDetail(tx:Transaction,row:TicketRow,actor:SupportActor) {
 const own=Number(row.reporter_id)===actor.id,staff=isStaff(actor,row),internal=staff&&!own;
 const q=new sql.Request(tx).input('id',sql.BigInt,row.id).input('internal',sql.Bit,internal);
 const result=await q.query<Record<string,unknown>>(`SELECT e.id,e.kind,e.body,e.is_internal,e.details_json,e.created_at,u.name actor_name FROM dbo.support_events e JOIN dbo.users u ON u.id=e.actor_id WHERE e.ticket_id=@id AND (e.is_internal=0 OR @internal=1) ORDER BY e.id;
 SELECT a.id,a.name,a.content_type,a.size_bytes,a.is_internal,a.created_at,u.name uploaded_by_name FROM dbo.support_attachments a JOIN dbo.users u ON u.id=a.uploaded_by WHERE a.ticket_id=@id AND(a.is_internal=0 OR @internal=1) ORDER BY a.id;
 SELECT r.*,u.name evaluator_name FROM dbo.support_recognition r JOIN dbo.users u ON u.id=r.evaluator_id WHERE r.ticket_id=@id;`);
 type Event={id:number;kind:string;body:string;is_internal:boolean;details_json:string;created_at:Date;actor_name:string};
 type File={id:number;name:string;content_type:string;size_bytes:number;is_internal:boolean;created_at:Date;uploaded_by_name:string};
 type Recognition={points:number;useful:boolean;detailed:boolean;actionable:boolean;message:string;evaluator_name:string;updated_at:Date;row_version:Buffer};
 const recognition=(result.recordsets[2] as unknown as Recognition[])[0];
 const canOperate=isOperator(actor,row);
 return {...supportSummary(row),description:row.description,context:JSON.parse(row.context_json) as Record<string,string>,duplicateOf:staff?row.duplicate_of:null,
  events:(result.recordsets[0] as unknown as Event[]).map(e=>({id:Number(e.id),kind:e.kind,body:e.body,internal:e.is_internal,details:JSON.parse(e.details_json) as Record<string,unknown>,createdAt:e.created_at,actorName:e.actor_name})),
  attachments:(result.recordsets[1] as unknown as File[]).map(f=>({id:Number(f.id),name:f.name,contentType:f.content_type,sizeBytes:Number(f.size_bytes),internal:f.is_internal,createdAt:f.created_at,uploadedByName:f.uploaded_by_name})),
  recognition:recognition?{points:recognition.points,useful:recognition.useful,detailed:recognition.detailed,actionable:recognition.actionable,message:recognition.message,evaluatorName:recognition.evaluator_name,updatedAt:recognition.updated_at,rowVersion:recognition.row_version.toString('base64')}:null,
  permissions:{own,staff,internal,operate:canOperate,assign:actor.manage,claim:staff&&row.assignee_id===null,award:!own&&(actor.manage||actor.awardCategories.includes(row.category_code))&&row.status!=='New',adjust:!own&&actor.adjust&&staff,comment:!['Closed','Cancelled'].includes(row.status)}};
}
export async function supportAssignee(tx:Transaction,category:string,id:number) {
 const found=(await new sql.Request(tx).input('category',sql.NVarChar(30),category).input('id',sql.BigInt,id).query<{id:number}>(`SELECT u.id FROM dbo.users u WHERE u.id=@id AND u.is_active=1 AND u.deleted_at IS NULL AND(EXISTS(SELECT 1 FROM dbo.support_members m WHERE m.user_id=u.id AND m.category_code=@category) OR EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.code=N'support.manage'))`)).recordset[0];
 if(!found)throw new ApiError(400,'support_assignee','Choose an active support member for this category.');
}
