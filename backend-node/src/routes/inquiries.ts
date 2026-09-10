import type { FastifyInstance } from "fastify";
import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import type { AppConfig } from "../config.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { endUserCustomerId, registerEndUserUpdateRoute, validateEndUser } from "../end-user.js";
import {
  bodyObject,
  clampedInteger,
  dateOnly,
  firstQueryValue,
  oneOf,
  optionalBodyText,
  optionalPositiveLong,
  optionalText,
  parseDateOnly,
  parseRowVersion,
  positiveLong,
  requiredInteger,
  requiredText,
} from "../http.js";
import type { CurrentUserService } from "../users.js";

type InquiryRow = Record<string, unknown> & {
  id: number | string; inquiry_no: string; inquiry_date: Date | string; customer_id: number | string;
  customer_name: string; project_name: string; project_type: string; sales_owner: string | null;
  estimate_owner_id: number | string; estimate_owner_name: string; due_date: Date | string; priority: string;
  status: string; progress: number | string; revision: number; updated_at: Date | string;
  row_version: Buffer; estimate_id: number | string | null; project_probability: number;
  customer_interest_grade: string; total_count: number | string;
  end_user_customer_id: number | string | null; end_user_name: string | null; end_user_code: string | null;
};

type DetailSeedRow = Record<string, unknown> & {
  id: number | string; inquiry_no: string; inquiry_date: Date | string; customer_id: number | string;
  customer_code: string; customer_name: string; contact: string; project_name: string; project_type: string;
  rfq_no: string | null; sales_owner: string | null; estimate_owner_id: number | string;
  estimate_owner_name: string; due_date: Date | string; priority: string; project_probability: number;
  customer_interest_grade: string; qualification_note: string | null; status: string; progress: number | string;
  revision: number; requirement: string | null; background: string | null; scope_summary: string | null;
  technical: string | null; target_delivery: Date | string | null; site_location: string | null;
  standard: string | null; special: string | null; remark: string | null; created_at: Date | string;
  updated_at: Date | string; row_version: Buffer;
  end_user_customer_id: number | string | null; end_user_name: string | null; end_user_code: string | null;
};

type EstimateRow = Record<string, unknown> & {
  id: number | string; estimate_no: string; revision: number; owner_id: number | string; owner_name: string;
  created_date: Date | string; due_date: Date | string; status: string; progress: number | string;
  material_total: number | string; engineering_total: number | string; outsource_total: number | string;
  other_total: number | string; overhead_state: string | null; overhead_total: number | string | null;
  total: number | string; row_version: Buffer;
};

type MeetingRow = Record<string, unknown> & {
  id: number | string; meeting_date: Date | string; meeting_type: string; participants_json: string;
  requirement: string | null; technical: string | null; decision: string | null; open_point: string | null;
  action_item: string | null; owner_id: number | string | null; owner_name: string | null;
  due_date: Date | string | null; attachment_id: number | string | null; attachment_name: string | null;
  created_by_name: string; created_at: Date | string; row_version: Buffer;
};

type AttachmentRow = Record<string, unknown> & {
  id: number | string; name: string; category: string; content_type: string; size_bytes: number | string;
  uploaded_by_name: string; uploaded_at: Date | string; row_version: Buffer;
};

type ActivityRow = Record<string, unknown> & {
  id: number | string; entity_type: string; entity_no: string; action: string; actor_name: string;
  before_json: string | null; after_json: string | null; reason: string | null; occurred_at: Date | string;
};

function optionalInteger(value: unknown, label: string): number | null {
  const raw = firstQueryValue(value);
  if (raw === undefined || raw === "") return null;
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  }
  return Number(raw);
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addYears(date: string, years: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}

