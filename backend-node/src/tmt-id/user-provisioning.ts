import sql from "mssql";
import type { Database } from "../db.js";
import { PROVISIONED_EMAIL_FALLBACK_DOMAIN, PROVISIONED_INITIALS_MAX_LENGTH } from "./constants.js";
import type { ProvisionedUser, TmtIdSession } from "./types.js";

export function deriveProvisionedUser(session: TmtIdSession): ProvisionedUser {
  const email = (session.email ?? `${session.preferredUsername}@${PROVISIONED_EMAIL_FALLBACK_DOMAIN}`).trim().toLowerCase();
  const name = (session.name ?? session.preferredUsername).trim();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, PROVISIONED_INITIALS_MAX_LENGTH);
  return { objectId: session.sub, email, name, initials };
}

export type UserProvisioning = {
  ensure(session: TmtIdSession): Promise<void>;
};

// Links a TMT ID sign-in to the account Employee Master already made for that email
// (dbo.sync_employee_directory_user creates it with the employee's department). It never
// creates an account: since 2026-10-05 only registered people may sign in, so an unknown
// email meets user_not_registered instead of becoming whatever TMT_ID_DEFAULT_ROLE_CODE said.
// entra_object_id holds the Keycloak sub in TmtId mode, the key CurrentUserService joins on.
// dbo.link_registered_sign_in (migration 066) fills it only on an account that has no TMT ID
// yet, as database/scripts/030_provision_user.sql does, so an email claim cannot take over an
// account already linked to someone else.
// A sign-in that links to no account is kept in dbo.sign_in_requests (migration 079) with the
// email it was matched on, so Employee Master lists who is waiting and an administrator adds
// exactly that email; once the person's sign-in links, the row goes.
export const LINK_SIGN_IN_SQL = `EXEC dbo.link_registered_sign_in @object_id = @object_id, @email = @email;
      IF EXISTS (SELECT 1 FROM dbo.users WHERE entra_object_id = @object_id AND deleted_at IS NULL)
        DELETE FROM dbo.sign_in_requests WHERE subject = @object_id;
      ELSE
        MERGE dbo.sign_in_requests WITH (HOLDLOCK) AS request
        USING (SELECT @object_id AS subject) AS attempt ON request.subject = attempt.subject
        WHEN MATCHED THEN UPDATE SET email = @email, name = @name, username = @username,
          attempts = request.attempts + 1, last_attempt_at = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (subject, email, name, username) VALUES (@object_id, @email, @name, @username);`;

export function createUserProvisioning(database: Pick<Database, "query">): UserProvisioning {
  return {
    async ensure(session) {
      const user = deriveProvisionedUser(session);
      await database.query(LINK_SIGN_IN_SQL, (request) => {
        request.input("object_id", sql.NVarChar(64), user.objectId);
        request.input("email", sql.NVarChar(256), user.email);
        request.input("name", sql.NVarChar(200), user.name.slice(0, 200));
        request.input("username", sql.NVarChar(200), session.preferredUsername.slice(0, 200));
      });
    },
  };
}
