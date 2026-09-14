import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sql from "mssql";
import type { Transaction } from "mssql";
import { insertAudit } from "../audit.js";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import { bodyObject, optionalBodyText, parseRowVersion, positiveLong, requiredInteger } from "../http.js";
import type { CurrentUserService } from "../users.js";

const MAIN_SITE_NAME = "สำนักงานใหญ่ / Main office";
export type LocalizedNameInput = { name: string; nameTh: string; nameEn: string; nameJa: string };
type ContactInput = LocalizedNameInput & ContactTitleInput & { email: string; phone: string; department: string; position: string };
type CustomerInput = LocalizedNameInput & { contactTitleTh: string; contactTitleEn: string; contactTitleJa: string; code: string; contact: string; contactNameTh: string; contactNameEn: string; contactNameJa: string; email: string; phone: string; site: string; industry: string; department: string; position: string };
type Site = { id: number; code: string; name: string };
type Row = Record<string, unknown>;

function clean(value: unknown, max: number, label: string): string {
  if (value !== undefined && value !== null && typeof value !== "string") throw new ApiError(400, "validation_failed", `${label} must be text.`);
  return optionalBodyText(value, max, label) ?? "";
}

export function localizedNameInput(body: Record<string, unknown>, prefix: "" | "contact", legacyKey: "name" | "contact", maximumLength: number, label: string, required: boolean): LocalizedNameInput {
  const key = (suffix: "Th" | "En" | "Ja") => `${prefix ? `${prefix}Name` : "name"}${suffix}`;
  const localizedProvided = (["Th", "En", "Ja"] as const).some((suffix) => body[key(suffix)] !== undefined);
  const names = {
    nameTh: clean(body[key("Th")], maximumLength, `${label} (Thai)`).replace(/\s+/g, " "),
    nameEn: clean(body[key("En")], maximumLength, `${label} (English)`).replace(/\s+/g, " "),
    nameJa: clean(body[key("Ja")], maximumLength, `${label} (Japanese)`).replace(/\s+/g, " "),
  };
  const legacy = clean(body[legacyKey], maximumLength, label).replace(/\s+/g, " ");
  const localized = names.nameEn || names.nameTh || names.nameJa;
  const name = localizedProvided ? localized || legacy : legacy || localized;
  if (required && !name) throw new ApiError(400, "validation_failed", `Enter ${label} in Thai, English or Japanese.`);
  return { name, ...names };
}

export type ContactTitleInput = { titleTh: string; titleEn: string; titleJa: string };
export function contactTitleInput(body: Record<string, unknown>, customer = false): ContactTitleInput {
  return {
    titleTh: clean(body[customer ? "contactTitleTh" : "titleTh"], 50, "Title (Thai)"),
    titleEn: clean(body[customer ? "contactTitleEn" : "titleEn"], 50, "Title (English)"),
    titleJa: clean(body[customer ? "contactTitleJa" : "titleJa"], 50, "Honorific (Japanese)"),
  };
}

function email(value: unknown): string {
  const result = clean(value, 256, "Email").toLowerCase();
  if (result && !/^[^\s<>(),;:@]+(?:\.[^\s<>(),;:@]+)*@[^\s<>(),;:@]+(?:\.[^\s<>(),;:@]+)+$/.test(result)) {
    throw new ApiError(400, "validation_failed", "Email must be a valid address.");
  }
  return result;
}

// Legal-form words carry no identity, so they are dropped before the code is built:
// "DAIICHI JITSUGYO (THAILAND) CO., LTD." becomes DAIICHI-JITSUGYO-THAILAND, matching the
// codes already in the customer master.
const CODE_NOISE_WORDS = new Set([
  "CO", "COMPANY", "LTD", "LIMITED", "CORPORATION", "CORP", "INC", "INCORPORATED",
  "PLC", "PCL", "PUBLIC", "PVT", "PRIVATE", "LLC", "LP", "OFFICE",
]);
const CODE_BASE_LENGTH = 25; // leaves room for the 5-character uniqueness suffix inside nvarchar(30)

