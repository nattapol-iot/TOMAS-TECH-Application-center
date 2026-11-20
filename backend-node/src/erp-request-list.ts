/**
 * The Pegasus ERP's project Request List (docs/PEGASUS_ERP_REQUEST_LIST_TH.md).
 *
 * After final approval a request's lines go into the Request List of its project; Purchasing raises ERP PRs per supplier from
 * there, and the ERP answers per line. The ERP team has not confirmed the tool names or fields yet: everything that names
 * them is in this file, so a rename is a change here and nowhere else. The call itself (endpoint, headers, JSON-RPC, the
 * person's own token, error mapping) is the gateway in erp-purchasing.ts, shared with purchase_request_create.
 */
import { cut, ERP_MAX_REMARK, erpLineRemark, isPlaceholder, type ErpHeader, type ErpLine } from "./erp-purchasing.js";

/** The tools as proposed to the ERP team. `cancel` exists only if they add it (question 5 of the request). */
export const REQUEST_LIST_TOOLS = { add: "project_request_list_add", get: "project_request_list_get", cancel: "project_request_list_cancel" } as const;

/**
 * What the server does with an approved request (PEGASUS_REQUEST_LIST):
 *   off    one ERP PR through purchase_request_create, as since 2026-10-28 (the default until the ERP team's tools exist);
 *   excel  nothing is sent; the request offers "Download Excel for Request List" for the requester to upload in the ERP;
 *   tool   the lines go to the project's Request List through project_request_list_add.
 */
export type RequestListMode = "off" | "excel" | "tool";
export const REQUEST_LIST_MODES: readonly RequestListMode[] = ["off", "excel", "tool"];

export type RequestListLineStatus = "WAITING" | "IN_PR" | "ORDERED" | "CANCELLED";
const LINE_STATUSES: readonly RequestListLineStatus[] = ["WAITING", "IN_PR", "ORDERED", "CANCELLED"];

/** A line's key in the ERP: the request's external_ref and the line's place, counted from 1. It is what a status read comes back by. */
export const requestListLineRef = (externalRef: string, index: number): string => `${externalRef}-${index + 1}`;

/** What the ERP has no field for yet travels in the remark, after the usual text, as `KEY=value` pairs the ERP team can split on "; ". */
export type RequestListExtras = { drawingNo?: string | null; unitName?: string | null; material?: string | null; treatment?: string | null; attachmentUrl?: string | null };
const EXTRA_KEYS: readonly (readonly [keyof RequestListExtras, string])[] = [["drawingNo", "DWG"], ["unitName", "UNIT"], ["material", "MAT"], ["treatment", "TRT"], ["attachmentUrl", "URL"]];
export function requestListRemark(line: ErpLine, extras: RequestListExtras = {}): string {
  const pairs = EXTRA_KEYS.map(([field, key]) => { const value = (extras[field] ?? "").trim().replace(/;/g, ","); return value ? `${key}=${value}` : ""; }).filter(Boolean).join("; ");
  // Material and treatment travel as MAT= and TRT= pairs when given, so the readable remark does not say them twice.
  const said = { ...line, material: extras.material ? null : line.material ?? null, treatment: extras.treatment ? null : line.treatment ?? null };
  return cut([erpLineRemark(said), pairs].filter(Boolean).join(" · "), ERP_MAX_REMARK);
}

export type RequestListLine = ErpLine & { line_ref: string; extras?: RequestListExtras; suggested_supplier_id?: number | null };

/** Why these lines cannot go to a Request List before the ERP is asked. The list belongs to a project, so the project must have its real number. */
export function requestListProblem(header: Pick<ErpHeader, "project_no">): string | null {
  if (!header.project_no || isPlaceholder(header.project_no))
    return `This project still has the placeholder number ${header.project_no || "PJ000000"}. Give the project its ERP number (Edit project), then send the request.`;
  return null;
}

