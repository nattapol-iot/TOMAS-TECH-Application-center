import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const today='2026-09-07';
const member={id:7,name:'TEST member',department:'TEST team',role:'Engineer',canSignIn:true,startWorkDate:'2026-01-01'};
const meta={members:[member],selfId:7,canManage:false,canReview:false,canConfigure:false,startedAt:today+'T00:00:00Z',projects:[],cycles:[{id:1,code:'TEST cycle',name:'TEST cycle',periodStart:'2026-07-01',periodEnd:'2026-12-31',status:'OPEN',mode:'TRIAL',configured:false}]};
const overview={day:today,updatedAt:today+'T01:00:00Z',items:[{...member,day:{day:today,status:'PENDING',expected:2,updated:0},entered:true,accessVisible:true,sessions:1,firstAt:today+'T01:00:00Z',lastAt:today+'T01:00:00Z',updatedTasks:0,projectOnly:false,score:{automatic:null,total:null,eligible:false,mode:'TRIAL'}}]};
function harness(lang){let cursor=0;const states=[],effects=[];const react={...require('react'),useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(value){return react.useState(()=>({current:value}))[0];},useEffect:f=>effects.push(f),useCallback:f=>f};
 const source=readFileSync('app/system/production/TeamActivityScreen.tsx','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,moduleObject={exports:{}};
 new Function('require','module','exports',code)(name=>{
  if(name==='react')return react;if(name==='../i18n')return {useLanguage:()=>({lang}),localeFor:()=> 'en-GB',useT:()=>v=>v};
  if(name==='../ui')return {Icon:()=>null};if(name==='../api-client')return {};
  if(name==='../activity-client')return {bangkokDay:()=>today,activityRead:async path=>path==='meta'?meta:overview,activityModuleLabels:{}};
  if(name.endsWith('.css'))return {};return require(name);
 },moduleObject,moduleObject.exports);
 return {render(){cursor=0;return moduleObject.exports.TeamActivityScreen({});},async settle(){for(const effect of effects.splice(0))effect();await new Promise(resolve=>setImmediate(resolve));}};
}
function nodes(tree,result=[]){if(Array.isArray(tree))tree.forEach(n=>nodes(n,result));else if(tree?.props){result.push(tree);nodes(tree.props.children,result);}return result;}
function text(tree){return Array.isArray(tree)?tree.map(text).join(' '):tree?.props?text(tree.props.children):typeof tree==='string'||typeof tree==='number'?String(tree):'';}
test('activity table keeps its score header aligned with member cells in all three languages',async()=>{for(const lang of ['TH','EN','JP']){const h=harness(lang);h.render();await h.settle();const tree=h.render(),all=nodes(tree),rows=all.filter(n=>n.type==='tr');assert.equal(rows.length,2);const headers=nodes(rows[0]).filter(n=>n.type==='th'),cells=nodes(rows[1]).filter(n=>n.type==='td');assert.equal(headers.length,cells.length);assert.equal(headers.length,8);assert.ok(headers.some(n=>/คะแนนรอบนี้|Cycle score|期間スコア/.test(text(n))));assert.doesNotMatch(text(tree),/\?{3,}/);assert.match(text(tree),/TEST member/);}});
test('staff activity surface has no policy-publishing or quality-review controls',async()=>{const h=harness('EN');h.render();await h.settle();const copy=text(h.render());assert.doesNotMatch(copy,/Configure KPI cycle|Publish selected-cycle policy|Review quality/);assert.match(copy,/My activity/);});


function componentHarness(component,{api={},confirm=()=>true}={}){
 let cursor=0;const states=[],effects=[];
 const react={...require('react'),useState(init){const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(value){return react.useState(()=>({current:value}))[0];},useEffect:effect=>effects.push(effect),useCallback:fn=>fn};
 const source=readFileSync('app/system/production/TeamActivityScreen.tsx','utf8')+'\nexport {ReportForm,MemberDialog,QualityForm};',moduleObject={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports','window','document','HTMLElement',code)(name=>{
  if(name==='react')return react;if(name==='../i18n')return {useLanguage:()=>({lang:'EN'}),localeFor:()=> 'en-GB',useT:()=>value=>value};
  if(name==='../ui')return {Icon:()=>null};if(name==='../api-client')return {};
  if(name==='../activity-client')return {bangkokDay:()=>today,activityModuleLabels:{},...api};
  if(name.endsWith('.css'))return {};return require(name);
 },moduleObject,moduleObject.exports,{confirm},{activeElement:null},class Element{});
 return {render(props){cursor=0;return moduleObject.exports[component](props);},async settle(){for(const effect of effects.splice(0))effect();await new Promise(resolve=>setImmediate(resolve));}};
}
const reportRule={id:1,userId:7,sourceType:'Schedule Task',sourceId:1,projectId:1,title:'Task A',startsOn:'2026-09-01',endsOn:'2026-10-01',stoppedOn:null,weekdayMask:62,cutoffMinute:1020,rowVersion:'v1'};

test('activity request UUID works when LAN HTTP exposes getRandomValues without randomUUID',()=>{
 const source=readFileSync('app/system/activity-client.ts','utf8'),moduleObject={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 let calls=0;
 new Function('require','module','exports','crypto',code)(()=>({}),moduleObject,moduleObject.exports,{getRandomValues(bytes){calls++;return bytes.fill(255);}});
 const key=moduleObject.exports.activityRequestKey();assert.equal(calls,1);assert.match(key,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.equal(key,'ffffffff-ffff-4fff-bfff-ffffffffffff');
});

test('report shows request-key failures and restores save and cancel controls',async()=>{
 let writes=0;const h=componentHarness('ReportForm',{api:{activityRequestKey(){throw new Error('Random source unavailable');},activityWrite:async()=>{writes++;}}}),props={rule:reportRule,onSaved(){},onCancel(){}};
 await h.render(props).props.onSubmit({preventDefault(){}});
 const result=h.render(props);assert.match(text(result),/Random source unavailable/);assert.equal(writes,0);assert.ok(nodes(result).filter(node=>node.type==='button').every(node=>!node.props.disabled));
});

test('unchanged report retry keeps its idempotency key and a changed draft gets a new key',async()=>{
 const sent=[];let generated=0,saved=0;const h=componentHarness('ReportForm',{api:{activityRequestKey:()=>String(++generated),activityWrite:async(path,body)=>{sent.push({path,...body});if(sent.length===1)throw new Error('Connection interrupted');}}}),props={rule:reportRule,onSaved(){saved++;},onCancel(){}};
 const submit=async()=>h.render(props).props.onSubmit({preventDefault(){}});
 await submit();await submit();const fields=nodes(h.render(props)).filter(node=>node.type==='textarea');fields[0].props.onChange({target:{value:'New progress'}});await submit();
 assert.deepEqual(sent.map(row=>row.requestKey),['1','1','2']);assert.ok(sent.every(row=>row.path==='reports'&&row.ruleId===1));assert.equal(saved,2);
});

test('switching report targets preserves a declined draft and remounts an accepted replacement',async()=>{
 let discard=false;const detail={member,rules:[reportRule,{...reportRule,id:2,title:'Task B',sourceId:2}],events:[],exceptions:[],days:[],startedAt:today,full:true,score:null,sources:[]};
 const h=componentHarness('MemberDialog',{api:{activityRead:async()=>detail},confirm:()=>discard}),props={userId:7,meta,cycleId:'1',initialDay:today,onClose(){},onChanged(){}};
 h.render(props);await h.settle();const buttons=()=>nodes(h.render(props)).filter(node=>node.type==='button'&&text(node)==='Report progress');
 buttons()[0].props.onClick();let form=nodes(h.render(props)).find(node=>node.type?.name==='ReportForm');assert.equal(form.key,'1');
 buttons()[1].props.onClick();form=nodes(h.render(props)).find(node=>node.type?.name==='ReportForm');assert.equal(form.key,'1');
 discard=true;buttons()[1].props.onClick();form=nodes(h.render(props)).find(node=>node.type?.name==='ReportForm');assert.equal(form.key,'2');assert.equal(form.props.rule.title,'Task B');
 const month=()=>nodes(h.render(props)).find(node=>node.type==='input'&&node.props.type==='month');discard=false;month().props.onChange({target:{value:'2026-08'}});assert.equal(month().props.value,'2026-09');discard=true;month().props.onChange({target:{value:'2026-08'}});assert.equal(month().props.value,'2026-08');assert.equal(nodes(h.render(props)).find(node=>node.type?.name==='ReportForm'),undefined);
});

test('zero-evidence quality submission requires zero in every scoring area',async()=>{
 let submitted;const data={member,events:[],score:{cycleId:1,periodStart:'2026-07-01',periodEnd:'2026-12-31',qualityReview:null}},h=componentHarness('QualityForm',{api:{activityWrite:async(path,body)=>{submitted={path,...body};}}}),props={data,onSaved(){}};
 let tree=h.render(props);assert.equal(nodes(tree).find(node=>node.type==='button').props.disabled,true);
 for(const select of nodes(tree).filter(node=>node.type==='select'))select.props.onChange({target:{value:'0'}});
 tree=h.render(props);assert.equal(nodes(tree).find(node=>node.type==='button').props.disabled,false);
 nodes(tree).find(node=>node.type==='textarea').props.onChange({target:{value:'No updates throughout this review cycle.'}});
 await h.render(props).props.onSubmit({preventDefault(){}});assert.equal(submitted.path,'quality');assert.deepEqual(submitted.evidenceIds,[]);assert.equal(submitted.clarity+submitted.nextStep+submitted.evidence,0);assert.ok(submitted.note);
});
