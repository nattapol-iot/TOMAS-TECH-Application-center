using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Administrable master data behind the site visit module — visit purposes,
/// engineering skills, checklist templates, SLA policies, engineer skill
/// profiles and unavailability — plus the in-app notification feed.
///
/// Reading is open to anyone who may read a visit, because a screen cannot
/// render a visit purpose it is not allowed to look up. Writing needs
/// visit.admin, with the two exceptions noted at their endpoints.
/// </summary>
public static class SiteVisitMasterEndpoints
{
    public static void MapSiteVisitMasterEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/visit-master").RequireAuthorization();
        group.MapGet("/", LoadAllAsync);
        group.MapPost("/visit-types", SaveVisitTypeAsync);
        group.MapPost("/skills", SaveSkillAsync);
        group.MapPost("/checklist-templates", SaveChecklistTemplateAsync);
        group.MapPost("/sla-policies", SaveSlaPolicyAsync);
        group.MapPost("/engineer-skills", SaveEngineerSkillAsync);
        group.MapDelete("/engineer-skills/{id:long}", DeleteEngineerSkillAsync);
        group.MapPost("/availability", SaveAvailabilityAsync);
        group.MapDelete("/availability/{id:long}", DeleteAvailabilityAsync);
        group.MapGet("/customers/{customerId:long}/sites", ListSitesAsync);
        group.MapPost("/customers/{customerId:long}/sites", SaveSiteAsync);
        group.MapPost("/sites/{siteId:long}/contacts", SaveSiteContactAsync);

