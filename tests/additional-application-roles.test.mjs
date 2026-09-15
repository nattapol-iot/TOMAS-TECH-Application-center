import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("migration 051 resolves roles and permissions per account and opens the grant writes", async () => {
  const [migration, login] = await Promise.all([
    read("database/migrations/051_additional_application_roles.sql"),
    read("database/scripts/010_application_login.sql"),
  ]);

  assert.match(migration, /VALUES\(51,N'Additional application roles carry their full permission set'\)/);
  assert.match(migration, /Migration 050 required/);

  // Both roles feed one view: the primary role on dbo.users and every live grant.
  assert.match(migration, /CREATE OR ALTER VIEW dbo\.user_effective_roles/);
  assert.match(migration, /JOIN dbo\.roles r ON r\.id=u\.role_id AND r\.is_active=1/);
  assert.match(migration, /JOIN dbo\.user_business_roles b ON b\.user_id=u\.id AND b\.revoked_at IS NULL/);
  // A disabled account resolves to no roles at all.
  assert.ok(migration.match(/WHERE u\.is_active=1 AND u\.deleted_at IS NULL/g)?.length >= 2);

  // Permissions come from those roles with no code filter -- that is the Phase 1 decision.
  assert.match(migration, /CREATE OR ALTER VIEW dbo\.user_effective_permissions/);
  assert.match(migration, /FROM dbo\.user_effective_roles er/);
  assert.doesNotMatch(migration, /p\.code LIKE N''signing\./);

  // Granting inserts and revoking stamps a column; history is never deleted.
  assert.match(migration, /GRANT INSERT ON OBJECT::dbo\.user_business_roles/);
  assert.match(migration, /GRANT UPDATE \(granted_by, granted_at, reason, revoked_at\) ON OBJECT::dbo\.user_business_roles/);
  assert.doesNotMatch(migration, /GRANT DELETE ON OBJECT::dbo\.user_business_roles/);

  // A fresh database gets the same grants without waiting for the migration.
  assert.match(login, /GRANT INSERT ON OBJECT::dbo\.user_business_roles/);
  assert.match(login, /GRANT UPDATE \(granted_by, granted_at, reason, revoked_at\) ON OBJECT::dbo\.user_business_roles/);
  assert.match(login, /GRANT SELECT ON dbo\.user_effective_permissions/);
});

test("the migration number is not already taken", async () => {
  const files = await readdir(new URL("database/migrations/", root));
  const fiftyOne = files.filter((name) => name.startsWith("051_"));
  assert.deepEqual(fiftyOne, ["051_additional_application_roles.sql"]);
});

