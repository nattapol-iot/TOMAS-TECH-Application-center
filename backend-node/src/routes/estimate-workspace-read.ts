import { ESTIMATE_OVERHEAD_ENABLED } from "../feature-flags.js";
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import { dateOnly, positiveLong } from "../http.js";
import type { CurrentUserService } from "../users.js";

const EDITABLE = new Set(["Draft", "Engineering Input", "Revision Required"]);

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}

/* Cost ledgers the UI filters by (`capabilities.editableSections`). An assignee of any
   discipline section may write all of them, so the list is all-or-nothing. */
const ALL_LEDGER_SECTIONS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"] as const;

export function registerEstimateWorkspaceReadRoute(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/estimates/:id/cost-workspace", async (request) => {
    await users.demandPermission(request, "estimate.read"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const today = todayIn(config.businessTimeZone);
    const result = await database.query<Record<string, unknown>>(`
      SELECT e.id,e.estimate_no,e.inquiry_id,i.inquiry_no,e.customer_id,c.code customer_code,c.name customer_name,
        e.project_name,e.project_type,e.owner_id,owner_user.name owner_name,e.revision,e.created_date,e.due_date,e.status,
        e.progress,e.contingency_rate,e.locked_at,e.locked_by,locked_user.name locked_by_name,e.created_at,e.updated_at,e.row_version,
        t.material_total,t.engineering_total,t.outsource_total,t.transportation_total,t.accommodation_total,t.other_total,
        t.base_total,t.internal_direct_hours,t.overhead_state,t.overhead_policy_id,t.overhead_policy_version,t.overhead_hourly_rate,
        t.overhead_total,t.contingency_total,t.total,overhead.monthly_budget overhead_monthly_budget,
        overhead.normal_direct_hours overhead_normal_direct_hours,overhead.method overhead_method,
        overhead.effective_from overhead_effective_from,overhead.reason overhead_reason
      FROM dbo.estimates e INNER JOIN dbo.inquiries i ON i.id=e.inquiry_id AND i.deleted_at IS NULL
      INNER JOIN dbo.customers c ON c.id=e.customer_id AND c.deleted_at IS NULL INNER JOIN dbo.users owner_user ON owner_user.id=e.owner_id
      LEFT JOIN dbo.users locked_user ON locked_user.id=e.locked_by INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
      LEFT JOIN dbo.estimate_overhead_snapshots overhead ON overhead.estimate_id=e.id AND overhead.revision=e.revision
      WHERE e.id=@id AND e.deleted_at IS NULL;

      SELECT CONVERT(bit,COALESCE(MAX(CASE WHEN p.code=N'estimate.write' THEN 1 ELSE 0 END),0)) can_write,
        CONVERT(bit,COALESCE(MAX(CASE WHEN p.code=N'estimate.approve' THEN 1 ELSE 0 END),0)) can_approve
      FROM dbo.user_effective_permissions p WHERE p.user_id=@actor_user;

      SELECT a.id,a.section,a.owner_id,owner_user.name owner_name,a.support_id,support_user.name support_name,
        a.due_date,a.status,a.progress,a.comment,a.row_version FROM dbo.estimate_assignments a
      INNER JOIN dbo.users owner_user ON owner_user.id=a.owner_id LEFT JOIN dbo.users support_user ON support_user.id=a.support_id
      WHERE a.estimate_id=@id ORDER BY a.section,a.id;

      SELECT ci.price_set_key,ci.is_price_set,ci.qty_per_set,ci.id,ci.category_code,ci.category,ci.subcategory,ci.module,ci.item_code,ci.description,ci.brand,ci.model,
        ci.specification,ci.supplier_id,s.name supplier_name,ci.qty,ci.unit,ci.unit_cost,ci.line_total,ci.price_source,
        ci.reference_no,ci.reference_project,ci.price_date,ci.remark,ci.owner_id,u.name owner_name,ci.status,ci.updated_at,ci.row_version
      FROM dbo.cost_items ci INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
      INNER JOIN dbo.users u ON u.id=ci.owner_id LEFT JOIN dbo.suppliers s ON s.id=ci.supplier_id
      WHERE ci.estimate_id=@id AND ci.deleted_at IS NULL ORDER BY ci.category_code,MIN(ci.sort_order) OVER(PARTITION BY ci.category_code,ci.module),ci.module,ci.sort_order,ci.id;

      SELECT l.id,l.package,l.activity,l.department,l.level,l.cost_type,l.provider,l.supplier_id,s.name supplier_name,
        l.quotation_no,l.price_date,l.engineers,l.man_days,l.hours_per_day,l.daily_rate,l.line_cost,l.owner_id,u.name owner_name,
        l.remark,l.updated_at,l.row_version FROM dbo.manhour_lines l
      INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision INNER JOIN dbo.users u ON u.id=l.owner_id
      LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id WHERE l.estimate_id=@id AND l.deleted_at IS NULL ORDER BY MIN(l.sort_order) OVER(PARTITION BY l.package),l.package,l.sort_order,l.id;

      SELECT l.id,l.package,l.expense_type,l.description,l.cost_type,l.supplier_id,s.name supplier_name,l.reference_no,
        l.qty,l.unit,l.unit_cost,l.line_total,l.owner_id,u.name owner_name,l.remark,l.updated_at,l.row_version
      FROM dbo.expense_lines l INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
      INNER JOIN dbo.users u ON u.id=l.owner_id LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id
      WHERE l.estimate_id=@id AND l.deleted_at IS NULL ORDER BY MIN(l.sort_order) OVER(PARTITION BY l.package),l.package,l.sort_order,l.id;

      SELECT l.id,l.category,l.description,l.qty,l.unit,l.unit_cost,l.line_total,l.remark,l.row_version
      FROM dbo.other_cost_lines l INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
      WHERE l.estimate_id=@id AND l.deleted_at IS NULL ORDER BY MIN(l.sort_order) OVER(PARTITION BY l.category),l.category,l.sort_order,l.id;

      SELECT r.id,r.revision,r.code,r.reason,r.description,r.created_by,creator.name created_by_name,r.created_at,
        r.reviewed_by,reviewer.name reviewed_by_name,r.reviewed_at,r.status,r.total FROM dbo.estimate_revisions r
      INNER JOIN dbo.users creator ON creator.id=r.created_by LEFT JOIN dbo.users reviewer ON reviewer.id=r.reviewed_by
      WHERE r.estimate_id=@id ORDER BY r.revision DESC,r.id DESC;

      SELECT code,message,entity_type,entity_id,CAST(N'Error' AS nvarchar(20)) severity FROM dbo.fn_estimate_validation(@id)
      ${ESTIMATE_OVERHEAD_ENABLED ? `UNION ALL SELECT N'overhead_policy_missing',N'No overhead policy is applied. The total excludes overhead.',N'Estimate',e.id,N'Warning'
        FROM dbo.estimates e WHERE e.id=@id AND e.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM dbo.estimate_overhead_snapshots overhead
          WHERE overhead.estimate_id=e.id AND overhead.revision=e.revision)` : ""}
      UNION ALL SELECT N'cost_reference_missing',N'Cost item "'+ci.item_code+N'" has no reference number.',N'CostItem',ci.id,N'Warning'
        FROM dbo.cost_items ci INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
        WHERE ci.estimate_id=@id AND ci.deleted_at IS NULL AND NULLIF(LTRIM(RTRIM(ci.reference_no)),N'') IS NULL
      UNION ALL SELECT N'cost_price_stale',N'Cost item "'+ci.item_code+N'" uses a price older than 180 days.',N'CostItem',ci.id,N'Warning'
        FROM dbo.cost_items ci INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
        WHERE ci.estimate_id=@id AND ci.deleted_at IS NULL AND ci.price_date<@stale_before
      UNION ALL SELECT N'transportation_category_missing',N'No current cost item is assigned to category 08 Transportation.',N'Estimate',e.id,N'Warning'
        FROM dbo.estimates e WHERE e.id=@id AND e.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM dbo.cost_items ci
          WHERE ci.estimate_id=e.id AND ci.revision=e.revision AND ci.category_code='08' AND ci.deleted_at IS NULL)
      UNION ALL SELECT N'manhour_capacity_high',N'Man-hour activity "'+l.activity+N'" exceeds 20 engineer-days.',N'ManhourLine',l.id,N'Warning'
        FROM dbo.manhour_lines l INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
        WHERE l.estimate_id=@id AND l.deleted_at IS NULL AND l.engineers*l.man_days>20
      UNION ALL SELECT N'supplier_price_stale',N'Supplier man-hour activity "'+l.activity+N'" uses a quotation older than 180 days.',N'ManhourLine',l.id,N'Warning'
        FROM dbo.manhour_lines l INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
        WHERE l.estimate_id=@id AND l.deleted_at IS NULL AND l.provider=N'Supplier' AND l.price_date<@stale_before
      UNION ALL SELECT N'installation_transportation_missing',N'Installation effort exists without a Travel or Transportation expense.',N'Estimate',e.id,N'Warning'
        FROM dbo.estimates e WHERE e.id=@id AND e.deleted_at IS NULL AND EXISTS(SELECT 1 FROM dbo.manhour_lines l
          WHERE l.estimate_id=e.id AND l.revision=e.revision AND l.cost_type=N'Installation' AND l.deleted_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM dbo.expense_lines x WHERE x.estimate_id=e.id AND x.revision=e.revision
          AND x.expense_type IN(N'Travel',N'Transportation') AND x.deleted_at IS NULL)
      UNION ALL SELECT N'installation_accommodation_missing',N'Installation effort exists without an Accommodation or Per Diem expense.',N'Estimate',e.id,N'Warning'
        FROM dbo.estimates e WHERE e.id=@id AND e.deleted_at IS NULL AND EXISTS(SELECT 1 FROM dbo.manhour_lines l
          WHERE l.estimate_id=e.id AND l.revision=e.revision AND l.cost_type=N'Installation' AND l.deleted_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM dbo.expense_lines x WHERE x.estimate_id=e.id AND x.revision=e.revision
          AND x.expense_type IN(N'Accommodation',N'Per Diem') AND x.deleted_at IS NULL)
      ORDER BY severity,code,entity_id;
    `, (sqlRequest) => { sqlRequest.input("id", sql.BigInt, id); sqlRequest.input("actor_user", sql.BigInt, actor.id);
      sqlRequest.input("stale_before", sql.Date, shiftDays(today, -180)); });
    const headerRow = (result.recordsets[0] as unknown as Array<Record<string, unknown>>)[0];
    if (!headerRow) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
    const number = (value: unknown) => Number(value ?? 0); const nullableNumber = (value: unknown) => value === null || value === undefined ? null : Number(value);
    const header = {
      id: number(headerRow.id), number: headerRow.estimate_no, inquiryId: number(headerRow.inquiry_id), inquiryNumber: headerRow.inquiry_no,
      customerId: number(headerRow.customer_id), customerCode: headerRow.customer_code, customerName: headerRow.customer_name,
      projectName: headerRow.project_name, projectType: headerRow.project_type, ownerId: number(headerRow.owner_id), ownerName: headerRow.owner_name,
      revision: number(headerRow.revision), createdDate: dateOnly(headerRow.created_date as Date | string), dueDate: dateOnly(headerRow.due_date as Date | string),
      status: headerRow.status as string, progress: number(headerRow.progress), contingencyRate: number(headerRow.contingency_rate),
      lockedAt: headerRow.locked_at, lockedBy: nullableNumber(headerRow.locked_by), lockedByName: headerRow.locked_by_name,
      createdAt: headerRow.created_at, updatedAt: headerRow.updated_at, rowVersion: (headerRow.row_version as Buffer).toString("base64"),
      totals: { material: number(headerRow.material_total), engineering: number(headerRow.engineering_total), outsource: number(headerRow.outsource_total),
        transportation: number(headerRow.transportation_total), accommodation: number(headerRow.accommodation_total), other: number(headerRow.other_total),
        subtotal: number(headerRow.base_total), overhead: nullableNumber(headerRow.overhead_total), contingency: number(headerRow.contingency_total), total: number(headerRow.total) },
      overhead: headerRow.overhead_state === "Missing" ? { state: "Missing", policyId: null, policyVersion: null, method: null,
        monthlyBudget: null, normalDirectHours: null, hourlyRate: null, effectiveFrom: null, reason: null,
        eligibleDirectHours: number(headerRow.internal_direct_hours), amount: null } : {
        state: headerRow.overhead_state, policyId: nullableNumber(headerRow.overhead_policy_id), policyVersion: nullableNumber(headerRow.overhead_policy_version),
        method: headerRow.overhead_method, monthlyBudget: nullableNumber(headerRow.overhead_monthly_budget),
        normalDirectHours: nullableNumber(headerRow.overhead_normal_direct_hours), hourlyRate: nullableNumber(headerRow.overhead_hourly_rate),
        effectiveFrom: headerRow.overhead_effective_from ? dateOnly(headerRow.overhead_effective_from as Date|string) : null,
        reason: headerRow.overhead_reason, eligibleDirectHours: number(headerRow.internal_direct_hours), amount: nullableNumber(headerRow.overhead_total) },
    };
    const permissionRow = (result.recordsets[1] as unknown as Array<{ can_write: boolean; can_approve: boolean }>)[0] ?? { can_write: false, can_approve: false };
    const assignmentRows = result.recordsets[2] as unknown as Array<Record<string, unknown>>;
    const elevated = actor.id === header.ownerId || hasRole(actor, "Engineering Manager", "Admin");
    const editable = EDITABLE.has(header.status);
    // Assignments are per discipline: owning or supporting any section unlocks every cost ledger of the estimate.
    const isAssignee = assignmentRows.some((row) => number(row.owner_id) === actor.id || nullableNumber(row.support_id) === actor.id);
    const assignedSections = new Set<string>(isAssignee ? ALL_LEDGER_SECTIONS : []);
    const assignments = assignmentRows.map((row) => ({ id: number(row.id), section: row.section, ownerId: number(row.owner_id),
      ownerName: row.owner_name, supportId: nullableNumber(row.support_id), supportName: row.support_name,
      dueDate: dateOnly(row.due_date as Date | string), status: row.status, progress: number(row.progress), comment: row.comment,
      rowVersion: (row.row_version as Buffer).toString("base64"), canEdit: permissionRow.can_write && editable
        && (elevated || number(row.owner_id) === actor.id || nullableNumber(row.support_id) === actor.id) }));
    const costItems = (result.recordsets[3] as unknown as Array<Record<string, unknown>>).map((row) => ({ id: number(row.id),
      categoryCode: row.category_code, category: row.category, subcategory: row.subcategory, module: row.module, itemCode: row.item_code,
      description: row.description, brand: row.brand, model: row.model, specification: row.specification,
      supplierId: nullableNumber(row.supplier_id), supplierName: row.supplier_name, quantity: number(row.qty), unit: row.unit,
      priceSetKey: row.price_set_key ?? null, isPriceSet: Boolean(row.is_price_set), quantityPerSet: nullableNumber(row.qty_per_set),
      unitCost: number(row.unit_cost), lineTotal: number(row.line_total), priceSource: row.price_source,
      referenceNumber: row.reference_no, referenceProject: row.reference_project, priceDate: row.price_date ? dateOnly(row.price_date as Date | string) : null,
      remark: row.remark, ownerId: number(row.owner_id), ownerName: row.owner_name, status: row.status, updatedAt: row.updated_at,
      rowVersion: (row.row_version as Buffer).toString("base64"), canEdit: permissionRow.can_write && editable && (elevated || isAssignee) }));
    const manhourLines = (result.recordsets[4] as unknown as Array<Record<string, unknown>>).map((row) => ({ id: number(row.id), package: row.package,
      activity: row.activity, department: row.department, level: row.level, costType: row.cost_type, provider: row.provider,
      supplierId: nullableNumber(row.supplier_id), supplierName: row.supplier_name, quotationNumber: row.quotation_no,
      priceDate: row.price_date ? dateOnly(row.price_date as Date | string) : null, engineers: number(row.engineers), manDays: number(row.man_days),
      hoursPerDay: number(row.hours_per_day), dailyRate: number(row.daily_rate), manHours: number(row.engineers) * number(row.man_days) * number(row.hours_per_day),
      lineCost: number(row.line_cost), ownerId: number(row.owner_id), ownerName: row.owner_name, remark: row.remark, updatedAt: row.updated_at,
      rowVersion: (row.row_version as Buffer).toString("base64"), canEdit: permissionRow.can_write && editable
        && (elevated || (isAssignee && number(row.owner_id) === actor.id)) }));
    const expenseLines = (result.recordsets[5] as unknown as Array<Record<string, unknown>>).map((row) => ({ id: number(row.id), package: row.package,
      expenseType: row.expense_type, description: row.description, costType: row.cost_type, supplierId: nullableNumber(row.supplier_id),
      supplierName: row.supplier_name, referenceNumber: row.reference_no, quantity: number(row.qty), unit: row.unit, unitCost: number(row.unit_cost),
      lineTotal: number(row.line_total), ownerId: number(row.owner_id), ownerName: row.owner_name, remark: row.remark, updatedAt: row.updated_at,
      rowVersion: (row.row_version as Buffer).toString("base64"), canEdit: permissionRow.can_write && editable && (elevated
        || (isAssignee && number(row.owner_id) === actor.id)) }));
    const canEditOther = permissionRow.can_write && editable && elevated;
    const otherCostLines = (result.recordsets[6] as unknown as Array<Record<string, unknown>>).map((row) => ({ id: number(row.id), category: row.category,
      description: row.description, quantity: number(row.qty), unit: row.unit, unitCost: number(row.unit_cost), lineTotal: number(row.line_total),
      remark: row.remark, rowVersion: (row.row_version as Buffer).toString("base64"), canEdit: canEditOther }));
    const revisionHistory = (result.recordsets[7] as unknown as Array<Record<string, unknown>>).map((row) => ({ id: number(row.id), revision: number(row.revision),
      code: row.code, reason: row.reason, description: row.description, createdById: number(row.created_by), createdByName: row.created_by_name,
      createdAt: row.created_at, reviewedById: nullableNumber(row.reviewed_by), reviewedByName: row.reviewed_by_name, reviewedAt: row.reviewed_at,
      status: row.status, total: number(row.total) }));
    const validationIssues = (result.recordsets[8] as unknown as Array<Record<string, unknown>>).map((row) => ({ code: row.code, message: row.message,
      entityType: row.entity_type, entityId: number(row.entity_id), severity: row.severity }));
    const canEditCostItems = permissionRow.can_write && editable && (elevated || isAssignee);
    const canEditManhour = permissionRow.can_write && editable && (elevated || isAssignee);
    const canEditExpenses = permissionRow.can_write && editable && (elevated || isAssignee);
    const capabilities = { canEdit: canEditCostItems || canEditManhour || canEditExpenses || canEditOther,
      canEditAllSections: permissionRow.can_write && editable && elevated, editableSections: [...assignedSections].sort(),
      canSubmit: permissionRow.can_write && editable && elevated,
      // Admin may decide its own estimate (mirrors adminSelfDecision in routes/estimates.ts); other owners need a second approver.
      canApprove: permissionRow.can_approve && header.status === "Engineering Review" && (actor.id !== header.ownerId || hasRole(actor, "Admin")),
      canRequestRevision: permissionRow.can_approve && header.status === "Engineering Review" && (actor.id !== header.ownerId || hasRole(actor, "Admin")),
      canCreateRevision: permissionRow.can_write && elevated && ["Approved", "Locked"].includes(header.status),
      canManageAssignments: permissionRow.can_write && editable && elevated, canUpdateContingency: permissionRow.can_write && editable && elevated,
      canEditCostItems, canEditManhour, canEditExpenses, canEditOtherCosts: canEditOther };
    return { header, capabilities, costItems, manhourLines, expenseLines, otherCostLines, assignments, revisionHistory, validationIssues };
  });
}
