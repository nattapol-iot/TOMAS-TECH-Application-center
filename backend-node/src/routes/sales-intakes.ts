import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import {
  contentTypeFor,
  deleteStoredFile,
  multipartText,
  readMultipartUpload,
  sendStoredFile,
  storageKey,
  uploadedFileName,
  validateFileExtension,
  writeStoredFile,
} from "../document-storage.js";
import { ApiError } from "../errors.js";
import {
  bodyObject,
  booleanQuery,
  clampedInteger,
  dateOnly,
  oneOf,
  optionalBodyText,
  optionalPositiveLong,
  optionalText,
  parseDateOnly,
  positiveLong,
  requiredInteger,
  requiredText,
} from "../http.js";
import { issueDocumentNumber } from "../document-number.js";
import {
  allowedTransitions,
  evaluateReadiness,
  INTAKE_TRANSITIONS,
  loadStatusHistory,
  loadTraceabilityLinks,
  notifyUsers,
  recordSiteVisitStatus,
  requireRowVersion,
  requireTransition,
  rolePermissions,
  rowVersion,
  SITE_VISIT_PERMISSIONS,
  siteVisitAudit,
  usersWithPermission,
} from "../site-visit-common.js";
import type { CurrentUserService } from "../users.js";

type Row = Record<string, unknown>;
type Transaction = InstanceType<typeof sql.Transaction>;

const intakeFields = [
  "problemStatement",
  "desiredCapability",
  "expectedResult",
  "expectedScope",
  "outOfScope",
  "existingProcess",
  "currentPainPoint",
  "targetCycleTime",
  "productInformation",
  "qualityRequirement",
  "specialRequirement",
  "budgetRange",
  "expectedTimeline",
  "competitorInformation",
  "additionalNotes",
] as const;
const intakeColumns = [
  "problem_statement",
  "desired_capability",
  "expected_result",
  "expected_scope",
  "out_of_scope",
  "existing_process",
  "current_pain_point",
  "target_cycle_time",
  "product_information",
  "quality_requirement",
  "special_requirement",
  "budget_range",
  "expected_timeline",
  "competitor_information",
  "additional_notes",
] as const;
const machineFields = [
  "machineName",
  "machineModel",
  "machineSerialNo",
  "manufacturer",
  "existingSystem",
  "controllerBrand",
  "availableDrawing",
  "utilityInformation",
  "installationArea",
  "spaceLimitation",
  "workingEnvironment",
  "safetyRequirement",
  "productionSchedule",
  "shutdownWindow",
  "ppeRequirement",
  "siteAccessRequirement",
] as const;
const machineColumns = [
  "machine_name",
  "machine_model",
  "machine_serial_no",
  "manufacturer",
  "existing_system",
  "controller_brand",
  "available_drawing",
  "utility_information",
  "installation_area",
  "space_limitation",
  "working_environment",
  "safety_requirement",
  "production_schedule",
  "shutdown_window",
  "ppe_requirement",
  "site_access_requirement",
] as const;

function nowDate(timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return `${v.year}-${v.month}-${v.day}`;
}
function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}
function clean(value: unknown, maximum: number, label: string): string {
  return optionalBodyText(value, maximum, label) ?? "";
}
function bool(value: unknown): boolean {
  return value === true;
}
function optionalId(value: unknown, label: string): number | null {
  return value == null ? null : requiredInteger(value, label, 1);
}
function idList(value: unknown, label: string, maximum = 20): number[] {
  if (!Array.isArray(value)) return [];
  const ids = [...new Set(value.map((x) => requiredInteger(x, label, 1)))];
  if (ids.length > maximum)
    throw new ApiError(
      400,
      "validation_failed",
      `${label} contains too many values.`,
    );
  return ids;
}

function summary(row: Row) {
  return {
    id: Number(row.id),
    number: row.intake_no,
    status: row.status,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    siteName: row.site_name,
    subject: row.subject,
    requestDate: dateOnly(row.request_date as Date | string),
    salesOwnerId: Number(row.sales_owner_id),
    salesOwnerName: row.sales_owner_name,
    priority: row.priority,
    requiredResponseDate: dateOnly(
      row.required_response_date as Date | string | null,
    ),
    readinessScore: Number(row.readiness_score),
    blockerCount: Number(row.blocker_count),
    warningCount: Number(row.warning_count),
    purposeCount: Number(row.purpose_count),
    attachmentCount: Number(row.attachment_count),
    visitId: row.visit_id == null ? null : Number(row.visit_id),
    visitNumber: row.visit_no,
    visitStatus: row.visit_status,
    scheduledStart: row.scheduled_start,
    updatedAt: row.updated_at,
    rowVersion: rowVersion(row.row_version),
    isArchived: row.archived_at != null,
  };
}

const summarySelect = `
  SELECT i.id,i.intake_no,i.status,i.customer_id,c.name customer_name,i.site_name,i.subject,i.request_date,
    i.sales_owner_id,so.name sales_owner_name,i.priority,i.required_response_date,i.readiness_score,i.blocker_count,i.warning_count,
    (SELECT COUNT_BIG(*) FROM dbo.sales_intake_purposes p WHERE p.intake_id=i.id) purpose_count,
    (SELECT COUNT_BIG(*) FROM dbo.sales_intake_attachments a WHERE a.intake_id=i.id AND a.deleted_at IS NULL) attachment_count,
    v.id visit_id,v.visit_no,v.status visit_status,v.scheduled_start,i.updated_at,i.row_version,i.archived_at`;
const summaryJoins = `
  FROM dbo.sales_intakes i INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.users so ON so.id=i.sales_owner_id
  OUTER APPLY(SELECT TOP(1) sv.id,sv.visit_no,sv.status,sv.scheduled_start FROM dbo.site_visits sv WHERE sv.intake_id=i.id AND sv.deleted_at IS NULL ORDER BY CASE WHEN sv.status IN(N'Cancelled',N'Closed') THEN 1 ELSE 0 END,sv.scheduled_start DESC,sv.id DESC) v`;

