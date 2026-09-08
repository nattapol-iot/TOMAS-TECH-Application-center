import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { clampedInteger, optionalPositiveLong, optionalText } from "../http.js";
import type { CurrentUserService } from "../users.js";

type PriceHistoryRow = {
  id: number | string;
  source_key: string;
  project_number: string;
  project_name: string;
  customer_name: string;
  line_number: number;
  category_code: string;
  category: string;
  module: string;
  item_code: string;
  description: string;
  brand: string;
  supplier_id: number | string | null;
  supplier_name: string;
  quantity: number | string;
  unit: string;
  quote_unit_price: number | string;
  actual_unit_cost: number | string;
  actual_line_cost: number | string;
  lead_time_days: number;
  quotation_number: string;
  quotation_date: Date | string | null;
  purchase_order_number: string;
  purchase_order_status: string;
  remark: string;
  source_workbook: string;
  source_quotation_file: string | null;
  import_batch: string;
  imported_at: Date | string;
  total_count: number | string;
};

export function registerPricingRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/pricing/history", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const query = request.query as Record<string, unknown>;
    const search = optionalText(query.search, 200, "Search") ?? "";
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampedInteger(query.pageSize, 50, 1, 200);
    const supplierId = optionalPositiveLong(query.supplierId, "Supplier id");
    const result = await database.query<PriceHistoryRow>(`
      SELECT
        h.id, h.source_key, h.project_number, h.project_name, h.customer_name, h.line_number,
        h.category_code, h.category, h.module, h.item_code, h.description, h.brand,
        h.supplier_id, h.supplier_name, h.quantity, h.unit, h.quote_unit_price,
        h.actual_unit_cost, h.actual_line_cost, h.lead_time_days, h.quotation_number,
        h.quotation_date, h.purchase_order_number, h.purchase_order_status, h.remark,
        h.source_workbook, h.source_quotation_file, h.import_batch, h.imported_at,
        COUNT_BIG(*) OVER() AS total_count
      FROM dbo.supplier_price_history h
      WHERE (@supplier_id IS NULL OR h.supplier_id = @supplier_id)
        AND (@search = N'' OR h.item_code LIKE N'%' + @search + N'%'
             OR h.description LIKE N'%' + @search + N'%'
             OR h.brand LIKE N'%' + @search + N'%'
             OR h.supplier_name LIKE N'%' + @search + N'%'
             OR h.quotation_number LIKE N'%' + @search + N'%'
             OR h.purchase_order_number LIKE N'%' + @search + N'%'
             OR h.project_number LIKE N'%' + @search + N'%')
      ORDER BY COALESCE(h.quotation_date, CONVERT(date, h.imported_at)) DESC, h.id DESC
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("supplier_id", sql.BigInt, supplierId);
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("offset", sql.Int, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    const rows = result.recordset;
    return {
      items: rows.map((row) => ({
        id: Number(row.id), sourceKey: row.source_key, projectNumber: row.project_number,
        projectName: row.project_name, customerName: row.customer_name, lineNumber: row.line_number,
        categoryCode: row.category_code, category: row.category, module: row.module,
        itemCode: row.item_code, description: row.description, brand: row.brand,
        supplierId: row.supplier_id === null ? null : Number(row.supplier_id), supplierName: row.supplier_name,
        quantity: Number(row.quantity), unit: row.unit, quoteUnitPrice: Number(row.quote_unit_price),
        actualUnitCost: Number(row.actual_unit_cost), actualLineCost: Number(row.actual_line_cost),
        leadTimeDays: row.lead_time_days, quotationNumber: row.quotation_number,
        quotationDate: row.quotation_date === null
          ? null
          : (typeof row.quotation_date === "string" ? row.quotation_date.slice(0, 10) : row.quotation_date.toISOString().slice(0, 10)),
        purchaseOrderNumber: row.purchase_order_number, purchaseOrderStatus: row.purchase_order_status,
        remark: row.remark, sourceWorkbook: row.source_workbook, sourceQuotationFile: row.source_quotation_file,
        importBatch: row.import_batch, importedAt: row.imported_at,
      })),
      page,
      pageSize,
      total: Number(rows[0]?.total_count ?? 0),
    };
  });
}
