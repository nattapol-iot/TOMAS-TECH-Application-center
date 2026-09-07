import sql from "mssql";
import type { Database } from "./db.js";
import { dateOnly } from "./http.js";
import {
  allowedTransitions,
  loadStatusHistory,
  loadTraceabilityLinks,
  reportSlaState,
  rolePermissions,
  rowVersion,
  SITE_VISIT_PERMISSIONS,
  VISIT_TRANSITIONS,
} from "./site-visit-common.js";

type Row = Record<string, unknown>;

export const visitSummaryColumns = `v.id,v.visit_no,v.intake_id,i.intake_no,v.status,i.customer_id,c.name customer_name,i.site_name,i.subject,v.visit_type_id,t.name_en visit_type_name,v.scheduled_start,v.scheduled_end,v.time_zone_id,v.required_engineer_count,(SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1) assigned_count,(SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1 AND a.status=N'Accepted') accepted_count,(SELECT TOP(1)u.name FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id WHERE a.visit_id=v.id AND a.is_active=1 AND a.assignment_role=N'Lead Engineer') lead_engineer_name,ISNULL((SELECT STRING_AGG(u.name,N', ') FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id WHERE a.visit_id=v.id AND a.is_active=1),N'') engineer_names,v.engineer_confirmed_at,v.customer_confirmed_at,v.checked_in_at,v.checked_out_at,v.report_due_at,r.status report_status,r.submitted_at,(SELECT ISNULL(AVG(CAST(a.skill_match_percent AS int)),0) FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1) skill_match_percent,v.updated_at,v.row_version,v.archived_at`;
export const visitSummaryFrom = `FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id LEFT JOIN dbo.site_visit_reports r ON r.visit_id=v.id`;

export function visitSummary(row: Row) {
  return {
    id: Number(row.id),
    number: row.visit_no,
    intakeId: Number(row.intake_id),
    intakeNumber: row.intake_no,
    status: row.status,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    siteName: row.site_name,
    subject: row.subject,
    visitTypeId: Number(row.visit_type_id),
    visitTypeName: row.visit_type_name,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    timeZoneId: row.time_zone_id,
    requiredEngineerCount: Number(row.required_engineer_count),
    assignedCount: Number(row.assigned_count),
    acceptedCount: Number(row.accepted_count),
    leadEngineerName: row.lead_engineer_name,
    engineerNames: row.engineer_names,
    engineerConfirmed: row.engineer_confirmed_at != null,
    customerConfirmed: row.customer_confirmed_at != null,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    reportDueAt: row.report_due_at,
    reportStatus: row.report_status,
    reportSlaState: reportSlaState(
      row.report_due_at as Date | null,
      row.report_status as string | null,
      row.submitted_at as Date | null,
    ),
    skillMatchPercent: Number(row.skill_match_percent),
    updatedAt: row.updated_at,
    rowVersion: rowVersion(row.row_version),
    isArchived: row.archived_at != null,
  };
}

export async function requiredSkillCodes(
  database: Database,
  intakeId: number,
): Promise<string[]> {
  const result = await database.query<{ code: string }>(
    `DECLARE @source nvarchar(20)=CASE WHEN EXISTS(SELECT 1 FROM dbo.sales_intake_skills WHERE intake_id=@id AND source=N'Coordinator') THEN N'Coordinator' ELSE N'Sales' END; SELECT k.code FROM dbo.sales_intake_skills s INNER JOIN dbo.visit_skills k ON k.id=s.skill_id WHERE s.intake_id=@id AND s.source=@source ORDER BY k.sort_order,k.code;`,
    (q) => q.input("id", sql.BigInt, intakeId),
  );
  return result.recordset.map((r) => r.code);
}
export function skillMatch(required: string[], held: string[]) {
  const wanted = [
      ...new Set(required.map((x) => x.trim().toUpperCase()).filter(Boolean)),
    ],
    have = new Set(held.map((x) => x.trim().toUpperCase()));
  const missing = wanted.filter((x) => !have.has(x));
  return {
    percent: wanted.length
      ? Math.round(((wanted.length - missing.length) * 100) / wanted.length)
      : 100,
    missing,
  };
}

