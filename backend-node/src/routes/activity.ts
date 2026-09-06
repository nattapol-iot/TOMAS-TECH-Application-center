import sql from 'mssql/msnodesqlv8.js';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db.js';
import type { CurrentUserService } from '../users.js';
import { ApiError } from '../errors.js';
import { bodyObject,dateOnly,parseDateOnly,positiveLong,requiredInteger,requiredText,parseRowVersion } from '../http.js';
import { insertAudit } from '../audit.js';
import { activityDay,disciplineScore } from '../activity-rules.js';
import { activityScope,activityRoster,fullMember,visibleProject,memberEvidence,activityCycleScore,assertActivityReviewOpen,iso,queryActivity,type ActivityScope } from '../activity-service.js';
import type { CurrentUser } from '../types.js';

type Row=Record<string,unknown>;
const positiveId=(value:unknown,label:string)=>typeof value==='number'?requiredInteger(value,label,1,Number.MAX_SAFE_INTEGER):positiveLong(value,label);
const invalid=(message:string)=>new ApiError(400,'activity_validation',message);
const missing=()=>new ApiError(404,'activity_not_found','Activity record not found in your scope.');
const textDate=(v:unknown,label:string)=>parseDateOnly(v,label,false)!;
const periodDays=(start:string,end:string)=>(Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/86400_000+1;
const uuid=(v:unknown)=>{const key=requiredText(v,36,'Request key');if(!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(key))throw invalid('Invalid request key.');return key;};
const modules=new Set(['sales-intake','labor','signature','dashboard','my-work','inquiries','estimates','projects','knowledge','site-visits','my-assignments','price','quotations','missing','project-timeline','resources','procurement','boms','purchase','pos','inventory','receiving','issues','approvals','signing','documents','performance','reports','master','rates','audit','settings','profile','support','activity','module-templates','stamps','visit-master','signature']);

export function registerActivityRoutes(app:FastifyInstance,db:Database,users:CurrentUserService){
 const actorFor=async(request:Parameters<CurrentUserService['required']>[0])=>{await users.demandPermission(request,'activity.read');return users.required(request);};
 const targetFor=async(scope:ActivityScope,id:number)=>{const user=(await activityRoster(db,scope)).find(u=>u.id===id);if(!user)throw missing();return user;};
 const canManage=(scope:ActivityScope)=>scope.all||Boolean(scope.department)||scope.projects.length>0;
 const reviewTarget=async(actor:CurrentUser,scope:ActivityScope,id:number)=>{const user=await targetFor(scope,id);if(actor.id===id||!fullMember(scope,user)||!['Admin','Engineering Manager','Sales Manager'].includes(actor.role))throw new ApiError(403,'activity_review_scope','A different department review manager must review this employee.');return user;};
 const sources=async(userId:number,scope:ActivityScope)=>{
  const user=await targetFor(scope,userId),full=fullMember(scope,user);
  const rows=(await db.query<Row>(`SELECT N'Schedule Task' source_type,t.id source_id,t.project_id,t.name title FROM dbo.schedule_tasks t
  JOIN dbo.schedule_task_pics pic ON pic.task_id=t.id JOIN dbo.projects p ON p.id=t.project_id
  WHERE pic.user_id=@user AND t.deleted_at IS NULL AND p.deleted_at IS NULL AND p.status<>N'Closed' AND t.status<>N'Done' AND t.kind<>N'phase' AND NOT EXISTS(SELECT 1 FROM dbo.schedule_tasks child WHERE child.parent_id=t.id AND child.deleted_at IS NULL)
  UNION ALL SELECT N'Resource Task',t.id,t.project_id,t.title FROM dbo.resource_tasks t WHERE t.assignee_id=@user AND t.state=N'Approved' AND t.schedule_task_id IS NULL AND t.execution_status<>N'Done'
  UNION ALL SELECT N'Inquiry',i.id,NULL,i.inquiry_no+N' · '+i.project_name FROM dbo.inquiries i WHERE (i.estimate_owner_id=@user OR i.created_by=@user) AND i.deleted_at IS NULL AND i.status NOT IN(N'Closed',N'Cancelled',N'Rejected',N'Approved')`,q=>q.input('user',sql.BigInt,userId))).recordset;
  return rows.map(r=>({sourceType:String(r.source_type),sourceId:Number(r.source_id),projectId:r.project_id==null?null:Number(r.project_id),title:String(r.title)})).filter(s=>full||visibleProject(scope,s.projectId));
 };
 app.post('/api/v1/activity/presence',async request=>{
  const actor=await actorFor(request),b=bodyObject(request.body),moduleName=requiredText(b.module,60,'Module');if(!modules.has(moduleName))throw invalid('Unknown application module.');
  // No client timestamps, durations or identity. Tabs/devices share a server-side session.
  return db.transaction(async tx=>{
   const q=new sql.Request(tx);q.input('user',sql.BigInt,actor.id).input('module',sql.NVarChar(60),moduleName);
   const result=await q.query<Row>(`DECLARE @now datetimeoffset(0)=SYSUTCDATETIME(),@id bigint,@last datetimeoffset(0),@module_before nvarchar(60);
    SELECT TOP(1) @id=id,@last=last_at,@module_before=module FROM dbo.activity_sessions WITH(UPDLOCK,HOLDLOCK) WHERE user_id=@user ORDER BY last_at DESC,id DESC;
    IF @id IS NULL OR DATEDIFF(second,@last,@now)>=1800 BEGIN
     INSERT dbo.activity_sessions(user_id,module,started_at,last_at) VALUES(@user,@module,@now,@now);
     SET @id=SCOPE_IDENTITY();
     INSERT dbo.activity_events(actor_id,session_id,kind,module,summary) VALUES(@user,@id,N'SESSION',@module,N'Session started');
    END ELSE IF DATEDIFF(second,@last,@now)>=45 BEGIN
     UPDATE dbo.activity_sessions SET last_at=@now,module=@module WHERE id=@id;
     INSERT dbo.activity_events(actor_id,session_id,kind,module,summary) VALUES(@user,@id,N'ACTIVE',@module,N'Active interaction');
    END;
    IF @module_before IS NULL OR @module_before<>@module BEGIN
     IF NOT EXISTS(SELECT 1 FROM dbo.activity_events WHERE actor_id=@user AND kind=N'PAGE' AND module=@module AND occurred_at>DATEADD(second,-45,@now))
      INSERT dbo.activity_events(actor_id,session_id,kind,module,summary) VALUES(@user,@id,N'PAGE',@module,N'Page opened');
    END;
    SELECT @now recorded_at;`);
   return {recordedAt:iso(result.recordset[0]!.recorded_at)};
  });
 });
 app.get('/api/v1/activity/meta',async request=>{
  const actor=await actorFor(request),scope=await activityScope(db,actor),members=await activityRoster(db,scope);
  const data=await db.query<Row>(`SELECT id,project_no,name,manager_id,lead_engineer_id FROM dbo.projects WHERE deleted_at IS NULL AND (@all=1 OR manager_id=@actor OR lead_engineer_id=@actor OR (@department IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.users u WHERE u.id=manager_id AND u.department=@department)));
  SELECT c.id,c.code,c.name,c.period_start,c.period_end,c.status,COALESCE(p.mode,N'TRIAL') mode,CASE WHEN p.cycle_id IS NULL THEN 0 ELSE 1 END configured FROM dbo.kpi_review_cycles c LEFT JOIN dbo.activity_cycle_policies p ON p.cycle_id=c.id ORDER BY c.period_end DESC;
  SELECT started_at FROM dbo.activity_settings;`,q=>q.input('all',sql.Bit,scope.all).input('actor',sql.BigInt,actor.id).input('department',sql.NVarChar(100),scope.department));
  const sets=data.recordsets as unknown as Row[][];
  return {members,canManage:canManage(scope),canConfigure:scope.all,canReview:['Admin','Engineering Manager','Sales Manager'].includes(actor.role),selfId:actor.id,startedAt:iso(sets[2]![0]!.started_at),
   projects:sets[0]!.map(r=>({id:Number(r.id),name:`${r.project_no} · ${r.name}`})),cycles:sets[1]!.map(r=>({id:Number(r.id),code:String(r.code),name:String(r.name),periodStart:dateOnly(r.period_start as Date)!,periodEnd:dateOnly(r.period_end as Date)!,status:String(r.status),mode:String(r.mode),configured:Boolean(r.configured)}))};
 });
 app.get('/api/v1/activity/overview',async request=>{
  const actor=await actorFor(request),scope=await activityScope(db,actor),q=request.query as Row,day=textDate(q.day??activityDay(),'Day');
  const projectId=q.projectId?positiveId(q.projectId,'Project'):null;
  if(day>activityDay())throw invalid('Choose today or an earlier day.');
  const cycleId=q.cycleId?positiveId(q.cycleId,"Cycle"):null;
  const members=await activityRoster(db,scope),items=[];
  for(const member of members){
   const evidence=await memberEvidence(db,member.id,day,day,scope);
   const rules=projectId?evidence.rules.filter(r=>r.projectId===projectId):evidence.rules;
   if(projectId&&!rules.length)continue;
   // A project filter cannot expose an employee's company-wide activity or KPI.
   const localScope=projectId?{all:false,department:null,projects:[projectId],actorId:-1}:scope;
   const scoped=projectId?await memberEvidence(db,member.id,day,day,localScope):evidence;
   const sessions=evidence.full&&!projectId?(await db.query<Row>(`SELECT COUNT(DISTINCT session_id) sessions,MIN(occurred_at) first_at FROM dbo.activity_events WHERE actor_id=@user AND occurred_at>=TODATETIMEOFFSET(CONVERT(datetime2,@day),'+07:00') AND occurred_at<TODATETIMEOFFSET(DATEADD(day,1,CONVERT(datetime2,@day)),'+07:00');
    SELECT MAX(occurred_at) last_seen FROM dbo.activity_events WHERE actor_id=@user AND occurred_at<TODATETIMEOFFSET(DATEADD(day,1,CONVERT(datetime2,@day)),'+07:00');`,bind=>bind.input('user',sql.BigInt,member.id).input('day',sql.Date,day))):null;
   const ss=sessions?.recordsets as unknown as Row[][]|undefined;
   const events=scoped.events,daily=scoped.days[0]!,entered=events.length>0||Number(ss?.[0]?.[0]?.sessions??0)>0;
   const score=cycleId&&evidence.full&&!projectId?await activityCycleScore(db,member.id,cycleId):null;
   items.push({...member,score:score?{automatic:score.automatic,total:member.id===actor.id&&!score.frozen?null:score.total,eligible:score.eligible,mode:score.mode}:null,day:daily,entered,accessVisible:evidence.full&&!projectId,sessions:ss?Number(ss[0]![0]!.sessions):null,firstAt:ss?.[0]?.[0]?.first_at?iso(ss[0][0].first_at):null,lastAt:ss?.[1]?.[0]?.last_seen?iso(ss[1][0].last_seen):null,
    updatedTasks:new Set(events.filter(e=>e.kind==='UPDATE').map(e=>`${e.sourceType}:${e.sourceId}`)).size,projectOnly:!evidence.full||Boolean(projectId)});
  }
  return {day,items,updatedAt:new Date().toISOString()};
 });
 app.get('/api/v1/activity/members/:id',async request=>{
  const actor=await actorFor(request),scope=await activityScope(db,actor),userId=positiveId((request.params as Row).id,'User'),member=await targetFor(scope,userId),q=request.query as Row;
  const start=textDate(q.start??activityDay().slice(0,7)+'-01','Start'),end=textDate(q.end??activityDay(),'End');if(start>end||periodDays(start,end)>370)throw invalid('Invalid period.');
  const evidence=await memberEvidence(db,userId,start,end,scope),cycleId=q.cycleId?positiveId(q.cycleId,'Cycle'):null;
  let score=cycleId&&fullMember(scope,member)?await activityCycleScore(db,userId,cycleId):null;
  if(score&&userId===actor.id&&!score.frozen)score={...score,quality:null,qualityReview:null,total:null,rating:null};
  return {member,...evidence,score,summary:disciplineScore(evidence.days,null),sources:await sources(userId,scope)};
 });
 app.post('/api/v1/activity/rules',async request=>{
  const actor=await actorFor(request),scope=await activityScope(db,actor);if(!canManage(scope))throw new ApiError(403,'activity_manage','A team leader must configure reporting commitments.');
  const b=bodyObject(request.body),userId=positiveId(b.userId,'User'),sourceId=positiveId(b.sourceId,'Source'),sourceType=requiredText(b.sourceType,30,'Source type');
  const source=(await sources(userId,scope)).find(s=>s.sourceType===sourceType&&s.sourceId===sourceId);if(!source)throw missing();
  // Self access alone does not grant permission to configure a whole reporting policy.
  const member=await targetFor(scope,userId);if(!scope.all&&!(scope.department&&member.department===scope.department)&&!visibleProject(scope,source.projectId))throw missing();
  const start=textDate(b.startsOn,'Start'),end=textDate(b.endsOn,'End'),mask=requiredInteger(b.weekdayMask,'Weekdays',1,127),cutoff=requiredInteger(b.cutoffMinute,'Deadline',0,1439);
  if(start<=activityDay()||end<start||periodDays(start,end)>366)throw invalid('Reporting commitments start tomorrow or later and span at most one year.');
  return db.transaction(async tx=>{
   const row=(await queryActivity<Row>(db,tx,`IF EXISTS(SELECT 1 FROM dbo.activity_rules WITH(UPDLOCK,HOLDLOCK) WHERE user_id=@user AND source_type=@type AND source_id=@source AND starts_on<=@end AND ends_on>=@start AND (stopped_on IS NULL OR stopped_on>@start)) THROW 51352,'A reporting commitment already overlaps this period.',1;
   DECLARE @created TABLE(id bigint);INSERT dbo.activity_rules(user_id,project_id,source_type,source_id,title,starts_on,ends_on,weekday_mask,cutoff_minute,created_by) OUTPUT inserted.id INTO @created VALUES(@user,@project,@type,@source,@title,@start,@end,@mask,@cutoff,@actor); SELECT id FROM @created;`,bind=>bind.input('user',sql.BigInt,userId).input('project',sql.BigInt,source.projectId).input('type',sql.NVarChar(30),sourceType).input('source',sql.BigInt,sourceId).input('title',sql.NVarChar(500),source.title).input('start',sql.Date,start).input('end',sql.Date,end).input('mask',sql.Int,mask).input('cutoff',sql.Int,cutoff).input('actor',sql.BigInt,actor.id))).recordset[0]!;
   await insertAudit(tx,actor.id,'Activity Rule',Number(row.id),String(userId),'Reporting commitment created',null,{...source,start,end,mask,cutoff});return {id:Number(row.id)};
  });
 });
 app.post('/api/v1/activity/rules/:id/stop',async request=>{
  const actor=await actorFor(request),scope=await activityScope(db,actor),b=bodyObject(request.body),id=positiveId((request.params as Row).id,'Rule'),stop=textDate(b.stoppedOn,'Stop date'),reason=requiredText(b.reason,1000,'Reason'),version=parseRowVersion(b.rowVersion);
  if(!canManage(scope)||stop<=activityDay())throw invalid('A manager may stop reporting from a future day.');
  return db.transaction(async tx=>{
   const row=(await queryActivity<Row>(db,tx,'SELECT r.*,u.department FROM dbo.activity_rules r WITH(UPDLOCK,HOLDLOCK) JOIN dbo.users u ON u.id=r.user_id WHERE r.id=@id',q=>q.input('id',sql.BigInt,id))).recordset[0];if(!row)throw missing();
   if(!scope.all&&!(scope.department&&scope.department===row.department)&&!visibleProject(scope,row.project_id==null?null:Number(row.project_id)))throw missing();
   const changed=await queryActivity(db,tx,'UPDATE dbo.activity_rules SET stopped_on=@stop WHERE id=@id AND row_version=@version AND stopped_on IS NULL AND starts_on<=@stop',q=>q.input('id',sql.BigInt,id).input('stop',sql.Date,stop).input('version',sql.VarBinary(8),version));
   if(changed.rowsAffected[0]!==1)throw new ApiError(409,'activity_conflict','The commitment changed. Refresh and try again.');
   await insertAudit(tx,actor.id,'Activity Rule',id,String(row.user_id),'Reporting commitment stopped',null,{stop,reason});return {id};
  });
 });
 app.post('/api/v1/activity/reports',async request=>{
  const actor=await actorFor(request),b=bodyObject(request.body),ruleId=positiveId(b.ruleId,'Rule'),key=uuid(b.requestKey);
  const progress=requiredText(b.progress,700,'Progress'),nextStep=requiredText(b.nextStep,700,'Next step'),evidence=requiredText(b.evidence,500,'Evidence or blocker');
  const details=JSON.stringify({progress,nextStep,evidence}),today=activityDay();
  return db.transaction(async tx=>{
   const duplicate=(await queryActivity<Row>(db,tx,'SELECT id,rule_id,details_json FROM dbo.activity_events WITH(UPDLOCK,HOLDLOCK) WHERE actor_id=@actor AND request_key=@key',q=>q.input('actor',sql.BigInt,actor.id).input('key',sql.UniqueIdentifier,key))).recordset[0];
   if(duplicate){if(Number(duplicate.rule_id)!==ruleId||duplicate.details_json!==details)throw new ApiError(409,'activity_request_reused','Request key already belongs to different content.');return {id:Number(duplicate.id)};}
   const rule=(await queryActivity<Row>(db,tx,'SELECT * FROM dbo.activity_rules WHERE id=@id AND user_id=@actor AND starts_on<=@today AND ends_on>=@today AND (stopped_on IS NULL OR stopped_on>@today)',q=>q.input('id',sql.BigInt,ruleId).input('actor',sql.BigInt,actor.id).input('today',sql.Date,today))).recordset[0];if(!rule)throw missing();
   const last=(await queryActivity<Row>(db,tx,`SELECT TOP(1) details_json FROM dbo.activity_events WHERE actor_id=@actor AND source_type=@type AND source_id=@source AND kind=N'UPDATE' ORDER BY id DESC`,q=>q.input('actor',sql.BigInt,actor.id).input('type',sql.NVarChar(30),String(rule.source_type)).input('source',sql.BigInt,Number(rule.source_id)))).recordset[0];
   if(last?.details_json===details)throw new ApiError(409,'activity_no_change','Add a new progress detail, next step or blocker; this repeats your last report.');
   const created=(await queryActivity<Row>(db,tx,`DECLARE @created TABLE(id bigint); INSERT dbo.activity_events(actor_id,project_id,rule_id,kind,module,source_type,source_id,summary,details_json,request_key) OUTPUT inserted.id INTO @created VALUES(@actor,@project,@rule,N'UPDATE',N'my-work',@type,@source,@summary,@details,@key);SELECT id FROM @created;`,q=>q.input('actor',sql.BigInt,actor.id).input('project',sql.BigInt,rule.project_id==null?null:Number(rule.project_id)).input('rule',sql.BigInt,ruleId).input('type',sql.NVarChar(30),String(rule.source_type)).input('source',sql.BigInt,Number(rule.source_id)).input('summary',sql.NVarChar(2000),`${rule.title} · ${progress}`).input('details',sql.NVarChar(sql.MAX),details).input('key',sql.UniqueIdentifier,key))).recordset[0]!;
   return {id:Number(created.id)};
  });
 });
 app.post('/api/v1/activity/exceptions',async request=>{
  const actor=await actorFor(request);await users.demandPermission(request,'performance.manage');const scope=await activityScope(db,actor),b=bodyObject(request.body),userId=positiveId(b.userId,'User'),day=textDate(b.day,'Day'),reason=requiredText(b.reason,1000,'Reason');await reviewTarget(actor,scope,userId);
  return db.transaction(async tx=>{
   const cycles=(await queryActivity<Row>(db,tx,'SELECT id FROM dbo.kpi_review_cycles WITH(UPDLOCK,HOLDLOCK) WHERE period_start<=@day AND period_end>=@day',q=>q.input('day',sql.Date,day))).recordset;
   for(const c of cycles)await assertActivityReviewOpen(db,tx,userId,Number(c.id));
   const duplicate=(await queryActivity<Row>(db,tx,'SELECT reason FROM dbo.activity_exceptions WITH(UPDLOCK,HOLDLOCK) WHERE user_id=@user AND day=@day',q=>q.input('user',sql.BigInt,userId).input('day',sql.Date,day))).recordset[0];
   if(duplicate){if(duplicate.reason!==reason)throw new ApiError(409,'activity_exception_exists','An approved exception already exists for this day.');return {day};}
   await queryActivity(db,tx,'INSERT dbo.activity_exceptions(user_id,day,reason,approved_by) VALUES(@user,@day,@reason,@actor)',q=>q.input('user',sql.BigInt,userId).input('day',sql.Date,day).input('reason',sql.NVarChar(1000),reason).input('actor',sql.BigInt,actor.id));
   await insertAudit(tx,actor.id,'Activity Exception',userId,day,'Reporting exemption approved',null,{day,reason});return {day};
  });
 });
 app.post('/api/v1/activity/quality',async request=>{
  const actor=await actorFor(request);await users.demandPermission(request,'performance.manage');const scope=await activityScope(db,actor),b=bodyObject(request.body),userId=positiveId(b.userId,'User'),cycleId=positiveId(b.cycleId,'Cycle');await reviewTarget(actor,scope,userId);
  const clarity=requiredInteger(b.clarity,'Clarity',0,5),nextStep=requiredInteger(b.nextStep,'Next step',0,5),evidence=requiredInteger(b.evidence,'Evidence',0,5),note=requiredText(b.note,2000,'Review explanation');
  const ids=[...new Set((Array.isArray(b.evidenceIds)?b.evidenceIds:[]).map(id=>positiveId(id,'Evidence id')))];if(ids.length>20)throw invalid('Select at most 20 reports supporting this assessment.');
  if(!ids.length&&(clarity!==0||nextStep!==0||evidence!==0))throw invalid('A review without report evidence must give zero for all three quality scores.');
  return db.transaction(async tx=>{
   await assertActivityReviewOpen(db,tx,userId,cycleId);const score=await activityCycleScore(db,userId,cycleId,tx);
   const proof=await memberEvidence(db,userId,score.periodStart,score.periodEnd,undefined,tx);
   const updates=proof.events.filter(event=>event.kind==='UPDATE');
   // Missing reporting is assessable, but it cannot earn quality points or bypass available evidence.
   if(!ids.length&&updates.length)throw invalid('Select 1–20 reports supporting this assessment; this employee has updates in the selected review cycle.');
   if(ids.some(id=>!updates.some(event=>event.id===id)))throw invalid('Evidence must be this employee’s successful updates in the selected review cycle.');
   if(score.qualityReview&&(!b.rowVersion||score.qualityReview.rowVersion!==requiredText(b.rowVersion,64,'Version')))throw new ApiError(409,'activity_conflict','Quality review changed. Refresh before saving.');
   await queryActivity(db,tx,`IF EXISTS(SELECT 1 FROM dbo.activity_quality WHERE cycle_id=@cycle AND user_id=@user)
    UPDATE dbo.activity_quality SET clarity=@clarity,next_step=@next,evidence=@evidence,note=@note,evidence_ids=@ids,reviewer_id=@actor,updated_at=SYSUTCDATETIME() WHERE cycle_id=@cycle AND user_id=@user;
    ELSE INSERT dbo.activity_quality(cycle_id,user_id,clarity,next_step,evidence,note,evidence_ids,reviewer_id) VALUES(@cycle,@user,@clarity,@next,@evidence,@note,@ids,@actor);`,q=>q.input('cycle',sql.BigInt,cycleId).input('user',sql.BigInt,userId).input('clarity',sql.Int,clarity).input('next',sql.Int,nextStep).input('evidence',sql.Int,evidence).input('note',sql.NVarChar(2000),note).input('ids',sql.NVarChar(2000),JSON.stringify(ids)).input('actor',sql.BigInt,actor.id));
   await insertAudit(tx,actor.id,'Activity Quality',userId,String(cycleId),'Quality reviewed',score.qualityReview,{clarity,nextStep,evidence,note,ids});return {userId,cycleId};
  });
 });
 app.post('/api/v1/activity/clarifications',async request=>{
  const actor=await actorFor(request),b=bodyObject(request.body),cycleId=positiveId(b.cycleId,'Cycle'),note=requiredText(b.note,2000,'Clarification');
  return db.transaction(async tx=>{await assertActivityReviewOpen(db,tx,actor.id,cycleId);await queryActivity(db,tx,'INSERT dbo.activity_clarifications(cycle_id,user_id,note) VALUES(@cycle,@user,@note)',q=>q.input('cycle',sql.BigInt,cycleId).input('user',sql.BigInt,actor.id).input('note',sql.NVarChar(2000),note));return {cycleId};});
 });
 app.post('/api/v1/activity/cycle-policy',async request=>{
  const actor=await actorFor(request);if(actor.role!=='Admin')throw new ApiError(403,'activity_admin','Only Admin can publish a cycle policy.');const b=bodyObject(request.body),cycleId=positiveId(b.cycleId,'Cycle'),mode=requiredText(b.mode,10,'Mode');if(!['TRIAL','ACTIVE'].includes(mode))throw invalid('Unknown policy mode.');
  return db.transaction(async tx=>{
   const row=(await queryActivity<Row>(db,tx,'SELECT * FROM dbo.kpi_review_cycles WITH(UPDLOCK,HOLDLOCK) WHERE id=@id',q=>q.input('id',sql.BigInt,cycleId))).recordset[0];if(!row)throw missing();
   if(dateOnly(row.period_start as Date)!<=activityDay()||row.status!=='OPEN')throw new ApiError(409,'activity_policy_locked','Publish the policy before the review period starts. Current and past cycles stay in trial mode.');
   const exists=(await queryActivity<Row>(db,tx,'SELECT mode FROM dbo.activity_cycle_policies WHERE cycle_id=@id',q=>q.input('id',sql.BigInt,cycleId))).recordset[0];
   if(exists){if(exists.mode!==mode)throw new ApiError(409,'activity_policy_locked','The published policy is immutable.');return {cycleId,mode};}
   await queryActivity(db,tx,'INSERT dbo.activity_cycle_policies(cycle_id,mode,created_by) VALUES(@id,@mode,@actor)',q=>q.input('id',sql.BigInt,cycleId).input('mode',sql.NVarChar(10),mode).input('actor',sql.BigInt,actor.id));
   await insertAudit(tx,actor.id,'Activity Policy',cycleId,String(cycleId),'Policy published',null,{mode,weight:10,minDays:10,formulaVersion:1});return {cycleId,mode};
  });
 });
}
