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
        group.MapPut("/customers/{id:long}", UpdateCustomerAsync);
        group.MapPost("/suppliers", CreateSupplierAsync);
        group.MapPost("/inventory-items", CreateInventoryItemAsync);
        group.MapPost("/engineering-rates", CreateEngineeringRateAsync);
        group.MapGet("/employees", ListEmployeesAsync);
        group.MapPost("/employees", CreateEmployeeAsync);
        group.MapPut("/employees/{id:long}", UpdateEmployeeAsync);
    }

    private static async Task<IResult> ListEmployeesAsync(
        string? search,
        bool activeOnly,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var normalizedSearch = OptionalText(search, "Search", 200);
        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            DECLARE @include_private bit = CASE WHEN EXISTS (
                SELECT 1
                FROM dbo.users permission_user
                INNER JOIN dbo.role_permissions role_permission ON role_permission.role_id = permission_user.role_id
                INNER JOIN dbo.permissions permission ON permission.id = role_permission.permission_id
                WHERE permission_user.id = @actor AND permission.code = N'master.write'
            ) THEN 1 ELSE 0 END;

            SELECT
                employee.id, employee.employee_no, employee.name_en, employee.name_th,
                employee.department, employee.job_title,
                CASE WHEN @include_private = 1 THEN employee.mobile ELSE N'' END,
                employee.email, employee.nickname,
                CASE WHEN @include_private = 1 THEN employee.birth_date ELSE NULL END,
                CASE WHEN @include_private = 1 THEN employee.uniform_size ELSE N'' END,
                CASE WHEN @include_private = 1 THEN employee.shoe_size ELSE N'' END,
                employee.start_work_date, employee.end_work_date, employee.position,
                employee.is_active, app_user.id,
                CASE WHEN app_user.entra_object_id IS NULL THEN NULL ELSE role.code END,
                CASE WHEN app_user.entra_object_id IS NULL THEN NULL ELSE app_user.is_active END,
                rate.engineering_daily, employee.updated_at, employee.row_version
            FROM dbo.employees employee
            LEFT JOIN dbo.users app_user
              ON app_user.deleted_at IS NULL
             AND ((employee.user_id IS NOT NULL AND app_user.id = employee.user_id)
                  OR (employee.user_id IS NULL AND app_user.email = employee.email))
            LEFT JOIN dbo.roles role ON role.id = app_user.role_id
            OUTER APPLY (
                SELECT TOP (1) engineering_rate.engineering_daily
                FROM dbo.engineering_rates engineering_rate
                WHERE engineering_rate.is_active = 1
                  AND engineering_rate.level = employee.position
                  AND engineering_rate.department = employee.department
                  AND engineering_rate.effective_from <= CONVERT(date, SYSUTCDATETIME())
                  AND (engineering_rate.effective_to IS NULL OR engineering_rate.effective_to >= CONVERT(date, SYSUTCDATETIME()))
                ORDER BY engineering_rate.effective_from DESC, engineering_rate.id DESC
            ) rate
            WHERE employee.deleted_at IS NULL
              AND (@active_only = 0 OR employee.is_active = 1)
              AND (@search = N'' OR employee.name_en LIKE N'%' + @search + N'%'
                   OR employee.name_th LIKE N'%' + @search + N'%'
                   OR employee.nickname LIKE N'%' + @search + N'%'
                   OR employee.email LIKE N'%' + @search + N'%'
                   OR employee.department LIKE N'%' + @search + N'%'
                   OR employee.position LIKE N'%' + @search + N'%'
                   OR CONVERT(nvarchar(20), employee.employee_no) = @search)
            ORDER BY employee.is_active DESC, employee.employee_no;
            """, connection);
        command.Parameters.AddParameter("@search", SqlDbType.NVarChar, normalizedSearch, 200);
        command.Parameters.AddParameter("@active_only", SqlDbType.Bit, activeOnly);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

        var items = new List<EmployeeSummary>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            items.Add(new EmployeeSummary(
                reader.GetInt64(0), reader.GetInt32(1), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
                reader.GetString(8), reader.IsDBNull(9) ? null : reader.GetFieldValue<DateOnly>(9),
                reader.GetString(10), reader.GetString(11), reader.GetFieldValue<DateOnly>(12),
                reader.IsDBNull(13) ? null : reader.GetFieldValue<DateOnly>(13), reader.GetString(14),
                reader.GetBoolean(15), reader.IsDBNull(16) ? null : reader.GetInt64(16),
                reader.IsDBNull(17) ? null : reader.GetString(17), reader.IsDBNull(18) ? null : reader.GetBoolean(18),
                reader.IsDBNull(19) ? null : reader.GetDecimal(19), reader.GetFieldValue<DateTimeOffset>(20),
                Convert.ToBase64String((byte[])reader.GetValue(21))));
        }
        return Results.Ok(items);
    }

    private static async Task<IResult> CreateEmployeeAsync(
        CreateEmployeeRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var input = ValidateEmployee(request.EmployeeNo, request.NameEn, request.NameTh, request.Department,
            request.JobTitle, request.Mobile, request.Email, request.Nickname, request.BirthDate,
            request.UniformSize, request.ShoeSize, request.StartWorkDate, request.EndWorkDate,
            request.Position, request.IsActive);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.employees (
                    employee_no, name_en, name_th, department, job_title, mobile, email, nickname,
                    birth_date, uniform_size, shoe_size, start_work_date, end_work_date, position,
                    user_id, is_active, created_by, updated_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES (
                    @employee_no, @name_en, @name_th, @department, @job_title, @mobile, @email, @nickname,
                    @birth_date, @uniform_size, @shoe_size, @start_work_date, @end_work_date, @position,
                    @user_id, @is_active, @actor, @actor);
                """, connection, transaction);
            AddEmployeeParameters(command, input);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            long id;
            byte[] rowVersion;
            await using (var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken))
            {
                await reader.ReadAsync(cancellationToken);
                id = reader.GetInt64(0);
                rowVersion = (byte[])reader.GetValue(1);
            }
            await SyncEmployeeDirectoryUserAsync(connection, transaction, id, cancellationToken);
            rowVersion = await ReadEmployeeRowVersionAsync(connection, transaction, id, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "Employee", id,
                input.EmployeeNo.ToString(CultureInfo.InvariantCulture), "Created", null, input, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/master/employees/{id}", new { id, input.EmployeeNo, input.NameEn, rowVersion = Convert.ToBase64String(rowVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> UpdateEmployeeAsync(
        long id,
        UpdateEmployeeRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        if (id <= 0) throw Validation("Employee id must be a positive number.");
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var input = ValidateEmployee(request.EmployeeNo, request.NameEn, request.NameTh, request.Department,
            request.JobTitle, request.Mobile, request.Email, request.Nickname, request.BirthDate,
            request.UniformSize, request.ShoeSize, request.StartWorkDate, request.EndWorkDate,
            request.Position, request.IsActive);
        var expectedVersion = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var before = await ReadEmployeeAuditAsync(connection, transaction, id, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "employee_not_found", "Employee was not found.");
            await using var command = new SqlCommand("""
                UPDATE dbo.employees SET
                    employee_no=@employee_no, name_en=@name_en, name_th=@name_th,
                    department=@department, job_title=@job_title, mobile=@mobile, email=@email,
                    nickname=@nickname, birth_date=@birth_date, uniform_size=@uniform_size,
                    shoe_size=@shoe_size, start_work_date=@start_work_date, end_work_date=@end_work_date,
                    position=@position, is_active=@is_active,
                    updated_by=@actor, updated_at=SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
                """, connection, transaction);
            AddEmployeeParameters(command, input);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedVersion);
            _ = (byte[]?)(await command.ExecuteScalarAsync(cancellationToken))
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This employee changed. Reload and try again.");
            await SyncEmployeeDirectoryUserAsync(connection, transaction, id, cancellationToken);
            var updatedVersion = await ReadEmployeeRowVersionAsync(connection, transaction, id, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "Employee", id,
                input.EmployeeNo.ToString(CultureInfo.InvariantCulture), "Updated", before, input, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, input.EmployeeNo, input.NameEn, rowVersion = Convert.ToBase64String(updatedVersion) });
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
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

    private static async Task<IResult> UpdateCustomerAsync(
        long id,
        UpdateCustomerRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        if (id <= 0) throw Validation("Customer id must be a positive number.");
        await users.DemandPermissionAsync("master.write", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = RequiredCode(request.Code, "Customer code", 30);
        var name = RequiredText(request.Name, "Customer name", 300);
        var contact = OptionalText(request.Contact, "Contact", 200);
        var email = Email(request.Email);
        var phone = OptionalText(request.Phone, "Phone", 100);
        var industry = OptionalText(request.Industry, "Industry", 200);
        var site = OptionalText(request.Site, "Site", 300);
        var expectedVersion = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var before = await ReadCustomerAuditAsync(connection, transaction, id, cancellationToken)
                ?? throw new ApiException(StatusCodes.Status404NotFound, "customer_not_found", "Customer was not found.");
            await using var command = new SqlCommand("""
                UPDATE dbo.customers SET
                    code=@code, name=@name, contact=@contact, email=@email, phone=@phone,
                    industry=@industry, site=@site, updated_by=@actor, updated_at=SYSUTCDATETIME()
                OUTPUT inserted.row_version
                WHERE id=@id AND deleted_at IS NULL AND row_version=@row_version;
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 30);
            command.Parameters.AddParameter("@name", SqlDbType.NVarChar, name, 300);
            command.Parameters.AddParameter("@contact", SqlDbType.NVarChar, contact, 200);
            command.Parameters.AddParameter("@email", SqlDbType.NVarChar, email, 256);
            command.Parameters.AddParameter("@phone", SqlDbType.NVarChar, phone, 100);
            command.Parameters.AddParameter("@industry", SqlDbType.NVarChar, industry, 200);
            command.Parameters.AddParameter("@site", SqlDbType.NVarChar, site, 300);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
            command.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, expectedVersion);
            var updatedVersion = (byte[]?)(await command.ExecuteScalarAsync(cancellationToken))
                ?? throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This customer changed. Reload and try again.");
            var after = new CustomerAuditSnapshot(code, name, contact, email, phone, industry, site);
            await InquiryEndpoints.InsertAuditAsync(
                connection, transaction, actor.Id, "Customer", id, code, "Updated", before, after, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id, code, name, rowVersion = Convert.ToBase64String(updatedVersion) });
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
                DECLARE @created TABLE (
                    id bigint NOT NULL,
                    level nvarchar(100) NOT NULL,
                    department nvarchar(100) NOT NULL,
                    row_version binary(8) NOT NULL
                );

                INSERT INTO dbo.engineering_rates (
                    level, department, engineering_hourly, engineering_daily,
                    installation_hourly, installation_daily, effective_from, effective_to, created_by)
                OUTPUT inserted.id, inserted.level, inserted.department, inserted.row_version
                    INTO @created (id, level, department, row_version)
                VALUES (
                    @level, @department, @engineering_hourly, @engineering_daily,
                    @installation_hourly, @installation_daily, @effective_from, @effective_to, @actor);

                SELECT id, level, department, row_version
                FROM @created;
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

    private static EmployeeInput ValidateEmployee(
        int employeeNo,
        string? nameEn,
        string? nameTh,
        string? department,
        string? jobTitle,
        string? mobile,
        string? email,
        string? nickname,
        DateOnly? birthDate,
        string? uniformSize,
        string? shoeSize,
        DateOnly startWorkDate,
        DateOnly? endWorkDate,
        string? position,
        bool isActive)
    {
        if (employeeNo <= 0) throw Validation("Employee number must be a positive number.");
        var normalizedEmail = RequiredText(email, "Email", 256).ToLowerInvariant();
        if (!MailAddress.TryCreate(normalizedEmail, out var parsed) || !string.Equals(parsed.Address, normalizedEmail, StringComparison.OrdinalIgnoreCase))
            throw Validation("Email must be a valid address without a display name.");
        if (birthDate is { } birth && birth >= startWorkDate)
            throw Validation("Birth date must be earlier than start-work date.");
        if (endWorkDate is { } end && end < startWorkDate)
            throw Validation("End-work date cannot be earlier than start-work date.");
        return new EmployeeInput(
            employeeNo,
            RequiredText(nameEn, "English name", 200),
            OptionalText(nameTh, "Thai name", 200),
            RequiredText(department, "Department", 100),
            RequiredText(jobTitle, "Job title", 500),
            OptionalText(mobile, "Mobile", 50),
            normalizedEmail,
            OptionalText(nickname, "Nickname", 100),
            birthDate,
            OptionalText(uniformSize, "Uniform size", 50),
            OptionalText(shoeSize, "Shoe size", 50),
            startWorkDate,
            endWorkDate,
            RequiredText(position, "Position", 100),
            isActive);
    }

    private static void AddEmployeeParameters(SqlCommand command, EmployeeInput input)
    {
        command.Parameters.AddParameter("@employee_no", SqlDbType.Int, input.EmployeeNo);
        command.Parameters.AddParameter("@name_en", SqlDbType.NVarChar, input.NameEn, 200);
        command.Parameters.AddParameter("@name_th", SqlDbType.NVarChar, input.NameTh, 200);
        command.Parameters.AddParameter("@department", SqlDbType.NVarChar, input.Department, 100);
        command.Parameters.AddParameter("@job_title", SqlDbType.NVarChar, input.JobTitle, 500);
        command.Parameters.AddParameter("@mobile", SqlDbType.NVarChar, input.Mobile, 50);
        command.Parameters.AddParameter("@email", SqlDbType.NVarChar, input.Email, 256);
        command.Parameters.AddParameter("@nickname", SqlDbType.NVarChar, input.Nickname, 100);
        command.Parameters.AddParameter("@birth_date", SqlDbType.Date, input.BirthDate);
        command.Parameters.AddParameter("@uniform_size", SqlDbType.NVarChar, input.UniformSize, 50);
        command.Parameters.AddParameter("@shoe_size", SqlDbType.NVarChar, input.ShoeSize, 50);
        command.Parameters.AddParameter("@start_work_date", SqlDbType.Date, input.StartWorkDate);
        command.Parameters.AddParameter("@end_work_date", SqlDbType.Date, input.EndWorkDate);
        command.Parameters.AddParameter("@position", SqlDbType.NVarChar, input.Position, 100);
        command.Parameters.AddParameter("@user_id", SqlDbType.BigInt, null);
        command.Parameters.AddParameter("@is_active", SqlDbType.Bit, input.IsActive);
    }

    private static async Task SyncEmployeeDirectoryUserAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long employeeId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "EXEC dbo.sync_employee_directory_user @employee_id=@employee_id;", connection, transaction);
        command.Parameters.AddParameter("@employee_id", SqlDbType.BigInt, employeeId);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static async Task<byte[]> ReadEmployeeRowVersionAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long employeeId,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand(
            "SELECT row_version FROM dbo.employees WHERE id=@employee_id AND deleted_at IS NULL;", connection, transaction);
        command.Parameters.AddParameter("@employee_id", SqlDbType.BigInt, employeeId);
        return (byte[]?)(await command.ExecuteScalarAsync(cancellationToken))
            ?? throw new InvalidOperationException("The synchronized employee was not found.");
    }

    private static async Task<CustomerAuditSnapshot?> ReadCustomerAuditAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long id,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT code, name, contact, email, phone, industry, site
            FROM dbo.customers WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@id AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new CustomerAuditSnapshot(
            reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetString(5), reader.GetString(6));
    }

    private static async Task<EmployeeAuditSnapshot?> ReadEmployeeAuditAsync(
        SqlConnection connection,
        SqlTransaction transaction,
        long id,
        CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT employee_no, name_en, name_th, department, job_title, mobile, email, nickname,
                   birth_date, uniform_size, shoe_size, start_work_date, end_work_date, position, is_active
            FROM dbo.employees WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@id AND deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, id);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new EmployeeAuditSnapshot(
            reader.GetInt32(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7),
            reader.IsDBNull(8) ? null : reader.GetFieldValue<DateOnly>(8), reader.GetString(9),
            reader.GetString(10), reader.GetFieldValue<DateOnly>(11),
            reader.IsDBNull(12) ? null : reader.GetFieldValue<DateOnly>(12), reader.GetString(13), reader.GetBoolean(14));
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

    private sealed record EmployeeInput(
        int EmployeeNo,
        string NameEn,
        string NameTh,
        string Department,
        string JobTitle,
        string Mobile,
        string Email,
        string Nickname,
        DateOnly? BirthDate,
        string UniformSize,
        string ShoeSize,
        DateOnly StartWorkDate,
        DateOnly? EndWorkDate,
        string Position,
        bool IsActive);

    private sealed record EmployeeAuditSnapshot(
        int EmployeeNo,
        string NameEn,
        string NameTh,
        string Department,
        string JobTitle,
        string Mobile,
        string Email,
        string Nickname,
        DateOnly? BirthDate,
        string UniformSize,
        string ShoeSize,
        DateOnly StartWorkDate,
        DateOnly? EndWorkDate,
        string Position,
        bool IsActive);

    private sealed record CustomerAuditSnapshot(
        string Code,
        string Name,
        string Contact,
        string Email,
        string Phone,
        string Industry,
        string Site);

    private sealed record EmployeeSummary(
        long Id,
        int EmployeeNo,
        string NameEn,
        string NameTh,
        string Department,
        string JobTitle,
        string Mobile,
        string Email,
        string Nickname,
        DateOnly? BirthDate,
        string UniformSize,
        string ShoeSize,
        DateOnly StartWorkDate,
        DateOnly? EndWorkDate,
        string Position,
        bool IsActive,
        long? UserId,
        string? ApplicationRole,
        bool? AccountActive,
        decimal? DailyRate,
        DateTimeOffset UpdatedAt,
        string RowVersion);
}
