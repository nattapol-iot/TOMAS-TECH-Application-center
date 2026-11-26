import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Pipeline is the board mode of CRM Opportunities, not a second menu entry", async () => {
  const [shell, crm, copy] = await Promise.all([source("app/system/ProductionApp.tsx"), source("app/system/tomas-ui/CrmPages.tsx"), source("app/system/production/crm-copy.ts")]);
  const nav = shell.slice(shell.indexOf("const NAV"), shell.indexOf("const IS_AUTH_CONFIGURED"));
  assert.doesNotMatch(nav, /view: "crm-pipeline"/);
  // The board stays reachable: a remembered board restores, and the sidebar marks Opportunities.
  assert.match(shell, /if \(data\.permissions\.includes\("crm\.read"\)\) allowed\.push\("crm-pipeline"\);/);
  assert.match(shell, /const navView = \(view: View\): View => \(?view === "crm-pipeline" \? "crm-opportunities" :/);
  assert.match(shell, /<CrmScreen\s[^>]*onViewChange=\{setView\}/);
  // The list and the board are two tabs of one page (CrmPages.tsx), each marked with its view for a guide step.
  assert.match(crm, /\(\["crm-opportunities", "crm-pipeline"\] as const\)\.map\(\(id\) => \(/);
  assert.match(crm, /role="tab"\s+data-tab=\{id\}\s+aria-selected=\{view === id\}\s+onClick=\{\(\) => props\.onViewChange\?\.\(id\)\}/);
  assert.match(crm, /t\(id === "crm-opportunities" \? "CRM\.listView" : "CRM\.boardView"\)/);
  for (const key of ["CRM.listView", "CRM.boardView"]) assert.match(copy, new RegExp(`\\[\\s*"${key.replace(".", "\\.")}",\\s*"[^"]+",\\s*"[^"]+",\\s*"[^"]+",?\\s*\\]`));
});

test("CRM users keep customers in CRM; people without CRM keep the master list", async () => {
  const shell = await source("app/system/ProductionApp.tsx");
  // Purchasing, Warehouse and Inventory roles hold master.read but no crm.read, so the
  // master list must stay for them rather than disappearing for everyone.
  assert.match(shell, /\{ view: "customers", label: "Customers", icon: "users", permission: "master\.read", unlessPermission: "crm\.read" \}/);
  assert.match(shell, /\(!item\.unlessPermission \|\| !permissions\.includes\(item\.unlessPermission\)\)/);
  assert.match(shell, /return target === "customers" && permissions\.includes\("crm\.read"\) \? "crm-customers" : target;/);
  // The sidebar and the session restore share one rule, so a hidden entry cannot be restored.
  assert.equal((shell.match(/navItemAllowed\(item, /g) ?? []).length, 2);
});
