"use client";

import { useReportUnsavedChanges } from "./useReportUnsavedChanges";
import { useReportUiText as useUiText } from "./report-ui-copy";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, type BootstrapData, type PagedResult } from "../api-client";
import { Badge, EmptyState, Field, Icon, Modal, PageHeader, Pagination, Panel, SearchInput, TablePageSize, Toolbar } from "../ui";
import { REPORT_TYPES, ReportBodyEditor, type ReportType } from "./ReportScreens";
import "./report-workspace.css";
import { sanitizeReportTemplate } from "../../../backend-node/src/report-template-rules";

export type ReportTemplate = { id: number; name: string; description: string; reportType: ReportType; locale: string; body: Record<string, unknown>; version: number; isActive: boolean; rowVersion: string; canEdit: boolean };
export type TemplateSeed = { name: string; description: string; reportType: ReportType; locale: string; body: Record<string, unknown> };
export const REPORT_LIBRARY = "/api/v1/reports/workspace/library";
const messageOf = (error: unknown) => error instanceof Error ? error.message : "Unable to load report templates.";
const emptySeed: TemplateSeed = { name: "", description: "", reportType: "INSTALLATION", locale: "en", body: {} };

export function ReportTemplateLibrary({ bootstrap, notify, onUse, onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void; bootstrap: BootstrapData; notify: (message: string) => void; onUse: (template: ReportTemplate) => void }) {
  const t = useUiText();
  const [search, setSearch] = useState(""), [reportType, setReportType] = useState(""), [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(50);
  const [result, setResult] = useState<PagedResult<ReportTemplate>>({ items: [], total: 0, page: 1, pageSize: 50 });
  const [selected, setSelected] = useState<ReportTemplate | "new" | null>(null), [archive, setArchive] = useState<ReportTemplate | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const sequence = useRef(0);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true); setError("");
    try { const data = await apiRequest<PagedResult<ReportTemplate>>(`${REPORT_LIBRARY}?${new URLSearchParams({ search, reportType, includeArchived: String(includeArchived), page: String(page), pageSize: String(pageSize) })}`); if (id === sequence.current) setResult(data); }
    catch (failure) { if (id === sequence.current) setError(messageOf(failure)); }
    finally { if (id === sequence.current) setLoading(false); }
  }, [search, reportType, includeArchived, page, pageSize]);
  useEffect(() => { const timer = setTimeout(() => void load(), 200); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
  const canCreate = bootstrap.permissions.includes("report.write");
  const archiveTemplate = async () => {
    if (!archive || busy) return;
    setBusy(true); setError("");
    try { await apiRequest(`${REPORT_LIBRARY}/${archive.id}/archive`, { method: "POST", body: JSON.stringify({ rowVersion: archive.rowVersion }) }); setArchive(null); notify(t("Report template archived")); await load(); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };
  return <div className="report-workspace"><PageHeader eyebrow={t("REPORT TEMPLATES")} title={t("Reusable report templates")} subtitle={t("Prepare standard instructions, test steps and expected results once, then use them for a new report.")} actions={canCreate ? <button className="btn primary" type="button" onClick={() => setSelected("new")}><Icon name="plus" />{t("New template")}</button> : undefined} />
    <Toolbar><SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("Search template name or description…")} /><select className="select" aria-label={t("Template report type")} value={reportType} onChange={event => { setReportType(event.target.value); setPage(1); }}><option value="">{t("All types")}</option>{REPORT_TYPES.map(type => <option key={type} value={type}>{t(type)}</option>)}</select><label className="report-consent"><input type="checkbox" checked={includeArchived} onChange={event => { setIncludeArchived(event.target.checked); setPage(1); }} />{t("Include archived")}</label><button className="btn ghost" type="button" disabled={loading} onClick={() => void load()}>{t("Refresh")}</button></Toolbar>
    {error ? <div className="callout danger" role="alert">{t(error)}</div> : null}
    <Panel title={`${result.total} ${t("Templates")}`} flush><TablePageSize value={pageSize} onChange={value => { setPageSize(value); setPage(1); }} />{loading ? <div className="empty" role="status">{t("Loading templates…")}</div> : result.items.length ? <div className="table-wrap"><table><thead><tr><th>{t("Template")}</th><th>{t("Type")}</th><th>{t("Version")}</th><th>{t("Status")}</th><th>{t("Actions")}</th></tr></thead><tbody>{result.items.map(template => <tr key={template.id}><td><button className="btn ghost" type="button" onClick={() => setSelected(template)}>{template.name}</button><small className="report-meta">{template.description}</small></td><td>{t(template.reportType)}</td><td>V{template.version}</td><td><Badge tone={template.isActive ? "green" : "slate"}>{template.isActive ? t("Active") : t("Archived")}</Badge></td><td><div className="report-template-actions">{template.isActive && canCreate ? <button className="btn primary sm" type="button" onClick={() => onUse(template)}>{t("Use template")}</button> : null}<button className="btn default sm" type="button" onClick={() => setSelected(template)}>{template.canEdit && template.isActive ? t("Edit") : t("Preview")}</button>{template.canEdit && template.isActive ? <button className="btn ghost sm" type="button" onClick={() => setArchive(template)}>{t("Archive")}</button> : null}</div></td></tr>)}</tbody></table></div> : !error ? <EmptyState icon="file" title={t("No templates found")} message={t("Change the filters or create a reusable template.")} /> : null}<Pagination page={result.page} pageCount={Math.max(1, Math.ceil(result.total / result.pageSize))} from={result.total ? (result.page - 1) * result.pageSize + 1 : 0} to={Math.min(result.page * result.pageSize, result.total)} total={result.total} onPage={setPage} /></Panel>
    {selected ? <ReportTemplateEditor onDirtyChange={onDirtyChange} key={selected === "new" ? "new" : `${selected.id}-${selected.rowVersion}`} template={selected === "new" ? null : selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); notify(t("Report template saved")); void load(); }} /> : null}
    {archive ? <Modal title={t("Archive report template")} onClose={() => { if (!busy) setArchive(null); }}><p>{archive.name}  · V{archive.version}</p><p>{t("This template will no longer be offered for new reports. Existing reports keep their saved content and template provenance.")}</p>{error ? <div className="callout danger" role="alert">{t(error)}</div> : null}<div className="report-actions"><button className="btn ghost" disabled={busy} onClick={() => setArchive(null)}>{t("Cancel")}</button><button className="btn primary" disabled={busy} onClick={() => void archiveTemplate()}>{busy ? t("Archiving…") : t("Archive template")}</button></div></Modal> : null}
  </div>;
}

