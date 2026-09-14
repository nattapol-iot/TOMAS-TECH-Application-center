import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import {
  allocateItemCode, expenseSectionCode, isEstimateSectionCode, MANHOUR_SECTION_CODE,
  otherCostSectionCode, requestedSections, resolveCopiedSupplier, touchedSections,
  type SupplierState,
} from "../estimate-copy-plan.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import { bodyObject, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
import type { CurrentUserService } from "../users.js";
import {
  assigned, elevated, estimateAssignees, lockEditableEstimate, touchEstimate, validateReferences,
  type EditableEstimate,
} from "./estimate-cost-write.js";

/* Copying an estimate for reuse is one transaction or none of it.
   The previous behaviour wrote the copied lines one HTTP request at a time, so
   a collision on `UX_cost_items_code`, a deactivated supplier or the aggregate
   guard left the target holding a partial copy that could not be retried. This
   route locks the target once, copies every requested ledger plus its ERP
   classifications, and lets SQL Server roll the whole thing back on any failure.
   It never writes to the source estimate. */

const MAX_COPIED_LINES = 2000;

type SourceEstimate = { id: number; estimate_no: string; revision: number; project_name: string; status: string };

type CostRow = {
  price_set_key?: string | null; is_price_set?: boolean; qty_per_set?: number | string | null;
  id: number | string; category_code: string; category: string; subcategory: string; module: string; item_code: string;
  description: string; brand: string; model: string; specification: string | null; supplier_id: number | string | null;
  supplier_state: SupplierState | null; qty: number | string; unit: string; unit_cost: number | string;
  price_source: string; reference_no: string | null; reference_project: string | null; price_date: Date | string | null;
  remark: string | null; erp_category: string | null;
};

type ManhourRow = {
  id: number | string; package: string; activity: string; department: string; level: string; cost_type: string;
  provider: string; supplier_id: number | string | null; supplier_state: SupplierState | null; quotation_no: string | null;
  price_date: Date | string | null; engineers: number | string; man_days: number | string; hours_per_day: number | string;
  daily_rate: number | string; remark: string | null; erp_category: string | null;
};

type ExpenseRow = {
  id: number | string; package: string; expense_type: string; description: string; cost_type: string;
  supplier_id: number | string | null; supplier_state: SupplierState | null; reference_no: string | null;
  qty: number | string; unit: string; unit_cost: number | string; remark: string | null; erp_category: string | null;
};

type OtherRow = {
  id: number | string; category: string; description: string; qty: number | string; unit: string;
  unit_cost: number | string; remark: string | null; erp_category: string | null;
};

function businessToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

const dateInput = (value: Date | string | null): string | null =>
  value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);

