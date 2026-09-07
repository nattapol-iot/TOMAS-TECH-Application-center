import assert from 'node:assert/strict';
import {test} from 'node:test';
import {activityDay,reportingDays,disciplineScore,combineActivityKpi,type ReportingRule,type ActivityEvent} from '../src/activity-rules.js';
const rule:ReportingRule={id:1,userId:7,projectId:2,sourceType:'Schedule Task',sourceId:3,title:'PLC',startsOn:'2026-09-01',endsOn:'2026-09-30',stoppedOn:null,weekdayMask:62,cutoffMinute:1020,rowVersion:'version'};
const event=(id:number,date:string,actorId=7,sourceId=3):ActivityEvent=>({id,actorId,projectId:2,ruleId:1,kind:'UPDATE',module:'my-work',sourceType:'Schedule Task',sourceId,summary:'Updated',occurredAt:date});
test('Bangkok day rolls over at UTC 17:00, independent of server timezone',()=>{assert.equal(activityDay(new Date('2026-09-06T17:00:00Z')),'2026-09-07');});
test('same-day on-time, late and missing scores are distinct; duplicate updates do not increase coverage',()=>{
 const days=reportingDays([rule],[event(1,'2026-09-07T09:00:00Z'),event(2,'2026-09-07T09:01:00Z'),event(3,'2026-09-08T12:00:00Z')],'2026-09-07','2026-09-09','2026-09-01',new Set(),new Set(),new Date('2026-09-10T00:00:00Z'));
 assert.deepEqual(days.map(d=>d.status),['ON_TIME','LATE','MISSING']);assert.deepEqual(days.map(d=>d.updated),[1,1,0]);
 const score=disciplineScore(days,12,3);assert.equal(score.timeliness,30);assert.ok(Math.abs(score.coverage!-50/3)<1e-8);assert.equal(score.eligible,true);
});
test('future days, tracking gaps, holidays and approved leave never become zero scores',()=>{
 const days=reportingDays([rule],[],'2026-09-01','2026-09-09','2026-09-03',new Set(['2026-09-03']),new Set(['2026-09-04']),new Date('2026-09-07T01:00:00Z'));
 assert.deepEqual(days.map(d=>d.status),['NO_DATA','NO_DATA','EXEMPT','EXEMPT','NOT_REQUIRED','NOT_REQUIRED','PENDING','NO_DATA','NO_DATA']);assert.equal(disciplineScore(days,null).automatic,null);
});
test('today stays out of the denominator until its final deadline, even after an early report',()=>{
 const days=reportingDays([rule],[event(1,'2026-09-07T02:00:00Z')],'2026-09-07','2026-09-07','2026-09-01',new Set(),new Set(),new Date('2026-09-07T03:00:00Z'));
 assert.equal(days[0]!.status,'ON_TIME');assert.equal(days[0]!.credit,null);assert.equal(disciplineScore(days,15).eligibleDays,0);
});
test('other actors, other tasks, page views and backdated reporting cannot satisfy a duty',()=>{
 const events=[event(1,'2026-09-07T02:00:00Z',8),event(2,'2026-09-07T02:00:00Z',7,4),{...event(3,'2026-09-07T02:00:00Z'),kind:'PAGE'},event(4,'2026-09-08T02:00:00Z')];
 const d=reportingDays([rule],events,'2026-09-07','2026-09-07','2026-09-01',new Set(),new Set(),new Date('2026-09-09T00:00:00Z'))[0]!;assert.equal(d.status,'MISSING');assert.equal(d.updated,0);
});
test('one update does not satisfy multiple assigned tasks; future stops preserve prior days',()=>{
 const days=reportingDays([rule,{...rule,id:2,sourceId:4,stoppedOn:'2026-09-08'}],[event(1,'2026-09-07T02:00:00Z')],'2026-09-07','2026-09-08','2026-09-01',new Set(),new Set(),new Date('2026-09-09T00:00:00Z'));
 assert.deepEqual(days.map(d=>[d.expected,d.updated]),[[2,1],[1,0]]);
});
test('trial and insufficient evidence retain the existing KPI; pending quality stays unrated',()=>{
 const base={mode:'ACTIVE',eligible:true,rating:4.4,weight:10};assert.equal(combineActivityKpi(4,base),4.04);assert.equal(combineActivityKpi(4,{...base,mode:'TRIAL'}),4);assert.equal(combineActivityKpi(4,{...base,eligible:false}),4);assert.equal(combineActivityKpi(4,{...base,rating:null}),null);assert.equal(combineActivityKpi(0,base),null);
});
