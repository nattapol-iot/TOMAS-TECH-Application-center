import { ApiError } from './errors.js';
import { bodyObject, parseDateOnly, requiredInteger } from './http.js';

export type TaskPlan = { assigneeId: number; start: string; workDays: number; manDays: number; note: string; scheduleVersion?: string | null };
export type Allocation = { key: string; start: string | null; end: string | null; manDays: number | null };
const DAY = 86400000;
const day = (s: string) => Date.parse(s + 'T00:00:00Z') / DAY;
const iso = (n: number) => new Date(n * DAY).toISOString().slice(0,10);
export function workDates(start: string, end: string, holidays: ReadonlySet<string>) {
  const dates: string[] = [];
  if (day(end)-day(start)>3650 || end<start) return dates;
  for(let n=day(start); n<=day(end); n++) { const d=iso(n), weekday=new Date(n*DAY).getUTCDay(); if(weekday!==0 && weekday!==6 && !holidays.has(d)) dates.push(d); }
  return dates;
}
export function planDates(plan: TaskPlan, holidays: ReadonlySet<string>) {
  const dates: string[]=[];
  for(let n=day(plan.start); dates.length<plan.workDays && n<=day(plan.start)+3650; n++) {
    const d=iso(n); if(d>'9999-12-31') break;
    if(workDates(d,d,holidays).length) dates.push(d);
  }
  if(dates.length!==plan.workDays) throw new ApiError(400,'invalid_plan','Planning interval is too long.');
  return {start:dates[0]!,end:dates.at(-1)!,calendarDays:day(dates.at(-1)!)-day(dates[0]!)+1};
}
export function parseTaskPlan(value: unknown): TaskPlan {
  const b=bodyObject(value), start=parseDateOnly(b.start,'Start')!;
  if(typeof b.manDays!=='number'||!Number.isFinite(b.manDays)||b.manDays<=0||b.manDays>10000||Math.abs(b.manDays*100-Math.round(b.manDays*100))>0.00001) throw new ApiError(400,'invalid_effort','Effort must be positive, at most 10000 man-days and two decimals.');
  return {assigneeId:requiredInteger(b.assigneeId,'Assignee',1),start,workDays:requiredInteger(b.workDays,'Working days',1,730),manDays:b.manDays,note:typeof b.note==='string'?b.note.trim().slice(0,2000):'',scheduleVersion:typeof b.scheduleVersion==='string'?b.scheduleVersion:null};
}
export function workloadImpact(items: Allocation[], plan: TaskPlan, capacity: number|null, holidays: ReadonlySet<string>, replaced: Allocation[] = []) {
  const range=planDates(plan,holidays), start=day(range.start), monday=start-((new Date(start*DAY).getUTCDay()+6)%7);
  const plannedDays=workDates(range.start,range.end,holidays);
  const entries=items.map(item=>({item,days:item.start&&item.end?workDates(item.start,item.end,holidays):[]}));
  const oldEntries=replaced.map(item=>({item,days:item.start&&item.end?workDates(item.start,item.end,holidays):[]}));
  const weeks=[];
  for(let n=monday;n<=day(range.end);n+=7) {
    const from=iso(n),to=iso(n+6);
    const before=entries.reduce((sum,{item,days})=>sum+(days.length&&item.manDays!==null?item.manDays*days.filter(d=>d>=from&&d<=to).length/days.length:0),0);
    const added=plan.manDays*plannedDays.filter(d=>d>=from&&d<=to).length/plannedDays.length;
    const available=capacity===null?null:capacity*workDates(from,to,holidays).length/5;
    const pct=(value:number)=>available===null||available===0?null:Math.round(value/available*1000)/10;
    const removed=oldEntries.reduce((sum,{item,days})=>sum+(days.length&&item.manDays!==null?item.manDays*days.filter(d=>d>=from&&d<=to).length/days.length:0),0);
    weeks.push({start:from,end:to,before:before+removed,removed,added,after:before+added,available,beforePercent:pct(before+removed),afterPercent:pct(before+added),overloaded:available!==null&&before+added>available+0.00001});
  }
  const unknown=entries.filter(e=>e.item.manDays===null||!e.days.length).length;
  return {...range,capacity,unknown,overloaded:weeks.some(w=>w.overloaded),needsReason:capacity===null||unknown>0||weeks.some(w=>w.overloaded),weeks};
}
