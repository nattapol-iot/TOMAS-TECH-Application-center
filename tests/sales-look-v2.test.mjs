import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { INQUIRY_STATUSES, SALES_LOOK_DEFAULT, SALES_LOOK_VIEWS, dealSummaryCells, inquiryStatusCell, parseSalesLook, salesLookKey } from "../lib/sales-look.ts";
import { estimateLookKey } from "../lib/estimate-look.ts";

// The Sales screens in two looks (owner 2026-11-21): V1 as before, V2 in the Pegasus ERP look, one switch per person.
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

test("everyone starts on V1 and the choice is kept per person, apart from the Estimating one", () => {
  assert.equal(SALES_LOOK_DEFAULT, "v1");
  for (const value of [null, undefined, "", "V2", "v3", 2]) assert.equal(parseSalesLook(value), "v1");
  assert.equal(parseSalesLook("v2"), "v2");
  assert.equal(salesLookKey(42), "tomas-tech-sales-look:42");
  assert.notEqual(salesLookKey(42), estimateLookKey(42));
});

test("every screen of the Sales menu group wears the switch", async () => {
  const shell = await read("app/system/ProductionApp.tsx");
  const group = /\{\s*group: "NavGroup\.sales",\s*items: \[([\s\S]*?)\],?\s*\},/.exec(shell)?.[1] ?? "";
  const views = [...group.matchAll(/"?view"?:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(views.length, 10, "the Sales group was read");
  // CRM is built on @tomas-tc/ui for everyone (owner 2026-11-26): its screens left the switch; the rest of the group keeps it.
  for (const view of views) assert.equal(SALES_LOOK_VIEWS.includes(view), !view.startsWith("crm-"), `${view}`);
  assert.ok(!SALES_LOOK_VIEWS.includes("crm-pipeline"), "nor the board tab of CRM Opportunities");
  assert.match(shell, /view\.startsWith\("crm-"\) && bootstrap\.permissions\.includes\("crm\.read"\) \? \(?\s*<CrmScreen\s/);
  for (const view of ["inquiries", "site-visits", "my-assignments", "visit-master", "customers"]) {
    assert.match(shell, new RegExp(`\\{view === "${view}" \\? \\(?\\s*<SalesLookScope userId=\\{bootstrap\\.user\\.id\\}>`), view);
  }
  // Customers in the System menu (master) keeps its own look.
  assert.match(shell, /\(\["master", "suppliers", "employees", "material-master", "user-accounts"\] as View\[\]\)\.includes\(view\) \? \(?\s*<ProductionMasterData\s/);
});

test("V2 is the shared Pegasus skin plus sales-v2.css, and V1 renders the screen as before", async () => {
  const scope = await read("app/system/production/SalesLook.tsx");
  assert.match(scope, /import "\.\/pegasus-skin\.css";\s+import "\.\/pegasus-screens\.css";\s+import "\.\/sales-v2\.css";/);
  assert.match(scope, /look === "v2" \? "pg-skin pg-screen sales-v2" : "sales-look-v1"/);
  assert.match(scope, /data-guide="sales\.look"/);
  assert.match(scope, /data-guide="sales\.lookV2"/);
});

test("sales-v2.css reaches only a screen opened in V2, and uses only tokens the skin defines", async () => {
  const css = withoutComments(await read("app/system/production/sales-v2.css"));
  const rules = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const heads = [...rules.matchAll(/([^{}]+)\{/g)].map((match) => match[1].trim()).filter((head) => !head.startsWith("@"));
  assert.ok(heads.length > 60, `the stylesheet was read (${heads.length} rules)`);
  for (const head of heads) {
    for (const selector of head.split(/,(?![^()]*\))/).map((part) => part.trim())) {
      // The switch itself shows in both looks; everything else is scoped to V2.
      assert.match(selector, /^(?:\.sales-v2(?:$|[\s:.])|\.sales-look-(?:v1|bar|label|switch)\b)/, selector);
    }
  }
  const shared = [
    "background",
    "foreground",
    "primary",
    "primary-fg",
    "muted",
    "muted-fg",
    "accent",
    "accent-fg",
    "destructive",
    "border",
    "input",
    "ring",
    "emerald-fg",
    "red-fg",
    "amber-fg",
    "slate-fg",
    "violet-fg",
    "pink-fg",
    "success-bg",
    "danger-bg",
    "warning-bg",
    "neutral-bg",
    "violet-bg",
    "pink-bg",
    "ease",
    "divider",
    "row-line",
    "primary-10",
    "row-hover",
    "focus",
  ];
  for (const [, name] of css.matchAll(/var\(--pg-([a-z0-9-]+)/g)) assert.ok(shared.includes(name), `--pg-${name} is not one of the skin's tokens`);
  assert.equal((css.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []).length, 0, "no fixed colours");
});

test("the deal summary bar counts open deals, each open stage, then Won and Lost, and each cell sets its filter", () => {
  const cells = dealSummaryCells(["NEW", "PROPOSAL"], { NEW: 3, PROPOSAL: 2, WON: 5, LOST: "1" }, 5);
  assert.deepEqual(cells, [
    { key: "open", stage: "", open: true, count: 5 },
    { key: "NEW", stage: "NEW", open: true, count: 3 },
    { key: "PROPOSAL", stage: "PROPOSAL", open: true, count: 2 },
    { key: "WON", stage: "WON", open: false, count: 5 },
    { key: "LOST", stage: "LOST", open: false, count: 1 },
  ]);
  assert.equal(dealSummaryCells([], {}, 0).at(-1).count, 0);
});

test("the RFQ summary bar counts what pressing a cell lists", () => {
  assert.deepEqual([...INQUIRY_STATUSES], ["New", "Estimating", "Waiting Supplier Price", "Estimate Completed", "Engineering Review", "Approved", "Cancelled"]);
  const counts = [
    { status: "New", count: 4 },
    { status: "Approved", count: 2 },
  ];
  assert.equal(inquiryStatusCell(counts, "All status"), 6);
  assert.equal(inquiryStatusCell(counts, "New"), 4);
  assert.equal(inquiryStatusCell(counts, "Cancelled"), 0);
});

test("the deal list leads with its summary bar and the RFQ V2 list lays out the Pegasus way", async () => {
  const [crm, inquiry, route, client] = await Promise.all([
    read("app/system/tomas-ui/CrmPages.tsx"),
    read("app/system/production/InquiryScreens.tsx"),
    read("backend-node/src/routes/inquiries.ts"),
    read("app/system/api-client.ts"),
  ]);
  // Deals (on @tomas-tc/ui for everyone since 2026-11-26): the summary bar heads every deal list, the stage comes first
  // after the row's edit button.
  assert.match(crm, /<SummaryBar\s+label=\{t\("CRM\.salesStage"\)\}\s+guide="crm\.summary"/);
  assert.doesNotMatch(crm, /useSalesLook/);
  const columns = /const columns: Column<CrmRecord>\[\] = \[([^]*?)\n {2}\];/.exec(crm)?.[1] ?? "";
  assert.deepEqual(
    [...columns.matchAll(/\bkey: "([a-z]+)"/g)].map((m) => m[1]),
    ["edit", "stage", "deal", "customer", "value", "owner"],
  );
  // RFQ: the counts come with the page only when V2 asks, over every filter but the status.
  assert.match(inquiry, /summary: v2 \|\| undefined,/);
  assert.match(inquiry, /data-guide="inquiry\.summary"/);
  assert.match(inquiry, /\{v2 \? null : \(?\s*<StatusLegend\s/);
  // The customer code comes with the row; the app-wide list has active customers only (closed or merged ones showed "—").
  assert.match(inquiry, /<strong>\{item\.customerCode \|\| customerItem\?\.code \|\| "—"\}<\/strong>/);
  assert.match(client, /apiRequest<PagedResult<InquirySummary> & \{ statusSummary\?: InquiryStatusCount\[\] \}>/);
  assert.match(route, /const summary = booleanQuery\(query\.summary\);/);
  assert.match(route, /\$\{listFrom\}\r?\n\s+AND \(@status IS NULL OR i\.status = @status\)/);
  assert.match(route, /\$\{summary \? `SELECT i\.status, COUNT_BIG\(\*\) AS inquiry_count \$\{listFrom\} GROUP BY i\.status;` : ""\}/);
  const listFrom = /const listFrom = `([^`]+)`/.exec(route)?.[1] ?? "";
  assert.doesNotMatch(listFrom, /@status/, "the counts ignore the status filter");
});
