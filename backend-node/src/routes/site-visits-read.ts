import sql from "mssql/msnodesqlv8.js";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import {
  booleanQuery,
  clampedInteger,
  optionalPositiveLong,
  optionalText,
  parseDateOnly,
  positiveLong,
} from "../http.js";
import {
  reportSlaState,
  SITE_VISIT_PERMISSIONS,
} from "../site-visit-common.js";
import {
  loadVisitDetail,
  requiredSkillCodes,
  skillMatch,
  visitSummary,
  visitSummaryColumns,
  visitSummaryFrom,
} from "../site-visit-data.js";
import { loadSalesIntakeDetail } from "./sales-intakes.js";
import type { CurrentUserService } from "../users.js";

type Row = Record<string, unknown>;
function countRows(result: { recordset: Row[] }) {
  return result.recordset.map((r) => ({
    label: r.label ?? "—",
    value: Number(r.value),
  }));
}
function dateAt(value: unknown, fallback: Date): Date {
  const text = value ? parseDateOnly(value, "Calendar date") : null;
  return text ? new Date(`${text}T00:00:00.000Z`) : fallback;
}

export function registerSiteVisitReadRoutes(
  app: FastifyInstance,
  _config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  app.get("/api/v1/site-visits/", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const qv = request.query as Row,
      page = clampedInteger(qv.page, 1, 1, 1_000_000),
      pageSize = clampedInteger(qv.pageSize, 25, 1, 100),
      search = optionalText(qv.search, 200, "Search"),
      status = optionalText(qv.status, 50, "Status"),
      customer = optionalPositiveLong(qv.customerId, "Customer"),
      engineer = optionalPositiveLong(qv.engineerId, "Engineer"),
      type = optionalPositiveLong(qv.visitTypeId, "Visit type"),
      from = qv.from ? parseDateOnly(qv.from, "From") : null,
      to = qv.to ? parseDateOnly(qv.to, "To") : null,
      unassigned = booleanQuery(qv.unassigned, false),
      overdue = booleanQuery(qv.reportOverdue, false),
      archived = booleanQuery(qv.includeArchived, false);
    const result = await database.query<Row>(
      `SELECT ${visitSummaryColumns},COUNT_BIG(*) OVER() total ${visitSummaryFrom} WHERE v.deleted_at IS NULL AND(@archived=1 OR v.archived_at IS NULL) AND(@status IS NULL OR v.status=@status) AND(@customer IS NULL OR i.customer_id=@customer) AND(@type IS NULL OR v.visit_type_id=@type) AND(@engineer IS NULL OR EXISTS(SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1 AND a.engineer_id=@engineer)) AND(@unassigned=0 OR NOT EXISTS(SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1)) AND(@overdue=0 OR(v.report_due_at IS NOT NULL AND v.report_due_at<SYSUTCDATETIME() AND(r.status IS NULL OR r.status IN(N'Draft',N'Revision Requested')))) AND(@from IS NULL OR v.scheduled_start>=@from) AND(@to IS NULL OR v.scheduled_start<DATEADD(day,1,CONVERT(datetime2,@to))) AND(@search IS NULL OR v.visit_no LIKE N'%'+@search+N'%' OR i.intake_no LIKE N'%'+@search+N'%' OR i.subject LIKE N'%'+@search+N'%' OR c.name LIKE N'%'+@search+N'%' OR i.site_name LIKE N'%'+@search+N'%') ORDER BY CASE WHEN v.scheduled_start IS NULL THEN 1 ELSE 0 END,v.scheduled_start DESC,v.id DESC OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;`,
      (q) => {
        q.input("archived", sql.Bit, archived);
        q.input("status", sql.NVarChar(50), status);
        q.input("customer", sql.BigInt, customer);
        q.input("engineer", sql.BigInt, engineer);
        q.input("type", sql.BigInt, type);
        q.input("unassigned", sql.Bit, unassigned);
        q.input("overdue", sql.Bit, overdue);
        q.input("from", sql.Date, from);
        q.input("to", sql.Date, to);
        q.input("search", sql.NVarChar(200), search);
        q.input("offset", sql.Int, (page - 1) * pageSize);
        q.input("take", sql.Int, pageSize);
      },
    );
    return {
      items: result.recordset.map(visitSummary),
      page,
      pageSize,
      total: Number(result.recordset[0]?.total ?? 0),
    };
  });

  app.get("/api/v1/site-visits/calendar", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const qv = request.query as Row,
      today = new Date(),
      from = dateAt(qv.from, new Date(today.valueOf() - 7 * 86_400_000)),
      to = dateAt(qv.to, new Date(today.valueOf() + 42 * 86_400_000)),
      engineer = optionalPositiveLong(qv.engineerId, "Engineer"),
      department = optionalText(qv.department, 100, "Department");
    if (to < from || to.valueOf() - from.valueOf() > 400 * 86_400_000)
      throw new ApiError(
        400,
        "validation_failed",
        "The calendar range is invalid or exceeds 400 days.",
      );
    const end = new Date(to.valueOf() + 86_400_000);
    const [visits, unavailable] = await Promise.all([
      database.query<Row>(
        `SELECT v.id,v.visit_no,v.status,c.name customer_name,i.site_name,t.name_en visit_type_name,v.scheduled_start,v.scheduled_end,v.travel_minutes_before,v.travel_minutes_after,ISNULL((SELECT STRING_AGG(CONVERT(nvarchar(20),a.engineer_id),N',') FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1),N'') engineer_ids,ISNULL((SELECT STRING_AGG(u.name,N', ') FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id WHERE a.visit_id=v.id AND a.is_active=1),N'') engineer_names FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id WHERE v.deleted_at IS NULL AND v.archived_at IS NULL AND v.scheduled_start IS NOT NULL AND v.scheduled_start<@to AND v.scheduled_end>=@from AND(@department IS NULL OR v.department=@department) AND(@engineer IS NULL OR EXISTS(SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1 AND a.engineer_id=@engineer)) ORDER BY v.scheduled_start;`,
        (q) => {
          q.input("from", sql.DateTimeOffset, from);
          q.input("to", sql.DateTimeOffset, end);
          q.input("engineer", sql.BigInt, engineer);
          q.input("department", sql.NVarChar(100), department);
        },
      ),
      database.query<Row>(
        `SELECT e.id,e.user_id,u.name user_name,e.kind,e.reason,e.starts_at,e.ends_at FROM dbo.engineer_availability e INNER JOIN dbo.users u ON u.id=e.user_id WHERE e.deleted_at IS NULL AND e.starts_at<@to AND e.ends_at>=@from AND(@engineer IS NULL OR e.user_id=@engineer) ORDER BY e.starts_at;`,
        (q) => {
          q.input("from", sql.DateTimeOffset, from);
          q.input("to", sql.DateTimeOffset, end);
          q.input("engineer", sql.BigInt, engineer);
        },
      ),
    ]);
    return {
      from,
      to: end,
      visits: visits.recordset.map((r) => ({
        visitId: Number(r.id),
        visitNumber: r.visit_no,
        status: r.status,
        customerName: r.customer_name,
        siteName: r.site_name,
        visitTypeName: r.visit_type_name,
        startsAt: r.scheduled_start,
        endsAt: r.scheduled_end,
        travelMinutesBefore: Number(r.travel_minutes_before),
        travelMinutesAfter: Number(r.travel_minutes_after),
        engineerIds: String(r.engineer_ids)
          .split(",")
          .filter(Boolean)
          .map(Number),
        engineerNames: r.engineer_names,
      })),
      unavailable: unavailable.recordset.map((r) => ({
        id: Number(r.id),
        userId: Number(r.user_id),
        userName: r.user_name,
        kind: r.kind,
        reason: r.reason,
        startsAt: r.starts_at,
        endsAt: r.ends_at,
      })),
    };
  });

  app.get("/api/v1/site-visits/my-assignments", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const actor = await users.required(request),
      includeClosed = booleanQuery((request.query as Row).includeClosed, false);
    const result = await database.query<Row>(
      `SELECT v.id visit_id,v.visit_no,v.status visit_status,a.id assignment_id,a.status assignment_status,a.assignment_role,c.name customer_name,i.site_name,i.site_address,i.subject,t.name_en visit_type_name,v.scheduled_start,v.scheduled_end,i.contact_name,i.contact_phone,v.checked_in_at,v.checked_out_at,v.report_due_at,r.status report_status,r.submitted_at,a.skill_match_percent,v.row_version visit_row_version,a.row_version assignment_row_version FROM dbo.site_visit_assignments a INNER JOIN dbo.site_visits v ON v.id=a.visit_id INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id LEFT JOIN dbo.site_visit_reports r ON r.visit_id=v.id WHERE a.engineer_id=@actor AND a.is_active=1 AND v.deleted_at IS NULL AND v.archived_at IS NULL AND(@closed=1 OR v.status NOT IN(N'Closed',N'Cancelled')) ORDER BY CASE WHEN v.scheduled_start IS NULL THEN 1 ELSE 0 END,v.scheduled_start,v.id;`,
      (q) => {
        q.input("actor", sql.BigInt, actor.id);
        q.input("closed", sql.Bit, includeClosed);
      },
    );
    return result.recordset.map((r) => ({
      visitId: Number(r.visit_id),
      visitNumber: r.visit_no,
      visitStatus: r.visit_status,
      assignmentId: Number(r.assignment_id),
      assignmentStatus: r.assignment_status,
      assignmentRole: r.assignment_role,
      customerName: r.customer_name,
      siteName: r.site_name,
      siteAddress: r.site_address,
      subject: r.subject,
      visitTypeName: r.visit_type_name,
      scheduledStart: r.scheduled_start,
      scheduledEnd: r.scheduled_end,
      contactName: r.contact_name,
      contactPhone: r.contact_phone,
      checkedInAt: r.checked_in_at,
      checkedOutAt: r.checked_out_at,
      reportDueAt: r.report_due_at,
      reportSlaState: reportSlaState(
        r.report_due_at as Date | null,
        r.report_status as string | null,
        r.submitted_at as Date | null,
      ),
      reportStatus: r.report_status,
      skillMatchPercent: Number(r.skill_match_percent),
      rowVersion: Buffer.isBuffer(r.visit_row_version)
        ? r.visit_row_version.toString("base64")
        : "",
      assignmentRowVersion: Buffer.isBuffer(r.assignment_row_version)
        ? r.assignment_row_version.toString("base64")
        : "",
    }));
  });

  app.get("/api/v1/site-visits/dashboard/engineering", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const counts = (
      await database.query<Row>(
        `SELECT(SELECT COUNT_BIG(*) FROM dbo.site_visits v WHERE v.deleted_at IS NULL AND v.status NOT IN(N'Cancelled',N'Closed') AND NOT EXISTS(SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1)) awaiting,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN(N'Pending Engineer Confirmation',N'Pending Customer Confirmation')) confirmation,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND scheduled_start>=CONVERT(datetimeoffset,CONVERT(date,SYSUTCDATETIME())) AND scheduled_start<DATEADD(day,1,CONVERT(datetimeoffset,CONVERT(date,SYSUTCDATETIME()))) AND status NOT IN(N'Cancelled',N'Closed')) today,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND scheduled_start>=CONVERT(datetimeoffset,CONVERT(date,SYSUTCDATETIME())) AND scheduled_start<DATEADD(day,7,CONVERT(datetimeoffset,CONVERT(date,SYSUTCDATETIME()))) AND status NOT IN(N'Cancelled',N'Closed')) week,(SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments WHERE is_active=1 AND conflict_override=1) conflicts,(SELECT COUNT_BIG(*) FROM dbo.site_visits v LEFT JOIN dbo.site_visit_reports r ON r.visit_id=v.id WHERE v.deleted_at IS NULL AND v.report_due_at<SYSUTCDATETIME() AND(r.status IS NULL OR r.status IN(N'Draft',N'Revision Requested'))) overdue;`,
      )
    ).recordset[0]!;
    const [workload, demand, attention] = await Promise.all([
      database.query<Row>(
        `SELECT TOP(20)u.name label,COUNT_BIG(*) value FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id INNER JOIN dbo.site_visits v ON v.id=a.visit_id WHERE a.is_active=1 AND v.deleted_at IS NULL AND v.status NOT IN(N'Cancelled',N'Closed') GROUP BY u.name ORDER BY COUNT_BIG(*) DESC,u.name;`,
      ),
      database.query<Row>(
        `SELECT TOP(20)k.name_en label,COUNT_BIG(*) value FROM dbo.sales_intake_skills s INNER JOIN dbo.visit_skills k ON k.id=s.skill_id INNER JOIN dbo.sales_intakes i ON i.id=s.intake_id WHERE i.deleted_at IS NULL AND i.status NOT IN(N'Cancelled',N'Closed') GROUP BY k.name_en ORDER BY COUNT_BIG(*) DESC,k.name_en;`,
      ),
      database.query<Row>(
        `SELECT TOP(12)${visitSummaryColumns} ${visitSummaryFrom} WHERE v.deleted_at IS NULL AND v.archived_at IS NULL AND(v.status IN(N'Tentative',N'Reschedule Requested',N'Pending Engineer Confirmation') OR(v.report_due_at<SYSUTCDATETIME() AND(r.status IS NULL OR r.status IN(N'Draft',N'Revision Requested')))) ORDER BY CASE WHEN v.report_due_at<SYSUTCDATETIME() THEN 0 ELSE 1 END,v.scheduled_start,v.id;`,
      ),
    ]);
    return {
      awaitingAssignment: Number(counts.awaiting),
      awaitingConfirmation: Number(counts.confirmation),
      visitsToday: Number(counts.today),
      visitsThisWeek: Number(counts.week),
      scheduleConflicts: Number(counts.conflicts),
      reportsOverdue: Number(counts.overdue),
      workloadByEngineer: countRows(workload),
      skillDemand: countRows(demand),
      attention: attention.recordset.map(visitSummary),
    };
  });

  app.get("/api/v1/site-visits/dashboard/management", async (request) => {
    await users.demandPermission(request, "report.read");
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const c = (
      await database.query<Row>(
        `DECLARE @i bigint=(SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL),@v bigint=(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL); SELECT @i intakes,@v visits,ISNULL((SELECT AVG(CONVERT(decimal(18,2),DATEDIFF(hour,i.created_at,v.customer_confirmed_at))/24.0) FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id WHERE v.deleted_at IS NULL AND v.customer_confirmed_at IS NOT NULL),0) lead,CASE WHEN @v=0 THEN 0 ELSE CONVERT(decimal(9,2),(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN(N'Completed',N'Closed'))*100.0/@v) END completion,ISNULL((SELECT CONVERT(decimal(9,2),SUM(CASE WHEN submitted_at<=due_at THEN 1.0 ELSE 0 END)*100.0/NULLIF(COUNT_BIG(*),0)) FROM dbo.site_visit_reports WHERE due_at IS NOT NULL),0) sla,CASE WHEN @v=0 THEN 0 ELSE CONVERT(decimal(9,2),(SELECT COUNT_BIG(DISTINCT source_id) FROM dbo.site_visit_links WHERE source_type=N'SiteVisit' AND target_type=N'Estimate')*100.0/@v) END estimate_rate,CASE WHEN @v=0 THEN 0 ELSE CONVERT(decimal(9,2),(SELECT COUNT_BIG(DISTINCT source_id) FROM dbo.site_visit_links WHERE source_type=N'SiteVisit' AND target_type=N'Project')*100.0/@v) END project_rate,CASE WHEN @v=0 THEN 0 ELSE CONVERT(decimal(9,2),(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status=N'Cancelled')*100.0/@v) END cancelled,CASE WHEN @v=0 THEN 0 ELSE CONVERT(decimal(9,2),(SELECT COUNT_BIG(DISTINCT visit_id) FROM dbo.site_visit_schedule_history WHERE previous_start IS NOT NULL)*100.0/@v) END rescheduled,CASE WHEN @v=0 THEN 0 ELSE CONVERT(decimal(9,2),(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status=N'Customer No-show')*100.0/@v) END no_show;`,
      )
    ).recordset[0]!;
    const queries = [
      `SELECT TOP(15)c.name label,COUNT_BIG(*) value FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.customers c ON c.id=i.customer_id WHERE v.deleted_at IS NULL GROUP BY c.name ORDER BY COUNT_BIG(*) DESC;`,
      `SELECT TOP(15)u.name label,COUNT_BIG(*) value FROM dbo.sales_intakes i INNER JOIN dbo.users u ON u.id=i.sales_owner_id WHERE i.deleted_at IS NULL GROUP BY u.name ORDER BY COUNT_BIG(*) DESC;`,
      `SELECT TOP(15)u.name label,COUNT_BIG(*) value FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id INNER JOIN dbo.site_visits v ON v.id=a.visit_id WHERE a.is_active=1 AND v.deleted_at IS NULL GROUP BY u.name ORDER BY COUNT_BIG(*) DESC;`,
      `SELECT TOP(15)NULLIF(v.department,N'') label,COUNT_BIG(*) value FROM dbo.site_visits v WHERE v.deleted_at IS NULL GROUP BY v.department ORDER BY COUNT_BIG(*) DESC;`,
      `SELECT TOP(20)t.name_en label,COUNT_BIG(*) value FROM dbo.site_visits v INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id WHERE v.deleted_at IS NULL GROUP BY t.name_en ORDER BY COUNT_BIG(*) DESC;`,
    ];
    const groups = await Promise.all(
      queries.map((x) => database.query<Row>(x)),
    );
    return {
      totalIntakes: Number(c.intakes),
      totalVisits: Number(c.visits),
      averageLeadTimeDays: Number(c.lead),
      completionRatePercent: Number(c.completion),
      reportSlaCompliancePercent: Number(c.sla),
      visitToEstimateConversionPercent: Number(c.estimate_rate),
      visitToProjectConversionPercent: Number(c.project_rate),
      cancelledRatePercent: Number(c.cancelled),
      rescheduledRatePercent: Number(c.rescheduled),
      noShowRatePercent: Number(c.no_show),
      byCustomer: countRows(groups[0]!),
      bySalesOwner: countRows(groups[1]!),
      byEngineer: countRows(groups[2]!),
      byDepartment: countRows(groups[3]!),
      byVisitType: countRows(groups[4]!),
    };
  });

  app.get("/api/v1/site-visits/:id", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Visit id"),
      detail = await loadVisitDetail(database, id, actor.id, actor.role);
    if (!detail)
      throw new ApiError(404, "visit_not_found", "Site visit not found.");
    return detail;
  });
  app.get("/api/v1/site-visits/:id/brief", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Visit id"),
      visit = await loadVisitDetail(database, id, actor.id, actor.role);
    if (!visit)
      throw new ApiError(404, "visit_not_found", "Site visit not found.");
    const intake = await loadSalesIntakeDetail(
      database,
      visit.intakeId,
      actor.role,
    );
    if (!intake)
      throw new ApiError(404, "intake_not_found", "Sales intake not found.");
    const previous = await database.query<Row>(
      `SELECT TOP(10)v.id,v.visit_no,t.name_en visit_type_name,v.status,v.scheduled_start,ISNULL((SELECT STRING_AGG(u.name,N', ') FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id WHERE a.visit_id=v.id AND a.is_active=1),N'') engineer_names,r.status report_status FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id LEFT JOIN dbo.site_visit_reports r ON r.visit_id=v.id WHERE v.deleted_at IS NULL AND v.id<>@visit AND i.customer_id=@customer ORDER BY v.scheduled_start DESC,v.id DESC;`,
      (q) => {
        q.input("visit", sql.BigInt, id);
        q.input("customer", sql.BigInt, visit.customerId);
      },
    );
    const questions = [
      ...intake.readiness.checks
        .filter((x) => !x.passed)
        .map((x) => String(x.label)),
      ...intake.reviews
        .filter((x) => Boolean(x.missingInformation))
        .slice(0, 1)
        .flatMap((x) =>
          String(x.missingInformation)
            .split(";")
            .map((s: string) => s.trim())
            .filter(Boolean),
        ),
    ];
    return {
      visit,
      requirement: intake.requirement,
      machine: intake.machine,
      purposes: intake.purposes,
      intakeAttachments: intake.attachments,
      openQuestions: questions,
      previousVisits: previous.recordset.map((r) => ({
        id: Number(r.id),
        number: r.visit_no,
        visitTypeName: r.visit_type_name,
        status: r.status,
        scheduledStart: r.scheduled_start,
        engineerNames: r.engineer_names,
        reportStatus: r.report_status,
      })),
      emergencyContact: [
        visit.contactName
          ? `${visit.contactName} ${visit.contactPhone}`.trim()
          : "",
        `Sales: ${intake.salesOwnerName}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  app.get("/api/v1/site-visits/:id/candidates", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id"),
      visit = (
        await database.query<Row>(
          `SELECT v.intake_id,v.scheduled_start,v.scheduled_end,v.travel_minutes_before,v.travel_minutes_after,ISNULL(s.travel_minutes,60) site_travel FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id LEFT JOIN dbo.customer_sites s ON s.id=i.site_id WHERE v.id=@id AND v.deleted_at IS NULL;`,
          (q) => q.input("id", sql.BigInt, id),
        )
      ).recordset[0];
    if (!visit)
      throw new ApiError(404, "visit_not_found", "Site visit not found.");
    const required = await requiredSkillCodes(
        database,
        Number(visit.intake_id),
      ),
      engineers = await database.query<Row>(
        `SELECT u.id,u.name,u.email,u.department,r.code role,ISNULL((SELECT STRING_AGG(k.code,N',') FROM dbo.engineer_skills es INNER JOIN dbo.visit_skills k ON k.id=es.skill_id WHERE es.user_id=u.id),N'') skills,(SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a INNER JOIN dbo.site_visits av ON av.id=a.visit_id WHERE a.engineer_id=u.id AND a.is_active=1 AND av.deleted_at IS NULL AND av.status NOT IN(N'Cancelled',N'Closed',N'Completed',N'Customer No-show')) open_assignments,(SELECT ISNULL(SUM(DATEDIFF(minute,av.scheduled_start,av.scheduled_end)),0) FROM dbo.site_visit_assignments a INNER JOIN dbo.site_visits av ON av.id=a.visit_id WHERE a.engineer_id=u.id AND a.is_active=1 AND av.deleted_at IS NULL AND av.scheduled_start IS NOT NULL AND av.status NOT IN(N'Cancelled',N'Closed',N'Customer No-show') AND av.scheduled_start>=DATEADD(day,-7,SYSUTCDATETIME()) AND av.scheduled_start<DATEADD(day,21,SYSUTCDATETIME())) scheduled_minutes,CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.site_visit_assignments a WHERE a.visit_id=@visit AND a.engineer_id=u.id AND a.is_active=1) THEN 1 ELSE 0 END AS bit) assigned FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id WHERE u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Engineering Coordinator',N'Project Manager',N'Admin') ORDER BY u.name;`,
        (q) => q.input("visit", sql.BigInt, id),
      );
    const result = [];
    for (const r of engineers.recordset) {
      const skills = String(r.skills).split(",").filter(Boolean),
        match = skillMatch(required, skills);
      let conflictCount = 0,
        conflictDetail = "";
      if (visit.scheduled_start && visit.scheduled_end) {
        const checked = await database.withSession(async (executor) => {
          const check = new sql.Request(
            executor as InstanceType<typeof sql.ConnectionPool>,
          );
          check.input("engineer_id", sql.BigInt, Number(r.id));
          check.input("starts_at", sql.DateTimeOffset, visit.scheduled_start);
          check.input("ends_at", sql.DateTimeOffset, visit.scheduled_end);
          check.input(
            "travel_minutes_before",
            sql.Int,
            Number(visit.travel_minutes_before),
          );
          check.input(
            "travel_minutes_after",
            sql.Int,
            Number(visit.travel_minutes_after),
          );
          check.input("exclude_visit_id", sql.BigInt, id);
          check.input("allow_conflict", sql.Bit, true);
          check.output("conflict_count", sql.Int);
          check.output("conflict_detail", sql.NVarChar(1000));
          return check.execute("dbo.assert_engineer_available");
        });
        conflictCount = Number(checked.output.conflict_count ?? 0);
        conflictDetail = String(checked.output.conflict_detail ?? "");
      }
      result.push({
        id: Number(r.id),
        name: r.name,
        email: r.email,
        department: r.department,
        role: r.role,
        skills,
        skillMatchPercent: match.percent,
        missingSkills: match.missing,
        openAssignments: Number(r.open_assignments),
        scheduledMinutesInWindow: Number(r.scheduled_minutes),
        conflictCount,
        conflictDetail,
        travelMinutes: Number(visit.site_travel),
        isActive: true,
        isAssigned: Boolean(r.assigned),
      });
    }
    return result.sort(
      (a, b) =>
        b.skillMatchPercent - a.skillMatchPercent ||
        a.conflictCount - b.conflictCount ||
        a.openAssignments - b.openAssignments ||
        String(a.name).localeCompare(String(b.name)),
    );
  });
}
