import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import {
  bodyObject,
  oneOf,
  optionalBodyText,
  parseDateOnly,
  positiveLong,
  requiredInteger,
  requiredText,
} from "../http.js";
import {
  lockReport,
  lockVisit,
  reportVersion,
  visitVersion,
} from "../site-visit-operations.js";
import {
  notifyUsers,
  recordSiteVisitStatus,
  requireTransition,
  rolePermissions,
  SITE_VISIT_PERMISSIONS,
  siteVisitAudit,
  usersWithPermission,
  VISIT_TRANSITIONS,
} from "../site-visit-common.js";
import type { CurrentUserService } from "../users.js";

type Row = Record<string, unknown>;

const reportFields = [
  ["visitSummary", "visit_summary"],
  ["customerRequirement", "customer_requirement"],
  ["existingCondition", "existing_condition"],
  ["findingsSummary", "findings_summary"],
  ["measurementSummary", "measurement_summary"],
  ["rootCause", "root_cause"],
  ["recommendedSolution", "recommended_solution"],
  ["proposedScope", "proposed_scope"],
  ["assumption", "assumption"],
  ["exclusion", "exclusion"],
  ["risk", "risk"],
  ["safetyConcern", "safety_concern"],
  ["customerAdditionalRequest", "customer_additional_request"],
  ["engineerConclusion", "engineer_conclusion"],
  ["salesFollowUp", "sales_follow_up"],
  ["nextStep", "next_step"],
] as const;

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function timestamp(value: unknown, label: string): Date {
  if (typeof value !== "string" || !value.trim()) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()))
    throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return parsed;
}

async function updateReportStatus(
  transaction: TransactionType,
  report: Awaited<ReturnType<typeof lockReport>>,
  status: string,
  actorId: number,
  reason?: string | null,
): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("id", sql.BigInt, report.id);
  request.input("status", sql.NVarChar(30), status);
  request.input("actor", sql.BigInt, actorId);
  await request.query(
    `UPDATE dbo.site_visit_reports SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`,
  );
  await recordSiteVisitStatus(
    transaction,
    "SiteVisitReport",
    report.id,
    report.number,
    report.status,
    status,
    reason ?? null,
    actorId,
  );
}

async function insertLink(
  transaction: TransactionType,
  sourceType: string,
  sourceId: number,
  targetType: string,
  targetId: number,
  targetNumber: string,
  relation: string,
  note: string | null,
  actorId: number,
): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("source_type", sql.NVarChar(30), sourceType);
  request.input("source_id", sql.BigInt, sourceId);
  request.input("target_type", sql.NVarChar(30), targetType);
  request.input("target_id", sql.BigInt, targetId);
  request.input("target_no", sql.NVarChar(50), targetNumber);
  request.input("relation", sql.NVarChar(30), relation);
  request.input("note", sql.NVarChar(1000), note);
  request.input("actor", sql.BigInt, actorId);
  await request.query(`IF NOT EXISTS(SELECT 1 FROM dbo.site_visit_links WITH(UPDLOCK,HOLDLOCK) WHERE source_type=@source_type AND source_id=@source_id AND target_type=@target_type AND target_id=@target_id)
    INSERT INTO dbo.site_visit_links(source_type,source_id,target_type,target_id,target_no,relation,note,created_by)
    VALUES(@source_type,@source_id,@target_type,@target_id,@target_no,@relation,@note,@actor);`);
}

