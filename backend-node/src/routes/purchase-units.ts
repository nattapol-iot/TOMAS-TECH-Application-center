import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, oneOf, optionalBodyText, parseRowVersion, positiveLong, requiredText } from "../http.js";
import { insertMaterialAudit } from "../material-audit.js";
import { NO_MODULE, PURCHASE_DISCIPLINES, REQUESTING_PR_STATUSES, unitLabel } from "../procurement-rules.js";
import { demandProjectScope } from "../project-scope.js";
import type { CurrentUserService } from "../users.js";

/**
 * A project's purchase Units (migration 113). A Unit sits under a Module of the estimate and takes a share of that Module's
 * budget: a drawing number and a name, or the Module's one "general" Unit for what belongs to no drawing. Requests are raised
 * for a Unit, so a project shows what each Unit and each discipline has asked for against what it was given.
 */
type UnitInput = { module: string; discipline: string; drawingNo: string; unitName: string; isGeneral: boolean; budget: number };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
function budgetOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000_000_000) throw new ApiError(400, "validation_failed", "Budget must be zero or more.");
  return round2(value);
}
function unitInput(body: Record<string, unknown>): UnitInput {
  const isGeneral = body.isGeneral === true;
  const drawingNo = isGeneral ? "" : requiredText(body.drawingNo, 100, "Drawing No.");
  return { module: requiredText(body.module, 200, "Module"), discipline: oneOf(requiredText(body.discipline, 10, "Discipline"), "Discipline", PURCHASE_DISCIPLINES),
    drawingNo, unitName: optionalBodyText(body.unitName, 200, "Unit name") ?? (isGeneral ? "General / Common" : requiredText(body.unitName, 200, "Unit name")), isGeneral, budget: budgetOf(body.budget) };
}

/** The modules of the project's current BOM with their budgets: the BOM's own lines at the estimate's cost, as everywhere else. */
async function moduleBudgetsOf(transaction: TransactionType, projectId: number): Promise<Map<string, number>> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId); request.input("none", sql.NVarChar(200), NO_MODULE);
  const rows = (await request.query<{ module: string; budget: number | string }>(`SELECT COALESCE(NULLIF(LTRIM(RTRIM(ci.module)),N''),@none) module,SUM(bl.qty_required*bl.est_unit_cost) budget
    FROM dbo.bom_lines bl LEFT JOIN dbo.cost_items ci ON ci.id=bl.estimate_line_id
    WHERE bl.deleted_at IS NULL AND bl.section_code<>N'SVC' AND bl.bom_id=(SELECT TOP(1) b.id FROM dbo.boms b WHERE b.project_id=@project AND b.deleted_at IS NULL AND b.status<>N'Superseded' ORDER BY b.id DESC)
    GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(ci.module)),N''),@none);`)).recordset;
  return new Map(rows.map((row) => [row.module, Number(row.budget)]));
}

/** A Unit names a Module of the project's BOM, and the Units of a Module together stay within its budget. */
async function assertFits(transaction: TransactionType, projectId: number, input: UnitInput, exceptId: number | null): Promise<void> {
  const modules = await moduleBudgetsOf(transaction, projectId);
  const budget = [...modules].find(([name]) => name.toLowerCase() === input.module.toLowerCase());
  if (!budget) throw new ApiError(422, "unit_module_unknown", `'${input.module}' is not a module of this project's BOM. Generate the BOM first, or choose one of: ${[...modules.keys()].join(", ") || "(no BOM yet)"}.`);
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId); request.input("module", sql.NVarChar(200), budget[0]); request.input("except", sql.BigInt, exceptId);
  const given = Number((await request.query<{ given: number | string }>(`SELECT COALESCE(SUM(budget),0) given FROM dbo.project_purchase_units WITH (UPDLOCK,HOLDLOCK)
    WHERE project_id=@project AND module=@module AND deleted_at IS NULL AND (@except IS NULL OR id<>@except);`)).recordset[0]!.given);
  if (round2(given + input.budget) > round2(budget[1])) throw new ApiError(422, "unit_budget_over_module",
    `Module ${budget[0]} has THB ${round2(budget[1]).toLocaleString("en-US", { minimumFractionDigits: 2 })} and its other Units already take THB ${round2(given).toLocaleString("en-US", { minimumFractionDigits: 2 })}; THB ${round2(budget[1] - given).toLocaleString("en-US", { minimumFractionDigits: 2 })} is left for this Unit.`);
  input.module = budget[0];
}
/** A drawing number names one Unit of a discipline in a project, and a Module has one general Unit per discipline. Asked before the write, so the answer does not hang on how a driver reports a unique index. */
async function assertNotTaken(transaction: TransactionType, projectId: number, input: UnitInput, exceptId: number | null): Promise<void> {
  const request = new sql.Request(transaction); request.input("project", sql.BigInt, projectId); request.input("module", sql.NVarChar(200), input.module); request.input("discipline", sql.NVarChar(10), input.discipline);
  request.input("drawing", sql.NVarChar(100), input.drawingNo); request.input("general", sql.Bit, input.isGeneral); request.input("except", sql.BigInt, exceptId);
  const taken = (await request.query<{ id: number | string }>(`SELECT TOP(1) id FROM dbo.project_purchase_units WITH (UPDLOCK,HOLDLOCK)
    WHERE project_id=@project AND discipline=@discipline AND deleted_at IS NULL AND (@except IS NULL OR id<>@except)
      AND ((@general=1 AND is_general=1 AND module=@module) OR (@general=0 AND is_general=0 AND drawing_no=@drawing));`)).recordset[0];
  if (taken) throw new ApiError(409, "unit_exists", input.isGeneral ? `Module ${input.module} already has a general Unit for ${input.discipline}.` : `${input.discipline} ${input.drawingNo} is already a Unit of this project.`);
}
const duplicate = (error: unknown): boolean => { const number = (error as { number?: number })?.number; return number === 2601 || number === 2627; };

