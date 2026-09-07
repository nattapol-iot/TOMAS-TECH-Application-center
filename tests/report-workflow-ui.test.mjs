import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = resolve(file); if (cache.has(file)) return cache.get(file);
  const mod = {exports:{}};cache.set(file,mod.exports);
  new Function("require","module","exports",ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name.startsWith(".")?load(resolve(dirname(file),`${name}.ts`)):require(name),mod,mod.exports);
  return mod.exports;
}
const {reportUiText} = load("app/system/production/report-ui-copy.ts");
test("report workflow and customer signing controls follow TH/EN/JP without translating customer facts",()=>{
  for(const key of ["Select approver", "Report language", "Save template", "Create customer link", "Apply my signature to the review", "Thank you. Your signature has been recorded."]) {
    assert.notEqual(reportUiText(key,"TH"),key);
    assert.notEqual(reportUiText(key,"JP"),key);
    assert.equal(reportUiText(key,"EN"),key);
  }
  const name="Example customer บริษัททดสอบ 日本";
  for(const language of ["TH","EN","JP"])assert.equal(reportUiText(name,language),name);
});
test("unsaved report guard blocks browser exit, informs app navigation and clears after save or unmount",()=>{
  const effects=[];const mod={exports:{}};
  new Function("require","module","exports",ts.transpileModule(readFileSync("app/system/production/useReportUnsavedChanges.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({useEffect:effect=>effects.push(effect)}),mod,mod.exports);
  const listeners=new Map(),states=[];const previousWindow=globalThis.window;
  globalThis.window={addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:(name,handler)=>{if(listeners.get(name)===handler)listeners.delete(name);}};
  try {
    mod.exports.useReportUnsavedChanges(true,value=>states.push(value));
    const cleanups=effects.splice(0).map(effect=>effect());
    assert.equal(states.at(-1),true);
    let prevented=false;const event={preventDefault(){prevented=true;},returnValue:null};listeners.get("beforeunload")(event);
    assert.ok(prevented);assert.equal(event.returnValue,"");
    cleanups.forEach(cleanup=>cleanup?.());assert.equal(listeners.size,0);assert.equal(states.at(-1),false);
    mod.exports.useReportUnsavedChanges(false,value=>states.push(value));
    const savedCleanups=effects.splice(0).map(effect=>effect());
    assert.equal(listeners.size,0);assert.equal(states.at(-1),false);savedCleanups.forEach(cleanup=>cleanup?.());
  } finally {globalThis.window=previousWindow;}
});