async function loadCarryOver(transaction: TransactionType, visitId: number) {
  const request = new sql.Request(transaction);
  request.input("visit", sql.BigInt, visitId);
  const row = (
    await request.query<Row>(`SELECT v.id,v.visit_no,i.id intake_id,i.intake_no,i.customer_id,i.site_name,i.contact_name,
      i.customer_reference_no,i.sales_owner_id,so.name sales_owner_name,
      CONCAT_WS(CHAR(10)+CHAR(10),NULLIF(i.problem_statement,N''),NULLIF(i.desired_capability,N''),NULLIF(i.expected_result,N''),NULLIF(rv.findings_summary,N'')) requirement,
      CONCAT_WS(CHAR(10)+CHAR(10),NULLIF(i.existing_process,N''),NULLIF(i.current_pain_point,N''),NULLIF(rv.existing_condition,N'')) background,
      CONCAT_WS(CHAR(10)+CHAR(10),NULLIF(i.machine_name,N''),NULLIF(i.controller_brand,N''),NULLIF(rv.measurement_summary,N''),NULLIF(rv.recommended_solution,N'')) technical,
      ISNULL(rv.proposed_scope,ISNULL(i.expected_scope,N'')) proposed_scope,ISNULL(rv.assumption,N'') assumption,
      ISNULL(rv.exclusion,ISNULL(i.out_of_scope,N'')) exclusion,ISNULL(rv.risk,N'') risk,r.status report_status,i.related_inquiry_id
      FROM dbo.site_visits v
      INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id
      INNER JOIN dbo.users so ON so.id=i.sales_owner_id
      LEFT JOIN dbo.site_visit_reports r ON r.visit_id=v.id
      LEFT JOIN dbo.site_visit_report_revisions rv ON rv.report_id=r.id AND rv.status=N'Approved'
      WHERE v.id=@visit AND v.deleted_at IS NULL;`)
  ).recordset[0];
  if (!row) throw new ApiError(404, "visit_not_found", "Site visit not found.");
  return {
    visitId: Number(row.id),
    visitNumber: String(row.visit_no),
    intakeId: Number(row.intake_id),
    intakeNumber: String(row.intake_no),
    customerId: Number(row.customer_id),
    siteName: String(row.site_name ?? ""),
    contactName: String(row.contact_name ?? ""),
    customerReferenceNumber: String(row.customer_reference_no ?? ""),
    salesOwnerId: Number(row.sales_owner_id),
    salesOwnerName: String(row.sales_owner_name ?? ""),
    requirement: String(row.requirement ?? ""),
    background: String(row.background ?? ""),
    technical: String(row.technical ?? ""),
    proposedScope: String(row.proposed_scope ?? ""),
    assumption: String(row.assumption ?? ""),
    exclusion: String(row.exclusion ?? ""),
    risk: String(row.risk ?? ""),
    reportStatus: row.report_status == null ? null : String(row.report_status),
  };
}

