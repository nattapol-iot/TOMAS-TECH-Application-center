using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class ProjectEndpoints
{
    private static readonly (string Code, string Name)[] StandardFolders =
    [
        ("00", "To do list"),
        ("01", "Concept Design and Proposal"),
        ("02", "Drawing"),
        ("03", "Estimate cost"),
        ("04", "Quote"),
        ("05", "PO"),
        ("06", "Specifications and Documentation"),
        ("07", "Development"),
        ("08", "Schedule"),
        ("09", "Installation"),
        ("10", "Report"),
        ("11", "Manual and Document"),
        ("12", "DATA & EXAMPLE"),
        ("13", "Pic and Video"),
        ("14", "Ref")
    ];

    public static void MapProjectEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/projects").RequireAuthorization();
        group.MapGet("/", ListAsync);
        group.MapPost("/", CreateAsync);
    }

    private static async Task<IResult> ListAsync(
        int page,
        int pageSize,
        string? search,
        string? status,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("project.read", cancellationToken);
        InputValidation.OptionalText(search, 200, "Search");
        InputValidation.OptionalText(status, 50, "Status");
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize == 0 ? 25 : pageSize, 1, 100);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT p.id, p.project_no, p.name, c.name, p.status, p.project_type, u.name,
                   p.start_date, p.target_delivery, p.progress, p.updated_at, p.row_version,
                   COUNT_BIG(*) OVER()
            FROM dbo.projects p
            INNER JOIN dbo.customers c ON c.id = p.customer_id
            INNER JOIN dbo.users u ON u.id = p.manager_id
            WHERE p.deleted_at IS NULL
              AND (@status IS NULL OR p.status = @status)
              AND (@search IS NULL OR p.project_no LIKE N'%' + @search + N'%'
                   OR p.name LIKE N'%' + @search + N'%'
                   OR p.po_no LIKE N'%' + @search + N'%'
                   OR c.name LIKE N'%' + @search + N'%')
            ORDER BY p.updated_at DESC, p.id DESC
            OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY;
            """, connection);
        command.Parameters.AddParameter("@status", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(status) ? null : status.Trim(), 50);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, string.IsNullOrWhiteSpace(search) ? null : search.Trim(), 200);
        command.Parameters.AddParameter("@offset", SqlDbType.Int, (page - 1) * pageSize);
        command.Parameters.AddParameter("@page_size", SqlDbType.Int, pageSize);

        var items = new List<ProjectSummary>();
        long total = 0;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            total = reader.GetInt64(12);
            items.Add(new ProjectSummary(
                reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                reader.GetString(5), reader.GetString(6), reader.GetFieldValue<DateOnly>(7), reader.GetFieldValue<DateOnly>(8),
                reader.GetDecimal(9), reader.GetFieldValue<DateTimeOffset>(10), reader.RowVersionString(11)));
        }
        return Results.Ok(new PagedResult<ProjectSummary>(items, page, pageSize, total));
    }

    private static async Task<IResult> CreateAsync(
        CreateProjectRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        BusinessClock clock,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("project.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        if (request.EstimateId <= 0 || request.ManagerId <= 0 || request.LeadEngineerId <= 0 || string.IsNullOrWhiteSpace(request.PurchaseOrderNumber) || string.IsNullOrWhiteSpace(request.Site))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "Approved estimate, customer PO, manager and lead engineer are required.");
        InputValidation.RequiredText(request.PurchaseOrderNumber, 100, "Purchase order number");
        InputValidation.RequiredText(request.Site, 300, "Project site");
        InputValidation.OptionalText(request.Remark, 20_000, "Remark");
        var today = clock.Today;
        if (request.PurchaseOrderDate < today.AddYears(-10) || request.PurchaseOrderDate > today.AddDays(30)
            || request.StartDate < today.AddYears(-1) || request.StartDate > today.AddYears(5)
            || request.TargetDelivery < request.StartDate || request.TargetDelivery > request.StartDate.AddYears(10))
            throw new ApiException(StatusCodes.Status400BadRequest, "validation_failed", "PO, start and target delivery dates are outside the allowed project range.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await using (var validatePeople = new SqlCommand("""
                SELECT
                    (SELECT r.code FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
                     WHERE u.id=@manager_id AND u.is_active=1 AND u.deleted_at IS NULL),
                    (SELECT r.code FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id
                     WHERE u.id=@lead_id AND u.is_active=1 AND u.deleted_at IS NULL);
                """, connection, (SqlTransaction)transaction))
            {
                validatePeople.Parameters.AddParameter("@manager_id", SqlDbType.BigInt, request.ManagerId);
                validatePeople.Parameters.AddParameter("@lead_id", SqlDbType.BigInt, request.LeadEngineerId);
                await using var peopleReader = await validatePeople.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await peopleReader.ReadAsync(cancellationToken);
                var managerRole = peopleReader.IsDBNull(0) ? null : peopleReader.GetString(0);
                var leadRole = peopleReader.IsDBNull(1) ? null : peopleReader.GetString(1);
                if (managerRole is not ("Project Manager" or "Engineering Manager" or "Admin")
                    || leadRole is not ("Engineer" or "Engineering Manager" or "Admin"))
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "invalid_reference", "Manager and lead engineer must be active users with eligible roles.");
            }

            long customerId;
            long inquiryId;
            string estimateNo;
            string projectName;
            string projectType;
            await using (var lookup = new SqlCommand("""
                SELECT customer_id, inquiry_id, estimate_no, project_name, project_type
                FROM dbo.estimates WITH (UPDLOCK, HOLDLOCK)
                WHERE id = @id AND status IN (N'Approved', N'Locked') AND deleted_at IS NULL;
                """, connection, (SqlTransaction)transaction))
            {
                lookup.Parameters.AddParameter("@id", SqlDbType.BigInt, request.EstimateId);
                await using var reader = await lookup.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                if (!await reader.ReadAsync(cancellationToken))
                    throw new ApiException(StatusCodes.Status422UnprocessableEntity, "estimate_not_approved", "An approved estimate is required to create a project.");
                customerId = reader.GetInt64(0);
                inquiryId = reader.GetInt64(1);
                estimateNo = reader.GetString(2);
                projectName = reader.GetString(3);
                projectType = reader.GetString(4);
            }

            var number = await InquiryEndpoints.IssueNumberAsync(connection, (SqlTransaction)transaction, "PJ", request.StartDate, cancellationToken);
            long projectId;
            byte[] rowVersion;
            await using (var insert = new SqlCommand("""
                INSERT INTO dbo.projects (
                    project_no, name, customer_id, project_type, status, manager_id, lead_engineer_id,
                    inquiry_id, estimate_id, po_no, po_date, start_date, target_delivery, progress,
                    site, remark, folder_path, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (@number, @name, @customer_id, @project_type, N'Planning', @manager_id, @lead_id,
                    @inquiry_id, @estimate_id, @po_no, @po_date, @start_date, @target_delivery, 0,
                    @site, @remark, @folder_path, @actor, @actor);
                """, connection, (SqlTransaction)transaction))
            {
                insert.Parameters.AddParameter("@number", SqlDbType.NVarChar, number, 30);
                insert.Parameters.AddParameter("@name", SqlDbType.NVarChar, projectName, 300);
                insert.Parameters.AddParameter("@customer_id", SqlDbType.BigInt, customerId);
                insert.Parameters.AddParameter("@project_type", SqlDbType.NVarChar, projectType, 100);
                insert.Parameters.AddParameter("@manager_id", SqlDbType.BigInt, request.ManagerId);
                insert.Parameters.AddParameter("@lead_id", SqlDbType.BigInt, request.LeadEngineerId);
                insert.Parameters.AddParameter("@inquiry_id", SqlDbType.BigInt, inquiryId);
                insert.Parameters.AddParameter("@estimate_id", SqlDbType.BigInt, request.EstimateId);
                insert.Parameters.AddParameter("@po_no", SqlDbType.NVarChar, request.PurchaseOrderNumber.Trim(), 100);
                insert.Parameters.AddParameter("@po_date", SqlDbType.Date, request.PurchaseOrderDate);
                insert.Parameters.AddParameter("@start_date", SqlDbType.Date, request.StartDate);
                insert.Parameters.AddParameter("@target_delivery", SqlDbType.Date, request.TargetDelivery);
                insert.Parameters.AddParameter("@site", SqlDbType.NVarChar, request.Site.Trim(), 300);
                insert.Parameters.AddParameter("@remark", SqlDbType.NVarChar, request.Remark?.Trim(), -1);
                insert.Parameters.AddParameter("@folder_path", SqlDbType.NVarChar, $"IoT Team - Documents / Project - {request.StartDate.Year} / [{number}] {projectName}", 1000);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await using var reader = await insert.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
                await reader.ReadAsync(cancellationToken);
                projectId = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }

            await InsertMemberAsync(connection, (SqlTransaction)transaction, projectId, request.ManagerId, "Project Manager", actor.Id, cancellationToken);
            if (request.LeadEngineerId != request.ManagerId)
                await InsertMemberAsync(connection, (SqlTransaction)transaction, projectId, request.LeadEngineerId, "Lead Engineer", actor.Id, cancellationToken);

            foreach (var (code, name) in StandardFolders)
            {
                await using var folder = new SqlCommand("""
                    INSERT INTO dbo.project_folders (project_id, folder_code, name, storage_key, created_by)
                    VALUES (@project_id, @code, @name, N'', @actor);
                    """, connection, (SqlTransaction)transaction);
                folder.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
                folder.Parameters.AddParameter("@code", SqlDbType.Char, code, 2);
                folder.Parameters.AddParameter("@name", SqlDbType.NVarChar, name, 200);
                folder.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                await folder.ExecuteNonQueryAsync(cancellationToken);
            }

            await InquiryEndpoints.InsertAuditAsync(connection, (SqlTransaction)transaction, actor.Id, "Project", projectId, number, "Created from approved estimate", estimateNo, request, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/projects/{projectId}", new { id = projectId, number, rowVersion = Convert.ToBase64String(rowVersion), folderMetadataCreated = StandardFolders.Length });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task InsertMemberAsync(SqlConnection connection, SqlTransaction transaction, long projectId, long userId, string role, long actorId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            INSERT INTO dbo.project_members (project_id, user_id, role_on_project, created_by)
            VALUES (@project_id, @user_id, @role, @actor);
            """, connection, transaction);
        command.Parameters.AddParameter("@project_id", SqlDbType.BigInt, projectId);
        command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, userId);
        command.Parameters.AddParameter("@role", SqlDbType.NVarChar, role, 100);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actorId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }
}
