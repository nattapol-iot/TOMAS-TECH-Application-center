import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Runs only against a newly created, randomly named disposable database.
const repo = process.cwd();
const { buildApp } = await import(process.env.IOT_CONTACT_API_MODULE
    ? pathToFileURL(resolve(process.env.IOT_CONTACT_API_MODULE)).href : '../src/app.js');
const name = `IoTTeamCenter_SalesCI_${randomUUID().replaceAll('-', '')}`;
assert.match(name, /^IoTTeamCenter_SalesCI_[a-f0-9]{32}$/);
const args = ['-S', 'localhost', '-E', '-C', '-I', '-b'];
const run = (statement) => execFileSync('sqlcmd', [...args, '-d', name, '-Q', statement], { cwd: repo, stdio: 'pipe' });
let application;
let checks = 0;
try {
    execFileSync('sqlcmd', [...args, '-i', process.env.IOT_CONTACT_FRESH_SQL || 'database/scripts/020_deploy_fresh_database.sql', '-v', `DatabaseName=${name}`], { cwd: repo, stdio: 'pipe' });
    run(`INSERT dbo.users(entra_object_id,email,name,role_id)
    SELECT v.identity_id,v.identity_id+N'@test.invalid',v.identity_id,r.id
    FROM (VALUES(N'sales-ci-sales',N'Sales Engineer'),(N'sales-ci-manager',N'Sales Manager'),
      (N'sales-ci-admin',N'Admin'),(N'sales-ci-reader',N'Engineer')) v(identity_id,role_code)
    JOIN dbo.roles r ON r.code=v.role_code;`);
    const password = randomUUID().replaceAll('-', '');
    run(`CREATE APPLICATION ROLE sales_ci_role WITH PASSWORD='${password}';`);
    execFileSync('sqlcmd', [...args, '-d', name, '-i', 'database/scripts/010_application_login.sql', '-v', `DatabaseName=${name}`, 'AppLogin=sales_ci_role'], { cwd: repo, stdio: 'pipe' });
    const config = {
        environment: 'development', host: '127.0.0.1', port: 0, allowedHosts: ['localhost'],
        corsOrigins: ['http://localhost:3000'], businessTimeZone: 'Asia/Bangkok', auth: { mode: 'Development' },
        database: { connectionString: `Server=localhost;Database=${name};Integrated Security=true;TrustServerCertificate=true`, trustServerCertificate: true, applicationRoleName: 'sales_ci_role', applicationRolePassword: password },
        documentStorage: { mode: 'Local', rootPath: resolve(repo, 'tmp', name), maxFileSizeBytes: 10000000 }, email: { mode: 'Disabled' },
    };
    application = await buildApp(config);
    const { app, database } = application;
    async function api(actor, url, body, expected = 200, method = body ? 'POST' : 'GET') {
        const response = await app.inject({ method, url, headers: actor ? { 'x-dev-user-id': `sales-ci-${actor}` } : {}, ...(body ? { payload: body } : {}) });
        assert.equal(response.statusCode, expected, `Sales check ${checks + 1}: ${response.body}`);
        checks++;
        return response.json();
    }
    const base = '/api/v1/sales/customers';
    // Development mode supplies an unregistered default identity without a header.
    await api(null, base, { name: 'TEST ONLY unauthorized' }, 403);
    await api('reader', base, { name: 'TEST ONLY forbidden' }, 403);
    await api('sales', '/api/v1/master/customers', { code: 'FORBIDDEN', name: 'TEST ONLY forbidden' }, 403);
    await api('sales', base, { name: '' }, 400);
    await api('sales', base, { name: 'TEST ONLY invalid', email: 'bad' }, 400);
    await api('sales', base, { name: 'TEST ONLY missing person', email: 'person@test.invalid' }, 400);
    const customer = await api('sales', base, { nameTh: 'บริษัท ทดสอบ อัลฟา', nameEn: 'TEST ONLY Alpha', nameJa: 'テスト・アルファ株式会社', contactNameTh: 'ผู้ติดต่อทดสอบ', contactNameEn: 'TEST ONLY Contact', contactNameJa: 'テスト担当者', contactTitleTh: 'นาย', contactTitleEn: 'Mr.', contactTitleJa: '様', email: 'alpha@test.invalid', phone: '0000000000', site: 'TEST ONLY Address', department: 'เทคโนโลยี / 技術部', position: 'Senior Engineer' }, 201);
    assert.ok(customer.id > 0 && customer.code);
    assert.equal(customer.contactTitleTh, 'นาย');
    assert.equal(customer.contactTitleEn, 'Mr.');
    assert.equal(customer.contactTitleJa, '様');
    assert.equal(customer.department, 'เทคโนโลยี / 技術部');
    assert.equal(customer.position, 'Senior Engineer');
    assert.equal(customer.name, 'TEST ONLY Alpha');
    assert.equal(customer.nameTh, 'บริษัท ทดสอบ อัลฟา');
    assert.equal(customer.nameJa, 'テスト・アルファ株式会社');
    let directory = await api('sales', `${base}/${customer.id}/contacts`);
    assert.equal(directory.contacts.length, 1);
    assert.equal(directory.contacts[0].titleTh, 'นาย');
    assert.equal(directory.contacts[0].titleEn, 'Mr.');
    assert.equal(directory.primaryContact.titleJa, '様');
    assert.equal(directory.contacts[0].name, 'TEST ONLY Contact');
    assert.equal(directory.contacts[0].email, 'alpha@test.invalid');
    assert.equal(directory.contacts[0].department, customer.department);
    assert.equal(directory.contacts[0].position, customer.position);
    assert.equal(directory.contacts[0].nameTh, 'ผู้ติดต่อทดสอบ');
    assert.equal(directory.contacts[0].nameJa, 'テスト担当者');
    assert.equal(directory.primaryContact.department, customer.department);
    assert.equal(directory.sites.length, 1);
    await api('sales', base, { name: ' test only alpha ' }, 409);
    await api('sales', base, { name: 'TEST ONLY Different', code: customer.code.toLowerCase() }, 409);
    const second = await api('manager', base, { name: 'TEST ONLY Beta', code: 'CI-BETA' }, 201);
    const secondContact = await api('manager', `${base}/${second.id}/contacts`, { name: 'TEST ONLY Beta Contact', phone: '1111111111' }, 201);
    assert.ok(secondContact.siteId > 0);
    await api('sales', `${base}/${customer.id}/contacts`, { name: 'Wrong customer', siteId: secondContact.siteId }, 400);
    await api('reader', `${base}/${customer.id}/contacts`, { name: 'Forbidden' }, 403);
    await api('sales', `${base}/${customer.id}/contacts`, { name: 'TEST ONLY Contact' }, 409);
    await api('sales', `${base}/${customer.id}/contacts`, { name: 'Another name', email: 'ALPHA@test.invalid' }, 409);
    await api('sales', `${base}/${customer.id}/contacts`, { name: 'Bad email', email: 'bad' }, 400);
    const added = await api('sales', `${base}/${customer.id}/contacts`, { name: 'TEST ONLY Second', titleTh: 'ดร.', titleEn: 'Dr.', titleJa: '先生', email: 'second@test.invalid', department: 'QA', position: 'Engineer' }, 201);
    assert.equal(added.siteId, directory.sites[0].id);
    directory = await api('reader', `${base}/${customer.id}/contacts`);
    assert.equal(directory.contacts.length, 2);
    // Existing Site Visit consumes precisely the same contact rows.
    const visit = await api('sales', `/api/v1/visit-master/customers/${customer.id}/sites`);
    assert.ok(JSON.stringify(visit).includes('second@test.invalid'));
    const bootstrap = await api('sales', '/api/v1/bootstrap');
    const customerRow = bootstrap.customers.find((row) => row.id === customer.id);
    assert.equal(customerRow.contactTitleTh, 'นาย');
    assert.equal(customerRow.contactTitleEn, 'Mr.');
    assert.equal(customerRow.contactTitleJa, '様');
    assert.equal(customerRow.position, customer.position);
    assert.equal(customerRow.department, customer.department);
    assert.equal(customerRow.nameTh, customer.nameTh);
    assert.equal(customerRow.nameEn, customer.nameEn);
    assert.equal(customerRow.nameJa, customer.nameJa);
    assert.equal(customerRow.contactNameTh, customer.contactNameTh);
    assert.equal(customerRow.contactNameJa, customer.contactNameJa);
    // Master edits persist every localized spelling, preserve omitted aliases and enforce the concurrency token.
    const updatedContact = 'TEST ONLY Contact Updated';
    const masterBody = {
        ...customerRow,
        nameTh: 'บริษัท ทดสอบ อัลฟา ใหม่', nameEn: 'TEST ONLY Alpha Updated', nameJa: 'テスト・アルファ株式会社・更新',
        contactNameTh: 'ผู้ติดต่อทดสอบใหม่', contactNameEn: updatedContact, contactNameJa: 'テスト担当者・更新',
        contactTitleTh: 'ดร.', contactTitleEn: 'Dr.', contactTitleJa: '先生', department: '品質保証', position: 'QA Manager',
    };
    const edited = await api('admin', `/api/v1/master/customers/${customer.id}`, masterBody, 200, 'PUT');
    assert.equal(edited.name, masterBody.nameEn);
    assert.equal(edited.nameTh, masterBody.nameTh);
    assert.equal(edited.nameJa, masterBody.nameJa);
    assert.equal(edited.contactNameTh, masterBody.contactNameTh);
    assert.equal(edited.contactNameEn, updatedContact);
    assert.equal(edited.contactNameJa, masterBody.contactNameJa);
    await api('admin', `/api/v1/master/customers/${customer.id}`, { ...masterBody, position: 'Stale edit' }, 409, 'PUT');
    directory = await api('sales', `${base}/${customer.id}/contacts`);
    assert.equal(directory.primaryContact.titleTh, 'ดร.');
    assert.equal(directory.primaryContact.titleEn, 'Dr.');
    assert.equal(directory.primaryContact.titleJa, '先生');
    assert.equal(directory.contacts.find((c) => c.id === added.id).titleEn, 'Dr.');
    assert.equal(directory.primaryContact.position, 'QA Manager');
    assert.equal(directory.primaryContact.name, updatedContact);
    assert.equal(directory.primaryContact.nameTh, masterBody.contactNameTh);
    assert.equal(directory.primaryContact.nameJa, masterBody.contactNameJa);
    assert.equal(directory.contacts.find((c) => c.id === added.id).position, 'Engineer');
    assert.equal(directory.contacts.find((c) => c.id === added.id).department, 'QA');
    const legacyBody = { ...masterBody, name: masterBody.nameEn, contact: updatedContact };
    for (const key of ['contactTitleTh', 'contactTitleEn', 'contactTitleJa', 'department', 'position', 'nameTh', 'nameEn', 'nameJa', 'contactNameTh', 'contactNameEn', 'contactNameJa'])
        delete legacyBody[key];
    const legacyEdit = await api('admin', `/api/v1/master/customers/${customer.id}`, { ...legacyBody, rowVersion: edited.rowVersion }, 200, 'PUT');
    assert.equal(legacyEdit.contactTitleTh, 'ดร.');
    assert.equal(legacyEdit.contactTitleEn, 'Dr.');
    assert.equal(legacyEdit.contactTitleJa, '先生');
    assert.equal(legacyEdit.department, '品質保証');
    assert.equal(legacyEdit.position, 'QA Manager');
    assert.equal(legacyEdit.nameTh, masterBody.nameTh);
    assert.equal(legacyEdit.nameEn, masterBody.nameEn);
    assert.equal(legacyEdit.nameJa, masterBody.nameJa);
    assert.equal(legacyEdit.contactNameTh, masterBody.contactNameTh);
    assert.equal(legacyEdit.contactNameEn, updatedContact);
    assert.equal(legacyEdit.contactNameJa, masterBody.contactNameJa);
    const clearedNames = await api('admin', `/api/v1/master/customers/${customer.id}`, {
        ...legacyBody, nameTh: '', nameEn: '', nameJa: '', contactNameTh: '', contactNameEn: '', contactNameJa: '', rowVersion: legacyEdit.rowVersion,
    }, 200, 'PUT');
    assert.equal(clearedNames.name, masterBody.nameEn);
    for (const key of ['nameTh', 'nameEn', 'nameJa', 'contactNameTh', 'contactNameEn', 'contactNameJa'])
        assert.equal(clearedNames[key], '');
    directory = await api('sales', `${base}/${customer.id}/contacts`);
    assert.equal(directory.primaryContact.name, updatedContact);
    assert.equal(directory.primaryContact.nameTh, '');
    assert.equal(directory.primaryContact.nameEn, '');
    assert.equal(directory.primaryContact.nameJa, '');
    const cleared = await api('admin', `/api/v1/master/customers/${customer.id}`, { ...legacyBody, contactTitleTh: '', contactTitleEn: '', contactTitleJa: '', department: '', position: '', rowVersion: clearedNames.rowVersion }, 200, 'PUT');
    assert.equal(cleared.contactTitleTh, '');
    assert.equal(cleared.contactTitleEn, '');
    assert.equal(cleared.contactTitleJa, '');
    const afterTitlesCleared = await api('sales', `${base}/${customer.id}/contacts`);
    assert.equal(afterTitlesCleared.primaryContact.titleEn, '');
    assert.equal(afterTitlesCleared.primaryContact.name, updatedContact);
    assert.equal(cleared.department, '');
    assert.equal(cleared.position, '');
    const masterCreated = await api('admin', '/api/v1/master/customers', { code: 'CI-MASTER', name: 'TEST ONLY Master', contact: 'TEST ONLY Master Person', contactTitleEn: 'Ms.', department: 'Sales', position: '担当部長' }, 201);
    const masterDirectory = await api('sales', `${base}/${masterCreated.id}/contacts`);
    assert.equal(masterDirectory.primaryContact.titleEn, 'Ms.');
    assert.equal(masterDirectory.primaryContact.position, '担当部長');
    await api('sales', base, { name: 'TEST ONLY No named title', contactTitleEn: 'Mr.' }, 400);
    await api('sales', `${base}/${customer.id}/contacts`, { name: 'TEST ONLY invalid title', titleEn: 'x'.repeat(51) }, 400);
    assert.equal(masterDirectory.contacts[0].department, 'Sales');
    await api('admin', '/api/v1/master/customers', { code: 'CI-NAMELESS', name: 'TEST ONLY Missing Person', department: 'Sales' }, 400);
    await api('sales', base, { name: 'TEST ONLY Missing Person', position: 'Manager' }, 400);
    const engineer = Number((await database.query(`SELECT id FROM dbo.users WHERE entra_object_id=N'sales-ci-reader'`)).recordset[0].id);
    const inquiry = await api('sales', '/api/v1/inquiries', {
        customerId: customer.id, contact: added.name, projectName: 'TEST ONLY sales inquiry', projectType: 'IoT',
        salesOwner: 'sales-ci-sales', estimateOwnerId: engineer, priority: 'Normal', projectProbability: 25,
        customerInterestGrade: 'C', dueDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10),
    }, 201);
    const saved = (await database.query(`SELECT customer_id,contact FROM dbo.inquiries WHERE id=${Number(inquiry.id)}`)).recordset[0];
    assert.equal(Number(saved.customer_id), customer.id);
    assert.equal(saved.contact, added.name);
    // Concurrent submissions create exactly one company/person.
    const customerRace = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: base, headers: { 'x-dev-user-id': 'sales-ci-sales' }, payload: { name: 'TEST ONLY Concurrent' } })));
    assert.deepEqual(customerRace.map(r => r.statusCode).sort(), [201, 409]);
    checks += 2;
    const contactRace = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: `${base}/${customer.id}/contacts`, headers: { 'x-dev-user-id': 'sales-ci-sales' }, payload: { name: 'TEST ONLY Concurrent Person' } })));
    assert.deepEqual(contactRace.map(r => r.statusCode).sort(), [201, 409]);
    checks += 2;
    run(`UPDATE dbo.customers SET is_active=0 WHERE id=${Number(second.id)}`);
    await api('sales', `${base}/${second.id}/contacts`, undefined, 404);
    await api('sales', `${base}/${second.id}/contacts`, { name: 'Inactive customer' }, 404);
    await api('sales', '/api/v1/master/customers/1', { name: 'Forbidden edit' }, 403, 'PUT');
    const audit = await database.query(`SELECT COUNT(*) AS total FROM dbo.audit_log WHERE entity_type IN(N'Customer',N'CustomerSite',N'CustomerSiteContact')`);
    assert.ok(Number(audit.recordset[0].total) >= 8);
    console.log(`Sales customer/contact SQL integration passed: ${checks} API checks; disposable database and restricted application role.`);
}
catch (error) {
    const sqlError = error;
    if (sqlError.stdout)
        console.error(sqlError.stdout.toString());
    if (sqlError.stderr)
        console.error(sqlError.stderr.toString());
    throw error;
}
finally {
    if (application) {
        await application.app.close();
        await application.database.close();
    }
    execFileSync('sqlcmd', [...args, '-d', 'master', '-Q', `IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END;`], { stdio: 'pipe' });
}
//# sourceMappingURL=sales-customer-integration.js.map