export function registerSiteVisitReportRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  app.put("/api/v1/site-visits/:id/report", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitReport);
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    return database.transaction(async (transaction) => {
      const report = await lockReport(transaction, id, body.rowVersion);
      if (
        ["Submitted", "Under Review", "Approved", "Acknowledged"].includes(
          report.status,
        )
      )
        throw new ApiError(
          409,
          "report_locked",
          `A report in '${report.status}' cannot be edited. Ask the reviewer to request a revision.`,
        );
      const update = new sql.Request(transaction);
      update.input("report", sql.BigInt, report.id);
      update.input("revision", sql.Int, report.currentRevision);
      for (const [property, column] of reportFields)
        update.input(
          column,
          sql.NVarChar(sql.MAX),
          optionalBodyText(body[property], 20_000, property),
        );
      update.input(
        "change_summary",
        sql.NVarChar(1000),
        optionalBodyText(body.changeSummary, 1000, "Change summary") ?? "",
      );
      await update.query(
        `UPDATE dbo.site_visit_report_revisions SET ${reportFields
          .map(([, column]) => `${column}=@${column}`)
          .join(
            ",",
          )},change_summary=@change_summary WHERE report_id=@report AND revision=@revision;`,
      );
      const touch = new sql.Request(transaction);
      touch.input("report", sql.BigInt, report.id);
      touch.input("actor", sql.BigInt, actor.id);
      await touch.query(
        `UPDATE dbo.site_visit_reports SET updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@report;`,
      );
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisitReport",
        report.id,
        report.number,
        "Report draft saved",
        undefined,
        { revision: report.currentRevision },
      );
      return {
        visitId: id,
        reportId: report.id,
        number: report.number,
        rowVersion: await reportVersion(transaction, report.id),
      };
    });
  });

  app.post("/api/v1/site-visits/:id/report/submit", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitReport);
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    const permissions = await rolePermissions(database, actor.role);
    return database.transaction(async (transaction) => {
      const report = await lockReport(transaction, id, body.rowVersion);
      if (!["Draft", "Revision Requested"].includes(report.status))
        throw new ApiError(
          409,
          "report_not_draft",
          `A report in '${report.status}' has already been submitted.`,
        );
      const visit = await lockVisit(transaction, id);
      requireTransition(
        VISIT_TRANSITIONS,
        visit.status,
        "Report Under Review",
        permissions,
      );
      const readiness = new sql.Request(transaction);
      readiness.input("report", sql.BigInt, report.id);
      readiness.input("revision", sql.Int, report.currentRevision);
      const ready = Boolean(
        (
          await readiness.query<{ ready: boolean }>(
            `SELECT CAST(CASE WHEN LEN(LTRIM(RTRIM(ISNULL(visit_summary,N''))))>=20 AND LEN(LTRIM(RTRIM(ISNULL(engineer_conclusion,N''))))>=20 THEN 1 ELSE 0 END AS bit) ready FROM dbo.site_visit_report_revisions WHERE report_id=@report AND revision=@revision;`,
          )
        ).recordset[0]?.ready,
      );
      if (!ready)
        throw new ApiError(
          422,
          "report_incomplete",
          "A visit summary and an engineer conclusion are required before submitting.",
        );
      await updateReportStatus(transaction, report, "Submitted", actor.id);
      const update = new sql.Request(transaction);
      update.input("report", sql.BigInt, report.id);
      update.input("revision", sql.Int, report.currentRevision);
      update.input("visit", sql.BigInt, id);
      update.input("actor", sql.BigInt, actor.id);
      await update.query(`UPDATE dbo.site_visit_reports SET submitted_at=SYSUTCDATETIME() WHERE id=@report;
        UPDATE dbo.site_visit_report_revisions SET status=N'Submitted' WHERE report_id=@report AND revision=@revision;
        UPDATE dbo.site_visits SET status=N'Report Under Review',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@visit;`);
      await recordSiteVisitStatus(
        transaction,
        "SiteVisit",
        id,
        visit.number,
        visit.status,
        "Report Under Review",
        "Report submitted",
        actor.id,
      );
      const approvers = await usersWithPermission(
        transaction,
        SITE_VISIT_PERMISSIONS.visitReportApprove,
      );
      await notifyUsers(
        transaction,
        approvers.filter((userId) => userId !== actor.id),
        "report.submitted",
        `${report.number} is waiting for review`,
        `${actor.name} submitted the site visit report for ${visit.number}.`,
        "SiteVisitReport",
        report.id,
        `report.submitted:sitevisitreport:${report.id}:${report.currentRevision}`,
      );
      return {
        visitId: id,
        reportId: report.id,
        status: "Submitted",
        rowVersion: await reportVersion(transaction, report.id),
      };
    });
  });

  app.post("/api/v1/site-visits/:id/report/review", async (request) => {
    await users.demandPermission(
      request,
      SITE_VISIT_PERMISSIONS.visitReportApprove,
    );
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    const decision = oneOf(
      requiredText(body.decision, 30, "Decision"),
      "Decision",
      ["Approved", "Revision Requested"],
    );
    const comment = optionalBodyText(body.comment, 20_000, "Comment");
    if (decision === "Revision Requested" && !comment)
      throw new ApiError(
        400,
        "validation_failed",
        "Say what needs changing, so the engineer knows what to do.",
      );
    const permissions = await rolePermissions(database, actor.role);
    return database.transaction(async (transaction) => {
      const report = await lockReport(transaction, id, body.rowVersion);
      if (!["Submitted", "Under Review"].includes(report.status))
        throw new ApiError(
          409,
          "report_not_in_review",
          `A report in '${report.status}' is not awaiting review.`,
        );
      if (decision === "Approved" && report.authorId === actor.id)
        throw new ApiError(
          403,
          "self_approval_forbidden",
          "The author of a report cannot approve it.",
        );
      const visit = await lockVisit(transaction, id);
      const update = new sql.Request(transaction);
      update.input("report", sql.BigInt, report.id);
      update.input("revision", sql.Int, report.currentRevision);
      update.input("visit", sql.BigInt, id);
      update.input("actor", sql.BigInt, actor.id);
      update.input("comment", sql.NVarChar(sql.MAX), comment);
      if (decision === "Approved") {
        requireTransition(
          VISIT_TRANSITIONS,
          visit.status,
          "Completed",
          permissions,
        );
        await update.query(`UPDATE dbo.site_visit_report_revisions SET status=N'Approved',approved_by=@actor,approved_at=SYSUTCDATETIME() WHERE report_id=@report AND revision=@revision;
          UPDATE dbo.site_visit_reports SET reviewed_by=@actor,reviewed_at=SYSUTCDATETIME(),review_comment=@comment WHERE id=@report;
          UPDATE dbo.site_visits SET status=N'Completed',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@visit;`);
        await updateReportStatus(
          transaction,
          report,
          "Approved",
          actor.id,
          comment,
        );
        await recordSiteVisitStatus(
          transaction,
          "SiteVisit",
          id,
          visit.number,
          visit.status,
          "Completed",
          "Report approved",
          actor.id,
        );
      } else {
        requireTransition(
          VISIT_TRANSITIONS,
          visit.status,
          "Report Pending",
          permissions,
          comment,
        );
        const nextRevision = report.currentRevision + 1;
        update.input("next", sql.Int, nextRevision);
        update.input(
          "change",
          sql.NVarChar(1000),
          `Revision requested: ${comment}`.slice(0, 1000),
        );
        await update.query(`UPDATE dbo.site_visit_report_revisions SET status=N'Superseded' WHERE report_id=@report AND revision=@revision;
          INSERT INTO dbo.site_visit_report_revisions(report_id,revision,status,visit_summary,customer_requirement,existing_condition,findings_summary,measurement_summary,root_cause,recommended_solution,proposed_scope,assumption,exclusion,risk,safety_concern,customer_additional_request,engineer_conclusion,sales_follow_up,next_step,change_summary,created_by)
          SELECT @report,@next,N'Draft',visit_summary,customer_requirement,existing_condition,findings_summary,measurement_summary,root_cause,recommended_solution,proposed_scope,assumption,exclusion,risk,safety_concern,customer_additional_request,engineer_conclusion,sales_follow_up,next_step,@change,@actor FROM dbo.site_visit_report_revisions WHERE report_id=@report AND revision=@revision;
          UPDATE dbo.site_visit_reports SET current_revision=@next,reviewed_by=@actor,reviewed_at=SYSUTCDATETIME(),review_comment=@comment,submitted_at=NULL WHERE id=@report;
          UPDATE dbo.site_visits SET status=N'Report Pending',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@visit;`);
        await updateReportStatus(
          transaction,
          report,
          "Revision Requested",
          actor.id,
          comment,
        );
        await recordSiteVisitStatus(
          transaction,
          "SiteVisit",
          id,
          visit.number,
          visit.status,
          "Report Pending",
          comment,
          actor.id,
        );
      }
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisitReport",
        report.id,
        report.number,
        `Report ${decision.toLowerCase()}`,
        { status: report.status },
        { status: decision, revision: report.currentRevision },
        comment,
      );
      await notifyUsers(
        transaction,
        [report.authorId, visit.salesOwnerId],
        decision === "Approved"
          ? "report.approved"
          : "report.revision_requested",
        `${report.number} was ${decision.toLowerCase()}`,
        comment ?? "The site visit report has been reviewed.",
        "SiteVisitReport",
        report.id,
        `report.review:sitevisitreport:${report.id}:${report.currentRevision}:${decision}`,
      );
      return {
        visitId: id,
        reportId: report.id,
        status: decision,
        rowVersion: await reportVersion(transaction, report.id),
      };
    });
  });

  app.post("/api/v1/site-visits/:id/report/acknowledge", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitReport);
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    const acknowledgedBy = requiredText(
      body.acknowledgedBy,
      200,
      "Acknowledged by",
    );
    const acknowledgedAt = timestamp(body.acknowledgedAt, "Acknowledged at");
    return database.transaction(async (transaction) => {
      const report = await lockReport(transaction, id, body.rowVersion);
      if (report.status !== "Approved")
        throw new ApiError(
          409,
          "report_not_approved",
          "Only an approved report can be acknowledged by the customer.",
        );
      const update = new sql.Request(transaction);
      update.input("report", sql.BigInt, report.id);
      update.input("name", sql.NVarChar(200), acknowledgedBy);
      update.input("at", sql.DateTimeOffset, acknowledgedAt);
      update.input("actor", sql.BigInt, actor.id);
      await update.query(
        `UPDATE dbo.site_visit_reports SET status=N'Acknowledged',customer_acknowledged_by=@name,customer_acknowledged_at=@at,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@report;`,
      );
      await recordSiteVisitStatus(
        transaction,
        "SiteVisitReport",
        report.id,
        report.number,
        report.status,
        "Acknowledged",
        `Acknowledged by ${acknowledgedBy}`,
        actor.id,
      );
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisitReport",
        report.id,
        report.number,
        "Customer acknowledged the report",
        undefined,
        { acknowledgedBy },
      );
      return {
        visitId: id,
        reportId: report.id,
        status: "Acknowledged",
        rowVersion: await reportVersion(transaction, report.id),
      };
    });
  });

  app.post("/api/v1/site-visits/:id/close", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitSchedule);
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    const reason = requiredText(body.reason, 1000, "Reason");
    const permissions = await rolePermissions(database, actor.role);
    return database.transaction(async (transaction) => {
      const visit = await lockVisit(transaction, id, body.rowVersion);
      requireTransition(
        VISIT_TRANSITIONS,
        visit.status,
        "Closed",
        permissions,
        reason,
      );
      const check = new sql.Request(transaction);
      check.input("visit", sql.BigInt, id);
      const hasApprovedReport = Boolean(
        (
          await check.query<{ valid: boolean }>(
            `SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.site_visit_reports WHERE visit_id=@visit AND status IN(N'Approved',N'Acknowledged')) THEN 1 ELSE 0 END AS bit) valid;`,
          )
        ).recordset[0]?.valid,
      );
      if (!hasApprovedReport && reason.length < 20)
        throw new ApiError(
          422,
          "close_reason_required",
          "Closing a visit without an approved report needs a written explanation of at least twenty characters.",
        );
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id);
      update.input("actor", sql.BigInt, actor.id);
      update.input("reason", sql.NVarChar(1000), reason);
      await update.query(
        `UPDATE dbo.site_visits SET status=N'Closed',closed_at=SYSUTCDATETIME(),closed_by=@actor,close_reason=@reason,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`,
      );
      await recordSiteVisitStatus(
        transaction,
        "SiteVisit",
        id,
        visit.number,
        visit.status,
        "Closed",
        reason,
        actor.id,
      );
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisit",
        id,
        visit.number,
        "Visit closed",
        { status: visit.status },
        { status: "Closed", hasApprovedReport },
        reason,
      );
      return {
        id,
        status: "Closed",
        hasApprovedReport,
        rowVersion: await visitVersion(transaction, id),
      };
    });
  });

  app.post("/api/v1/site-visits/:id/links", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitLink);
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    const targetId = requiredInteger(body.targetId, "Target id", 1);
    const targetType = oneOf(
      requiredText(body.targetType, 30, "Target type"),
      "Target type",
      ["Inquiry", "Estimate", "Project"],
    );
    const relation = oneOf(
      optionalBodyText(body.relation, 30, "Relation") ?? "Related To",
      "Relation",
      ["Derived From", "Related To", "Follow-up"],
    );
    const note = optionalBodyText(body.note, 1000, "Note");
    return database.transaction(async (transaction) => {
      const visit = await lockVisit(transaction, id);
      const table =
        targetType === "Inquiry"
          ? "inquiries"
          : targetType === "Estimate"
            ? "estimates"
            : "projects";
      const column =
        targetType === "Inquiry"
          ? "inquiry_no"
          : targetType === "Estimate"
            ? "estimate_no"
            : "project_no";
      const lookup = new sql.Request(transaction);
      lookup.input("target", sql.BigInt, targetId);
      const target = (
        await lookup.query<{ target_no: string }>(
          `SELECT ${column} target_no FROM dbo.${table} WHERE id=@target AND deleted_at IS NULL;`,
        )
      ).recordset[0];
      if (!target)
        throw new ApiError(
          422,
          "invalid_reference",
          `The ${targetType.toLowerCase()} does not exist.`,
        );
      await insertLink(
        transaction,
        "SiteVisit",
        id,
        targetType,
        targetId,
        target.target_no,
        relation,
        note,
        actor.id,
      );
      await insertLink(
        transaction,
        "SalesIntake",
        visit.intakeId,
        targetType,
        targetId,
        target.target_no,
        relation,
        note,
        actor.id,
      );
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisit",
        id,
        visit.number,
        `${targetType} linked`,
        undefined,
        { targetType, targetId, targetNumber: target.target_no, relation },
        note,
      );
      return { id, targetType, targetId, targetNumber: target.target_no };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.post("/api/v1/site-visits/:id/inquiry", async (request, reply) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitLink);
    await users.demandPermission(request, "inquiry.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const body = bodyObject(request.body);
    const projectName = requiredText(body.projectName, 300, "Project name");
    const projectType = requiredText(body.projectType, 100, "Project type");
    const estimateOwnerId = requiredInteger(
      body.estimateOwnerId,
      "Estimate owner",
      1,
    );
    const dueDate = parseDateOnly(body.dueDate, "Due date")!;
    const priority = oneOf(
      requiredText(body.priority, 30, "Priority"),
      "Priority",
      ["Low", "Normal", "High", "Urgent"],
    );
    const probability = requiredInteger(
      body.projectProbability,
      "Project probability",
      0,
      100,
    );
    const grade = oneOf(
      (
        optionalBodyText(
          body.customerInterestGrade,
          1,
          "Customer interest grade",
        ) ?? "C"
      ).toUpperCase(),
      "Customer interest grade",
      ["A", "B", "C", "D"],
    );
    const remark = optionalBodyText(body.remark, 20_000, "Remark");
    const today = todayIn(config.businessTimeZone);
    const due = new Date(`${dueDate}T00:00:00Z`);
    const first = new Date(`${today}T00:00:00Z`);
    const last = new Date(first);
    last.setUTCFullYear(last.getUTCFullYear() + 5);
    if (due < first || due > last)
      throw new ApiError(
        400,
        "validation_failed",
        "The estimate due date must be between today and five years from today.",
      );
    const created = await database.transaction(async (transaction) => {
      const carry = await loadCarryOver(transaction, id);
      // The request already belongs to a customer inquiry. Do not fork the case,
      // including retries and multiple visits raised from the same request.
      const existingInquiry = new sql.Request(transaction);
      existingInquiry.input("visit", sql.BigInt, id);
      existingInquiry.input("intake", sql.BigInt, carry.intakeId);
      const linked = await existingInquiry.query<Row>(`SELECT TOP(1) target_id FROM dbo.site_visit_links WITH(UPDLOCK,HOLDLOCK)
        WHERE target_type=N'Inquiry' AND ((source_type=N'SiteVisit' AND source_id=@visit) OR (source_type=N'SalesIntake' AND source_id=@intake))
        UNION ALL SELECT related_inquiry_id FROM dbo.sales_intakes WITH(UPDLOCK,HOLDLOCK) WHERE id=@intake AND related_inquiry_id IS NOT NULL;`);
      if (linked.recordset.length) throw new ApiError(409, "inquiry_already_linked", "This visit already belongs to an inquiry. Open the existing inquiry to continue.");
      if (!["Approved", "Acknowledged"].includes(carry.reportStatus ?? ""))
        throw new ApiError(
          409,
          "report_not_approved",
          "An inquiry is created from a confirmed site visit — approve the report first.",
        );
      const number = await issueDocumentNumber(transaction, "INQ", today);
      const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number);
      insert.input("today", sql.Date, today);
      insert.input("customer", sql.BigInt, carry.customerId);
      insert.input("contact", sql.NVarChar(200), carry.contactName);
      insert.input("project", sql.NVarChar(300), projectName);
      insert.input("type", sql.NVarChar(100), projectType);
      insert.input(
        "reference",
        sql.NVarChar(100),
        carry.customerReferenceNumber || null,
      );
      insert.input("sales", sql.NVarChar(200), carry.salesOwnerName);
      insert.input("owner", sql.BigInt, estimateOwnerId);
      insert.input("due", sql.Date, dueDate);
      insert.input("priority", sql.NVarChar(30), priority);
      insert.input("probability", sql.TinyInt, probability);
      insert.input("grade", sql.Char(1), grade);
      insert.input(
        "qualification",
        sql.NVarChar(2000),
        `Created from site visit ${carry.visitNumber} (${carry.intakeNumber}).`,
      );
      insert.input("requirement", sql.NVarChar(sql.MAX), carry.requirement);
      insert.input("background", sql.NVarChar(sql.MAX), carry.background);
      insert.input("scope", sql.NVarChar(sql.MAX), carry.proposedScope);
      insert.input("technical", sql.NVarChar(sql.MAX), carry.technical);
      insert.input("site", sql.NVarChar(300), carry.siteName);
      insert.input("standard", sql.NVarChar(sql.MAX), carry.assumption);
      insert.input("special", sql.NVarChar(sql.MAX), carry.exclusion);
      insert.input("remark", sql.NVarChar(sql.MAX), remark ?? carry.risk);
      insert.input("actor", sql.BigInt, actor.id);
      const inquiryId = Number(
        (
          await insert.query<{
            id: number | string;
          }>(`INSERT INTO dbo.inquiries(inquiry_no,inquiry_date,customer_id,contact,project_name,project_type,rfq_no,sales_owner,estimate_owner_id,due_date,priority,status,progress,revision,project_probability,customer_interest_grade,qualification_note,requirement,background,scope_summary,technical,site_location,standard,special,remark,created_by,updated_by)
        OUTPUT inserted.id VALUES(@number,@today,@customer,@contact,@project,@type,@reference,@sales,@owner,@due,@priority,N'New',0,0,@probability,@grade,@qualification,@requirement,@background,@scope,@technical,@site,@standard,@special,@remark,@actor,@actor);`)
        ).recordset[0]!.id,
      );
      await insertLink(
        transaction,
        "SiteVisit",
        id,
        "Inquiry",
        inquiryId,
        number,
        "Derived From",
        `Created from ${carry.visitNumber}`,
        actor.id,
      );
      await insertLink(
        transaction,
        "SalesIntake",
        carry.intakeId,
        "Inquiry",
        inquiryId,
        number,
        "Derived From",
        `Created from ${carry.visitNumber}`,
        actor.id,
      );
      const update = new sql.Request(transaction);
      update.input("inquiry", sql.BigInt, inquiryId);
      update.input("intake", sql.BigInt, carry.intakeId);
      await update.query(
        `UPDATE dbo.sales_intakes SET related_inquiry_id=ISNULL(related_inquiry_id,@inquiry) WHERE id=@intake;`,
      );
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisit",
        id,
        carry.visitNumber,
        "Inquiry created from site visit",
        undefined,
        { inquiryId, number, projectName },
      );
      await notifyUsers(
        transaction,
        [carry.salesOwnerId, estimateOwnerId],
        "visit.inquiry_created",
        `${number} was created from ${carry.visitNumber}`,
        "A site visit has been converted into an inquiry.",
        "SiteVisit",
        id,
        `visit.inquiry_created:sitevisit:${id}:${inquiryId}`,
      );
      return { visitId: id, inquiryId, number };
    });
    return reply
      .status(201)
      .header("Location", `/api/v1/inquiries/${created.inquiryId}`)
      .send(created);
  });

  app.post("/api/v1/site-visits/:id/estimate", async (request, reply) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitLink);
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Visit id");
    const today = todayIn(config.businessTimeZone);
    const result = await database.transaction(async (transaction) => {
      const carry = await loadCarryOver(transaction, id);
      const lookup = new sql.Request(transaction);
      lookup.input("visit", sql.BigInt, id);
      const inquiry = (
        await lookup.query<Row>(
          `SELECT TOP(1)i.id,i.inquiry_no,i.project_name,i.project_type,i.estimate_owner_id,i.due_date,i.estimate_id FROM dbo.site_visit_links l INNER JOIN dbo.inquiries i ON i.id=l.target_id AND i.deleted_at IS NULL WHERE l.source_type=N'SiteVisit' AND l.source_id=@visit AND l.target_type=N'Inquiry' ORDER BY l.created_at DESC,l.id DESC;`,
        )
      ).recordset[0];
      if (!inquiry)
        throw new ApiError(
          409,
          "inquiry_required",
          "Create or link an inquiry first — an estimate always belongs to one.",
        );
      const inquiryId = Number(inquiry.id);
      if (inquiry.estimate_id != null) {
        const existingId = Number(inquiry.estimate_id);
        const existing = new sql.Request(transaction);
        existing.input("id", sql.BigInt, existingId);
        const estimate = (
          await existing.query<{ status: string; estimate_no: string }>(
            `SELECT status,estimate_no FROM dbo.estimates WHERE id=@id AND deleted_at IS NULL;`,
          )
        ).recordset[0];
        if (!estimate)
          throw new ApiError(
            409,
            "estimate_missing",
            "The linked estimate no longer exists.",
          );
        await insertLink(
          transaction,
          "SiteVisit",
          id,
          "Estimate",
          existingId,
          estimate.estimate_no,
          "Related To",
          `Existing estimate for ${inquiry.inquiry_no}`,
          actor.id,
        );
        await insertLink(
          transaction,
          "SalesIntake",
          carry.intakeId,
          "Estimate",
          existingId,
          estimate.estimate_no,
          "Related To",
          `Existing estimate for ${inquiry.inquiry_no}`,
          actor.id,
        );
        await siteVisitAudit(
          transaction,
          actor.id,
          "SiteVisit",
          id,
          carry.visitNumber,
          "Existing estimate linked",
          undefined,
          {
            estimateId: existingId,
            number: estimate.estimate_no,
            status: estimate.status,
          },
        );
        return {
          visitId: id,
          estimateId: existingId,
          number: estimate.estimate_no,
          status: estimate.status,
          created: false,
          message: ["Approved", "Locked"].includes(estimate.status)
            ? `${estimate.estimate_no} is ${estimate.status.toLowerCase()} and cannot be edited. Raise a revision in the Estimate Cost module.`
            : `${estimate.estimate_no} already exists for ${inquiry.inquiry_no} and has been linked to this visit.`,
        };
      }
      const number = await issueDocumentNumber(transaction, "EST", today);
      const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number);
      insert.input("inquiry", sql.BigInt, inquiryId);
      insert.input("customer", sql.BigInt, carry.customerId);
      insert.input("project", sql.NVarChar(300), String(inquiry.project_name));
      insert.input("type", sql.NVarChar(100), String(inquiry.project_type));
      insert.input("owner", sql.BigInt, Number(inquiry.estimate_owner_id));
      insert.input("today", sql.Date, today);
      insert.input("due", sql.Date, inquiry.due_date);
      insert.input("actor", sql.BigInt, actor.id);
      const estimateId = Number(
        (
          await insert.query<{
            id: number | string;
          }>(`INSERT INTO dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,revision,created_date,due_date,status,progress,contingency_rate,created_by,updated_by)
        OUTPUT inserted.id VALUES(@number,@inquiry,@customer,@project,@type,@owner,0,@today,@due,N'Draft',0,0,@actor,@actor);`)
        ).recordset[0]!.id,
      );
      const update = new sql.Request(transaction);
      update.input("estimate", sql.BigInt, estimateId);
      update.input("inquiry", sql.BigInt, inquiryId);
      update.input("actor", sql.BigInt, actor.id);
      const changed = await update.query(
        `UPDATE dbo.inquiries SET estimate_id=@estimate,status=N'Estimating',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@inquiry AND status=N'New' AND estimate_id IS NULL AND deleted_at IS NULL;`,
      );
      if (changed.rowsAffected[0] !== 1)
        throw new ApiError(
          409,
          "inquiry_not_eligible",
          "The inquiry can no longer be converted to an estimate.",
        );
      await insertLink(
        transaction,
        "SiteVisit",
        id,
        "Estimate",
        estimateId,
        number,
        "Derived From",
        `Created from ${carry.visitNumber}`,
        actor.id,
      );
      await insertLink(
        transaction,
        "SalesIntake",
        carry.intakeId,
        "Estimate",
        estimateId,
        number,
        "Derived From",
        `Created from ${carry.visitNumber}`,
        actor.id,
      );
      await siteVisitAudit(
        transaction,
        actor.id,
        "SiteVisit",
        id,
        carry.visitNumber,
        "Estimate created from site visit",
        undefined,
        { estimateId, number, inquiryId },
      );
      await notifyUsers(
        transaction,
        [Number(inquiry.estimate_owner_id), carry.salesOwnerId],
        "visit.estimate_created",
        `${number} was created from ${carry.visitNumber}`,
        "A site visit has been converted into an estimate.",
        "SiteVisit",
        id,
        `visit.estimate_created:sitevisit:${id}:${estimateId}`,
      );
      return { visitId: id, estimateId, number, inquiryId, created: true };
    });
    if (!result.created) return reply.send(result);
    return reply
      .status(201)
      .header("Location", `/api/v1/estimates/${result.estimateId}`)
      .send(result);
  });
}
