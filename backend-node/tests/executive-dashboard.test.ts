import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {registerExecutiveDashboardRoutes} from '../src/routes/executive-dashboard.js';
import type {Database} from '../src/db.js';
import type {CurrentUserService} from '../src/users.js';
import {overdueTask,projectHealth,type ExecutiveData} from '../src/executive-dashboard-model.js';
import {MASTER_PLAN_PHASE} from '../src/schedule-phases.js';

test('non-management roles are rejected before any business query',async()=>{
  const app=Fastify();let calls=0;
  const db={query:async()=>{calls++;throw new Error('Must not query');}} as unknown as Database;
  const users={required:async()=>({id:1,role:'Engineer',department:'Engineering',signingRoles:['Management']})} as unknown as CurrentUserService;
  registerExecutiveDashboardRoutes(app,db,users);
  try{assert.equal((await app.inject({method:'GET',url:'/api/v1/dashboard/management'})).statusCode,403);assert.equal(calls,0);}finally{await app.close();}
});
test('company reporting binds only the primary executive role; manager scopes stay server-side',async()=>{
  for(const role of ['Admin','Management','CEO','Engineering Manager','Project Manager','Sales Manager']){
    const app=Fastify(),bindings:Record<string,unknown>={};
    const db={query:async(statement:string,bind:(q:unknown)=>void)=>{
      const q={input:(key:string,_type:unknown,value:unknown)=>{bindings[key]=value;return q;}};bind(q);
      assert.match(statement,/p\.manager_id=@actor OR p\.lead_engineer_id=@actor/);
      assert.match(statement,/@department<>N''/);
      assert.match(statement,/r\.code=N'Project Manager' AND u\.is_active=1 AND u\.deleted_at IS NULL/);
      const recordsets:unknown[][]=Array.from({length:12},()=>[]);
      recordsets[11]=[{id:99,name:'Unassigned PM',department:'Engineering'}];
      return {recordsets};
    }} as unknown as Database;
    const users={required:async()=>({id:4,role,department:'  Engineering  '})} as unknown as CurrentUserService;
    registerExecutiveDashboardRoutes(app,db,users);
    try{const response=await app.inject({method:'GET',url:'/api/v1/dashboard/management'});assert.equal(response.statusCode,200);assert.equal(bindings.executive,['Admin','Management','CEO'].includes(role));assert.equal(bindings.department,'Engineering');assert.deepEqual(response.json().projects,[]);assert.deepEqual(response.json().projectManagers,[{id:99,name:'Unassigned PM',department:'Engineering'}]);}finally{await app.close();}
  }
});

// A dbo.schedule_tasks row (SELECT t.*) for the dashboard's schedule recordset.
const taskRowOf=(change:Record<string,unknown>)=>({id:1,project_id:1,parent_id:null,sort_order:1,kind:'task',name:'Task',is_milestone:false,origin:'Plan',created_by:1,visibility:'Internal',
  plan_start:'2099-01-05',plan_days:1,start_mode:'manual',predecessor_id:null,lag_days:0,pic_external:'',plan_man_days:0,baseline_start:null,baseline_end:null,baseline_days:0,baseline_rev:0,
  actual_start:null,actual_end:null,forecast_end:null,percent_done:0,status:'Not Started',blocked_reason:null,note:null,actual_man_days:0,updated_by:1,updated_at:null,row_version:Buffer.alloc(8),...change});
