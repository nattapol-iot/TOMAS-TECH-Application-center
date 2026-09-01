import sql from 'mssql/msnodesqlv8.js';
import { bodyObject, clampedInteger, booleanQuery, positiveLong } from '../http.js';
import { ApiError } from '../errors.js';
import { insertAudit } from '../audit.js';
import { reportPermissions } from '../unified-report-service.js';
import { canManageTemplate, safeTemplateBody, templateDto, templateInput, templateLocale, templateMetadata, templateRow, templateVersion } from '../report-template-service.js';
export function registerReportTemplateRoutes(app, db, users) {
    const base = '/api/v1/reports/workspace/library';
    app.get(base, async (request) => {
        await users.demandPermission(request, 'report.read');
        const actor = await users.required(request), b = request.query, page = clampedInteger(b.page, 1, 1, 100000), pageSize = clampedInteger(b.pageSize, 50, 1, 100);
        return db.transaction(async (tx) => {
            const permissions = await reportPermissions(tx, actor.id), q = new sql.Request(tx);
            q.input('actor', sql.BigInt, actor.id).input('master', sql.Bit, permissions.has('master.write') && permissions.has('report.write')).input('archived', sql.Bit, booleanQuery(b.includeArchived)).input('search', sql.NVarChar(200), String(b.search ?? '').slice(0, 200)).input('type', sql.NVarChar(20), String(b.reportType ?? '')).input('offset', sql.Int, (page - 1) * pageSize).input('limit', sql.Int, pageSize);
            const predicate = `WHERE (is_active=1 OR (@archived=1 AND (created_by=@actor OR @master=1))) AND (@type=N'' OR report_type=@type) AND (name LIKE N'%'+@search+N'%' OR description LIKE N'%'+@search+N'%')`;
            const result = await q.query(`SELECT * FROM dbo.report_templates ${predicate} ORDER BY updated_at DESC,id DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;SELECT COUNT(*) total FROM dbo.report_templates ${predicate}`);
            return { items: result.recordsets[0].map(row => templateDto(row, actor, permissions)), page, pageSize, total: Number(result.recordsets[1][0]?.total ?? 0) };
        }, sql.ISOLATION_LEVEL.READ_COMMITTED);
    });
    app.post(`${base}/preview`, async (request) => {
        await users.demandPermission(request, 'report.write');
        await users.demandPermission(request, 'report.read');
        const actor = await users.required(request);
        return db.transaction(async (tx) => ({ ...await templateInput(tx, users, request, actor, request.body), sanitized: true }));
    });
    app.get(`${base}/:id`, async (request) => {
        await users.demandPermission(request, 'report.read');
        const actor = await users.required(request), id = positiveLong(request.params.id, 'Template');
        return db.transaction(async (tx) => {
            const row = await templateRow(tx, id), permissions = await reportPermissions(tx, actor.id);
            if (!row.is_active && !canManageTemplate(row, actor, permissions))
                throw new ApiError(404, 'report_template_missing', 'Template not found.');
            return templateDto(row, actor, permissions);
        });
    });
    app.post(base, async (request, reply) => {
        await users.demandPermission(request, 'report.write');
        const actor = await users.required(request), metadata = templateMetadata(request.body), body = bodyObject(request.body);
        if (body.sourceReportId != null)
            await users.demandPermission(request, 'report.read');
        const created = await db.transaction(async (tx) => {
            const input = await templateInput(tx, users, request, actor, body), q = new sql.Request(tx);
            q.input('name', sql.NVarChar(200), metadata.name).input('description', sql.NVarChar(2000), metadata.description).input('type', sql.NVarChar(20), input.reportType).input('locale', sql.NVarChar(5), input.locale).input('body', sql.NVarChar(sql.MAX), JSON.stringify(input.body)).input('actor', sql.BigInt, actor.id);
            const row = (await q.query('INSERT dbo.report_templates(name,description,report_type,locale,body_json,created_by,updated_by) OUTPUT inserted.* VALUES(@name,@description,@type,@locale,@body,@actor,@actor)')).recordset[0];
            await insertAudit(tx, actor.id, 'Report Template', Number(row.id), 'TPL-' + row.id, 'Created', null, { version: row.version, reportType: row.report_type });
            return templateDto(row, actor, await reportPermissions(tx, actor.id));
        });
        return reply.status(201).send(created);
    });
    app.put(`${base}/:id`, async (request) => {
        await users.demandPermission(request, 'report.write');
        const actor = await users.required(request), id = positiveLong(request.params.id, 'Template'), b = bodyObject(request.body), metadata = templateMetadata(b);
        return db.transaction(async (tx) => {
            const row = await templateRow(tx, id), permissions = await reportPermissions(tx, actor.id);
            if (!canManageTemplate(row, actor, permissions))
                throw new ApiError(403, 'report_template_owner', 'Only the creator or a master-data manager can edit this template.');
            templateVersion(row, b.rowVersion);
            if (!row.is_active)
                throw new ApiError(409, 'report_template_archived', 'Archived templates cannot be edited.');
            if (b.reportType !== undefined && b.reportType !== row.report_type)
                throw new ApiError(400, 'report_template_type', 'Template type cannot be changed.');
            const clean = safeTemplateBody(row.report_type, b.body), q = new sql.Request(tx);
            q.input('id', sql.BigInt, id).input('name', sql.NVarChar(200), metadata.name).input('description', sql.NVarChar(2000), metadata.description).input('locale', sql.NVarChar(5), templateLocale(b.locale ?? row.locale)).input('body', sql.NVarChar(sql.MAX), JSON.stringify(clean)).input('actor', sql.BigInt, actor.id);
            await q.query('UPDATE dbo.report_templates SET name=@name,description=@description,locale=@locale,body_json=@body,version=version+1,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id');
            const saved = await templateRow(tx, id);
            await insertAudit(tx, actor.id, 'Report Template', id, 'TPL-' + id, 'Updated', { version: row.version }, { version: saved.version });
            return templateDto(saved, actor, permissions);
        });
    });
    app.post(`${base}/:id/archive`, async (request) => {
        await users.demandPermission(request, 'report.write');
        const actor = await users.required(request), id = positiveLong(request.params.id, 'Template'), b = bodyObject(request.body);
        return db.transaction(async (tx) => {
            const row = await templateRow(tx, id), permissions = await reportPermissions(tx, actor.id);
            if (!canManageTemplate(row, actor, permissions))
                throw new ApiError(403, 'report_template_owner', 'Only the creator or a master-data manager can archive this template.');
            templateVersion(row, b.rowVersion);
            if (!row.is_active)
                throw new ApiError(409, 'report_template_archived', 'This template is already archived.');
            const q = new sql.Request(tx);
            q.input('id', sql.BigInt, id).input('actor', sql.BigInt, actor.id);
            await q.query('UPDATE dbo.report_templates SET is_active=0,version=version+1,updated_by=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id');
            const saved = await templateRow(tx, id);
            await insertAudit(tx, actor.id, 'Report Template', id, 'TPL-' + id, 'Archived', { version: row.version }, { version: saved.version });
            return templateDto(saved, actor, permissions);
        });
    });
}
//# sourceMappingURL=report-templates.js.map