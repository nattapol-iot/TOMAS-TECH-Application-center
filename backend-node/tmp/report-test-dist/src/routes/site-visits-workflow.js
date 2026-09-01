import sql from "mssql/msnodesqlv8.js";
import { DatabaseCommitOutcomeUnknownError } from "../db.js";
import { contentTypeFor, deleteStoredFile, multipartText, readMultipartUpload, sendStoredFile, storageKey, uploadedFileName, validateFileExtension, writeStoredFile, } from "../document-storage.js";
import { ApiError } from "../errors.js";
import { bodyObject, oneOf, optionalBodyText, parseDateOnly, positiveLong, requiredInteger, requiredText, } from "../http.js";
import { issueDocumentNumber } from "../document-number.js";
import { activeEngineerIds, checkAvailability, demandAssignedEngineer, ensureReport, lockVisit, visitVersion, } from "../site-visit-operations.js";
import { INTAKE_TRANSITIONS, notifyUsers, recordSiteVisitStatus, requireRowVersion, requireTransition, rolePermissions, rowVersion, SITE_VISIT_PERMISSIONS, siteVisitAudit, usersWithPermission, VISIT_TRANSITIONS, } from "../site-visit-common.js";
import { skillMatch } from "../site-visit-data.js";
function clean(v, n, label) {
    return optionalBodyText(v, n, label) ?? "";
}
function optionalId(v, label) {
    return v == null ? null : requiredInteger(v, label, 1);
}
function stamp(v, label) {
    const d = new Date(requiredText(v, 80, label));
    if (Number.isNaN(d.valueOf()))
        throw new ApiError(400, "validation_failed", `${label} is invalid.`);
    return d;
}
function today(timeZone) {
    const p = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date()), v = Object.fromEntries(p.map((x) => [x.type, x.value]));
    return `${v.year}-${v.month}-${v.day}`;
}
export function registerSiteVisitWorkflowRoutes(app, config, database, users) {
    app.post("/api/v1/site-visits/", async (request, reply) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitSchedule);
        const actor = await users.required(request), b = bodyObject(request.body), intakeId = requiredInteger(b.intakeId, "Intake", 1), typeId = requiredInteger(b.visitTypeId, "Visit type", 1), template = optionalId(b.checklistTemplateId, "Checklist template"), windowId = optionalId(b.proposedWindowId, "Proposed window"), start = b.scheduledStart
            ? stamp(b.scheduledStart, "Scheduled start")
            : null, end = b.scheduledEnd ? stamp(b.scheduledEnd, "Scheduled end") : null;
        if ((start == null) !== (end == null) || (start && end && end <= start))
            throw new ApiError(400, "validation_failed", "Give a valid start and end, or neither.");
        const before = Math.min(1440, Math.max(0, Number(b.travelMinutesBefore) || 0)), after = Math.min(1440, Math.max(0, Number(b.travelMinutesAfter) || 0)), count = Math.min(20, Math.max(1, Number(b.requiredEngineerCount) || 1)), permissions = await rolePermissions(database, actor.role);
        const created = await database.transaction(async (t) => {
            const lock = new sql.Request(t);
            lock.input("id", sql.BigInt, intakeId);
            const intake = (await lock.query(`SELECT intake_no,status,sales_owner_id FROM dbo.sales_intakes WITH(UPDLOCK,HOLDLOCK) WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
            if (!intake)
                throw new ApiError(404, "intake_not_found", "Sales intake not found.");
            if (!["Ready to Schedule", "Scheduled"].includes(String(intake.status)))
                throw new ApiError(409, "intake_not_ready", `An intake in '${intake.status}' cannot be scheduled.`);
            const refs = new sql.Request(t);
            refs.input("type", sql.BigInt, typeId);
            refs.input("template", sql.BigInt, template);
            const defaults = (await refs.query(`SELECT COALESCE(@template,(SELECT TOP(1)id FROM dbo.visit_checklist_templates WHERE visit_type_id=@type AND is_active=1),(SELECT TOP(1)id FROM dbo.visit_checklist_templates WHERE code=N'CL_GENERAL' AND is_active=1)) template_id,COALESCE((SELECT TOP(1)id FROM dbo.visit_sla_policies WHERE visit_type_id=@type AND is_active=1),(SELECT TOP(1)id FROM dbo.visit_sla_policies WHERE is_default=1 AND is_active=1)) sla_id,CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.visit_types WHERE id=@type AND is_active=1) THEN 1 ELSE 0 END AS bit) valid;`)).recordset[0];
            if (!defaults.valid)
                throw new ApiError(422, "invalid_reference", "The visit purpose is not active.");
            const number = await issueDocumentNumber(t, "SV", today(config.businessTimeZone)), q = new sql.Request(t);
            q.input("number", sql.NVarChar(30), number);
            q.input("intake", sql.BigInt, intakeId);
            q.input("type", sql.BigInt, typeId);
            q.input("template", sql.BigInt, defaults.template_id);
            q.input("sla", sql.BigInt, defaults.sla_id);
            q.input("window", sql.BigInt, windowId);
            q.input("start", sql.DateTimeOffset, start);
            q.input("end", sql.DateTimeOffset, end);
            q.input("zone", sql.NVarChar(100), clean(b.timeZoneId, 100, "Time zone") || "SE Asia Standard Time");
            q.input("before", sql.Int, before);
            q.input("after", sql.Int, after);
            q.input("meeting", sql.NVarChar(500), clean(b.meetingPoint, 500, "Meeting point"));
            q.input("equipment", sql.NVarChar(sql.MAX), optionalBodyText(b.requiredEquipment, 20_000, "Required equipment"));
            q.input("internal", sql.NVarChar(sql.MAX), optionalBodyText(b.internalNote, 20_000, "Internal note"));
            q.input("customer", sql.NVarChar(sql.MAX), optionalBodyText(b.customerNote, 20_000, "Customer note"));
            q.input("count", sql.TinyInt, count);
            q.input("department", sql.NVarChar(100), actor.department);
            q.input("actor", sql.BigInt, actor.id);
            const id = Number((await q.query(`INSERT INTO dbo.site_visits(visit_no,intake_id,status,visit_type_id,checklist_template_id,sla_policy_id,proposed_window_id,scheduled_start,scheduled_end,time_zone_id,travel_minutes_before,travel_minutes_after,meeting_point,required_equipment,internal_note,customer_note,required_engineer_count,department,created_by,updated_by) OUTPUT inserted.id VALUES(@number,@intake,N'Tentative',@type,@template,@sla,@window,@start,@end,@zone,@before,@after,@meeting,@equipment,@internal,@customer,@count,@department,@actor,@actor);`)).recordset[0].id);
            if (start) {
                const hist = new sql.Request(t);
                hist.input("id", sql.BigInt, id);
                hist.input("start", sql.DateTimeOffset, start);
                hist.input("end", sql.DateTimeOffset, end);
                hist.input("actor", sql.BigInt, actor.id);
                await hist.query(`INSERT INTO dbo.site_visit_schedule_history(visit_id,new_start,new_end,reason,changed_by) VALUES(@id,@start,@end,N'Initial schedule',@actor);`);
            }
            await recordSiteVisitStatus(t, "SiteVisit", id, number, null, "Tentative", "Site visit requested", actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, number, "Site visit created", undefined, { intakeId, typeId, start, end });
            if (intake.status === "Ready to Schedule") {
                requireTransition(INTAKE_TRANSITIONS, "Ready to Schedule", "Scheduled", permissions);
                const update = new sql.Request(t);
                update.input("id", sql.BigInt, intakeId);
                update.input("actor", sql.BigInt, actor.id);
                await update.query(`UPDATE dbo.sales_intakes SET status=N'Scheduled',updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
                await recordSiteVisitStatus(t, "SalesIntake", intakeId, String(intake.intake_no), "Ready to Schedule", "Scheduled", `Site visit ${number} created`, actor.id);
            }
            await notifyUsers(t, [Number(intake.sales_owner_id)], "visit.created", `${number} was created for ${intake.intake_no}`, "A site visit request has been raised for your intake.", "SiteVisit", id, `visit.created:${id}`);
            return { id, number, intakeId };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
        return reply
            .status(201)
            .header("Location", `/api/v1/site-visits/${created.id}`)
            .send(created);
    });
    app.post("/api/v1/site-visits/:id/status", async (request) => {
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), target = requiredText(b.status, 50, "Status"), reason = optionalBodyText(b.reason, 4000, "Reason"), permissions = await rolePermissions(database, actor.role);
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id, b.rowVersion);
            requireTransition(VISIT_TRANSITIONS, visit.status, target, permissions, reason);
            if (target === "Pending Engineer Confirmation" &&
                (!(await activeEngineerIds(t, id)).length || !visit.scheduledStart))
                throw new ApiError(409, "not_ready_for_confirmation", "Assign at least one engineer and set the schedule first.");
            if (target === "Pending Customer Confirmation") {
                const q = new sql.Request(t);
                q.input("id", sql.BigInt, id);
                const n = Number((await q.query(`SELECT COUNT(*) n FROM dbo.site_visit_assignments WHERE visit_id=@id AND is_active=1 AND status=N'Accepted';`)).recordset[0].n);
                if (!n)
                    throw new ApiError(409, "engineer_not_accepted", "No engineer has accepted this visit yet.");
            }
            if (target === "Confirmed") {
                const q = new sql.Request(t);
                q.input("id", sql.BigInt, id);
                const ok = Boolean((await q.query(`SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM dbo.site_visit_confirmations WHERE visit_id=@id AND party=N'Customer' AND outcome=N'Confirmed') THEN 1 ELSE 0 END AS bit) ok;`)).recordset[0].ok);
                if (!ok)
                    throw new ApiError(409, "customer_not_confirmed", "Record the customer confirmation first.");
            }
            const q = new sql.Request(t);
            q.input("id", sql.BigInt, id);
            q.input("status", sql.NVarChar(50), target);
            q.input("actor", sql.BigInt, actor.id);
            q.input("customer", sql.Bit, target === "Confirmed");
            q.input("engineer", sql.Bit, target === "Pending Customer Confirmation");
            await q.query(`UPDATE dbo.site_visits SET status=@status,customer_confirmed_at=CASE WHEN @customer=1 THEN ISNULL(customer_confirmed_at,SYSUTCDATETIME()) ELSE customer_confirmed_at END,engineer_confirmed_at=CASE WHEN @engineer=1 THEN ISNULL(engineer_confirmed_at,SYSUTCDATETIME()) ELSE engineer_confirmed_at END,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
            await recordSiteVisitStatus(t, "SiteVisit", id, visit.number, visit.status, target, reason, actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, `Visit status ${visit.status} to ${target}`, { status: visit.status }, { status: target }, reason);
            await notifyUsers(t, [...(await activeEngineerIds(t, id)), visit.salesOwnerId].filter((x) => x !== actor.id), `visit.${target.toLowerCase().replaceAll(" ", "_")}`, `${visit.number} is now ${target}`, reason ?? `The site visit moved from ${visit.status} to ${target}.`, "SiteVisit", id, `visit.status:${id}:${visit.status}:${target}`);
            return {
                id,
                number: visit.number,
                status: target,
                rowVersion: await visitVersion(t, id),
            };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.put("/api/v1/site-visits/:id/schedule", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitSchedule);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), start = stamp(b.scheduledStart, "Scheduled start"), end = stamp(b.scheduledEnd, "Scheduled end"), reason = requiredText(b.reason, 1000, "Reason"), before = Math.min(1440, Math.max(0, Number(b.travelMinutesBefore) || 0)), after = Math.min(1440, Math.max(0, Number(b.travelMinutesAfter) || 0));
        if (end <= start)
            throw new ApiError(400, "validation_failed", "The visit must end after it starts.");
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id, b.rowVersion);
            if (["Cancelled", "Closed", "Completed", "In Progress"].includes(visit.status))
                throw new ApiError(409, "not_reschedulable", `A visit in '${visit.status}' cannot be rescheduled.`);
            const engineers = await activeEngineerIds(t, id);
            for (const engineer of engineers) {
                const conflict = await checkAvailability(t, engineer, start, end, before, after, id, true);
                if (conflict.conflicts)
                    throw new ApiError(409, "schedule_conflict", "An assigned engineer is already committed at the new time.", { engineerId: engineer, detail: conflict.detail });
            }
            const q = new sql.Request(t);
            q.input("id", sql.BigInt, id);
            q.input("start", sql.DateTimeOffset, start);
            q.input("end", sql.DateTimeOffset, end);
            q.input("zone", sql.NVarChar(100), clean(b.timeZoneId, 100, "Time zone") || "SE Asia Standard Time");
            q.input("before", sql.Int, before);
            q.input("after", sql.Int, after);
            q.input("meeting", sql.NVarChar(500), clean(b.meetingPoint, 500, "Meeting point"));
            q.input("actor", sql.BigInt, actor.id);
            await q.query(`UPDATE dbo.site_visits SET scheduled_start=@start,scheduled_end=@end,time_zone_id=@zone,travel_minutes_before=@before,travel_minutes_after=@after,meeting_point=@meeting,engineer_confirmed_at=NULL,customer_confirmed_at=NULL,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id; UPDATE dbo.site_visit_assignments SET status=N'Proposed',responded_at=NULL WHERE visit_id=@id AND is_active=1 AND status=N'Accepted';`);
            const history = new sql.Request(t);
            history.input("id", sql.BigInt, id);
            history.input("previous_start", sql.DateTimeOffset, visit.scheduledStart);
            history.input("previous_end", sql.DateTimeOffset, visit.scheduledEnd);
            history.input("start", sql.DateTimeOffset, start);
            history.input("end", sql.DateTimeOffset, end);
            history.input("reason", sql.NVarChar(1000), reason);
            history.input("actor", sql.BigInt, actor.id);
            await history.query(`INSERT INTO dbo.site_visit_schedule_history(visit_id,previous_start,previous_end,new_start,new_end,reason,changed_by) VALUES(@id,@previous_start,@previous_end,@start,@end,@reason,@actor);`);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, "Visit rescheduled", { start: visit.scheduledStart, end: visit.scheduledEnd }, { start, end }, reason);
            await notifyUsers(t, [...engineers, visit.salesOwnerId].filter((x) => x !== actor.id), "visit.rescheduled", `${visit.number} was rescheduled`, `New time: ${start.toISOString()}–${end.toISOString()}. Reason: ${reason}`, "SiteVisit", id, `visit.rescheduled:${id}:${start.toISOString()}`);
            return {
                id,
                number: visit.number,
                rowVersion: await visitVersion(t, id),
            };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.post("/api/v1/site-visits/:id/assignments", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitSchedule);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), engineerId = requiredInteger(b.engineerId, "Engineer", 1), assignmentRole = oneOf(requiredText(b.assignmentRole, 30, "Assignment role"), "Assignment role", ["Lead Engineer", "Supporting Engineer"]), override = b.conflictOverride === true, overrideReason = optionalBodyText(b.overrideReason, 1000, "Override reason"), permissions = await rolePermissions(database, actor.role);
        if (override &&
            (!permissions.has(SITE_VISIT_PERMISSIONS.visitOverride) ||
                !overrideReason ||
                overrideReason.length < 10))
            throw new ApiError(403, "permission_denied", "A manager permission and a meaningful reason are required to override a conflict.");
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id, b.rowVersion);
            if (["Cancelled", "Closed", "Completed"].includes(visit.status))
                throw new ApiError(409, "visit_closed", `A visit in '${visit.status}' cannot be assigned.`);
            const user = new sql.Request(t);
            user.input("id", sql.BigInt, engineerId);
            const engineer = (await user.query(`SELECT u.name FROM dbo.users u INNER JOIN dbo.roles r ON r.id=u.role_id WHERE u.id=@id AND u.is_active=1 AND u.deleted_at IS NULL AND r.code IN(N'Engineer',N'Engineering Manager',N'Engineering Coordinator',N'Project Manager',N'Admin');`)).recordset[0];
            if (!engineer)
                throw new ApiError(422, "invalid_reference", "The engineer must be an active engineering user.");
            let conflict = { conflicts: 0, detail: "" };
            if (visit.scheduledStart && visit.scheduledEnd)
                conflict = await checkAvailability(t, engineerId, visit.scheduledStart, visit.scheduledEnd, visit.travelBefore, visit.travelAfter, id, override);
            if (conflict.conflicts && !override)
                throw new ApiError(409, "schedule_conflict", "This engineer is already committed during the visit window.", { detail: conflict.detail, overridable: true });
            const required = (await new sql.Request(t)
                .input("id", sql.BigInt, visit.intakeId)
                .query(`DECLARE @source nvarchar(20)=CASE WHEN EXISTS(SELECT 1 FROM dbo.sales_intake_skills WHERE intake_id=@id AND source=N'Coordinator') THEN N'Coordinator' ELSE N'Sales' END; SELECT k.code FROM dbo.sales_intake_skills s INNER JOIN dbo.visit_skills k ON k.id=s.skill_id WHERE s.intake_id=@id AND s.source=@source ORDER BY k.sort_order,k.code;`)).recordset.map((x) => x.code), held = (await new sql.Request(t)
                .input("id", sql.BigInt, engineerId)
                .query(`SELECT k.code FROM dbo.engineer_skills es INNER JOIN dbo.visit_skills k ON k.id=es.skill_id WHERE es.user_id=@id;`)).recordset.map((x) => x.code), match = skillMatch(required, held);
            const close = new sql.Request(t);
            close.input("visit", sql.BigInt, id);
            close.input("engineer", sql.BigInt, engineerId);
            close.input("role", sql.NVarChar(30), assignmentRole);
            await close.query(`UPDATE dbo.site_visit_assignments SET is_active=0,status=CASE WHEN status=N'Proposed' THEN N'Withdrawn' ELSE status END WHERE visit_id=@visit AND is_active=1 AND(engineer_id=@engineer OR(@role=N'Lead Engineer' AND assignment_role=N'Lead Engineer'));`);
            const q = new sql.Request(t);
            q.input("visit", sql.BigInt, id);
            q.input("engineer", sql.BigInt, engineerId);
            q.input("role", sql.NVarChar(30), assignmentRole);
            q.input("match", sql.TinyInt, match.percent);
            q.input("override", sql.Bit, override && conflict.conflicts > 0);
            q.input("reason", sql.NVarChar(1000), override && conflict.conflicts ? overrideReason : null);
            q.input("override_by", sql.BigInt, override && conflict.conflicts ? actor.id : null);
            q.input("actor", sql.BigInt, actor.id);
            const assignmentId = Number((await q.query(`INSERT INTO dbo.site_visit_assignments(visit_id,engineer_id,assignment_role,status,skill_match_percent,conflict_override,override_reason,override_by,override_at,assigned_by) OUTPUT inserted.id VALUES(@visit,@engineer,@role,N'Proposed',@match,@override,@reason,@override_by,CASE WHEN @override=1 THEN SYSUTCDATETIME() END,@actor);`)).recordset[0].id);
            await recordSiteVisitStatus(t, "Assignment", assignmentId, visit.number, null, "Proposed", `${engineer.name} assigned as ${assignmentRole}`, actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, "Engineer assigned", undefined, {
                assignmentId,
                engineerId,
                engineerName: engineer.name,
                assignmentRole,
                matchPercent: match.percent,
                missingSkills: match.missing,
                conflicts: conflict.conflicts,
            }, overrideReason);
            await notifyUsers(t, [engineerId], "visit.assigned", `You are assigned to ${visit.number}`, `${assignmentRole} · ${visit.scheduledStart?.toISOString() ?? "not scheduled"}`, "SiteVisit", id, `visit.assigned:${id}:${assignmentId}`);
            return {
                id,
                assignmentId,
                matchPercent: match.percent,
                missingSkills: match.missing,
                conflicts: conflict.conflicts,
                conflictDetail: conflict.detail,
                rowVersion: await visitVersion(t, id),
            };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.post("/api/v1/site-visits/:id/assignments/:assignmentId/response", async (request) => {
        const actor = await users.required(request), p = request.params, id = positiveLong(p.id, "Visit id"), assignmentId = positiveLong(p.assignmentId, "Assignment id"), b = bodyObject(request.body), response = oneOf(requiredText(b.response, 30, "Response"), "Response", [
            "Accepted",
            "Declined",
            "Information Requested",
            "New Time Proposed",
        ]), note = optionalBodyText(b.note, 2000, "Note"), proposedStart = b.proposedStart
            ? stamp(b.proposedStart, "Proposed start")
            : null, proposedEnd = b.proposedEnd
            ? stamp(b.proposedEnd, "Proposed end")
            : null, actorPermissions = await rolePermissions(database, actor.role);
        if ((["Declined", "Information Requested"].includes(response) && !note) ||
            (response === "New Time Proposed" &&
                (!proposedStart || !proposedEnd || proposedEnd <= proposedStart)))
            throw new ApiError(400, "validation_failed", "A reason or valid proposed time is required.");
        return database.transaction(async (t) => {
            const q = new sql.Request(t);
            q.input("assignment", sql.BigInt, assignmentId);
            q.input("visit", sql.BigInt, id);
            const a = (await q.query(`SELECT a.engineer_id,a.assignment_role,v.visit_no,a.row_version FROM dbo.site_visit_assignments a WITH(UPDLOCK,HOLDLOCK) INNER JOIN dbo.site_visits v ON v.id=a.visit_id WHERE a.id=@assignment AND a.visit_id=@visit AND a.is_active=1 AND v.deleted_at IS NULL;`)).recordset[0];
            if (!a)
                throw new ApiError(404, "assignment_not_found", "Assignment not found.");
            requireRowVersion(b.rowVersion, a.row_version);
            if (Number(a.engineer_id) !== actor.id &&
                !actorPermissions.has(SITE_VISIT_PERMISSIONS.visitSchedule))
                throw new ApiError(403, "not_your_assignment", "Only the assigned engineer or a coordinator may respond.");
            const update = new sql.Request(t);
            update.input("id", sql.BigInt, assignmentId);
            update.input("status", sql.NVarChar(30), response);
            update.input("note", sql.NVarChar(2000), note);
            update.input("start", sql.DateTimeOffset, proposedStart);
            update.input("end", sql.DateTimeOffset, proposedEnd);
            update.input("declined", sql.Bit, response === "Declined");
            await update.query(`UPDATE dbo.site_visit_assignments SET status=@status,response_note=@note,responded_at=SYSUTCDATETIME(),proposed_start=@start,proposed_end=@end,is_active=CASE WHEN @declined=1 THEN 0 ELSE is_active END WHERE id=@id;`);
            await recordSiteVisitStatus(t, "Assignment", assignmentId, String(a.visit_no), "Proposed", response, note, actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, String(a.visit_no), `Assignment ${response.toLowerCase()}`, undefined, { assignmentId, response, proposedStart, proposedEnd }, note);
            await notifyUsers(t, (await usersWithPermission(t, SITE_VISIT_PERMISSIONS.visitSchedule)).filter((x) => x !== actor.id), `visit.assignment_${response.toLowerCase().replaceAll(" ", "_")}`, `${a.visit_no}: assignment ${response.toLowerCase()}`, note ?? `${actor.name} responded to the assignment.`, "SiteVisit", id, `visit.assignment_response:${id}:${assignmentId}:${response}`);
            return {
                id,
                assignmentId,
                status: response,
                rowVersion: await visitVersion(t, id),
            };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.delete("/api/v1/site-visits/:id/assignments/:assignmentId", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitSchedule);
        const actor = await users.required(request), p = request.params, id = positiveLong(p.id, "Visit id"), assignmentId = positiveLong(p.assignmentId, "Assignment id");
        return database.transaction(async (t) => {
            const q = new sql.Request(t);
            q.input("assignment", sql.BigInt, assignmentId);
            q.input("visit", sql.BigInt, id);
            const a = (await q.query(`SELECT v.visit_no,a.engineer_id FROM dbo.site_visit_assignments a INNER JOIN dbo.site_visits v ON v.id=a.visit_id WHERE a.id=@assignment AND a.visit_id=@visit AND a.is_active=1 AND v.deleted_at IS NULL;`)).recordset[0];
            if (!a)
                throw new ApiError(404, "assignment_not_found", "Assignment not found.");
            const u = new sql.Request(t);
            u.input("id", sql.BigInt, assignmentId);
            await u.query(`UPDATE dbo.site_visit_assignments SET is_active=0,status=N'Withdrawn' WHERE id=@id;`);
            await recordSiteVisitStatus(t, "Assignment", assignmentId, String(a.visit_no), null, "Withdrawn", "Assignment withdrawn by the coordinator", actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, String(a.visit_no), "Assignment withdrawn", { assignmentId, engineerId: Number(a.engineer_id) });
            await notifyUsers(t, [Number(a.engineer_id)], "visit.assignment_withdrawn", `${a.visit_no}: your assignment was withdrawn`, "The coordinator removed you from this site visit.", "SiteVisit", id, `visit.assignment_withdrawn:${id}:${assignmentId}`);
            return { id, assignmentId };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/site-visits/:id/confirmations", async (request) => {
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), party = oneOf(requiredText(b.party, 20, "Party"), "Party", [
            "Engineer",
            "Customer",
        ]), outcome = oneOf(requiredText(b.outcome, 30, "Outcome"), "Outcome", [
            "Confirmed",
            "Declined",
            "Rescheduled",
            "Information Requested",
            "No Response",
        ]), channel = oneOf(requiredText(b.channel, 30, "Channel"), "Channel", [
            "Email",
            "Phone",
            "LINE",
            "Meeting",
            "Customer Portal",
            "Other",
        ]), name = party === "Customer"
            ? requiredText(b.confirmedByName, 200, "Confirmed by")
            : clean(b.confirmedByName, 200, "Confirmed by") || actor.name, permissions = await rolePermissions(database, actor.role);
        if (!permissions.has(SITE_VISIT_PERMISSIONS.visitSchedule) &&
            !permissions.has(SITE_VISIT_PERMISSIONS.intakeWrite))
            throw new ApiError(403, "permission_denied", "Recording a confirmation requires visit.schedule or intake.write.");
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id, b.rowVersion), confirmedAt = b.confirmedAt
                ? stamp(b.confirmedAt, "Confirmation time")
                : new Date(), comment = optionalBodyText(b.comment, 20_000, "Comment");
            const q = new sql.Request(t);
            q.input("visit", sql.BigInt, id);
            q.input("party", sql.NVarChar(20), party);
            q.input("outcome", sql.NVarChar(30), outcome);
            q.input("channel", sql.NVarChar(30), channel);
            q.input("name", sql.NVarChar(200), name);
            q.input("user", sql.BigInt, party === "Engineer" ? actor.id : null);
            q.input("at", sql.DateTimeOffset, confirmedAt);
            q.input("comment", sql.NVarChar(sql.MAX), comment);
            q.input("evidence", sql.BigInt, optionalId(b.evidenceAttachmentId, "Evidence attachment"));
            q.input("actor", sql.BigInt, actor.id);
            const confirmationId = Number((await q.query(`INSERT INTO dbo.site_visit_confirmations(visit_id,party,outcome,channel,confirmed_by_name,confirmed_by_user_id,confirmed_at,comment,evidence_attachment_id,recorded_by) OUTPUT inserted.id VALUES(@visit,@party,@outcome,@channel,@name,@user,@at,@comment,@evidence,@actor);`)).recordset[0].id);
            if (outcome === "Confirmed") {
                const u = new sql.Request(t);
                u.input("id", sql.BigInt, id);
                u.input("at", sql.DateTimeOffset, confirmedAt);
                u.input("actor", sql.BigInt, actor.id);
                await u.query(`UPDATE dbo.site_visits SET ${party === "Customer" ? "customer_confirmed_at" : "engineer_confirmed_at"}=@at,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
            }
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, `${party} confirmation recorded`, undefined, { confirmationId, party, outcome, channel, name, confirmedAt }, comment);
            if (party === "Customer" && outcome === "Confirmed")
                await notifyUsers(t, [...(await activeEngineerIds(t, id)), visit.salesOwnerId].filter((x) => x !== actor.id), "visit.customer_confirmed", `${visit.number}: the customer confirmed`, `Confirmed by ${name} via ${channel}.`, "SiteVisit", id, `visit.customer_confirmed:${id}:${confirmationId}`);
            return { id, confirmationId, rowVersion: await visitVersion(t, id) };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.post("/api/v1/site-visits/:id/check-in", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitExecute);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), permissions = await rolePermissions(database, actor.role), consent = b.locationConsentGiven === true, latitude = consent && b.latitude != null ? Number(b.latitude) : null, longitude = consent && b.longitude != null ? Number(b.longitude) : null;
        if ((latitude != null && (latitude < -90 || latitude > 90)) ||
            (longitude != null && (longitude < -180 || longitude > 180)))
            throw new ApiError(400, "validation_failed", "The location is out of range.");
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id, b.rowVersion);
            await demandAssignedEngineer(t, id, actor.id);
            requireTransition(VISIT_TRANSITIONS, visit.status, "In Progress", permissions);
            const q = new sql.Request(t);
            q.input("id", sql.BigInt, id);
            q.input("actor", sql.BigInt, actor.id);
            q.input("latitude", sql.Decimal(9, 6), latitude);
            q.input("longitude", sql.Decimal(9, 6), longitude);
            q.input("consent", sql.Bit, consent);
            q.input("attendees", sql.NVarChar(sql.MAX), optionalBodyText(b.actualAttendees, 4000, "Actual attendees"));
            q.input("customers", sql.NVarChar(sql.MAX), optionalBodyText(b.customerAttendees, 4000, "Customer attendees"));
            await q.query(`UPDATE dbo.site_visits SET status=N'In Progress',checked_in_at=SYSUTCDATETIME(),checked_in_by=@actor,check_in_latitude=@latitude,check_in_longitude=@longitude,location_consent_given=@consent,actual_attendees=@attendees,customer_attendees=@customers,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
            await recordSiteVisitStatus(t, "SiteVisit", id, visit.number, visit.status, "In Progress", "Engineer checked in", actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, "Checked in", undefined, { locationConsentGiven: consent, hasLocation: latitude != null });
            await notifyUsers(t, [visit.salesOwnerId], "visit.checked_in", `${visit.number}: the engineer checked in`, `${actor.name} has arrived on site.`, "SiteVisit", id, `visit.checked_in:${id}`);
            return {
                id,
                status: "In Progress",
                rowVersion: await visitVersion(t, id),
            };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.post("/api/v1/site-visits/:id/check-out", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitExecute);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), permissions = await rolePermissions(database, actor.role);
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id, b.rowVersion);
            await demandAssignedEngineer(t, id, actor.id);
            requireTransition(VISIT_TRANSITIONS, visit.status, "Report Pending", permissions);
            const missing = new sql.Request(t);
            missing.input("id", sql.BigInt, id);
            const unanswered = (await missing.query(`SELECT ci.prompt FROM dbo.site_visits v INNER JOIN dbo.visit_checklist_items ci ON ci.template_id=v.checklist_template_id LEFT JOIN dbo.site_visit_checklist_responses r ON r.visit_id=v.id AND r.checklist_item_id=ci.id WHERE v.id=@id AND ci.is_active=1 AND ci.is_required=1 AND(r.id IS NULL OR(r.is_not_applicable=0 AND ISNULL(r.response_value,N'')=N'' AND r.numeric_value IS NULL)) ORDER BY ci.sort_order;`)).recordset.map((x) => x.prompt);
            if (unanswered.length)
                throw new ApiError(422, "checklist_incomplete", "Some required checklist items are still unanswered.", unanswered);
            const due = new Date(Date.now() + visit.reportDueDays * 86_400_000), q = new sql.Request(t);
            q.input("id", sql.BigInt, id);
            q.input("actor", sql.BigInt, actor.id);
            q.input("note", sql.NVarChar(sql.MAX), optionalBodyText(b.executionNote, 20_000, "Execution note"));
            q.input("due", sql.DateTimeOffset, due);
            await q.query(`UPDATE dbo.site_visits SET status=N'Report Pending',checked_out_at=SYSUTCDATETIME(),checked_out_by=@actor,execution_note=@note,report_due_at=@due,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
            const reportNumber = await ensureReport(t, id, visit.number, actor.id, due, today(config.businessTimeZone));
            await recordSiteVisitStatus(t, "SiteVisit", id, visit.number, visit.status, "Report Pending", "Engineer checked out", actor.id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, "Checked out", undefined, { reportDue: due, reportNumber });
            await notifyUsers(t, [actor.id], "visit.report_due", `${visit.number}: report due ${due.toISOString().slice(0, 10)}`, `The report is due within ${visit.reportDueDays} day(s).`, "SiteVisit", id, `visit.report_due:${id}`);
            await notifyUsers(t, [visit.salesOwnerId], "visit.checked_out", `${visit.number}: the visit is finished`, "The engineer has checked out. The report will follow.", "SiteVisit", id, `visit.checked_out:${id}`);
            return {
                id,
                status: "Report Pending",
                reportDueAt: due,
                reportNumber,
                rowVersion: await visitVersion(t, id),
            };
        }, sql.ISOLATION_LEVEL.SERIALIZABLE);
    });
    app.put("/api/v1/site-visits/:id/checklist", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitExecute);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), answers = Array.isArray(request.body) ? request.body.map(bodyObject) : [];
        if (answers.length > 200)
            throw new ApiError(400, "validation_failed", "At most two hundred checklist answers may be saved at once.");
        return database.transaction(async (t) => {
            const q = new sql.Request(t);
            q.input("id", sql.BigInt, id);
            const visit = (await q.query(`SELECT visit_no,status FROM dbo.site_visits WHERE id=@id AND deleted_at IS NULL;`)).recordset[0];
            if (!visit)
                throw new ApiError(404, "visit_not_found", "Site visit not found.");
            await demandAssignedEngineer(t, id, actor.id);
            if (!["Confirmed", "In Progress", "Report Pending"].includes(visit.status))
                throw new ApiError(409, "not_executable", `Checklist answers cannot be saved while the visit is '${visit.status}'.`);
            let saved = 0;
            for (const b of answers) {
                const item = requiredInteger(b.checklistItemId, "Checklist item", 1), update = new sql.Request(t);
                update.input("visit", sql.BigInt, id);
                update.input("item", sql.BigInt, item);
                update.input("value", sql.NVarChar(sql.MAX), optionalBodyText(b.responseValue, 20_000, "Response"));
                update.input("numeric", sql.Decimal(19, 4), b.numericValue == null ? null : Number(b.numericValue));
                update.input("unit", sql.NVarChar(40), clean(b.unit, 40, "Unit"));
                update.input("na", sql.Bit, b.isNotApplicable === true);
                update.input("note", sql.NVarChar(sql.MAX), optionalBodyText(b.note, 20_000, "Note"));
                update.input("actor", sql.BigInt, actor.id);
                const r = await update.query(`UPDATE dbo.site_visit_checklist_responses SET response_value=@value,numeric_value=@numeric,unit=@unit,is_not_applicable=@na,note=@note,answered_by=@actor,answered_at=SYSUTCDATETIME() WHERE visit_id=@visit AND checklist_item_id=@item; IF @@ROWCOUNT=0 INSERT INTO dbo.site_visit_checklist_responses(visit_id,checklist_item_id,response_value,numeric_value,unit,is_not_applicable,note,answered_by) SELECT @visit,@item,@value,@numeric,@unit,@na,@note,@actor WHERE EXISTS(SELECT 1 FROM dbo.visit_checklist_items ci INNER JOIN dbo.site_visits v ON v.checklist_template_id=ci.template_id WHERE ci.id=@item AND v.id=@visit);`);
                if ((r.rowsAffected[0] ?? 0) + (r.rowsAffected[1] ?? 0) > 0)
                    saved++;
            }
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.visit_no, "Checklist saved", undefined, { saved, requested: answers.length });
            return { id, saved };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/site-visits/:id/findings", async (request, reply) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitExecute);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), kind = oneOf(requiredText(b.kind, 30, "Kind"), "Kind", [
            "Finding",
            "Measurement",
            "Risk",
            "Customer Request",
            "Proposed Solution",
            "Follow-up",
            "Existing Condition",
            "Safety Concern",
        ]), title = requiredText(b.title, 300, "Title"), severity = oneOf(requiredText(b.severity, 20, "Severity"), "Severity", [
            "Info",
            "Low",
            "Medium",
            "High",
            "Critical",
        ]);
        const result = await database.transaction(async (t) => {
            const visit = await lockVisit(t, id);
            await demandAssignedEngineer(t, id, actor.id);
            const q = new sql.Request(t);
            q.input("visit", sql.BigInt, id);
            q.input("kind", sql.NVarChar(30), kind);
            q.input("title", sql.NVarChar(300), title);
            q.input("detail", sql.NVarChar(sql.MAX), optionalBodyText(b.detail, 20_000, "Detail"));
            q.input("value", sql.Decimal(19, 4), b.measurementValue == null ? null : Number(b.measurementValue));
            q.input("unit", sql.NVarChar(40), clean(b.measurementUnit, 40, "Unit"));
            q.input("severity", sql.NVarChar(20), severity);
            q.input("sort", sql.Int, Math.min(100_000, Math.max(0, Number(b.sortOrder) || 0)));
            q.input("actor", sql.BigInt, actor.id);
            const findingId = Number((await q.query(`INSERT INTO dbo.site_visit_findings(visit_id,kind,title,detail,measurement_value,measurement_unit,severity,sort_order,created_by,updated_by) OUTPUT inserted.id VALUES(@visit,@kind,@title,@detail,@value,@unit,@severity,@sort,@actor,@actor);`)).recordset[0].id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, `${kind} recorded`, undefined, { findingId, kind, title, severity });
            return { id, findingId };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply
            .status(201)
            .header("Location", `/api/v1/site-visits/${id}`)
            .send(result);
    });
    app.delete("/api/v1/site-visits/:id/findings/:findingId", async (request) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitExecute);
        const actor = await users.required(request), p = request.params, id = positiveLong(p.id, "Visit id"), findingId = positiveLong(p.findingId, "Finding id");
        return database.transaction(async (t) => {
            const visit = await lockVisit(t, id);
            await demandAssignedEngineer(t, id, actor.id);
            const q = new sql.Request(t);
            q.input("visit", sql.BigInt, id);
            q.input("finding", sql.BigInt, findingId);
            q.input("actor", sql.BigInt, actor.id);
            const r = await q.query(`UPDATE dbo.site_visit_findings SET deleted_at=SYSUTCDATETIME(),updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@finding AND visit_id=@visit AND deleted_at IS NULL;`);
            if (r.rowsAffected[0] !== 1)
                throw new ApiError(404, "finding_not_found", "Finding not found.");
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, "Finding archived", { findingId });
            return { id, findingId };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post("/api/v1/site-visits/:id/action-items", async (request, reply) => {
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id"), b = bodyObject(request.body), title = requiredText(b.title, 300, "Title"), status = oneOf(requiredText(b.status, 30, "Status"), "Status", [
            "Open",
            "In Progress",
            "Done",
            "Cancelled",
        ]), ownerId = optionalId(b.ownerId, "Owner"), permissions = await rolePermissions(database, actor.role);
        if (!permissions.has(SITE_VISIT_PERMISSIONS.visitReport) &&
            !permissions.has(SITE_VISIT_PERMISSIONS.visitSchedule))
            throw new ApiError(403, "permission_denied", "Recording an action item requires visit.report or visit.schedule.");
        const result = await database.transaction(async (t) => {
            const visit = await lockVisit(t, id), q = new sql.Request(t);
            q.input("visit", sql.BigInt, id);
            q.input("title", sql.NVarChar(300), title);
            q.input("detail", sql.NVarChar(sql.MAX), optionalBodyText(b.detail, 20_000, "Detail"));
            q.input("owner", sql.BigInt, ownerId);
            q.input("owner_name", sql.NVarChar(200), clean(b.ownerName, 200, "Owner name"));
            q.input("due", sql.Date, parseDateOnly(b.dueDate, "Due date", true));
            q.input("status", sql.NVarChar(30), status);
            q.input("actor", sql.BigInt, actor.id);
            const actionItemId = Number((await q.query(`INSERT INTO dbo.site_visit_action_items(visit_id,report_id,title,detail,owner_id,owner_name,due_date,status,completed_at,created_by,updated_by) OUTPUT inserted.id SELECT @visit,(SELECT id FROM dbo.site_visit_reports WHERE visit_id=@visit),@title,@detail,@owner,@owner_name,@due,@status,CASE WHEN @status=N'Done' THEN SYSUTCDATETIME() END,@actor,@actor;`)).recordset[0].id);
            await siteVisitAudit(t, actor.id, "SiteVisit", id, visit.number, "Action item recorded", undefined, { actionItemId, title, ownerId, status });
            if (ownerId)
                await notifyUsers(t, [ownerId], "visit.action_item", `${visit.number}: an action item is assigned to you`, title, "SiteVisit", id, `visit.action_item:${id}:${actionItemId}`);
            return { id, actionItemId };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        return reply
            .status(201)
            .header("Location", `/api/v1/site-visits/${id}`)
            .send(result);
    });
    app.post("/api/v1/site-visits/:id/attachments", async (request, reply) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitExecute);
        const actor = await users.required(request), id = positiveLong(request.params.id, "Visit id");
        const guard = await database.transaction(async (t) => {
            const visit = await lockVisit(t, id);
            await demandAssignedEngineer(t, id, actor.id);
            return visit.number;
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
        const upload = await readMultipartUpload(request, config.documentStorage.maxFileSizeBytes), category = multipartText(upload.values, "category", 100, true), description = multipartText(upload.values, "description", 1000) ?? "", findingText = multipartText(upload.values, "findingId", 30), findingId = findingText ? positiveLong(findingText, "Finding id") : null, fileName = uploadedFileName(upload.file.filename), extension = validateFileExtension(fileName), contentType = contentTypeFor(fileName), key = storageKey(`site-visits/${id}`, extension), write = await writeStoredFile(config.documentStorage, key, upload.file.filepath);
        try {
            const created = await database.transaction(async (t) => {
                const q = new sql.Request(t);
                q.input("visit", sql.BigInt, id);
                q.input("finding", sql.BigInt, findingId);
                q.input("name", sql.NVarChar(500), fileName);
                q.input("category", sql.NVarChar(100), category);
                q.input("description", sql.NVarChar(1000), description);
                q.input("type", sql.NVarChar(200), contentType);
                q.input("size", sql.BigInt, write.sizeBytes);
                q.input("key", sql.NVarChar(1000), key);
                q.input("sha", sql.Char(64), write.sha256);
                q.input("actor", sql.BigInt, actor.id);
                const r = (await q.query(`DECLARE @version int=(SELECT ISNULL(MAX(version),0)+1 FROM dbo.site_visit_attachments WITH(UPDLOCK,HOLDLOCK) WHERE visit_id=@visit AND name=@name); INSERT INTO dbo.site_visit_attachments(visit_id,finding_id,name,category,description,version,content_type,size_bytes,storage_key,sha256,scan_status,uploaded_by) OUTPUT inserted.id,inserted.version,inserted.uploaded_at,inserted.row_version SELECT @visit,@finding,@name,@category,@description,@version,@type,@size,@key,@sha,N'Skipped',@actor WHERE @finding IS NULL OR EXISTS(SELECT 1 FROM dbo.site_visit_findings WHERE id=@finding AND visit_id=@visit AND deleted_at IS NULL);`)).recordset[0];
                if (!r)
                    throw new ApiError(422, "invalid_reference", "The selected finding does not exist on this visit.");
                await siteVisitAudit(t, actor.id, "SiteVisit", id, guard, "Site attachment uploaded", undefined, {
                    id: Number(r.id),
                    fileName,
                    category,
                    sizeBytes: write.sizeBytes,
                    sha256: write.sha256,
                });
                return {
                    id: Number(r.id),
                    findingId,
                    name: fileName,
                    category,
                    description,
                    version: Number(r.version),
                    contentType,
                    sizeBytes: write.sizeBytes,
                    scanStatus: "Skipped",
                    uploadedByName: actor.name,
                    uploadedAt: r.uploaded_at,
                    rowVersion: rowVersion(r.row_version),
                };
            }, sql.ISOLATION_LEVEL.READ_COMMITTED);
            return reply
                .status(201)
                .header("Location", `/api/v1/site-visits/${id}/attachments/${created.id}/content`)
                .send(created);
        }
        catch (error) {
            if (error instanceof DatabaseCommitOutcomeUnknownError)
                request.log.fatal({ err: error.originalError, storageKey: key, visitId: id }, "Visit attachment commit outcome unknown; preserving file");
            else
                await deleteStoredFile(config.documentStorage, key);
            throw error;
        }
    });
    app.get("/api/v1/site-visits/:id/attachments/:attachmentId/content", async (request, reply) => {
        await users.demandPermission(request, SITE_VISIT_PERMISSIONS.visitRead);
        const p = request.params, id = positiveLong(p.id, "Visit id"), attachmentId = positiveLong(p.attachmentId, "Attachment id"), r = (await database.query(`SELECT name,content_type,storage_key,size_bytes,sha256 FROM dbo.site_visit_attachments WHERE id=@attachment AND visit_id=@visit AND deleted_at IS NULL;`, (q) => {
            q.input("attachment", sql.BigInt, attachmentId);
            q.input("visit", sql.BigInt, id);
        })).recordset[0];
        if (!r)
            throw new ApiError(404, "attachment_not_found", "Attachment not found.");
        return sendStoredFile(request, reply, config.documentStorage, {
            storageKey: String(r.storage_key),
            fileName: String(r.name),
            contentType: String(r.content_type),
            sizeBytes: Number(r.size_bytes),
            sha256: String(r.sha256),
        });
    });
}
//# sourceMappingURL=site-visits-workflow.js.map