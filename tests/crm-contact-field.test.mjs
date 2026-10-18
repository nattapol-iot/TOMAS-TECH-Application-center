import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CRM_COPY } from "../app/system/production/crm-copy.ts";

const screen = readFileSync(new URL("../app/system/production/CrmScreens.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/system/production/crm.css", import.meta.url), "utf8");

test("the deal's contact is searched by name, position or department, from active contacts only", () => {
  assert.match(screen, /\{key:"contactId",searchable:true,disabled:!value\.customerId,placeholder:"CRM\.searchContact",invalid:"CRM\.selectContactFromList",listLabel:"CRM\.showContacts",options:contactOptions,/);
  assert.match(screen, /filter\(r=>r\.isActive!==false&&\(!value\.siteId\|\|String\(r\.siteId\)===String\(value\.siteId\)\)\)/);
  assert.match(screen, /label:\[text\(r\.name\),text\(r\.position\)\|\|text\(r\.department\),sites\.length>1\?text\(r\.siteName\):""\]\.filter\(Boolean\)\.join\(" · "\)/);
  // The searchable select no longer says "customer" when it lists contacts.
  assert.match(screen, /input\.setCustomValidity\(raw&&!match\?t\(invalid\):""\)/);
  assert.match(screen, /aria-label=\{t\(actionLabel\?\?listLabel\)\}/);
});

test("a new contact is added in place, for people who may write contacts, and then selected", () => {
  assert.match(screen, /const canAddContact=\["intake\.write","master\.write","crm\.contact\.write"\]\.some\(code=>bootstrap\.permissions\.includes\(code\)\)/);
  assert.match(screen, /\.\.\.\(canAddContact&&value\.customerId\?\{addLabel:"CRM\.addContact",onAdd:/);
  assert.match(screen, /crmRequest<\{id:number;siteId:number\}>\(`\/api\/v1\/sales\/customers\/\$\{customerId\}\/contacts`,"POST",\{\[nameKey\]:name,position:draft\.position,email:draft\.email,phone:draft\.phone,siteId:/);
  assert.match(screen, /set\(\{\.\.\.value,contactId:contact\.id,siteId:/);
  // A name or email that already exists selects that contact instead of failing.
  assert.match(screen, /failure\.code==="duplicate_contact"/);
  assert.match(screen, /if\(match\)\{onAdded\(\{id:Number\(match\.id\),siteId:Number\(match\.siteId\)\},true\);return;\}/);
  // Enter adds the contact; it must not submit the deal form around it.
  assert.match(screen, /if\(event\.key==="Enter"\)\{event\.preventDefault\(\);add\(\);\}/);
  // Changing the customer closes a half-typed contact.
  assert.match(screen, /next\.contactId="";setAdding\(false\);setAdded\(""\);/);
  for (const name of ["crm-field-add", "crm-quick-add", "crm-quick-add-actions"]) assert.match(css, new RegExp(`\\.${name} \\{`), name);
});

test("every contact-field string has English, Thai and Japanese", () => {
  for (const key of ["CRM.searchContact", "CRM.selectContactFromList", "CRM.showContacts", "CRM.addContact", "CRM.contactNameRequired",
    "CRM.contactCheckFields", "CRM.contactAdded", "CRM.contactExisting", "CRM.newContact", "CRM.contactName"]) {
    for (const language of ["en", "th", "jp"]) assert.ok(CRM_COPY[key]?.[language]?.trim(), `${key}: ${language}`);
  }
});