function assignment(r: Row, required: string[]) {
  const skills = String(r.skills ?? "")
      .split(",")
      .filter(Boolean),
    match = skillMatch(required, skills);
  return {
    id: Number(r.id),
    engineerId: Number(r.engineer_id),
    engineerName: r.engineer_name,
    department: r.department,
    assignmentRole: r.assignment_role,
    status: r.status,
    skillMatchPercent: Number(r.skill_match_percent),
    skills,
    missingSkills: match.missing,
    conflictOverride: Boolean(r.conflict_override),
    overrideReason: r.override_reason,
    overrideByName: r.override_by_name,
    overrideAt: r.override_at,
    respondedAt: r.responded_at,
    responseNote: r.response_note,
    proposedStart: r.proposed_start,
    proposedEnd: r.proposed_end,
    isActive: Boolean(r.is_active),
    assignedByName: r.assigned_by_name,
    assignedAt: r.assigned_at,
    rowVersion: rowVersion(r.row_version),
  };
}

const reportBodyColumns = [
  "visit_summary",
  "customer_requirement",
  "existing_condition",
  "findings_summary",
  "measurement_summary",
  "root_cause",
  "recommended_solution",
  "proposed_scope",
  "assumption",
  "exclusion",
  "risk",
  "safety_concern",
  "customer_additional_request",
  "engineer_conclusion",
  "sales_follow_up",
  "next_step",
] as const;
const reportBodyFields = [
  "visitSummary",
  "customerRequirement",
  "existingCondition",
  "findingsSummary",
  "measurementSummary",
  "rootCause",
  "recommendedSolution",
  "proposedScope",
  "assumption",
  "exclusion",
  "risk",
  "safetyConcern",
  "customerAdditionalRequest",
  "engineerConclusion",
  "salesFollowUp",
  "nextStep",
] as const;

export async function loadVisitReport(database: Database, visitId: number) {
  const header = (
    await database.query<Row>(
      `SELECT r.*,v.visit_no,au.name author_name,rev.name reviewed_by_name FROM dbo.site_visit_reports r INNER JOIN dbo.site_visits v ON v.id=r.visit_id INNER JOIN dbo.users au ON au.id=r.author_id LEFT JOIN dbo.users rev ON rev.id=r.reviewed_by WHERE r.visit_id=@id;`,
      (q) => q.input("id", sql.BigInt, visitId),
    )
  ).recordset[0];
  if (!header) return null;
  const revisions = await database.query<Row>(
    `SELECT rv.*,cre.name created_by_name,apr.name approved_by_name FROM dbo.site_visit_report_revisions rv INNER JOIN dbo.users cre ON cre.id=rv.created_by LEFT JOIN dbo.users apr ON apr.id=rv.approved_by WHERE rv.report_id=@id ORDER BY rv.revision DESC;`,
    (q) => q.input("id", sql.BigInt, Number(header.id)),
  );
  const mapped = revisions.recordset.map((r) => ({
    id: Number(r.id),
    revision: Number(r.revision),
    status: r.status,
    ...Object.fromEntries(
      reportBodyFields.map((field, index) => [
        field,
        String(r[reportBodyColumns[index]!] ?? ""),
      ]),
    ),
    changeSummary: r.change_summary,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    approvedByName: r.approved_by_name,
    approvedAt: r.approved_at,
    rowVersion: rowVersion(r.row_version),
  }));
  return {
    id: Number(header.id),
    number: header.report_no,
    visitId: Number(header.visit_id),
    visitNumber: header.visit_no,
    status: header.status,
    currentRevision: Number(header.current_revision),
    authorId: Number(header.author_id),
    authorName: header.author_name,
    submittedAt: header.submitted_at,
    reviewedByName: header.reviewed_by_name,
    reviewedAt: header.reviewed_at,
    reviewComment: header.review_comment ?? "",
    customerAcknowledgedBy: header.customer_acknowledged_by,
    customerAcknowledgedAt: header.customer_acknowledged_at,
    hasCustomerSignature: header.customer_signature_storage_key != null,
    dueAt: header.due_at,
    slaState: reportSlaState(
      header.due_at as Date | null,
      String(header.status),
      header.submitted_at as Date | null,
    ),
    createdAt: header.created_at,
    updatedAt: header.updated_at,
    rowVersion: rowVersion(header.row_version),
    current:
      mapped.find((r) => r.revision === Number(header.current_revision)) ??
      null,
    revisions: mapped,
  };
}

