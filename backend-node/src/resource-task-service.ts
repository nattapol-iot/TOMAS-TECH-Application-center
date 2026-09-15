import sql from 'mssql';
import type { Transaction } from 'mssql';
import { ApiError } from './errors.js';
import { dateOnly } from './http.js';
import type { CurrentUser } from './types.js';
import { readTasks, readPics, readHolidays, resolveTasks, readProject, validatePics, permissionFor } from './schedule-service.js';
import { hasRole } from './user-roles.js';
import { planDates, workloadImpact, workDates, type TaskPlan, type Allocation } from './resource-task-math.js';
import type { Database } from './db.js';

export type WorkRow = {
 id: number; inquiry_id: number|null; project_id: number|null; schedule_task_id: number|null;
 title: string; description: string; is_issue: boolean; reporter: string; priority: string;
 state: string; assignee_id: number; plan_start: Date|null; plan_end: Date|null; man_days: number|null;
 pending_plan: string|null; proposed_by: number; approved_by: number|null; approved_at: unknown;
 acknowledged_at: unknown; decision_note: string; percent_done: number; execution_status: string;
 created_by: number; created_at: unknown; updated_at: unknown; row_version: Buffer;
 actual_start: Date|null; actual_end: Date|null;
};
export const elevated = (actor: CurrentUser) => hasRole(actor,'Admin','Engineering Manager');
export async function sourceAccess(tx: Transaction, actor: CurrentUser, kind: string, sourceId: number, write=false, planner=false) {
  if(!['Inquiry','Project'].includes(kind)) throw new ApiError(400,'invalid_source','Select Inquiry or Project.');
  const q=new sql.Request(tx); q.input('source',sql.BigInt,sourceId).input('actor',sql.BigInt,actor.id).input('elevated',sql.Bit,elevated(actor));
  const query=kind==='Project'
    ? `SELECT p.status,p.project_no reference,p.name title,CAST(CASE WHEN @elevated=1 OR p.manager_id=@actor THEN 1 ELSE 0 END AS bit) can_plan,CAST(CASE WHEN @elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor) THEN 1 ELSE 0 END AS bit) can_read FROM dbo.projects p WHERE p.id=@source AND p.deleted_at IS NULL`
    : `SELECT i.status,i.inquiry_no reference,i.project_name title,CAST(CASE WHEN @elevated=1 OR i.estimate_owner_id=@actor THEN 1 ELSE 0 END AS bit) can_plan,CAST(CASE WHEN @elevated=1 OR i.estimate_owner_id=@actor OR i.created_by=@actor OR EXISTS(SELECT 1 FROM dbo.resource_tasks t WHERE t.inquiry_id=i.id AND (t.assignee_id=@actor OR t.created_by=@actor)) THEN 1 ELSE 0 END AS bit) can_read FROM dbo.inquiries i WHERE i.id=@source AND i.deleted_at IS NULL`;
  const r=(await q.query<{status:string;reference:string;title:string;can_plan:boolean;can_read:boolean}>(query)).recordset[0];
  if(!r) throw new ApiError(404,'source_missing','Source is unavailable.');
  if(!r.can_read || planner&&!r.can_plan) throw new ApiError(403,'task_scope','Only the responsible planner or assigned team may access this work.');
  if(write&&['Closed','Cancelled','Rejected'].includes(r.status)) throw new ApiError(409,'source_closed','Closed work cannot be changed.');
  return r;
}
export async function taskRow(tx:Transaction,id:number,lock=false) {
  const q=new sql.Request(tx);q.input('id',sql.BigInt,id);
  const r=(await q.query<WorkRow>(`SELECT * FROM dbo.resource_tasks ${lock?'WITH(UPDLOCK,HOLDLOCK)':''} WHERE id=@id`)).recordset[0];
  if(!r) throw new ApiError(404,'task_missing','Task not found.'); return r;
}
export async function assigneeAllowed(tx:Transaction,kind:string,sourceId:number,userId:number) {
  const q=new sql.Request(tx);q.input('user',sql.BigInt,userId);
  if(!(await q.query(`SELECT u.id FROM dbo.users u WHERE u.id=@user AND u.is_active=1 AND u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM dbo.role_permissions rp JOIN dbo.permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.code=N'schedule.progress')`)).recordset.length) throw new ApiError(422,'assignee_inactive','Select an active member with permission to acknowledge and update tasks.');
  if(kind==='Project') await validatePics(tx,await readProject(tx,sourceId),[userId]);
}
export async function taskDto(tx:Transaction,r:WorkRow,actor:CurrentUser,db:Database) {
  const kind=r.project_id?'Project':'Inquiry', sourceId=Number(r.project_id??r.inquiry_id);
  const source=await sourceAccess(tx,actor,kind,sourceId);
  let start=dateOnly(r.plan_start),end=dateOnly(r.plan_end),effort=r.man_days===null?null:Number(r.man_days),percent=Number(r.percent_done),status=r.execution_status,scheduleVersion:string|null=null;
  let actualStart=dateOnly(r.actual_start),actualFinish=dateOnly(r.actual_end);
  if(r.schedule_task_id) {
    const tasks=await readTasks(tx,sourceId),task=tasks.find(t=>t.id===Number(r.schedule_task_id));
    if(task) { const resolved=resolveTasks(tasks,await readHolidays(tx)).byId.get(task.id)!;start=resolved.planStart;end=resolved.planFinish;effort=task.planManDays;percent=task.percentComplete;status=task.status;scheduleVersion=task.rowVersion.toString('base64');actualStart=task.actualStart;actualFinish=task.actualFinish; }
    else status='Unavailable';
  }
  const q=new sql.Request(tx);q.input('id',sql.BigInt,r.assignee_id);
  const assignee=(await q.query<{name:string}>('SELECT name FROM dbo.users WHERE id=@id')).recordset[0]?.name??'';
  const canPlan=source.can_plan&&await permissionFor(db,actor.id,'schedule.plan');
  const closed=['Closed','Cancelled','Rejected'].includes(source.status)||r.state==='Closed'||status==='Done'||status==='Unavailable';
  return {
    id:Number(r.id),sourceKind:kind,sourceId,reference:source.reference,sourceTitle:source.title,
    scheduleTaskId:r.schedule_task_id?Number(r.schedule_task_id):null,title:r.title,description:r.description,
    isIssue:r.is_issue,reporter:r.reporter,priority:r.priority,state:r.state,
    assigneeId:Number(r.assignee_id),assigneeName:assignee,start,end,manDays:effort,
    workDays:start&&end?workDates(start,end,await readHolidays(tx)).length:1,
    percentComplete:percent,status,pendingPlan:r.pending_plan?JSON.parse(r.pending_plan) as TaskPlan:null,
    proposedBy:Number(r.proposed_by),acknowledgedAt:r.acknowledged_at,approvedAt:r.approved_at,
    decisionNote:r.decision_note,createdAt:r.created_at,updatedAt:r.updated_at,
    rowVersion:r.row_version.toString('base64'),scheduleVersion,actualStart,actualFinish,
    canClose:canPlan&&status==='Done'&&r.state==='Approved'&&!r.pending_plan,
    canPlan:canPlan&&!['Closed','Cancelled','Rejected'].includes(source.status)&&r.state!=='Closed',
    canPropose:!closed&&(canPlan||Number(r.assignee_id)===actor.id||Number(r.created_by)===actor.id),
    canRespond:!closed&&Number(r.assignee_id)===actor.id&&await permissionFor(db,actor.id,'schedule.progress'),
  };
}

