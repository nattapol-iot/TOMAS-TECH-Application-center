"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../api-client";
import { useT } from "../i18n";
import { Badge, Field, Icon, Modal } from "../ui";

type Kind = "inquiries" | "estimates";
type Action = "delete-draft" | "cancel" | "cancel-linked" | "archive" | "withdraw" | "restore";
type Document = { id: number; number: string; name: string; status: string; revision: number };
type Preview = {
  document: Document; token: string; options: { action: Action; allowed: boolean; reason: string | null }[];
  linkedEstimate: Document | null; projects: { id: number; number: string; status: string }[];
  linkedWorkCount: number; fallbackRevision: number | null; restore: { eventId: number; reason: string | null; revision: number } | null;
};
const labels: Record<Action, string> = { "delete-draft": "Delete draft", cancel: "Cancel work", "cancel-linked": "Cancel inquiry and estimate",
  archive: "Archive document", withdraw: "Withdraw review", restore: "Restore document" };
const reasons = ["Created by mistake", "Duplicate document", "Customer cancelled", "Work completed", "Other reason"];
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
type Props = { kind: Kind; id: number; onChanged: () => void | Promise<void>; notify: (message: string) => void };

export function DocumentLifecycleButton(props: Props) {
  const t = useT(), [open, setOpen] = useState(false);
  return <><button className="btn default" type="button" onClick={() => setOpen(true)}><Icon name="chevronDown" />{t("Manage document")}</button>
    {open ? <LifecycleDialog {...props} onClose={() => setOpen(false)} /> : null}</>;
}

