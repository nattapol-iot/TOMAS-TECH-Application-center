// Approved estimates to the Pegasus ERP as Cost Sheets (cost_estimate_submit, cost_estimate_get), called with the person's own
// TMT ID access token. The ERP team's answer to docs/PEGASUS_ERP_ESTIMATE_COST_TH.md: the field names are the ones proposed
// there, the ERP keeps only the latest revision on one Cost Sheet, and a sheet arrives already approved. Everything here is pure.
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { isPlaceholder, type ErpGateway } from "./erp-purchasing.js";
import { ERP_CATEGORIES, ERP_SOURCE_TYPES } from "./estimate-erp.js";

export const ERP_ESTIMATE_REF_PREFIX = "ENGAPP-EST-";
/** The most cost lines the ERP takes in one call. */
export const ERP_MAX_COST_LINES = 2000;
export type EstimateErpLink = { gateway: ErpGateway; appBaseUrl: string };

/** One reference per estimate, kept for every revision and every retry. */
export const newEstimateErpRef = () => `${ERP_ESTIMATE_REF_PREFIX}${randomUUID()}`;

export type CostEstimateHeader = {
  estimateId: number; externalRef: string; revision: number; estimateNo: string; projectNo: string | null; projectName: string;
  customer: string; shortName: string | null; revisionDescription: string | null; preparedByEmail: string | null;
  approvedAt: Date | string | null; appBaseUrl: string;
};

/** A row of the ERP summary sheet (parseErpSheetRows): what one line of the Cost Sheet says. */
export type CostEstimateLine = {
  sourceType: string; internalCategory: string; erpCategory: string; module?: string | null; description: string;
  item?: string | number | null; modelPartNumber?: string | null; supplier?: string | null; brand?: string | null;
  leadTime?: string | null; quoteRevision?: string | null; unitPrice?: number | null; quantity?: number | null;
  unit?: string | null; amount: number; remark?: string | null;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const cut = (value: string, max: number) => value.length > max ? `${value.slice(0, max - 1)}…` : value;
/** An optional text field: trimmed, shortened to what the ERP stores, and left out when there is nothing to say. */
const optional = (key: string, value: unknown, max: number) => {
  const text = value === null || value === undefined ? "" : String(value).trim();
  return text ? { [key]: cut(text, max) } : {};
};
const optionalNumber = (key: string, value: number | null | undefined) =>
  value === null || value === undefined || !Number.isFinite(value) ? {} : { [key]: value };

/*
 * The rows of the ERP summary sheet, as the page draws them and the _ERP_ workbook writes them: one per module, standalone
 * item or merged line, plus the contingency, never the cost lines behind them (owner, 2026-11-02, after CS-202611-0001
 * arrived with every line). The page builds them with the frontend's sheet code; the server checks each row here and,
 * with sheetRowsMismatch, that every category still adds up to the estimate's own summary.
 */
export function parseErpSheetRows(value: unknown): CostEstimateLine[] {
  if (!Array.isArray(value) || !value.length) throw new ApiError(400, "validation_failed", "The ERP sheet rows are required.");
  if (value.length > ERP_MAX_COST_LINES) throw new ApiError(400, "validation_failed", `The ERP takes at most ${ERP_MAX_COST_LINES} rows.`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new ApiError(400, "validation_failed", `ERP sheet row ${index + 1} is invalid.`);
    const row = item as Record<string, unknown>;
    const text = (key: string, max: number) => typeof row[key] === "string" && (row[key] as string).trim() ? (row[key] as string).trim().slice(0, max) : null;
    const number = (key: string) => {
      if (row[key] === null || row[key] === undefined) return null;
      const parsed = Number(row[key]);
      if (!Number.isFinite(parsed)) throw new ApiError(400, "validation_failed", `ERP sheet row ${index + 1}: ${key} is not a number.`);
      return parsed;
    };
    const erpCategory = String(row.erpCategory ?? "");
    if (!(ERP_CATEGORIES as readonly string[]).includes(erpCategory)) throw new ApiError(400, "validation_failed", `ERP sheet row ${index + 1} has no ERP category.`);
    const description = text("description", 2000);
    if (!description) throw new ApiError(400, "validation_failed", `ERP sheet row ${index + 1} has no description.`);
    const amount = number("amount");
    if (amount === null) throw new ApiError(400, "validation_failed", `ERP sheet row ${index + 1} has no amount.`);
    return {
      sourceType: (ERP_SOURCE_TYPES as readonly string[]).includes(String(row.sourceType)) ? String(row.sourceType) : "CostItem",
      erpCategory, description, amount, internalCategory: text("internalCategory", 100) ?? "",
      supplier: text("supplier", 200), brand: text("brand", 100), leadTime: text("leadTime", 100), quoteRevision: text("quoteRevision", 100),
      unit: text("unit", 50), unitPrice: number("unitPrice"), quantity: number("quantity"),
    };
  });
}

