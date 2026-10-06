import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { AppConfig } from "../config.js";
import { insertAudit } from "../audit.js";
import { businessToday } from "../business-date.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import { createStoredDirectory, deleteStoredFile, removeEmptyStoredDirectory } from "../document-storage.js";
import { transferProjectDocuments } from "../project-handover.js";
import { ApiError } from "../errors.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import { endUserCustomerId, registerEndUserUpdateRoute, validateEndUser } from "../end-user.js";
import { bodyObject, clampedInteger, dateOnly, optionalBodyText, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { allowedProjectTransitions, checkProjectTransition, isProjectStatus, progressForStatus, type ProjectStatus } from "../project-lifecycle.js";
import { insertInitialPlan, parseInitialPlan, parseProjectDetails, parseProjectNumber, planSpan, syncProjectPlan, writeProjectDetails } from "../project-initial-plan.js";
import type { ProjectHealth } from "../project-health.js";
import { loadProjectScheduleSummaries } from "../project-overview.js";
import { demandProjectScope, isProjectElevated } from "../project-scope.js";
import { currentScheduleVersion, permissionFor, validateScheduleVersion } from "../schedule-service.js";
import { hasRole } from "../user-roles.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";
import { confirmOpportunityOrder } from "../crm.js";

const STANDARD_FOLDERS = [
  ["00", "To do list"], ["01", "Concept Design and Proposal"], ["02", "Drawing"],
  ["03", "Estimate cost"], ["04", "Quote"], ["05", "PO"], ["06", "Specifications and Documentation"],
  ["07", "Development"], ["08", "Schedule"], ["09", "Installation"], ["10", "Report"],
  ["11", "Manual and Document"], ["12", "DATA & EXAMPLE"], ["13", "Pic and Video"], ["14", "Ref"],
] as const;

type ProjectRow = Record<string, unknown> & {
  id: number | string; project_no: string; name: string; customer_name: string; status: string;
  project_type: string; manager_name: string; start_date: Date | string; target_delivery: Date | string;
  progress: number | string; updated_at: Date | string; row_version: Buffer; total_count: number | string;
  manager_id: number | string; lead_engineer_id: number | string; lead_engineer_name: string;
  po_no: string; po_date: Date | string; actual_delivery: Date | string | null; site: string; remark: string | null;
  customer_id: number | string; end_user_customer_id: number | string | null; end_user_name: string | null; end_user_code: string | null;
};

function shiftDate(value: string, unit: "day" | "year", amount: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (unit === "year") date.setUTCFullYear(date.getUTCFullYear() + amount);
  else date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function registerProjectRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  registerEndUserUpdateRoute(app, database, users, "Project");
  app.get("/api/v1/projects/creation-options", async (request) => {
    await users.demandPermission(request, "project.write");
    await users.demandPermission(request, "estimate.read");
    // Only work the customer has ordered: the linked CRM opportunity is WON, and its order
    // evidence is offered as the PO so it is not typed twice.
    const result = await database.query<Record<string, unknown>>(`
      SELECT e.id,e.estimate_no number,e.project_name projectName,e.customer_id customerId,
        e.owner_id ownerId,i.site_location siteLocation,i.target_delivery targetDelivery,
        o.opportunity_no opportunityNo,o.won_on wonOn,o.won_reference wonReference
      FROM dbo.estimates e JOIN dbo.inquiries i ON i.id=e.inquiry_id
      JOIN dbo.crm_opportunities o ON o.id=i.opportunity_id AND o.stage=N'WON'
      WHERE e.status IN(N'Approved',N'Locked') AND e.deleted_at IS NULL AND e.archived_at IS NULL
        AND i.deleted_at IS NULL AND i.archived_at IS NULL AND i.status<>N'Cancelled'
        AND NOT EXISTS(SELECT 1 FROM dbo.projects p WHERE p.inquiry_id=i.id OR p.estimate_id=e.id)
      ORDER BY e.updated_at DESC,e.id DESC;
      SELECT u.id,u.name,
        MAX(CASE WHEN r.code IN(N'Project Manager',N'Engineering Manager',N'Admin') THEN 1 ELSE 0 END) canManage,
        MAX(CASE WHEN r.code IN(N'Engineer',N'Engineering Manager',N'Admin') THEN 1 ELSE 0 END) canLead
      FROM dbo.users u JOIN dbo.user_effective_roles r ON r.user_id=u.id
      GROUP BY u.id,u.name HAVING MAX(CASE WHEN r.code IN(N'Project Manager',N'Engineering Manager',N'Admin',N'Engineer') THEN 1 ELSE 0 END)=1
      ORDER BY u.name;
    `);
    const sets = result.recordsets as unknown as Record<string, unknown>[][];
    return { estimates: (sets[0] ?? []).map(({ wonOn, wonReference, ...r }) => ({ ...r, id:Number(r.id), customerId:Number(r.customerId), ownerId:Number(r.ownerId), targetDelivery:dateOnly(r.targetDelivery as Date),
        // The order reference is free text; it is only a PO number when it fits the PO field.
        purchaseOrderNumber: typeof wonReference === "string" && wonReference.trim().length <= 100 ? wonReference.trim() : "",
        purchaseOrderDate: dateOnly(wonOn as Date | null) ?? "" })),
      people: (sets[1] ?? []).map(r => ({ ...r, id:Number(r.id), canManage:Boolean(r.canManage), canLead:Boolean(r.canLead) })) };
  });

  app.get("/api/v1/projects/handover/:inquiryId", async (request) => {
    await users.demandPermission(request, "inquiry.read");
    const actor = await users.required(request);
    const id = positiveLong((request.params as {inquiryId:string}).inquiryId,"Inquiry");
    const result = await database.query<Record<string, unknown>>(`
      SELECT i.status inquiryStatus,i.archived_at archivedAt,e.id estimateId,e.status estimateStatus,
        CASE WHEN EXISTS(SELECT 1 FROM dbo.crm_opportunities o WHERE o.id=i.opportunity_id AND o.stage=N'WON') THEN 1 ELSE 0 END won,
        e.deleted_at estimateDeletedAt,e.archived_at estimateArchivedAt,
        CASE WHEN p.id IS NULL THEN 0 ELSE 1 END hasProject,
        CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'project.read') AND p.deleted_at IS NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
          OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) THEN p.id END projectId,
        CASE WHEN EXISTS(SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor AND code=N'project.read') AND p.deleted_at IS NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
          OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor)) THEN p.project_no END projectNo
      FROM dbo.inquiries i LEFT JOIN dbo.estimates e ON e.inquiry_id=i.id
      OUTER APPLY(SELECT TOP(1) * FROM dbo.projects WHERE inquiry_id=i.id ORDER BY id DESC) p
      WHERE i.id=@id AND i.deleted_at IS NULL`, q => q.input("id",sql.BigInt,id).input("actor",sql.BigInt,actor.id)
        .input("elevated",sql.Bit,isProjectElevated(actor)));
    const row=result.recordset[0];
    if(!row)throw new ApiError(404,"inquiry_not_found","Inquiry not found.");
    const reason = row.hasProject ? "projectExists" : row.archivedAt || row.inquiryStatus === "Cancelled" ? "sourceUnavailable"
      : !row.estimateId || row.estimateDeletedAt || row.estimateArchivedAt || !["Approved","Locked"].includes(String(row.estimateStatus)) ? "awaitCostApproval"
      : !row.won ? "awaitWon" : "recordPo";
    return { reason, estimateId:row.estimateId ? Number(row.estimateId) : null, projectId:row.projectId ? Number(row.projectId) : null, projectNo:row.projectNo ?? null };
  });
  // The customer's own site contacts, for ticking who the project talks to.
  app.get("/api/v1/projects/contact-options", async (request) => {
    await users.demandPermission(request, "project.write");
    const customerId = positiveLong((request.query as { customerId?: string }).customerId, "Customer id");
    const result = await database.query<Record<string, unknown>>(`
      SELECT sc.id,sc.name,sc.position,sc.department,sc.phone,sc.email,s.name site_name
      FROM dbo.customer_site_contacts sc JOIN dbo.customer_sites s ON s.id=sc.site_id
      WHERE s.customer_id=@customer AND sc.is_active=1 AND sc.deleted_at IS NULL AND s.deleted_at IS NULL
      ORDER BY sc.is_primary DESC,sc.name,sc.id;`, (q) => q.input("customer", sql.BigInt, customerId));
    return result.recordset.map((row) => ({ id: Number(row.id), name: String(row.name), position: String(row.position ?? ""),
      department: String(row.department ?? ""), phone: String(row.phone ?? ""), email: String(row.email ?? ""), siteName: String(row.site_name ?? "") }));
  });

  app.get("/api/v1/projects", async (request) => {
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampedInteger(query.pageSize, 25, 1, 100);
    const search = optionalText(query.search, 200, "Search");
    const status = optionalText(query.status, 50, "Status");
    const result = await database.query<ProjectRow>(`
      SELECT ${PROJECT_COLUMNS},
        COUNT_BIG(*) OVER() AS total_count
      ${PROJECT_SOURCE}
        AND (@status IS NULL OR p.status=@status)
        AND (@search IS NULL OR p.project_no LIKE N'%'+@search+N'%' OR p.name LIKE N'%'+@search+N'%'
          OR p.po_no LIKE N'%'+@search+N'%' OR c.name LIKE N'%'+@search+N'%'
          OR eu.name LIKE N'%'+@search+N'%' OR eu.code LIKE N'%'+@search+N'%')
      ORDER BY p.updated_at DESC,p.id DESC OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("status", sql.NVarChar(50), status); sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("actor", sql.BigInt, actor.id); sqlRequest.input("elevated", sql.Bit, isProjectElevated(actor));
      sqlRequest.input("offset", sql.Int, (page - 1) * pageSize); sqlRequest.input("page_size", sql.Int, pageSize);
    });
    const summaries = await loadProjectScheduleSummaries(database, result.recordset.map(projectInput), businessToday(config.businessTimeZone));
    return {
      items: result.recordset.map((row) => projectItem(row, summaries.get(Number(row.id))?.health ?? "No plan")),
      page, pageSize, total: Number(result.recordset[0]?.total_count ?? 0),
    };
  });

  // The list above and the portfolio overview below return the same row, so the portfolio can open
  // every project dialog the list opens. Scope: elevated, or the project's manager, lead or member.
  const PROJECT_COLUMNS = `p.id,p.project_no,p.name,p.customer_id,c.name AS customer_name,p.status,p.project_type,u.name AS manager_name,
        p.end_user_customer_id,eu.name AS end_user_name,eu.code AS end_user_code,
        p.manager_id,p.lead_engineer_id,le.name AS lead_engineer_name,p.po_no,p.po_date,p.actual_delivery,p.site,p.remark,
        p.start_date,p.target_delivery,p.progress,p.updated_at,p.row_version,p.team,
        (SELECT STRING_AGG(m.milestone,N',') FROM dbo.project_payment_milestones m WHERE m.project_id=p.id) payments_received,
        (SELECT STRING_AGG(CONVERT(nvarchar(20),pc.contact_id),N',') FROM dbo.project_contacts pc WHERE pc.project_id=p.id) contact_ids`;
  const PROJECT_SOURCE = `FROM dbo.projects p INNER JOIN dbo.customers c ON c.id=p.customer_id INNER JOIN dbo.users u ON u.id=p.manager_id
      LEFT JOIN dbo.customers eu ON eu.id=p.end_user_customer_id
      INNER JOIN dbo.users le ON le.id=p.lead_engineer_id
      WHERE p.deleted_at IS NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor))`;
  function projectInput(row: ProjectRow) { return { id: Number(row.id), status: String(row.status), targetDelivery: dateOnly(row.target_delivery) }; }
  function projectItem(row: ProjectRow, health: ProjectHealth) {
    return {
      id: Number(row.id), number: row.project_no, name: row.name, customerName: row.customer_name,
      team: row.team ?? null, health,
      paymentsReceived: typeof row.payments_received === "string" && row.payments_received ? row.payments_received.split(",") : [],
      contactIds: typeof row.contact_ids === "string" && row.contact_ids ? row.contact_ids.split(",").map(Number) : [],
      customerId: Number(row.customer_id), endUserCustomerId: row.end_user_customer_id === null ? null : Number(row.end_user_customer_id),
      endUserName: row.end_user_name, endUserCode: row.end_user_code,
      status: row.status, projectType: row.project_type, managerName: row.manager_name,
      managerId: Number(row.manager_id), leadEngineerId: Number(row.lead_engineer_id), leadEngineerName: row.lead_engineer_name,
      purchaseOrderNumber: row.po_no, purchaseOrderDate: dateOnly(row.po_date), actualDelivery: dateOnly(row.actual_delivery),
      site: row.site, remark: row.remark ?? "",
      startDate: dateOnly(row.start_date), targetDelivery: dateOnly(row.target_delivery), progress: Number(row.progress),
      updatedAt: row.updated_at, rowVersion: row.row_version.toString("base64"),
    };
  }

  // The Projects portfolio: every project in scope with its schedule summary, unpaged, for the
  // screen to sort and filter in memory. Closed projects only when asked for.
  app.get("/api/v1/projects/overview", async (request) => {
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const query = request.query as Record<string, unknown>;
    const includeClosed = query.includeClosed === "1" || query.includeClosed === "true";
    const elevated = isProjectElevated(actor);
    const result = await database.query<ProjectRow>(`
      SELECT ${PROJECT_COLUMNS}
      ${PROJECT_SOURCE}
        AND (@include_closed=1 OR p.status<>N'Closed')
      ORDER BY p.project_no,p.id;
    `, (sqlRequest) => {
      sqlRequest.input("actor", sql.BigInt, actor.id); sqlRequest.input("elevated", sql.Bit, elevated);
      sqlRequest.input("include_closed", sql.Bit, includeClosed);
    });
    const today = businessToday(config.businessTimeZone);
    const rows = result.recordset;
    if (!rows.length) return { today, items: [] };
    const summaries = await loadProjectScheduleSummaries(database, rows.map(projectInput), today);
    // Unanswered day requests and the latest progress entry per project, in one grouped read.
    // 'progress' is what Resource Plan writes when it updates a task it manages.
    const activity = new Map((await database.query<{ project_id: number | string; pending_requests: number | string; last_progress_at: Date | null }>(`
      SELECT u.project_id,
        SUM(CASE WHEN u.field=N'request' AND u.request_days>0 AND u.answer IS NULL THEN 1 ELSE 0 END) pending_requests,
        MAX(CASE WHEN u.field IN(N'percent_complete',N'status',N'actual_start',N'actual_finish',N'forecast_finish',N'progress') THEN u.occurred_at END) last_progress_at
      FROM dbo.schedule_updates u WHERE u.project_id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N','))
      GROUP BY u.project_id;`, (sqlRequest) => sqlRequest.input("ids", sql.NVarChar(sql.MAX), rows.map((row) => Number(row.id)).join(",")),
    )).recordset.map((row) => [Number(row.project_id), row] as const));
    // The same people PUT /api/v1/projects/:id lets move a project along its lifecycle.
    const canWrite = await permissionFor(database, actor.id, "project.write");
    return {
      today,
      items: rows.map((row) => {
        const id = Number(row.id), summary = summaries.get(id), counts = activity.get(id);
        const progress = summary?.progress ?? null;
        return {
          ...projectItem(row, summary?.health ?? "No plan"),
          progress: progress ?? Number(row.progress), progressSource: progress === null ? "manual" : "schedule", typedProgress: Number(row.progress),
          plannedProgress: summary?.plannedProgress ?? null, planStart: summary?.planStart ?? null, planFinish: summary?.planFinish ?? null,
          forecastFinish: summary?.forecastFinish ?? null, slipDays: summary?.slipDays ?? null,
          taskCount: summary?.taskCount ?? 0, doneCount: summary?.doneCount ?? 0, overdueCount: summary?.overdueCount ?? 0,
          blockedCount: summary?.blockedCount ?? 0, slippedCount: summary?.slippedCount ?? 0, nextMilestone: summary?.nextMilestone ?? null,
          scheduleError: summary?.scheduleError ?? false,
          pendingRequests: Number(counts?.pending_requests ?? 0), lastProgressAt: counts?.last_progress_at ?? null,
          canChangeStatus: canWrite && (elevated || Number(row.manager_id) === actor.id || Number(row.lead_engineer_id) === actor.id),
          allowedStatuses: isProjectStatus(row.status) ? allowedProjectTransitions(row.status, elevated) : [],
        };
      }),
    };
  });

  app.post("/api/v1/projects", async (request, reply) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const requestedEndUserId = endUserCustomerId(body.endUserCustomerId);
    const plan = parseInitialPlan(body);
    const details = parseProjectDetails(body);
    // With a plan, the project runs from its first row to its last; without one, the dates are typed.
    const span = planSpan(plan);
    const input = {
      projectNumber: parseProjectNumber(body.projectNumber),
      estimateId: requiredInteger(body.estimateId, "Approved estimate", 1),
      purchaseOrderNumber: requiredText(body.purchaseOrderNumber, 100, "Purchase order number"),
      purchaseOrderDate: parseDateOnly(body.purchaseOrderDate, "Purchase order date")!,
      managerId: requiredInteger(body.managerId, "Manager", 1),
      leadEngineerId: requiredInteger(body.leadEngineerId, "Lead engineer", 1),
      startDate: span?.start ?? parseDateOnly(body.startDate, "Start date")!,
      targetDelivery: span?.finish ?? parseDateOnly(body.targetDelivery, "Target delivery")!,
      site: requiredText(body.site, 300, "Project site"),
      remark: optionalBodyText(body.remark, 20_000, "Remark"),
    };
    if (span && !(await permissionFor(database, actor.id, "schedule.plan"))) {
      throw new ApiError(403, "schedule_plan_required", "Creating a project with a master plan or team plan requires schedule planning permission.");
    }
    const today = businessToday(config.businessTimeZone);
    if (input.purchaseOrderDate < shiftDate(today, "year", -10) || input.purchaseOrderDate > shiftDate(today, "day", 30)
      || input.startDate < shiftDate(today, "year", -1) || input.startDate > shiftDate(today, "year", 5)
      || input.targetDelivery < input.startDate || input.targetDelivery > shiftDate(input.startDate, "year", 10)) {
      throw new ApiError(400, "validation_failed", "PO, start and target delivery dates are outside the allowed project range.");
    }
    const writtenKeys: string[] = [];
    let projectDirectory: string | undefined;
    let created: { id: number; number: string; rowVersion: string; folderMetadataCreated: number; documentsTransferred: number };
    try {
    created = await database.transaction(async (transaction) => {
      const people = new sql.Request(transaction); people.input("manager_id", sql.BigInt, input.managerId); people.input("lead_id", sql.BigInt, input.leadEngineerId);
      const roles = (await people.query<{ manager_role: string | null; lead_role: string | null }>(`
        SELECT (SELECT TOP(1) code FROM dbo.user_effective_roles
          WHERE user_id=@manager_id AND code IN(N'Project Manager',N'Engineering Manager',N'Admin')) AS manager_role,
          (SELECT TOP(1) code FROM dbo.user_effective_roles
          WHERE user_id=@lead_id AND code IN(N'Engineer',N'Engineering Manager',N'Admin')) AS lead_role;
      `)).recordset[0];
      if (!roles || !["Project Manager", "Engineering Manager", "Admin"].includes(roles.manager_role ?? "")
        || !["Engineer", "Engineering Manager", "Admin"].includes(roles.lead_role ?? "")) {
        throw new ApiError(422, "invalid_reference", "Manager and lead engineer must be active users with eligible roles.");
      }
      const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, input.estimateId);
      const estimate = (await lookup.query<{ customer_id: number | string; inquiry_id: number | string; estimate_no: string; project_name: string; project_type: string }>(`
        SELECT customer_id,inquiry_id,estimate_no,project_name,project_type FROM dbo.estimates WITH (UPDLOCK,HOLDLOCK)
        WHERE id=@id AND status IN (N'Approved',N'Locked') AND deleted_at IS NULL AND archived_at IS NULL;
      `)).recordset[0];
      if (!estimate) throw new ApiError(422, "estimate_not_approved", "An approved estimate is required to create a project.");
      const order = new sql.Request(transaction); order.input("inquiry", sql.BigInt, Number(estimate.inquiry_id));
      if (!(await order.query(`SELECT o.id FROM dbo.inquiries i WITH(HOLDLOCK) JOIN dbo.crm_opportunities o WITH(HOLDLOCK) ON o.id=i.opportunity_id
          WHERE i.id=@inquiry AND o.stage=N'WON';`)).recordset[0]) {
        throw new ApiError(409, "opportunity_not_won", "Mark the customer order as WON on the linked CRM opportunity before creating a project.");
      }
      const duplicate = new sql.Request(transaction);
      duplicate.input("estimate",sql.BigInt,input.estimateId).input("inquiry",sql.BigInt,Number(estimate.inquiry_id));
      if((await duplicate.query(`SELECT id FROM dbo.projects WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@estimate OR inquiry_id=@inquiry`)).recordset[0]) {
        throw new ApiError(409,"project_already_exists","A project already exists for this inquiry. Open or restore the existing project.");
      }
      await assertEstimateTotals(transaction, input.estimateId);
      const inquiryLookup = new sql.Request(transaction);
      inquiryLookup.input("inquiry_id", sql.BigInt, Number(estimate.inquiry_id));
      const inquiry = (await inquiryLookup.query<{ end_user_customer_id: number | string | null }>(`
        SELECT end_user_customer_id FROM dbo.inquiries WITH (HOLDLOCK) WHERE id=@inquiry_id AND deleted_at IS NULL AND archived_at IS NULL AND status<>N'Cancelled';
      `)).recordset[0];
      if (!inquiry) throw new ApiError(422, "invalid_reference", "The source inquiry is no longer available.");
      const inheritedEndUserId = inquiry.end_user_customer_id === null ? null : Number(inquiry.end_user_customer_id);
      const endUserId = requestedEndUserId === undefined ? inheritedEndUserId : requestedEndUserId;
      const endUser = await validateEndUser(transaction, endUserId);
      // The number comes from the ERP. It stays reserved by a project in the trash, so the
      // same ERP number is never issued to two records here.
      const number = input.projectNumber;
      const taken = new sql.Request(transaction); taken.input("number", sql.NVarChar(30), number);
      if ((await taken.query(`SELECT id FROM dbo.projects WITH(UPDLOCK,HOLDLOCK) WHERE project_no=@number;`)).recordset[0]) {
        throw new ApiError(409, "project_number_taken", "This project number is already used by another project, including any in the trash. Check the number from the ERP.");
      }
      const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number); insert.input("name", sql.NVarChar(300), estimate.project_name);
      insert.input("customer_id", sql.BigInt, Number(estimate.customer_id)); insert.input("project_type", sql.NVarChar(100), estimate.project_type);
      insert.input("end_user_id", sql.BigInt, endUserId);
      insert.input("manager_id", sql.BigInt, input.managerId); insert.input("lead_id", sql.BigInt, input.leadEngineerId);
      insert.input("inquiry_id", sql.BigInt, Number(estimate.inquiry_id)); insert.input("estimate_id", sql.BigInt, input.estimateId);
      insert.input("po_no", sql.NVarChar(100), input.purchaseOrderNumber); insert.input("po_date", sql.Date, input.purchaseOrderDate);
      insert.input("start_date", sql.Date, input.startDate); insert.input("target_delivery", sql.Date, input.targetDelivery);
      insert.input("site", sql.NVarChar(300), input.site); insert.input("remark", sql.NVarChar(sql.MAX), input.remark);
      insert.input("folder_path", sql.NVarChar(1000), `IoT Team - Documents / Project - ${input.startDate.slice(0, 4)} / [${number}] ${estimate.project_name}`);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`
        INSERT INTO dbo.projects(project_no,name,customer_id,end_user_customer_id,project_type,status,manager_id,lead_engineer_id,
          inquiry_id,estimate_id,po_no,po_date,start_date,target_delivery,progress,site,remark,folder_path,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES (@number,@name,@customer_id,@end_user_id,@project_type,N'Planning',@manager_id,@lead_id,
          @inquiry_id,@estimate_id,@po_no,@po_date,@start_date,@target_delivery,0,@site,@remark,@folder_path,@actor,@actor);
      `)).recordset[0]!;
      const projectId = Number(row.id);
      projectDirectory = `projects/${projectId}`;
      const members = new sql.Request(transaction);
      members.input("project_id", sql.BigInt, projectId); members.input("manager_id", sql.BigInt, input.managerId);
      members.input("lead_id", sql.BigInt, input.leadEngineerId); members.input("actor", sql.BigInt, actor.id);
      await members.query(`
        INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES (@project_id,@manager_id,N'Project Manager',@actor);
        IF @lead_id<>@manager_id INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES (@project_id,@lead_id,N'Lead Engineer',@actor);
      `);
      await insertInitialPlan(transaction, projectId, plan, actor.id);
      await writeProjectDetails(transaction, projectId, details, actor.id);
      const folders = new sql.Request(transaction); folders.input("project_id", sql.BigInt, projectId); folders.input("actor", sql.BigInt, actor.id);
      const values = STANDARD_FOLDERS.map(([code, name]) => `(@project_id,N'${code}',N'${name.replaceAll("'", "''")}',N'projects/${projectId}/${code}',@actor)`).join(",\n");
      await folders.query(`INSERT INTO dbo.project_folders(project_id,folder_code,name,storage_key,created_by) VALUES ${values};`);
      for (const [code] of STANDARD_FOLDERS) await createStoredDirectory(config.documentStorage, `${projectDirectory}/${code}`);
      const documentsTransferred = await transferProjectDocuments(transaction, config.documentStorage,
        projectId, Number(estimate.inquiry_id), input.estimateId, actor.id, writtenKeys);
      await insertAudit(transaction, actor.id, "Project", projectId, number, "Created from approved estimate", estimate.estimate_no,
        { ...input, ...endUser, endUserInheritedFromInquiry: requestedEndUserId === undefined, documentsTransferred,
          masterPlan: plan.milestones, teamPlan: plan.team, ...details });
      await confirmOpportunityOrder(transaction,Number(estimate.inquiry_id),actor.id,input.purchaseOrderDate>today?today:input.purchaseOrderDate,input.purchaseOrderNumber);
      return { id: projectId, number, rowVersion: row.row_version.toString("base64"), folderMetadataCreated: STANDARD_FOLDERS.length, documentsTransferred };
    });
    } catch (error) {
      if (error instanceof DatabaseCommitOutcomeUnknownError) {
        request.log.fatal({ err: error.originalError, storageKeys: writtenKeys }, "Project handover commit outcome unknown; preserving files");
      } else {
        for (const key of writtenKeys) {
          await deleteStoredFile(config.documentStorage, key).catch((cleanupError: unknown) => {
            request.log.error({ err: cleanupError, storageKey: key }, "Could not remove rolled-back project handover file");
          });
        }
        if (projectDirectory) await removeEmptyStoredDirectory(config.documentStorage, projectDirectory).catch((cleanupError: unknown) => {
          request.log.error({ err: cleanupError, storageKey: projectDirectory }, "Could not remove empty rolled-back project folders");
        });
      }
      throw error;
    }
    return reply.status(201).header("Location", `/api/v1/projects/${created.id}`).send(created);
  });

  app.get("/api/v1/projects/:id/members", async (request) => {
    await users.demandPermission(request, "project.read");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Project id");
    await demandProjectScope(database, actor, id);
    const result = await database.query<{
      id: number | string; name: string; email: string; department: string; system_role: string;
      role_on_project: string; created_at: Date | string; is_manager: number | boolean; is_lead_engineer: number | boolean;
    }>(`
      SELECT u.id, u.name, u.email, u.department, r.code AS system_role, m.role_on_project, m.created_at,
             CASE WHEN u.id = p.manager_id THEN 1 ELSE 0 END AS is_manager,
             CASE WHEN u.id = p.lead_engineer_id THEN 1 ELSE 0 END AS is_lead_engineer
      FROM dbo.project_members m
      INNER JOIN dbo.users u ON u.id = m.user_id
      INNER JOIN dbo.roles r ON r.id = u.role_id
      INNER JOIN dbo.projects p ON p.id = m.project_id
      WHERE m.project_id = @project_id
      ORDER BY CASE WHEN u.id = p.manager_id THEN 0 WHEN u.id = p.lead_engineer_id THEN 1 ELSE 2 END, u.name;
    `, (sqlRequest) => sqlRequest.input("project_id", sql.BigInt, id));
    return result.recordset.map((row) => ({
      userId: Number(row.id), name: row.name, email: row.email, department: row.department,
      systemRole: row.system_role, roleOnProject: row.role_on_project,
      isManager: Boolean(row.is_manager), isLeadEngineer: Boolean(row.is_lead_engineer),
      addedAt: row.created_at,
    }));
  });

  app.post("/api/v1/projects/:id/members", async (request, reply) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Project id");
    const body = bodyObject(request.body);
    const userId = requiredInteger(body.userId, "User", 1);
    const roleOnProject = optionalBodyText(body.roleOnProject, 100, "Role on the project") ?? "Member";
    await demandProjectScope(database, actor, id);
    const activeCheck = await database.query<{ ok: number }>(
      `SELECT 1 AS ok FROM dbo.users WHERE id = @user_id AND is_active = 1 AND deleted_at IS NULL;`,
      (sqlRequest) => sqlRequest.input("user_id", sql.BigInt, userId),
    );
    if (!activeCheck.recordset[0]) throw new ApiError(422, "invalid_reference", "User must be an active account.");
    await database.transaction(async (transaction) => {
      const insert = new sql.Request(transaction);
      insert.input("project_id", sql.BigInt, id); insert.input("user_id", sql.BigInt, userId);
      insert.input("role", sql.NVarChar(100), roleOnProject); insert.input("actor", sql.BigInt, actor.id);
      await insert.query(`INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES (@project_id,@user_id,@role,@actor);`);
      const numberLookup = new sql.Request(transaction); numberLookup.input("project_id", sql.BigInt, id);
      const projectNo = (await numberLookup.query<{ project_no: string }>(`SELECT project_no FROM dbo.projects WHERE id = @project_id;`)).recordset[0]?.project_no ?? "";
      await insertAudit(transaction, actor.id, "Project", id, projectNo, "Added project member", null, { userId, roleOnProject });
    });
    return reply.status(201).header("Location", `/api/v1/projects/${id}/members/${userId}`).send({ userId, roleOnProject });
  });

  app.delete("/api/v1/projects/:id/members/:userId", async (request, reply) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Project id");
    const memberUserId = positiveLong((request.params as { userId?: string }).userId, "User id");
    await demandProjectScope(database, actor, id);
    const coreCheck = await database.query<{ ok: number }>(
      `SELECT 1 AS ok FROM dbo.projects WHERE id = @project_id AND (manager_id = @user_id OR lead_engineer_id = @user_id);`,
      (sqlRequest) => { sqlRequest.input("project_id", sql.BigInt, id); sqlRequest.input("user_id", sql.BigInt, memberUserId); },
    );
    if (coreCheck.recordset[0]) throw new ApiError(422, "core_member", "The project manager and lead engineer cannot be removed here; reassign their role on the project instead.");
    await database.transaction(async (transaction) => {
      const del = new sql.Request(transaction);
      del.input("project_id", sql.BigInt, id); del.input("user_id", sql.BigInt, memberUserId);
      const result = await del.query(`DELETE FROM dbo.project_members WHERE project_id = @project_id AND user_id = @user_id;`);
      if (result.rowsAffected[0] === 0) throw new ApiError(404, "not_a_member", "That user is not a member of this project.");
      const numberLookup = new sql.Request(transaction); numberLookup.input("project_id", sql.BigInt, id);
      const projectNo = (await numberLookup.query<{ project_no: string }>(`SELECT project_no FROM dbo.projects WHERE id = @project_id;`)).recordset[0]?.project_no ?? "";
      await insertAudit(transaction, actor.id, "Project", id, projectNo, "Removed project member", { userId: memberUserId }, null);
    });
    return reply.status(204).send();
  });

  // For a project created by mistake or for a trial. dbo.delete_unstarted_project refuses one
  // with any work recorded and names that work; once deleted, the same estimate and ERP
  // number can create the project again. The preview asks the same question without deleting.
  async function projectDeletion(transaction: sql.Transaction, id: number, actor: CurrentUser, execute: boolean) {
    const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, id);
    const project = (await lookup.query<Record<string, unknown> & { project_no: string; manager_id: number | string }>(`
      SELECT project_no,name,customer_id,inquiry_id,estimate_id,status,manager_id,lead_engineer_id,po_no,po_date,start_date,target_delivery
      FROM dbo.projects WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
    if (!project) throw new ApiError(404, "project_not_found", "Project not found.");
    if (Number(project.manager_id) !== actor.id && !hasRole(actor, "Engineering Manager", "Admin")) {
      throw new ApiError(403, "project_delete_forbidden", "Only this project's manager, an Engineering Manager or an Admin can delete it.");
    }
    const run = new sql.Request(transaction); run.input("id", sql.BigInt, id).input("actor", sql.BigInt, actor.id).input("execute", sql.Bit, execute);
    const sets = (await run.execute("dbo.delete_unstarted_project")).recordsets as unknown as Record<string, unknown>[][];
    const blockers = (sets[0] ?? []).map((row) => ({ source: String(row.source), count: Number(row.row_count) }));
    return { project, blockers, storageKeys: (sets[1] ?? []).map((row) => String(row.storage_key)) };
  }

  app.get("/api/v1/projects/:id/deletion", async (request) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Project id");
    await demandProjectScope(database, actor, id);
    const { blockers } = await database.transaction((transaction) => projectDeletion(transaction, id, actor, false));
    return { id, canDelete: blockers.length === 0, blockers };
  });

  app.delete("/api/v1/projects/:id", async (request) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Project id");
    await demandProjectScope(database, actor, id);
    const deleted = await database.transaction(async (transaction) => {
      const { project, blockers, storageKeys } = await projectDeletion(transaction, id, actor, true);
      if (blockers.length) {
        throw new ApiError(409, "project_has_work", "This project already has work recorded against it, so it cannot be deleted.", { blockers });
      }
      await insertAudit(transaction, actor.id, "Project", id, project.project_no, "Deleted before work started", project, null);
      return { number: project.project_no, storageKeys };
    });
    // Files go only after the rows are gone; a file left behind is logged, never the reverse.
    for (const key of deleted.storageKeys) {
      await deleteStoredFile(config.documentStorage, key).catch((error: unknown) => {
        request.log.error({ err: error, storageKey: key, projectId: id }, "Could not remove a deleted project's file");
      });
    }
    await removeEmptyStoredDirectory(config.documentStorage, `projects/${id}`).catch((error: unknown) => {
      request.log.error({ err: error, projectId: id }, "Could not remove a deleted project's folders");
    });
    return { id, number: deleted.number, deleted: true };
  });

  app.put("/api/v1/projects/:id", async (request) => {
    await users.demandPermission(request, "project.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Project id");
    const body = bodyObject(request.body);
    const rowVersion = parseRowVersion(body.rowVersion);
    const elevated = isProjectElevated(actor);
    // Being on the project is what grants the edit, not the permission alone.
    await demandProjectScope(database, actor, id);
    const given = <T>(key: string, read: () => T, fallback: T): T => (body[key] === undefined ? fallback : read());
    const details = parseProjectDetails(body);
    // The plan is sent whole: both lists, or neither.
    const editsPlan = body.masterPlan !== undefined || body.team !== undefined;
    if (editsPlan && (body.masterPlan === undefined || body.team === undefined)) {
      throw new ApiError(400, "validation_failed", "Send both the master plan and the team plan, or neither.");
    }
    const plan = editsPlan ? parseInitialPlan(body) : null;
    const canPlan = editsPlan && await permissionFor(database, actor.id, "schedule.plan");
    return database.transaction(async (transaction) => {
      const lookup = new sql.Request(transaction);
      lookup.input("id", sql.BigInt, id);
      const before = (await lookup.query<Record<string, unknown>>(`SELECT id,project_no,name,project_type,status,progress,manager_id,lead_engineer_id,
        po_no,po_date,start_date,target_delivery,actual_delivery,site,remark FROM dbo.projects WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
      if (!before) throw new ApiError(404, "project_not_found", "Project not found.");
      const currentStatus = String(before.status) as ProjectStatus;

      const statusValue = given("status", () => {
        if (!isProjectStatus(body.status)) throw new ApiError(400, "validation_failed", "Project status is not one of the allowed values.");
        return body.status;
      }, currentStatus);
      // Only the people answerable for the project move it along the lifecycle.
      if (statusValue !== currentStatus && !elevated
        && Number(before.manager_id) !== actor.id && Number(before.lead_engineer_id) !== actor.id) {
        throw new ApiError(403, "project_status_forbidden", "Only the project manager, the lead engineer or a manager can change the project status.");
      }

      const input = {
        name: given("name", () => requiredText(body.name, 300, "Project name"), String(before.name)),
        projectType: given("projectType", () => requiredText(body.projectType, 100, "Project type"), String(before.project_type)),
        managerId: given("managerId", () => requiredInteger(body.managerId, "Manager", 1), Number(before.manager_id)),
        leadEngineerId: given("leadEngineerId", () => requiredInteger(body.leadEngineerId, "Lead engineer", 1), Number(before.lead_engineer_id)),
        purchaseOrderNumber: given("purchaseOrderNumber", () => requiredText(body.purchaseOrderNumber, 100, "Purchase order number"), String(before.po_no)),
        purchaseOrderDate: given("purchaseOrderDate", () => parseDateOnly(body.purchaseOrderDate, "Purchase order date")!, dateOnly(before.po_date as Date)!),
        startDate: given("startDate", () => parseDateOnly(body.startDate, "Start date")!, dateOnly(before.start_date as Date)!),
        targetDelivery: given("targetDelivery", () => parseDateOnly(body.targetDelivery, "Target delivery")!, dateOnly(before.target_delivery as Date)!),
        actualDelivery: given("actualDelivery", () => parseDateOnly(body.actualDelivery, "Actual delivery", true), dateOnly(before.actual_delivery as Date | null)),
        site: given("site", () => requiredText(body.site, 300, "Project site"), String(before.site)),
        remark: given("remark", () => optionalBodyText(body.remark, 20_000, "Remark"), (before.remark as string | null) ?? null),
        progress: given("progress", () => {
          const value = typeof body.progress === "number" ? body.progress : Number.NaN;
          if (!Number.isFinite(value) || value < 0 || value > 100) throw new ApiError(400, "validation_failed", "Progress must be a number between 0 and 100.");
          return Math.round(value * 100) / 100;
        }, Number(before.progress)),
      };

      if (input.targetDelivery < input.startDate) {
        throw new ApiError(400, "validation_failed", "Target delivery cannot be earlier than the start date.");
      }
      if (input.actualDelivery && input.actualDelivery < input.startDate) {
        throw new ApiError(400, "validation_failed", "Actual delivery cannot be earlier than the start date.");
      }

      const transition = checkProjectTransition({ current: currentStatus, next: statusValue, elevated, actualDelivery: input.actualDelivery });
      if (!transition.ok) throw new ApiError(409, "invalid_status_transition", transition.reason);
      const progress = progressForStatus(statusValue, input.progress);

      const people = new sql.Request(transaction);
      people.input("manager_id", sql.BigInt, input.managerId); people.input("lead_id", sql.BigInt, input.leadEngineerId);
      const staff = (await people.query<{ found: number | string }>(`SELECT COUNT_BIG(*) found FROM dbo.users
        WHERE id IN (@manager_id,@lead_id) AND is_active=1 AND deleted_at IS NULL;`)).recordset[0];
      const distinct = input.managerId === input.leadEngineerId ? 1 : 2;
      if (Number(staff?.found ?? 0) !== distinct) throw new ApiError(422, "invalid_reference", "The manager and the lead engineer must both be active users.");

      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id); update.input("row_version", sql.VarBinary(8), rowVersion); update.input("actor", sql.BigInt, actor.id);
      update.input("name", sql.NVarChar(300), input.name); update.input("project_type", sql.NVarChar(100), input.projectType);
      update.input("status", sql.NVarChar(50), statusValue); update.input("progress", sql.Decimal(5, 2), progress);
      update.input("manager_id", sql.BigInt, input.managerId); update.input("lead_id", sql.BigInt, input.leadEngineerId);
      update.input("po_no", sql.NVarChar(100), input.purchaseOrderNumber); update.input("po_date", sql.Date, input.purchaseOrderDate);
      update.input("start_date", sql.Date, input.startDate); update.input("target_delivery", sql.Date, input.targetDelivery);
      update.input("actual_delivery", sql.Date, input.actualDelivery); update.input("site", sql.NVarChar(300), input.site);
      update.input("remark", sql.NVarChar(sql.MAX), input.remark);
      const updated = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.projects SET name=@name,project_type=@project_type,status=@status,progress=@progress,
        manager_id=@manager_id,lead_engineer_id=@lead_id,po_no=@po_no,po_date=@po_date,start_date=@start_date,target_delivery=@target_delivery,
        actual_delivery=@actual_delivery,site=@site,remark=@remark,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;`)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This project changed. Reload and try again.");

      // Project access is read from project_members, so a new manager or lead must appear there or
      // they would lose sight of the project they were just handed.
      const membership = new sql.Request(transaction);
      membership.input("project_id", sql.BigInt, id); membership.input("actor", sql.BigInt, actor.id);
      membership.input("manager_id", sql.BigInt, input.managerId); membership.input("lead_id", sql.BigInt, input.leadEngineerId);
      await membership.query(`IF NOT EXISTS(SELECT 1 FROM dbo.project_members WHERE project_id=@project_id AND user_id=@manager_id)
          INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project_id,@manager_id,N'Project Manager',@actor);
        IF NOT EXISTS(SELECT 1 FROM dbo.project_members WHERE project_id=@project_id AND user_id=@lead_id)
          INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project_id,@lead_id,N'Lead Engineer',@actor);`);

      let scheduleVersion: string | null = null;
      if (plan) {
        // The same people who may change the plan in Project Schedule.
        if (!canPlan || (Number(before.manager_id) !== actor.id && !hasRole(actor, "Engineering Manager", "Admin"))) {
          throw new ApiError(403, "schedule_plan_owner_required", "Only this project's manager, an Engineering Manager, or an Admin can change its plan.");
        }
        if (currentStatus === "Closed") throw new ApiError(409, "project_closed", "A closed project's schedule cannot be changed.");
        await validateScheduleVersion(transaction, id, body.scheduleVersion === undefined || body.scheduleVersion === null ? null : requiredText(body.scheduleVersion, 64, "Schedule version"));
        await syncProjectPlan(transaction, id, plan, actor.id);
        scheduleVersion = (await currentScheduleVersion(transaction, id))?.toString("base64") ?? null;
      }
      await writeProjectDetails(transaction, id, details, actor.id);
      // Writing the team moves the row version again; hand back the one the client must send next.
      const latest = (await new sql.Request(transaction).input("id", sql.BigInt, id).query<{ row_version: Buffer }>(`SELECT row_version FROM dbo.projects WHERE id=@id;`)).recordset[0]!;
      const after = { ...input, status: statusValue, progress, ...details, ...(plan ? { masterPlan: plan.milestones, teamPlan: plan.team } : {}) };
      await insertAudit(transaction, actor.id, "Project", id, String(before.project_no), transition.changed ? `Status ${currentStatus} to ${statusValue}` : "Updated", before, after);
      return {
        id, number: String(before.project_no), ...after, scheduleVersion,
        rowVersion: latest.row_version.toString("base64"),
      };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
}
