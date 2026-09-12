import sql from 'mssql';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Transaction } from 'mssql';
import type { Database } from '../db.js';
import type { CurrentUserService } from '../users.js';
import { ApiError } from '../errors.js';
import { bodyObject, clampedInteger, dateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from '../http.js';
import { insertAudit } from '../audit.js';
import { appendUpdate, permissionFor, readTask, readHolidays, progressInput } from '../schedule-service.js';
import { assigneeAllowed, elevated, impact, saveApprovedProjectPlan, sourceAccess, taskDto, taskRow, type WorkRow } from '../resource-task-service.js';
import { parseTaskPlan, planDates } from '../resource-task-math.js';

export function registerResourceTaskRoutes(app:FastifyInstance,db:Database,users:CurrentUserService) {
  // Keep the established WBS endpoints for legacy work. Tasks governed by the
  // approval workflow must not bypass its plan review or member acknowledgment.
  app.addHook('preHandler',async request=>{
    const path=request.routeOptions.url??'';
    if(!['POST','PUT','DELETE'].includes(request.method)||!path.includes('/schedule/'))return;
    const match=path.match(/\/schedule\/tasks\/:id(?:\/(updates|details|day-requests))?\/?$/);
    const decodedId=match?positiveLong((request.params as {id:string}).id,'Task'):0;
    const body=request.body&&typeof request.body==='object'?request.body as Record<string,unknown>:{};
    const candidates=[decodedId,Number(body.parentId??0),Number(body.predecessorId??0)].filter(n=>Number.isSafeInteger(n)&&n>0);
    for(const id of candidates) {
      const rows=await db.query<{acknowledged_at:unknown;assignee_id:number;state:string}>('SELECT acknowledged_at,assignee_id,state FROM dbo.resource_tasks WHERE schedule_task_id=@id',q=>q.input('id',sql.BigInt,id));
      const row=rows.recordset[0];if(!row)continue;
      if(match&&id===decodedId&&match[1]==='updates') {const actor=await users.required(request);if(!row.acknowledged_at||row.state!=='Approved'||Number(row.assignee_id)!==actor.id)throw new ApiError(409,'acknowledgment_required','Acknowledge this approved task in My Work before updating progress.');}
      else throw new ApiError(409,'managed_resource_task','Manage this task through Resource Plan task approval. Keep it as an independent leaf task.');
    }
  });
  const actorFor=async(request:FastifyRequest)=>{await users.demandPermission(request,'schedule.read');return users.required(request);};
  const canSubmit=async(role:string)=>{if(!await permissionFor(db,role,'schedule.plan')&&!await permissionFor(db,role,'schedule.progress'))throw new ApiError(403,'task_write','Task planning or progress permission is required.');};
  const version=(r:WorkRow,b:Record<string,unknown>)=>{if(!r.row_version.equals(parseRowVersion(b.rowVersion)))throw new ApiError(409,'concurrency_conflict','Task changed. Refresh before continuing.');};
  const scope=async(tx:Transaction,request:FastifyRequest,r:WorkRow,write=false,planner=false)=>{
    const actor=await users.required(request);await users.demandPermission(request,r.project_id?'project.read':'inquiry.read');
    return sourceAccess(tx,actor,r.project_id?'Project':'Inquiry',Number(r.project_id??r.inquiry_id),write,planner);
  };

  app.get('/api/v1/resource-tasks/commitments',async request=>{
    const actor=await actorFor(request);await users.demandPermission(request,'inquiry.read');
    const result=await db.query<WorkRow & {inquiry_no:string;project_name:string}>(`SELECT t.*,i.inquiry_no,i.project_name FROM dbo.resource_tasks t JOIN dbo.inquiries i ON i.id=t.inquiry_id WHERE t.state IN(N'Approved',N'Closed') AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected') AND (@elevated=1 OR i.estimate_owner_id=@actor OR i.created_by=@actor OR t.assignee_id=@actor OR t.created_by=@actor);SELECT s.inquiry_id FROM dbo.resource_task_sources s JOIN dbo.inquiries i ON i.id=s.inquiry_id WHERE i.deleted_at IS NULL AND (@elevated=1 OR i.estimate_owner_id=@actor OR i.created_by=@actor OR EXISTS(SELECT 1 FROM dbo.resource_tasks t WHERE t.inquiry_id=i.id AND (t.assignee_id=@actor OR t.created_by=@actor)));`,q=>q.input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,elevated(actor)));
    return {taskInquiryIds:(result.recordsets[1] as unknown as {inquiry_id:number}[]).map(r=>Number(r.inquiry_id)),items:(result.recordsets[0] as (WorkRow & {inquiry_no:string;project_name:string})[]).map(r=>({key:`InquiryTask-${r.id}`,type:'Inquiry',entityId:Number(r.inquiry_id),ownerId:Number(r.assignee_id),reference:`${r.inquiry_no} · TASK-${r.id}`,title:r.title,customer:'',start:dateOnly(r.plan_start),end:dateOnly(r.plan_end),manDays:Number(r.man_days),progress:Number(r.percent_done),status:r.state==='Closed'?'Closed':r.execution_status}))};
  });

  app.get('/api/v1/resource-tasks/sources',async request=>{
    const actor=await actorFor(request);
    const canInquiry=await permissionFor(db,actor.role,'inquiry.read'),canProject=await permissionFor(db,actor.role,'project.read');
    const result=await db.query<{id:number;kind:string;reference:string;title:string}>(`
      SELECT i.id,N'Inquiry' kind,i.inquiry_no reference,i.project_name title FROM dbo.inquiries i WHERE @inquiry=1 AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected') AND (@elevated=1 OR i.estimate_owner_id=@actor OR i.created_by=@actor OR EXISTS(SELECT 1 FROM dbo.resource_tasks t WHERE t.inquiry_id=i.id AND t.assignee_id=@actor))
      UNION ALL SELECT p.id,N'Project',p.project_no,p.name FROM dbo.projects p WHERE @project=1 AND p.deleted_at IS NULL AND p.status<>N'Closed' AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))`,q=>q.input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,elevated(actor)).input('inquiry',sql.Bit,canInquiry).input('project',sql.Bit,canProject));
    const memberships=await db.query<{project_id:number|null;user_id:number}>(`SELECT NULL project_id,u.id user_id FROM dbo.users u WHERE u.is_active=1 AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions perm ON perm.id=rp.permission_id WHERE rp.role_id=u.role_id AND perm.code=N'schedule.progress');SELECT p.id project_id,p.manager_id user_id FROM dbo.projects p UNION SELECT p.id,p.lead_engineer_id FROM dbo.projects p WHERE p.lead_engineer_id IS NOT NULL UNION SELECT project_id,user_id FROM dbo.project_members;`);
    const active=(memberships.recordsets[0] as {user_id:number}[]).map(r=>Number(r.user_id));
    const members=memberships.recordsets[1] as {project_id:number;user_id:number}[];
    return result.recordset.map(r=>({...r,id:Number(r.id),assigneeIds:r.kind==='Inquiry'?active:members.filter(m=>Number(m.project_id)===Number(r.id)&&active.includes(Number(m.user_id))).map(m=>Number(m.user_id))}));
  });
  app.get('/api/v1/resource-tasks',async request=>{
    const actor=await actorFor(request),query=request.query as Record<string,unknown>;
    const page=clampedInteger(query.page,1,1,100000),pageSize=clampedInteger(query.pageSize,50,1,100);
    const projectId=query.projectId?positiveLong(query.projectId,'Project'):null;
    const canInquiry=await permissionFor(db,actor.role,'inquiry.read'),canProject=await permissionFor(db,actor.role,'project.read');
    return db.transaction(async tx=>{
      const source=String(query.source??'all').toLowerCase();if(!['all','estimate','project','service'].includes(source))throw new ApiError(400,'invalid_source','Select a valid work source.');
      const q=new sql.Request(tx);q.input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,elevated(actor)).input('inquiry',sql.Bit,canInquiry).input('project',sql.Bit,canProject).input('mine',sql.Bit,query.mine==='true').input('issue',sql.Bit,query.issues==='true').input('source',sql.NVarChar(20),source).input('projectId',sql.BigInt,projectId).input('offset',sql.Int,(page-1)*pageSize).input('limit',sql.Int,pageSize).input('search',sql.NVarChar(200),String(query.search??'').slice(0,200)).input('filter',sql.NVarChar(30),String(query.filter??'All'));
      const predicate=`FROM dbo.resource_tasks t LEFT JOIN dbo.inquiries i ON i.id=t.inquiry_id LEFT JOIN dbo.projects p ON p.id=t.project_id WHERE ((@inquiry=1 AND i.deleted_at IS NULL AND i.id IS NOT NULL AND (@elevated=1 OR i.estimate_owner_id=@actor OR i.created_by=@actor OR t.assignee_id=@actor OR t.created_by=@actor)) OR (@project=1 AND p.deleted_at IS NULL AND p.id IS NOT NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)))) AND (@mine=0 OR t.assignee_id=@actor) AND (@issue=0 OR t.is_issue=1) AND (@source=N'all' OR (@source=N'estimate' AND t.is_issue=0 AND t.inquiry_id IS NOT NULL) OR (@source=N'project' AND t.is_issue=0 AND t.project_id IS NOT NULL) OR (@source=N'service' AND t.is_issue=1)) AND (@projectId IS NULL OR t.project_id=@projectId) AND (t.title LIKE N'%'+@search+N'%' OR COALESCE(i.inquiry_no,p.project_no) LIKE N'%'+@search+N'%') AND (@filter=N'All' OR (@filter=N'Approval' AND t.pending_plan IS NOT NULL) OR (@filter=N'Acknowledgment' AND t.state=N'Approved' AND t.acknowledged_at IS NULL) OR t.state=@filter)`;
      const result=await q.query<WorkRow>(`SELECT t.* ${predicate} ORDER BY t.updated_at DESC,t.id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;SELECT COUNT(*) total ${predicate};`);
      const items=[];for(const row of result.recordsets[0] as WorkRow[])items.push(await taskDto(tx,row,actor,db));
      return {items,page,pageSize,total:Number((result.recordsets[1] as unknown as {total:number}[])[0]?.total??0)};
    },sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
  app.post('/api/v1/resource-tasks/preview',async request=>{
    const actor=await actorFor(request);await canSubmit(actor.role);
    const b=bodyObject(request.body),plan=parseTaskPlan(b.plan),kind=requiredText(b.sourceKind,20,'Source'),sourceId=requiredInteger(b.sourceId,'Source',1);
    await users.demandPermission(request,kind==='Project'?'project.read':'inquiry.read');
    return db.transaction(async tx=>{
      await sourceAccess(tx,actor,kind,sourceId,true);
      const existing=b.taskId?await taskRow(tx,requiredInteger(b.taskId,'Task',1)):null;
      if(existing) {await scope(tx,request,existing);if(Number(existing.project_id??existing.inquiry_id)!==sourceId||(existing.project_id?'Project':'Inquiry')!==kind)throw new ApiError(400,'task_source','Task source does not match.');}
      await assigneeAllowed(tx,kind,sourceId,plan.assigneeId);
      return impact(tx,plan,existing,kind,sourceId);
    },sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
  app.post('/api/v1/resource-tasks',async(request,reply)=>{
    const actor=await actorFor(request);await canSubmit(actor.role);
    const b=bodyObject(request.body),plan=parseTaskPlan(b.plan),kind=requiredText(b.sourceKind,20,'Source'),sourceId=requiredInteger(b.sourceId,'Source',1);
    await users.demandPermission(request,kind==='Project'?'project.read':'inquiry.read');
    const title=requiredText(b.title,500,'Task title'),description=typeof b.description==='string'?b.description.slice(0,4000):'',reporter=typeof b.reporter==='string'?b.reporter.slice(0,200):'';
    const priority=String(b.priority??'Normal');if(!['Low','Normal','High','Urgent'].includes(priority))throw new ApiError(400,'invalid_priority','Select a valid priority.');
    if(b.isIssue===true&&(kind!=='Project'||!reporter.trim()||!description.trim()))throw new ApiError(400,'issue_details','Customer issues require a Project, reporter and description.');
    const result=await db.transaction(async tx=>{
      await sourceAccess(tx,actor,kind,sourceId,true);await assigneeAllowed(tx,kind,sourceId,plan.assigneeId);planDates(plan,await readHolidays(tx));
      const q=new sql.Request(tx);q.input('inquiry',sql.BigInt,kind==='Inquiry'?sourceId:null).input('project',sql.BigInt,kind==='Project'?sourceId:null).input('title',sql.NVarChar(500),title).input('description',sql.NVarChar(4000),description).input('issue',sql.Bit,b.isIssue===true).input('reporter',sql.NVarChar(200),reporter).input('priority',sql.NVarChar(20),priority).input('user',sql.BigInt,plan.assigneeId).input('plan',sql.NVarChar(sql.MAX),JSON.stringify(plan)).input('actor',sql.BigInt,actor.id);
      const row=(await q.query<WorkRow>(`INSERT dbo.resource_tasks(inquiry_id,project_id,title,description,is_issue,reporter,priority,assignee_id,pending_plan,proposed_by,created_by) OUTPUT inserted.* VALUES(@inquiry,@project,@title,@description,@issue,@reporter,@priority,@user,@plan,@actor,@actor)`)).recordset[0]!;
      await insertAudit(tx,actor.id,'Resource Task',Number(row.id),`TASK-${row.id}`,'Submitted for approval',null,{title,plan,isIssue:b.isIssue===true});return taskDto(tx,row,actor,db);
    });return reply.status(201).send(result);
  });
  app.post('/api/v1/resource-tasks/:id/:action',async request=>{
    const actor=await actorFor(request),params=request.params as {id:string;action:string},id=positiveLong(params.id,'Task'),action=params.action,b=bodyObject(request.body);
    if(!['propose','approve','reject','acknowledge','progress','close'].includes(action))throw new ApiError(400,'invalid_action','Unknown task action.');
    if(['approve','reject','close'].includes(action))await users.demandPermission(request,'schedule.plan');else await canSubmit(actor.role);
    return db.transaction(async tx=>{
      const r=await taskRow(tx,id,true);version(r,b);
      const kind=r.project_id?'Project':'Inquiry',sourceId=Number(r.project_id??r.inquiry_id);
      await scope(tx,request,r,true,['approve','reject','close'].includes(action));
      if(r.state==='Closed')throw new ApiError(409,'task_closed','This task is closed.');
      const q=new sql.Request(tx);q.input('id',sql.BigInt,id).input('actor',sql.BigInt,actor.id);
      const note=typeof b.note==='string'?b.note.trim().slice(0,2000):'';q.input('note',sql.NVarChar(2000),note);
      if(action==='propose') {
        const source=await sourceAccess(tx,actor,kind,sourceId,true);
        const planner=source.can_plan&&await permissionFor(db,actor.role,'schedule.plan');
        if(!planner&&Number(r.assignee_id)!==actor.id&&Number(r.created_by)!==actor.id)throw new ApiError(403,'task_assignee','Only the assignee, submitter or planner can propose changes.');
        if(r.pending_plan)throw new ApiError(409,'proposal_pending','Review the pending proposal first.');
        const plan=parseTaskPlan(b.plan);if(!plan.note)throw new ApiError(400,'reason_required','Explain the requested change.');
        if(!planner&&plan.assigneeId!==Number(r.assignee_id))throw new ApiError(403,'task_reassign','Only the planner may reassign work.');
        await assigneeAllowed(tx,kind,sourceId,plan.assigneeId);planDates(plan,await readHolidays(tx));
        if(r.schedule_task_id){const task=await readTask(tx,Number(r.schedule_task_id));if(task.status==='Done')throw new ApiError(409,'task_done','Completed tasks cannot be replanned.');plan.scheduleVersion=task.rowVersion.toString('base64');}
        else if(r.execution_status==='Done')throw new ApiError(409,'task_done','Completed tasks cannot be replanned.');
        q.input('plan',sql.NVarChar(sql.MAX),JSON.stringify(plan));await q.query(`UPDATE dbo.resource_tasks SET pending_plan=@plan,proposed_by=@actor,state=CASE WHEN state=N'Rejected' THEN N'PendingApproval' ELSE state END,updated_at=SYSUTCDATETIME() WHERE id=@id`);
      } else if(action==='approve') {
        if(!r.pending_plan)throw new ApiError(409,'no_proposal','No proposal is waiting for approval.');
        if(!r.schedule_task_id&&r.execution_status==='Done')throw new ApiError(409,'task_done','Completed tasks cannot be replanned. Return the pending proposal before closing.');
        const plan=parseTaskPlan(JSON.parse(r.pending_plan));await assigneeAllowed(tx,kind,sourceId,plan.assigneeId);
        if(r.schedule_task_id){const task=await readTask(tx,Number(r.schedule_task_id));if(task.status==='Done'||!plan.scheduleVersion||task.rowVersion.toString('base64')!==plan.scheduleVersion)throw new ApiError(409,'plan_stale','The project task changed after this proposal. Return it and submit a fresh proposal.');}
        const preview=await impact(tx,plan,r,kind,sourceId);if(preview.needsReason&&!note)throw new ApiError(409,'workload_reason_required','Workload is over capacity or incomplete. Review the warning and provide an override reason.');
        let scheduleId=r.schedule_task_id;if(kind==='Project')scheduleId=await saveApprovedProjectPlan(tx,r,plan,actor);
        const dates=planDates(plan,await readHolidays(tx));
        q.input('schedule',sql.BigInt,scheduleId).input('user',sql.BigInt,plan.assigneeId).input('start',sql.Date,kind==='Inquiry'?dates.start:null).input('end',sql.Date,kind==='Inquiry'?dates.end:null).input('effort',sql.Decimal(12,2),kind==='Inquiry'?plan.manDays:null).input('source',sql.BigInt,sourceId);
        if(kind==='Inquiry')await q.query(`IF NOT EXISTS(SELECT 1 FROM dbo.resource_task_sources WITH(UPDLOCK,HOLDLOCK) WHERE inquiry_id=@source) INSERT dbo.resource_task_sources(inquiry_id,activated_by) VALUES(@source,@actor);`);
        await q.query(`UPDATE dbo.resource_tasks SET state=N'Approved',assignee_id=@user,schedule_task_id=@schedule,plan_start=@start,plan_end=@end,man_days=@effort,pending_plan=NULL,approved_by=@actor,approved_at=SYSUTCDATETIME(),acknowledged_at=NULL,decision_note=@note,updated_at=SYSUTCDATETIME() WHERE id=@id`);
        if(scheduleId)await appendUpdate(tx,sourceId,Number(scheduleId),actor.id,'plan',null,JSON.stringify(plan),note||'Resource task approved');
      } else if(action==='reject') {
        if(!note)throw new ApiError(400,'reason_required','Provide a reason for returning the proposal.');
        if(!r.pending_plan)throw new ApiError(409,'no_proposal','No proposal is waiting for review.');
        await q.query(`UPDATE dbo.resource_tasks SET state=CASE WHEN state=N'PendingApproval' THEN N'Rejected' ELSE state END,pending_plan=NULL,decision_note=@note,updated_at=SYSUTCDATETIME() WHERE id=@id`);
      } else if(action==='acknowledge') {
        await users.demandPermission(request,'schedule.progress');
        if(Number(r.assignee_id)!==actor.id)throw new ApiError(403,'task_assignee','Only the assigned member can acknowledge this task.');
        if(r.state!=='Approved'||r.acknowledged_at)throw new ApiError(409,'task_state','This task is not waiting for acknowledgment.');
        await assigneeAllowed(tx,kind,sourceId,actor.id);
        await q.query('UPDATE dbo.resource_tasks SET acknowledged_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME() WHERE id=@id');
      } else if(action==='progress') {
        await users.demandPermission(request,'schedule.progress');
        if(Number(r.assignee_id)!==actor.id)throw new ApiError(403,'task_assignee','Only the assigned member may update progress.');
        if(r.state!=='Approved'||!r.acknowledged_at)throw new ApiError(409,'acknowledgment_required','Acknowledge the approved task before starting work.');
        await assigneeAllowed(tx,kind,sourceId,actor.id);
        const input=progressInput({...b,rowVersion:r.row_version.toString('base64')});
        q.input('percent',sql.Decimal(5,2),input.percentComplete).input('status',sql.NVarChar(30),input.status).input('actualStart',sql.Date,input.actualStart).input('actualEnd',sql.Date,input.actualFinish).input('remark',sql.NVarChar(sql.MAX),input.remark);
        if(r.schedule_task_id){const task=await readTask(tx,Number(r.schedule_task_id));if(!b.scheduleVersion||task.rowVersion.toString('base64')!==b.scheduleVersion)throw new ApiError(409,'concurrency_conflict','Project progress changed. Refresh first.');q.input('schedule',sql.BigInt,r.schedule_task_id);await q.query(`UPDATE dbo.schedule_tasks SET percent_done=@percent,status=@status,actual_start=@actualStart,actual_end=@actualEnd,note=@remark,blocked_reason=CASE WHEN @status=N'Blocked' THEN @remark ELSE NULL END,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@schedule`);await appendUpdate(tx,sourceId,Number(r.schedule_task_id),actor.id,'progress',String(task.percentComplete),String(input.percentComplete),input.remark);}
        await q.query(`UPDATE dbo.resource_tasks SET percent_done=@percent,execution_status=@status,actual_start=@actualStart,actual_end=@actualEnd,updated_at=SYSUTCDATETIME() WHERE id=@id`);
      } else {
        const dto=await taskDto(tx,r,actor,db);if(dto.status!=='Done'||!note||r.pending_plan)throw new ApiError(409,'close_task','Complete the task, resolve pending proposals and record verification before closing.');
        await q.query(`UPDATE dbo.resource_tasks SET state=N'Closed',decision_note=@note,updated_at=SYSUTCDATETIME() WHERE id=@id`);
      }
      const saved=await taskRow(tx,id);await insertAudit(tx,actor.id,'Resource Task',id,`TASK-${id}`,action,{state:r.state,pendingPlan:r.pending_plan,acknowledgedAt:r.acknowledged_at,percentComplete:Number(r.percent_done),status:r.execution_status},{state:saved.state,pendingPlan:saved.pending_plan,note,percentComplete:Number(saved.percent_done),status:saved.execution_status,...(action==='progress'?{remark:bodyObject(request.body).remark??null}:{})});return taskDto(tx,saved,actor,db);
    },sql.ISOLATION_LEVEL.SERIALIZABLE);
  });
}
