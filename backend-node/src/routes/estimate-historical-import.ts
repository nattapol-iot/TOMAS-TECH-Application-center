import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import sql from "mssql";
import { insertAudit } from "../audit.js";
import { businessToday } from "../business-date.js";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { deleteStoredFile, DOCUMENT_UPLOAD_RATE_LIMIT, multipartText, readMultipartUpload, storageKey, uploadedFileName, writeStoredFile } from "../document-storage.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseDateOnly, requiredInteger } from "../http.js";
import { snapshotOverheadPolicy } from "../overhead.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import type { CurrentUser } from "../types.js";
import { hasRole } from "../user-roles.js";
import type { CurrentUserService } from "../users.js";
import { parseExcelImport, validateOriginalEstimateWorkbook, writeImportedWorkbook } from "./estimate-excel-import.js";

/*
 * Historical import (owner request 2026-11-25): a job costed in an old Excel Estimate Cost, before the app, already runs as a
 * project without an estimate. Importing its workbook creates the estimate for that project in one transaction: a Draft R00
 * dated from the workbook that can still be changed and goes through review and approval like any other, its rows from the
 * same checked parser as the import into an open estimate, linked to the project so the project's Cost tab has an estimate.
 * Every estimate needs an inquiry; the project's own is used when it has one, otherwise one is recorded for the import.
 */

const addYears = (value: string, years: number) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
};

/** An engineering manager or admin imports for any project; the project's manager or lead engineer for their own. */
export function mayImportForProject(actor: CurrentUser, project: { managerId: number; leadEngineerId: number }): boolean {
  return hasRole(actor, "Engineering Manager", "Admin") || project.managerId === actor.id || project.leadEngineerId === actor.id;
}

export function parseHistoricalImport(body: Record<string, unknown>, today: string) {
  const workbook = parseExcelImport(body);
  const projectId = requiredInteger(body.projectId, "Project", 1);
  const ownerId = requiredInteger(body.ownerId, "Estimate owner", 1);
  const dueDate = parseDateOnly(body.dueDate, "Due date")!;
  const contingencyRate = body.contingencyRate ?? 0;
  if (typeof contingencyRate !== "number" || !Number.isFinite(contingencyRate) || contingencyRate < 0 || contingencyRate > 100) {
    throw new ApiError(400, "validation_failed", "Contingency rate must be between 0 and 100.");
  }
  // The workbook's own date: an old job, so never in the future and not older than twenty years.
  if (workbook.sourceDate > today || workbook.sourceDate < addYears(today, -20)) {
    throw new ApiError(400, "validation_failed", "The estimate date must be a past date within the last twenty years.");
  }
  if (dueDate < today || dueDate > addYears(today, 5)) throw new ApiError(400, "validation_failed", "Due date must be between today and five years from today.");
  return { ...workbook, projectId, ownerId, dueDate, contingencyRate };
}

type ProjectRow = {
  id: number | string;
  project_no: string;
  name: string;
  customer_id: number | string;
  end_user_customer_id: number | string | null;
  project_type: string;
  inquiry_id: number | string | null;
  estimate_id: number | string | null;
  manager_id: number | string;
  lead_engineer_id: number | string;
  site: string;
};

