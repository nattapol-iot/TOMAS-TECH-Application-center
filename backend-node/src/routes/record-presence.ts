import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, positiveLong } from "../http.js";
import type { CurrentUserService } from "../users.js";

/*
 * Live awareness for records several people work at once.
 *
 * An open Estimate Cost workspace beats here every few seconds. Each beat records that
 * the caller is present and answers two questions in one round trip: who else has this
 * estimate open, and has anything in it changed since the caller last looked.
 *
 * The change question costs nothing to keep answering because SQL Server already keeps
 * the answer: every table the workspace shows carries a rowversion, and rowversion is a
 * single counter for the whole database. Anything written since a remembered value has
 * a larger one, whichever route wrote it -- a line edit, an Excel import, a template,
 * an ERP regroup (those touch dbo.estimates), a deletion (every line is soft-deleted, so
 * a removal is an UPDATE and moves the counter too).
 *
 * The beat only says THAT something changed and who changed it. The caller then reloads
 * the workspace it already trusts, so row permissions, totals and validation are never
 * computed a second way here.
 */

/** A viewer who has not beaten for this long has closed the record. */
export const PRESENCE_WINDOW_SECONDS = 45;
/** Rows quieter than this are deleted, so the table holds the present, not a history. */
const PRESENCE_PRUNE_SECONDS = 300;

const CURSOR_PATTERN = /^[0-9a-f]{16}$/;
const EDITING_KEY_PATTERN = /^(?:cost|manhour|expense|other|assignment):(?:\d{1,18}|new)$/;

type EntityType = "Estimate" | "Inquiry";

function parseCursor(value: unknown): Buffer | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !CURSOR_PATTERN.test(value)) {
    throw new ApiError(400, "validation_failed", "since must be the 16-digit cursor a previous response returned.");
  }
  return Buffer.from(value, "hex");
}

function parseEditingKey(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !EDITING_KEY_PATTERN.test(value)) {
    throw new ApiError(400, "validation_failed", "editingKey names a line being edited, such as cost:412.");
  }
  return value;
}

/* Whether the record is live, in the same terms its own read route uses. */
const LIVE_RECORD: Record<EntityType, string> = {
  Estimate: `SELECT 1 FROM dbo.estimates e INNER JOIN dbo.inquiries i ON i.id=e.inquiry_id AND i.deleted_at IS NULL
    WHERE e.id=@entity AND e.deleted_at IS NULL`,
  Inquiry: `SELECT 1 FROM dbo.inquiries i WHERE i.id=@entity AND i.deleted_at IS NULL`,
};

/*
 * Record the caller as present. Guarded by the record being live, so a beat against an
 * id that does not exist -- or no longer does -- leaves no row behind. The global prune
 * is bounded and the table is small by construction, so it never becomes a scan worth
 * worrying about.
 */
export const PRESENCE_BEAT: Record<EntityType, string> = Object.fromEntries((["Estimate", "Inquiry"] as const).map((entityType) => [entityType, `
  IF EXISTS (${LIVE_RECORD[entityType]})
  BEGIN
    UPDATE dbo.record_presence WITH (UPDLOCK, SERIALIZABLE)
      SET editing_key=@key, last_at=SYSUTCDATETIME()
      WHERE entity_type=@type AND entity_id=@entity AND user_id=@actor;
    IF @@ROWCOUNT = 0
      INSERT dbo.record_presence(entity_type, entity_id, user_id, editing_key) VALUES (@type, @entity, @actor, @key);
  END;
  DELETE TOP (200) dbo.record_presence WHERE last_at < DATEADD(second, -@prune, SYSUTCDATETIME());`])) as Record<EntityType, string>;

async function beat(database: Database, entityType: EntityType, entityId: number, actorId: number, editingKey: string | null) {
  await database.transaction(async (transaction) => {
    const request = new sql.Request(transaction);
    request.input("type", sql.NVarChar(30), entityType).input("entity", sql.BigInt, entityId)
      .input("actor", sql.BigInt, actorId).input("key", sql.NVarChar(60), editingKey)
      .input("prune", sql.Int, PRESENCE_PRUNE_SECONDS);
    await request.query(PRESENCE_BEAT[entityType]);
  });
}

async function leave(database: Database, entityType: EntityType, entityId: number, actorId: number) {
  await database.transaction(async (transaction) => {
    const request = new sql.Request(transaction);
    request.input("type", sql.NVarChar(30), entityType).input("entity", sql.BigInt, entityId).input("actor", sql.BigInt, actorId);
    await request.query(`DELETE dbo.record_presence WHERE entity_type=@type AND entity_id=@entity AND user_id=@actor;`);
  });
}

/* Everyone else with the record open, newest beat first. */
const VIEWERS = `
  SELECT p.user_id, u.name, p.editing_key, p.last_at FROM dbo.record_presence p
  INNER JOIN dbo.users u ON u.id=p.user_id
  WHERE p.entity_type=@type AND p.entity_id=@entity AND p.user_id<>@actor
    AND p.last_at >= DATEADD(second, -@window, SYSUTCDATETIME())
  ORDER BY p.last_at DESC, p.user_id;`;

/*
 * The change window is [since, next) with next taken FIRST, from MIN_ACTIVE_ROWVERSION().
 *
 * That function returns the lowest rowversion still held by an open transaction, so
 * every value below it belongs to a write that has already committed. Reading the rows
 * first and the high-water mark (@@DBTS) second would lose a write for good: a
 * transaction that took its rowversion before the read but committed after it would
 * sit below the mark the caller was handed, and no later beat would ever look there
 * again. That only happens under real concurrent use, which is exactly when this runs,
 * and nothing short of a concurrent test would notice it.
 *
 * Returning next as the caller's following since makes consecutive windows meet
 * exactly: nothing falls between two beats and nothing is counted in both.
 */
