import { laborCategorySql } from "../estimate-labor-category.js";
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sql from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { hasRole } from "../user-roles.js";
import {
  buildErpSummary,
  parseErpCategory,
  parseErpSourceType,
  sourceNeedsId,
  type ErpHeaderRow,
  type ErpLineRow,
  type ErpSourceType,
} from "../estimate-erp.js";
import { bodyObject, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";

const EDITABLE = new Set(["Draft", "Engineering Input", "Engineering Review", "Revision Required"]);
const ERP_EXPORT_TEMPLATE_VERSION = "ERP_SUMMARY_V1";
const SOURCE_TABLES: Partial<Record<ErpSourceType, string>> = {
  CostItem: "dbo.cost_items",
  ManhourLine: "dbo.manhour_lines",
  ExpenseLine: "dbo.expense_lines",
  OtherCostLine: "dbo.other_cost_lines",
};

const ERP_SUMMARY_SQL = `
  SELECT e.id,e.revision,e.status,e.owner_id,e.row_version,t.total canonical_total,t.overhead_total,t.overhead_state,
    CONVERT(bit,CASE WHEN EXISTS(
      SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor_user AND code=N'estimate.write'
    ) THEN 1 ELSE 0 END) can_write,
    CONVERT(bit,CASE WHEN EXISTS(
      SELECT 1 FROM dbo.user_effective_permissions WHERE user_id=@actor_user AND code=N'report.read'
    ) THEN 1 ELSE 0 END) can_export
  FROM dbo.estimates e
  INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
  WHERE e.id=@estimate_id AND e.deleted_at IS NULL;

  SELECT source_type,source_id,description,internal_category,amount,erp_category,mapping_row_version,copied_from_revision,
    item,model_part_number,supplier,brand,lead_time,quote_revision,unit_price,quantity,unit,remark
  FROM (
    SELECT CAST(N'CostItem' AS nvarchar(30)) source_type,ci.id source_id,
      ci.description,CONCAT(ci.category_code,N' ',ci.category) internal_category,ci.line_total amount,
      COALESCE(m.erp_category,CASE ci.category_code WHEN '01' THEN N'Hardware' WHEN '02' THEN N'Software' ELSE N'Unmapped' END) erp_category,
      m.row_version mapping_row_version,m.copied_from_revision,ci.item_code item,ci.model model_part_number,
      s.name supplier,ci.brand,NULL lead_time,ci.reference_no quote_revision,ci.unit_cost unit_price,ci.qty quantity,ci.unit,CASE WHEN ci.is_price_set=1 THEN CONCAT(ci.remark,N' Included: ',(SELECT STRING_AGG(CONVERT(nvarchar(max),CONCAT(child.item_code,N' - ',child.description,N' x ',child.qty,N' ',child.unit)),N'; ') FROM dbo.cost_items child WHERE child.estimate_id=ci.estimate_id AND child.revision=ci.revision AND child.price_set_key=ci.price_set_key AND child.is_price_set=0 AND child.deleted_at IS NULL)) ELSE ci.remark END remark,
      1 source_order,ci.sort_order sort_order,ci.category_code group_code,ci.module group_name,ci.id line_order
    FROM dbo.cost_items ci
    INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=ci.estimate_id AND m.revision=ci.revision
      AND m.source_type=N'CostItem' AND m.source_id=ci.id
    LEFT JOIN dbo.suppliers s ON s.id=ci.supplier_id
    WHERE ci.estimate_id=@estimate_id AND ci.deleted_at IS NULL AND (ci.price_set_key IS NULL OR ci.is_price_set=1)
    UNION ALL
    SELECT N'ManhourLine',l.id,l.activity,CONCAT(l.cost_type,N' / ',l.provider),l.line_cost,
      COALESCE(CASE WHEN e.status NOT IN(N'Approved',N'Locked') THEN ${laborCategorySql('l')} END,m.erp_category,CASE WHEN l.cost_type=N'Installation' THEN N'Installation' ELSE N'Unmapped' END),
      m.row_version,m.copied_from_revision,l.activity,l.level,COALESCE(s.name,l.provider),l.department,NULL,l.quotation_no,
      l.daily_rate,l.engineers*l.man_days,N'man-day',l.remark,2,l.sort_order,N'',l.package,l.id
    FROM dbo.manhour_lines l
    INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=l.estimate_id AND m.revision=l.revision
      AND m.source_type=N'ManhourLine' AND m.source_id=l.id
    LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id
    WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
    UNION ALL
    SELECT N'ExpenseLine',l.id,l.description,CONCAT(l.expense_type,N' / ',l.cost_type),l.line_total,
      COALESCE(m.erp_category,N'Unmapped'),m.row_version,m.copied_from_revision,l.expense_type,NULL,s.name,NULL,NULL,l.reference_no,
      l.unit_cost,l.qty,l.unit,l.remark,3,l.sort_order,N'',l.package,l.id
    FROM dbo.expense_lines l
    INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=l.estimate_id AND m.revision=l.revision
      AND m.source_type=N'ExpenseLine' AND m.source_id=l.id
    LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id
    WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
    UNION ALL
    SELECT N'OtherCostLine',l.id,l.description,l.category,l.line_total,
      COALESCE(m.erp_category,N'Unmapped'),m.row_version,m.copied_from_revision,l.category,NULL,NULL,NULL,NULL,NULL,
      l.unit_cost,l.qty,l.unit,l.remark,4,l.sort_order,N'',l.category,l.id
    FROM dbo.other_cost_lines l
    INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=l.estimate_id AND m.revision=l.revision
      AND m.source_type=N'OtherCostLine' AND m.source_id=l.id
    WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
    UNION ALL
    SELECT N'Contingency',NULL,N'Contingency',N'Contingency',t.contingency_total,
      COALESCE(m.erp_category,N'Unmapped'),m.row_version,m.copied_from_revision,N'Contingency',NULL,NULL,NULL,NULL,NULL,
      t.contingency_total,1,N'lot',NULL,5,2147483647,N'',N'',0
    FROM dbo.estimates e INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=e.id AND m.revision=e.revision
      AND m.source_type=N'Contingency' AND m.source_id IS NULL
    WHERE e.id=@estimate_id AND e.deleted_at IS NULL
  ) lines
  ORDER BY source_order,group_code,MIN(sort_order) OVER(PARTITION BY source_order,group_code,group_name),group_name,sort_order,line_order;`;

type SummaryHeader = ErpHeaderRow & { can_write: boolean; can_export: boolean };

async function loadSummary(database: Database, estimateId: number, actor: CurrentUser) {
  const result = await database.query<SummaryHeader>(ERP_SUMMARY_SQL, (request) => {
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("actor_user", sql.BigInt, actor.id);
  });
  const recordsets = result.recordsets as unknown as [SummaryHeader[], ErpLineRow[]];
  const header = recordsets[0]?.[0];
  if (!header) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
  const elevated = actor.id === Number(header.owner_id) || hasRole(actor, "Engineering Manager", "Admin");
  const canEdit = Boolean(header.can_write) && elevated && EDITABLE.has(header.status);
  const summary = buildErpSummary(header, recordsets[1] ?? [], canEdit);
  summary.capabilities.canExport = summary.capabilities.canExport && Boolean(header.can_export);
  return summary;
}

type MappingInput = {
  sourceType: ErpSourceType;
  sourceId: number | null;
  erpCategory: ReturnType<typeof parseErpCategory>;
  mappingRowVersion: Buffer | null;
};

function parseMappings(value: unknown): MappingInput[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) {
    throw new ApiError(400, "validation_failed", "Mappings must contain between 1 and 500 entries.");
  }
  const seen = new Set<string>();
  return value.map((candidate) => {
    const body = bodyObject(candidate);
    const sourceType = parseErpSourceType(body.sourceType);
    const sourceId = sourceNeedsId(sourceType) ? requiredInteger(body.sourceId, "Source id", 1) : null;
    if (!sourceNeedsId(sourceType) && body.sourceId !== null && body.sourceId !== undefined) {
      throw new ApiError(400, "validation_failed", `${sourceType} must not have a source id.`);
    }
    const key = `${sourceType}:${sourceId ?? "allocation"}`;
    if (seen.has(key)) throw new ApiError(400, "validation_failed", `Duplicate ERP mapping source '${key}'.`);
    seen.add(key);
    return {
      sourceType,
      sourceId,
      erpCategory: parseErpCategory(body.erpCategory),
      mappingRowVersion: body.mappingRowVersion === null || body.mappingRowVersion === undefined
        ? null
        : parseRowVersion(body.mappingRowVersion),
    };
  });
}