function LifecycleDialog({ kind, id, eventId, onChanged, notify, onClose }: Props & { eventId?: number; onClose: () => void }) {
  const t = useT();
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState("");
  const [action, setAction] = useState<Action | null>(eventId ? "restore" : null);
  const [reason, setReason] = useState(""), [detail, setDetail] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(""); setPreview(null);
    try { setPreview(await apiRequest<Preview>(`/api/v1/${kind}/${id}/lifecycle${eventId ? `?eventId=${eventId}` : ""}`)); }
    catch (e) { setError(errorText(e)); }
  }, [kind, id, eventId]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  const allowed = action === "restore" ? !!preview?.restore && !preview.restore.reason : !!preview?.options.find(o => o.action === action)?.allowed;
  const validReason = !!reason && (reason !== "Other reason" || !!detail.trim());
  const close = () => { if (!busy) onClose(); };
  const submit = async () => {
    if (!preview || !action || !allowed || !validReason || busy) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/v1/${kind}/${id}/lifecycle`, { method: "POST", body: JSON.stringify({ action, token: preview.token,
        eventId, reason: `${t(reason)}${detail.trim() ? `: ${detail.trim()}` : ""}` }) });
      notify(t("Document changes saved"));
      onClose(); await onChanged();
    } catch (e) { setError(errorText(e)); setPreview(null); }
    finally { setBusy(false); }
  };
  return <Modal title={eventId ? "Restore document" : "Manage document"} onClose={close} size="lg"
    footer={<><button className="btn default" type="button" disabled={busy} onClick={close}>{t("Close")}</button>
      <button className="btn primary" type="button" disabled={busy || !allowed || !validReason} onClick={() => { void submit(); }}>{busy ? "…" : t(action ? labels[action] : "Confirm action")}</button></>}>
    <p>{t("Review related documents before confirming. A reason is required and recorded in history.")}</p>
    {error ? <div className="callout danger" role="alert">{error}</div> : null}
    {!preview ? <button className="btn default" type="button" disabled={busy} onClick={() => { void load(); }}>{t("Refresh preview")}</button> : <>
      <h3>{preview.document.number} · R{String(preview.restore?.revision ?? preview.document.revision).padStart(2, "0")}</h3>
      <p>{preview.document.name} <Badge>{preview.document.status}</Badge></p>
      {preview.linkedEstimate ? <p><strong>{t("Related estimate")}: </strong>{preview.linkedEstimate.number} · {preview.linkedEstimate.status}</p> : null}
      {preview.projects.length ? <p><strong>{t("Related projects")}: </strong>{preview.projects.map(p => p.number).join(", ")}</p> : null}
      {preview.linkedWorkCount ? <p>{t("Other linked work")}: {preview.linkedWorkCount}</p> : null}
      {action === "withdraw" ? <div className="info-strip amber">{t("Withdrawal preserves the submitted snapshot and creates a new working revision.")}</div> : null}
      {action === "delete-draft" ? <div className="info-strip amber"><span>{t("Deleted drafts retain their number and data. Restore them from Trash / Archive.")}
        {kind === "estimates" && preview.fallbackRevision !== null ? <><br /><strong>{t("Active revision after deletion")}: R{String(preview.fallbackRevision).padStart(2, "0")}</strong></> : null}</span></div> : null}
      {eventId ? preview.restore?.reason ? <div className="callout danger">{t(preview.restore.reason)}</div> : null
        : <fieldset disabled={busy} style={{ border: 0, padding: 0 }}><legend>{t("Manage document")}</legend>
          {preview.options.filter(o => kind === "inquiries" ? o.action !== "withdraw" : o.action !== "cancel-linked").map(o => <div key={o.action} style={{ marginBottom: 12 }}>
            <label><input type="radio" name="document-action" value={o.action} checked={action === o.action} disabled={!o.allowed}
              onChange={() => setAction(o.action)} /> {t(labels[o.action])}</label>
            {o.reason ? <div className="muted">{t(o.reason)}</div> : null}
          </div>)}
        </fieldset>}
      <Field label="Reason for this action"><select className="input" value={reason} disabled={busy} onChange={e => setReason(e.target.value)}>
        <option value="">—</option>{reasons.map(r => <option key={r} value={r}>{t(r)}</option>)}
      </select></Field>
      <Field label="Additional details"><textarea className="input" value={detail} maxLength={800} disabled={busy} onChange={e => setDetail(e.target.value)} /></Field>
    </>}
  </Modal>;
}

type HistoryRow = { eventId: number; documentId: number; number: string; name: string; status: string; revision: number; action: Action; reason: string; actor: string; occurredAt: string };
export function DocumentHistoryButton({ kind, onChanged, notify, onOpen }: Omit<Props, "id"> & { onOpen: (id: number) => void }) {
  const t = useT(), [open, setOpen] = useState(false);
  return <><button className="btn default" type="button" onClick={() => setOpen(true)}>{t("Trash / Archive")}</button>
    {open ? <DocumentHistory kind={kind} onChanged={onChanged} notify={notify} onClose={() => setOpen(false)} onOpen={id => { setOpen(false); onOpen(id); }} /> : null}</>;
}
function DocumentHistory({ kind, onChanged, notify, onOpen, onClose }: Omit<Props, "id"> & { onOpen: (id: number) => void; onClose: () => void }) {
  const t = useT(), [search, setSearch] = useState(""), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ items: HistoryRow[]; total: number }>({ items: [], total: 0 });
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [selected, setSelected] = useState<HistoryRow | null>(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true); setError("");
      void apiRequest<{ items: HistoryRow[]; total: number }>(`/api/v1/${kind}/lifecycle-records?search=${encodeURIComponent(search)}&page=${page}`)
        .then(data => { if (active) setResult(data); }).catch(e => { if (active) setError(errorText(e)); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [kind, search, page, revision]);
  if (selected) return <LifecycleDialog kind={kind} id={Number(selected.documentId)} eventId={Number(selected.eventId)} notify={notify}
    onClose={() => setSelected(null)} onChanged={async () => { setRevision(v => v + 1); await onChanged(); }} />;
  return <Modal title="Trash / Archive" onClose={onClose} size="lg">
    <input className="input" aria-label={t("Search document number or project")} placeholder={t("Search document number or project")} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
    {error ? <div className="callout danger" role="alert">{error}<button className="btn default" onClick={() => setRevision(v => v + 1)}>{t("Try again")}</button></div> : null}
    {loading ? <p aria-live="polite">{t("Loading")}…</p> : result.items.length ? result.items.map(row => <article key={row.eventId} className="panel" style={{ padding: 16, marginTop: 12 }}>
      <strong>{row.number} · R{String(row.revision).padStart(2, "0")} · {row.name}</strong><p>{t(labels[row.action])} · {row.actor} · {row.occurredAt.slice(0, 10)}</p><p>{row.reason}</p>
      <button className="btn default" type="button" onClick={() => setSelected(row)}>{t("Restore document")}</button>
      {row.action === "archive" ? <button className="btn ghost" type="button" onClick={() => onOpen(Number(row.documentId))}>{t("View archived document")}</button> : null}
    </article>) : <p>{t("No deleted or archived documents")}</p>}
    <div className="workspace-bar"><button className="btn default" type="button" disabled={page <= 1 || loading} onClick={() => setPage(v => v - 1)}>{t("Previous")}</button>
      <span>{page} / {Math.max(1, Math.ceil(result.total / 25))}</span>
      <button className="btn default" type="button" disabled={page * 25 >= result.total || loading} onClick={() => setPage(v => v + 1)}>{t("Next")}</button></div>
  </Modal>;
}