test("permission checks read the effective set, never the primary role alone", async () => {
  const [users, bootstrap, schedule, siteVisit] = await Promise.all([
    read("backend-node/src/users.ts"),
    read("backend-node/src/routes/bootstrap.ts"),
    read("backend-node/src/schedule-service.ts"),
    read("backend-node/src/site-visit-common.ts"),
  ]);

  // The gate every route calls.
  assert.match(users, /FROM dbo\.user_effective_permissions WHERE user_id=@user_id AND code=@permission/);
  assert.doesNotMatch(users, /WHERE r\.code = @role AND p\.code = @permission/);
  // The identity itself carries the whole role set.
  assert.match(users, /FROM dbo\.user_effective_roles er WHERE er\.user_id = u\.id/);
  assert.match(users, /roles: \[\.\.\.new Set\(\[row\.role/);

  // The navigation is built from exactly what the API enforces.
  assert.match(bootstrap, /SELECT code FROM dbo\.user_effective_permissions WHERE user_id = @user_id ORDER BY code;/);
  assert.match(bootstrap, /SELECT code FROM dbo\.user_effective_permissions WHERE user_id = @user_id\s*\n?\s*\)/);

  // The two shared permission helpers are keyed by account, not by role code.
  assert.match(schedule, /export async function permissionFor\(database: Database, userId: number, permission: string\)/);
  assert.match(schedule, /FROM dbo\.user_effective_permissions WHERE user_id=@user_id AND code=@permission/);
  assert.match(siteVisit, /export async function rolePermissions\(database: Database, userId: number\)/);
  assert.match(siteVisit, /SELECT code FROM dbo\.user_effective_permissions WHERE user_id=@user_id/);
});

test("role-gated decisions read every held role", async () => {
  const [scope, dashboard, procurement, signing] = await Promise.all([
    read("backend-node/src/project-scope.ts"),
    read("backend-node/src/routes/executive-dashboard.ts"),
    read("backend-node/src/routes/purchase-requisitions.ts"),
    read("backend-node/src/signing-core.ts"),
  ]);

  assert.match(scope, /rolesOf\(user\)\.some\(\(role\) => ELEVATED_ROLES\.has\(role\)\)/);
  assert.match(scope, /rolesOf\(user\)\.some\(\(role\) => MY_WORK_ELEVATED_ROLES\.has\(role\)\)/);
  assert.doesNotMatch(scope, /ELEVATED_ROLES\.has\(user\.role\)/);

  // The dashboard's own comment used to say additional roles never widened its scope.
  assert.match(dashboard, /INSERT @roles SELECT code FROM dbo\.user_effective_roles WHERE user_id=@actor;/);
  assert.doesNotMatch(dashboard, /Additional signing roles never expand reporting scope/);

  // A step addressed to a role reaches everyone holding it, additional grant included.
  assert.match(procurement, /cs\.approver_role IN\(SELECT code FROM dbo\.user_effective_roles WHERE user_id=@actor\)/);
  assert.match(procurement, /rolesOf\(actor\)\.includes\(String\(current\.approver_role \?\? ""\)\)/);
  assert.match(signing, /r\.code IN \(SELECT code FROM dbo\.user_effective_roles WHERE user_id = @actor\)/);
});

test("an engineer can publish a module template; retiring one still needs master.write", async () => {
  const [route, screen, editor] = await Promise.all([
    read("backend-node/src/routes/module-templates.ts"),
    read("app/system/production/ModuleTemplateScreens.tsx"),
    read("app/system/production/ModuleTemplateEditor.tsx"),
  ]);

  // Saving a template as ready is estimating work, gated by estimate.write only.
  assert.doesNotMatch(route, /if \(input\.status === "Active"\) await users\.demandPermission\(request, "master\.write"\)/);
  for (const anchor of ['app.post("/api/v1/module-templates"', 'app.put("/api/v1/module-templates/:id"']) {
    const at = route.indexOf(anchor);
    assert.ok(at > -1, anchor);
    assert.match(route.slice(at, at + 300), /demandPermission\(request, "estimate\.write"\)/, anchor);
  }
  // Retiring a template remains master-data work.
  const retire = route.indexOf('app.post("/api/v1/module-templates/:id/retire"');
  assert.ok(retire > -1);
  assert.match(route.slice(retire, retire + 300), /demandPermission\(request, "master\.write"\)/);

  // The radio the person clicks follows the same permission the API checks.
  assert.match(screen, /canPublish=\{canEdit\}/);
  assert.match(screen, /const canEdit = bootstrap\.permissions\.includes\("estimate\.write"\)/);
  assert.match(screen, /const canRetire = bootstrap\.permissions\.includes\("master\.write"\)/);
  assert.match(editor, /disabled=\{!canPublish\}/);
});

test("the admin screen can grant and revoke an additional role", async () => {
  const [client, screen] = await Promise.all([
    read("app/system/api-client.ts"),
    read("app/system/production/CoreScreens.tsx"),
  ]);

  assert.match(client, /apiRequest<UserRoleAssignment>\(`\/api\/v1\/admin\/users\/\$\{id\}\/roles`\)/);
  assert.match(client, /grantUserRole = \(id: number, input: \{ roleCode: string; reason: string \}\)/);
  assert.match(client, /revokeUserRole = \(id: number, roleCode: string\)/);
  assert.match(client, /encodeURIComponent\(roleCode\)/);
  assert.match(client, /roles: string\[\];/);

  // Every grant records why, and the list never offers a role the account already has.
  assert.match(screen, /if \(!extraCode \|\| !extraReason\.trim\(\)\) return;/);
  assert.match(screen, /roles\.filter\(\(role\) => role\.code !== member\.role && !additional\.some\(\(held\) => held\.code === role\.code\)\)/);
  // A role change refreshes permissions without claiming the primary role moved.
  assert.match(screen, /onRolesChanged=\{async \(message\) => \{/);
});