export function ReportTemplateEditor({ template = null, seed, onClose, onSaved, onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void; template?: ReportTemplate | null; seed?: TemplateSeed; onClose: () => void; onSaved: (template: ReportTemplate) => void }) {
  const t = useUiText();
  const [draft, setDraft] = useState<TemplateSeed>(() => { const initial = template ? { name: template.name, description: template.description, reportType: template.reportType, locale: template.locale, body: template.body } : seed ?? emptySeed; return { ...initial, body: sanitizeReportTemplate(initial.reportType, initial.body) }; });
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [error, setError] = useState("");
  useReportUnsavedChanges(dirty, onDirtyChange);
  const editable = !template || template.canEdit && template.isActive;
  const patch = (value: Partial<TemplateSeed>) => { setDraft(current => ({ ...current, ...value })); setDirty(true); };
  const close = () => { if (!busy && (!dirty || window.confirm(t("Discard unsaved template changes?")))) onClose(); };
  const save = async () => {
    if (busy || !editable) return;
    setBusy(true); setError("");
    try { const saved = await apiRequest<ReportTemplate>(`${REPORT_LIBRARY}${template ? `/${template.id}` : ""}`, { method: template ? "PUT" : "POST", body: JSON.stringify({ ...draft, ...(template ? { rowVersion: template.rowVersion } : {}) }) }); onSaved(saved); }
    catch (failure) { setError(messageOf(failure)); }
    finally { setBusy(false); }
  };
  return <Modal title={template ? `${t(editable ? "Edit" : "Preview")} · ${template.name}` : t("New reusable report template")} size="xl" onClose={close}><p className="callout info">{t("Keep standard instructions, equipment definitions, scenarios and expected results. Customer details, dates, team assignments, actual results, evidence and signatures belong to each report and are excluded.")}</p><p className="callout warning">{t("Review retained objectives and steps before saving. Remove customer-specific names, details and past-work wording; field filtering cannot anonymize free text.")}</p>
    <fieldset className="report-public-fields" disabled={busy || !editable}><div className="report-fields"><Field label={t("Template name")}><input aria-label={t("Template name")} required maxLength={200} value={draft.name} onChange={event => patch({ name: event.target.value })} /></Field><Field label={t("Report type")}><select aria-label={t("Template report type")} value={draft.reportType} disabled={!!template || !!seed} onChange={event => { if (!Object.keys(draft.body).length || window.confirm(t("Changing report type clears the current template sections. Continue?"))) patch({ reportType: event.target.value as ReportType, body: {} }); }}>{REPORT_TYPES.map(type => <option key={type} value={type}>{t(type)}</option>)}</select></Field><Field label={t("Description")}><textarea aria-label={t("Template description")} maxLength={2000} value={draft.description} onChange={event => patch({ description: event.target.value })} /></Field><Field label={t("Language")}><select aria-label={t("Template language")} value={draft.locale} onChange={event => patch({ locale: event.target.value })}><option value="en">{t("English")}</option><option value="th">{t("ไทย")}</option><option value="ja">日本語</option></select></Field></div></fieldset>
    <ReportBodyEditor locale={draft.locale} reportType={draft.reportType} body={draft.body} readOnly={!editable || busy} reusableOnly onChange={body => patch({ body })} />
    {error ? <div className="callout danger" role="alert">{t(error)}</div> : null}<div className="report-actions"><button className="btn ghost" type="button" disabled={busy} onClick={close}>{editable ? t("Cancel") : t("Close")}</button>{editable ? <button className="btn primary" type="button" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? t("Saving…") : t("Save template")}</button> : null}</div>
  </Modal>;
}