function validatePayload(body: Row, config: AppConfig) {
  const contact = object(body.contact),
    requirement = object(body.requirement),
    machine = object(body.machine);
  const customerId = requiredInteger(body.customerId, "Customer", 1),
    salesOwnerId = requiredInteger(body.salesOwnerId, "Sales owner", 1);
  const subject = requiredText(body.subject, 300, "Subject");
  const priority = oneOf(
    requiredText(body.priority, 30, "Priority"),
    "Priority",
    ["Low", "Normal", "High", "Urgent"],
  );
  const source = oneOf(requiredText(body.source, 40, "Source"), "Source", [
    "Email",
    "Phone",
    "Meeting",
    "Existing Customer",
    "Referral",
    "Website",
    "Other",
  ]);
  const contactChannel = oneOf(
    requiredText(contact.contactChannel, 30, "Preferred channel"),
    "Preferred channel",
    ["Email", "Phone", "LINE", "Meeting", "Customer Portal", "Other"],
  );
  const requestDate = parseDateOnly(
    body.requestDate ?? nowDate(config.businessTimeZone),
    "Request date",
  )!;
  const requiredResponseDate = parseDateOnly(
    body.requiredResponseDate,
    "Required response date",
    true,
  );
  const customerExpectedCompletion = parseDateOnly(
    body.customerExpectedCompletion,
    "Expected completion",
    true,
  );
  const visitTypeIds = idList(body.visitTypeIds, "Visit purpose"),
    skillIds = idList(body.skillIds, "Skill");
  const windows = (Array.isArray(body.windows) ? body.windows : []).map(
    (value) => {
      const w = object(value);
      const startsAt = new Date(requiredText(w.startsAt, 80, "Window start")),
        endsAt = new Date(requiredText(w.endsAt, 80, "Window end")),
        preference = requiredInteger(w.preference, "Window preference", 1, 9);
      if (
        Number.isNaN(startsAt.valueOf()) ||
        Number.isNaN(endsAt.valueOf()) ||
        endsAt <= startsAt ||
        endsAt.valueOf() - startsAt.valueOf() > 31 * 86_400_000
      )
        throw new ApiError(
          400,
          "validation_failed",
          "Availability window is invalid.",
        );
      return {
        startsAt,
        endsAt,
        preference,
        note: clean(w.note, 500, "Window note"),
      };
    },
  );
  if (windows.length > 12)
    throw new ApiError(
      400,
      "validation_failed",
      "At most twelve availability windows may be proposed.",
    );
  const normalizedRequirement: Row = {},
    normalizedMachine: Row = {};
  intakeFields.forEach(
    (field, index) =>
      (normalizedRequirement[field] = clean(
        requirement[field],
        [7, 8, 9, 10, 14].includes(index) ? 300 : 20_000,
        field,
      )),
  );
  machineFields.forEach(
    (field, index) =>
      (normalizedMachine[field] = clean(
        machine[field],
        [0, 1, 2, 3, 5, 6, 8, 12, 13, 14].includes(index) ? 500 : 20_000,
        field,
      )),
  );
  return {
    customerId,
    salesOwnerId,
    subject,
    priority,
    source,
    requestDate,
    requiredResponseDate,
    customerExpectedCompletion,
    customerReferenceNo: clean(
      body.customerReferenceNo,
      100,
      "Customer reference number",
    ),
    relatedInquiryId: optionalId(body.relatedInquiryId, "Related inquiry"),
    relatedProjectId: optionalId(body.relatedProjectId, "Related project"),
    contact: {
      siteId: optionalId(contact.siteId, "Site"),
      siteContactId: optionalId(contact.siteContactId, "Site contact"),
      customerBranch: clean(contact.customerBranch, 200, "Customer branch"),
      siteName: clean(contact.siteName, 300, "Site name"),
      siteAddress: clean(contact.siteAddress, 1000, "Site address"),
      contactName: clean(contact.contactName, 200, "Contact name"),
      contactDepartment: clean(
        contact.contactDepartment,
        200,
        "Contact department",
      ),
      contactPosition: clean(contact.contactPosition, 200, "Contact position"),
      contactPhone: clean(contact.contactPhone, 100, "Contact phone"),
      contactEmail: clean(contact.contactEmail, 256, "Contact email"),
      contactChannel,
    },
    requirement: normalizedRequirement,
    machine: {
      ...normalizedMachine,
      photographyRestricted: bool(machine.photographyRestricted),
      ndaRequired: bool(machine.ndaRequired),
    },
    visitTypeIds,
    skillIds,
    windows,
  };
}
type Payload = ReturnType<typeof validatePayload>;

function bindPayload(q: InstanceType<typeof sql.Request>, p: Payload): void {
  q.input("customer", sql.BigInt, p.customerId);
  q.input("site", sql.BigInt, p.contact.siteId);
  q.input("site_contact", sql.BigInt, p.contact.siteContactId);
  q.input("branch", sql.NVarChar(200), p.contact.customerBranch);
  q.input("site_name", sql.NVarChar(300), p.contact.siteName);
  q.input("site_address", sql.NVarChar(1000), p.contact.siteAddress);
  q.input("contact_name", sql.NVarChar(200), p.contact.contactName);
  q.input("contact_department", sql.NVarChar(200), p.contact.contactDepartment);
  q.input("contact_position", sql.NVarChar(200), p.contact.contactPosition);
  q.input("contact_phone", sql.NVarChar(100), p.contact.contactPhone);
  q.input("contact_email", sql.NVarChar(256), p.contact.contactEmail);
  q.input("contact_channel", sql.NVarChar(30), p.contact.contactChannel);
  q.input("reference", sql.NVarChar(100), p.customerReferenceNo);
  q.input("subject", sql.NVarChar(300), p.subject);
  q.input("request_date", sql.Date, p.requestDate);
  q.input("owner", sql.BigInt, p.salesOwnerId);
  q.input("priority", sql.NVarChar(30), p.priority);
  q.input("response_date", sql.Date, p.requiredResponseDate);
  q.input("completion_date", sql.Date, p.customerExpectedCompletion);
  q.input("source", sql.NVarChar(40), p.source);
  q.input("inquiry", sql.BigInt, p.relatedInquiryId);
  q.input("project", sql.BigInt, p.relatedProjectId);
  intakeFields.forEach((field, index) =>
    q.input(intakeColumns[index]!, sql.NVarChar(sql.MAX), p.requirement[field]),
  );
  machineFields.forEach((field, index) =>
    q.input(
      machineColumns[index]!,
      sql.NVarChar(sql.MAX),
      (p.machine as Row)[field],
    ),
  );
  q.input("photo", sql.Bit, p.machine.photographyRestricted);
  q.input("nda", sql.Bit, p.machine.ndaRequired);
}

async function validateReferences(t: Transaction, p: Payload): Promise<void> {
  const q = new sql.Request(t);
  bindPayload(q, p);
  const r = (
    await q.query<{ valid: boolean }>(
      `SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.customers WHERE id=@customer AND is_active=1 AND deleted_at IS NULL) AND EXISTS(SELECT 1 FROM dbo.users WHERE id=@owner AND is_active=1 AND deleted_at IS NULL) AND (@site IS NULL OR EXISTS(SELECT 1 FROM dbo.customer_sites WHERE id=@site AND customer_id=@customer AND is_active=1 AND deleted_at IS NULL)) AND (@site_contact IS NULL OR EXISTS(SELECT 1 FROM dbo.customer_site_contacts sc INNER JOIN dbo.customer_sites s ON s.id=sc.site_id WHERE sc.id=@site_contact AND sc.is_active=1 AND sc.deleted_at IS NULL AND s.customer_id=@customer)) AND (@inquiry IS NULL OR EXISTS(SELECT 1 FROM dbo.inquiries WHERE id=@inquiry AND customer_id=@customer AND deleted_at IS NULL)) AND (@project IS NULL OR EXISTS(SELECT 1 FROM dbo.projects WHERE id=@project AND deleted_at IS NULL)) THEN 1 ELSE 0 END AS bit) valid;`,
    )
  ).recordset[0];
  if (!r?.valid)
    throw new ApiError(
      422,
      "invalid_reference",
      "One or more selected customer, user, site, inquiry, or project records are invalid.",
    );
}

