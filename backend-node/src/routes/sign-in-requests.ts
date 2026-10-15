import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import type { CurrentUserService } from "../users.js";

// People who signed in with TMT ID but have no Engineering Center account yet (dbo.sign_in_requests,
// migration 079), for the administrators who keep Employee Master. A request whose sign-in has since
// linked to an account is not listed. Each one says where it stands:
// - new: nobody has this email; adding the employee lets them in on their next sign-in.
// - registered: an account with this email now exists and is free; they only need to sign in again.
// - linkedElsewhere: the account with this email is already linked to another TMT ID sign-in (often the
//   other sign-in button, Microsoft or LINE WORKS). Adding the employee again does not help; they use the
//   sign-in they used before, or an operator moves the link (database/scripts/030_provision_user.sql).

type RequestRow = {
  subject: string; email: string; name: string; username: string; attempts: number | string;
  first_attempt_at: Date | string; last_attempt_at: Date | string; status: string;
};

export type SignInRequest = {
  subject: string; email: string; name: string; username: string; attempts: number;
  firstAttemptAt: string; lastAttemptAt: string; status: "new" | "registered" | "linkedElsewhere";
};

export const SIGN_IN_REQUESTS_SQL = `
      SELECT r.subject,r.email,r.name,r.username,r.attempts,r.first_attempt_at,r.last_attempt_at,
        CASE
          WHEN EXISTS(SELECT 1 FROM dbo.users u WHERE u.email=r.email AND u.deleted_at IS NULL
            AND u.entra_object_id IS NOT NULL AND u.entra_object_id<>r.subject AND u.entra_object_id NOT LIKE N'team-test:%') THEN N'linkedElsewhere'
          WHEN EXISTS(SELECT 1 FROM dbo.users u WHERE u.email=r.email AND u.deleted_at IS NULL) THEN N'registered'
          ELSE N'new' END status
      FROM dbo.sign_in_requests r
      WHERE NOT EXISTS(SELECT 1 FROM dbo.users u WHERE u.entra_object_id=r.subject AND u.deleted_at IS NULL)
      ORDER BY r.last_attempt_at DESC,r.subject;`;

type AccountRow = {
  id: number | string; email: string; name: string; role: string; department: string | null;
  created_at: Date | string; last_used_at: Date | string | null; employee_id: number | string | null; employee_no: number | null;
};

export type UnlinkedAccount = {
  userId: number; email: string; name: string; role: string; department: string;
  createdAt: string; lastUsedAt: string | null;
  /** An active employee already has this email but does not point at the account; saving that employee links it. */
  employeeId: number | null; employeeNo: number | null;
};

// Accounts that can sign in but that no active Employee Master record points at, so they belong to no
// department. Until 2026-10-05 the first TMT ID sign-in created one for anyone, as Admin and with no
// department. Adding the employee with the same email links the account and gives it the department;
// the role is not changed. database/scripts/045_list_accounts_outside_employee_master.sql reads the same rows.
export const UNLINKED_ACCOUNTS_SQL = `
      SELECT u.id,u.email,u.name,r.code role,u.department,u.created_at,
        (SELECT MAX(s.last_at) FROM dbo.activity_sessions s WHERE s.user_id=u.id) last_used_at,
        employee.id employee_id,employee.employee_no
      FROM dbo.users u
      JOIN dbo.roles r ON r.id=u.role_id
      LEFT JOIN dbo.employees employee ON employee.email=u.email AND employee.is_active=1 AND employee.deleted_at IS NULL
      WHERE u.is_active=1 AND u.deleted_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM dbo.employees linked WHERE linked.user_id=u.id AND linked.is_active=1 AND linked.deleted_at IS NULL)
      ORDER BY CASE WHEN r.code=N'Admin' THEN 0 ELSE 1 END,u.name,u.id;`;

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value));

export function registerSignInRequestRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  // The same right that adds employees: an added employee is what lets the person in.
  app.get("/api/v1/master/sign-in-requests", async (request): Promise<SignInRequest[]> => {
    await users.demandPermission(request, "master.write");
    const result = await database.query<RequestRow>(SIGN_IN_REQUESTS_SQL);
    return result.recordset.map((row) => ({
      subject: row.subject,
      email: row.email,
      name: row.name,
      username: row.username,
      attempts: Number(row.attempts),
      firstAttemptAt: iso(row.first_attempt_at),
      lastAttemptAt: iso(row.last_attempt_at),
      status: row.status === "linkedElsewhere" || row.status === "registered" ? row.status : "new",
    }));
  });

  app.get("/api/v1/master/unlinked-accounts", async (request): Promise<UnlinkedAccount[]> => {
    await users.demandPermission(request, "master.write");
    const result = await database.query<AccountRow>(UNLINKED_ACCOUNTS_SQL);
    return result.recordset.map((row) => ({
      userId: Number(row.id),
      email: row.email,
      name: row.name,
      role: row.role,
      department: row.department ?? "",
      createdAt: iso(row.created_at),
      lastUsedAt: row.last_used_at == null ? null : iso(row.last_used_at),
      employeeId: row.employee_id == null ? null : Number(row.employee_id),
      employeeNo: row.employee_no == null ? null : Number(row.employee_no),
    }));
  });

  // Not someone to let in. A later sign-in by the same person lists them again.
  app.delete("/api/v1/master/sign-in-requests/:subject", async (request, reply) => {
    await users.demandPermission(request, "master.write");
    const subject = (request.params as { subject?: string }).subject?.trim() ?? "";
    if (!subject || subject.length > 64) throw new ApiError(400, "validation_failed", "A sign-in request is named by its TMT ID subject.");
    await database.query("DELETE FROM dbo.sign_in_requests WHERE subject=@subject;", (sqlRequest) => {
      sqlRequest.input("subject", sql.NVarChar(64), subject);
    });
    return reply.code(204).send();
  });
}
