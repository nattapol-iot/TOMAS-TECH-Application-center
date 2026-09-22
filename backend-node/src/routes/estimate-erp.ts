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

  SELECT source_type,source_id,description,internal_category,amount,erp_category,mapping_row_version,copied_from_revision,manual_override,
    item,model_part_number,supplier,brand,lead_time,quote_revision,unit_price,quantity,unit,remark
  FROM (
    SELECT CAST(N'CostItem' AS nvarchar(30)) source_type,ci.id source_id,
      ci.description,CONCAT(ci.category_code,N' ',ci.category) internal_category,amounts.amount amount,
      COALESCE(m.erp_category,CASE ci.category_code WHEN '01' THEN N'Hardware' WHEN '02' THEN N'Software' ELSE N'Unmapped' END) erp_category,
      m.row_version mapping_row_version,m.copied_from_revision,CONVERT(bit,COALESCE(m.manual_override,0)) manual_override,ci.item_code item,ci.model model_part_number,
      s.name supplier,ci.brand,NULL lead_time,ci.reference_no quote_revision,ci.unit_cost unit_price,ci.qty quantity,ci.unit,CASE WHEN ci.is_price_set=1 THEN CONCAT(ci.remark,N' Included: ',(SELECT STRING_AGG(CONVERT(nvarchar(max),CONCAT(child.item_code,N' - ',child.description,N' x ',child.qty,N' ',child.unit)),N'; ') FROM dbo.cost_items child WHERE child.estimate_id=ci.estimate_id AND child.revision=ci.revision AND child.price_set_key=ci.price_set_key AND child.is_price_set=0 AND child.deleted_at IS NULL)) ELSE ci.remark END remark,
      1 source_order,ci.sort_order sort_order,ci.category_code group_code,ci.module group_name,ci.id line_order
    FROM dbo.cost_items ci
    INNER JOIN dbo.v_estimate_cost_amounts amounts ON amounts.id=ci.id
    INNER JOIN dbo.estimates e ON e.id=ci.estimate_id AND e.revision=ci.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=ci.estimate_id AND m.revision=ci.revision
      AND m.source_type=N'CostItem' AND m.source_id=ci.id
    LEFT JOIN dbo.suppliers s ON s.id=ci.supplier_id
    WHERE ci.estimate_id=@estimate_id AND ci.deleted_at IS NULL AND (ci.price_set_key IS NULL OR ci.is_price_set=1)
    UNION ALL
    SELECT N'ManhourLine',l.id,l.activity,CONCAT(l.cost_type,N' / ',l.provider),l.line_cost,
      COALESCE(CASE WHEN e.status NOT IN(N'Approved',N'Locked') AND COALESCE(m.manual_override,0)=0 THEN ${laborCategorySql('l')} END,m.erp_category,CASE WHEN l.cost_type=N'Installation' THEN N'Installation' ELSE N'Unmapped' END),
      m.row_version,m.copied_from_revision,CONVERT(bit,COALESCE(m.manual_override,0)),l.activity,l.level,COALESCE(s.name,l.provider),l.department,NULL,l.quotation_no,
      l.daily_rate,l.engineers*l.man_days,N'man-day',l.remark,2,l.sort_order,N'',l.package,l.id
    FROM dbo.manhour_lines l
    INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=l.estimate_id AND m.revision=l.revision
      AND m.source_type=N'ManhourLine' AND m.source_id=l.id
    LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id
    WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
    UNION ALL
    SELECT N'ExpenseLine',l.id,l.description,CONCAT(l.expense_type,N' / ',l.cost_type),l.line_total,
      COALESCE(m.erp_category,N'Unmapped'),m.row_version,m.copied_from_revision,CONVERT(bit,COALESCE(m.manual_override,0)),l.expense_type,NULL,s.name,NULL,NULL,l.reference_no,
      l.unit_cost,l.qty,l.unit,l.remark,3,l.sort_order,N'',l.package,l.id
    FROM dbo.expense_lines l
    INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=l.estimate_id AND m.revision=l.revision
      AND m.source_type=N'ExpenseLine' AND m.source_id=l.id
    LEFT JOIN dbo.suppliers s ON s.id=l.supplier_id
    WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
    UNION ALL
    SELECT N'OtherCostLine',l.id,l.description,l.category,l.line_total,
      COALESCE(m.erp_category,N'Unmapped'),m.row_version,m.copied_from_revision,CONVERT(bit,COALESCE(m.manual_override,0)),l.category,NULL,NULL,NULL,NULL,NULL,
      l.unit_cost,l.qty,l.unit,l.remark,4,l.sort_order,N'',l.category,l.id
    FROM dbo.other_cost_lines l
    INNER JOIN dbo.estimates e ON e.id=l.estimate_id AND e.revision=l.revision
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=l.estimate_id AND m.revision=l.revision
      AND m.source_type=N'OtherCostLine' AND m.source_id=l.id
    WHERE l.estimate_id=@estimate_id AND l.deleted_at IS NULL
    UNION ALL
    SELECT N'Contingency',NULL,N'Contingency',N'Contingency',t.contingency_total,
      COALESCE(m.erp_category,N'Unmapped'),m.row_version,m.copied_from_revision,CONVERT(bit,COALESCE(m.manual_override,0)),N'Contingency',NULL,NULL,NULL,NULL,NULL,
      t.contingency_total,1,N'lot',NULL,5,2147483647,N'',N'',0
    FROM dbo.estimates e INNER JOIN dbo.v_estimate_totals t ON t.estimate_id=e.id
    LEFT JOIN dbo.estimate_erp_mappings m ON m.estimate_id=e.id AND m.revision=e.revision
      AND m.source_type=N'Contingency' AND m.source_id IS NULL
    WHERE e.id=@estimate_id AND e.deleted_at IS NULL
  ) lines
  ORDER BY source_order,group_code,MIN(sort_order) OVER(PARTITION BY source_order,group_code,group_name),group_name,sort_order,line_order;

  SELECT g.id,g.title,g.quantity,g.unit,g.members,g.row_version
  FROM dbo.estimate_erp_groups g
  INNER JOIN dbo.estimates e ON e.id=g.estimate_id AND e.revision=g.revision
  WHERE g.estimate_id=@estimate_id AND e.deleted_at IS NULL
  ORDER BY g.id;`;

type ErpGroupRow = { id: number | string; title: string; quantity: number | string; unit: string; members: string; row_version: Buffer };
type ErpGroupMember = { sourceType: ErpSourceType; sourceId: number };

type SummaryHeader = ErpHeaderRow & { can_write: boolean; can_export: boolean };

async function loadSummary(database: Database, estimateId: number, actor: CurrentUser) {
  const result = await database.query<SummaryHeader>(ERP_SUMMARY_SQL, (request) => {
    request.input("estimate_id", sql.BigInt, estimateId);
    request.input("actor_user", sql.BigInt, actor.id);
  });
  const recordsets = result.recordsets as unknown as [SummaryHeader[], ErpLineRow[], ErpGroupRow[]];
  const header = recordsets[0]?.[0];
  if (!header) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
  const elevated = actor.id === Number(header.owner_id) || hasRole(actor, "Engineering Manager", "Admin");
  const canEdit = Boolean(header.can_write) && elevated && EDITABLE.has(header.status);
  const summary = buildErpSummary(header, recordsets[1] ?? [], canEdit);
  summary.capabilities.canExport = summary.capabilities.canExport && Boolean(header.can_export);
  const groups = (recordsets[2] ?? []).map((row) => ({
    id: Number(row.id), title: row.title, quantity: Number(row.quantity), unit: row.unit,
    members: JSON.parse(row.members) as ErpGroupMember[],
    rowVersion: row.row_version.toString("base64"),
  }));
  return { ...summary, groups };
}

/** One lock and one permission rule for every ERP write. */
async function lockEstimateForErp(transaction: sql.Transaction, id: number, version: Buffer, actor: CurrentUser) {
  const lock = new sql.Request(transaction);
  lock.input("estimate_id", sql.BigInt, id);
  const estimate = (await lock.query<{ estimate_no: string; revision: number; status: string; owner_id: number | string; row_version: Buffer }>(`
    SELECT estimate_no,revision,status,owner_id,row_version FROM dbo.estimates WITH(UPDLOCK,HOLDLOCK)
    WHERE id=@estimate_id AND deleted_at IS NULL;
  `)).recordset[0];
  if (!estimate) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
  if (!estimate.row_version.equals(version)) throw new ApiError(409, "concurrency_conflict", "This estimate changed. Reload and try again.");
  if (!EDITABLE.has(estimate.status)) throw new ApiError(409, "estimate_locked", `ERP mappings cannot be changed while the estimate is '${estimate.status}'.`);
  if (actor.id !== Number(estimate.owner_id) && !hasRole(actor, "Engineering Manager", "Admin")) {
    throw new ApiError(403, "estimate_owner_required", "Only the estimate owner, an engineering manager or an administrator can update ERP mappings.");
  }
  return estimate;
}

function parseGroupMembers(value: unknown): ErpGroupMember[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 200) {
    throw new ApiError(400, "validation_failed", "A merged line needs between 2 and 200 cost lines.");
  }
  const seen = new Set<string>();
  return value.map((candidate) => {
    const body = bodyObject(candidate);
    const sourceType = parseErpSourceType(body.sourceType);
    // Contingency is a computed figure with no line of its own, so it cannot be merged.
    if (!sourceNeedsId(sourceType)) throw new ApiError(400, "validation_failed", `${sourceType} cannot be part of a merged line.`);
    const sourceId = requiredInteger(body.sourceId, "Source id", 1);
    const key = `${sourceType}:${sourceId}`;
    if (seen.has(key)) throw new ApiError(400, "validation_failed", `Duplicate line '${key}' in the merged line.`);
    seen.add(key);
    return { sourceType, sourceId };
  });
}

function parseGroupShape(body: Record<string, unknown>) {
  const title = requiredText(body.title, 200, "Merged line name");
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000 || Math.abs(quantity * 10000 - Math.round(quantity * 10000)) > 0.00001) {
    throw new ApiError(400, "validation_failed", "Merged line quantity must be positive with at most four decimal places.");
  }
  const unit = body.unit === undefined ? "Lot" : requiredText(body.unit, 30, "Merged line unit");
  return { title, quantity, unit };
}

/** Every member must still exist in this revision and belong to no other merged line. */
async function assertGroupMembers(transaction: sql.Transaction, id: number, revision: number, members: ErpGroupMember[]) {
  const existing = new sql.Request(transaction);
  existing.input("estimate_id", sql.BigInt, id); existing.input("revision", sql.Int, revision);
  const rows = (await existing.query<{ id: number | string; members: string }>(`SELECT id,members FROM dbo.estimate_erp_groups WITH(UPDLOCK,HOLDLOCK)
    WHERE estimate_id=@estimate_id AND revision=@revision;`)).recordset;
  const taken = new Set(rows.flatMap((row) => (JSON.parse(row.members) as ErpGroupMember[]).map((member) => `${member.sourceType}:${member.sourceId}`)));
  for (const member of members) {
    if (taken.has(`${member.sourceType}:${member.sourceId}`)) {
      throw new ApiError(409, "erp_group_member_taken", "One of these lines is already part of another merged line.");
    }
    const source = new sql.Request(transaction);
    source.input("estimate_id", sql.BigInt, id); source.input("revision", sql.Int, revision);
    source.input("source_id", sql.BigInt, member.sourceId);
    const found = (await source.query<{ found: boolean }>(`
      SELECT CONVERT(bit,CASE WHEN EXISTS(SELECT 1 FROM ${SOURCE_TABLES[member.sourceType]} WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@source_id AND estimate_id=@estimate_id AND revision=@revision AND deleted_at IS NULL)
        THEN 1 ELSE 0 END) found;
    `)).recordset[0]?.found;
    if (!found) throw new ApiError(404, "estimate_erp_source_not_found", "A line of this merged line was not found in the current Estimate revision.");
  }
}

async function touchEstimateForErp(transaction: sql.Transaction, id: number, actorId: number) {
  const touch = new sql.Request(transaction);
  touch.input("estimate_id", sql.BigInt, id);
  touch.input("actor", sql.BigInt, actorId);
  await touch.query(`UPDATE dbo.estimates SET updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@estimate_id;`);
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
      const estimate = await lockEstimateForErp(transaction, id, estimateVersion, actor);

      const overrides = new Set<MappingInput>();
      for (const mapping of mappings) {
        /* Labour keeps following its cost type, provider and discipline unless a
           person picks something else here. That choice is recorded so the next
           read stops deriving the category over it; picking the derived value
           again hands the line back to the rule. */
        let manualOverride = false;
        if (mapping.sourceType === "ManhourLine") {
          const rule = new sql.Request(transaction);
          rule.input("id", sql.BigInt, id); rule.input("revision", sql.Int, estimate.revision);
          rule.input("line", sql.BigInt, mapping.sourceId);
          const automatic = (await rule.query<{ category: string | null }>(`SELECT ${laborCategorySql('l')} category
            FROM dbo.manhour_lines l WITH(UPDLOCK,HOLDLOCK) WHERE l.id=@line AND l.estimate_id=@id
              AND l.revision=@revision AND l.deleted_at IS NULL;`)).recordset[0]?.category;
          manualOverride = Boolean(automatic) && automatic !== mapping.erpCategory;
          if (manualOverride) overrides.add(mapping);
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
        mutation.input("manual_override", sql.Bit, manualOverride);
        // dbo.estimate_erp_mappings has an AFTER trigger, so OUTPUT must target a table variable (SQL error 334 otherwise).
        const row = (await mutation.query<{ id: number | string }>(mapping.mappingRowVersion ? `
          DECLARE @changed TABLE(id bigint);
          UPDATE dbo.estimate_erp_mappings SET erp_category=@erp_category,manual_override=@manual_override,updated_by=@actor,updated_at=SYSUTCDATETIME()
          OUTPUT inserted.id INTO @changed(id) WHERE estimate_id=@estimate_id AND revision=@revision AND source_type=@source_type
            AND ((source_id=@source_id) OR (source_id IS NULL AND @source_id IS NULL)) AND row_version=@mapping_version;
          SELECT id FROM @changed;
        ` : `
          DECLARE @changed TABLE(id bigint);
          INSERT dbo.estimate_erp_mappings(estimate_id,revision,source_type,source_id,erp_category,manual_override,created_by,updated_by)
          OUTPUT inserted.id INTO @changed(id)
          SELECT @estimate_id,@revision,@source_type,@source_id,@erp_category,@manual_override,@actor,@actor
          WHERE NOT EXISTS(SELECT 1 FROM dbo.estimate_erp_mappings WITH(UPDLOCK,HOLDLOCK)
            WHERE estimate_id=@estimate_id AND revision=@revision AND source_type=@source_type
              AND ((source_id=@source_id) OR (source_id IS NULL AND @source_id IS NULL)));
          SELECT id FROM @changed;
        `)).recordset[0];
        if (!row) throw new ApiError(409, "concurrency_conflict", "An ERP mapping changed. Reload and try again.");
      }

      await touchEstimateForErp(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "EstimateErpMapping", id, estimate.estimate_no, "ERP mappings updated", null, {
        revision: estimate.revision,
        mappings: mappings.map((mapping) => ({ sourceType: mapping.sourceType, sourceId: mapping.sourceId, erpCategory: mapping.erpCategory, manualOverride: overrides.has(mapping) })),
      });
    });

    const erpSummary = await loadSummary(database, id, actor);
    return { estimateRowVersion: erpSummary.estimateRowVersion, erpSummary };
  });

  /*
   * Merged lines. A group decides how cost lines are written on the ERP sheet and
   * nothing else: no amount, category, module or line is changed by creating one,
   * so the estimate reconciles exactly as it did before and the Cost Items tab
   * still shows every item.
   */
  app.post("/api/v1/estimates/:id/erp-groups", async (request, reply) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const estimateVersion = parseRowVersion(body.estimateRowVersion);
    const { title, quantity, unit } = parseGroupShape(body);
    const members = parseGroupMembers(body.members);
    await database.transaction(async (transaction) => {
      const estimate = await lockEstimateForErp(transaction, id, estimateVersion, actor);
      await assertGroupMembers(transaction, id, estimate.revision, members);
      const insert = new sql.Request(transaction);
      insert.input("estimate_id", sql.BigInt, id); insert.input("revision", sql.Int, estimate.revision);
      insert.input("title", sql.NVarChar(200), title); insert.input("quantity", sql.Decimal(19, 4), quantity);
      insert.input("unit", sql.NVarChar(30), unit); insert.input("members", sql.NVarChar(sql.MAX), JSON.stringify(members));
      insert.input("actor", sql.BigInt, actor.id);
      await insert.query(`INSERT dbo.estimate_erp_groups(estimate_id,revision,title,quantity,unit,members,created_by,updated_by)
        VALUES(@estimate_id,@revision,@title,@quantity,@unit,@members,@actor,@actor);`);
      await touchEstimateForErp(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "EstimateErpMapping", id, estimate.estimate_no, "ERP lines merged", null,
        { revision: estimate.revision, title, quantity, unit, members });
    });
    reply.code(201);
    const erpSummary = await loadSummary(database, id, actor);
    return { estimateRowVersion: erpSummary.estimateRowVersion, erpSummary };
  });

  app.put("/api/v1/estimates/:id/erp-groups/:groupId", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const groupId = positiveLong((request.params as { groupId?: string }).groupId, "Merged line id");
    const body = bodyObject(request.body);
    const estimateVersion = parseRowVersion(body.estimateRowVersion);
    const groupVersion = parseRowVersion(body.groupRowVersion);
    const { title, quantity, unit } = parseGroupShape(body);
    await database.transaction(async (transaction) => {
      const estimate = await lockEstimateForErp(transaction, id, estimateVersion, actor);
      const update = new sql.Request(transaction);
      update.input("estimate_id", sql.BigInt, id); update.input("revision", sql.Int, estimate.revision);
      update.input("group_id", sql.BigInt, groupId); update.input("group_version", sql.VarBinary(8), groupVersion);
      update.input("title", sql.NVarChar(200), title); update.input("quantity", sql.Decimal(19, 4), quantity);
      update.input("unit", sql.NVarChar(30), unit); update.input("actor", sql.BigInt, actor.id);
      const changed = (await update.query<{ id: number | string }>(`DECLARE @changed TABLE(id bigint);
        UPDATE dbo.estimate_erp_groups SET title=@title,quantity=@quantity,unit=@unit,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.id INTO @changed(id)
        WHERE id=@group_id AND estimate_id=@estimate_id AND revision=@revision AND row_version=@group_version;
        SELECT id FROM @changed;`)).recordset[0];
      if (!changed) throw new ApiError(409, "concurrency_conflict", "This merged line changed. Reload and try again.");
      await touchEstimateForErp(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "EstimateErpMapping", id, estimate.estimate_no, "Merged ERP line updated", null,
        { revision: estimate.revision, groupId, title, quantity, unit });
    });
    const erpSummary = await loadSummary(database, id, actor);
    return { estimateRowVersion: erpSummary.estimateRowVersion, erpSummary };
  });

  app.delete("/api/v1/estimates/:id/erp-groups/:groupId", async (request) => {
    await users.demandPermission(request, "estimate.write");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const groupId = positiveLong((request.params as { groupId?: string }).groupId, "Merged line id");
    const body = bodyObject(request.body);
    const estimateVersion = parseRowVersion(body.estimateRowVersion);
    await database.transaction(async (transaction) => {
      const estimate = await lockEstimateForErp(transaction, id, estimateVersion, actor);
      const remove = new sql.Request(transaction);
      remove.input("estimate_id", sql.BigInt, id); remove.input("revision", sql.Int, estimate.revision);
      remove.input("group_id", sql.BigInt, groupId);
      const removed = (await remove.query<{ title: string; members: string }>(`DECLARE @removed TABLE(title nvarchar(200),members nvarchar(max));
        DELETE FROM dbo.estimate_erp_groups OUTPUT deleted.title,deleted.members INTO @removed(title,members)
        WHERE id=@group_id AND estimate_id=@estimate_id AND revision=@revision;
        SELECT title,members FROM @removed;`)).recordset[0];
      if (!removed) throw new ApiError(404, "erp_group_not_found", "That merged line no longer exists.");
      await touchEstimateForErp(transaction, id, actor.id);
      await insertAudit(transaction, actor.id, "EstimateErpMapping", id, estimate.estimate_no, "Merged ERP line split",
        { revision: estimate.revision, groupId, title: removed.title, members: JSON.parse(removed.members) as ErpGroupMember[] }, null);
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