function parseExportEvent(value: unknown) {
  const body = bodyObject(value);
  const templateVersion = requiredText(body.templateVersion, 50, "Template version");
  if (templateVersion !== ERP_EXPORT_TEMPLATE_VERSION) throw new ApiError(400, "validation_failed", "ERP export template version is invalid.");
  const claimedSha256 = requiredText(body.sha256, 64, "Workbook checksum").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(claimedSha256)) throw new ApiError(400, "validation_failed", "Workbook checksum must be SHA-256.");
  const filename = requiredText(body.filename, 200, "Workbook filename");
  if (!/^[^\\/:*?"<>|]+\.xlsx$/i.test(filename)) throw new ApiError(400, "validation_failed", "Workbook filename is invalid.");
  const fileBase64 = requiredText(body.fileBase64, 900_000, "Workbook bytes");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64)) throw new ApiError(400, "validation_failed", "Workbook bytes must be base64.");
  const workbookBytes = Buffer.from(fileBase64, "base64");
  if (workbookBytes.length < 100 || workbookBytes.length > 650_000 || workbookBytes[0] !== 0x50 || workbookBytes[1] !== 0x4b) {
    throw new ApiError(400, "validation_failed", "Workbook bytes must contain a bounded XLSX package.");
  }
  const sha256 = createHash("sha256").update(workbookBytes).digest("hex");
  if (sha256 !== claimedSha256) throw new ApiError(400, "validation_failed", "Workbook checksum does not match the uploaded bytes.");
  return { estimateRowVersion: parseRowVersion(body.estimateRowVersion), templateVersion, sha256, filename };
}

