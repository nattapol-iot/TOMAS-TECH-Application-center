// The Pegasus ERP's purchasing tools over its MCP endpoint (JSON-RPC tools/call), called with the person's own TMT ID access token.
// See the ERP team's PURCHASE-REQUEST-MCP-TH.md. Everything here is pure except PegasusMcp.call and createErpGateway.
import { randomUUID } from "node:crypto";
import type { TokenSource } from "./tmt-id/token-vault.js";

export const ERP_AUDIENCE = "pegasus-erp-mcp";
export const ERP_REF_PREFIX = "ENGAPP-PR-";
export const ERP_DEFAULT_URL = "https://pegasus-erp.tomastc.com/mcp";
export type ErpStatus = "QUOTES_PENDING" | "PENDING_MANAGER" | "APPROVED" | "CONVERTED" | "REJECTED" | "CANCELLED";
export type ErpFailure = { ok: false; kind: "signed_out" | "unauthorized" | "unavailable" | "validation" | "denied" | "not_found" | "ref_deleted" | "error";
  message: string; errors?: Record<string, string[]>; code?: string };
export type ErpResult<T> = { ok: true; data: T } | ErpFailure;
export type ErpRequest = { pr_id: number; pr_no: string; external_ref: string; status: ErpStatus; status_label: string; revision_no: number;
  requester: { employee_id: number; name: string | null }; rejection_reason: string | null; po_no: string | null; url: string };
export type ErpDepartment = { value: string; label: string; keywords?: string };
export type ErpGateway = { call: <T>(subject: string, tool: string, args: Record<string, unknown>) => Promise<ErpResult<T>> };

export const newErpRef = () => `${ERP_REF_PREFIX}${randomUUID()}`;

const text = (value: unknown) => typeof value === "string" ? value : "";
const cut = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;

export class PegasusMcp {
  constructor(private readonly url: string, private readonly fetchImpl: typeof fetch = fetch, private readonly timeoutMs = 90_000) {}

  /** One tools/call. HTTP and JSON-RPC failures become an ErpFailure; nothing here retries. */
  async call<T>(accessToken: string, tool: string, args: Record<string, unknown>): Promise<ErpResult<T>> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, { method: "POST", signal: controller.signal, headers: {
        Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json",
        // Cloudflare in front of the ERP blocks default HTTP-library agents.
        "User-Agent": "TOMAS-Engineering-Center/1.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: tool, arguments: args } }) });
    } catch { return { ok: false, kind: "unavailable", message: "The ERP could not be reached. Try again shortly." }; }
    finally { clearTimeout(timer); }
    if (response.status === 401) return { ok: false, kind: "unauthorized", message: "The ERP did not accept your TMT ID sign-in. Sign in again, or ask the ERP team to check your employee record." };
    if (response.status === 413) return { ok: false, kind: "error", message: "The requisition is too large for the ERP." };
    if (response.status !== 200) return { ok: false, kind: "unavailable", message: `The ERP is not available right now (HTTP ${response.status}). Try again shortly.` };
    let body: { error?: { message?: string }; result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: Array<{ text?: string }> } };
    try { body = await response.json() as typeof body; } catch { return { ok: false, kind: "unavailable", message: "The ERP answered with something that is not JSON." }; }
    if (body.error) return { ok: false, kind: "error", message: text(body.error.message) || "The ERP refused the call." };
    const result = body.result ?? {};
    const content = result.structuredContent ?? {};
    if (!result.isError) return { ok: true, data: content as T };
    const message = text(content.message) || text(result.content?.[0]?.text) || "The ERP refused the call.";
    if (content.errors && typeof content.errors === "object") return { ok: false, kind: "validation", message, errors: content.errors as Record<string, string[]> };
    const code = text(content.code);
    const kind = code === "access_denied" ? "denied" : code === "not_found" ? "not_found" : code === "ref_deleted" ? "ref_deleted" : "error";
    return { ok: false, kind, message, ...(code ? { code } : {}) };
  }
}

/** Calls as a person with their access token from the vault; on a 401 the token is refreshed once and the call tried again. */
export function createErpGateway(client: PegasusMcp, tokens: TokenSource): ErpGateway {
  const signedOut: ErpFailure = { ok: false, kind: "signed_out", message: "Your TMT ID sign-in has ended, so the ERP cannot be reached for you. Sign in again, then send it." };
  return {
    async call<T>(subject: string, tool: string, args: Record<string, unknown>) {
      const token = await tokens.accessToken(subject);
      if (!token) return signedOut;
      const first = await client.call<T>(token, tool, args);
      if (first.ok || first.kind !== "unauthorized") return first;
      tokens.dropAccess(subject);
      const fresh = await tokens.accessToken(subject);
      return fresh ? client.call<T>(fresh, tool, args) : signedOut;
    },
  };
}