test('project progress, plan %, health and late / blocked counts come from the shared schedule summary',async()=>{
  const app=Fastify();let statement='';
  const project=(id:number,due:string)=>({id,inquiry_id:id,number:`P-${id}`,name:`Project ${id}`,customer_id:1,customer:'ACME',department:'Engineering',manager_id:4,manager:'PM',status:'Installation',start_date:'2020-01-01',target_delivery:due,progress:5,budget:1000});
  const recordsets:unknown[][]=Array.from({length:13},()=>[]);
  recordsets[0]=[project(1,'2099-12-31'),project(2,'2099-12-31'),project(3,'2099-12-31'),{...project(4,'2020-12-31'),status:'Closed',progress:100}];
  recordsets[3]=[
    // Project 1: one work day with 100 man-days at 0%, three work days with 1 man-day at 40%.
    // Weighted by work days that is 30%; by man-days it would be under 1%.
    taskRowOf({id:11,project_id:1,plan_start:'2099-01-05',plan_days:1,plan_man_days:100}),
    taskRowOf({id:12,project_id:1,sort_order:2,plan_start:'2099-01-06',plan_days:3,plan_man_days:1,percent_done:40,status:'In Progress',actual_start:'2099-01-06'}),
    // Project 1's Master Plan frame: a row whose plan finish passed in 2020 and that nobody marks Done.
    taskRowOf({id:15,project_id:1,kind:'phase',name:MASTER_PLAN_PHASE,plan_start:null,sort_order:3}),
    taskRowOf({id:16,project_id:1,parent_id:15,name:'FAT',plan_start:'2020-01-06',plan_days:1}),
    // Project 2: a task that should have finished in 2020, and a blocked one.
    taskRowOf({id:21,project_id:2,plan_start:'2020-01-06',plan_days:5,percent_done:20,status:'In Progress',actual_start:'2020-01-06'}),
    taskRowOf({id:22,project_id:2,sort_order:2,plan_start:'2099-01-05',plan_days:5,status:'Blocked',blocked_reason:'Waiting'}),
    // Project 3: linked to a row that no longer exists, so its schedule cannot be resolved.
    taskRowOf({id:31,project_id:3,plan_start:null,start_mode:'linked',predecessor_id:999}),
    // Project 4: closed while its task stood at 40%.
    taskRowOf({id:41,project_id:4,plan_start:'2020-01-06',plan_days:5,percent_done:40,status:'In Progress',actual_start:'2020-01-06'}),
  ];
  recordsets[4]=[{task_id:12,user_id:7},{task_id:12,user_id:8}];
  recordsets[12]=[{can_read_schedule:true}];
  // An overdue purchase order on project 1 is still listed, but it no longer makes the project unhealthy.
  recordsets[6]=[{id:5,project_id:1,number:'PO-5',kind:'PO',supplier:'S',owner:'',status:'Ordered',date:'2020-01-01',due_date:'2020-02-01',value:100,open_value:100,held:0,waiting_me:false}];
  const db={query:async(text:string,bind:(q:unknown)=>void)=>{const q={input:()=>q};bind(q);statement=text;return {recordsets};}} as unknown as Database;
  const users={required:async()=>({id:4,role:'Admin',department:'Engineering'})} as unknown as CurrentUserService;
  registerExecutiveDashboardRoutes(app,db,users);
  try{
    const data=(await app.inject({method:'GET',url:'/api/v1/dashboard/management'})).json<ExecutiveData>();
    const [first,second,broken,closed]=data.projects;
    assert.equal(first!.progress,30);assert.equal(first!.plannedProgress,0);assert.equal(first!.health,'On Track');assert.equal(projectHealth(first!),'healthy');
    assert.equal(first!.taskCount,2);assert.equal(first!.forecast,'2099-01-08');assert.equal(first!.overdue,0);
    // The Master Plan frame row stays listed for milestones and drill-down, flagged as a frame, so the
    // Overdue tasks KPI and the risk list still agree with Late = 0.
    assert.equal(data.tasks.find(t=>t.id===16)?.frame,true);
    assert.equal(overdueTask(data.tasks.find(t=>t.id===16)!,data.today),false);
    assert.equal(data.tasks.filter(t=>t.projectId===1&&t.id!==16).every(t=>t.frame===false),true,'work rows are explicitly not frames');
    assert.deepEqual(data.tasks.filter(t=>(t.projectId===1||t.projectId===2)&&overdueTask(t,data.today)).map(t=>t.id),[21],'only project 2\'s late work row is overdue');
    // A Closed project reads 100% with no plan comparison, and that is not an unknown schedule.
    assert.equal(closed!.health,'Completed');assert.equal(closed!.progress,100);assert.equal(closed!.plannedProgress,null);assert.equal(closed!.unknownSchedule,false);
    assert.equal(data.procurement.length,1);
    assert.equal(second!.health,'Delayed');assert.equal(projectHealth(second!),'critical');assert.equal(second!.overdue,1);assert.equal(second!.blocked,1);
    assert.equal(broken!.health,'No plan');assert.equal(broken!.unknownSchedule,true);assert.equal(broken!.progress,5);assert.deepEqual(data.warnings,['P-3']);
    // Every leaf is listed for the task views with its PICs, the Master Plan frame row (16) flagged as a frame.
    assert.deepEqual(data.tasks.filter(t=>t.projectId===1).map(t=>[t.id,t.manDays,t.owners,t.frame]),[[11,100,[],false],[12,1,[7,8],false],[16,0,[],true]]);
    // The unused payload fields are gone; the estimate budget stays.
    assert.equal('materialBudget' in first!,false);assert.equal(first!.budget,1000);
    assert.doesNotMatch(statement,/material_budget|material_total|project_probability/);
    assert.match(statement,/THEN totals\.total END budget/);assert.match(statement,/LEFT JOIN dbo\.v_estimate_totals totals ON totals\.estimate_id=p\.estimate_id/);
  }finally{await app.close();}
});
test('a dashboard user without schedule.read still gets every project measured, but no task detail',async()=>{
  const app=Fastify();let statement='';
  const recordsets:unknown[][]=Array.from({length:13},()=>[]);
  // Past its 2020 target with an open task and a blocked one.
  recordsets[0]=[{id:1,inquiry_id:1,number:'P-25-031',name:'Line 1',customer_id:1,customer:'ACME',department:'Sales',manager_id:9,manager:'PM',status:'Installation',start_date:'2020-01-01',target_delivery:'2020-12-31',progress:5,budget:null}];
  recordsets[3]=[
    taskRowOf({id:11,project_id:1,plan_start:'2020-01-06',plan_days:5,percent_done:20,status:'In Progress',actual_start:'2020-01-06'}),
    taskRowOf({id:12,project_id:1,sort_order:2,plan_start:'2099-01-05',plan_days:5,status:'Blocked',blocked_reason:'Waiting'}),
  ];
  recordsets[4]=[{task_id:11,user_id:7}];
  recordsets[12]=[{can_read_schedule:false}];
  const db={query:async(text:string,bind:(q:unknown)=>void)=>{const q={input:()=>q};bind(q);statement=text;return {recordsets};}} as unknown as Database;
  // Sales Manager is a dashboard role granted project.read but not schedule.read (migration 016).
  const users={required:async()=>({id:4,role:'Sales Manager',department:'Sales'})} as unknown as CurrentUserService;
  registerExecutiveDashboardRoutes(app,db,users);
  try{
    const data=(await app.inject({method:'GET',url:'/api/v1/dashboard/management'})).json<ExecutiveData>();
    const [only]=data.projects;
    assert.equal(only!.health,'Delayed');assert.equal(projectHealth(only!),'critical');
    assert.equal(only!.overdue,1);assert.equal(only!.blocked,1);assert.equal(only!.taskCount,2);assert.equal(only!.progress,10);
    assert.deepEqual(data.tasks,[]);
    // The schedule rows are read for every project in scope; only the detail depends on the permission flag.
    assert.match(statement,/SELECT t\.\* FROM dbo\.schedule_tasks t JOIN @projects p ON p\.id=t\.project_id WHERE t\.deleted_at IS NULL;/);
    assert.match(statement,/THEN 1 ELSE 0 END AS bit\) can_read_schedule;\s*$/);
  }finally{await app.close();}
});