export function registerEstimateErpRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/estimates/:id/erp-summary", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    return loadSummary(database, id, actor);
  });

  app.put("/api/v1/estimates/:id/erp-mappings", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const estimateVersion = parseRowVersion(body.estimateRowVersion);
    const mappings = parseMappings(body.mappings);

    await database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("estimate_id", sql.BigInt, id);
      const estimate = (await lock.query<{ estimate_no: string; revision: number; status: string; owner_id: number | string; row_version: Buffer }>(`
        SELECT estimate_no,revision,status,owner_id,row_version FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@estimate_id AND deleted_at IS NULL;
      `)).recordset[0];
      if (!estimate) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
      if (!estimate.row_version.equals(estimateVersion)) throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and try again.");
      if (!EDITABLE.has(estimate.status)) throw new ApiError(409, "estimate_locked", `ERP mappings cannot be changed while the estimate is '${estimate.status}'.`);
      if (actor.id !== Number(estimate.owner_id) && !hasRole(actor, "Engineering Manager", "Admin")) {
        throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can update ERP mappings.");
      }

      for (const mapping of mappings) {
        if (mapping.sourceType === "ManhourLine") {
          const rule = new sql.Request(transaction);
          rule.input("id", sql.BigInt, id); rule.input("revision", sql.Int, estimate.revision);
          rule.input("line", sql.BigInt, mapping.sourceId);
          const automatic = (await rule.query<{ category: string | null }>(`SELECT ${laborCategorySql('l')} category
            FROM dbo.manhour_lines l WITH(UPDLOCK,HOLDLOCK) WHERE l.id=@line AND l.estimate_id=@id
              AND l.revision=@revision AND l.deleted_at IS NULL;`)).recordset[0]?.category;
          if (automatic && automatic !== mapping.erpCategory) throw new ApiError(400, "automatic_erp_category", "This labor category follows cost type, provider and discipline. Update the source labor instead.");
        }
        const sourceTable = SOURCE_TABLES[mapping.sourceType];
        if (sourceTable) {
          const source = new sql.Request(transaction);
          source.input("estimate_id", sql.BigInt, id);
          source.input("revision", sql.Int, estimate.revision);
          source.input("source_id", sql.BigInt, mapping.sourceId);
          const exists = (await source.query<{ found: boolean }>(`
            SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM ${sourceTable} WITH(UPDLOCK,HOLDLOCK)
              WHERE id=@source_id AND estimate_id=@estimate_id AND revision=@revision AND deleted_at IS NULL)
              THEN 1 ELSE 0 END) found;
          `)).recordset[0]?.found;
          if (!exists) throw new ApiError(404, "estimate_erp_source_not_found", "ERP mapping source was not found in the current Estimate revision.");
        }
        const mutation = new sql.Request(transaction);
        mutation.input("estimate_id", sql.BigInt, id);
        mutation.input("revision", sql.Int, estimate.revision);
        mutation.input("source_type", sql.NVarChar(30), mapping.sourceType);
        mutation.input("source_id", sql.BigInt, mapping.sourceId);
        mutation.input("erp_category", sql.NVarChar(30), mapping.erpCategory);
        mutation.input("actor", sql.BigInt, actor.id);
        mutation.input("mapping_version", sql.VarBinary(8), mapping.mappingRowVersion);
        // dbo.estimate_erp_mappings has an AFTER trigger, so OUTPUT must target a table variable (SQL error 334 otherwise).
        const row = (await mutation.query<{ id: number | string }>(mapping.mappingRowVersion ? `
          DECLARE @changed TABLE(id bigint);
          UPDATE dbo.estimate_erp_mappings SET erp_category=@erp_category,updated_by=@actor,updated_at=SYSUTCDATETIME()
          OUTPUT inserted.id INTO @changed(id) WHERE estimate_id=@estimate_id AND revision=@revision AND source_type=@source_type
            AND ((source_id=@source_id) OR (source_id IS NULL AND @source_id IS NULL)) AND row_version=@mapping_version;
          SELECT id FROM @changed;
        ` : `
          DECLARE @changed TABLE(id bigint);
          INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,created_by,updated_by)
          OUTPUT inserted.id INTO @changed(id)
          SELECT @estimate_id,@revision,@source_type,@source_id,@erp_category,@actor,@actor
          WHERE NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings WITH(UPDLOCK,HOLDLOCK)
            WHERE estimate_id=@estimate_id AND revision=@revision AND source_type=@source_type
              AND ((source_id=@source_id) OR (source_id IS NULL AND @source_id IS NULL)));
          SELECT id FROM @changed;
        `)).recordset[0];
        if (!row) throw new ApiError(409, "concurrency_conflict", "An ERP mapping changed. Reload and try again.");
      }

      const touch = new sql.Request(transaction);
      touch.input("estimate_id", sql.BigInt, id);
      touch.input("actor", sql.BigInt, actor.id);
      await touch.query(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@estimate_id;`);
      await insertAudit(transaction, actor.id, "EstimateErpMapping", id, estimate.estimate_no, "ERP mappings updated", null, {
        revision: estimate.revision,
        mappings: mappings.map((mapping) => ({ sourceType: mapping.sourceType, sourceId: mapping.sourceId, erpCategory: mapping.erpCategory })),
      });
    });

    const erpSummary = await loadSummary(database, id, actor);
    return { estimateRowVersion: erpSummary.estimateRowVersion, erpSummary };
  });

  app.post("/api/v1/estimates/:id/erp-export-events", async (request) => {
    await users.demandPermission(request, "estimate.read");
    await users.demandPermission(request, "report.read");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const event = parseExportEvent(request.body);
    const summary = await loadSummary(database, id, actor);
    if (!summary.capabilities.canExport) throw new ApiError(409, "estimate_erp_export_blocked", "Approve the estimate and resolve ERP mapping, overhead and reconciliation issues before export.");
    if (summary.estimateRowVersion !== event.estimateRowVersion.toString("base64")) {
      throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and export again.");
    }
    await database.transaction(async (transaction) => {
      const lock = new sql.Request(transaction);
      lock.input("estimate_id", sql.BigInt, id);
      lock.input("row_version", sql.VarBinary(8), event.estimateRowVersion);
      const estimate = (await lock.query<{ estimate_no: string; revision: number }>(`
        SELECT estimate_no,revision FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@estimate_id AND row_version=@row_version AND deleted_at IS NULL;
      `)).recordset[0];
      if (!estimate || estimate.revision !== summary.revision) throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and export again.");
      const mappingDigest = createHash("sha256").update(JSON.stringify(summary.lines.map((line) => ({
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        erpCategory: line.erpCategory,
        amount: line.amount,
      })))).digest("hex");
      await insertAudit(transaction, actor.id, "EstimateErpExport", id, estimate.estimate_no, "ERP Summary exported", null, {
        revision: estimate.revision,
        estimateRowVersion: summary.estimateRowVersion,
        templateVersion: event.templateVersion,
        filename: event.filename,
        sha256: event.sha256,
        mappingDigest,
        classifiedTotal: summary.classifiedTotal,
        unmappedAmount: summary.unmapped.amount,
        unmappedLineCount: summary.unmapped.lineCount,
        overhead: summary.overhead,
        canonicalTotal: summary.canonicalTotal,
        difference: summary.difference,
        reconciled: summary.reconciled,
      });
    });
    return { recorded: true as const };
  });
}

export { parseExportEvent, parseMappings };
