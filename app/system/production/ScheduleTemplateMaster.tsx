"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createScheduleTemplate,
  deleteScheduleTemplate,
  listScheduleTemplates,
  updateScheduleTemplate,
  type BootstrapData,
  type ScheduleTemplate,
} from "../api-client";
import { useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { EmptyState, Icon, Modal, PageHeader, Panel } from "../ui";

/*
 * Master Schedule: named Master Plans pulled into Create project. Everyone may read them;
 * changing them needs schedule.plan, the permission that creating a project with a plan needs.
 * A row's start day and duration count from the project start; leaving both empty keeps
 * only the milestone name, and the dates are typed when the project is created.
 */

type RowDraft = { key: string; name: string; startOffsetDays: string; durationDays: string };
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const wholeDays = (value: string, minimum: number) => /^\d{1,4}$/.test(value.trim()) && Number(value) >= minimum && Number(value) <= 3650;
// Both empty (name only) or both whole days.
const rowValid = (row: RowDraft) => Boolean(row.name.trim()) && ((!row.startOffsetDays.trim() && !row.durationDays.trim())
  || (wholeDays(row.startOffsetDays, 0) && wholeDays(row.durationDays, 1)));
const blankRow = (): RowDraft => ({ key: crypto.randomUUID(), name: "", startOffsetDays: "", durationDays: "" });

export function ScheduleTemplateMaster({ bootstrap, notify }: { bootstrap: BootstrapData; notify: (message: string) => void }) {
  const t = useT();
  const canManage = bootstrap.permissions.includes("schedule.plan");
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ScheduleTemplate | "new" | null>(null);
  const [removing, setRemoving] = useState<ScheduleTemplate | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setTemplates(await listScheduleTemplates()); } catch (failure) { setError(errorText(failure)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  return <>
    <PageHeader eyebrow="MASTER DATA" title={t("MasterSchedule.title")} subtitle={t("MasterSchedule.subtitle")}
      actions={canManage ? <button className="btn primary" type="button" onClick={() => setEditing("new")}><Icon name="plus" />{t("MasterSchedule.create")}</button> : undefined} />
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{t(error)}</span></div> : null}
    <Panel title={`${templates.length} ${t("MasterSchedule.count")}`} flush>
      {templates.length ? <div className="table-wrap"><table>
        <thead><tr><th>{t("MasterSchedule.name")}</th><th>{t("MasterSchedule.milestones")}</th><th><LocalizedText text={"Updated"} /></th><th><span className="sr-only"><LocalizedText text={"Actions"} /></span></th></tr></thead>
        <tbody>{templates.map(template => <tr key={template.id}>
          <td className="wrap"><strong>{template.name}</strong><small className="muted schedule-template-preview">{template.rows.map(row => row.name).join(" → ")}</small></td>
          <td>{template.rows.length}</td>
          <td className="muted">{template.updatedBy ?? "—"}</td>
          <td>{canManage ? <div className="row-actions">
            <button className="btn ghost sm" type="button" onClick={() => setEditing(template)}><Icon name="edit" />{t("MasterSchedule.edit")}</button>
            <button className="btn ghost sm danger" type="button" aria-label={`${t("MasterSchedule.delete")} ${template.name}`} title={t("MasterSchedule.delete")} onClick={() => setRemoving(template)}><Icon name="trash" /></button>
          </div> : null}</td>
        </tr>)}</tbody>
      </table></div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div>
        : <EmptyState icon="calendar" title="MasterSchedule.emptyTitle" message="MasterSchedule.emptyMessage" />}
    </Panel>
    {editing && canManage ? <TemplateEditor template={editing === "new" ? null : editing} onClose={() => setEditing(null)}
      onSaved={async (name) => { setEditing(null); notify(`${name} · ${t("MasterSchedule.saved")}`); await load(); }} /> : null}
    {removing && canManage ? <Modal title="MasterSchedule.delete" subtitle={removing.name} size="sm" onClose={() => setRemoving(null)} footer={<>
      <button className="btn ghost" type="button" onClick={() => setRemoving(null)}><LocalizedText text={"Cancel"} /></button>
      <button className="btn danger" type="button" onClick={() => { const target = removing; setRemoving(null);
        void deleteScheduleTemplate(target.id, target.rowVersion).then(async () => { notify(`${target.name} · ${t("MasterSchedule.deleted")}`); await load(); }).catch(failure => setError(errorText(failure))); }}>
        <Icon name="trash" />{t("MasterSchedule.delete")}</button>
    </>}><p>{t("MasterSchedule.deleteConfirm")}</p></Modal> : null}
  </>;
}

function TemplateEditor({ template, onClose, onSaved }: { template: ScheduleTemplate | null; onClose: () => void; onSaved: (name: string) => Promise<void> }) {
  const t = useT();
  const [name, setName] = useState(template?.name ?? "");
  const [rows, setRows] = useState<RowDraft[]>(() => template?.rows.length
    ? template.rows.map(row => ({ key: crypto.randomUUID(), name: row.name, startOffsetDays: row.startOffsetDays?.toString() ?? "", durationDays: row.durationDays?.toString() ?? "" }))
    : [blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key: string, change: Partial<RowDraft>) => setRows(current => current.map(row => row.key === key ? { ...row, ...change } : row));
  const incomplete = rows.filter(row => !rowValid(row)).length;
  const submit = async () => {
    setBusy(true); setError("");
    const input = { name: name.trim(), rows: rows.map(row => ({ name: row.name.trim(),
      startOffsetDays: row.startOffsetDays.trim() ? Number(row.startOffsetDays) : null, durationDays: row.durationDays.trim() ? Number(row.durationDays) : null })) };
    try {
      if (template) await updateScheduleTemplate(template.id, { ...input, rowVersion: template.rowVersion }); else await createScheduleTemplate(input);
      await onSaved(input.name);
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  return <Modal title={template ? "MasterSchedule.edit" : "MasterSchedule.create"} subtitle="MasterSchedule.editorHint" size="lg" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
    <button className="btn primary" type="button" disabled={busy || !name.trim() || incomplete > 0 || rows.length === 0} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Saving…"} /> : t("MasterSchedule.save")}</button>
  </>}><div className="project-create">
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{t(error)}</span></div> : null}
    <label className="field"><span>{t("MasterSchedule.name")} *</span><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <section className="project-plan" aria-labelledby="schedule-template-rows-title">
      <div className="project-plan-head"><div><h3 id="schedule-template-rows-title">{t("MasterSchedule.milestones")}</h3><p className="muted">{t("MasterSchedule.daysHint")}</p></div>
        <div className="row-actions"><button className="btn sm" type="button" disabled={rows.length >= 50} onClick={() => setRows(current => [...current, blankRow()])}><Icon name="plus" />{t("CRM.addMilestone")}</button></div></div>
      <div className="project-plan-row template project-plan-labels" aria-hidden="true"><span /><span>{t("CRM.milestoneName")}</span><span>{t("MasterSchedule.startDay")}</span><span>{t("MasterSchedule.duration")}</span><span /></div>
      <ol className="project-plan-rows">{rows.map((row, index) => <li key={row.key} className="project-plan-row template">
        <span className="project-plan-index">{index + 1}.</span>
        <input required aria-label={`${t("CRM.milestoneName")} ${index + 1}`} placeholder={t("CRM.milestoneName")} maxLength={500} value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} />
        <input inputMode="numeric" aria-label={`${t("MasterSchedule.startDay")} ${index + 1}`} placeholder="0" aria-invalid={!rowValid(row) && Boolean(row.name.trim())} value={row.startOffsetDays} onChange={(event) => update(row.key, { startOffsetDays: event.target.value })} />
        <input inputMode="numeric" aria-label={`${t("MasterSchedule.duration")} ${index + 1}`} placeholder="1" aria-invalid={!rowValid(row) && Boolean(row.name.trim())} value={row.durationDays} onChange={(event) => update(row.key, { durationDays: event.target.value })} />
        <button className="icon-btn" type="button" aria-label={`${t("CRM.removeRow")} ${index + 1}`} title={t("CRM.removeRow")} disabled={rows.length === 1} onClick={() => setRows(current => current.filter(item => item.key !== row.key))}><Icon name="x" /></button>
      </li>)}</ol>
      {incomplete ? <p className="muted" role="status">{t("MasterSchedule.incomplete")}: {incomplete}</p> : null}
    </section>
  </div></Modal>;
}
