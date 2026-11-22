import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ESTIMATE_LOOK_DEFAULT, ESTIMATE_LOOK_VIEWS, estimateLookKey, estimatePrimaryAction, estimateStatusCell, parseEstimateLook } from "../lib/estimate-look.ts";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("everyone starts on V1 and only an exact v2 opens the new look (owner 2026-11-19)", () => {
  assert.equal(ESTIMATE_LOOK_DEFAULT, "v1");
  for (const value of [null, undefined, "", "V2", "v3", "true", 2]) assert.equal(parseEstimateLook(value), "v1", String(value));
  assert.equal(parseEstimateLook("v2"), "v2");
  assert.equal(estimateLookKey(20), "tomas-tech-estimate-look:20");
  assert.deepEqual([...ESTIMATE_LOOK_VIEWS], ["estimates", "price", "quotations", "missing", "module-templates", "labor-packages"]);
});

test("V2 shows one filled button: the step that moves the estimate forward now", () => {
  const none = { approve: false, submit: false, exportErp: false, createRevision: false, requestRevision: false };
  assert.equal(estimatePrimaryAction(none), null);
  assert.equal(estimatePrimaryAction({ ...none, submit: true }), "submit");
  // A reviewer sees Approve and Request Revision; Approve is the filled one.
  assert.equal(estimatePrimaryAction({ ...none, approve: true, requestRevision: true }), "approve");
  // An approved estimate: sending it to the ERP comes before opening a new revision.
  assert.equal(estimatePrimaryAction({ ...none, exportErp: true, createRevision: true }), "export-erp");
  assert.equal(estimatePrimaryAction({ ...none, createRevision: true }), "create-revision");
  assert.equal(estimatePrimaryAction({ ...none, requestRevision: true }), "request-revision");
});

test("each summary cell counts what pressing it lists", () => {
  const counts = [
    { status: "Draft", count: 3, total: 300 },
    { status: "Approved", count: 2, total: 500 },
    { status: "Locked", count: 1, total: 100 },
  ];
  assert.deepEqual(estimateStatusCell(counts, "All status"), { count: 6, total: 900 });
  assert.deepEqual(estimateStatusCell(counts, "Draft"), { count: 3, total: 300 });
  // The list filters on the stored status, so Locked shows under All only.
  assert.deepEqual(estimateStatusCell(counts, "Approved"), { count: 2, total: 500 });
  assert.deepEqual(estimateStatusCell(counts, "Cancelled"), { count: 0, total: 0 });
  assert.deepEqual(estimateStatusCell([], "All status"), { count: 0, total: 0 });
});

/** Splits a selector list on the commas outside parentheses, so :is(a, b) stays whole. */
function selectorsOf(list) {
  const parts = [];
  let depth = 0,
    current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

test("the V2 stylesheet reaches no screen but the Estimating ones opened in V2", async () => {
  const css = (await source("app/system/production/estimate-v2.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((head) => !head.startsWith("@"));
  assert.ok(selectors.length > 100, "the stylesheet was read");
  const scoped = /^(\.pge\b|html\[data-est-look="v2"\]|\.est-look-|\.page:has\(> \.pge\))/;
  for (const head of selectors) for (const selector of selectorsOf(head)) assert.match(selector, scoped, selector);
});

test("the six Estimating screens carry the switch, and V1 renders as before", async () => {
  const [app, look, screens, client, route] = await Promise.all([
    source("app/system/ProductionApp.tsx"),
    source("app/system/production/EstimateLook.tsx"),
    source("app/system/production/EstimateScreens.tsx"),
    source("app/system/api-client.ts"),
    source("backend-node/src/routes/estimates.ts"),
  ]);
  for (const view of ["estimates", "price", "quotations", "missing", "module-templates", "labor-packages"]) {
    assert.match(app, new RegExp(`view === "${view}" \\? \\(?\\s*<EstimateLookScope userId=\\{bootstrap\\.user\\.id\\}>`), view);
  }
  // One element in both looks, so switching keeps the open estimate, its tab and a typed draft mounted.
  assert.match(look, /<div className=\{look === "v2" \? "pge" : "est-look-v1"\} data-est-look=\{look\}>\{bar\}\{children\}<\/div>/);
  assert.match(look, /data-guide="estimate\.look"/);
  assert.match(look, /data-guide="estimate\.lookV2"/);
  // V1 keeps its status tabs, its status column after the cost and its open arrow.
  assert.match(screens, /\{v2 \? null : <div className="tabs est-status-tabs" role="tablist"/);
  assert.match(screens, /\{v2 \? null : statusCell\}/);
  assert.match(screens, /\{v2 \? null : <td><button className="row-action"/);
  // V1 keeps its header: the V2 header is the other branch of the same condition.
  assert.match(screens, /\{v2 \? <EstimateHeaderV2[\s\S]*?\/> : <>\s*<header className="est-head">/);
  // The guide marks of the workflow buttons exist in both looks.
  assert.match(screens, /guide: "estimate\.approve"/);
  assert.match(screens, /guide: "estimate\.submit"/);
  assert.match(screens, /data-guide="estimate\.approve"/);
  assert.match(screens, /data-guide="estimate\.submit"/);
  // Only V2 asks the API for the status summary; V1's request is unchanged.
  assert.match(screens, /summary: v2 \|\| undefined,/);
  assert.match(client, /statusSummary\?: EstimateStatusCount\[\]/);
  // The summary groups the list's own rows and filters, without the status filter.
  assert.equal(route.split("${ESTIMATE_LIST_FROM}").length - 1, 2);
  assert.match(route, /\$\{ESTIMATE_LIST_FROM\} AND \(@status IS NULL OR e\.status=@status\)\s+ORDER BY e\.updated_at DESC,e\.id DESC OFFSET @offset ROWS/);
  assert.match(route, /\$\{summary \? `SELECT e\.status,COUNT_BIG\(\*\) estimate_count,SUM\(t\.total\) total_cost \$\{ESTIMATE_LIST_FROM\} GROUP BY e\.status;` : ""\}/);
  const from = route.slice(route.indexOf("const ESTIMATE_LIST_FROM"), route.indexOf("`;", route.indexOf("const ESTIMATE_LIST_FROM")));
  assert.doesNotMatch(from, /@status/);
  assert.match(from, /e\.deleted_at IS NULL AND e\.archived_at IS NULL/);
});