/** The project_request_list_add arguments for one approved request: the same header as an ERP PR, and each line with its line_ref. */
export function requestListAddArguments(header: ErpHeader, lines: RequestListLine[], appBaseUrl: string): Record<string, unknown> {
  const dateOnly = (value: Date | string) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return {
    external_ref: header.erp_ref,
    project_no: header.project_no,
    department: header.erp_department,
    needed_by_date: dateOnly(header.required_date),
    justification: header.purpose?.trim() || `Material for ${header.project_no} ${header.project_name} (${header.pr_no})`,
    est_cost_url: `${appBaseUrl.replace(/\/$/, "")}/#/purchase`,
    notes: `Engineering Center ${header.pr_no} · BOM ${header.bom_no}`,
    lines: lines.map((line) => ({
      line_ref: line.line_ref,
      item_description: cut(line.description || line.part_no || line.item_code || "Item", 2000),
      quantity: line.qty,
      est_unit_price: line.unit_price,
      unit: cut(line.unit || "PCS", 20),
      ...(line.part_no || line.item_code ? { part_number: cut(line.part_no || line.item_code, 100) } : {}),
      ...(line.brand ? { brand: cut(line.brand, 100) } : {}),
      remark: requestListRemark(line, line.extras),
      ...(line.suggested_supplier_id ? { suggested_supplier_id: line.suggested_supplier_id } : {}),
    })),
  };
}

export type RequestListOrder = { prNo: string | null; poNo: string | null; quantity: number | null; supplierName: string | null; url: string | null };
export type RequestListItem = { lineRef: string; itemId: number | null; status: RequestListLineStatus; statusLabel: string; orders: RequestListOrder[];
  cancelledReason: string | null; url: string | null };

const text = (value: unknown, max: number): string | null => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const count = (value: unknown): number | null => { const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN; return Number.isFinite(parsed) && parsed >= 0 ? parsed : null; };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/**
 * The lines of a project_request_list_add or project_request_list_get answer, in our own shape. A line the ERP gives no
 * line_ref for is left out (it cannot be matched); a status this app does not know reads as WAITING, with the ERP's own label
 * kept, so a new ERP status never hides a line.
 */
export function parseRequestListItems(data: unknown): RequestListItem[] {
  const items = record(data).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    const item = record(raw); const lineRef = text(item.line_ref, 120); if (!lineRef) return [];
    const known = LINE_STATUSES.find((status) => status === item.status);
    const orders = Array.isArray(item.orders) ? item.orders.map((order) => { const o = record(order);
      return { prNo: text(o.pr_no, 50), poNo: text(o.po_no, 50), quantity: count(o.quantity), supplierName: text(o.supplier_name, 300), url: text(o.url, 500) }; })
      .filter((order) => order.prNo || order.poNo) : [];
    return [{ lineRef, itemId: count(item.item_id), status: known ?? "WAITING", statusLabel: text(item.status_label, 100) ?? String(item.status ?? known ?? "WAITING").slice(0, 100),
      orders, cancelledReason: text(item.cancelled_reason, 1000), url: text(item.url, 500) }];
  });
}

/** Every line has a PO or was cancelled, and at least one was ordered: nothing is left for Purchasing to do. */
export const isFullyOrdered = (items: Pick<RequestListItem, "status">[]): boolean =>
  items.length > 0 && items.every((item) => item.status === "ORDERED" || item.status === "CANCELLED") && items.some((item) => item.status === "ORDERED");

/** Our request status once the ERP has answered for its lines: ordered when fully ordered, closed when every line was cancelled, else still approved. */
export function requestStatusFor(items: Pick<RequestListItem, "status">[], current: string): string {
  if (isFullyOrdered(items)) return "Converted to PO";
  if (items.length > 0 && items.every((item) => item.status === "CANCELLED")) return "Rejected";
  return current;
}

/** Nothing more will change for these lines, so the request is not read again. */
export const isFinalRequestList = (items: Pick<RequestListItem, "status">[]): boolean =>
  items.length > 0 && items.every((item) => item.status === "ORDERED" || item.status === "CANCELLED");
