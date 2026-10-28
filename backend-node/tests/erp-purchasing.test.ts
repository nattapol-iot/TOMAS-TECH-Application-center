import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { openBound, parseVaultKeys, sealBound, sealSecret, openSecret } from "../src/credential-vault.js";
import { createErpGateway, describeErpFailure, ERP_REF_PREFIX, erpRequestArguments, isFinalErpStatus, localStatusFor, newErpRef, PegasusMcp, suggestDepartment,
  type ErpLine } from "../src/erp-purchasing.js";
import { tokenHasAudience } from "../src/tmt-id/token-vault.js";

type Seen = { url: string; init: RequestInit };
const fakeFetch = (respond: (seen: Seen) => Response | Promise<Response>, seen: Seen[] = []) =>
  (async (url: string | URL, init?: RequestInit) => { const call = { url: String(url), init: init ?? {} }; seen.push(call); return respond(call); }) as unknown as typeof fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("a tool call is one JSON-RPC tools/call with the person's bearer token and a named user agent", async () => {
  const seen: Seen[] = [];
  const client = new PegasusMcp("https://erp.test/mcp", fakeFetch(() => json({ jsonrpc: "2.0", id: 1, result: { isError: false, structuredContent: { departments: [] } } }), seen));
  assert.deepEqual(await client.call("token-1", "purchasing_options_get", {}), { ok: true, data: { departments: [] } });
  const headers = seen[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer token-1");
  assert.match(headers["User-Agent"]!, /^TOMAS-Engineering-Center/);
  assert.deepEqual(JSON.parse(String(seen[0]!.init.body)).params, { name: "purchasing_options_get", arguments: {} });
  assert.equal(JSON.parse(String(seen[0]!.init.body)).method, "tools/call");
});

test("ERP answers become failures the PR screen can act on", async () => {
  const answer = async (response: Response | (() => never)) => new PegasusMcp("https://erp.test/mcp",
    fakeFetch(() => typeof response === "function" ? response() : response)).call("t", "purchase_request_create", {});
  assert.deepEqual(await answer(json({ result: { isError: true, structuredContent: { message: "Project not found.", errors: { project_no: ["Project not found."] } } } })),
    { ok: false, kind: "validation", message: "Project not found.", errors: { project_no: ["Project not found."] } });
  assert.equal(((await answer(json({ result: { isError: true, structuredContent: { code: "ref_deleted", message: "deleted" } } }))) as { kind: string }).kind, "ref_deleted");
  assert.equal(((await answer(json({ result: { isError: true, structuredContent: { code: "access_denied", message: "Access denied." } } }))) as { kind: string }).kind, "denied");
  assert.equal(((await answer(json({ error: "Unauthorized" }, 401))) as { kind: string }).kind, "unauthorized");
  assert.equal(((await answer(new Response("<html>blocked</html>", { status: 403 }))) as { kind: string }).kind, "unavailable");
  assert.equal(((await answer(json({ message: "Too Many Attempts." }, 429))) as { kind: string }).kind, "unavailable");
  assert.equal(((await answer(new Response("not json", { status: 200 }))) as { kind: string }).kind, "unavailable");
  assert.equal(((await answer(() => { throw new Error("socket hang up"); })) as { kind: string }).kind, "unavailable");
  assert.equal(((await answer(json({ jsonrpc: "2.0", error: { code: -32601, message: "Method not found" } }))) as { kind: string }).kind, "error");
});

test("a 401 refreshes the token once and tries again; no token at all means the person must sign in", async () => {
  const tokens = ["stale", "fresh"]; let dropped = 0;
  const source = { accessToken: async () => tokens.shift() ?? null, dropAccess: () => { dropped += 1; } };
  const used: string[] = [];
  const client = new PegasusMcp("https://erp.test/mcp", fakeFetch(({ init }) => {
    const token = (init.headers as Record<string, string>).Authorization!; used.push(token);
    return token === "Bearer stale" ? json({ error: "Unauthorized" }, 401) : json({ result: { structuredContent: { ok: 1 } } });
  }));
  assert.deepEqual(await createErpGateway(client, source).call("sub-1", "whoami", {}), { ok: true, data: { ok: 1 } });
  assert.deepEqual(used, ["Bearer stale", "Bearer fresh"]); assert.equal(dropped, 1);
  const none = await createErpGateway(client, { accessToken: async () => null, dropAccess: () => {} }).call("sub-1", "whoami", {});
  assert.equal((none as { kind: string }).kind, "signed_out");
});

const line = (overrides: Partial<ErpLine> = {}): ErpLine => ({ line_type: "Planned", item_code: "PLC-01", part_no: "6ES7-1", description: "PLC controller", brand: "Siemens",
  qty: 2, unit: "pcs", unit_price: 10000, remark: null, budget_module: "Panel", original_code: "PLC-01", ...overrides });
const header = { pr_no: "PR-1", erp_ref: "ENGAPP-PR-x", erp_department: "APPENG", required_date: new Date("2099-03-01T00:00:00Z"), purpose: null,
  project_no: "PJ260172", project_name: "Line A", bom_no: "BOM-1" };

test("the ERP request carries the PR, its project and every line, shortened to the ERP's limits", () => {
  const args = erpRequestArguments(header, [line(), line({ line_type: "Substitute", part_no: "S7-1500", description: "x".repeat(2100), unit: "set-of-twenty-five-pcs", brand: "B".repeat(120) }),
    line({ line_type: "Unplanned", item_code: "", part_no: "", description: "Bracket", remark: "for site A", original_code: null })], "https://eng.test/");
  assert.equal(args.external_ref, "ENGAPP-PR-x"); assert.equal(args.department, "APPENG"); assert.equal(args.needed_by_date, "2099-03-01");
  assert.equal(args.project_no, "PJ260172"); assert.equal(args.est_cost_url, "https://eng.test/#/purchase");
  assert.match(String(args.justification), /PJ260172 Line A \(PR-1\)/);
  const [planned, substitute, unplanned] = args.lines as Array<Record<string, unknown>>;
  assert.deepEqual(planned, { item_description: "PLC controller", quantity: 2, est_unit_price: 10000, unit: "pcs", part_number: "6ES7-1", brand: "Siemens", remark: "Module Panel · Item PLC-01" });
  assert.equal(String(substitute!.item_description).length, 2000); assert.equal(String(substitute!.unit).length, 20); assert.equal(String(substitute!.brand).length, 100);
  assert.match(String(substitute!.remark), /^Substitute for PLC-01 · Module Panel/);
  assert.deepEqual([unplanned!.part_number, unplanned!.remark], [undefined, "Not in the estimate · Module Panel · for site A"]);
  // A project the ERP has not numbered yet goes without project_no.
  assert.equal("project_no" in erpRequestArguments({ ...header, project_no: "PJ000000" }, [line()], "https://eng.test"), false);
});

test("our status follows the ERP once it ordered, rejected or cancelled the PR", () => {
  assert.equal(localStatusFor("CONVERTED", "Approved"), "Converted to PO");
  assert.equal(localStatusFor("REJECTED", "Approved"), "Rejected");
  assert.equal(localStatusFor("CANCELLED", "Approved"), "Rejected");
  assert.equal(localStatusFor("PENDING_MANAGER", "Approved"), "Approved");
  assert.deepEqual(["CONVERTED", "REJECTED", "CANCELLED", "APPROVED", null].map(isFinalErpStatus), [true, true, true, false, false]);
});

test("a person's department is matched to the ERP's, and an unclear match is left to them", () => {
  const departments = [{ value: "APPENG", label: "Application Engineer", keywords: "Application Engineer" }, { value: "IOTENG", label: "IoT Engineer" },
    { value: "SYSENG", label: "System Engineer", keywords: "System Architect" }];
  assert.equal(suggestDepartment("Application Engineer Dept.", departments), "APPENG");
  assert.equal(suggestDepartment("IoT Engineer Dept.", departments), "IOTENG");
  assert.equal(suggestDepartment("System Architect & System Engineer Dept.", departments), "SYSENG");
  assert.equal(suggestDepartment("Mechanical Engineer Dept.", departments), null);
  assert.equal(suggestDepartment(null, departments), null);
});

test("refs are unique UUIDs under the app's prefix; failures read as one line", () => {
  const ref = newErpRef();
  assert.ok(ref.startsWith(ERP_REF_PREFIX)); assert.match(ref.slice(ERP_REF_PREFIX.length), /^[0-9a-f-]{36}$/); assert.notEqual(ref, newErpRef());
  assert.equal(describeErpFailure({ ok: false, kind: "validation", message: "Invalid.", errors: { department: ["Unknown department."], "lines.0.unit": ["Too long."] } }),
    "Invalid. department: Unknown department.; lines.0.unit: Too long.");
});

test("a refresh token is sealed to its subject, and site credentials still open as before", () => {
  const vault = parseVaultKeys(`1:${randomBytes(32).toString("base64")}`)!;
  const sealed = sealBound(vault, "tmt-id-refresh:alice", "refresh-token-value");
  assert.equal(openBound(vault, "tmt-id-refresh:alice", sealed), "refresh-token-value");
  assert.throws(() => openBound(vault, "tmt-id-refresh:bob", sealed));
  assert.equal(openSecret(vault, 7, sealSecret(vault, 7, "s3cret")), "s3cret");
  assert.throws(() => openSecret(vault, 8, sealSecret(vault, 7, "s3cret")));
});

test("an access token's audience is read from its payload", () => {
  const token = (payload: unknown) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
  assert.equal(tokenHasAudience(token({ aud: ["account", "pegasus-erp-mcp"] }), "pegasus-erp-mcp"), true);
  assert.equal(tokenHasAudience(token({ aud: "pegasus-erp-mcp" }), "pegasus-erp-mcp"), true);
  assert.equal(tokenHasAudience(token({ aud: "account" }), "pegasus-erp-mcp"), false);
  assert.equal(tokenHasAudience("not-a-jwt", "pegasus-erp-mcp"), false);
  assert.equal(tokenHasAudience(undefined, "pegasus-erp-mcp"), false);
});
