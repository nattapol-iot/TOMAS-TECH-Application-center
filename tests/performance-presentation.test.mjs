import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function loadPure(file){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,mod,mod.exports);return mod.exports;}
const presentation=loadPure('app/system/production/performance-presentation.ts');
const {performanceEvidenceText}=loadPure('app/system/production/performance-evidence-copy.ts');
const baseReview={id:1,employeeId:201,userId:101,name:'Authorized Sales',department:'Sales',role:'Sales Engineer',level:'Sales Engineer',frameworkCode:'SALES',areaCodes:['PIPELINE','CUSTOMER','FORECAST','COMMERCIAL','HANDOVER'],status:'NOT_STARTED',selfScores:[null,null,null,null,null],managerScores:[null,null,null,null,null],displayScores:[null,null,null,null,null],evidence:['','','','',''],selfEvidence:['','','','',''],managerEvidence:['','','','',''],selfSummary:'',managerSummary:'',developmentGoal:'',updatedAt:null,rowVersion:null};
const cycle={id:1,code:'H2 2026',name:'Review',periodStart:'2026-07-01',periodEnd:'2026-12-31',reviewDueDate:'2027-01-10',status:'OPEN',rowVersion:'AAAA'};
function harness(overview,lang='EN'){
 let cursor=0;const states=[],effects=[],cache=new Map();
 const react={...require('react'),useState(init){const n=cursor++;if(!(n in states))states[n]=typeof init==='function'?init():init;return[states[n],v=>{states[n]=typeof v==='function'?v(states[n]):v;}];},useRef(value){return react.useState(()=>({current:value}))[0];},useMemo:f=>f(),useCallback:f=>f,useEffect:f=>effects.push(f)};
 const controls={};for(const key of ['Badge','Icon','Modal','PageHeader','Progress','SearchInput','Select','Tabs'])controls[key]=Object.assign(()=>null,{displayName:key});
 const api={loadPerformanceOverview:async()=>overview,loadPerformanceEvidence:async()=>null};
 function load(file){file=resolve(file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);
 let source=readFileSync(file,'utf8');if(file.endsWith('PerformanceScreen.tsx'))source+='\nexport { AssessmentModal, MyKpi, emptyReview, WorkEvidencePanel };';
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name==='react')return react;
  if(name==='../i18n')return{useT:()=>s=>s,useLanguage:()=>({lang,t:s=>s})};
  if(name==='../ui')return controls;
  if(name==='../api-client')return api;
  if(name==='../LocalizedText')return{LocalizedText:()=>null};
  if(name.startsWith('.')){const p=resolve(dirname(file),name);return load(existsSync(p+'.ts')?p+'.ts':p+'.tsx');}
  return require(name);
 },mod,mod.exports);cache.set(file,mod.exports);return mod.exports;}
 const screen=load('app/system/production/PerformanceScreen.tsx');
 return{screen,controls,render(fn,props){cursor=0;return fn(props);},async settle(){for(const effect of effects.splice(0))effect();await Promise.resolve();await Promise.resolve();}};
}
function nodes(value,out=[]){if(Array.isArray(value)){value.forEach(x=>nodes(x,out));return out;}if(value&&typeof value==='object'&&value.props){out.push(value);nodes(value.props.children,out);}return out;}
function text(value){if(Array.isArray(value))return value.map(text).join(' ');if(value&&typeof value==='object'&&value.props)return text(value.props.children??value.props.text??'');return typeof value==='string'||typeof value==='number'?String(value):'';}
const bootstrap=[{id:55,employeeId:155,name:'Unauthorized Engineer',department:'Engineering',role:'Engineer',level:'Senior'},{id:56,employeeId:156,name:'Bootstrap Sample Sales',department:'Sales',role:'Sales Engineer',level:'Sales'}];
const props={team:bootstrap,currentUser:{id:9,employeeId:109,name:'Sales Manager',department:'Sales',role:'Sales Manager',level:'Manager'},notify:()=>{},apiBacked:true};
test('real production component renders only API-authorized people and never demo scores or identities',async()=>{
 const h=harness({assessments:[baseReview],cycles:[cycle],selectedCycle:cycle,canManage:true});h.render(h.screen.default,props);await h.settle();const tree=h.render(h.screen.default,props),copy=text(tree);
 assert.match(copy,/Authorized Sales/);assert.doesNotMatch(copy,/Unauthorized Engineer|Bootstrap Sample Sales|4\.4/);assert.match(copy,/—/);assert.doesNotMatch(copy,/0\.0/);
 const h2=harness({assessments:[],cycles:[cycle],selectedCycle:cycle,canManage:true});h2.render(h2.screen.default,props);await h2.settle();const empty=text(h2.render(h2.screen.default,props));assert.doesNotMatch(empty,/Unauthorized Engineer|Bootstrap Sample Sales|4\.4/);
});
test('demo mode still renders its own isolated team',()=>{const h=harness(null);const tree=h.render(h.screen.default,{...props,apiBacked:false});assert.match(text(tree),/Unauthorized Engineer|Bootstrap Sample Sales/);});
test('real assessment modal saves an incomplete draft while submission stays disabled',async()=>{
 const h=harness(null),member=bootstrap[1],review=h.screen.emptyReview(member),saved=[];
 const tree=h.render(h.screen.AssessmentModal,{member,review,isManager:false,workEvidence:null,onClose:()=>{},onSave:async(...args)=>saved.push(args)});
 const buttons=nodes(tree.props.footer).filter(n=>n.type==='button');assert.equal(buttons[0].props.disabled,false);assert.equal(buttons[1].props.disabled,true);assert.doesNotMatch(text(tree),/0\.0/);
 buttons[0].props.onClick();await Promise.resolve();assert.equal(saved.length,1);assert.deepEqual(saved[0][0],[0,0,0,0,0]);assert.equal(saved[0][2],false);
});
test('an independent manager assessment starts blank despite complete self-ratings',()=>{
 const h=harness(null),member=bootstrap[1],review={...h.screen.emptyReview(member),selfScores:[5,5,5,5,5],scores:[5,5,5,5,5]};
 const tree=h.render(h.screen.AssessmentModal,{member,review,isManager:true,workEvidence:null,onClose:()=>{},onSave:async()=>{}});
 assert.ok(nodes(tree).filter(n=>n.props.role==='radio').every(n=>n.props['aria-checked']===false));assert.equal(nodes(tree.props.footer).filter(n=>n.type==='button')[1].props.disabled,true);
});
test('missing and partial scores remain unrated; a complete weighted score remains correct',()=>{
 assert.equal(presentation.weightedPerformanceScore([5,0,4],[30,30,40]),0);assert.equal(presentation.performanceScoreText(0),'—');assert.equal(presentation.performanceScoreText(NaN),'—');
 assert.equal(presentation.performanceScoreText(presentation.weightedPerformanceScore([4,3,5],[30,30,40])),'4.1');
 assert.equal(presentation.canSubmitPerformanceScores([5,3],['',''],2),false);assert.equal(presentation.canSubmitPerformanceScores([5,3],['Actual project evidence',''],2),true);
});
test('cycle and update dates follow chosen language without Buddhist years in English or Japanese',()=>{
 assert.match(presentation.performanceDate('2026-09-06','EN'),/2026/);assert.match(presentation.performanceDate('2026-09-06','JP'),/2026/);assert.doesNotMatch(presentation.performanceDate('2026-09-06','JP'),/2569/);
 assert.notEqual(presentation.performanceDate('2026-09-06','TH'),presentation.performanceDate('2026-09-06','EN'));
});
test('system evidence summaries localize without translating business names or identifiers',()=>{
 for(const value of ['No completed assigned tasks were found in the selected cycle.','0 active opportunities; 0 approved; weighted recorded pipeline THB 0.','0 closed opportunities. Current probabilities are not historical forecasts; no numeric probability calibration accuracy is assigned without dated pre-outcome snapshots.','No due assigned tasks were found for H2 2026; manager context is required.']){
  assert.equal(performanceEvidenceText(value,'EN'),value);assert.notEqual(performanceEvidenceText(value,'TH'),value);assert.notEqual(performanceEvidenceText(value,'JP'),value);
 }
 const name='HOWA ลูกค้า 日本 PJ260022';for(const lang of ['TH','EN','JP'])assert.equal(performanceEvidenceText(name,lang),name);
 const h=harness(null),evidence={periodStart:'2026-07-01',periodEnd:'2026-12-31',asOf:'2026-09-06',confidence:'LOW',sources:[],frameworkCode:'SALES',metrics:{},methodology:'',areas:[]};const tree=h.render(h.screen.WorkEvidencePanel,{role:'Sales Engineer',evidence,loading:false,error:'',onRetry:()=>{},onOpenSource:()=>{}});assert.match(text(tree),/Work evidence/);assert.doesNotMatch(text(tree),/ข้อมูลผลงานจริง/);
});
test('browser-discovered KPI system labels and live evidence patterns translate while project facts stay intact',()=>{
 const labels=['Milestones, due tasks and delivery outcomes','Customer issues, rework and verification outcomes','Completed technical work and reusable solutions','Project participation, Inquiry ownership and collaboration','Assigned tasks','Assigned work','4 of 7 due tasks completed','0 completed on time · 3 overdue as of 2026-09-06','Overdue since 2026-08-27','Schedule Member · Development','Schedule Member · Closed'];
 for(const value of labels){assert.equal(performanceEvidenceText(value,'EN'),value);assert.notEqual(performanceEvidenceText(value,'TH'),value,value);assert.notEqual(performanceEvidenceText(value,'JP'),value,value);}
 const title='Real customer project PJ260022 ลูกค้า 日本';
 for(const lang of ['TH','JP'])assert.ok(performanceEvidenceText(`Overdue since 2026-08-27 · ${title}`,lang).endsWith(title));
 const h=harness(null,'JP'),evidence={periodStart:'2026-07-01',periodEnd:'2026-12-31',asOf:'2026-09-06',confidence:'LOW',sources:[{key:'TASK',label:'Assigned tasks',count:7}],frameworkCode:'ENGINEERING',metrics:{onTimeTaskCount:0,dueTaskCount:7,overdueTaskCount:3},methodology:'',areas:[{areaCode:'DELIVERY',suggestedScore:null,evidenceText:'',signals:[{id:'delivery-task-summary',sourceType:'TASK',sourceId:0,sourceLabel:'Assigned work',title:'4 of 7 due tasks completed',detail:'0 completed on time · 3 overdue as of 2026-09-06',tone:'amber'},{id:'overdue-schedule-7',sourceType:'PROJECT',sourceId:22,sourceLabel:'PJ260022',title,detail:`Overdue since 2026-08-27 · ${title}`,tone:'amber'}]}]};
 const tree=h.render(h.screen.WorkEvidencePanel,{role:'Engineer',evidence,loading:false,error:'',onRetry:()=>{},onOpenSource:()=>{}}),copy=text(tree);
 assert.doesNotMatch(copy,/Assigned tasks|Assigned work|due tasks completed|completed on time|Overdue since/);assert.match(copy,/PJ260022/);assert.ok(copy.includes(title));
});