export function customerCodeFromName(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(/\s+/)
    .filter((word) => word && !CODE_NOISE_WORDS.has(word));
  const slug = words.join("-").slice(0, CODE_BASE_LENGTH).replace(/-+$/, "");
  return /^[A-Z0-9]/.test(slug) ? slug : "";
}

// A name with no Latin characters cannot produce a readable code, so it keeps the opaque one.
function generatedCustomerCode(name: string): string {
  return customerCodeFromName(name) || `CUS-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function customerCodeVariant(base: string): string {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase();
  return `${base.slice(0, CODE_BASE_LENGTH).replace(/-+$/, "")}-${suffix}`;
}
export function salesCustomerInput(body: Record<string, unknown>): CustomerInput {
  const code = clean(body.code, 30, "Customer code").toUpperCase();
  if (code && !/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) throw new ApiError(400, "validation_failed", "Customer code may contain only letters, numbers, hyphen, underscore, period and slash.");
  const companyNames = localizedNameInput(body, "", "name", 300, "Customer name", true);
  const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);
  const titles = contactTitleInput(body, true);
  const input = {
    code: code || generatedCustomerCode(companyNames.name),
    ...companyNames,
    contactTitleTh: titles.titleTh, contactTitleEn: titles.titleEn, contactTitleJa: titles.titleJa,
    contact: contactNames.name, contactNameTh: contactNames.nameTh, contactNameEn: contactNames.nameEn, contactNameJa: contactNames.nameJa, email: email(body.email),
    phone: clean(body.phone, 100, "Phone"), site: clean(body.site, 300, "Address"), industry: "",
    department: clean(body.department, 200, "Department"), position: clean(body.position, 200, "Position"),
  };
  if (!input.contact && (input.email || input.phone || input.department || input.position || input.contactTitleTh || input.contactTitleEn || input.contactTitleJa)) throw new ApiError(400, "validation_failed", "Enter the contact name when providing contact details.");
  return input;
}

export function salesContactInput(body: Record<string, unknown>): ContactInput {
  return { ...contactTitleInput(body), ...localizedNameInput(body, "", "name", 200, "Contact name", true), email: email(body.email), phone: clean(body.phone, 100, "Phone"), department: clean(body.department, 200, "Department"), position: clean(body.position, 200, "Position") };
}

export async function demandSalesCustomerPermission(users: CurrentUserService, request: FastifyRequest, write: boolean): Promise<void> {
  const permissions = write ? ["intake.write", "master.write"] : ["inquiry.read", "intake.read", "master.read"];
  for (const [index, permission] of permissions.entries()) {
    try { await users.demandPermission(request, permission); return; }
    catch (error) {
      if (!(error instanceof ApiError) || error.code !== "permission_denied" || index === permissions.length - 1) throw error;
    }
  }
}

async function activeCustomer(transaction: Transaction, customerId: number): Promise<Row> {
  const q = new sql.Request(transaction); q.input("customer", sql.BigInt, customerId);
  // All inline contact writes for a customer lock the parent first, including default-site creation.
  const row = (await q.query<Row>(`SELECT id,site FROM dbo.customers WITH(UPDLOCK,HOLDLOCK) WHERE id=@customer AND is_active=1 AND deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "customer_not_found", "The customer is unavailable. Refresh and select an active customer.");
  return row;
}

async function contactSite(transaction: Transaction, actorId: number, customerId: number, siteId?: number): Promise<Site> {
  const customer = await activeCustomer(transaction, customerId);
  const q = new sql.Request(transaction); q.input("customer", sql.BigInt, customerId);
  q.input("site", sql.BigInt, siteId ?? null);
  const row = (await q.query<Row>(`SELECT id,code,name,is_active,deleted_at FROM dbo.customer_sites WITH(UPDLOCK,HOLDLOCK) WHERE customer_id=@customer AND ((@site IS NOT NULL AND id=@site) OR (@site IS NULL AND code=N'MAIN'));`)).recordset[0];
  if (row) {
    if (!row.is_active || row.deleted_at) throw new ApiError(409, "site_unavailable", "This site is inactive. Select another active site or ask an administrator to restore it.");
    return { id: Number(row.id), code: String(row.code), name: String(row.name) };
  }
  if (siteId !== undefined) throw new ApiError(400, "invalid_customer_site", "Select an active site belonging to this customer.");
  const insert = new sql.Request(transaction);
  insert.input("customer", sql.BigInt, customerId); insert.input("actor", sql.BigInt, actorId);
  insert.input("name", sql.NVarChar(300), MAIN_SITE_NAME); insert.input("address", sql.NVarChar(1000), String(customer.site ?? ""));
  const created = (await insert.query<{ id: number | string }>(`INSERT INTO dbo.customer_sites(customer_id,code,name,address,created_by,updated_by) OUTPUT inserted.id VALUES(@customer,N'MAIN',@name,@address,@actor,@actor);`)).recordset[0]!;
  const site = { id: Number(created.id), code: "MAIN", name: MAIN_SITE_NAME };
  await insertAudit(transaction, actorId, "CustomerSite", site.id, site.code, "Created", null, { customerId, ...site });
  return site;
}