export type ErpHeader = { pr_no: string; erp_ref: string; erp_department: string; required_date: Date | string; purpose: string | null; project_no: string;
  project_name: string; bom_no: string };
export type ErpLine = { line_type: string; item_code: string; part_no: string; description: string; brand: string; qty: number; unit: string; unit_price: number;
  remark: string | null; budget_module: string; original_code: string | null };

const isPlaceholder = (number: string) => number.includes("0") && !/[1-9]/.test(number);
const dateOnly = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

/**
 * The purchase_request_create arguments for one approved requisition. The ERP has no modules or substitutes, so a line's
 * module and what it replaces travel in its remark; fields longer than the ERP allows are shortened, never dropped.
 */
export function erpRequestArguments(header: ErpHeader, lines: ErpLine[], appBaseUrl: string): Record<string, unknown> {
  const describe = (line: ErpLine) => [line.line_type === "Substitute" && line.original_code ? `Substitute for ${line.original_code}` : line.line_type === "Unplanned" ? "Not in the estimate" : "",
    `Module ${line.budget_module}`, line.item_code && line.item_code !== line.part_no ? `Item ${line.item_code}` : "", line.remark ?? ""].filter(Boolean).join(" · ");
  return {
    external_ref: header.erp_ref,
    department: header.erp_department,
    needed_by_date: dateOnly(header.required_date),
    justification: header.purpose?.trim() || `Material for ${header.project_no} ${header.project_name} (${header.pr_no})`,
    est_cost_url: `${appBaseUrl.replace(/\/$/, "")}/#/purchase`,
    ...(header.project_no && !isPlaceholder(header.project_no) ? { project_no: header.project_no } : {}),
    notes: `Engineering Center ${header.pr_no} · BOM ${header.bom_no}`,
    lines: lines.map((line) => ({
      item_description: cut(line.description || line.part_no || line.item_code || "Item", 2000),
      quantity: Math.min(line.qty, 1_000_000),
      est_unit_price: line.unit_price,
      unit: cut(line.unit || "PCS", 20),
      ...(line.part_no || line.item_code ? { part_number: cut(line.part_no || line.item_code, 100) } : {}),
      ...(line.brand ? { brand: cut(line.brand, 100) } : {}),
      remark: describe(line),
    })),
  };
}

/** Our requisition status once the ERP has spoken: ordered when it has a PO, closed when the ERP rejected or cancelled it. */
export function localStatusFor(status: ErpStatus, current: string): string {
  if (status === "CONVERTED") return "Converted to PO";
  if (status === "REJECTED" || status === "CANCELLED") return "Rejected";
  return current;
}

export const isFinalErpStatus = (status: string | null | undefined) => status === "CONVERTED" || status === "REJECTED" || status === "CANCELLED";

/** The ERP department for a person's department ("Application Engineer Dept." -> APPENG), matched on its label or keywords. */
export function suggestDepartment(personDepartment: string | null | undefined, departments: ErpDepartment[]): string | null {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/\bdept\.?|\bdepartment\b/g, "").replace(/[^a-z0-9ก-๙]+/g, " ").trim();
  const person = normalize(personDepartment ?? "");
  if (!person) return null;
  const exact = departments.find((item) => item.value.toLocaleLowerCase() === person.replace(/ /g, ""));
  if (exact) return exact.value;
  const scored = departments.map((item) => {
    const names = [item.label, ...(item.keywords ?? "").split(/[,;|]/)].map(normalize).filter(Boolean);
    return { value: item.value, score: Math.max(0, ...names.map((name) => name === person ? 3 : person.includes(name) || name.includes(person) ? 2 : 0)) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return scored.length && (scored.length === 1 || scored[0]!.score > scored[1]!.score) ? scored[0]!.value : null;
}

/** A short line for the person when the ERP refused the requisition's data. */
export function describeErpFailure(failure: ErpFailure): string {
  if (failure.kind !== "validation" || !failure.errors) return cut(failure.message, 500);
  return cut(`${failure.message} ${Object.entries(failure.errors).map(([field, messages]) => `${field}: ${messages.join(" ")}`).join("; ")}`, 500);
}
