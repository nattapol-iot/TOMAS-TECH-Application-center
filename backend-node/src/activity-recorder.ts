import sql from 'mssql/msnodesqlv8.js';
import type { Transaction } from 'mssql';

/** Called inside the same business transaction: rollback cannot earn credit. */
export async function recordNativeActivity(tx:Transaction,actorId:number,type:string,id:number,action:string,before:unknown,after:unknown){
 const b=(before??{}) as Record<string,unknown>,a=(after??{}) as Record<string,unknown>;
 const progressKeys=['percentComplete','actualStart','actualFinish','forecastFinish','status','remark'];
 const changed=type==='Schedule Task'?progressKeys.some(k=>(b[k]??null)!==(a[k]??null)):type==='Resource Task'?(b.percentComplete!==a.percentComplete||b.status!==a.status||Boolean(a.remark)):JSON.stringify(before)!==JSON.stringify(after);
 const qualifies=changed&&((type==='Schedule Task'&&action==='Updated progress')||(type==='Resource Task'&&action==='progress')||(type==='Inquiry'&&['Qualification updated','Meeting recorded'].includes(action)));
 const q=new sql.Request(tx);q.input('actor',sql.BigInt,actorId).input('source',sql.BigInt,id);
 let projectId:number|null=null,sourceType=type.slice(0,30),sourceId=id;
 if(type==='Schedule Task')projectId=Number((await q.query<{project_id:number}>('SELECT project_id FROM dbo.schedule_tasks WHERE id=@source')).recordset[0]?.project_id)||null;
 if(type==='Resource Task'){
  const r=(await q.query<{project_id:number|null;schedule_task_id:number|null}>('SELECT project_id,schedule_task_id FROM dbo.resource_tasks WHERE id=@source')).recordset[0];projectId=r?.project_id==null?null:Number(r.project_id);
  if(r?.schedule_task_id){sourceType='Schedule Task';sourceId=Number(r.schedule_task_id);}
 }
 const safe=['Schedule Task','Resource Task'].includes(type)?Object.fromEntries(progressKeys.map(k=>[k,a[k]??null])):{action,...(qualifies?{before,after}:{})};
 const details=JSON.stringify(safe),summary=`${action} · ${sourceType} #${sourceId}`;
 await new sql.Request(tx).input('actor',sql.BigInt,actorId).input('project',sql.BigInt,projectId).input('type',sql.NVarChar(30),sourceType).input('source',sql.BigInt,sourceId)
 .input('kind',sql.NVarChar(30),qualifies?'UPDATE':'ACTION').input('module',sql.NVarChar(60),type==='Inquiry'?'inquiries':['Schedule Task','Resource Task'].includes(type)?'my-work':'activity').input('summary',sql.NVarChar(2000),summary).input('json',sql.NVarChar(sql.MAX),details)
 .query(`INSERT dbo.activity_events(actor_id,project_id,kind,module,source_type,source_id,summary,details_json)
 SELECT @actor,@project,@kind,@module,@type,@source,@summary,@json WHERE @kind<>N'UPDATE' OR NOT EXISTS(
 SELECT 1 FROM dbo.activity_events WHERE id=(SELECT MAX(id) FROM dbo.activity_events WHERE actor_id=@actor AND source_type=@type AND source_id=@source AND kind=@kind) AND details_json=@json);`);
 if(a.status==='Done'||a.state==='Closed'){
  await new sql.Request(tx).input('type',sql.NVarChar(30),sourceType).input('source',sql.BigInt,sourceId).query(`
   DECLARE @tomorrow date=DATEADD(day,1,CONVERT(date,SWITCHOFFSET(SYSDATETIMEOFFSET(),'+07:00')));
   UPDATE dbo.activity_rules SET stopped_on=CASE WHEN starts_on>@tomorrow THEN starts_on ELSE @tomorrow END
   WHERE source_type=@type AND source_id=@source AND stopped_on IS NULL AND ends_on>=@tomorrow;`);
 }
}
