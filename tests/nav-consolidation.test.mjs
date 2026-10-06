import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Pipeline is the board mode of CRM Opportunities, not a second menu entry", async () => {
  const [shell, crm, copy] = await Promise.all([
    source("app/system/ProductionApp.tsx"),
    source("app/system/production/CrmScreens.tsx"),
    source("app/system/production/crm-copy.ts"),
  ]);
  const nav = shell.slice(shell.indexOf("const NAV"), shell.indexOf("const IS_AUTH_CONFIGURED"));
  assert.doesNotMatch(nav, /view: "crm-pipeline"/);
  // The board stays reachable: a remembered board restores, and the sidebar marks Opportunities.
  assert.match(shell, /if \(data\.permissions\.includes\("crm\.read"\)\) allowed\.push\("crm-pipeline"\);/);
  assert.match(shell, /const navView = \(view: View\): View => view === "crm-pipeline" \? "crm-opportunities" : view;/);
  assert.match(shell, /<CrmScreen [^>]*onViewChange=\{setView\}/);
  assert.match(crm, /<Tabs<CrmView> tabs=\{\[\{id:"crm-opportunities",label:"CRM\.listView"\},\{id:"crm-pipeline",label:"CRM\.boardView"\}\]\}/);
  for (const key of ["CRM.listView", "CRM.boardView"]) assert.match(copy, new RegExp(`\\["${key.replace(".", "\\.")}","[^"]+","[^"]+","[^"]+"\\]`));
});

test("CRM users keep customers in CRM; people without CRM keep the master list", async () => {
  const shell = await source("app/system/ProductionApp.tsx");
  // Purchasing, Warehouse and Inventory roles hold master.read but no crm.read, so the
  // master list must stay for them rather than disappearing for everyone.
  assert.match(shell, /\{"view":"customers","label":"Customers","icon":"users","permission":"master\.read","unlessPermission":"crm\.read"\}/);
  assert.match(shell, /&& \(!item\.unlessPermission \|\| !permissions\.includes\(item\.unlessPermission\)\)/);
  assert.match(shell, /return target === "customers" && permissions\.includes\("crm\.read"\) \? "crm-customers" : target;/);
  // The sidebar and the session restore share one rule, so a hidden entry cannot be restored.
  assert.equal((shell.match(/navItemAllowed\(item, /g) ?? []).length, 2);
});
