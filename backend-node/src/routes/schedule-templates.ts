import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Transaction as TransactionType } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, parseRowVersion, positiveLong, requiredText } from "../http.js";
import type { CurrentUserService } from "../users.js";

/*
 * Master schedules: named Master Plans anyone keeps and reuses when creating a project.
 * A row's start offset and duration count days from the project start. A row may carry
 * neither, in which case applying the template copies only its name and leaves the dates
 * to be typed. Every signed-in user may manage them.
 */

export type TemplateRow = { name: string; startOffsetDays: number | null; durationDays: number | null };
const MAX_ROWS = 50;
const MAX_DAYS = 3650;

function optionalDays(value: unknown, label: string, minimum: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > MAX_DAYS) {
    throw new ApiError(400, "validation_failed", `${label} must be a whole number of days from ${minimum} to ${MAX_DAYS}.`);
  }
  return value as number;
}

export function parseTemplate(value: unknown): { name: string; rows: TemplateRow[] } {
  const body = bodyObject(value);
  const name = requiredText(body.name, 200, "Template name");
  if (!Array.isArray(body.rows) || body.rows.length === 0) throw new ApiError(400, "validation_failed", "A master schedule needs at least one row.");
  if (body.rows.length > MAX_ROWS) throw new ApiError(400, "validation_failed", `A master schedule cannot have more than ${MAX_ROWS} rows.`);
  const rows = body.rows.map((raw, index) => {
    const label = `Row ${index + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(400, "validation_failed", `${label} must be an object.`);
    const row = raw as Record<string, unknown>;
    const startOffsetDays = optionalDays(row.startOffsetDays, `${label} start day`, 0);
    const durationDays = optionalDays(row.durationDays, `${label} duration`, 1);
    if ((startOffsetDays === null) !== (durationDays === null)) {
      throw new ApiError(400, "validation_failed", `${label} needs both a start day and a duration, or neither.`);
    }
    return { name: requiredText(row.name, 500, `${label} name`), startOffsetDays, durationDays };
  });
  return { name, rows };
}

async function writeRows(transaction: TransactionType, templateId: number, rows: TemplateRow[]): Promise<void> {
  const clear = new sql.Request(transaction); clear.input("template", sql.BigInt, templateId);
  await clear.query(`DELETE FROM dbo.schedule_template_rows WHERE template_id=@template;`);
  for (const [index, row] of rows.entries()) {
    const insert = new sql.Request(transaction);
    insert.input("template", sql.BigInt, templateId).input("sort", sql.Int, index + 1).input("name", sql.NVarChar(500), row.name)
      .input("offset", sql.Int, row.startOffsetDays).input("duration", sql.Int, row.durationDays);
    await insert.query(`INSERT INTO dbo.schedule_template_rows(template_id,sort_order,name,start_offset_days,duration_days)
      VALUES(@template,@sort,@name,@offset,@duration);`);
  }
}

async function demandUniqueName(transaction: TransactionType, name: string, exceptId: number | null): Promise<void> {
  const check = new sql.Request(transaction); check.input("name", sql.NVarChar(200), name).input("except", sql.BigInt, exceptId);
  const taken = (await check.query(`SELECT id FROM dbo.schedule_templates WITH(UPDLOCK,HOLDLOCK) WHERE name=@name AND (@except IS NULL OR id<>@except);`)).recordset[0];
  if (taken) throw new ApiError(409, "schedule_template_name_taken", "Another master schedule already has this name.");
}

export function registerScheduleTemplateRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/schedule-templates", async (request) => {
    await users.required(request);
    const result = await database.query<Record<string, unknown>>(`
      SELECT t.id,t.name,t.updated_at,u.name updated_by_name,t.row_version FROM dbo.schedule_templates t
      LEFT JOIN dbo.users u ON u.id=t.updated_by ORDER BY t.name,t.id;
      SELECT template_id,name,start_offset_days,duration_days FROM dbo.schedule_template_rows ORDER BY template_id,sort_order;`);
    const [templates = [], rows = []] = result.recordsets as unknown as Record<string, unknown>[][];
    return templates.map((template) => ({
      id: Number(template.id), name: String(template.name), updatedAt: template.updated_at,
      updatedBy: template.updated_by_name === null ? null : String(template.updated_by_name),
      rowVersion: (template.row_version as Buffer).toString("base64"),
      rows: rows.filter((row) => Number(row.template_id) === Number(template.id)).map((row) => ({
        name: String(row.name),
        startOffsetDays: row.start_offset_days === null ? null : Number(row.start_offset_days),
        durationDays: row.duration_days === null ? null : Number(row.duration_days),
      })),
    }));
  });

  app.post("/api/v1/schedule-templates", async (request, reply) => {
    const actor = await users.required(request);
    const input = parseTemplate(request.body);
    const created = await database.transaction(async (transaction) => {
      await demandUniqueName(transaction, input.name, null);
      const insert = new sql.Request(transaction); insert.input("name", sql.NVarChar(200), input.name).input("actor", sql.BigInt, actor.id);
      const row = (await insert.query<{ id: number | string; row_version: Buffer }>(`DECLARE @created TABLE(id bigint,row_version binary(8));
        INSERT INTO dbo.schedule_templates(name,created_by,updated_by) OUTPUT inserted.id,inserted.row_version INTO @created VALUES(@name,@actor,@actor);
        SELECT id,row_version FROM @created;`)).recordset[0]!;
      const id = Number(row.id);
      await writeRows(transaction, id, input.rows);
      await insertAudit(transaction, actor.id, "Schedule Template", id, `ST-${id}`, "Created", null, input);
      return { id, rowVersion: row.row_version.toString("base64") };
    });
    return reply.status(201).header("Location", `/api/v1/schedule-templates/${created.id}`).send(created);
  });

  app.put("/api/v1/schedule-templates/:id", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Template id");
    const input = parseTemplate(request.body);
    const rowVersion = parseRowVersion(bodyObject(request.body).rowVersion);
    return database.transaction(async (transaction) => {
      const lookup = new sql.Request(transaction); lookup.input("id", sql.BigInt, id);
      const current = (await lookup.query<{ name: string; row_version: Buffer }>(`SELECT name,row_version FROM dbo.schedule_templates WITH(UPDLOCK,HOLDLOCK) WHERE id=@id;`)).recordset[0];
      if (!current) throw new ApiError(404, "schedule_template_not_found", "Master schedule not found.");
      if (!current.row_version.equals(rowVersion)) throw new ApiError(409, "concurrency_conflict", "Someone else changed this master schedule. Reload it and try again.");
      await demandUniqueName(transaction, input.name, id);
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, id).input("name", sql.NVarChar(200), input.name).input("actor", sql.BigInt, actor.id);
      const row = (await update.query<{ row_version: Buffer }>(`DECLARE @changed TABLE(row_version binary(8));
        UPDATE dbo.schedule_templates SET name=@name,updated_by=@actor,updated_at=SYSUTCDATETIME() OUTPUT inserted.row_version INTO @changed WHERE id=@id;
        SELECT row_version FROM @changed;`)).recordset[0]!;
      await writeRows(transaction, id, input.rows);
      await insertAudit(transaction, actor.id, "Schedule Template", id, `ST-${id}`, "Updated", { name: current.name }, input);
      return { id, rowVersion: row.row_version.toString("base64") };
    });
  });

  app.delete("/api/v1/schedule-templates/:id", async (request) => {
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Template id");
    return database.transaction(async (transaction) => {
      const remove = new sql.Request(transaction); remove.input("id", sql.BigInt, id);
      const removed = (await remove.query<{ name: string }>(`DECLARE @gone TABLE(name nvarchar(200));
        DELETE FROM dbo.schedule_templates OUTPUT deleted.name INTO @gone WHERE id=@id; SELECT name FROM @gone;`)).recordset[0];
      if (!removed) throw new ApiError(404, "schedule_template_not_found", "Master schedule not found.");
      await insertAudit(transaction, actor.id, "Schedule Template", id, `ST-${id}`, "Deleted", { name: removed.name }, null);
      return { id, deleted: true };
    });
  });
}