/** Why the sheet's rows do not add up to the estimate's own ERP summary, or null. Rows are rounded to the satang, so a category may drift by half a satang per row. */
export function sheetRowsMismatch(rows: CostEstimateLine[], categories: ReadonlyArray<{ category: string; amount: number }>): string | null {
  for (const { category, amount } of categories) {
    const own = rows.filter((row) => row.erpCategory === category);
    const sum = own.reduce((total, row) => total + money(row.amount), 0);
    if (Math.abs(sum - amount) > 0.01 + 0.005 * own.length) {
      return `The ERP sheet's ${category} rows add up to ${sum.toFixed(2)}, but the estimate's ${category} is ${amount.toFixed(2)}. Reload the estimate and send again.`;
    }
  }
  return null;
}

/** Why these lines cannot go to the ERP as they stand, or null. */
export function costEstimateBlocker(lines: CostEstimateLine[]): string | null {
  if (!lines.length) return "The estimate has no cost line to send.";
  if (lines.length > ERP_MAX_COST_LINES) return `The ERP takes at most ${ERP_MAX_COST_LINES} cost lines; this estimate has ${lines.length}.`;
  const unmapped = lines.filter((line) => !(ERP_CATEGORIES as readonly string[]).includes(line.erpCategory)).length;
  return unmapped ? `${unmapped} cost line(s) have no ERP category.` : null;
}

/**
 * The cost_estimate_submit arguments: the figures of the _ERP_ workbook. The ERP refuses a sheet whose category summary is not
 * the sum of its lines, or whose total is not the lines plus overhead, so each line is rounded to the satang first and every
 * sum is made from the amounts actually sent.
 */
export function costEstimateArguments(header: CostEstimateHeader, lines: CostEstimateLine[], overheadAmount: number): Record<string, unknown> {
  const sent = lines.map((line) => ({
    category: line.erpCategory,
    source_type: line.sourceType,
    ...optional("internal_category", line.internalCategory, 100),
    ...optional("module", line.module, 200),
    ...optional("part_number", line.modelPartNumber || line.item, 100),
    description: cut(String(line.description ?? "").trim() || String(line.item ?? "").trim() || line.internalCategory || line.sourceType, 2000),
    ...optional("brand", line.brand, 100),
    ...optional("supplier", line.supplier, 200),
    ...optional("lead_time", line.leadTime, 100),
    ...optional("quote_revision", line.quoteRevision, 100),
    ...optionalNumber("unit_price", line.unitPrice),
    ...optionalNumber("quantity", line.quantity),
    ...optional("unit", line.unit, 50),
    amount: money(line.amount),
    ...optional("remark", line.remark, 2000),
  }));
  const summary = ERP_CATEGORIES.map((category) => ({
    category, amount: money(sent.filter((line) => line.category === category).reduce((total, line) => total + line.amount, 0)),
  }));
  const overhead = money(overheadAmount);
  const projectNo = header.projectNo?.trim() ?? "";
  return {
    external_ref: header.externalRef,
    revision: header.revision,
    estimate_no: header.estimateNo,
    // A project still numbered PJ000000 is not in the ERP yet; the ERP links the sheet once it is.
    ...(projectNo && !isPlaceholder(projectNo) ? { project_no: projectNo } : {}),
    ...optional("project_name", header.projectName, 300),
    ...optional("customer", header.customer, 300),
    ...optional("short_name", header.shortName, 100),
    ...optional("revision_description", header.revisionDescription, 500),
    ...optional("prepared_by_email", header.preparedByEmail, 200),
    ...(header.approvedAt ? { approved_at: new Date(header.approvedAt).toISOString() } : {}),
    currency: "THB",
    est_cost_url: `${header.appBaseUrl.replace(/\/$/, "")}/#/estimates/${header.estimateId}`,
    summary,
    overhead_amount: overhead,
    total: money(summary.reduce((total, entry) => total + entry.amount, 0) + overhead),
    lines: sent,
  };
}

export type CostSheet = {
  result: string | null; costSheetNo: string | null; status: string | null; revision: number | null; total: number | null; url: string | null;
};

/*
 * What the ERP said about the Cost Sheet: its number, status (CONFIRMED, or LINKED once a sales quotation uses it), the
 * latest revision it holds and its total. The answer is read leniently, from a nested sheet object or the top level, so a
 * field the ERP names differently costs a blank cell rather than reporting as failed a send the ERP actually took.
 */
export function readCostSheet(data: unknown): CostSheet {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const nested = ["cost_sheet", "costSheet", "cost_estimate", "sheet"].map((key) => root[key])
    .find((value) => value && typeof value === "object") as Record<string, unknown> | undefined;
  const sources = nested ? [nested, root] : [root];
  const pick = (keys: string[]) => {
    for (const source of sources) for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== "" && typeof value !== "object") return value;
    }
    return undefined;
  };
  const text = (value: unknown) => value === undefined ? null : String(value);
  const number = (value: unknown) => value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
  return {
    result: typeof root.result === "string" ? root.result : null,
    costSheetNo: text(pick(["cost_sheet_no", "sheet_no", "doc_no", "document_no", "number", "no", "code"])),
    status: text(pick(["status"])),
    revision: number(pick(["revision", "revision_no", "latest_revision"])),
    total: number(pick(["total", "total_amount"])),
    url: text(pick(["url", "link"])),
  };
}
