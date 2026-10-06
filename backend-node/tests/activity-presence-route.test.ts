import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import sql from 'mssql';
import type {Database} from '../src/db.js';
import {registerErrorHandler} from '../src/errors.js';
import {registerActivityRoutes} from '../src/routes/activity.js';
import type {CurrentUserService} from '../src/users.js';

type Captured={statement:string;module:unknown;user:unknown;page:unknown;pageType:unknown};
const users={async demandPermission(){},async required(){return {id:7};}} as unknown as CurrentUserService;
const database=(transactions:{count:number})=>({async query(){throw new Error('Unexpected database access');},async transaction(action:(tx:object)=>Promise<unknown>){transactions.count++;return action({});}}) as unknown as Database;

async function presence(t:import('node:test').TestContext,module:string,extra:Record<string,unknown>={}){
 const captured:Captured[]=[],transactions={count:0};
 t.mock.method(sql.Request.prototype,'query',async function(this:{parameters:Record<string,{value:unknown;type:unknown}>},statement:string){
  captured.push({statement,module:this.parameters.module?.value,user:this.parameters.user?.value,page:this.parameters.page?.value,pageType:this.parameters.page?.type});
  return {recordset:[{recorded_at:new Date('2026-10-06T02:00:00Z')}]};
 });
 const app=Fastify();registerErrorHandler(app);registerActivityRoutes(app,database(transactions),users);
 try{return {response:await app.inject({method:'POST',url:'/api/v1/activity/presence',payload:{module,...extra}}),captured,transactions};}finally{await app.close();}
}

test('presence accepts every Projects and Resource Plan sub-view key and stores it as the module',async t=>{
 for(const key of ['projects-portfolio','projects-schedule','projects-punchlist','resources-tasks','resources-gantt','resources-workload','resources-items']){
  const {response,captured}=await presence(t,key);
  assert.equal(response.statusCode,200,key);assert.deepEqual(response.json(),{recordedAt:'2026-10-06T02:00:00.000Z'});
  assert.equal(captured.length,1);assert.equal(captured[0]!.module,key);assert.equal(captured[0]!.user,7);
  t.mock.restoreAll();
 }
});

test('an unknown sub-view is refused before any database access',async t=>{
 const {response,captured,transactions}=await presence(t,'projects-unknown');
 assert.equal(response.statusCode,400);assert.equal(response.json().code,'activity_validation');
 assert.equal(captured.length,0);assert.equal(transactions.count,0);
});

test('a page change inside 45 s updates the session module without touching last_at, so the next ping logs no second PAGE',async t=>{
 const {captured}=await presence(t,'projects-schedule'),sqlText=captured[0]!.statement.replace(/\s+/g,' ');
 // The module before this ping is read first; the PAGE decision below compares against it.
 const read=sqlText.indexOf('@module_before=module FROM dbo.activity_sessions'),page=sqlText.indexOf("N'PAGE',@module");
 const active=/ELSE IF DATEDIFF\(second,@last,@now\)>=45 BEGIN UPDATE dbo\.activity_sessions SET last_at=@now,module=@module WHERE id=@id;/.exec(sqlText);
 const short=/END ELSE IF @module_before IS NULL OR @module_before<>@module UPDATE dbo\.activity_sessions SET (module=@module) WHERE id=@id;/.exec(sqlText);
 assert.ok(read>=0&&active&&short,'session read, ACTIVE path and short path must all be present');
 assert.ok(read<active.index&&active.index<short.index&&short.index<page,'the short-path module update sits between the ACTIVE branch and the PAGE check');
 // Within 45 s no ACTIVE credit is earned: the short path changes the module only.
 assert.doesNotMatch(short[1]!,/last_at/);
 // The 45 s PAGE dedupe guard stays.
 assert.match(sqlText,/IF @page=1 OR \(@page IS NULL AND \(@module_before IS NULL OR @module_before<>@module\)\) BEGIN IF NOT EXISTS\(SELECT 1 FROM dbo\.activity_events WHERE actor_id=@user AND kind=N'PAGE' AND module=@module AND occurred_at>DATEADD\(second,-45,@now\)\)/);
});

/** The PAGE condition of the presence SQL, evaluated for one ping (SQL NULL is null; an UNKNOWN comparison is false). */
function pageDecision(statement:string){
 const condition=/IF (@page=1 OR [^\n]*?) BEGIN\s+IF NOT EXISTS\(SELECT 1 FROM dbo\.activity_events WHERE actor_id=@user AND kind=N'PAGE'/.exec(statement)?.[1];
 assert.ok(condition,'PAGE condition not found');
 const js=condition.replace(/@module_before IS NULL/g,'before===null').replace(/@page IS NULL/g,'page===null').replace(/@page=1/g,'page===true')
  .replace(/@module_before<>@module/g,'(before!==null&&before!==module)').replace(/ OR /g,'||').replace(/ AND /g,'&&');
 assert.doesNotMatch(js,/@/,`untranslated SQL in ${condition}`);
 return new Function('page','before','module',`return ${js};`) as (page:boolean|null,before:string|null,module:string)=>boolean;
}

test('page=true logs a PAGE whatever the session module, page=false never does, and an unflagged ping keeps the module-change rule',async t=>{
 for(const [payload,value] of [[{page:true},true],[{page:false},false],[{},null],[{page:null},null]] as const){
  const {response,captured}=await presence(t,'projects-portfolio',payload);
  assert.equal(response.statusCode,200,JSON.stringify(payload));
  assert.equal(captured[0]!.page,value,JSON.stringify(payload));assert.equal(captured[0]!.pageType,sql.Bit);
  t.mock.restoreAll();
 }
 const {captured}=await presence(t,'projects-portfolio',{page:true}),opens=pageDecision(captured[0]!.statement);
 // A window opening a page logs it even when another window already moved the shared session to that module.
 assert.equal(opens(true,'projects-portfolio','projects-portfolio'),true);
 assert.equal(opens(true,'estimates','projects-portfolio'),true);
 assert.equal(opens(true,null,'projects-portfolio'),true);
 // Interaction and visibility pings from two windows on different modules flip the session module but log no page.
 assert.equal(opens(false,'estimates','projects'),false);
 assert.equal(opens(false,null,'projects'),false);
 assert.equal(opens(false,'projects','projects'),false);
 // A client cached before the flag existed: a module change against the session is a page open.
 assert.equal(opens(null,'estimates','projects'),true);
 assert.equal(opens(null,null,'projects'),true);
 assert.equal(opens(null,'projects','projects'),false);
 // Every PAGE insert sits behind the condition and the 45 s same-module dedupe; the event table is append-only.
 const sqlText=captured[0]!.statement.replace(/\s+/g,' ');
 assert.equal(sqlText.match(/N'PAGE',@module/g)?.length,1);
 assert.doesNotMatch(sqlText,/(UPDATE|DELETE)( FROM)? dbo\.activity_events/);
});

test('a page flag that is not a boolean is refused before any database access',async t=>{
 for(const page of ['true',1,0,{}]){
  const {response,captured,transactions}=await presence(t,'projects',{page});
  assert.equal(response.statusCode,400,JSON.stringify(page));assert.equal(response.json().code,'activity_validation');
  assert.equal(captured.length,0);assert.equal(transactions.count,0);
  t.mock.restoreAll();
 }
});
