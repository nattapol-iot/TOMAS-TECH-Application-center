import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

/** String literals of a TypeScript union type alias, e.g. `type View = "a" | "b";`. */
function unionMembers(text, alias) {
  const declaration = new RegExp(`type ${alias} =([\\s\\S]*?);`).exec(text);
  assert.ok(declaration, `type ${alias} not found`);
  return [...declaration[1].matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
}

test("every navigable view is a module the presence endpoint accepts", async () => {
  const [shell, crm, route] = await Promise.all([
    source("app/system/ProductionApp.tsx"),
    source("app/system/production/CrmScreens.tsx"),
    source("backend-node/src/routes/activity.ts"),
  ]);
  // The shell reports its current view as the presence module on every navigation.
  assert.match(shell, /useActivityPresence\(bootstrap\?\.user\.id, view,/);
  const views = [...unionMembers(shell, "View"), ...unionMembers(crm, "CrmView")];
  const allowlist = /const modules=new Set\(\[([\s\S]*?)\]\);/.exec(route);
  assert.ok(allowlist, "presence module allowlist not found");
  const accepted = new Set([...allowlist[1].matchAll(/'([a-z-]+)'/g)].map((match) => match[1]));
  // A view missing here answers 400 and the client drops the error, so that page never counts.
  assert.deepEqual(views.filter((view) => !accepted.has(view)), []);
});
