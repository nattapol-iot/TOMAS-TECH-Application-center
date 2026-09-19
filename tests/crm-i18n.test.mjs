import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CRM_COPY } from "../app/system/production/crm-copy.ts";

test("CRM copy provides nonempty Thai, English and Japanese for every key",()=>{
  for(const [key,labels] of Object.entries(CRM_COPY))for(const language of ["th","en","jp"]){
    assert.ok(labels[language]?.trim(),`${key}: ${language}`);
    assert.ok(!labels[language].includes("\uFFFD"),`${key}: invalid Unicode`);
  }
});

test("CRM literal UI keys, stages and follow-up statuses have translations",()=>{
  const source=readFileSync(new URL("../app/system/production/CrmScreens.tsx",import.meta.url),"utf8");
  const keys=[...source.matchAll(/t\("(CRM\.[^"]+)"\)/g)].map(match=>match[1]);
  for(const key of [...keys,...["NEW","QUALIFICATION","REQUIREMENT","ESTIMATING","PROPOSAL","NEGOTIATION","WON","LOST","ON_HOLD","Open","WaitingCustomer","WaitingInternal","WaitingSupplier","Done","Cancelled"].map(code=>`CRM.${code}`)])assert.ok(CRM_COPY[key],key);
});
