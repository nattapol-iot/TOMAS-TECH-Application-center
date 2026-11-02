import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("User accounts exposes role editing only through the dedicated permission", async () => {
  const [screen, client, bootstrap] = await Promise.all([
    readFile(new URL("app/system/production/CoreScreens.tsx", root), "utf8"),
    readFile(new URL("app/system/api-client.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/bootstrap.ts", root), "utf8"),
  ]);
  assert.match(screen, /permissions\.includes\("admin\.manage_roles"\)/);
  assert.match(screen, /canManageRoles \? <td className="master-row-action">/);
  assert.match(screen, /<UserRoleModal/);
  assert.match(screen, /listAccessRoles\(\)/);
  assert.match(screen, /updateUserRole\(member\.id, \{ roleCode, rowVersion: member\.rowVersion \}\)/);
  assert.match(screen, /await refreshBootstrap\(\)/);
  assert.match(client, /apiRequest<\{ items: AccessRole\[\] \}>\("\/api\/v1\/admin\/roles"\)/);
  assert.match(client, /`\/api\/v1\/admin\/users\/\$\{id\}\/role`, \{/);
  assert.match(client, /method: "PUT"/);
  assert.match(bootstrap, /app_user\.row_version/);
  assert.match(bootstrap, /rowVersion: row\.row_version\.toString\("base64"\)/);
});

test("role management migration grants Admin permission and only column-scoped user updates", async () => {
  const [migration, login, deploy, verifier, health, validation] = await Promise.all([
    readFile(new URL("database/migrations/041_user_role_management.sql", root), "utf8"),
    readFile(new URL("database/scripts/010_application_login.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("database/scripts/080_verify_production_baseline.sql", root), "utf8"),
    readFile(new URL("backend-node/src/routes/health.ts", root), "utf8"),
    readFile(new URL("backend-node/src/migration-validation.ts", root), "utf8"),
  ]);
  assert.match(migration, /admin\.manage_roles/);
  assert.match(migration, /role\.code <> N'Admin'/);
  assert.match(migration, /WHERE role\.code = N'Admin'/);
  assert.match(migration, /GRANT UPDATE \(role_id, updated_at\) ON OBJECT::dbo\.users/);
  assert.match(migration, /VALUES \(41,/);
  assert.match(migration, /Legacy role-management migration identity detected at version 037/);
  assert.match(login, /GRANT UPDATE \(role_id, updated_at\) ON OBJECT::dbo\.users/);
  assert.match(login, /REVOKE INSERT, UPDATE, DELETE ON OBJECT::dbo\.users/);
  assert.match(deploy, /:r database\/migrations\/041_user_role_management\.sql/);
  assert.match(deploy, /version BETWEEN 1 AND 95\) <> 95/);
  assert.match(verifier, /\(37, N'Archive generated report PDF\/PPTX exports on NAS storage'\)/);
  assert.match(verifier, /\(41, N'Admin-managed primary user roles with audited least-privilege writes'\)/);
  assert.match(verifier, /minor_id NOT IN/);
  assert.match(verifier, /missing its column-scoped user role update grant/);
  assert.match(health, /REQUIRED_SCHEMA_VERSION/);
  assert.match(health, /mismatchedSchemaVersions/);
  assert.match(validation, /version: 25/);
  assert.match(validation, /version: 41/);
  assert.match(validation, /validateAppliedMigrationIdentities/);
});

test("role update endpoint is concurrency-safe, audited and protects the last Admin", async () => {
  const route = await readFile(new URL("backend-node/src/routes/admin.ts", root), "utf8");
  assert.match(route, /demandPermission\(request, "admin\.manage_roles"\)/);
  assert.match(route, /WITH \(UPDLOCK,HOLDLOCK\)/);
  assert.match(route, /current\.row_version\.equals\(rowVersion\)/);
  assert.match(route, /COUNT_BIG\(\*\) AS count/);
  assert.match(route, /last_admin_required/);
  assert.match(route, /WHERE id=@id AND is_active=1 AND deleted_at IS NULL AND row_version=@row_version/);
  assert.match(route, /insertAudit\(transaction, actor\.id, "UserAccount"/);
  assert.match(route, /"Primary role changed"/);
});

test("Engineer holds inquiry.write so the team can attach files to an Inquiry (owner 2026-11-02)", async () => {
  const [migration, deploy, validation, attachments, screen] = await Promise.all([
    readFile(new URL("database/migrations/094_engineer_inquiry_write.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("backend-node/src/migration-validation.ts", root), "utf8"),
    readFile(new URL("backend-node/src/routes/inquiry-attachments.ts", root), "utf8"),
    readFile(new URL("app/system/production/InquiryScreens.tsx", root), "utf8"),
  ]);
  assert.match(migration, /WHERE r\.code = N'Engineer'\s+AND p\.code = N'inquiry\.write'/);
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM dbo\.role_permissions rp WHERE rp\.role_id = r\.id AND rp\.permission_id = p\.id\)/);
  assert.match(migration, /VALUES \(94, N'Engineer inquiry write'\)/);
  assert.match(deploy, /:r database\/migrations\/094_engineer_inquiry_write\.sql/);
  assert.match(validation, /\{ version: 94, fileName: "094_engineer_inquiry_write\.sql", name: "Engineer inquiry write" \}/);
  // The permission the role now holds is the one the upload checks, on the server and on the screen.
  assert.match(attachments, /demandPermission\(request, "inquiry\.write"\)/);
  assert.match(screen, /const canWrite = !closed && bootstrap\.permissions\.includes\("inquiry\.write"\);/);
});

test("Project Manager, Engineering Manager and Leader hold inquiry.write too (owner 2026-11-02)", async () => {
  const [migration, deploy, validation] = await Promise.all([
    readFile(new URL("database/migrations/095_managers_inquiry_write.sql", root), "utf8"),
    readFile(new URL("database/scripts/020_deploy_fresh_database.sql", root), "utf8"),
    readFile(new URL("backend-node/src/migration-validation.ts", root), "utf8"),
  ]);
  assert.match(migration, /THROW 51950, 'Migration 094 must be applied before migration 095\.'/);
  assert.match(migration, /WHERE r\.code IN \(N'Project Manager', N'Engineering Manager', N'Leader'\)\s+AND p\.code = N'inquiry\.write'/);
  assert.match(migration, /NOT EXISTS \(SELECT 1 FROM dbo\.role_permissions rp WHERE rp\.role_id = r\.id AND rp\.permission_id = p\.id\)/);
  assert.match(migration, /VALUES \(95, N'Managers inquiry write'\)/);
  assert.match(deploy, /:r database\/migrations\/095_managers_inquiry_write\.sql/);
  assert.match(validation, /\{ version: 95, fileName: "095_managers_inquiry_write\.sql", name: "Managers inquiry write" \}/);
});