/** The source is read under the copy's own transaction and is never written to. */
async function readSource(transaction: TransactionType, sourceId: number, targetId: number): Promise<SourceEstimate> {
  if (sourceId === targetId) throw new ApiError(400, "validation_failed", "An estimate cannot be copied onto itself.");
  const request = new sql.Request(transaction); request.input("source_id", sql.BigInt, sourceId);
  const row = (await request.query<SourceEstimate>(`SELECT id,estimate_no,revision,project_name,status
    FROM dbo.estimates WHERE id=@source_id AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "source_estimate_not_found", "The estimate to copy from was not found.");
  return { ...row, id: Number(row.id), revision: Number(row.revision) };
}

/* Internal man-hour never carries a stored rate across: the man-hour write route
   resolves it from dbo.engineering_rates and ignores any client value, so a copy
   re-resolves it at today's effective rate instead of importing the source's
   historical labour pricing. Supplier man-hour keeps its quoted rate, quotation
   number and price date, which are that line's real provenance. */
async function resolveInternalRate(
  transaction: TransactionType, costType: string, level: string, department: string, today: string,
): Promise<number> {
  const request = new sql.Request(transaction);
  request.input("cost_type", sql.NVarChar(30), costType); request.input("level", sql.NVarChar(100), level);
  request.input("department", sql.NVarChar(100), department); request.input("today", sql.Date, today);
  const row = (await request.query<{ rate: number | string }>(`SELECT TOP(1)
    CASE WHEN @cost_type=N'Installation' THEN installation_daily ELSE engineering_daily END rate
    FROM dbo.engineering_rates WHERE level=@level AND department=@department AND is_active=1 AND effective_from<=@today
      AND (effective_to IS NULL OR effective_to>=@today) ORDER BY effective_from DESC,id DESC;`)).recordset[0];
  if (!row) {
    throw new ApiError(422, "engineering_rate_missing",
      `No active engineering rate matches '${level}' in '${department}' for ${costType.toLowerCase()} work, so that man-hour line cannot be copied.`);
  }
  return Number(row.rate);
}

/* ERP classifications follow their line. `copied_from_mapping_id` is deliberately
   left null: CK_estimate_erp_mappings_copy_provenance describes a later revision
   of the same estimate, which a cross-estimate copy is not. */
async function copyErpCategory(
  transaction: TransactionType, estimateId: number, revision: number, sourceType: string, lineId: number,
  category: string | null, actorId: number,
): Promise<boolean> {
  if (!category || category === "Unmapped") return false;
  const request = new sql.Request(transaction);
  request.input("estimate_id", sql.BigInt, estimateId); request.input("revision", sql.Int, revision);
  request.input("source_type", sql.NVarChar(30), sourceType); request.input("source_id", sql.BigInt, lineId);
  request.input("erp_category", sql.NVarChar(30), category); request.input("actor", sql.BigInt, actorId);
  await request.query(`INSERT INTO dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
    VALUES(@estimate_id,@revision,@source_type,@source_id,@erp_category,@actor,@actor);`);
  return true;
}

export function registerEstimateCopyRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.post("/api/v1/estimates/:id/copy-from", async (request, reply) => {
    await users.demandPermission(request, "estimate.read");
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const targetId = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const estimateRowVersion = parseRowVersion(body.estimateRowVersion);
    const sourceId = requiredInteger(body.sourceEstimateId, "Source estimate", 1);
    const ownerId = requiredInteger(body.ownerId, "Owner", 1);
    const sections = requestedSections(body.sections);
    if (!sections.length) throw new ApiError(400, "validation_failed", "Select at least one estimate section to copy.");
    const include = {
      costItems: body.includeCostItems !== false, manhour: body.includeManhour !== false,
      expenses: body.includeExpenses !== false, otherCosts: body.includeOtherCosts !== false,
      erpCategories: body.includeErpCategories !== false,
    };
    const today = businessToday(config.businessTimeZone);

    const copied = await database.transaction(async (transaction) => {
      const estimate: EditableEstimate = await lockEditableEstimate(transaction, targetId, estimateRowVersion);
      const source = await readSource(transaction, sourceId, targetId);
      // `sections` holds only values from ESTIMATE_SECTION_CODES — never request text — so this list is a constant, not user input.
      const sectionList = sections.map((code) => `'${code}'`).join(",");

      const read = new sql.Request(transaction);
      read.input("source_id", sql.BigInt, source.id); read.input("source_revision", sql.Int, source.revision);
      read.input("target_id", sql.BigInt, targetId); read.input("target_revision", sql.Int, estimate.revision);
      read.input("want_cost", sql.Bit, include.costItems); read.input("want_manhour", sql.Bit, include.manhour && sections.includes(MANHOUR_SECTION_CODE));
      read.input("want_expense", sql.Bit, include.expenses); read.input("want_other", sql.Bit, include.otherCosts);
      const ledgers = await read.query<Record<string, unknown>>(`
        SELECT c.price_set_key,c.is_price_set,c.qty_per_set,c.id,c.category_code,c.category,c.subcategory,c.module,c.item_code,c.description,c.brand,c.model,c.specification,
          c.supplier_id,CASE WHEN c.supplier_id IS NULL THEN NULL WHEN s.id IS NULL THEN N'inactive' ELSE N'active' END supplier_state,
          c.qty,c.unit,c.unit_cost,c.price_source,c.reference_no,c.reference_project,c.price_date,c.remark,m.erp_category
        FROM dbo.cost_items c WITH (HOLDLOCK)
        LEFT JOIN dbo.suppliers s ON s.id=c.supplier_id AND s.is_active=1 AND s.deleted_at IS NULL
        LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=c.estimate_id AND m.revision=c.revision AND m.source_type=N'CostItem' AND m.source_id=c.id
        WHERE @want_cost=1 AND c.estimate_id=@source_id AND c.revision=@source_revision AND c.deleted_at IS NULL
          AND c.category_code IN (${sectionList}) ORDER BY c.id;

        SELECT h.id,h.package,h.activity,h.department,h.level,h.cost_type,h.provider,h.supplier_id,
          CASE WHEN h.supplier_id IS NULL THEN NULL WHEN s.id IS NULL THEN N'inactive' ELSE N'active' END supplier_state,
          h.quotation_no,h.price_date,h.engineers,h.man_days,h.hours_per_day,h.daily_rate,h.remark,m.erp_category
        FROM dbo.manhour_lines h WITH (HOLDLOCK)
        LEFT JOIN dbo.suppliers s ON s.id=h.supplier_id AND s.is_active=1 AND s.deleted_at IS NULL
        LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=h.estimate_id AND m.revision=h.revision AND m.source_type=N'ManhourLine' AND m.source_id=h.id
        WHERE @want_manhour=1 AND h.estimate_id=@source_id AND h.revision=@source_revision AND h.deleted_at IS NULL ORDER BY h.id;

        SELECT e.id,e.package,e.expense_type,e.description,e.cost_type,e.supplier_id,
          CASE WHEN e.supplier_id IS NULL THEN NULL WHEN s.id IS NULL THEN N'inactive' ELSE N'active' END supplier_state,
          e.reference_no,e.qty,e.unit,e.unit_cost,e.remark,m.erp_category
        FROM dbo.expense_lines e WITH (HOLDLOCK)
        LEFT JOIN dbo.suppliers s ON s.id=e.supplier_id AND s.is_active=1 AND s.deleted_at IS NULL
        LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=e.estimate_id AND m.revision=e.revision AND m.source_type=N'ExpenseLine' AND m.source_id=e.id
        WHERE @want_expense=1 AND e.estimate_id=@source_id AND e.revision=@source_revision AND e.deleted_at IS NULL ORDER BY e.id;

        SELECT o.id,o.category,o.description,o.qty,o.unit,o.unit_cost,o.remark,m.erp_category
        FROM dbo.other_cost_lines o WITH (HOLDLOCK)
        LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=o.estimate_id AND m.revision=o.revision AND m.source_type=N'OtherCostLine' AND m.source_id=o.id
        WHERE @want_other=1 AND o.estimate_id=@source_id AND o.revision=@source_revision AND o.deleted_at IS NULL ORDER BY o.id;

        SELECT item_code FROM dbo.cost_items WITH (UPDLOCK,HOLDLOCK)
        WHERE estimate_id=@target_id AND revision=@target_revision AND deleted_at IS NULL;`);

      const costRows = ledgers.recordsets[0] as unknown as CostRow[];
      const manhourRows = ledgers.recordsets[1] as unknown as ManhourRow[];
      const expenseRows = (ledgers.recordsets[2] as unknown as ExpenseRow[])
        .filter((row) => { const section = expenseSectionCode(row.expense_type); return section !== null && sections.includes(section); });
      const otherRows = (ledgers.recordsets[3] as unknown as OtherRow[])
        .filter((row) => { const section = otherCostSectionCode(row.category); return section !== null && sections.includes(section); });
      const takenCodes = new Set((ledgers.recordsets[4] as unknown as Array<{ item_code: string }>).map((row) => row.item_code));

      const total = costRows.length + manhourRows.length + expenseRows.length + otherRows.length;
      if (!total) throw new ApiError(409, "nothing_to_copy", `${source.estimate_no} has no line in the selected section(s) to copy.`);
      if (total > MAX_COPIED_LINES) throw new ApiError(400, "validation_failed", `A single copy cannot exceed ${MAX_COPIED_LINES} lines.`);

      /* One permission decision before the first insert, exactly as apply-template
         does — a copy can never write a line the engineer could not have typed.
         Assignments are per discipline, so any assignee may copy into every ledger;
         copying never creates or rewrites an assignment. */
      if (!elevated(actor, estimate)) {
        const assignees = await estimateAssignees(transaction, targetId, estimate.revision);
        if (!assigned(actor, assignees)) {
          throw new ApiError(403, "estimate_section_forbidden", "You may copy lines only into an estimate that has a section assigned to you.");
        }
        if (!assignees.has(ownerId)) {
          throw new ApiError(403, "cost_owner_forbidden", "You cannot assign a copied line to a user who is not assigned to this estimate.");
        }
      }

      const renamedItemCodes: Array<{ original: string; applied: string }> = [];
      const droppedSuppliers: Array<{ line: string; supplierId: number }> = [];
      let erpCategories = 0;

      const setKeys = new Map<string, string>();
      for (const row of costRows) {
        const section = row.category_code;
        if (!isEstimateSectionCode(section)) continue;
        const lineOwnerId = ownerId;
        const supplier = resolveCopiedSupplier(row.supplier_id === null ? null : Number(row.supplier_id), row.supplier_state, false);
        if (supplier.dropped) droppedSuppliers.push({ line: row.item_code, supplierId: Number(row.supplier_id) });
        await validateReferences(transaction, lineOwnerId, supplier.supplierId);
        const itemCode = allocateItemCode(row.item_code, takenCodes);
        takenCodes.add(itemCode);
        if (itemCode !== row.item_code) renamedItemCodes.push({ original: row.item_code, applied: itemCode });
        const insert = new sql.Request(transaction);
        insert.input("estimate_id", sql.BigInt, targetId); insert.input("revision", sql.Int, estimate.revision);
        insert.input("category_code", sql.Char(2), row.category_code); insert.input("category", sql.NVarChar(100), row.category);
        insert.input("subcategory", sql.NVarChar(100), row.subcategory); insert.input("module", sql.NVarChar(200), row.module);
        insert.input("item_code", sql.NVarChar(100), itemCode); insert.input("description", sql.NVarChar(500), row.description);
        insert.input("brand", sql.NVarChar(100), row.brand); insert.input("model", sql.NVarChar(200), row.model);
        insert.input("specification", sql.NVarChar(sql.MAX), row.specification); insert.input("supplier_id", sql.BigInt, supplier.supplierId);
        insert.input("qty", sql.Decimal(19, 4), Number(row.qty)); insert.input("unit", sql.NVarChar(50), row.unit);
        insert.input("unit_cost", sql.Decimal(19, 4), Number(row.unit_cost));
        insert.input("price_source", sql.NVarChar(100), row.price_source);
        insert.input("reference_no", sql.NVarChar(200), row.reference_no); insert.input("reference_project", sql.NVarChar(200), row.reference_project);
        insert.input("price_date", sql.Date, dateInput(row.price_date)); insert.input("remark", sql.NVarChar(sql.MAX), row.remark);
        insert.input("owner_id", sql.BigInt, lineOwnerId); insert.input("actor", sql.BigInt, actor.id);
        if (row.price_set_key && !setKeys.has(String(row.price_set_key))) setKeys.set(String(row.price_set_key), randomUUID());
        insert.input("set_key", sql.UniqueIdentifier, row.price_set_key ? setKeys.get(String(row.price_set_key)) : null);
        insert.input("set_header", sql.Bit, Boolean(row.is_price_set));
        insert.input("per_set", sql.Decimal(19,4), row.qty_per_set == null ? null : Number(row.qty_per_set));
        const created = (await insert.query<{ id: number | string }>(`DECLARE @created TABLE(id bigint);
          INSERT INTO dbo.cost_items(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,
            specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,created_by,updated_by,price_set_key,is_price_set,qty_per_set)
          OUTPUT inserted.id INTO @created(id)
          VALUES(@estimate_id,@revision,@category_code,@category,@subcategory,@module,@item_code,@description,@brand,@model,
            @specification,@supplier_id,@qty,@unit,@unit_cost,@price_source,@reference_no,@reference_project,@price_date,@remark,@owner_id,N'Active',@actor,@actor,@set_key,@set_header,@per_set);
          SELECT id FROM @created;`)).recordset[0]!;
        if (include.erpCategories && await copyErpCategory(transaction, targetId, estimate.revision, "CostItem", Number(created.id), row.erp_category, actor.id)) erpCategories += 1;
      }

      for (const row of manhourRows) {
        const lineOwnerId = ownerId;
        const isSupplier = row.provider === "Supplier";
        const supplier = resolveCopiedSupplier(row.supplier_id === null ? null : Number(row.supplier_id), row.supplier_state, isSupplier);
        if (supplier.blocked) {
          throw new ApiError(422, "supplier_inactive",
            `Supplier man-hour '${row.activity}' quotes a supplier that is no longer active, so it cannot be copied. Reactivate the supplier or remove that line from the selection.`);
        }
        if (supplier.dropped) droppedSuppliers.push({ line: row.activity, supplierId: Number(row.supplier_id) });
        await validateReferences(transaction, lineOwnerId, supplier.supplierId);
        const dailyRate = isSupplier ? Number(row.daily_rate) : await resolveInternalRate(transaction, row.cost_type, row.level, row.department, today);
        const insert = new sql.Request(transaction);
        insert.input("estimate", sql.BigInt, targetId); insert.input("revision", sql.Int, estimate.revision);
        insert.input("package", sql.NVarChar(200), row.package); insert.input("activity", sql.NVarChar(300), row.activity);
        insert.input("department", sql.NVarChar(100), row.department); insert.input("level", sql.NVarChar(100), row.level);
        insert.input("cost_type", sql.NVarChar(30), row.cost_type); insert.input("provider", sql.NVarChar(30), row.provider);
        insert.input("supplier", sql.BigInt, isSupplier ? supplier.supplierId : null);
        insert.input("quotation", sql.NVarChar(100), isSupplier ? row.quotation_no : null);
        insert.input("price_date", sql.Date, isSupplier ? dateInput(row.price_date) : today);
        insert.input("engineers", sql.Decimal(9, 2), Number(row.engineers)); insert.input("man_days", sql.Decimal(9, 2), Number(row.man_days));
        insert.input("hours", sql.Decimal(9, 2), Number(row.hours_per_day)); insert.input("rate", sql.Decimal(19, 4), dailyRate);
        insert.input("owner", sql.BigInt, lineOwnerId); insert.input("remark", sql.NVarChar(sql.MAX), row.remark);
        insert.input("actor", sql.BigInt, actor.id);
        const created = (await insert.query<{ id: number | string }>(`DECLARE @created TABLE(id bigint);
          INSERT INTO dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,provider,supplier_id,quotation_no,
            price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,created_by,updated_by)
          OUTPUT inserted.id INTO @created(id)
          VALUES(@estimate,@revision,@package,@activity,@department,@level,@cost_type,@provider,@supplier,@quotation,
            @price_date,@engineers,@man_days,@hours,@rate,@owner,@remark,@actor,@actor);
          SELECT id FROM @created;`)).recordset[0]!;
        if (include.erpCategories && await copyErpCategory(transaction, targetId, estimate.revision, "ManhourLine", Number(created.id), row.erp_category, actor.id)) erpCategories += 1;
      }

      for (const row of expenseRows) {
        const lineOwnerId = ownerId;
        const supplier = resolveCopiedSupplier(row.supplier_id === null ? null : Number(row.supplier_id), row.supplier_state, false);
        if (supplier.dropped) droppedSuppliers.push({ line: row.description, supplierId: Number(row.supplier_id) });
        await validateReferences(transaction, lineOwnerId, supplier.supplierId);
        const insert = new sql.Request(transaction);
        insert.input("estimate", sql.BigInt, targetId); insert.input("revision", sql.Int, estimate.revision);
        insert.input("package", sql.NVarChar(200), row.package); insert.input("expense_type", sql.NVarChar(100), row.expense_type);
        insert.input("description", sql.NVarChar(500), row.description); insert.input("cost_type", sql.NVarChar(30), row.cost_type);
        insert.input("supplier", sql.BigInt, supplier.supplierId); insert.input("reference", sql.NVarChar(200), row.reference_no);
        insert.input("qty", sql.Decimal(19, 4), Number(row.qty)); insert.input("unit", sql.NVarChar(50), row.unit);
        insert.input("unit_cost", sql.Decimal(19, 4), Number(row.unit_cost)); insert.input("owner", sql.BigInt, lineOwnerId);
        insert.input("remark", sql.NVarChar(sql.MAX), row.remark); insert.input("actor", sql.BigInt, actor.id);
        const created = (await insert.query<{ id: number | string }>(`DECLARE @created TABLE(id bigint);
          INSERT INTO dbo.expense_lines(estimate_id,revision,package,expense_type,description,cost_type,supplier_id,reference_no,
            qty,unit,unit_cost,owner_id,remark,created_by,updated_by)
          OUTPUT inserted.id INTO @created(id)
          VALUES(@estimate,@revision,@package,@expense_type,@description,@cost_type,@supplier,@reference,
            @qty,@unit,@unit_cost,@owner,@remark,@actor,@actor);
          SELECT id FROM @created;`)).recordset[0]!;
        if (include.erpCategories && await copyErpCategory(transaction, targetId, estimate.revision, "ExpenseLine", Number(created.id), row.erp_category, actor.id)) erpCategories += 1;
      }

      for (const row of otherRows) {
        const insert = new sql.Request(transaction);
        insert.input("estimate", sql.BigInt, targetId); insert.input("revision", sql.Int, estimate.revision);
        insert.input("category", sql.NVarChar(100), row.category); insert.input("description", sql.NVarChar(500), row.description);
        insert.input("qty", sql.Decimal(19, 4), Number(row.qty)); insert.input("unit", sql.NVarChar(50), row.unit);
        insert.input("unit_cost", sql.Decimal(19, 4), Number(row.unit_cost)); insert.input("remark", sql.NVarChar(sql.MAX), row.remark);
        insert.input("actor", sql.BigInt, actor.id);
        const created = (await insert.query<{ id: number | string }>(`DECLARE @created TABLE(id bigint);
          INSERT INTO dbo.other_cost_lines(estimate_id,revision,category,description,qty,unit,unit_cost,remark,created_by,updated_by)
          OUTPUT inserted.id INTO @created(id)
          VALUES(@estimate,@revision,@category,@description,@qty,@unit,@unit_cost,@remark,@actor,@actor);
          SELECT id FROM @created;`)).recordset[0]!;
        if (include.erpCategories && await copyErpCategory(transaction, targetId, estimate.revision, "OtherCostLine", Number(created.id), row.erp_category, actor.id)) erpCategories += 1;
      }

      await assertEstimateTotals(transaction, targetId);
      const estimateVersion = await touchEstimate(transaction, targetId, actor.id);
      // Report the cost ledgers the copy actually wrote into (informational; no longer a permission boundary).
      const writes = touchedSections({
        costCategoryCodes: costRows.map((row) => row.category_code),
        manhourLineCount: manhourRows.length,
        expenseTypes: expenseRows.map((row) => row.expense_type),
        otherCostCategories: otherRows.map((row) => row.category),
      });
      const result = {
        sourceEstimateId: source.id, sourceNumber: source.estimate_no, sourceRevision: source.revision,
        sourceProjectName: source.project_name, sections: writes,
        costItems: costRows.length, manhourLines: manhourRows.length, expenseLines: expenseRows.length,
        otherCostLines: otherRows.length, erpCategories, renamedItemCodes, droppedSuppliers,
      };
      await insertAudit(transaction, actor.id, "Estimate", targetId, estimate.estimate_no, "Copied from estimate", null, result);
      return { ...result, estimateRowVersion: estimateVersion.toString("base64") };
    });
    return reply.status(201).send(copied);
  });
}
