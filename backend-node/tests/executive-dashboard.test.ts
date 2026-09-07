import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {registerExecutiveDashboardRoutes} from '../src/routes/executive-dashboard.js';
import type {Database} from '../src/db.js';
import type {CurrentUserService} from '../src/users.js';

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