// Only aggregate totals leave this function. Work in other projects contributes
// to capacity without exposing its title, customer or documents to the caller.
export async function impact(tx:Transaction,plan:TaskPlan,exclude:WorkRow|null,kind:string,sourceId:number) {
  const q=new sql.Request(tx);q.input('user',sql.BigInt,plan.assigneeId);
  const holidays=await readHolidays(tx), allocations:Allocation[]=[],replaced:Allocation[]=[];
  const capacityRow=(await q.query<{days_per_week:number}>('SELECT days_per_week FROM dbo.resource_capacity WHERE user_id=@user')).recordset[0];
  const records=(await q.query<{id:number;start_date:Date|null;end_date:Date|null;man_days:number|null}>(`SELECT i.id,COALESCE(e.start_date,i.inquiry_date) start_date,COALESCE(e.end_date,i.due_date) end_date,e.man_days FROM dbo.inquiries i LEFT JOIN dbo.resource_effort e ON e.entity_type=N'Inquiry' AND e.entity_id=i.id WHERE i.estimate_owner_id=@user AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected') AND NOT EXISTS(SELECT 1 FROM dbo.resource_task_sources s WHERE s.inquiry_id=i.id)`)).recordset;
  for(const r of records) { const target=kind==='Inquiry'&&Number(r.id)===sourceId?replaced:allocations;target.push({key:`Inquiry-${r.id}`,start:dateOnly(r.start_date),end:dateOnly(r.end_date),manDays:r.man_days===null?null:Number(r.man_days)}); }
  const inquiryTasks=(await q.query<WorkRow>(`SELECT t.* FROM dbo.resource_tasks t JOIN dbo.inquiries i ON i.id=t.inquiry_id WHERE t.assignee_id=@user AND t.state=N'Approved' AND t.execution_status<>N'Done' AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected')`)).recordset;
  for(const r of inquiryTasks) (Number(r.id)===Number(exclude?.id)?replaced:allocations).push({key:`Task-${r.id}`,start:dateOnly(r.plan_start),end:dateOnly(r.plan_end),manDays:Number(r.man_days)});
  const estimates=(await q.query<{id:number;start_date:Date|null;end_date:Date|null;man_days:number|null;owners:number}>(`WITH owners AS (SELECT estimate_id,owner_id user_id FROM dbo.estimate_assignments UNION SELECT estimate_id,support_id FROM dbo.estimate_assignments WHERE support_id IS NOT NULL UNION SELECT id,owner_id FROM dbo.estimates e WHERE NOT EXISTS(SELECT 1 FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id)) SELECT e.id,COALESCE(p.start_date,e.created_date) start_date,COALESCE(p.end_date,e.due_date) end_date,p.man_days,(SELECT COUNT(*) FROM owners all_owners WHERE all_owners.estimate_id=e.id) owners FROM dbo.estimates e JOIN owners o ON o.estimate_id=e.id AND o.user_id=@user LEFT JOIN dbo.resource_effort p ON p.entity_type=N'Estimate' AND p.entity_id=e.id WHERE e.deleted_at IS NULL AND e.status NOT IN(N'Closed',N'Cancelled',N'Approved',N'Locked')`)).recordset;
  for(const r of estimates) allocations.push({key:`Estimate-${r.id}`,start:dateOnly(r.start_date),end:dateOnly(r.end_date),manDays:r.man_days===null?null:Number(r.man_days)/Number(r.owners)});
  const projects=(await q.query<{project_id:number}>(`SELECT DISTINCT t.project_id FROM dbo.schedule_tasks t JOIN dbo.schedule_task_pics pic ON pic.task_id=t.id JOIN dbo.projects p ON p.id=t.project_id WHERE pic.user_id=@user AND t.deleted_at IS NULL AND p.deleted_at IS NULL AND p.status<>N'Closed'`)).recordset;
  for(const p of projects) {
    const tasks=await readTasks(tx,Number(p.project_id)),pics=await readPics(tx,Number(p.project_id)),resolved=resolveTasks(tasks,holidays);
    for(const task of tasks) { const r=resolved.byId.get(task.id)!;const owners=pics.get(task.id)??[];
      if(r.children.length||task.kind==='phase'||task.status==='Done'||!owners.some(o=>o.id===plan.assigneeId)) continue;
      (task.id===Number(exclude?.schedule_task_id)?replaced:allocations).push({key:`Project-${task.id}`,start:r.planStart,end:r.planFinish,manDays:task.planManDays/owners.length});
    }
  }
  return {...workloadImpact(allocations,plan,capacityRow?Number(capacityRow.days_per_week):null,holidays,replaced),replacesInquiryAggregate:kind==='Inquiry',countedTasks:allocations.length};
}

