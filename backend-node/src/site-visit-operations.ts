import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { ApiError } from "./errors.js";
import { issueDocumentNumber } from "./document-number.js";
import {
  recordSiteVisitStatus,
  requireRowVersion,
  rowVersion,
} from "./site-visit-common.js";

export async function lockVisit(
  t: TransactionType,
  id: number,
  expected?: unknown,
) {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, id);
  const r = (
    await q.query<Record<string, unknown>>(
      `SELECT v.id,v.visit_no,v.status,v.intake_id,i.intake_no,i.sales_owner_id,v.scheduled_start,v.scheduled_end,v.travel_minutes_before,v.travel_minutes_after,v.required_engineer_count,v.sla_policy_id,ISNULL(sla.report_due_days,3) report_due_days,v.checked_in_at,v.checked_out_at,v.row_version,v.archived_at FROM dbo.site_visits v WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id LEFT JOIN dbo.visit_sla_policies sla ON sla.id=v.sla_policy_id WHERE v.id=@id AND v.deleted_at IS NULL;`,
    )
  ).recordset[0];
  if (!r) throw new ApiError(404, "visit_not_found", "Site visit not found.");
  if (expected !== undefined)
    requireRowVersion(expected, r.row_version as Buffer);
  if (r.archived_at)
    throw new ApiError(
      409,
      "visit_archived",
      "An archived site visit cannot be changed.",
    );
  return {
    id: Number(r.id),
    number: String(r.visit_no),
    status: String(r.status),
    intakeId: Number(r.intake_id),
    intakeNumber: String(r.intake_no),
    salesOwnerId: Number(r.sales_owner_id),
    scheduledStart: r.scheduled_start as Date | null,
    scheduledEnd: r.scheduled_end as Date | null,
    travelBefore: Number(r.travel_minutes_before),
    travelAfter: Number(r.travel_minutes_after),
    requiredEngineerCount: Number(r.required_engineer_count),
    slaPolicyId: r.sla_policy_id == null ? null : Number(r.sla_policy_id),
    reportDueDays: Number(r.report_due_days),
    checkedInAt: r.checked_in_at as Date | null,
    checkedOutAt: r.checked_out_at as Date | null,
  };
}
export async function activeEngineerIds(
  t: TransactionType,
  visitId: number,
): Promise<number[]> {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, visitId);
  const r = await q.query<{ engineer_id: number | string }>(
    `SELECT engineer_id FROM dbo.site_visit_assignments WHERE visit_id=@id AND is_active=1;`,
  );
  return r.recordset.map((x) => Number(x.engineer_id));
}
export async function demandAssignedEngineer(
  t: TransactionType,
  visitId: number,
  actorId: number,
): Promise<void> {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, visitId);
  q.input("actor", sql.BigInt, actorId);
  const r = (
    await q.query<{ valid: boolean }>(
      `SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.site_visit_assignments WHERE visit_id=@id AND engineer_id=@actor AND is_active=1 AND status=N'Accepted') THEN 1 ELSE 0 END AS bit) valid;`,
    )
  ).recordset[0];
  if (!r?.valid)
    throw new ApiError(
      403,
      "not_assigned",
      "Only an engineer who accepted this visit can record work on it.",
    );
}
export async function checkAvailability(
  t: TransactionType,
  engineerId: number,
  start: Date | string,
  end: Date | string,
  travelBefore: number,
  travelAfter: number,
  excludeVisitId: number | null,
  allowConflict: boolean,
) {
  const q = new sql.Request(t);
  q.input("engineer_id", sql.BigInt, engineerId);
  q.input("starts_at", sql.DateTimeOffset, start);
  q.input("ends_at", sql.DateTimeOffset, end);
  q.input("travel_minutes_before", sql.Int, travelBefore);
  q.input("travel_minutes_after", sql.Int, travelAfter);
  q.input("exclude_visit_id", sql.BigInt, excludeVisitId);
  q.input("allow_conflict", sql.Bit, allowConflict);
  q.output("conflict_count", sql.Int);
  q.output("conflict_detail", sql.NVarChar(1000));
  const r = await q.execute("dbo.assert_engineer_available");
  return {
    conflicts: Number(r.output.conflict_count ?? 0),
    detail: String(r.output.conflict_detail ?? ""),
  };
}
export async function visitVersion(
  t: TransactionType,
  id: number,
): Promise<string> {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, id);
  const r = (
    await q.query<{ row_version: Buffer }>(
      `SELECT row_version FROM dbo.site_visits WHERE id=@id;`,
    )
  ).recordset[0];
  if (!r) throw new ApiError(404, "visit_not_found", "Site visit not found.");
  return rowVersion(r.row_version);
}
export async function reportVersion(
  t: TransactionType,
  id: number,
): Promise<string> {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, id);
  const r = (
    await q.query<{ row_version: Buffer }>(
      `SELECT row_version FROM dbo.site_visit_reports WHERE id=@id;`,
    )
  ).recordset[0];
  if (!r)
    throw new ApiError(404, "report_not_found", "Site visit report not found.");
  return rowVersion(r.row_version);
}
export async function lockReport(
  t: TransactionType,
  visitId: number,
  expected?: unknown,
) {
  const q = new sql.Request(t);
  q.input("visit", sql.BigInt, visitId);
  const r = (
    await q.query<Record<string, unknown>>(
      `SELECT r.id,r.report_no,r.status,r.current_revision,r.author_id,r.visit_id,v.visit_no,r.row_version FROM dbo.site_visit_reports r WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.site_visits v ON v.id=r.visit_id WHERE r.visit_id=@visit AND v.deleted_at IS NULL;`,
    )
  ).recordset[0];
  if (!r)
    throw new ApiError(404, "report_not_found", "Site visit report not found.");
  if (expected !== undefined)
    requireRowVersion(expected, r.row_version as Buffer);
  return {
    id: Number(r.id),
    number: String(r.report_no),
    status: String(r.status),
    currentRevision: Number(r.current_revision),
    authorId: Number(r.author_id),
    visitId: Number(r.visit_id),
    visitNumber: String(r.visit_no),
  };
}
export async function ensureReport(
  t: TransactionType,
  visitId: number,
  visitNumber: string,
  actorId: number,
  dueAt: Date,
  today: string,
): Promise<string> {
  const find = new sql.Request(t);
  find.input("visit", sql.BigInt, visitId);
  const existing = (
    await find.query<{ report_no: string }>(
      `SELECT report_no FROM dbo.site_visit_reports WHERE visit_id=@visit;`,
    )
  ).recordset[0];
  if (existing) return existing.report_no;
  const number = await issueDocumentNumber(t, "SVR", today);
  const q = new sql.Request(t);
  q.input("number", sql.NVarChar(30), number);
  q.input("visit", sql.BigInt, visitId);
  q.input("actor", sql.BigInt, actorId);
  q.input("due", sql.DateTimeOffset, dueAt);
  const reportId = Number(
    (
      await q.query<{ id: number | string }>(
        `INSERT INTO dbo.site_visit_reports(report_no,visit_id,status,current_revision,author_id,due_at,updated_by) OUTPUT inserted.id VALUES(@number,@visit,N'Draft',0,@actor,@due,@actor);`,
      )
    ).recordset[0]!.id,
  );
  const seed = new sql.Request(t);
  seed.input("report", sql.BigInt, reportId);
  seed.input("visit", sql.BigInt, visitId);
  seed.input("actor", sql.BigInt, actorId);
  await seed.query(
    `INSERT INTO dbo.site_visit_report_revisions(report_id,revision,status,customer_requirement,existing_condition,findings_summary,measurement_summary,risk,safety_concern,customer_additional_request,proposed_scope,change_summary,created_by) SELECT @report,0,N'Draft',CONCAT_WS(CHAR(10)+CHAR(10),NULLIF(i.problem_statement,N''),NULLIF(i.desired_capability,N''),NULLIF(i.expected_result,N'')),NULLIF(i.existing_process,N''),(SELECT STRING_AGG(N'- '+f.title,CHAR(10)) FROM dbo.site_visit_findings f WHERE f.visit_id=v.id AND f.deleted_at IS NULL AND f.kind=N'Finding'),(SELECT STRING_AGG(N'- '+f.title+N': '+ISNULL(CONVERT(nvarchar(40),f.measurement_value),N'')+N' '+f.measurement_unit,CHAR(10)) FROM dbo.site_visit_findings f WHERE f.visit_id=v.id AND f.deleted_at IS NULL AND f.kind=N'Measurement'),(SELECT STRING_AGG(N'- '+f.title,CHAR(10)) FROM dbo.site_visit_findings f WHERE f.visit_id=v.id AND f.deleted_at IS NULL AND f.kind=N'Risk'),(SELECT STRING_AGG(N'- '+f.title,CHAR(10)) FROM dbo.site_visit_findings f WHERE f.visit_id=v.id AND f.deleted_at IS NULL AND f.kind=N'Safety Concern'),(SELECT STRING_AGG(N'- '+f.title,CHAR(10)) FROM dbo.site_visit_findings f WHERE f.visit_id=v.id AND f.deleted_at IS NULL AND f.kind=N'Customer Request'),(SELECT STRING_AGG(N'- '+f.title,CHAR(10)) FROM dbo.site_visit_findings f WHERE f.visit_id=v.id AND f.deleted_at IS NULL AND f.kind=N'Proposed Solution'),N'Initial draft prefilled from the intake and the site findings',@actor FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id WHERE v.id=@visit;`,
  );
  await recordSiteVisitStatus(
    t,
    "SiteVisitReport",
    reportId,
    number,
    null,
    "Draft",
    `Report opened for ${visitNumber}`,
    actorId,
  );
  return number;
}
