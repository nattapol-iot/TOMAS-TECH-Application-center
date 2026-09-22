import { withoutLegacyDuplicateErrors } from "../estimate-duplicate-policy.js";
import { booleanQuery } from "../http.js";
import { laborCategorySql } from "../estimate-labor-category.js";
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { AppConfig } from "../config.js";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { issueDocumentNumber } from "../document-number.js";
import { ApiError } from "../errors.js";
import { syncOpportunityStageForInquiry } from "../crm.js";
import { hasRole } from "../user-roles.js";
import { assertEstimateTotals } from "../estimate-total-guard.js";
import { bodyObject, clampedInteger, dateOnly, firstQueryValue, optionalBodyText, optionalPositiveLong, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";
import { snapshotOverheadPolicy } from "../overhead.js";

type EstimateRow = Record<string, unknown> & {
  id: number | string; estimate_no: string; inquiry_no: string; customer_id: number | string; customer_name: string;
  project_name: string; project_type: string; owner_id: number | string; owner_name: string; revision: number;
  due_date: Date | string; status: string; progress: number | string; material_total: number | string;
  engineering_total: number | string; outsource_total: number | string; transportation_total: number | string;
  accommodation_total: number | string; other_total: number | string; contingency_total: number | string;
  overhead_state: string; overhead_total: number | string | null; total: number | string; created_date: Date | string; updated_at: Date | string; row_version: Buffer; total_count: number | string;
  site_location: string | null; target_delivery: Date | string | null;
};

function todayIn(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addYears(value: string, years: number): string {
  const date = new Date(`${value}T00:00:00.000Z`); date.setUTCFullYear(date.getUTCFullYear() + years); return date.toISOString().slice(0, 10);
}

function optionalNonnegativeInteger(value: unknown, label: string): number | null {
  const raw = firstQueryValue(value); if (raw === undefined || raw === "") return null;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return Number(raw);
}

function percentage(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new ApiError(400, "validation_failed", `${label} must be between 0 and 100.`);
  }
  if (!value.toString().includes("e") && (value.toString().split(".")[1]?.length ?? 0) > 4) {
    throw new ApiError(400, "validation_failed", `${label} cannot have more than 4 decimal places.`);
  }
  return value;
}

function managerOverride(actor: CurrentUser): boolean {
  return hasRole(actor, "Engineering Manager", "Admin");
}

// Discarded revisions remain reserved when the active header points back to an older approval.
async function nextEstimateRevision(transaction: TransactionType, id: number, current: number): Promise<number> {
  const q = new sql.Request(transaction).input("id", sql.BigInt, id).input("current", sql.Int, current);
  const row = (await q.query<{ next_revision: number }>(`SELECT MAX(revision)+1 next_revision FROM (
    SELECT @current revision UNION ALL SELECT revision FROM dbo.estimate_revisions WHERE estimate_id=@id
    UNION ALL SELECT TRY_CONVERT(int,JSON_VALUE(before_json,'$.estimate.revision')) FROM dbo.document_lifecycle_events
    WHERE entity_type=N'Estimate' AND entity_id=@id
  ) revisions;`)).recordset[0];
  return row!.next_revision;
}

/** Only the Admin role may approve or send back an estimate it owns itself. */
export function adminSelfDecision(actor: { roles: string[] }): boolean {
  return actor.roles.includes("Admin");
}

async function validationIssues(database: Database, estimateId: number, transaction?: TransactionType): Promise<Array<{ code: string; message: string; entityType: string; entityId: number }>> {
  const statement = `SELECT code,message,entity_type,entity_id FROM dbo.fn_estimate_validation(@estimate_id) ORDER BY code,entity_id;`;
  const map = (rows: Array<{ code: string; message: string; entity_type: string; entity_id: number | string }>) => withoutLegacyDuplicateErrors(rows).map((row) => ({
    code: row.code, message: row.message, entityType: row.entity_type, entityId: Number(row.entity_id),
  }));
  if (transaction) {
    const request = new sql.Request(transaction); request.input("estimate_id", sql.BigInt, estimateId);
    return map((await request.query<{ code: string; message: string; entity_type: string; entity_id: number | string }>(statement)).recordset);
  }
  return map((await database.query<{ code: string; message: string; entity_type: string; entity_id: number | string }>(statement,
    (request) => request.input("estimate_id", sql.BigInt, estimateId))).recordset);
}

async function snapshotSubmission(transaction: TransactionType, estimateId: number, revision: number, actorId: number): Promise<void> {
  const read = new sql.Request(transaction); read.input("estimate_id",sql.BigInt,estimateId); read.input("revision",sql.Int,revision);
  const snapshot = (await read.query<{ snapshot_json:string }>(`SELECT (SELECT e.estimate_no estimateNumber,e.inquiry_id inquiryId,e.customer_id customerId,
      e.project_name projectName,e.project_type projectType,e.owner_id ownerId,e.revision,e.created_date createdDate,e.due_date dueDate,e.status,
      e.progress,e.contingency_rate contingencyRate,e.updated_at updatedAt,
      JSON_QUERY((SELECT t.material_total material,t.engineering_total engineering,t.outsource_total outsource,t.transportation_total transportation,
        t.accommodation_total accommodation,t.other_total other,t.base_total subtotal,t.internal_direct_hours internalDirectHours,
        t.overhead_state overheadState,t.overhead_policy_id overheadPolicyId,t.overhead_policy_version overheadPolicyVersion,
        t.overhead_hourly_rate overheadHourlyRate,t.overhead_total overhead,t.contingency_total contingency,t.total
        FROM dbo.v_estimate_totals t WHERE t.estimate_id=e.id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) totals,
      JSON_QUERY((SELECT snapshot.policy_id policyId,snapshot.policy_version policyVersion,snapshot.method,snapshot.monthly_budget monthlyBudget,
        snapshot.normal_direct_hours normalDirectHours,snapshot.hourly_rate hourlyRate,snapshot.effective_from effectiveFrom,snapshot.reason
        FROM dbo.estimate_overhead_snapshots snapshot WHERE snapshot.estimate_id=e.id AND snapshot.revision=e.revision FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) overheadPolicy,
      JSON_QUERY((SELECT category_code categoryCode,category,subcategory,module,item_code itemCode,description,brand,model,specification,supplier_id supplierId,
        qty quantity,unit,unit_cost unitCost,price_source priceSource,reference_no referenceNumber,reference_project referenceProject,price_date priceDate,
        remark,price_set_key priceSetKey,is_price_set isPriceSet,qty_per_set quantityPerSet,owner_id ownerId,status FROM dbo.cost_items WHERE estimate_id=e.id AND revision=e.revision AND deleted_at IS NULL ORDER BY sort_order,category_code,module,id FOR JSON PATH)) costItems,
      JSON_QUERY((SELECT package,activity,department,level,cost_type costType,provider,supplier_id supplierId,quotation_no quotationNumber,price_date priceDate,
        engineers,man_days manDays,hours_per_day hoursPerDay,daily_rate dailyRate,owner_id ownerId,remark FROM dbo.manhour_lines
        WHERE estimate_id=e.id AND revision=e.revision AND deleted_at IS NULL ORDER BY sort_order,package,id FOR JSON PATH)) manhourLines,
      JSON_QUERY((SELECT package,expense_type expenseType,description,cost_type costType,supplier_id supplierId,reference_no referenceNumber,qty quantity,
        unit,unit_cost unitCost,owner_id ownerId,remark FROM dbo.expense_lines WHERE estimate_id=e.id AND revision=e.revision AND deleted_at IS NULL ORDER BY sort_order,package,id FOR JSON PATH)) expenseLines,
      JSON_QUERY((SELECT category,description,qty quantity,unit,unit_cost unitCost,remark FROM dbo.other_cost_lines
        WHERE estimate_id=e.id AND revision=e.revision AND deleted_at IS NULL ORDER BY sort_order,category,id FOR JSON PATH)) otherCostLines,
      JSON_QUERY((SELECT module_key moduleKey,title,remark,quantity,unit,cost_multiplier costMultiplier,JSON_QUERY(description_rows) descriptionRows FROM dbo.estimate_module_details
        WHERE estimate_id=e.id AND revision=e.revision FOR JSON PATH)) moduleDetails,
      JSON_QUERY((SELECT mapping.source_type sourceType,mapping.source_id sourceId,mapping.erp_category erpCategory,mapping.copied_from_revision copiedFromRevision
        FROM dbo.estimate_erp_mappings mapping WHERE mapping.estimate_id=e.id AND mapping.revision=e.revision AND (
          (mapping.source_type=N'CostItem' AND EXISTS(SELECT 1 FROM dbo.cost_items line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'ManhourLine' AND EXISTS(SELECT 1 FROM dbo.manhour_lines line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'ExpenseLine' AND EXISTS(SELECT 1 FROM dbo.expense_lines line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'OtherCostLine' AND EXISTS(SELECT 1 FROM dbo.other_cost_lines line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'Contingency' AND EXISTS(SELECT 1 FROM dbo.v_estimate_totals totals WHERE totals.estimate_id=e.id AND ABS(totals.contingency_total)>0.005))
        ) ORDER BY mapping.source_type,mapping.source_id FOR JSON PATH)) erpMappings,
      JSON_QUERY((SELECT attachment.id,attachment.name,attachment.category,attachment.content_type contentType,attachment.size_bytes sizeBytes,
        attachment.storage_key storageKey,attachment.sha256,attachment.uploaded_at uploadedAt FROM dbo.inquiry_attachments attachment
        WHERE attachment.inquiry_id=e.inquiry_id AND attachment.deleted_at IS NULL ORDER BY attachment.id FOR JSON PATH)) inquiryFiles,
      JSON_QUERY((SELECT JSON_VALUE(a.after_json,'$.sourceName') sourceName,JSON_VALUE(a.after_json,'$.sourceHash') sourceHash,
        JSON_QUERY(a.after_json,'$.sourceFile') sourceFile,a.occurred_at importedAt FROM dbo.audit_log a WHERE a.entity_type=N'Estimate'
        AND a.entity_id=e.id AND a.action=N'Excel imported' AND TRY_CONVERT(int,JSON_VALUE(a.after_json,'$.revision'))=e.revision ORDER BY a.id FOR JSON PATH)) excelImports
      FROM dbo.estimates e WHERE e.id=@estimate_id AND e.revision=@revision FOR JSON PATH,WITHOUT_ARRAY_WRAPPER) snapshot_json;`)).recordset[0]?.snapshot_json;
  if (!snapshot) throw new ApiError(409,"submission_snapshot_failed","The submitted estimate could not be snapshotted.");
  const insert = new sql.Request(transaction); insert.input("estimate_id",sql.BigInt,estimateId); insert.input("revision",sql.Int,revision);
  insert.input("snapshot",sql.NVarChar(sql.MAX),snapshot); insert.input("hash",sql.Char(64),createHash("sha256").update(snapshot).digest("hex"));
  insert.input("actor",sql.BigInt,actorId);
  await insert.query(`INSERT dbo.estimate_submission_snapshots(estimate_id,revision,snapshot_json,snapshot_sha256,submitted_by)
    VALUES(@estimate_id,@revision,@snapshot,@hash,@actor);`);
}

async function snapshotRevision(transaction: TransactionType, estimateId: number, revision: number, reason: string, status: string, actorId: number): Promise<void> {
  const request = new sql.Request(transaction);
  request.input("estimate_id", sql.BigInt, estimateId); request.input("revision", sql.Int, revision);
  request.input("reason", sql.NVarChar(100), reason); request.input("snapshot_status", sql.NVarChar(50), status); request.input("actor", sql.BigInt, actorId);
  const result = await request.query<{ id: number | string }>(`
    DECLARE @snapshot nvarchar(max)=(SELECT e.estimate_no estimateNumber,e.inquiry_id inquiryId,e.customer_id customerId,
      e.project_name projectName,e.project_type projectType,e.owner_id ownerId,e.revision,e.created_date createdDate,
      e.due_date dueDate,e.status,e.progress,e.contingency_rate contingencyRate,e.created_by createdBy,e.updated_by updatedBy,
      e.created_at createdAt,e.updated_at updatedAt,@reason reviewComment,
      JSON_QUERY((SELECT t.material_total material,t.engineering_total engineering,t.outsource_total outsource,
        t.transportation_total transportation,t.accommodation_total accommodation,t.other_total other,t.base_total subtotal,
        t.internal_direct_hours internalDirectHours,t.overhead_state overheadState,t.overhead_policy_id overheadPolicyId,
        t.overhead_policy_version overheadPolicyVersion,t.overhead_hourly_rate overheadHourlyRate,t.overhead_total overhead,
        t.contingency_total contingency,t.total FROM dbo.v_estimate_totals t WHERE t.estimate_id=e.id FOR JSON PATH,WITHOUT_ARRAY_WRAPPER)) totals,
      JSON_QUERY((SELECT mapping.source_type sourceType,mapping.source_id sourceId,mapping.erp_category erpCategory,
        mapping.copied_from_revision copiedFromRevision FROM dbo.estimate_erp_mappings mapping
        WHERE mapping.estimate_id=e.id AND mapping.revision=e.revision AND (
          (mapping.source_type=N'CostItem' AND EXISTS(SELECT 1 FROM dbo.cost_items line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'ManhourLine' AND EXISTS(SELECT 1 FROM dbo.manhour_lines line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'ExpenseLine' AND EXISTS(SELECT 1 FROM dbo.expense_lines line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'OtherCostLine' AND EXISTS(SELECT 1 FROM dbo.other_cost_lines line WHERE line.id=mapping.source_id AND line.deleted_at IS NULL)) OR
          (mapping.source_type=N'Contingency' AND EXISTS(SELECT 1 FROM dbo.v_estimate_totals totals WHERE totals.estimate_id=e.id AND ABS(totals.contingency_total)>0.005))
        ) ORDER BY mapping.source_type,mapping.source_id FOR JSON PATH)) erpMappings
      FROM dbo.estimates e WHERE e.id=@estimate_id AND e.revision=@revision FOR JSON PATH,WITHOUT_ARRAY_WRAPPER);
    DECLARE @created TABLE(id bigint);
    INSERT INTO dbo.estimate_revisions(estimate_id,revision,reason,description,created_by,reviewed_by,reviewed_at,status,total)
    OUTPUT inserted.id INTO @created SELECT e.id,e.revision,@reason,@snapshot,@actor,@actor,SYSUTCDATETIME(),@snapshot_status,t.total
    FROM dbo.estimates e INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id WHERE e.id=@estimate_id AND e.revision=@revision;
    SELECT id FROM @created;
  `);
  if (!result.recordset[0]) throw new ApiError(409, "revision_snapshot_failed", "The current estimate revision could not be snapshotted.");
}

async function updateInquiry(transaction: TransactionType, inquiryId: number, status: string, progress: number, actorId: number): Promise<void> {
  const request = new sql.Request(transaction); request.input("status", sql.NVarChar(50), status);
  request.input("progress", sql.Decimal(5, 2), progress); request.input("actor", sql.BigInt, actorId); request.input("id", sql.BigInt, inquiryId);
  const result = await request.query(`UPDATE dbo.inquiries SET status=@status,progress=@progress,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`);
  if (result.rowsAffected[0] !== 1) throw new ApiError(409, "inquiry_update_failed", "The linked inquiry could not be updated.");
}

async function ensureRevisionSnapshot(transaction: TransactionType, estimateId: number, revision: number, reason: string, status: string, actorId: number): Promise<void> {
  const lookup = new sql.Request(transaction); lookup.input("estimate_id", sql.BigInt, estimateId); lookup.input("revision", sql.Int, revision);
  const snapshotExists = (await lookup.query<{ snapshot_exists: boolean }>(`SELECT CASE WHEN EXISTS(
    SELECT 1 FROM dbo.estimate_revisions WITH(UPDLOCK,HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@revision
  ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END snapshot_exists;`)).recordset[0]?.snapshot_exists;
  if (!snapshotExists) await snapshotRevision(transaction, estimateId, revision, reason, status, actorId);
}

async function cloneRevisionLines(transaction: TransactionType, estimateId: number, currentRevision: number, nextRevision: number, actorId: number): Promise<void> {
  const clone = new sql.Request(transaction); clone.input("estimate_id", sql.BigInt, estimateId); clone.input("current_revision", sql.Int, currentRevision);
  clone.input("next_revision", sql.Int, nextRevision); clone.input("actor", sql.BigInt, actorId);
  await clone.query(`
    INSERT dbo.estimate_module_details(estimate_id,revision,module_key,title,remark,updated_by,description_rows,quantity,unit,cost_multiplier)
    SELECT estimate_id,@next_revision,module_key,title,remark,@actor,description_rows,quantity,unit,cost_multiplier FROM dbo.estimate_module_details
    WHERE estimate_id=@estimate_id AND revision=@current_revision;
    DECLARE @copiedCosts TABLE(old_id bigint,new_id bigint);
    MERGE dbo.cost_items AS target
    USING (SELECT * FROM dbo.cost_items WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL) AS source ON 1=0
    WHEN NOT MATCHED THEN INSERT(estimate_id,revision,category_code,category,subcategory,module,item_code,description,brand,model,specification,supplier_id,qty,unit,unit_cost,price_source,reference_no,reference_project,price_date,remark,owner_id,status,created_by,updated_by,sort_order,price_set_key,is_price_set,qty_per_set)
    VALUES(source.estimate_id,@next_revision,source.category_code,source.category,source.subcategory,source.module,source.item_code,source.description,source.brand,source.model,source.specification,source.supplier_id,source.qty,source.unit,source.unit_cost,source.price_source,source.reference_no,source.reference_project,source.price_date,source.remark,source.owner_id,source.status,@actor,@actor,source.sort_order,source.price_set_key,source.is_price_set,source.qty_per_set)
    OUTPUT source.id,inserted.id INTO @copiedCosts;
    DECLARE @copiedManhours TABLE(old_id bigint,new_id bigint);
    MERGE dbo.manhour_lines AS target
    USING (SELECT * FROM dbo.manhour_lines WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL) AS source ON 1=0
    WHEN NOT MATCHED THEN INSERT(estimate_id,revision,package,activity,department,level,cost_type,provider,supplier_id,quotation_no,price_date,engineers,man_days,hours_per_day,daily_rate,owner_id,remark,created_by,updated_by,sort_order)
    VALUES(source.estimate_id,@next_revision,source.package,source.activity,source.department,source.level,source.cost_type,source.provider,source.supplier_id,source.quotation_no,source.price_date,source.engineers,source.man_days,source.hours_per_day,source.daily_rate,source.owner_id,source.remark,@actor,@actor,source.sort_order)
    OUTPUT source.id,inserted.id INTO @copiedManhours;
    INSERT dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,after_json)
    SELECT @actor,N'ManhourLine',copied.new_id,a.entity_no,N'Created',JSON_MODIFY(a.after_json,'$.copiedFromLineId',copied.old_id)
    FROM @copiedManhours copied CROSS APPLY (
      SELECT TOP(1) entity_no,after_json FROM dbo.audit_log
      WHERE entity_type=N'ManhourLine' AND entity_id=copied.old_id AND action=N'Created'
        AND JSON_VALUE(after_json,'$.kind')=N'manhour' AND LEN(JSON_VALUE(after_json,'$.sourceHash'))=64
      ORDER BY id
    ) a;
    DECLARE @copiedExpenses TABLE(old_id bigint,new_id bigint);
    MERGE dbo.expense_lines AS target
    USING (SELECT * FROM dbo.expense_lines WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL) AS source ON 1=0
    WHEN NOT MATCHED THEN INSERT(estimate_id,revision,package,expense_type,description,cost_type,supplier_id,reference_no,qty,unit,unit_cost,owner_id,remark,created_by,updated_by,sort_order)
    VALUES(source.estimate_id,@next_revision,source.package,source.expense_type,source.description,source.cost_type,source.supplier_id,source.reference_no,source.qty,source.unit,source.unit_cost,source.owner_id,source.remark,@actor,@actor,source.sort_order)
    OUTPUT source.id,inserted.id INTO @copiedExpenses;
    DECLARE @copiedOtherCosts TABLE(old_id bigint,new_id bigint);
    MERGE dbo.other_cost_lines AS target
    USING (SELECT * FROM dbo.other_cost_lines WITH(HOLDLOCK) WHERE estimate_id=@estimate_id AND revision=@current_revision AND deleted_at IS NULL) AS source ON 1=0
    WHEN NOT MATCHED THEN INSERT(estimate_id,revision,category,description,qty,unit,unit_cost,remark,created_by,updated_by,sort_order)
    VALUES(source.estimate_id,@next_revision,source.category,source.description,source.qty,source.unit,source.unit_cost,source.remark,@actor,@actor,source.sort_order)
    OUTPUT source.id,inserted.id INTO @copiedOtherCosts;

    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,copied_from_mapping_id,copied_from_revision,created_by,updated_by)
    SELECT @estimate_id,@next_revision,N'CostItem',copied.new_id,m.erp_category,m.id,@current_revision,@actor,@actor
    FROM dbo.estimate_erp_mappings m INNER JOIN @copiedCosts copied ON copied.old_id=m.source_id
    WHERE m.estimate_id=@estimate_id AND m.revision=@current_revision AND m.source_type=N'CostItem';
    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,copied_from_mapping_id,copied_from_revision,created_by,updated_by)
    SELECT @estimate_id,@next_revision,N'ManhourLine',copied.new_id,m.erp_category,m.id,@current_revision,@actor,@actor
    FROM dbo.estimate_erp_mappings m INNER JOIN @copiedManhours copied ON copied.old_id=m.source_id
    WHERE m.estimate_id=@estimate_id AND m.revision=@current_revision AND m.source_type=N'ManhourLine';
    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,copied_from_mapping_id,copied_from_revision,created_by,updated_by)
    SELECT @estimate_id,@next_revision,N'ExpenseLine',copied.new_id,m.erp_category,m.id,@current_revision,@actor,@actor
    FROM dbo.estimate_erp_mappings m INNER JOIN @copiedExpenses copied ON copied.old_id=m.source_id
    WHERE m.estimate_id=@estimate_id AND m.revision=@current_revision AND m.source_type=N'ExpenseLine';
    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,copied_from_mapping_id,copied_from_revision,created_by,updated_by)
    SELECT @estimate_id,@next_revision,N'OtherCostLine',copied.new_id,m.erp_category,m.id,@current_revision,@actor,@actor
    FROM dbo.estimate_erp_mappings m INNER JOIN @copiedOtherCosts copied ON copied.old_id=m.source_id
    WHERE m.estimate_id=@estimate_id AND m.revision=@current_revision AND m.source_type=N'OtherCostLine';
    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,copied_from_mapping_id,copied_from_revision,created_by,updated_by)
    SELECT @estimate_id,@next_revision,m.source_type,NULL,m.erp_category,m.id,@current_revision,@actor,@actor
    FROM dbo.estimate_erp_mappings m
    WHERE m.estimate_id=@estimate_id AND m.revision=@current_revision AND m.source_type=N'Contingency';
  `);
}

async function materializeErpMappings(transaction: TransactionType, estimateId: number, revision: number, actorId: number): Promise<number> {
  const request = new sql.Request(transaction);
  request.input("estimate_id", sql.BigInt, estimateId);
  request.input("revision", sql.Int, revision);
  request.input("actor", sql.BigInt, actorId);
  const result = await request.query<{ unmapped_count: number | string }>(`
    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
    SELECT @estimate_id,@revision,N'CostItem',line.id,
      CASE line.category_code WHEN '01' THEN N'Hardware' WHEN '02' THEN N'Software' ELSE N'Unmapped' END,@actor,@actor
    FROM dbo.cost_items line
    WHERE line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings mapping WITH(UPDLOCK,HOLDLOCK)
        WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.source_type=N'CostItem' AND mapping.source_id=line.id);

    UPDATE mapping SET erp_category=${laborCategorySql('line')},updated_by=@actor,updated_at=SYSUTCDATETIME()
    FROM dbo.estimate_erp_mappings mapping INNER JOIN dbo.manhour_lines line ON line.id=mapping.source_id
      AND line.estimate_id=mapping.estimate_id AND line.revision=mapping.revision
    WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.source_type=N'ManhourLine'
      AND line.deleted_at IS NULL AND ${laborCategorySql('line')} IS NOT NULL
      AND mapping.erp_category<>${laborCategorySql('line')};
    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
    SELECT @estimate_id,@revision,N'ManhourLine',line.id,
      COALESCE(${laborCategorySql('line')},N'Unmapped'),@actor,@actor
    FROM dbo.manhour_lines line
    WHERE line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings mapping WITH(UPDLOCK,HOLDLOCK)
        WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.source_type=N'ManhourLine' AND mapping.source_id=line.id);

    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
    SELECT @estimate_id,@revision,N'ExpenseLine',line.id,N'Unmapped',@actor,@actor
    FROM dbo.expense_lines line
    WHERE line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings mapping WITH(UPDLOCK,HOLDLOCK)
        WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.source_type=N'ExpenseLine' AND mapping.source_id=line.id);

    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
    SELECT @estimate_id,@revision,N'OtherCostLine',line.id,N'Unmapped',@actor,@actor
    FROM dbo.other_cost_lines line
    WHERE line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings mapping WITH(UPDLOCK,HOLDLOCK)
        WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.source_type=N'OtherCostLine' AND mapping.source_id=line.id);

    INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
    SELECT @estimate_id,@revision,N'Contingency',NULL,N'Unmapped',@actor,@actor
    FROM dbo.v_estimate_totals totals
    WHERE totals.estimate_id=@estimate_id AND ABS(totals.contingency_total)>0.005
      AND NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings mapping WITH(UPDLOCK,HOLDLOCK)
        WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.source_type=N'Contingency' AND mapping.source_id IS NULL);

    SELECT COUNT_BIG(*) unmapped_count FROM dbo.estimate_erp_mappings mapping
    WHERE mapping.estimate_id=@estimate_id AND mapping.revision=@revision AND mapping.erp_category=N'Unmapped' AND (
      (mapping.source_type=N'CostItem' AND EXISTS(SELECT 1 FROM dbo.cost_items line WHERE line.id=mapping.source_id AND line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL)) OR
      (mapping.source_type=N'ManhourLine' AND EXISTS(SELECT 1 FROM dbo.manhour_lines line WHERE line.id=mapping.source_id AND line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL)) OR
      (mapping.source_type=N'ExpenseLine' AND EXISTS(SELECT 1 FROM dbo.expense_lines line WHERE line.id=mapping.source_id AND line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL)) OR
      (mapping.source_type=N'OtherCostLine' AND EXISTS(SELECT 1 FROM dbo.other_cost_lines line WHERE line.id=mapping.source_id AND line.estimate_id=@estimate_id AND line.revision=@revision AND line.deleted_at IS NULL)) OR
      (mapping.source_type=N'Contingency' AND EXISTS(SELECT 1 FROM dbo.v_estimate_totals totals WHERE totals.estimate_id=@estimate_id AND ABS(totals.contingency_total)>0.005))
    );
  `);
  return Number(result.recordset[0]?.unmapped_count ?? 0);
}

/** A submission snapshot is immutable and unique per revision. Withdrawal starts a new working revision. */
export async function withdrawEstimateReview(transaction: TransactionType, id: number, revision: number, actorId: number, timeZone: string): Promise<void> {
  await ensureRevisionSnapshot(transaction, id, revision, "Review withdrawn", "Withdrawn", actorId);
  const next = await nextEstimateRevision(transaction, id, revision);
  await new sql.Request(transaction).input("id", sql.BigInt, id).input("next", sql.Int, next).input("actor", sql.BigInt, actorId)
    .query(`UPDATE dbo.estimates SET revision=@next,status=N'Revision Required',progress=75,locked_at=NULL,locked_by=NULL,
      updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
  await snapshotOverheadPolicy(transaction, id, next, actorId, todayIn(timeZone));
  await cloneRevisionLines(transaction, id, revision, next, actorId);
  await assertEstimateTotals(transaction, id);
}

async function transition(
  request: FastifyRequest,
  id: number,
  permission: string,
  targetStatus: string,
  targetProgress: number,
  inquiryStatus: string,
  inquiryProgress: number,
  allowedStatuses: string[],
  action: string,
  requireOwner: boolean,
  forbidOwner: boolean,
  database: Database,
  users: CurrentUserService,
): Promise<object> {
  await users.demandPermission(request, permission); const actor = await users.required(request);
  const body = bodyObject(request.body); const rowVersion = parseRowVersion(body.rowVersion);
  const comment = optionalBodyText(body.comment, 20_000, "Workflow comment");
  return database.transaction(async (transaction) => {
    const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, id);
    const current = (await lookup.query<{ estimate_no: string; status: string; progress: number | string; revision: number; owner_id: number | string; inquiry_id: number | string; inquiry_no: string; inquiry_status: string; inquiry_progress: number | string }>(`
      SELECT e.estimate_no,e.status,e.progress,e.revision,e.owner_id,e.inquiry_id,i.inquiry_no,i.status inquiry_status,i.progress inquiry_progress
      FROM dbo.estimates e WITH (UPDLOCK,HOLDLOCK) INNER JOIN dbo.inquiries i WITH (UPDLOCK,HOLDLOCK) ON i.id=e.inquiry_id
      WHERE e.id=@id AND e.deleted_at IS NULL AND i.deleted_at IS NULL AND e.archived_at IS NULL AND i.archived_at IS NULL AND i.status<>N'Cancelled';
    `)).recordset[0];
    if (!current) throw new ApiError(404, "estimate_not_found", "Estimate or its linked inquiry was not found.");
    if (!allowedStatuses.some((status) => status.toLowerCase() === current.status.toLowerCase())) {
      throw new ApiError(409, "invalid_transition", `Cannot move an estimate from '${current.status}' to '${targetStatus}'.`);
    }
    const ownerId = Number(current.owner_id);
    if (requireOwner && ownerId !== actor.id && !managerOverride(actor)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can submit this estimate.");
    // Administrators may decide their own estimates; every other owner needs a second approver.
    if (forbidOwner && ownerId === actor.id && !adminSelfDecision(actor)) throw new ApiError(403, "self_approval_forbidden", "The estimate owner cannot approve their own estimate. Another approver must decide it.");
    await assertEstimateTotals(transaction, id);
    const issues = await validationIssues(database, id, transaction);
    if (issues.length) throw new ApiError(422, "estimate_invalid", "The estimate has critical validation errors.", issues);
    if (action === "Submitted") await materializeErpMappings(transaction, id, current.revision, actor.id);
    if (action === "Approved") {
      const unmappedCount = await materializeErpMappings(transaction, id, current.revision, actor.id);
      if (unmappedCount > 0) throw new ApiError(422, "estimate_erp_mapping_incomplete", `${unmappedCount} cost line(s) must be assigned to an ERP category before approval.`);
    }
    const update = new sql.Request(transaction); update.input("status", sql.NVarChar(50), targetStatus);
    update.input("progress", sql.Decimal(5, 2), targetProgress); update.input("actor", sql.BigInt, actor.id);
    update.input("lock_estimate", sql.Bit, action === "Approved"); update.input("id", sql.BigInt, id); update.input("row_version", sql.VarBinary(8), rowVersion);
    const updated = (await update.query<{ row_version: Buffer }>(`
      UPDATE dbo.estimates SET status=@status,progress=@progress,
        locked_at=CASE WHEN @lock_estimate=1 THEN SYSUTCDATETIME() ELSE locked_at END,
        locked_by=CASE WHEN @lock_estimate=1 THEN @actor ELSE locked_by END,updated_by=@actor,updated_at=SYSUTCDATETIME()
      OUTPUT inserted.row_version WHERE id=@id AND row_version=@row_version;
    `)).recordset[0];
    if (!updated) throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
    if (action === "Submitted") await snapshotSubmission(transaction,id,current.revision,actor.id);
    if (action === "Approved") await snapshotRevision(transaction, id, current.revision, "Approved", "Approved", actor.id);
    const inquiryId = Number(current.inquiry_id); await updateInquiry(transaction, inquiryId, inquiryStatus, inquiryProgress, actor.id);
    if(action === "Approved") await syncOpportunityStageForInquiry(transaction,inquiryId,"PROPOSAL",actor.id);
    await insertAudit(transaction, actor.id, "Estimate", id, current.estimate_no, action,
      { revision: current.revision, status: current.status, progress: Number(current.progress) },
      { revision: current.revision, status: targetStatus, progress: targetProgress, comment });
    await insertAudit(transaction, actor.id, "Inquiry", inquiryId, current.inquiry_no, `Estimate ${action.toLowerCase()}`,
      { status: current.inquiry_status, progress: Number(current.inquiry_progress) },
      { status: inquiryStatus, progress: inquiryProgress, estimateRevision: current.revision });
    return { id, revision: current.revision, status: targetStatus, progress: targetProgress, rowVersion: updated.row_version.toString("base64") };
  });
}

export function registerEstimateRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/estimates", async (request) => {
    await users.demandPermission(request, "estimate.read"); const query = request.query as Record<string, unknown>;
    const page = clampedInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER); const pageSize = clampedInteger(query.pageSize, 25, 1, 100);
    const search = optionalText(query.search, 200, "Search"); const status = optionalText(query.status, 50, "Status");
    const customerId = optionalPositiveLong(query.customerId, "Customer id"); const projectType = optionalText(query.projectType, 100, "Project type");
    const ownerId = optionalPositiveLong(query.ownerId, "Owner id"); const department = optionalText(query.department, 100, "Department");
    const revision = optionalNonnegativeInteger(query.revision, "Revision");
    const mineId = booleanQuery(query.mine) ? (await users.required(request)).id : null;
    const result = await database.query<EstimateRow>(`
      SELECT e.id,e.estimate_no,i.inquiry_no,i.site_location,i.target_delivery,e.customer_id,c.name customer_name,e.project_name,e.project_type,
        e.owner_id,u.name owner_name,e.revision,e.due_date,e.status,e.progress,t.material_total,t.engineering_total,
        t.outsource_total,t.transportation_total,t.accommodation_total,t.other_total,t.overhead_state,t.overhead_total,t.contingency_total,t.total,
        e.created_date,e.updated_at,e.row_version,COUNT_BIG(*) OVER() total_count
      FROM dbo.estimates e INNER JOIN dbo.inquiries i ON i.id=e.inquiry_id INNER JOIN dbo.customers c ON c.id=e.customer_id
      INNER JOIN dbo.users u ON u.id=e.owner_id INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
      WHERE e.deleted_at IS NULL AND e.archived_at IS NULL AND (@status IS NULL OR e.status=@status) AND (@customer_id IS NULL OR e.customer_id=@customer_id)
        AND (@project_type IS NULL OR e.project_type=@project_type) AND (@owner_id IS NULL OR e.owner_id=@owner_id)
        AND (@mine_id IS NULL OR e.owner_id=@mine_id OR EXISTS (
          SELECT 1 FROM dbo.estimate_assignments a WHERE a.estimate_id=e.id
            AND (a.owner_id=@mine_id OR a.support_id=@mine_id)))
        AND (@department IS NULL OR u.department=@department) AND (@revision IS NULL OR e.revision=@revision)
        AND (@search IS NULL OR e.estimate_no LIKE N'%'+@search+N'%' OR i.inquiry_no LIKE N'%'+@search+N'%'
          OR e.project_name LIKE N'%'+@search+N'%' OR c.name LIKE N'%'+@search+N'%')
      ORDER BY e.updated_at DESC,e.id DESC OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
    `, (sqlRequest) => { sqlRequest.input("status", sql.NVarChar(50), status); sqlRequest.input("search", sql.NVarChar(200), search);
      sqlRequest.input("customer_id", sql.BigInt, customerId); sqlRequest.input("project_type", sql.NVarChar(100), projectType);
      sqlRequest.input("mine_id", sql.BigInt, mineId); sqlRequest.input("owner_id", sql.BigInt, ownerId); sqlRequest.input("department", sql.NVarChar(100), department);
      sqlRequest.input("revision", sql.Int, revision); sqlRequest.input("offset", sql.Int, (page - 1) * pageSize); sqlRequest.input("page_size", sql.Int, pageSize); });
    return { items: result.recordset.map((row) => ({ id: Number(row.id), number: row.estimate_no, inquiryNumber: row.inquiry_no,
      customerId: Number(row.customer_id), customerName: row.customer_name, projectName: row.project_name, projectType: row.project_type,
      siteLocation: row.site_location ?? "", targetDelivery: dateOnly(row.target_delivery),
      ownerId: Number(row.owner_id), ownerName: row.owner_name, revision: row.revision, createdDate: dateOnly(row.created_date), dueDate: dateOnly(row.due_date),
      status: row.status, progress: Number(row.progress), materialTotal: Number(row.material_total), engineeringTotal: Number(row.engineering_total),
      outsourceTotal: Number(row.outsource_total), transportationTotal: Number(row.transportation_total), accommodationTotal: Number(row.accommodation_total),
      otherTotal: Number(row.other_total), contingencyTotal: Number(row.contingency_total), total: Number(row.total), updatedAt: row.updated_at,
      overheadState: row.overhead_state, overheadTotal: row.overhead_total === null ? null : Number(row.overhead_total),
      rowVersion: row.row_version.toString("base64") })), page, pageSize, total: Number(result.recordset[0]?.total_count ?? 0) };
  });

  app.post("/api/v1/estimates", async (request, reply) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request); const body = bodyObject(request.body);
    const inquiryId = requiredInteger(body.inquiryId, "Inquiry", 1); const ownerId = requiredInteger(body.ownerId, "Owner", 1);
    const contingencyRate = percentage(body.contingencyRate, "Contingency rate"); const dueDate = parseDateOnly(body.dueDate, "Due date")!;
    if (!managerOverride(actor) && ownerId !== actor.id) throw new ApiError(403, "estimate_owner_required", "Only an engineering manager or administrator can create an estimate for another owner.");
    const today = todayIn(config.businessTimeZone); if (dueDate < today || dueDate > addYears(today, 5)) throw new ApiError(400, "validation_failed", "Due date must be between today and five years from today.");
    const created = await database.transaction(async (transaction) => {
      const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, inquiryId);
      const inquiry = (await lookup.query<{ customer_id: number | string; project_name: string; project_type: string; inquiry_no: string; estimate_owner_id: number | string; status: string; estimate_id: number | string | null }>(`
        SELECT customer_id,project_name,project_type,inquiry_no,estimate_owner_id,status,estimate_id FROM dbo.inquiries WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL AND archived_at IS NULL;
      `)).recordset[0];
      if (!inquiry) throw new ApiError(404, "inquiry_not_found", "Inquiry not found.");
      if (inquiry.status !== "New" || inquiry.estimate_id !== null) throw new ApiError(409, "inquiry_not_eligible", "Only a new inquiry without an existing estimate can be converted to an estimate.");
      const previous = (await new sql.Request(transaction).input("inquiry",sql.BigInt,inquiryId)
        .query(`SELECT id FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK) WHERE inquiry_id=@inquiry;`)).recordset[0];
      if (previous) throw new ApiError(409,"estimate_in_history","This inquiry already has an estimate in document history. Restore that estimate to preserve its number.");
      if (!managerOverride(actor) && Number(inquiry.estimate_owner_id) !== actor.id) throw new ApiError(403, "inquiry_owner_required", "Only the assigned inquiry owner, an engineering manager or an administrator can create its estimate.");
      const ownerRequest = new sql.Request(transaction); ownerRequest.input("owner_id", sql.BigInt, ownerId);
      const validOwner = (await ownerRequest.query<{ allowed: boolean }>(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
        WHERE u.id=@owner_id AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Admin')) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END allowed;`)).recordset[0]?.allowed;
      if (!validOwner) throw new ApiError(400, "validation_failed", "The selected estimate owner must be an active engineer, engineering manager or administrator.");
      const number = await issueDocumentNumber(transaction, "EST", today); const insert = new sql.Request(transaction);
      insert.input("number", sql.NVarChar(30), number); insert.input("inquiry_id", sql.BigInt, inquiryId); insert.input("customer_id", sql.BigInt, Number(inquiry.customer_id));
      insert.input("project_name", sql.NVarChar(300), inquiry.project_name); insert.input("project_type", sql.NVarChar(100), inquiry.project_type);
      insert.input("owner_id", sql.BigInt, ownerId); insert.input("today", sql.Date, today); insert.input("due_date", sql.Date, dueDate);
      insert.input("contingency_rate", sql.Decimal(9, 4), contingencyRate); insert.input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,
        revision,created_date,due_date,status,progress,contingency_rate,created_by,updated_by) OUTPUT inserted.id,inserted.row_version
        VALUES(@number,@inquiry_id,@customer_id,@project_name,@project_type,@owner_id,0,@today,@due_date,N'Draft',0,@contingency_rate,@actor,@actor);`)).recordset[0]!;
      const id = Number(row.id); const updateInquiryRequest = new sql.Request(transaction);
      await snapshotOverheadPolicy(transaction,id,0,actor.id,today);
      await assertEstimateTotals(transaction, id);
      updateInquiryRequest.input("estimate_id", sql.BigInt, id); updateInquiryRequest.input("actor", sql.BigInt, actor.id); updateInquiryRequest.input("inquiry_id", sql.BigInt, inquiryId);
      const changed = await updateInquiryRequest.query(`UPDATE dbo.inquiries SET estimate_id=@estimate_id,status=N'Estimating',updated_by=@actor,updated_at=SYSUTCDATETIME()
        WHERE id=@inquiry_id AND status=N'New' AND estimate_id IS NULL AND deleted_at IS NULL;`);
      if (changed.rowsAffected[0] !== 1) throw new ApiError(409, "inquiry_not_eligible", "The inquiry can no longer be converted to an estimate.");
      await insertAudit(transaction, actor.id, "Estimate", id, number, "Created from inquiry", inquiry.inquiry_no, { inquiryId, ownerId, dueDate, contingencyRate });
      return { id, number, rowVersion: row.row_version.toString("base64") };
    });
    return reply.status(201).header("Location", `/api/v1/estimates/${created.id}`).send(created);
  });

  app.get("/api/v1/estimates/:id/validation", async (request) => {
    await users.demandPermission(request, "estimate.read"); const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const exists = await database.query<{ estimate_exists: boolean }>(`SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.estimates WHERE id=@id AND deleted_at IS NULL) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END estimate_exists;`,
      (sqlRequest) => sqlRequest.input("id", sql.BigInt, id));
    if (!exists.recordset[0]?.estimate_exists) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
    const issues = await validationIssues(database, id); return { estimateId: id, valid: issues.length === 0, issues };
  });

  app.post("/api/v1/estimates/:id/submit", async (request) => transition(request, positiveLong((request.params as { id?: string }).id, "Estimate id"),
    "estimate.write", "Engineering Review", 90, "Engineering Review", 90, ["Draft", "Engineering Input", "Revision Required"], "Submitted", true, false, database, users));
  app.post("/api/v1/estimates/:id/approve", async (request) => transition(request, positiveLong((request.params as { id?: string }).id, "Estimate id"),
    "estimate.approve", "Approved", 100, "Approved", 100, ["Engineering Review"], "Approved", false, true, database, users));

  app.post("/api/v1/estimates/:id/create-revision", async (request) => {
    await users.demandPermission(request, "estimate.write"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const body = bodyObject(request.body);
    const rowVersion = parseRowVersion(body.rowVersion); const reason = optionalBodyText(body.comment, 100, "Revision reason");
    if (!reason) throw new ApiError(400, "validation_failed", "Revision reason is required.");
    return database.transaction(async (transaction) => {
      const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, id);
      const current = (await lookup.query<{ estimate_no: string; status: string; progress: number | string; revision: number; inquiry_id: number | string; row_version: Buffer; inquiry_no: string; inquiry_status: string; inquiry_progress: number | string; owner_id: number | string }>(`
        SELECT e.estimate_no,e.status,e.progress,e.revision,e.inquiry_id,e.row_version,i.inquiry_no,i.status inquiry_status,i.progress inquiry_progress,e.owner_id
        FROM dbo.estimates e WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.inquiries i WITH(UPDLOCK,HOLDLOCK) ON i.id=e.inquiry_id
        WHERE e.id=@id AND e.deleted_at IS NULL AND i.deleted_at IS NULL AND e.archived_at IS NULL AND i.archived_at IS NULL AND i.status<>N'Cancelled';
      `)).recordset[0];
      if (!current) throw new ApiError(404, "estimate_not_found", "Estimate or its linked inquiry was not found.");
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
      if (!["approved", "locked"].includes(current.status.toLowerCase())) throw new ApiError(409, "invalid_transition", `Cannot create a revision while the estimate is '${current.status}'.`);
      if (Number(current.owner_id) !== actor.id && !managerOverride(actor)) throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can create a revision.");
      await assertEstimateTotals(transaction, id);
      await ensureRevisionSnapshot(transaction, id, current.revision, reason, current.status, actor.id);
      const nextRevision = await nextEstimateRevision(transaction, id, current.revision);
      const update = new sql.Request(transaction); update.input("next_revision", sql.Int, nextRevision); update.input("actor", sql.BigInt, actor.id);
      update.input("id", sql.BigInt, id); update.input("current_revision", sql.Int, current.revision); update.input("row_version", sql.VarBinary(8), rowVersion);
      const updated = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.estimates SET revision=@next_revision,status=N'Revision Required',progress=75,
        locked_at=NULL,locked_by=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version
        WHERE id=@id AND revision=@current_revision AND row_version=@row_version;`)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
      await snapshotOverheadPolicy(transaction,id,nextRevision,actor.id,todayIn(config.businessTimeZone));
      await cloneRevisionLines(transaction, id, current.revision, nextRevision, actor.id);
      await assertEstimateTotals(transaction, id);
      const inquiryId = Number(current.inquiry_id); await updateInquiry(transaction, inquiryId, "Estimating", 75, actor.id);
      await insertAudit(transaction, actor.id, "Estimate", id, current.estimate_no, "Revision created",
        { revision: current.revision, status: current.status, progress: Number(current.progress) }, { revision: nextRevision, status: "Revision Required", progress: 75, reason });
      await insertAudit(transaction, actor.id, "Inquiry", inquiryId, current.inquiry_no, "Estimate revision created",
        { status: current.inquiry_status, progress: Number(current.inquiry_progress) }, { status: "Estimating", progress: 75, estimateRevision: nextRevision });
      return { id, revision: nextRevision, status: "Revision Required", progress: 75, rowVersion: updated.row_version.toString("base64") };
    });
  });

  app.post("/api/v1/estimates/:id/request-revision", async (request) => {
    await users.demandPermission(request, "estimate.approve"); const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id"); const body = bodyObject(request.body);
    const rowVersion = parseRowVersion(body.rowVersion); const reason = optionalBodyText(body.comment, 100, "Revision reason");
    if (!reason) throw new ApiError(400, "validation_failed", "Revision reason is required.");
    return database.transaction(async (transaction) => {
      const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, id);
      const current = (await lookup.query<{ estimate_no: string; status: string; progress: number | string; revision: number; inquiry_id: number | string; row_version: Buffer; inquiry_no: string; inquiry_status: string; inquiry_progress: number | string; owner_id: number | string }>(`
        SELECT e.estimate_no,e.status,e.progress,e.revision,e.inquiry_id,e.row_version,i.inquiry_no,i.status inquiry_status,i.progress inquiry_progress,e.owner_id
        FROM dbo.estimates e WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.inquiries i WITH(UPDLOCK,HOLDLOCK) ON i.id=e.inquiry_id
        WHERE e.id=@id AND e.deleted_at IS NULL AND i.deleted_at IS NULL AND e.archived_at IS NULL AND i.archived_at IS NULL AND i.status<>N'Cancelled';
      `)).recordset[0];
      if (!current) throw new ApiError(404, "estimate_not_found", "Estimate or its linked inquiry was not found.");
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
      if (current.status.toLowerCase() !== "engineering review") throw new ApiError(409, "invalid_transition", `Cannot request a revision while the estimate is '${current.status}'.`);
      if (Number(current.owner_id) === actor.id && !adminSelfDecision(actor)) throw new ApiError(403, "self_revision_forbidden", "The estimate owner cannot request a revision on their own estimate. Another approver must decide it.");
      await assertEstimateTotals(transaction, id);
      await snapshotRevision(transaction, id, current.revision, reason, "Revision Required", actor.id); const nextRevision = await nextEstimateRevision(transaction, id, current.revision);
      const update = new sql.Request(transaction); update.input("next_revision", sql.Int, nextRevision); update.input("actor", sql.BigInt, actor.id);
      update.input("id", sql.BigInt, id); update.input("current_revision", sql.Int, current.revision); update.input("row_version", sql.VarBinary(8), rowVersion);
      const updated = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.estimates SET revision=@next_revision,status=N'Revision Required',progress=75,
        locked_at=NULL,locked_by=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version
        WHERE id=@id AND revision=@current_revision AND row_version=@row_version;`)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This estimate was changed by another user. Reload and try again.");
      await snapshotOverheadPolicy(transaction,id,nextRevision,actor.id,todayIn(config.businessTimeZone));
      await cloneRevisionLines(transaction, id, current.revision, nextRevision, actor.id);
      await assertEstimateTotals(transaction, id);
      const inquiryId = Number(current.inquiry_id); await updateInquiry(transaction, inquiryId, "Estimating", 75, actor.id);
      await insertAudit(transaction, actor.id, "Estimate", id, current.estimate_no, "Revision requested",
        { revision: current.revision, status: current.status, progress: Number(current.progress) }, { revision: nextRevision, status: "Revision Required", progress: 75, reason });
      await insertAudit(transaction, actor.id, "Inquiry", inquiryId, current.inquiry_no, "Estimate revision requested",
        { status: current.inquiry_status, progress: Number(current.inquiry_progress) }, { status: "Estimating", progress: 75, estimateRevision: nextRevision });
      return { id, revision: nextRevision, status: "Revision Required", progress: 75, rowVersion: updated.row_version.toString("base64") };
    });
  });
}
