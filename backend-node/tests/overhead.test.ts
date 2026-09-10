import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { AppConfig } from "../src/config.js";
import type { Database } from "../src/db.js";
import { overheadDecimal, validateOverheadRate } from "../src/overhead.js";
import { registerOverheadPolicyRoutes } from "../src/routes/overhead-policies.js";
import type { CurrentUserService } from "../src/users.js";

const config = { businessTimeZone: "Asia/Bangkok" } as AppConfig;

test("overhead inputs accept explicit zero policy and reject ambiguous decimals", () => {
  assert.equal(overheadDecimal(0,0,999,"Budget"),0);
  assert.equal(overheadDecimal(400.25,0.0001,1_000_000,"Hours"),400.25);
  assert.throws(()=>overheadDecimal(-1,0,999,"Budget"),/between/);
  assert.throws(()=>overheadDecimal(1.23456,0,999,"Budget"),/4 decimal/);
  assert.throws(()=>overheadDecimal(Number.NaN,0,999,"Budget"),/between/);
  assert.doesNotThrow(()=>validateOverheadRate(0,400));
  assert.doesNotThrow(()=>validateOverheadRate(60_000,400));
  assert.throws(()=>validateOverheadRate(0.0001,1_000_000),/too small/);
});

test("policy writes require a manager and validate before opening a transaction", async () => {
  const app=Fastify(); let transactions=0; const permissions:string[]=[];
  const database={transaction:async()=>{transactions++;return {};}} as unknown as Database;
  const users={demandPermission:async(_request:unknown,permission:string)=>{permissions.push(permission);},required:async()=>({id:7,name:"Engineer",role:"Engineer"})} as unknown as CurrentUserService;
  registerOverheadPolicyRoutes(app,config,database,users);
  try {
    const response=await app.inject({method:"POST",url:"/api/v1/overhead-policies",payload:{monthlyBudget:60000,normalDirectHours:400,effectiveFrom:"2099-01-01",reason:"Quarterly budget"}});
    assert.equal(response.statusCode,403,response.body); assert.equal(transactions,0); assert.deepEqual(permissions,["master.write"]);
  } finally { await app.close(); }
});

test("policy writes do not accept an unstated or invalid zero-hours divisor", async () => {
  const app=Fastify(); let transactions=0;
  const database={transaction:async()=>{transactions++;return {};}} as unknown as Database;
  const users={demandPermission:async()=>{},required:async()=>({id:1,name:"Manager",role:"Engineering Manager"})} as unknown as CurrentUserService;
  registerOverheadPolicyRoutes(app,config,database,users);
  try {
    for (const normalDirectHours of [0,-1,null,"400"]) {
      const response=await app.inject({method:"POST",url:"/api/v1/overhead-policies",payload:{monthlyBudget:0,normalDirectHours,effectiveFrom:"2099-01-01",reason:"Explicit zero budget"}});
      assert.equal(response.statusCode,400,response.body);
    }
    assert.equal(transactions,0);
  } finally { await app.close(); }
});
