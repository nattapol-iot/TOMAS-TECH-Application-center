import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTaskPlan, planDates, workloadImpact } from '../src/resource-task-math.js';
const plan={assigneeId:1,start:'2026-09-04',workDays:3,manDays:3,note:''};
test('task duration skips weekends and company holidays while effort stays independent',()=>{
  const dates=planDates(plan,new Set(['2026-09-07']));assert.deepEqual(dates,{start:'2026-09-04',end:'2026-09-09',calendarDays:6});
  const impact=workloadImpact([],plan,5,new Set(['2026-09-07']));assert.equal(impact.weeks.reduce((sum,w)=>sum+w.added,0),3);
});
test('workload distinguishes zero capacity, missing capacity, and over capacity',()=>{
  const p={...plan,start:'2026-09-07',workDays:5,manDays:2};
  assert.equal(workloadImpact([{key:'old',start:'2026-09-07',end:'2026-09-11',manDays:4}],p,5,new Set()).weeks[0]!.afterPercent,120);
  assert.equal(workloadImpact([],p,0,new Set()).overloaded,true);
  assert.equal(workloadImpact([],p,null,new Set()).needsReason,true);
  assert.equal(workloadImpact([{key:'unknown',start:null,end:null,manDays:null}],p,5,new Set()).unknown,1);
});
test('invalid fractional duration, negative effort and malformed date are rejected',()=>{
  for(const invalid of [{...plan,workDays:1.5},{...plan,manDays:-1},{...plan,start:'not-a-date'},{...plan,manDays:NaN}])assert.throws(()=>parseTaskPlan(invalid));
});
test('replacement compares actual before and after rather than dropping the old plan',()=>{
  const p={...plan,start:'2026-09-07',workDays:5,manDays:3};
  const result=workloadImpact([],p,5,new Set(),[{key:'existing',start:'2026-09-07',end:'2026-09-11',manDays:5}]);
  assert.equal(result.weeks[0]!.before,5);assert.equal(result.weeks[0]!.removed,5);assert.equal(result.weeks[0]!.after,3);
});
