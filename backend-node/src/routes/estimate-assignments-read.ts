import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { dateOnly, firstQueryValue } from "../http.js";
import type { CurrentUserService } from "../users.js";

/* Work assigned to an engineer has to be findable before it is started.
   Nothing queried "estimate sections assigned to me": the estimate list filters
   on dbo.estimates.owner_id, which is the estimate owner, not the section
   assignee, so a not-yet-started assignment was invisible until the section had
   been worked on. This read answers that question directly, for the caller only. */

type AssignmentRow = {
  assignment_id: number | string; estimate_id: number | string; estimate_no: string; project_name: string;
  customer_name: string; inquiry_no: string; revision: number; estimate_status: string; estimate_due_date: Date | string;
  estimate_owner_id: number | string; estimate_owner_name: string; section: string; role: string;
  owner_id: number | string; owner_name: string; support_id: number | string | null; support_name: string | null;
  due_date: Date | string; status: string; progress: number | string; comment: string | null;
  cost_line_count: number | string; updated_at: Date | string;
};

/** Assignment states that are finished work, and estimate states that are closed to editing. */
const CLOSED_ASSIGNMENT_STATUSES = ["Completed", "Reviewed"];
const CLOSED_ESTIMATE_STATUSES = ["Approved", "Locked"];

export function registerEstimateAssignmentReadRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/me/estimate-assignments", async (request) => {
    await users.demandPermission(request, "estimate.read");
    const actor = await users.required(request);
    const includeClosed = firstQueryValue((request.query as Record<string, unknown>).includeClosed) === "true";

    /* Authorisation is the WHERE clause, not a later filter: only rows where the
       caller is the section's responsible or support engineer are ever selected,
       so this endpoint cannot leak another engineer's queue.
       Assignments are keyed by (estimate_id, section) and the ledger they govern
       is the estimate's current revision, so the count joins e.revision. */
    const result = await database.query<AssignmentRow>(`
      SELECT a.id assignment_id,e.id estimate_id,e.estimate_no,e.project_name,c.name customer_name,i.inquiry_no,
        e.revision,e.status estimate_status,e.due_date estimate_due_date,e.owner_id estimate_owner_id,owner.name estimate_owner_name,
        a.section,CASE WHEN a.owner_id=@actor THEN N'Responsible' ELSE N'Support' END role,
        a.owner_id,assignee.name owner_name,a.support_id,support.name support_name,
        a.due_date,a.status,a.progress,a.comment,e.updated_at,
        (SELECT COUNT_BIG(*) FROM dbo.cost_items line WHERE line.estimate_id=e.id AND line.revision=e.revision
          AND line.deleted_at IS NULL AND line.category_code=LEFT(a.section,2)) cost_line_count
      FROM dbo.estimate_assignments a
      INNER JOIN dbo.estimates e ON e.id=a.estimate_id
      INNER JOIN dbo.inquiries i ON i.id=e.inquiry_id
      INNER JOIN dbo.customers c ON c.id=e.customer_id
      INNER JOIN dbo.users owner ON owner.id=e.owner_id
      INNER JOIN dbo.users assignee ON assignee.id=a.owner_id
      LEFT JOIN dbo.users support ON support.id=a.support_id
      WHERE (a.owner_id=@actor OR a.support_id=@actor)
        AND e.deleted_at IS NULL AND i.deleted_at IS NULL
        AND (@include_closed=1 OR (a.status NOT IN(${CLOSED_ASSIGNMENT_STATUSES.map((status) => `N'${status}'`).join(",")})
          AND e.status NOT IN(${CLOSED_ESTIMATE_STATUSES.map((status) => `N'${status}'`).join(",")})))
      ORDER BY a.due_date,e.estimate_no,a.section;`,
      (sqlRequest) => { sqlRequest.input("actor", sql.BigInt, actor.id); sqlRequest.input("include_closed", sql.Bit, includeClosed); });

    return result.recordset.map((row) => ({
      assignmentId: Number(row.assignment_id),
      estimateId: Number(row.estimate_id),
      estimateNumber: row.estimate_no,
      inquiryNumber: row.inquiry_no,
      projectName: row.project_name,
      customerName: row.customer_name,
      revision: Number(row.revision),
      estimateStatus: row.estimate_status,
      estimateDueDate: dateOnly(row.estimate_due_date),
      estimateOwnerId: Number(row.estimate_owner_id),
      estimateOwnerName: row.estimate_owner_name,
      section: row.section,
      sectionCode: row.section.slice(0, 2),
      role: row.role,
      ownerId: Number(row.owner_id),
      ownerName: row.owner_name,
      supportId: row.support_id === null ? null : Number(row.support_id),
      supportName: row.support_name,
      dueDate: dateOnly(row.due_date),
      status: row.status,
      progress: Number(row.progress),
      comment: row.comment,
      costLineCount: Number(row.cost_line_count),
      updatedAt: row.updated_at,
    }));
  });
}
