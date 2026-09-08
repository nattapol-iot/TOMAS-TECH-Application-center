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

// Keeps the same identity key CurrentUserService joins on (entra_object_id holds the Keycloak
// sub in TmtId mode) and mirrors database/scripts/030_provision_user.sql: a row already known by
// email is promoted to this object id instead of tripping the unique email constraint.
export function createUserProvisioning(database: Pick<Database, "query">, roleCode: string | undefined): UserProvisioning | null {
  if (!roleCode) return null;
  return {
    async ensure(session) {
      const user = deriveProvisionedUser(session);
      await database.query(
        `
        DECLARE @role_id bigint = (SELECT id FROM dbo.roles WHERE code = @role_code);
        IF @role_id IS NULL THROW 51900, 'TMT_ID_DEFAULT_ROLE_CODE does not match any dbo.roles code.', 1;
        IF EXISTS (SELECT 1 FROM dbo.users WHERE entra_object_id = @object_id) RETURN;
        IF EXISTS (SELECT 1 FROM dbo.users WHERE email = @email AND deleted_at IS NULL)
          UPDATE dbo.users
             SET entra_object_id = @object_id, updated_at = SYSUTCDATETIME()
           WHERE email = @email AND deleted_at IS NULL;
        ELSE
          INSERT INTO dbo.users(entra_object_id, email, name, initials, role_id)
          VALUES (@object_id, @email, @name, @initials, @role_id);
        `,
        (request) => {
          request.input("role_code", sql.NVarChar(50), roleCode);
          request.input("object_id", sql.NVarChar(64), user.objectId);
          request.input("email", sql.NVarChar(256), user.email);
          request.input("name", sql.NVarChar(200), user.name);
          request.input("initials", sql.NVarChar(10), user.initials);
        },
      );
    },
  };
}
