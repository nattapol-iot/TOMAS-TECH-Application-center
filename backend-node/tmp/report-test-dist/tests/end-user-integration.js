import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { buildApp } from "../src/app.js";
// Always creates and removes its own randomly named database; never targets Team Test.
const repo = process.cwd();
const name = `IoTTeamCenter_EndUserCI_${randomUUID().replaceAll("-", "")}`;
assert.match(name, /^IoTTeamCenter_EndUserCI_[a-f0-9]{32}$/);
const args = ["-S", "localhost", "-E", "-C", "-I", "-b"];
const run = (statement) => execFileSync("sqlcmd", [...args, "-d", name, "-Q", statement], { cwd: repo, stdio: "pipe" });
let application;
let checks = 0;
try {
    execFileSync("sqlcmd", [...args, "-i", "database/scripts/020_deploy_fresh_database.sql", "-v", `DatabaseName=${name}`], { cwd: repo, stdio: "pipe" });
    run(`INSERT dbo.users(entra_object_id,email,name,role_id)
    SELECT v.identity_id,v.identity_id+N'@test.invalid',v.identity_id,r.id
    FROM (VALUES(N'end-user-sales',N'Sales Engineer'),(N'end-user-admin',N'Admin'),
      (N'end-user-engineer',N'Engineer'),(N'end-user-outsider',N'Engineer')) v(identity_id,role_code)
    JOIN dbo.roles r ON r.code=v.role_code;
    INSERT dbo.roles(code,name) VALUES(N'EndUserWriter',N'TEST ONLY scoped writer');
    INSERT dbo.role_permissions(role_id,permission_id) SELECT r.id,p.id FROM dbo.roles r CROSS JOIN dbo.permissions p
      WHERE r.code=N'EndUserWriter' AND p.code IN(N'project.read',N'project.write');
    UPDATE dbo.users SET role_id=(SELECT id FROM dbo.roles WHERE code=N'EndUserWriter') WHERE entra_object_id=N'end-user-outsider';`);
    const password = randomUUID().replaceAll("-", "");
    run(`CREATE APPLICATION ROLE end_user_ci_role WITH PASSWORD='${password}';`);
    execFileSync("sqlcmd", [...args, "-d", name, "-i", "database/scripts/010_application_login.sql", "-v", `DatabaseName=${name}`, "AppLogin=end_user_ci_role"], { cwd: repo, stdio: "pipe" });
    const config = {
        environment: "development", host: "127.0.0.1", port: 0, allowedHosts: ["localhost"],
        corsOrigins: ["http://localhost:3000"], businessTimeZone: "Asia/Bangkok", auth: { mode: "Development" },
        database: { connectionString: `Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`, trustServerCertificate: true, applicationRoleName: "end_user_ci_role", applicationRolePassword: password },
        documentStorage: { mode: "Local", rootPath: resolve(repo, "tmp", name), maxFileSizeBytes: 10000000 }, email: { mode: "Disabled" },
    };
    application = await buildApp(config);
    const { app, database } = application;
    async function api(actor, url, body, expected = 200, method = body ? "POST" : "GET") {
        const response = await app.inject({ method, url, headers: { "x-dev-user-id": `end-user-${actor}` }, ...(body ? { payload: body } : {}) });
        assert.equal(response.statusCode, expected, `End user check ${checks + 1} ${method} ${url}: ${response.body}`);
        checks++;
        return response.json();
    }
    const actors = Object.fromEntries((await database.query("SELECT id,entra_object_id FROM dbo.users")).recordset.map(row => [row.entra_object_id, Number(row.id)]));
    const direct = await api("sales", "/api/v1/sales/customers", { name: "TEST ONLY Contracting Partner", code: "EU-CONTRACT" }, 201);
    const endUser = await api("sales", "/api/v1/sales/customers", { name: "TEST ONLY Ultimate Factory", code: "EU-FACTORY" }, 201);
    const other = await api("sales", "/api/v1/sales/customers", { name: "TEST ONLY Second Factory", code: "EU-SECOND" }, 201);
    const inactive = await api("sales", "/api/v1/sales/customers", { name: "TEST ONLY Inactive", code: "EU-INACTIVE" }, 201);
    run(`UPDATE dbo.customers SET is_active=0 WHERE id=${Number(inactive.id)}`);
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10);
    const base = { customerId: direct.id, contact: "TEST ONLY Contact", projectName: "TEST ONLY End User", projectType: "IoT", salesOwner: "end-user-sales", estimateOwnerId: actors["end-user-engineer"], priority: "Normal", projectProbability: 25, customerInterestGrade: "C", dueDate };
    for (const bad of [0, "2", -1, 1.5])
        await api("sales", "/api/v1/inquiries", { ...base, endUserCustomerId: bad }, 400);
    for (const bad of [inactive.id, 99999999])
        await api("sales", "/api/v1/inquiries", { ...base, endUserCustomerId: bad }, 422);
    const legacy = await api("sales", "/api/v1/inquiries", base, 201);
    assert.equal((await api("sales", `/api/v1/inquiries/${legacy.id}`)).endUserCustomerId, null);
    let inquiry = await api("sales", "/api/v1/inquiries", { ...base, endUserCustomerId: endUser.id }, 201);
    let detail = await api("sales", `/api/v1/inquiries/${inquiry.id}`);
    assert.equal(detail.customerId, direct.id);
    assert.equal(detail.endUserCustomerId, endUser.id);
    assert.equal(detail.endUserCode, "EU-FACTORY");
    assert.ok((await api("sales", "/api/v1/inquiries?search=EU-FACTORY")).items.some((row) => row.id === inquiry.id));
    assert.ok((await api("sales", "/api/v1/inquiries?search=Ultimate%20Factory")).items.some((row) => row.id === inquiry.id));
    await api("outsider", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: other.id, rowVersion: detail.rowVersion }, 403, "PUT");
    await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: inactive.id, rowVersion: detail.rowVersion }, 422, "PUT");
    const staleVersion = detail.rowVersion;
    detail = await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: other.id, rowVersion: detail.rowVersion }, 200, "PUT");
    await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: null, rowVersion: staleVersion }, 409, "PUT");
    detail = await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: null, rowVersion: detail.rowVersion }, 200, "PUT");
    assert.equal(detail.endUserCustomerId, null);
    detail = await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: direct.id, rowVersion: detail.rowVersion }, 200, "PUT");
    assert.equal(detail.endUserCustomerId, direct.id);
    detail = await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: endUser.id, rowVersion: detail.rowVersion }, 200, "PUT");
    async function approvedEstimate(inquiryId) {
        run(`INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,created_by,updated_by)
      SELECT N'EU-EST-'+CONVERT(nvarchar(20),id),id,customer_id,project_name,project_type,estimate_owner_id,CONVERT(date,SYSUTCDATETIME()),due_date,N'Approved',created_by,updated_by FROM dbo.inquiries WHERE id=${inquiryId}`);
        return Number((await database.query(`SELECT id FROM dbo.estimates WHERE inquiry_id=${inquiryId}`)).recordset[0].id);
    }
    const projectBase = { purchaseOrderNumber: "TEST ONLY PO", purchaseOrderDate: today, managerId: actors["end-user-admin"], leadEngineerId: actors["end-user-engineer"], startDate: today, targetDelivery: dueDate, site: "TEST ONLY Factory" };
    const estimateId = await approvedEstimate(Number(inquiry.id));
    await api("admin", "/api/v1/projects", { ...projectBase, estimateId, endUserCustomerId: "1" }, 400);
    await api("admin", "/api/v1/projects", { ...projectBase, estimateId, endUserCustomerId: inactive.id }, 422);
    const inherited = await api("admin", "/api/v1/projects", { ...projectBase, estimateId }, 201);
    const listProject = async (id) => (await api("admin", "/api/v1/projects?pageSize=100")).items.find((row) => row.id === id);
    let project = await listProject(inherited.id);
    assert.equal(project.customerId, direct.id);
    assert.equal(project.endUserCustomerId, endUser.id);
    for (const assignment of [`customer_id=${Number(other.id)}`, "name=N'Forbidden'", "status=N'Closed'"]) {
        await assert.rejects(database.query(`UPDATE dbo.projects SET ${assignment} WHERE id=${Number(inherited.id)}`));
        checks++;
    }
    assert.ok((await api("admin", "/api/v1/projects?search=EU-FACTORY")).items.some((row) => row.id === inherited.id));
    detail = await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: other.id, rowVersion: detail.rowVersion }, 200, "PUT");
    assert.equal((await listProject(inherited.id)).endUserCustomerId, endUser.id);
    await api("outsider", `/api/v1/projects/${project.id}/end-user`, { endUserCustomerId: other.id, rowVersion: project.rowVersion }, 403, "PUT");
    await api("sales", `/api/v1/projects/${project.id}/end-user`, { endUserCustomerId: other.id, rowVersion: project.rowVersion }, 403, "PUT");
    const projectVersion = project.rowVersion;
    project = await api("admin", `/api/v1/projects/${project.id}/end-user`, { endUserCustomerId: other.id, rowVersion: project.rowVersion }, 200, "PUT");
    await api("admin", `/api/v1/projects/${project.id}/end-user`, { endUserCustomerId: null, rowVersion: projectVersion }, 409, "PUT");
    project = await api("admin", `/api/v1/projects/${project.id}/end-user`, { endUserCustomerId: null, rowVersion: project.rowVersion }, 200, "PUT");
    assert.equal(project.endUserCustomerId, null);
    for (const explicit of [null, other.id]) {
        const source = await api("sales", "/api/v1/inquiries", { ...base, endUserCustomerId: endUser.id }, 201);
        const created = await api("admin", "/api/v1/projects", { ...projectBase, estimateId: await approvedEstimate(Number(source.id)), endUserCustomerId: explicit }, 201);
        assert.equal((await listProject(created.id)).endUserCustomerId, explicit);
    }
    const legacyProject = await api("admin", "/api/v1/projects", { ...projectBase, estimateId: await approvedEstimate(Number(legacy.id)) }, 201);
    assert.equal((await listProject(legacyProject.id)).endUserCustomerId, null);
    run(`UPDATE dbo.projects SET status=N'Closed' WHERE id=${Number(project.id)};UPDATE dbo.inquiries SET status=N'Cancelled' WHERE id=${Number(inquiry.id)}`);
    project = await listProject(project.id);
    inquiry = await api("sales", `/api/v1/inquiries/${inquiry.id}`);
    await api("admin", `/api/v1/projects/${project.id}/end-user`, { endUserCustomerId: endUser.id, rowVersion: project.rowVersion }, 409, "PUT");
    await api("sales", `/api/v1/inquiries/${inquiry.id}/end-user`, { endUserCustomerId: endUser.id, rowVersion: inquiry.rowVersion }, 409, "PUT");
    const audit = (await database.query(`SELECT after_json FROM dbo.audit_log WHERE entity_type=N'Project' AND entity_id=${Number(inherited.id)} AND action=N'Created from approved estimate'`)).recordset[0];
    assert.equal(JSON.parse(audit.after_json).endUserCustomerId, endUser.id);
    assert.equal(JSON.parse(audit.after_json).endUserInheritedFromInquiry, true);
    const updates = (await database.query("SELECT before_json,after_json FROM dbo.audit_log WHERE action=N'End user updated'")).recordset;
    assert.ok(updates.length >= 7);
    assert.ok(updates.every(row => Object.hasOwn(JSON.parse(row.before_json), "endUserCustomerId") && Object.hasOwn(JSON.parse(row.after_json), "endUserCustomerId")));
    console.log(`End user SQL integration passed: ${checks} API checks; disposable database and restricted application role.`);
}
finally {
    if (application) {
        await application.app.close();
        await application.database.close();
    }
    execFileSync("sqlcmd", [...args, "-d", "master", "-Q", `IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END;`], { stdio: "pipe" });
}
//# sourceMappingURL=end-user-integration.js.map