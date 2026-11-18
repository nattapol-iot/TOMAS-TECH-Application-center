import sql from "mssql";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Transaction } from "mssql";
import type { AppConfig } from "../config.js";
import { DatabaseCommitOutcomeUnknownError, type Database } from "../db.js";
import {
  contentTypeFor,
  deleteStoredFile,
  readMultipartUpload,
  sendStoredFile,
  storageKey,
  uploadedFileName,
  validateFileExtension,
  writeStoredFile,
} from "../document-storage.js";
import { ApiError } from "../errors.js";
import { bodyObject, clampedInteger, dateOnly, firstQueryValue, optionalPositiveLong, parseDateOnly, parseRowVersion, positiveLong } from "../http.js";
import { insertAudit } from "../audit.js";
import { isProjectElevated } from "../project-scope.js";
import { permissionFor } from "../schedule-service.js";
import type { CurrentUser } from "../types.js";
import type { CurrentUserService } from "../users.js";
import {
  bangkokToday,
  batchIsClosed,
  canApproveIssues,
  hoursInput,
  ISSUE_ACTIONS,
  issueActions,
  issueBatchInput,
  issueFieldError,
  issueItemInput,
  issueItemsInput,
  mayEditIssue,
  mayTakeIssueAction,
  nextBatchNumber,
  nextIssueState,
  startingState,
  stateAfterEdit,
  type IssueAction,
  type IssueActor,
  type IssueCategory,
  type IssueItemInput,
  type IssueState,
} from "../issue-batches.js";

/*
 * Customer issue batches (Projects > Punchlist, migration 107). Rules live in ../issue-batches.ts.
 *
 * Reading needs schedule.read; typing issues, planning and closing them needs schedule.plan or schedule.progress, as
 * the old Punchlist did. Who sees a batch: project-wide roles (isProjectElevated), everyone for a batch of a project this
 * system does not have, and otherwise the project's manager, lead and members, the batch's author and its PICs.
 */

/** Screenshots are small and pasted several at a time, so they get their own, wider limits than documents. */
export const ISSUE_IMAGE_UPLOAD_RATE_LIMIT = { max: 40, timeWindow: "1 minute" } as const;
export const ISSUE_IMAGE_DOWNLOAD_RATE_LIMIT = { max: 400, timeWindow: "1 minute" } as const;
export const ISSUE_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
export const MAX_ISSUE_IMAGES = 10;

/** The batch `b` is the caller's to see. Binds @actor and @elevated. */
export const ISSUE_BATCH_VISIBLE = `(@elevated=1 OR b.project_id IS NULL OR b.created_by=@actor
        OR EXISTS(SELECT 1 FROM dbo.projects vp WHERE vp.id=b.project_id AND (vp.manager_id=@actor OR vp.lead_engineer_id=@actor))
        OR EXISTS(SELECT 1 FROM dbo.project_members vm WHERE vm.project_id=b.project_id AND vm.user_id=@actor)
        OR EXISTS(SELECT 1 FROM dbo.issue_items va WHERE va.batch_id=b.id AND va.assignee_id=@actor))`;

const LIST_TABS = ["all", "open", "approval", "mine", "closed"] as const;
type ListTab = (typeof LIST_TABS)[number];
const TAB_SQL: Record<ListTab, string> = {
  all: "1=1",
  open: "b.closed_at IS NULL",
  approval: "agg.approval_count>0",
  mine: "agg.mine_count>0",
  closed: "b.closed_at IS NOT NULL",
};

const LIST_FROM = `
      FROM dbo.issue_batches b
      LEFT JOIN dbo.projects p ON p.id=b.project_id
      LEFT JOIN dbo.customers c ON c.id=p.customer_id
      JOIN dbo.users cu ON cu.id=b.created_by
      OUTER APPLY (SELECT COUNT(*) item_count,
          ISNULL(SUM(CASE WHEN i.state=N'Approval' THEN 1 ELSE 0 END),0) approval_count,
          ISNULL(SUM(CASE WHEN i.state=N'Open' THEN 1 ELSE 0 END),0) open_count,
          ISNULL(SUM(CASE WHEN i.state=N'Doing' THEN 1 ELSE 0 END),0) doing_count,
          ISNULL(SUM(CASE WHEN i.state=N'Done' THEN 1 ELSE 0 END),0) done_count,
          ISNULL(SUM(CASE WHEN i.state IN(N'Cancelled',N'Rejected') THEN 1 ELSE 0 END),0) dropped_count,
          ISNULL(SUM(CASE WHEN i.state IN(N'Cancelled',N'Rejected') THEN 0 ELSE i.plan_hours END),0) plan_hours,
          ISNULL(SUM(i.actual_hours),0) actual_hours,
          ISNULL(SUM(CASE WHEN i.assignee_id=@actor AND i.state IN(N'Approval',N'Open',N'Doing') THEN 1 ELSE 0 END),0) mine_count
        FROM dbo.issue_items i WHERE i.batch_id=b.id) agg
      WHERE ${ISSUE_BATCH_VISIBLE} AND (@project IS NULL OR b.project_id=@project)
        AND (@like IS NULL OR b.batch_no LIKE @like ESCAPE '\\' OR p.project_no LIKE @like ESCAPE '\\' OR p.name LIKE @like ESCAPE '\\'
          OR b.external_project LIKE @like ESCAPE '\\' OR c.name LIKE @like ESCAPE '\\' OR b.customer_name LIKE @like ESCAPE '\\'
          OR b.reported_by LIKE @like ESCAPE '\\'
          OR EXISTS(SELECT 1 FROM dbo.issue_items s WHERE s.batch_id=b.id AND (s.description LIKE @like ESCAPE '\\' OR s.function_name LIKE @like ESCAPE '\\')))`;

