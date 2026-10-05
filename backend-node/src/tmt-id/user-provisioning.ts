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
export function createUserProvisioning(database: Pick<Database, "query">): UserProvisioning {
  return {
    async ensure(session) {
      const user = deriveProvisionedUser(session);
      await database.query(
        "EXEC dbo.link_registered_sign_in @object_id = @object_id, @email = @email;",
        (request) => {
          request.input("object_id", sql.NVarChar(64), user.objectId);
          request.input("email", sql.NVarChar(256), user.email);
        },
      );
    },
  };
}