export const ESTIMATE_CHANGES = `
  DECLARE @next binary(8) = MIN_ACTIVE_ROWVERSION();
  DECLARE @changed TABLE (actor bigint NULL);

  INSERT @changed(actor)
    SELECT e.updated_by FROM dbo.estimates e
      WHERE e.id=@entity AND e.row_version >= @since AND e.row_version < @next
    UNION ALL SELECT updated_by FROM dbo.cost_items
      WHERE estimate_id=@entity AND row_version >= @since AND row_version < @next
    UNION ALL SELECT updated_by FROM dbo.manhour_lines
      WHERE estimate_id=@entity AND row_version >= @since AND row_version < @next
    UNION ALL SELECT updated_by FROM dbo.expense_lines
      WHERE estimate_id=@entity AND row_version >= @since AND row_version < @next
    UNION ALL SELECT updated_by FROM dbo.other_cost_lines
      WHERE estimate_id=@entity AND row_version >= @since AND row_version < @next
    UNION ALL SELECT CAST(NULL AS bigint) FROM dbo.estimate_assignments
      WHERE estimate_id=@entity AND row_version >= @since AND row_version < @next;

  SELECT CONVERT(bit, CASE WHEN EXISTS (${LIVE_RECORD.Estimate}) THEN 1 ELSE 0 END) AS live,
    @next AS next_cursor, (SELECT COUNT_BIG(*) FROM @changed) AS changed;

  -- Names as rows, not a joined string: a name is free text and may hold any separator.
  SELECT DISTINCT u.id, u.name FROM @changed c INNER JOIN dbo.users u ON u.id=c.actor
  WHERE c.actor<>@actor ORDER BY u.name, u.id;
  ${VIEWERS}`;

const INQUIRY_VIEWERS = `
  SELECT CONVERT(bit, CASE WHEN EXISTS (${LIVE_RECORD.Inquiry}) THEN 1 ELSE 0 END) AS live;
  ${VIEWERS}`;

type ViewerRow = { user_id: number | string; name: string; editing_key: string | null; last_at: Date | string };
const viewerDto = (row: ViewerRow) => ({
  userId: Number(row.user_id), name: row.name, editingKey: row.editing_key ?? null,
  lastAt: row.last_at instanceof Date ? row.last_at.toISOString() : String(row.last_at),
});

export function registerRecordPresenceRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.post("/api/v1/estimates/:id/sync", async (request) => {
    // The same permission the workspace itself is read with -- no wider, so a beat
    // cannot be used to learn about an estimate the caller could not open.
    await users.demandPermission(request, "estimate.read");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Estimate id");
    const body = bodyObject(request.body);
    const since = parseCursor(body.since);
    const editingKey = parseEditingKey(body.editingKey);
    // A read-only connection cannot record presence, but the change feed is a pure read
    // and still keeps the screen current.
    if (!database.readOnly) await beat(database, "Estimate", id, actor.id, editingKey);
    const result = await database.query<Record<string, unknown>>(ESTIMATE_CHANGES, (q) => {
      q.input("entity", sql.BigInt, id).input("actor", sql.BigInt, actor.id).input("type", sql.NVarChar(30), "Estimate")
        .input("window", sql.Int, PRESENCE_WINDOW_SECONDS)
        // With no cursor yet nothing is "since": the window is empty and the caller
        // simply learns where to start from.
        .input("since", sql.VarBinary(8), since ?? Buffer.alloc(8, 0xff));
    });
    const head = (result.recordsets[0] as unknown as Array<{ live: boolean; next_cursor: Buffer; changed: number | string }>)[0];
    if (!head?.live) throw new ApiError(404, "estimate_not_found", "Estimate not found.");
    return {
      cursor: head.next_cursor.toString("hex"),
      changed: Number(head.changed ?? 0),
      changedBy: (result.recordsets[1] as unknown as Array<{ name: string }>).map((row) => row.name),
      viewers: (result.recordsets[2] as unknown as ViewerRow[]).map(viewerDto),
    };
  });

  app.post("/api/v1/inquiries/:id/presence", async (request) => {
    await users.demandPermission(request, "inquiry.read");
    const actor = await users.required(request);
    const id = positiveLong((request.params as { id?: string }).id, "Inquiry id");
    if (!database.readOnly) await beat(database, "Inquiry", id, actor.id, null);
    const result = await database.query<Record<string, unknown>>(INQUIRY_VIEWERS, (q) => {
      q.input("entity", sql.BigInt, id).input("actor", sql.BigInt, actor.id).input("type", sql.NVarChar(30), "Inquiry")
        .input("window", sql.Int, PRESENCE_WINDOW_SECONDS);
    });
    const head = (result.recordsets[0] as unknown as Array<{ live: boolean }>)[0];
    if (!head?.live) throw new ApiError(404, "inquiry_not_found", "Inquiry not found.");
    return { viewers: (result.recordsets[1] as unknown as ViewerRow[]).map(viewerDto) };
  });

  // Leaving is best effort: a tab that closes without saying so drops out of the list
  // once its last beat is older than the presence window.
  for (const [path, entityType, permission] of [
    ["/api/v1/estimates/:id/presence", "Estimate", "estimate.read"],
    ["/api/v1/inquiries/:id/presence", "Inquiry", "inquiry.read"],
  ] as const) {
    app.delete(path, async (request, reply) => {
      await users.demandPermission(request, permission);
      const actor = await users.required(request);
      const id = positiveLong((request.params as { id?: string }).id, `${entityType} id`);
      if (!database.readOnly) await leave(database, entityType, id, actor.id);
      return reply.status(204).send();
    });
  }
}