export function registerInquiryRoutes(
  app: FastifyInstance,
  config: AppConfig,
  database: Database,
  users: CurrentUserService,
): void {
  registerEndUserUpdateRoute(app, database, users, "Inquiry");
  app.get("/api/v1/inquiries", async (request) => {
    await users.demandPermission(request, "inquiry.read");
    const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);
    const pageSize = clampedInteger(query.pageSize, 25, 1, 100);
    const search = optionalText(query.search, 200, "Search");
    const status = optionalText(query.status, 50, "Status");
    const customerId = optionalPositiveLong(query.customerId, "Customer id");
    const projectType = optionalText(query.projectType, 100, "Project type");
    const ownerId = optionalPositiveLong(query.ownerId, "Owner id");
    const priority = optionalText(query.priority, 30, "Priority");
    const rawGrade = optionalText(query.interestGrade, 1, "Customer interest grade");
    const interestGrade = rawGrade ? oneOf(rawGrade.toUpperCase(), "Customer interest grade", ["A", "B", "C", "D"]) : null;
    const probabilityFrom = optionalInteger(query.probabilityFrom, "Project probability from");
    const probabilityTo = optionalInteger(query.probabilityTo, "Project probability to");
    if ((probabilityFrom !== null && (probabilityFrom < 0 || probabilityFrom > 100))
      || (probabilityTo !== null && (probabilityTo < 0 || probabilityTo > 100))
      || (probabilityFrom !== null && probabilityTo !== null && probabilityFrom > probabilityTo)) {
      throw new ApiError(400, "validation_failed", "Project probability filters must be between 0 and 100 and form a valid range.");
    }
    const inquiryFrom = parseDateOnly(firstQueryValue(query.inquiryFrom), "Inquiry from", true);
    const inquiryTo = parseDateOnly(firstQueryValue(query.inquiryTo), "Inquiry to", true);
    const dueFrom = parseDateOnly(firstQueryValue(query.dueFrom), "Due from", true);
    const dueTo = parseDateOnly(firstQueryValue(query.dueTo), "Due to", true);
    if ((inquiryFrom && inquiryTo && inquiryFrom > inquiryTo) || (dueFrom && dueTo && dueFrom > dueTo)) {
      throw new ApiError(400, "validation_failed", "Date filter ranges are invalid.");
    }

    const result = await database.query<InquiryRow>(`
      SELECT i.id, i.inquiry_no, i.inquiry_date, i.customer_id, c.name AS customer_name,
        i.end_user_customer_id,eu.name AS end_user_name,eu.code AS end_user_code,
        i.project_name, i.project_type, i.sales_owner, i.estimate_owner_id, u.name AS estimate_owner_name,
        i.due_date, i.priority, i.status, i.progress, i.revision, i.updated_at, i.row_version, i.estimate_id,
        i.project_probability, i.customer_interest_grade, COUNT_BIG(*) OVER() AS total_count
      FROM dbo.inquiries i
      INNER JOIN dbo.customers c ON c.id = i.customer_id
      LEFT JOIN dbo.customers eu ON eu.id=i.end_user_customer_id
      INNER JOIN dbo.users u ON u.id = i.estimate_owner_id
      WHERE i.deleted_at IS NULL
        AND (@status IS NULL OR i.status = @status)
        AND (@customer_id IS NULL OR i.customer_id = @customer_id)
        AND (@project_type IS NULL OR i.project_type = @project_type)
        AND (@owner_id IS NULL OR i.estimate_owner_id = @owner_id)
        AND (@priority IS NULL OR i.priority = @priority)
        AND (@interest_grade IS NULL OR i.customer_interest_grade = @interest_grade)
        AND (@probability_from IS NULL OR i.project_probability >= @probability_from)
        AND (@probability_to IS NULL OR i.project_probability <= @probability_to)
        AND (@inquiry_from IS NULL OR i.inquiry_date >= @inquiry_from)
        AND (@inquiry_to IS NULL OR i.inquiry_date <= @inquiry_to)
        AND (@due_from IS NULL OR i.due_date >= @due_from)
        AND (@due_to IS NULL OR i.due_date <= @due_to)
        AND (@search IS NULL OR i.inquiry_no LIKE N'%' + @search + N'%'
             OR i.project_name LIKE N'%' + @search + N'%' OR c.name LIKE N'%' + @search + N'%'
             OR eu.name LIKE N'%' + @search + N'%' OR eu.code LIKE N'%' + @search + N'%'
             OR i.rfq_no LIKE N'%' + @search + N'%')
      ORDER BY i.updated_at DESC, i.id DESC
      OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => {
      sqlRequest.input("status", sql.NVarChar(50), status);
      sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("customer_id", sql.BigInt, customerId);
      sqlRequest.input("project_type", sql.NVarChar(100), projectType);
      sqlRequest.input("owner_id", sql.BigInt, ownerId);
      sqlRequest.input("priority", sql.NVarChar(30), priority);
      sqlRequest.input("interest_grade", sql.Char(1), interestGrade);
      sqlRequest.input("probability_from", sql.TinyInt, probabilityFrom);
      sqlRequest.input("probability_to", sql.TinyInt, probabilityTo);
      sqlRequest.input("inquiry_from", sql.Date, inquiryFrom);
      sqlRequest.input("inquiry_to", sql.Date, inquiryTo);
      sqlRequest.input("due_from", sql.Date, dueFrom);
      sqlRequest.input("due_to", sql.Date, dueTo);
      sqlRequest.input("offset", sql.Int, (page - 1) * pageSize);
      sqlRequest.input("page_size", sql.Int, pageSize);
    });
    return {
      items: result.recordset.map((row) => ({
        id: Number(row.id), number: row.inquiry_no, inquiryDate: dateOnly(row.inquiry_date),
        customerId: Number(row.customer_id), customerName: row.customer_name, projectName: row.project_name,
        endUserCustomerId: nullableNumber(row.end_user_customer_id), endUserName: row.end_user_name, endUserCode: row.end_user_code,
        projectType: row.project_type, salesOwner: row.sales_owner, estimateOwnerId: Number(row.estimate_owner_id),
        estimateOwnerName: row.estimate_owner_name, dueDate: dateOnly(row.due_date), priority: row.priority,
        projectProbability: row.project_probability, customerInterestGrade: row.customer_interest_grade.trim(),
        status: row.status, progress: Number(row.progress), revision: row.revision, updatedAt: row.updated_at,
        rowVersion: row.row_version.toString("base64"), estimateId: nullableNumber(row.estimate_id),
      })),
      page, pageSize, total: Number(result.recordset[0]?.total_count ?? 0),
    };
  });

  app.get("/api/v1/inquiries/:id", async (request, reply) => {
    await users.demandPermission(request, "inquiry.read");
    const id = positiveLong((request.params as { id?: string }).id, "Inquiry id");
    const result = await database.query<DetailSeedRow | EstimateRow | MeetingRow | AttachmentRow | ActivityRow>(`
      SELECT i.id, i.inquiry_no, i.inquiry_date, i.customer_id, c.code AS customer_code, c.name AS customer_name,
        i.end_user_customer_id,eu.name AS end_user_name,eu.code AS end_user_code,
        i.contact, i.project_name, i.project_type, i.rfq_no, i.sales_owner, i.estimate_owner_id,
        u.name AS estimate_owner_name, i.due_date, i.priority, i.project_probability, i.customer_interest_grade,
        i.qualification_note, i.status, i.progress, i.revision, i.requirement, i.background, i.scope_summary,
        i.technical, i.target_delivery, i.site_location, i.standard, i.special, i.remark,
        i.created_at, i.updated_at, i.row_version
      FROM dbo.inquiries i INNER JOIN dbo.customers c ON c.id=i.customer_id
      LEFT JOIN dbo.customers eu ON eu.id=i.end_user_customer_id
      INNER JOIN dbo.users u ON u.id=i.estimate_owner_id WHERE i.id=@id AND i.deleted_at IS NULL;

      SELECT e.id, e.estimate_no, e.revision, e.owner_id, u.name AS owner_name, e.created_date, e.due_date,
        e.status, e.progress, t.material_total, t.engineering_total, t.outsource_total,
        t.transportation_total+t.accommodation_total+t.other_total+t.contingency_total AS other_total,
        t.overhead_state, t.overhead_total, t.total, e.row_version
      FROM dbo.estimates e INNER JOIN dbo.users u ON u.id=e.owner_id
      INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
      WHERE e.inquiry_id=@id AND e.deleted_at IS NULL;

      SELECT m.id, m.meeting_date, m.meeting_type, m.participants_json, m.requirement, m.technical,
        m.decision, m.open_point, m.action_item, m.owner_id, owner.name AS owner_name, m.due_date,
        m.attachment_id, attachment.name AS attachment_name, creator.name AS created_by_name,
        m.created_at, m.row_version
      FROM dbo.inquiry_meetings m INNER JOIN dbo.users creator ON creator.id=m.created_by
      LEFT JOIN dbo.users owner ON owner.id=m.owner_id
      LEFT JOIN dbo.inquiry_attachments attachment ON attachment.id=m.attachment_id AND attachment.deleted_at IS NULL
      WHERE m.inquiry_id=@id ORDER BY m.meeting_date DESC, m.id DESC;

      SELECT a.id, a.name, a.category, a.content_type, a.size_bytes, u.name AS uploaded_by_name,
        a.uploaded_at, a.row_version
      FROM dbo.inquiry_attachments a INNER JOIN dbo.users u ON u.id=a.uploaded_by
      WHERE a.inquiry_id=@id AND a.deleted_at IS NULL ORDER BY a.uploaded_at DESC, a.id DESC;

      DECLARE @inquiry_no nvarchar(50)=(SELECT inquiry_no FROM dbo.inquiries WHERE id=@id AND deleted_at IS NULL);
      DECLARE @estimate_no nvarchar(50)=(SELECT TOP (1) estimate_no FROM dbo.estimates WHERE inquiry_id=@id AND deleted_at IS NULL);
      SELECT TOP (200) a.id, a.entity_type, a.entity_no, a.action, u.name AS actor_name,
        a.before_json, a.after_json, a.reason, a.occurred_at
      FROM dbo.audit_log a INNER JOIN dbo.users u ON u.id=a.actor_id
      WHERE (a.entity_type=N'Inquiry' AND a.entity_id=@id) OR a.entity_no=@inquiry_no
        OR (@estimate_no IS NOT NULL AND a.entity_no=@estimate_no)
      ORDER BY a.occurred_at DESC, a.id DESC;
    `, (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
    const seed = (result.recordsets[0] as unknown as DetailSeedRow[])[0];
    if (!seed) return reply.status(404).send();
    const estimateRow = (result.recordsets[1] as unknown as EstimateRow[])[0];
    const estimate = estimateRow ? {
      id: Number(estimateRow.id), number: estimateRow.estimate_no, revision: estimateRow.revision,
      ownerId: Number(estimateRow.owner_id), ownerName: estimateRow.owner_name,
      createdDate: dateOnly(estimateRow.created_date), dueDate: dateOnly(estimateRow.due_date),
      status: estimateRow.status, progress: Number(estimateRow.progress), materialTotal: Number(estimateRow.material_total),
      engineeringTotal: Number(estimateRow.engineering_total), outsourceTotal: Number(estimateRow.outsource_total),
      otherTotal: Number(estimateRow.other_total), overheadState: estimateRow.overhead_state,
      overheadTotal: estimateRow.overhead_total === null ? null : Number(estimateRow.overhead_total), total: Number(estimateRow.total),
      rowVersion: estimateRow.row_version.toString("base64"),
    } : null;
    const meetings = (result.recordsets[2] as unknown as MeetingRow[]).map((row) => ({
      id: Number(row.id), meetingDate: dateOnly(row.meeting_date), meetingType: row.meeting_type,
      participants: JSON.parse(row.participants_json) as unknown, requirement: row.requirement ?? "",
      technical: row.technical ?? "", decision: row.decision ?? "", openPoint: row.open_point ?? "",
      actionItem: row.action_item ?? "", ownerId: nullableNumber(row.owner_id), ownerName: row.owner_name,
      dueDate: dateOnly(row.due_date), attachmentId: nullableNumber(row.attachment_id), attachmentName: row.attachment_name,
      createdByName: row.created_by_name, createdAt: row.created_at, rowVersion: row.row_version.toString("base64"),
    }));
    const attachments = (result.recordsets[3] as unknown as AttachmentRow[]).map((row) => ({
      id: Number(row.id), fileName: row.name, category: row.category, contentType: row.content_type,
      sizeBytes: Number(row.size_bytes), uploadedByName: row.uploaded_by_name, uploadedAt: row.uploaded_at,
      rowVersion: row.row_version.toString("base64"),
    }));
    const activity = (result.recordsets[4] as unknown as ActivityRow[]).map((row) => ({
      id: Number(row.id), entityType: row.entity_type, entityNumber: row.entity_no, action: row.action,
      actorName: row.actor_name, beforeJson: row.before_json, afterJson: row.after_json,
      reason: row.reason, occurredAt: row.occurred_at,
    }));
    return {
      id: Number(seed.id), number: seed.inquiry_no, inquiryDate: dateOnly(seed.inquiry_date),
      customerId: Number(seed.customer_id), customerCode: seed.customer_code, customerName: seed.customer_name,
      endUserCustomerId: nullableNumber(seed.end_user_customer_id), endUserName: seed.end_user_name, endUserCode: seed.end_user_code,
      contact: seed.contact, projectName: seed.project_name, projectType: seed.project_type, rfqNo: seed.rfq_no,
      salesOwner: seed.sales_owner, estimateOwnerId: Number(seed.estimate_owner_id),
      estimateOwnerName: seed.estimate_owner_name, dueDate: dateOnly(seed.due_date), priority: seed.priority,
      projectProbability: seed.project_probability, customerInterestGrade: seed.customer_interest_grade.trim(),
      qualificationNote: seed.qualification_note ?? "", status: seed.status, progress: Number(seed.progress),
      revision: seed.revision, estimateId: estimate?.id ?? null, requirement: seed.requirement ?? "",
      background: seed.background ?? "", scopeSummary: seed.scope_summary ?? "", technical: seed.technical ?? "",
      targetDelivery: dateOnly(seed.target_delivery), siteLocation: seed.site_location ?? "", standard: seed.standard ?? "",
      special: seed.special ?? "", remark: seed.remark ?? "", createdAt: seed.created_at, updatedAt: seed.updated_at,
      rowVersion: seed.row_version.toString("base64"), estimate, meetings, attachments, activity,
    };
  });

  app.post("/api/v1/inquiries", async (request, reply) => {
    await users.demandPermission(request, "inquiry.write");
    const actor = await users.required(request);
    const body = bodyObject(request.body);
    const customerId = requiredInteger(body.customerId, "Customer", 1);
    const endUserId = endUserCustomerId(body.endUserCustomerId) ?? null;
    const estimateOwnerId = requiredInteger(body.estimateOwnerId, "Estimate owner", 1);
    const contact = optionalBodyText(body.contact, 200, "Contact") ?? "";
    const projectName = requiredText(body.projectName, 300, "Project name");
    const projectType = requiredText(body.projectType, 100, "Project type");
    const rfqNo = optionalBodyText(body.rfqNo, 100, "RFQ number");
    const salesOwner = optionalBodyText(body.salesOwner, 200, "Sales owner");
    const priority = oneOf(requiredText(body.priority, 30, "Priority"), "Priority", ["Low", "Normal", "High", "Urgent"]);
    const projectProbability = requiredInteger(body.projectProbability, "Project probability", 0, 100);
    const customerInterestGrade = oneOf(requiredText(body.customerInterestGrade, 1, "Customer interest grade").toUpperCase(), "Customer interest grade", ["A", "B", "C", "D"]);
    const qualificationNote = optionalBodyText(body.qualificationNote, 2_000, "Qualification note");
    const requirement = optionalBodyText(body.requirement, 20_000, "Requirement");
    const background = optionalBodyText(body.background, 20_000, "Background");
    const scopeSummary = optionalBodyText(body.scopeSummary, 20_000, "Scope summary");
    const technical = optionalBodyText(body.technical, 20_000, "Technical detail");
    const targetDelivery = parseDateOnly(body.targetDelivery, "Target delivery", true);
    const siteLocation = optionalBodyText(body.siteLocation, 300, "Site location");
    const standard = optionalBodyText(body.standard, 20_000, "Standard");
    const special = optionalBodyText(body.special, 20_000, "Special requirement");
    const remark = optionalBodyText(body.remark, 20_000, "Remark");
    const dueDate = parseDateOnly(body.dueDate, "Due date")!;
    const today = todayIn(config.businessTimeZone);
    if (dueDate < today || dueDate > addYears(today, 5)) {
      throw new ApiError(400, "validation_failed", "Due date must be between today and five years from today.");
    }
    if (targetDelivery && (targetDelivery < today || targetDelivery > addYears(today, 10))) {
      throw new ApiError(400, "validation_failed", "Target delivery must be between today and ten years from today.");
    }

    const created = await database.transaction(async (transaction) => {
      const endUser = await validateEndUser(transaction, endUserId);
      const validate = new sql.Request(transaction);
      validate.input("customer_id", sql.BigInt, customerId);
      validate.input("owner_id", sql.BigInt, estimateOwnerId);
      const references = await validate.query<{ customer_valid: number; owner_valid: number }>(`
        SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.customers WHERE id=@customer_id AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END AS customer_valid,
          CASE WHEN EXISTS (SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
            WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL
              AND r.code IN (N'Engineer',N'Engineering Manager',N'Admin')) THEN 1 ELSE 0 END AS owner_valid;
      `);
      if (Number(references.recordset[0]?.customer_valid) !== 1) throw new ApiError(422, "invalid_reference", "The selected customer must be active.");
      if (Number(references.recordset[0]?.owner_valid) !== 1) throw new ApiError(422, "invalid_reference", "The estimate owner must be an active engineer, engineering manager or administrator.");

      const issue = new sql.Request(transaction);
      issue.input("document_type", sql.VarChar(20), "INQ");
      issue.input("issue_date", sql.Date, today);
      issue.output("document_number", sql.NVarChar(30));
      const issued = await issue.execute("dbo.issue_document_number");
      const number = String(issued.output.document_number);
      const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number); insert.input("today", sql.Date, today);
      insert.input("customer_id", sql.BigInt, customerId); insert.input("contact", sql.NVarChar(200), contact);
      insert.input("end_user_id", sql.BigInt, endUserId);
      insert.input("project_name", sql.NVarChar(300), projectName); insert.input("project_type", sql.NVarChar(100), projectType);
      insert.input("rfq_no", sql.NVarChar(100), rfqNo); insert.input("sales_owner", sql.NVarChar(200), salesOwner);
      insert.input("estimate_owner_id", sql.BigInt, estimateOwnerId); insert.input("due_date", sql.Date, dueDate);
      insert.input("priority", sql.NVarChar(30), priority); insert.input("project_probability", sql.TinyInt, projectProbability);
      insert.input("interest_grade", sql.Char(1), customerInterestGrade); insert.input("qualification_note", sql.NVarChar(2000), qualificationNote);
      insert.input("requirement", sql.NVarChar(sql.MAX), requirement); insert.input("background", sql.NVarChar(sql.MAX), background);
      insert.input("scope_summary", sql.NVarChar(sql.MAX), scopeSummary); insert.input("technical", sql.NVarChar(sql.MAX), technical);
      insert.input("target_delivery", sql.Date, targetDelivery); insert.input("site_location", sql.NVarChar(300), siteLocation);
      insert.input("standard", sql.NVarChar(sql.MAX), standard); insert.input("special", sql.NVarChar(sql.MAX), special);
      insert.input("remark", sql.NVarChar(sql.MAX), remark); insert.input("actor", sql.BigInt, actor.id);
      const result = await insert.query<{ id: number | string; row_version: Buffer }>(`
        INSERT INTO dbo.inquiries (inquiry_no,inquiry_date,customer_id,end_user_customer_id,contact,project_name,project_type,rfq_no,
          sales_owner,estimate_owner_id,due_date,priority,status,progress,revision,project_probability,
          customer_interest_grade,qualification_note,requirement,background,scope_summary,technical,target_delivery,
          site_location,standard,special,remark,created_by,updated_by)
        OUTPUT inserted.id, inserted.row_version VALUES (@number,@today,@customer_id,@end_user_id,@contact,@project_name,@project_type,@rfq_no,
          @sales_owner,@estimate_owner_id,@due_date,@priority,N'New',0,0,@project_probability,@interest_grade,
          @qualification_note,@requirement,@background,@scope_summary,@technical,@target_delivery,@site_location,
          @standard,@special,@remark,@actor,@actor);
      `);
      const row = result.recordset[0]!;
      const id = Number(row.id);
      await insertAudit(transaction, actor.id, "Inquiry", id, number, "Created", null, {
        customerId, ...endUser, contact, projectName, projectType, rfqNo, salesOwner, estimateOwnerId, dueDate, priority,
        projectProbability, customerInterestGrade, qualificationNote, requirement, background, scopeSummary,
        technical, targetDelivery, siteLocation, standard, special, remark,
      });
      return { id, number, rowVersion: row.row_version.toString("base64") };
    });
    return reply.status(201).header("Location", `/api/v1/inquiries/${created.id}`).send(created);
  });

  app.put("/api/v1/inquiries/:id/assignment", async (request, reply) => {
    await users.demandPermission(request, "inquiry.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Inquiry id");
    const body = bodyObject(request.body);
    const estimateOwnerId = requiredInteger(body.estimateOwnerId, "Estimate owner", 1);
    const rowVersion = parseRowVersion(body.rowVersion);
    const response = await database.transaction(async (transaction) => {
      const currentRequest = new sql.Request(transaction);
      currentRequest.input("id", sql.BigInt, id);
      const current = (await currentRequest.query<{ inquiry_no: string; estimate_owner_id: number | string; owner_name: string; row_version: Buffer }>(`
        SELECT i.inquiry_no,i.estimate_owner_id,u.name AS owner_name,i.row_version FROM dbo.inquiries i WITH (UPDLOCK,HOLDLOCK)
        INNER JOIN dbo.users u ON u.id=i.estimate_owner_id WHERE i.id=@id AND i.deleted_at IS NULL;
      `)).recordset[0];
      if (!current) return null;
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "This inquiry was updated by another user. Reload and try again.");
      const ownerRequest = new sql.Request(transaction);
      ownerRequest.input("owner_id", sql.BigInt, estimateOwnerId);
      const nextOwner = (await ownerRequest.query<{ name: string }>(`
        SELECT u.name FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
        WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL
          AND r.code IN (N'Engineer',N'Engineering Manager',N'Admin');
      `)).recordset[0];
      if (!nextOwner) throw new ApiError(422, "invalid_reference", "The estimate owner must be an active engineer, engineering manager or administrator.");
      const update = new sql.Request(transaction);
      update.input("owner_id", sql.BigInt, estimateOwnerId); update.input("actor", sql.BigInt, actor.id);
      update.input("id", sql.BigInt, id); update.input("row_version", sql.VarBinary(8), rowVersion);
      const updated = (await update.query<{ row_version: Buffer }>(`
        UPDATE dbo.inquiries SET estimate_owner_id=@owner_id,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
      `)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This inquiry was updated by another user. Reload and try again.");
      await insertAudit(transaction, actor.id, "Inquiry", id, current.inquiry_no, "Estimate owner assigned",
        { estimateOwnerId: Number(current.estimate_owner_id), estimateOwnerName: current.owner_name },
        { estimateOwnerId, estimateOwnerName: nextOwner.name });
      return { id, estimateOwnerId, estimateOwnerName: nextOwner.name, rowVersion: updated.row_version.toString("base64") };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    if (!response) return reply.status(404).send();
    return response;
  });

  app.put("/api/v1/inquiries/:id/qualification", async (request, reply) => {
    await users.demandPermission(request, "inquiry.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Inquiry id");
    const body = bodyObject(request.body);
    const projectProbability = requiredInteger(body.projectProbability, "Project probability", 0, 100);
    const customerInterestGrade = oneOf(requiredText(body.customerInterestGrade, 1, "Customer interest grade").toUpperCase(), "Customer interest grade", ["A", "B", "C", "D"]);
    const qualificationNote = optionalBodyText(body.qualificationNote, 2_000, "Qualification note");
    const rowVersion = parseRowVersion(body.rowVersion);
    const response = await database.transaction(async (transaction) => {
      const currentRequest = new sql.Request(transaction);
      currentRequest.input("id", sql.BigInt, id);
      const current = (await currentRequest.query<{ inquiry_no: string; project_probability: number; customer_interest_grade: string; qualification_note: string | null; row_version: Buffer }>(`
        SELECT inquiry_no,project_probability,customer_interest_grade,qualification_note,row_version
        FROM dbo.inquiries WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;
      `)).recordset[0];
      if (!current) return null;
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "This inquiry was updated by another user. Reload and try again.");
      const update = new sql.Request(transaction);
      update.input("project_probability", sql.TinyInt, projectProbability); update.input("interest_grade", sql.Char(1), customerInterestGrade);
      update.input("qualification_note", sql.NVarChar(2000), qualificationNote); update.input("actor", sql.BigInt, actor.id);
      update.input("id", sql.BigInt, id); update.input("row_version", sql.VarBinary(8), rowVersion);
      const updated = (await update.query<{ row_version: Buffer }>(`
        UPDATE dbo.inquiries SET project_probability=@project_probability,customer_interest_grade=@interest_grade,
          qualification_note=@qualification_note,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
      `)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This inquiry was updated by another user. Reload and try again.");
      await insertAudit(transaction, actor.id, "Inquiry", id, current.inquiry_no, "Qualification updated",
        { projectProbability: current.project_probability, customerInterestGrade: current.customer_interest_grade.trim(), qualificationNote: current.qualification_note },
        { projectProbability, customerInterestGrade, qualificationNote });
      return { id, projectProbability, customerInterestGrade, qualificationNote, rowVersion: updated.row_version.toString("base64") };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    if (!response) return reply.status(404).send();
    return response;
  });

  app.post("/api/v1/inquiries/:id/meetings", async (request, reply) => {
    await users.demandPermission(request, "inquiry.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Inquiry id");
    const body = bodyObject(request.body);
    const meetingDate = parseDateOnly(body.meetingDate, "Meeting date")!;
    const meetingType = requiredText(body.meetingType, 100, "Meeting type");
    const participantValues = body.participants === undefined || body.participants === null ? [] : body.participants;
    if (!Array.isArray(participantValues)) throw new ApiError(400, "validation_failed", "Meeting participants are invalid.");
    const participants = [...new Set(participantValues.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))];
    if (participants.length > 100 || participants.some((value) => value.length > 200)) throw new ApiError(400, "validation_failed", "Meeting participants are invalid.");
    const requirement = optionalBodyText(body.requirement, 20_000, "Customer requirement");
    const technical = optionalBodyText(body.technical, 20_000, "Technical discussion");
    const decision = optionalBodyText(body.decision, 20_000, "Decision");
    const openPoint = optionalBodyText(body.openPoint, 20_000, "Open point");
    const actionItem = optionalBodyText(body.actionItem, 20_000, "Action item");
    const ownerId = body.ownerId === undefined || body.ownerId === null ? null : requiredInteger(body.ownerId, "Meeting owner", 1);
    const dueDate = parseDateOnly(body.dueDate, "Due date", true);
    const attachmentId = body.attachmentId === undefined || body.attachmentId === null ? null : requiredInteger(body.attachmentId, "Attachment", 1);
    const created = await database.transaction(async (transaction) => {
      const validate = new sql.Request(transaction);
      validate.input("id", sql.BigInt, id); validate.input("owner_id", sql.BigInt, ownerId); validate.input("attachment_id", sql.BigInt, attachmentId);
      const reference = (await validate.query<{ inquiry_no: string; owner_valid: number; attachment_valid: number }>(`
        SELECT i.inquiry_no,
          CASE WHEN @owner_id IS NULL OR EXISTS(SELECT 1 FROM dbo.users WHERE id=@owner_id AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END AS owner_valid,
          CASE WHEN @attachment_id IS NULL OR EXISTS(SELECT 1 FROM dbo.inquiry_attachments WHERE id=@attachment_id AND inquiry_id=@id AND deleted_at IS NULL) THEN 1 ELSE 0 END AS attachment_valid
        FROM dbo.inquiries i WHERE i.id=@id AND i.deleted_at IS NULL;
      `)).recordset[0];
      if (!reference) return null;
      if (Number(reference.owner_valid) !== 1 || Number(reference.attachment_valid) !== 1) throw new ApiError(422, "invalid_reference", "Meeting owner or attachment is invalid.");
      const insert = new sql.Request(transaction);
      insert.input("id", sql.BigInt, id); insert.input("meeting_date", sql.Date, meetingDate); insert.input("meeting_type", sql.NVarChar(100), meetingType);
      insert.input("participants", sql.NVarChar(sql.MAX), JSON.stringify(participants)); insert.input("requirement", sql.NVarChar(sql.MAX), requirement);
      insert.input("technical", sql.NVarChar(sql.MAX), technical); insert.input("decision", sql.NVarChar(sql.MAX), decision);
      insert.input("open_point", sql.NVarChar(sql.MAX), openPoint); insert.input("action_item", sql.NVarChar(sql.MAX), actionItem);
      insert.input("owner_id", sql.BigInt, ownerId); insert.input("due_date", sql.Date, dueDate); insert.input("attachment_id", sql.BigInt, attachmentId);
      insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`
        INSERT INTO dbo.inquiry_meetings (inquiry_id,meeting_date,meeting_type,participants_json,requirement,technical,
          decision,open_point,action_item,owner_id,due_date,attachment_id,created_by)
        OUTPUT inserted.id,inserted.row_version VALUES (@id,@meeting_date,@meeting_type,@participants,@requirement,@technical,
          @decision,@open_point,@action_item,@owner_id,@due_date,@attachment_id,@actor);
      `)).recordset[0]!;
      const meetingId = Number(row.id);
      await insertAudit(transaction, actor.id, "Inquiry", id, reference.inquiry_no, "Meeting recorded", null,
        { meetingId, meetingDate, meetingType, participants, decision, ownerId, dueDate });
      return { id: meetingId, rowVersion: row.row_version.toString("base64") };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    if (!created) return reply.status(404).send();
    return reply.status(201).header("Location", `/api/v1/inquiries/${id}`).send(created);
  });
}
