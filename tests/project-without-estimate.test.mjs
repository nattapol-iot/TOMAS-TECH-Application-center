import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
// Working copies may be CRLF; the slices below look for "\n}\n".
const source = async (path) => (await readFile(new URL(path, root), "utf8")).replace(/\r\n/g, "\n");

test("migration 078 makes a project's inquiry and estimate optional and keeps one project per estimate", async () => {
  const [migration, validation, deploy] = await Promise.all([
    source("database/migrations/078_project_without_estimate.sql"),
    source("backend-node/src/migration-validation.ts"),
    source("database/scripts/020_deploy_fresh_database.sql"),
  ]);
  assert.match(migration, /ALTER TABLE dbo\.projects ALTER COLUMN inquiry_id bigint NULL;/);
  assert.match(migration, /ALTER TABLE dbo\.projects ALTER COLUMN estimate_id bigint NULL;/);
  // A UNIQUE constraint on a nullable column would allow a single project without an estimate.
  assert.match(migration, /ALTER TABLE dbo\.projects DROP CONSTRAINT UQ_projects_estimate;/);
  assert.match(migration, /CREATE UNIQUE INDEX UX_projects_estimate ON dbo\.projects\(estimate_id\) WHERE estimate_id IS NOT NULL;/);
  for (const key of ["FK_projects_inquiry FOREIGN KEY \\(inquiry_id\\) REFERENCES dbo\\.inquiries\\(id\\)", "FK_projects_estimate FOREIGN KEY \\(estimate_id\\) REFERENCES dbo\\.estimates\\(id\\)"]) {
    assert.match(migration, new RegExp(`WITH CHECK ADD CONSTRAINT ${key}`), "the foreign keys come back");
  }
  assert.match(migration, /VALUES \(78, N'Project without estimate'\)/);
  assert.match(validation, /\{ version: 78, fileName: "078_project_without_estimate\.sql", name: "Project without estimate" \}/);
  assert.match(deploy, /:r database\/migrations\/078_project_without_estimate\.sql/);
  assert.match(deploy, /\(78, N'Project without estimate'\)/);
});

test("Create project keeps what was typed when saving fails", async () => {
  const screens = await source("app/system/production/CoreScreens.tsx");
  const modal = screens.match(/export function CreateProjectModal\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(modal, "CreateProjectModal found");
  // The save error sits beside the buttons; "Could not load / Try again" is only for loading the options.
  assert.match(modal, /catch \(requestError\) \{ setSaveError\(toError\(requestError\)\); \}/);
  assert.match(modal, /\{saveError \? <span className="project-create-error" role="alert">/);
  assert.match(modal, /\{loadError \? <LoadError message=\{t\(loadError\)\}/);
  // Reloading the options never clears a chosen estimate, lead engineer or site.
  assert.match(modal, /if\(defaultsApplied\.current\)return;\n\s*defaultsApplied\.current=true;/);
  assert.match(modal, /estimateId:current\.estimateId\|\|first\?\.id\|\|0/);
});

test("Create project offers 'without an estimate' only to those allowed, with customer, name and type", async () => {
  const [screens, client, routes] = await Promise.all([source("app/system/production/CoreScreens.tsx"), source("app/system/api-client.ts"), source("backend-node/src/routes/projects.ts")]);
  const modal = screens.match(/export function CreateProjectModal\([\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.match(modal, /const canChooseSource = !initialEstimateId && Boolean\(options\.canCreateWithoutEstimate\);/);
  assert.match(modal, /\.\.\.\(standalone \? \{ withoutEstimate: true, customerId: chosenCustomer, projectName: projectName\?\.trim\(\), projectType \} : \{ estimateId \}\)/);
  for (const label of ["Customer \\*", "Project name \\*", "Project type \\*"]) assert.match(modal, new RegExp(`<LocalizedText text=\\{"${label}"\\} />`));
  assert.match(client, /withoutEstimate\?: boolean;/);
  assert.match(routes, /canCreateWithoutEstimate: canCreateWithoutEstimate\(actor\) \};/);
  // Files and the CRM order only follow a project that came from an inquiry.
  assert.match(routes, /const documentsTransferred = source\.inquiryId === null \|\| input\.estimateId === null \? 0/);
  assert.match(routes, /if \(source\.inquiryId !== null\) await confirmOpportunityOrder\(/);
});

test("project mail links and bell notifications open the project's plan", async () => {
  const [app, email] = await Promise.all([source("app/system/ProductionApp.tsx"), source("backend-node/src/email.ts")]);
  assert.match(app, /const project = window\.location\.hash\.match\(\/\^#project\\\/\(\\d\+\)\(\?:\\\/task\\\/\(\\d\+\)\)\?\$\/\);/);
  assert.match(app, /openProjectSchedule\(Number\(project\[1\]\), project\[2\] \? Number\(project\[2\]\) : undefined\);/);
  assert.match(app, /if \(item\.entityType === "Project" && item\.entityId\) openProjectSchedule\(item\.entityId\);/);
  assert.match(email, /#project\/\$\{message\.projectId\}">/);
  assert.match(email, /#project\/\$\{message\.projectId\}\/task\/\$\{message\.taskId\}">/);
});

test("projects without an estimate still appear in the cost report and on the CRM customer", async () => {
  const [reports, customers, analytics] = await Promise.all([source("backend-node/src/routes/reports.ts"), source("backend-node/src/routes/crm-customers.ts"), source("app/system/production/AdminAnalyticsScreens.tsx")]);
  assert.match(reports, /FROM dbo\.projects p LEFT JOIN dbo\.estimates e ON e\.id=p\.estimate_id\n\s*LEFT JOIN dbo\.v_estimate_totals totals/);
  assert.match(customers, /FROM dbo\.projects p LEFT JOIN dbo\.inquiries i ON i\.id=p\.inquiry_id/);
  assert.match(analytics, /report\.project\.estimateNumber \? `Estimate \$\{report\.project\.estimateNumber\}` : uiText\("Project without an estimate"\)/);
});
