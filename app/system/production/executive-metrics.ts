import type { ExecutiveData, ExecutiveTask } from "../../../backend-node/src/executive-dashboard-model";
import { shiftDay } from "../../../backend-node/src/executive-dashboard-model";

export function projectManagerOptions(data:Pick<ExecutiveData,"projects"|"projectManagers">,department:string) {
  const assigned=data.projects.map(p=>({id:p.managerId,name:p.manager,department:p.department}));
  return [...new Map([...assigned,...(data.projectManagers??[])]
    .filter(p=>!department||p.department===department).map(p=>[p.id,p])).values()]
    .sort((a,b)=>a.name.localeCompare(b.name)||a.id-b.id);
}

export function periodRange(today: string, period: string) {
  const start = period === "today" ? today : period === "week" ? shiftDay(today, -((new Date(today+"T00:00:00Z").getUTCDay()+6)%7))
    : period === "quarter" ? `${today.slice(0,4)}-${String(Math.floor((Number(today.slice(5,7))-1)/3)*3+1).padStart(2,"0")}-01` : `${today.slice(0,7)}-01`;
  const days=Math.round((Date.parse(today)-Date.parse(start))/86400000)+1;
  return {start,end:today,previousStart:shiftDay(start,-days),previousEnd:shiftDay(start,-1)};
}
export const within = (date:string|null,from:string,to:string) => !!date && date>=from && date<=to;
export function businessDays(start:string,end:string,holidays:Set<string>) {
  const count=Math.round((Date.parse(end)-Date.parse(start))/86400000);
  if(!Number.isFinite(count)||count<0||count>3650)return [];
  return Array.from({length:count+1},(_,i)=>shiftDay(start,i)).filter(d=>![0,6].includes(new Date(d+"T00:00:00Z").getUTCDay())&&!holidays.has(d));
}
/** Scoped planned effort, excluding Done work. It is not recorded attendance or total company utilization. */
export function teamWorkload(data:ExecutiveData,tasks:ExecutiveTask[],inquiryIds:Set<number>,estimateIds:Set<number>,from:string,weeks:number) {
  const holidays=new Set(data.holidays);
  const allocations=[...tasks.filter(t=>t.status!=="Done").flatMap(t=>t.owners.map(id=>({id,start:t.start,end:t.due,effort:t.manDays/t.owners.length}))),
    ...data.efforts.filter(e=>e.kind==="Inquiry"?inquiryIds.has(e.id):estimateIds.has(e.id)).map(e=>({id:e.ownerId,start:e.start,end:e.end,effort:e.manDays}))];
  const prepared=allocations.map(a=>({...a,days:a.start&&a.end?businessDays(a.start,a.end,holidays):[]}));
  return data.team.map(person=>({...person,unknown:prepared.filter(a=>a.id===person.id&&(a.effort===null||!a.days.length)).length,
    weeks:Array.from({length:weeks},(_,i)=>{const start=shiftDay(from,i*7),end=shiftDay(start,6);
      const assigned=prepared.filter(a=>a.id===person.id).reduce((sum,a)=>sum+(a.days.length&&a.effort!==null?a.effort*a.days.filter(d=>within(d,start,end)).length/a.days.length:0),0);
      const available=person.capacity===null?null:person.capacity*businessDays(start,end,holidays).length/5;
      return {start,assigned,available,percent:available===null||available===0?null:assigned/available*100,overloaded:available!==null&&assigned>available+0.00001};})}));
}