export async function saveApprovedProjectPlan(tx:Transaction,r:WorkRow,plan:TaskPlan,actor:CurrentUser) {
  const dates=planDates(plan,await readHolidays(tx)),q=new sql.Request(tx);
  q.input('project',sql.BigInt,r.project_id).input('actor',sql.BigInt,actor.id).input('title',sql.NVarChar(500),r.title).input('start',sql.Date,dates.start).input('days',sql.Int,dates.calendarDays).input('effort',sql.Decimal(9,2),plan.manDays);
  let id=r.schedule_task_id?Number(r.schedule_task_id):null;
  if(id) {
    q.input('task',sql.BigInt,id);
    await q.query(`UPDATE dbo.schedule_tasks SET plan_start=@start,plan_days=@days,plan_man_days=@effort,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@task AND deleted_at IS NULL;`);
  } else {
    id=Number((await q.query<{id:number}>(`DECLARE @ids TABLE(id bigint); INSERT dbo.schedule_tasks(project_id,parent_id,sort_order,kind,name,is_milestone,origin,created_by,visibility,plan_start,plan_days,start_mode,lag_days,pic_external,plan_man_days,updated_by) OUTPUT inserted.id INTO @ids VALUES(@project,NULL,1000,N'task',@title,0,N'PM',@actor,N'Internal',@start,@days,N'manual',0,N'',@effort,@actor);SELECT id FROM @ids;`)).recordset[0]!.id);
  }
  const pic=new sql.Request(tx);pic.input('id',sql.BigInt,id).input('user',sql.BigInt,plan.assigneeId);
  await pic.query('DELETE dbo.schedule_task_pics WHERE task_id=@id;INSERT dbo.schedule_task_pics(task_id,user_id) VALUES(@id,@user);');
  return id;
}