const BATCH_COLUMNS = `b.id,b.batch_no,b.project_id,b.external_project,b.customer_name,b.reported_on,b.reported_by,b.note,b.created_by,
        cu.name created_by_name,b.created_at,b.updated_at,b.closed_at,b.row_version,p.project_no,p.name project_name,p.status project_status,
        p.manager_id,p.lead_engineer_id,c.name project_customer`;

const ITEM_COLUMNS = `i.id,i.batch_id,i.line_no,i.category,i.function_name,i.description,i.assignee_id,au.name assignee_name,
        i.plan_start,i.plan_end,i.plan_hours,i.state,i.started_on,i.done_on,i.actual_hours,i.fix_note,i.reason,
        du.name decided_by_name,i.decided_at,i.created_by,iu.name created_by_name,i.created_at,i.updated_at,i.row_version`;
const ITEM_FROM = `FROM dbo.issue_items i
      LEFT JOIN dbo.users au ON au.id=i.assignee_id
      LEFT JOIN dbo.users du ON du.id=i.decided_by
      JOIN dbo.users iu ON iu.id=i.created_by`;

type Row = Record<string, unknown>;
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));
const version = (value: unknown) => (value as Buffer).toString("base64");
const escapeLike = (value: string) => value.replace(/[\\%_[]/g, (char) => `\\${char}`);

function batchDto(row: Row) {
  const projectId = num(row.project_id);
  return {
    id: Number(row.id), batchNo: str(row.batch_no), projectId,
    projectNo: str(row.project_no), projectName: str(row.project_name), projectClosed: row.project_status === "Closed",
    externalProject: str(row.external_project),
    customerName: projectId ? str(row.project_customer) || str(row.customer_name) : str(row.customer_name),
    reportedOn: dateOnly(row.reported_on as Date), reportedBy: str(row.reported_by), note: str(row.note),
    createdBy: Number(row.created_by), createdByName: str(row.created_by_name),
    createdAt: row.created_at, updatedAt: row.updated_at, closedAt: row.closed_at ?? null, rowVersion: version(row.row_version),
  };
}

function listDto(row: Row) {
  return {
    ...batchDto(row),
    itemCount: Number(row.item_count ?? 0), approvalCount: Number(row.approval_count ?? 0), openCount: Number(row.open_count ?? 0),
    doingCount: Number(row.doing_count ?? 0), doneCount: Number(row.done_count ?? 0), droppedCount: Number(row.dropped_count ?? 0),
    planHours: Number(row.plan_hours ?? 0), actualHours: Number(row.actual_hours ?? 0), mineCount: Number(row.mine_count ?? 0),
  };
}

function itemDto(row: Row) {
  return {
    id: Number(row.id), batchId: Number(row.batch_id), lineNo: Number(row.line_no), category: str(row.category) as IssueCategory,
    functionName: str(row.function_name), description: str(row.description),
    assigneeId: num(row.assignee_id), assigneeName: str(row.assignee_name),
    planStart: dateOnly((row.plan_start ?? null) as Date | null), planEnd: dateOnly((row.plan_end ?? null) as Date | null), planHours: num(row.plan_hours),
    state: str(row.state) as IssueState,
    startedOn: dateOnly((row.started_on ?? null) as Date | null), doneOn: dateOnly((row.done_on ?? null) as Date | null), actualHours: num(row.actual_hours),
    fixNote: str(row.fix_note), reason: str(row.reason), decidedByName: str(row.decided_by_name), decidedAt: row.decided_at ?? null,
    createdBy: Number(row.created_by), createdByName: str(row.created_by_name), createdAt: row.created_at, updatedAt: row.updated_at,
    rowVersion: version(row.row_version),
  };
}

type IssueImage = { id: number; itemId: number; fileName: string; sizeBytes: number; uploadedBy: number; uploadedAt: unknown };
const imageDto = (row: Row): IssueImage => ({
  id: Number(row.id), itemId: Number(row.item_id), fileName: str(row.name), sizeBytes: Number(row.size_bytes),
  uploadedBy: Number(row.uploaded_by), uploadedAt: row.uploaded_at,
});

type BatchProject = { managerId: number | null; leadId: number | null } | null;
const batchProject = (row: Row): BatchProject => (row.project_id === null || row.project_id === undefined
  ? null : { managerId: num(row.manager_id), leadId: num(row.lead_engineer_id) });

/** Refuses a change made from a screen that showed an older copy of the issue. */
function sameVersion(row: Row, body: Record<string, unknown>) {
  if (!(row.row_version as Buffer).equals(parseRowVersion(body.rowVersion))) {
    throw new ApiError(409, "concurrency_conflict", "This issue changed. Reload it and try again.");
  }
}

export function registerIssueBatchRoutes(app: FastifyInstance, config: AppConfig, database: Database, users: CurrentUserService): void {
  const reader = async (request: FastifyRequest) => {
    await users.demandPermission(request, "schedule.read");
    return users.required(request);
  };
  const mayWrite = async (actor: CurrentUser) =>
    (await permissionFor(database, actor.id, "schedule.plan")) || (await permissionFor(database, actor.id, "schedule.progress"));
  const writer = async (request: FastifyRequest) => {
    const actor = await reader(request);
    if (!(await mayWrite(actor))) throw new ApiError(403, "issue_write", "Schedule planning or progress permission is required to change issues.");
    return actor;
  };
  const bindScope = (q: sql.Request, actor: CurrentUser) => q.input("actor", sql.BigInt, actor.id).input("elevated", sql.Bit, isProjectElevated(actor));

  /** Every PIC must be an active account. */
  const checkAssignees = async (tx: Transaction, items: readonly { assigneeId: number | null }[]) => {
    const ids = [...new Set(items.map((item) => item.assigneeId).filter((id): id is number => id !== null))];
    if (!ids.length) return;
    const found = await new sql.Request(tx).input("ids", sql.NVarChar(sql.MAX), JSON.stringify(ids)).query<{ id: number }>(
      `SELECT u.id FROM dbo.users u JOIN OPENJSON(@ids) j ON CONVERT(bigint,j.[value])=u.id WHERE u.is_active=1 AND u.deleted_at IS NULL;`,
    );
    const active = new Set(found.recordset.map((row) => Number(row.id)));
    const missing = items.findIndex((item) => item.assigneeId !== null && !active.has(item.assigneeId));
    if (missing >= 0) throw issueFieldError("assigneeId", "This PIC is not an active account.", missing + 1);
  };

  /** A project for a batch: it must exist and be the caller's to see; a closed one is allowed (late issues). */
  const checkProject = async (tx: Transaction, actor: CurrentUser, projectId: number) => {
    const row = (await bindScope(new sql.Request(tx), actor).input("project", sql.BigInt, projectId).query<Row>(`
      SELECT p.id,p.manager_id,p.lead_engineer_id FROM dbo.projects p
      WHERE p.id=@project AND p.deleted_at IS NULL AND (@elevated=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor
        OR EXISTS(SELECT 1 FROM dbo.project_members m WHERE m.project_id=p.id AND m.user_id=@actor));`)).recordset[0];
    if (!row) throw issueFieldError("projectId", "Project not found, or it is not one of yours.");
    return { managerId: num(row.manager_id), leadId: num(row.lead_engineer_id) };
  };

  /** Adds issues after the batch's last line; their state follows the category and whether the author approves. */
  const insertItems = async (tx: Transaction, actor: CurrentUser, batchId: number, items: IssueItemInput[], approver: boolean) => {
    const rows = items.map((item) => ({ ...item, state: startingState(item.category, approver) }));
    await new sql.Request(tx)
      .input("batch", sql.BigInt, batchId).input("actor", sql.BigInt, actor.id).input("items", sql.NVarChar(sql.MAX), JSON.stringify(rows))
      .query(`
        DECLARE @first int = ISNULL((SELECT MAX(line_no) FROM dbo.issue_items WITH (UPDLOCK,HOLDLOCK) WHERE batch_id=@batch),0);
        INSERT dbo.issue_items(batch_id,line_no,category,function_name,description,assignee_id,plan_start,plan_end,plan_hours,state,created_by,updated_by)
        SELECT @batch,@first+1+CONVERT(int,j.[key]),v.category,ISNULL(v.function_name,N''),v.description,v.assignee_id,v.plan_start,v.plan_end,v.plan_hours,v.state,@actor,@actor
        FROM OPENJSON(@items) j CROSS APPLY OPENJSON(j.[value]) WITH (
          category nvarchar(20) '$.category', function_name nvarchar(200) '$.functionName', description nvarchar(4000) '$.description',
          assignee_id bigint '$.assigneeId', plan_start date '$.planStart', plan_end date '$.planEnd', plan_hours decimal(7,2) '$.planHours',
          state nvarchar(20) '$.state') v;`);
    return rows;
  };

  /** Closes the batch when none of its issues needs anyone any more, and opens it again when one does. */
  const settleBatch = async (tx: Transaction, batchId: number) => {
    const states = (await new sql.Request(tx).input("batch", sql.BigInt, batchId).query<{ state: string }>(
      `SELECT state FROM dbo.issue_items WHERE batch_id=@batch;`,
    )).recordset.map((row) => row.state);
    const closed = batchIsClosed(states);
    await new sql.Request(tx).input("batch", sql.BigInt, batchId).input("closed", sql.Bit, closed).query(`
      UPDATE dbo.issue_batches SET updated_at=SYSUTCDATETIME(),
        closed_at=CASE WHEN @closed=1 THEN COALESCE(closed_at,SYSUTCDATETIME()) ELSE NULL END
      WHERE id=@batch;`);
    return closed;
  };

  /** A batch with its issues and images, and what the caller may do with each. */
  const readBatch = async (actor: CurrentUser, batchId: number, canWrite: boolean) => {
    const result = await database.query<Row>(`
      SELECT ${BATCH_COLUMNS}
      FROM dbo.issue_batches b LEFT JOIN dbo.projects p ON p.id=b.project_id LEFT JOIN dbo.customers c ON c.id=p.customer_id
      JOIN dbo.users cu ON cu.id=b.created_by
      WHERE b.id=@batch AND ${ISSUE_BATCH_VISIBLE};
      SELECT ${ITEM_COLUMNS} ${ITEM_FROM}
      WHERE i.batch_id=@batch AND EXISTS(SELECT 1 FROM dbo.issue_batches b WHERE b.id=@batch AND ${ISSUE_BATCH_VISIBLE})
      ORDER BY i.line_no;
      SELECT g.id,g.item_id,g.name,g.size_bytes,g.uploaded_by,g.uploaded_at FROM dbo.issue_item_images g JOIN dbo.issue_items i ON i.id=g.item_id
      WHERE i.batch_id=@batch AND g.deleted_at IS NULL AND EXISTS(SELECT 1 FROM dbo.issue_batches b WHERE b.id=@batch AND ${ISSUE_BATCH_VISIBLE})
      ORDER BY g.item_id,g.id;`, (q) => bindScope(q, actor).input("batch", sql.BigInt, batchId));
    const sets = result.recordsets as unknown as Row[][];
    const row = sets[0]?.[0];
    if (!row) throw new ApiError(404, "issue_batch_not_found", "Issue batch not found.");
    const isApprover = canApproveIssues(actor, batchProject(row));
    const images = (sets[2] ?? []).map(imageDto);
    const batch = batchDto(row);
    return {
      ...batch, isApprover,
      mayEdit: canWrite && (isApprover || batch.createdBy === actor.id),
      mayAdd: canWrite,
      items: (sets[1] ?? []).map((itemRow) => {
        const item = itemDto(itemRow);
        const who: IssueActor = { isApprover, isAssignee: item.assigneeId === actor.id, isCreator: item.createdBy === actor.id, canWrite };
        return {
          ...item, images: images.filter((image) => image.itemId === item.id),
          actions: issueActions(item.state, item.category, who), mayEdit: mayEditIssue(item.state, who),
        };
      }),
    };
  };

  /** One issue with its batch's project, locked for the change, when the caller may see it. */
  const lockItem = async (tx: Transaction, actor: CurrentUser, itemId: number) => {
    const row = (await bindScope(new sql.Request(tx), actor).input("item", sql.BigInt, itemId).query<Row>(`
      SELECT i.*,b.batch_no,b.project_id,p.manager_id,p.lead_engineer_id
      FROM dbo.issue_items i WITH (UPDLOCK,HOLDLOCK) JOIN dbo.issue_batches b ON b.id=i.batch_id LEFT JOIN dbo.projects p ON p.id=b.project_id
      WHERE i.id=@item AND ${ISSUE_BATCH_VISIBLE};`)).recordset[0];
    if (!row) throw new ApiError(404, "issue_not_found", "Issue not found.");
    return row;
  };

  app.get("/api/v1/issue-batches", async (request) => {
    const actor = await reader(request);
    const query = request.query as Record<string, unknown>;
    const tabText = firstQueryValue(query.tab) ?? "all";
    const tab: ListTab = (LIST_TABS as readonly string[]).includes(tabText) ? tabText as ListTab : "all";
    const page = clampedInteger(query.page, 1, 1, 100000), pageSize = clampedInteger(query.pageSize, 50, 1, 100);
    const search = (firstQueryValue(query.search) ?? "").trim().slice(0, 200);
    const projectId = optionalPositiveLong(query.projectId, "Project");
    const result = await database.query<Row>(`
      SELECT COUNT(*) all_count,
        ISNULL(SUM(CASE WHEN b.closed_at IS NULL THEN 1 ELSE 0 END),0) open_count,
        ISNULL(SUM(CASE WHEN agg.approval_count>0 THEN 1 ELSE 0 END),0) approval_count,
        ISNULL(SUM(CASE WHEN agg.mine_count>0 THEN 1 ELSE 0 END),0) mine_count,
        ISNULL(SUM(CASE WHEN b.closed_at IS NOT NULL THEN 1 ELSE 0 END),0) closed_count
      ${LIST_FROM};
      SELECT ${BATCH_COLUMNS},agg.*
      ${LIST_FROM} AND ${TAB_SQL[tab]}
      ORDER BY b.reported_on DESC,b.id DESC OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY;`, (q) => bindScope(q, actor)
      .input("project", sql.BigInt, projectId)
      .input("like", sql.NVarChar(210), search ? `%${escapeLike(search)}%` : null)
      .input("offset", sql.Int, (page - 1) * pageSize).input("size", sql.Int, pageSize));
    const sets = result.recordsets as unknown as Row[][];
    const counts = sets[0]?.[0] ?? {};
    const tabs = { all: Number(counts.all_count ?? 0), open: Number(counts.open_count ?? 0), approval: Number(counts.approval_count ?? 0), mine: Number(counts.mine_count ?? 0), closed: Number(counts.closed_count ?? 0) };
    return { items: (sets[1] ?? []).map(listDto), page, pageSize, total: tabs[tab], tabs, canWrite: await mayWrite(actor), isApprover: canApproveIssues(actor, null) };
  });

  app.get("/api/v1/issue-batches/:id", async (request) => {
    const actor = await reader(request);
    const id = positiveLong((request.params as { id?: string }).id, "Issue batch");
    return readBatch(actor, id, await mayWrite(actor));
  });

  app.post("/api/v1/issue-batches", async (request, reply) => {
    const actor = await writer(request);
    const body = bodyObject(request.body);
    const header = issueBatchInput(body);
    const items = issueItemsInput(body.items);
    const month = bangkokToday().slice(0, 7).replace("-", "");
    const created = await database.transaction(async (tx) => {
      const project = header.projectId ? await checkProject(tx, actor, header.projectId) : null;
      await checkAssignees(tx, items);
      const highest = (await new sql.Request(tx).input("prefix", sql.NVarChar(20), `IS-${month}-%`).query<{ batch_no: string | null }>(
        `SELECT MAX(batch_no) batch_no FROM dbo.issue_batches WITH (UPDLOCK,HOLDLOCK) WHERE batch_no LIKE @prefix;`,
      )).recordset[0]?.batch_no ?? null;
      const batchNo = nextBatchNumber(month, highest);
      const batchId = Number((await new sql.Request(tx)
        .input("no", sql.NVarChar(20), batchNo).input("project", sql.BigInt, header.projectId)
        .input("external", sql.NVarChar(200), header.externalProject).input("customer", sql.NVarChar(200), header.customerName)
        .input("reported_on", sql.Date, header.reportedOn).input("reported_by", sql.NVarChar(200), header.reportedBy)
        .input("note", sql.NVarChar(2000), header.note).input("actor", sql.BigInt, actor.id)
        .query<{ id: number }>(`
          INSERT dbo.issue_batches(batch_no,project_id,external_project,customer_name,reported_on,reported_by,note,created_by)
          OUTPUT inserted.id VALUES(@no,@project,@external,@customer,@reported_on,@reported_by,@note,@actor);`)).recordset[0]!.id);
      const rows = await insertItems(tx, actor, batchId, items, canApproveIssues(actor, project));
      await insertAudit(tx, actor.id, "IssueBatch", batchId, batchNo, "Issue batch created", null, {
        ...header, items: rows.map(({ category, assigneeId, planHours, state }) => ({ category, assigneeId, planHours, state })),
      });
      return { batchId, batchNo };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return reply.status(201).header("Location", `/api/v1/issue-batches/${created.batchId}`).send(await readBatch(actor, created.batchId, true));
  });

  app.put("/api/v1/issue-batches/:id", async (request) => {
    const actor = await writer(request);
    const id = positiveLong((request.params as { id?: string }).id, "Issue batch");
    const body = bodyObject(request.body);
    const header = issueBatchInput(body);
    await database.transaction(async (tx) => {
      const row = (await bindScope(new sql.Request(tx), actor).input("batch", sql.BigInt, id).query<Row>(`
        SELECT b.*,p.manager_id,p.lead_engineer_id FROM dbo.issue_batches b WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.projects p ON p.id=b.project_id
        WHERE b.id=@batch AND ${ISSUE_BATCH_VISIBLE};`)).recordset[0];
      if (!row) throw new ApiError(404, "issue_batch_not_found", "Issue batch not found.");
      if (!(row.row_version as Buffer).equals(parseRowVersion(body.rowVersion))) throw new ApiError(409, "concurrency_conflict", "This batch changed. Reload it and try again.");
      if (!canApproveIssues(actor, batchProject(row)) && Number(row.created_by) !== actor.id) {
        throw new ApiError(403, "issue_batch_edit", "Only the batch's author, the project's PM / Lead or a manager can change it.");
      }
      if (header.projectId && header.projectId !== num(row.project_id)) await checkProject(tx, actor, header.projectId);
      await new sql.Request(tx)
        .input("batch", sql.BigInt, id).input("project", sql.BigInt, header.projectId)
        .input("external", sql.NVarChar(200), header.externalProject).input("customer", sql.NVarChar(200), header.customerName)
        .input("reported_on", sql.Date, header.reportedOn).input("reported_by", sql.NVarChar(200), header.reportedBy)
        .input("note", sql.NVarChar(2000), header.note)
        .query(`UPDATE dbo.issue_batches SET project_id=@project,external_project=@external,customer_name=@customer,reported_on=@reported_on,
          reported_by=@reported_by,note=@note,updated_at=SYSUTCDATETIME() WHERE id=@batch;`);
      await insertAudit(tx, actor.id, "IssueBatch", id, str(row.batch_no), "Issue batch updated", {
        projectId: num(row.project_id), externalProject: str(row.external_project), customerName: str(row.customer_name),
        reportedOn: dateOnly(row.reported_on as Date), reportedBy: str(row.reported_by), note: str(row.note),
      }, header);
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return readBatch(actor, id, true);
  });

  app.post("/api/v1/issue-batches/:id/items", async (request) => {
    const actor = await writer(request);
    const id = positiveLong((request.params as { id?: string }).id, "Issue batch");
    const body = bodyObject(request.body);
    await database.transaction(async (tx) => {
      const row = (await bindScope(new sql.Request(tx), actor).input("batch", sql.BigInt, id).query<Row>(`
        SELECT b.id,b.batch_no,b.project_id,p.manager_id,p.lead_engineer_id,(SELECT COUNT(*) FROM dbo.issue_items x WHERE x.batch_id=b.id) item_count
        FROM dbo.issue_batches b WITH (UPDLOCK,HOLDLOCK) LEFT JOIN dbo.projects p ON p.id=b.project_id
        WHERE b.id=@batch AND ${ISSUE_BATCH_VISIBLE};`)).recordset[0];
      if (!row) throw new ApiError(404, "issue_batch_not_found", "Issue batch not found.");
      const items = issueItemsInput(body.items, Number(row.item_count ?? 0));
      await checkAssignees(tx, items);
      const rows = await insertItems(tx, actor, id, items, canApproveIssues(actor, batchProject(row)));
      await settleBatch(tx, id);
      await insertAudit(tx, actor.id, "IssueBatch", id, str(row.batch_no), "Issues added", null, {
        items: rows.map(({ category, assigneeId, planHours, state }) => ({ category, assigneeId, planHours, state })),
      });
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return readBatch(actor, id, true);
  });

  app.put("/api/v1/issue-items/:id", async (request) => {
    const actor = await writer(request);
    const itemId = positiveLong((request.params as { id?: string }).id, "Issue");
    const body = bodyObject(request.body);
    const input = issueItemInput(body);
    const batchId = await database.transaction(async (tx) => {
      const row = await lockItem(tx, actor, itemId);
      sameVersion(row, body);
      const approver = canApproveIssues(actor, batchProject(row));
      const who: IssueActor = { isApprover: approver, isAssignee: num(row.assignee_id) === actor.id, isCreator: Number(row.created_by) === actor.id, canWrite: true };
      if (!mayEditIssue(row.state as IssueState, who)) throw new ApiError(403, "issue_edit", "Only an open issue's PIC, author or PM / Lead can change it.");
      await checkAssignees(tx, [input]);
      const state = stateAfterEdit(row.state as IssueState, row.category as IssueCategory, input.category, approver);
      await new sql.Request(tx)
        .input("item", sql.BigInt, itemId).input("actor", sql.BigInt, actor.id).input("state", sql.NVarChar(20), state)
        .input("category", sql.NVarChar(20), input.category).input("function_name", sql.NVarChar(200), input.functionName)
        .input("description", sql.NVarChar(4000), input.description).input("assignee", sql.BigInt, input.assigneeId)
        .input("plan_start", sql.Date, input.planStart).input("plan_end", sql.Date, input.planEnd).input("plan_hours", sql.Decimal(7, 2), input.planHours)
        .query(`UPDATE dbo.issue_items SET category=@category,function_name=@function_name,description=@description,assignee_id=@assignee,
          plan_start=@plan_start,plan_end=@plan_end,plan_hours=@plan_hours,state=@state,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@item;`);
      await settleBatch(tx, Number(row.batch_id));
      await insertAudit(tx, actor.id, "IssueItem", itemId, `${str(row.batch_no)}#${Number(row.line_no)}`, "Issue updated", {
        category: row.category, functionName: row.function_name, description: row.description, assigneeId: num(row.assignee_id),
        planStart: dateOnly((row.plan_start ?? null) as Date | null), planEnd: dateOnly((row.plan_end ?? null) as Date | null), planHours: num(row.plan_hours), state: row.state,
      }, { ...input, state });
      return Number(row.batch_id);
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return readBatch(actor, batchId, true);
  });

  app.post("/api/v1/issue-items/:id/:action", async (request) => {
    const params = request.params as { id?: string; action?: string };
    const action = params.action as IssueAction;
    if (!(ISSUE_ACTIONS as readonly string[]).includes(action)) throw new ApiError(404, "issue_action_not_found", "Unknown issue action.");
    const actor = await writer(request);
    const itemId = positiveLong(params.id, "Issue");
    const body = bodyObject(request.body);
    const today = bangkokToday();
    const batchId = await database.transaction(async (tx) => {
      const row = await lockItem(tx, actor, itemId);
      sameVersion(row, body);
      const approver = canApproveIssues(actor, batchProject(row));
      const who: IssueActor = { isApprover: approver, isAssignee: num(row.assignee_id) === actor.id, isCreator: Number(row.created_by) === actor.id, canWrite: true };
      if (!mayTakeIssueAction(action, who)) {
        throw new ApiError(403, "issue_action_forbidden", action === "approve" || action === "reject"
          ? "Only the project's PM / Lead or a manager can approve or reject a Requirement."
          : "Only the issue's PIC, its author or the project's PM / Lead can do this.");
      }
      const state = nextIssueState(action, row.state as IssueState, row.category as IssueCategory, approver);
      if (!state) throw new ApiError(409, "issue_state", `This issue is ${String(row.state)} and cannot take '${action}'.`);
      const update = new sql.Request(tx).input("item", sql.BigInt, itemId).input("actor", sql.BigInt, actor.id).input("state", sql.NVarChar(20), state);
      const after: Record<string, unknown> = { state };
      let set = "";
      if (action === "approve") set = "decided_by=@actor,decided_at=SYSUTCDATETIME(),reason=N''";
      else if (action === "reject" || action === "cancel") {
        const reason = typeof body.reason === "string" ? body.reason.trim() : "";
        if (!reason) throw issueFieldError("reason", "Say why.");
        if (reason.length > 2000) throw issueFieldError("reason", "The reason cannot exceed 2000 characters.");
        update.input("reason", sql.NVarChar(2000), reason);
        set = action === "reject" ? "reason=@reason,decided_by=@actor,decided_at=SYSUTCDATETIME()" : "reason=@reason";
        after.reason = reason;
      } else if (action === "start") {
        const startedOn = parseDateOnly(body.startedOn, "startedOn", true) ?? today;
        update.input("started_on", sql.Date, startedOn);
        set = "started_on=@started_on";
        after.startedOn = startedOn;
      } else if (action === "close") {
        let doneOn: string | null;
        try { doneOn = parseDateOnly(body.doneOn, "doneOn", true); } catch { throw issueFieldError("doneOn", "Actual end must be a date."); }
        if (!doneOn) throw issueFieldError("doneOn", "Actual end is required.");
        if (doneOn > today) throw issueFieldError("doneOn", "Actual end cannot be in the future.");
        const actualHours = hoursInput(body.actualHours, "actualHours", undefined, true)!;
        const fixNote = typeof body.fixNote === "string" ? body.fixNote.trim() : "";
        if (!fixNote) throw issueFieldError("fixNote", "Say what was done.");
        if (fixNote.length > 4000) throw issueFieldError("fixNote", "What was done cannot exceed 4000 characters.");
        const startedOn = dateOnly((row.started_on ?? null) as Date | null);
        if (startedOn && doneOn < startedOn) throw issueFieldError("doneOn", "Actual end cannot be before the day it was started.");
        update.input("done_on", sql.Date, doneOn).input("actual_hours", sql.Decimal(7, 2), actualHours).input("fix_note", sql.NVarChar(4000), fixNote);
        set = "done_on=@done_on,actual_hours=@actual_hours,fix_note=@fix_note,started_on=COALESCE(started_on,@done_on)";
        Object.assign(after, { doneOn, actualHours, fixNote });
      } else if (action === "reopen") {
        set = "done_on=NULL,actual_hours=NULL,reason=N'',decided_by=NULL,decided_at=NULL";
      }
      await update.query(`UPDATE dbo.issue_items SET state=@state,${set ? `${set},` : ""}updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@item;`);
      const closed = await settleBatch(tx, Number(row.batch_id));
      await insertAudit(tx, actor.id, "IssueItem", itemId, `${str(row.batch_no)}#${Number(row.line_no)}`, `Issue ${action}`, { state: row.state }, { ...after, batchClosed: closed });
      return Number(row.batch_id);
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return readBatch(actor, batchId, true);
  });

  app.post("/api/v1/issue-items/:id/images", { config: { rateLimit: ISSUE_IMAGE_UPLOAD_RATE_LIMIT } }, async (request, reply) => {
    const actor = await writer(request);
    const itemId = positiveLong((request.params as { id?: string }).id, "Issue");
    // The issue must be the caller's to see before the file is read at all.
    const visible = await database.query<Row>(`SELECT i.id FROM dbo.issue_items i JOIN dbo.issue_batches b ON b.id=i.batch_id WHERE i.id=@item AND ${ISSUE_BATCH_VISIBLE};`,
      (q) => bindScope(q, actor).input("item", sql.BigInt, itemId));
    if (!visible.recordset[0]) throw new ApiError(404, "issue_not_found", "Issue not found.");
    const upload = await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes);
    const fileName = uploadedFileName(upload.file.filename);
    const extension = validateFileExtension(fileName, ISSUE_IMAGE_EXTENSIONS);
    const key = storageKey(`issues/${itemId}`, extension);
    const write = await writeStoredFile(config.documentStorage, key, upload.file.filepath);
    try {
      const image = await database.transaction(async (tx) => {
        const row = await lockItem(tx, actor, itemId);
        const count = (await new sql.Request(tx).input("item", sql.BigInt, itemId).query<{ n: number }>(
          `SELECT COUNT(*) n FROM dbo.issue_item_images WHERE item_id=@item AND deleted_at IS NULL;`,
        )).recordset[0]?.n ?? 0;
        if (Number(count) >= MAX_ISSUE_IMAGES) throw new ApiError(409, "issue_images_full", `An issue keeps at most ${MAX_ISSUE_IMAGES} pictures.`);
        const inserted = (await new sql.Request(tx)
          .input("item", sql.BigInt, itemId).input("name", sql.NVarChar(500), fileName).input("type", sql.NVarChar(200), contentTypeFor(fileName))
          .input("size", sql.BigInt, write.sizeBytes).input("key", sql.NVarChar(1000), key).input("sha", sql.Char(64), write.sha256).input("actor", sql.BigInt, actor.id)
          .query<Row>(`INSERT dbo.issue_item_images(item_id,name,content_type,size_bytes,storage_key,sha256,uploaded_by)
            OUTPUT inserted.id,inserted.item_id,inserted.name,inserted.size_bytes,inserted.uploaded_by,inserted.uploaded_at
            VALUES(@item,@name,@type,@size,@key,@sha,@actor);`)).recordset[0]!;
        await insertAudit(tx, actor.id, "IssueItem", itemId, `${str(row.batch_no)}#${Number(row.line_no)}`, "Issue picture added", null, {
          id: Number(inserted.id), fileName, sizeBytes: write.sizeBytes, sha256: write.sha256,
        });
        return imageDto(inserted);
      }, sql.ISOLATION_LEVEL.READ_COMMITTED);
      return reply.status(201).send(image);
    } catch (error) {
      if (error instanceof DatabaseCommitOutcomeUnknownError) {
        request.log.fatal({ err: error.originalError, storageKey: key, issueItemId: itemId }, "Issue picture commit outcome unknown; preserving storage file");
      } else {
        await deleteStoredFile(config.documentStorage, key);
      }
      throw error;
    }
  });

  app.get("/api/v1/issue-items/:id/images/:imageId/content", { config: { rateLimit: ISSUE_IMAGE_DOWNLOAD_RATE_LIMIT } }, async (request, reply) => {
    const actor = await reader(request);
    const params = request.params as { id?: string; imageId?: string };
    const itemId = positiveLong(params.id, "Issue"), imageId = positiveLong(params.imageId, "Picture");
    const row = (await database.query<Row>(`
      SELECT g.name,g.content_type,g.storage_key,g.size_bytes,g.sha256 FROM dbo.issue_item_images g
      JOIN dbo.issue_items i ON i.id=g.item_id JOIN dbo.issue_batches b ON b.id=i.batch_id
      WHERE g.id=@image AND g.item_id=@item AND g.deleted_at IS NULL AND ${ISSUE_BATCH_VISIBLE};`,
    (q) => bindScope(q, actor).input("image", sql.BigInt, imageId).input("item", sql.BigInt, itemId))).recordset[0];
    if (!row) throw new ApiError(404, "issue_image_not_found", "Picture not found.");
    return sendStoredFile(request, reply, config.documentStorage, {
      storageKey: str(row.storage_key), fileName: str(row.name), contentType: str(row.content_type),
      sizeBytes: Number(row.size_bytes), sha256: row.sha256 ? str(row.sha256) : null,
    });
  });

  app.delete("/api/v1/issue-items/:id/images/:imageId", async (request, reply) => {
    const actor = await writer(request);
    const params = request.params as { id?: string; imageId?: string };
    const itemId = positiveLong(params.id, "Issue"), imageId = positiveLong(params.imageId, "Picture");
    await database.transaction(async (tx) => {
      const row = await lockItem(tx, actor, itemId);
      const image = (await new sql.Request(tx).input("image", sql.BigInt, imageId).input("item", sql.BigInt, itemId).query<Row>(
        `SELECT id,name,uploaded_by FROM dbo.issue_item_images WITH (UPDLOCK) WHERE id=@image AND item_id=@item AND deleted_at IS NULL;`,
      )).recordset[0];
      if (!image) throw new ApiError(404, "issue_image_not_found", "Picture not found.");
      if (Number(image.uploaded_by) !== actor.id && !canApproveIssues(actor, batchProject(row)) && Number(row.created_by) !== actor.id) {
        throw new ApiError(403, "issue_image_delete", "Only who added the picture, the issue's author or the project's PM / Lead can remove it.");
      }
      await new sql.Request(tx).input("image", sql.BigInt, imageId).query(`UPDATE dbo.issue_item_images SET deleted_at=SYSUTCDATETIME() WHERE id=@image;`);
      await insertAudit(tx, actor.id, "IssueItem", itemId, `${str(row.batch_no)}#${Number(row.line_no)}`, "Issue picture removed", { id: imageId, fileName: str(image.name) }, null);
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return reply.status(204).send();
  });

  /** My Work: the open issues whose PIC is the caller, and how many Requirements wait for them to decide. */
  app.get("/api/v1/me/issues", async (request) => {
    const actor = await reader(request);
    const canWrite = await mayWrite(actor);
    const byRole = canApproveIssues(actor, null);
    const result = await database.query<Row>(`
      SELECT ${ITEM_COLUMNS},b.batch_no,b.project_id,b.external_project,p.project_no,p.name project_name,p.manager_id,p.lead_engineer_id,
        COALESCE(c.name,b.customer_name) customer
      ${ITEM_FROM} JOIN dbo.issue_batches b ON b.id=i.batch_id LEFT JOIN dbo.projects p ON p.id=b.project_id LEFT JOIN dbo.customers c ON c.id=p.customer_id
      WHERE i.assignee_id=@actor AND i.state IN(N'Approval',N'Open',N'Doing')
      ORDER BY CASE WHEN i.plan_end IS NULL THEN 1 ELSE 0 END,i.plan_end,b.reported_on,i.line_no;
      SELECT COUNT(*) n FROM dbo.issue_items i JOIN dbo.issue_batches b ON b.id=i.batch_id LEFT JOIN dbo.projects p ON p.id=b.project_id
      WHERE i.state=N'Approval' AND (@by_role=1 OR p.manager_id=@actor OR p.lead_engineer_id=@actor) AND ${ISSUE_BATCH_VISIBLE};`,
    (q) => bindScope(q, actor).input("by_role", sql.Bit, byRole));
    const sets = result.recordsets as unknown as Row[][];
    return {
      items: (sets[0] ?? []).map((row) => {
        const item = itemDto(row);
        const who: IssueActor = { isApprover: canApproveIssues(actor, batchProject(row)), isAssignee: true, isCreator: item.createdBy === actor.id, canWrite };
        return {
          ...item, batchNo: str(row.batch_no), projectId: num(row.project_id), projectNo: str(row.project_no),
          projectName: str(row.project_name) || str(row.external_project), customerName: str(row.customer),
          actions: issueActions(item.state, item.category, who),
        };
      }),
      waitingApproval: Number(sets[1]?.[0]?.n ?? 0),
    };
  });

  /** Plan: a project's issues for the Gantt, drawn apart from the plan and never counted in it. */
  app.get("/api/v1/projects/:projectId/issues", async (request) => {
    const actor = await reader(request);
    const projectId = positiveLong((request.params as { projectId?: string }).projectId, "Project");
    const result = await database.query<Row>(`
      SELECT ${ITEM_COLUMNS},b.batch_no
      ${ITEM_FROM} JOIN dbo.issue_batches b ON b.id=i.batch_id
      WHERE b.project_id=@project AND i.state NOT IN(N'Cancelled',N'Rejected') AND ${ISSUE_BATCH_VISIBLE}
      ORDER BY b.reported_on,b.id,i.line_no;`, (q) => bindScope(q, actor).input("project", sql.BigInt, projectId));
    return { items: result.recordset.map((row) => ({ ...itemDto(row), batchNo: str(row.batch_no) })) };
  });
}
