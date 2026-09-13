import { ESTIMATE_OVERHEAD_ENABLED } from "./feature-flags.js";
import { ApiError } from "./errors.js";

export const ERP_CATEGORIES = [
  "Hardware", "Software", "Service", "Installation", "License", "Maintenance", "Training",
] as const;
export const ERP_CATEGORY_VALUES = [...ERP_CATEGORIES, "Unmapped"] as const;
export const ERP_SOURCE_TYPES = [
  "CostItem", "ManhourLine", "ExpenseLine", "OtherCostLine", "Contingency",
] as const;

export type ErpCategory = typeof ERP_CATEGORY_VALUES[number];
export type ErpSourceType = typeof ERP_SOURCE_TYPES[number];

export type ErpLineRow = {
  source_type: ErpSourceType;
  source_id: number | string | null;
  description: string;
  internal_category: string;
  amount: number | string;
  erp_category: ErpCategory;
  mapping_row_version: Buffer | null;
  copied_from_revision: number | null;
  item: string | null;
  model_part_number: string | null;
  supplier: string | null;
  brand: string | null;
  lead_time: string | null;
  quote_revision: string | null;
  unit_price: number | string | null;
  quantity: number | string | null;
  unit: string | null;
  remark: string | null;
};

export type ErpHeaderRow = {
  id: number | string;
  revision: number;
  status: string;
  owner_id: number | string;
  row_version: Buffer;
  canonical_total: number | string;
  overhead_total: number | string | null;
  overhead_state: string;
};

export function parseErpCategory(value: unknown): ErpCategory {
  if (typeof value !== "string" || !(ERP_CATEGORY_VALUES as readonly string[]).includes(value)) {
    throw new ApiError(400, "validation_failed", `ERP category must be one of: ${ERP_CATEGORY_VALUES.join(", ")}.`);
  }
  return value as ErpCategory;
}

export function parseErpSourceType(value: unknown): ErpSourceType {
  if (typeof value !== "string" || !(ERP_SOURCE_TYPES as readonly string[]).includes(value)) {
    throw new ApiError(400, "validation_failed", `ERP source type must be one of: ${ERP_SOURCE_TYPES.join(", ")}.`);
  }
  return value as ErpSourceType;
}

export function sourceNeedsId(sourceType: ErpSourceType): boolean {
  return sourceType !== "Contingency";
}

export function buildErpSummary(
  header: ErpHeaderRow,
  rows: ErpLineRow[],
  canEditMappings: boolean,
  options: { overheadEnabled: boolean } = { overheadEnabled: ESTIMATE_OVERHEAD_ENABLED },
) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
  const lines = rows.filter((row) => row.source_type !== "Contingency" || Math.abs(Number(row.amount)) > 0.005).map((row) => ({
    sourceType: row.source_type,
    sourceId: row.source_id === null ? null : Number(row.source_id),
    description: row.description,
    internalCategory: row.internal_category,
    amount: Number(row.amount),
    erpCategory: row.erp_category,
    mappingRowVersion: row.mapping_row_version?.toString("base64") ?? null,
    copiedFromRevision: row.copied_from_revision === null ? null : Number(row.copied_from_revision),
    item: row.item,
    modelPartNumber: row.model_part_number,
    supplier: row.supplier,
    brand: row.brand,
    leadTime: row.lead_time,
    quoteRevision: row.quote_revision,
    unitPrice: row.unit_price === null ? null : Number(row.unit_price),
    quantity: row.quantity === null ? null : Number(row.quantity),
    unit: row.unit,
    remark: row.remark,
  }));
  const categories = ERP_CATEGORIES.map((category) => {
    const matching = lines.filter((line) => line.erpCategory === category);
    return { category, amount: round(matching.reduce((total, line) => total + line.amount, 0)), lineCount: matching.length };
  });
  const unmappedLines = lines.filter((line) => line.erpCategory === "Unmapped");
  const unmapped = {
    amount: round(unmappedLines.reduce((total, line) => total + line.amount, 0)),
    lineCount: unmappedLines.length,
  };
  const classifiedTotal = round(categories.reduce((total, category) => total + category.amount, 0));
  const canonicalTotal = round(Number(header.canonical_total));
  const overheadAmount = round(Number(header.overhead_total ?? 0));
  const difference = round(classifiedTotal + unmapped.amount + overheadAmount - canonicalTotal);
  const reconciled = Math.abs(difference) <= 0.01;
  return {
    estimateId: Number(header.id),
    revision: Number(header.revision),
    estimateRowVersion: header.row_version.toString("base64"),
    categories,
    unmapped,
    classifiedTotal,
    overhead: { state: header.overhead_state, amount: overheadAmount },
    canonicalTotal,
    difference,
    reconciled,
    capabilities: {
      canEditMappings,
      canExport: header.status === "Approved" && (!options.overheadEnabled || header.overhead_state !== "Missing") && unmapped.lineCount === 0 && reconciled,
    },
    lines,
  };
}
