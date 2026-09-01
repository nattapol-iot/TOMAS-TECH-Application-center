import sql from "mssql/msnodesqlv8.js";
import { insertAudit } from "../audit.js";
import { ApiError } from "../errors.js";
import { bodyObject, dateOnly, optionalBodyText, optionalPositiveLong, parseDateOnly, parseRowVersion, positiveLong, requiredInteger, requiredText } from "../http.js";
import { buildPerformanceEvidence, buildSalesPerformanceEvidence, } from "../performance-evidence.js";
import { canManagePerformanceTarget, frameworkForRole, } from "../performance-framework.js";
const MANAGER_ROLES = new Set(["Admin", "Engineering Manager", "Project Manager", "Sales Manager"]);
const invalid = (message) => new ApiError(400, "validation_failed", message);
const cycleDto = (row) => ({
    id: Number(row.id), code: row.code, name: row.name,
    periodStart: dateOnly(row.period_start), periodEnd: dateOnly(row.period_end), reviewDueDate: dateOnly(row.review_due_date),
    status: row.status, rowVersion: row.row_version.toString("base64"),
});
function performanceScores(value, areaCodes, submit) {
    if (!Array.isArray(value) || value.length !== areaCodes.length)
        throw invalid(`All ${areaCodes.length} KPI areas must be scored.`);
    const parsed = value.map((item) => {
        const body = bodyObject(item);
        const areaCode = typeof body.areaCode === "string" ? body.areaCode.trim().toUpperCase() : "";
        if (!areaCodes.includes(areaCode))
            throw invalid("Each KPI area must use the framework assigned to the employee role.");
        const parsed = {
            areaCode: areaCode,
            score: !submit && (body.score === null || body.score === 0) ? null : requiredInteger(body.score, `${areaCode} score`, 1, 5),
            evidence: optionalBodyText(body.evidence, 1000, `${areaCode} evidence`) ?? "",
        };
        if (submit && parsed.score !== null && [1, 2, 5].includes(parsed.score) && !parsed.evidence)
            throw invalid(`${areaCode} requires concrete evidence for a rating of ${parsed.score}.`);
        return parsed;
    });
    if (new Set(parsed.map((item) => item.areaCode)).size !== areaCodes.length)
        throw invalid("Each KPI area may be scored only once.");
    return areaCodes.map((area) => parsed.find((item) => item.areaCode === area));
}
async function targetRow(transaction, employeeId, cycleId) {
    const request = new sql.Request(transaction);
    request.input("employee", sql.BigInt, employeeId).input("cycle", sql.BigInt, cycleId);
    const row = (await request.query(`
    SELECT employee.user_id,role.code target_role,cycle.status cycle_status,assessment.id assessment_id,assessment.status assessment_status,
           assessment.self_summary,assessment.manager_summary,assessment.development_goal
    FROM dbo.employees employee WITH(UPDLOCK,HOLDLOCK)
    INNER JOIN dbo.users app_user ON app_user.id=employee.user_id AND app_user.is_active=1 AND app_user.deleted_at IS NULL
    INNER JOIN dbo.roles role ON role.id=app_user.role_id
    INNER JOIN dbo.kpi_review_cycles cycle ON cycle.id=@cycle
    LEFT JOIN dbo.kpi_assessments assessment ON assessment.employee_id=employee.id AND assessment.cycle_id=cycle.id
    WHERE employee.id=@employee AND employee.user_id IS NOT NULL AND employee.is_active=1 AND employee.deleted_at IS NULL;
  `)).recordset[0];
    if (!row)
        throw new ApiError(404, "performance_target_not_found", "The employee or KPI cycle was not found.");
    return row;
}
export function registerPerformanceRoutes(app, database, users) {
    app.get("/api/v1/performance/overview", async (request) => {
        await users.demandPermission(request, "performance.read");
        const actor = await users.required(request);
        const canManage = MANAGER_ROLES.has(actor.role);
        if (canManage)
            await users.demandPermission(request, "performance.manage");
        const requestedCycle = optionalPositiveLong(request.query.cycleId, "Cycle id");
        const cycleResult = await database.query(`
      SELECT id,code,name,period_start,period_end,review_due_date,status,row_version
      FROM dbo.kpi_review_cycles ORDER BY period_end DESC,id DESC;
    `);
        const cycles = cycleResult.recordset.map(cycleDto);
        const selectedCycle = requestedCycle
            ? cycles.find((cycle) => cycle.id === requestedCycle)
            : cycles.find((cycle) => cycle.status !== "CLOSED") ?? cycles[0];
        if (!selectedCycle)
            throw new ApiError(404, "performance_cycle_not_found", "No KPI review cycle is configured.");
        const result = await database.query(`
      SELECT employee.id employee_id,app_user.id user_id,employee.name_en name,employee.department,
        employee.position level,role.code role,COALESCE(assessment.status,N'NOT_STARTED') status,
        COALESCE(assessment.self_summary,N'') self_summary,COALESCE(assessment.manager_summary,N'') manager_summary,
        COALESCE(assessment.development_goal,N'') development_goal,assessment.updated_at,assessment.id,assessment.row_version
      FROM dbo.employees employee
      INNER JOIN dbo.users app_user ON app_user.id=employee.user_id AND app_user.is_active=1 AND app_user.deleted_at IS NULL
      INNER JOIN dbo.roles role ON role.id=app_user.role_id
      LEFT JOIN dbo.kpi_assessments assessment ON assessment.employee_id=employee.id AND assessment.cycle_id=@cycle
      WHERE employee.is_active=1 AND employee.deleted_at IS NULL
        AND role.code IN(N'Engineer',N'Project Manager',N'Engineering Manager',N'Sales Engineer',N'Sales Manager')
        AND (app_user.id=@actor OR @actor_role=N'Admin'
          OR (@actor_role=N'Sales Manager' AND role.code IN(N'Sales Engineer',N'Sales Manager'))
          OR (@actor_role IN(N'Engineering Manager',N'Project Manager') AND role.code IN(N'Engineer',N'Project Manager',N'Engineering Manager')))
      ORDER BY employee.employee_no;

      SELECT score.assessment_id,score.area_code,score.self_score,
        CASE WHEN (@manage=1 AND app_user.id<>@actor) OR assessment.status=N'COMPLETED' THEN score.manager_score END manager_score,
        score.self_evidence,
        CASE WHEN (@manage=1 AND app_user.id<>@actor) OR assessment.status=N'COMPLETED' THEN score.manager_evidence END manager_evidence
      FROM dbo.kpi_assessment_scores score
      INNER JOIN dbo.kpi_assessments assessment ON assessment.id=score.assessment_id AND assessment.cycle_id=@cycle
      INNER JOIN dbo.employees employee ON employee.id=assessment.employee_id AND employee.is_active=1 AND employee.deleted_at IS NULL
      INNER JOIN dbo.users app_user ON app_user.id=employee.user_id AND app_user.is_active=1 AND app_user.deleted_at IS NULL
      INNER JOIN dbo.roles role ON role.id=app_user.role_id
      WHERE role.code IN(N'Engineer',N'Project Manager',N'Engineering Manager',N'Sales Engineer',N'Sales Manager')
        AND (app_user.id=@actor OR @actor_role=N'Admin'
          OR (@actor_role=N'Sales Manager' AND role.code IN(N'Sales Engineer',N'Sales Manager'))
          OR (@actor_role IN(N'Engineering Manager',N'Project Manager') AND role.code IN(N'Engineer',N'Project Manager',N'Engineering Manager')));
    `, (bind) => bind.input("cycle", sql.BigInt, selectedCycle.id).input("manage", sql.Bit, canManage)
            .input("actor", sql.BigInt, actor.id).input("actor_role", sql.NVarChar(100), actor.role));
        const rows = result.recordsets[0];
        const scoreRows = result.recordsets[1];
        const assessments = rows.map((row) => {
            const framework = frameworkForRole(row.role);
            const savedScores = scoreRows.filter((score) => Number(score.assessment_id) === Number(row.id));
            const selfScores = framework.areaCodes.map((area) => savedScores.find((score) => score.area_code === area)?.self_score ?? null);
            const visibleManager = (canManage && Number(row.user_id) !== actor.id) || row.status === "COMPLETED";
            const managerScores = visibleManager
                ? framework.areaCodes.map((area) => savedScores.find((score) => score.area_code === area)?.manager_score ?? null)
                : framework.areaCodes.map(() => null);
            const displayScores = managerScores.some((value) => value !== null) ? managerScores : selfScores;
            const selfEvidence = framework.areaCodes.map((area) => savedScores.find((score) => score.area_code === area)?.self_evidence ?? "");
            const managerEvidence = framework.areaCodes.map((area) => savedScores.find((score) => score.area_code === area)?.manager_evidence ?? "");
            return {
                id: row.id === null ? 0 : Number(row.id), employeeId: Number(row.employee_id), userId: Number(row.user_id),
                name: row.name, department: row.department, level: row.level, role: row.role, frameworkCode: framework.code, areaCodes: framework.areaCodes, status: row.status,
                selfScores, managerScores, displayScores,
                evidence: managerScores.some((value) => value !== null) ? managerEvidence : selfEvidence,
                selfEvidence, managerEvidence,
                selfSummary: row.self_summary, managerSummary: visibleManager ? row.manager_summary : "",
                developmentGoal: row.development_goal, updatedAt: row.updated_at, rowVersion: row.row_version?.toString("base64") ?? null,
            };
        });
        if (!canManage && assessments.length === 0)
            throw new ApiError(403, "performance_employee_not_linked", "Your account is not linked to an active employee profile.");
        return { cycles, selectedCycle, canManage, assessments };
    });
    app.get("/api/v1/performance/evidence/:employeeId", async (request) => {
        await users.demandPermission(request, "performance.read");
        const actor = await users.required(request);
        const employeeId = positiveLong(request.params.employeeId, "Employee id");
        const cycleId = positiveLong(request.query.cycleId, "Cycle id");
        const targetResult = await database.query(`
      SELECT employee.user_id,employee.name_en,role.code target_role,cycle.code cycle_code,cycle.period_start,cycle.period_end
      FROM dbo.employees employee
      INNER JOIN dbo.users app_user ON app_user.id=employee.user_id AND app_user.is_active=1 AND app_user.deleted_at IS NULL
      INNER JOIN dbo.roles role ON role.id=app_user.role_id
      INNER JOIN dbo.kpi_review_cycles cycle ON cycle.id=@cycle
      WHERE employee.id=@employee AND employee.user_id IS NOT NULL AND employee.is_active=1 AND employee.deleted_at IS NULL;
    `, (bind) => bind.input("employee", sql.BigInt, employeeId).input("cycle", sql.BigInt, cycleId));
        const target = targetResult.recordset[0];
        if (!target)
            throw new ApiError(404, "performance_target_not_found", "The employee or KPI cycle was not found.");
        if (Number(target.user_id) !== actor.id) {
            await users.demandPermission(request, "performance.manage");
            if (!canManagePerformanceTarget(actor.role, target.target_role))
                throw new ApiError(403, "performance_scope_denied", "This employee is outside your KPI management scope.");
        }
        if (frameworkForRole(target.target_role).code === "SALES") {
            const salesResult = await database.query(`
        SELECT inquiry.id,inquiry.inquiry_no,inquiry.project_name,inquiry.status,inquiry.inquiry_date,inquiry.due_date,inquiry.updated_at,
          inquiry.project_probability,inquiry.customer_interest_grade,
          (SELECT COUNT_BIG(*) FROM dbo.inquiry_meetings meeting
           WHERE meeting.inquiry_id=inquiry.id AND (meeting.owner_id=@user OR meeting.created_by=@user)
             AND meeting.meeting_date BETWEEN @period_start AND @period_end) meeting_count,
          estimate.id estimate_id,estimate.status estimate_status,totals.total estimate_total,
          (SELECT TOP(1) project.id FROM dbo.projects project WHERE project.inquiry_id=inquiry.id AND project.deleted_at IS NULL ORDER BY project.id DESC) project_id
        FROM dbo.inquiries inquiry
        OUTER APPLY (SELECT TOP(1) candidate.* FROM dbo.estimates candidate WHERE candidate.inquiry_id=inquiry.id AND candidate.deleted_at IS NULL ORDER BY candidate.id DESC) estimate
        LEFT JOIN dbo.v_estimate_totals totals ON totals.estimate_id=estimate.id
        WHERE inquiry.deleted_at IS NULL AND inquiry.inquiry_date<=@period_end
          AND (inquiry.inquiry_date>=@period_start OR inquiry.due_date>=@period_start OR CONVERT(date,inquiry.updated_at)>=@period_start)
          AND (inquiry.created_by=@user OR EXISTS(
            SELECT 1 FROM dbo.inquiry_meetings meeting WHERE meeting.inquiry_id=inquiry.id
              AND (meeting.owner_id=@user OR meeting.created_by=@user) AND meeting.meeting_date BETWEEN @period_start AND @period_end))
        ORDER BY inquiry.updated_at DESC,inquiry.id DESC;
      `, (bind) => bind.input("user", sql.BigInt, target.user_id)
                .input("period_start", sql.Date, target.period_start).input("period_end", sql.Date, target.period_end));
            return buildSalesPerformanceEvidence({
                employeeId,
                employeeName: target.name_en,
                cycleId,
                cycleCode: target.cycle_code,
                periodStart: target.period_start,
                periodEnd: target.period_end,
                inquiries: salesResult.recordset,
            });
        }
        const result = await database.query(`
      SELECT project.id,project.project_no,project.name,project.status,project.start_date,project.target_delivery,project.actual_delivery,
        CASE WHEN project.manager_id=@user THEN N'Project manager'
             WHEN project.lead_engineer_id=@user THEN N'Lead engineer'
             ELSE COALESCE((SELECT TOP(1) member.role_on_project FROM dbo.project_members member WHERE member.project_id=project.id AND member.user_id=@user),N'Contributor') END role_on_project
      FROM dbo.projects project
      WHERE project.deleted_at IS NULL AND (project.manager_id=@user OR project.lead_engineer_id=@user OR EXISTS(
        SELECT 1 FROM dbo.project_members member WHERE member.project_id=project.id AND member.user_id=@user))
        AND project.start_date<=@period_end AND COALESCE(project.actual_delivery,project.target_delivery)>=@period_start
      ORDER BY COALESCE(project.actual_delivery,project.target_delivery) DESC,project.id DESC;

      SELECT task.id,task.project_id,project.project_no,project.name project_name,task.name,task.status,task.is_milestone,
        COALESCE(task.baseline_end,CASE WHEN task.plan_start IS NULL THEN NULL ELSE DATEADD(day,task.plan_days-1,task.plan_start) END) due_date,
        task.actual_end,task.percent_done,task.updated_at
      FROM dbo.schedule_tasks task
      INNER JOIN dbo.schedule_task_pics pic ON pic.task_id=task.id AND pic.user_id=@user
      INNER JOIN dbo.projects project ON project.id=task.project_id AND project.deleted_at IS NULL
      WHERE task.deleted_at IS NULL AND task.kind<>N'phase'
        AND COALESCE(task.actual_end,task.baseline_end,CASE WHEN task.plan_start IS NULL THEN NULL ELSE DATEADD(day,task.plan_days-1,task.plan_start) END,CONVERT(date,task.updated_at)) BETWEEN @period_start AND @period_end
      ORDER BY COALESCE(task.actual_end,task.baseline_end,task.plan_start,CONVERT(date,task.updated_at)) DESC,task.id DESC;

      SELECT task.id,task.inquiry_id,task.project_id,
        COALESCE(project.project_no,inquiry.inquiry_no) source_no,COALESCE(project.name,inquiry.project_name) source_name,
        task.title,task.is_issue,task.state,task.execution_status,task.plan_end due_date,task.actual_end,task.percent_done,task.updated_at
      FROM dbo.resource_tasks task
      LEFT JOIN dbo.projects project ON project.id=task.project_id AND project.deleted_at IS NULL
      LEFT JOIN dbo.inquiries inquiry ON inquiry.id=task.inquiry_id AND inquiry.deleted_at IS NULL
      WHERE task.assignee_id=@user AND task.schedule_task_id IS NULL
        AND COALESCE(task.actual_end,task.plan_end,CONVERT(date,task.updated_at)) BETWEEN @period_start AND @period_end
      ORDER BY COALESCE(task.actual_end,task.plan_end,CONVERT(date,task.updated_at)) DESC,task.id DESC;

      SELECT inquiry.id,inquiry.inquiry_no,inquiry.project_name,inquiry.status,inquiry.due_date,inquiry.updated_at,
        (SELECT COUNT(*) FROM dbo.inquiry_meetings meeting
         WHERE meeting.inquiry_id=inquiry.id AND (meeting.owner_id=@user OR meeting.created_by=@user)
           AND meeting.meeting_date BETWEEN @period_start AND @period_end) meeting_count
      FROM dbo.inquiries inquiry
      WHERE inquiry.deleted_at IS NULL AND inquiry.inquiry_date<=@period_end
        AND (inquiry.due_date>=@period_start OR CONVERT(date,inquiry.updated_at)>=@period_start)
        AND (inquiry.estimate_owner_id=@user OR inquiry.created_by=@user OR EXISTS(
          SELECT 1 FROM dbo.inquiry_meetings meeting WHERE meeting.inquiry_id=inquiry.id
            AND (meeting.owner_id=@user OR meeting.created_by=@user) AND meeting.meeting_date BETWEEN @period_start AND @period_end))
      ORDER BY inquiry.updated_at DESC,inquiry.id DESC;
    `, (bind) => bind.input("user", sql.BigInt, target.user_id)
            .input("period_start", sql.Date, target.period_start).input("period_end", sql.Date, target.period_end));
        return buildPerformanceEvidence({
            employeeId,
            employeeName: target.name_en,
            cycleId,
            cycleCode: target.cycle_code,
            periodStart: target.period_start,
            periodEnd: target.period_end,
            projects: result.recordsets[0],
            scheduleTasks: result.recordsets[1],
            resourceTasks: result.recordsets[2],
            inquiries: result.recordsets[3],
        });
    });
    app.post("/api/v1/performance/cycles", async (request, reply) => {
        await users.demandPermission(request, "performance.manage");
        const actor = await users.required(request), body = bodyObject(request.body);
        const code = requiredText(body.code, 30, "Cycle code"), name = requiredText(body.name, 200, "Cycle name");
        const periodStart = parseDateOnly(body.periodStart, "Period start"), periodEnd = parseDateOnly(body.periodEnd, "Period end"), reviewDueDate = parseDateOnly(body.reviewDueDate, "Review due date");
        if (periodStart > periodEnd || periodEnd > reviewDueDate)
            throw invalid("The cycle dates must be in period-start, period-end, review-due order.");
        try {
            const created = await database.transaction(async (transaction) => {
                const insert = new sql.Request(transaction);
                insert.input("code", sql.NVarChar(30), code).input("name", sql.NVarChar(200), name)
                    .input("start", sql.Date, periodStart).input("end", sql.Date, periodEnd).input("due", sql.Date, reviewDueDate).input("actor", sql.BigInt, actor.id);
                const row = (await insert.query(`
          INSERT dbo.kpi_review_cycles(code,name,period_start,period_end,review_due_date,status,created_by)
          OUTPUT inserted.id,inserted.row_version VALUES(@code,@name,@start,@end,@due,N'OPEN',@actor);
        `)).recordset[0];
                await insertAudit(transaction, actor.id, "KpiCycle", Number(row.id), code, "Created", null, { code, name, periodStart, periodEnd, reviewDueDate });
                return { id: Number(row.id), code, rowVersion: row.row_version.toString("base64") };
            });
            return reply.status(201).header("Location", `/api/v1/performance/overview?cycleId=${created.id}`).send(created);
        }
        catch (error) {
            if ([2601, 2627].includes(Number(error.number)))
                throw new ApiError(409, "performance_cycle_exists", "A KPI cycle with this code already exists.");
            throw error;
        }
    });
    app.put("/api/v1/performance/assessments/:employeeId", async (request) => {
        await users.demandPermission(request, "performance.read");
        const actor = await users.required(request), employeeId = positiveLong(request.params.employeeId, "Employee id"), body = bodyObject(request.body);
        const cycleId = requiredInteger(body.cycleId, "Cycle id", 1);
        const summary = optionalBodyText(body.summary, 1000, "Summary") ?? "", developmentGoal = optionalBodyText(body.developmentGoal, 1000, "Development goal") ?? "", submit = body.submit === true;
        return database.transaction(async (transaction) => {
            const target = await targetRow(transaction, employeeId, cycleId), selfReview = Number(target.user_id) === actor.id;
            if (!selfReview) {
                await users.demandPermission(request, "performance.manage");
                if (!canManagePerformanceTarget(actor.role, target.target_role))
                    throw new ApiError(403, "performance_scope_denied", "This employee is outside your KPI management scope.");
            }
            const inputScores = performanceScores(body.scores, frameworkForRole(target.target_role).areaCodes, submit);
            const currentStatus = target.assessment_status ?? "NOT_STARTED";
            if (target.cycle_status === "CLOSED")
                throw new ApiError(409, "performance_cycle_closed", "This KPI cycle is closed.");
            if (currentStatus === "COMPLETED")
                throw new ApiError(409, "performance_assessment_completed", "This KPI assessment is already completed.");
            if (selfReview && !["NOT_STARTED", "SELF_REVIEW"].includes(currentStatus))
                throw new ApiError(409, "performance_self_review_submitted", "The self review is already submitted to the manager.");
            if (!selfReview && !["MANAGER_REVIEW", "CALIBRATION"].includes(currentStatus))
                throw new ApiError(409, "performance_self_review_required", "The employee must submit the self review before manager scoring.");
            const nextStatus = selfReview ? (submit ? "MANAGER_REVIEW" : "SELF_REVIEW") : (submit ? "CALIBRATION" : "MANAGER_REVIEW");
            let assessmentId, nextVersion;
            const before = target.assessment_id === null ? null : { status: currentStatus, selfSummary: target.self_summary, managerSummary: target.manager_summary, developmentGoal: target.development_goal };
            if (target.assessment_id === null) {
                const insert = new sql.Request(transaction);
                insert.input("cycle", sql.BigInt, cycleId).input("employee", sql.BigInt, employeeId).input("reviewer", sql.BigInt, selfReview ? null : actor.id)
                    .input("status", sql.NVarChar(30), nextStatus).input("selfSummary", sql.NVarChar(1000), selfReview ? summary : "")
                    .input("managerSummary", sql.NVarChar(1000), selfReview ? "" : summary).input("goal", sql.NVarChar(1000), developmentGoal).input("actor", sql.BigInt, actor.id);
                const row = (await insert.query(`
          INSERT dbo.kpi_assessments(cycle_id,employee_id,reviewer_id,status,self_summary,manager_summary,development_goal,
            self_submitted_at,manager_submitted_at,updated_by)
          OUTPUT inserted.id,inserted.row_version
          VALUES(@cycle,@employee,@reviewer,@status,@selfSummary,@managerSummary,@goal,
            CASE WHEN @reviewer IS NULL AND @status=N'MANAGER_REVIEW' THEN SYSUTCDATETIME() END,
            CASE WHEN @reviewer IS NOT NULL AND @status=N'CALIBRATION' THEN SYSUTCDATETIME() END,@actor);
        `)).recordset[0];
                assessmentId = Number(row.id);
                nextVersion = row.row_version;
            }
            else {
                const version = parseRowVersion(body.rowVersion), update = new sql.Request(transaction);
                update.input("self", sql.Bit, selfReview).input("actor", sql.BigInt, actor.id).input("status", sql.NVarChar(30), nextStatus)
                    .input("summary", sql.NVarChar(1000), summary).input("goal", sql.NVarChar(1000), developmentGoal).input("submit", sql.Bit, submit)
                    .input("id", sql.BigInt, target.assessment_id).input("version", sql.VarBinary(8), version);
                const row = (await update.query(`
          DECLARE @updated TABLE(row_version binary(8));
          UPDATE dbo.kpi_assessments SET reviewer_id=CASE WHEN @self=1 THEN reviewer_id ELSE @actor END,status=@status,
            self_summary=CASE WHEN @self=1 THEN @summary ELSE self_summary END,
            manager_summary=CASE WHEN @self=0 THEN @summary ELSE manager_summary END,
            development_goal=CASE WHEN @goal=N'' THEN development_goal ELSE @goal END,
            self_submitted_at=CASE WHEN @self=1 AND @submit=1 THEN SYSUTCDATETIME() ELSE self_submitted_at END,
            manager_submitted_at=CASE WHEN @self=0 AND @submit=1 THEN SYSUTCDATETIME() ELSE manager_submitted_at END,
            updated_by=@actor,updated_at=SYSUTCDATETIME()
          OUTPUT inserted.row_version INTO @updated WHERE id=@id AND row_version=@version;
          SELECT row_version FROM @updated;
        `)).recordset[0];
                if (!row)
                    throw new ApiError(409, "concurrency_conflict", "This KPI assessment changed. Refresh and try again.");
                assessmentId = Number(target.assessment_id);
                nextVersion = row.row_version;
            }
            for (const score of inputScores) {
                const save = new sql.Request(transaction);
                save.input("assessment", sql.BigInt, assessmentId).input("area", sql.NVarChar(30), score.areaCode)
                    .input("score", sql.TinyInt, score.score).input("evidence", sql.NVarChar(1000), score.evidence);
                await save.query(selfReview ? `
          UPDATE dbo.kpi_assessment_scores SET self_score=@score,self_evidence=@evidence,updated_at=SYSUTCDATETIME() WHERE assessment_id=@assessment AND area_code=@area;
          IF @@ROWCOUNT=0 INSERT dbo.kpi_assessment_scores(assessment_id,area_code,self_score,self_evidence) VALUES(@assessment,@area,@score,@evidence);
        ` : `
          UPDATE dbo.kpi_assessment_scores SET manager_score=@score,manager_evidence=@evidence,updated_at=SYSUTCDATETIME() WHERE assessment_id=@assessment AND area_code=@area;
          IF @@ROWCOUNT=0 INSERT dbo.kpi_assessment_scores(assessment_id,area_code,manager_score,manager_evidence) VALUES(@assessment,@area,@score,@evidence);
        `);
            }
            await insertAudit(transaction, actor.id, "KpiAssessment", assessmentId, `${cycleId}:${employeeId}`, submit ? (selfReview ? "Self review submitted" : "Manager review submitted") : "Draft saved", before, { status: nextStatus, scores: inputScores.map(({ areaCode, score }) => ({ areaCode, score })), summary, developmentGoal });
            return { id: assessmentId, status: nextStatus, rowVersion: nextVersion.toString("base64") };
        });
    });
    app.post("/api/v1/performance/assessments/:employeeId/complete", async (request) => {
        await users.demandPermission(request, "performance.manage");
        const actor = await users.required(request), employeeId = positiveLong(request.params.employeeId, "Employee id"), body = bodyObject(request.body);
        const cycleId = requiredInteger(body.cycleId, "Cycle id", 1), note = requiredText(body.calibrationNote, 1000, "Calibration note"), version = parseRowVersion(body.rowVersion);
        return database.transaction(async (transaction) => {
            const target = await targetRow(transaction, employeeId, cycleId);
            if (!canManagePerformanceTarget(actor.role, target.target_role))
                throw new ApiError(403, "performance_scope_denied", "This employee is outside your KPI management scope.");
            if (Number(target.user_id) === actor.id)
                throw new ApiError(403, "performance_self_completion_denied", "Another review manager must complete your assessment.");
            const requiredAreaCount = frameworkForRole(target.target_role).areaCodes.length;
            const update = new sql.Request(transaction);
            update.input("note", sql.NVarChar(1000), note).input("actor", sql.BigInt, actor.id).input("cycle", sql.BigInt, cycleId)
                .input("employee", sql.BigInt, employeeId).input("version", sql.VarBinary(8), version).input("required_count", sql.Int, requiredAreaCount);
            const row = (await update.query(`
        DECLARE @completed TABLE(id bigint,row_version binary(8));
        UPDATE assessment SET status=N'COMPLETED',manager_summary=CASE WHEN manager_summary=N'' THEN @note ELSE manager_summary+NCHAR(10)+@note END,
          completed_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME()
        OUTPUT inserted.id,inserted.row_version INTO @completed
        FROM dbo.kpi_assessments assessment
        WHERE assessment.cycle_id=@cycle AND assessment.employee_id=@employee AND assessment.status=N'CALIBRATION'
          AND assessment.row_version=@version
          AND EXISTS(SELECT 1 FROM dbo.kpi_review_cycles cycle WHERE cycle.id=assessment.cycle_id AND cycle.status<>N'CLOSED')
          AND (SELECT COUNT(*) FROM dbo.kpi_assessment_scores score WHERE score.assessment_id=assessment.id AND score.manager_score IS NOT NULL)=@required_count;
        SELECT id,row_version FROM @completed;
      `)).recordset[0];
            if (!row)
                throw new ApiError(409, "performance_completion_conflict", "The assessment is not ready for completion or changed. Refresh and try again.");
            await insertAudit(transaction, actor.id, "KpiAssessment", Number(row.id), `${cycleId}:${employeeId}`, "Completed after calibration", null, { status: "COMPLETED", calibrationNote: note });
            return { id: Number(row.id), status: "COMPLETED", rowVersion: row.row_version.toString("base64") };
        });
    });
}
//# sourceMappingURL=performance.js.map