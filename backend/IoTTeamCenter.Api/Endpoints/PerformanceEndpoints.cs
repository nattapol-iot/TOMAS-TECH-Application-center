using System.Data;
using IoTTeamCenter.Api.Infrastructure;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Endpoints;

public static class PerformanceEndpoints
{
    private static readonly string[] AreaCodes = ["DELIVERY", "QUALITY", "TECHNICAL", "TEAMWORK"];
    private static readonly string[] ManagerRoles = ["Admin", "Engineering Manager", "Project Manager"];

    public static void MapPerformanceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/performance").RequireAuthorization();
        group.MapGet("/overview", GetOverviewAsync);
        group.MapPost("/cycles", CreateCycleAsync);
        group.MapPut("/assessments/{employeeId:long}", UpdateAssessmentAsync);
        group.MapPost("/assessments/{employeeId:long}/complete", CompleteAssessmentAsync);
    }

    private static async Task<IResult> GetOverviewAsync(
        long? cycleId,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("performance.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var canManage = ManagerRoles.Contains(actor.Role, StringComparer.Ordinal);

        await using var connection = await connections.OpenAsync(cancellationToken);
        var cycles = await ReadCyclesAsync(connection, cancellationToken);
        var selectedCycle = cycleId is > 0
            ? cycles.FirstOrDefault(cycle => cycle.Id == cycleId.Value)
            : cycles.FirstOrDefault(cycle => cycle.Status != "CLOSED") ?? cycles.FirstOrDefault();
        if (selectedCycle is null)
            throw new ApiException(StatusCodes.Status404NotFound, "performance_cycle_not_found", "No KPI review cycle is configured.");

        await using var command = new SqlCommand("""
            SELECT
                employee.id,
                app_user.id,
                employee.name_en,
                employee.department,
                employee.position,
                role.code,
                assessment.id,
                assessment.status,
                assessment.self_summary,
                assessment.manager_summary,
                assessment.development_goal,
                assessment.updated_at,
                assessment.row_version,
                MAX(CASE WHEN score.area_code=N'DELIVERY' THEN score.self_score END),
                MAX(CASE WHEN score.area_code=N'QUALITY' THEN score.self_score END),
                MAX(CASE WHEN score.area_code=N'TECHNICAL' THEN score.self_score END),
                MAX(CASE WHEN score.area_code=N'TEAMWORK' THEN score.self_score END),
                MAX(CASE WHEN score.area_code=N'DELIVERY' THEN score.manager_score END),
                MAX(CASE WHEN score.area_code=N'QUALITY' THEN score.manager_score END),
                MAX(CASE WHEN score.area_code=N'TECHNICAL' THEN score.manager_score END),
                MAX(CASE WHEN score.area_code=N'TEAMWORK' THEN score.manager_score END),
                MAX(CASE WHEN score.area_code=N'DELIVERY' THEN score.self_evidence END),
                MAX(CASE WHEN score.area_code=N'QUALITY' THEN score.self_evidence END),
                MAX(CASE WHEN score.area_code=N'TECHNICAL' THEN score.self_evidence END),
                MAX(CASE WHEN score.area_code=N'TEAMWORK' THEN score.self_evidence END),
                MAX(CASE WHEN score.area_code=N'DELIVERY' AND (@can_manage=1 OR assessment.status=N'COMPLETED') THEN score.manager_evidence END),
                MAX(CASE WHEN score.area_code=N'QUALITY' AND (@can_manage=1 OR assessment.status=N'COMPLETED') THEN score.manager_evidence END),
                MAX(CASE WHEN score.area_code=N'TECHNICAL' AND (@can_manage=1 OR assessment.status=N'COMPLETED') THEN score.manager_evidence END),
                MAX(CASE WHEN score.area_code=N'TEAMWORK' AND (@can_manage=1 OR assessment.status=N'COMPLETED') THEN score.manager_evidence END)
            FROM dbo.employees employee
            INNER JOIN dbo.users app_user ON app_user.id=employee.user_id AND app_user.is_active=1 AND app_user.deleted_at IS NULL
            INNER JOIN dbo.roles role ON role.id=app_user.role_id
            LEFT JOIN dbo.kpi_assessments assessment ON assessment.employee_id=employee.id AND assessment.cycle_id=@cycle_id
            LEFT JOIN dbo.kpi_assessment_scores score ON score.assessment_id=assessment.id
            WHERE employee.is_active=1 AND employee.deleted_at IS NULL
              AND role.code IN (N'Engineer',N'Project Manager',N'Engineering Manager')
              AND (@can_manage=1 OR app_user.id=@actor)
            GROUP BY employee.id, app_user.id, employee.name_en, employee.department, employee.position, role.code,
                     assessment.id, assessment.status, assessment.self_summary, assessment.manager_summary,
                     assessment.development_goal, assessment.updated_at, assessment.row_version, employee.employee_no
            ORDER BY employee.employee_no;
            """, connection);
        command.Parameters.AddParameter("@cycle_id", SqlDbType.BigInt, selectedCycle.Id);
        command.Parameters.AddParameter("@can_manage", SqlDbType.Bit, canManage);
        command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);

        var assessments = new List<object>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var selfScores = ReadScores(reader, 13);
            var assessmentStatus = reader.IsDBNull(7) ? "NOT_STARTED" : reader.GetString(7);
            var managerScores = ReadScores(reader, 17);
            var canSeeManagerResult = canManage || assessmentStatus == "COMPLETED";
            var visibleManagerScores = canSeeManagerResult ? managerScores : new int?[4];
            var displayScores = visibleManagerScores.Any(score => score.HasValue) ? visibleManagerScores : selfScores;
            var selfEvidence = Enumerable.Range(21, 4).Select(index => reader.IsDBNull(index) ? string.Empty : reader.GetString(index)).ToArray();
            var managerEvidence = Enumerable.Range(25, 4).Select(index => reader.IsDBNull(index) ? string.Empty : reader.GetString(index)).ToArray();
            assessments.Add(new
            {
                id = reader.IsDBNull(6) ? 0 : reader.GetInt64(6),
                employeeId = reader.GetInt64(0),
                userId = reader.GetInt64(1),
                name = reader.GetString(2),
                department = reader.GetString(3),
                level = reader.GetString(4),
                role = reader.GetString(5),
                status = assessmentStatus,
                selfScores,
                managerScores = visibleManagerScores,
                displayScores,
                evidence = visibleManagerScores.Any(score => score.HasValue) ? managerEvidence : selfEvidence,
                selfEvidence,
                managerEvidence,
                selfSummary = reader.IsDBNull(8) ? string.Empty : reader.GetString(8),
                managerSummary = canSeeManagerResult && !reader.IsDBNull(9) ? reader.GetString(9) : string.Empty,
                developmentGoal = reader.IsDBNull(10) ? string.Empty : reader.GetString(10),
                updatedAt = reader.IsDBNull(11) ? (DateTimeOffset?)null : reader.GetFieldValue<DateTimeOffset>(11),
                rowVersion = reader.IsDBNull(12) ? null : reader.RowVersionString(12)
            });
        }

        if (!canManage && assessments.Count == 0)
            throw new ApiException(StatusCodes.Status403Forbidden, "performance_employee_not_linked", "Your account is not linked to an active employee profile.");

        return Results.Ok(new { cycles, selectedCycle, canManage, assessments });
    }

    private static async Task<IResult> CreateCycleAsync(
        CreatePerformanceCycleRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        await users.DemandPermissionAsync("performance.manage", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var code = RequiredText(request.Code, "Cycle code", 30);
        var name = RequiredText(request.Name, "Cycle name", 200);
        if (request.PeriodStart > request.PeriodEnd || request.PeriodEnd > request.ReviewDueDate)
            throw Invalid("The cycle dates must be in period-start, period-end, review-due order.");

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                INSERT INTO dbo.kpi_review_cycles(code,name,period_start,period_end,review_due_date,status,created_by)
                OUTPUT inserted.id, inserted.row_version
                VALUES(@code,@name,@start,@end,@due,N'OPEN',@actor);
                """, connection, transaction);
            command.Parameters.AddParameter("@code", SqlDbType.NVarChar, code, 30);
            command.Parameters.AddParameter("@name", SqlDbType.NVarChar, name, 200);
            command.Parameters.AddParameter("@start", SqlDbType.Date, request.PeriodStart);
            command.Parameters.AddParameter("@end", SqlDbType.Date, request.PeriodEnd);
            command.Parameters.AddParameter("@due", SqlDbType.Date, request.ReviewDueDate);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
            await reader.ReadAsync(cancellationToken);
            var id = reader.GetInt64(0);
            var rowVersion = reader.RowVersionString(1);
            await reader.DisposeAsync();
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "KpiCycle", id, code, "Created", null,
                new { code, name, request.PeriodStart, request.PeriodEnd, request.ReviewDueDate }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Created($"/api/v1/performance/overview?cycleId={id}", new { id, code, rowVersion });
        }
        catch (SqlException exception) when (exception.Number is 2601 or 2627)
        {
            await transaction.RollbackAsync(cancellationToken);
            throw new ApiException(StatusCodes.Status409Conflict, "performance_cycle_exists", "A KPI cycle with this code already exists.");
        }
    }

    private static async Task<IResult> UpdateAssessmentAsync(
        long employeeId,
        UpdatePerformanceAssessmentRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        if (employeeId <= 0 || request.CycleId <= 0) throw Invalid("Employee and cycle ids must be positive.");
        await users.DemandPermissionAsync("performance.read", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var scores = ValidateScores(request.Scores);
        var summary = OptionalText(request.Summary, "Summary", 1000);
        var developmentGoal = OptionalText(request.DevelopmentGoal, "Development goal", 1000);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            var target = await ReadTargetAsync(connection, transaction, employeeId, request.CycleId, cancellationToken);
            var selfReview = target.UserId == actor.Id;
            if (!selfReview) await users.DemandPermissionAsync("performance.manage", cancellationToken);
            if (target.CycleStatus == "CLOSED")
                throw new ApiException(StatusCodes.Status409Conflict, "performance_cycle_closed", "This KPI cycle is closed.");
            if (target.AssessmentStatus == "COMPLETED")
                throw new ApiException(StatusCodes.Status409Conflict, "performance_assessment_completed", "This KPI assessment is already completed.");
            if (selfReview && target.AssessmentStatus is not ("NOT_STARTED" or "SELF_REVIEW"))
                throw new ApiException(StatusCodes.Status409Conflict, "performance_self_review_submitted", "The self review is already submitted to the manager.");
            if (!selfReview && target.AssessmentStatus is not ("MANAGER_REVIEW" or "CALIBRATION"))
                throw new ApiException(StatusCodes.Status409Conflict, "performance_self_review_required", "The employee must submit the self review before manager scoring.");

            var assessmentId = target.AssessmentId;
            object? before = target.AssessmentId is null ? null : new { target.AssessmentStatus, target.SelfSummary, target.ManagerSummary, target.DevelopmentGoal };
            if (assessmentId is null)
            {
                await using var insert = new SqlCommand("""
                    INSERT INTO dbo.kpi_assessments(cycle_id,employee_id,reviewer_id,status,self_summary,manager_summary,development_goal,self_submitted_at,manager_submitted_at,updated_by)
                    OUTPUT inserted.id
                    VALUES(@cycle,@employee,@reviewer,@status,@self_summary,@manager_summary,@goal,
                           CASE WHEN @reviewer IS NULL AND @status=N'MANAGER_REVIEW' THEN SYSUTCDATETIME() END,
                           CASE WHEN @reviewer IS NOT NULL AND @status=N'CALIBRATION' THEN SYSUTCDATETIME() END,@actor);
                    """, connection, transaction);
                insert.Parameters.AddParameter("@cycle", SqlDbType.BigInt, request.CycleId);
                insert.Parameters.AddParameter("@employee", SqlDbType.BigInt, employeeId);
                insert.Parameters.AddParameter("@reviewer", SqlDbType.BigInt, selfReview ? null : actor.Id);
                insert.Parameters.AddParameter("@status", SqlDbType.NVarChar, selfReview ? (request.Submit ? "MANAGER_REVIEW" : "SELF_REVIEW") : (request.Submit ? "CALIBRATION" : "MANAGER_REVIEW"), 30);
                insert.Parameters.AddParameter("@self_summary", SqlDbType.NVarChar, selfReview ? summary : string.Empty, 1000);
                insert.Parameters.AddParameter("@manager_summary", SqlDbType.NVarChar, selfReview ? string.Empty : summary, 1000);
                insert.Parameters.AddParameter("@goal", SqlDbType.NVarChar, developmentGoal, 1000);
                insert.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                assessmentId = Convert.ToInt64(await insert.ExecuteScalarAsync(cancellationToken));
            }
            else
            {
                var rowVersion = SqlExtensions.ParseRowVersion(request.RowVersion ?? string.Empty);
                await using var update = new SqlCommand("""
                    UPDATE dbo.kpi_assessments
                    SET reviewer_id=CASE WHEN @self=1 THEN reviewer_id ELSE @actor END,
                        status=@status,
                        self_summary=CASE WHEN @self=1 THEN @summary ELSE self_summary END,
                        manager_summary=CASE WHEN @self=0 THEN @summary ELSE manager_summary END,
                        development_goal=CASE WHEN @goal=N'' THEN development_goal ELSE @goal END,
                        self_submitted_at=CASE WHEN @self=1 AND @submit=1 THEN SYSUTCDATETIME() ELSE self_submitted_at END,
                        manager_submitted_at=CASE WHEN @self=0 AND @submit=1 THEN SYSUTCDATETIME() ELSE manager_submitted_at END,
                        updated_by=@actor, updated_at=SYSUTCDATETIME()
                    WHERE id=@id AND row_version=@row_version;
                    """, connection, transaction);
                update.Parameters.AddParameter("@self", SqlDbType.Bit, selfReview);
                update.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
                update.Parameters.AddParameter("@status", SqlDbType.NVarChar, selfReview ? (request.Submit ? "MANAGER_REVIEW" : "SELF_REVIEW") : (request.Submit ? "CALIBRATION" : "MANAGER_REVIEW"), 30);
                update.Parameters.AddParameter("@summary", SqlDbType.NVarChar, summary, 1000);
                update.Parameters.AddParameter("@goal", SqlDbType.NVarChar, developmentGoal, 1000);
                update.Parameters.AddParameter("@submit", SqlDbType.Bit, request.Submit);
                update.Parameters.AddParameter("@id", SqlDbType.BigInt, assessmentId.Value);
                update.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, rowVersion, 8);
                if (await update.ExecuteNonQueryAsync(cancellationToken) != 1)
                    throw new ApiException(StatusCodes.Status409Conflict, "concurrency_conflict", "This KPI assessment changed. Refresh and try again.");
            }

            foreach (var score in scores)
            {
                await using var upsert = new SqlCommand(selfReview ? """
                    UPDATE dbo.kpi_assessment_scores SET self_score=@score,self_evidence=@evidence,updated_at=SYSUTCDATETIME()
                    WHERE assessment_id=@assessment AND area_code=@area;
                    IF @@ROWCOUNT=0 INSERT dbo.kpi_assessment_scores(assessment_id,area_code,self_score,self_evidence)
                    VALUES(@assessment,@area,@score,@evidence);
                    """ : """
                    UPDATE dbo.kpi_assessment_scores SET manager_score=@score,manager_evidence=@evidence,updated_at=SYSUTCDATETIME()
                    WHERE assessment_id=@assessment AND area_code=@area;
                    IF @@ROWCOUNT=0 INSERT dbo.kpi_assessment_scores(assessment_id,area_code,manager_score,manager_evidence)
                    VALUES(@assessment,@area,@score,@evidence);
                    """, connection, transaction);
                upsert.Parameters.AddParameter("@assessment", SqlDbType.BigInt, assessmentId.Value);
                upsert.Parameters.AddParameter("@area", SqlDbType.NVarChar, score.AreaCode, 30);
                upsert.Parameters.AddParameter("@score", SqlDbType.TinyInt, score.Score);
                upsert.Parameters.AddParameter("@evidence", SqlDbType.NVarChar, score.Evidence, 1000);
                await upsert.ExecuteNonQueryAsync(cancellationToken);
            }

            var nextStatus = selfReview ? (request.Submit ? "MANAGER_REVIEW" : "SELF_REVIEW") : (request.Submit ? "CALIBRATION" : "MANAGER_REVIEW");
            var nextVersion = await ReadAssessmentRowVersionAsync(connection, transaction, assessmentId.Value, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "KpiAssessment", assessmentId.Value,
                $"{request.CycleId}:{employeeId}", request.Submit ? (selfReview ? "Self review submitted" : "Manager review submitted") : "Draft saved",
                before, new { status = nextStatus, scores = scores.Select(score => new { score.AreaCode, score.Score }), summary, developmentGoal }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = assessmentId.Value, status = nextStatus, rowVersion = nextVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<IResult> CompleteAssessmentAsync(
        long employeeId,
        CompletePerformanceAssessmentRequest request,
        SqlConnectionFactory connections,
        CurrentUserService users,
        CancellationToken cancellationToken)
    {
        if (employeeId <= 0 || request.CycleId <= 0) throw Invalid("Employee and cycle ids must be positive.");
        await users.DemandPermissionAsync("performance.manage", cancellationToken);
        var actor = await users.GetRequiredAsync(cancellationToken);
        var note = RequiredText(request.CalibrationNote, "Calibration note", 1000);
        var rowVersion = SqlExtensions.ParseRowVersion(request.RowVersion);

        await using var connection = await connections.OpenAsync(cancellationToken);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(cancellationToken);
        try
        {
            await using var command = new SqlCommand("""
                UPDATE assessment
                SET status=N'COMPLETED', manager_summary=CASE WHEN manager_summary=N'' THEN @note ELSE manager_summary+NCHAR(10)+@note END,
                    completed_at=SYSUTCDATETIME(), updated_by=@actor, updated_at=SYSUTCDATETIME()
                FROM dbo.kpi_assessments assessment
                WHERE assessment.cycle_id=@cycle AND assessment.employee_id=@employee
                  AND assessment.status=N'CALIBRATION' AND assessment.row_version=@row_version
                  AND EXISTS (SELECT 1 FROM dbo.kpi_review_cycles cycle WHERE cycle.id=assessment.cycle_id AND cycle.status<>N'CLOSED')
                  AND (SELECT COUNT(*) FROM dbo.kpi_assessment_scores score WHERE score.assessment_id=assessment.id AND score.manager_score IS NOT NULL)=4;
                """, connection, transaction);
            command.Parameters.AddParameter("@note", SqlDbType.NVarChar, note, 1000);
            command.Parameters.AddParameter("@actor", SqlDbType.BigInt, actor.Id);
            command.Parameters.AddParameter("@cycle", SqlDbType.BigInt, request.CycleId);
            command.Parameters.AddParameter("@employee", SqlDbType.BigInt, employeeId);
            command.Parameters.AddParameter("@row_version", SqlDbType.Timestamp, rowVersion, 8);
            if (await command.ExecuteNonQueryAsync(cancellationToken) != 1)
                throw new ApiException(StatusCodes.Status409Conflict, "performance_completion_conflict", "The assessment is not ready for completion or changed. Refresh and try again.");

            var assessment = await ReadAssessmentIdentityAsync(connection, transaction, employeeId, request.CycleId, cancellationToken);
            var nextVersion = await ReadAssessmentRowVersionAsync(connection, transaction, assessment, cancellationToken);
            await InquiryEndpoints.InsertAuditAsync(connection, transaction, actor.Id, "KpiAssessment", assessment,
                $"{request.CycleId}:{employeeId}", "Completed after calibration", null, new { status = "COMPLETED", calibrationNote = note }, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return Results.Ok(new { id = assessment, status = "COMPLETED", rowVersion = nextVersion });
        }
        catch
        {
            if (transaction.Connection is not null) await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static async Task<List<PerformanceCycle>> ReadCyclesAsync(SqlConnection connection, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT id,code,name,period_start,period_end,review_due_date,status,row_version
            FROM dbo.kpi_review_cycles ORDER BY period_end DESC,id DESC;
            """, connection);
        var result = new List<PerformanceCycle>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
            result.Add(new PerformanceCycle(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetFieldValue<DateOnly>(3),
                reader.GetFieldValue<DateOnly>(4), reader.GetFieldValue<DateOnly>(5), reader.GetString(6), reader.RowVersionString(7)));
        return result;
    }

    private static async Task<AssessmentTarget> ReadTargetAsync(SqlConnection connection, SqlTransaction transaction, long employeeId, long cycleId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("""
            SELECT employee.user_id, cycle.status, assessment.id, assessment.status, assessment.self_summary,
                   assessment.manager_summary, assessment.development_goal
            FROM dbo.employees employee WITH (UPDLOCK, HOLDLOCK)
            INNER JOIN dbo.kpi_review_cycles cycle ON cycle.id=@cycle
            LEFT JOIN dbo.kpi_assessments assessment ON assessment.employee_id=employee.id AND assessment.cycle_id=cycle.id
            WHERE employee.id=@employee AND employee.user_id IS NOT NULL
              AND employee.is_active=1 AND employee.deleted_at IS NULL;
            """, connection, transaction);
        command.Parameters.AddParameter("@employee", SqlDbType.BigInt, employeeId);
        command.Parameters.AddParameter("@cycle", SqlDbType.BigInt, cycleId);
        await using var reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
            throw new ApiException(StatusCodes.Status404NotFound, "performance_target_not_found", "The employee or KPI cycle was not found.");
        return new AssessmentTarget(reader.GetInt64(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetInt64(2),
            reader.IsDBNull(3) ? "NOT_STARTED" : reader.GetString(3), reader.IsDBNull(4) ? "" : reader.GetString(4),
            reader.IsDBNull(5) ? "" : reader.GetString(5), reader.IsDBNull(6) ? "" : reader.GetString(6));
    }

    private static async Task<long> ReadAssessmentIdentityAsync(SqlConnection connection, SqlTransaction transaction, long employeeId, long cycleId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT id FROM dbo.kpi_assessments WHERE employee_id=@employee AND cycle_id=@cycle;", connection, transaction);
        command.Parameters.AddParameter("@employee", SqlDbType.BigInt, employeeId);
        command.Parameters.AddParameter("@cycle", SqlDbType.BigInt, cycleId);
        return Convert.ToInt64(await command.ExecuteScalarAsync(cancellationToken));
    }

    private static async Task<string> ReadAssessmentRowVersionAsync(SqlConnection connection, SqlTransaction transaction, long assessmentId, CancellationToken cancellationToken)
    {
        await using var command = new SqlCommand("SELECT row_version FROM dbo.kpi_assessments WHERE id=@id;", connection, transaction);
        command.Parameters.AddParameter("@id", SqlDbType.BigInt, assessmentId);
        var value = await command.ExecuteScalarAsync(cancellationToken) as byte[]
            ?? throw new InvalidOperationException("The KPI assessment row version could not be read.");
        return Convert.ToBase64String(value);
    }

    private static int?[] ReadScores(SqlDataReader reader, int start) =>
        Enumerable.Range(start, 4).Select(index => reader.IsDBNull(index) ? (int?)null : reader.GetByte(index)).ToArray();

    private static List<ValidatedScore> ValidateScores(IReadOnlyList<PerformanceAssessmentScoreInput>? scores)
    {
        if (scores is null || scores.Count != AreaCodes.Length) throw Invalid("All four KPI areas must be scored.");
        var result = new List<ValidatedScore>(scores.Count);
        foreach (var area in AreaCodes)
        {
            var input = scores.SingleOrDefault(score => string.Equals(score.AreaCode, area, StringComparison.OrdinalIgnoreCase));
            if (input is null || input.Score is < 1 or > 5) throw Invalid($"{area} must have one score from 1 to 5.");
            var evidence = OptionalText(input.Evidence, $"{area} evidence", 1000);
            if (input.Score is 1 or 2 or 5 && evidence.Length == 0)
                throw Invalid($"{area} requires concrete evidence for a rating of {input.Score}.");
            result.Add(new ValidatedScore(area, input.Score, evidence));
        }
        if (scores.Select(score => score.AreaCode?.ToUpperInvariant() ?? string.Empty).Distinct(StringComparer.Ordinal).Count() != AreaCodes.Length)
            throw Invalid("Each KPI area may be scored only once.");
        return result;
    }

    private static string RequiredText(string? value, string field, int maximumLength)
    {
        var result = OptionalText(value, field, maximumLength);
        if (result.Length == 0) throw Invalid($"{field} is required.");
        return result;
    }

    private static string OptionalText(string? value, string field, int maximumLength)
    {
        var result = value?.Trim() ?? string.Empty;
        if (result.Length > maximumLength) throw Invalid($"{field} cannot exceed {maximumLength} characters.");
        return result;
    }

    private static ApiException Invalid(string message) => new(StatusCodes.Status400BadRequest, "validation_failed", message);

    private sealed record PerformanceCycle(long Id, string Code, string Name, DateOnly PeriodStart, DateOnly PeriodEnd, DateOnly ReviewDueDate, string Status, string RowVersion);
    private sealed record AssessmentTarget(long UserId, string CycleStatus, long? AssessmentId, string AssessmentStatus, string SelfSummary, string ManagerSummary, string DevelopmentGoal);
    private sealed record ValidatedScore(string AreaCode, int Score, string Evidence);
}

public sealed record CreatePerformanceCycleRequest(string Code, string Name, DateOnly PeriodStart, DateOnly PeriodEnd, DateOnly ReviewDueDate);
public sealed record PerformanceAssessmentScoreInput(string AreaCode, int Score, string? Evidence);
public sealed record UpdatePerformanceAssessmentRequest(long CycleId, IReadOnlyList<PerformanceAssessmentScoreInput>? Scores, string? Summary, string? DevelopmentGoal, bool Submit, string? RowVersion);
public sealed record CompletePerformanceAssessmentRequest(long CycleId, string CalibrationNote, string RowVersion);
