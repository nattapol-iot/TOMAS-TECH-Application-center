import sql from 'mssql';
import type { Transaction, Request } from 'mssql';
import type { Database } from './db.js';
import type { CurrentUser } from './types.js';
import { dateOnly } from './http.js';
import { ApiError } from './errors.js';
import { activityDay, reportingDays, disciplineScore, type ReportingRule, type ActivityEvent } from './activity-rules.js';

export type ActivityScope = {all:boolean;department:string|null;projects:number[];actorId:number};
type Row=Record<string,unknown>;
export const iso=(value:unknown)=>value instanceof Date?value.toISOString():String(value);
const day=(value:unknown)=>dateOnly(value as Date|string)!;
export const queryActivity=<T extends object>(db:Database,tx:Transaction|undefined,text:string,bind?:(q:Request)=>void)=>{
 if(!tx)return db.query<T>(text,bind); const q=new sql.Request(tx);bind?.(q);return q.query<T>(text);
};
export async function activityScope(db:Database,actor:CurrentUser):Promise<ActivityScope>{
 const projects=(await db.query<{id:number}>(`SELECT id FROM dbo.projects WHERE deleted_at IS NULL AND (manager_id=@actor OR lead_engineer_id=@actor)`,q=>q.input('actor',sql.BigInt,actor.id))).recordset.map(r=>Number(r.id));
 return {all:actor.role==='Admin',department:['Engineering Manager','Sales Manager','Management'].includes(actor.role)&&actor.department.trim()?actor.department:null,projects,actorId:actor.id};
}
export const fullMember=(scope:ActivityScope,user:{id:number;department:string})=>scope.all||scope.actorId===user.id||Boolean(scope.department&&scope.department===user.department);
export const visibleProject=(scope:ActivityScope,projectId:number|null)=>projectId!==null&&scope.projects.includes(projectId);
export const ruleDto=(r:Row):ReportingRule=>({id:Number(r.id),userId:Number(r.user_id),projectId:r.project_id==null?null:Number(r.project_id),sourceType:String(r.source_type),sourceId:Number(r.source_id),title:String(r.title),startsOn:day(r.starts_on),endsOn:day(r.ends_on),stoppedOn:r.stopped_on?day(r.stopped_on):null,weekdayMask:Number(r.weekday_mask),cutoffMinute:Number(r.cutoff_minute),rowVersion:(r.row_version as Buffer).toString('base64')});
export const eventDto=(r:Row):ActivityEvent=>({id:Number(r.id),actorId:Number(r.actor_id),projectId:r.project_id==null?null:Number(r.project_id),ruleId:r.rule_id==null?null:Number(r.rule_id),kind:String(r.kind),module:String(r.module),sourceType:r.source_type==null?null:String(r.source_type),sourceId:r.source_id==null?null:Number(r.source_id),summary:String(r.summary),occurredAt:iso(r.occurred_at),details:r.details_json?JSON.parse(String(r.details_json)):null});
export async function activityRoster(db:Database,scope:ActivityScope){
 const result=await db.query<Row>(`SELECT u.id,u.name,u.department,r.code role,u.entra_object_id,
  (SELECT MIN(e.start_work_date) FROM dbo.employees e WHERE e.user_id=u.id AND e.is_active=1 AND e.deleted_at IS NULL) start_work_date
 FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.is_active=1 AND u.deleted_at IS NULL AND
 (@all=1 OR u.id=@actor OR (@department IS NOT NULL AND u.department=@department) OR EXISTS(
 SELECT 1 FROM dbo.projects p WHERE p.deleted_at IS NULL AND (p.manager_id=@actor OR p.lead_engineer_id=@actor) AND
 (u.id=p.manager_id OR u.id=p.lead_engineer_id OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=u.id)
 OR EXISTS(SELECT 1 FROM dbo.activity_rules ar WHERE ar.project_id=p.id AND ar.user_id=u.id)))) ORDER BY u.name`,q=>q.input('all',sql.Bit,scope.all).input('actor',sql.BigInt,scope.actorId).input('department',sql.NVarChar(100),scope.department));
 return result.recordset.map(r=>({id:Number(r.id),name:String(r.name),department:String(r.department),role:String(r.role),canSignIn:Boolean(r.entra_object_id),startWorkDate:r.start_work_date?day(r.start_work_date):null}));
}
export async function memberEvidence(db:Database,userId:number,start:string,end:string,scope?:ActivityScope,tx?:Transaction){
 const result=await queryActivity<Row>(db,tx,`SELECT * FROM dbo.activity_rules WHERE user_id=@user AND ends_on>=@start;
 SELECT * FROM dbo.activity_events WHERE actor_id=@user AND occurred_at>=TODATETIMEOFFSET(CONVERT(datetime2,@start),'+07:00') AND occurred_at<TODATETIMEOFFSET(DATEADD(day,1,CONVERT(datetime2,@end)),'+07:00') ORDER BY occurred_at,id;
 SELECT day,reason FROM dbo.activity_exceptions WHERE user_id=@user AND day BETWEEN @start AND @end;
 SELECT holiday_date FROM dbo.holidays WHERE holiday_date BETWEEN @start AND @end;
 SELECT started_at FROM dbo.activity_settings WHERE id=1;
 SELECT department FROM dbo.users WHERE id=@user;`,q=>q.input('user',sql.BigInt,userId).input('start',sql.Date,start).input('end',sql.Date,end));
 const sets=result.recordsets as unknown as Row[][];
 const full=!scope||fullMember(scope,{id:userId,department:String(sets[5]![0]!.department)});
 const rules=sets[0]!.map(ruleDto).filter(r=>full||visibleProject(scope!,r.projectId));
 const events=sets[1]!.map(eventDto).filter(e=>full||visibleProject(scope!,e.projectId));
 // Project leaders need the exempt date to explain the reporting status, but
 // personal leave/health details remain restricted to the employee's full scope.
 const exceptions=sets[2]!.map(r=>({day:day(r.day),reason:full?String(r.reason):''}));
 const startedAt=iso(sets[4]![0]!.started_at),trackingStart=activityDay(new Date(startedAt));
 const days=reportingDays(rules,events,start,end,trackingStart,new Set(exceptions.map(e=>e.day)),new Set(sets[3]!.map(r=>day(r.holiday_date))));
 return {rules,events,exceptions,days,startedAt,full};
}
export async function activityCycleScore(db:Database,userId:number,cycleId:number,tx?:Transaction){
 const result=await queryActivity<Row>(db,tx,`SELECT c.*,COALESCE(p.mode,N'TRIAL') mode,COALESCE(p.weight,10) weight,COALESCE(p.min_days,10) min_days FROM dbo.kpi_review_cycles c LEFT JOIN dbo.activity_cycle_policies p ON p.cycle_id=c.id WHERE c.id=@cycle;
 SELECT * FROM dbo.activity_quality WHERE cycle_id=@cycle AND user_id=@user;
 SELECT snapshot_json FROM dbo.activity_snapshots WHERE cycle_id=@cycle AND user_id=@user;
 SELECT id,note,created_at FROM dbo.activity_clarifications WHERE cycle_id=@cycle AND user_id=@user ORDER BY created_at;`,q=>q.input('cycle',sql.BigInt,cycleId).input('user',sql.BigInt,userId));
 const sets=result.recordsets as unknown as Row[][],cycle=sets[0]![0];
 if(!cycle)throw new ApiError(404,'activity_cycle_missing','Review cycle not found.');
 const quality=sets[1]![0],frozen=sets[2]![0];
 if(frozen)return {...JSON.parse(String(frozen.snapshot_json)) as ActivityCycleScore,frozen:true};
 const evidence=await memberEvidence(db,userId,day(cycle.period_start),day(cycle.period_end),undefined,tx);
 const scores=disciplineScore(evidence.days,quality?Number(quality.clarity)+Number(quality.next_step)+Number(quality.evidence):null,Number(cycle.min_days));
 return {...scores,cycleId,userId,mode:String(cycle.mode),weight:Number(cycle.weight),formulaVersion:1,frozen:false,
 periodStart:day(cycle.period_start),periodEnd:day(cycle.period_end),startedAt:evidence.startedAt,days:evidence.days,
 qualityReview:quality?{clarity:Number(quality.clarity),nextStep:Number(quality.next_step),evidence:Number(quality.evidence),note:String(quality.note),evidenceIds:JSON.parse(String(quality.evidence_ids)) as number[],rowVersion:(quality.row_version as Buffer).toString('base64')}:null,
 clarifications:sets[3]!.map(r=>({id:Number(r.id),note:String(r.note),createdAt:iso(r.created_at)}))};
}
export type ActivityCycleScore = Awaited<ReturnTypeWithoutCycle>;
// Explicit public contract avoids recursive inference when returning a frozen snapshot.
type ReturnTypeWithoutCycle = Promise<ReturnType<typeof disciplineScore>&{cycleId:number;userId:number;mode:string;weight:number;formulaVersion:number;frozen:boolean;periodStart:string;periodEnd:string;startedAt:string;days:ReturnType<typeof reportingDays>;qualityReview:{clarity:number;nextStep:number;evidence:number;note:string;evidenceIds:number[];rowVersion:string}|null;clarifications:{id:number;note:string;createdAt:string}[]}>;
export async function assertActivityReviewOpen(db:Database,tx:Transaction,userId:number,cycleId:number){
 const result=await queryActivity<Row>(db,tx,`SELECT c.status FROM dbo.kpi_review_cycles c WITH(UPDLOCK,HOLDLOCK) WHERE c.id=@cycle;
 SELECT s.user_id FROM dbo.activity_snapshots s WITH(UPDLOCK,HOLDLOCK) WHERE s.cycle_id=@cycle AND s.user_id=@user;
 SELECT a.status FROM dbo.kpi_assessments a JOIN dbo.employees e ON e.id=a.employee_id WHERE a.cycle_id=@cycle AND e.user_id=@user AND a.status=N'COMPLETED';`,q=>q.input('cycle',sql.BigInt,cycleId).input('user',sql.BigInt,userId));
 const sets=result.recordsets as unknown as Row[][];
 if(!sets[0]![0]||sets[0]![0]!.status==='CLOSED'||sets[1]!.length||sets[2]!.length)throw new ApiError(409,'activity_frozen','This review is closed or already finalized.');
}
export async function freezeActivityScore(db:Database,tx:Transaction,userId:number,cycleId:number){
 const score=await activityCycleScore(db,userId,cycleId,tx);
 if(score.frozen)return;
 if(score.mode==='ACTIVE'&&(score.periodEnd>=activityDay()||(score.eligible&&score.total===null)))throw new ApiError(409,'activity_review_pending','Finish the reporting period and quality review before completing this KPI.');
 await queryActivity(db,tx,`INSERT dbo.activity_snapshots(cycle_id,user_id,snapshot_json) VALUES(@cycle,@user,@json)`,q=>q.input('cycle',sql.BigInt,cycleId).input('user',sql.BigInt,userId).input('json',sql.NVarChar(sql.MAX),JSON.stringify(score)));
}