export function registerEstimateHistoricalImportRoutes(app: FastifyInstance, database: Database, users: CurrentUserService, config: AppConfig) {
  /** Projects that have no estimate yet and that this person may import one for. */
  app.get("/api/v1/estimates/historical-import/projects", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const all = hasRole(actor, "Engineering Manager", "Admin");
    const result = await database.query<{
      id: number | string;
      project_no: string;
      name: string;
      project_type: string;
      status: string;
      start_date: Date | string;
      customer_name: string | null;
      has_inquiry: boolean;
    }>(
      `SELECT p.id,p.project_no,p.name,p.project_type,p.status,p.start_date,c.name customer_name,CAST(CASE WHEN p.inquiry_id IS NULL THEN 0 ELSE 1 END AS bit) has_inquiry
        FROM dbo.projects p LEFT JOIN dbo.customers c ON c.id=p.customer_id
        WHERE p.deleted_at IS NULL AND p.estimate_id IS NULL AND (@all=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor)
        ORDER BY p.start_date DESC,p.id DESC;`,
      (r) => {
        r.input("all", sql.Bit, all);
        r.input("actor", sql.BigInt, actor.id);
      },
    );
    return result.recordset.map((row) => ({
      id: Number(row.id),
      projectNo: row.project_no,
      name: row.name,
      projectType: row.project_type,
      status: row.status,
      startDate: row.start_date instanceof Date ? row.start_date.toISOString().slice(0, 10) : String(row.start_date).slice(0, 10),
      customerName: row.customer_name ?? "",
      hasInquiry: Boolean(row.has_inquiry),
    }));
  });

  app.post("/api/v1/estimates/historical-import", { config: { rateLimit: DOCUMENT_UPLOAD_RATE_LIMIT } }, async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const storage = config.documentStorage;
    const upload = await readMultipartUpload(request, storage.maxFileSizeBytes);
    let body: Record<string, unknown>;
    try {
      body = bodyObject(JSON.parse(multipartText(upload.values, "payload", 1_048_576, true)!));
    } catch {
      throw new ApiError(400, "invalid_import_payload", "Invalid Excel import payload.");
    }
    const today = businessToday(config.businessTimeZone);
    const input = parseHistoricalImport(body, today);
    const manager = hasRole(actor, "Engineering Manager", "Admin");
    if (!manager && input.ownerId !== actor.id) throw new ApiError(403, "estimate_owner_required", "Only an engineering manager or administrator can import an estimate for another owner.");
    if (uploadedFileName(upload.file.filename) !== input.sourceName || !/\.xlsx$/i.test(input.sourceName))
      throw new ApiError(400, "invalid_original_file", "The original workbook name must match the preview.");
    // The uploaded bytes, not the browser's preview, decide the rows and the total.
    validateOriginalEstimateWorkbook(input, await readFile(upload.file.filepath), uploadedFileName(upload.file.filename));
    const writtenKey = storageKey(`estimates/historical/P${input.projectId}/originals`, ".xlsx");
    const stored = await writeStoredFile(storage, writtenKey, upload.file.filepath);
    const sourceFile = { storageKey: writtenKey, ...stored };
    let result: { id: number; number: string; inquiryNumber: string; inquiryCreated: boolean; projectId: number; projectNo: string; alreadyImported: boolean };
    try {
      result = await database.transaction(async (transaction) => {
        const query = () => new sql.Request(transaction);
        const project = (
          await query()
            .input("id", sql.BigInt, input.projectId)
            .query<ProjectRow>(
              `SELECT id,project_no,name,customer_id,end_user_customer_id,project_type,inquiry_id,estimate_id,manager_id,lead_engineer_id,site
            FROM dbo.projects WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`,
            )
        ).recordset[0];
        if (!project) throw new ApiError(404, "project_not_found", "Project not found.");
        if (!mayImportForProject(actor, { managerId: Number(project.manager_id), leadEngineerId: Number(project.lead_engineer_id) })) {
          throw new ApiError(403, "historical_import_forbidden", "Only the project's manager or lead engineer, an engineering manager or an administrator can import its estimate.");
        }
        if (project.estimate_id !== null) {
          // A retry after a lost reply: the same workbook already made this project's estimate.
          const same = (
            await query()
              .input("estimate", sql.BigInt, Number(project.estimate_id))
              .input("hash", sql.NVarChar(64), input.sourceHash)
              .query<{ estimate_no: string; inquiry_no: string }>(
                `SELECT e.estimate_no,i.inquiry_no FROM dbo.estimates e JOIN dbo.inquiries i ON i.id=e.inquiry_id
              WHERE e.id=@estimate AND e.historical_source IS NOT NULL AND EXISTS(SELECT 1 FROM dbo.audit_log a WHERE a.entity_type=N'Estimate' AND a.entity_id=e.id
                AND a.action=N'Excel imported' AND JSON_VALUE(a.after_json,'$.sourceHash')=@hash);`,
              )
          ).recordset[0];
          if (same)
            return {
              id: Number(project.estimate_id),
              number: same.estimate_no,
              inquiryNumber: same.inquiry_no,
              inquiryCreated: false,
              projectId: Number(project.id),
              projectNo: project.project_no,
              alreadyImported: true,
            };
          throw new ApiError(409, "project_has_estimate", "This project already has an estimate. Open it and import into its revision instead.");
        }
        const owner = query();
        owner.input("owner", sql.BigInt, input.ownerId);
        if (
          !(
            await owner.query(
              `SELECT u.id FROM dbo.users u INNER JOIN dbo.user_effective_roles r ON r.user_id=u.id WHERE u.id=@owner AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Leader',N'Engineering Manager',N'Admin');`,
            )
          ).recordset.length
        ) {
          throw new ApiError(400, "invalid_owner", "The estimate owner must be an active engineer, engineering manager or administrator.");
        }

        let inquiryId = project.inquiry_id === null ? null : Number(project.inquiry_id);
        let inquiryNumber: string;
        if (inquiryId !== null) {
          const inquiry = (
            await query()
              .input("id", sql.BigInt, inquiryId)
              .query<{ inquiry_no: string; estimate_id: number | string | null }>(`SELECT inquiry_no,estimate_id FROM dbo.inquiries WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)
          ).recordset[0];
          const previous = (await query().input("inquiry", sql.BigInt, inquiryId).query(`SELECT id FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK) WHERE inquiry_id=@inquiry;`)).recordset[0];
          if (!inquiry) throw new ApiError(409, "inquiry_not_eligible", "The project's inquiry was deleted. Restore it before importing the estimate.");
          if (inquiry.estimate_id !== null || previous)
            throw new ApiError(409, "estimate_in_history", "The project's inquiry already has an estimate in document history. Restore that estimate instead.");
          inquiryNumber = inquiry.inquiry_no;
        } else {
          // The job came before the app, so it has no inquiry: one is recorded with the project's customer, name and type.
          inquiryNumber = await issueDocumentNumber(transaction, "INQ", today);
          const insert = query();
          insert.input("number", sql.NVarChar(30), inquiryNumber);
          insert.input("date", sql.Date, input.sourceDate);
          insert.input("customer", sql.BigInt, Number(project.customer_id));
          insert.input("end_user", sql.BigInt, project.end_user_customer_id === null ? null : Number(project.end_user_customer_id));
          insert.input("name", sql.NVarChar(300), project.name);
          insert.input("type", sql.NVarChar(100), project.project_type);
          insert.input("owner", sql.BigInt, input.ownerId);
          insert.input("due", sql.Date, input.dueDate);
          insert.input("site", sql.NVarChar(300), project.site || null);
          insert.input("actor", sql.BigInt, actor.id);
          insert.input("remark", sql.NVarChar(sql.MAX), `Recorded for the historical Estimate Cost import of project ${project.project_no} (${input.sourceName}).`);
          inquiryId = Number(
            (
              await insert.query<{ id: number | string }>(
                `INSERT INTO dbo.inquiries(inquiry_no,inquiry_date,customer_id,end_user_customer_id,contact,project_name,project_type,estimate_owner_id,due_date,priority,status,progress,revision,site_location,remark,created_by,updated_by)
              OUTPUT inserted.id VALUES(@number,@date,@customer,@end_user,N'',@name,@type,@owner,@due,N'Normal',N'Estimating',0,0,@site,@remark,@actor,@actor);`,
              )
            ).recordset[0]!.id,
          );
          await insertAudit(transaction, actor.id, "Inquiry", inquiryId, inquiryNumber, "Created for historical estimate", null, {
            projectId: Number(project.id),
            projectNo: project.project_no,
            sourceName: input.sourceName,
          });
        }

        const number = await issueDocumentNumber(transaction, "EST", today);
        const insert = query();
        insert.input("number", sql.NVarChar(30), number);
        insert.input("inquiry", sql.BigInt, inquiryId);
        insert.input("customer", sql.BigInt, Number(project.customer_id));
        insert.input("name", sql.NVarChar(300), project.name);
        insert.input("type", sql.NVarChar(100), project.project_type);
        insert.input("owner", sql.BigInt, input.ownerId);
        insert.input("date", sql.Date, input.sourceDate);
        insert.input("due", sql.Date, input.dueDate);
        insert.input("contingency", sql.Decimal(9, 4), input.contingencyRate);
        insert.input("source", sql.NVarChar(500), input.sourceName);
        insert.input("actor", sql.BigInt, actor.id);
        const id = Number(
          (
            await insert.query<{ id: number | string }>(
              `INSERT INTO dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,revision,created_date,due_date,status,progress,contingency_rate,historical_source,created_by,updated_by)
            OUTPUT inserted.id VALUES(@number,@inquiry,@customer,@name,@type,@owner,0,@date,@due,N'Draft',0,@contingency,@source,@actor,@actor);`,
            )
          ).recordset[0]!.id,
        );
        await snapshotOverheadPolicy(transaction, id, 0, actor.id, today);
        await writeImportedWorkbook(transaction, { id, number, revision: 0, ownerId: input.ownerId, dueDate: input.dueDate }, actor.id, input, sourceFile);

        const link = query();
        link.input("estimate", sql.BigInt, id);
        link.input("inquiry", sql.BigInt, inquiryId);
        link.input("project", sql.BigInt, Number(project.id));
        link.input("actor", sql.BigInt, actor.id);
        link.input("owner", sql.BigInt, input.ownerId);
        // One owner for the inquiry and its estimate (estimate-owner.ts).
        const inquiryLinked = await link.query(
          `UPDATE dbo.inquiries SET estimate_id=@estimate,estimate_owner_id=@owner,status=N'Estimating',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@inquiry AND estimate_id IS NULL AND deleted_at IS NULL;`,
        );
        if (inquiryLinked.rowsAffected[0] !== 1) throw new ApiError(409, "inquiry_not_eligible", "The inquiry can no longer take this estimate.");
        const projectLinked = await link.query(
          `UPDATE dbo.projects SET estimate_id=@estimate,inquiry_id=@inquiry,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@project AND estimate_id IS NULL AND deleted_at IS NULL;`,
        );
        if (projectLinked.rowsAffected[0] !== 1) throw new ApiError(409, "project_has_estimate", "This project already has an estimate.");

        const inquiryCreated = project.inquiry_id === null;
        await insertAudit(transaction, actor.id, "Estimate", id, number, "Created from historical import", null, {
          projectId: Number(project.id),
          projectNo: project.project_no,
          inquiryId,
          inquiryNumber,
          inquiryCreated,
          ownerId: input.ownerId,
          dueDate: input.dueDate,
          contingencyRate: input.contingencyRate,
          sourceName: input.sourceName,
          sourceDate: input.sourceDate,
          sourceTotal: input.sourceTotal,
        });
        await insertAudit(transaction, actor.id, "Project", Number(project.id), project.project_no, "Historical estimate linked", null, { estimateId: id, estimateNumber: number, inquiryId });
        // The header (contingency) and every row are written: the totals guard runs last, inside the same transaction.
        await assertEstimateTotals(transaction, id);
        return { id, number, inquiryNumber, inquiryCreated, projectId: Number(project.id), projectNo: project.project_no, alreadyImported: false };
      });
    } catch (error) {
      if (!(error instanceof DatabaseCommitOutcomeUnknownError)) await deleteStoredFile(storage, writtenKey);
      throw error;
    }
    if (result.alreadyImported) await deleteStoredFile(storage, writtenKey);
    return reply.status(result.alreadyImported ? 200 : 201).send(result);
  });
}
