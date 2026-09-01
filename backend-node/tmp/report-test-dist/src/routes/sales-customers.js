import { randomUUID } from "node:crypto";
import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import { bodyObject, optionalBodyText, positiveLong, requiredInteger } from "../http.js";
const MAIN_SITE_NAME = "สำนักงานใหญ่ / Main office";
function clean(value, max, label) {
    if (value !== undefined && value !== null && typeof value !== "string")
        throw new ApiError(400, "validation_failed", `${label} must be text.`);
    return optionalBodyText(value, max, label) ?? "";
}
export function localizedNameInput(body, prefix, legacyKey, maximumLength, label, required) {
    const key = (suffix) => `${prefix ? `${prefix}Name` : "name"}${suffix}`;
    const localizedProvided = ["Th", "En", "Ja"].some((suffix) => body[key(suffix)] !== undefined);
    const names = {
        nameTh: clean(body[key("Th")], maximumLength, `${label} (Thai)`).replace(/\s+/g, " "),
        nameEn: clean(body[key("En")], maximumLength, `${label} (English)`).replace(/\s+/g, " "),
        nameJa: clean(body[key("Ja")], maximumLength, `${label} (Japanese)`).replace(/\s+/g, " "),
    };
    const legacy = clean(body[legacyKey], maximumLength, label).replace(/\s+/g, " ");
    const localized = names.nameEn || names.nameTh || names.nameJa;
    const name = localizedProvided ? localized || legacy : legacy || localized;
    if (required && !name)
        throw new ApiError(400, "validation_failed", `Enter ${label} in Thai, English or Japanese.`);
    return { name, ...names };
}
export function contactTitleInput(body, customer = false) {
    return {
        titleTh: clean(body[customer ? "contactTitleTh" : "titleTh"], 50, "Title (Thai)"),
        titleEn: clean(body[customer ? "contactTitleEn" : "titleEn"], 50, "Title (English)"),
        titleJa: clean(body[customer ? "contactTitleJa" : "titleJa"], 50, "Honorific (Japanese)"),
    };
}
function email(value) {
    const result = clean(value, 256, "Email").toLowerCase();
    if (result && !/^[^\s<>(),;:@]+(?:\.[^\s<>(),;:@]+)*@[^\s<>(),;:@]+(?:\.[^\s<>(),;:@]+)+$/.test(result)) {
        throw new ApiError(400, "validation_failed", "Email must be a valid address.");
    }
    return result;
}
export function salesCustomerInput(body) {
    const code = clean(body.code, 30, "Customer code").toUpperCase();
    if (code && !/^[A-Z0-9][A-Z0-9._/-]*$/.test(code))
        throw new ApiError(400, "validation_failed", "Customer code may contain only letters, numbers, hyphen, underscore, period and slash.");
    const companyNames = localizedNameInput(body, "", "name", 300, "Customer name", true);
    const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);
    const titles = contactTitleInput(body, true);
    const input = {
        code: code || `CUS-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
        ...companyNames,
        contactTitleTh: titles.titleTh, contactTitleEn: titles.titleEn, contactTitleJa: titles.titleJa,
        contact: contactNames.name, contactNameTh: contactNames.nameTh, contactNameEn: contactNames.nameEn, contactNameJa: contactNames.nameJa, email: email(body.email),
        phone: clean(body.phone, 100, "Phone"), site: clean(body.site, 300, "Address"), industry: "",
        department: clean(body.department, 200, "Department"), position: clean(body.position, 200, "Position"),
    };
    if (!input.contact && (input.email || input.phone || input.department || input.position || input.contactTitleTh || input.contactTitleEn || input.contactTitleJa))
        throw new ApiError(400, "validation_failed", "Enter the contact name when providing contact details.");
    return input;
}
export function salesContactInput(body) {
    return { ...contactTitleInput(body), ...localizedNameInput(body, "", "name", 200, "Contact name", true), email: email(body.email), phone: clean(body.phone, 100, "Phone"), department: clean(body.department, 200, "Department"), position: clean(body.position, 200, "Position") };
}
export async function demandSalesCustomerPermission(users, request, write) {
    const permissions = write ? ["intake.write", "master.write"] : ["inquiry.read", "intake.read", "master.read"];
    for (const [index, permission] of permissions.entries()) {
        try {
            await users.demandPermission(request, permission);
            return;
        }
        catch (error) {
            if (!(error instanceof ApiError) || error.code !== "permission_denied" || index === permissions.length - 1)
                throw error;
        }
    }
}
async function activeCustomer(transaction, customerId) {
    const q = new sql.Request(transaction);
    q.input("customer", sql.BigInt, customerId);
    // All inline contact writes for a customer lock the parent first, including default-site creation.
    const row = (await q.query(`SELECT id,site FROM dbo.customers WITH(UPDLOCK,HOLDLOCK) WHERE id=@customer AND is_active=1 AND deleted_at IS NULL;`)).recordset[0];
    if (!row)
        throw new ApiError(404, "customer_not_found", "The customer is unavailable. Refresh and select an active customer.");
    return row;
}
async function contactSite(transaction, actorId, customerId, siteId) {
    const customer = await activeCustomer(transaction, customerId);
    const q = new sql.Request(transaction);
    q.input("customer", sql.BigInt, customerId);
    q.input("site", sql.BigInt, siteId ?? null);
    const row = (await q.query(`SELECT id,code,name,is_active,deleted_at FROM dbo.customer_sites WITH(UPDLOCK,HOLDLOCK) WHERE customer_id=@customer AND ((@site IS NOT NULL AND id=@site) OR (@site IS NULL AND code=N'MAIN'));`)).recordset[0];
    if (row) {
        if (!row.is_active || row.deleted_at)
            throw new ApiError(409, "site_unavailable", "This site is inactive. Select another active site or ask an administrator to restore it.");
        return { id: Number(row.id), code: String(row.code), name: String(row.name) };
    }
    if (siteId !== undefined)
        throw new ApiError(400, "invalid_customer_site", "Select an active site belonging to this customer.");
    const insert = new sql.Request(transaction);
    insert.input("customer", sql.BigInt, customerId);
    insert.input("actor", sql.BigInt, actorId);
    insert.input("name", sql.NVarChar(300), MAIN_SITE_NAME);
    insert.input("address", sql.NVarChar(1000), String(customer.site ?? ""));
    const created = (await insert.query(`INSERT INTO dbo.customer_sites(customer_id,code,name,address,created_by,updated_by) OUTPUT inserted.id VALUES(@customer,N'MAIN',@name,@address,@actor,@actor);`)).recordset[0];
    const site = { id: Number(created.id), code: "MAIN", name: MAIN_SITE_NAME };
    await insertAudit(transaction, actorId, "CustomerSite", site.id, site.code, "Created", null, { customerId, ...site });
    return site;
}
async function createContact(transaction, actorId, site, input, primary = false) {
    const q = new sql.Request(transaction);
    q.input("site", sql.BigInt, site.id);
    q.input("name", sql.NVarChar(200), input.name);
    q.input("email", sql.NVarChar(256), input.email);
    q.input("title_th", sql.NVarChar(50), input.titleTh);
    q.input("title_en", sql.NVarChar(50), input.titleEn);
    q.input("title_ja", sql.NVarChar(50), input.titleJa);
    q.input("name_th", sql.NVarChar(200), input.nameTh);
    q.input("name_en", sql.NVarChar(200), input.nameEn);
    q.input("name_ja", sql.NVarChar(200), input.nameJa);
    const duplicate = (await q.query(`SELECT TOP(1) id,name FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK) WHERE site_id=@site AND deleted_at IS NULL AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja)) OR (@email<>N'' AND LOWER(LTRIM(RTRIM(email)))=LOWER(@email)));`)).recordset[0];
    if (duplicate)
        throw new ApiError(409, "duplicate_contact", "A contact with this name or email already exists at this site. Select the existing contact, or ask an administrator to restore it if it is inactive.", { id: Number(duplicate.id), siteId: site.id, name: duplicate.name });
    q.input("phone", sql.NVarChar(100), input.phone);
    q.input("department", sql.NVarChar(200), input.department);
    q.input("position", sql.NVarChar(200), input.position);
    q.input("actor", sql.BigInt, actorId);
    q.input("primary", sql.Bit, primary);
    const row = (await q.query(`INSERT INTO dbo.customer_site_contacts(site_id,name,title_th,title_en,title_ja,name_th,name_en,name_ja,email,phone,department,position,is_primary,created_by,updated_by) OUTPUT inserted.id VALUES(@site,@name,@title_th,@title_en,@title_ja,@name_th,@name_en,@name_ja,@email,@phone,@department,@position,@primary,@actor,@actor);`)).recordset[0];
    const created = { id: Number(row.id), siteId: site.id, siteName: site.name, ...input };
    await insertAudit(transaction, actorId, "CustomerSiteContact", created.id, "", "Created", null, created);
    return created;
}
// Customer-level contact details belong to the matching MAIN primary person, never to an arbitrary site contact.
export const primaryCustomerContactApply = `OUTER APPLY (
  SELECT TOP(1) sc.department,sc.position,sc.title_th,sc.title_en,sc.title_ja,sc.name_th,sc.name_en,sc.name_ja FROM dbo.customer_site_contacts sc
  JOIN dbo.customer_sites s ON s.id=sc.site_id
  WHERE s.customer_id=c.id AND s.code=N'MAIN' AND s.is_active=1 AND s.deleted_at IS NULL
    AND sc.is_primary=1 AND sc.is_active=1 AND sc.deleted_at IS NULL AND sc.name=c.contact
  ORDER BY sc.id
) primary_contact`;
export async function syncPrimaryCustomerContact(transaction, actorId, customerId, input, previousName = input.name) {
    if (!input.name)
        return;
    const site = await contactSite(transaction, actorId, customerId);
    const q = new sql.Request(transaction);
    q.input("site", sql.BigInt, site.id);
    q.input("previous_name", sql.NVarChar(200), previousName);
    const before = (await q.query(`SELECT TOP(1) id,name,title_th,title_en,title_ja,name_th,name_en,name_ja,email,phone,department,position
    FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK)
    WHERE site_id=@site AND is_primary=1 AND is_active=1 AND deleted_at IS NULL AND name=@previous_name ORDER BY id;`)).recordset[0];
    if (!before) {
        await createContact(transaction, actorId, site, input, true);
        return;
    }
    q.input("id", sql.BigInt, before.id);
    q.input("name", sql.NVarChar(200), input.name);
    q.input("title_th", sql.NVarChar(50), input.titleTh);
    q.input("title_en", sql.NVarChar(50), input.titleEn);
    q.input("title_ja", sql.NVarChar(50), input.titleJa);
    q.input("name_th", sql.NVarChar(200), input.nameTh);
    q.input("name_en", sql.NVarChar(200), input.nameEn);
    q.input("name_ja", sql.NVarChar(200), input.nameJa);
    q.input("email", sql.NVarChar(256), input.email);
    q.input("phone", sql.NVarChar(100), input.phone);
    q.input("department", sql.NVarChar(200), input.department);
    q.input("position", sql.NVarChar(200), input.position);
    q.input("actor", sql.BigInt, actorId);
    const duplicate = (await q.query(`SELECT id FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK)
    WHERE site_id=@site AND id<>@id AND deleted_at IS NULL
      AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja)) OR (@email<>N'' AND LOWER(LTRIM(RTRIM(email)))=LOWER(@email)));`)).recordset[0];
    if (duplicate)
        throw new ApiError(409, "duplicate_contact", "A contact with this name or email already exists at this site.");
    await q.query(`UPDATE dbo.customer_site_contacts SET name=@name,title_th=@title_th,title_en=@title_en,title_ja=@title_ja,name_th=@name_th,name_en=@name_en,name_ja=@name_ja,email=@email,phone=@phone,department=@department,
    position=@position,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
    await insertAudit(transaction, actorId, "CustomerSiteContact", Number(before.id), "", "Updated", before, { ...input, siteId: site.id });
}
export function registerSalesCustomerRoutes(app, database, users) {
    app.get("/api/v1/sales/customers/:customerId/contacts", async (request) => {
        await demandSalesCustomerPermission(users, request, false);
        const customerId = positiveLong(request.params.customerId, "Customer id");
        const bind = (q) => q.input("customer", sql.BigInt, customerId);
        const customer = (await database.query(`SELECT c.contact,c.email,c.phone,COALESCE(primary_contact.department,N'') department,COALESCE(primary_contact.position,N'') position,COALESCE(primary_contact.title_th,N'') contact_title_th,COALESCE(primary_contact.title_en,N'') contact_title_en,COALESCE(primary_contact.title_ja,N'') contact_title_ja,COALESCE(primary_contact.name_th,N'') contact_name_th,COALESCE(primary_contact.name_en,N'') contact_name_en,COALESCE(primary_contact.name_ja,N'') contact_name_ja FROM dbo.customers c ${primaryCustomerContactApply} WHERE c.id=@customer AND c.is_active=1 AND c.deleted_at IS NULL;`, bind)).recordset[0];
        if (!customer)
            throw new ApiError(404, "customer_not_found", "The customer is unavailable.");
        const sites = (await database.query(`SELECT s.id,s.code,s.name FROM dbo.customer_sites s INNER JOIN dbo.customers c ON c.id=s.customer_id WHERE s.customer_id=@customer AND s.is_active=1 AND s.deleted_at IS NULL AND c.is_active=1 AND c.deleted_at IS NULL ORDER BY s.name;`, bind)).recordset;
        const contacts = (await database.query(`SELECT sc.id,sc.site_id,s.name site_name,sc.name,sc.title_th,sc.title_en,sc.title_ja,sc.name_th,sc.name_en,sc.name_ja,sc.email,sc.phone,sc.department,sc.position FROM dbo.customer_site_contacts sc INNER JOIN dbo.customer_sites s ON s.id=sc.site_id INNER JOIN dbo.customers c ON c.id=s.customer_id WHERE s.customer_id=@customer AND sc.is_active=1 AND sc.deleted_at IS NULL AND s.is_active=1 AND s.deleted_at IS NULL AND c.is_active=1 AND c.deleted_at IS NULL ORDER BY sc.is_primary DESC,sc.name;`, bind)).recordset;
        return {
            sites: sites.map((r) => ({ id: Number(r.id), code: r.code, name: r.name })),
            contacts: contacts.map((r) => ({ id: Number(r.id), siteId: Number(r.site_id), siteName: r.site_name, name: r.name, titleTh: r.title_th, titleEn: r.title_en, titleJa: r.title_ja, nameTh: r.name_th, nameEn: r.name_en, nameJa: r.name_ja, email: r.email, phone: r.phone, department: r.department, position: r.position })),
            primaryContact: customer.contact ? { name: customer.contact, titleTh: customer.contact_title_th, titleEn: customer.contact_title_en, titleJa: customer.contact_title_ja, nameTh: customer.contact_name_th, nameEn: customer.contact_name_en, nameJa: customer.contact_name_ja, email: customer.email, phone: customer.phone, department: customer.department, position: customer.position } : null,
        };
    });
    app.post("/api/v1/sales/customers", async (request, reply) => {
        await demandSalesCustomerPermission(users, request, true);
        const actor = await users.required(request), input = salesCustomerInput(bodyObject(request.body));
        const created = await database.transaction(async (transaction) => {
            const q = new sql.Request(transaction);
            q.input("code", sql.NVarChar(30), input.code);
            q.input("name", sql.NVarChar(300), input.name);
            q.input("name_th", sql.NVarChar(300), input.nameTh);
            q.input("name_en", sql.NVarChar(300), input.nameEn);
            q.input("name_ja", sql.NVarChar(300), input.nameJa);
            const duplicate = (await q.query(`SELECT TOP(1) id,code,name FROM dbo.customers WITH(UPDLOCK,HOLDLOCK) WHERE code=@code OR (deleted_at IS NULL AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja))));`)).recordset[0];
            if (duplicate)
                throw new ApiError(409, "duplicate_customer", "A customer with this code or name already exists. Select the existing customer, or ask an administrator if it is inactive.", { id: Number(duplicate.id), code: duplicate.code, name: duplicate.name });
            q.input("contact", sql.NVarChar(200), input.contact);
            q.input("email", sql.NVarChar(256), input.email);
            q.input("phone", sql.NVarChar(100), input.phone);
            q.input("site", sql.NVarChar(300), input.site);
            q.input("actor", sql.BigInt, actor.id);
            const row = (await q.query(`INSERT INTO dbo.customers(code,name,name_th,name_en,name_ja,contact,email,phone,site,created_by,updated_by) OUTPUT inserted.id,inserted.row_version VALUES(@code,@name,@name_th,@name_en,@name_ja,@contact,@email,@phone,@site,@actor,@actor);`)).recordset[0];
            const result = { id: Number(row.id), ...input, rowVersion: row.row_version.toString("base64") };
            await insertAudit(transaction, actor.id, "Customer", result.id, input.code, "Created", null, input);
            if (input.contact) {
                const site = await contactSite(transaction, actor.id, result.id);
                await createContact(transaction, actor.id, site, { name: input.contact, titleTh: input.contactTitleTh, titleEn: input.contactTitleEn, titleJa: input.contactTitleJa, nameTh: input.contactNameTh, nameEn: input.contactNameEn, nameJa: input.contactNameJa, email: input.email, phone: input.phone, department: input.department, position: input.position }, true);
            }
            return result;
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply.status(201).send(created);
    });
    app.post("/api/v1/sales/customers/:customerId/contacts", async (request, reply) => {
        await demandSalesCustomerPermission(users, request, true);
        const actor = await users.required(request), body = bodyObject(request.body);
        const customerId = positiveLong(request.params.customerId, "Customer id");
        const input = salesContactInput(body), siteId = body.siteId == null ? undefined : requiredInteger(body.siteId, "Site id", 1);
        const created = await database.transaction(async (transaction) => {
            const site = await contactSite(transaction, actor.id, customerId, siteId);
            return createContact(transaction, actor.id, site, input);
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply.status(201).send(created);
    });
}
//# sourceMappingURL=sales-customers.js.map