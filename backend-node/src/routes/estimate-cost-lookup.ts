import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { clampedInteger, dateOnly, firstQueryValue, optionalText } from "../http.js";
import type { CurrentUserService } from "../users.js";

/* Type-ahead for the cost item entry form. One query answers "what did we call
   this part, who supplied it and what did it cost last time" from every
   current-revision cost line plus the imported purchase history, collapsed to
   one row per distinct part/supplier so the engineer sees the latest price
   once, not the same PLC forty times. Read scope matches the Price Library
   (estimate.read); nothing here writes. */

export const COST_ITEM_LOOKUP_FIELDS = ["itemCode", "description", "brand", "supplier"] as const;
export type CostItemLookupField = typeof COST_ITEM_LOOKUP_FIELDS[number];
export const COST_ITEM_LOOKUP_MIN_CHARS = 2;
export const COST_ITEM_LOOKUP_MAX_LIMIT = 30;

/** Escape LIKE wildcards so a part number such as "50%" or "AB_1" matches literally. Pair with ESCAPE '\'. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_[]/g, (char) => `\\${char}`);
}

export function parseLookupField(value: unknown): CostItemLookupField {
  const raw = firstQueryValue(value) ?? "description";
  if (!(COST_ITEM_LOOKUP_FIELDS as readonly string[]).includes(raw)) throw new ApiError(400, "validation_failed", "Lookup field is invalid.");
  return raw as CostItemLookupField;
}

type LookupRow = {
  source_kind: string;
  source_id: number | string;
  source_number: string;
  project_name: string;
  category_code: string;
  category: string;
  subcategory: string;
  module: string;
  item_code: string;
  description: string;
  brand: string;
  model: string;
  specification: string | null;
  supplier_id: number | string | null;
  supplier_name: string | null;
  unit: string;
  unit_cost: number | string;
  price_source: string;
  reference_no: string | null;
  reference_project: string | null;
  price_date: Date | string | null;
  uses: number | string;
};

export const COST_ITEM_LOOKUP_SQL = `
WITH candidates AS (
  SELECT N'Estimate' source_kind, ci.id source_id, e.estimate_no source_number, e.project_name,
    ci.category_code, ci.category, ci.subcategory, ci.module, ci.item_code, ci.description, ci.brand, ci.model,
    ci.specification, ci.supplier_id, s.name supplier_name, ci.unit, ci.unit_cost, ci.price_source,
    ci.reference_no, ci.reference_project, ci.price_date, ci.updated_at sort_at
  FROM dbo.cost_items ci
  INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision AND e.deleted_at IS NULL
  LEFT JOIN dbo.suppliers s ON s.id=ci.supplier_id AND s.is_active=1 AND s.deleted_at IS NULL
  WHERE ci.deleted_at IS NULL
    AND (ci.item_code LIKE @pattern ESCAPE '\\' OR ci.description LIKE @pattern ESCAPE '\\'
      OR ci.brand LIKE @pattern ESCAPE '\\' OR ci.model LIKE @pattern ESCAPE '\\' OR s.name LIKE @pattern ESCAPE '\\')
  UNION ALL
  SELECT N'Historical Purchase', h.id, COALESCE(NULLIF(h.quotation_number,N''),NULLIF(h.purchase_order_number,N''),h.project_number), h.project_name,
    h.category_code, h.category, N'', h.module, h.item_code, h.description, h.brand, N'',
    NULL, h.supplier_id, h.supplier_name, h.unit, h.actual_unit_cost, N'Purchase Price',
    COALESCE(NULLIF(h.quotation_number,N''),h.purchase_order_number), h.project_number, h.quotation_date, h.imported_at
  FROM dbo.supplier_price_history h
  WHERE h.item_code LIKE @pattern ESCAPE '\\' OR h.description LIKE @pattern ESCAPE '\\'
    OR h.brand LIKE @pattern ESCAPE '\\' OR h.supplier_name LIKE @pattern ESCAPE '\\'
), ranked AS (
  SELECT c.*,
    ROW_NUMBER() OVER (PARTITION BY c.item_code, c.description, c.brand, c.model, c.supplier_id
      ORDER BY c.price_date DESC, c.sort_at DESC, c.source_id DESC) rn,
    COUNT_BIG(*) OVER (PARTITION BY c.item_code, c.description, c.brand, c.model, c.supplier_id) uses
  FROM candidates c
)
SELECT TOP (@limit) source_kind, source_id, source_number, project_name, category_code, category, subcategory, module,
  item_code, description, brand, model, specification, supplier_id, supplier_name, unit, unit_cost, price_source,
  reference_no, reference_project, price_date, uses
FROM ranked
WHERE rn=1
ORDER BY CASE
    WHEN @field=N'itemCode' AND item_code LIKE @prefix ESCAPE '\\' THEN 0
    WHEN @field=N'description' AND description LIKE @prefix ESCAPE '\\' THEN 0
    WHEN @field=N'brand' AND brand LIKE @prefix ESCAPE '\\' THEN 0
    WHEN @field=N'supplier' AND supplier_name LIKE @prefix ESCAPE '\\' THEN 0
    ELSE 1 END, price_date DESC, sort_at DESC, source_id DESC;
`;

export function mapLookupRow(row: LookupRow) {
  return {
    key: `${row.source_kind === "Estimate" ? "estimate" : "history"}:${Number(row.source_id)}`,
    sourceKind: row.source_kind === "Estimate" ? "Estimate" as const : "Historical Purchase" as const,
    sourceNumber: row.source_number,
    projectName: row.project_name,
    categoryCode: row.category_code,
    category: row.category,
    subcategory: row.subcategory ?? "",
    module: row.module,
    itemCode: row.item_code,
    description: row.description,
    brand: row.brand ?? "",
    model: row.model ?? "",
    specification: row.specification,
    supplierId: row.supplier_id === null ? null : Number(row.supplier_id),
    supplierName: row.supplier_name,
    unit: row.unit,
    unitCost: Number(row.unit_cost),
    priceSource: row.price_source,
    referenceNumber: row.reference_no,
    referenceProject: row.reference_project,
    priceDate: dateOnly(row.price_date),
    uses: Number(row.uses),
  };
}

export function registerEstimateCostLookupRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/estimates/cost-item-lookup", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const query = request.query as Record<string, unknown>;
    const text = optionalText(query.q, 100, "Search") ?? "";
    const field = parseLookupField(query.field);
    const limit = clampedInteger(query.limit, 12, 1, COST_ITEM_LOOKUP_MAX_LIMIT);
    if (text.length < COST_ITEM_LOOKUP_MIN_CHARS) return { items: [] };
    const escaped = escapeLikePattern(text);
    const result = await database.query<LookupRow>(COST_ITEM_LOOKUP_SQL, (sqlRequest) => {
      sqlRequest.input("pattern", sql.NVarChar(220), `%${escaped}%`);
      sqlRequest.input("prefix", sql.NVarChar(220), `${escaped}%`);
      sqlRequest.input("field", sql.NVarChar(20), field);
      sqlRequest.input("limit", sql.Int, limit);
    });
    return { items: result.recordset.map(mapLookupRow) };
  });
}