async function createContact(transaction: Transaction, actorId: number, site: Site, input: ContactInput, primary = false) {
  const q = new sql.Request(transaction);
  q.input("site", sql.BigInt, site.id); q.input("name", sql.NVarChar(200), input.name); q.input("email", sql.NVarChar(256), input.email);
  q.input("title_th", sql.NVarChar(50), input.titleTh); q.input("title_en", sql.NVarChar(50), input.titleEn); q.input("title_ja", sql.NVarChar(50), input.titleJa);
  q.input("name_th", sql.NVarChar(200), input.nameTh); q.input("name_en", sql.NVarChar(200), input.nameEn); q.input("name_ja", sql.NVarChar(200), input.nameJa);
  const duplicate = (await q.query<Row>(`SELECT TOP(1) id,name FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK) WHERE site_id=@site AND deleted_at IS NULL AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja)) OR (@email<>N'' AND LOWER(LTRIM(RTRIM(email)))=LOWER(@email)));`)).recordset[0];
  if (duplicate) throw new ApiError(409, "duplicate_contact", "A contact with this name or email already exists at this site. Select the existing contact, or ask an administrator to restore it if it is inactive.", { id: Number(duplicate.id), siteId: site.id, name: duplicate.name });
  q.input("phone", sql.NVarChar(100), input.phone); q.input("department", sql.NVarChar(200), input.department);
  q.input("position", sql.NVarChar(200), input.position); q.input("actor", sql.BigInt, actorId); q.input("primary", sql.Bit, primary);
  const row = (await q.query<{ id: number | string }>(`INSERT INTO dbo.customer_site_contacts(site_id,name,title_th,title_en,title_ja,name_th,name_en,name_ja,email,phone,department,position,is_primary,created_by,updated_by) OUTPUT inserted.id VALUES(@site,@name,@title_th,@title_en,@title_ja,@name_th,@name_en,@name_ja,@email,@phone,@department,@position,@primary,@actor,@actor);`)).recordset[0]!;
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

export async function syncPrimaryCustomerContact(transaction: Transaction, actorId: number, customerId: number,
  input: ContactInput, previousName = input.name): Promise<void> {
  if (!input.name) return;
  const site = await contactSite(transaction, actorId, customerId);
  const q = new sql.Request(transaction);
  q.input("site", sql.BigInt, site.id); q.input("previous_name", sql.NVarChar(200), previousName);
  const before = (await q.query<Row>(`SELECT TOP(1) id,name,title_th,title_en,title_ja,name_th,name_en,name_ja,email,phone,department,position
    FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK)
    WHERE site_id=@site AND is_primary=1 AND is_active=1 AND deleted_at IS NULL AND name=@previous_name ORDER BY id;`)).recordset[0];
  if (!before) { await createContact(transaction, actorId, site, input, true); return; }
  q.input("id", sql.BigInt, before.id); q.input("name", sql.NVarChar(200), input.name);
  q.input("title_th", sql.NVarChar(50), input.titleTh); q.input("title_en", sql.NVarChar(50), input.titleEn); q.input("title_ja", sql.NVarChar(50), input.titleJa);
  q.input("name_th", sql.NVarChar(200), input.nameTh); q.input("name_en", sql.NVarChar(200), input.nameEn); q.input("name_ja", sql.NVarChar(200), input.nameJa);
  q.input("email", sql.NVarChar(256), input.email); q.input("phone", sql.NVarChar(100), input.phone);
  q.input("department", sql.NVarChar(200), input.department); q.input("position", sql.NVarChar(200), input.position);
  q.input("actor", sql.BigInt, actorId);
  const duplicate = (await q.query<Row>(`SELECT id FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK)
    WHERE site_id=@site AND id<>@id AND deleted_at IS NULL
      AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja)) OR (@email<>N'' AND LOWER(LTRIM(RTRIM(email)))=LOWER(@email)));`)).recordset[0];
  if (duplicate) throw new ApiError(409, "duplicate_contact", "A contact with this name or email already exists at this site.");
  await q.query(`UPDATE dbo.customer_site_contacts SET name=@name,title_th=@title_th,title_en=@title_en,title_ja=@title_ja,name_th=@name_th,name_en=@name_en,name_ja=@name_ja,email=@email,phone=@phone,department=@department,
    position=@position,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
  await insertAudit(transaction, actorId, "CustomerSiteContact", Number(before.id), "", "Updated", before, { ...input, siteId: site.id });
}

// A contact is always addressed through its customer, so one customer's id can never reach another's contact.
async function activeContact(transaction: Transaction, customerId: number, contactId: number): Promise<Row> {
  const q = new sql.Request(transaction);
  q.input("customer", sql.BigInt, customerId); q.input("contact", sql.BigInt, contactId);
  const row = (await q.query<Row>(`SELECT sc.id,sc.site_id,s.code site_code,s.name site_name,sc.name,sc.title_th,sc.title_en,sc.title_ja,sc.name_th,sc.name_en,sc.name_ja,sc.email,sc.phone,sc.department,sc.position,sc.is_primary,sc.row_version FROM dbo.customer_site_contacts sc WITH(UPDLOCK,HOLDLOCK)
    INNER JOIN dbo.customer_sites s ON s.id=sc.site_id
    WHERE sc.id=@contact AND s.customer_id=@customer AND sc.is_active=1 AND sc.deleted_at IS NULL AND s.is_active=1 AND s.deleted_at IS NULL;`)).recordset[0];
  if (!row) throw new ApiError(404, "contact_not_found", "The contact is unavailable. Refresh and select an active contact.");
  return row;
}

// Renaming or replacing the MAIN primary person must carry onto the customer row, because
// primaryCustomerContactApply joins the two on the contact name.
async function syncCustomerHeader(transaction: Transaction, actorId: number, customerId: number, input: ContactInput): Promise<void> {
  const q = new sql.Request(transaction);
  q.input("customer", sql.BigInt, customerId); q.input("contact", sql.NVarChar(200), input.name);
  q.input("email", sql.NVarChar(256), input.email); q.input("phone", sql.NVarChar(100), input.phone); q.input("actor", sql.BigInt, actorId);
  await q.query(`UPDATE dbo.customers SET contact=@contact,email=@email,phone=@phone,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@customer AND deleted_at IS NULL;`);
}

async function assertContactUnique(transaction: Transaction, siteId: number, contactId: number, input: ContactInput): Promise<void> {
  const q = new sql.Request(transaction);
  q.input("site", sql.BigInt, siteId); q.input("id", sql.BigInt, contactId);
  q.input("name", sql.NVarChar(200), input.name); q.input("email", sql.NVarChar(256), input.email);
  q.input("name_th", sql.NVarChar(200), input.nameTh); q.input("name_en", sql.NVarChar(200), input.nameEn); q.input("name_ja", sql.NVarChar(200), input.nameJa);
  const duplicate = (await q.query<Row>(`SELECT TOP(1) id,name FROM dbo.customer_site_contacts WITH(UPDLOCK,HOLDLOCK)
    WHERE site_id=@site AND id<>@id AND deleted_at IS NULL
      AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja)) OR (@email<>N'' AND LOWER(LTRIM(RTRIM(email)))=LOWER(@email)));`)).recordset[0];
  if (duplicate) throw new ApiError(409, "duplicate_contact", "A contact with this name or email already exists at this site.", { id: Number(duplicate.id), siteId, name: duplicate.name });
}
export function registerSalesCustomerRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/sales/customers/:customerId/contacts", async (request) => {
    await demandSalesCustomerPermission(users, request, false);
    const customerId = positiveLong((request.params as { customerId?: string }).customerId, "Customer id");
    const bind = (q: sql.Request) => q.input("customer", sql.BigInt, customerId);
    const customer = (await database.query<Row>(`SELECT c.contact,c.email,c.phone,COALESCE(primary_contact.department,N'') department,COALESCE(primary_contact.position,N'') position,COALESCE(primary_contact.title_th,N'') contact_title_th,COALESCE(primary_contact.title_en,N'') contact_title_en,COALESCE(primary_contact.title_ja,N'') contact_title_ja,COALESCE(primary_contact.name_th,N'') contact_name_th,COALESCE(primary_contact.name_en,N'') contact_name_en,COALESCE(primary_contact.name_ja,N'') contact_name_ja FROM dbo.customers c ${primaryCustomerContactApply} WHERE c.id=@customer AND c.is_active=1 AND c.deleted_at IS NULL;`, bind)).recordset[0];
    if (!customer) throw new ApiError(404, "customer_not_found", "The customer is unavailable.");
    const sites = (await database.query<Row>(`SELECT s.id,s.code,s.name FROM dbo.customer_sites s INNER JOIN dbo.customers c ON c.id=s.customer_id WHERE s.customer_id=@customer AND s.is_active=1 AND s.deleted_at IS NULL AND c.is_active=1 AND c.deleted_at IS NULL ORDER BY s.name;`, bind)).recordset;
    const contacts = (await database.query<Row>(`SELECT sc.id,sc.site_id,s.code site_code,s.name site_name,sc.name,sc.title_th,sc.title_en,sc.title_ja,sc.name_th,sc.name_en,sc.name_ja,sc.email,sc.phone,sc.department,sc.position,sc.is_primary,sc.row_version FROM dbo.customer_site_contacts sc INNER JOIN dbo.customer_sites s ON s.id=sc.site_id INNER JOIN dbo.customers c ON c.id=s.customer_id WHERE s.customer_id=@customer AND sc.is_active=1 AND sc.deleted_at IS NULL AND s.is_active=1 AND s.deleted_at IS NULL AND c.is_active=1 AND c.deleted_at IS NULL ORDER BY sc.is_primary DESC,sc.name;`, bind)).recordset;
    return {
      sites: sites.map((r) => ({ id: Number(r.id), code: r.code, name: r.name })),
      contacts: contacts.map((r) => ({ id: Number(r.id), siteId: Number(r.site_id), siteCode: r.site_code, siteName: r.site_name, name: r.name, titleTh: r.title_th, titleEn: r.title_en, titleJa: r.title_ja, nameTh: r.name_th, nameEn: r.name_en, nameJa: r.name_ja, email: r.email, phone: r.phone, department: r.department, position: r.position, isPrimary: Boolean(r.is_primary), rowVersion: (r.row_version as Buffer).toString("base64") })),
      primaryContact: customer.contact ? { name: customer.contact, titleTh: customer.contact_title_th, titleEn: customer.contact_title_en, titleJa: customer.contact_title_ja, nameTh: customer.contact_name_th, nameEn: customer.contact_name_en, nameJa: customer.contact_name_ja, email: customer.email, phone: customer.phone, department: customer.department, position: customer.position } : null,
    };
  });

  app.post("/api/v1/sales/customers", async (request, reply) => {
    await demandSalesCustomerPermission(users, request, true);
    const body = bodyObject(request.body);
    const actor = await users.required(request), input = salesCustomerInput(body);
    const codeTyped = typeof body.code === "string" && body.code.trim() !== "";
    const created = await database.transaction(async (transaction) => {
      const nameCheck = new sql.Request(transaction);
      nameCheck.input("name", sql.NVarChar(300), input.name);
      nameCheck.input("name_th", sql.NVarChar(300), input.nameTh); nameCheck.input("name_en", sql.NVarChar(300), input.nameEn); nameCheck.input("name_ja", sql.NVarChar(300), input.nameJa);
      const duplicate = (await nameCheck.query<Row>(`SELECT TOP(1) id,code,name FROM dbo.customers WITH(UPDLOCK,HOLDLOCK) WHERE deleted_at IS NULL AND (LOWER(LTRIM(RTRIM(name)))=LOWER(@name) OR (@name_th<>N'' AND LOWER(LTRIM(RTRIM(name_th)))=LOWER(@name_th)) OR (@name_en<>N'' AND LOWER(LTRIM(RTRIM(name_en)))=LOWER(@name_en)) OR (@name_ja<>N'' AND LOWER(LTRIM(RTRIM(name_ja)))=LOWER(@name_ja)));`)).recordset[0];
      if (duplicate) throw new ApiError(409, "duplicate_customer", "A customer with this code or name already exists. Select the existing customer, or ask an administrator if it is inactive.", { id: Number(duplicate.id), code: duplicate.code, name: duplicate.name });
      // The code is unique across soft-deleted rows too. A typed code is the operator's choice and
      // conflicts; a generated one quietly takes the next free variant instead of failing the intake.
      let code = input.code;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const codeCheck = new sql.Request(transaction);
        codeCheck.input("code", sql.NVarChar(30), code);
        const taken = (await codeCheck.query<Row>(`SELECT TOP(1) id,code,name FROM dbo.customers WITH(UPDLOCK,HOLDLOCK) WHERE code=@code;`)).recordset[0];
        if (!taken) break;
        if (codeTyped) throw new ApiError(409, "duplicate_customer", "A customer with this code or name already exists. Select the existing customer, or ask an administrator if it is inactive.", { id: Number(taken.id), code: taken.code, name: taken.name });
        code = attempt < 4
          ? customerCodeVariant(input.code)
          : `CUS-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
        if (attempt === 7) throw new ApiError(409, "duplicate_customer", "Could not allocate a free customer code. Enter one explicitly.");
      }
      input.code = code;
      const q = new sql.Request(transaction);
      q.input("code", sql.NVarChar(30), code); q.input("name", sql.NVarChar(300), input.name);
      q.input("name_th", sql.NVarChar(300), input.nameTh); q.input("name_en", sql.NVarChar(300), input.nameEn); q.input("name_ja", sql.NVarChar(300), input.nameJa);
      q.input("contact", sql.NVarChar(200), input.contact); q.input("email", sql.NVarChar(256), input.email);
      q.input("phone", sql.NVarChar(100), input.phone); q.input("site", sql.NVarChar(300), input.site); q.input("actor", sql.BigInt, actor.id);
      const row = (await q.query<{ id: number | string; row_version: Buffer }>(`INSERT INTO dbo.customers(code,name,name_th,name_en,name_ja,contact,email,phone,site,created_by,updated_by) OUTPUT inserted.id,inserted.row_version VALUES(@code,@name,@name_th,@name_en,@name_ja,@contact,@email,@phone,@site,@actor,@actor);`)).recordset[0]!;
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
    const customerId = positiveLong((request.params as { customerId?: string }).customerId, "Customer id");
    const input = salesContactInput(body), siteId = body.siteId == null ? undefined : requiredInteger(body.siteId, "Site id", 1);
    const created = await database.transaction(async (transaction) => {
      const site = await contactSite(transaction, actor.id, customerId, siteId);
      return createContact(transaction, actor.id, site, input);
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    return reply.status(201).send(created);
  });

  app.put("/api/v1/sales/customers/:customerId/contacts/:contactId", async (request) => {
    await demandSalesCustomerPermission(users, request, true);
    const actor = await users.required(request), body = bodyObject(request.body);
    const customerId = positiveLong((request.params as { customerId?: string }).customerId, "Customer id");
    const contactId = positiveLong((request.params as { contactId?: string }).contactId, "Contact id");
    const input = salesContactInput(body), rowVersion = parseRowVersion(body.rowVersion);
    if (body.isPrimary !== undefined && typeof body.isPrimary !== "boolean") throw new ApiError(400, "validation_failed", "Main contact must be true or false.");
    return database.transaction(async (transaction) => {
      await activeCustomer(transaction, customerId);
      const before = await activeContact(transaction, customerId, contactId);
      const siteId = Number(before.site_id), mainSite = String(before.site_code) === "MAIN";
      await assertContactUnique(transaction, siteId, contactId, input);
      const update = new sql.Request(transaction);
      update.input("id", sql.BigInt, contactId); update.input("row_version", sql.VarBinary(8), rowVersion); update.input("actor", sql.BigInt, actor.id);
      update.input("name", sql.NVarChar(200), input.name); update.input("email", sql.NVarChar(256), input.email); update.input("phone", sql.NVarChar(100), input.phone);
      update.input("title_th", sql.NVarChar(50), input.titleTh); update.input("title_en", sql.NVarChar(50), input.titleEn); update.input("title_ja", sql.NVarChar(50), input.titleJa);
      update.input("name_th", sql.NVarChar(200), input.nameTh); update.input("name_en", sql.NVarChar(200), input.nameEn); update.input("name_ja", sql.NVarChar(200), input.nameJa);
      update.input("department", sql.NVarChar(200), input.department); update.input("position", sql.NVarChar(200), input.position);
      const updated = (await update.query<{ row_version: Buffer }>(`UPDATE dbo.customer_site_contacts SET name=@name,title_th=@title_th,title_en=@title_en,title_ja=@title_ja,
        name_th=@name_th,name_en=@name_en,name_ja=@name_ja,email=@email,phone=@phone,department=@department,position=@position,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;`)).recordset[0];
      if (!updated) throw new ApiError(409, "concurrency_conflict", "This contact changed. Reload and try again.");
      let isPrimary = Boolean(before.is_primary), version = updated.row_version;
      if (body.isPrimary === true && !isPrimary) {
        const demote = new sql.Request(transaction);
        demote.input("site", sql.BigInt, siteId); demote.input("actor", sql.BigInt, actor.id);
        await demote.query(`UPDATE dbo.customer_site_contacts SET is_primary=0,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE site_id=@site AND is_primary=1 AND deleted_at IS NULL;`);
        const promote = new sql.Request(transaction);
        promote.input("id", sql.BigInt, contactId); promote.input("actor", sql.BigInt, actor.id);
        const promoted = (await promote.query<{ row_version: Buffer }>(`UPDATE dbo.customer_site_contacts SET is_primary=1,updated_by=@actor,updated_at=SYSUTCDATETIME()
          OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
        if (!promoted) throw new ApiError(409, "concurrency_conflict", "This contact changed. Reload and try again.");
        isPrimary = true; version = promoted.row_version;
      }
      if (isPrimary && mainSite) await syncCustomerHeader(transaction, actor.id, customerId, input);
      const after = { id: contactId, siteId, siteName: before.site_name, isPrimary, ...input };
      await insertAudit(transaction, actor.id, "CustomerSiteContact", contactId, "", "Updated", before, after);
      return { ...after, rowVersion: version.toString("base64") };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.delete("/api/v1/sales/customers/:customerId/contacts/:contactId", async (request) => {
    await demandSalesCustomerPermission(users, request, true);
    const actor = await users.required(request);
    const customerId = positiveLong((request.params as { customerId?: string }).customerId, "Customer id");
    const contactId = positiveLong((request.params as { contactId?: string }).contactId, "Contact id");
    const rowVersion = parseRowVersion((request.query as { rowVersion?: unknown } | undefined)?.rowVersion);
    return database.transaction(async (transaction) => {
      await activeCustomer(transaction, customerId);
      const before = await activeContact(transaction, customerId, contactId);
      if (before.is_primary) throw new ApiError(409, "primary_contact_protected", "Set another person as the main contact before removing this one.");
      const q = new sql.Request(transaction);
      q.input("id", sql.BigInt, contactId); q.input("actor", sql.BigInt, actor.id); q.input("row_version", sql.VarBinary(8), rowVersion);
      const removed = (await q.query<{ id: number | string }>(`UPDATE dbo.customer_site_contacts SET is_active=0,deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.id WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;`)).recordset[0];
      if (!removed) throw new ApiError(409, "concurrency_conflict", "This contact changed. Reload and try again.");
      await insertAudit(transaction, actor.id, "CustomerSiteContact", contactId, "", "Removed", before, null);
      return { id: contactId, siteId: Number(before.site_id), removed: true };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
}
