import sql from "mssql";
import type { Transaction } from "mssql";
import { ApiError } from "./errors.js";
import { demandAssignedLeaf, readProject, readTask } from "./schedule-service.js";

export function drawingApprovers(ownerId: number, leaderId: number | null, managerId: number | null) {
  if (!leaderId || !managerId) throw new ApiError(409, "drawing_approvers_missing", "Assign a project Leader and Manager before submitting a drawing.");
  if (new Set([ownerId, leaderId, managerId]).size !== 3) {
    throw new ApiError(409, "drawing_separation_required", "Drawing Member, Leader and Manager must be three different people.");
  }
  return { DRAWN_BY: ownerId, CHECKED_BY: leaderId, APPROVED_BY: managerId };
}

/** Assignment, not a job-title string or a task-name keyword, authorizes import. */
export async function demandDrawingTask(transaction: Transaction, projectId: number, taskId: number, memberId: number) {
  const task = await readTask(transaction, taskId);
  if (task.projectId !== projectId) throw new ApiError(400, "drawing_task_project_mismatch", "The design task belongs to another project.");
  const project = await readProject(transaction, projectId, true);
  if (project.status === "Closed") throw new ApiError(409, "project_closed", "A closed project cannot release new drawings.");
  await demandAssignedLeaf(transaction, task, memberId);
}

export async function loadDrawingApprovers(transaction: Transaction, projectId: number, ownerId: number) {
  const query = new sql.Request(transaction);
  query.input("project", sql.BigInt, projectId);
  const row = (await query.query<{ lead_engineer_id: number | null; manager_id: number | null }>(`
    SELECT lead_engineer_id,manager_id FROM dbo.projects WITH (UPDLOCK,HOLDLOCK)
    WHERE id=@project AND deleted_at IS NULL;
  `)).recordset[0];
  const result = drawingApprovers(ownerId, row?.lead_engineer_id ? Number(row.lead_engineer_id) : null, row?.manager_id ? Number(row.manager_id) : null);
  for (const id of Object.values(result)) {
    const user = new sql.Request(transaction);
    user.input("id", sql.BigInt, id);
    const eligible = (await user.query(`SELECT u.id FROM dbo.users u
      JOIN dbo.user_signing_permissions p ON p.user_id=u.id AND p.code=N'signing.sign'
      WHERE u.id=@id AND u.is_active=1 AND u.deleted_at IS NULL;`)).recordset[0];
    if (!eligible) throw new ApiError(409, "drawing_signer_ineligible", "A drawing signer is inactive or lacks signing.sign permission.");
  }
  return result;
}