async function replaceChildren(
  t: Transaction,
  id: number,
  p: Payload,
  actorId: number,
  skillSource = "Sales",
): Promise<void> {
  const clear = new sql.Request(t);
  clear.input("id", sql.BigInt, id);
  clear.input("source", sql.NVarChar(20), skillSource);
  await clear.query(
    `DELETE FROM dbo.sales_intake_purposes WHERE intake_id=@id; DELETE FROM dbo.sales_intake_skills WHERE intake_id=@id AND source=@source; DELETE FROM dbo.sales_intake_windows WHERE intake_id=@id AND NOT EXISTS(SELECT 1 FROM dbo.site_visits v WHERE v.proposed_window_id=dbo.sales_intake_windows.id);`,
  );
  for (const value of p.visitTypeIds) {
    const q = new sql.Request(t);
    q.input("id", sql.BigInt, id);
    q.input("value", sql.BigInt, value);
    await q.query(
      `INSERT INTO dbo.sales_intake_purposes(intake_id,visit_type_id) SELECT @id,@value WHERE EXISTS(SELECT 1 FROM dbo.visit_types WHERE id=@value AND is_active=1);`,
    );
  }
  for (const value of p.skillIds) {
    const q = new sql.Request(t);
    q.input("id", sql.BigInt, id);
    q.input("value", sql.BigInt, value);
    q.input("source", sql.NVarChar(20), skillSource);
    q.input("actor", sql.BigInt, actorId);
    await q.query(
      `INSERT INTO dbo.sales_intake_skills(intake_id,skill_id,source,created_by) SELECT @id,@value,@source,@actor WHERE EXISTS(SELECT 1 FROM dbo.visit_skills WHERE id=@value AND is_active=1);`,
    );
  }
  for (const w of p.windows) {
    const q = new sql.Request(t);
    q.input("id", sql.BigInt, id);
    q.input("start", sql.DateTimeOffset, w.startsAt);
    q.input("end", sql.DateTimeOffset, w.endsAt);
    q.input("preference", sql.TinyInt, w.preference);
    q.input("note", sql.NVarChar(500), w.note);
    q.input("actor", sql.BigInt, actorId);
    await q.query(
      `INSERT INTO dbo.sales_intake_windows(intake_id,starts_at,ends_at,preference,note,created_by) VALUES(@id,@start,@end,@preference,@note,@actor);`,
    );
  }
}

async function readiness(t: Transaction, id: number) {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, id);
  const r = (
    await q.query<Row>(
      `SELECT i.customer_id,i.site_name,i.site_address,i.contact_name,i.contact_phone,i.contact_email,ISNULL(i.problem_statement,N'') problem_statement,ISNULL(i.expected_result,N'') expected_result,(SELECT COUNT_BIG(*) FROM dbo.sales_intake_purposes p WHERE p.intake_id=i.id) purpose_count,i.machine_name,i.machine_model,ISNULL(i.existing_system,N'') existing_system,(SELECT COUNT_BIG(*) FROM dbo.sales_intake_attachments a WHERE a.intake_id=i.id AND a.deleted_at IS NULL) attachment_count,(SELECT COUNT_BIG(*) FROM dbo.sales_intake_windows w WHERE w.intake_id=i.id) window_count,ISNULL(i.safety_requirement,N'') safety_requirement,ISNULL(i.site_access_requirement,N'') site_access_requirement,(SELECT COUNT_BIG(*) FROM dbo.sales_intake_skills s WHERE s.intake_id=i.id) skill_count FROM dbo.sales_intakes i WHERE i.id=@id;`,
    )
  ).recordset[0];
  if (!r)
    throw new ApiError(404, "intake_not_found", "Sales intake not found.");
  const result = evaluateReadiness({
    customerId: Number(r.customer_id),
    siteName: String(r.site_name),
    siteAddress: String(r.site_address),
    contactName: String(r.contact_name),
    contactPhone: String(r.contact_phone),
    contactEmail: String(r.contact_email),
    problemStatement: String(r.problem_statement),
    expectedResult: String(r.expected_result),
    purposeCount: Number(r.purpose_count),
    machineName: String(r.machine_name),
    machineModel: String(r.machine_model),
    existingSystem: String(r.existing_system),
    attachmentCount: Number(r.attachment_count),
    windowCount: Number(r.window_count),
    safetyRequirement: String(r.safety_requirement),
    siteAccessRequirement: String(r.site_access_requirement),
    skillCount: Number(r.skill_count),
  });
  const update = new sql.Request(t);
  update.input("id", sql.BigInt, id);
  update.input("score", sql.TinyInt, result.score);
  update.input("blockers", sql.TinyInt, result.blockerCount);
  update.input("warnings", sql.TinyInt, result.warningCount);
  await update.query(
    `UPDATE dbo.sales_intakes SET readiness_score=@score,blocker_count=@blockers,warning_count=@warnings WHERE id=@id;`,
  );
  return result;
}

async function intakeVersion(t: Transaction, id: number): Promise<string> {
  const q = new sql.Request(t);
  q.input("id", sql.BigInt, id);
  const r = (
    await q.query<{ row_version: Buffer }>(
      `SELECT row_version FROM dbo.sales_intakes WHERE id=@id;`,
    )
  ).recordset[0];
  if (!r)
    throw new ApiError(404, "intake_not_found", "Sales intake not found.");
  return rowVersion(r.row_version);
}

function mapVisitSummary(r: Row) {
  return {
    id: Number(r.id),
    number: r.visit_no,
    intakeId: Number(r.intake_id),
    intakeNumber: r.intake_no,
    status: r.status,
    customerId: Number(r.customer_id),
    customerName: r.customer_name,
    siteName: r.site_name,
    subject: r.subject,
    visitTypeId: Number(r.visit_type_id),
    visitTypeName: r.visit_type_name,
    scheduledStart: r.scheduled_start,
    scheduledEnd: r.scheduled_end,
    timeZoneId: r.time_zone_id,
    requiredEngineerCount: Number(r.required_engineer_count),
    assignedCount: Number(r.assigned_count),
    acceptedCount: Number(r.accepted_count),
    leadEngineerName: r.lead_engineer_name,
    engineerNames: r.engineer_names,
    engineerConfirmed: r.engineer_confirmed_at != null,
    customerConfirmed: r.customer_confirmed_at != null,
    checkedInAt: r.checked_in_at,
    checkedOutAt: r.checked_out_at,
    reportDueAt: r.report_due_at,
    reportStatus: r.report_status,
    reportSlaState:
      r.report_due_at &&
      !["Submitted", "Under Review", "Approved", "Acknowledged"].includes(
        String(r.report_status ?? ""),
      ) &&
      new Date(String(r.report_due_at)) < new Date()
        ? "overdue"
        : "not_applicable",
    skillMatchPercent: Number(r.skill_match_percent),
    updatedAt: r.updated_at,
    rowVersion: rowVersion(r.row_version),
    isArchived: r.archived_at != null,
  };
}

