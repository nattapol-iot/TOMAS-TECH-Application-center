import type { FastifyInstance } from "fastify";
import sql from "mssql";
import type { Database } from "../db.js";
import { dateOnly } from "../http.js";
import type { CurrentUserService } from "../users.js";
import { primaryCustomerContactApply } from "./sales-customers.js";

type CountRow = {
  inquiry_count: number; estimate_count: number; active_project_count: number; approval_count: number;
  employee_id: number | null; employee_no: number | null; employee_nickname: string | null;
  employee_level: string | null; employee_start_work_date: Date | string | null;
};
type CustomerRow = { id: number; code: string; name: string; name_th: string; name_en: string; name_ja: string; industry: string; contact: string; contact_title_th: string; contact_title_en: string; contact_title_ja: string; contact_name_th: string; contact_name_en: string; contact_name_ja: string; email: string; phone: string; site: string; department: string; position: string; inquiry_count: number; open_estimate_count: number; row_version: Buffer };
type SupplierRow = { id: number; code: string; name: string; category: string };
type TeamRow = {
  id: number; name: string; email: string; role: string; department: string; level: string;
  employee_id: number; employee_no: number; nickname: string; start_work_date: Date | string; can_sign_in: boolean;
  row_version: Buffer;
};
type PermissionRow = { code: string };