        var me = app.MapGroup("/api/v1/me/notifications").RequireAuthorization();
        me.MapGet("/", ListNotificationsAsync);
        me.MapPost("/read", MarkReadAsync);
    }

    /* ===================================================================
       One read for the whole master set. The admin screen and every form
       that offers a purpose or a skill need the same rows, so they are
       fetched together rather than in six round trips.
       =================================================================== */

    private static async Task<IResult> LoadAllAsync(
        SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitRead, cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        var visitTypes = new List<VisitTypeRecord>();
        await using (var command = new SqlCommand("""
            SELECT t.id, t.code, t.name_en, t.name_th, t.name_ja, t.description,
                   t.default_duration_minutes, t.default_engineer_count, t.requires_manager_approval,
                   t.sort_order, t.is_active,
                   (SELECT TOP (1) c.id FROM dbo.visit_checklist_templates c
                     WHERE c.visit_type_id = t.id AND c.is_active = 1),
                   t.row_version
            FROM dbo.visit_types t ORDER BY t.sort_order, t.code;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                visitTypes.Add(new VisitTypeRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetInt32(6),
                    reader.GetByte(7), reader.GetBoolean(8), reader.GetInt32(9), reader.GetBoolean(10),
                    reader.IsDBNull(11) ? null : reader.GetInt64(11), reader.RowVersionString(12)));
        }

        var skills = new List<VisitSkillRecord>();
        await using (var command = new SqlCommand("""
            SELECT k.id, k.code, k.name_en, k.name_th, k.name_ja, k.discipline, k.sort_order, k.is_active,
                   (SELECT COUNT_BIG(*) FROM dbo.engineer_skills es WHERE es.skill_id = k.id), k.row_version
            FROM dbo.visit_skills k ORDER BY k.sort_order, k.code;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                skills.Add(new VisitSkillRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetString(5), reader.GetInt32(6),
                    reader.GetBoolean(7), (int)reader.GetInt64(8), reader.RowVersionString(9)));
        }

        var itemsByTemplate = new Dictionary<long, List<ChecklistItemRecord>>();
        await using (var command = new SqlCommand("""
            SELECT template_id, id, sort_order, section, prompt, response_type, unit, is_required, guidance, is_active
            FROM dbo.visit_checklist_items ORDER BY template_id, sort_order;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var templateId = reader.GetInt64(0);
                if (!itemsByTemplate.TryGetValue(templateId, out var list))
                    itemsByTemplate[templateId] = list = [];
                list.Add(new ChecklistItemRecord(reader.GetInt64(1), reader.GetInt32(2), reader.GetString(3),
                    reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetBoolean(7),
                    reader.GetString(8), reader.GetBoolean(9)));
            }
        }

        var templates = new List<ChecklistTemplateRecord>();
        await using (var command = new SqlCommand("""
            SELECT c.id, c.code, c.name, c.visit_type_id, t.name_en, c.description, c.version, c.is_active, c.row_version
            FROM dbo.visit_checklist_templates c
            LEFT JOIN dbo.visit_types t ON t.id = c.visit_type_id
            ORDER BY c.code;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var templateId = reader.GetInt64(0);
                templates.Add(new ChecklistTemplateRecord(templateId, reader.GetString(1), reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetInt64(3), reader.IsDBNull(4) ? null : reader.GetString(4),
                    reader.GetString(5), reader.GetInt32(6), reader.GetBoolean(7), reader.RowVersionString(8),
                    itemsByTemplate.TryGetValue(templateId, out var items) ? items : []));
            }
        }

        var slaPolicies = new List<SlaPolicyRecord>();
        await using (var command = new SqlCommand("""
            SELECT p.id, p.code, p.name, p.visit_type_id, t.name_en, p.review_response_days, p.schedule_lead_days,
                   p.report_due_days, p.report_warning_hours, p.is_default, p.is_active, p.row_version
            FROM dbo.visit_sla_policies p
            LEFT JOIN dbo.visit_types t ON t.id = p.visit_type_id
            ORDER BY p.is_default DESC, p.code;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                slaPolicies.Add(new SlaPolicyRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.IsDBNull(3) ? null : reader.GetInt64(3), reader.IsDBNull(4) ? null : reader.GetString(4),
                    reader.GetInt32(5), reader.GetInt32(6), reader.GetInt32(7), reader.GetInt32(8),
                    reader.GetBoolean(9), reader.GetBoolean(10), reader.RowVersionString(11)));
        }

        var engineerSkills = new List<EngineerSkillRecord>();
        await using (var command = new SqlCommand("""
            SELECT es.id, es.user_id, u.name, u.department, es.skill_id, k.code, k.name_en,
                   es.proficiency, es.note, es.row_version
            FROM dbo.engineer_skills es
            INNER JOIN dbo.users u ON u.id = es.user_id
            INNER JOIN dbo.visit_skills k ON k.id = es.skill_id
            WHERE u.deleted_at IS NULL
            ORDER BY u.name, k.sort_order;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                engineerSkills.Add(new EngineerSkillRecord(reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2),
                    reader.GetString(3), reader.GetInt64(4), reader.GetString(5), reader.GetString(6),
                    reader.GetString(7), reader.GetString(8), reader.RowVersionString(9)));
        }

        var availability = new List<EngineerAvailabilityRecord>();
        await using (var command = new SqlCommand("""
            SELECT a.id, a.user_id, u.name, a.kind, a.reason, a.starts_at, a.ends_at, a.row_version
            FROM dbo.engineer_availability a
            INNER JOIN dbo.users u ON u.id = a.user_id
            WHERE a.deleted_at IS NULL AND a.ends_at >= DATEADD(DAY, -30, SYSUTCDATETIME())
            ORDER BY a.starts_at;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                availability.Add(new EngineerAvailabilityRecord(reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), reader.GetFieldValue<DateTimeOffset>(5),
                    reader.GetFieldValue<DateTimeOffset>(6), reader.RowVersionString(7)));
        }

        return Results.Ok(new { visitTypes, skills, checklistTemplates = templates, slaPolicies, engineerSkills, availability });
    }

    /* ===================================================================
       Master data writes
       =================================================================== */

    private static async Task<IResult> SaveVisitTypeAsync(
        SaveVisitTypeRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitAdmin, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = NormalizeCode(request.Code, 40, "Visit type code");
        InputValidation.RequiredText(request.NameEn, 200, "English name");
        var duration = SiteVisitCore.Clamp(request.DefaultDurationMinutes <= 0 ? 240 : request.DefaultDurationMinutes, 15, 10_080);
        var engineers = SiteVisitCore.Clamp(request.DefaultEngineerCount <= 0 ? 1 : request.DefaultEngineerCount, 1, 20);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                DECLARE @existing bigint = (SELECT id FROM dbo.visit_types WITH (UPDLOCK, HOLDLOCK) WHERE code = @code);
                IF @existing IS NULL
                BEGIN
                    INSERT INTO dbo.visit_types (code, name_en, name_th, name_ja, description,
                        default_duration_minutes, default_engineer_count, requires_manager_approval,
                        sort_order, is_active, created_by, updated_by)
                    VALUES (@code, @name_en, @name_th, @name_ja, @description,
                        @duration, @engineers, @manager, @sort, @active, @actor, @actor);
                    SET @existing = SCOPE_IDENTITY();
                END
                ELSE
                    UPDATE dbo.visit_types SET name_en = @name_en, name_th = @name_th, name_ja = @name_ja,
                        description = @description, default_duration_minutes = @duration,
                        default_engineer_count = @engineers, requires_manager_approval = @manager,
                        sort_order = @sort, is_active = @active, updated_by = @actor, updated_at = SYSUTCDATETIME()
                    WHERE id = @existing;
                SELECT @existing;
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 40);
            command.Parameters.AddParameter("@name_en", SqlDbType.NVarChar, request.NameEn.Trim(), 200);
            command.Parameters.AddParameter("@name_th", SqlDbType.NVarChar, SiteVisitCore.Trim(request.NameTh, 200, "Thai name"), 200);
            command.Parameters.AddParameter("@name_ja", SqlDbType.NVarChar, SiteVisitCore.Trim(request.NameJa, 200, "Japanese name"), 200);
            command.Parameters.AddParameter("@description", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Description, 1_000, "Description"), 1_000);
            command.Parameters.AddParameter("@duration", SqlDbType.Int, duration);
            command.Parameters.AddParameter("@engineers", SqlDbType.TinyInt, (byte)engineers);
            command.Parameters.AddParameter("@manager", SqlDbType.Bit, request.RequiresManagerApproval);
            command.Parameters.AddParameter("@sort", SqlDbType.Int, SiteVisitCore.Clamp(request.SortOrder, 0, 100_000));
            command.Parameters.AddParameter("@active", SqlDbType.Bit, request.IsActive);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            var id = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "VisitType", id, code,
                "Visit type saved", null, new { code, request.NameEn, duration, engineers, request.IsActive }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, code });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveSkillAsync(
        SaveVisitSkillRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitAdmin, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = NormalizeCode(request.Code, 40, "Skill code");
        InputValidation.RequiredText(request.NameEn, 200, "English name");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                DECLARE @existing bigint = (SELECT id FROM dbo.visit_skills WITH (UPDLOCK, HOLDLOCK) WHERE code = @code);
                IF @existing IS NULL
                BEGIN
                    INSERT INTO dbo.visit_skills (code, name_en, name_th, name_ja, discipline, sort_order, is_active, created_by, updated_by)
                    VALUES (@code, @name_en, @name_th, @name_ja, @discipline, @sort, @active, @actor, @actor);
                    SET @existing = SCOPE_IDENTITY();
                END
                ELSE
                    UPDATE dbo.visit_skills SET name_en = @name_en, name_th = @name_th, name_ja = @name_ja,
                        discipline = @discipline, sort_order = @sort, is_active = @active,
                        updated_by = @actor, updated_at = SYSUTCDATETIME()
                    WHERE id = @existing;
                SELECT @existing;
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 40);
            command.Parameters.AddParameter("@name_en", SqlDbType.NVarChar, request.NameEn.Trim(), 200);
            command.Parameters.AddParameter("@name_th", SqlDbType.NVarChar, SiteVisitCore.Trim(request.NameTh, 200, "Thai name"), 200);
            command.Parameters.AddParameter("@name_ja", SqlDbType.NVarChar, SiteVisitCore.Trim(request.NameJa, 200, "Japanese name"), 200);
            command.Parameters.AddParameter("@discipline", SqlDbType.NVarChar,
                string.IsNullOrWhiteSpace(request.Discipline) ? "General" : SiteVisitCore.Trim(request.Discipline, 100, "Discipline"), 100);
            command.Parameters.AddParameter("@sort", SqlDbType.Int, SiteVisitCore.Clamp(request.SortOrder, 0, 100_000));
            command.Parameters.AddParameter("@active", SqlDbType.Bit, request.IsActive);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            var id = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "VisitSkill", id, code,
                "Skill saved", null, new { code, request.NameEn, request.IsActive }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, code });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveChecklistTemplateAsync(
        SaveChecklistTemplateRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitAdmin, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = NormalizeCode(request.Code, 40, "Template code");
        InputValidation.RequiredText(request.Name, 300, "Template name");
        if (request.Items.Count > 200) throw Invalid("A template may hold at most two hundred items.");
        var seen = new HashSet<int>();
        foreach (var item in request.Items)
        {
            InputValidation.RequiredText(item.Prompt, 500, "Prompt");
            InputValidation.OneOf(item.ResponseType, "Response type", "YesNo", "Text", "Number", "Measurement", "Photo", "Choice");
            InputValidation.OptionalText(item.Unit, 40, "Unit");
            InputValidation.OptionalText(item.Guidance, 1_000, "Guidance");
            if (!seen.Add(item.SortOrder)) throw Invalid("Two checklist items share the same position.");
        }

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long templateId;
            await using (var command = new SqlCommand("""
                DECLARE @existing bigint = (SELECT id FROM dbo.visit_checklist_templates WITH (UPDLOCK, HOLDLOCK) WHERE code = @code);
                IF @existing IS NULL
                BEGIN
                    INSERT INTO dbo.visit_checklist_templates (code, name, visit_type_id, description, is_active, created_by, updated_by)
                    VALUES (@code, @name, @visit_type_id, @description, @active, @actor, @actor);
                    SET @existing = SCOPE_IDENTITY();
                END
                ELSE
                    UPDATE dbo.visit_checklist_templates
                       SET name = @name, visit_type_id = @visit_type_id, description = @description,
                           is_active = @active, version = version + 1, updated_by = @actor, updated_at = SYSUTCDATETIME()
                     WHERE id = @existing;
                SELECT @existing;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 40);
                command.Parameters.AddParameter("@name", SqlDbType.NVarChar, request.Name.Trim(), 300);
                command.Parameters.AddParameter("@visit_type_id", SqlDbType.BigInt, request.VisitTypeId is > 0 ? request.VisitTypeId : null);
                command.Parameters.AddParameter("@description", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Description, 1_000, "Description"), 1_000);
                command.Parameters.AddParameter("@active", SqlDbType.Bit, request.IsActive);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                templateId = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
            }

            // Items already answered on a visit are deactivated rather than
            // deleted: dbo.site_visit_checklist_responses points at them, and a
            // finished visit must keep showing the question it answered.
            await using (var command = new SqlCommand("""
                UPDATE dbo.visit_checklist_items SET is_active = 0 WHERE template_id = @template_id;
                DELETE FROM dbo.visit_checklist_items
                 WHERE template_id = @template_id
                   AND NOT EXISTS (SELECT 1 FROM dbo.site_visit_checklist_responses r
                                    WHERE r.checklist_item_id = dbo.visit_checklist_items.id);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@template_id", SqlDbType.BigInt, templateId);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            foreach (var item in request.Items)
            {
                await using var command = new SqlCommand("""
                    IF EXISTS (SELECT 1 FROM dbo.visit_checklist_items WHERE template_id = @template_id AND sort_order = @sort)
                        UPDATE dbo.visit_checklist_items
                           SET section = @section, prompt = @prompt, response_type = @type, unit = @unit,
                               is_required = @required, guidance = @guidance, is_active = 1
                         WHERE template_id = @template_id AND sort_order = @sort;
                    ELSE
                        INSERT INTO dbo.visit_checklist_items
                            (template_id, sort_order, section, prompt, response_type, unit, is_required, guidance, is_active)
                        VALUES (@template_id, @sort, @section, @prompt, @type, @unit, @required, @guidance, 1);
                    """, connection, transaction);
                command.Parameters.AddParameter("@template_id", SqlDbType.BigInt, templateId);
                command.Parameters.AddParameter("@sort", SqlDbType.Int, SiteVisitCore.Clamp(item.SortOrder, 0, 100_000));
                command.Parameters.AddParameter("@section", SqlDbType.NVarChar,
                    string.IsNullOrWhiteSpace(item.Section) ? "General" : SiteVisitCore.Trim(item.Section, 200, "Section"), 200);
                command.Parameters.AddParameter("@prompt", SqlDbType.NVarChar, item.Prompt.Trim(), 500);
                command.Parameters.AddParameter("@type", SqlDbType.NVarChar, item.ResponseType.Trim(), 20);
                command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, SiteVisitCore.Trim(item.Unit, 40, "Unit"), 40);
                command.Parameters.AddParameter("@required", SqlDbType.Bit, item.IsRequired);
                command.Parameters.AddParameter("@guidance", SqlDbType.NVarChar, SiteVisitCore.Trim(item.Guidance, 1_000, "Guidance"), 1_000);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "VisitChecklistTemplate", templateId, code,
                "Checklist template saved", null, new { code, request.Name, items = request.Items.Count, request.IsActive }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = templateId, code, items = request.Items.Count });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveSlaPolicyAsync(
        SaveSlaPolicyRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitAdmin, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = NormalizeCode(request.Code, 40, "SLA code");
        InputValidation.RequiredText(request.Name, 200, "SLA name");
        var review = SiteVisitCore.Clamp(request.ReviewResponseDays, 0, 90);
        var lead = SiteVisitCore.Clamp(request.ScheduleLeadDays, 0, 365);
        var due = SiteVisitCore.Clamp(request.ReportDueDays <= 0 ? SiteVisitCore.DefaultReportSlaDays : request.ReportDueDays, 1, 90);
        var warning = SiteVisitCore.Clamp(request.ReportWarningHours <= 0 ? SiteVisitCore.ReportSlaWarningHours : request.ReportWarningHours, 1, 720);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            // Exactly one default is a filtered unique index, so the previous
            // default has to stand down inside the same transaction.
            if (request.IsDefault && request.IsActive)
            {
                await using var clear = new SqlCommand(
                    "UPDATE dbo.visit_sla_policies SET is_default = 0, updated_by = @actor, updated_at = SYSUTCDATETIME() WHERE is_default = 1 AND code <> @code;",
                    connection, transaction);
                clear.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                clear.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 40);
                await clear.ExecuteNonQueryAsync(cancellationToken);
            }

            await using var command = new SqlCommand("""
                DECLARE @existing bigint = (SELECT id FROM dbo.visit_sla_policies WITH (UPDLOCK, HOLDLOCK) WHERE code = @code);
                IF @existing IS NULL
                BEGIN
                    INSERT INTO dbo.visit_sla_policies (code, name, visit_type_id, review_response_days, schedule_lead_days,
                        report_due_days, report_warning_hours, is_default, is_active, created_by, updated_by)
                    VALUES (@code, @name, @visit_type_id, @review, @lead, @due, @warning, @is_default, @active, @actor, @actor);
                    SET @existing = SCOPE_IDENTITY();
                END
                ELSE
                    UPDATE dbo.visit_sla_policies
                       SET name = @name, visit_type_id = @visit_type_id, review_response_days = @review,
                           schedule_lead_days = @lead, report_due_days = @due, report_warning_hours = @warning,
                           is_default = @is_default, is_active = @active, updated_by = @actor, updated_at = SYSUTCDATETIME()
                     WHERE id = @existing;
                SELECT @existing;
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 40);
            command.Parameters.AddParameter("@name", SqlDbType.NVarChar, request.Name.Trim(), 200);
            command.Parameters.AddParameter("@visit_type_id", SqlDbType.BigInt, request.VisitTypeId is > 0 ? request.VisitTypeId : null);
            command.Parameters.AddParameter("@review", SqlDbType.Int, review);
            command.Parameters.AddParameter("@lead", SqlDbType.Int, lead);
            command.Parameters.AddParameter("@due", SqlDbType.Int, due);
            command.Parameters.AddParameter("@warning", SqlDbType.Int, warning);
            command.Parameters.AddParameter("@is_default", SqlDbType.Bit, request.IsDefault);
            command.Parameters.AddParameter("@active", SqlDbType.Bit, request.IsActive);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            var id = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "VisitSlaPolicy", id, code,
                "SLA policy saved", null, new { code, review, lead, due, warning, request.IsDefault, request.IsActive }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, code });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveEngineerSkillAsync(
        SaveEngineerSkillRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitAdmin, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.UserId <= 0 || request.SkillId <= 0) throw Invalid("An engineer and a skill are required.");
        InputValidation.OneOf(request.Proficiency, "Proficiency", "Learning", "Working", "Advanced", "Expert");
        InputValidation.OptionalText(request.Note, 500, "Note");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                IF NOT EXISTS (SELECT 1 FROM dbo.users WHERE id = @user_id AND is_active = 1 AND deleted_at IS NULL)
                    THROW 51201, 'The engineer must be an active user.', 1;
                DECLARE @existing bigint = (
                    SELECT id FROM dbo.engineer_skills WITH (UPDLOCK, HOLDLOCK)
                    WHERE user_id = @user_id AND skill_id = @skill_id);
                IF @existing IS NULL
                BEGIN
                    INSERT INTO dbo.engineer_skills (user_id, skill_id, proficiency, note, created_by, updated_by)
                    VALUES (@user_id, @skill_id, @proficiency, @note, @actor, @actor);
                    SET @existing = SCOPE_IDENTITY();
                END
                ELSE
                    UPDATE dbo.engineer_skills SET proficiency = @proficiency, note = @note,
                        updated_by = @actor, updated_at = SYSUTCDATETIME()
                    WHERE id = @existing;
                SELECT @existing;
                """, connection, transaction);
            command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, request.UserId);
            command.Parameters.AddParameter("@skill_id", SqlDbType.BigInt, request.SkillId);
            command.Parameters.AddParameter("@proficiency", SqlDbType.NVarChar, request.Proficiency.Trim(), 20);
            command.Parameters.AddParameter("@note", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Note, 500, "Note"), 500);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            var id = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "EngineerSkill", id, "",
                "Engineer skill saved", null, new { request.UserId, request.SkillId, request.Proficiency }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> DeleteEngineerSkillAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermVisitAdmin, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            await using (var command = new SqlCommand("DELETE FROM dbo.engineer_skills WHERE id = @id;", connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) return Results.NotFound();
            }
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "EngineerSkill", id, "",
                "Engineer skill removed", new { id }, null, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveAvailabilityAsync(
        SaveEngineerAvailabilityRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.UserId <= 0) throw Invalid("An engineer is required.");
        InputValidation.OneOf(request.Kind, "Kind", "Leave", "Training", "Public Holiday", "Company Holiday", "Other Assignment", "Unavailable");
        InputValidation.OptionalText(request.Reason, 300, "Reason");
        if (request.EndsAt <= request.StartsAt) throw Invalid("The period must end after it starts.");
        if (request.EndsAt - request.StartsAt > TimeSpan.FromDays(365)) throw Invalid("A period may not exceed a year.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        // An engineer may record their own unavailability; blocking somebody
        // else's calendar is an administrative act.
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        if (request.UserId != actor.Id && !permissions.Contains(SiteVisitCore.PermVisitAdmin)
            && !permissions.Contains(SiteVisitCore.PermVisitSchedule))
            throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied",
                "Recording unavailability for another engineer requires 'visit.admin' or 'visit.schedule'.");

        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            long id;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.engineer_availability (user_id, kind, reason, starts_at, ends_at, created_by)
                OUTPUT inserted.id
                SELECT @user_id, @kind, @reason, @starts_at, @ends_at, @actor
                WHERE EXISTS (SELECT 1 FROM dbo.users WHERE id = @user_id AND is_active = 1 AND deleted_at IS NULL);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, request.UserId);
                command.Parameters.AddParameter("@kind", SqlDbType.NVarChar, request.Kind.Trim(), 40);
                command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Reason, 300, "Reason"), 300);
                command.Parameters.AddParameter("@starts_at", SqlDbType.DateTimeOffset, request.StartsAt);
                command.Parameters.AddParameter("@ends_at", SqlDbType.DateTimeOffset, request.EndsAt);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                var scalar = await command.ExecuteScalarAsync(cancellationToken);
                if (scalar is null)
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "The engineer must be an active user.");
                id = Convert.ToInt64(scalar);
            }

            // Anything already booked in that window is reported back rather
            // than silently cancelled — moving a customer appointment is a
            // decision, not a side effect of somebody booking leave.
            var affected = new List<string>();
            await using (var command = new SqlCommand("""
                SELECT v.visit_no FROM dbo.site_visits v
                INNER JOIN dbo.site_visit_assignments a ON a.visit_id = v.id AND a.is_active = 1
                WHERE a.engineer_id = @user_id AND v.deleted_at IS NULL
                  AND v.status NOT IN (N'Cancelled', N'Closed', N'Completed')
                  AND v.scheduled_start IS NOT NULL
                  AND v.scheduled_start < @ends_at AND v.scheduled_end > @starts_at;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, request.UserId);
                command.Parameters.AddParameter("@starts_at", SqlDbType.DateTimeOffset, request.StartsAt);
                command.Parameters.AddParameter("@ends_at", SqlDbType.DateTimeOffset, request.EndsAt);
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                while (await reader.ReadAsync(cancellationToken)) affected.Add(reader.GetString(0));
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "EngineerAvailability", id, request.Kind,
                "Unavailability recorded", null,
                new { request.UserId, request.Kind, request.StartsAt, request.EndsAt, conflictingVisits = affected }, request.Reason, cancellationToken);
            if (affected.Count > 0)
            {
                var coordinators = await SiteVisitCore.UsersWithPermissionAsync(connection, transaction, SiteVisitCore.PermVisitSchedule, cancellationToken);
                await SiteVisitCore.NotifyAsync(connection, transaction, coordinators.Where(userId => userId != actor.Id),
                    "visit.availability_conflict", "Booked site visits overlap new unavailability",
                    $"{string.Join(", ", affected)} overlap the new {request.Kind.ToLowerInvariant()} period.",
                    "EngineerAvailability", id, $"visit.availability_conflict:EngineerAvailability:{id}", cancellationToken);
            }
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, conflictingVisits = affected });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> DeleteAvailabilityAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            long ownerId;
            await using (var command = new SqlCommand(
                "SELECT user_id FROM dbo.engineer_availability WHERE id = @id AND deleted_at IS NULL;", connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                var scalar = await command.ExecuteScalarAsync(cancellationToken);
                if (scalar is null) return Results.NotFound();
                ownerId = Convert.ToInt64(scalar);
            }
            if (ownerId != actor.Id && !permissions.Contains(SiteVisitCore.PermVisitAdmin)
                && !permissions.Contains(SiteVisitCore.PermVisitSchedule))
                throw new ApiException(StatusCodes.Status403Forbidden, "permission_denied",
                    "Removing another engineer's unavailability requires 'visit.admin' or 'visit.schedule'.");

            await using (var command = new SqlCommand(
                "UPDATE dbo.engineer_availability SET deleted_at = SYSUTCDATETIME() WHERE id = @id AND deleted_at IS NULL;",
                connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "EngineerAvailability", id, "",
                "Unavailability removed", new { id, ownerId }, null, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Customer sites and contacts
       =================================================================== */

    private static async Task<IResult> ListSitesAsync(
        long customerId, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeRead, cancellationToken);
        if (customerId <= 0) return Results.NotFound();
        await using var connection = await connections.OpenAsync(cancellationToken);

        var contactsBySite = new Dictionary<long, List<CustomerSiteContactRecord>>();
        await using (var command = new SqlCommand("""
            SELECT sc.id, sc.site_id, sc.name, sc.department, sc.position, sc.phone, sc.email,
                   sc.preferred_channel, sc.is_primary, sc.is_active, sc.row_version
            FROM dbo.customer_site_contacts sc
            INNER JOIN dbo.customer_sites s ON s.id = sc.site_id
            WHERE s.customer_id = @customer_id AND sc.deleted_at IS NULL
            ORDER BY sc.is_primary DESC, sc.name;
            """, connection))
        {
            command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var siteId = reader.GetInt64(1);
                if (!contactsBySite.TryGetValue(siteId, out var list)) contactsBySite[siteId] = list = [];
                list.Add(new CustomerSiteContactRecord(reader.GetInt64(0), siteId, reader.GetString(2), reader.GetString(3),
                    reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
                    reader.GetBoolean(8), reader.GetBoolean(9), reader.RowVersionString(10)));
            }
        }

        var sites = new List<CustomerSiteRecord>();
        await using (var command = new SqlCommand("""
            SELECT s.id, s.customer_id, c.name, s.code, s.name, s.branch, s.address, s.province, s.country,
                   s.latitude, s.longitude, s.travel_minutes, ISNULL(s.access_note, N''), s.is_active, s.row_version
            FROM dbo.customer_sites s
            INNER JOIN dbo.customers c ON c.id = s.customer_id
            WHERE s.customer_id = @customer_id AND s.deleted_at IS NULL
            ORDER BY s.name;
            """, connection))
        {
            command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var siteId = reader.GetInt64(0);
                sites.Add(new CustomerSiteRecord(siteId, reader.GetInt64(1), reader.GetString(2), reader.GetString(3),
                    reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7), reader.GetString(8),
                    reader.IsDBNull(9) ? null : reader.GetDecimal(9), reader.IsDBNull(10) ? null : reader.GetDecimal(10),
                    reader.GetInt32(11), reader.GetString(12), reader.GetBoolean(13), reader.RowVersionString(14),
                    contactsBySite.TryGetValue(siteId, out var contacts) ? contacts : []));
            }
        }
        return Results.Ok(sites);
    }

    private static async Task<IResult> SaveSiteAsync(
        long customerId, SaveCustomerSiteRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        // Sales register the sites they visit; this is intake data, not
        // administration, so intake.write is the gate.
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeWrite, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (customerId <= 0) return Results.NotFound();
        var code = NormalizeCode(request.Code, 40, "Site code");
        InputValidation.RequiredText(request.Name, 300, "Site name");
        InputValidation.OptionalText(request.Branch, 200, "Branch");
        InputValidation.OptionalText(request.Address, 1_000, "Address");
        InputValidation.OptionalText(request.Province, 120, "Province");
        InputValidation.OptionalText(request.Country, 120, "Country");
        InputValidation.OptionalText(request.AccessNote, 20_000, "Access note");
        if (request.Latitude is < -90 or > 90 || request.Longitude is < -180 or > 180) throw Invalid("The location is out of range.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                IF NOT EXISTS (SELECT 1 FROM dbo.customers WHERE id = @customer_id AND is_active = 1 AND deleted_at IS NULL)
                    THROW 51202, 'The customer must be active.', 1;
                DECLARE @existing bigint = (
                    SELECT id FROM dbo.customer_sites WITH (UPDLOCK, HOLDLOCK)
                    WHERE customer_id = @customer_id AND code = @code);
                IF @existing IS NULL
                BEGIN
                    INSERT INTO dbo.customer_sites (customer_id, code, name, branch, address, province, country,
                        latitude, longitude, travel_minutes, access_note, is_active, created_by, updated_by)
                    VALUES (@customer_id, @code, @name, @branch, @address, @province, @country,
                        @latitude, @longitude, @travel, @access_note, @active, @actor, @actor);
                    SET @existing = SCOPE_IDENTITY();
                END
                ELSE
                    UPDATE dbo.customer_sites SET name = @name, branch = @branch, address = @address,
                        province = @province, country = @country, latitude = @latitude, longitude = @longitude,
                        travel_minutes = @travel, access_note = @access_note, is_active = @active,
                        updated_by = @actor, updated_at = SYSUTCDATETIME()
                    WHERE id = @existing;
                SELECT @existing;
                """, connection, transaction);
            command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 40);
            command.Parameters.AddParameter("@name", SqlDbType.NVarChar, request.Name.Trim(), 300);
            command.Parameters.AddParameter("@branch", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Branch, 200, "Branch"), 200);
            command.Parameters.AddParameter("@address", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Address, 1_000, "Address"), 1_000);
            command.Parameters.AddParameter("@province", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Province, 120, "Province"), 120);
            command.Parameters.AddParameter("@country", SqlDbType.NVarChar,
                string.IsNullOrWhiteSpace(request.Country) ? "Thailand" : SiteVisitCore.Trim(request.Country, 120, "Country"), 120);
            command.Parameters.AddParameter("@latitude", SqlDbType.Decimal, request.Latitude, 0, 9, 6);
            command.Parameters.AddParameter("@longitude", SqlDbType.Decimal, request.Longitude, 0, 9, 6);
            command.Parameters.AddParameter("@travel", SqlDbType.Int, SiteVisitCore.Clamp(request.TravelMinutes <= 0 ? 60 : request.TravelMinutes, 0, 2_880));
            command.Parameters.AddParameter("@access_note", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.AccessNote, 20_000, "Access note"), -1);
            command.Parameters.AddParameter("@active", SqlDbType.Bit, request.IsActive);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            var id = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "CustomerSite", id, code,
                "Customer site saved", null, new { customerId, code, request.Name, request.IsActive }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, code });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveSiteContactAsync(
        long siteId, SaveCustomerSiteContactRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeWrite, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (siteId <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.Name, 200, "Contact name");
        InputValidation.OptionalText(request.Department, 200, "Department");
        InputValidation.OptionalText(request.Position, 200, "Position");
        InputValidation.OptionalText(request.Phone, 100, "Phone");
        InputValidation.OptionalText(request.Email, 256, "Email");
        var channel = string.IsNullOrWhiteSpace(request.PreferredChannel) ? "Email" : request.PreferredChannel.Trim();
        InputValidation.OneOf(channel, "Preferred channel", "Email", "Phone", "LINE", "Meeting", "Customer Portal", "Other");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long id;
            await using (var command = new SqlCommand("""
                IF NOT EXISTS (SELECT 1 FROM dbo.customer_sites WHERE id = @site_id AND deleted_at IS NULL)
                    THROW 51203, 'The customer site does not exist.', 1;
                IF @is_primary = 1
                    UPDATE dbo.customer_site_contacts SET is_primary = 0, updated_by = @actor, updated_at = SYSUTCDATETIME()
                     WHERE site_id = @site_id AND is_primary = 1;
                INSERT INTO dbo.customer_site_contacts
                    (site_id, name, department, position, phone, email, preferred_channel, is_primary, is_active, created_by, updated_by)
                OUTPUT inserted.id
                VALUES (@site_id, @name, @department, @position, @phone, @email, @channel, @is_primary, @active, @actor, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@site_id", SqlDbType.BigInt, siteId);
                command.Parameters.AddParameter("@name", SqlDbType.NVarChar, request.Name.Trim(), 200);
                command.Parameters.AddParameter("@department", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Department, 200, "Department"), 200);
                command.Parameters.AddParameter("@position", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Position, 200, "Position"), 200);
                command.Parameters.AddParameter("@phone", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Phone, 100, "Phone"), 100);
                command.Parameters.AddParameter("@email", SqlDbType.NVarChar, SiteVisitCore.Trim(request.Email, 256, "Email"), 256);
                command.Parameters.AddParameter("@channel", SqlDbType.NVarChar, channel, 30);
                command.Parameters.AddParameter("@is_primary", SqlDbType.Bit, request.IsPrimary);
                command.Parameters.AddParameter("@active", SqlDbType.Bit, request.IsActive);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                id = Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, "CustomerSiteContact", id, "",
                "Site contact saved", null, new { siteId, request.Name, request.IsPrimary }, null, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, siteId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Notifications
       =================================================================== */

    private static async Task<IResult> ListNotificationsAsync(
        bool? unreadOnly, int limit, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        var take = Math.Clamp(limit == 0 ? 50 : limit, 1, 200);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT TOP (@take) id, kind, title, detail, entity_type, entity_id, is_read, created_at, read_at
            FROM dbo.notifications
            WHERE user_id = @actor AND (@unread_only = 0 OR is_read = 0)
            ORDER BY created_at DESC, id DESC;
            """, connection);
        command.Parameters.AddParameter("@take", SqlDbType.Int, take);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@unread_only", SqlDbType.Bit, unreadOnly == true);

        var rows = new List<NotificationRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new NotificationRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetInt64(5),
                reader.GetBoolean(6), reader.GetFieldValue<DateTimeOffset>(7),
                reader.IsDBNull(8) ? null : reader.GetFieldValue<DateTimeOffset>(8)));
        return Results.Ok(rows);
    }

    private static async Task<IResult> MarkReadAsync(
        MarkNotificationsReadRequest request, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        var ids = (request.Ids ?? []).Where(id => id > 0).Distinct().Take(500).ToArray();
        if (!request.All && ids.Length == 0) return Results.Ok(new { updated = 0 });

        await using var connection = await connections.OpenAsync(cancellationToken);
        // The user_id predicate is what stops one person marking another
        // person's notifications read by guessing an id.
        await using var command = new SqlCommand($"""
            UPDATE dbo.notifications
               SET is_read = 1, read_at = SYSUTCDATETIME()
             WHERE user_id = @actor AND is_read = 0
               AND (@all = 1 OR id IN (SELECT value FROM STRING_SPLIT(@ids, ',')));
            """, connection);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@all", SqlDbType.Bit, request.All);
        command.Parameters.AddParameter("@ids", SqlDbType.NVarChar, string.Join(',', ids), -1);
        var updated = await command.ExecuteNonQueryAsync(cancellationToken);
        return Results.Ok(new { updated });
    }

    private static string NormalizeCode(string? value, int maxLength, string field)
    {
        InputValidation.RequiredText(value, maxLength, field);
        var code = value!.Trim().ToUpperInvariant().Replace(' ', '_');
        if (!code.All(character => char.IsLetterOrDigit(character) || character is '_' or '-'))
            throw Invalid($"{field} may contain only letters, digits, underscore and hyphen.");
        return code;
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
