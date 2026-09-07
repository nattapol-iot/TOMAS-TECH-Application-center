import { readFile } from 'node:fs/promises';
import sql from 'mssql/msnodesqlv8.js';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { DatabaseCommitOutcomeUnknownError, type Database } from '../db.js';
import type { CurrentUserService } from '../users.js';
import { ApiError } from '../errors.js';
import { bodyObject, clampedInteger, oneOf, positiveLong, requiredInteger, requiredText } from '../http.js';
import { contentTypeFor, deleteStoredFile, DOCUMENT_DOWNLOAD_RATE_LIMIT, DOCUMENT_UPLOAD_RATE_LIMIT, multipartText, readMultipartUpload, sendStoredFile, storageKey, uploadedFileName, validateFileExtension, writeStoredFile } from '../document-storage.js';
import { insertAudit } from '../audit.js';
import { nextSupportStatus, recognitionInput, requestKey, SUPPORT_CATEGORIES, SUPPORT_MAX_FILE, SUPPORT_STATUSES, supportContext, supportHash, supportText, validateSupportFile } from '../support-rules.js';
import { checkVersion, isOperator, isStaff, readSupport, replaySupport, supportActor, supportAssignee, supportDetail, supportEvent, supportSummary, ticketSelect, type TicketRow } from '../support-service.js';

