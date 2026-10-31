import type { FastifyInstance } from "fastify";
import sql from "mssql";
import { activityRoster, activityScope } from "../activity-service.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, requiredInteger } from "../http.js";
import type { CurrentUserService } from "../users.js";

/*
 * Click-through guides: the frontend walks a person through a task on the real screen
 * (app/system/production/GuideLayer.tsx) and reports here how far they got. The guides are
 * written in the frontend catalog, so this route accepts any well-formed guide id and keeps
 * one row per person and guide.
 *
 * A head sees the progress of the people they review KPIs for: the same permission
 * (performance.manage) and the same roster (department, or the projects they lead) as Team
 * Activity, so the two never disagree about who is on someone's team.
 */

const GUIDE_ID = /^[a-z][a-z0-9-]{1,59}$/;
export const GUIDE_EVENTS = ["start", "step", "complete", "invite-closed"] as const;
type GuideEvent = (typeof GUIDE_EVENTS)[number];

export type GuideProgressInput = { guideId: string; event: GuideEvent; step: number; stepCount: number };

export function guideProgressInput(value: unknown): GuideProgressInput {
  const body = bodyObject(value);
  const guideId = typeof body.guideId === "string" ? body.guideId : "";
  if (!GUIDE_ID.test(guideId)) throw new ApiError(400, "guide_validation", "guideId names a guide, such as inquiry-create.");
  const event = String(body.event ?? "");
  if (!(GUIDE_EVENTS as readonly string[]).includes(event)) throw new ApiError(400, "guide_validation", `event is one of ${GUIDE_EVENTS.join(", ")}.`);
  const stepCount = requiredInteger(body.stepCount, "Step count", 1, 100);
  const step = event === "complete" ? stepCount : event === "start" || event === "invite-closed" ? 0 : requiredInteger(body.step, "Step", 0, stepCount);
  return { guideId, event: event as GuideEvent, step, stepCount };
}

/*
 * One row per person and guide, written under a range lock so two tabs reporting at once
 * cannot both insert. Starting again resets the step for the new run; finishing keeps the
 * first finish time; any answer to the invitation (starting counts) stops it being shown.
 */
export const GUIDE_PROGRESS_UPSERT = `
  UPDATE dbo.user_guide_progress WITH (UPDLOCK, SERIALIZABLE)
     SET step_count=@count,
         step_reached=CASE WHEN @event=N'start' THEN 0
                           WHEN @event=N'complete' THEN @count
                           WHEN @event=N'step' AND @step>step_reached THEN CASE WHEN @step>@count THEN @count ELSE @step END
                           WHEN step_reached>@count THEN @count
                           ELSE step_reached END,
         started_at=CASE WHEN @event IN (N'start', N'step', N'complete') THEN COALESCE(started_at, SYSUTCDATETIME()) ELSE started_at END,
         completed_at=CASE WHEN @event=N'complete' THEN COALESCE(completed_at, SYSUTCDATETIME()) ELSE completed_at END,
         invite_closed_at=COALESCE(invite_closed_at, SYSUTCDATETIME()),
         updated_at=SYSUTCDATETIME()
   WHERE user_id=@user AND guide_id=@guide;
  IF @@ROWCOUNT = 0
    INSERT dbo.user_guide_progress(user_id, guide_id, step_reached, step_count, started_at, completed_at, invite_closed_at)
    VALUES (@user, @guide, CASE WHEN @event=N'complete' THEN @count WHEN @event=N'step' THEN @step ELSE 0 END, @count,
            CASE WHEN @event=N'invite-closed' THEN NULL ELSE SYSUTCDATETIME() END,
            CASE WHEN @event=N'complete' THEN SYSUTCDATETIME() ELSE NULL END,
            SYSUTCDATETIME());
  SELECT guide_id, step_reached, step_count, started_at, completed_at, invite_closed_at
    FROM dbo.user_guide_progress WHERE user_id=@user AND guide_id=@guide;`;

type ProgressRow = {
  user_id?: number | string; guide_id: string; step_reached: number; step_count: number;
  started_at: Date | string | null; completed_at: Date | string | null; invite_closed_at: Date | string | null;
};
const iso = (value: Date | string | null) => value === null ? null : value instanceof Date ? value.toISOString() : String(value);
export const progressDto = (row: ProgressRow) => ({
  guideId: row.guide_id, stepReached: Number(row.step_reached), stepCount: Number(row.step_count),
  startedAt: iso(row.started_at), completedAt: iso(row.completed_at), inviteClosedAt: iso(row.invite_closed_at),
});

export function registerUserGuideRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/guides/progress", async (request) => {
    const actor = await users.required(request);
    const result = await database.query<ProgressRow>(`
      SELECT guide_id, step_reached, step_count, started_at, completed_at, invite_closed_at
        FROM dbo.user_guide_progress WHERE user_id=@user ORDER BY guide_id;`, (q) => q.input("user", sql.BigInt, actor.id));
    return { items: result.recordset.map(progressDto) };
  });

  app.post("/api/v1/guides/progress", async (request) => {
    const actor = await users.required(request);
    const input = guideProgressInput(request.body);
    const row = await database.transaction(async (transaction) => {
      const query = new sql.Request(transaction);
      query.input("user", sql.BigInt, actor.id).input("guide", sql.NVarChar(60), input.guideId)
        .input("event", sql.NVarChar(20), input.event).input("step", sql.Int, input.step).input("count", sql.Int, input.stepCount);
      return (await query.query<ProgressRow>(GUIDE_PROGRESS_UPSERT)).recordset[0];
    });
    if (!row) throw new ApiError(500, "guide_progress_missing", "The guide progress was not saved.");
    return progressDto(row);
  });

  app.get("/api/v1/guides/team", async (request) => {
    await users.demandPermission(request, "performance.manage");
    const actor = await users.required(request);
    const members = await activityRoster(database, await activityScope(database, actor));
    const ids = members.map((member) => member.id);
    const rows = ids.length ? (await database.query<ProgressRow>(`
      SELECT p.user_id, p.guide_id, p.step_reached, p.step_count, p.started_at, p.completed_at, p.invite_closed_at
        FROM dbo.user_guide_progress p
        INNER JOIN OPENJSON(@ids) member ON p.user_id=CONVERT(bigint, member.value)
       ORDER BY p.user_id, p.guide_id;`, (q) => q.input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)))).recordset : [];
    return {
      members: members.map(({ id, name, department, role }) => ({ id, name, department, role })),
      progress: rows.map((row) => ({ userId: Number(row.user_id), ...progressDto(row) })),
    };
  });
}