export function ReportTemplatePicker({ reportType, selected, onChange, onReady, disabled = false }: { reportType: ReportType; selected: ReportTemplate | null; onChange: (template: ReportTemplate | null) => void; onReady: (ready: boolean) => void; disabled?: boolean }) {
  const t = useUiText();
  const [search, setSearch] = useState(""), [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; items: ReportTemplate[]; error: string }>({ key: "", items: [], error: "" });
  const key = `${reportType}:${search}:${reload}`;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      onReady(false);
      void (async () => {
        const items: ReportTemplate[] = []; let page = 1; let total = 1;
        while (items.length < total && !cancelled) { const result = await apiRequest<PagedResult<ReportTemplate>>(`${REPORT_LIBRARY}?${new URLSearchParams({ reportType, search, includeArchived: "false", page: String(page++), pageSize: "100" })}`); total = result.total; items.push(...result.items); if (!result.items.length) break; }
        if (!cancelled) { setState({ key, items: items.filter(item => item.isActive && item.reportType === reportType), error: "" }); onReady(true); }
      })().catch(error => { if (!cancelled) { setState({ key, items: [], error: messageOf(error) }); onReady(false); } });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [reportType, search, key, onReady]);
  const ready = state.key === key;
  const items = ready ? state.items : [];
  const options = selected ? [selected, ...items.filter(item => item.id !== selected.id)] : items;
  return <section className="report-section report-template-picker"><div className="report-section-heading"><h3>{t("ใช้ Template ที่เตรียมไว้ (ถ้ามี)")}</h3><button className="btn ghost" type="button" disabled={disabled} onClick={() => { onChange(null); onReady(false); setReload(value => value + 1); }}>{t("Refresh templates")}</button></div><div className="report-fields"><Field label={t("Find template")}><input aria-label={t("Find template")} disabled={disabled} value={search} onChange={event => { onReady(false); setSearch(event.target.value); }} placeholder={t("Search template name…")} /></Field><Field label={t("Report template")}><select aria-label={t("Report template")} disabled={disabled || !ready} value={selected?.id ?? ""} onChange={event => onChange(options.find(item => item.id === Number(event.target.value)) ?? null)}><option value="">{t("แบบฟอร์มมาตรฐาน — กรอกข้อมูลใหม่")}</option>{options.map(template => <option key={template.id} value={template.id}>{template.name}  · V{template.version}</option>)}</select></Field></div>{!ready ? <p role="status">{t("Loading templates…")}</p> : state.error ? <div className="callout danger" role="alert">{t(state.error)}<button className="btn ghost" type="button" onClick={() => { onChange(null); onReady(false); setReload(value => value + 1); }}>{t("Retry")}</button></div> : null}{selected ? <details><summary>{t("ดูตัวอย่าง:")}{selected.name}  · V{selected.version}</summary><p>{selected.description}</p><ReportBodyEditor locale={selected.locale} reportType={selected.reportType} body={sanitizeReportTemplate(selected.reportType, selected.body)} readOnly reusableOnly /></details> : <p className="muted">{t("เริ่มด้วยแบบฟอร์มมาตรฐานได้ทันที หรือเลือก Template เพื่อดึงรายการงานและขั้นตอนทดสอบที่ทีมเตรียมไว้ ผลการทำงานและลายเซ็นต้องบันทึกใหม่ในแต่ละรายงาน")}</p>}</section>;
}
