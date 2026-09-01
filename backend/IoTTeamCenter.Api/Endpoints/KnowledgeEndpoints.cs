using System.Data;
using System.Globalization;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

/// <summary>
/// Knowledge and Document Hub.
///
/// Two rules shape everything here. First, entitlement is decided in SQL, in the
/// same statement that reads the row, so a document the caller may not see never
/// reaches the response — not its title, not its number, not its existence.
/// Second, the workflow guarantees that matter are enforced by the schema
/// (migration 014): one published revision per document is a filtered unique
/// index, published revisions are immutable by trigger, and audit rows are
/// append-only. This file must still get them right, but it is not the only
/// thing standing between the data and a bug.
/// </summary>
public static class KnowledgeEndpoints
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".png", ".jpg", ".jpeg"
    };

    private static readonly Dictionary<string, string[]> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".pdf"] = ["application/pdf"],
        [".doc"] = ["application/msword", "application/octet-stream"],
        [".docx"] = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
        [".xls"] = ["application/vnd.ms-excel", "application/octet-stream"],
        [".xlsx"] = ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
        [".ppt"] = ["application/vnd.ms-powerpoint", "application/octet-stream"],
        [".pptx"] = ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/octet-stream"],
        [".txt"] = ["text/plain", "application/octet-stream"],
        [".csv"] = ["text/csv", "application/vnd.ms-excel", "application/octet-stream"],
        [".png"] = ["image/png"],
        [".jpg"] = ["image/jpeg", "image/jpg"],
        [".jpeg"] = ["image/jpeg", "image/jpg"]
    };

    private static readonly string[] DocumentTypes =
    [
        "Controlled Document", "Working Document", "Knowledge Article", "Presentation",
        "Template", "Project Document", "Supplier Document", "External Reference"
    ];

    private static readonly string[] Confidentialities =
    [
        "Company", "Department Only", "Project Team Only", "Management Only", "Confidential", "Restricted"
    ];

    private static readonly string[] ArticleTypes =
    [
        "How-to", "Troubleshooting", "FAQ", "Technical Note", "Best Practice",
        "Design Guideline", "Lessons Learned", "Root Cause Analysis", "Training Note"
    ];

    private static readonly string[] RelationEntityTypes =
    [
        "Inquiry", "Project", "Estimate", "BOM", "PR", "PO", "GoodsReceipt",
        "MaterialIssue", "ItemMaster", "Supplier", "KnowledgeArticle", "Customer"
    ];

    /// <summary>
    /// The entitlement predicate, reused by every read. The caller must supply
    /// @me, @my_department and @can_manage through <see cref="AddVisibilityParameters"/>.
    /// </summary>
    private const string VisibilityPredicate = """
        (
            d.owner_id = @me
            OR @can_manage = 1
            OR d.confidentiality = N'Company'
            OR (d.confidentiality = N'Department Only' AND d.department_code = @my_department AND LEN(d.department_code) > 0)
            OR (d.confidentiality = N'Project Team Only' AND EXISTS (
                SELECT 1
                FROM dbo.knowledge_document_relations kr
                INNER JOIN dbo.projects project ON project.id = kr.entity_id AND kr.entity_type = N'Project'
                WHERE kr.document_id = d.id AND (project.manager_id = @me OR project.lead_engineer_id = @me
                    OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = project.id AND pm.user_id = @me))
            ))
            OR EXISTS (
                SELECT 1
                FROM dbo.knowledge_document_permissions kp
                LEFT JOIN dbo.users pu ON pu.id = @me
                WHERE (kp.document_id = d.id OR kp.category_id = d.category_id)
                  AND (
                        (kp.subject_type = N'User' AND kp.subject_user_id = @me)
                     OR (kp.subject_type = N'Role' AND kp.subject_role_id = pu.role_id)
                     OR (kp.subject_type = N'Department' AND kp.subject_department_code = @my_department)
                     OR (kp.subject_type = N'Project' AND EXISTS (
                         SELECT 1 FROM dbo.projects project
                         WHERE project.id = kp.subject_project_id
                           AND (project.manager_id = @me OR project.lead_engineer_id = @me
                             OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = project.id AND pm.user_id = @me))))
                  )
            )
        )
        """;

    private const string ArticleVisibilityPredicate = """
        (
            a.owner_id = @me
            OR @can_manage = 1
            OR a.confidentiality = N'Company'
            OR (a.confidentiality = N'Department Only' AND ao.department = @my_department AND LEN(ao.department) > 0)
            OR EXISTS (
                SELECT 1
                FROM dbo.knowledge_document_permissions kp
                LEFT JOIN dbo.users pu ON pu.id = @me
                WHERE (kp.article_id = a.id OR kp.category_id = a.category_id)
                  AND (
                        (kp.subject_type = N'User' AND kp.subject_user_id = @me)
                     OR (kp.subject_type = N'Role' AND kp.subject_role_id = pu.role_id)
                     OR (kp.subject_type = N'Department' AND kp.subject_department_code = @my_department)
                     OR (kp.subject_type = N'Project' AND EXISTS (
                         SELECT 1 FROM dbo.projects project
                         WHERE project.id = kp.subject_project_id
                           AND (project.manager_id = @me OR project.lead_engineer_id = @me
                             OR EXISTS (SELECT 1 FROM dbo.project_members pm WHERE pm.project_id = project.id AND pm.user_id = @me))))
                  )
            )
        )
        """;

    public static void MapKnowledgeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/knowledge");

        group.MapGet("/dashboard", DashboardAsync);
        group.MapGet("/categories", ListCategoriesAsync);
        group.MapPost("/categories", CreateCategoryAsync);
        group.MapPut("/categories/{id:long}", UpdateCategoryAsync);
        group.MapGet("/number-sequences", ListNumberSequencesAsync);
        group.MapPost("/number-sequences", CreateNumberSequenceAsync);
        group.MapPut("/number-sequences/{id:long}", UpdateNumberSequenceAsync);
        group.MapGet("/documents", ListDocumentsAsync);
        group.MapGet("/documents/{id:long}", GetDocumentAsync);
        group.MapPost("/documents", CreateDocumentAsync).DisableAntiforgery();
        group.MapPost("/documents/{id:long}/versions", UploadVersionAsync).DisableAntiforgery();
        group.MapGet("/versions/{versionId:long}/content", DownloadVersionAsync);
        group.MapPost("/versions/{versionId:long}/submit", SubmitForReviewAsync);
        group.MapPost("/versions/{versionId:long}/decide", DecideAsync);
        group.MapPost("/versions/{versionId:long}/publish", PublishAsync);
        group.MapPost("/documents/{id:long}/working-status", SetWorkingStatusAsync);
        group.MapPost("/documents/{id:long}/archive", ArchiveDocumentAsync);
        group.MapPost("/documents/{id:long}/restore", RestoreDocumentAsync);
        group.MapGet("/documents/{id:long}/comments", ListDocumentCommentsAsync);
        group.MapPost("/documents/{id:long}/comments", CreateDocumentCommentAsync);
        group.MapPost("/comments/{commentId:long}/resolution", SetCommentResolutionAsync);
        group.MapGet("/documents/{id:long}/permissions", ListDocumentPermissionsAsync);
        group.MapPost("/documents/{id:long}/permissions", GrantDocumentPermissionAsync);
        group.MapDelete("/documents/{id:long}/permissions/{permissionId:long}", RevokeDocumentPermissionAsync);
        group.MapPost("/documents/{id:long}/relations", LinkAsync);
        group.MapDelete("/documents/{id:long}/relations/{relationId:long}", UnlinkAsync);
        group.MapGet("/related", ListRelatedAsync);
        group.MapPost("/versions/{versionId:long}/acknowledgements", AssignAcknowledgementAsync);
        group.MapPost("/acknowledgements/{acknowledgementId:long}/acknowledge", AcknowledgeAsync);
        group.MapGet("/me/acknowledgements", MyAcknowledgementsAsync);
        group.MapGet("/documents/{id:long}/audit", DocumentAuditAsync);
        group.MapGet("/articles", ListArticlesAsync);
        group.MapGet("/articles/{id:long}", GetArticleAsync);
        group.MapPost("/articles", CreateArticleAsync);
        group.MapPut("/articles/{id:long}", UpdateArticleAsync);
        group.MapPost("/articles/{id:long}/feedback", ArticleFeedbackAsync);
    }

    // -----------------------------------------------------------------
    // Categories
    // -----------------------------------------------------------------
    private static async Task<IResult> DashboardAsync(
        SqlConnectionFactory connections, CurrentUserService users, BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            WITH visible AS (
                SELECT d.id, d.current_status, d.document_type, d.owner_id, d.next_review_date, v.expiry_date
                FROM dbo.knowledge_documents d
                LEFT JOIN dbo.knowledge_document_versions v ON v.id = d.current_version_id
                WHERE d.archived_at IS NULL AND {VisibilityPredicate}
            )
            SELECT
                COUNT_BIG(*),
                COALESCE(SUM(CASE WHEN current_status = N'Published' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN current_status IN (N'In Review', N'Pending Approval', N'Request Changes') THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN expiry_date < @today THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN next_review_date IS NOT NULL AND next_review_date <= DATEADD(day, 90, @today) THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN owner_id = @me AND current_status = N'Draft' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN document_type = N'Presentation' THEN 1 ELSE 0 END), 0),
                (SELECT COUNT_BIG(*) FROM dbo.knowledge_document_approvals a
                 WHERE a.approver_id = @me AND a.status = N'Pending' AND a.step_type = N'Review'),
                (SELECT COUNT_BIG(*) FROM dbo.knowledge_document_approvals a
                 WHERE a.approver_id = @me AND a.status = N'Pending' AND a.step_type = N'Approve'),
                (SELECT COUNT_BIG(*) FROM dbo.knowledge_document_acknowledgements a
                 WHERE a.user_id = @me AND a.status = N'Pending'),
                (SELECT COUNT_BIG(*) FROM dbo.knowledge_articles a
                 INNER JOIN dbo.users ao ON ao.id = a.owner_id
                 WHERE a.archived_at IS NULL AND {ArticleVisibilityPredicate})
            FROM visible;
            """, connection);
        AddVisibilityParameters(command, actor, canManage);
        command.Parameters.AddParameter("@today", SqlDbType.Date, clock.Today);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        await reader.ReadAsync(cancellationToken);
        long CountAt(int ordinal) => Convert.ToInt64(reader.GetValue(ordinal), CultureInfo.InvariantCulture);
        return Results.Ok(new { totalDocuments = CountAt(0), published = CountAt(1),
            inWorkflow = CountAt(2), expired = CountAt(3), reviewDueWithin90Days = CountAt(4),
            myDrafts = CountAt(5), presentations = CountAt(6), assignedReviews = CountAt(7),
            assignedApprovals = CountAt(8), acknowledgementsRequired = CountAt(9), articles = CountAt(10) });
    }

    private static async Task<IResult> ListCategoriesAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var includeInactive = string.Equals(request.Query["includeInactive"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        if (includeInactive) await users.DemandPermissionAsync("knowledge.manage_categories", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT c.id, c.parent_id, c.code, c.name_en, c.name_th, c.name_ja,
                   c.default_document_type, c.default_confidentiality, c.sort_order, c.is_active,
                   (SELECT COUNT_BIG(*) FROM dbo.knowledge_documents d
                     WHERE d.category_id = c.id AND d.archived_at IS NULL) AS document_count
            FROM dbo.knowledge_categories c
            WHERE (@include_inactive = 1 OR c.is_active = 1)
            ORDER BY c.sort_order, c.name_en;
            """, connection);
        command.Parameters.AddParameter("@include_inactive", SqlDbType.Bit, includeInactive);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new
            {
                id = reader.GetInt64(0),
                parentId = reader.IsDBNull(1) ? null : (long?)reader.GetInt64(1),
                code = reader.GetString(2),
                nameEn = reader.GetString(3),
                nameTh = reader.GetString(4),
                nameJa = reader.GetString(5),
                defaultDocumentType = reader.IsDBNull(6) ? null : reader.GetString(6),
                defaultConfidentiality = reader.GetString(7),
                sortOrder = reader.GetInt32(8),
                isActive = reader.GetBoolean(9),
                documentCount = reader.GetInt64(10)
            });
        }
        return Results.Ok(new { items });
    }

    private static async Task<IResult> CreateCategoryAsync(
        CategoryRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_categories", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var value = ValidateCategory(body);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            IF @parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.knowledge_categories WHERE id = @parent_id)
                THROW 51180, 'Parent category was not found.', 1;
            IF EXISTS (SELECT 1 FROM dbo.knowledge_categories WHERE code = @code)
                THROW 51181, 'Category code already exists.', 1;
            INSERT INTO dbo.knowledge_categories(
                parent_id, code, name_en, name_th, name_ja, default_document_type,
                default_confidentiality, sort_order, is_active, created_by, updated_by)
            OUTPUT inserted.id
            VALUES (@parent_id, @code, @name_en, @name_th, @name_ja, @document_type,
                    @confidentiality, @sort_order, @active, @actor, @actor);
            """, connection);
        AddCategoryParameters(command, value, actor.Id);
        var id = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
        return Results.Created($"/api/v1/knowledge/categories/{id}", new { id });
    }

    private static async Task<IResult> UpdateCategoryAsync(
        long id,
        CategoryRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_categories", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var value = ValidateCategory(body);
        if (value.ParentId == id) throw Invalid("A category cannot be its own parent.");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            IF @parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM dbo.knowledge_categories WHERE id = @parent_id)
                THROW 51180, 'Parent category was not found.', 1;
            IF EXISTS (SELECT 1 FROM dbo.knowledge_categories WHERE code = @code AND id <> @id)
                THROW 51181, 'Category code already exists.', 1;
            UPDATE dbo.knowledge_categories
               SET parent_id = @parent_id, code = @code, name_en = @name_en, name_th = @name_th,
                   name_ja = @name_ja, default_document_type = @document_type,
                   default_confidentiality = @confidentiality, sort_order = @sort_order,
                   is_active = @active, updated_by = @actor, updated_at = SYSUTCDATETIME()
             WHERE id = @id;
            SELECT @@ROWCOUNT;
            """, connection);
        AddCategoryParameters(command, value, actor.Id);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) != 1)
            return Results.NotFound();
        return Results.Ok(new { id });
    }

    private static async Task<IResult> ListNumberSequencesAsync(
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_categories", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT id, prefix, scope_code, scope_name, last_number, padding, is_active, updated_at
            FROM dbo.knowledge_number_sequences ORDER BY prefix, scope_code;
            """, connection);
        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new { id = reader.GetInt64(0), prefix = reader.GetString(1), scopeCode = reader.GetString(2),
                scopeName = reader.GetString(3), lastNumber = reader.GetInt32(4), padding = reader.GetByte(5),
                isActive = reader.GetBoolean(6), updatedAt = reader.GetDateTimeOffset(7) });
        return Results.Ok(new { items });
    }

    private static async Task<IResult> CreateNumberSequenceAsync(
        NumberSequenceRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_categories", cancellationToken);
        var value = ValidateNumberSequence(body);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            IF EXISTS (SELECT 1 FROM dbo.knowledge_number_sequences WHERE prefix = @prefix AND scope_code = @scope)
                THROW 51182, 'This numbering sequence already exists.', 1;
            INSERT INTO dbo.knowledge_number_sequences(prefix, scope_code, scope_name, last_number, padding, is_active)
            OUTPUT inserted.id
            VALUES (@prefix, @scope, @name, @last, @padding, @active);
            """, connection);
        AddNumberSequenceParameters(command, value);
        var id = (long)(await command.ExecuteScalarAsync(cancellationToken))!;
        return Results.Created($"/api/v1/knowledge/number-sequences/{id}", new { id });
    }

    private static async Task<IResult> UpdateNumberSequenceAsync(
        long id,
        NumberSequenceRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_categories", cancellationToken);
        var value = ValidateNumberSequence(body);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            UPDATE dbo.knowledge_number_sequences
               SET scope_name = @name,
                   last_number = CASE WHEN @last >= last_number THEN @last ELSE last_number END,
                   padding = @padding, is_active = @active, updated_at = SYSUTCDATETIME()
             WHERE id = @id AND prefix = @prefix AND scope_code = @scope;
            SELECT @@ROWCOUNT;
            """, connection);
        AddNumberSequenceParameters(command, value);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) != 1)
            return Results.NotFound();
        return Results.Ok(new { id });
    }

    // -----------------------------------------------------------------
    // Document register
    // -----------------------------------------------------------------
    private static async Task<IResult> ListDocumentsAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);

        var search = (request.Query["search"].FirstOrDefault() ?? string.Empty).Trim();
        InputValidation.OptionalText(search, 200, "Search");
        var documentType = (request.Query["documentType"].FirstOrDefault() ?? string.Empty).Trim();
        if (documentType.Length > 0 && !DocumentTypes.Contains(documentType, StringComparer.Ordinal))
            throw Invalid("Document type is not an allowed value.");
        var status = (request.Query["status"].FirstOrDefault() ?? string.Empty).Trim();
        InputValidation.OptionalText(status, 30, "Status");
        var department = (request.Query["department"].FirstOrDefault() ?? string.Empty).Trim();
        InputValidation.OptionalText(department, 200, "Department");
        var confidentiality = (request.Query["confidentiality"].FirstOrDefault() ?? string.Empty).Trim();
        if (confidentiality.Length > 0 && !Confidentialities.Contains(confidentiality, StringComparer.Ordinal))
            throw Invalid("Confidentiality is not an allowed value.");
        var language = (request.Query["language"].FirstOrDefault() ?? string.Empty).Trim().ToUpperInvariant();
        if (language.Length > 0 && language is not ("EN" or "TH" or "JA")) throw Invalid("Language must be EN, TH or JA.");
        var categoryId = ParseOptionalId(request.Query["categoryId"], "Category");
        var ownerId = ParseOptionalId(request.Query["ownerId"], "Owner");
        var reviewDue = string.Equals(request.Query["reviewDue"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        var includeArchived = string.Equals(request.Query["includeArchived"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        var workspace = string.Equals(request.Query["workspace"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        var page = int.TryParse(request.Query["page"], out var parsedPage) ? Math.Max(1, parsedPage) : 1;
        var pageSize = int.TryParse(request.Query["pageSize"], out var parsedPageSize) ? Math.Clamp(parsedPageSize, 1, 100) : 25;

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            WITH visible AS (
                SELECT d.id, d.document_no, d.title, d.document_type, d.category_id, c.name_en AS category_name,
                       d.department_code, d.owner_id, o.name AS owner_name, d.confidentiality,
                       d.current_status, d.language, d.tags, d.next_review_date, d.updated_at, d.archived_at,
                       v.revision AS current_revision, v.effective_date, v.expiry_date, v.id AS current_version_id,
                       (SELECT COUNT_BIG(*) FROM dbo.knowledge_document_acknowledgements a
                         WHERE a.document_version_id = v.id) AS ack_total,
                       (SELECT COUNT_BIG(*) FROM dbo.knowledge_document_acknowledgements a
                         WHERE a.document_version_id = v.id AND a.status = N'Acknowledged') AS ack_done,
                       d.description AS search_description
                FROM dbo.knowledge_documents d
                INNER JOIN dbo.knowledge_categories c ON c.id = d.category_id
                INNER JOIN dbo.users o ON o.id = d.owner_id
                LEFT JOIN dbo.knowledge_document_versions v ON v.id = d.current_version_id
                WHERE {VisibilityPredicate}
            )
            SELECT *,
                   CASE
                       WHEN archived_at IS NOT NULL THEN N'Archived'
                       WHEN expiry_date IS NOT NULL AND expiry_date < @today THEN N'Expired'
                       WHEN current_status = N'Published' AND next_review_date IS NOT NULL AND next_review_date <= @today THEN N'Review Due'
                       ELSE current_status
                   END AS display_status,
                   COUNT_BIG(*) OVER() AS total_count
            FROM visible
            WHERE (@include_archived = 1 OR archived_at IS NULL)
              AND (@document_type = N'' OR document_type = @document_type)
              AND (@workspace = 0 OR document_type IN (N'Working Document', N'Project Document', N'Supplier Document'))
              AND (@status = N''
                   OR (@status = N'Expired' AND expiry_date IS NOT NULL AND expiry_date < @today)
                   OR (@status = N'Review Due' AND current_status = N'Published'
                       AND next_review_date IS NOT NULL AND next_review_date <= @today)
                   OR current_status = @status)
              AND (@department = N'' OR department_code = @department)
              AND (@confidentiality = N'' OR confidentiality = @confidentiality)
              AND (@language = N'' OR language = @language)
              AND (@category_id IS NULL OR category_id = @category_id)
              AND (@owner_id IS NULL OR owner_id = @owner_id)
              AND (@review_due = 0 OR (next_review_date IS NOT NULL AND next_review_date <= @today))
              AND (@search = N'' OR document_no LIKE N'%' + @search + N'%'
                   OR title LIKE N'%' + @search + N'%'
                   OR tags LIKE N'%' + @search + N'%'
                   OR owner_name LIKE N'%' + @search + N'%'
                   OR category_name LIKE N'%' + @search + N'%'
                   OR search_description LIKE N'%' + @search + N'%'
                   OR EXISTS (
                       SELECT 1
                       FROM dbo.knowledge_document_versions sv
                       LEFT JOIN dbo.knowledge_document_files sf ON sf.id = sv.file_id
                       WHERE sv.document_id = visible.id
                         AND (sf.original_file_name LIKE N'%' + @search + N'%'
                              OR sv.extracted_text LIKE N'%' + @search + N'%')))
            ORDER BY updated_at DESC, id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        AddVisibilityParameters(command, actor, canManage);
        command.Parameters.AddParameter("@today", SqlDbType.Date, clock.Today);
        command.Parameters.AddParameter("@document_type", SqlDbType.NVarChar, documentType, 30);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@department", SqlDbType.NVarChar, department, 200);
        command.Parameters.AddParameter("@confidentiality", SqlDbType.NVarChar, confidentiality, 30);
        command.Parameters.AddParameter("@language", SqlDbType.Char, language, 2);
        command.Parameters.AddParameter("@category_id", SqlDbType.BigInt, categoryId);
        command.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
        command.Parameters.AddParameter("@review_due", SqlDbType.Bit, reviewDue);
        command.Parameters.AddParameter("@include_archived", SqlDbType.Bit, includeArchived);
        command.Parameters.AddParameter("@workspace", SqlDbType.Bit, workspace);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, search, 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<object>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(reader.GetOrdinal("total_count"));
            items.Add(new
            {
                id = reader.GetInt64(0),
                documentNumber = reader.GetString(1),
                title = reader.GetString(2),
                documentType = reader.GetString(3),
                categoryId = reader.GetInt64(4),
                categoryName = reader.GetString(5),
                department = reader.GetString(6),
                ownerId = reader.GetInt64(7),
                ownerName = reader.GetString(8),
                confidentiality = reader.GetString(9),
                status = reader.GetString(reader.GetOrdinal("display_status")),
                workflowStatus = reader.GetString(10),
                language = reader.GetString(11),
                tags = reader.GetString(12),
                nextReviewDate = reader.IsDBNull(13) ? null : reader.GetDateTime(13).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                updatedAt = reader.GetDateTimeOffset(14),
                archivedAt = reader.IsDBNull(15) ? null : (DateTimeOffset?)reader.GetDateTimeOffset(15),
                currentRevision = reader.IsDBNull(16) ? null : reader.GetString(16),
                effectiveDate = reader.IsDBNull(17) ? null : reader.GetDateTime(17).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                expiryDate = reader.IsDBNull(18) ? null : reader.GetDateTime(18).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                currentVersionId = reader.IsDBNull(19) ? null : (long?)reader.GetInt64(19),
                acknowledgementTotal = reader.GetInt64(20),
                acknowledgementDone = reader.GetInt64(21)
            });
        }
        return Results.Ok(new { items, page, pageSize, total });
    }

    private static async Task<IResult> GetDocumentAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);

        object header;
        await using (var command = new SqlCommand($"""
            SELECT d.id, d.document_no, d.title, d.description, d.document_type, d.category_id, c.name_en,
                   d.department_code, d.owner_id, o.name, d.confidentiality, d.current_status, d.language,
                   d.tags, d.next_review_date, d.current_version_id, d.created_at, d.updated_at,
                   d.archived_at, d.row_version
            FROM dbo.knowledge_documents d
            INNER JOIN dbo.knowledge_categories c ON c.id = d.category_id
            INNER JOIN dbo.users o ON o.id = d.owner_id
            WHERE d.id = @id AND {VisibilityPredicate};
            """, connection))
        {
            AddVisibilityParameters(command, actor, canManage);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            // A document the caller may not see is reported as missing, never as
            // forbidden: a 403 on a title is itself a disclosure.
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            header = new
            {
                id = reader.GetInt64(0),
                documentNumber = reader.GetString(1),
                title = reader.GetString(2),
                description = reader.GetString(3),
                documentType = reader.GetString(4),
                categoryId = reader.GetInt64(5),
                categoryName = reader.GetString(6),
                department = reader.GetString(7),
                ownerId = reader.GetInt64(8),
                ownerName = reader.GetString(9),
                confidentiality = reader.GetString(10),
                status = reader.GetString(11),
                workflowStatus = reader.GetString(11),
                language = reader.GetString(12),
                tags = reader.GetString(13),
                nextReviewDate = reader.IsDBNull(14) ? null : reader.GetDateTime(14).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                currentVersionId = reader.IsDBNull(15) ? null : (long?)reader.GetInt64(15),
                createdAt = reader.GetDateTimeOffset(16),
                updatedAt = reader.GetDateTimeOffset(17),
                archivedAt = reader.IsDBNull(18) ? null : (DateTimeOffset?)reader.GetDateTimeOffset(18),
                rowVersion = Convert.ToBase64String((byte[])reader.GetValue(19))
            };
        }

        var versions = new List<object>();
        await using (var command = new SqlCommand("""
            SELECT v.id, v.revision, v.version_number, v.status, v.change_type, v.change_summary,
                   v.effective_date, v.expiry_date, v.created_at, cu.name,
                   v.approved_at, au.name, v.published_at, pu.name,
                   f.original_file_name, f.mime_type, f.size_bytes, v.superseded_by_version_id
            FROM dbo.knowledge_document_versions v
            INNER JOIN dbo.users cu ON cu.id = v.created_by
            LEFT JOIN dbo.users au ON au.id = v.approved_by
            LEFT JOIN dbo.users pu ON pu.id = v.published_by
            LEFT JOIN dbo.knowledge_document_files f ON f.id = v.file_id
            WHERE v.document_id = @id
            ORDER BY v.version_number DESC;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                versions.Add(new
                {
                    id = reader.GetInt64(0),
                    revision = reader.GetString(1),
                    versionNumber = reader.GetInt32(2),
                    status = reader.GetString(3),
                    changeType = reader.GetString(4),
                    changeSummary = reader.GetString(5),
                    effectiveDate = reader.IsDBNull(6) ? null : reader.GetDateTime(6).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    expiryDate = reader.IsDBNull(7) ? null : reader.GetDateTime(7).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    createdAt = reader.GetDateTimeOffset(8),
                    createdByName = reader.GetString(9),
                    approvedAt = reader.IsDBNull(10) ? null : (DateTimeOffset?)reader.GetDateTimeOffset(10),
                    approvedByName = reader.IsDBNull(11) ? null : reader.GetString(11),
                    publishedAt = reader.IsDBNull(12) ? null : (DateTimeOffset?)reader.GetDateTimeOffset(12),
                    publishedByName = reader.IsDBNull(13) ? null : reader.GetString(13),
                    fileName = reader.IsDBNull(14) ? null : reader.GetString(14),
                    mimeType = reader.IsDBNull(15) ? null : reader.GetString(15),
                    sizeBytes = reader.IsDBNull(16) ? null : (long?)reader.GetInt64(16),
                    supersededByVersionId = reader.IsDBNull(17) ? null : (long?)reader.GetInt64(17)
                });
            }
        }

        var approvals = new List<object>();
        await using (var command = new SqlCommand("""
            SELECT a.id, a.document_version_id, a.sequence, a.step_type, a.approver_id, u.name,
                   a.status, a.comment, a.acted_at
            FROM dbo.knowledge_document_approvals a
            INNER JOIN dbo.users u ON u.id = a.approver_id
            INNER JOIN dbo.knowledge_document_versions v ON v.id = a.document_version_id
            WHERE v.document_id = @id
            ORDER BY a.document_version_id DESC, a.sequence;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                approvals.Add(new
                {
                    id = reader.GetInt64(0),
                    versionId = reader.GetInt64(1),
                    sequence = reader.GetInt32(2),
                    stepType = reader.GetString(3),
                    approverId = reader.GetInt64(4),
                    approverName = reader.GetString(5),
                    status = reader.GetString(6),
                    comment = reader.GetString(7),
                    actedAt = reader.IsDBNull(8) ? null : (DateTimeOffset?)reader.GetDateTimeOffset(8)
                });
            }
        }

        var relations = new List<object>();
        await using (var command = new SqlCommand("""
            SELECT r.id, r.entity_type, r.entity_id, r.relation_type, r.created_at, u.name
            FROM dbo.knowledge_document_relations r
            INNER JOIN dbo.users u ON u.id = r.created_by
            WHERE r.document_id = @id
            ORDER BY r.entity_type, r.entity_id;
            """, connection))
        {
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                relations.Add(new
                {
                    id = reader.GetInt64(0),
                    entityType = reader.GetString(1),
                    entityId = reader.GetInt64(2),
                    relationType = reader.GetString(3),
                    createdAt = reader.GetDateTimeOffset(4),
                    createdByName = reader.GetString(5)
                });
            }
        }

        return Results.Ok(new { document = header, versions, approvals, relations });
    }

    // -----------------------------------------------------------------
    // Create a document, with its first revision
    // -----------------------------------------------------------------
    private static async Task<IResult> CreateDocumentAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        ProjectDocumentStorage storage,
        IDocumentMalwareScanner malwareScanner,
        DocumentStorageOptions storageOptions,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.upload", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManagePermissions = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        if (!request.HasFormContentType)
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "multipart_required", "Upload requests must use multipart/form-data.");

        var form = await request.ReadFormAsync(cancellationToken);
        var title = Required(form["title"], "title").Trim();
        InputValidation.RequiredText(title, 300, "Title");
        var description = (Optional(form["description"], "description") ?? string.Empty).Trim();
        InputValidation.OptionalText(description, 2000, "Description");
        var documentType = Required(form["documentType"], "documentType").Trim();
        if (!DocumentTypes.Contains(documentType, StringComparer.Ordinal))
            throw Invalid("Document type is not an allowed value.");
        if (!long.TryParse(Required(form["categoryId"], "categoryId"), out var categoryId) || categoryId <= 0)
            throw Invalid("Category is required.");
        var prefix = Required(form["numberPrefix"], "numberPrefix").Trim().ToUpperInvariant();
        InputValidation.RequiredText(prefix, 10, "Number prefix");
        var scopeCode = Required(form["numberScope"], "numberScope").Trim().ToUpperInvariant();
        InputValidation.RequiredText(scopeCode, 20, "Number scope");
        var department = (Optional(form["department"], "department") ?? actor.Department).Trim();
        InputValidation.OptionalText(department, 200, "Department");
        var confidentiality = (Optional(form["confidentiality"], "confidentiality") ?? "Company").Trim();
        if (!Confidentialities.Contains(confidentiality, StringComparer.Ordinal))
            throw Invalid("Confidentiality is not an allowed value.");
        var language = (Optional(form["language"], "language") ?? "EN").Trim().ToUpperInvariant();
        if (language is not ("EN" or "TH" or "JA")) throw Invalid("Language must be EN, TH or JA.");
        var tags = (Optional(form["tags"], "tags") ?? string.Empty).Trim();
        InputValidation.OptionalText(tags, 500, "Tags");
        var ownerId = ParseOptionalId(form["ownerId"], "Owner") ?? actor.Id;
        if (ownerId != actor.Id && !canManagePermissions)
            throw new ApiException(StatusCodes.Status403Forbidden, "owner_assignment_forbidden", "Only a knowledge manager may create a document for another owner.");
        var nextReviewDate = ParseOptionalDate(Optional(form["nextReviewDate"], "nextReviewDate"), "Next review date");

        // Business rule 12: a controlled document is meaningless without a review date.
        if (string.Equals(documentType, "Controlled Document", StringComparison.Ordinal) && nextReviewDate is null)
            throw Invalid("A controlled document requires a next review date.");

        if (form.Files.Count > 1) throw Invalid("At most one file may be uploaded with a new document.");
        var file = form.Files.Count == 0 ? null : form.Files.GetFile("file");

        string? storageKey = null;
        var stored = false;
        var committed = false;
        var commitOutcomeUnknown = false;
        try
        {
            DocumentWriteResult? write = null;
            MalwareScanResult? scan = null;
            string fileName = string.Empty;
            string contentType = string.Empty;
            if (file is not null)
            {
                (fileName, contentType, storageKey) = ValidateFile(file, storageOptions, storage);
                await using var source = file.OpenReadStream();
                write = await storage.WriteAsync(storageKey, source, cancellationToken);
                stored = true;
                scan = await malwareScanner.ScanAsync(storageKey, cancellationToken);
                if (scan.Status == "Infected")
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "malware_detected", "The uploaded file failed malware scanning.");
            }

            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                await using (var validate = new SqlCommand("""
                    SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.knowledge_categories WHERE id = @category_id AND is_active = 1)
                            AND EXISTS (SELECT 1 FROM dbo.users WHERE id = @owner_id AND is_active = 1 AND deleted_at IS NULL)
                           THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
                    """, connection, transaction))
                {
                    validate.Parameters.AddParameter("@category_id", SqlDbType.BigInt, categoryId);
                    validate.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
                    if (!(bool)(await validate.ExecuteScalarAsync(cancellationToken) ?? false))
                        throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "Category or owner was not found.");
                }

                string documentNumber;
                await using (var number = new SqlCommand("dbo.issue_knowledge_document_number", connection, transaction))
                {
                    number.CommandType = CommandType.StoredProcedure;
                    number.Parameters.AddParameter("@prefix", SqlDbType.NVarChar, prefix, 10);
                    number.Parameters.AddParameter("@scope_code", SqlDbType.NVarChar, scopeCode, 20);
                    var output = new SqlParameter("@document_number", SqlDbType.NVarChar, 40) { Direction = ParameterDirection.Output };
                    number.Parameters.Add(output);
                    await number.ExecuteNonQueryAsync(cancellationToken);
                    documentNumber = (string)output.Value;
                }

                long? fileId = null;
                if (write is not null && storageKey is not null)
                {
                    await using var insertFile = new SqlCommand("""
                        INSERT INTO dbo.knowledge_document_files(
                            storage_key, original_file_name, safe_file_name, mime_type, size_bytes, sha256,
                            malware_scan_status, malware_scanned_at, uploaded_by)
                        OUTPUT inserted.id
                        VALUES (@storage_key, @original_name, @safe_name, @mime, @size, @sha, @scan_status, @scanned_at, @actor);
                        """, connection, transaction);
                    insertFile.Parameters.AddParameter("@storage_key", SqlDbType.NVarChar, storageKey, 400);
                    insertFile.Parameters.AddParameter("@original_name", SqlDbType.NVarChar, fileName, 500);
                    insertFile.Parameters.AddParameter("@safe_name", SqlDbType.NVarChar, SafeName(fileName), 500);
                    insertFile.Parameters.AddParameter("@mime", SqlDbType.NVarChar, contentType, 200);
                    insertFile.Parameters.AddParameter("@size", SqlDbType.BigInt, write.SizeBytes);
                    insertFile.Parameters.AddParameter("@sha", SqlDbType.Char, write.Sha256, 64);
                    insertFile.Parameters.AddParameter("@scan_status", SqlDbType.NVarChar, scan?.Status ?? "Skipped", 20);
                    insertFile.Parameters.AddParameter("@scanned_at", SqlDbType.DateTimeOffset, scan?.ScannedAt);
                    insertFile.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    fileId = (long)(await insertFile.ExecuteScalarAsync(cancellationToken))!;
                }

                long documentId;
                await using (var insertDocument = new SqlCommand("""
                    INSERT INTO dbo.knowledge_documents(
                        document_no, title, description, document_type, category_id, department_code,
                        owner_id, confidentiality, language, tags, next_review_date, created_by, updated_by)
                    OUTPUT inserted.id
                    VALUES (@no, @title, @description, @type, @category_id, @department,
                            @owner_id, @confidentiality, @language, @tags, @review_date, @actor, @actor);
                    """, connection, transaction))
                {
                    insertDocument.Parameters.AddParameter("@no", SqlDbType.NVarChar, documentNumber, 40);
                    insertDocument.Parameters.AddParameter("@title", SqlDbType.NVarChar, title, 300);
                    insertDocument.Parameters.AddParameter("@description", SqlDbType.NVarChar, description, 2000);
                    insertDocument.Parameters.AddParameter("@type", SqlDbType.NVarChar, documentType, 30);
                    insertDocument.Parameters.AddParameter("@category_id", SqlDbType.BigInt, categoryId);
                    insertDocument.Parameters.AddParameter("@department", SqlDbType.NVarChar, department, 200);
                    insertDocument.Parameters.AddParameter("@owner_id", SqlDbType.BigInt, ownerId);
                    insertDocument.Parameters.AddParameter("@confidentiality", SqlDbType.NVarChar, confidentiality, 30);
                    insertDocument.Parameters.AddParameter("@language", SqlDbType.Char, language, 2);
                    insertDocument.Parameters.AddParameter("@tags", SqlDbType.NVarChar, tags, 500);
                    insertDocument.Parameters.AddParameter("@review_date", SqlDbType.Date, nextReviewDate);
                    insertDocument.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    documentId = (long)(await insertDocument.ExecuteScalarAsync(cancellationToken))!;
                }

                long versionId;
                await using (var insertVersion = new SqlCommand("""
                    INSERT INTO dbo.knowledge_document_versions(
                        document_id, revision, version_number, file_id, change_type, change_summary, status, created_by)
                    OUTPUT inserted.id
                    VALUES (@document_id, N'R00', 1, @file_id, N'Major', N'Initial issue', N'Draft', @actor);
                    """, connection, transaction))
                {
                    insertVersion.Parameters.AddParameter("@document_id", SqlDbType.BigInt, documentId);
                    insertVersion.Parameters.AddParameter("@file_id", SqlDbType.BigInt, fileId);
                    insertVersion.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    versionId = (long)(await insertVersion.ExecuteScalarAsync(cancellationToken))!;
                }

                await SetCurrentVersionAsync(connection, transaction, documentId, versionId, "Draft", cancellationToken);
                await AuditAsync(connection, transaction, documentId, versionId, actor, "Create",
                    null, $"{{\"documentNumber\":\"{Escape(documentNumber)}\",\"title\":\"{Escape(title)}\"}}",
                    "Document created", cancellationToken);

                commitOutcomeUnknown = true;
                await transaction.CommitAsync(cancellationToken);
                committed = true;
                commitOutcomeUnknown = false;
                return Results.Created($"/api/v1/knowledge/documents/{documentId}",
                    new { id = documentId, documentNumber, versionId });
            }
            catch (Exception exception)
            {
                if (!commitOutcomeUnknown && !committed && transaction.Connection is not null)
                    await transaction.RollbackAsync(CancellationToken.None);
                if (commitOutcomeUnknown && storageKey is not null)
                    loggerFactory.CreateLogger("KnowledgeStorage").LogCritical(exception,
                        "Knowledge document commit outcome is unknown; preserving storage key {StorageKey}", storageKey);
                throw;
            }
        }
        catch
        {
            if (stored && !committed && !commitOutcomeUnknown && storageKey is not null)
                await storage.DeleteIfExistsAsync(storageKey);
            throw;
        }
    }

    // -----------------------------------------------------------------
    // New revision on an existing document
    // -----------------------------------------------------------------
    private static async Task<IResult> UploadVersionAsync(
        long id,
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        ProjectDocumentStorage storage,
        IDocumentMalwareScanner malwareScanner,
        DocumentStorageOptions storageOptions,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.upload", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManagePermissions = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        if (!request.HasFormContentType)
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "multipart_required", "Upload requests must use multipart/form-data.");

        var form = await request.ReadFormAsync(cancellationToken);
        var changeType = (Optional(form["changeType"], "changeType") ?? "Major").Trim();
        if (changeType is not ("Major" or "Minor")) throw Invalid("Change type must be Major or Minor.");
        var changeSummary = Required(form["changeSummary"], "changeSummary").Trim();
        InputValidation.RequiredText(changeSummary, 2000, "Change summary");
        var baseVersionId = ParseOptionalId(form["baseVersionId"], "Base revision");
        if (form.Files.Count != 1 || form.Files.GetFile("file") is not { } file)
            throw Invalid("Exactly one multipart file field named 'file' is required.");

        var (fileName, contentType, storageKey) = ValidateFile(file, storageOptions, storage);
        var stored = false;
        var committed = false;
        var commitOutcomeUnknown = false;
        try
        {
            DocumentWriteResult write;
            await using (var source = file.OpenReadStream()) write = await storage.WriteAsync(storageKey, source, cancellationToken);
            stored = true;
            var scan = await malwareScanner.ScanAsync(storageKey, cancellationToken);
            if (scan.Status == "Infected")
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "malware_detected", "The uploaded file failed malware scanning.");

            await using var connection = await connections.OpenAsync(cancellationToken);
            await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
            try
            {
                int nextNumber;
                await using (var probe = new SqlCommand("""
                    SELECT d.owner_id, d.current_version_id, COALESCE(MAX(v.version_number), 0)
                    FROM dbo.knowledge_documents d
                    LEFT JOIN dbo.knowledge_document_versions v ON v.document_id = d.id
                    LEFT JOIN dbo.users me ON me.id = @me
                    WHERE d.id = @id AND d.archived_at IS NULL
                      AND (d.owner_id = @me OR @manage = 1 OR EXISTS (
                          SELECT 1 FROM dbo.knowledge_document_permissions p
                          WHERE p.document_id = d.id AND p.permission_level IN (N'Edit', N'Manage')
                            AND ((p.subject_type = N'User' AND p.subject_user_id = @me)
                              OR (p.subject_type = N'Role' AND p.subject_role_id = me.role_id))))
                    GROUP BY d.owner_id, d.current_version_id;
                    """, connection, transaction))
                {
                    probe.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    probe.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                    probe.Parameters.AddParameter("@manage", SqlDbType.Bit, canManagePermissions);
                    await using var reader = await probe.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken))
                        throw new ApiException(StatusCodes.Status404NotFound, "document_not_found", "Document was not found, is archived, or you cannot edit it.");
                    var currentVersionId = reader.IsDBNull(1) ? null : (long?)reader.GetInt64(1);
                    if (baseVersionId is not null && baseVersionId != currentVersionId)
                        throw new ApiException(StatusCodes.Status409Conflict, "revision_conflict", "A newer revision exists. Reload before uploading another version.");
                    nextNumber = reader.GetInt32(2) + 1;
                }

                await using (var duplicate = new SqlCommand("""
                    SELECT COUNT_BIG(*)
                    FROM dbo.knowledge_document_versions v
                    INNER JOIN dbo.knowledge_document_files f ON f.id = v.file_id
                    WHERE v.document_id = @id AND f.sha256 = @sha AND f.size_bytes = @size;
                    """, connection, transaction))
                {
                    duplicate.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                    duplicate.Parameters.AddParameter("@sha", SqlDbType.Char, write.Sha256, 64);
                    duplicate.Parameters.AddParameter("@size", SqlDbType.BigInt, write.SizeBytes);
                    if ((long)(await duplicate.ExecuteScalarAsync(cancellationToken))! > 0)
                        throw new ApiException(StatusCodes.Status409Conflict, "duplicate_file", "This exact file already exists in the document version history.");
                }

                long fileId;
                await using (var insertFile = new SqlCommand("""
                    INSERT INTO dbo.knowledge_document_files(
                        storage_key, original_file_name, safe_file_name, mime_type, size_bytes, sha256,
                        malware_scan_status, malware_scanned_at, uploaded_by)
                    OUTPUT inserted.id
                    VALUES (@storage_key, @original_name, @safe_name, @mime, @size, @sha, @scan_status, @scanned_at, @actor);
                    """, connection, transaction))
                {
                    insertFile.Parameters.AddParameter("@storage_key", SqlDbType.NVarChar, storageKey, 400);
                    insertFile.Parameters.AddParameter("@original_name", SqlDbType.NVarChar, fileName, 500);
                    insertFile.Parameters.AddParameter("@safe_name", SqlDbType.NVarChar, SafeName(fileName), 500);
                    insertFile.Parameters.AddParameter("@mime", SqlDbType.NVarChar, contentType, 200);
                    insertFile.Parameters.AddParameter("@size", SqlDbType.BigInt, write.SizeBytes);
                    insertFile.Parameters.AddParameter("@sha", SqlDbType.Char, write.Sha256, 64);
                    insertFile.Parameters.AddParameter("@scan_status", SqlDbType.NVarChar, scan.Status, 20);
                    insertFile.Parameters.AddParameter("@scanned_at", SqlDbType.DateTimeOffset, scan.ScannedAt);
                    insertFile.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    fileId = (long)(await insertFile.ExecuteScalarAsync(cancellationToken))!;
                }

                var revision = $"R{nextNumber - 1:00}";
                long versionId;
                await using (var insertVersion = new SqlCommand("""
                    INSERT INTO dbo.knowledge_document_versions(
                        document_id, revision, version_number, file_id, change_type, change_summary, status, created_by)
                    OUTPUT inserted.id
                    VALUES (@document_id, @revision, @number, @file_id, @change_type, @change_summary, N'Draft', @actor);
                    """, connection, transaction))
                {
                    insertVersion.Parameters.AddParameter("@document_id", SqlDbType.BigInt, id);
                    insertVersion.Parameters.AddParameter("@revision", SqlDbType.NVarChar, revision, 10);
                    insertVersion.Parameters.AddParameter("@number", SqlDbType.Int, nextNumber);
                    insertVersion.Parameters.AddParameter("@file_id", SqlDbType.BigInt, fileId);
                    insertVersion.Parameters.AddParameter("@change_type", SqlDbType.NVarChar, changeType, 10);
                    insertVersion.Parameters.AddParameter("@change_summary", SqlDbType.NVarChar, changeSummary, 2000);
                    insertVersion.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                    versionId = (long)(await insertVersion.ExecuteScalarAsync(cancellationToken))!;
                }

                await AuditAsync(connection, transaction, id, versionId, actor, "CreateVersion",
                    null, $"{{\"revision\":\"{revision}\",\"changeType\":\"{changeType}\"}}", changeSummary, cancellationToken);

                commitOutcomeUnknown = true;
                await transaction.CommitAsync(cancellationToken);
                committed = true;
                commitOutcomeUnknown = false;
                return Results.Created($"/api/v1/knowledge/versions/{versionId}/content", new { versionId, revision });
            }
            catch (Exception exception)
            {
                if (!commitOutcomeUnknown && !committed && transaction.Connection is not null)
                    await transaction.RollbackAsync(CancellationToken.None);
                if (commitOutcomeUnknown)
                    loggerFactory.CreateLogger("KnowledgeStorage").LogCritical(exception,
                        "Knowledge revision commit outcome is unknown; preserving storage key {StorageKey}", storageKey);
                throw;
            }
        }
        catch
        {
            if (stored && !committed && !commitOutcomeUnknown) await storage.DeleteIfExistsAsync(storageKey);
            throw;
        }
    }

    // -----------------------------------------------------------------
    // Workflow
    // -----------------------------------------------------------------
    private static async Task<IResult> SubmitForReviewAsync(
        long versionId,
        SubmitReviewRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.upload", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        if (body.ReviewerIds is null || body.ReviewerIds.Count == 0)
            throw Invalid("At least one reviewer is required.");
        if (body.ApproverId <= 0)
            throw Invalid("An approver is required.");
        // Business rule 2: the author cannot be the final approver of their own document.
        if (body.ApproverId == actor.Id)
            throw new ApiException(StatusCodes.Status409Conflict, "self_approval_forbidden",
                "The author cannot be the final approver of their own document. Nominate another approver.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            var (documentId, status, createdBy) = await ReadVersionAsync(connection, transaction, versionId, cancellationToken);
            await DemandDocumentEditorAsync(connection, transaction, documentId, actor, canManage, cancellationToken);
            if (status is not ("Draft" or "Request Changes"))
                throw new ApiException(StatusCodes.Status409Conflict, "invalid_transition",
                    $"A revision in '{status}' cannot be submitted for review.");
            if (body.ApproverId == createdBy)
                throw new ApiException(StatusCodes.Status409Conflict, "self_approval_forbidden",
                    "The revision author cannot be its final approver.");

            await using (var clear = new SqlCommand(
                "DELETE FROM dbo.knowledge_document_approvals WHERE document_version_id = @v AND status = N'Pending';",
                connection, transaction))
            {
                clear.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                await clear.ExecuteNonQueryAsync(cancellationToken);
            }

            var sequence = 1;
            foreach (var reviewerId in body.ReviewerIds.Distinct())
            {
                await InsertApprovalStepAsync(connection, transaction, versionId, sequence++, "Review", reviewerId, cancellationToken);
            }
            await InsertApprovalStepAsync(connection, transaction, versionId, sequence, "Approve", body.ApproverId, cancellationToken);

            await UpdateVersionStatusAsync(connection, transaction, versionId, "In Review", cancellationToken);
            await SetCurrentVersionAsync(connection, transaction, documentId, versionId, "In Review", cancellationToken);
            await AuditAsync(connection, transaction, documentId, versionId, actor, "SubmitForReview",
                $"{{\"status\":\"{status}\"}}", "{\"status\":\"In Review\"}", body.Comment ?? "", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { versionId, status = "In Review" });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> DecideAsync(
        long versionId,
        DecisionRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        var decision = (body.Decision ?? string.Empty).Trim();
        if (decision is not ("Approved" or "Request Changes" or "Rejected"))
            throw Invalid("Decision must be Approved, Request Changes or Rejected.");
        var comment = (body.Comment ?? string.Empty).Trim();
        if (decision is "Request Changes" or "Rejected")
            InputValidation.RequiredText(comment, 2000, "Comment");
        InputValidation.OptionalText(comment, 2000, "Comment");

        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            var (documentId, status, createdBy) = await ReadVersionAsync(connection, transaction, versionId, cancellationToken);

            long stepId;
            string stepType;
            await using (var probe = new SqlCommand("""
                SELECT TOP 1 a.id, a.step_type
                FROM dbo.knowledge_document_approvals a
                WHERE a.document_version_id = @v AND a.status = N'Pending' AND a.approver_id = @me
                  AND a.sequence = (
                      SELECT MIN(p.sequence) FROM dbo.knowledge_document_approvals p
                      WHERE p.document_version_id = @v AND p.status = N'Pending')
                ORDER BY a.sequence;
                """, connection, transaction))
            {
                probe.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                probe.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                await using var reader = await probe.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status403Forbidden, "not_an_approver",
                        "You have no pending review or approval step on this revision.");
                stepId = reader.GetInt64(0);
                stepType = reader.GetString(1);
            }

            await users.DemandPermissionAsync(stepType == "Approve" ? "knowledge.approve" : "knowledge.review", cancellationToken);

            // Business rule 2 again, enforced at the moment of the decision rather
            // than only when the route was built.
            if (stepType == "Approve" && actor.Id == createdBy)
                throw new ApiException(StatusCodes.Status409Conflict, "self_approval_forbidden",
                    "The revision author cannot approve their own document.");

            await using (var update = new SqlCommand("""
                UPDATE dbo.knowledge_document_approvals
                   SET status = @status, comment = @comment, acted_by = @me, acted_at = SYSUTCDATETIME()
                 WHERE id = @id AND status = N'Pending';
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, decision, 20);
                update.Parameters.AddParameter("@comment", SqlDbType.NVarChar, comment, 2000);
                update.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, stepId);
                if (await update.ExecuteNonQueryAsync(cancellationToken) != 1)
                    throw new ApiException(StatusCodes.Status409Conflict, "step_already_decided", "That step was already decided.");
            }

            string newStatus;
            if (decision == "Rejected")
            {
                newStatus = "Draft";
            }
            else if (decision == "Request Changes")
            {
                newStatus = "Request Changes";
            }
            else
            {
                await using var remaining = new SqlCommand(
                    "SELECT COUNT_BIG(*) FROM dbo.knowledge_document_approvals WHERE document_version_id = @v AND status = N'Pending';",
                    connection, transaction);
                remaining.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                var pending = (long)(await remaining.ExecuteScalarAsync(cancellationToken))!;
                newStatus = pending == 0 ? "Approved" : "Pending Approval";
            }

            await UpdateVersionStatusAsync(connection, transaction, versionId, newStatus, cancellationToken);
            if (stepType == "Review" && decision == "Approved")
            {
                await using var stampReview = new SqlCommand(
                    "UPDATE dbo.knowledge_document_versions SET reviewed_by = @me, reviewed_at = SYSUTCDATETIME() WHERE id = @v;",
                    connection, transaction);
                stampReview.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                stampReview.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                await stampReview.ExecuteNonQueryAsync(cancellationToken);
            }
            if (newStatus == "Approved")
            {
                await using var stamp = new SqlCommand(
                    "UPDATE dbo.knowledge_document_versions SET approved_by = @me, approved_at = SYSUTCDATETIME() WHERE id = @v;",
                    connection, transaction);
                stamp.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                stamp.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                await stamp.ExecuteNonQueryAsync(cancellationToken);
            }
            await SetCurrentVersionAsync(connection, transaction, documentId, versionId, newStatus, cancellationToken);

            var action = decision switch
            {
                "Approved" => "Approve",
                "Rejected" => "Reject",
                _ => "RequestChanges"
            };
            await AuditAsync(connection, transaction, documentId, versionId, actor, action,
                $"{{\"status\":\"{status}\"}}", $"{{\"status\":\"{newStatus}\"}}", comment, cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { versionId, status = newStatus });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /// <summary>
    /// Publish, and supersede whatever was published before, inside one
    /// transaction. The filtered unique index is what actually guarantees a
    /// single published revision; this code makes the intent explicit and turns
    /// a race into a readable conflict rather than a constraint violation.
    /// </summary>
    private static async Task<IResult> PublishAsync(
        long versionId,
        PublishRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.publish", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var effectiveDate = ParseOptionalDate(body.EffectiveDate, "Effective date") ?? clock.Today;
        var expiryDate = ParseOptionalDate(body.ExpiryDate, "Expiry date");
        if (expiryDate is not null && expiryDate < effectiveDate)
            throw Invalid("Expiry date cannot be before the effective date.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            var (documentId, status, _) = await ReadVersionAsync(connection, transaction, versionId, cancellationToken);
            if (status != "Approved")
                throw new ApiException(StatusCodes.Status409Conflict, "invalid_transition",
                    $"Only an approved revision can be published. This revision is '{status}'.");

            long? previousId = null;
            await using (var probe = new SqlCommand("""
                SELECT id FROM dbo.knowledge_document_versions WITH (UPDLOCK, HOLDLOCK)
                WHERE document_id = @d AND status = N'Published';
                """, connection, transaction))
            {
                probe.Parameters.AddParameter("@d", SqlDbType.BigInt, documentId);
                var value = await probe.ExecuteScalarAsync(cancellationToken);
                if (value is long existing) previousId = existing;
            }

            // Rules 6 and 7: the outgoing revision is superseded and points at its
            // replacement. It must leave 'Published' before the new one enters it,
            // or the unique index rejects the write.
            if (previousId is not null)
            {
                await using var supersede = new SqlCommand("""
                    UPDATE dbo.knowledge_document_versions
                       SET status = N'Superseded', superseded_by_version_id = @new_id
                     WHERE id = @old_id;
                    """, connection, transaction);
                supersede.Parameters.AddParameter("@new_id", SqlDbType.BigInt, versionId);
                supersede.Parameters.AddParameter("@old_id", SqlDbType.BigInt, previousId.Value);
                await supersede.ExecuteNonQueryAsync(cancellationToken);
            }

            await using (var publish = new SqlCommand("""
                UPDATE dbo.knowledge_document_versions
                   SET status = N'Published', effective_date = @effective, expiry_date = @expiry,
                       published_by = @me, published_at = SYSUTCDATETIME()
                 WHERE id = @v AND status = N'Approved';
                """, connection, transaction))
            {
                publish.Parameters.AddParameter("@effective", SqlDbType.Date, effectiveDate);
                publish.Parameters.AddParameter("@expiry", SqlDbType.Date, expiryDate);
                publish.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                publish.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                if (await publish.ExecuteNonQueryAsync(cancellationToken) != 1)
                    throw new ApiException(StatusCodes.Status409Conflict, "publish_conflict",
                        "The revision changed while it was being published. Reload and try again.");
            }

            await SetCurrentVersionAsync(connection, transaction, documentId, versionId, "Published", cancellationToken);

            if (previousId is not null)
                await AuditAsync(connection, transaction, documentId, previousId.Value, actor, "Supersede",
                    "{\"status\":\"Published\"}", $"{{\"status\":\"Superseded\",\"supersededBy\":{versionId}}}",
                    "Replaced by a newer revision", cancellationToken);
            await AuditAsync(connection, transaction, documentId, versionId, actor, "Publish",
                "{\"status\":\"Approved\"}", $"{{\"status\":\"Published\",\"effectiveDate\":\"{effectiveDate:yyyy-MM-dd}\"}}",
                body.Comment ?? "", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { versionId, status = "Published", supersededVersionId = previousId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    // -----------------------------------------------------------------
    // Download
    // -----------------------------------------------------------------
    private static async Task<IResult> DownloadVersionAsync(
        long versionId,
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        ProjectDocumentStorage storage,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        if (HttpMethods.IsHead(request.Method)) return Results.StatusCode(StatusCodes.Status405MethodNotAllowed);
        var preview = string.Equals(request.Query["preview"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);

        string fileName;
        string contentType;
        string storageKey;
        string sha256;
        long sizeBytes;
        long documentId;
        await using (var connection = await connections.OpenAsync(cancellationToken))
        {
            // Entitlement is part of the same read: an unauthorised caller gets 404,
            // which does not confirm that the document exists.
            await using var command = new SqlCommand($"""
                SELECT f.original_file_name, f.mime_type, f.storage_key, f.size_bytes, f.sha256, d.id
                FROM dbo.knowledge_document_versions v
                INNER JOIN dbo.knowledge_documents d ON d.id = v.document_id
                INNER JOIN dbo.knowledge_document_files f ON f.id = v.file_id
                WHERE v.id = @v AND {VisibilityPredicate};
                """, connection);
            AddVisibilityParameters(command, actor, canManage);
            command.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            fileName = reader.GetString(0);
            contentType = reader.GetString(1);
            storageKey = reader.GetString(2);
            sizeBytes = reader.GetInt64(3);
            sha256 = reader.GetString(4);
            documentId = reader.GetInt64(5);
        }

        await using (var connection = await connections.OpenAsync(cancellationToken))
        {
            await AuditAsync(connection, null, documentId, versionId, actor, preview ? "Preview" : "Download", null, null, "", cancellationToken);
        }

        if (preview && !(contentType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase)
            || contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            || contentType.StartsWith("text/", StringComparison.OrdinalIgnoreCase)))
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "preview_unavailable",
                "Browser preview is available for PDF, image and text files. Download this file to open it safely.");

        var stream = storage.OpenRead(storageKey);
        try
        {
            await storage.VerifyIntegrityAndRewindAsync(stream, sizeBytes, sha256, cancellationToken);
            return preview
                ? Results.File(stream, contentType, enableRangeProcessing: false)
                : Results.File(stream, contentType, fileName, enableRangeProcessing: false);
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
    }

    // -----------------------------------------------------------------
    // Relations
    // -----------------------------------------------------------------
    private static async Task<IResult> LinkAsync(
        long id,
        LinkRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.edit", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        var entityType = (body.EntityType ?? string.Empty).Trim();
        if (!RelationEntityTypes.Contains(entityType, StringComparer.Ordinal))
            throw Invalid("Entity type is not an allowed value.");
        if (body.EntityId <= 0) throw Invalid("Entity id is required.");
        var relationType = string.IsNullOrWhiteSpace(body.RelationType) ? "Reference" : body.RelationType!.Trim();

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            await DemandDocumentEditorAsync(connection, transaction, id, actor, canManage, cancellationToken);
            if (!await RelatedEntityExistsAsync(connection, transaction, entityType, body.EntityId, cancellationToken))
                throw new ApiException(StatusCodes.Status422UnprocessableEntity, "related_record_not_found", "The related record was not found.");
            long relationId;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.knowledge_document_relations(document_id, entity_type, entity_id, relation_type, created_by)
                OUTPUT inserted.id
                VALUES (@d, @entity_type, @entity_id, @relation_type, @actor);
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@d", SqlDbType.BigInt, id);
                insert.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 30);
                insert.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, body.EntityId);
                insert.Parameters.AddParameter("@relation_type", SqlDbType.NVarChar, relationType, 30);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                try
                {
                    relationId = (long)(await insert.ExecuteScalarAsync(cancellationToken))!;
                }
                catch (SqlException exception) when (exception.Number is 2601 or 2627)
                {
                    throw new ApiException(StatusCodes.Status409Conflict, "already_linked",
                        "That document is already linked to this record.");
                }
            }

            await AuditAsync(connection, transaction, id, null, actor, "LinkRecord", null,
                $"{{\"entityType\":\"{entityType}\",\"entityId\":{body.EntityId}}}", "", cancellationToken,
                entityType, body.EntityId);

            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/knowledge/documents/{id}", new { id = relationId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> UnlinkAsync(
        long id,
        long relationId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.edit", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            await DemandDocumentEditorAsync(connection, transaction, id, actor, canManage, cancellationToken);
            string entityType;
            long entityId;
            await using (var probe = new SqlCommand(
                "SELECT entity_type, entity_id FROM dbo.knowledge_document_relations WHERE id = @r AND document_id = @d;",
                connection, transaction))
            {
                probe.Parameters.AddParameter("@r", SqlDbType.BigInt, relationId);
                probe.Parameters.AddParameter("@d", SqlDbType.BigInt, id);
                await using var reader = await probe.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                entityType = reader.GetString(0);
                entityId = reader.GetInt64(1);
            }

            await using (var delete = new SqlCommand(
                "DELETE FROM dbo.knowledge_document_relations WHERE id = @r AND document_id = @d;", connection, transaction))
            {
                delete.Parameters.AddParameter("@r", SqlDbType.BigInt, relationId);
                delete.Parameters.AddParameter("@d", SqlDbType.BigInt, id);
                await delete.ExecuteNonQueryAsync(cancellationToken);
            }

            await AuditAsync(connection, transaction, id, null, actor, "UnlinkRecord",
                $"{{\"entityType\":\"{entityType}\",\"entityId\":{entityId}}}", null, "", cancellationToken,
                entityType, entityId);

            await transaction.CommitAsync(cancellationToken);
            return Results.NoContent();
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    /// <summary>Documents attached to one record elsewhere in the platform.</summary>
    private static async Task<IResult> ListRelatedAsync(
        HttpRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        var entityType = (request.Query["entityType"].FirstOrDefault() ?? string.Empty).Trim();
        if (!RelationEntityTypes.Contains(entityType, StringComparer.Ordinal))
            throw Invalid("Entity type is not an allowed value.");
        var entityId = ParseOptionalId(request.Query["entityId"], "Entity") ?? throw Invalid("Entity id is required.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT r.id, r.relation_type, d.id, d.document_no, d.title, d.document_type,
                   d.current_status, v.revision, o.name, d.updated_at
            FROM dbo.knowledge_document_relations r
            INNER JOIN dbo.knowledge_documents d ON d.id = r.document_id
            INNER JOIN dbo.users o ON o.id = d.owner_id
            LEFT JOIN dbo.knowledge_document_versions v ON v.id = d.current_version_id
            WHERE r.entity_type = @entity_type AND r.entity_id = @entity_id
              AND d.archived_at IS NULL
              AND {VisibilityPredicate}
            ORDER BY d.document_no;
            """, connection);
        AddVisibilityParameters(command, actor, canManage);
        command.Parameters.AddParameter("@entity_type", SqlDbType.NVarChar, entityType, 30);
        command.Parameters.AddParameter("@entity_id", SqlDbType.BigInt, entityId);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new
            {
                relationId = reader.GetInt64(0),
                relationType = reader.GetString(1),
                documentId = reader.GetInt64(2),
                documentNumber = reader.GetString(3),
                title = reader.GetString(4),
                documentType = reader.GetString(5),
                status = reader.GetString(6),
                revision = reader.IsDBNull(7) ? null : reader.GetString(7),
                ownerName = reader.GetString(8),
                updatedAt = reader.GetDateTimeOffset(9)
            });
        }
        return Results.Ok(new { items });
    }

    // -----------------------------------------------------------------
    // Read acknowledgement
    // -----------------------------------------------------------------
    private static async Task<IResult> AssignAcknowledgementAsync(
        long versionId,
        AssignAcknowledgementRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.publish", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (body.UserIds is null || body.UserIds.Count == 0) throw Invalid("At least one user is required.");
        var dueAt = ParseOptionalDate(body.DueAt, "Due date");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            var (documentId, status, _) = await ReadVersionAsync(connection, transaction, versionId, cancellationToken);
            if (status != "Published")
                throw new ApiException(StatusCodes.Status409Conflict, "invalid_transition",
                    "Only a published revision can be assigned for acknowledgement.");

            var assigned = 0;
            foreach (var userId in body.UserIds.Distinct())
            {
                await using var insert = new SqlCommand("""
                    IF NOT EXISTS (SELECT 1 FROM dbo.knowledge_document_acknowledgements
                                    WHERE document_version_id = @v AND user_id = @u)
                        INSERT INTO dbo.knowledge_document_acknowledgements(document_version_id, user_id, assigned_by, due_at)
                        VALUES (@v, @u, @actor, @due);
                    """, connection, transaction);
                insert.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                insert.Parameters.AddParameter("@u", SqlDbType.BigInt, userId);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@due", SqlDbType.Date, dueAt);
                assigned += await insert.ExecuteNonQueryAsync(cancellationToken);
            }

            await AuditAsync(connection, transaction, documentId, versionId, actor, "AssignAcknowledgement",
                null, $"{{\"assigned\":{assigned}}}", "", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { versionId, assigned });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> AcknowledgeAsync(
        long acknowledgementId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken);
        try
        {
            long versionId;
            long documentId;
            await using (var probe = new SqlCommand("""
                SELECT a.document_version_id, v.document_id
                FROM dbo.knowledge_document_acknowledgements a
                INNER JOIN dbo.knowledge_document_versions v ON v.id = a.document_version_id
                WHERE a.id = @a AND a.user_id = @me AND a.status = N'Pending';
                """, connection, transaction))
            {
                probe.Parameters.AddParameter("@a", SqlDbType.BigInt, acknowledgementId);
                probe.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                await using var reader = await probe.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                versionId = reader.GetInt64(0);
                documentId = reader.GetInt64(1);
            }

            await using (var update = new SqlCommand("""
                UPDATE dbo.knowledge_document_acknowledgements
                   SET status = N'Acknowledged', acknowledged_at = SYSUTCDATETIME()
                 WHERE id = @a AND user_id = @me AND status = N'Pending';
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@a", SqlDbType.BigInt, acknowledgementId);
                update.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                if (await update.ExecuteNonQueryAsync(cancellationToken) != 1)
                    throw new ApiException(StatusCodes.Status409Conflict, "already_acknowledged", "That assignment was already acknowledged.");
            }

            await AuditAsync(connection, transaction, documentId, versionId, actor, "Acknowledge",
                "{\"status\":\"Pending\"}", "{\"status\":\"Acknowledged\"}", "", cancellationToken);

            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { acknowledgementId, status = "Acknowledged" });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> MyAcknowledgementsAsync(
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT a.id, d.id, d.document_no, d.title, v.id, v.revision,
                   a.assigned_at, a.due_at, a.status,
                   CASE WHEN a.status = N'Pending' AND a.due_at IS NOT NULL AND a.due_at < @today
                        THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS overdue
            FROM dbo.knowledge_document_acknowledgements a
            INNER JOIN dbo.knowledge_document_versions v ON v.id = a.document_version_id
            INNER JOIN dbo.knowledge_documents d ON d.id = v.document_id
            WHERE a.user_id = @me AND a.status = N'Pending'
            ORDER BY a.due_at, a.assigned_at;
            """, connection);
        command.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@today", SqlDbType.Date, clock.Today);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new
            {
                id = reader.GetInt64(0),
                documentId = reader.GetInt64(1),
                documentNumber = reader.GetString(2),
                title = reader.GetString(3),
                versionId = reader.GetInt64(4),
                revision = reader.GetString(5),
                assignedAt = reader.GetDateTimeOffset(6),
                dueAt = reader.IsDBNull(7) ? null : reader.GetDateTime(7).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                status = reader.GetString(8),
                overdue = reader.GetBoolean(9)
            });
        }
        return Results.Ok(new { items });
    }

    // -----------------------------------------------------------------
    // Audit
    // -----------------------------------------------------------------
    private static async Task<IResult> DocumentAuditAsync(
        long id,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view_audit", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT e.id, e.occurred_at, u.name, e.actor_role, e.action, e.document_version_id,
                   v.revision, e.before_json, e.after_json, e.reason,
                   e.related_entity_type, e.related_entity_id
            FROM dbo.knowledge_audit_events e
            INNER JOIN dbo.users u ON u.id = e.actor_id
            LEFT JOIN dbo.knowledge_document_versions v ON v.id = e.document_version_id
            WHERE e.document_id = @id
            ORDER BY e.occurred_at DESC, e.id DESC;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);

        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new
            {
                id = reader.GetInt64(0),
                occurredAt = reader.GetDateTimeOffset(1),
                actorName = reader.GetString(2),
                actorRole = reader.GetString(3),
                action = reader.GetString(4),
                versionId = reader.IsDBNull(5) ? null : (long?)reader.GetInt64(5),
                revision = reader.IsDBNull(6) ? null : reader.GetString(6),
                before = reader.IsDBNull(7) ? null : reader.GetString(7),
                after = reader.IsDBNull(8) ? null : reader.GetString(8),
                reason = reader.GetString(9),
                relatedEntityType = reader.IsDBNull(10) ? null : reader.GetString(10),
                relatedEntityId = reader.IsDBNull(11) ? null : (long?)reader.GetInt64(11)
            });
        }
        return Results.Ok(new { items });
    }

    // -----------------------------------------------------------------
    // Archive, comments, and document permissions
    // -----------------------------------------------------------------
    private static async Task<IResult> SetWorkingStatusAsync(
        long id, WorkingStatusRequest body, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.edit", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        var requested = (body.Status ?? string.Empty).Trim();
        if (requested is not ("Shared" or "Editing" or "Final")) throw Invalid("Working document status is invalid.");
        var reason = (body.Reason ?? string.Empty).Trim();
        InputValidation.OptionalText(reason, 1000, "Reason");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            long versionId;
            string current;
            await using (var read = new SqlCommand("""
                SELECT d.current_version_id, d.current_status
                FROM dbo.knowledge_documents d WITH (UPDLOCK, HOLDLOCK)
                LEFT JOIN dbo.users me ON me.id = @me
                WHERE d.id = @id AND d.document_type = N'Working Document' AND d.archived_at IS NULL
                  AND (d.owner_id = @me OR @manage = 1 OR EXISTS (
                      SELECT 1 FROM dbo.knowledge_document_permissions p
                      WHERE p.document_id = d.id AND p.permission_level IN (N'Edit', N'Manage')
                        AND ((p.subject_type = N'User' AND p.subject_user_id = @me)
                          OR (p.subject_type = N'Role' AND p.subject_role_id = me.role_id))));
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                read.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
                read.Parameters.AddParameter("@manage", SqlDbType.Bit, canManage);
                await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken) || reader.IsDBNull(0)) return Results.NotFound();
                versionId = reader.GetInt64(0); current = reader.GetString(1);
            }
            var allowed = (current, requested) switch
            {
                ("Draft", "Shared") => true,
                ("Shared", "Editing") => true,
                ("Shared", "Final") => true,
                ("Editing", "Shared") => true,
                ("Editing", "Final") => true,
                _ => false
            };
            if (!allowed) throw new ApiException(StatusCodes.Status409Conflict, "invalid_transition",
                $"A working document cannot move from '{current}' to '{requested}'.");
            await UpdateVersionStatusAsync(connection, transaction, versionId, requested, cancellationToken);
            await SetCurrentVersionAsync(connection, transaction, id, versionId, requested, cancellationToken);
            await AuditAsync(connection, transaction, id, versionId, actor, "EditMetadata",
                $"{{\"status\":\"{Escape(current)}\"}}", $"{{\"status\":\"{Escape(requested)}\"}}",
                reason.Length == 0 ? "Working document status changed" : reason, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, versionId, status = requested });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> ArchiveDocumentAsync(
        long id,
        ArchiveRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.archive", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var reason = (body.Reason ?? string.Empty).Trim();
        InputValidation.RequiredText(reason, 1000, "Archive reason");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long? versionId;
            string status;
            await using (var read = new SqlCommand("""
                SELECT current_version_id, current_status
                FROM dbo.knowledge_documents WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @id AND archived_at IS NULL;
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                versionId = reader.IsDBNull(0) ? null : (long?)reader.GetInt64(0);
                status = reader.GetString(1);
            }
            if (versionId is not null)
            {
                await using var version = new SqlCommand(
                    "UPDATE dbo.knowledge_document_versions SET status = N'Archived' WHERE id = @v;", connection, transaction);
                version.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                await version.ExecuteNonQueryAsync(cancellationToken);
            }
            await using (var update = new SqlCommand("""
                UPDATE dbo.knowledge_documents
                   SET current_status = N'Archived', archived_at = SYSUTCDATETIME(), archived_by = @actor,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id AND archived_at IS NULL;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await update.ExecuteNonQueryAsync(cancellationToken);
            }
            await AuditAsync(connection, transaction, id, versionId, actor, "Archive",
                $"{{\"status\":\"{Escape(status)}\"}}", "{\"status\":\"Archived\"}", reason, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = "Archived" });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> RestoreDocumentAsync(
        long id,
        ArchiveRequest body,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.archive", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var reason = (body.Reason ?? string.Empty).Trim();
        InputValidation.RequiredText(reason, 1000, "Restore reason");
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            long? versionId;
            string restoredStatus;
            await using (var read = new SqlCommand("""
                SELECT d.current_version_id,
                       CASE WHEN v.published_at IS NOT NULL THEN N'Published'
                            WHEN v.approved_at IS NOT NULL THEN N'Approved' ELSE N'Draft' END
                FROM dbo.knowledge_documents d WITH (UPDLOCK, HOLDLOCK)
                LEFT JOIN dbo.knowledge_document_versions v ON v.id = d.current_version_id
                WHERE d.id = @id AND d.archived_at IS NOT NULL;
                """, connection, transaction))
            {
                read.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await using var reader = await read.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
                versionId = reader.IsDBNull(0) ? null : (long?)reader.GetInt64(0);
                restoredStatus = reader.GetString(1);
            }
            if (versionId is not null)
            {
                await using var version = new SqlCommand(
                    "UPDATE dbo.knowledge_document_versions SET status = @status WHERE id = @v AND status = N'Archived';",
                    connection, transaction);
                version.Parameters.AddParameter("@status", SqlDbType.NVarChar, restoredStatus, 30);
                version.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
                await version.ExecuteNonQueryAsync(cancellationToken);
            }
            await using (var update = new SqlCommand("""
                UPDATE dbo.knowledge_documents
                   SET current_status = @status, archived_at = NULL, archived_by = NULL,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id AND archived_at IS NOT NULL;
                """, connection, transaction))
            {
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, restoredStatus, 30);
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                await update.ExecuteNonQueryAsync(cancellationToken);
            }
            await AuditAsync(connection, transaction, id, versionId, actor, "Restore",
                "{\"status\":\"Archived\"}", $"{{\"status\":\"{Escape(restoredStatus)}\"}}", reason, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, status = restoredStatus });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> ListDocumentCommentsAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT c.id, c.document_version_id, c.parent_comment_id, c.author_id, u.name,
                   c.content, c.mentioned_user_ids, c.resolved_at, ru.name, c.created_at, c.updated_at
            FROM dbo.knowledge_document_comments c
            INNER JOIN dbo.knowledge_documents d ON d.id = c.document_id
            INNER JOIN dbo.users u ON u.id = c.author_id
            LEFT JOIN dbo.users ru ON ru.id = c.resolved_by
            WHERE c.document_id = @id AND {VisibilityPredicate}
            ORDER BY c.created_at;
            """, connection);
        AddVisibilityParameters(command, actor, canManage);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new { id = reader.GetInt64(0), versionId = reader.IsDBNull(1) ? null : (long?)reader.GetInt64(1),
                parentCommentId = reader.IsDBNull(2) ? null : (long?)reader.GetInt64(2), authorId = reader.GetInt64(3),
                authorName = reader.GetString(4), content = reader.GetString(5), mentionedUserIds = reader.GetString(6),
                resolvedAt = reader.IsDBNull(7) ? null : (DateTimeOffset?)reader.GetDateTimeOffset(7),
                resolvedByName = reader.IsDBNull(8) ? null : reader.GetString(8), createdAt = reader.GetDateTimeOffset(9),
                updatedAt = reader.GetDateTimeOffset(10) });
        return Results.Ok(new { items });
    }

    private static async Task<IResult> CreateDocumentCommentAsync(
        long id, CommentRequest body, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.comment", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        var content = (body.Content ?? string.Empty).Trim();
        InputValidation.RequiredText(content, 4000, "Comment");
        var mentions = body.MentionedUserIds?.Where(value => value > 0).Distinct().Take(50).ToArray() ?? [];
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using (var entitled = new SqlCommand($"""
                SELECT COUNT_BIG(*) FROM dbo.knowledge_documents d
                WHERE d.id = @id AND {VisibilityPredicate};
                """, connection, transaction))
            {
                AddVisibilityParameters(entitled, actor, canManage);
                entitled.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                if ((long)(await entitled.ExecuteScalarAsync(cancellationToken))! != 1) return Results.NotFound();
            }
            if (body.ParentCommentId is not null)
            {
                await using var parent = new SqlCommand(
                    "SELECT COUNT_BIG(*) FROM dbo.knowledge_document_comments WHERE id = @parent AND document_id = @id;",
                    connection, transaction);
                parent.Parameters.AddParameter("@parent", SqlDbType.BigInt, body.ParentCommentId);
                parent.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                if ((long)(await parent.ExecuteScalarAsync(cancellationToken))! != 1) throw Invalid("Parent comment was not found.");
            }
            if (body.VersionId is not null)
            {
                await using var version = new SqlCommand(
                    "SELECT COUNT_BIG(*) FROM dbo.knowledge_document_versions WHERE id = @version AND document_id = @id;",
                    connection, transaction);
                version.Parameters.AddParameter("@version", SqlDbType.BigInt, body.VersionId);
                version.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                if ((long)(await version.ExecuteScalarAsync(cancellationToken))! != 1) throw Invalid("Revision was not found.");
            }
            long commentId;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.knowledge_document_comments(
                    document_id, document_version_id, parent_comment_id, author_id, content, mentioned_user_ids)
                OUTPUT inserted.id
                VALUES (@id, @version, @parent, @actor, @content, @mentions);
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                insert.Parameters.AddParameter("@version", SqlDbType.BigInt, body.VersionId);
                insert.Parameters.AddParameter("@parent", SqlDbType.BigInt, body.ParentCommentId);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                insert.Parameters.AddParameter("@content", SqlDbType.NVarChar, content, 4000);
                insert.Parameters.AddParameter("@mentions", SqlDbType.NVarChar, string.Join(',', mentions), 500);
                commentId = (long)(await insert.ExecuteScalarAsync(cancellationToken))!;
            }
            await AuditAsync(connection, transaction, id, body.VersionId, actor, "Comment", null,
                $"{{\"commentId\":{commentId}}}", "Comment added", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/knowledge/documents/{id}/comments/{commentId}", new { id = commentId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> SetCommentResolutionAsync(
        long commentId, CommentResolutionRequest body, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.comment", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            UPDATE c
               SET resolved_at = CASE WHEN @resolved = 1 THEN SYSUTCDATETIME() ELSE NULL END,
                   resolved_by = CASE WHEN @resolved = 1 THEN @me ELSE NULL END,
                   updated_at = SYSUTCDATETIME()
            FROM dbo.knowledge_document_comments c
            INNER JOIN dbo.knowledge_documents d ON d.id = c.document_id
            WHERE c.id = @id AND (c.author_id = @me OR d.owner_id = @me OR @manage = 1);
            SELECT @@ROWCOUNT;
            """, connection);
        command.Parameters.AddParameter("@resolved", SqlDbType.Bit, body.Resolved);
        command.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@manage", SqlDbType.Bit, canManage);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, commentId);
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) != 1)
            return Results.NotFound();
        return Results.Ok(new { id = commentId, resolved = body.Resolved });
    }

    private static async Task<IResult> ListDocumentPermissionsAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_permissions", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT p.id, p.subject_type, p.subject_user_id, u.name, p.subject_role_id, r.code,
                   p.subject_project_id, prj.project_no, p.subject_department_code, p.permission_level,
                   gu.name, p.created_at
            FROM dbo.knowledge_document_permissions p
            LEFT JOIN dbo.users u ON u.id = p.subject_user_id
            LEFT JOIN dbo.roles r ON r.id = p.subject_role_id
            LEFT JOIN dbo.projects prj ON prj.id = p.subject_project_id
            INNER JOIN dbo.users gu ON gu.id = p.granted_by
            WHERE p.document_id = @id
            ORDER BY p.created_at DESC;
            """, connection);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        var items = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new { id = reader.GetInt64(0), subjectType = reader.GetString(1),
                subjectId = !reader.IsDBNull(2) ? (long?)reader.GetInt64(2) : !reader.IsDBNull(4) ? reader.GetInt64(4) : !reader.IsDBNull(6) ? reader.GetInt64(6) : null,
                subjectName = !reader.IsDBNull(3) ? reader.GetString(3) : !reader.IsDBNull(5) ? reader.GetString(5) : !reader.IsDBNull(7) ? reader.GetString(7) : reader.IsDBNull(8) ? "" : reader.GetString(8),
                department = reader.IsDBNull(8) ? null : reader.GetString(8), permissionLevel = reader.GetString(9),
                grantedByName = reader.GetString(10), createdAt = reader.GetDateTimeOffset(11) });
        return Results.Ok(new { items });
    }

    private static async Task<IResult> GrantDocumentPermissionAsync(
        long id, PermissionRequest body, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_permissions", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var subjectType = (body.SubjectType ?? string.Empty).Trim();
        if (subjectType is not ("User" or "Role" or "Department" or "Project")) throw Invalid("Subject type is invalid.");
        var level = (body.PermissionLevel ?? string.Empty).Trim();
        if (level is not ("View" or "Download" or "Comment" or "Edit" or "Review" or "Approve" or "Manage"))
            throw Invalid("Permission level is invalid.");
        var department = (body.Department ?? string.Empty).Trim();
        if (subjectType == "Department") InputValidation.RequiredText(department, 200, "Department");
        else if (body.SubjectId is null or <= 0) throw Invalid("A subject is required.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            long permissionId;
            await using (var insert = new SqlCommand("""
                IF NOT EXISTS (SELECT 1 FROM dbo.knowledge_documents WHERE id = @document)
                    THROW 51183, 'Document was not found.', 1;
                INSERT INTO dbo.knowledge_document_permissions(
                    document_id, subject_type, subject_user_id, subject_role_id,
                    subject_project_id, subject_department_code, permission_level, granted_by)
                OUTPUT inserted.id
                SELECT @document, @type,
                       CASE WHEN @type = N'User' THEN @subject_id END,
                       CASE WHEN @type = N'Role' THEN @subject_id END,
                       CASE WHEN @type = N'Project' THEN @subject_id END,
                       CASE WHEN @type = N'Department' THEN @department END,
                       @level, @actor
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.knowledge_document_permissions p
                    WHERE p.document_id = @document AND p.subject_type = @type AND p.permission_level = @level
                      AND ISNULL(p.subject_user_id, -1) = ISNULL(CASE WHEN @type = N'User' THEN @subject_id END, -1)
                      AND ISNULL(p.subject_role_id, -1) = ISNULL(CASE WHEN @type = N'Role' THEN @subject_id END, -1)
                      AND ISNULL(p.subject_project_id, -1) = ISNULL(CASE WHEN @type = N'Project' THEN @subject_id END, -1)
                      AND ISNULL(p.subject_department_code, N'') = ISNULL(CASE WHEN @type = N'Department' THEN @department END, N''));
                """, connection, transaction))
            {
                insert.Parameters.AddParameter("@document", SqlDbType.BigInt, id);
                insert.Parameters.AddParameter("@type", SqlDbType.NVarChar, subjectType, 20);
                insert.Parameters.AddParameter("@subject_id", SqlDbType.BigInt, body.SubjectId);
                insert.Parameters.AddParameter("@department", SqlDbType.NVarChar, department.Length == 0 ? null : department, 200);
                insert.Parameters.AddParameter("@level", SqlDbType.NVarChar, level, 20);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                var result = await insert.ExecuteScalarAsync(cancellationToken);
                if (result is not long created) throw new ApiException(StatusCodes.Status409Conflict, "permission_exists", "That permission already exists.");
                permissionId = created;
            }
            await AuditAsync(connection, transaction, id, null, actor, "ChangePermission", null,
                $"{{\"permissionId\":{permissionId},\"subjectType\":\"{Escape(subjectType)}\",\"level\":\"{Escape(level)}\"}}",
                "Permission granted", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/knowledge/documents/{id}/permissions/{permissionId}", new { id = permissionId });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> RevokeDocumentPermissionAsync(
        long id, long permissionId, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.manage_permissions", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using (var delete = new SqlCommand(
                "DELETE FROM dbo.knowledge_document_permissions WHERE id = @permission AND document_id = @document; SELECT @@ROWCOUNT;",
                connection, transaction))
            {
                delete.Parameters.AddParameter("@permission", SqlDbType.BigInt, permissionId);
                delete.Parameters.AddParameter("@document", SqlDbType.BigInt, id);
                if (Convert.ToInt32(await delete.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) != 1)
                    return Results.NotFound();
            }
            await AuditAsync(connection, transaction, id, null, actor, "ChangePermission",
                $"{{\"permissionId\":{permissionId}}}", null, "Permission revoked", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.NoContent();
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    // -----------------------------------------------------------------
    // Knowledge articles. Content is stored and rendered as plain text/Markdown;
    // the client never injects it as HTML, so no unsafe editor surface exists.
    // -----------------------------------------------------------------
    private static async Task<IResult> ListArticlesAsync(
        HttpRequest request, SqlConnectionFactory connections, CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        var search = (request.Query["search"].FirstOrDefault() ?? string.Empty).Trim();
        InputValidation.OptionalText(search, 200, "Search");
        var articleType = (request.Query["articleType"].FirstOrDefault() ?? string.Empty).Trim();
        if (articleType.Length > 0 && !ArticleTypes.Contains(articleType, StringComparer.Ordinal)) throw Invalid("Article type is invalid.");
        var status = (request.Query["status"].FirstOrDefault() ?? string.Empty).Trim();
        var includeArchived = string.Equals(request.Query["includeArchived"].FirstOrDefault(), "true", StringComparison.OrdinalIgnoreCase);
        var page = int.TryParse(request.Query["page"], out var parsedPage) ? Math.Max(1, parsedPage) : 1;
        var pageSize = int.TryParse(request.Query["pageSize"], out var parsedPageSize) ? Math.Clamp(parsedPageSize, 1, 100) : 50;

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT a.id, a.slug, a.title, a.summary, a.article_type, a.category_id, c.name_en,
                   a.owner_id, ao.name, a.status, a.confidentiality, a.language, a.tags, a.review_date,
                   a.helpful_count, a.not_helpful_count, a.view_count, a.updated_at,
                   COUNT_BIG(*) OVER() AS total_count
            FROM dbo.knowledge_articles a
            INNER JOIN dbo.knowledge_categories c ON c.id = a.category_id
            INNER JOIN dbo.users ao ON ao.id = a.owner_id
            WHERE {ArticleVisibilityPredicate}
              AND (@include_archived = 1 OR a.archived_at IS NULL)
              AND (@type = N'' OR a.article_type = @type)
              AND (@status = N'' OR a.status = @status)
              AND (@search = N'' OR a.title LIKE N'%' + @search + N'%'
                   OR a.summary LIKE N'%' + @search + N'%'
                   OR a.content LIKE N'%' + @search + N'%'
                   OR a.tags LIKE N'%' + @search + N'%'
                   OR ao.name LIKE N'%' + @search + N'%'
                   OR c.name_en LIKE N'%' + @search + N'%')
            ORDER BY a.updated_at DESC, a.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        AddVisibilityParameters(command, actor, canManage);
        command.Parameters.AddParameter("@include_archived", SqlDbType.Bit, includeArchived);
        command.Parameters.AddParameter("@type", SqlDbType.NVarChar, articleType, 40);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, search, 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);
        var items = new List<object>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(18);
            items.Add(new { id = reader.GetInt64(0), slug = reader.GetString(1), title = reader.GetString(2),
                summary = reader.GetString(3), articleType = reader.GetString(4), categoryId = reader.GetInt64(5),
                categoryName = reader.GetString(6), ownerId = reader.GetInt64(7), ownerName = reader.GetString(8),
                status = reader.GetString(9), confidentiality = reader.GetString(10), language = reader.GetString(11),
                tags = reader.GetString(12), reviewDate = reader.IsDBNull(13) ? null : reader.GetDateTime(13).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                helpfulCount = reader.GetInt32(14), notHelpfulCount = reader.GetInt32(15), viewCount = reader.GetInt32(16),
                updatedAt = reader.GetDateTimeOffset(17) });
        }
        return Results.Ok(new { items, page, pageSize, total });
    }

    private static async Task<IResult> GetArticleAsync(
        long id, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        object? item;
        await using (var command = new SqlCommand($"""
            SELECT a.id, a.slug, a.title, a.summary, a.content, a.article_type, a.category_id, c.name_en,
                   a.owner_id, ao.name, a.status, a.confidentiality, a.language, a.tags, a.review_date,
                   a.helpful_count, a.not_helpful_count, a.view_count, a.created_at, a.updated_at,
                   CONVERT(varchar(24), a.row_version, 2)
            FROM dbo.knowledge_articles a
            INNER JOIN dbo.knowledge_categories c ON c.id = a.category_id
            INNER JOIN dbo.users ao ON ao.id = a.owner_id
            WHERE a.id = @id AND {ArticleVisibilityPredicate};
            """, connection, transaction))
        {
            AddVisibilityParameters(command, actor, canManage);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return Results.NotFound();
            item = new { id = reader.GetInt64(0), slug = reader.GetString(1), title = reader.GetString(2),
                summary = reader.GetString(3), content = reader.GetString(4), articleType = reader.GetString(5),
                categoryId = reader.GetInt64(6), categoryName = reader.GetString(7), ownerId = reader.GetInt64(8),
                ownerName = reader.GetString(9), status = reader.GetString(10), confidentiality = reader.GetString(11),
                language = reader.GetString(12), tags = reader.GetString(13),
                reviewDate = reader.IsDBNull(14) ? null : reader.GetDateTime(14).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                helpfulCount = reader.GetInt32(15), notHelpfulCount = reader.GetInt32(16), viewCount = reader.GetInt32(17) + 1,
                createdAt = reader.GetDateTimeOffset(18), updatedAt = reader.GetDateTimeOffset(19), rowVersion = reader.GetString(20) };
        }
        await using (var update = new SqlCommand(
            "UPDATE dbo.knowledge_articles SET view_count = view_count + 1 WHERE id = @id;", connection, transaction))
        {
            update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            await update.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
        return Results.Ok(item);
    }

    private static async Task<IResult> CreateArticleAsync(
        ArticleRequest body, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.upload", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var value = ValidateArticle(body, actor.Id);
        var slugBase = Slugify(value.Title);
        var slug = $"{slugBase}-{Guid.NewGuid():N}"[..(slugBase.Length + 9)];
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            long id;
            await using (var insert = new SqlCommand("""
                IF NOT EXISTS (SELECT 1 FROM dbo.knowledge_categories WHERE id = @category AND is_active = 1)
                    THROW 51184, 'Category was not found.', 1;
                INSERT INTO dbo.knowledge_articles(
                    slug, title, summary, content, article_type, category_id, owner_id, status,
                    confidentiality, language, tags, review_date, created_by, updated_by)
                OUTPUT inserted.id
                VALUES (@slug, @title, @summary, @content, @type, @category, @owner, @status,
                        @confidentiality, @language, @tags, @review_date, @actor, @actor);
                """, connection, transaction))
            {
                AddArticleParameters(insert, value, actor.Id, slug);
                id = (long)(await insert.ExecuteScalarAsync(cancellationToken))!;
            }
            await AuditArticleAsync(connection, transaction, id, actor, "Create", null,
                $"{{\"title\":\"{Escape(value.Title)}\"}}", "Article created", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/knowledge/articles/{id}", new { id, slug });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> UpdateArticleAsync(
        long id, ArticleRequest body, SqlConnectionFactory connections, CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.edit", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        var value = ValidateArticle(body, actor.Id);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using (var update = new SqlCommand("""
                UPDATE dbo.knowledge_articles
                   SET title = @title, summary = @summary, content = @content, article_type = @type,
                       category_id = @category, owner_id = @owner, status = @status,
                       confidentiality = @confidentiality, language = @language, tags = @tags,
                       review_date = @review_date, archived_at = CASE WHEN @status = N'Archived' THEN COALESCE(archived_at, SYSUTCDATETIME()) ELSE NULL END,
                       updated_by = @actor, updated_at = SYSUTCDATETIME()
                 WHERE id = @id AND (owner_id = @actor OR @manage = 1);
                SELECT @@ROWCOUNT;
                """, connection, transaction))
            {
                AddArticleParameters(update, value, actor.Id, string.Empty);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
                update.Parameters.AddParameter("@manage", SqlDbType.Bit, canManage);
                if (Convert.ToInt32(await update.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) != 1)
                    return Results.NotFound();
            }
            await AuditArticleAsync(connection, transaction, id, actor, "EditMetadata", null,
                $"{{\"title\":\"{Escape(value.Title)}\",\"status\":\"{Escape(value.Status)}\"}}",
                "Article updated", cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(CancellationToken.None);
            throw;
        }
    }

    private static async Task<IResult> ArticleFeedbackAsync(
        long id, ArticleFeedbackRequest body, SqlConnectionFactory connections,
        CurrentUserService users, CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("knowledge.view", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = await HasPermissionAsync(users, "knowledge.manage_permissions", cancellationToken);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            UPDATE a
               SET helpful_count = helpful_count + CASE WHEN @helpful = 1 THEN 1 ELSE 0 END,
                   not_helpful_count = not_helpful_count + CASE WHEN @helpful = 0 THEN 1 ELSE 0 END
            FROM dbo.knowledge_articles a
            INNER JOIN dbo.users ao ON ao.id = a.owner_id
            WHERE a.id = @id AND {ArticleVisibilityPredicate};
            SELECT @@ROWCOUNT;
            """, connection);
        AddVisibilityParameters(command, actor, canManage);
        command.Parameters.AddParameter("@helpful", SqlDbType.Bit, body.Helpful);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        if (Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture) != 1)
            return Results.NotFound();
        return Results.Ok(new { id, helpful = body.Helpful });
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------
    private static CategoryValue ValidateCategory(CategoryRequest body)
    {
        var code = (body.Code ?? string.Empty).Trim().ToUpperInvariant();
        var nameEn = (body.NameEn ?? string.Empty).Trim();
        var nameTh = (body.NameTh ?? string.Empty).Trim();
        var nameJa = (body.NameJa ?? string.Empty).Trim();
        var documentType = string.IsNullOrWhiteSpace(body.DefaultDocumentType) ? null : body.DefaultDocumentType.Trim();
        var confidentiality = string.IsNullOrWhiteSpace(body.DefaultConfidentiality) ? "Company" : body.DefaultConfidentiality.Trim();
        InputValidation.RequiredText(code, 40, "Category code");
        InputValidation.RequiredText(nameEn, 200, "Category name");
        InputValidation.OptionalText(nameTh, 200, "Thai category name");
        InputValidation.OptionalText(nameJa, 200, "Japanese category name");
        if (documentType is not null && !DocumentTypes.Contains(documentType, StringComparer.Ordinal))
            throw Invalid("Default document type is invalid.");
        if (!Confidentialities.Contains(confidentiality, StringComparer.Ordinal))
            throw Invalid("Default confidentiality is invalid.");
        return new CategoryValue(body.ParentId, code, nameEn, nameTh, nameJa, documentType,
            confidentiality, Math.Clamp(body.SortOrder, -100_000, 100_000), body.IsActive);
    }

    private static void AddCategoryParameters(SqlCommand command, CategoryValue value, long actorId)
    {
        command.Parameters.AddParameter("@parent_id", SqlDbType.BigInt, value.ParentId);
        command.Parameters.AddParameter("@code", SqlDbType.NVarChar, value.Code, 40);
        command.Parameters.AddParameter("@name_en", SqlDbType.NVarChar, value.NameEn, 200);
        command.Parameters.AddParameter("@name_th", SqlDbType.NVarChar, value.NameTh, 200);
        command.Parameters.AddParameter("@name_ja", SqlDbType.NVarChar, value.NameJa, 200);
        command.Parameters.AddParameter("@document_type", SqlDbType.NVarChar, value.DefaultDocumentType, 30);
        command.Parameters.AddParameter("@confidentiality", SqlDbType.NVarChar, value.DefaultConfidentiality, 30);
        command.Parameters.AddParameter("@sort_order", SqlDbType.Int, value.SortOrder);
        command.Parameters.AddParameter("@active", SqlDbType.Bit, value.IsActive);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static NumberSequenceValue ValidateNumberSequence(NumberSequenceRequest body)
    {
        var prefix = (body.Prefix ?? string.Empty).Trim().ToUpperInvariant();
        var scope = (body.ScopeCode ?? string.Empty).Trim().ToUpperInvariant();
        var name = (body.ScopeName ?? string.Empty).Trim();
        InputValidation.RequiredText(prefix, 10, "Prefix");
        InputValidation.RequiredText(scope, 20, "Scope code");
        InputValidation.OptionalText(name, 200, "Scope name");
        if (body.LastNumber < 0 || body.LastNumber > 999_999) throw Invalid("Last number is outside the allowed range.");
        if (body.Padding is < 3 or > 6) throw Invalid("Padding must be between 3 and 6.");
        return new NumberSequenceValue(prefix, scope, name, body.LastNumber, body.Padding, body.IsActive);
    }

    private static void AddNumberSequenceParameters(SqlCommand command, NumberSequenceValue value)
    {
        command.Parameters.AddParameter("@prefix", SqlDbType.NVarChar, value.Prefix, 10);
        command.Parameters.AddParameter("@scope", SqlDbType.NVarChar, value.ScopeCode, 20);
        command.Parameters.AddParameter("@name", SqlDbType.NVarChar, value.ScopeName, 200);
        command.Parameters.AddParameter("@last", SqlDbType.Int, value.LastNumber);
        command.Parameters.AddParameter("@padding", SqlDbType.TinyInt, value.Padding);
        command.Parameters.AddParameter("@active", SqlDbType.Bit, value.IsActive);
    }

    private static ArticleValue ValidateArticle(ArticleRequest body, long defaultOwnerId)
    {
        var title = (body.Title ?? string.Empty).Trim();
        var summary = (body.Summary ?? string.Empty).Trim();
        var content = (body.Content ?? string.Empty).Trim();
        var articleType = string.IsNullOrWhiteSpace(body.ArticleType) ? "Technical Note" : body.ArticleType.Trim();
        var status = string.IsNullOrWhiteSpace(body.Status) ? "Draft" : body.Status.Trim();
        var confidentiality = string.IsNullOrWhiteSpace(body.Confidentiality) ? "Company" : body.Confidentiality.Trim();
        var language = string.IsNullOrWhiteSpace(body.Language) ? "EN" : body.Language.Trim().ToUpperInvariant();
        var tags = (body.Tags ?? string.Empty).Trim();
        InputValidation.RequiredText(title, 300, "Title");
        InputValidation.OptionalText(summary, 1000, "Summary");
        InputValidation.RequiredText(content, 1_000_000, "Content");
        InputValidation.OptionalText(tags, 500, "Tags");
        if (!ArticleTypes.Contains(articleType, StringComparer.Ordinal)) throw Invalid("Article type is invalid.");
        if (status is not ("Draft" or "In Review" or "Published" or "Archived")) throw Invalid("Article status is invalid.");
        if (!Confidentialities.Contains(confidentiality, StringComparer.Ordinal)) throw Invalid("Confidentiality is invalid.");
        if (language is not ("EN" or "TH" or "JA")) throw Invalid("Language must be EN, TH or JA.");
        if (body.CategoryId <= 0) throw Invalid("Category is required.");
        return new ArticleValue(title, summary, content, articleType, body.CategoryId,
            body.OwnerId is > 0 ? body.OwnerId.Value : defaultOwnerId, status, confidentiality,
            language, tags, ParseOptionalDate(body.ReviewDate, "Review date"));
    }

    private static void AddArticleParameters(SqlCommand command, ArticleValue value, long actorId, string slug)
    {
        command.Parameters.AddParameter("@slug", SqlDbType.NVarChar, slug, 200);
        command.Parameters.AddParameter("@title", SqlDbType.NVarChar, value.Title, 300);
        command.Parameters.AddParameter("@summary", SqlDbType.NVarChar, value.Summary, 1000);
        command.Parameters.AddParameter("@content", SqlDbType.NVarChar, value.Content, -1);
        command.Parameters.AddParameter("@type", SqlDbType.NVarChar, value.ArticleType, 40);
        command.Parameters.AddParameter("@category", SqlDbType.BigInt, value.CategoryId);
        command.Parameters.AddParameter("@owner", SqlDbType.BigInt, value.OwnerId);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, value.Status, 30);
        command.Parameters.AddParameter("@confidentiality", SqlDbType.NVarChar, value.Confidentiality, 30);
        command.Parameters.AddParameter("@language", SqlDbType.Char, value.Language, 2);
        command.Parameters.AddParameter("@tags", SqlDbType.NVarChar, value.Tags, 500);
        command.Parameters.AddParameter("@review_date", SqlDbType.Date, value.ReviewDate);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
    }

    private static string Slugify(string title)
    {
        var raw = new string(title.ToLowerInvariant().Select(character => char.IsLetterOrDigit(character) ? character : '-').ToArray());
        while (raw.Contains("--", StringComparison.Ordinal)) raw = raw.Replace("--", "-", StringComparison.Ordinal);
        raw = raw.Trim('-');
        if (raw.Length == 0) raw = "article";
        return raw[..Math.Min(180, raw.Length)];
    }

    private static async Task AuditArticleAsync(
        SqlConnection connection, SqlTransaction? transaction, long articleId, CurrentUser actor,
        string action, string? before, string? after, string reason, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.knowledge_audit_events(
                article_id, actor_id, actor_role, action, before_json, after_json, reason)
            VALUES (@article, @actor, @role, @action, @before, @after, @reason);
            """, connection, transaction);
        command.Parameters.AddParameter("@article", SqlDbType.BigInt, articleId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, actor.Role ?? string.Empty, 100);
        command.Parameters.AddParameter("@action", SqlDbType.NVarChar, action, 40);
        command.Parameters.AddParameter("@before", SqlDbType.NVarChar, before, -1);
        command.Parameters.AddParameter("@after", SqlDbType.NVarChar, after, -1);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, reason, 1000);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static void AddVisibilityParameters(SqlCommand command, CurrentUser actor, bool canManage)
    {
        command.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@my_department", SqlDbType.NVarChar, actor.Department ?? string.Empty, 200);
        command.Parameters.AddParameter("@can_manage", SqlDbType.Bit, canManage);
    }

    private static async Task<bool> HasPermissionAsync(CurrentUserService users, string permission, CancellationToken cancellationToken)
    {
        try
        {
            await users.DemandPermissionAsync(permission, cancellationToken);
            return true;
        }
        catch (ApiException exception) when (exception.StatusCode == StatusCodes.Status403Forbidden)
        {
            return false;
        }
    }

    private static async Task DemandDocumentEditorAsync(
        SqlConnection connection, SqlTransaction transaction, long documentId,
        CurrentUser actor, bool canManage, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT COUNT_BIG(*)
            FROM dbo.knowledge_documents d
            LEFT JOIN dbo.users me ON me.id = @me
            WHERE d.id = @id
              AND (
                    d.owner_id = @me
                 OR @manage = 1
                 OR EXISTS (
                        SELECT 1
                        FROM dbo.knowledge_document_permissions p
                        WHERE p.document_id = d.id
                          AND p.permission_level IN (N'Edit', N'Manage')
                          AND (
                                (p.subject_type = N'User' AND p.subject_user_id = @me)
                             OR (p.subject_type = N'Role' AND p.subject_role_id = me.role_id)
                             OR (p.subject_type = N'Department' AND p.subject_department_code = me.department)
                             OR (p.subject_type = N'Project' AND (
                                    EXISTS (
                                        SELECT 1 FROM dbo.projects project
                                        WHERE project.id = p.subject_project_id
                                          AND (project.manager_id = @me OR project.lead_engineer_id = @me)
                                    )
                                    OR EXISTS (
                                        SELECT 1 FROM dbo.project_members pm
                                        WHERE pm.project_id = p.subject_project_id AND pm.user_id = @me
                                    )
                                ))
                          )
                    )
              );
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, documentId);
        command.Parameters.AddParameter("@me", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@manage", SqlDbType.Bit, canManage);
        if ((long)(await command.ExecuteScalarAsync(cancellationToken))! != 1)
            throw new ApiException(StatusCodes.Status404NotFound, "document_not_found", "Document was not found or you cannot edit it.");
    }

    private static async Task<bool> RelatedEntityExistsAsync(
        SqlConnection connection, SqlTransaction transaction, string entityType, long entityId,
        CancellationToken cancellationToken)
    {
        var table = entityType switch
        {
            "Inquiry" => "inquiries", "Project" => "projects", "Estimate" => "estimates",
            "BOM" => "boms", "PR" => "mat_prs", "PO" => "mat_pos", "GoodsReceipt" => "grns",
            "MaterialIssue" => "mirs", "ItemMaster" => "mat_items", "Supplier" => "suppliers",
            "KnowledgeArticle" => "knowledge_articles", "Customer" => "customers",
            _ => throw Invalid("Entity type is not an allowed value.")
        };
        await using var command = new SqlCommand($"SELECT COUNT_BIG(*) FROM dbo.{table} WHERE id = @id;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, entityId);
        return (long)(await command.ExecuteScalarAsync(cancellationToken))! == 1;
    }

    private static async Task<(long DocumentId, string Status, long CreatedBy)> ReadVersionAsync(
        SqlConnection connection, SqlTransaction? transaction, long versionId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT document_id, status, created_by FROM dbo.knowledge_document_versions WHERE id = @v;",
            connection, transaction);
        command.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "version_not_found", "Revision was not found.");
        return (reader.GetInt64(0), reader.GetString(1), reader.GetInt64(2));
    }

    private static async Task UpdateVersionStatusAsync(
        SqlConnection connection, SqlTransaction transaction, long versionId, string status, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "UPDATE dbo.knowledge_document_versions SET status = @status WHERE id = @v;", connection, transaction);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task SetCurrentVersionAsync(
        SqlConnection connection, SqlTransaction transaction, long documentId, long versionId, string status, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            UPDATE dbo.knowledge_documents
               SET current_version_id = @v, current_status = @status, updated_at = SYSUTCDATETIME()
             WHERE id = @d;
            """, connection, transaction);
        command.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, status, 30);
        command.Parameters.AddParameter("@d", SqlDbType.BigInt, documentId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task InsertApprovalStepAsync(
        SqlConnection connection, SqlTransaction transaction, long versionId, int sequence,
        string stepType, long approverId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.knowledge_document_approvals(document_version_id, sequence, step_type, approver_id)
            VALUES (@v, @sequence, @step_type, @approver);
            """, connection, transaction);
        command.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
        command.Parameters.AddParameter("@sequence", SqlDbType.Int, sequence);
        command.Parameters.AddParameter("@step_type", SqlDbType.NVarChar, stepType, 20);
        command.Parameters.AddParameter("@approver", SqlDbType.BigInt, approverId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task AuditAsync(
        SqlConnection connection, SqlTransaction? transaction, long? documentId, long? versionId,
        CurrentUser actor, string action, string? before, string? after, string reason,
        CancellationToken cancellationToken, string? relatedEntityType = null, long? relatedEntityId = null)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.knowledge_audit_events(
                document_id, document_version_id, actor_id, actor_role, action,
                before_json, after_json, reason, related_entity_type, related_entity_id)
            VALUES (@d, @v, @actor, @role, @action, @before, @after, @reason, @related_type, @related_id);
            """, connection, transaction);
        command.Parameters.AddParameter("@d", SqlDbType.BigInt, documentId);
        command.Parameters.AddParameter("@v", SqlDbType.BigInt, versionId);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, actor.Role ?? string.Empty, 100);
        command.Parameters.AddParameter("@action", SqlDbType.NVarChar, action, 40);
        command.Parameters.AddParameter("@before", SqlDbType.NVarChar, before, -1);
        command.Parameters.AddParameter("@after", SqlDbType.NVarChar, after, -1);
        command.Parameters.AddParameter("@reason", SqlDbType.NVarChar, reason ?? string.Empty, 1000);
        command.Parameters.AddParameter("@related_type", SqlDbType.NVarChar, relatedEntityType, 30);
        command.Parameters.AddParameter("@related_id", SqlDbType.BigInt, relatedEntityId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static (string FileName, string ContentType, string StorageKey) ValidateFile(
        IFormFile file, DocumentStorageOptions storageOptions, ProjectDocumentStorage storage)
    {
        var fileName = Path.GetFileName(file.FileName.Replace('\\', '/'));
        InputValidation.RequiredText(fileName, 500, "File name");
        if (fileName.Any(char.IsControl) || file.Length <= 0)
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_file", "The uploaded file is invalid or empty.");
        if (file.Length > storageOptions.MaxFileSizeBytes)
            throw new ApiException(StatusCodes.Status413PayloadTooLarge, "file_too_large",
                $"The file limit is {storageOptions.MaxFileSizeBytes} bytes.");
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension) || !storageOptions.IsAllowedExtension(extension))
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "file_type_not_allowed",
                "Knowledge documents accept PDF, Word, Excel, PowerPoint, text, CSV, PNG and JPG files.");
        var declaredType = (file.ContentType ?? string.Empty).Split(';', 2)[0].Trim();
        if (declaredType.Length > 0 && AllowedMimeTypes.TryGetValue(extension, out var allowedTypes)
            && !allowedTypes.Contains(declaredType, StringComparer.OrdinalIgnoreCase))
            throw new ApiException(StatusCodes.Status415UnsupportedMediaType, "mime_type_mismatch",
                "The declared MIME type does not match the file extension.");
        var contentType = new FileExtensionContentTypeProvider().TryGetContentType(fileName, out var mapped)
            ? mapped
            : "application/octet-stream";
        return (fileName, contentType, storage.CreateKnowledgeStorageKey(extension));
    }

    private static string SafeName(string fileName)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(fileName.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).Trim();
        return cleaned.Length == 0 ? "document" : cleaned;
    }

    private static string Escape(string value) => value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private static long? ParseOptionalId(Microsoft.Extensions.Primitives.StringValues values, string field)
    {
        var raw = values.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (!long.TryParse(raw, out var parsed) || parsed <= 0) throw Invalid($"{field} is invalid.");
        return parsed;
    }

    private static DateOnly? ParseOptionalDate(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (!DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            throw Invalid($"{field} must use yyyy-MM-dd format.");
        return parsed;
    }

    private static string Required(Microsoft.Extensions.Primitives.StringValues values, string fieldName)
    {
        if (values.Count != 1 || string.IsNullOrWhiteSpace(values[0]))
            throw Invalid($"Multipart field '{fieldName}' is required exactly once.");
        return values[0]!;
    }

    private static string? Optional(Microsoft.Extensions.Primitives.StringValues values, string fieldName)
    {
        if (values.Count > 1) throw Invalid($"Multipart field '{fieldName}' may be supplied at most once.");
        return values.Count == 0 ? null : values[0];
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);

    public sealed record SubmitReviewRequest(IReadOnlyList<long>? ReviewerIds, long ApproverId, string? Comment);
    public sealed record DecisionRequest(string? Decision, string? Comment);
    public sealed record PublishRequest(string? EffectiveDate, string? ExpiryDate, string? Comment);
    public sealed record LinkRequest(string? EntityType, long EntityId, string? RelationType);
    public sealed record AssignAcknowledgementRequest(IReadOnlyList<long>? UserIds, string? DueAt);
    public sealed record CategoryRequest(long? ParentId, string? Code, string? NameEn, string? NameTh,
        string? NameJa, string? DefaultDocumentType, string? DefaultConfidentiality, int SortOrder, bool IsActive = true);
    public sealed record NumberSequenceRequest(string? Prefix, string? ScopeCode, string? ScopeName,
        int LastNumber, byte Padding = 4, bool IsActive = true);
    public sealed record ArchiveRequest(string? Reason);
    public sealed record WorkingStatusRequest(string? Status, string? Reason);
    public sealed record CommentRequest(string? Content, long? VersionId, long? ParentCommentId,
        IReadOnlyList<long>? MentionedUserIds);
    public sealed record CommentResolutionRequest(bool Resolved);
    public sealed record PermissionRequest(string? SubjectType, long? SubjectId, string? Department, string? PermissionLevel);
    public sealed record ArticleRequest(string? Title, string? Summary, string? Content, string? ArticleType,
        long CategoryId, long? OwnerId, string? Status, string? Confidentiality, string? Language,
        string? Tags, string? ReviewDate);
    public sealed record ArticleFeedbackRequest(bool Helpful);

    private sealed record CategoryValue(long? ParentId, string Code, string NameEn, string NameTh,
        string NameJa, string? DefaultDocumentType, string DefaultConfidentiality, int SortOrder, bool IsActive);
    private sealed record NumberSequenceValue(string Prefix, string ScopeCode, string ScopeName,
        int LastNumber, byte Padding, bool IsActive);
    private sealed record ArticleValue(string Title, string Summary, string Content, string ArticleType,
        long CategoryId, long OwnerId, string Status, string Confidentiality, string Language,
        string Tags, DateOnly? ReviewDate);
}
