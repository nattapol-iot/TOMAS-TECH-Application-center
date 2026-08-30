using System.Data;
using System.Globalization;
using System.Net.Mail;
using System.Text.Json;
using IoTTeamCenter.Api.Infrastructure;
using IoTTeamCenter.Api.Models;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class MasterDataEndpoints
{
    private const decimal MaximumDecimal19Scale4 = 999_999_999_999_999.9999m;

    public static void MapMasterDataEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/master").RequireAuthorization();
        group.MapPost("/customers", CreateCustomerAsync);
        group.MapPost("/suppliers", CreateSupplierAsync);
        group.MapPost("/inventory-items", CreateInventoryItemAsync);
        group.MapPost("/engineering-rates", CreateEngineeringRateAsync);
    }

    private static async Task<IResult> CreateCustomerAsync(
        CreateCustomerRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = RequiredCode(request.Code, "Customer code", 30);
        var name = RequiredText(request.Name, "Customer name", 300);
        var contact = OptionalText(request.Contact, "Contact", 200);
        var email = Email(request.Email);
        var phone = OptionalText(request.Phone, "Phone", 100);
        var industry = OptionalText(request.Industry, "Industry", 200);
        var site = OptionalText(request.Site, "Site", 300);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.customers (
                    code, name, contact, email, phone, industry, site, created_by, updated_by)
                OUTPUT inserted.id, inserted.code, inserted.name, inserted.row_version
                VALUES (
                    @code, @name, @contact, @email, @phone, @industry, @site, @actor, @actor);
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 30);
            command.Parameters.AddParameter("@name", SqlDbType.NVarChar, name, 300);
            command.Parameters.AddParameter("@contact", SqlDbType.NVarChar, contact, 200);
            command.Parameters.AddParameter("@email", SqlDbType.NVarChar, email, 256);
            command.Parameters.AddParameter("@phone", SqlDbType.NVarChar, phone, 100);
            command.Parameters.AddParameter("@industry", SqlDbType.NVarChar, industry, 200);
            command.Parameters.AddParameter("@site", SqlDbType.NVarChar, site, 300);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

            var created = await ReadCreatedNamedAsync(command, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Customer", created.Id, created.Code, "Created", null,
                new { created.Code, created.Name, contact, email, phone, industry, site }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/master/customers/{created.Id}", new
            {
                id = created.Id,
                code = created.Code,
                name = created.Name,
                rowVersion = Convert.ToBase64String(created.RowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> CreateSupplierAsync(
        CreateSupplierRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = RequiredCode(request.Code, "Supplier code", 30);
        var name = RequiredText(request.Name, "Supplier name", 300);
        var category = RequiredText(request.Category, "Supplier category", 100);
        var contact = OptionalText(request.Contact, "Contact", 200);
        var email = Email(request.Email);
        var phone = OptionalText(request.Phone, "Phone", 100);
        var brands = Brands(request.Brands);
        var brandsJson = JsonSerializer.Serialize(brands);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.suppliers (
                    code, name, category, contact, email, phone, brands_json, created_by, updated_by)
                OUTPUT inserted.id, inserted.code, inserted.name, inserted.row_version
                VALUES (
                    @code, @name, @category, @contact, @email, @phone, @brands_json, @actor, @actor);
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 30);
            command.Parameters.AddParameter("@name", SqlDbType.NVarChar, name, 300);
            command.Parameters.AddParameter("@category", SqlDbType.NVarChar, category, 100);
            command.Parameters.AddParameter("@contact", SqlDbType.NVarChar, contact, 200);
            command.Parameters.AddParameter("@email", SqlDbType.NVarChar, email, 256);
            command.Parameters.AddParameter("@phone", SqlDbType.NVarChar, phone, 100);
            command.Parameters.AddParameter("@brands_json", SqlDbType.NVarChar, brandsJson, -1);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

            var created = await ReadCreatedNamedAsync(command, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Supplier", created.Id, created.Code, "Created", null,
                new { created.Code, created.Name, category, contact, email, phone, brands }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/master/suppliers/{created.Id}", new
            {
                id = created.Id,
                code = created.Code,
                name = created.Name,
                rowVersion = Convert.ToBase64String(created.RowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> CreateInventoryItemAsync(
        CreateInventoryItemRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = RequiredCode(request.ItemCode, "Item code", 100);
        var partNumber = OptionalText(request.PartNumber, "Part number", 200);
        var description = RequiredText(request.Description, "Description", 500);
        var brand = OptionalText(request.Brand, "Brand", 100);
        var unit = RequiredText(request.Unit, "Unit", 50);
        var location = OptionalText(request.Location, "Location", 100);
        var reorderLevel = NonnegativeDecimal(request.ReorderLevel, "Reorder level");
        var averageUnitCost = NonnegativeDecimal(request.AverageUnitCost, "Average unit cost");
        if (request.LeadTimeDays < 0)
            throw Validation("Lead time days cannot be negative.");
        if (request.PreferredSupplierId is <= 0)
            throw Validation("Preferred supplier id must be a positive number.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            if (request.PreferredSupplierId is { } supplierId)
                await DemandActiveSupplierAsync(connection, transaction, supplierId, cancellationToken);

            await using var command = new SqlCommand("""
                INSERT INTO dbo.mat_items (
                    item_code, part_no, description, brand, unit, location, reorder_level,
                    avg_unit_cost, lead_time_days, preferred_supplier_id, created_by, updated_by)
                OUTPUT inserted.id, inserted.item_code, inserted.description, inserted.row_version
                VALUES (
                    @code, @part_number, @description, @brand, @unit, @location, @reorder_level,
                    @average_unit_cost, @lead_time_days, @preferred_supplier_id, @actor, @actor);
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 100);
            command.Parameters.AddParameter("@part_number", SqlDbType.NVarChar, partNumber, 200);
            command.Parameters.AddParameter("@description", SqlDbType.NVarChar, description, 500);
            command.Parameters.AddParameter("@brand", SqlDbType.NVarChar, brand, 100);
            command.Parameters.AddParameter("@unit", SqlDbType.NVarChar, unit, 50);
            command.Parameters.AddParameter("@location", SqlDbType.NVarChar, location, 100);
            command.Parameters.AddParameter("@reorder_level", SqlDbType.Decimal, reorderLevel, precision: 19, scale: 4);
            command.Parameters.AddParameter("@average_unit_cost", SqlDbType.Decimal, averageUnitCost, precision: 19, scale: 4);
            command.Parameters.AddParameter("@lead_time_days", SqlDbType.Int, request.LeadTimeDays);
            command.Parameters.AddParameter("@preferred_supplier_id", SqlDbType.BigInt, request.PreferredSupplierId);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

            var created = await ReadCreatedNamedAsync(command, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "InventoryItem", created.Id,
                created.Id.ToString(CultureInfo.InvariantCulture), "Created", null,
                new
                {
                    itemCode = created.Code,
                    partNumber,
                    description = created.Name,
                    brand,
                    unit,
                    location,
                    reorderLevel,
                    averageUnitCost,
                    request.LeadTimeDays,
                    request.PreferredSupplierId
                }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/master/inventory-items/{created.Id}", new
            {
                id = created.Id,
                code = created.Code,
                name = created.Name,
                rowVersion = Convert.ToBase64String(created.RowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> CreateEngineeringRateAsync(
        CreateEngineeringRateRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var level = RequiredText(request.Level, "Engineering level", 100);
        var department = RequiredText(request.Department, "Department", 100);
        var engineeringHourly = NonnegativeDecimal(request.EngineeringHourly, "Engineering hourly rate");
        var engineeringDaily = NonnegativeDecimal(request.EngineeringDaily, "Engineering daily rate");
        var installationHourly = NonnegativeDecimal(request.InstallationHourly, "Installation hourly rate");
        var installationDaily = NonnegativeDecimal(request.InstallationDaily, "Installation daily rate");
        if (request.EffectiveTo is { } effectiveTo && effectiveTo < request.EffectiveFrom)
            throw Validation("Effective-to date cannot be earlier than effective-from date.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        try
        {
            await DemandNoRateOverlapAsync(
                connection, transaction, level, department, request.EffectiveFrom, request.EffectiveTo, cancellationToken);

            await using var command = new SqlCommand("""
                INSERT INTO dbo.engineering_rates (
                    level, department, engineering_hourly, engineering_daily,
                    installation_hourly, installation_daily, effective_from, effective_to, created_by)
                OUTPUT inserted.id, inserted.level, inserted.department, inserted.row_version
                VALUES (
                    @level, @department, @engineering_hourly, @engineering_daily,
                    @installation_hourly, @installation_daily, @effective_from, @effective_to, @actor);
                """, connection, transaction);
            command.Parameters.AddParameter("@level", SqlDbType.NVarChar, level, 100);
            command.Parameters.AddParameter("@department", SqlDbType.NVarChar, department, 100);
            command.Parameters.AddParameter("@engineering_hourly", SqlDbType.Decimal, engineeringHourly, precision: 19, scale: 4);
            command.Parameters.AddParameter("@engineering_daily", SqlDbType.Decimal, engineeringDaily, precision: 19, scale: 4);
            command.Parameters.AddParameter("@installation_hourly", SqlDbType.Decimal, installationHourly, precision: 19, scale: 4);
            command.Parameters.AddParameter("@installation_daily", SqlDbType.Decimal, installationDaily, precision: 19, scale: 4);
            command.Parameters.AddParameter("@effective_from", SqlDbType.Date, request.EffectiveFrom);
            command.Parameters.AddParameter("@effective_to", SqlDbType.Date, request.EffectiveTo);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

            long id;
            string createdLevel;
            string createdDepartment;
            byte[] rowVersion;
            await using (var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                id = reader.GetInt64(0);
                createdLevel = reader.GetString(1);
                createdDepartment = reader.GetString(2);
                rowVersion = (byte[])reader.GetValue(3);
            }

            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "EngineeringRate", id,
                id.ToString(CultureInfo.InvariantCulture), "Created", null,
                new
                {
                    level = createdLevel,
                    department = createdDepartment,
                    engineeringHourly,
                    engineeringDaily,
                    installationHourly,
                    installationDaily,
                    request.EffectiveFrom,
                    request.EffectiveTo
                }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/master/engineering-rates/{id}", new
            {
                id,
                level = createdLevel,
                department = createdDepartment,
                rowVersion = Convert.ToBase64String(rowVersion)
            });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<(long Id, string Code, string Name, byte[] RowVersion)> ReadCreatedNamedAsync(
        SqlCommand command,
        CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new InvalidOperationException("The database did not return the created master record.");
        return (reader.GetInt64(0), reader.GetString(1), reader.GetString(2), (byte[])reader.GetValue(3));
    }

    private static async Task DemandActiveSupplierAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long supplierId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.suppliers
                WHERE id = @supplier_id AND is_active = 1 AND deleted_at IS NULL
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@supplier_id", SqlDbType.BigInt, supplierId);
        if ((bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false)) return;
        throw new ApiException(StatusCodes.Status400BadRequest, "invalid_supplier", "Preferred supplier must reference an active supplier.");
    }

    private static async Task DemandNoRateOverlapAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        string level,
        string department,
        DateOnly effectiveFrom,
        DateOnly? effectiveTo,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.engineering_rates WITH (UPDLOCK, HOLDLOCK, INDEX(IX_engineering_rates_effective_range))
                WHERE is_active = 1
                  AND level = @level
                  AND department = @department
                  AND effective_from <= ISNULL(@effective_to, CONVERT(date, '99991231', 112))
                  AND @effective_from <= ISNULL(effective_to, CONVERT(date, '99991231', 112))
            ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END;
            """, connection, transaction);
        command.Parameters.AddParameter("@level", SqlDbType.NVarChar, level, 100);
        command.Parameters.AddParameter("@department", SqlDbType.NVarChar, department, 100);
        command.Parameters.AddParameter("@effective_from", SqlDbType.Date, effectiveFrom);
        command.Parameters.AddParameter("@effective_to", SqlDbType.Date, effectiveTo);
        if (!(bool)(await command.ExecuteScalarAsync(cancellationToken) ?? false)) return;
        throw new ApiException(
            StatusCodes.Status409Conflict,
            "engineering_rate_overlap",
            "An active engineering rate already covers part of this level, department and date range.");
    }

    private static string RequiredCode(string? value, string field, int maximumLength)
    {
        var code = RequiredText(value, field, maximumLength).ToUpperInvariant();
        if (!IsAsciiLetterOrDigit(code[0]) || code.Any(character =>
                !IsAsciiLetterOrDigit(character) && character is not '-' and not '_' and not '.' and not '/'))
            throw Validation($"{field} may contain only letters, numbers, hyphen, underscore, period and slash, and must start with a letter or number.");
        return code;
    }

    private static bool IsAsciiLetterOrDigit(char value) =>
        value is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9';

    private static string RequiredText(string? value, string field, int maximumLength)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (trimmed.Length == 0) throw Validation($"{field} is required.");
        if (trimmed.Length > maximumLength) throw Validation($"{field} cannot exceed {maximumLength} characters.");
        return trimmed;
    }

    private static string OptionalText(string? value, string field, int maximumLength)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (trimmed.Length > maximumLength) throw Validation($"{field} cannot exceed {maximumLength} characters.");
        return trimmed;
    }

    private static string Email(string? value)
    {
        var email = OptionalText(value, "Email", 256);
        if (email.Length == 0) return email;
        if (!MailAddress.TryCreate(email, out var parsed) || !string.Equals(parsed.Address, email, StringComparison.OrdinalIgnoreCase))
            throw Validation("Email must be a valid address without a display name.");
        return email;
    }

    private static IReadOnlyList<string> Brands(IReadOnlyList<string>? values)
    {
        if (values is null) return [];
        if (values.Count > 100) throw Validation("Brands cannot contain more than 100 entries.");
        var brands = new List<string>(values.Count);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var value in values)
        {
            var brand = RequiredText(value, "Brand", 100);
            if (seen.Add(brand)) brands.Add(brand);
        }
        return brands;
    }

    private static decimal NonnegativeDecimal(decimal value, string field)
    {
        if (value < 0) throw Validation($"{field} cannot be negative.");
        if (value > MaximumDecimal19Scale4) throw Validation($"{field} exceeds the supported amount.");
        if (decimal.Round(value, 4) != value) throw Validation($"{field} cannot have more than four decimal places.");
        return value;
    }

    private static ApiException Validation(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
