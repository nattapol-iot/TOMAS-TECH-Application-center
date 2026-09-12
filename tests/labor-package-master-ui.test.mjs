import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as master from "../lib/labor-package-master.ts";
import { LABOR_PACKAGE_COPY } from "../app/system/production/labor-package-copy.ts";

const code = ts.transpileModule(readFileSync(new URL("../app/system/production/LaborPackageMaster.tsx", import.meta.url), "utf8"), {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const fixture = status => ({id:7,code:"LP-SOFTWARE",name:"Software development",description:"Reusable software activities",status,revision:3,costType:"Engineering",department:"Software",projectType:"Machine",rowVersion:"CURRENT",lineCount:1,lines:[{activity:"Program PLC",department:"Software",level:"Engineer",provider:"Internal",costType:"Engineering",rateId:4,rateBasis:"Hourly",defaultEngineers:2,defaultHours:8,defaultManDays:1,defaultHoursPerDay:8,referenceDailyRate:1000,defaultErpCategory:"Service",remark:"Preserve"}]});
const find = (node,predicate) => { if(Array.isArray(node))return node.map(n=>find(n,predicate)).find(Boolean);if(!node||typeof node!=="object")return undefined;return predicate(node)?node:find(node.props?.children,predicate); };
const textOf = n => Array.isArray(n)?n.map(textOf).join(" "):typeof n==="string"||typeof n==="number"?String(n):n&&typeof n==="object"?textOf(n.props?.children):"";
const button = (tree,label) => find(tree,n=>n.type==="button"&&textOf(n).trim()===label);

function harness({status="Active",permissions=["estimate.write","master.write"],lang="EN",empty=false}={}) {
  const state=[],effects=[],timers=new Map(),calls=[];let cursor=0,timerId=0,current=fixture(status),tree;
  const memo=(fn,deps)=>{const i=cursor++;if(!state[i]||deps.some((d,j)=>!Object.is(d,state[i].deps[j])))state[i]={value:fn(),deps};return state[i].value;};
  const react={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==="function"?initial():initial;return [state[i],v=>{state[i]=typeof v==="function"?v(state[i]):v;}];},useRef(initial){const i=cursor++;return state[i]??=( {current:initial} );},useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useEffect(fn,deps){const i=cursor++;if(!state[i]||deps.some((d,j)=>!Object.is(d,state[i].deps[j]))){state[i]?.cleanup?.();state[i]={deps};effects.push(()=>{state[i].cleanup=fn();});}}};
  class ApiClientError extends Error {}
  const modules={react,"react/jsx-runtime":{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:"Fragment"},"../api-client":{ApiClientError,listLaborPackages:async query=>{calls.push(["list",query]);return {items:empty?[]:[current],total:empty?0:1};},loadLaborPackage:async()=>structuredClone(current),updateLaborPackage:async(id,input)=>{calls.push(["update",id,input]);current={...current,...input,rowVersion:"NEXT"};},createLaborPackage:async input=>{calls.push(["create",input]);current={...current,...input,id:8};return current;},installStandardLaborLibrary:async()=>{calls.push(["install"]);return {createdLabor:["LP-1"],skippedLabor:[],createdSupport:["MT-1"],skippedSupport:[],laborPackages:11,supportTemplates:8,source:"Excel",sourceDate:"2026-09-10"};}},"../../../lib/labor-package-master":master,"../i18n":{useLanguage:()=>({lang})},"./labor-package-copy":{LABOR_PACKAGE_COPY},"./labor-package-master.css":{}};
  const exports={};new Function("require","exports",code)(name=>modules[name]??new Proxy({},{get:(_,key)=>String(key)}),exports);
  const previous=globalThis.window;globalThis.window={confirm:()=>true,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),addEventListener:()=>{},removeEventListener:()=>{}};
  const render=()=>{cursor=0;tree=exports.LaborPackageMaster({bootstrap:{permissions}});return tree;};
  return {calls,render,tree:()=>tree,async flush(){for(let i=0;i<6;i++){render();effects.splice(0).forEach(fn=>fn());const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));}return render();},cleanup(){state.forEach(s=>s?.cleanup?.());globalThis.window=previous;}};
}