export function registerSupportRoutes(app:FastifyInstance,config:AppConfig,db:Database,users:CurrentUserService) {
 const actorFor=async(request:Parameters<CurrentUserService['required']>[0])=>supportActor(db,await users.required(request));
 app.get('/api/v1/support/bootstrap',async request=>{
  const actor=await actorFor(request);
  const result=await db.query(`SELECT u.id,u.name,m.category_code,m.can_award FROM dbo.support_members m JOIN dbo.users u ON u.id=m.user_id WHERE u.is_active=1 AND u.deleted_at IS NULL AND(@manage=1 OR m.category_code IN(SELECT category_code FROM dbo.support_members WHERE user_id=@actor));
   SELECT u.id,u.name,CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.code=N'support.manage') THEN 1 ELSE 0 END) canManage FROM dbo.users u WHERE u.is_active=1 AND u.deleted_at IS NULL AND(@manage=1 OR EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.code=N'support.manage')) ORDER BY u.name;`,q=>q.input('manage',sql.Bit,actor.manage).input('actor',sql.BigInt,actor.id));
  return {userId:actor.id,categories:SUPPORT_CATEGORIES,manage:actor.manage,queue:actor.manage||actor.categories.length>0,categoryScope:actor.categories,members:result.recordsets[0],users:result.recordsets[1],maxFileBytes:Math.min(SUPPORT_MAX_FILE,config.documentStorage.maxFileSizeBytes)};
 });
 app.post('/api/v1/support/members',async request=>{
  const actor=await actorFor(request);if(!actor.manage)throw new ApiError(403,'support_permission','Support administrator permission is required.');
  const body=bodyObject(request.body),category=oneOf(requiredText(body.category,30,'Category'),'Category',SUPPORT_CATEGORIES),userId=requiredInteger(body.userId,'User',1);
  if(typeof body.enabled!=='boolean'||typeof body.canAward!=='boolean')throw new ApiError(400,'support_validation','Membership flags are required.');
  await db.transaction(async tx=>{
   const q=new sql.Request(tx).input('user',sql.BigInt,userId).input('category',sql.NVarChar(30),category).input('award',sql.Bit,body.canAward).input('actor',sql.BigInt,actor.id);
   const found=(await q.query(`SELECT id FROM dbo.users WHERE id=@user AND is_active=1 AND deleted_at IS NULL`)).recordset[0];if(!found)throw new ApiError(400,'support_validation','Choose an active user.');
   if(body.enabled)await q.query(`UPDATE dbo.support_members SET can_award=@award,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE user_id=@user AND category_code=@category;IF @@ROWCOUNT=0 INSERT dbo.support_members(category_code,user_id,can_award,updated_by) VALUES(@category,@user,@award,@actor);`);
   else {
    const assigned=(await q.query(`SELECT TOP(1) id FROM dbo.support_tickets WHERE category_code=@category AND assignee_id=@user AND status NOT IN(N'Closed',N'Cancelled')`)).recordset[0];
    if(assigned)throw new ApiError(409,'support_member_assigned','Reassign open tickets before removing this member.');
    await q.query(`DELETE dbo.support_members WHERE user_id=@user AND category_code=@category`);
   }
   await insertAudit(tx,actor.id,'SupportMember',userId,category,'Membership changed',null,{enabled:body.enabled,canAward:body.canAward});
  });return {saved:true};
 });
 app.get('/api/v1/support/tickets',async request=>{
  const actor=await actorFor(request),query=request.query as Record<string,unknown>,scope=query.scope==='queue'?'queue':'mine';
  if(scope==='queue'&&!actor.manage&&!actor.categories.length)throw new ApiError(403,'support_permission','Support queue permission is required.');
  const page=clampedInteger(query.page,1,1,100000),pageSize=clampedInteger(query.pageSize,50,1,100);
  const status=query.status?oneOf(String(query.status),'Status',SUPPORT_STATUSES):'',category=query.category?oneOf(String(query.category),'Category',SUPPORT_CATEGORIES):'';
  const filter=query.filter?oneOf(String(query.filter),'Filter',['unassigned','assigned']):'';
  const predicate=`WHERE (@mine=1 AND t.reporter_id=@actor OR @mine=0 AND(@manage=1 OR EXISTS(SELECT 1 FROM dbo.support_members m WHERE m.category_code=t.category_code AND m.user_id=@actor))) AND(@status=N'' OR t.status=@status) AND(@category=N'' OR t.category_code=@category) AND(@filter=N'' OR @filter=N'unassigned' AND t.assignee_id IS NULL OR @filter=N'assigned' AND t.assignee_id=@actor) AND(@search=N'' OR CHARINDEX(@search,t.subject)>0 OR CHARINDEX(@search,t.ticket_no)>0)`;
  const result=await db.query(`${ticketSelect.replace('SELECT t.*','SELECT r.points recognition_points,t.*')} LEFT JOIN dbo.support_recognition r ON r.ticket_id=t.id ${predicate} ORDER BY t.updated_at DESC,t.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;SELECT COUNT_BIG(*) total FROM dbo.support_tickets t ${predicate};`,q=>q.input('actor',sql.BigInt,actor.id).input('mine',sql.Bit,scope==='mine').input('manage',sql.Bit,actor.manage).input('status',sql.NVarChar(30),status).input('category',sql.NVarChar(30),category).input('filter',sql.NVarChar(30),filter).input('search',sql.NVarChar(160),String(query.search??'').trim().slice(0,160)).input('offset',sql.Int,(page-1)*pageSize).input('limit',sql.Int,pageSize));
  return {items:(result.recordsets[0] as (TicketRow & {recognition_points:number|null})[]).map(r=>({...supportSummary(r),recognitionPoints:r.recognition_points})),page,pageSize,total:Number((result.recordsets[1] as {total:number}[])[0]?.total??0)};
 });
 app.get('/api/v1/me/support-contributions',async request=>{
  const actor=await actorFor(request),query=request.query as Record<string,unknown>,page=clampedInteger(query.page,1,1,100000),pageSize=50;
  const result=await db.query(`SELECT COALESCE(SUM(r.points),0) total FROM dbo.support_recognition r JOIN dbo.support_tickets t ON t.id=r.ticket_id WHERE t.reporter_id=@actor;
   SELECT r.points,r.message,r.updated_at updatedAt,t.id ticketId,t.ticket_no ticketNo,u.name evaluatorName FROM dbo.support_recognition r JOIN dbo.support_tickets t ON t.id=r.ticket_id JOIN dbo.users u ON u.id=r.evaluator_id WHERE t.reporter_id=@actor ORDER BY r.updated_at DESC,t.id DESC OFFSET @offset ROWS FETCH NEXT 50 ROWS ONLY;
   SELECT COUNT(*) count FROM dbo.support_recognition r JOIN dbo.support_tickets t ON t.id=r.ticket_id WHERE t.reporter_id=@actor;`,q=>q.input('actor',sql.BigInt,actor.id).input('offset',sql.Int,(page-1)*pageSize));
  return {points:Number((result.recordsets[0] as {total:number}[])[0]?.total??0),items:result.recordsets[1],total:Number((result.recordsets[2] as {count:number}[])[0]?.count??0),page,pageSize};
 });
 app.post('/api/v1/support/tickets',async(request,reply)=>{
  const actor=await actorFor(request),body=bodyObject(request.body),key=requestKey(body.requestKey);
  const input={category:oneOf(requiredText(body.category,30,'Category'),'Category',SUPPORT_CATEGORIES),subject:supportText(body.subject,5,160,'Subject'),description:supportText(body.description,10,5000,'Description'),impact:oneOf(requiredText(body.impact,20,'Impact'),'Impact',['CanWork','PartlyBlocked','Blocked']),context:supportContext(body.context)};
  const hash=supportHash(input);
  const ticket=await db.transaction(async tx=>{
   const q=new sql.Request(tx).input('actor',sql.BigInt,actor.id).input('key',sql.UniqueIdentifier,key);
   const prior=(await q.query<{id:number;request_hash:string}>(`SELECT id,request_hash FROM dbo.support_tickets WITH(UPDLOCK,HOLDLOCK) WHERE reporter_id=@actor AND request_key=@key`)).recordset[0];
   if(prior){if(prior.request_hash!==hash)throw new ApiError(409,'support_retry_changed','The request ID was already used for different data.');return supportDetail(tx,await readSupport(tx,Number(prior.id),actor),actor);}
   q.input('category',sql.NVarChar(30),input.category).input('subject',sql.NVarChar(160),input.subject).input('description',sql.NVarChar(sql.MAX),input.description).input('impact',sql.NVarChar(20),input.impact).input('context',sql.NVarChar(2000),JSON.stringify(input.context)).input('hash',sql.Char(64),hash);
   const id=Number((await q.query<{id:number}>(`INSERT dbo.support_tickets(reporter_id,category_code,subject,description,impact,context_json,request_key,request_hash) OUTPUT inserted.id VALUES(@actor,@category,@subject,@description,@impact,@context,@key,@hash)`)).recordset[0]!.id);
   await new sql.Request(tx).input('id',sql.BigInt,id).query(`UPDATE dbo.support_tickets SET ticket_no=CONCAT(N'SUP-',YEAR(SYSUTCDATETIME()),N'-',FORMAT(id,'00000')) WHERE id=@id`);
   const row=await readSupport(tx,id,actor);await supportEvent(tx,row,actor,'Created','',false,{},key,hash);return supportDetail(tx,await readSupport(tx,id,actor),actor);
  });return reply.status(201).send(ticket);
 });
 app.get('/api/v1/support/tickets/:id',async request=>{
  const actor=await actorFor(request),id=positiveLong((request.params as {id:string}).id,'Ticket');
  return db.transaction(async tx=>supportDetail(tx,await readSupport(tx,id,actor),actor),sql.ISOLATION_LEVEL.READ_COMMITTED);
 });
 for(const action of ['comments','assign','transition','recognition','recognition/adjust'] as const)app.post(`/api/v1/support/tickets/:id/${action}`,async request=>{
  const actor=await actorFor(request),id=positiveLong((request.params as {id:string}).id,'Ticket'),body=bodyObject(request.body),key=requestKey(body.requestKey),hash=supportHash({action,...body,requestKey:undefined,rowVersion:undefined});
  return db.transaction(async tx=>{
   let row=await readSupport(tx,id,actor,true);
   if(await replaySupport(tx,row,actor,key,hash))return supportDetail(tx,row,actor);
   checkVersion(row,body.rowVersion);
   const own=Number(row.reporter_id)===actor.id,staff=isStaff(actor,row),operator=isOperator(actor,row);
   const q=new sql.Request(tx).input('id',sql.BigInt,id);
   let kind:string=action,note='',internal=false,details:Record<string,unknown>={};
   if(action==='comments') {
    if(['Closed','Cancelled'].includes(row.status))throw new ApiError(409,'support_closed','Reopen the ticket before replying.');
    note=supportText(body.message,1,5000,'Message');internal=body.internal===true;
    if(internal&&(!staff||own))throw new ApiError(403,'support_internal','Internal notes are available only to support staff for another reporter.');
    if(own&&row.status==='WaitingForReporter'){await q.query(`UPDATE dbo.support_tickets SET status=N'InProgress' WHERE id=@id`);details.status='InProgress';}
    kind='Comment';
   }else if(action==='assign') {
    const category=body.category===undefined?row.category_code:oneOf(requiredText(body.category,30,'Category'),'Category',SUPPORT_CATEGORIES);
    const assignee=body.assigneeId===null?null:requiredInteger(body.assigneeId,'Assignee',1);
    if(!actor.manage&&!(staff&&row.assignee_id===null&&assignee===actor.id&&category===row.category_code))throw new ApiError(403,'support_permission','Only support administrators can reassign tickets.');
    if(['Closed','Cancelled'].includes(row.status))throw new ApiError(409,'support_closed','Reopen the ticket before assigning it.');
    if(assignee!==null)await supportAssignee(tx,category,assignee);
    const priority=body.priority===undefined?row.priority:oneOf(requiredText(body.priority,20,'Priority'),'Priority',['Low','Normal','High','Urgent']);
    if(!actor.manage&&priority!==row.priority)throw new ApiError(403,'support_permission','Only support administrators set priority.');
    note=supportText(body.reason,1,1000,'Assignment reason');
    q.input('assignee',sql.BigInt,assignee).input('category',sql.NVarChar(30),category).input('priority',sql.NVarChar(20),priority);
    await q.query(`UPDATE dbo.support_tickets SET assignee_id=@assignee,category_code=@category,priority=@priority,status=CASE WHEN status=N'New' AND @assignee IS NOT NULL THEN N'Acknowledged' ELSE status END WHERE id=@id`);
    kind='Assigned';details={category,assigneeId:assignee,priority};
   }else if(action==='transition') {
    note=supportText(body.reason,1,5000,'Reason');const target=nextSupportStatus(row.status,body.status,own,operator,actor.manage,note);
    if(target==='Acknowledged'&&row.assignee_id===null)throw new ApiError(409,'support_assignee','Assign a responsible person first.');
    if(body.duplicateOf!==undefined&&body.duplicateOf!==null){if(!actor.manage||target!=='Cancelled')throw new ApiError(403,'support_permission','Only support administrators can link a cancelled duplicate.');const duplicate=requiredInteger(body.duplicateOf,'Duplicate ticket',1);if(duplicate===id)throw new ApiError(400,'support_duplicate','A ticket cannot duplicate itself.');await readSupport(tx,duplicate,actor);q.input('duplicate',sql.BigInt,duplicate);await q.query(`UPDATE dbo.support_tickets SET duplicate_of=@duplicate WHERE id=@id`);}
    q.input('status',sql.NVarChar(30),target);await q.query(`UPDATE dbo.support_tickets SET status=@status,resolved_at=CASE WHEN @status=N'Resolved' THEN SYSUTCDATETIME() WHEN @status=N'InProgress' THEN NULL ELSE resolved_at END,closed_at=CASE WHEN @status=N'Closed' THEN SYSUTCDATETIME() WHEN @status=N'InProgress' THEN NULL ELSE closed_at END WHERE id=@id`);kind='StatusChanged';details={from:row.status,to:target};
   }else {
    const adjust=action==='recognition/adjust';
    if(own||!staff||!(actor.manage||actor.awardCategories.includes(row.category_code))||adjust&&!actor.adjust)throw new ApiError(403,'support_recognition_permission','You cannot award or adjust points for this reporter.');
    if(row.status==='New')throw new ApiError(409,'support_not_reviewed','Review and acknowledge this ticket before awarding points.');
    const input=recognitionInput(body);const old=(await q.query<{points:number;row_version:Buffer}>(`SELECT points,row_version FROM dbo.support_recognition WITH(UPDLOCK,HOLDLOCK) WHERE ticket_id=@id`)).recordset[0];
    if(adjust){if(!old)throw new ApiError(409,'support_recognition_missing','Award recognition before adjusting it.');checkVersion(old,body.recognitionVersion);supportText(body.reason,10,1000,'Adjustment reason');}
    else if(old)throw new ApiError(409,'support_recognition_exists','Recognition was already awarded.');
    q.input('actor',sql.BigInt,actor.id).input('useful',sql.Bit,input.useful).input('detailed',sql.Bit,input.detailed).input('actionable',sql.Bit,input.actionable).input('points',sql.Int,input.points).input('message',sql.NVarChar(1000),input.message);
    if(adjust)await q.query(`UPDATE dbo.support_recognition SET evaluator_id=@actor,useful=@useful,detailed=@detailed,actionable=@actionable,points=@points,message=@message,updated_at=SYSUTCDATETIME() WHERE ticket_id=@id`);
    else await q.query(`INSERT dbo.support_recognition(ticket_id,evaluator_id,useful,detailed,actionable,points,message) VALUES(@id,@actor,@useful,@detailed,@actionable,@points,@message)`);
    note=input.message;kind=adjust?'RecognitionAdjusted':'Recognition';details={...input,previousPoints:old?.points??0,delta:input.points-(old?.points??0),policyVersion:1,...(adjust?{reason:body.reason}:{})};
   }
   row=await readSupport(tx,id,actor);await supportEvent(tx,row,actor,kind,note,internal,details,key,hash);return supportDetail(tx,await readSupport(tx,id,actor),actor);
  });
 });
 app.post('/api/v1/support/tickets/:id/attachments',{config:{rateLimit:DOCUMENT_UPLOAD_RATE_LIMIT}},async(request,reply)=>{
  const actor=await actorFor(request),id=positiveLong((request.params as {id:string}).id,'Ticket');
  await db.transaction(tx=>readSupport(tx,id,actor),sql.ISOLATION_LEVEL.READ_COMMITTED);
  const upload=await readMultipartUpload(request,Math.min(SUPPORT_MAX_FILE,config.documentStorage.maxFileSizeBytes)),name=uploadedFileName(upload.file.filename),extension=validateFileExtension(name,new Set(['.png','.jpg','.jpeg','.pdf'])),mime=contentTypeFor(name);
  const key=requestKey(multipartText(upload.values,'requestKey',50,true)),internal=multipartText(upload.values,'internal',5)==='true';
  validateSupportFile(await readFile(upload.file.filepath),extension,upload.file.mimetype);
  const storage=storageKey(`support/${id}`,extension),write=await writeStoredFile(config.documentStorage,storage,upload.file.filepath);
  let keep=false;
  try {
   const result=await db.transaction(async tx=>{
    const row=await readSupport(tx,id,actor,true);
    if(internal&&(!isStaff(actor,row)||Number(row.reporter_id)===actor.id))throw new ApiError(403,'support_internal','Internal attachments require support access.');
    const q=new sql.Request(tx).input('id',sql.BigInt,id).input('actor',sql.BigInt,actor.id).input('key',sql.UniqueIdentifier,key);
    const previous=(await q.query<{id:number;sha256:string;is_internal:boolean;name:string}>(`SELECT id,sha256,is_internal,name FROM dbo.support_attachments WHERE ticket_id=@id AND uploaded_by=@actor AND request_key=@key`)).recordset[0];
    if(previous){if(previous.sha256!==write.sha256||Boolean(previous.is_internal)!==internal||previous.name!==name)throw new ApiError(409,'support_retry_changed','This upload request ID was used for another file.');return {id:Number(previous.id),reused:true};}
    if(['Closed','Cancelled'].includes(row.status))throw new ApiError(409,'support_closed','Reopen the ticket before adding attachments.');
    const count=(await q.query<{total:number}>(`SELECT COUNT(*) total FROM dbo.support_attachments WHERE ticket_id=@id`)).recordset[0]!.total;
    if(count>=5)throw new ApiError(400,'support_attachment_limit','A ticket can contain at most five attachments.');
    q.input('name',sql.NVarChar(500),name).input('mime',sql.NVarChar(100),mime).input('storage',sql.NVarChar(1000),storage).input('size',sql.BigInt,write.sizeBytes).input('sha',sql.Char(64),write.sha256).input('internal',sql.Bit,internal);
    const file=(await q.query<{id:number}>(`INSERT dbo.support_attachments(ticket_id,uploaded_by,name,content_type,storage_key,size_bytes,sha256,is_internal,request_key) OUTPUT inserted.id VALUES(@id,@actor,@name,@mime,@storage,@size,@sha,@internal,@key)`)).recordset[0]!;
    await supportEvent(tx,row,actor,'Attachment',name,internal,{attachmentId:Number(file.id)},key,supportHash({sha:write.sha256,internal,name}));return {id:Number(file.id),reused:false};
   });keep=!result.reused;return reply.status(201).send({id:result.id});
  }catch(error){if(error instanceof DatabaseCommitOutcomeUnknownError){keep=true;request.log.error({storageKey:storage,ticketId:id},'Support upload commit unknown; retained for reconciliation');}throw error;}
  finally{if(!keep)await deleteStoredFile(config.documentStorage,storage);}
 });
 app.get('/api/v1/support/tickets/:id/attachments/:attachmentId/content',{config:{rateLimit:DOCUMENT_DOWNLOAD_RATE_LIMIT}},async(request,reply)=>{
  const actor=await actorFor(request),params=request.params as {id:string;attachmentId:string},id=positiveLong(params.id,'Ticket'),fileId=positiveLong(params.attachmentId,'Attachment');
  const file=await db.transaction(async tx=>{const row=await readSupport(tx,id,actor);const internal=isStaff(actor,row)&&Number(row.reporter_id)!==actor.id;const result=(await new sql.Request(tx).input('id',sql.BigInt,id).input('file',sql.BigInt,fileId).input('internal',sql.Bit,internal).query<{name:string;storage_key:string;content_type:string;size_bytes:number;sha256:string}>(`SELECT name,storage_key,content_type,size_bytes,sha256 FROM dbo.support_attachments WHERE ticket_id=@id AND id=@file AND(is_internal=0 OR @internal=1)`)).recordset[0];if(!result)throw new ApiError(404,'support_attachment_not_found','The attachment is unavailable.');return result;},sql.ISOLATION_LEVEL.READ_COMMITTED);
  return sendStoredFile(request,reply,config.documentStorage,{storageKey:file.storage_key,fileName:file.name,contentType:file.content_type,sizeBytes:Number(file.size_bytes),sha256:file.sha256});
 });
}
