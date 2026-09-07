/** Formula v1. All calendar decisions use Bangkok, independent of host TZ. */
export const activityDay = (date = new Date()) => new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
export const activityMinute = (date: Date) => { const local = new Date(date.getTime() + 7 * 3600_000); return local.getUTCHours() * 60 + local.getUTCMinutes(); };
export const nextDay = (day: string) => new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400_000).toISOString().slice(0, 10);
export function dateRange(start: string, end: string): string[] {
 const result: string[] = [];
 for (let day=start; day<=end; day=nextDay(day)) { if(result.length>=370) throw new Error('Activity range is limited to 370 days.'); result.push(day); }
 return result;
}
export type ReportingRule = { id:number;userId:number;projectId:number|null;sourceType:string;sourceId:number;title:string;startsOn:string;endsOn:string;stoppedOn:string|null;weekdayMask:number;cutoffMinute:number;rowVersion:string };
export type ActivityEvent = {id:number;actorId:number;projectId:number|null;ruleId:number|null;kind:string;module:string;sourceType:string|null;sourceId:number|null;summary:string;occurredAt:string;details?:unknown};
export type ActivityDayResult = {day:string;status:'NO_DATA'|'EXEMPT'|'NOT_REQUIRED'|'PENDING'|'ON_TIME'|'LATE'|'MISSING';expected:number;updated:number;credit:number|null;eventIds:number[]};
export function reportingDays(rules:ReportingRule[],events:ActivityEvent[],start:string,end:string,trackingStart:string,exceptions:Set<string>,holidays:Set<string>,now=new Date()):ActivityDayResult[] {
 const today=activityDay(now);
 return dateRange(start,end).map(day=>{
  const base={day,expected:0,updated:0,credit:null,eventIds:[] as number[]};
  if(day<trackingStart || day>today)return {...base,status:'NO_DATA'};
  if(exceptions.has(day)||holidays.has(day))return {...base,status:'EXEMPT'};
  const weekday=new Date(`${day}T00:00:00Z`).getUTCDay();
  const due=rules.filter(r=>r.startsOn<=day&&r.endsOn>=day&&(!r.stoppedOn||day<r.stoppedOn)&&Boolean(r.weekdayMask&(1<<weekday)));
  if(!due.length)return {...base,status:'NOT_REQUIRED'};
  const matches=due.map(r=>({rule:r,events:events.filter(e=>e.kind==='UPDATE'&&e.actorId===r.userId&&e.sourceType===r.sourceType&&e.sourceId===r.sourceId&&activityDay(new Date(e.occurredAt))===day)}));
  const onTime=matches.some(m=>m.events.some(e=>activityMinute(new Date(e.occurredAt))<=m.rule.cutoffMinute));
  const updated=matches.filter(m=>m.events.length).length;
  const pending=day===today&&activityMinute(now)<=Math.max(...due.map(r=>r.cutoffMinute));
  return {...base,expected:due.length,updated,eventIds:[...new Set(matches.flatMap(m=>m.events.map(e=>e.id)))],status:onTime?'ON_TIME':pending?'PENDING':updated?'LATE':'MISSING',credit:pending?null:onTime?1:updated?0.5:0};
 });
}
export function disciplineScore(days:ActivityDayResult[],quality:number|null,minDays=10){
 // Today's denominator remains provisional until all deadlines have passed.
 const eligible=days.filter(d=>d.credit!==null&&d.status!=='PENDING');
 const expected=eligible.reduce((s,d)=>s+d.expected,0),updated=eligible.reduce((s,d)=>s+d.updated,0);
 const timeliness=eligible.length?eligible.reduce((s,d)=>s+d.credit!,0)/eligible.length*60:null;
 const coverage=expected?updated/expected*25:null;
 const automatic=timeliness===null||coverage===null?null:timeliness+coverage;
 const total=automatic===null||quality===null?null:automatic+quality;
 return {eligibleDays:eligible.length,expected,updated,timeliness,coverage,automatic,quality,total,rating:total===null?null:1+total/25,eligible:eligible.length>=minDays};
}
export function combineActivityKpi(base:number,activity:{mode:string;eligible:boolean;rating:number|null;weight:number}):number|null {
 if(!Number.isFinite(base)||base<1||base>5)return null;
 if(activity.mode!=='ACTIVE'||!activity.eligible)return base;
 return activity.rating===null?null:base*(1-activity.weight/100)+activity.rating*activity.weight/100;
}
