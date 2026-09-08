import sql from "mssql";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db.js";
import { ApiError } from "../errors.js";
import {
  bodyObject,
  booleanQuery,
  clampedInteger,
  optionalText,
  positiveLong,
  requiredInteger,
  requiredText,
} from "../http.js";
import {
  hasRolePermission,
  rowVersion,
  SITE_VISIT_PERMISSIONS,
  siteVisitAudit,
} from "../site-visit-common.js";
import type { CurrentUserService } from "../users.js";

const clean = (value: unknown, max: number, label: string): string =>
  optionalText(value, max, label) ?? "";
const code = (value: unknown, label: string): string => {
  const result = requiredText(value, 40, label)
    .toUpperCase()
    .replaceAll(" ", "_");
  if (!/^[\p{L}\p{N}_-]+$/u.test(result))
    throw new ApiError(
      400,
      "validation_failed",
      `${label} may contain only letters, digits, underscore and hyphen.`,
    );
  return result;
};
const bool = (value: unknown, fallback = false): boolean =>
  value == null
    ? fallback
    : typeof value === "boolean"
      ? value
      : (() => {
          throw new ApiError(
            400,
            "validation_failed",
            "A boolean value is required.",
          );
        })();
const timestamp = (value: unknown, label: string): Date => {
  if (typeof value !== "string")
    throw new ApiError(400, "validation_failed", `${label} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()))
    throw new ApiError(400, "validation_failed", `${label} is invalid.`);
  return date;
};

export function registerVisitMasterRoutes(
  app: FastifyInstance,
  database: Database,
  users: CurrentUserService,
): void {
  app.get("/api/v1/visit-master/", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
    const visitTypes = (
      await database.query<Record<string, unknown>>(
        `SELECT t.id,t.code,t.name_en,t.name_th,t.name_ja,t.description,t.default_duration_minutes,t.default_engineer_count,t.requires_manager_approval,t.sort_order,t.is_active,(SELECT TOP(1)c.id FROM dbo.visit_checklist_templates c WHERE c.visit_type_id=t.id AND c.is_active=1) checklist_template_id,t.row_version FROM dbo.visit_types t ORDER BY t.sort_order,t.code;`,
      )
    ).recordset.map((r) => ({
      id: Number(r.id),
      code: r.code,
      nameEn: r.name_en,
      nameTh: r.name_th,
      nameJa: r.name_ja,
      description: r.description,
      defaultDurationMinutes: Number(r.default_duration_minutes),
      defaultEngineerCount: Number(r.default_engineer_count),
      requiresManagerApproval: Boolean(r.requires_manager_approval),
      sortOrder: Number(r.sort_order),
      isActive: Boolean(r.is_active),
      checklistTemplateId:
        r.checklist_template_id == null
          ? null
          : Number(r.checklist_template_id),
      rowVersion: rowVersion(r.row_version),
    }));
    const skills = (
      await database.query<Record<string, unknown>>(
        `SELECT k.id,k.code,k.name_en,k.name_th,k.name_ja,k.discipline,k.sort_order,k.is_active,(SELECT COUNT_BIG(*) FROM dbo.engineer_skills es WHERE es.skill_id=k.id) engineer_count,k.row_version FROM dbo.visit_skills k ORDER BY k.sort_order,k.code;`,
      )
    ).recordset.map((r) => ({
      id: Number(r.id),
      code: r.code,
      nameEn: r.name_en,
      nameTh: r.name_th,
      nameJa: r.name_ja,
      discipline: r.discipline,
      sortOrder: Number(r.sort_order),
      isActive: Boolean(r.is_active),
      engineerCount: Number(r.engineer_count),
      rowVersion: rowVersion(r.row_version),
    }));
    const itemRows = (
      await database.query<Record<string, unknown>>(
        `SELECT template_id,id,sort_order,section,prompt,response_type,unit,is_required,guidance,is_active FROM dbo.visit_checklist_items ORDER BY template_id,sort_order;`,
      )
    ).recordset;
    const items = new Map<number, unknown[]>();
    for (const r of itemRows) {
      const key = Number(r.template_id),
        list = items.get(key) ?? [];
      list.push({
        id: Number(r.id),
        sortOrder: Number(r.sort_order),
        section: r.section,
        prompt: r.prompt,
        responseType: r.response_type,
        unit: r.unit,
        isRequired: Boolean(r.is_required),
        guidance: r.guidance,
        isActive: Boolean(r.is_active),
      });
      items.set(key, list);
    }
    const checklistTemplates = (
      await database.query<Record<string, unknown>>(
        `SELECT c.id,c.code,c.name,c.visit_type_id,t.name_en visit_type_name,c.description,c.version,c.is_active,c.row_version FROM dbo.visit_checklist_templates c LEFT JOIN dbo.visit_types t ON t.id=c.visit_type_id ORDER BY c.code;`,
      )
    ).recordset.map((r) => ({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      visitTypeId: r.visit_type_id == null ? null : Number(r.visit_type_id),
      visitTypeName: r.visit_type_name,
      description: r.description,
      version: Number(r.version),
      isActive: Boolean(r.is_active),
      rowVersion: rowVersion(r.row_version),
      items: items.get(Number(r.id)) ?? [],
    }));
    const slaPolicies = (
      await database.query<Record<string, unknown>>(
        `SELECT p.id,p.code,p.name,p.visit_type_id,t.name_en visit_type_name,p.review_response_days,p.schedule_lead_days,p.report_due_days,p.report_warning_hours,p.is_default,p.is_active,p.row_version FROM dbo.visit_sla_policies p LEFT JOIN dbo.visit_types t ON t.id=p.visit_type_id ORDER BY p.is_default DESC,p.code;`,
      )
    ).recordset.map((r) => ({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      visitTypeId: r.visit_type_id == null ? null : Number(r.visit_type_id),
      visitTypeName: r.visit_type_name,
      reviewResponseDays: Number(r.review_response_days),
      scheduleLeadDays: Number(r.schedule_lead_days),
      reportDueDays: Number(r.report_due_days),
      reportWarningHours: Number(r.report_warning_hours),
      isDefault: Boolean(r.is_default),
      isActive: Boolean(r.is_active),
      rowVersion: rowVersion(r.row_version),
    }));
    const engineerSkills = (
      await database.query<Record<string, unknown>>(
        `SELECT es.id,es.user_id,u.name user_name,u.department,es.skill_id,k.code skill_code,k.name_en skill_name,es.proficiency,es.note,es.row_version FROM dbo.engineer_skills es INNER JOIN dbo.users u ON u.id=es.user_id INNER JOIN dbo.visit_skills k ON k.id=es.skill_id WHERE u.deleted_at IS NULL ORDER BY u.name,k.sort_order;`,
      )
    ).recordset.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      userName: r.user_name,
      department: r.department,
      skillId: Number(r.skill_id),
      skillCode: r.skill_code,
      skillName: r.skill_name,
      proficiency: r.proficiency,
      note: r.note,
      rowVersion: rowVersion(r.row_version),
    }));
    const availability = (
      await database.query<Record<string, unknown>>(
        `SELECT a.id,a.user_id,u.name user_name,a.kind,a.reason,a.starts_at,a.ends_at,a.row_version FROM dbo.engineer_availability a INNER JOIN dbo.users u ON u.id=a.user_id WHERE a.deleted_at IS NULL AND a.ends_at>=DATEADD(day,-30,SYSUTCDATETIME()) ORDER BY a.starts_at;`,
      )
    ).recordset.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      userName: r.user_name,
      kind: r.kind,
      reason: r.reason,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      rowVersion: rowVersion(r.row_version),
    }));
    return {
      visitTypes,
      skills,
      checklistTemplates,
      slaPolicies,
      engineerSkills,
      availability,
    };
  });

  app.post("/api/v1/visit-master/visit-types", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitAdmin);
    const actor = await users.required(request),
      b = bodyObject(request.body),
      key = code(b.code, "Visit type code"),
      name = requiredText(b.nameEn, 200, "English name"),
      duration = Math.min(
        10080,
        Math.max(
          15,
          typeof b.defaultDurationMinutes === "number" &&
            b.defaultDurationMinutes > 0
            ? Math.trunc(b.defaultDurationMinutes)
            : 240,
        ),
      ),
      engineers = Math.min(
        20,
        Math.max(
          1,
          typeof b.defaultEngineerCount === "number" &&
            b.defaultEngineerCount > 0
            ? Math.trunc(b.defaultEngineerCount)
            : 1,
        ),
      );
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("code", sql.NVarChar(40), key);
      q.input("name", sql.NVarChar(200), name);
      q.input("th", sql.NVarChar(200), clean(b.nameTh, 200, "Thai name"));
      q.input("ja", sql.NVarChar(200), clean(b.nameJa, 200, "Japanese name"));
      q.input(
        "description",
        sql.NVarChar(1000),
        clean(b.description, 1000, "Description"),
      );
      q.input("duration", sql.Int, duration);
      q.input("engineers", sql.TinyInt, engineers);
      q.input("manager", sql.Bit, bool(b.requiresManagerApproval));
      q.input(
        "sort",
        sql.Int,
        Math.min(100000, Math.max(0, Number(b.sortOrder) || 0)),
      );
      q.input("active", sql.Bit, bool(b.isActive, true));
      q.input("actor", sql.BigInt, actor.id);
      const id = Number(
        (
          await q.query<{ id: number | string }>(
            `DECLARE @id bigint=(SELECT id FROM dbo.visit_types WITH(UPDLOCK,HOLDLOCK) WHERE code=@code); IF @id IS NULL BEGIN INSERT INTO dbo.visit_types(code,name_en,name_th,name_ja,description,default_duration_minutes,default_engineer_count,requires_manager_approval,sort_order,is_active,created_by,updated_by) VALUES(@code,@name,@th,@ja,@description,@duration,@engineers,@manager,@sort,@active,@actor,@actor); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE dbo.visit_types SET name_en=@name,name_th=@th,name_ja=@ja,description=@description,default_duration_minutes=@duration,default_engineer_count=@engineers,requires_manager_approval=@manager,sort_order=@sort,is_active=@active,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; SELECT @id id;`,
          )
        ).recordset[0]!.id,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "VisitType",
        id,
        key,
        "Visit type saved",
        undefined,
        { key, name, duration, engineers },
      );
      return { id, code: key };
    });
  });

  app.post("/api/v1/visit-master/skills", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitAdmin);
    const actor = await users.required(request),
      b = bodyObject(request.body),
      key = code(b.code, "Skill code"),
      name = requiredText(b.nameEn, 200, "English name");
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("code", sql.NVarChar(40), key);
      q.input("name", sql.NVarChar(200), name);
      q.input("th", sql.NVarChar(200), clean(b.nameTh, 200, "Thai name"));
      q.input("ja", sql.NVarChar(200), clean(b.nameJa, 200, "Japanese name"));
      q.input(
        "discipline",
        sql.NVarChar(100),
        clean(b.discipline, 100, "Discipline") || "General",
      );
      q.input(
        "sort",
        sql.Int,
        Math.min(100000, Math.max(0, Number(b.sortOrder) || 0)),
      );
      q.input("active", sql.Bit, bool(b.isActive, true));
      q.input("actor", sql.BigInt, actor.id);
      const id = Number(
        (
          await q.query<{ id: number | string }>(
            `DECLARE @id bigint=(SELECT id FROM dbo.visit_skills WITH(UPDLOCK,HOLDLOCK) WHERE code=@code); IF @id IS NULL BEGIN INSERT INTO dbo.visit_skills(code,name_en,name_th,name_ja,discipline,sort_order,is_active,created_by,updated_by) VALUES(@code,@name,@th,@ja,@discipline,@sort,@active,@actor,@actor); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE dbo.visit_skills SET name_en=@name,name_th=@th,name_ja=@ja,discipline=@discipline,sort_order=@sort,is_active=@active,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; SELECT @id id;`,
          )
        ).recordset[0]!.id,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "VisitSkill",
        id,
        key,
        "Skill saved",
        undefined,
        { key, name },
      );
      return { id, code: key };
    });
  });

  app.post("/api/v1/visit-master/checklist-templates", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitAdmin);
    const actor = await users.required(request),
      b = bodyObject(request.body),
      key = code(b.code, "Template code"),
      name = requiredText(b.name, 300, "Template name"),
      rows = Array.isArray(b.items) ? b.items.map(bodyObject) : [];
    if (rows.length > 200)
      throw new ApiError(
        400,
        "validation_failed",
        "A template may hold at most two hundred items.",
      );
    const positions = new Set<number>();
    for (const item of rows) {
      const sort = requiredInteger(item.sortOrder, "Sort order", 0, 100000);
      if (positions.has(sort))
        throw new ApiError(
          400,
          "validation_failed",
          "Two checklist items share the same position.",
        );
      positions.add(sort);
      requiredText(item.prompt, 500, "Prompt");
      if (
        !["YesNo", "Text", "Number", "Measurement", "Photo", "Choice"].includes(
          String(item.responseType),
        )
      )
        throw new ApiError(
          400,
          "validation_failed",
          "Response type is invalid.",
        );
    }
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("code", sql.NVarChar(40), key);
      q.input("name", sql.NVarChar(300), name);
      q.input(
        "visit",
        sql.BigInt,
        b.visitTypeId == null
          ? null
          : requiredInteger(b.visitTypeId, "Visit type", 1),
      );
      q.input(
        "description",
        sql.NVarChar(1000),
        clean(b.description, 1000, "Description"),
      );
      q.input("active", sql.Bit, bool(b.isActive, true));
      q.input("actor", sql.BigInt, actor.id);
      const templateId = Number(
        (
          await q.query<{ id: number | string }>(
            `DECLARE @id bigint=(SELECT id FROM dbo.visit_checklist_templates WITH(UPDLOCK,HOLDLOCK) WHERE code=@code); IF @id IS NULL BEGIN INSERT INTO dbo.visit_checklist_templates(code,name,visit_type_id,description,is_active,created_by,updated_by) VALUES(@code,@name,@visit,@description,@active,@actor,@actor); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE dbo.visit_checklist_templates SET name=@name,visit_type_id=@visit,description=@description,is_active=@active,version=version+1,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; SELECT @id id;`,
          )
        ).recordset[0]!.id,
      );
      const clear = new sql.Request(t);
      clear.input("id", sql.BigInt, templateId);
      await clear.query(
        `UPDATE dbo.visit_checklist_items SET is_active=0 WHERE template_id=@id; DELETE FROM dbo.visit_checklist_items WHERE template_id=@id AND NOT EXISTS(SELECT 1 FROM dbo.site_visit_checklist_responses r WHERE r.checklist_item_id=dbo.visit_checklist_items.id);`,
      );
      for (const item of rows) {
        const x = new sql.Request(t);
        x.input("template", sql.BigInt, templateId);
        x.input("sort", sql.Int, Number(item.sortOrder));
        x.input(
          "section",
          sql.NVarChar(200),
          clean(item.section, 200, "Section") || "General",
        );
        x.input("prompt", sql.NVarChar(500), String(item.prompt).trim());
        x.input("type", sql.NVarChar(20), String(item.responseType));
        x.input("unit", sql.NVarChar(40), clean(item.unit, 40, "Unit"));
        x.input("required", sql.Bit, bool(item.isRequired));
        x.input(
          "guidance",
          sql.NVarChar(1000),
          clean(item.guidance, 1000, "Guidance"),
        );
        await x.query(
          `IF EXISTS(SELECT 1 FROM dbo.visit_checklist_items WHERE template_id=@template AND sort_order=@sort) UPDATE dbo.visit_checklist_items SET section=@section,prompt=@prompt,response_type=@type,unit=@unit,is_required=@required,guidance=@guidance,is_active=1 WHERE template_id=@template AND sort_order=@sort; ELSE INSERT INTO dbo.visit_checklist_items(template_id,sort_order,section,prompt,response_type,unit,is_required,guidance,is_active) VALUES(@template,@sort,@section,@prompt,@type,@unit,@required,@guidance,1);`,
        );
      }
      await siteVisitAudit(
        t,
        actor.id,
        "VisitChecklistTemplate",
        templateId,
        key,
        "Checklist template saved",
        undefined,
        { key, name, items: rows.length },
      );
      return { id: templateId, code: key, items: rows.length };
    });
  });

  app.post("/api/v1/visit-master/sla-policies", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitAdmin);
    const actor = await users.required(request),
      b = bodyObject(request.body),
      key = code(b.code, "SLA code"),
      name = requiredText(b.name, 200, "SLA name"),
      review = Math.min(90, Math.max(0, Number(b.reviewResponseDays) || 0)),
      lead = Math.min(365, Math.max(0, Number(b.scheduleLeadDays) || 0)),
      due = Math.min(90, Math.max(1, Number(b.reportDueDays) || 3)),
      warning = Math.min(720, Math.max(1, Number(b.reportWarningHours) || 24)),
      active = bool(b.isActive, true),
      isDefault = bool(b.isDefault);
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("code", sql.NVarChar(40), key);
      q.input("name", sql.NVarChar(200), name);
      q.input(
        "visit",
        sql.BigInt,
        b.visitTypeId == null
          ? null
          : requiredInteger(b.visitTypeId, "Visit type", 1),
      );
      q.input("review", sql.Int, review);
      q.input("lead", sql.Int, lead);
      q.input("due", sql.Int, due);
      q.input("warning", sql.Int, warning);
      q.input("default", sql.Bit, isDefault);
      q.input("active", sql.Bit, active);
      q.input("actor", sql.BigInt, actor.id);
      const id = Number(
        (
          await q.query<{ id: number | string }>(
            `IF @default=1 AND @active=1 UPDATE dbo.visit_sla_policies SET is_default=0,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE is_default=1 AND code<>@code; DECLARE @id bigint=(SELECT id FROM dbo.visit_sla_policies WITH(UPDLOCK,HOLDLOCK) WHERE code=@code); IF @id IS NULL BEGIN INSERT INTO dbo.visit_sla_policies(code,name,visit_type_id,review_response_days,schedule_lead_days,report_due_days,report_warning_hours,is_default,is_active,created_by,updated_by) VALUES(@code,@name,@visit,@review,@lead,@due,@warning,@default,@active,@actor,@actor); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE dbo.visit_sla_policies SET name=@name,visit_type_id=@visit,review_response_days=@review,schedule_lead_days=@lead,report_due_days=@due,report_warning_hours=@warning,is_default=@default,is_active=@active,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; SELECT @id id;`,
          )
        ).recordset[0]!.id,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "VisitSlaPolicy",
        id,
        key,
        "SLA policy saved",
        undefined,
        { key, review, lead, due, warning },
      );
      return { id, code: key };
    });
  });

  app.post("/api/v1/visit-master/engineer-skills", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitAdmin);
    const actor = await users.required(request),
      b = bodyObject(request.body),
      userId = requiredInteger(b.userId, "Engineer", 1),
      skillId = requiredInteger(b.skillId, "Skill", 1),
      proficiency = requiredText(b.proficiency, 20, "Proficiency");
    if (!["Learning", "Working", "Advanced", "Expert"].includes(proficiency))
      throw new ApiError(400, "validation_failed", "Proficiency is invalid.");
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("user", sql.BigInt, userId);
      q.input("skill", sql.BigInt, skillId);
      q.input("proficiency", sql.NVarChar(20), proficiency);
      q.input("note", sql.NVarChar(500), clean(b.note, 500, "Note"));
      q.input("actor", sql.BigInt, actor.id);
      const id = Number(
        (
          await q.query<{ id: number | string }>(
            `IF NOT EXISTS(SELECT 1 FROM dbo.users WHERE id=@user AND is_active=1 AND deleted_at IS NULL) THROW 51201,'The engineer must be active.',1; DECLARE @id bigint=(SELECT id FROM dbo.engineer_skills WITH(UPDLOCK,HOLDLOCK) WHERE user_id=@user AND skill_id=@skill); IF @id IS NULL BEGIN INSERT INTO dbo.engineer_skills(user_id,skill_id,proficiency,note,created_by,updated_by) VALUES(@user,@skill,@proficiency,@note,@actor,@actor); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE dbo.engineer_skills SET proficiency=@proficiency,note=@note,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; SELECT @id id;`,
          )
        ).recordset[0]!.id,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "EngineerSkill",
        id,
        "",
        "Engineer skill saved",
        undefined,
        { userId, skillId, proficiency },
      );
      return { id };
    });
  });
  app.delete("/api/v1/visit-master/engineer-skills/:id", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitAdmin);
    const actor = await users.required(request),
      id = positiveLong(
        (request.params as { id?: string }).id,
        "Engineer skill id",
      );
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("id", sql.BigInt, id);
      if (
        (await q.query(`DELETE FROM dbo.engineer_skills WHERE id=@id;`))
          .rowsAffected[0] !== 1
      )
        throw new ApiError(
          404,
          "engineer_skill_not_found",
          "Engineer skill not found.",
        );
      await siteVisitAudit(
        t,
        actor.id,
        "EngineerSkill",
        id,
        "",
        "Engineer skill removed",
        { id },
      );
      return { id };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.post("/api/v1/visit-master/availability", async (request) => {
    const actor = await users.required(request),
      b = bodyObject(request.body),
      userId = requiredInteger(b.userId, "Engineer", 1),
      kind = requiredText(b.kind, 40, "Kind"),
      starts = timestamp(b.startsAt, "Start"),
      ends = timestamp(b.endsAt, "End");
    if (
      ![
        "Leave",
        "Training",
        "Public Holiday",
        "Company Holiday",
        "Other Assignment",
        "Unavailable",
      ].includes(kind) ||
      ends <= starts ||
      ends.valueOf() - starts.valueOf() > 365 * 86_400_000
    )
      throw new ApiError(
        400,
        "validation_failed",
        "Availability period is invalid.",
      );
    if (
      userId !== actor.id &&
      !(await hasRolePermission(
        database,
        actor,
        SITE_VISIT_PERMISSIONS.visitAdmin,
      )) &&
      !(await hasRolePermission(
        database,
        actor,
        SITE_VISIT_PERMISSIONS.visitSchedule,
      ))
    )
      throw new ApiError(
        403,
        "permission_denied",
        "Recording unavailability for another engineer requires visit.admin or visit.schedule.",
      );
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("user", sql.BigInt, userId);
      q.input("kind", sql.NVarChar(40), kind);
      q.input("reason", sql.NVarChar(300), clean(b.reason, 300, "Reason"));
      q.input("start", sql.DateTimeOffset, starts);
      q.input("end", sql.DateTimeOffset, ends);
      q.input("actor", sql.BigInt, actor.id);
      const record = (
        await q.query<{ id: number | string }>(
          `INSERT INTO dbo.engineer_availability(user_id,kind,reason,starts_at,ends_at,created_by) OUTPUT inserted.id SELECT @user,@kind,@reason,@start,@end,@actor WHERE EXISTS(SELECT 1 FROM dbo.users WHERE id=@user AND is_active=1 AND deleted_at IS NULL);`,
        )
      ).recordset[0];
      if (!record)
        throw new ApiError(
          422,
          "invalid_reference",
          "The engineer must be active.",
        );
      const id = Number(record.id);
      const conflicts = new sql.Request(t);
      conflicts.input("user", sql.BigInt, userId);
      conflicts.input("start", sql.DateTimeOffset, starts);
      conflicts.input("end", sql.DateTimeOffset, ends);
      const names = (
        await conflicts.query<{ visit_no: string }>(
          `SELECT v.visit_no FROM dbo.site_visits v INNER JOIN dbo.site_visit_assignments a ON a.visit_id=v.id AND a.is_active=1 WHERE a.engineer_id=@user AND v.deleted_at IS NULL AND v.status NOT IN(N'Cancelled',N'Closed',N'Completed') AND v.scheduled_start<@end AND v.scheduled_end>@start;`,
        )
      ).recordset.map((r) => r.visit_no);
      await siteVisitAudit(
        t,
        actor.id,
        "EngineerAvailability",
        id,
        kind,
        "Unavailability recorded",
        undefined,
        { userId, kind, starts, ends, conflictingVisits: names },
        clean(b.reason, 300, "Reason"),
      );
      return { id, conflictingVisits: names };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });
  app.delete("/api/v1/visit-master/availability/:id", async (request) => {
    const actor = await users.required(request),
      id = positiveLong(
        (request.params as { id?: string }).id,
        "Availability id",
      ),
      admin = await hasRolePermission(
        database,
        actor,
        SITE_VISIT_PERMISSIONS.visitAdmin,
      ),
      schedule = await hasRolePermission(
        database,
        actor,
        SITE_VISIT_PERMISSIONS.visitSchedule,
      );
    return database.transaction(async (t) => {
      const lookup = new sql.Request(t);
      lookup.input("id", sql.BigInt, id);
      const value = (
        await lookup.query<{ user_id: number | string }>(
          `SELECT user_id FROM dbo.engineer_availability WHERE id=@id AND deleted_at IS NULL;`,
        )
      ).recordset[0];
      if (!value)
        throw new ApiError(
          404,
          "availability_not_found",
          "Availability not found.",
        );
      const owner = Number(value.user_id);
      if (owner !== actor.id && !admin && !schedule)
        throw new ApiError(
          403,
          "permission_denied",
          "Removing another engineer's unavailability requires visit.admin or visit.schedule.",
        );
      const update = new sql.Request(t);
      update.input("id", sql.BigInt, id);
      await update.query(
        `UPDATE dbo.engineer_availability SET deleted_at=SYSUTCDATETIME() WHERE id=@id AND deleted_at IS NULL;`,
      );
      await siteVisitAudit(
        t,
        actor.id,
        "EngineerAvailability",
        id,
        "",
        "Unavailability removed",
        { id, owner },
      );
      return { id };
    }, sql.ISOLATION_LEVEL.READ_COMMITTED);
  });

  app.get(
    "/api/v1/visit-master/customers/:customerId/sites",
    async (request) => {
      await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeRead);
      const customerId = positiveLong(
        (request.params as { customerId?: string }).customerId,
        "Customer id",
      );
      const contacts = (
        await database.query<Record<string, unknown>>(
          `SELECT sc.id,sc.site_id,sc.name,sc.department,sc.position,sc.phone,sc.email,sc.preferred_channel,sc.is_primary,sc.is_active,sc.row_version FROM dbo.customer_site_contacts sc INNER JOIN dbo.customer_sites s ON s.id=sc.site_id WHERE s.customer_id=@customer AND sc.deleted_at IS NULL ORDER BY sc.is_primary DESC,sc.name;`,
          (q) => q.input("customer", sql.BigInt, customerId),
        )
      ).recordset;
      const bySite = new Map<number, unknown[]>();
      for (const r of contacts) {
        const key = Number(r.site_id),
          list = bySite.get(key) ?? [];
        list.push({
          id: Number(r.id),
          siteId: key,
          name: r.name,
          department: r.department,
          position: r.position,
          phone: r.phone,
          email: r.email,
          preferredChannel: r.preferred_channel,
          isPrimary: Boolean(r.is_primary),
          isActive: Boolean(r.is_active),
          rowVersion: rowVersion(r.row_version),
        });
        bySite.set(key, list);
      }
      const sites = await database.query<Record<string, unknown>>(
        `SELECT s.id,s.customer_id,c.name customer_name,s.code,s.name,s.branch,s.address,s.province,s.country,s.latitude,s.longitude,s.travel_minutes,ISNULL(s.access_note,N'') access_note,s.is_active,s.row_version FROM dbo.customer_sites s INNER JOIN dbo.customers c ON c.id=s.customer_id WHERE s.customer_id=@customer AND s.deleted_at IS NULL ORDER BY s.name;`,
        (q) => q.input("customer", sql.BigInt, customerId),
      );
      return sites.recordset.map((r) => ({
        id: Number(r.id),
        customerId: Number(r.customer_id),
        customerName: r.customer_name,
        code: r.code,
        name: r.name,
        branch: r.branch,
        address: r.address,
        province: r.province,
        country: r.country,
        latitude: r.latitude == null ? null : Number(r.latitude),
        longitude: r.longitude == null ? null : Number(r.longitude),
        travelMinutes: Number(r.travel_minutes),
        accessNote: r.access_note,
        isActive: Boolean(r.is_active),
        rowVersion: rowVersion(r.row_version),
        contacts: bySite.get(Number(r.id)) ?? [],
      }));
    },
  );

  app.post(
    "/api/v1/visit-master/customers/:customerId/sites",
    async (request) => {
      await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeWrite);
      const actor = await users.required(request),
        customerId = positiveLong(
          (request.params as { customerId?: string }).customerId,
          "Customer id",
        ),
        b = bodyObject(request.body),
        key = code(b.code, "Site code"),
        name = requiredText(b.name, 300, "Site name"),
        lat = b.latitude == null ? null : Number(b.latitude),
        lon = b.longitude == null ? null : Number(b.longitude);
      if (
        (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
        (lon != null && (!Number.isFinite(lon) || lon < -180 || lon > 180))
      )
        throw new ApiError(
          400,
          "validation_failed",
          "The location is out of range.",
        );
      return database.transaction(async (t) => {
        const q = new sql.Request(t);
        q.input("customer", sql.BigInt, customerId);
        q.input("code", sql.NVarChar(40), key);
        q.input("name", sql.NVarChar(300), name);
        q.input("branch", sql.NVarChar(200), clean(b.branch, 200, "Branch"));
        q.input(
          "address",
          sql.NVarChar(1000),
          clean(b.address, 1000, "Address"),
        );
        q.input(
          "province",
          sql.NVarChar(120),
          clean(b.province, 120, "Province"),
        );
        q.input(
          "country",
          sql.NVarChar(120),
          clean(b.country, 120, "Country") || "Thailand",
        );
        q.input("lat", sql.Decimal(9, 6), lat);
        q.input("lon", sql.Decimal(9, 6), lon);
        q.input(
          "travel",
          sql.Int,
          Math.min(2880, Math.max(0, Number(b.travelMinutes) || 60)),
        );
        q.input(
          "note",
          sql.NVarChar(sql.MAX),
          clean(b.accessNote, 20000, "Access note") || null,
        );
        q.input("active", sql.Bit, bool(b.isActive, true));
        q.input("actor", sql.BigInt, actor.id);
        const id = Number(
          (
            await q.query<{ id: number | string }>(
              `IF NOT EXISTS(SELECT 1 FROM dbo.customers WHERE id=@customer AND is_active=1 AND deleted_at IS NULL) THROW 51202,'The customer must be active.',1; DECLARE @id bigint=(SELECT id FROM dbo.customer_sites WITH(UPDLOCK,HOLDLOCK) WHERE customer_id=@customer AND code=@code); IF @id IS NULL BEGIN INSERT INTO dbo.customer_sites(customer_id,code,name,branch,address,province,country,latitude,longitude,travel_minutes,access_note,is_active,created_by,updated_by) VALUES(@customer,@code,@name,@branch,@address,@province,@country,@lat,@lon,@travel,@note,@active,@actor,@actor); SET @id=SCOPE_IDENTITY(); END ELSE UPDATE dbo.customer_sites SET name=@name,branch=@branch,address=@address,province=@province,country=@country,latitude=@lat,longitude=@lon,travel_minutes=@travel,access_note=@note,is_active=@active,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; SELECT @id id;`,
            )
          ).recordset[0]!.id,
        );
        await siteVisitAudit(
          t,
          actor.id,
          "CustomerSite",
          id,
          key,
          "Customer site saved",
          undefined,
          { customerId, key, name },
        );
        return { id, code: key };
      });
    },
  );

  app.post("/api/v1/visit-master/sites/:siteId/contacts", async (request) => {
    await users.demandPermission(request, SITE_VISIT_PERMISSIONS.intakeWrite);
    const actor = await users.required(request),
      siteId = positiveLong(
        (request.params as { siteId?: string }).siteId,
        "Site id",
      ),
      b = bodyObject(request.body),
      name = requiredText(b.name, 200, "Contact name"),
      channel = clean(b.preferredChannel, 30, "Preferred channel") || "Email";
    if (
      ![
        "Email",
        "Phone",
        "LINE",
        "Meeting",
        "Customer Portal",
        "Other",
      ].includes(channel)
    )
      throw new ApiError(
        400,
        "validation_failed",
        "Preferred channel is invalid.",
      );
    return database.transaction(async (t) => {
      const q = new sql.Request(t);
      q.input("site", sql.BigInt, siteId);
      q.input("name", sql.NVarChar(200), name);
      q.input(
        "department",
        sql.NVarChar(200),
        clean(b.department, 200, "Department"),
      );
      q.input(
        "position",
        sql.NVarChar(200),
        clean(b.position, 200, "Position"),
      );
      q.input("phone", sql.NVarChar(100), clean(b.phone, 100, "Phone"));
      q.input("email", sql.NVarChar(256), clean(b.email, 256, "Email"));
      q.input("channel", sql.NVarChar(30), channel);
      q.input("primary", sql.Bit, bool(b.isPrimary));
      q.input("active", sql.Bit, bool(b.isActive, true));
      q.input("actor", sql.BigInt, actor.id);
      const record = (
        await q.query<{ id: number | string }>(
          `IF NOT EXISTS(SELECT 1 FROM dbo.customer_sites WHERE id=@site AND deleted_at IS NULL) THROW 51203,'The customer site does not exist.',1; IF @primary=1 UPDATE dbo.customer_site_contacts SET is_primary=0,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE site_id=@site AND is_primary=1; INSERT INTO dbo.customer_site_contacts(site_id,name,department,position,phone,email,preferred_channel,is_primary,is_active,created_by,updated_by) OUTPUT inserted.id VALUES(@site,@name,@department,@position,@phone,@email,@channel,@primary,@active,@actor,@actor);`,
        )
      ).recordset[0]!;
      const id = Number(record.id);
      await siteVisitAudit(
        t,
        actor.id,
        "CustomerSiteContact",
        id,
        "",
        "Site contact saved",
        undefined,
        { siteId, name },
      );
      return { id, siteId };
    });
  });

  app.get("/api/v1/me/notifications/", async (request) => {
    const actor = await users.required(request),
      query = request.query as Record<string, unknown>,
      unread = booleanQuery(query.unreadOnly, false),
      take = clampedInteger(query.limit, 50, 1, 200);
    const result = await database.query<Record<string, unknown>>(
      `SELECT TOP(@take) id,kind,title,detail,entity_type,entity_id,is_read,created_at,read_at FROM dbo.notifications WHERE user_id=@actor AND (@unread=0 OR is_read=0) ORDER BY created_at DESC,id DESC;`,
      (q) => {
        q.input("take", sql.Int, take);
        q.input("actor", sql.BigInt, actor.id);
        q.input("unread", sql.Bit, unread);
      },
    );
    return result.recordset.map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      title: r.title,
      detail: r.detail,
      entityType: r.entity_type,
      entityId: r.entity_id == null ? null : Number(r.entity_id),
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
      readAt: r.read_at,
    }));
  });
  app.post("/api/v1/me/notifications/read", async (request) => {
    const actor = await users.required(request),
      b = bodyObject(request.body),
      all = bool(b.all),
      ids = Array.isArray(b.ids)
        ? [
            ...new Set(
              b.ids
                .filter((v) => Number.isSafeInteger(v) && Number(v) > 0)
                .map(Number),
            ),
          ].slice(0, 500)
        : [];
    if (!all && !ids.length) return { updated: 0 };
    const result = await database.query(
      `UPDATE dbo.notifications SET is_read=1,read_at=SYSUTCDATETIME() WHERE user_id=@actor AND is_read=0 AND (@all=1 OR id IN(SELECT TRY_CONVERT(bigint,value) FROM STRING_SPLIT(@ids,N',')));`,
      (q) => {
        q.input("actor", sql.BigInt, actor.id);
        q.input("all", sql.Bit, all);
        q.input("ids", sql.NVarChar(sql.MAX), ids.join(","));
      },
    );
    return { updated: result.rowsAffected[0] ?? 0 };
  });
}
