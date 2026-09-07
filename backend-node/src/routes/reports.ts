import type { FastifyInstance } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { booleanQuery, firstQueryValue, optionalPositiveLong, optionalText, parseDateOnly, positiveLong } from "../http.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import type { CurrentUserService } from "../users.js";

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shift(value: string, years: number, days = 0): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function optionalInt(value: unknown, label: string): number | null {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === "") return null;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return Number(raw);
}

function range(query: Record<string, unknown>, timeZone: string): { from: string; to: string } {
  const to = parseDateOnly(firstQueryValue(query.to), "Report end date", true) ?? todayIn(timeZone);
  const from = parseDateOnly(firstQueryValue(query.from), "Report start date", true) ?? shift(to, -1);
  if (to < from) throw new ApiError(400, "validation_failed", "The report end date cannot be before its start date.");
  if (to > shift(from, 10)) throw new ApiError(400, "validation_failed", "A report range cannot exceed ten years.");
  return { from, to };
}

export function registerReportRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/reports/project-cost", async (request) => {
    await users.demandPermission(request, "report.read");
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const projectId = positiveLong((request.query as Record<string, unknown>).projectId, "Project id");
    await demandProjectScope(database, actor, projectId);
    const result = await database.query<Record<string, unknown> & {
      id: number | string; project_no: string; name: string; status: string; estimate_no: string;
      material_total: number | string; engineering_total: number | string; outsource_total: number | string;
      transportation_total: number | string; accommodation_total: number | string; other_total: number | string;
      contingency_total: number | string; estimate_total: number | string; committed: number | string;
      received_value: number | string; open_value: number | string; material_consumed: number | string;
      reserved_value: number | string; open_pr_value: number | string;
    }>(`
      WITH received AS (SELECT gl.po_line_id,SUM(gl.received_qty) qty FROM dbo.grn_lines gl
        INNER JOIN dbo.grns g ON g.id=gl.grn_id AND g.status=N'Confirmed' GROUP BY gl.po_line_id),
      po_value AS (SELECT COALESCE(SUM(pol.qty*pol.unit_price),0) committed,
        COALESCE(SUM(COALESCE(r.qty,0)*pol.unit_price),0) received_value,
        COALESCE(SUM(CASE WHEN pol.qty>COALESCE(r.qty,0) THEN (pol.qty-COALESCE(r.qty,0))*pol.unit_price ELSE 0 END),0) open_value
        FROM dbo.mat_po_lines pol INNER JOIN dbo.mat_pos po ON po.id=pol.po_id AND po.project_id=@project_id
          AND po.deleted_at IS NULL AND po.status<>N'Cancelled' LEFT JOIN received r ON r.po_line_id=pol.id),
      actual AS (SELECT COALESCE(SUM(-t.qty*t.unit_cost),0) material_consumed FROM dbo.stock_txns t
        WHERE t.project_id=@project_id AND t.txn_type IN(N'MIR_ISSUE',N'MIR_RETURN')),
      reserved AS (SELECT COALESCE(SUM(r.qty*i.avg_unit_cost),0) reserved_value FROM dbo.reservations r
        INNER JOIN dbo.mat_items i ON i.id=r.item_id WHERE r.project_id=@project_id AND r.status=N'Active'),
      open_pr AS (SELECT COALESCE(SUM(line.line_total),0) open_pr_value FROM dbo.mat_pr_lines line
        INNER JOIN dbo.mat_prs pr ON pr.id=line.pr_id AND pr.project_id=@project_id AND pr.deleted_at IS NULL
          AND pr.status IN(N'Draft',N'In Approval',N'Approved'))
      SELECT p.id,p.project_no,p.name,p.status,e.estimate_no,totals.material_total,totals.engineering_total,
        totals.outsource_total,totals.transportation_total,totals.accommodation_total,totals.other_total,
        totals.contingency_total,totals.total AS estimate_total,po.committed,po.received_value,po.open_value,
        actual.material_consumed,reserved.reserved_value,open_pr.open_pr_value
      FROM dbo.projects p INNER JOIN dbo.estimates e ON e.id=p.estimate_id
      INNER JOIN dbo.v_estimate_totals totals ON totals.estimate_id=p.estimate_id
      CROSS JOIN po_value po CROSS JOIN actual CROSS JOIN reserved CROSS JOIN open_pr
      WHERE p.id=@project_id AND p.deleted_at IS NULL;
    `, (sqlRequest) => sqlRequest.input("project_id", sql.BigInt, projectId));
    const row = result.recordset[0];
    if (!row) throw new ApiError(404, "project_not_found", "Project not found.");
    const material = Number(row.material_total); const actual = Number(row.material_consumed);
    const openPo = Number(row.open_value); const reserved = Number(row.reserved_value); const openPr = Number(row.open_pr_value);
    const forecastExposure = actual + openPo + reserved + openPr;
    return {
      project: { id: Number(row.id), number: row.project_no, name: row.name, status: row.status, estimateNumber: row.estimate_no },
      budget: { approvedMaterial: material, approvedEngineering: Number(row.engineering_total), approvedOutsource: Number(row.outsource_total),
        approvedTransportation: Number(row.transportation_total), approvedAccommodation: Number(row.accommodation_total),
        approvedOther: Number(row.other_total), contingency: Number(row.contingency_total), approvedEstimateTotal: Number(row.estimate_total) },
      procurement: { poCommitted: Number(row.committed), receivedAtPoPrice: Number(row.received_value), openPoCommitment: openPo, openPr, reserved },
      actual: { materialConsumed: actual }, forecastExposure, remainingMaterialBudget: material - actual,
      remainingMaterialBudgetAfterActual: material - actual, remainingMaterialBudgetAfterForecast: material - forecastExposure,
      accountingScope: "Material actuals are the net MIR issue/return ledger at recorded unit cost.",
      forecastScope: "Forecast exposure is net MIR actual plus open PO, active reservation, and open PR value. Received but unissued stock is reported at PO price separately and is not included because the ledger does not link an issue to a receipt lot.",
    };
  });

  app.get("/api/v1/reports/inventory-value", async (request) => {
    await users.demandPermission(request, "report.read"); await users.demandPermission(request, "inventory.read");
    const query = request.query as Record<string, unknown>; const today = todayIn(config.businessTimeZone);
    const asOf = parseDateOnly(firstQueryValue(query.asOf), "Inventory valuation date", true) ?? today;
    const slowMovingDays = optionalInt(query.slowMovingDays, "Slow-moving days") ?? 90;
    if (slowMovingDays < 1 || slowMovingDays > 3650) throw new ApiError(400, "validation_failed", "Slow-moving days must be between 1 and 3650.");
    if (asOf < shift(today, -20) || asOf > shift(today, 0, 1)) throw new ApiError(400, "validation_failed", "Inventory valuation date is outside the supported range.");
    const search = optionalText(query.search, 200, "Search"); const slowOnly = booleanQuery(query.slowMovingOnly, false);
    const result = await database.query<Record<string, unknown> & {
      id: number | string; item_code: string; part_no: string; description: string; brand: string; unit: string;
      location: string; usable: number | string; quarantine: number | string; avg_unit_cost: number | string;
      usable_value: number | string; quarantine_value: number | string; last_movement_at: Date | string | null;
      last_outbound_at: Date | string | null; inactive_days: number;
    }>(`
      WITH movement AS (SELECT t.item_id,SUM(CASE WHEN t.bucket=N'stock' THEN t.qty ELSE 0 END) usable,
        SUM(CASE WHEN t.bucket=N'quarantine' THEN t.qty ELSE 0 END) quarantine,MAX(t.occurred_at) last_movement_at,
        MAX(CASE WHEN t.txn_type IN(N'MIR_ISSUE',N'SUPPLIER_RETURN',N'TRANSFER_OUT') THEN t.occurred_at END) last_outbound_at
        FROM dbo.stock_txns t WHERE t.occurred_at<DATEADD(day,1,CONVERT(datetime2,@as_of)) GROUP BY t.item_id)
      SELECT i.id,i.item_code,i.part_no,i.description,i.brand,i.unit,i.location,
        CONVERT(decimal(19,4),COALESCE(m.usable,0)) usable,CONVERT(decimal(19,4),COALESCE(m.quarantine,0)) quarantine,
        i.avg_unit_cost,CONVERT(decimal(19,4),COALESCE(m.usable,0)*i.avg_unit_cost) usable_value,
        CONVERT(decimal(19,4),COALESCE(m.quarantine,0)*i.avg_unit_cost) quarantine_value,
        m.last_movement_at,m.last_outbound_at,DATEDIFF(day,CONVERT(date,COALESCE(m.last_outbound_at,m.last_movement_at,i.created_at)),@as_of) inactive_days
      FROM dbo.mat_items i LEFT JOIN movement m ON m.item_id=i.id WHERE i.is_active=1 AND i.deleted_at IS NULL
        AND i.created_at<DATEADD(day,1,CONVERT(datetimeoffset,@as_of))
        AND (@search IS NULL OR i.item_code LIKE N'%'+@search+N'%' OR i.part_no LIKE N'%'+@search+N'%' OR i.description LIKE N'%'+@search+N'%')
        AND (@slow_only=0 OR (COALESCE(m.usable,0)+COALESCE(m.quarantine,0)>0
          AND DATEDIFF(day,CONVERT(date,COALESCE(m.last_outbound_at,m.last_movement_at,i.created_at)),@as_of)>=@slow_days))
      ORDER BY inactive_days DESC,i.item_code;
    `, (sqlRequest) => { sqlRequest.input("as_of", sql.Date, asOf); sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("slow_only", sql.Bit, slowOnly); sqlRequest.input("slow_days", sql.Int, slowMovingDays); });
    const items = result.recordset.map((row) => {
      const usable = Number(row.usable); const quarantine = Number(row.quarantine); const inactiveDays = row.inactive_days;
      return { id: Number(row.id), itemCode: row.item_code, partNumber: row.part_no, description: row.description,
        brand: row.brand, unit: row.unit, location: row.location, usable, quarantine,
        averageUnitCost: Number(row.avg_unit_cost), usableValue: Number(row.usable_value), quarantineValue: Number(row.quarantine_value),
        lastMovementAt: row.last_movement_at, lastOutboundAt: row.last_outbound_at, inactiveDays,
        isSlowMoving: inactiveDays >= slowMovingDays && usable + quarantine > 0 };
    });
    const slowItems = items.filter((item) => item.isSlowMoving);
    return { asOf, slowMovingDays, valuationMethod: "current_average_unit_cost", summary: {
      itemCount: items.length, usableValue: items.reduce((sum, item) => sum + item.usableValue, 0),
      quarantineValue: items.reduce((sum, item) => sum + item.quarantineValue, 0),
      totalValue: items.reduce((sum, item) => sum + item.usableValue + item.quarantineValue, 0),
      slowMovingItemCount: slowItems.length, slowMovingValue: slowItems.reduce((sum, item) => sum + item.usableValue + item.quarantineValue, 0),
    }, items };
  });

  app.get("/api/v1/reports/supplier-performance", async (request) => {
    await users.demandPermission(request, "report.read"); await users.demandPermission(request, "procurement.read");
    const actor = await users.required(request); const query = request.query as Record<string, unknown>;
    const dates = range(query, config.businessTimeZone); const supplierId = optionalPositiveLong(query.supplierId, "Supplier id");
    const result = await database.query<Record<string, unknown> & {
      supplier_id: number | string; supplier_code: string; supplier_name: string; po_count: number | string;
      ordered_qty: number | string; ordered_value: number | string; received_qty: number | string;
      accepted_qty: number | string; held_rejected_qty: number | string; received_value: number | string;
      open_value: number | string; fully_received_count: number; expected_count: number; on_time_count: number;
      fill_rate: number | string | null; accepted_fill_rate: number | string | null; defect_rate: number | string | null;
      on_time_rate: number | string | null; avg_lead_days: number | string | null;
    }>(`
      WITH scoped_po AS (SELECT po.id,po.supplier_id,po.order_date,po.expected_date FROM dbo.mat_pos po
        INNER JOIN dbo.projects p ON p.id=po.project_id WHERE po.deleted_at IS NULL AND po.status<>N'Cancelled'
          AND po.order_date>=@from AND po.order_date<=@to AND (@supplier_id IS NULL OR po.supplier_id=@supplier_id)
          AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=p.id AND pm.user_id=@actor))),
      po_lines AS (SELECT po.id po_id,po.supplier_id,po.order_date,po.expected_date,line.id po_line_id,line.qty ordered_qty,line.unit_price
        FROM scoped_po po INNER JOIN dbo.mat_po_lines line ON line.po_id=po.id),
      receipt_by_line_day AS (SELECT ordered.po_line_id,ordered.po_id,g.received_date,SUM(line.received_qty) received_qty
        FROM po_lines ordered INNER JOIN dbo.grn_lines line ON line.po_line_id=ordered.po_line_id
        INNER JOIN dbo.grns g ON g.id=line.grn_id AND g.status=N'Confirmed' GROUP BY ordered.po_line_id,ordered.po_id,g.received_date),
      cumulative_line_receipt AS (SELECT po_line_id,po_id,received_date,SUM(received_qty) OVER(PARTITION BY po_line_id ORDER BY received_date ROWS UNBOUNDED PRECEDING) cumulative_qty FROM receipt_by_line_day),
      line_completion AS (SELECT cumulative.po_line_id,cumulative.po_id,MIN(cumulative.received_date) completed_date
        FROM cumulative_line_receipt cumulative INNER JOIN po_lines ordered ON ordered.po_line_id=cumulative.po_line_id
          AND cumulative.cumulative_qty>=ordered.ordered_qty GROUP BY cumulative.po_line_id,cumulative.po_id),
      receipt_line_total AS (SELECT ordered.po_line_id,SUM(line.received_qty) received_qty,SUM(line.accepted_qty) accepted_qty,
        SUM(line.damaged_qty) damaged_qty,SUM(line.rejected_qty) rejected_qty,SUM(line.received_qty*ordered.unit_price) received_value
        FROM po_lines ordered INNER JOIN dbo.grn_lines line ON line.po_line_id=ordered.po_line_id
        INNER JOIN dbo.grns g ON g.id=line.grn_id AND g.status=N'Confirmed' GROUP BY ordered.po_line_id),
      per_po AS (SELECT ordered.po_id id,ordered.supplier_id,ordered.order_date,ordered.expected_date,SUM(ordered.ordered_qty) ordered_qty,
        SUM(ordered.ordered_qty*ordered.unit_price) ordered_value,SUM(COALESCE(receipt.received_qty,0)) received_qty,
        SUM(COALESCE(receipt.accepted_qty,0)) accepted_qty,SUM(COALESCE(receipt.damaged_qty,0)) damaged_qty,
        SUM(COALESCE(receipt.rejected_qty,0)) rejected_qty,SUM(COALESCE(receipt.received_value,0)) received_value,
        SUM(CASE WHEN ordered.ordered_qty>COALESCE(receipt.received_qty,0) THEN (ordered.ordered_qty-COALESCE(receipt.received_qty,0))*ordered.unit_price ELSE 0 END) open_value,
        CASE WHEN COUNT_BIG(*)=COUNT_BIG(completion.completed_date) THEN MAX(completion.completed_date) END completed_date
        FROM po_lines ordered LEFT JOIN receipt_line_total receipt ON receipt.po_line_id=ordered.po_line_id
        LEFT JOIN line_completion completion ON completion.po_line_id=ordered.po_line_id
        GROUP BY ordered.po_id,ordered.supplier_id,ordered.order_date,ordered.expected_date)
      SELECT s.id supplier_id,s.code supplier_code,s.name supplier_name,COUNT_BIG(*) po_count,
        SUM(p.ordered_qty) ordered_qty,SUM(p.ordered_value) ordered_value,SUM(p.received_qty) received_qty,
        SUM(p.accepted_qty) accepted_qty,SUM(p.damaged_qty+p.rejected_qty) held_rejected_qty,SUM(p.received_value) received_value,
        SUM(p.open_value) open_value,SUM(CASE WHEN p.completed_date IS NOT NULL THEN 1 ELSE 0 END) fully_received_count,
        SUM(CASE WHEN p.completed_date IS NOT NULL AND p.expected_date IS NOT NULL THEN 1 ELSE 0 END) expected_count,
        SUM(CASE WHEN p.completed_date<=p.expected_date THEN 1 ELSE 0 END) on_time_count,
        CONVERT(decimal(9,2),100.0*SUM(p.received_qty)/NULLIF(SUM(p.ordered_qty),0)) fill_rate,
        CONVERT(decimal(9,2),100.0*SUM(p.accepted_qty)/NULLIF(SUM(p.ordered_qty),0)) accepted_fill_rate,
        CONVERT(decimal(9,2),100.0*SUM(p.damaged_qty+p.rejected_qty)/NULLIF(SUM(p.received_qty),0)) defect_rate,
        CONVERT(decimal(9,2),100.0*SUM(CASE WHEN p.completed_date<=p.expected_date THEN 1 ELSE 0 END)/NULLIF(SUM(CASE WHEN p.completed_date IS NOT NULL AND p.expected_date IS NOT NULL THEN 1 ELSE 0 END),0)) on_time_rate,
        AVG(CASE WHEN p.completed_date IS NOT NULL THEN CONVERT(decimal(19,4),DATEDIFF(day,p.order_date,p.completed_date)) END) avg_lead_days
      FROM per_po p INNER JOIN dbo.suppliers s ON s.id=p.supplier_id GROUP BY s.id,s.code,s.name ORDER BY s.name,s.id;
    `, (sqlRequest) => { sqlRequest.input("from", sql.Date, dates.from); sqlRequest.input("to", sql.Date, dates.to);
      sqlRequest.input("actor", sql.BigInt, actor.id); sqlRequest.input("elevated", sql.Bit, isProjectElevated(actor)); sqlRequest.input("supplier_id", sql.BigInt, supplierId); });
    const decimal = (value: number | string | null) => value === null ? null : Number(value);
    return { ...dates, suppliers: result.recordset.map((row) => ({ supplierId: Number(row.supplier_id), supplierCode: row.supplier_code,
      supplierName: row.supplier_name, purchaseOrderCount: Number(row.po_count), orderedQuantity: Number(row.ordered_qty),
      orderedValue: Number(row.ordered_value), receivedQuantity: Number(row.received_qty), acceptedQuantity: Number(row.accepted_qty),
      heldOrRejectedQuantity: Number(row.held_rejected_qty), receivedValue: Number(row.received_value), openValue: Number(row.open_value),
      fullyReceivedPurchaseOrderCount: row.fully_received_count, completedWithExpectedDateCount: row.expected_count,
      onTimeCompletedPurchaseOrderCount: row.on_time_count, fillRatePercent: decimal(row.fill_rate),
      acceptedFillRatePercent: decimal(row.accepted_fill_rate), defectRatePercent: decimal(row.defect_rate),
      onTimeRatePercent: decimal(row.on_time_rate), averageCompletionLeadDays: decimal(row.avg_lead_days) })) };
  });

  app.get("/api/v1/reports/pr-cycle-time", async (request) => {
    await users.demandPermission(request, "report.read"); await users.demandPermission(request, "procurement.read");
    const actor = await users.required(request); const query = request.query as Record<string, unknown>;
    const dates = range(query, config.businessTimeZone); const projectId = optionalPositiveLong(query.projectId, "Project id");
    if (projectId !== null) await demandProjectScope(database, actor, projectId);
    const scoped = `FROM dbo.mat_prs pr INNER JOIN dbo.projects p ON p.id=pr.project_id WHERE pr.deleted_at IS NULL
      AND pr.submitted_at>=@from AND pr.submitted_at<DATEADD(day,1,CONVERT(datetime2,@to))
      AND (@project_id IS NULL OR pr.project_id=@project_id) AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.project_members pm WHERE pm.project_id=p.id AND pm.user_id=@actor))`;
    const result = await database.query<Record<string, unknown>>(`
      WITH scoped_pr AS (SELECT pr.id,pr.created_at,pr.submitted_at,pr.project_id,pr.priority,pr.status ${scoped}),
      ordered_steps AS (SELECT step.pr_id,step.sequence,step.name,step.decision,step.acted_at,
        LAG(step.acted_at) OVER(PARTITION BY step.pr_id ORDER BY step.sequence) started_at
        FROM dbo.mat_pr_approval_steps step INNER JOIN scoped_pr pr ON pr.id=step.pr_id WHERE step.status=N'Completed' AND step.acted_at IS NOT NULL),
      elapsed AS (SELECT pr_id,sequence,name,CONVERT(decimal(19,4),DATEDIFF_BIG(second,started_at,acted_at)/3600.0) hours FROM ordered_steps WHERE started_at IS NOT NULL)
      SELECT name AS stage,COUNT_BIG(*) completed_count,AVG(hours) average_hours,MIN(hours) minimum_hours,MAX(hours) maximum_hours,MIN(sequence) sequence
      FROM elapsed GROUP BY name ORDER BY MIN(sequence);

      WITH scoped_pr AS (SELECT pr.id,pr.created_at,pr.submitted_at,pr.project_id,pr.status ${scoped}),
      final_approval AS (SELECT step.pr_id,MAX(step.acted_at) approved_at FROM dbo.mat_pr_approval_steps step
        INNER JOIN scoped_pr pr ON pr.id=step.pr_id WHERE pr.status IN(N'Approved',N'Converted to PO')
          AND step.status=N'Completed' AND step.decision=N'Approve' AND step.name NOT IN(N'Submitted by Requester',N'PO Creation') GROUP BY step.pr_id),
      first_po AS (SELECT po.pr_id,MIN(po.created_at) converted_at FROM dbo.mat_pos po INNER JOIN scoped_pr pr ON pr.id=po.pr_id WHERE po.deleted_at IS NULL GROUP BY po.pr_id)
      SELECT COUNT_BIG(*) pr_count,AVG(CONVERT(decimal(19,4),DATEDIFF_BIG(second,pr.created_at,pr.submitted_at)/3600.0)) created_to_submitted,
        AVG(CASE WHEN approval.approved_at IS NOT NULL THEN CONVERT(decimal(19,4),DATEDIFF_BIG(second,pr.submitted_at,approval.approved_at)/3600.0) END) submitted_to_approved,
        AVG(CASE WHEN po.converted_at IS NOT NULL AND approval.approved_at IS NOT NULL THEN CONVERT(decimal(19,4),DATEDIFF_BIG(second,approval.approved_at,po.converted_at)/3600.0) END) approved_to_po,
        AVG(CASE WHEN po.converted_at IS NOT NULL THEN CONVERT(decimal(19,4),DATEDIFF_BIG(second,pr.created_at,po.converted_at)/3600.0) END) created_to_po
      FROM scoped_pr pr LEFT JOIN final_approval approval ON approval.pr_id=pr.id LEFT JOIN first_po po ON po.pr_id=pr.id;

      WITH scoped_pr AS (SELECT pr.status ${scoped}) SELECT status,COUNT_BIG(*) total FROM scoped_pr GROUP BY status ORDER BY status;
    `, (sqlRequest) => { sqlRequest.input("from", sql.Date, dates.from); sqlRequest.input("to", sql.Date, dates.to);
      sqlRequest.input("actor", sql.BigInt, actor.id); sqlRequest.input("elevated", sql.Bit, isProjectElevated(actor)); sqlRequest.input("project_id", sql.BigInt, projectId); });
    const stages = result.recordsets[0] as unknown as Array<{ stage: string; completed_count: number | string; average_hours: number | string | null; minimum_hours: number | string | null; maximum_hours: number | string | null }>;
    const lifecycle = (result.recordsets[1] as unknown as Array<{ pr_count: number | string; created_to_submitted: number | string | null; submitted_to_approved: number | string | null; approved_to_po: number | string | null; created_to_po: number | string | null }>)[0]!;
    const statuses = result.recordsets[2] as unknown as Array<{ status: string; total: number | string }>;
    const decimal = (value: number | string | null) => value === null ? null : Number(value);
    return { ...dates, projectId, stages: stages.map((row) => ({ stage: row.stage, completedCount: Number(row.completed_count),
      averageHours: decimal(row.average_hours), minimumHours: decimal(row.minimum_hours), maximumHours: decimal(row.maximum_hours) })),
      lifecycle: { prCount: Number(lifecycle.pr_count), averageCreatedToSubmittedHours: decimal(lifecycle.created_to_submitted),
        averageSubmittedToFinalApprovalHours: decimal(lifecycle.submitted_to_approved),
        averageApprovalToFirstPurchaseOrderHours: decimal(lifecycle.approved_to_po), averageCreatedToFirstPurchaseOrderHours: decimal(lifecycle.created_to_po) },
      statusCounts: Object.fromEntries(statuses.map((row) => [row.status, Number(row.total)])), durationBasis: "elapsed_utc_hours" };
  });
}
