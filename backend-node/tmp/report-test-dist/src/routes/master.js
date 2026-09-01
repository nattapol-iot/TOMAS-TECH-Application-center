import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import { bodyObject, booleanQuery, dateOnly, optionalBodyText, optionalText, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText, } from "../http.js";
import { contactTitleInput, localizedNameInput, primaryCustomerContactApply, syncPrimaryCustomerContact } from "./sales-customers.js";
const EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4 = 1_000_000_000_000_000;
function validation(message) {
    return new ApiError(400, "validation_failed", message);
}
function requiredCode(value, label, maximumLength) {
    const code = requiredText(value, maximumLength, label).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
        throw validation(`${label} may contain only letters, numbers, hyphen, underscore, period and slash, and must start with a letter or number.`);
    }
    return code;
}
function email(value, required) {
    const normalized = required ? requiredText(value, 256, "Email").toLowerCase() : (optionalBodyText(value, 256, "Email") ?? "");
    if (normalized && (!/^[^\s<>(),;:@]+(?:\.[^\s<>(),;:@]+)*@[^\s<>(),;:@]+(?:\.[^\s<>(),;:@]+)+$/.test(normalized))) {
        throw validation("Email must be a valid address without a display name.");
    }
    return normalized;
}
function booleanBody(value, label) {
    if (typeof value !== "boolean")
        throw validation(`${label} must be true or false.`);
    return value;
}
function nonnegativeDecimal(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value))
        throw validation(`${label} is invalid.`);
    if (value < 0)
        throw validation(`${label} cannot be negative.`);
    if (value >= EXCLUSIVE_MAXIMUM_DECIMAL_19_SCALE_4)
        throw validation(`${label} exceeds the supported amount.`);
    const text = value.toString();
    const fraction = text.includes(".") ? text.split(".")[1] ?? "" : "";
    if (!text.includes("e") && fraction.length > 4)
        throw validation(`${label} cannot have more than four decimal places.`);
    return value;
}
function normalizedBrands(value) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value) || value.length > 100)
        throw validation("Brands cannot contain more than 100 entries.");
    const values = [];
    const seen = new Set();
    for (const item of value) {
        const brand = requiredText(item, 100, "Brand");
        const key = brand.toLocaleLowerCase("en-US");
        if (!seen.has(key)) {
            seen.add(key);
            values.push(brand);
        }
    }
    return values;
}
function employeeInput(body) {
    const employeeNo = requiredInteger(body.employeeNo, "Employee number", 1);
    const startWorkDate = parseDateOnly(body.startWorkDate, "Start-work date");
    const birthDate = parseDateOnly(body.birthDate, "Birth date", true);
    const endWorkDate = parseDateOnly(body.endWorkDate, "End-work date", true);
    if (birthDate && birthDate >= startWorkDate)
        throw validation("Birth date must be earlier than start-work date.");
    if (endWorkDate && endWorkDate < startWorkDate)
        throw validation("End-work date cannot be earlier than start-work date.");
    return {
        employeeNo,
        nameEn: requiredText(body.nameEn, 200, "English name"),
        nameTh: optionalBodyText(body.nameTh, 200, "Thai name") ?? "",
        department: requiredText(body.department, 100, "Department"),
        jobTitle: requiredText(body.jobTitle, 500, "Job title"),
        mobile: optionalBodyText(body.mobile, 50, "Mobile") ?? "",
        email: email(body.email, true),
        nickname: optionalBodyText(body.nickname, 100, "Nickname") ?? "",
        birthDate,
        uniformSize: optionalBodyText(body.uniformSize, 50, "Uniform size") ?? "",
        shoeSize: optionalBodyText(body.shoeSize, 50, "Shoe size") ?? "",
        startWorkDate,
        endWorkDate,
        position: requiredText(body.position, 100, "Position"),
        isActive: booleanBody(body.isActive, "Active status"),
    };
}
function bindEmployee(request, input, userId) {
    request.input("employee_no", sql.Int, input.employeeNo);
    request.input("name_en", sql.NVarChar(200), input.nameEn);
    request.input("name_th", sql.NVarChar(200), input.nameTh);
    request.input("department", sql.NVarChar(100), input.department);
    request.input("job_title", sql.NVarChar(500), input.jobTitle);
    request.input("mobile", sql.NVarChar(50), input.mobile);
    request.input("email", sql.NVarChar(256), input.email);
    request.input("nickname", sql.NVarChar(100), input.nickname);
    request.input("birth_date", sql.Date, input.birthDate);
    request.input("uniform_size", sql.NVarChar(50), input.uniformSize);
    request.input("shoe_size", sql.NVarChar(50), input.shoeSize);
    request.input("start_work_date", sql.Date, input.startWorkDate);
    request.input("end_work_date", sql.Date, input.endWorkDate);
    request.input("position", sql.NVarChar(100), input.position);
    request.input("user_id", sql.BigInt, userId);
    request.input("is_active", sql.Bit, input.isActive);
}
async function syncEmployeeDirectoryUser(transaction, employeeId) {
    const request = new sql.Request(transaction);
    request.input("employee_id", sql.BigInt, employeeId);
    const row = (await request.query(`
    EXEC dbo.sync_employee_directory_user @employee_id=@employee_id;
    SELECT row_version FROM dbo.employees WHERE id=@employee_id AND deleted_at IS NULL;
  `)).recordset[0];
    if (!row)
        throw new Error("The synchronized employee was not found.");
    return row.row_version;
}
export function customerInput(body) {
    for (const field of ["department", "position"]) {
        if (body[field] != null && typeof body[field] !== "string")
            throw validation(`${field} must be text.`);
    }
    const companyNames = localizedNameInput(body, "", "name", 300, "Customer name", true);
    const contactNames = localizedNameInput(body, "contact", "contact", 200, "Contact name", false);
    const titles = contactTitleInput(body, true);
    const input = {
        code: requiredCode(body.code, "Customer code", 30),
        ...companyNames,
        contactTitleTh: titles.titleTh, contactTitleEn: titles.titleEn, contactTitleJa: titles.titleJa,
        contact: contactNames.name, contactNameTh: contactNames.nameTh, contactNameEn: contactNames.nameEn, contactNameJa: contactNames.nameJa,
        email: email(body.email, false),
        phone: optionalBodyText(body.phone, 100, "Phone") ?? "",
        industry: optionalBodyText(body.industry, 200, "Industry") ?? "",
        site: optionalBodyText(body.site, 300, "Site") ?? "",
        department: optionalBodyText(body.department, 200, "Department") ?? "",
        position: optionalBodyText(body.position, 200, "Position") ?? "",
    };
    if (!input.contact && (input.department || input.position || input.contactTitleTh || input.contactTitleEn || input.contactTitleJa))
        throw validation("Enter the contact name when providing contact titles, department or position.");
    return input;
}
function bindCustomer(request, input) {
    request.input("code", sql.NVarChar(30), input.code);
    request.input("name", sql.NVarChar(300), input.name);
    request.input("name_th", sql.NVarChar(300), input.nameTh);
    request.input("name_en", sql.NVarChar(300), input.nameEn);
    request.input("name_ja", sql.NVarChar(300), input.nameJa);
    request.input("contact", sql.NVarChar(200), input.contact);
    request.input("email", sql.NVarChar(256), input.email);
    request.input("phone", sql.NVarChar(100), input.phone);
    request.input("industry", sql.NVarChar(200), input.industry);
    request.input("site", sql.NVarChar(300), input.site);
}
export function registerMasterRoutes(app, database, users) {
    app.get("/api/v1/master/employees", async (request) => {
        await users.demandPermission(request, "master.read");
        const actor = await users.required(request);
        const query = request.query;
        const search = optionalText(query.search, 200, "Search") ?? "";
        const activeOnly = booleanQuery(query.activeOnly, false);
        const result = await database.query(`
      DECLARE @include_private bit=CASE WHEN EXISTS(
        SELECT 1 FROM dbo.users permission_user
        INNER JOIN dbo.role_permissions rp ON rp.role_id=permission_user.role_id
        INNER JOIN dbo.permissions p ON p.id=rp.permission_id
        WHERE permission_user.id=@actor AND p.code=N'master.write') THEN 1 ELSE 0 END;
      SELECT employee.id,employee.employee_no,employee.name_en,employee.name_th,employee.department,employee.job_title,
        CASE WHEN @include_private=1 THEN employee.mobile ELSE N'' END AS mobile, employee.email,employee.nickname,
        CASE WHEN @include_private=1 THEN employee.birth_date ELSE NULL END AS birth_date,
        CASE WHEN @include_private=1 THEN employee.uniform_size ELSE N'' END AS uniform_size,
        CASE WHEN @include_private=1 THEN employee.shoe_size ELSE N'' END AS shoe_size,
        employee.start_work_date,employee.end_work_date,employee.position,employee.is_active,app_user.id AS user_id,
        CASE WHEN app_user.id IS NULL THEN NULL ELSE CONCAT(role.code,
          (SELECT STRING_AGG(CONVERT(nvarchar(max),N' + '+business_role.code),N'')
           FROM dbo.user_business_roles business_grant JOIN dbo.roles business_role ON business_role.id=business_grant.role_id
           WHERE business_grant.user_id=app_user.id AND business_grant.revoked_at IS NULL AND business_role.is_active=1)) END AS application_role,
        app_user.is_active AS account_active,
        rate.engineering_daily AS daily_rate,
        employee.updated_at,employee.row_version
      FROM dbo.employees employee
      LEFT JOIN dbo.users app_user ON app_user.deleted_at IS NULL AND
        ((employee.user_id IS NOT NULL AND app_user.id=employee.user_id) OR (employee.user_id IS NULL AND app_user.email=employee.email))
      LEFT JOIN dbo.roles role ON role.id=app_user.role_id
      OUTER APPLY (SELECT TOP (1) engineering_rate.engineering_daily FROM dbo.engineering_rates engineering_rate
        WHERE engineering_rate.is_active=1 AND engineering_rate.level=employee.position
          AND engineering_rate.department=employee.department AND engineering_rate.effective_from<=CONVERT(date,SYSUTCDATETIME())
          AND (engineering_rate.effective_to IS NULL OR engineering_rate.effective_to>=CONVERT(date,SYSUTCDATETIME()))
        ORDER BY engineering_rate.effective_from DESC,engineering_rate.id DESC) rate
      WHERE employee.deleted_at IS NULL AND (@active_only=0 OR employee.is_active=1)
        AND (@search=N'' OR employee.name_en LIKE N'%'+@search+N'%' OR employee.name_th LIKE N'%'+@search+N'%'
          OR employee.nickname LIKE N'%'+@search+N'%' OR employee.email LIKE N'%'+@search+N'%'
          OR employee.department LIKE N'%'+@search+N'%' OR employee.position LIKE N'%'+@search+N'%'
          OR CONVERT(nvarchar(20),employee.employee_no)=@search)
      ORDER BY employee.is_active DESC,employee.employee_no;
    `, (sqlRequest) => {
            sqlRequest.input("search", sql.NVarChar(200), search);
            sqlRequest.input("active_only", sql.Bit, activeOnly);
            sqlRequest.input("actor", sql.BigInt, actor.id);
        });
        return result.recordset.map((row) => ({
            id: Number(row.id), employeeNo: row.employee_no, nameEn: row.name_en, nameTh: row.name_th,
            department: row.department, jobTitle: row.job_title, mobile: row.mobile, email: row.email,
            nickname: row.nickname, birthDate: dateOnly(row.birth_date), uniformSize: row.uniform_size,
            shoeSize: row.shoe_size, startWorkDate: dateOnly(row.start_work_date), endWorkDate: dateOnly(row.end_work_date),
            position: row.position, isActive: Boolean(row.is_active), userId: row.user_id === null ? null : Number(row.user_id),
            applicationRole: row.application_role, accountActive: row.account_active === null ? null : Boolean(row.account_active),
            dailyRate: row.daily_rate === null ? null : Number(row.daily_rate), updatedAt: row.updated_at,
            rowVersion: row.row_version.toString("base64"),
        }));
    });
    app.post("/api/v1/master/employees", async (request, reply) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const input = employeeInput(bodyObject(request.body));
        const created = await database.transaction(async (transaction) => {
            const insert = new sql.Request(transaction);
            bindEmployee(insert, input, null);
            insert.input("actor", sql.BigInt, actor.id);
            const row = (await insert.query(`
        INSERT INTO dbo.employees (employee_no,name_en,name_th,department,job_title,mobile,email,nickname,birth_date,
          uniform_size,shoe_size,start_work_date,end_work_date,position,user_id,is_active,created_by,updated_by)
        OUTPUT inserted.id,inserted.row_version VALUES (@employee_no,@name_en,@name_th,@department,@job_title,@mobile,
          @email,@nickname,@birth_date,@uniform_size,@shoe_size,@start_work_date,@end_work_date,@position,@user_id,
          @is_active,@actor,@actor);
      `)).recordset[0];
            const id = Number(row.id);
            const synchronizedRowVersion = await syncEmployeeDirectoryUser(transaction, id);
            await insertAudit(transaction, actor.id, "Employee", id, String(input.employeeNo), "Created", null, input);
            return { id, employeeNo: input.employeeNo, nameEn: input.nameEn, rowVersion: synchronizedRowVersion.toString("base64") };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply.status(201).header("Location", `/api/v1/master/employees/${created.id}`).send(created);
    });
    app.put("/api/v1/master/employees/:id", async (request) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Employee id");
        const body = bodyObject(request.body);
        const input = employeeInput(body);
        const rowVersion = parseRowVersion(body.rowVersion);
        return database.transaction(async (transaction) => {
            const beforeRequest = new sql.Request(transaction);
            beforeRequest.input("id", sql.BigInt, id);
            const before = (await beforeRequest.query(`
        SELECT employee_no AS employeeNo,name_en AS nameEn,name_th AS nameTh,department,job_title AS jobTitle,
          mobile,email,nickname,birth_date AS birthDate,uniform_size AS uniformSize,shoe_size AS shoeSize,
          start_work_date AS startWorkDate,end_work_date AS endWorkDate,position,is_active AS isActive
        FROM dbo.employees WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;
      `)).recordset[0];
            if (!before)
                throw new ApiError(404, "employee_not_found", "Employee was not found.");
            const update = new sql.Request(transaction);
            bindEmployee(update, input, null);
            update.input("actor", sql.BigInt, actor.id);
            update.input("id", sql.BigInt, id);
            update.input("row_version", sql.VarBinary(8), rowVersion);
            const updated = (await update.query(`
        UPDATE dbo.employees SET employee_no=@employee_no,name_en=@name_en,name_th=@name_th,department=@department,
          job_title=@job_title,mobile=@mobile,email=@email,nickname=@nickname,birth_date=@birth_date,
          uniform_size=@uniform_size,shoe_size=@shoe_size,start_work_date=@start_work_date,end_work_date=@end_work_date,
          position=@position,is_active=@is_active,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
      `)).recordset[0];
            if (!updated)
                throw new ApiError(409, "concurrency_conflict", "This employee changed. Reload and try again.");
            const synchronizedRowVersion = await syncEmployeeDirectoryUser(transaction, id);
            await insertAudit(transaction, actor.id, "Employee", id, String(input.employeeNo), "Updated", before, input);
            return { id, employeeNo: input.employeeNo, nameEn: input.nameEn, rowVersion: synchronizedRowVersion.toString("base64") };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/master/customers", async (request, reply) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const input = customerInput(bodyObject(request.body));
        const created = await database.transaction(async (transaction) => {
            const insert = new sql.Request(transaction);
            bindCustomer(insert, input);
            insert.input("actor", sql.BigInt, actor.id);
            const row = (await insert.query(`
        INSERT INTO dbo.customers (code,name,name_th,name_en,name_ja,contact,email,phone,industry,site,created_by,updated_by)
        OUTPUT inserted.id,inserted.code,inserted.name,inserted.row_version
        VALUES (@code,@name,@name_th,@name_en,@name_ja,@contact,@email,@phone,@industry,@site,@actor,@actor);
      `)).recordset[0];
            const id = Number(row.id);
            await syncPrimaryCustomerContact(transaction, actor.id, id, { name: input.contact, titleTh: input.contactTitleTh, titleEn: input.contactTitleEn, titleJa: input.contactTitleJa, nameTh: input.contactNameTh, nameEn: input.contactNameEn, nameJa: input.contactNameJa, email: input.email, phone: input.phone, department: input.department, position: input.position });
            await insertAudit(transaction, actor.id, "Customer", id, row.code, "Created", null, input);
            return { id, code: row.code, name: row.name, nameTh: input.nameTh, nameEn: input.nameEn, nameJa: input.nameJa, contactTitleTh: input.contactTitleTh, contactTitleEn: input.contactTitleEn, contactTitleJa: input.contactTitleJa, contactNameTh: input.contactNameTh, contactNameEn: input.contactNameEn, contactNameJa: input.contactNameJa, department: input.department, position: input.position, rowVersion: row.row_version.toString("base64") };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply.status(201).header("Location", `/api/v1/master/customers/${created.id}`).send(created);
    });
    app.put("/api/v1/master/customers/:id", async (request) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const id = positiveLong(request.params.id, "Customer id");
        const body = bodyObject(request.body);
        const input = customerInput(body);
        const rowVersion = parseRowVersion(body.rowVersion);
        return database.transaction(async (transaction) => {
            const beforeRequest = new sql.Request(transaction);
            beforeRequest.input("id", sql.BigInt, id);
            const before = (await beforeRequest.query(`
        SELECT c.code,c.name,c.name_th AS nameTh,c.name_en AS nameEn,c.name_ja AS nameJa,c.contact,c.email,c.phone,c.industry,c.site,
          COALESCE(primary_contact.title_th,N'') contactTitleTh,COALESCE(primary_contact.title_en,N'') contactTitleEn,COALESCE(primary_contact.title_ja,N'') contactTitleJa,COALESCE(primary_contact.name_th,N'') contactNameTh,COALESCE(primary_contact.name_en,N'') contactNameEn,COALESCE(primary_contact.name_ja,N'') contactNameJa,
          COALESCE(primary_contact.department,N'') department,COALESCE(primary_contact.position,N'') position
        FROM dbo.customers c WITH (UPDLOCK,HOLDLOCK) ${primaryCustomerContactApply}
        WHERE c.id=@id AND c.deleted_at IS NULL;
      `)).recordset[0];
            if (!before)
                throw new ApiError(404, "customer_not_found", "Customer was not found.");
            if (body.department === undefined)
                input.department = before.department;
            if (body.position === undefined)
                input.position = before.position;
            if (body.nameTh === undefined)
                input.nameTh = before.nameTh;
            if (body.nameEn === undefined)
                input.nameEn = before.nameEn;
            if (body.nameJa === undefined)
                input.nameJa = before.nameJa;
            if (body.contactTitleTh === undefined)
                input.contactTitleTh = before.contactTitleTh;
            if (body.contactTitleEn === undefined)
                input.contactTitleEn = before.contactTitleEn;
            if (body.contactTitleJa === undefined)
                input.contactTitleJa = before.contactTitleJa;
            if (body.contactNameTh === undefined)
                input.contactNameTh = before.contactNameTh;
            if (body.contactNameEn === undefined)
                input.contactNameEn = before.contactNameEn;
            if (body.contactNameJa === undefined)
                input.contactNameJa = before.contactNameJa;
            if (!input.contact && (input.department || input.position || input.contactTitleTh || input.contactTitleEn || input.contactTitleJa))
                throw validation("Enter the contact name when providing contact titles, department or position.");
            const update = new sql.Request(transaction);
            bindCustomer(update, input);
            update.input("actor", sql.BigInt, actor.id);
            update.input("id", sql.BigInt, id);
            update.input("row_version", sql.VarBinary(8), rowVersion);
            const updated = (await update.query(`
        UPDATE dbo.customers SET code=@code,name=@name,name_th=@name_th,name_en=@name_en,name_ja=@name_ja,contact=@contact,email=@email,phone=@phone,industry=@industry,
          site=@site,updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.row_version WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
      `)).recordset[0];
            if (!updated)
                throw new ApiError(409, "concurrency_conflict", "This customer changed. Reload and try again.");
            if (input.contact) {
                await syncPrimaryCustomerContact(transaction, actor.id, id, { name: input.contact, titleTh: input.contactTitleTh, titleEn: input.contactTitleEn, titleJa: input.contactTitleJa, nameTh: input.contactNameTh, nameEn: input.contactNameEn, nameJa: input.contactNameJa, email: input.email, phone: input.phone, department: input.department, position: input.position }, before.contact);
            }
            await insertAudit(transaction, actor.id, "Customer", id, input.code, "Updated", before, input);
            return { id, code: input.code, name: input.name, nameTh: input.nameTh, nameEn: input.nameEn, nameJa: input.nameJa, contactTitleTh: input.contactTitleTh, contactTitleEn: input.contactTitleEn, contactTitleJa: input.contactTitleJa, contactNameTh: input.contactNameTh, contactNameEn: input.contactNameEn, contactNameJa: input.contactNameJa, department: input.department, position: input.position, rowVersion: updated.row_version.toString("base64") };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/master/suppliers", async (request, reply) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const body = bodyObject(request.body);
        const input = {
            code: requiredCode(body.code, "Supplier code", 30),
            name: requiredText(body.name, 300, "Supplier name"),
            category: requiredText(body.category, 100, "Supplier category"),
            contact: optionalBodyText(body.contact, 200, "Contact") ?? "",
            email: email(body.email, false),
            phone: optionalBodyText(body.phone, 100, "Phone") ?? "",
            brands: normalizedBrands(body.brands),
        };
        const created = await database.transaction(async (transaction) => {
            const insert = new sql.Request(transaction);
            insert.input("code", sql.NVarChar(30), input.code);
            insert.input("name", sql.NVarChar(300), input.name);
            insert.input("category", sql.NVarChar(100), input.category);
            insert.input("contact", sql.NVarChar(200), input.contact);
            insert.input("email", sql.NVarChar(256), input.email);
            insert.input("phone", sql.NVarChar(100), input.phone);
            insert.input("brands_json", sql.NVarChar(sql.MAX), JSON.stringify(input.brands));
            insert.input("actor", sql.BigInt, actor.id);
            const row = (await insert.query(`
        INSERT INTO dbo.suppliers (code,name,category,contact,email,phone,brands_json,created_by,updated_by)
        OUTPUT inserted.id,inserted.code,inserted.name,inserted.row_version
        VALUES (@code,@name,@category,@contact,@email,@phone,@brands_json,@actor,@actor);
      `)).recordset[0];
            const id = Number(row.id);
            await insertAudit(transaction, actor.id, "Supplier", id, row.code, "Created", null, input);
            return { id, code: row.code, name: row.name, rowVersion: row.row_version.toString("base64") };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply.status(201).header("Location", `/api/v1/master/suppliers/${created.id}`).send(created);
    });
    app.post("/api/v1/master/inventory-items", async (request, reply) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const body = bodyObject(request.body);
        const preferredSupplierId = body.preferredSupplierId === undefined || body.preferredSupplierId === null
            ? null : requiredInteger(body.preferredSupplierId, "Preferred supplier id", 1);
        const input = {
            itemCode: requiredCode(body.itemCode, "Item code", 100),
            partNumber: optionalBodyText(body.partNumber, 200, "Part number") ?? "",
            description: requiredText(body.description, 500, "Description"),
            brand: optionalBodyText(body.brand, 100, "Brand") ?? "",
            unit: requiredText(body.unit, 50, "Unit"),
            location: optionalBodyText(body.location, 100, "Location") ?? "",
            reorderLevel: nonnegativeDecimal(body.reorderLevel, "Reorder level"),
            averageUnitCost: nonnegativeDecimal(body.averageUnitCost, "Average unit cost"),
            leadTimeDays: requiredInteger(body.leadTimeDays, "Lead time days", 0),
            preferredSupplierId,
        };
        const created = await database.transaction(async (transaction) => {
            if (preferredSupplierId !== null) {
                const supplierRequest = new sql.Request(transaction);
                supplierRequest.input("supplier_id", sql.BigInt, preferredSupplierId);
                const allowed = (await supplierRequest.query(`
          SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.suppliers WHERE id=@supplier_id AND is_active=1 AND deleted_at IS NULL)
            THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS allowed;
        `)).recordset[0]?.allowed;
                if (!allowed)
                    throw new ApiError(400, "invalid_supplier", "Preferred supplier must reference an active supplier.");
            }
            const insert = new sql.Request(transaction);
            insert.input("code", sql.NVarChar(100), input.itemCode);
            insert.input("part_number", sql.NVarChar(200), input.partNumber);
            insert.input("description", sql.NVarChar(500), input.description);
            insert.input("brand", sql.NVarChar(100), input.brand);
            insert.input("unit", sql.NVarChar(50), input.unit);
            insert.input("location", sql.NVarChar(100), input.location);
            insert.input("reorder_level", sql.Decimal(19, 4), input.reorderLevel);
            insert.input("average_unit_cost", sql.Decimal(19, 4), input.averageUnitCost);
            insert.input("lead_time_days", sql.Int, input.leadTimeDays);
            insert.input("preferred_supplier_id", sql.BigInt, preferredSupplierId);
            insert.input("actor", sql.BigInt, actor.id);
            const row = (await insert.query(`
        INSERT INTO dbo.mat_items (item_code,part_no,description,brand,unit,location,reorder_level,avg_unit_cost,
          lead_time_days,preferred_supplier_id,created_by,updated_by)
        OUTPUT inserted.id,inserted.item_code AS code,inserted.description AS name,inserted.row_version
        VALUES (@code,@part_number,@description,@brand,@unit,@location,@reorder_level,@average_unit_cost,
          @lead_time_days,@preferred_supplier_id,@actor,@actor);
      `)).recordset[0];
            const id = Number(row.id);
            await insertAudit(transaction, actor.id, "InventoryItem", id, String(id), "Created", null, input);
            return { id, code: row.code, name: row.name, rowVersion: row.row_version.toString("base64") };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply.status(201).header("Location", `/api/v1/master/inventory-items/${created.id}`).send(created);
    });
    app.post("/api/v1/master/engineering-rates", async (request, reply) => {
        await users.demandPermission(request, "master.write");
        const actor = await users.required(request);
        const body = bodyObject(request.body);
        const input = {
            level: requiredText(body.level, 100, "Engineering level"),
            department: requiredText(body.department, 100, "Department"),
            engineeringHourly: nonnegativeDecimal(body.engineeringHourly, "Engineering hourly rate"),
            engineeringDaily: nonnegativeDecimal(body.engineeringDaily, "Engineering daily rate"),
            installationHourly: nonnegativeDecimal(body.installationHourly, "Installation hourly rate"),
            installationDaily: nonnegativeDecimal(body.installationDaily, "Installation daily rate"),
            effectiveFrom: parseDateOnly(body.effectiveFrom, "Effective-from date"),
            effectiveTo: parseDateOnly(body.effectiveTo, "Effective-to date", true),
        };
        if (input.effectiveTo && input.effectiveTo < input.effectiveFrom)
            throw validation("Effective-to date cannot be earlier than effective-from date.");
        const created = await database.transaction(async (transaction) => {
            const overlapRequest = new sql.Request(transaction);
            overlapRequest.input("level", sql.NVarChar(100), input.level);
            overlapRequest.input("department", sql.NVarChar(100), input.department);
            overlapRequest.input("effective_from", sql.Date, input.effectiveFrom);
            overlapRequest.input("effective_to", sql.Date, input.effectiveTo);
            const overlap = (await overlapRequest.query(`
        SELECT CASE WHEN EXISTS(SELECT 1 FROM dbo.engineering_rates WITH (UPDLOCK,HOLDLOCK,INDEX(IX_engineering_rates_effective_range))
          WHERE is_active=1 AND level=@level AND department=@department
            AND effective_from<=ISNULL(@effective_to,CONVERT(date,'99991231',112))
            AND @effective_from<=ISNULL(effective_to,CONVERT(date,'99991231',112)))
          THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS overlaps;
      `)).recordset[0]?.overlaps;
            if (overlap)
                throw new ApiError(409, "engineering_rate_overlap", "An active engineering rate already covers part of this level, department and date range.");
            const insert = new sql.Request(transaction);
            insert.input("level", sql.NVarChar(100), input.level);
            insert.input("department", sql.NVarChar(100), input.department);
            insert.input("engineering_hourly", sql.Decimal(19, 4), input.engineeringHourly);
            insert.input("engineering_daily", sql.Decimal(19, 4), input.engineeringDaily);
            insert.input("installation_hourly", sql.Decimal(19, 4), input.installationHourly);
            insert.input("installation_daily", sql.Decimal(19, 4), input.installationDaily);
            insert.input("effective_from", sql.Date, input.effectiveFrom);
            insert.input("effective_to", sql.Date, input.effectiveTo);
            insert.input("actor", sql.BigInt, actor.id);
            const row = (await insert.query(`
        INSERT INTO dbo.engineering_rates (level,department,engineering_hourly,engineering_daily,installation_hourly,
          installation_daily,effective_from,effective_to,created_by)
        OUTPUT inserted.id,inserted.level,inserted.department,inserted.row_version
        VALUES (@level,@department,@engineering_hourly,@engineering_daily,@installation_hourly,@installation_daily,
          @effective_from,@effective_to,@actor);
      `)).recordset[0];
            const id = Number(row.id);
            await insertAudit(transaction, actor.id, "EngineeringRate", id, String(id), "Created", null, input);
            return { id, level: row.level, department: row.department, rowVersion: row.row_version.toString("base64") };
        });
        return reply.status(201).header("Location", `/api/v1/master/engineering-rates/${created.id}`).send(created);
    });
}
//# sourceMappingURL=master.js.map