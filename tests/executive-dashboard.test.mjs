import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64');
const modelUrl=compile(await readFile(new URL('../backend-node/src/executive-dashboard-model.ts',import.meta.url),'utf8'));
const {overdueTask,projectHealth}=await import(modelUrl);
const source=await readFile(new URL('../app/system/production/executive-metrics.ts',import.meta.url),'utf8');
const {periodRange,businessDays,teamWorkload,projectManagerOptions}=await import(compile(source.replaceAll('../../../backend-node/src/executive-dashboard-model',modelUrl)));
const project={id:1,status:'Active',due:'2026-10-01',forecast:'2026-09-30',blocked:0,overdue:0,taskCount:3,unknownSchedule:false};
const task={id:1,projectId:1,status:'In Progress',start:'2026-09-07',due:'2026-09-11',baselineDue:'2026-09-04',manDays:10,owners:[1,2]};
const data={holidays:[],team:[{id:1,name:'A',capacity:5},{id:2,name:'B',capacity:5}],efforts:[]};
test('manager filter includes unassigned role PMs, keeps assigned non-PMs and deduplicates IDs',()=>{
  const input={projects:[{managerId:1,manager:'Assigned lead',department:'Engineering'},{managerId:1,manager:'Assigned lead',department:'Engineering'},{managerId:2,manager:'PM',department:'Sales'}],projectManagers:[{id:2,name:'PM',department:'Sales'},{id:3,name:'Unassigned PM',department:'Engineering'}]};
  assert.deepEqual(projectManagerOptions(input,'').map(p=>p.id),[1,2,3]);
  assert.deepEqual(projectManagerOptions(input,'Engineering').map(p=>p.id),[1,3]);
  assert.deepEqual(projectManagerOptions(input,'Other'),[]);
  assert.equal(input.projects.filter(p=>p.managerId===3).length,0,'An unassigned PM must not inherit other projects');
});
test('period-to-date comparisons use equal inclusive lengths across year boundaries',()=>{
  assert.deepEqual(periodRange('2026-01-02','week'),{start:'2025-12-29',end:'2026-01-02',previousStart:'2025-12-24',previousEnd:'2025-12-28'});
  assert.equal(periodRange('2026-09-07','quarter').start,'2026-07-01');
  assert.equal(periodRange('2026-09-07','today').previousEnd,'2026-09-06');
});
test('forecast shifts cannot hide baseline overdue work; completed work is excluded',()=>{
  assert.equal(overdueTask({...task,forecast:'2026-10-01'},'2026-09-07'),true);
  assert.equal(overdueTask({...task,status:'Done'},'2026-09-07'),false);
  assert.equal(overdueTask({...task,baselineDue:null,due:null},'2026-09-07'),false);
});
test('health is unknown for missing plans and escalates blocked or late delivery',()=>{
  assert.equal(projectHealth(project,[],'2026-09-07'),'healthy');
  assert.equal(projectHealth({...project,taskCount:0},[],'2026-09-07'),'unknown');
  assert.equal(projectHealth({...project,blocked:1},[],'2026-09-07'),'critical');
  assert.equal(projectHealth({...project,forecast:'2026-10-02'},[],'2026-09-07'),'critical');
  assert.equal(projectHealth({...project,status:'On Hold'},[],'2026-09-07'),'watch');
  assert.equal(projectHealth({...project,status:'Closed',blocked:1},[],'2026-09-07'),'closed');
});
test('material risk excludes cancelled POs and unrelated projects',()=>{
  const po={kind:'PO',projectId:1,status:'Issued',openValue:100,due:'2026-09-01',held:0};
  assert.equal(projectHealth(project,[po],'2026-09-07'),'watch');
  assert.equal(projectHealth(project,[{...po,status:'Cancelled'}],'2026-09-07'),'healthy');
  assert.equal(projectHealth(project,[{...po,projectId:2}],'2026-09-07'),'healthy');
});
test('capacity splits shared effort rather than double-counting owners',()=>{
  const result=teamWorkload(data,[task],new Set(),new Set(),'2026-09-07',4);
  assert.equal(result[0].weeks[0].assigned,5);assert.equal(result[1].weeks[0].assigned,5);
  assert.equal(result[0].weeks[1].assigned,0);assert.equal(result[0].weeks[0].overloaded,false);
});
test('holidays reduce capacity; missing and zero capacities stay distinct',()=>{
  assert.equal(businessDays('2026-09-07','2026-09-13',new Set(['2026-09-08'])).length,4);
  const result=teamWorkload({...data,holidays:['2026-09-08'],team:[{id:1,capacity:0},{id:2,capacity:null}]},[task],new Set(),new Set(),'2026-09-07',1);
  assert.equal(result[0].weeks[0].available,0);assert.equal(result[0].weeks[0].overloaded,true);
  assert.equal(result[1].weeks[0].available,null);assert.equal(result[1].weeks[0].percent,null);
});
test('done work and filtered-out inquiry efforts cannot inflate workload',()=>{
  const efforts=[{kind:'Inquiry',id:9,ownerId:1,start:task.start,end:task.due,manDays:4}];
  assert.equal(teamWorkload({...data,efforts},[{...task,status:'Done'}],new Set(),new Set(),'2026-09-07',1)[0].weeks[0].assigned,0);
  assert.equal(teamWorkload({...data,efforts},[],new Set([9]),new Set(),'2026-09-07',1)[0].weeks[0].assigned,4);
});
test('missing and invalid plan dates remain unknown instead of showing fake allocation',()=>{
  const result=teamWorkload(data,[{...task,start:null}],new Set(),new Set(),'2026-09-07',1);
  assert.equal(result[0].unknown,1);assert.equal(result[0].weeks[0].assigned,0);
  assert.deepEqual(businessDays('bad','2026-09-07',new Set()),[]);
});
