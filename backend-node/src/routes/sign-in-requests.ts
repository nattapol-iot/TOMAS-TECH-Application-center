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
