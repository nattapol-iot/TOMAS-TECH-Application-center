// Explicit SQL integration entry point (not part of the fast unit-test glob).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createSqlIntegrationConfig } from "./sql-integration-config.js";

const sqlTest = createSqlIntegrationConfig("Handover");
const name = sqlTest.databaseName;
assert.match(name, /^IoTTeamCenter_HandoverCI_[a-f0-9]{32}$/);
const sqlArgs = sqlTest.sqlcmdArgs;
const run = (statement: string) => execFileSync("sqlcmd", [...sqlArgs, "-d", name, "-Q", statement], sqlTest.sqlcmdOptions);
const storageRoot = sqlTest.storageRoot;
let application: Awaited<ReturnType<typeof buildApp>> | undefined;
let checks = 0;

function multipart(fileName: string, bytes: Buffer, fields: Record<string, string>) {
  const boundary = `----handover-${randomUUID()}`;
  const fieldParts = Object.entries(fields).map(([key, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
  ).join("");
  const head = Buffer.from(`${fieldParts}--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n`);
  return {
    payload: Buffer.concat([head, bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function filesBelow(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

try {
  execFileSync("sqlcmd", [...sqlArgs, "-i", sqlTest.freshDatabaseScript, "-v", `DatabaseName=${name}`], sqlTest.sqlcmdOptions);
  run(`INSERT dbo.users(entra_object_id,email,name,role_id)
    SELECT v.identity_id,v.identity_id+N'@test.invalid',v.identity_id,r.id
    FROM (VALUES(N'handover-sales',N'Sales Engineer'),(N'handover-engineer',N'Engineer'),
      (N'handover-manager',N'Engineering Manager'),(N'handover-admin',N'Admin'),(N'handover-outsider',N'Engineer')) v(identity_id,role_code)
    JOIN dbo.roles r ON r.code=v.role_code;
    DECLARE @admin bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'handover-admin');
    DECLARE @engineer bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'handover-engineer');
    UPDATE dbo.users SET department=N'Engineering' WHERE entra_object_id=N'handover-engineer';
    INSERT dbo.visit_types(code,name_en,created_by,updated_by) VALUES(N'HANDOVER-CI',N'TEST ONLY handover visit',@admin,@admin);
    INSERT dbo.visit_skills(code,name_en,created_by,updated_by) VALUES(N'HANDOVER-SKILL',N'TEST ONLY inspection skill',@admin,@admin);
    INSERT dbo.engineer_skills(user_id,skill_id,proficiency,created_by,updated_by) VALUES(@engineer,SCOPE_IDENTITY(),N'Advanced',@admin,@admin);
    INSERT dbo.engineering_rates(level,department,engineering_hourly,engineering_daily,installation_hourly,installation_daily,effective_from,created_by)
      VALUES(N'Engineer',N'Engineering',100,800,120,960,'2020-01-01',@admin);`);
  const password = randomUUID().replaceAll("-", "");
  run(`CREATE APPLICATION ROLE handover_ci_role WITH PASSWORD='${password}';`);
  execFileSync("sqlcmd", [...sqlArgs, "-d", name, "-i", sqlTest.applicationLoginScript, "-v", `DatabaseName=${name}`, "AppLogin=handover_ci_role"], sqlTest.sqlcmdOptions);
  const config: AppConfig = {
    environment: "development", host: "127.0.0.1", port: 0, allowedHosts: ["localhost"],
    corsOrigins: ["http://localhost:3000"], businessTimeZone: "Asia/Bangkok", auth: { mode: "Development" },
    database: { connectionString: sqlTest.connectionString, trustServerCertificate: true, applicationRoleName: "handover_ci_role", applicationRolePassword: password },
    documentStorage: { mode: "Local", rootPath: storageRoot, maxFileSizeBytes: 10_000_000 }, email: { mode: "Disabled" }, pdfParserUrl: "http://pdf-parser:8000",
  };
  application = await buildApp(config);
  const { app, database } = application;
  const actors = Object.fromEntries((await database.query<{ id: number; entra_object_id: string }>("SELECT id,entra_object_id FROM dbo.users WHERE entra_object_id LIKE N'handover-%'")).recordset.map((row) => [row.entra_object_id, Number(row.id)]));

  async function api(actor: string, method: "GET" | "POST" | "PUT", url: string, body?: object, expected = 200) {
    const response = await app.inject({ method, url, headers: { "x-dev-user-id": `handover-${actor}` }, ...(body ? { payload: body } : {}) });
    assert.equal(response.statusCode, expected, `Handover check ${checks + 1} ${method} ${url}: ${response.body}`);
    checks++;
    return response.json();
  }
  async function upload(actor: string, url: string, fileName: string, bytes: Buffer, fields: Record<string, string>) {
    const body = multipart(fileName, bytes, fields);
    const response = await app.inject({ method: "POST", url, headers: { "x-dev-user-id": `handover-${actor}`, "content-type": body.contentType }, payload: body.payload });
    assert.equal(response.statusCode, 201, `Handover upload ${checks + 1} ${url}: ${response.body}`);
    checks++;
    return response.json();
  }
  async function createInquiry(projectName: string) {
    const customer = await api("sales", "POST", "/api/v1/sales/customers", { name: `TEST ONLY ${projectName} customer` }, 201);
    const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const inquiry = await api("sales", "POST", "/api/v1/inquiries", {
      customerId: customer.id, contact: "TEST ONLY contact", projectName, projectType: "IoT",
      salesOwner: "handover-sales", estimateOwnerId: actors["handover-engineer"], priority: "Normal",
      projectProbability: 80, customerInterestGrade: "A", dueDate, requirement: "TEST ONLY customer requirement",
      scopeSummary: "TEST ONLY requested scope", siteLocation: "TEST ONLY factory",
    }, 201);
    return { customer, inquiry, dueDate };
  }
  async function approveEstimate(inquiryId: number, dueDate: string) {
    let estimate = await api("engineer", "POST", "/api/v1/estimates", { inquiryId, ownerId: actors["handover-engineer"], contingencyRate: 5, dueDate }, 201);
    const manhour = await api("engineer", "POST", `/api/v1/estimates/${estimate.id}/manhour-lines`, {
      estimateRowVersion: estimate.rowVersion, package: "TEST ONLY engineering", activity: "TEST ONLY design and implementation",
      department: "Engineering", level: "Engineer", costType: "Engineering", provider: "Internal",
      supplierId: null, quotationNumber: null, priceDate: null, engineers: 1, manDays: 1, hoursPerDay: 8,
      dailyRate: 0, ownerId: actors["handover-engineer"], remark: "TEST ONLY complete flow",
    }, 201);
    estimate = { ...estimate, rowVersion: manhour.estimateRowVersion };
    estimate = await api("engineer", "POST", `/api/v1/estimates/${estimate.id}/submit`, { rowVersion: estimate.rowVersion, comment: "TEST ONLY ready for review" });
    estimate = await api("manager", "POST", `/api/v1/estimates/${estimate.id}/approve`, { rowVersion: estimate.rowVersion, comment: "TEST ONLY approved" });
    return estimate;
  }
  const today = new Date().toISOString().slice(0, 10);
  const projectBody = (estimateId: number, dueDate: string) => ({ estimateId, purchaseOrderNumber: `TEST-PO-${estimateId}`, purchaseOrderDate: today,
    managerId: actors["handover-manager"], leadEngineerId: actors["handover-engineer"], startDate: today, targetDelivery: dueDate, site: "TEST ONLY factory" });

  // Start with the real Inquiry APIs and upload the customer's original files.
  const main = await createInquiry("TEST ONLY complete handover");
  const drawingBytes = Buffer.from("TEST ONLY customer drawing revision A\n");
  const specificationBytes = Buffer.from("TEST ONLY equipment specification\n");
  await upload("sales", `/api/v1/inquiries/${main.inquiry.id}/attachments`, "customer-layout.txt", drawingBytes, { category: "Drawing" });
  await upload("sales", `/api/v1/inquiries/${main.inquiry.id}/attachments`, "equipment-specification.txt", specificationBytes, { category: "Specification" });

  // Create the linked intake and visit through their public APIs. Synthetic SQL only
  // advances execution prerequisites so this focused test does not duplicate scheduling UAT.
  const visitTypeId = Number((await database.query<{ id: number }>("SELECT TOP(1) id FROM dbo.visit_types WHERE code=N'HANDOVER-CI'")).recordset[0]!.id);
  const skillId = Number((await database.query<{ id: number }>("SELECT TOP(1) id FROM dbo.visit_skills WHERE code=N'HANDOVER-SKILL'")).recordset[0]!.id);
  const scheduledStart = new Date(Date.now() + 60 * 86_400_000);
  scheduledStart.setUTCHours(2, 0, 0, 0);
  const scheduledEnd = new Date(scheduledStart.getTime() + 4 * 3_600_000);
  const intake = await api("sales", "POST", "/api/v1/sales-intakes/", {
    customerId: main.customer.id, salesOwnerId: actors["handover-sales"], subject: "TEST ONLY linked intake",
    priority: "Normal", source: "Email", requestDate: today, relatedInquiryId: main.inquiry.id,
    contact: { contactChannel: "Email", siteName: "TEST ONLY factory", siteAddress: "TEST ONLY industrial estate",
      contactName: "TEST ONLY contact", contactPhone: "0000000000", contactEmail: "handover@test.invalid" },
    requirement: { problemStatement: "TEST ONLY inspect customer site before estimating", desiredCapability: "TEST ONLY verified design",
      expectedResult: "TEST ONLY enough verified information for a complete estimate", expectedScope: "TEST ONLY survey scope" },
    machine: { machineName: "TEST ONLY station", machineModel: "CI-1", existingSystem: "TEST ONLY manual station",
      safetyRequirement: "TEST ONLY standard PPE", siteAccessRequirement: "TEST ONLY register at reception" },
    visitTypeIds: [visitTypeId], skillIds: [skillId], windows: [{ startsAt: scheduledStart.toISOString(), endsAt: scheduledEnd.toISOString(), preference: 1 }],
  }, 201);
  const intakeId = Number(intake.id);
  const intakeBytes = Buffer.from("TEST ONLY linked RFQ from sales intake\n");
  await upload("sales", `/api/v1/sales-intakes/${intakeId}/attachments`, "customer-rfq.txt", intakeBytes, { category: "Customer RFQ", description: "TEST ONLY original RFQ" });
  const intakeDetail = await api("sales", "GET", `/api/v1/sales-intakes/${intakeId}`);
  const intakeSubmitted = await api("sales", "POST", `/api/v1/sales-intakes/${intakeId}/status`, { status: "Pending Technical Review", reason: "TEST ONLY ready", rowVersion: intakeDetail.rowVersion });
  const intakeReviewed = await api("manager", "POST", `/api/v1/sales-intakes/${intakeId}/review`, { decision: "Ready to Schedule", comment: "TEST ONLY sufficient information",
    engineerCount: 1, estimatedDurationMinutes: 240, skillIds: [skillId], rowVersion: intakeSubmitted.rowVersion });
  assert.equal(intakeReviewed.status, "Ready to Schedule");
  const visit = await api("manager", "POST", "/api/v1/site-visits/", { intakeId, visitTypeId,
    scheduledStart: scheduledStart.toISOString(), scheduledEnd: scheduledEnd.toISOString(), requiredEngineerCount: 1 }, 201);
  const visitId = Number(visit.id);
  let visitDetail = await api("manager", "GET", `/api/v1/site-visits/${visitId}`);
  const assigned = await api("manager", "POST", `/api/v1/site-visits/${visitId}/assignments`, { engineerId: actors["handover-engineer"], assignmentRole: "Lead Engineer", rowVersion: visitDetail.rowVersion });
  visitDetail = await api("engineer", "GET", `/api/v1/site-visits/${visitId}`);
  const assignment = visitDetail.assignments.find((row: { id: number }) => row.id === assigned.assignmentId);
  await api("engineer", "POST", `/api/v1/site-visits/${visitId}/assignments/${assigned.assignmentId}/response`, { response: "Accepted", note: "TEST ONLY accepted", rowVersion: assignment.rowVersion });
  visitDetail = await api("manager", "GET", `/api/v1/site-visits/${visitId}`);
  const pendingEngineer = await api("manager", "POST", `/api/v1/site-visits/${visitId}/status`, { status: "Pending Engineer Confirmation", reason: "", rowVersion: visitDetail.rowVersion });
  const pendingCustomer = await api("manager", "POST", `/api/v1/site-visits/${visitId}/status`, { status: "Pending Customer Confirmation", reason: "", rowVersion: pendingEngineer.rowVersion });
  const confirmedByCustomer = await api("sales", "POST", `/api/v1/site-visits/${visitId}/confirmations`, { party: "Customer", outcome: "Confirmed", channel: "Email",
    confirmedByName: "TEST ONLY customer", confirmedAt: new Date().toISOString(), rowVersion: pendingCustomer.rowVersion });
  const confirmed = await api("manager", "POST", `/api/v1/site-visits/${visitId}/status`, { status: "Confirmed", reason: "", rowVersion: confirmedByCustomer.rowVersion });
  const checkedIn = await api("engineer", "POST", `/api/v1/site-visits/${visitId}/check-in`, { actualAttendees: "TEST ONLY engineer", customerAttendees: "TEST ONLY customer",
    locationConsentGiven: false, latitude: null, longitude: null, rowVersion: confirmed.rowVersion });
  assert.equal(checkedIn.status, "In Progress");
  const photoBytes = Buffer.from("TEST ONLY synthetic site photo bytes\n");
  await upload("engineer", `/api/v1/site-visits/${visitId}/attachments`, "site-photo.txt", photoBytes, { category: "Photo", description: "TEST ONLY site evidence" });
  visitDetail = await api("engineer", "GET", `/api/v1/site-visits/${visitId}`);
  const checkedOut = await api("engineer", "POST", `/api/v1/site-visits/${visitId}/check-out`, { executionNote: "TEST ONLY completed survey", rowVersion: visitDetail.rowVersion });
  assert.equal(checkedOut.status, "Report Pending");
  visitDetail = await api("engineer", "GET", `/api/v1/site-visits/${visitId}`);
  const reportVersion = visitDetail.report.rowVersion;
  const reportNumber = visitDetail.report.number;
  let report = await api("engineer", "PUT", `/api/v1/site-visits/${visitId}/report`, {
    rowVersion: reportVersion, visitSummary: "TEST ONLY completed site visit and verified actual conditions.",
    customerRequirement: "TEST ONLY automate the production station.", existingCondition: "TEST ONLY manual process.",
    proposedScope: "TEST ONLY panel and controls.", engineerConclusion: "TEST ONLY solution is feasible and ready for estimating.",
  });
  report = await api("engineer", "POST", `/api/v1/site-visits/${visitId}/report/submit`, { rowVersion: report.rowVersion });
  report = await api("manager", "POST", `/api/v1/site-visits/${visitId}/report/review`, { rowVersion: report.rowVersion, decision: "Approved", comment: "TEST ONLY approved report" });
  assert.equal(report.status, "Approved");

  // An unrelated Inquiry has a similarly named file and must never bleed into this Project.
  const unrelated = await createInquiry("TEST ONLY unrelated handover");
  await upload("sales", `/api/v1/inquiries/${unrelated.inquiry.id}/attachments`, "unrelated-secret.txt", Buffer.from("TEST ONLY unrelated confidential bytes\n"), { category: "Drawing" });

  const estimate = await approveEstimate(Number(main.inquiry.id), main.dueDate);
  const created = await api("admin", "POST", "/api/v1/projects", projectBody(estimate.id, main.dueDate), 201);
  assert.equal(created.folderMetadataCreated, 15);
  assert.equal(created.documentsTransferred, 7);
  const folders = (await database.query<{ folder_code: string; storage_key: string }>(`SELECT folder_code,storage_key FROM dbo.project_folders WHERE project_id=${Number(created.id)} ORDER BY folder_code`)).recordset;
  assert.equal(folders.length, 15);
  for (const folder of folders) {
    const code = folder.folder_code.trim();
    assert.equal(folder.storage_key, `projects/${created.id}/${code}`);
    assert.ok(existsSync(resolve(storageRoot, folder.storage_key)), `physical folder ${code} was not created`);
  }

  const listedDocs = await api("engineer", "GET", `/api/v1/projects/${created.id}/documents`);
  assert.equal(listedDocs.length, 7);
  await api("outsider", "GET", `/api/v1/projects/${created.id}/documents`, undefined, 403);

  const docs = (await database.query<{ folder_code: string; name: string; size_bytes: number; storage_key: string; provider_etag: string; remark: string }>(
    `SELECT folder_code,name,size_bytes,storage_key,provider_etag,remark FROM dbo.project_docs WHERE project_id=${Number(created.id)} AND deleted_at IS NULL ORDER BY id`,
  )).recordset;
  assert.equal(docs.length, 7);
  assert.deepEqual(Object.fromEntries(docs.filter((doc) => ["customer-layout.txt", "equipment-specification.txt", "customer-rfq.txt", "site-photo.txt"].includes(doc.name)).map((doc) => [doc.name, doc.folder_code.trim()])), {
    "customer-layout.txt": "02", "equipment-specification.txt": "06", "customer-rfq.txt": "06", "site-photo.txt": "13",
  });
  const expectedBytes = new Map([["customer-layout.txt", drawingBytes], ["equipment-specification.txt", specificationBytes], ["customer-rfq.txt", intakeBytes], ["site-photo.txt", photoBytes]]);
  for (const doc of docs) {
    const copied = readFileSync(resolve(storageRoot, doc.storage_key));
    assert.equal(copied.byteLength, Number(doc.size_bytes));
    assert.match(doc.provider_etag, /^[a-f0-9]{64}$/);
    const expected = expectedBytes.get(doc.name);
    if (expected) assert.deepEqual(copied, expected);
    assert.match(doc.remark, /^Source: /);
  }
  assert.equal(docs.filter((doc) => doc.folder_code.trim() === "03" && /summary\.txt$/.test(doc.name)).length, 1);
  assert.equal(docs.filter((doc) => doc.folder_code.trim() === "06" && /requirements\.txt$/.test(doc.name)).length, 1);
  assert.equal(docs.filter((doc) => doc.folder_code.trim() === "10" && doc.name === `${reportNumber}-R0.txt`).length, 1);
  assert.ok(docs.some((doc) => /Source: Inquiry /.test(doc.remark) && /attachment/.test(doc.remark)));
  assert.ok(docs.some((doc) => doc.remark.includes(`Source: SalesIntake ${intake.number}`)));
  assert.ok(docs.some((doc) => doc.remark.includes(`Source: SiteVisit ${visit.number}`)));
  assert.ok(docs.some((doc) => doc.remark.includes(`Source: SiteVisitReport ${reportNumber} revision 0`)));
  assert.ok(!docs.some((doc) => doc.name === "unrelated-secret.txt" || doc.remark.includes(unrelated.inquiry.number)));
  const drawingDoc = listedDocs.find((doc: { fileName: string }) => doc.fileName === "customer-layout.txt");
  const download = await app.inject({ method: "GET", url: `/api/v1/projects/${created.id}/documents/${drawingDoc.id}/content`, headers: { "x-dev-user-id": "handover-engineer" } });
  assert.equal(download.statusCode, 200, download.body); checks++;
  assert.deepEqual(download.rawPayload, drawingBytes);
  const deniedDownload = await app.inject({ method: "GET", url: `/api/v1/projects/${created.id}/documents/${drawingDoc.id}/content`, headers: { "x-dev-user-id": "handover-outsider" } });
  assert.equal(deniedDownload.statusCode, 403, deniedDownload.body); checks++;

  // A changed source is rejected atomically: no Project metadata or copied file survives.
  const corrupt = await createInquiry("TEST ONLY corrupt handover");
  const corruptUpload = await upload("sales", `/api/v1/inquiries/${corrupt.inquiry.id}/attachments`, "corrupt-source.txt", Buffer.from("ORIGINAL"), { category: "Drawing" });
  const corruptSource = (await database.query<{ storage_key: string }>(`SELECT storage_key FROM dbo.inquiry_attachments WHERE id=${Number(corruptUpload.id)}`)).recordset[0]!;
  writeFileSync(resolve(storageRoot, corruptSource.storage_key), Buffer.from("TAMPERED"));
  const corruptEstimate = await approveEstimate(Number(corrupt.inquiry.id), corrupt.dueDate);
  const beforeProjectCount = Number((await database.query<{ total: number }>("SELECT COUNT(*) total FROM dbo.projects")).recordset[0]!.total);
  const beforeDocCount = Number((await database.query<{ total: number }>("SELECT COUNT(*) total FROM dbo.project_docs")).recordset[0]!.total);
  const beforeFiles = filesBelow(resolve(storageRoot, "projects")).sort();
  const failed = await api("admin", "POST", "/api/v1/projects", projectBody(corruptEstimate.id, corrupt.dueDate), 409);
  assert.equal(failed.code, "document_integrity_failed");
  assert.equal(Number((await database.query<{ total: number }>("SELECT COUNT(*) total FROM dbo.projects")).recordset[0]!.total), beforeProjectCount);
  assert.equal(Number((await database.query<{ total: number }>("SELECT COUNT(*) total FROM dbo.project_docs")).recordset[0]!.total), beforeDocCount);
  assert.deepEqual(filesBelow(resolve(storageRoot, "projects")).sort(), beforeFiles);

  // Attachments that failed scanning block handover instead of disappearing silently.
  const blocked = await createInquiry("TEST ONLY blocked scan handover");
  const blockedIntake = await api("sales", "POST", "/api/v1/sales-intakes/", {
    customerId: blocked.customer.id, salesOwnerId: actors["handover-sales"], subject: "TEST ONLY blocked attachment",
    priority: "Normal", source: "Email", requestDate: today, relatedInquiryId: blocked.inquiry.id,
    contact: { contactChannel: "Email" }, requirement: {}, machine: {}, visitTypeIds: [], skillIds: [], windows: [],
  }, 201);
  const blockedUpload = await upload("sales", `/api/v1/sales-intakes/${blockedIntake.id}/attachments`, "scan-failed.txt", Buffer.from("TEST ONLY scanner failure\n"), { category: "Other" });
  run(`UPDATE dbo.sales_intake_attachments SET scan_status=N'Failed' WHERE id=${Number(blockedUpload.id)};`);
  const blockedEstimate = await approveEstimate(Number(blocked.inquiry.id), blocked.dueDate);
  const beforeBlockedFiles = filesBelow(resolve(storageRoot, "projects")).sort();
  const blockedResponse = await api("admin", "POST", "/api/v1/projects", projectBody(blockedEstimate.id, blocked.dueDate), 409);
  assert.equal(blockedResponse.code, "handover_document_not_ready");
  assert.equal(Number((await database.query<{ total: number }>("SELECT COUNT(*) total FROM dbo.projects")).recordset[0]!.total), beforeProjectCount);
  assert.equal(Number((await database.query<{ total: number }>("SELECT COUNT(*) total FROM dbo.project_docs")).recordset[0]!.total), beforeDocCount);
  assert.deepEqual(filesBelow(resolve(storageRoot, "projects")).sort(), beforeBlockedFiles);

  console.log(`Project document carryover SQL integration passed: ${checks} API checks; complete Inquiry/visit/report/estimate/Project flow, byte integrity, provenance, isolation and rollback cleanup.`);
} finally {
  if (application) { await application.app.close(); await application.database.close(); }
  assert.match(name, /^IoTTeamCenter_HandoverCI_[a-f0-9]{32}$/);
  execFileSync("sqlcmd", [...sqlArgs, "-d", "master", "-Q", `IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END;`], sqlTest.sqlcmdOptions);
  rmSync(storageRoot, { recursive: true, force: true });
}