export function registerBootstrapRoutes(app: FastifyInstance, database: Database, users: CurrentUserService): void {
  app.get("/api/v1/me", async (request) => users.required(request));

  app.get("/api/v1/bootstrap", async (request) => {
    const user = await users.required(request);
    const result = await database.query<CountRow | CustomerRow | SupplierRow | TeamRow | PermissionRow>(`
      ;WITH granted AS (
        SELECT code FROM dbo.user_effective_permissions WHERE user_id = @user_id
      )
      SELECT
        CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'inquiry.read')
             THEN (SELECT COUNT_BIG(*) FROM dbo.inquiries WHERE deleted_at IS NULL) ELSE CONVERT(bigint, 0) END AS inquiry_count,
        CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'estimate.read')
             THEN (SELECT COUNT_BIG(*) FROM dbo.estimates WHERE deleted_at IS NULL) ELSE CONVERT(bigint, 0) END AS estimate_count,
        CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'project.read')
             THEN (SELECT COUNT_BIG(*) FROM dbo.projects WHERE deleted_at IS NULL AND status <> N'Closed') ELSE CONVERT(bigint, 0) END AS active_project_count,
        CASE WHEN EXISTS (SELECT 1 FROM granted WHERE code = N'estimate.approve')
             THEN (SELECT COUNT_BIG(*) FROM dbo.estimates WHERE deleted_at IS NULL AND status = N'Engineering Review') ELSE CONVERT(bigint, 0) END AS approval_count,
        employee.id AS employee_id,
        employee.employee_no,
        employee.nickname AS employee_nickname,
        employee.position AS employee_level,
        employee.start_work_date AS employee_start_work_date
      FROM (VALUES (1)) singleton(value)
      OUTER APPLY (
        SELECT TOP (1) id, employee_no, nickname, position, start_work_date
        FROM dbo.employees
        WHERE user_id = @user_id AND deleted_at IS NULL
        ORDER BY is_active DESC, id DESC
      ) employee;

      SELECT c.id, c.code, c.name, c.name_th, c.name_en, c.name_ja, c.industry, c.contact, c.email, c.phone, c.site,
        COALESCE(primary_contact.title_th,N'') contact_title_th,COALESCE(primary_contact.title_en,N'') contact_title_en,COALESCE(primary_contact.title_ja,N'') contact_title_ja,COALESCE(primary_contact.name_th,N'') contact_name_th,COALESCE(primary_contact.name_en,N'') contact_name_en,COALESCE(primary_contact.name_ja,N'') contact_name_ja,
        COALESCE(primary_contact.department,N'') department,COALESCE(primary_contact.position,N'') position,
        (SELECT COUNT_BIG(*) FROM dbo.inquiries i WHERE i.customer_id = c.id AND i.deleted_at IS NULL) AS inquiry_count,
        (SELECT COUNT_BIG(*) FROM dbo.estimates e WHERE e.customer_id = c.id AND e.deleted_at IS NULL AND e.status NOT IN (N'Approved', N'Locked')) AS open_estimate_count,
        c.row_version
      FROM dbo.customers c ${primaryCustomerContactApply} WHERE c.is_active = 1 AND c.deleted_at IS NULL ORDER BY c.name;

      SELECT id, code, name, category FROM dbo.suppliers WHERE is_active = 1 AND deleted_at IS NULL ORDER BY name;

      SELECT app_user.id, employee.name_en AS name, employee.email, role.code AS role,
        employee.department, employee.position AS level, employee.id AS employee_id,
        employee.employee_no, employee.nickname, employee.start_work_date,
        CONVERT(bit, CASE WHEN app_user.entra_object_id IS NULL THEN 0 ELSE 1 END) AS can_sign_in,
        app_user.row_version
      FROM dbo.employees employee
      INNER JOIN dbo.users app_user ON app_user.id = employee.user_id
      INNER JOIN dbo.roles role ON role.id = app_user.role_id
      WHERE employee.is_active = 1 AND employee.deleted_at IS NULL
        AND app_user.is_active = 1 AND app_user.deleted_at IS NULL
      ORDER BY employee.employee_no;

      SELECT code FROM dbo.user_effective_permissions WHERE user_id = @user_id ORDER BY code;
    `, (sqlRequest) => sqlRequest.input("user_id", sql.BigInt, user.id));

    const counts = result.recordsets[0] as unknown as CountRow[];
    const customers = result.recordsets[1] as unknown as CustomerRow[];
    const suppliers = result.recordsets[2] as unknown as SupplierRow[];
    const team = result.recordsets[3] as unknown as TeamRow[];
    const permissions = result.recordsets[4] as unknown as PermissionRow[];
    const count = counts[0];
    const employment = count?.employee_id == null || count.employee_start_work_date == null ? null : {
      employeeId: Number(count.employee_id),
      employeeNo: Number(count.employee_no),
      nickname: count.employee_nickname ?? "",
      level: count.employee_level ?? "",
      startWorkDate: dateOnly(count.employee_start_work_date),
    };
    return {
      user,
      employment,
      counts: {
        inquiries: Number(count?.inquiry_count ?? 0),
        estimates: Number(count?.estimate_count ?? 0),
        activeProjects: Number(count?.active_project_count ?? 0),
        approvals: Number(count?.approval_count ?? 0),
      },
      customers: customers.map((row) => ({
        id: Number(row.id), code: row.code, name: row.name, nameTh: row.name_th, nameEn: row.name_en, nameJa: row.name_ja, industry: row.industry, contact: row.contact,
        contactTitleTh: row.contact_title_th, contactTitleEn: row.contact_title_en, contactTitleJa: row.contact_title_ja, contactNameTh: row.contact_name_th, contactNameEn: row.contact_name_en, contactNameJa: row.contact_name_ja,
        email: row.email, phone: row.phone, site: row.site, department: row.department, position: row.position, inquiries: Number(row.inquiry_count),
        openEstimates: Number(row.open_estimate_count), rowVersion: row.row_version.toString("base64"),
      })),
      suppliers: suppliers.map((row) => ({ id: Number(row.id), code: row.code, name: row.name, category: row.category })),
      team: team.map((row) => ({
        id: Number(row.id), name: row.name, email: row.email, role: row.role,
        department: row.department, level: row.level, employeeId: Number(row.employee_id),
        employeeNo: Number(row.employee_no), nickname: row.nickname,
        startWorkDate: dateOnly(row.start_work_date), canSignIn: Boolean(row.can_sign_in),
        rowVersion: row.row_version.toString("base64"),
      })),
      permissions: permissions.map((row) => row.code),
    };
  });
}
