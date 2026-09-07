import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import Fastify from "fastify";
import { Database } from "../src/db.js";
import { CurrentUserService } from "../src/users.js";
import { registerExecutiveDashboardRoutes } from "../src/routes/executive-dashboard.js";
import { DASHBOARD_ROLES, type ExecutiveData } from "../src/executive-dashboard-model.js";
import type { CurrentUser } from "../src/types.js";

// Read-only validation of the new route against the saved Team Test database.
// No listener, migrations, fixtures, or changes to business records.
const db = new Database({connectionString:process.env.DASHBOARD_CHECK_CONNECTION!,trustServerCertificate:true,
  ...(process.env.DASHBOARD_CHECK_ROLE && process.env.DASHBOARD_CHECK_PASSWORD?{applicationRoleName:process.env.DASHBOARD_CHECK_ROLE,applicationRolePassword:process.env.DASHBOARD_CHECK_PASSWORD}: {})});
const app=Fastify({logger:false});
let actor:CurrentUser;
const users=new CurrentUserService(db);
users.required=async()=>actor;
registerExecutiveDashboardRoutes(app,db,users);
let checks=0;
try {
  const people=(await db.query<CurrentUser>(`SELECT u.id,u.name,u.email,u.department,r.code role,u.entra_object_id entraObjectId,u.is_active isActive FROM dbo.users u JOIN dbo.roles r ON r.id=u.role_id WHERE u.is_active=1 AND u.deleted_at IS NULL`)).recordset;
  const baseline=new Map<string,ExecutiveData>();
  for(const person of [...people].sort((a,b)=>Number(b.role==='Admin')-Number(a.role==='Admin'))) {
    actor={...person,id:Number(person.id)};
    const liveOrigin=process.env.DASHBOARD_CHECK_ORIGIN;
    const live=liveOrigin?await fetch(`${liveOrigin}/api/v1/dashboard/management`,{headers:{'X-Team-Test-Email':actor.email,'X-Team-Test-Code':createHmac('sha256',process.env.DASHBOARD_CHECK_SIGNING_KEY!).update(actor.email.toLowerCase()).digest('base64url')},signal:AbortSignal.timeout(30000)}):null;
    const liveBody=live?await live.text():'';
    const response=live?{statusCode:live.status,body:liveBody,json:<T>()=>JSON.parse(liveBody) as T}:await app.inject({method:'GET',url:'/api/v1/dashboard/management'});
    const eligible=DASHBOARD_ROLES.includes(actor.role);
    assert.equal(response.statusCode,eligible?200:403,`Dashboard ${actor.role}: ${response.body}`);
    checks++;
    if(!eligible)continue;
    const data=response.json<ExecutiveData>();
    assert.match(data.today,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Set(data.projects.map(p=>p.id)).size,data.projects.length);
    const expectedManagers=people.filter(p=>p.role==='Project Manager'&&(data.mode==='executive'||Number(p.id)===actor.id||(['Engineering Manager','Sales Manager'].includes(actor.role)&&actor.department.trim()!==''&&p.department===actor.department.trim())||data.projects.some(project=>project.managerId===Number(p.id))));
    assert.deepEqual(data.projectManagers.map(p=>p.id).sort((a,b)=>a-b),expectedManagers.map(p=>Number(p.id)).sort((a,b)=>a-b),'Master PM filter must match active role users within reporting scope');
    assert.equal(new Set(data.tasks.map(t=>t.id)).size,data.tasks.length);
    assert.ok(data.tasks.every(t=>t.projectId?data.projects.some(p=>p.id===t.projectId):data.inquiries.some(i=>i.id===t.inquiryId)));
    assert.ok(data.procurement.every(p=>data.projects.some(x=>x.id===p.projectId)));
    const company=baseline.get('company');
    if(data.mode==='executive')baseline.set('company',data);
    else if(company)assert.ok(data.projects.every(p=>company.projects.some(x=>x.id===p.id)));
    if(actor.role==='Project Manager') {
      const allowed=(await db.query<{id:number}>(`SELECT id FROM dbo.projects WHERE deleted_at IS NULL AND (manager_id=${actor.id} OR lead_engineer_id=${actor.id})`)).recordset;
      assert.ok(data.projects.every(p=>allowed.some(a=>Number(a.id)===p.id)),'PM scope leaked an unrelated project');
    }
    if(!baseline.has(actor.role))console.log(JSON.stringify({role:actor.role,mode:data.mode,projects:data.projects.length,roleProjectManagers:data.projectManagers.length,inquiries:data.inquiries.length,tasks:data.tasks.length,procurement:data.procurement.length,warnings:data.warnings.length}));
    baseline.set(actor.role,data);
  }
  assert.ok(baseline.size>0,'No eligible dashboard users were tested');
  console.log(JSON.stringify({status:'PASSED',checks,roles:[...baseline.keys()].filter(k=>k!=='company')}));
} finally {await app.close();await db.close();}