export function registerPurchaseUnitRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  // A project's Modules and Units with what each Unit was given, has asked for, has had approved and ordered, and has left.
  app.get("/api/v1/projects/:projectId/purchase-units", async (request) => {
    await users.demandPermission(request, "procurement.read"); const actor = await users.required(request); const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    return database.transaction(async (transaction) => { await demandProjectScope(database, actor, projectId, transaction);
      const modules = await moduleBudgetsOf(transaction, projectId);
      const read = new sql.Request(transaction); read.input("project", sql.BigInt, projectId);
      // Ordered is what the ERP has a PO for, at this app's estimated price: the ERP does not return PO prices.
      const rows = (await read.query<Record<string, unknown> & { row_version: Buffer }>(`SELECT u.id,u.module,u.discipline,u.drawing_no,u.unit_name,u.is_general,u.budget,u.row_version,
          COALESCE(r.requests,0) requests,COALESCE(r.requested,0) requested,COALESCE(r.approved,0) approved,COALESCE(r.ordered,0) ordered
        FROM dbo.project_purchase_units u OUTER APPLY (
          SELECT COUNT(DISTINCT pr.id) requests,SUM(l.line_total) requested,
            SUM(CASE WHEN pr.status IN(N'Approved',N'Converted to PO') THEN l.line_total ELSE 0 END) approved,
            SUM(CASE WHEN l.erp_line_status=N'ORDERED' OR (l.erp_line_status IS NULL AND pr.status=N'Converted to PO') THEN l.line_total ELSE 0 END) ordered
          FROM dbo.mat_prs pr INNER JOIN dbo.mat_pr_lines l ON l.pr_id=pr.id WHERE pr.unit_id=u.id AND pr.deleted_at IS NULL AND pr.status IN(${REQUESTING_PR_STATUSES})) r
        WHERE u.project_id=@project AND u.deleted_at IS NULL ORDER BY u.module,u.discipline,u.is_general DESC,u.drawing_no,u.id;`)).recordset;
      const units = rows.map((row) => { const budget = Number(row.budget), requested = Number(row.requested);
        return { id: Number(row.id), module: String(row.module), discipline: String(row.discipline), drawingNo: String(row.drawing_no), unitName: String(row.unit_name), isGeneral: Boolean(row.is_general),
          budget, requests: Number(row.requests), requested, approved: Number(row.approved), ordered: Number(row.ordered), remaining: round2(budget - requested), rowVersion: row.row_version.toString("base64") }; });
      return { projectId, units,
        modules: [...modules].sort(([a], [b]) => a.localeCompare(b)).map(([module, budget]) => { const given = round2(units.filter((unit) => unit.module === module).reduce((sum, unit) => sum + unit.budget, 0));
          return { module, budget: round2(budget), given, ungiven: round2(budget - given) }; }),
        // By discipline: what the PR-Form files of one discipline (ME, EE, ...) added up to, which nobody could see across thirteen files.
        disciplines: PURCHASE_DISCIPLINES.flatMap((discipline) => { const own = units.filter((unit) => unit.discipline === discipline); if (!own.length) return [];
          const sum = (pick: (unit: (typeof units)[number]) => number) => round2(own.reduce((total, unit) => total + pick(unit), 0));
          return [{ discipline, units: own.length, budget: sum((unit) => unit.budget), requested: sum((unit) => unit.requested), approved: sum((unit) => unit.approved), ordered: sum((unit) => unit.ordered), remaining: sum((unit) => unit.remaining) }]; }) }; });
  });

  app.post("/api/v1/projects/:projectId/purchase-units", async (request, reply) => {
    await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project id");
    const input = unitInput(bodyObject(request.body));
    const created = await database.transaction(async (transaction) => { await demandProjectScope(database, actor, projectId, transaction); await assertFits(transaction, projectId, input, null); await assertNotTaken(transaction, projectId, input, null);
      const insert = new sql.Request(transaction); insert.input("project", sql.BigInt, projectId); insert.input("module", sql.NVarChar(200), input.module); insert.input("discipline", sql.NVarChar(10), input.discipline);
      insert.input("drawing", sql.NVarChar(100), input.drawingNo); insert.input("name", sql.NVarChar(200), input.unitName); insert.input("general", sql.Bit, input.isGeneral); insert.input("budget", sql.Decimal(19, 4), input.budget); insert.input("actor", sql.BigInt, actor.id);
      let row: { id: number | string; row_version: Buffer };
      try { row = (await insert.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.project_purchase_units(project_id,module,discipline,drawing_no,unit_name,is_general,budget,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES(@project,@module,@discipline,@drawing,@name,@general,@budget,@actor,@actor);`)).recordset[0]!; }
      catch (error) { if (duplicate(error)) throw new ApiError(409, "unit_exists", input.isGeneral ? `Module ${input.module} already has a general Unit for ${input.discipline}.` : `${input.discipline} ${input.drawingNo} is already a Unit of this project.`); throw error; }
      const id = Number(row.id);
      await insertMaterialAudit(transaction, actor, "Created purchase unit", "UNIT", id, unitLabel(input).slice(0, 50), null, input, { projectId });
      return { id, ...input, rowVersion: row.row_version.toString("base64") }; });
    return reply.status(201).send(created);
  });

  const lockUnit = async (transaction: TransactionType, id: number) => { const request = new sql.Request(transaction); request.input("id", sql.BigInt, id);
    const row = (await request.query<Record<string, unknown>>(`SELECT id,project_id,module,discipline,drawing_no,unit_name,is_general,budget FROM dbo.project_purchase_units WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
    if (!row) throw new ApiError(404, "unit_not_found", "Purchase unit not found."); return row; };

  // The name, the drawing number and the budget can be corrected; the module and the discipline are what its requests were raised under, so they stay.
  app.put("/api/v1/purchase-units/:id", async (request) => {
    await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase unit id");
    const body = bodyObject(request.body); const version = parseRowVersion(body.rowVersion);
    return database.transaction(async (transaction) => { const current = await lockUnit(transaction, id); const projectId = Number(current.project_id); await demandProjectScope(database, actor, projectId, transaction);
      const input = unitInput({ ...body, module: current.module, discipline: current.discipline, isGeneral: Boolean(current.is_general) });
      await assertFits(transaction, projectId, input, id); await assertNotTaken(transaction, projectId, input, id);
      const update = new sql.Request(transaction); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version); update.input("drawing", sql.NVarChar(100), input.drawingNo);
      update.input("name", sql.NVarChar(200), input.unitName); update.input("budget", sql.Decimal(19, 4), input.budget); update.input("actor", sql.BigInt, actor.id);
      let row: { row_version: Buffer } | undefined;
      try { row = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.project_purchase_units SET drawing_no=@drawing,unit_name=@name,budget=@budget,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0]; }
      catch (error) { if (duplicate(error)) throw new ApiError(409, "unit_exists", `${input.discipline} ${input.drawingNo} is already a Unit of this project.`); throw error; }
      if (!row) throw new ApiError(409, "concurrency_conflict", "This Unit changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, "Edited purchase unit", "UNIT", id, unitLabel(input).slice(0, 50),
        { drawingNo: current.drawing_no, unitName: current.unit_name, budget: Number(current.budget) }, { drawingNo: input.drawingNo, unitName: input.unitName, budget: input.budget }, { projectId });
      return { id, ...input, rowVersion: row.row_version.toString("base64") }; });
  });

  // A Unit no request was raised for can be removed. One with requests stays, so those requests keep what they were raised for.
  app.post("/api/v1/purchase-units/:id/remove", async (request) => {
    await users.demandPermission(request, "procurement.request"); const actor = await users.required(request); const id = positiveLong((request.params as { id?: string }).id, "Purchase unit id");
    const version = parseRowVersion(bodyObject(request.body).rowVersion);
    return database.transaction(async (transaction) => { const current = await lockUnit(transaction, id); const projectId = Number(current.project_id); await demandProjectScope(database, actor, projectId, transaction);
      const used = new sql.Request(transaction); used.input("id", sql.BigInt, id);
      const requests = Number((await used.query<{ requests: number }>(`SELECT COUNT(*) requests FROM dbo.mat_prs WHERE unit_id=@id AND deleted_at IS NULL;`)).recordset[0]!.requests);
      if (requests) throw new ApiError(409, "unit_in_use", `${requests} request(s) were raised for this Unit, so it cannot be removed.`);
      const update = new sql.Request(transaction); update.input("id", sql.BigInt, id); update.input("version", sql.VarBinary(8), version); update.input("actor", sql.BigInt, actor.id);
      const row = (await update.query<{ id: number | string }>(`UPDATE dbo.project_purchase_units SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.id WHERE id=@id AND deleted_at IS NULL AND row_version=@version;`)).recordset[0];
      if (!row) throw new ApiError(409, "concurrency_conflict", "This Unit changed. Reload and try again.");
      await insertMaterialAudit(transaction, actor, "Removed purchase unit", "UNIT", id, unitLabel({ drawingNo: String(current.drawing_no), unitName: String(current.unit_name) }).slice(0, 50),
        { module: current.module, discipline: current.discipline, budget: Number(current.budget) }, null, { projectId });
      return { id, removed: true }; });
  });
}