export async function loadVisitDetail(
  database: Database,
  id: number,
  actorId: number,
  role: string,
) {
  const h = (
    await database.query<Row>(
      `SELECT v.*,i.intake_no,i.subject intake_subject,i.customer_id,c.code customer_code,c.name customer_name,i.site_name,i.site_address,i.contact_name,i.contact_phone,i.contact_email,t.name_en visit_type_name,ct.name checklist_template_name,sla.name sla_policy_name,ISNULL(sla.report_due_days,3) report_due_days,cin.name checked_in_by_name,cout.name checked_out_by_name,cby.name closed_by_name,cre.name created_by_name,upd.name updated_by_name FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id INNER JOIN dbo.users cre ON cre.id=v.created_by INNER JOIN dbo.users upd ON upd.id=v.updated_by LEFT JOIN dbo.visit_checklist_templates ct ON ct.id=v.checklist_template_id LEFT JOIN dbo.visit_sla_policies sla ON sla.id=v.sla_policy_id LEFT JOIN dbo.users cin ON cin.id=v.checked_in_by LEFT JOIN dbo.users cout ON cout.id=v.checked_out_by LEFT JOIN dbo.users cby ON cby.id=v.closed_by WHERE v.id=@id AND v.deleted_at IS NULL;`,
      (q) => q.input("id", sql.BigInt, id),
    )
  ).recordset[0];
  if (!h) return null;
  const required = await requiredSkillCodes(database, Number(h.intake_id));
  const [
    assignmentsResult,
    confirmations,
    scheduleHistory,
    checklist,
    findings,
    attachments,
    actions,
    history,
    links,
    report,
    permissions,
  ] = await Promise.all([
    database.query<Row>(
      `SELECT a.*,u.name engineer_name,u.department,asg.name assigned_by_name,ov.name override_by_name,ISNULL((SELECT STRING_AGG(k.code,N',') FROM dbo.engineer_skills es INNER JOIN dbo.visit_skills k ON k.id=es.skill_id WHERE es.user_id=a.engineer_id),N'') skills FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id INNER JOIN dbo.users asg ON asg.id=a.assigned_by LEFT JOIN dbo.users ov ON ov.id=a.override_by WHERE a.visit_id=@id ORDER BY a.is_active DESC,a.assignment_role,a.assigned_at DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT c.*,u.name recorded_by_name FROM dbo.site_visit_confirmations c INNER JOIN dbo.users u ON u.id=c.recorded_by WHERE c.visit_id=@id ORDER BY c.confirmed_at DESC,c.id DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT s.*,u.name changed_by_name FROM dbo.site_visit_schedule_history s INNER JOIN dbo.users u ON u.id=s.changed_by WHERE s.visit_id=@id ORDER BY s.changed_at DESC,s.id DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT ci.id item_id,ci.sort_order,ci.section,ci.prompt,ci.response_type,ci.unit item_unit,ci.is_required,ci.guidance,r.id response_id,r.response_value,r.numeric_value,ISNULL(r.unit,N'') unit,ISNULL(r.is_not_applicable,0) is_not_applicable,r.note,u.name answered_by_name,r.answered_at,r.row_version FROM dbo.site_visits v INNER JOIN dbo.visit_checklist_items ci ON ci.template_id=v.checklist_template_id AND ci.is_active=1 LEFT JOIN dbo.site_visit_checklist_responses r ON r.visit_id=v.id AND r.checklist_item_id=ci.id LEFT JOIN dbo.users u ON u.id=r.answered_by WHERE v.id=@id ORDER BY ci.sort_order;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT f.*,u.name created_by_name FROM dbo.site_visit_findings f INNER JOIN dbo.users u ON u.id=f.created_by WHERE f.visit_id=@id AND f.deleted_at IS NULL ORDER BY f.kind,f.sort_order,f.id;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT a.*,u.name uploaded_by_name FROM dbo.site_visit_attachments a INNER JOIN dbo.users u ON u.id=a.uploaded_by WHERE a.visit_id=@id AND a.deleted_at IS NULL ORDER BY a.uploaded_at DESC,a.id DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT a.*,u.name created_by_name FROM dbo.site_visit_action_items a INNER JOIN dbo.users u ON u.id=a.created_by WHERE a.visit_id=@id AND a.deleted_at IS NULL ORDER BY CASE a.status WHEN N'Open' THEN 0 WHEN N'In Progress' THEN 1 ELSE 2 END,a.due_date,a.id;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    loadStatusHistory(database, "SiteVisit", id),
    loadTraceabilityLinks(database, "SiteVisit", id),
    loadVisitReport(database, id),
    rolePermissions(database, role),
  ]);
  const assignments = assignmentsResult.recordset.map((r) =>
      assignment(r, required),
    ),
    team = skillMatch(
      required,
      assignments.filter((a) => a.isActive).flatMap((a) => a.skills),
    );
  return {
    id: Number(h.id),
    number: h.visit_no,
    status: h.status,
    intakeId: Number(h.intake_id),
    intakeNumber: h.intake_no,
    intakeSubject: h.intake_subject,
    customerId: Number(h.customer_id),
    customerCode: h.customer_code,
    customerName: h.customer_name,
    siteName: h.site_name,
    siteAddress: h.site_address,
    contactName: h.contact_name,
    contactPhone: h.contact_phone,
    contactEmail: h.contact_email,
    visitTypeId: Number(h.visit_type_id),
    visitTypeName: h.visit_type_name,
    checklistTemplateId:
      h.checklist_template_id == null ? null : Number(h.checklist_template_id),
    checklistTemplateName: h.checklist_template_name,
    slaPolicyId: h.sla_policy_id == null ? null : Number(h.sla_policy_id),
    slaPolicyName: h.sla_policy_name,
    reportDueDays: Number(h.report_due_days),
    scheduledStart: h.scheduled_start,
    scheduledEnd: h.scheduled_end,
    timeZoneId: h.time_zone_id,
    travelMinutesBefore: Number(h.travel_minutes_before),
    travelMinutesAfter: Number(h.travel_minutes_after),
    meetingPoint: h.meeting_point,
    requiredEquipment: h.required_equipment ?? "",
    internalNote: h.internal_note ?? "",
    customerNote: h.customer_note ?? "",
    requiredEngineerCount: Number(h.required_engineer_count),
    engineerConfirmedAt: h.engineer_confirmed_at,
    customerConfirmedAt: h.customer_confirmed_at,
    checkedInAt: h.checked_in_at,
    checkedInByName: h.checked_in_by_name,
    checkInLatitude:
      h.check_in_latitude == null ? null : Number(h.check_in_latitude),
    checkInLongitude:
      h.check_in_longitude == null ? null : Number(h.check_in_longitude),
    locationConsentGiven: Boolean(h.location_consent_given),
    checkedOutAt: h.checked_out_at,
    checkedOutByName: h.checked_out_by_name,
    actualAttendees: h.actual_attendees ?? "",
    customerAttendees: h.customer_attendees ?? "",
    executionNote: h.execution_note ?? "",
    reportDueAt: h.report_due_at,
    reportSlaState: reportSlaState(
      h.report_due_at as Date | null,
      report?.status == null ? null : String(report.status),
      report?.submittedAt as Date | null,
    ),
    closedAt: h.closed_at,
    closedByName: h.closed_by_name,
    closeReason: h.close_reason ?? "",
    department: h.department,
    createdByName: h.created_by_name,
    createdAt: h.created_at,
    updatedByName: h.updated_by_name,
    updatedAt: h.updated_at,
    isArchived: h.archived_at != null,
    rowVersion: rowVersion(h.row_version),
    requiredSkills: required,
    teamSkillMatchPercent: team.percent,
    missingSkills: team.missing,
    assignments,
    confirmations: confirmations.recordset.map((r) => ({
      id: Number(r.id),
      party: r.party,
      outcome: r.outcome,
      channel: r.channel,
      confirmedByName: r.confirmed_by_name,
      confirmedAt: r.confirmed_at,
      comment: r.comment ?? "",
      evidenceAttachmentId:
        r.evidence_attachment_id == null
          ? null
          : Number(r.evidence_attachment_id),
      recordedByName: r.recorded_by_name,
      recordedAt: r.recorded_at,
    })),
    scheduleHistory: scheduleHistory.recordset.map((r) => ({
      id: Number(r.id),
      previousStart: r.previous_start,
      previousEnd: r.previous_end,
      newStart: r.new_start,
      newEnd: r.new_end,
      reason: r.reason,
      changedByName: r.changed_by_name,
      changedAt: r.changed_at,
    })),
    checklist: checklist.recordset.map((r) => ({
      itemId: Number(r.item_id),
      sortOrder: Number(r.sort_order),
      section: r.section,
      prompt: r.prompt,
      responseType: r.response_type,
      itemUnit: r.item_unit,
      isRequired: Boolean(r.is_required),
      guidance: r.guidance,
      responseId: r.response_id == null ? null : Number(r.response_id),
      responseValue: r.response_value,
      numericValue: r.numeric_value == null ? null : Number(r.numeric_value),
      unit: r.unit,
      isNotApplicable: Boolean(r.is_not_applicable),
      note: r.note,
      answeredByName: r.answered_by_name,
      answeredAt: r.answered_at,
      rowVersion: r.row_version ? rowVersion(r.row_version) : null,
    })),
    findings: findings.recordset.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      title: r.title,
      detail: r.detail ?? "",
      measurementValue:
        r.measurement_value == null ? null : Number(r.measurement_value),
      measurementUnit: r.measurement_unit,
      severity: r.severity,
      sortOrder: Number(r.sort_order),
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      rowVersion: rowVersion(r.row_version),
    })),
    attachments: attachments.recordset.map((r) => ({
      id: Number(r.id),
      findingId: r.finding_id == null ? null : Number(r.finding_id),
      name: r.name,
      category: r.category,
      description: r.description,
      version: Number(r.version),
      contentType: r.content_type,
      sizeBytes: Number(r.size_bytes),
      scanStatus: r.scan_status,
      uploadedByName: r.uploaded_by_name,
      uploadedAt: r.uploaded_at,
      rowVersion: rowVersion(r.row_version),
    })),
    actionItems: actions.recordset.map((r) => ({
      id: Number(r.id),
      title: r.title,
      detail: r.detail ?? "",
      ownerId: r.owner_id == null ? null : Number(r.owner_id),
      ownerName: r.owner_name,
      dueDate: dateOnly(r.due_date as Date | null),
      status: r.status,
      completedAt: r.completed_at,
      createdByName: r.created_by_name,
      createdAt: r.created_at,
      rowVersion: rowVersion(r.row_version),
    })),
    statusHistory: history,
    links,
    report,
    allowedTransitions: allowedTransitions(
      VISIT_TRANSITIONS,
      String(h.status),
      permissions,
    ),
    canExecute:
      permissions.has(SITE_VISIT_PERMISSIONS.visitExecute) &&
      assignments.some(
        (a) =>
          a.isActive && a.engineerId === actorId && a.status === "Accepted",
      ),
  };
}

export async function visitRowVersion(
  transaction: InstanceType<typeof sql.Transaction>,
  id: number,
): Promise<string> {
  const q = new sql.Request(transaction);
  q.input("id", sql.BigInt, id);
  const r = (
    await q.query<{ row_version: Buffer }>(
      `SELECT row_version FROM dbo.site_visits WHERE id=@id;`,
    )
  ).recordset[0];
  return r ? rowVersion(r.row_version) : "";
}
export { reportBodyColumns, reportBodyFields };
