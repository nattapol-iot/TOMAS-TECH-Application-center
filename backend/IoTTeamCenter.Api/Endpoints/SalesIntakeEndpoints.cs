using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Sales Intake: what the customer asked for, and the technical review of it.
///
/// The sales columns and the technical assessment are written by different
/// endpoints against different tables. <see cref="SaveAsync"/> can only reach
/// dbo.sales_intakes; <see cref="SubmitReviewAsync"/> can only insert into
/// dbo.sales_intake_reviews. That separation is the whole point of the module:
/// an engineer's conclusion never lands on top of what the customer said.
/// </summary>
public static class SalesIntakeEndpoints
{
    public static void MapSalesIntakeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/sales-intakes").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapGet("/dashboard", DashboardAsync);
        group.MapGet("/review-queue", ReviewQueueAsync);
        group.MapGet("/{id:long}", GetAsync);
        group.MapPost("/", CreateAsync);
        group.MapPut("/{id:long}", SaveAsync);
        group.MapPost("/{id:long}/status", ChangeStatusAsync);
        group.MapPost("/{id:long}/review", SubmitReviewAsync);
        group.MapPost("/{id:long}/attachments", UploadAttachmentAsync).DisableAntiforgery().RequireRateLimiting("document-upload");
        group.MapGet("/{id:long}/attachments/{attachmentId:long}/content", DownloadAttachmentAsync).RequireRateLimiting("document-download");
        group.MapDelete("/{id:long}/attachments/{attachmentId:long}", DeleteAttachmentAsync);
    }

    /* ===================================================================
       List
       =================================================================== */

    private static async Task<IResult> ListAsync(
        int page, int pageSize, string? search, string? status, long? customerId, long? salesOwnerId,
        string? priority, DateOnly? requestFrom, DateOnly? requestTo, bool? mine, bool? includeArchived, long? relatedInquiryId,
        SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeRead, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        InputValidation.OptionalText(status, 50, "Status");
        InputValidation.OptionalText(priority, 30, "Priority");
        if (customerId is <= 0 || salesOwnerId is <= 0 || relatedInquiryId is <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Filter identifiers must be positive.");
        if (requestFrom > requestTo)
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "The request date range is invalid.");
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize == 0 ? 25 : pageSize, 1, 100);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT
                i.id, i.intake_no, i.status, i.customer_id, c.name, i.site_name, i.subject,
                i.request_date, i.sales_owner_id, so.name, i.priority, i.required_response_date,
                i.readiness_score, i.blocker_count, i.warning_count,
                (SELECT COUNT_BIG(*) FROM dbo.sales_intake_purposes p WHERE p.intake_id = i.id),
                (SELECT COUNT_BIG(*) FROM dbo.sales_intake_attachments a WHERE a.intake_id = i.id AND a.deleted_at IS NULL),
                v.id, v.visit_no, v.status, v.scheduled_start,
                i.updated_at, COUNT_BIG(*) OVER(), i.row_version, i.archived_at
            FROM dbo.sales_intakes i
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.users so ON so.id = i.sales_owner_id
            OUTER APPLY (
                SELECT TOP (1) sv.id, sv.visit_no, sv.status, sv.scheduled_start
                FROM dbo.site_visits sv
                WHERE sv.intake_id = i.id AND sv.deleted_at IS NULL
                ORDER BY CASE WHEN sv.status IN (N'Cancelled', N'Closed') THEN 1 ELSE 0 END,
                         sv.scheduled_start DESC, sv.id DESC) v
            WHERE i.deleted_at IS NULL
              AND (@inquiry_id IS NULL OR i.related_inquiry_id = @inquiry_id OR EXISTS (
                  SELECT 1 FROM dbo.site_visit_links l WHERE l.source_type = N'SalesIntake'
                  AND l.source_id = i.id AND l.target_type = N'Inquiry' AND l.target_id = @inquiry_id))
              AND (@include_archived = 1 OR i.archived_at IS NULL)
              AND (@status IS NULL OR i.status = @status)
              AND (@customer_id IS NULL OR i.customer_id = @customer_id)
              AND (@sales_owner_id IS NULL OR i.sales_owner_id = @sales_owner_id)
              AND (@priority IS NULL OR i.priority = @priority)
              AND (@mine = 0 OR i.sales_owner_id = @actor OR i.created_by = @actor)
              AND (@request_from IS NULL OR i.request_date >= @request_from)
              AND (@request_to IS NULL OR i.request_date <= @request_to)
              AND (@search IS NULL OR i.intake_no LIKE N'%' + @search + N'%'
                   OR i.subject LIKE N'%' + @search + N'%'
                   OR c.name LIKE N'%' + @search + N'%'
                   OR i.site_name LIKE N'%' + @search + N'%'
                   OR i.customer_reference_no LIKE N'%' + @search + N'%')
            ORDER BY i.updated_at DESC, i.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 50);
        command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
        command.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, relatedInquiryId);
        command.Parameters.AddParameter("@sales_owner_id", SqlDbType.BigInt, salesOwnerId);
        command.Parameters.AddParameter("@priority", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(priority) ? null : priority.Trim(), 30);
        command.Parameters.AddParameter("@mine", SqlDbType.Bit, mine == true);
        command.Parameters.AddParameter("@include_archived", SqlDbType.Bit, includeArchived == true);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@request_from", SqlDbType.Date, requestFrom);
        command.Parameters.AddParameter("@request_to", SqlDbType.Date, requestTo);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<SalesIntakeSummary>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(22);
            items.Add(ReadSummary(reader));
        }
        return Results.Ok(new PagedResult<SalesIntakeSummary>(items, page, pageSize, total));
    }

    private static SalesIntakeSummary ReadSummary(SqlDataReader reader) => new(
        reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetInt64(3), reader.GetString(4),
        reader.GetString(5), reader.GetString(6), reader.GetFieldValue<DateOnly>(7), reader.GetInt64(8),
        reader.GetString(9), reader.GetString(10),
        reader.IsDBNull(11) ? null : reader.GetFieldValue<DateOnly>(11),
        reader.GetByte(12), reader.GetByte(13), reader.GetByte(14),
        (int)reader.GetInt64(15), (int)reader.GetInt64(16),
        reader.IsDBNull(17) ? null : reader.GetInt64(17),
        reader.IsDBNull(18) ? null : reader.GetString(18),
        reader.IsDBNull(19) ? null : reader.GetString(19),
        reader.IsDBNull(20) ? null : reader.GetFieldValue<DateTimeOffset>(20),
        reader.GetFieldValue<DateTimeOffset>(21), reader.RowVersionString(23), !reader.IsDBNull(24));

    private static async Task<IResult> ReviewQueueAsync(
        SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeReview, cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT
                i.id, i.intake_no, i.status, i.customer_id, c.name, i.site_name, i.subject,
                i.request_date, i.sales_owner_id, so.name, i.priority, i.required_response_date,
                i.readiness_score, i.blocker_count, i.warning_count,
                (SELECT COUNT_BIG(*) FROM dbo.sales_intake_purposes p WHERE p.intake_id = i.id),
                (SELECT COUNT_BIG(*) FROM dbo.sales_intake_attachments a WHERE a.intake_id = i.id AND a.deleted_at IS NULL),
                CAST(NULL AS bigint), CAST(NULL AS nvarchar(30)), CAST(NULL AS nvarchar(50)), CAST(NULL AS datetimeoffset(0)),
                i.updated_at, CAST(0 AS bigint), i.row_version, i.archived_at
            FROM dbo.sales_intakes i
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.users so ON so.id = i.sales_owner_id
            WHERE i.deleted_at IS NULL AND i.archived_at IS NULL
              AND i.status IN (N'Pending Technical Review', N'More Information Required', N'Ready to Schedule')
            ORDER BY
                CASE i.status WHEN N'Pending Technical Review' THEN 0 WHEN N'Ready to Schedule' THEN 1 ELSE 2 END,
                CASE i.priority WHEN N'Urgent' THEN 0 WHEN N'High' THEN 1 WHEN N'Normal' THEN 2 ELSE 3 END,
                i.required_response_date, i.updated_at;
            """, connection);
        var items = new List<SalesIntakeSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken)) items.Add(ReadSummary(reader));
        return Results.Ok(items);
    }

    /* ===================================================================
       Detail
       =================================================================== */

    private static async Task<IResult> GetAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeRead, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        var detail = await LoadDetailAsync(connection, id, permissions, clock, cancellationToken);
        return detail is null ? Results.NotFound() : Results.Ok(detail);
    }

    internal static async Task<SalesIntakeDetail?> LoadDetailAsync(
        SqlConnection connection, long id, IReadOnlySet<string> permissions, BusinessClock clock, CancellationToken cancellationToken)
    {
        SalesIntakeDetail? shell = null;
        string customerReference = "";
        long customerId = 0;
        await using (var command = new SqlCommand("""
            SELECT i.id, i.intake_no, i.status, i.customer_id, c.code, c.name, i.subject, i.customer_reference_no,
                   i.request_date, i.sales_owner_id, so.name, i.priority, i.required_response_date,
                   i.customer_expected_completion, i.source,
                   i.related_inquiry_id, inq.inquiry_no, i.related_project_id, prj.project_no,
                   i.site_id, i.site_contact_id, i.customer_branch, i.site_name, i.site_address,
                   i.contact_name, i.contact_department, i.contact_position, i.contact_phone, i.contact_email, i.contact_channel,
                   i.problem_statement, i.desired_capability, i.expected_result, i.expected_scope, i.out_of_scope,
                   i.existing_process, i.current_pain_point, i.target_cycle_time, i.product_information,
                   i.quality_requirement, i.special_requirement, i.budget_range, i.expected_timeline,
                   i.competitor_information, i.additional_notes,
                   i.machine_name, i.machine_model, i.machine_serial_no, i.manufacturer, i.existing_system,
                   i.controller_brand, i.available_drawing, i.utility_information, i.installation_area,
                   i.space_limitation, i.working_environment, i.safety_requirement, i.production_schedule,
                   i.shutdown_window, i.ppe_requirement, i.site_access_requirement,
                   i.photography_restricted, i.nda_required,
                   i.readiness_score, i.blocker_count, i.warning_count,
                   i.submitted_at, sub.name, i.department,
                   cre.name, i.created_at, upd.name, i.updated_at, i.archived_at, i.row_version
            FROM dbo.sales_intakes i
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.users so ON so.id = i.sales_owner_id
            INNER JOIN dbo.users cre ON cre.id = i.created_by
            INNER JOIN dbo.users upd ON upd.id = i.updated_by
            LEFT JOIN dbo.users sub ON sub.id = i.submitted_by
            LEFT JOIN dbo.inquiries inq ON inq.id = i.related_inquiry_id
            LEFT JOIN dbo.projects prj ON prj.id = i.related_project_id
            WHERE i.id = @id AND i.deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null;
            string S(int i) => reader.IsDBNull(i) ? "" : reader.GetString(i);
            customerId = reader.GetInt64(3);
            customerReference = S(7);
            shell = new SalesIntakeDetail(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), customerId, S(4), S(5), S(6), customerReference,
                reader.GetFieldValue<DateOnly>(8), reader.GetInt64(9), S(10), S(11),
                reader.IsDBNull(12) ? null : reader.GetFieldValue<DateOnly>(12),
                reader.IsDBNull(13) ? null : reader.GetFieldValue<DateOnly>(13), S(14),
                reader.IsDBNull(15) ? null : reader.GetInt64(15), reader.IsDBNull(16) ? null : reader.GetString(16),
                reader.IsDBNull(17) ? null : reader.GetInt64(17), reader.IsDBNull(18) ? null : reader.GetString(18),
                new SalesIntakeContact(
                    reader.IsDBNull(19) ? null : reader.GetInt64(19), reader.IsDBNull(20) ? null : reader.GetInt64(20),
                    S(21), S(22), S(23), S(24), S(25), S(26), S(27), S(28), S(29)),
                new SalesIntakeRequirement(S(30), S(31), S(32), S(33), S(34), S(35), S(36), S(37), S(38), S(39), S(40), S(41), S(42), S(43), S(44)),
                new SalesIntakeMachine(S(45), S(46), S(47), S(48), S(49), S(50), S(51), S(52), S(53), S(54), S(55), S(56), S(57), S(58), S(59), S(60),
                    reader.GetBoolean(61), reader.GetBoolean(62)),
                reader.GetByte(63), reader.GetByte(64), reader.GetByte(65),
                reader.IsDBNull(66) ? null : reader.GetFieldValue<DateTimeOffset>(66), reader.IsDBNull(67) ? null : reader.GetString(67), S(68),
                S(69), reader.GetFieldValue<DateTimeOffset>(70), S(71), reader.GetFieldValue<DateTimeOffset>(72),
                !reader.IsDBNull(73), reader.RowVersionString(74),
                [], [], [], [], [], [], [], [], [],
                new ReadinessResult(0, 0, 0, false, []), []);
        }

        var purposes = new List<IntakePurposeRecord>();
        await using (var command = new SqlCommand("""
            SELECT p.visit_type_id, t.code, t.name_en, p.note
            FROM dbo.sales_intake_purposes p
            INNER JOIN dbo.visit_types t ON t.id = p.visit_type_id
            WHERE p.intake_id = @id ORDER BY t.sort_order, t.code;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                purposes.Add(new IntakePurposeRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3)));
        }

        var skills = new List<IntakeSkillRecord>();
        await using (var command = new SqlCommand("""
            SELECT s.skill_id, k.code, k.name_en, s.source, s.is_mandatory, s.note
            FROM dbo.sales_intake_skills s
            INNER JOIN dbo.visit_skills k ON k.id = s.skill_id
            WHERE s.intake_id = @id ORDER BY s.source, k.sort_order, k.code;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                skills.Add(new IntakeSkillRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.GetBoolean(4), reader.GetString(5)));
        }

        var windows = new List<IntakeWindowRecord>();
        await using (var command = new SqlCommand("""
            SELECT id, starts_at, ends_at, preference, note
            FROM dbo.sales_intake_windows WHERE intake_id = @id ORDER BY preference, starts_at;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                windows.Add(new IntakeWindowRecord(reader.GetInt64(0), reader.GetFieldValue<DateTimeOffset>(1),
                    reader.GetFieldValue<DateTimeOffset>(2), reader.GetByte(3), reader.GetString(4)));
        }

        var attachments = await LoadAttachmentsAsync(connection, id, cancellationToken);

        var reviews = new List<IntakeReviewRecord>();
        await using (var command = new SqlCommand("""
            SELECT r.id, r.reviewer_id, u.name, r.decision, r.comment, r.visit_scope, r.engineer_count,
                   r.estimated_duration_minutes, r.required_equipment, r.risk_assessment, r.safety_concern,
                   r.requires_manager_approval, m.name, r.manager_approved_at, r.missing_information,
                   r.readiness_score_at_review, r.created_at
            FROM dbo.sales_intake_reviews r
            INNER JOIN dbo.users u ON u.id = r.reviewer_id
            LEFT JOIN dbo.users m ON m.id = r.manager_approved_by
            WHERE r.intake_id = @id ORDER BY r.created_at DESC, r.id DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                string S(int i) => reader.IsDBNull(i) ? "" : reader.GetString(i);
                reviews.Add(new IntakeReviewRecord(
                    reader.GetInt64(0), reader.GetInt64(1), reader.GetString(2), reader.GetString(3), S(4), S(5),
                    reader.GetByte(6), reader.GetInt32(7), S(8), S(9), S(10), reader.GetBoolean(11),
                    reader.IsDBNull(12) ? null : reader.GetString(12),
                    reader.IsDBNull(13) ? null : reader.GetFieldValue<DateTimeOffset>(13),
                    S(14), reader.GetByte(15), reader.GetFieldValue<DateTimeOffset>(16)));
            }
        }

        var visits = await SiteVisitEndpoints.LoadSummariesForIntakeAsync(connection, id, clock, cancellationToken);
        var history = await SiteVisitCore.LoadStatusHistoryAsync(connection, SiteVisitCore.EntityIntake, id, cancellationToken);
        var links = await SiteVisitCore.LoadLinksAsync(connection, SiteVisitCore.EntityIntake, id, cancellationToken);

        // Duplicate customer reference numbers are surfaced, never merged. The
        // requirement is explicit that the system must warn and stop there.
        var duplicates = new List<DuplicateReferenceRecord>();
        if (customerReference.Length > 0)
        {
            await using var command = new SqlCommand("""
                SELECT TOP (10) id, intake_no, subject, request_date, status
                FROM dbo.sales_intakes
                WHERE deleted_at IS NULL AND id <> @id AND customer_id = @customer_id
                  AND customer_reference_no = @reference
                ORDER BY request_date DESC, id DESC;
                """, connection);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
            command.Parameters.AddParameter("@reference", SqlDbType.NVarChar, customerReference, 100);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                duplicates.Add(new DuplicateReferenceRecord(reader.GetInt64(0), reader.GetString(1),
                    reader.GetString(2), reader.GetFieldValue<DateOnly>(3), reader.GetString(4)));
        }

        var readiness = SiteVisitCore.EvaluateReadiness(BuildReadinessInput(shell!, purposes.Count, attachments.Count, windows.Count, skills.Count));
        var allowed = SiteVisitCore.AllowedTransitions(SiteVisitCore.IntakeTransitions, shell!.Status, permissions);

        return shell with
        {
            Purposes = purposes,
            Skills = skills,
            Windows = windows,
            Attachments = attachments,
            Reviews = reviews,
            Visits = visits,
            StatusHistory = history,
            Links = links,
            DuplicateReferences = duplicates,
            Readiness = readiness,
            AllowedTransitions = allowed,
        };
    }

    private static SiteVisitCore.ReadinessInput BuildReadinessInput(
        SalesIntakeDetail detail, int purposeCount, int attachmentCount, int windowCount, int skillCount) =>
        new(detail.CustomerId, detail.Contact.SiteName, detail.Contact.SiteAddress, detail.Contact.ContactName,
            detail.Contact.ContactPhone, detail.Contact.ContactEmail, detail.Requirement.ProblemStatement,
            detail.Requirement.ExpectedResult, purposeCount, detail.Machine.MachineName, detail.Machine.MachineModel,
            detail.Machine.ExistingSystem, attachmentCount, windowCount, detail.Machine.SafetyRequirement,
            detail.Machine.SiteAccessRequirement, skillCount);

    private static async Task<List<IntakeAttachmentRecord>> LoadAttachmentsAsync(
        SqlConnection connection, long id, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT a.id, a.name, a.category, a.description, a.version, a.content_type, a.size_bytes,
                   a.scan_status, u.name, a.uploaded_at, a.row_version
            FROM dbo.sales_intake_attachments a
            INNER JOIN dbo.users u ON u.id = a.uploaded_by
            WHERE a.intake_id = @id AND a.deleted_at IS NULL
            ORDER BY a.uploaded_at DESC, a.id DESC;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        var rows = new List<IntakeAttachmentRecord>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            rows.Add(new IntakeAttachmentRecord(reader.GetInt64(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetInt32(4), reader.GetString(5), reader.GetInt64(6),
                reader.GetString(7), reader.GetString(8), reader.GetFieldValue<DateTimeOffset>(9), reader.RowVersionString(10)));
        return rows;
    }

    /* ===================================================================
       Create and save
       =================================================================== */

    private static async Task<IResult> CreateAsync(
        SaveSalesIntakeRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeWrite, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        Validate(request, clock);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await ValidateReferencesAsync(connection, transaction, request, cancellationToken);
            var number = await InquiryEndpoints.IssueNumberAsync(connection, transaction, "SIN", clock.Today, cancellationToken);

            long id;
            await using (var command = new SqlCommand($"""
                INSERT INTO dbo.sales_intakes (
                    intake_no, status, customer_id, site_id, site_contact_id, customer_branch, site_name, site_address,
                    contact_name, contact_department, contact_position, contact_phone, contact_email, contact_channel,
                    customer_reference_no, subject, request_date, sales_owner_id, priority, required_response_date,
                    customer_expected_completion, source, related_inquiry_id, related_project_id,
                    {RequirementColumns}, {MachineColumns},
                    department, created_by, updated_by)
                OUTPUT inserted.id
                VALUES (
                    @number, N'Draft', @customer_id, @site_id, @site_contact_id, @customer_branch, @site_name, @site_address,
                    @contact_name, @contact_department, @contact_position, @contact_phone, @contact_email, @contact_channel,
                    @customer_reference_no, @subject, @request_date, @sales_owner_id, @priority, @required_response_date,
                    @customer_expected_completion, @source, @related_inquiry_id, @related_project_id,
                    {RequirementValues}, {MachineValues},
                    @department, @actor, @actor);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
                command.Parameters.AddParameter("@department", SqlDbType.NVarChar, actor.Department, 100);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                BindIntake(command, request, clock);
                id = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            await ReplaceChildrenAsync(connection, transaction, id, request, actor.Id, "Sales", cancellationToken);
            var readiness = await RecomputeReadinessAsync(connection, transaction, id, cancellationToken);
            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityIntake, id, number,
                null, "Draft", "Intake created", actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityIntake, id, number,
                "Intake created", null, new { request.Subject, request.CustomerId, readiness.Score }, null, cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/sales-intakes/{id}", new { id, number, readiness });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SaveAsync(
        long id, SaveSalesIntakeRequest request, SqlConnectionFactory connections, CurrentUserService users,
        BusinessClock clock, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeWrite, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        Validate(request, clock);
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion ?? "");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string number;
            string status;
            await using (var current = new SqlCommand("""
                SELECT intake_no, status, row_version, archived_at
                FROM dbo.sales_intakes WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                current.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await current.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                number = reader.GetString(0);
                status = reader.GetString(1);
                SiteVisitCore.RequireSameVersion(expected, (byte[])reader.GetValue(2));
                if (!reader.IsDBNull(3))
                    throw new ApiException(StatusCodes.Status409Conflict, "intake_archived", "An archived intake cannot be edited.");
            }

            // Sales may edit while the intake is theirs to edit. Once it is with
            // engineering, editing the customer's words underneath the reviewer
            // would make the review meaningless.
            if (status is not ("Draft" or "More Information Required"))
                throw new ApiException(StatusCodes.Status409Conflict, "intake_locked",
                    $"An intake in '{status}' cannot be edited. Ask the coordinator to return it for more information.");

            await ValidateReferencesAsync(connection, transaction, request, cancellationToken);
            await using (var command = new SqlCommand($"""
                UPDATE dbo.sales_intakes SET
                    customer_id = @customer_id, site_id = @site_id, site_contact_id = @site_contact_id,
                    customer_branch = @customer_branch, site_name = @site_name, site_address = @site_address,
                    contact_name = @contact_name, contact_department = @contact_department,
                    contact_position = @contact_position, contact_phone = @contact_phone,
                    contact_email = @contact_email, contact_channel = @contact_channel,
                    customer_reference_no = @customer_reference_no, subject = @subject, request_date = @request_date,
                    sales_owner_id = @sales_owner_id, priority = @priority,
                    required_response_date = @required_response_date,
                    customer_expected_completion = @customer_expected_completion, source = @source,
                    related_inquiry_id = @related_inquiry_id, related_project_id = @related_project_id,
                    {RequirementAssignments}, {MachineAssignments},
                    updated_by = @actor, updated_at = SYSUTCDATETIME()
                WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                BindIntake(command, request, clock);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await ReplaceChildrenAsync(connection, transaction, id, request, actor.Id, "Sales", cancellationToken);
            var readiness = await RecomputeReadinessAsync(connection, transaction, id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityIntake, id, number,
                "Intake updated", null, new { request.Subject, readiness.Score, readiness.BlockerCount }, null, cancellationToken);

            var rowVersion = await ReadRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, number, rowVersion, readiness });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private const string RequirementColumns =
        "problem_statement, desired_capability, expected_result, expected_scope, out_of_scope, existing_process, " +
        "current_pain_point, target_cycle_time, product_information, quality_requirement, special_requirement, " +
        "budget_range, expected_timeline, competitor_information, additional_notes";

    private const string RequirementValues =
        "@problem_statement, @desired_capability, @expected_result, @expected_scope, @out_of_scope, @existing_process, " +
        "@current_pain_point, @target_cycle_time, @product_information, @quality_requirement, @special_requirement, " +
        "@budget_range, @expected_timeline, @competitor_information, @additional_notes";

    private const string RequirementAssignments =
        "problem_statement = @problem_statement, desired_capability = @desired_capability, " +
        "expected_result = @expected_result, expected_scope = @expected_scope, out_of_scope = @out_of_scope, " +
        "existing_process = @existing_process, current_pain_point = @current_pain_point, " +
        "target_cycle_time = @target_cycle_time, product_information = @product_information, " +
        "quality_requirement = @quality_requirement, special_requirement = @special_requirement, " +
        "budget_range = @budget_range, expected_timeline = @expected_timeline, " +
        "competitor_information = @competitor_information, additional_notes = @additional_notes";

    private const string MachineColumns =
        "machine_name, machine_model, machine_serial_no, manufacturer, existing_system, controller_brand, " +
        "available_drawing, utility_information, installation_area, space_limitation, working_environment, " +
        "safety_requirement, production_schedule, shutdown_window, ppe_requirement, site_access_requirement, " +
        "photography_restricted, nda_required";

    private const string MachineValues =
        "@machine_name, @machine_model, @machine_serial_no, @manufacturer, @existing_system, @controller_brand, " +
        "@available_drawing, @utility_information, @installation_area, @space_limitation, @working_environment, " +
        "@safety_requirement, @production_schedule, @shutdown_window, @ppe_requirement, @site_access_requirement, " +
        "@photography_restricted, @nda_required";

    private const string MachineAssignments =
        "machine_name = @machine_name, machine_model = @machine_model, machine_serial_no = @machine_serial_no, " +
        "manufacturer = @manufacturer, existing_system = @existing_system, controller_brand = @controller_brand, " +
        "available_drawing = @available_drawing, utility_information = @utility_information, " +
        "installation_area = @installation_area, space_limitation = @space_limitation, " +
        "working_environment = @working_environment, safety_requirement = @safety_requirement, " +
        "production_schedule = @production_schedule, shutdown_window = @shutdown_window, " +
        "ppe_requirement = @ppe_requirement, site_access_requirement = @site_access_requirement, " +
        "photography_restricted = @photography_restricted, nda_required = @nda_required";

    private static void Validate(SaveSalesIntakeRequest request, BusinessClock clock)
    {
        if (request.CustomerId <= 0) throw Invalid("A customer is required.");
        if (request.SalesOwnerId <= 0) throw Invalid("A sales owner is required.");
        InputValidation.RequiredText(request.Subject, 300, "Subject");
        InputValidation.OneOf(request.Priority, "Priority", "Low", "Normal", "High", "Urgent");
        InputValidation.OneOf(request.Source, "Source", "Email", "Phone", "Meeting", "Existing Customer", "Referral", "Website", "Other");
        InputValidation.OneOf(request.Contact.ContactChannel, "Preferred channel", "Email", "Phone", "LINE", "Meeting", "Customer Portal", "Other");
        InputValidation.OptionalText(request.CustomerReferenceNo, 100, "Customer reference number");
        var today = clock.Today;
        var requestDate = request.RequestDate ?? today;
        if (requestDate < today.AddYears(-5) || requestDate > today.AddDays(30))
            throw Invalid("The request date must be within the last five years and not more than a month ahead.");
        if (request.RequiredResponseDate is { } response && (response < today.AddYears(-5) || response > today.AddYears(5)))
            throw Invalid("The required response date is out of range.");
        if (request.CustomerExpectedCompletion is { } completion && (completion < today.AddYears(-5) || completion > today.AddYears(10)))
            throw Invalid("The customer expected completion date is out of range.");
        if (request.VisitTypeIds.Count > 20) throw Invalid("At most twenty visit purposes may be selected.");
        if (request.SkillIds.Count > 20) throw Invalid("At most twenty skills may be selected.");
        if (request.Windows.Count > 12) throw Invalid("At most twelve availability windows may be proposed.");
        foreach (var window in request.Windows)
        {
            if (window.EndsAt <= window.StartsAt) throw Invalid("Each availability window must end after it starts.");
            if (window.EndsAt - window.StartsAt > TimeSpan.FromDays(31)) throw Invalid("An availability window may not exceed 31 days.");
            if (window.Preference is < 1 or > 9) throw Invalid("Window preference must be between 1 and 9.");
            InputValidation.OptionalText(window.Note, 500, "Window note");
        }
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);

    private static void BindIntake(SqlCommand command, SaveSalesIntakeRequest request, BusinessClock clock)
    {
        var contact = request.Contact;
        var requirement = request.Requirement;
        var machine = request.Machine;
        var p = command.Parameters;
        p.AddParameter("@customer_id", SqlDbType.BigInt, request.CustomerId);
        p.AddParameter("@site_id", SqlDbType.BigInt, contact.SiteId is > 0 ? contact.SiteId : null);
        p.AddParameter("@site_contact_id", SqlDbType.BigInt, contact.SiteContactId is > 0 ? contact.SiteContactId : null);
        p.AddParameter("@customer_branch", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.CustomerBranch, 200, "Customer branch"), 200);
        p.AddParameter("@site_name", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.SiteName, 300, "Site name"), 300);
        p.AddParameter("@site_address", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.SiteAddress, 1000, "Site address"), 1000);
        p.AddParameter("@contact_name", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.ContactName, 200, "Contact name"), 200);
        p.AddParameter("@contact_department", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.ContactDepartment, 200, "Contact department"), 200);
        p.AddParameter("@contact_position", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.ContactPosition, 200, "Contact position"), 200);
        p.AddParameter("@contact_phone", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.ContactPhone, 100, "Contact phone"), 100);
        p.AddParameter("@contact_email", SqlDbType.NVarChar, SiteVisitCore.Trim(contact.ContactEmail, 256, "Contact email"), 256);
        p.AddParameter("@contact_channel", SqlDbType.NVarChar, contact.ContactChannel.Trim(), 30);
        p.AddParameter("@customer_reference_no", SqlDbType.NVarChar, SiteVisitCore.Trim(request.CustomerReferenceNo, 100, "Customer reference number"), 100);
        p.AddParameter("@subject", SqlDbType.NVarChar, request.Subject.Trim(), 300);
        p.AddParameter("@request_date", SqlDbType.Date, request.RequestDate ?? clock.Today);
        p.AddParameter("@sales_owner_id", SqlDbType.BigInt, request.SalesOwnerId);
        p.AddParameter("@priority", SqlDbType.NVarChar, request.Priority.Trim(), 30);
        p.AddParameter("@required_response_date", SqlDbType.Date, request.RequiredResponseDate);
        p.AddParameter("@customer_expected_completion", SqlDbType.Date, request.CustomerExpectedCompletion);
        p.AddParameter("@source", SqlDbType.NVarChar, request.Source.Trim(), 40);
        p.AddParameter("@related_inquiry_id", SqlDbType.BigInt, request.RelatedInquiryId is > 0 ? request.RelatedInquiryId : null);
        p.AddParameter("@related_project_id", SqlDbType.BigInt, request.RelatedProjectId is > 0 ? request.RelatedProjectId : null);

        p.AddParameter("@problem_statement", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.ProblemStatement, 20_000, "Problem statement"), -1);
        p.AddParameter("@desired_capability", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.DesiredCapability, 20_000, "Desired capability"), -1);
        p.AddParameter("@expected_result", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.ExpectedResult, 20_000, "Expected result"), -1);
        p.AddParameter("@expected_scope", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.ExpectedScope, 20_000, "Expected scope"), -1);
        p.AddParameter("@out_of_scope", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.OutOfScope, 20_000, "Out of scope"), -1);
        p.AddParameter("@existing_process", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.ExistingProcess, 20_000, "Existing process"), -1);
        p.AddParameter("@current_pain_point", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.CurrentPainPoint, 20_000, "Current pain point"), -1);
        p.AddParameter("@target_cycle_time", SqlDbType.NVarChar, SiteVisitCore.Trim(requirement.TargetCycleTime, 300, "Target cycle time"), 300);
        p.AddParameter("@product_information", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.ProductInformation, 20_000, "Product information"), -1);
        p.AddParameter("@quality_requirement", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.QualityRequirement, 20_000, "Quality requirement"), -1);
        p.AddParameter("@special_requirement", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.SpecialRequirement, 20_000, "Special requirement"), -1);
        p.AddParameter("@budget_range", SqlDbType.NVarChar, SiteVisitCore.Trim(requirement.BudgetRange, 200, "Budget range"), 200);
        p.AddParameter("@expected_timeline", SqlDbType.NVarChar, SiteVisitCore.Trim(requirement.ExpectedTimeline, 300, "Expected timeline"), 300);
        p.AddParameter("@competitor_information", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.CompetitorInformation, 20_000, "Competitor information"), -1);
        p.AddParameter("@additional_notes", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(requirement.AdditionalNotes, 20_000, "Additional notes"), -1);

        p.AddParameter("@machine_name", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.MachineName, 300, "Machine name"), 300);
        p.AddParameter("@machine_model", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.MachineModel, 200, "Machine model"), 200);
        p.AddParameter("@machine_serial_no", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.MachineSerialNo, 200, "Machine serial number"), 200);
        p.AddParameter("@manufacturer", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.Manufacturer, 200, "Manufacturer"), 200);
        p.AddParameter("@existing_system", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(machine.ExistingSystem, 20_000, "Existing system"), -1);
        p.AddParameter("@controller_brand", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.ControllerBrand, 300, "Controller brand"), 300);
        p.AddParameter("@available_drawing", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.AvailableDrawing, 500, "Available drawing"), 500);
        p.AddParameter("@utility_information", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(machine.UtilityInformation, 20_000, "Utility information"), -1);
        p.AddParameter("@installation_area", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.InstallationArea, 300, "Installation area"), 300);
        p.AddParameter("@space_limitation", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(machine.SpaceLimitation, 20_000, "Space limitation"), -1);
        p.AddParameter("@working_environment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(machine.WorkingEnvironment, 20_000, "Working environment"), -1);
        p.AddParameter("@safety_requirement", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(machine.SafetyRequirement, 20_000, "Safety requirement"), -1);
        p.AddParameter("@production_schedule", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.ProductionSchedule, 500, "Production schedule"), 500);
        p.AddParameter("@shutdown_window", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.ShutdownWindow, 500, "Shutdown window"), 500);
        p.AddParameter("@ppe_requirement", SqlDbType.NVarChar, SiteVisitCore.Trim(machine.PpeRequirement, 500, "PPE requirement"), 500);
        p.AddParameter("@site_access_requirement", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(machine.SiteAccessRequirement, 20_000, "Site access requirement"), -1);
        p.AddParameter("@photography_restricted", SqlDbType.Bit, machine.PhotographyRestricted);
        p.AddParameter("@nda_required", SqlDbType.Bit, machine.NdaRequired);
    }

    private static async Task ValidateReferencesAsync(
        SqlConnection connection, SqlTransaction transaction, SaveSalesIntakeRequest request, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT
                CASE WHEN EXISTS (SELECT 1 FROM dbo.customers WHERE id=@customer_id AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END,
                CASE WHEN EXISTS (SELECT 1 FROM dbo.users WHERE id=@sales_owner_id AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END,
                CASE WHEN @site_id IS NULL OR EXISTS (
                    SELECT 1 FROM dbo.customer_sites WHERE id=@site_id AND customer_id=@customer_id AND is_active=1 AND deleted_at IS NULL) THEN 1 ELSE 0 END,
                CASE WHEN @site_contact_id IS NULL OR EXISTS (
                    SELECT 1 FROM dbo.customer_site_contacts sc
                    INNER JOIN dbo.customer_sites s ON s.id = sc.site_id
                    WHERE sc.id=@site_contact_id AND sc.is_active=1 AND sc.deleted_at IS NULL AND s.customer_id=@customer_id) THEN 1 ELSE 0 END,
                CASE WHEN @inquiry_id IS NULL OR EXISTS (SELECT 1 FROM dbo.inquiries WHERE id=@inquiry_id AND customer_id=@customer_id AND deleted_at IS NULL) THEN 1 ELSE 0 END,
                CASE WHEN @project_id IS NULL OR EXISTS (SELECT 1 FROM dbo.projects WHERE id=@project_id AND deleted_at IS NULL) THEN 1 ELSE 0 END;
            """, connection, transaction);
        command.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, request.CustomerId);
        command.Parameters.AddParameter("@sales_owner_id", SqlDbType.BigInt, request.SalesOwnerId);
        command.Parameters.AddParameter("@site_id", SqlDbType.BigInt, request.Contact.SiteId is > 0 ? request.Contact.SiteId : null);
        command.Parameters.AddParameter("@site_contact_id", SqlDbType.BigInt, request.Contact.SiteContactId is > 0 ? request.Contact.SiteContactId : null);
        command.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, request.RelatedInquiryId is > 0 ? request.RelatedInquiryId : null);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, request.RelatedProjectId is > 0 ? request.RelatedProjectId : null);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        await reader.ReadAsync(cancellationToken);
        if (reader.GetInt32(0) != 1) throw Unprocessable("The selected customer must be active.");
        if (reader.GetInt32(1) != 1) throw Unprocessable("The sales owner must be an active user.");
        if (reader.GetInt32(2) != 1) throw Unprocessable("The selected site does not belong to this customer.");
        if (reader.GetInt32(3) != 1) throw Unprocessable("The selected contact does not belong to this customer.");
        if (reader.GetInt32(4) != 1) throw Unprocessable("The related inquiry does not exist.");
        if (reader.GetInt32(5) != 1) throw Unprocessable("The related project does not exist.");
    }

    private static ApiException Unprocessable(string message) =>
        new(StatusCodes.Status422UnprocessableEntity, "invalid_reference", message);

    /// <summary>
    /// Purposes, sales skills and windows are re-stated wholesale on save.
    /// Coordinator skills are deliberately untouched here — that source is
    /// owned by the technical review, and a sales edit must not erase it.
    /// </summary>
    private static async Task ReplaceChildrenAsync(
        SqlConnection connection, SqlTransaction transaction, long id, SaveSalesIntakeRequest request,
        long actorId, string skillSource, CancellationToken cancellationToken)
    {
        await using (var command = new SqlCommand("DELETE FROM dbo.sales_intake_purposes WHERE intake_id = @id;", connection, transaction))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        foreach (var visitTypeId in request.VisitTypeIds.Where(value => value > 0).Distinct())
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.sales_intake_purposes (intake_id, visit_type_id)
                SELECT @id, @visit_type_id WHERE EXISTS (SELECT 1 FROM dbo.visit_types WHERE id = @visit_type_id AND is_active = 1);
                """, connection, transaction);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@visit_type_id", SqlDbType.BigInt, visitTypeId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        await using (var command = new SqlCommand(
            "DELETE FROM dbo.sales_intake_skills WHERE intake_id = @id AND source = @source;", connection, transaction))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@source", SqlDbType.NVarChar, skillSource, 20);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        foreach (var skillId in request.SkillIds.Where(value => value > 0).Distinct())
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.sales_intake_skills (intake_id, skill_id, source, created_by)
                SELECT @id, @skill_id, @source, @actor WHERE EXISTS (SELECT 1 FROM dbo.visit_skills WHERE id = @skill_id AND is_active = 1);
                """, connection, transaction);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@skill_id", SqlDbType.BigInt, skillId);
            command.Parameters.AddParameter("@source", SqlDbType.NVarChar, skillSource, 20);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }

        // A window already chosen by a scheduled visit is kept; deleting it
        // would break the pointer from dbo.site_visits.proposed_window_id.
        await using (var command = new SqlCommand("""
            DELETE FROM dbo.sales_intake_windows
            WHERE intake_id = @id
              AND NOT EXISTS (SELECT 1 FROM dbo.site_visits v WHERE v.proposed_window_id = dbo.sales_intake_windows.id);
            """, connection, transaction))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        foreach (var window in request.Windows)
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.sales_intake_windows (intake_id, starts_at, ends_at, preference, note, created_by)
                VALUES (@id, @starts_at, @ends_at, @preference, @note, @actor);
                """, connection, transaction);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@starts_at", SqlDbType.DateTimeOffset, window.StartsAt);
            command.Parameters.AddParameter("@ends_at", SqlDbType.DateTimeOffset, window.EndsAt);
            command.Parameters.AddParameter("@preference", SqlDbType.TinyInt, (byte)window.Preference);
            command.Parameters.AddParameter("@note", SqlDbType.NVarChar, SiteVisitCore.Trim(window.Note, 500, "Window note"), 500);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
    }

    /// <summary>
    /// Recomputes and stores the readiness score from what is actually in the
    /// database, not from the request body — so an intake cannot be submitted
    /// on the strength of a score the client made up.
    /// </summary>
    internal static async Task<ReadinessResult> RecomputeReadinessAsync(
        SqlConnection connection, SqlTransaction transaction, long id, CancellationToken cancellationToken)
    {
        SiteVisitCore.ReadinessInput input;
        await using (var command = new SqlCommand("""
            SELECT i.customer_id, i.site_name, i.site_address, i.contact_name, i.contact_phone, i.contact_email,
                   ISNULL(i.problem_statement, N''), ISNULL(i.expected_result, N''),
                   (SELECT COUNT_BIG(*) FROM dbo.sales_intake_purposes p WHERE p.intake_id = i.id),
                   i.machine_name, i.machine_model, ISNULL(i.existing_system, N''),
                   (SELECT COUNT_BIG(*) FROM dbo.sales_intake_attachments a WHERE a.intake_id = i.id AND a.deleted_at IS NULL),
                   (SELECT COUNT_BIG(*) FROM dbo.sales_intake_windows w WHERE w.intake_id = i.id),
                   ISNULL(i.safety_requirement, N''), ISNULL(i.site_access_requirement, N''),
                   (SELECT COUNT_BIG(*) FROM dbo.sales_intake_skills s WHERE s.intake_id = i.id)
            FROM dbo.sales_intakes i WHERE i.id = @id;
            """, connection, transaction))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken))
                throw new ApiException(StatusCodes.Status404NotFound, "intake_not_found", "The sales intake no longer exists.");
            input = new SiteVisitCore.ReadinessInput(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetString(7), (int)reader.GetInt64(8),
                reader.GetString(9), reader.GetString(10), reader.GetString(11), (int)reader.GetInt64(12),
                (int)reader.GetInt64(13), reader.GetString(14), reader.GetString(15), (int)reader.GetInt64(16));
        }

        var readiness = SiteVisitCore.EvaluateReadiness(input);
        await using (var command = new SqlCommand("""
            UPDATE dbo.sales_intakes
               SET readiness_score = @score, blocker_count = @blockers, warning_count = @warnings
             WHERE id = @id;
            """, connection, transaction))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@score", SqlDbType.TinyInt, (byte)readiness.Score);
            command.Parameters.AddParameter("@blockers", SqlDbType.TinyInt, (byte)readiness.BlockerCount);
            command.Parameters.AddParameter("@warnings", SqlDbType.TinyInt, (byte)readiness.WarningCount);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        return readiness;
    }

    internal static async Task<string> ReadRowVersionAsync(
        SqlConnection connection, SqlTransaction? transaction, long id, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT row_version FROM dbo.sales_intakes WHERE id = @id;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        var value = (byte[])(await command.ExecuteScalarAsync(cancellationToken))!;
        return Convert.ToBase64String(value);
    }

    /* ===================================================================
       Status changes
       =================================================================== */

    private static async Task<IResult> ChangeStatusAsync(
        long id, ChangeStatusRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.RequiredText(request.Status, 50, "Status");
        InputValidation.OptionalText(request.Reason, 4_000, "Reason");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string number;
            string currentStatus;
            long salesOwnerId;
            await using (var current = new SqlCommand("""
                SELECT intake_no, status, sales_owner_id, row_version
                FROM dbo.sales_intakes WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                current.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await current.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                number = reader.GetString(0);
                currentStatus = reader.GetString(1);
                salesOwnerId = reader.GetInt64(2);
                SiteVisitCore.RequireSameVersion(expected, (byte[])reader.GetValue(3));
            }

            var target = request.Status.Trim();
            SiteVisitCore.RequireTransition(SiteVisitCore.IntakeTransitions, currentStatus, target, permissions, request.Reason);

            // Submitting for review is the one transition that also has to pass
            // the readiness gate. Mandatory information missing means no submit —
            // saving a draft stays available.
            var readiness = await RecomputeReadinessAsync(connection, transaction, id, cancellationToken);
            if (target == "Pending Technical Review" && !readiness.CanSubmit)
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "readiness_blocked",
                    "Mandatory information is still missing.",
                    readiness.Checks.Where(check => check is { Severity: "blocker", Passed: false })
                        .Select(check => check.Label).ToArray());

            var markSubmitted = target == "Pending Technical Review";
            await using (var command = new SqlCommand($"""
                UPDATE dbo.sales_intakes
                   SET status = @status,
                       updated_by = @actor,
                       updated_at = SYSUTCDATETIME()
                       {(markSubmitted ? ", submitted_at = ISNULL(submitted_at, SYSUTCDATETIME()), submitted_by = ISNULL(submitted_by, @actor)" : "")}
                 WHERE id = @id;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@status", SqlDbType.NVarChar, target, 50);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }

            await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityIntake, id, number,
                currentStatus, target, request.Reason, actor.Id, cancellationToken);
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityIntake, id, number,
                $"Intake status {currentStatus} to {target}", new { status = currentStatus }, new { status = target },
                request.Reason, cancellationToken);
            await NotifyStatusAsync(connection, transaction, id, number, currentStatus, target, salesOwnerId, actor.Id, cancellationToken);

            var rowVersion = await ReadRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, number, status = target, rowVersion, readiness });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task NotifyStatusAsync(
        SqlConnection connection, SqlTransaction transaction, long id, string number,
        string previous, string next, long salesOwnerId, long actorId, CancellationToken cancellationToken)
    {
        switch (next)
        {
            case "Pending Technical Review":
            {
                var reviewers = await SiteVisitCore.UsersWithPermissionAsync(connection, transaction, SiteVisitCore.PermIntakeReview, cancellationToken);
                await SiteVisitCore.NotifyAsync(connection, transaction, reviewers.Where(userId => userId != actorId),
                    "intake.review_requested", $"{number} is waiting for technical review",
                    "Sales submitted this intake for technical review.", SiteVisitCore.EntityIntake, id,
                    $"intake.review_requested:{SiteVisitCore.EntityIntake}:{id}:{previous}", cancellationToken);
                break;
            }
            case "More Information Required":
                await SiteVisitCore.NotifyAsync(connection, transaction, [salesOwnerId],
                    "intake.returned", $"{number} was returned for more information",
                    "Engineering needs more information before a site visit can be scheduled.",
                    SiteVisitCore.EntityIntake, id, $"intake.returned:{SiteVisitCore.EntityIntake}:{id}:{previous}", cancellationToken);
                break;
            case "Ready to Schedule":
            {
                var schedulers = await SiteVisitCore.UsersWithPermissionAsync(connection, transaction, SiteVisitCore.PermVisitSchedule, cancellationToken);
                await SiteVisitCore.NotifyAsync(connection, transaction, schedulers.Append(salesOwnerId).Where(userId => userId != actorId),
                    "intake.ready_to_schedule", $"{number} is ready to schedule",
                    "Technical review is complete. A site visit can now be requested.",
                    SiteVisitCore.EntityIntake, id, $"intake.ready:{SiteVisitCore.EntityIntake}:{id}", cancellationToken);
                break;
            }
            case "Cancelled":
                await SiteVisitCore.NotifyAsync(connection, transaction, [salesOwnerId],
                    "intake.cancelled", $"{number} was cancelled", "This sales intake was cancelled.",
                    SiteVisitCore.EntityIntake, id, $"intake.cancelled:{SiteVisitCore.EntityIntake}:{id}", cancellationToken);
                break;
        }
    }

    /* ===================================================================
       Technical review
       =================================================================== */

    private static async Task<IResult> SubmitReviewAsync(
        long id, SubmitTechnicalReviewRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeReview, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        InputValidation.OneOf(request.Decision, "Decision",
            "Ready to Schedule", "More Information Required", "On Hold", "Cancelled", "Comment");
        InputValidation.OptionalText(request.Comment, 20_000, "Comment");
        InputValidation.OptionalText(request.VisitScope, 20_000, "Visit scope");
        InputValidation.OptionalText(request.RequiredEquipment, 20_000, "Required equipment");
        InputValidation.OptionalText(request.RiskAssessment, 20_000, "Risk assessment");
        InputValidation.OptionalText(request.SafetyConcern, 20_000, "Safety concern");
        var engineerCount = SiteVisitCore.Clamp(request.EngineerCount <= 0 ? 1 : request.EngineerCount, 1, 20);
        var duration = SiteVisitCore.Clamp(request.EstimatedDurationMinutes <= 0 ? 240 : request.EstimatedDurationMinutes, 15, 10_080);
        if (request.Decision is "More Information Required" or "On Hold" or "Cancelled" && string.IsNullOrWhiteSpace(request.Comment))
            throw Invalid("Say what is missing, so sales knows what to fix.");
        var expected = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var permissions = await SiteVisitCore.LoadPermissionsAsync(connection, actor.Role, cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            string number;
            string currentStatus;
            long salesOwnerId;
            await using (var current = new SqlCommand("""
                SELECT intake_no, status, sales_owner_id, row_version
                FROM dbo.sales_intakes WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                current.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await current.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                number = reader.GetString(0);
                currentStatus = reader.GetString(1);
                salesOwnerId = reader.GetInt64(2);
                SiteVisitCore.RequireSameVersion(expected, (byte[])reader.GetValue(3));
            }

            var moving = request.Decision != "Comment";
            if (moving) SiteVisitCore.RequireTransition(SiteVisitCore.IntakeTransitions, currentStatus, request.Decision, permissions, request.Comment);

            // The coordinator may correct the skill requirement. Sales' original
            // selection stays on the 'Sales' source rows and is never touched.
            if (request.SkillIds is not null)
            {
                await using (var command = new SqlCommand(
                    "DELETE FROM dbo.sales_intake_skills WHERE intake_id = @id AND source = N'Coordinator';", connection, transaction))
                {
                    command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }
                foreach (var skillId in request.SkillIds.Where(value => value > 0).Distinct().Take(20))
                {
                    await using var command = new SqlCommand("""
                        INSERT INTO dbo.sales_intake_skills (intake_id, skill_id, source, created_by)
                        SELECT @id, @skill_id, N'Coordinator', @actor
                        WHERE EXISTS (SELECT 1 FROM dbo.visit_skills WHERE id = @skill_id AND is_active = 1);
                        """, connection, transaction);
                    command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    command.Parameters.AddParameter("@skill_id", SqlDbType.BigInt, skillId);
                    command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }
            }

            var readiness = await RecomputeReadinessAsync(connection, transaction, id, cancellationToken);
            var missing = string.Join("; ", readiness.Checks.Where(check => !check.Passed).Select(check => check.Label));

            long reviewId;
            await using (var command = new SqlCommand("""
                INSERT INTO dbo.sales_intake_reviews (
                    intake_id, reviewer_id, decision, comment, visit_scope, engineer_count,
                    estimated_duration_minutes, required_equipment, risk_assessment, safety_concern,
                    requires_manager_approval, missing_information, readiness_score_at_review)
                OUTPUT inserted.id
                VALUES (@id, @reviewer, @decision, @comment, @visit_scope, @engineer_count,
                    @duration, @equipment, @risk, @safety, @manager, @missing, @readiness);
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@reviewer", SqlDbType.BigInt, actor.Id);
                command.Parameters.AddParameter("@decision", SqlDbType.NVarChar, request.Decision.Trim(), 40);
                command.Parameters.AddParameter("@comment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.Comment, 20_000, "Comment"), -1);
                command.Parameters.AddParameter("@visit_scope", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.VisitScope, 20_000, "Visit scope"), -1);
                command.Parameters.AddParameter("@engineer_count", SqlDbType.TinyInt, (byte)engineerCount);
                command.Parameters.AddParameter("@duration", SqlDbType.Int, duration);
                command.Parameters.AddParameter("@equipment", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.RequiredEquipment, 20_000, "Required equipment"), -1);
                command.Parameters.AddParameter("@risk", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.RiskAssessment, 20_000, "Risk assessment"), -1);
                command.Parameters.AddParameter("@safety", SqlDbType.NVarChar, SiteVisitCore.TrimOrNull(request.SafetyConcern, 20_000, "Safety concern"), -1);
                command.Parameters.AddParameter("@manager", SqlDbType.Bit, request.RequiresManagerApproval);
                command.Parameters.AddParameter("@missing", SqlDbType.NVarChar, missing.Length == 0 ? null : missing, -1);
                command.Parameters.AddParameter("@readiness", SqlDbType.TinyInt, (byte)readiness.Score);
                reviewId = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
            }

            if (moving)
            {
                await using (var command = new SqlCommand("""
                    UPDATE dbo.sales_intakes SET status = @status, updated_by = @actor, updated_at = SYSUTCDATETIME()
                    WHERE id = @id;
                    """, connection, transaction))
                {
                    command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    command.Parameters.AddParameter("@status", SqlDbType.NVarChar, request.Decision.Trim(), 50);
                    command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    await command.ExecuteNonQueryAsync(cancellationToken);
                }
                await SiteVisitCore.RecordStatusAsync(connection, transaction, SiteVisitCore.EntityIntake, id, number,
                    currentStatus, request.Decision, request.Comment, actor.Id, cancellationToken);
                await NotifyStatusAsync(connection, transaction, id, number, currentStatus, request.Decision, salesOwnerId, actor.Id, cancellationToken);
            }

            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityIntake, id, number,
                $"Technical review — {request.Decision}", null,
                new { reviewId, request.Decision, engineerCount, duration, request.RequiresManagerApproval, readiness.Score },
                request.Comment, cancellationToken);

            var rowVersion = await ReadRowVersionAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, number, reviewId, status = moving ? request.Decision : currentStatus, rowVersion, readiness });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Attachments
       =================================================================== */

    private static async Task<IResult> UploadAttachmentAsync(
        long id, HttpRequest httpRequest, SqlConnectionFactory connections, CurrentUserService users,
        ProjectDocumentStorage storage, DocumentStorageOptions storageOptions, IDocumentMalwareScanner scanner,
        ILoggerFactory loggerFactory, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeWrite, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0) return Results.NotFound();
        var upload = await SiteVisitFiles.ReadUploadAsync(httpRequest, storageOptions, cancellationToken);

        string number;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        await using (var command = new SqlCommand(
            "SELECT intake_no FROM dbo.sales_intakes WHERE id=@id AND deleted_at IS NULL AND archived_at IS NULL;", connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            number = await command.ExecuteScalarAsync(cancellationToken) as string ?? "";
        }
        if (number.Length == 0) return Results.NotFound();

        var storageKey = SiteVisitFiles.StorageKey("sales-intakes", id, upload.Extension);
        var stored = false;
        var metadataCommitted = false;
        var commitOutcomeUnknown = false;
        try
        {
            DocumentWriteResult write;
            await using (var source = upload.File.OpenReadStream()) write = await storage.WriteAsync(storageKey, source, cancellationToken);
            stored = true;
            var scan = await scanner.ScanAsync(storageKey, cancellationToken);

            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                IntakeAttachmentRecord result;
                await using (var insert = new SqlCommand("""
                    DECLARE @created TABLE (id bigint NOT NULL, version int NOT NULL, uploaded_at datetimeoffset(0) NOT NULL, row_version binary(8) NOT NULL);
                    DECLARE @next int = (
                        SELECT ISNULL(MAX(version), 0) + 1 FROM dbo.sales_intake_attachments WITH (UPDLOCK, HOLDLOCK)
                        WHERE intake_id = @id AND name = @name);
                    INSERT INTO dbo.sales_intake_attachments
                        (intake_id, name, category, description, version, content_type, size_bytes, storage_key, sha256, scan_status, uploaded_by)
                    OUTPUT inserted.id, inserted.version, inserted.uploaded_at, inserted.row_version
                    INTO @created(id, version, uploaded_at, row_version)
                    VALUES (@id, @name, @category, @description, @next, @content_type, @size_bytes, @storage_key, @sha256, @scan_status, @actor);
                    SELECT id, version, uploaded_at, row_version FROM @created;
                    """, connection, transaction))
                {
                    insert.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    insert.Parameters.AddParameter("@name", SqlDbType.NVarChar, upload.FileName, 500);
                    insert.Parameters.AddParameter("@category", SqlDbType.NVarChar, upload.Category, 100);
                    insert.Parameters.AddParameter("@description", SqlDbType.NVarChar, upload.Description, 1000);
                    insert.Parameters.AddParameter("@content_type", SqlDbType.NVarChar, upload.ContentType, 200);
                    insert.Parameters.AddParameter("@size_bytes", SqlDbType.BigInt, write.SizeBytes);
                    insert.Parameters.AddParameter("@storage_key", SqlDbType.NVarChar, storageKey, 1000);
                    insert.Parameters.AddParameter("@sha256", SqlDbType.Char, write.Sha256, 64);
                    insert.Parameters.AddParameter("@scan_status", SqlDbType.NVarChar, scan.Status, 20);
                    insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                    await reader.ReadAsync(cancellationToken);
                    result = new IntakeAttachmentRecord(reader.GetInt64(0), upload.FileName, upload.Category, upload.Description,
                        reader.GetInt32(1), upload.ContentType, write.SizeBytes, scan.Status, actor.Name,
                        reader.GetFieldValue<DateTimeOffset>(2), reader.RowVersionString(3));
                }
                await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityIntake, id, number,
                    "Attachment uploaded", null,
                    new { result.Id, result.Name, result.Category, result.SizeBytes, sha256 = write.Sha256, scan = scan.Status },
                    null, cancellationToken);
                await RecomputeReadinessAsync(connection, transaction, id, cancellationToken);
                commitOutcomeUnknown = true;
                await transaction.CommitAsync(cancellationToken);
                metadataCommitted = true;
                commitOutcomeUnknown = false;
                return Results.Created($"/api/v1/sales-intakes/{id}/attachments/{result.Id}/content", result);
            }
            catch (Exception exception)
            {
                if (!commitOutcomeUnknown && !metadataCommitted && transaction.Connection is not null)
                    await transaction.RollbackAsync(CancellationToken.None);
                // An unknown commit outcome keeps the file. Deleting bytes we
                // cannot prove are unreferenced is the worse mistake.
                if (commitOutcomeUnknown)
                    loggerFactory.CreateLogger("SalesIntakeAttachmentStorage").LogCritical(exception,
                        "Sales intake attachment commit outcome is unknown; preserving storage key {StorageKey} for intake {IntakeId}",
                        storageKey, id);
                throw;
            }
        }
        catch
        {
            if (stored && !metadataCommitted && !commitOutcomeUnknown) await storage.DeleteIfExistsAsync(storageKey);
            throw;
        }
    }

    private static async Task<IResult> DownloadAttachmentAsync(
        long id, long attachmentId, HttpRequest request, SqlConnectionFactory connections, CurrentUserService users,
        ProjectDocumentStorage storage, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeRead, cancellationToken);
        if (HttpMethods.IsHead(request.Method)) return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
        if (id <= 0 || attachmentId <= 0) return Results.NotFound();

        string fileName, contentType, storageKey, sha256;
        long sizeBytes;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        await using (var command = new SqlCommand("""
            SELECT name, content_type, storage_key, size_bytes, sha256
            FROM dbo.sales_intake_attachments
            WHERE id = @attachment_id AND intake_id = @id AND deleted_at IS NULL;
            """, connection))
        {
            command.Parameters.AddParameter("@attachment_id", SqlDbType.BigInt, attachmentId);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            fileName = reader.GetString(0);
            contentType = reader.GetString(1);
            storageKey = reader.GetString(2);
            sizeBytes = reader.GetInt64(3);
            sha256 = reader.GetString(4);
        }

        var stream = storage.OpenRead(storageKey);
        try
        {
            await storage.VerifyIntegrityAndRewindAsync(stream, sizeBytes, sha256, cancellationToken);
            return Results.File(stream, contentType, fileName, enableRangeProcessing: false);
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
    }

    private static async Task<IResult> DeleteAttachmentAsync(
        long id, long attachmentId, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeWrite, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (id <= 0 || attachmentId <= 0) return Results.NotFound();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            string number;
            string name;
            await using (var command = new SqlCommand("""
                SELECT i.intake_no, a.name
                FROM dbo.sales_intake_attachments a
                INNER JOIN dbo.sales_intakes i ON i.id = a.intake_id
                WHERE a.id = @attachment_id AND a.intake_id = @id AND a.deleted_at IS NULL AND i.deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@attachment_id", SqlDbType.BigInt, attachmentId);
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                number = reader.GetString(0);
                name = reader.GetString(1);
            }

            // Soft delete. The bytes stay on the document store so the audit
            // trail still refers to something that exists.
            await using (var command = new SqlCommand("""
                UPDATE dbo.sales_intake_attachments
                   SET deleted_at = SYSUTCDATETIME(), deleted_by = @actor
                 WHERE id = @attachment_id AND intake_id = @id AND deleted_at IS NULL;
                """, connection, transaction))
            {
                command.Parameters.AddParameter("@attachment_id", SqlDbType.BigInt, attachmentId);
                command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await command.ExecuteNonQueryAsync(cancellationToken);
            }
            await SiteVisitCore.AuditAsync(connection, transaction, actor.Id, SiteVisitCore.EntityIntake, id, number,
                "Attachment archived", new { attachmentId, name }, null, null, cancellationToken);
            var readiness = await RecomputeReadinessAsync(connection, transaction, id, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, attachmentId, readiness });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /* ===================================================================
       Sales dashboard
       =================================================================== */

    private static async Task<IResult> DashboardAsync(
        SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync(SiteVisitCore.PermIntakeRead, cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);

        long intakes = 0, pendingReview = 0, moreInfo = 0, waitingCustomer = 0,
            upcoming = 0, completed = 0, waitingReport = 0, toInquiry = 0, toEstimate = 0;
        await using (var command = new SqlCommand("""
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL AND (sales_owner_id = @actor OR created_by = @actor)),
                (SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL AND status = N'Pending Technical Review'),
                (SELECT COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL AND status = N'More Information Required'),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status = N'Pending Customer Confirmation'),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN (N'Confirmed', N'Tentative', N'Pending Engineer Confirmation')
                    AND scheduled_start >= SYSUTCDATETIME()),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status IN (N'Completed', N'Closed')),
                (SELECT COUNT_BIG(*) FROM dbo.site_visits WHERE deleted_at IS NULL AND status = N'Report Pending'),
                (SELECT COUNT_BIG(*) FROM dbo.site_visit_links WHERE target_type = N'Inquiry'),
                (SELECT COUNT_BIG(*) FROM dbo.site_visit_links WHERE target_type = N'Estimate');
            """, connection))
        {
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            await reader.ReadAsync(cancellationToken);
            intakes = reader.GetInt64(0); pendingReview = reader.GetInt64(1); moreInfo = reader.GetInt64(2);
            waitingCustomer = reader.GetInt64(3); upcoming = reader.GetInt64(4); completed = reader.GetInt64(5);
            waitingReport = reader.GetInt64(6); toInquiry = reader.GetInt64(7); toEstimate = reader.GetInt64(8);
        }

        var byStatus = new List<CountByLabel>();
        await using (var command = new SqlCommand("""
            SELECT status, COUNT_BIG(*) FROM dbo.sales_intakes WHERE deleted_at IS NULL GROUP BY status ORDER BY status;
            """, connection))
        {
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) byStatus.Add(new CountByLabel(reader.GetString(0), reader.GetInt64(1)));
        }

        var attention = new List<SalesIntakeSummary>();
        await using (var command = new SqlCommand("""
            SELECT TOP (12)
                i.id, i.intake_no, i.status, i.customer_id, c.name, i.site_name, i.subject,
                i.request_date, i.sales_owner_id, so.name, i.priority, i.required_response_date,
                i.readiness_score, i.blocker_count, i.warning_count,
                (SELECT COUNT_BIG(*) FROM dbo.sales_intake_purposes p WHERE p.intake_id = i.id),
                (SELECT COUNT_BIG(*) FROM dbo.sales_intake_attachments a WHERE a.intake_id = i.id AND a.deleted_at IS NULL),
                CAST(NULL AS bigint), CAST(NULL AS nvarchar(30)), CAST(NULL AS nvarchar(50)), CAST(NULL AS datetimeoffset(0)),
                i.updated_at, CAST(0 AS bigint), i.row_version, i.archived_at
            FROM dbo.sales_intakes i
            INNER JOIN dbo.customers c ON c.id = i.customer_id
            INNER JOIN dbo.users so ON so.id = i.sales_owner_id
            WHERE i.deleted_at IS NULL AND i.archived_at IS NULL
              AND (i.sales_owner_id = @actor OR i.created_by = @actor)
              AND (i.status IN (N'Draft', N'More Information Required')
                   OR (i.status = N'Pending Technical Review' AND i.required_response_date < CONVERT(date, SYSUTCDATETIME())))
            ORDER BY CASE i.priority WHEN N'Urgent' THEN 0 WHEN N'High' THEN 1 WHEN N'Normal' THEN 2 ELSE 3 END,
                     i.required_response_date, i.updated_at DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken)) attention.Add(ReadSummary(reader));
        }

        return Results.Ok(new SalesVisitDashboard(intakes, pendingReview, moreInfo, waitingCustomer, upcoming,
            completed, waitingReport, toInquiry, toEstimate, byStatus, attention));
    }
}
