import sql from 'mssql/msnodesqlv8.js';
import { ApiError } from './errors.js';
import { bodyObject, positiveLong, requiredText, parseRowVersion } from './http.js';
import { parseReportBody, readReport, reportAccess, reportPermissions } from './unified-report-service.js';
import { sanitizeReportTemplate } from './report-template-rules.js';
export function safeTemplateBody(reportType, body) {
    try {
        parseReportBody(body);
        return sanitizeReportTemplate(reportType, body);
    }
    catch (error) {
        throw new ApiError(400, 'report_template_body', error instanceof Error ? error.message : 'Invalid reusable template body.');
    }
}
export function templateLocale(value) {
    const locale = value ?? 'en';
    if (typeof locale !== 'string' || !['en', 'th', 'ja'].includes(locale))
        throw new ApiError(400, 'report_template_locale', 'Select en, th or ja.');
    return locale;
}
export function templateMetadata(value) {
    const b = bodyObject(value);
    if (b.description != null && (typeof b.description !== 'string' || b.description.length > 2000))
        throw new ApiError(400, 'report_template_description', 'Description must be text under 2000 characters.');
    return { name: requiredText(b.name, 200, 'Template name'), description: typeof b.description === 'string' ? b.description.trim() : '' };
}
export function canManageTemplate(row, actor, permissions) {
    return permissions.has('report.write') && (Number(row.created_by) === actor.id || permissions.has('master.write'));
}
export function templateDto(row, actor, permissions) {
    return { id: Number(row.id), name: row.name, description: row.description, reportType: row.report_type, locale: row.locale, body: JSON.parse(row.body_json), version: row.version, isActive: Boolean(row.is_active), rowVersion: row.row_version.toString('base64'), canEdit: Boolean(row.is_active) && canManageTemplate(row, actor, permissions) };
}
export async function templateRow(tx, id) {
    const q = new sql.Request(tx);
    q.input('id', sql.BigInt, id);
    const row = (await q.query('SELECT * FROM dbo.report_templates WITH(UPDLOCK,HOLDLOCK) WHERE id=@id')).recordset[0];
    if (!row)
        throw new ApiError(404, 'report_template_missing', 'Template not found.');
    return row;
}
export function templateVersion(row, value) {
    if (!row.row_version.equals(parseRowVersion(value)))
        throw new ApiError(409, 'concurrency_conflict', 'The template changed. Refresh before saving.');
}
export async function templateInput(tx, users, request, actor, value) {
    const b = bodyObject(value);
    if (b.sourceReportId != null) {
        if (b.body !== undefined)
            throw new ApiError(400, 'report_template_source', 'Supply sourceReportId or an explicit body, not both. Preview then edit the sanitized body.');
        const id = positiveLong(String(b.sourceReportId), 'Source report');
        let revision;
        if (b.sourceRevision !== undefined) {
            if (typeof b.sourceRevision !== 'number' || !Number.isSafeInteger(b.sourceRevision) || b.sourceRevision < 0)
                throw new ApiError(400, 'report_template_revision', 'Source revision must be a non-negative integer.');
            revision = b.sourceRevision;
        }
        const report = await readReport(tx, id, revision);
        await users.demandPermission(request, report.project_id ? 'project.read' : 'inquiry.read');
        await reportAccess(tx, report, actor);
        return { reportType: report.report_type, locale: report.locale, body: safeTemplateBody(report.report_type, JSON.parse(report.body_json)) };
    }
    const reportType = requiredText(b.reportType, 20, 'Report type');
    return { reportType, locale: templateLocale(b.locale), body: safeTemplateBody(reportType, b.body) };
}
/** Locks the selected version until the caller snapshots it into the new report. */
export async function reportTemplateSnapshot(tx, id, version, reportType, actor) {
    const row = await templateRow(tx, positiveLong(String(id), 'Template'));
    if (!(await reportPermissions(tx, actor.id)).has('report.read'))
        throw new ApiError(403, 'report_template_read', 'Report read permission is required to use a template.');
    if (!row.is_active)
        throw new ApiError(409, 'report_template_archived', 'This template is archived. Choose an active template.');
    if (row.report_type !== reportType)
        throw new ApiError(400, 'report_template_type', 'Template type must match the new report.');
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
        throw new ApiError(400, 'report_template_version', 'Template version is required.');
    if (version !== row.version)
        throw new ApiError(409, 'report_template_changed', 'The selected template has a newer version. Preview it again.');
    return { id: Number(row.id), name: row.name, version: row.version, locale: row.locale, bodyJson: JSON.stringify(safeTemplateBody(row.report_type, JSON.parse(row.body_json))) };
}
//# sourceMappingURL=report-template-service.js.map