test("first package opens automatically with name-first cards and a read-only published view",async()=>{
  const h=harness();try{const tree=await h.flush();assert.ok(find(tree,n=>n.type==="Panel"&&n.props.title==="Software development"));assert.ok(button(tree,"Create draft copy"));assert.equal(button(tree,"Publish for team"),undefined);assert.equal(find(tree,n=>n.type==="Pagination"),undefined);assert.ok(textOf(tree).includes("Ready to use"));}finally{h.cleanup();}
});
test("draft saves preserve concurrency token, rate defaults and publish authorization",async()=>{
  const h=harness({status:"Draft",permissions:["estimate.write"]});try{let tree=await h.flush();assert.equal(button(tree,"Publish for team"),undefined);button(tree,"Save draft").props.onClick();await h.flush();const call=h.calls.find(c=>c[0]==="update");assert.equal(call[2].rowVersion,"CURRENT");assert.equal(call[2].lines[0].rateId,4);assert.equal(call[2].lines[0].remark,"Preserve");assert.equal(call[2].status,"Draft");}finally{h.cleanup();}
});
test("copy creates a new draft and does not update the published original",async()=>{
  const h=harness();try{button(await h.flush(),"Create draft copy").props.onClick();const tree=await h.flush();assert.equal(button(tree,"Publish for team"),undefined);button(tree,"Save draft").props.onClick();await h.flush();assert.equal(h.calls.some(c=>c[0]==="update"),false);assert.equal(h.calls.find(c=>c[0]==="create")[1].status,"Draft");assert.equal(h.calls.find(c=>c[0]==="create")[1].code,"LP-SOFTWARE-COPY");}finally{h.cleanup();}
});
test("view-only users cannot copy, save or publish and status filters reach the list API",async()=>{
  const h=harness({permissions:[]});try{let tree=await h.flush();for(const name of ["Create draft copy","Save draft","Publish for team"])assert.equal(button(tree,name),undefined);button(tree,"Draft").props.onClick();await h.flush();assert.equal(h.calls.filter(c=>c[0]==="list").at(-1)[1].status,"Draft");}finally{h.cleanup();}
});
test("empty library gives creation guidance and localized copy is complete",async()=>{
  const h=harness({empty:true,lang:"TH"});try{const tree=await h.flush();assert.ok(find(tree,n=>n.type==="EmptyState"&&n.props.title==="ยังไม่มีชุดค่าแรง"));for(const row of Object.values(LABOR_PACKAGE_COPY)){assert.ok(row.th);assert.ok(row.jp);}}finally{h.cleanup();}
});

test("publish is available only to authorized draft editors and saves Active with rowVersion",async()=>{
  const h=harness({status:"Draft"});try{button(await h.flush(),"Publish for team").props.onClick();await h.flush();const call=h.calls.find(c=>c[0]==="update");assert.equal(call[2].status,"Active");assert.equal(call[2].rowVersion,"CURRENT");}finally{h.cleanup();}
});

test("authorized master editor can install the idempotent standard library",async()=>{
  const h=harness();try{let tree=await h.flush();const page=find(tree,n=>n.type==="PageHeader");button(page.props.actions,"Install standard library").props.onClick();tree=await h.flush();assert.equal(h.calls.filter(c=>c[0]==="install").length,0);button(tree,"Install 19 masters").props.onClick();await h.flush();assert.equal(h.calls.filter(c=>c[0]==="install").length,1);assert.ok(textOf(h.tree()).includes("1 labor packages, 1 support-cost templates"));}finally{h.cleanup();}
});

test("declining copy cancellation preserves unsaved copy",async()=>{
  const h=harness();try{button(await h.flush(),"Create draft copy").props.onClick();const tree=await h.flush();globalThis.window.confirm=()=>false;button(tree,"Cancel copy").props.onClick();await h.flush();assert.ok(button(h.tree(),"Save draft"));assert.equal(h.calls.some(c=>c[0]==="create"),false);}finally{h.cleanup();}
});