export async function loadSalesIntakeDetail(
  database: Database,
  id: number,
  userId: number,
) {
  const h = (
    await database.query<Row>(
      `SELECT i.*,c.code customer_code,c.name customer_name,so.name sales_owner_name,inq.inquiry_no related_inquiry_no,p.project_no related_project_no,sub.name submitted_by_name,cre.name created_by_name,upd.name updated_by_name FROM dbo.sales_intakes i INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.users so ON so.id=i.sales_owner_id INNER JOIN dbo.users cre ON cre.id=i.created_by INNER JOIN dbo.users upd ON upd.id=i.updated_by LEFT JOIN dbo.users sub ON sub.id=i.submitted_by LEFT JOIN dbo.inquiries inq ON inq.id=i.related_inquiry_id LEFT JOIN dbo.projects p ON p.id=i.related_project_id WHERE i.id=@id AND i.deleted_at IS NULL;`,
      (q) => q.input("id", sql.BigInt, id),
    )
  ).recordset[0];
  if (!h) return null;
  const [
    purposes,
    skills,
    windows,
    attachments,
    reviews,
    visits,
    duplicates,
    history,
    links,
    permissions,
  ] = await Promise.all([
    database.query<Row>(
      `SELECT p.visit_type_id,t.code,t.name_en name,p.note FROM dbo.sales_intake_purposes p INNER JOIN dbo.visit_types t ON t.id=p.visit_type_id WHERE p.intake_id=@id ORDER BY t.sort_order,t.code;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT s.skill_id,k.code,k.name_en name,s.source,s.is_mandatory,s.note FROM dbo.sales_intake_skills s INNER JOIN dbo.visit_skills k ON k.id=s.skill_id WHERE s.intake_id=@id ORDER BY s.source,k.sort_order;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT id,starts_at,ends_at,preference,note FROM dbo.sales_intake_windows WHERE intake_id=@id ORDER BY preference,starts_at;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT a.id,a.name,a.category,a.description,a.version,a.content_type,a.size_bytes,a.scan_status,u.name uploaded_by_name,a.uploaded_at,a.row_version FROM dbo.sales_intake_attachments a INNER JOIN dbo.users u ON u.id=a.uploaded_by WHERE a.intake_id=@id AND a.deleted_at IS NULL ORDER BY a.uploaded_at DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT r.id,r.reviewer_id,u.name reviewer_name,r.decision,r.comment,r.visit_scope,r.engineer_count,r.estimated_duration_minutes,r.required_equipment,r.risk_assessment,r.safety_concern,r.requires_manager_approval,m.name manager_approved_by_name,r.manager_approved_at,r.missing_information,r.readiness_score_at_review,r.created_at FROM dbo.sales_intake_reviews r INNER JOIN dbo.users u ON u.id=r.reviewer_id LEFT JOIN dbo.users m ON m.id=r.manager_approved_by WHERE r.intake_id=@id ORDER BY r.created_at DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    database.query<Row>(
      `SELECT v.*,i.intake_no,i.subject,i.customer_id,c.name customer_name,i.site_name,t.name_en visit_type_name,(SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1) assigned_count,(SELECT COUNT_BIG(*) FROM dbo.site_visit_assignments a WHERE a.visit_id=v.id AND a.is_active=1 AND a.status=N'Accepted') accepted_count,(SELECT TOP(1)u.name FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id WHERE a.visit_id=v.id AND a.is_active=1 AND a.assignment_role=N'Lead') lead_engineer_name,ISNULL((SELECT STRING_AGG(u.name,N', ') FROM dbo.site_visit_assignments a INNER JOIN dbo.users u ON u.id=a.engineer_id WHERE a.visit_id=v.id AND a.is_active=1),N'') engineer_names,(SELECT TOP(1)r.status FROM dbo.site_visit_reports r WHERE r.visit_id=v.id) report_status,CAST(100 AS int) skill_match_percent FROM dbo.site_visits v INNER JOIN dbo.sales_intakes i ON i.id=v.intake_id INNER JOIN dbo.customers c ON c.id=i.customer_id INNER JOIN dbo.visit_types t ON t.id=v.visit_type_id WHERE v.intake_id=@id AND v.deleted_at IS NULL ORDER BY v.id DESC;`,
      (q) => q.input("id", sql.BigInt, id),
    ),
    h.customer_reference_no
      ? database.query<Row>(
          `SELECT TOP(10) id,intake_no,subject,request_date,status FROM dbo.sales_intakes WHERE deleted_at IS NULL AND id<>@id AND customer_id=@customer AND customer_reference_no=@reference ORDER BY request_date DESC;`,
          (q) => {
            q.input("id", sql.BigInt, id);
            q.input("customer", sql.BigInt, Number(h.customer_id));
            q.input("reference", sql.NVarChar(100), h.customer_reference_no);
          },
        )
      : Promise.resolve({ recordset: [] } as never),
    loadStatusHistory(database, "SalesIntake", id),
    loadTraceabilityLinks(database, "SalesIntake", id),
    rolePermissions(database, userId),
  ]);
  const readinessResult = evaluateReadiness({
    customerId: Number(h.customer_id),
    siteName: String(h.site_name),
    siteAddress: String(h.site_address),
    contactName: String(h.contact_name),
    contactPhone: String(h.contact_phone),
    contactEmail: String(h.contact_email),
    problemStatement: String(h.problem_statement ?? ""),
    expectedResult: String(h.expected_result ?? ""),
    purposeCount: purposes.recordset.length,
    machineName: String(h.machine_name),
    machineModel: String(h.machine_model),
    existingSystem: String(h.existing_system ?? ""),
    attachmentCount: attachments.recordset.length,
    windowCount: windows.recordset.length,
    safetyRequirement: String(h.safety_requirement ?? ""),
    siteAccessRequirement: String(h.site_access_requirement ?? ""),
    skillCount: skills.recordset.length,
  });
  const requirement = Object.fromEntries(
    intakeFields.map((field, index) => [
      field,
      String(h[intakeColumns[index]!] ?? ""),
    ]),
  );
  const machine = Object.fromEntries(
    machineFields.map((field, index) => [
      field,
      String(h[machineColumns[index]!] ?? ""),
    ]),
  );
  return {
    id: Number(h.id),
    number: h.intake_no,
    status: h.status,
    customerId: Number(h.customer_id),
    customerCode: h.customer_code,
    customerName: h.customer_name,
    subject: h.subject,
    customerReferenceNo: h.customer_reference_no,
    requestDate: dateOnly(h.request_date as Date),
    salesOwnerId: Number(h.sales_owner_id),
    salesOwnerName: h.sales_owner_name,
    priority: h.priority,
    requiredResponseDate: dateOnly(h.required_response_date as Date | null),
    customerExpectedCompletion: dateOnly(
      h.customer_expected_completion as Date | null,
    ),
    source: h.source,
    relatedInquiryId:
      h.related_inquiry_id == null ? null : Number(h.related_inquiry_id),
    relatedInquiryNumber: h.related_inquiry_no,
    relatedProjectId:
      h.related_project_id == null ? null : Number(h.related_project_id),
    relatedProjectNumber: h.related_project_no,
    contact: {
      siteId: h.site_id == null ? null : Number(h.site_id),
      siteContactId:
        h.site_contact_id == null ? null : Number(h.site_contact_id),
      customerBranch: h.customer_branch,
      siteName: h.site_name,
      siteAddress: h.site_address,
      contactName: h.contact_name,
      contactDepartment: h.contact_department,
      contactPosition: h.contact_position,
      contactPhone: h.contact_phone,
      contactEmail: h.contact_email,
      contactChannel: h.contact_channel,
    },
    requirement,
    machine: {
      ...machine,
      photographyRestricted: Boolean(h.photography_restricted),
      ndaRequired: Boolean(h.nda_required),
    },
    readinessScore: Number(h.readiness_score),
    blockerCount: Number(h.blocker_count),
    warningCount: Number(h.warning_count),
    submittedAt: h.submitted_at,
    submittedByName: h.submitted_by_name,
    department: h.department,
    createdByName: h.created_by_name,
    createdAt: h.created_at,
    updatedByName: h.updated_by_name,
    updatedAt: h.updated_at,
    isArchived: h.archived_at != null,
    rowVersion: rowVersion(h.row_version),
    purposes: purposes.recordset.map((r) => ({
      visitTypeId: Number(r.visit_type_id),
      code: r.code,
      name: r.name,
      note: r.note,
    })),
    skills: skills.recordset.map((r) => ({
      skillId: Number(r.skill_id),
      code: r.code,
      name: r.name,
      source: r.source,
      isMandatory: Boolean(r.is_mandatory),
      note: r.note,
    })),
    windows: windows.recordset.map((r) => ({
      id: Number(r.id),
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      preference: Number(r.preference),
      note: r.note,
    })),
    attachments: attachments.recordset.map((r) => ({
      id: Number(r.id),
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
    reviews: reviews.recordset.map((r) => ({
      id: Number(r.id),
      reviewerId: Number(r.reviewer_id),
      reviewerName: r.reviewer_name,
      decision: r.decision,
      comment: r.comment ?? "",
      visitScope: r.visit_scope ?? "",
      engineerCount: Number(r.engineer_count),
      estimatedDurationMinutes: Number(r.estimated_duration_minutes),
      requiredEquipment: r.required_equipment ?? "",
      riskAssessment: r.risk_assessment ?? "",
      safetyConcern: r.safety_concern ?? "",
      requiresManagerApproval: Boolean(r.requires_manager_approval),
      managerApprovedByName: r.manager_approved_by_name,
      managerApprovedAt: r.manager_approved_at,
      missingInformation: r.missing_information ?? "",
      readinessScoreAtReview: Number(r.readiness_score_at_review),
      createdAt: r.created_at,
    })),
    visits: visits.recordset.map(mapVisitSummary),
    statusHistory: history,
    links,
    duplicateReferences: (duplicates as { recordset: Row[] }).recordset.map(
      (r) => ({
        id: Number(r.id),
        number: r.intake_no,
        subject: r.subject,
        requestDate: dateOnly(r.request_date as Date),
        status: r.status,
      }),
    ),
    readiness: readinessResult,
    allowedTransitions: allowedTransitions(
      INTAKE_TRANSITIONS,
      String(h.status),
      permissions,
    ),
  };
}

export function registerSalesIntakeRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  app.get("/api/v1/sales-intakes/", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeRead);
    const actor = await users.required(request),
      qv = request.query as Row,
      page = clampedInteger(qv.page, 1, 1, 1_000_000),
      pageSize = clampedInteger(qv.pageSize, 25, 1, 100),
      search = optionalText(qv.search, 200, "Search"),
      status = optionalText(qv.status, 50, "Status"),
      customer = optionalPositiveLong(qv.customerId, "Customer"),
      inquiry = optionalPositiveLong(qv.relatedInquiryId, "Related inquiry"),
      owner = optionalPositiveLong(qv.salesOwnerId, "Owner"),
      priority = optionalText(qv.priority, 30, "Priority"),
      mine = booleanQuery(qv.mine, false),
      archived = booleanQuery(qv.includeArchived, false),
      from = qv.requestFrom
        ? parseDateOnly(qv.requestFrom, "Request from")
        : null,
      to = qv.requestTo ? parseDateOnly(qv.requestTo, "Request to") : null;
    const result = await database.query<Row>(
      `${summarySelect},COUNT_BIG(*) OVER() total ${summaryJoins} WHERE i.deleted_at IS NULL AND (@inquiry IS NULL OR i.related_inquiry_id=@inquiry OR EXISTS(SELECT 1 FROM dbo.site_visit_links l WHERE l.source_type=N'SalesIntake' AND l.source_id=i.id AND l.target_type=N'Inquiry' AND l.target_id=@inquiry)) AND (@archived=1 OR i.archived_at IS NULL) AND (@status IS NULL OR i.status=@status) AND (@customer IS NULL OR i.customer_id=@customer) AND (@owner IS NULL OR i.sales_owner_id=@owner) AND (@priority IS NULL OR i.priority=@priority) AND (@mine=0 OR i.sales_owner_id=@actor OR i.created_by=@actor) AND (@from IS NULL OR i.request_date>=@from) AND (@to IS NULL OR i.request_date<=@to) AND (@search IS NULL OR i.intake_no LIKE N'%'+@search+N'%' OR i.subject LIKE N'%'+@search+N'%' OR c.name LIKE N'%'+@search+N'%' OR i.site_name LIKE N'%'+@search+N'%' OR i.customer_reference_no LIKE N'%'+@search+N'%') ORDER BY i.updated_at DESC,i.id DESC OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;`,
      (q) => {
        q.input("archived", sql.Bit, archived);
        q.input("status", sql.NVarChar(50), status);
        q.input("customer", sql.BigInt, customer);
        q.input("inquiry", sql.BigInt, inquiry);
        q.input("owner", sql.BigInt, owner);
        q.input("priority", sql.NVarChar(30), priority);
        q.input("mine", sql.Bit, mine);
        q.input("actor", sql.BigInt, actor.id);
        q.input("from", sql.Date, from);
        q.input("to", sql.Date, to);
        q.input("search", sql.NVarChar(200), search);
        q.input("offset", sql.Int, (page - 1) * pageSize);
        q.input("take", sql.Int, pageSize);
      },
    );
    return {
      items: result.recordset.map(summary),
      page,
      pageSize,
      total: Number(result.recordset[0]?.total ?? 0),
    };
  });
  app.get("/api/v1/sales-intakes/review-queue", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeReview);
    const result = await database.query<Row>(
      `${summarySelect} ${summaryJoins} WHERE i.deleted_at IS NULL AND i.archived_at IS NULL AND i.status IN(N'Pending Technical Review',N'More Information Required',N'Ready to Schedule') ORDER BY CASE i.status WHEN N'Pending Technical Review' THEN 0 WHEN N'Ready to Schedule' THEN 1 ELSE 2 END,CASE i.priority WHEN N'Urgent' THEN 0 WHEN N'High' THEN 1 WHEN N'Normal' THEN 2 ELSE 3 END,i.required_response_date,i.updated_at;`,
    );
    return result.recordset.map(summary);
  });
  app.get("/api/v1/sales-intakes/dashboard", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeRead);
    const actor = await users.required(request);
    const counts = (
      await database.query<Row>(
        `SELECT (SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL AND(sales_owner_id=@actor OR created_by=@actor)) intakes,(SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL AND status=N'Pending Technical Review') pending,(SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL AND status=N'More Information Required') more_info,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status=N'Pending Customer Confirmation') waiting_customer,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN(N'Confirmed',N'Tentative',N'Pending Engineer Confirmation') AND scheduled_start>=SYSUTCDATETIME()) upcoming,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN(N'Completed',N'Closed')) completed,(SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status=N'Report Pending') waiting_report,(SELECT COUNT_BIG(*) FROM dbo.site_visit_links WHERE target_type=N'Inquiry') to_inquiry,(SELECT COUNT_BIG(*) FROM dbo.site_visit_links WHERE target_type=N'Estimate') to_estimate;`,
        (q) => q.input("actor", sql.BigInt, actor.id),
      )
    ).recordset[0]!;
    const [by, attention] = await Promise.all([
      database.query<Row>(
        `SELECT status label,COUNT_BIG(*) value FROM dbo.sales_intakes WHERE deleted_at IS NULL GROUP BY status ORDER BY status;`,
      ),
      database.query<Row>(
        `${summarySelect} ${summaryJoins} WHERE i.deleted_at IS NULL AND i.archived_at IS NULL AND(i.sales_owner_id=@actor OR i.created_by=@actor) AND(i.status IN(N'Draft',N'More Information Required') OR(i.status=N'Pending Technical Review' AND i.required_response_date<CONVERT(date,SYSUTCDATETIME()))) ORDER BY CASE i.priority WHEN N'Urgent' THEN 0 WHEN N'High' THEN 1 WHEN N'Normal' THEN 2 ELSE 3 END,i.required_response_date,i.updated_at DESC OFFSET 0 ROWS FETCH NEXT 12 ROWS ONLY;`,
        (q) => q.input("actor", sql.BigInt, actor.id),
      ),
    ]);
    return {
      intakesCreated: Number(counts.intakes),
      pendingTechnicalReview: Number(counts.pending),
      moreInformationRequired: Number(counts.more_info),
      waitingCustomerConfirmation: Number(counts.waiting_customer),
      upcomingVisits: Number(counts.upcoming),
      completedVisits: Number(counts.completed),
      waitingReport: Number(counts.waiting_report),
      convertedToInquiry: Number(counts.to_inquiry),
      convertedToEstimate: Number(counts.to_estimate),
      byStatus: by.recordset.map((r) => ({
        label: r.label,
        value: Number(r.value),
      })),
      attention: attention.recordset.map(summary),
    };
  });
  app.get("/api/v1/sales-intakes/:id", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeRead);
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Intake id"),
      result = await loadSalesIntakeDetail(database, id, actor.id);
    if (!result)
      throw new ApiError(404, "intake_not_found", "Sales intake not found.");
    return result;
  });

  app.post("/api/v1/sales-intakes/", async (request, reply) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeWrite);
    const actor = await users.required(request),
      p = validatePayload(bodyObject(request.body), config),
      today = nowDate(config.businessTimeZone);
    const created = await database.transaction(async (t) => {
      await validateReferences(t, p);
      const number = await issueDocumentNumber(t, "SIN", today);
      const q = new sql.Request(t);
      bindPayload(q, p);
      q.input("number", sql.NVarChar(30), number);
      q.input("department", sql.NVarChar(100), actor.department);
      q.input("actor", sql.BigInt, actor.id);
      const requirementNames = intakeColumns.map((x) => `@${x}`).join(","),
        machineNames = machineColumns.map((x) => `@${x}`).join(",");
      const r = (
        await q.query<{ id: number | string }>(
          `INSERT INTO dbo.sales_intakes(intake_no,status,customer_id,site_id,site_contact_id,customer_branch,site_name,site_address,contact_name,contact_department,contact_position,contact_phone,contact_email,contact_channel,customer_reference_no,subject,request_date,sales_owner_id,priority,required_response_date,customer_expected_completion,source,related_inquiry_id,related_project_id,${intakeColumns.join(",")},${machineColumns.join(",")},photography_restricted,nda_required,department,created_by,updated_by) OUTPUT inserted.id VALUES(@number,N'Draft',@customer,@site,@site_contact,@branch,@site_name,@site_address,@contact_name,@contact_department,@contact_position,@contact_phone,@contact_email,@contact_channel,@reference,@subject,@request_date,@owner,@priority,@response_date,@completion_date,@source,@inquiry,@project,${requirementNames},${machineNames},@photo,@nda,@department,@actor,@actor);`,
        )
      ).recordset[0]!;
      const id = Number(r.id);
      await replaceChildren(t, id, p, actor.id);
      const state = await readiness(t, id);
      await recordSiteVisitStatus(
        t,
        "SalesIntake",
        id,
        number,
        null,
        "Draft",
        "Intake created",
        actor.id,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "SalesIntake",
        id,
        number,
        "Intake created",
        undefined,
        {
          subject: p.subject,
          customerId: p.customerId,
          readiness: state.score,
        },
      );
      return { id, number, readiness: state };
    }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    return reply
      .status(201)
      .header("Location", `/api/v1/sales-intakes/${created.id}`)
      .send(created);
  });

  app.put("/api/v1/sales-intakes/:id", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeWrite);
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Intake id"),
      body = bodyObject(request.body),
      version = body.rowVersion,
      p = validatePayload(body, config);
    return database.transaction(async (t) => {
      const current = new sql.Request(t);
      current.input("id", sql.BigInt, id);
      const h = (
        await current.query<Row>(
          `SELECT intake_no,status,row_version,archived_at FROM dbo.sales_intakes WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`,
        )
      ).recordset[0];
      if (!h)
        throw new ApiError(404, "intake_not_found", "Sales intake not found.");
      requireRowVersion(version, h.row_version as Buffer);
      if (h.archived_at)
        throw new ApiError(
          409,
          "intake_archived",
          "An archived intake cannot be edited.",
        );
      if (!["Draft", "More Information Required"].includes(String(h.status)))
        throw new ApiError(
          409,
          "intake_locked",
          `An intake in '${h.status}' cannot be edited.`,
        );
      await validateReferences(t, p);
      const q = new sql.Request(t);
      bindPayload(q, p);
      q.input("id", sql.BigInt, id);
      q.input("actor", sql.BigInt, actor.id);
      const assignments = [...intakeColumns, ...machineColumns]
        .map((x) => `${x}=@${x}`)
        .join(",");
      await q.query(
        `UPDATE dbo.sales_intakes SET customer_id=@customer,site_id=@site,site_contact_id=@site_contact,customer_branch=@branch,site_name=@site_name,site_address=@site_address,contact_name=@contact_name,contact_department=@contact_department,contact_position=@contact_position,contact_phone=@contact_phone,contact_email=@contact_email,contact_channel=@contact_channel,customer_reference_no=@reference,subject=@subject,request_date=@request_date,sales_owner_id=@owner,priority=@priority,required_response_date=@response_date,customer_expected_completion=@completion_date,source=@source,related_inquiry_id=@inquiry,related_project_id=@project,${assignments},photography_restricted=@photo,nda_required=@nda,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`,
      );
      await replaceChildren(t, id, p, actor.id);
      const state = await readiness(t, id);
      await siteVisitAudit(
        t,
        actor.id,
        "SalesIntake",
        id,
        String(h.intake_no),
        "Intake updated",
        undefined,
        { subject: p.subject, readiness: state.score },
      );
      return {
        id,
        number: h.intake_no,
        rowVersion: await intakeVersion(t, id),
        readiness: state,
      };
    }, sql.ISOLATION_LEVEL.SERIALIZABLE);
  });

  app.post("/api/v1/sales-intakes/:id/status", async (request) => {
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Intake id"),
      body = bodyObject(request.body),
      target = requiredText(body.status, 50, "Status"),
      reason = optionalBodyText(body.reason, 4000, "Reason"),
      permissions = await rolePermissions(database, actor.id);
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("id", sql.BigInt, id);
      const h = (
        await q.query<Row>(
          `SELECT intake_no,status,sales_owner_id,row_version FROM dbo.sales_intakes WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`,
        )
      ).recordset[0];
      if (!h)
        throw new ApiError(404, "intake_not_found", "Sales intake not found.");
      requireRowVersion(body.rowVersion, h.row_version as Buffer);
      requireTransition(
        INTAKE_TRANSITIONS,
        String(h.status),
        target,
        permissions,
        reason,
      );
      const state = await readiness(t, id);
      if (target === "Pending Technical Review" && !state.canSubmit)
        throw new ApiError(
          422,
          "readiness_blocked",
          "Mandatory information is still missing.",
          state.checks
            .filter((x) => x.severity === "blocker" && !x.passed)
            .map((x) => x.label),
        );
      const update = new sql.Request(t);
      update.input("id", sql.BigInt, id);
      update.input("status", sql.NVarChar(50), target);
      update.input("actor", sql.BigInt, actor.id);
      update.input("submitted", sql.Bit, target === "Pending Technical Review");
      await update.query(
        `UPDATE dbo.sales_intakes SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME(),submitted_at=CASE WHEN @submitted=1 THEN ISNULL(submitted_at,SYSUTCDATETIME()) ELSE submitted_at END,submitted_by=CASE WHEN @submitted=1 THEN ISNULL(submitted_by,@actor) ELSE submitted_by END WHERE id=@id;`,
      );
      await recordSiteVisitStatus(
        t,
        "SalesIntake",
        id,
        String(h.intake_no),
        String(h.status),
        target,
        reason,
        actor.id,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "SalesIntake",
        id,
        String(h.intake_no),
        `Intake status ${h.status} to ${target}`,
        { status: h.status },
        { status: target },
        reason,
      );
      if (target === "Pending Technical Review")
        await notifyUsers(
          t,
          (
            await usersWithPermission(t, SITE_VISIT_PERMISSIONS.intakeReview)
          ).filter((x) => x !== actor.id),
          "intake.review_requested",
          `${h.intake_no} is waiting for technical review`,
          "Sales submitted this intake for technical review.",
          "SalesIntake",
          id,
          `intake.review_requested:${id}:${h.status}`,
        );
      if (["More Information Required", "Cancelled"].includes(target))
        await notifyUsers(
          t,
          [Number(h.sales_owner_id)],
          `intake.${target === "Cancelled" ? "cancelled" : "returned"}`,
          `${h.intake_no} ${target === "Cancelled" ? "was cancelled" : "was returned for more information"}`,
          reason ?? target,
          "SalesIntake",
          id,
          `intake.${target}:${id}:${h.status}`,
        );
      if (target === "Ready to Schedule")
        await notifyUsers(
          t,
          [
            ...(await usersWithPermission(
              t,
              SITE_VISIT_PERMISSIONS.visitSchedule,
            )),
            Number(h.sales_owner_id),
          ].filter((x) => x !== actor.id),
          "intake.ready_to_schedule",
          `${h.intake_no} is ready to schedule`,
          "Technical review is complete.",
          "SalesIntake",
          id,
          `intake.ready:${id}`,
        );
      return {
        id,
        number: h.intake_no,
        status: target,
        rowVersion: await intakeVersion(t, id),
        readiness: state,
      };
    }, sql.ISOLATION_LEVEL.SERIALIZABLE);
  });

  app.post("/api/v1/sales-intakes/:id/review", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeReview);
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Intake id"),
      body = bodyObject(request.body),
      decision = oneOf(
        requiredText(body.decision, 40, "Decision"),
        "Decision",
        [
          "Ready to Schedule",
          "More Information Required",
          "On Hold",
          "Cancelled",
          "Comment",
        ],
      ),
      comment = optionalBodyText(body.comment, 20_000, "Comment"),
      engineerCount = Math.min(
        20,
        Math.max(1, Number(body.engineerCount) || 1),
      ),
      duration = Math.min(
        10_080,
        Math.max(15, Number(body.estimatedDurationMinutes) || 240),
      ),
      skillIds = body.skillIds == null ? null : idList(body.skillIds, "Skill"),
      permissions = await rolePermissions(database, actor.id);
    if (
      ["More Information Required", "On Hold", "Cancelled"].includes(
        decision,
      ) &&
      !comment
    )
      throw new ApiError(
        400,
        "validation_failed",
        "Say what is missing, so sales knows what to fix.",
      );
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("id", sql.BigInt, id);
      const h = (
        await q.query<Row>(
          `SELECT intake_no,status,sales_owner_id,row_version FROM dbo.sales_intakes WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`,
        )
      ).recordset[0];
      if (!h)
        throw new ApiError(404, "intake_not_found", "Sales intake not found.");
      requireRowVersion(body.rowVersion, h.row_version as Buffer);
      if (decision !== "Comment")
        requireTransition(
          INTAKE_TRANSITIONS,
          String(h.status),
          decision,
          permissions,
          comment,
        );
      if (skillIds) {
        const clear = new sql.Request(t);
        clear.input("id", sql.BigInt, id);
        await clear.query(
          `DELETE FROM dbo.sales_intake_skills WHERE intake_id=@id AND source=N'Coordinator';`,
        );
        for (const value of skillIds) {
          const ins = new sql.Request(t);
          ins.input("id", sql.BigInt, id);
          ins.input("skill", sql.BigInt, value);
          ins.input("actor", sql.BigInt, actor.id);
          await ins.query(
            `INSERT INTO dbo.sales_intake_skills(intake_id,skill_id,source,created_by) SELECT @id,@skill,N'Coordinator',@actor WHERE EXISTS(SELECT 1 FROM dbo.visit_skills WHERE id=@skill AND is_active=1);`,
          );
        }
      }
      const state = await readiness(t, id),
        missing = state.checks
          .filter((x) => !x.passed)
          .map((x) => x.label)
          .join("; ");
      const insert = new sql.Request(t);
      insert.input("id", sql.BigInt, id);
      insert.input("reviewer", sql.BigInt, actor.id);
      insert.input("decision", sql.NVarChar(40), decision);
      insert.input("comment", sql.NVarChar(sql.MAX), comment);
      insert.input(
        "scope",
        sql.NVarChar(sql.MAX),
        optionalBodyText(body.visitScope, 20_000, "Visit scope"),
      );
      insert.input("count", sql.TinyInt, engineerCount);
      insert.input("duration", sql.Int, duration);
      insert.input(
        "equipment",
        sql.NVarChar(sql.MAX),
        optionalBodyText(body.requiredEquipment, 20_000, "Required equipment"),
      );
      insert.input(
        "risk",
        sql.NVarChar(sql.MAX),
        optionalBodyText(body.riskAssessment, 20_000, "Risk assessment"),
      );
      insert.input(
        "safety",
        sql.NVarChar(sql.MAX),
        optionalBodyText(body.safetyConcern, 20_000, "Safety concern"),
      );
      insert.input("manager", sql.Bit, bool(body.requiresManagerApproval));
      insert.input("missing", sql.NVarChar(sql.MAX), missing || null);
      insert.input("score", sql.TinyInt, state.score);
      const reviewId = Number(
        (
          await insert.query<{ id: number | string }>(
            `INSERT INTO dbo.sales_intake_reviews(intake_id,reviewer_id,decision,comment,visit_scope,engineer_count,estimated_duration_minutes,required_equipment,risk_assessment,safety_concern,requires_manager_approval,missing_information,readiness_score_at_review) OUTPUT inserted.id VALUES(@id,@reviewer,@decision,@comment,@scope,@count,@duration,@equipment,@risk,@safety,@manager,@missing,@score);`,
          )
        ).recordset[0]!.id,
      );
      if (decision !== "Comment") {
        const u = new sql.Request(t);
        u.input("id", sql.BigInt, id);
        u.input("status", sql.NVarChar(50), decision);
        u.input("actor", sql.BigInt, actor.id);
        await u.query(
          `UPDATE dbo.sales_intakes SET status=@status,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`,
        );
        await recordSiteVisitStatus(
          t,
          "SalesIntake",
          id,
          String(h.intake_no),
          String(h.status),
          decision,
          comment,
          actor.id,
        );
        if (decision === "Ready to Schedule")
          await notifyUsers(
            t,
            [
              ...(await usersWithPermission(
                t,
                SITE_VISIT_PERMISSIONS.visitSchedule,
              )),
              Number(h.sales_owner_id),
            ],
            "intake.ready_to_schedule",
            `${h.intake_no} is ready to schedule`,
            "Technical review is complete.",
            "SalesIntake",
            id,
            `intake.ready:${id}`,
          );
        else
          await notifyUsers(
            t,
            [Number(h.sales_owner_id)],
            `intake.${decision}`,
            `${h.intake_no} — ${decision}`,
            comment ?? decision,
            "SalesIntake",
            id,
            `intake.${decision}:${id}:${h.status}`,
          );
      }
      await siteVisitAudit(
        t,
        actor.id,
        "SalesIntake",
        id,
        String(h.intake_no),
        `Technical review — ${decision}`,
        undefined,
        { reviewId, decision, engineerCount, duration, score: state.score },
        comment,
      );
      return {
        id,
        number: h.intake_no,
        reviewId,
        status: decision === "Comment" ? h.status : decision,
        rowVersion: await intakeVersion(t, id),
        readiness: state,
      };
    }, sql.ISOLATION_LEVEL.SERIALIZABLE);
  });

  app.post("/api/v1/sales-intakes/:id/attachments", async (request, reply) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeWrite);
    const actor = await users.required(request),
      id = positiveLong((request.params as { id?: string }).id, "Intake id");
    const h = (
      await database.query<{ intake_no: string }>(
        `SELECT intake_no FROM dbo.sales_intakes WHERE id=@id AND deleted_at IS NULL AND archived_at IS NULL;`,
        (q) => q.input("id", sql.BigInt, id),
      )
    ).recordset[0];
    if (!h)
      throw new ApiError(404, "intake_not_found", "Sales intake not found.");
    const upload = await readMultipartUpload(
        request,
        config.documentStorage.maxFileSizeBytes,
      ),
      category = multipartText(upload.values, "category", 100, true)!,
      description = multipartText(upload.values, "description", 1000) ?? "",
      fileName = uploadedFileName(upload.file.filename),
      extension = validateFileExtension(fileName),
      contentType = contentTypeFor(fileName),
      key = storageKey(`sales-intakes/${id}`, extension),
      write = await writeStoredFile(
        config.documentStorage,
        key,
        upload.file.filepath,
      );
    try {
      const created = await database.transaction(async (t) => {
        const q = new sql.Request(t);
        q.input("id", sql.BigInt, id);
        q.input("name", sql.NVarChar(500), fileName);
        q.input("category", sql.NVarChar(100), category);
        q.input("description", sql.NVarChar(1000), description);
        q.input("type", sql.NVarChar(200), contentType);
        q.input("size", sql.BigInt, write.sizeBytes);
        q.input("key", sql.NVarChar(1000), key);
        q.input("sha", sql.Char(64), write.sha256);
        q.input("actor", sql.BigInt, actor.id);
        const r = (
          await q.query<Row>(
            `DECLARE @version int=(SELECT ISNULL(MAX(version),0)+1 FROM dbo.sales_intake_attachments WITH(UPDLOCK,HOLDLOCK) WHERE intake_id=@id AND name=@name); INSERT INTO dbo.sales_intake_attachments(intake_id,name,category,description,version,content_type,size_bytes,storage_key,sha256,scan_status,uploaded_by) OUTPUT inserted.id,inserted.version,inserted.uploaded_at,inserted.row_version VALUES(@id,@name,@category,@description,@version,@type,@size,@key,@sha,N'Skipped',@actor);`,
          )
        ).recordset[0]!;
        await siteVisitAudit(
          t,
          actor.id,
          "SalesIntake",
          id,
          h.intake_no,
          "Attachment uploaded",
          undefined,
          {
            id: Number(r.id),
            fileName,
            category,
            sizeBytes: write.sizeBytes,
            sha256: write.sha256,
          },
        );
        await readiness(t, id);
        return {
          id: Number(r.id),
          name: fileName,
          category,
          description,
          version: Number(r.version),
          contentType,
          sizeBytes: write.sizeBytes,
          scanStatus: "Skipped",
          uploadedByName: actor.name,
          uploadedAt: r.uploaded_at,
          rowVersion: rowVersion(r.row_version),
        };
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      return reply
        .status(201)
        .header(
          "Location",
          `/api/v1/sales-intakes/${id}/attachments/${created.id}/content`,
        )
        .send(created);
    } catch (error) {
      if (error instanceof DatabaseCommitOutcomeUnknownError)
        request.log.fatal(
          { err: error.originalError, storageKey: key, intakeId: id },
          "Intake attachment commit outcome unknown; preserving file",
        );
      else await deleteStoredFile(config.documentStorage, key);
      throw error;
    }
  });
  app.get(
    "/api/v1/sales-intakes/:id/attachments/:attachmentId/content",
    async (request, reply) => {
      await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeRead);
      const p = request.params as { id?: string; attachmentId?: string },
        id = positiveLong(p.id, "Intake id"),
        attachmentId = positiveLong(p.attachmentId, "Attachment id");
      const r = (
        await database.query<Row>(
          `SELECT name,content_type,storage_key,size_bytes,sha256 FROM dbo.sales_intake_attachments WHERE id=@attachment AND intake_id=@id AND deleted_at IS NULL;`,
          (q) => {
            q.input("attachment", sql.BigInt, attachmentId);
            q.input("id", sql.BigInt, id);
          },
        )
      ).recordset[0];
      if (!r)
        throw new ApiError(
          404,
          "attachment_not_found",
          "Attachment not found.",
        );
      return sendStoredFile(request, reply, config.documentStorage, {
        storageKey: String(r.storage_key),
        fileName: String(r.name),
        contentType: String(r.content_type),
        sizeBytes: Number(r.size_bytes),
        sha256: String(r.sha256),
      });
    },
  );
  app.delete(
    "/api/v1/sales-intakes/:id/attachments/:attachmentId",
    async (request) => {
      await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeWrite);
      const actor = await users.required(request),
        p = request.params as { id?: string; attachmentId?: string },
        id = positiveLong(p.id, "Intake id"),
        attachmentId = positiveLong(p.attachmentId, "Attachment id");
      return database.transaction(async (t) => {
        const q = new sql.Request(t);
        q.input("id", sql.BigInt, id);
        q.input("attachment", sql.BigInt, attachmentId);
        const r = (
          await q.query<{ intake_no: string; name: string }>(
            `SELECT i.intake_no,a.name FROM dbo.sales_intake_attachments a INNER JOIN dbo.sales_intakes i ON i.id=a.intake_id WHERE a.id=@attachment AND a.intake_id=@id AND a.deleted_at IS NULL;`,
          )
        ).recordset[0];
        if (!r)
          throw new ApiError(
            404,
            "attachment_not_found",
            "Attachment not found.",
          );
        const update = new sql.Request(t);
        update.input("id", sql.BigInt, id);
        update.input("attachment", sql.BigInt, attachmentId);
        update.input("actor", sql.BigInt, actor.id);
        await update.query(
          `UPDATE dbo.sales_intake_attachments SET deleted_at=SYSUTCDATETIME(),deleted_by=@actor WHERE id=@attachment AND intake_id=@id AND deleted_at IS NULL;`,
        );
        await siteVisitAudit(
          t,
          actor.id,
          "SalesIntake",
          id,
          r.intake_no,
          "Attachment archived",
          { attachmentId, name: r.name },
        );
        return { id, attachmentId, readiness: await readiness(t, id) };
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    },
  );
}
