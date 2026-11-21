"use client";

/*
 * Report & Track Issues (the Support Center) in the Pegasus ERP look: page header with one primary action, a summary
 * bar that is also the status filter, a data table where the ticket no. opens the ticket, dialogs with a fixed header
 * and footer, and on a ticket one primary action with the rest under More actions (pegasus-design DESIGN.md 0.2-0.9,
 * C.1.7, C.2, D.1-D.10). Styles: support-center.css, everything under .support-center.
 */
import { confirmDialog } from "../dialogs";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { apiRequest, downloadSupportAttachment, uploadSupportAttachment } from "../api-client";
import { localeFor, useLanguage } from "../i18n";
import { Icon, Pagination, SearchInput, TablePageSize, Tabs, type IconName } from "../ui";
import { supportLabel } from "../support-copy";
import { supportError, supportMeta, supportRead, supportRequestKey, type ContributionPage, type SupportMeta, type SupportPage, type SupportTicket } from "../support-client";
import "./support-center.css";

const statuses = ["New", "Acknowledged", "InProgress", "WaitingForReporter", "Resolved", "Closed", "Cancelled"];
const categories = ["Application", "Equipment", "Documents", "Coordination", "Other"];
/** Rows per page: the shared TablePageSize choices, 10 like the other tables; the choice is kept on this device (0.3). */
const ROW_CHOICES = [10, 25, 50, 100], ROWS_KEY = "tomas-tech-support:rows";
const storedRows = () => {
  try { const rows = Number(window.localStorage.getItem(ROWS_KEY)); return ROW_CHOICES.includes(rows) ? rows : 10; } catch { return 10; }
};
const MAX_FILES = 5, MAX_FILE_BYTES = 10 * 1024 * 1024;
/** One colour, one meaning (DESIGN.md B.1): waiting for the team amber, team working blue, handed back pink, done green, cancelled grey. */
const STATUS_TONE: Record<string, string> = { New: "warning", Acknowledged: "soft", InProgress: "soft", WaitingForReporter: "pink", Resolved: "success", Closed: "success", Cancelled: "neutral" };
/** The summary bar's cells: each counts its statuses over every filtered ticket and sets the list filter. */
const STATUS_GROUPS: readonly { id: string; label: string; statuses: readonly string[] }[] = [
  { id: "", label: "All", statuses: [] },
  { id: "open", label: "Open tickets", statuses: ["New", "Acknowledged", "InProgress"] },
  { id: "waiting", label: "WaitingForReporter", statuses: ["WaitingForReporter"] },
  { id: "resolved", label: "Resolved", statuses: ["Resolved"] },
  { id: "done", label: "Closed or cancelled", statuses: ["Closed", "Cancelled"] },
];
type Mode = "mine" | "queue" | "contributions";
type DialogSize = "md" | "lg" | "form" | "table" | "wide";

const useCopy = () => {
  const { lang } = useLanguage();
  return { s: (key: string) => supportLabel(key, lang), lang, date: (value: string) => new Date(value).toLocaleString(localeFor(lang)) };
};
const kilobytes = (bytes: number) => `${Math.max(1, Math.ceil(bytes / 1024)).toLocaleString("en-US")} KB`;

function StatusBadge({ status }: { status: string }) {
  const { s } = useCopy();
  return <span className={`sp-badge ${STATUS_TONE[status] ?? "outline"}`}>{s(status)}</span>;
}

function SelectField({ label, value, onChange, options, compact = false }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; compact?: boolean }) {
  const select = <select value={value} aria-label={compact ? label : undefined} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return compact
    ? <label className="sp-select">{select}<Icon name="chevronDown" /></label>
    : <label className="sp-field"><span className="sp-label">{label}</span><span className="sp-select">{select}<Icon name="chevronDown" /></span></label>;
}

/** A modal dialog (D.8): title and close on top, only the body scrolls, buttons in the footer; at most 90% of the window. */
function SupportDialog({ title, size = "lg", onClose, onSubmit, footer, children }: { title: string; size?: DialogSize; onClose: () => void; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; footer?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { s } = useCopy();
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement;
    dialog?.showModal();
    // Nothing auto-focuses (DESIGN.md 0.2): the dialog itself takes focus, not its first control.
    dialog?.focus();
    return () => { dialog?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const content = <>
    <header className="sp-dialog-head"><h2>{title}</h2><button className="sp-icon" type="button" aria-label={s("Close")} title={s("Close")} onClick={onClose}><Icon name="x" /></button></header>
    <div className="sp-dialog-body">{children}</div>
    {footer ? <footer className="sp-dialog-foot">{footer}</footer> : null}
  </>;
  return <dialog ref={ref} tabIndex={-1} className={`support-center sp-dialog ${size}`} onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={title}>
    {onSubmit ? <form className="sp-dialog-frame" onSubmit={onSubmit}>{content}</form> : <div className="sp-dialog-frame">{content}</div>}
  </dialog>;
}

/** Under a table (D.7): which rows are showing and the page buttons, then how many rows a page shows. */
function Pager({ total, page, size, onPage, onSize }: { total: number; page: number; size: number; onPage: (page: number) => void; onSize: (size: number) => void }) {
  return <div className="sp-pager">
    <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / size))} from={(page - 1) * size + 1} to={Math.min(page * size, total)} total={total} onPage={onPage} />
    <div data-guide="support.rows"><TablePageSize value={size} onChange={onSize} /></div>
  </div>;
}

function ErrorNote({ message }: { message: string }) {
  return message ? <div className="sp-error" role="alert"><Icon name="alertCircle" /><span>{message}</span></div> : null;
}

export function SupportCreateDialog({ context, onClose, onCreated, onOpen }: { context: Record<string, string>; onClose: () => void; onCreated: (id: number) => void; onOpen: (id: number) => void }) {
  const { s, lang } = useCopy();
  const [category, setCategory] = useState("Application"), [subject, setSubject] = useState(""), [description, setDescription] = useState(""), [impact, setImpact] = useState("CanWork"), [includeContext, setIncludeContext] = useState(true), [steps, setSteps] = useState(""), [expected, setExpected] = useState(""), [location, setLocation] = useState("");
  const [files, setFiles] = useState<{ file: File; key: string; done: boolean }[]>([]), [created, setCreated] = useState<SupportTicket | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [uploadName, setUploadName] = useState("");
  const request = useRef<{ body: string; key: string } | null>(null), saving = useRef(false);
  const dirty = !created && Boolean(subject || description || files.length || steps || expected || location);
  const pending = files.filter((f) => !f.done);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty || busy) e.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const close = async () => { if (!busy && (!dirty || (await confirmDialog(s("Discard changes?"), { danger: true })))) onClose(); };
  const submit = async () => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      let ticket = created;
      if (!ticket) {
        const body = { category, subject, description, impact, context: { ...(category === "Application" && includeContext ? context : {}), ...(category === "Application" ? { steps, expected } : { location }) } }, signature = JSON.stringify(body);
        if (request.current?.body !== signature) request.current = { body: signature, key: supportRequestKey() };
        ticket = await apiRequest<SupportTicket>("/api/v1/support/tickets", { method: "POST", body: JSON.stringify({ ...body, requestKey: request.current.key }) });
        setCreated(ticket); onCreated(ticket.id);
      }
      for (const item of files.filter((f) => !f.done)) {
        setUploadName(item.file.name);
        await uploadSupportAttachment(ticket.id, item.file, item.key);
        setFiles((old) => old.map((f) => f.key === item.key ? { ...f, done: true } : f));
      }
    } catch (e) { setError(supportError(e, lang)); } finally { setBusy(false); saving.current = false; setUploadName(""); }
  };
  const pick = (selected: File[]) => {
    if (files.length + selected.length > MAX_FILES || selected.some((f) => f.size > MAX_FILE_BYTES)) { setError(s("File limits")); return; }
    setError(""); setFiles((old) => [...old, ...selected.map((file) => ({ file, key: supportRequestKey(), done: false }))]);
  };
  const footer = <>
    <button className="btn default" type="button" disabled={busy} onClick={close}>{s("Close")}</button>
    {!created || pending.length ? <button className="btn primary" type="submit" disabled={busy} aria-busy={busy} data-guide="support.submit">{s(created ? "Retry uploads" : "Submit ticket")}</button> : null}
  </>;
  return <SupportDialog title={s("Report a problem")} size="form" onClose={close} onSubmit={(e) => { e.preventDefault(); void submit(); }} footer={footer}>
    {created ? <div className="sp-thanks" role="status">
      <Icon name="checkCircle" />
      <div><h3>{s("Thank you for reporting")}</h3><p><strong>{created.ticketNo}</strong> · {s("Thank-you points")}: {s("Pending review")}</p>
        <button className="btn default sm" type="button" disabled={busy} onClick={() => onOpen(created.id)}>{s("View ticket")}</button></div>
    </div> : <fieldset className="sp-form" disabled={busy}>
      <label className="sp-field span-2" data-guide="support.subject"><span className="sp-label">{s("Subject")}<b aria-hidden="true">*</b></span><input required minLength={5} maxLength={160} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      <div className="sp-form-row span-2" data-guide="support.kind">
        <SelectField label={s("Category")} value={category} onChange={setCategory} options={categories.map((v) => ({ value: v, label: s(v) }))} />
        <SelectField label={s("Impact")} value={impact} onChange={setImpact} options={["CanWork", "PartlyBlocked", "Blocked"].map((v) => ({ value: v, label: s(v) }))} />
      </div>
      <label className="sp-field span-2" data-guide="support.description"><span className="sp-label">{s("Description")}<b aria-hidden="true">*</b></span><textarea required minLength={10} maxLength={5000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {category === "Application" ? <>
        {includeContext && context.module ? <div className="sp-context span-2"><span><small>{s("Page context")}</small>{context.module} {context.reference ?? ""}</span><button type="button" className="btn ghost sm" onClick={() => setIncludeContext(false)}>{s("Remove")}</button></div> : null}
        <details className="sp-more-fields span-2"><summary>{s("More details")}</summary>
          <div className="sp-form-row">
            <label className="sp-field"><span className="sp-label">{s("Steps")}</span><textarea maxLength={600} rows={2} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
            <label className="sp-field"><span className="sp-label">{s("Expected")}</span><textarea maxLength={600} rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} /></label>
          </div>
        </details>
      </> : <label className="sp-field span-2"><span className="sp-label">{s("Location")}</span><input maxLength={160} value={location} onChange={(e) => setLocation(e.target.value)} /></label>}
      <div className="sp-field span-2" data-guide="support.attach">
        <span className="sp-label">{s("Attachments")}</span>
        <label className="sp-drop"><input type="file" accept=".png,.jpg,.jpeg,.pdf" multiple onChange={(e) => { pick([...e.target.files ?? []]); e.target.value = ""; }} /><Icon name="upload" /><strong>{s("Choose files")}</strong><small>{s("File limits")}</small></label>
        {files.length ? <ul className="sp-files">{files.map((f) => <li key={f.key}><Icon name="file" /><span className="sp-file-name">{f.file.name}</span><small>{kilobytes(f.file.size)}</small>
          <button className="sp-icon" type="button" aria-label={`${s("Remove file")}: ${f.file.name}`} title={s("Remove file")} onClick={() => setFiles((old) => old.filter((x) => x.key !== f.key))}><Icon name="x" /></button></li>)}</ul> : null}
      </div>
    </fieldset>}
    {created && pending.length ? <div className="sp-upload-status"><p>{s(error ? "Upload failed" : "Uploading")}</p><ul className="sp-files">{pending.map((f) => <li key={f.key}><Icon name="file" /><span className="sp-file-name">{f.file.name}</span><small>{kilobytes(f.file.size)}</small></li>)}</ul></div> : null}
    {busy && uploadName ? <p className="sp-muted" role="status">{s("Uploading")} {uploadName}</p> : null}
    <ErrorNote message={error} />
  </SupportDialog>;
}

export function SupportCenter({ ticketId, onSelect, onCreate, notify, onDirtyChange, externalRevision = 0 }: { ticketId: number | null; onSelect: (id: number | null) => void; onCreate: () => void; notify: (message: string) => void; onDirtyChange: (dirty: boolean) => void; externalRevision?: number }) {
  const { s, lang, date } = useCopy();
  const [meta, setMeta] = useState<SupportMeta | null>(null), [mode, setMode] = useState<Mode>("mine"), [page, setPage] = useState(1), [search, setSearch] = useState(""), [group, setGroup] = useState(""), [category, setCategory] = useState(""), [filter, setFilter] = useState("");
  const [pageSize, setPageSizeState] = useState(storedRows);
  const setPageSize = (rows: number) => {
    setPageSizeState(rows); setPage(1);
    try { window.localStorage.setItem(ROWS_KEY, String(rows)); } catch { /* the choice is a convenience when storage is blocked */ }
  };
  const [list, setList] = useState<SupportPage>({ items: [], page: 1, pageSize, total: 0 }), [contributions, setContributions] = useState<ContributionPage | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0), [membersOpen, setMembersOpen] = useState(false);
  const requestId = useRef(0);
  const statusFilter = STATUS_GROUPS.find((g) => g.id === group)?.statuses.join(",") ?? "";
  useEffect(() => {
    let cancelled = false;
    supportMeta().then((m) => { if (!cancelled) setMeta(m); }).catch((e) => { if (!cancelled) setError(supportError(e, lang)); });
    return () => { cancelled = true; };
  }, [lang, revision]);
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ scope: mode, page: String(page), pageSize: String(pageSize), search, status: statusFilter, category, filter });
      const load = mode === "contributions"
        ? apiRequest<ContributionPage>(`/api/v1/me/support-contributions?page=${page}&pageSize=${pageSize}`).then((r) => { if (id === requestId.current) setContributions(r); })
        : apiRequest<SupportPage>(`/api/v1/support/tickets?${query}`).then((r) => { if (id === requestId.current) setList(r); });
      void load.catch((e) => { if (id === requestId.current) setError(supportError(e, lang)); }).finally(() => { if (id === requestId.current) setLoading(false); });
    }, 200);
    return () => { clearTimeout(timer); requestId.current = id + 1; };
  }, [mode, page, pageSize, search, statusFilter, category, filter, revision, lang, ticketId, externalRevision]);
  const refresh = () => setRevision((v) => v + 1);
  if (ticketId !== null) return <SupportTicketView key={ticketId} id={ticketId} meta={meta} onBack={() => onSelect(null)} notify={notify} onDirtyChange={onDirtyChange} />;

  const tabs: { id: Mode; label: string; raw: boolean }[] = [
    { id: "mine", label: s("My tickets"), raw: true },
    ...(meta?.queue ? [{ id: "queue" as const, label: s("Support queue"), raw: true }] : []),
    { id: "contributions", label: s("Contribution history"), raw: true },
  ];
  const counts = list.statusCounts;
  const countOf = (statusesInGroup: readonly string[]) => counts ? (statusesInGroup.length ? statusesInGroup : statuses).reduce((n, status) => n + (counts[status] ?? 0), 0) : null;
  const filtered = Boolean(search || group || category || filter);
  const queue = mode === "queue";
  return <section className="support-center sp-page">
    <header className="sp-head">
      <div className="sp-head-title"><h1>{s("Report & Track Issues")}</h1></div>
      <div className="sp-head-actions">
        {meta?.manage ? <button className="btn default" type="button" data-guide="support.members" onClick={() => setMembersOpen(true)}><Icon name="users" />{s("Support members")}</button> : null}
        <button className="btn primary" type="button" data-guide="support.report" onClick={onCreate}><Icon name="plus" />{s("Report a problem")}</button>
      </div>
    </header>
    <div data-guide="support.tabs"><Tabs link={null} tabs={tabs} active={mode} onChange={(m) => { setMode(m); setPage(1); }} /></div>
    <ErrorNote message={error} />
    {mode === "contributions" ? <>
      <div className="sp-summary"><div className="sp-cell"><span className="sp-cell-label">{s("Total points")}</span><span className="sp-cell-value">{contributions ? `${contributions.points.toLocaleString("en-US")} ${s("points")}` : "—"}</span></div></div>
      {contributions?.items.length ? <div className={`sp-table${loading ? " busy" : ""}`} aria-busy={loading}><table>
        <thead><tr><th>{s("Ticket no.")}</th><th className="num">{s("Thank-you points")}</th><th>{s("Thank-you message")}</th><th>{s("Awarded by")}</th><th>{s("Updated")}</th></tr></thead>
        <tbody>{contributions.items.map((item) => <tr key={item.ticketId}>
          <td><button className="sp-doclink" type="button" onClick={() => onSelect(item.ticketId)}>{item.ticketNo}</button></td>
          <td className="num">{item.points ? `+${item.points}` : <span className="sp-muted">{s("Thanked")}</span>}</td>
          <td className="wrap sp-pre">{item.message}</td><td>{item.evaluatorName}</td><td>{date(item.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="sp-empty" role={loading ? "status" : undefined}>{s(loading ? "Loading" : "Empty")}</div>}
      {contributions?.total ? <Pager total={contributions.total} page={page} size={pageSize} onPage={setPage} onSize={setPageSize} /> : null}
    </> : <>
      <div className="sp-summary" role="group" aria-label={s("Status")} data-guide="support.summary">
        {STATUS_GROUPS.map((g) => {
          const value = countOf(g.statuses);
          return <button key={g.id || "all"} type="button" className="sp-cell" aria-pressed={group === g.id} title={g.statuses.map((status) => s(status)).join(" · ") || undefined} onClick={() => { setGroup(g.id); setPage(1); }}>
            <span className="sp-cell-label">{s(g.label)}</span><span className="sp-cell-value">{value === null ? "—" : value.toLocaleString("en-US")}</span>
          </button>;
        })}
      </div>
      <div className="sp-toolbar">
        <SelectField compact label={s("Category")} value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={[{ value: "", label: s("All categories") }, ...categories.map((v) => ({ value: v, label: s(v) }))]} />
        {queue ? <SelectField compact label={s("Assignee")} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} options={[{ value: "", label: s("All assignees") }, { value: "unassigned", label: s("Unassigned") }, { value: "assigned", label: s("Assigned to me") }]} /> : null}
        <span className="sp-spacer" />
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={s("Search")} guide="support.search" />
        <button className="sp-icon" type="button" aria-label={s("Refresh")} title={s("Refresh")} onClick={refresh}><Icon name="refresh" /></button>
      </div>
      {list.items.length ? <div className={`sp-table${loading ? " busy" : ""}`} aria-busy={loading} data-guide="support.list"><table>
        <thead><tr><th>{s("Status")}</th><th>{s("Ticket no.")}</th><th>{s("Subject")}</th>{queue ? <th>{s("Priority")}</th> : null}<th>{s("Assignee")}</th><th className="num">{s("Thank-you points")}</th><th>{s("Updated")}</th></tr></thead>
        <tbody>{list.items.map((item) => <tr key={item.id} className="clickable" onClick={() => onSelect(item.id)}>
          <td><StatusBadge status={item.status} /></td>
          <td><button className="sp-doclink" type="button" onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}>{item.ticketNo}</button></td>
          <td className="wrap sp-subject"><span>{item.subject}</span><small>{s(item.category)} · {s(item.impact)}</small></td>
          {queue ? <td><span className={`sp-priority ${item.priority}`}>{s(item.priority)}</span></td> : null}
          <td>{item.assigneeName ?? <span className="sp-muted">{s("Unassigned")}</span>}</td>
          <td className="num">{item.recognitionPoints == null ? <span className="sp-muted">{s("Pending review")}</span> : item.recognitionPoints ? `+${item.recognitionPoints}` : s("Thanked")}</td>
          <td>{date(item.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div> : <div className="sp-empty" role={loading ? "status" : undefined}>{s(loading ? "Loading" : filtered ? "No match" : "Empty")}</div>}
      {list.total ? <Pager total={list.total} page={page} size={pageSize} onPage={setPage} onSize={setPageSize} /> : null}
    </>}
    {membersOpen && meta?.manage ? <SupportMembers meta={meta} onSaved={refresh} onClose={() => setMembersOpen(false)} /> : null}
  </section>;
}

/** Pictures show on the ticket itself; the full size opens in place, no download needed. */
const isImage = (f: { name: string; contentType: string }) => /^image\/(png|jpe?g)$/i.test(f.contentType) || /\.(png|jpe?g)$/i.test(f.name);
function SupportImage({ ticketId, file, onDownload }: { ticketId: number; file: { id: number; name: string }; onDownload: () => void }) {
  const { s } = useCopy();
  const [url, setUrl] = useState<string | null>(null), [failed, setFailed] = useState(false), [open, setOpen] = useState(false);
  useEffect(() => {
    let created: string | null = null, cancelled = false;
    downloadSupportAttachment(ticketId, file.id).then((blob) => { if (cancelled) return; created = URL.createObjectURL(blob); setUrl(created); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [ticketId, file.id]);
  if (failed) return null;
  /* eslint-disable @next/next/no-img-element -- private attachments are blob URLs; an image optimizer cannot fetch them */
  return <div className="sp-thumb-row">
    {url ? <button type="button" className="sp-thumb" title={s("Preview")} aria-label={`${s("Preview")}: ${file.name}`} onClick={() => setOpen(true)}><img src={url} alt={file.name} /></button> : <span className="sp-thumb" role="status">{s("Loading")}</span>}
    {open && url ? <SupportDialog title={file.name} size="wide" onClose={() => setOpen(false)} footer={<button className="btn default" type="button" onClick={onDownload}><Icon name="download" />{s("Download")}</button>}><img className="sp-preview" src={url} alt={file.name} /></SupportDialog> : null}
  </div>;
  /* eslint-enable @next/next/no-img-element */
}

type TicketAction = { key: string; label: string; icon: IconName; run: () => void; danger?: boolean };

/** More actions (C.1.7): safe items first, destructive ones last under a separator; a single item is a plain button. */
function MoreActions({ items, disabled }: { items: TicketAction[]; disabled: boolean }) {
  const { s } = useCopy();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && menu.current?.open) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);
  if (!items.length) return null;
  const only = items.length === 1 ? items[0] : undefined;
  if (only) return <button className={`btn default${only.danger ? " sp-danger-text" : ""}`} type="button" disabled={disabled} onClick={only.run}>{only.danger ? null : <Icon name={only.icon} />}{only.label}</button>;
  const entry = (item: TicketAction) => <button key={item.key} type="button" role="menuitem" className={item.danger ? "danger" : undefined} disabled={disabled}
    onClick={() => { if (menu.current) menu.current.open = false; item.run(); }}>{item.danger ? null : <Icon name={item.icon} />}{item.label}</button>;
  const safe = items.filter((item) => !item.danger), danger = items.filter((item) => item.danger);
  return <details ref={menu} className="sp-more" data-guide="support.more">
    <summary className="btn default">{s("More actions")}<Icon name="chevronDown" /></summary>
    <div className="sp-more-menu" role="menu">{safe.map(entry)}{danger.length ? <><hr />{danger.map(entry)}</> : null}</div>
  </details>;
}

function SupportTicketView({ id, meta, onBack, notify, onDirtyChange }: { id: number; meta: SupportMeta | null; onBack: () => void; notify: (message: string) => void; onDirtyChange: (dirty: boolean) => void }) {
  const { s, lang, date } = useCopy();
  const [ticket, setTicket] = useState<SupportTicket | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [busy, setBusy] = useState(false), [action, setAction] = useState(""), [fixedTarget, setFixedTarget] = useState(false), [message, setMessage] = useState(""), [internal, setInternal] = useState(false), [reason, setReason] = useState(""), [target, setTarget] = useState("InProgress"), [assignee, setAssignee] = useState(""), [category, setCategory] = useState(""), [priority, setPriority] = useState("Normal"), [duplicate, setDuplicate] = useState(""), [file, setFile] = useState<{ file: File; key: string } | null>(null), [fileInternal, setFileInternal] = useState(false), [useful, setUseful] = useState(false), [detailed, setDetailed] = useState(false), [actionable, setActionable] = useState(false), [thanks, setThanks] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null), locked = useRef(false);
  const dirty = Boolean(message || reason || thanks || file || action);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (dirty || busy) e.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setTicket(await supportRead(id)); } catch (e) { setTicket(null); setError(supportError(e, lang)); } finally { setLoading(false); } }, [id, lang]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => { setLoading(true); supportRead(id).then((r) => { if (!cancelled) setTicket(r); }).catch((e) => { if (!cancelled) setError(supportError(e, lang)); }).finally(() => { if (!cancelled) setLoading(false); }); }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id, lang]);
  const reset = () => { setAction(""); setFixedTarget(false); setReason(""); setThanks(""); setMessage(""); setDuplicate(""); setInternal(false); setFileInternal(false); };
  const mutate = async (kind: string, body: Record<string, unknown>) => {
    if (!ticket || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const signature = JSON.stringify({ kind, ...body });
      if (pending.current?.signature !== signature) pending.current = { signature, key: supportRequestKey() };
      const result = await apiRequest<SupportTicket>(`/api/v1/support/tickets/${id}/${kind}`, { method: "POST", body: JSON.stringify({ ...body, rowVersion: ticket.rowVersion, requestKey: pending.current.key }) });
      setTicket(result); pending.current = null; reset(); notify(s("Saved"));
    } catch (e) { setError(supportError(e, lang)); } finally { setBusy(false); locked.current = false; }
  };
  const upload = async () => {
    if (!file || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await uploadSupportAttachment(id, file.file, file.key, fileInternal); setFile(null); setTicket(await supportRead(id)); notify(s("Saved")); } catch (e) { setError(supportError(e, lang)); } finally { setBusy(false); locked.current = false; }
  };
  const download = async (fileId: number, name: string) => {
    setError("");
    try { const blob = await downloadSupportAttachment(id, fileId), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError(supportError(e, lang)); }
  };
  // The status target is passed in, so a confirm over unsaved text cannot leave an older target behind.
  const showAction = async (value: string, nextTarget?: string, fixed = false) => {
    if (dirty && !(await confirmDialog(s("Discard changes?"), { danger: true }))) return;
    reset(); setAction(value); setFixedTarget(fixed);
    if (ticket) { setAssignee(ticket.assigneeId === null ? "" : String(ticket.assigneeId)); setCategory(ticket.category); setPriority(ticket.priority); setUseful(ticket.recognition?.useful ?? false); setDetailed(ticket.recognition?.detailed ?? false); setActionable(ticket.recognition?.actionable ?? false); setThanks(ticket.recognition?.message ?? ""); setTarget(nextTarget ?? (ticket.status === "New" ? "Acknowledged" : "InProgress")); }
  };
  const goBack = async () => { if (!busy && (!dirty || (await confirmDialog(s("Discard changes?"), { danger: true })))) { onDirtyChange(false); onBack(); } };
  const actionTargets = ticket ? Array.from(new Set([...(ticket.permissions.operate ? ({ New: ["Cancelled"], Acknowledged: ["InProgress", "WaitingForReporter", "Resolved", "Cancelled"], InProgress: ["WaitingForReporter", "Resolved", "Cancelled"], WaitingForReporter: ["InProgress", "Resolved", "Cancelled"], Resolved: ["InProgress", ...(ticket.permissions.assign ? ["Closed"] : [])], Closed: ["InProgress"], Cancelled: [] } as Record<string, string[]>)[ticket.status] ?? [] : []), ...(ticket.permissions.own ? ticket.status === "Resolved" ? ["Closed", "InProgress", "Cancelled"] : ticket.status === "Closed" ? ["InProgress"] : ticket.status !== "Cancelled" ? ["Cancelled"] : [] : [])])) : [];

  // A reporter (not a support member) gets one named action per step; support members get Change status.
  const reporterOnly = Boolean(ticket?.permissions.own && !ticket.permissions.operate);
  const reporterLabel = (to: string) => to === "Closed" ? "Confirm close" : to === "Cancelled" ? "Withdraw" : "Reopen";
  const actions: TicketAction[] = ticket ? [
    ...(ticket.permissions.claim ? [{ key: "claim", label: s("Take ticket"), icon: "user" as const, run: () => void showAction("claim") }] : []),
    ...(ticket.permissions.award && !ticket.recognition ? [{ key: "recognition", label: s("Thank reporter"), icon: "star" as const, run: () => void showAction("recognition") }] : []),
    ...(reporterOnly
      ? actionTargets.map((to) => ({ key: `to-${to}`, label: s(reporterLabel(to)), icon: (to === "Closed" ? "check" : "refresh") as IconName, danger: to === "Cancelled", run: () => void showAction("transition", to, true) }))
      : actionTargets.length ? [{ key: "transition", label: s("Change status"), icon: "edit" as const, run: () => void showAction("transition", actionTargets[0]) }] : []),
    ...(ticket.permissions.assign ? [{ key: "assign", label: s("Assign ticket"), icon: "users" as const, run: () => void showAction("assign") }] : []),
    ...(ticket.permissions.adjust && ticket.recognition ? [{ key: "recognition/adjust", label: s("Adjust recognition"), icon: "edit" as const, run: () => void showAction("recognition/adjust") }] : []),
  ] : [];
  // One primary action (0.4): the step that moves the ticket on now.
  const primaryKey = !ticket ? null
    : ticket.permissions.claim ? "claim"
    : ticket.permissions.award && !ticket.recognition && ["Resolved", "Closed"].includes(ticket.status) ? "recognition"
    : reporterOnly ? (ticket.status === "Resolved" ? "to-Closed" : null)
    : actionTargets.length ? "transition" : null;
  const primary = actions.find((a) => a.key === primaryKey) ?? null;
  const more = [...actions.filter((a) => a !== primary), { key: "refresh", label: s("Refresh"), icon: "refresh" as const, run: () => void load() }];
  // The screen and its record share one line (Purchase Requisition · PR-2026-0113).
  const contextLabel: Record<string, string> = { module: "Page context", reference: "Page context", steps: "Steps", expected: "Expected", location: "Location" };
  const context = ticket ? Object.entries(ticket.context).filter(([k, v]) => v && !(k === "reference" && ticket.context.module))
    .map(([k, v]) => [contextLabel[k] ?? k, k === "module" ? [s(v), ticket.context.reference].filter(Boolean).join(" · ") : v] as const) : [];

  return <section className="support-center sp-page">
    <header className="sp-head">
      <div className="sp-head-title">
        <button className="sp-icon" type="button" aria-label={s("Back")} title={s("Back")} disabled={busy} onClick={goBack}><Icon name="arrowLeft" /></button>
        <h1>{ticket ? <><span className="sp-no">{ticket.ticketNo}</span>{ticket.subject}</> : s(loading ? "Loading" : "Report & Track Issues")}</h1>
        {ticket ? <StatusBadge status={ticket.status} /> : null}
      </div>
      {ticket ? <div className="sp-head-actions">
        <MoreActions items={more} disabled={busy} />
        {primary ? <button className="btn primary" type="button" disabled={busy} data-guide="support.primary" onClick={primary.run}><Icon name={primary.icon} />{primary.label}</button> : null}
      </div> : null}
    </header>
    {action ? null : <ErrorNote message={error} />}
    {ticket ? <div className="sp-detail">
      <div className="sp-main">
        <section className="sp-panel">
          <h2>{s("Description")}</h2>
          <p className="sp-pre">{ticket.description}</p>
          {context.length ? <dl className="sp-context-list">{context.map(([k, v]) => <div key={k}><dt>{s(k)}</dt><dd className="sp-pre">{v}</dd></div>)}</dl> : null}
          <h3>{s("Attachments")}</h3>
          {ticket.attachments.length ? <ul className="sp-files">{ticket.attachments.map((f) => <li key={f.id}>
            <Icon name={isImage(f) ? "eye" : "file"} />
            <button type="button" className="sp-doclink sp-file-name" onClick={() => void download(f.id, f.name)}>{f.name}</button>
            <small>{kilobytes(f.sizeBytes)}</small>
            {f.internal ? <span className="sp-badge warning">{s("Internal")}</span> : null}
            {isImage(f) ? <SupportImage ticketId={id} file={f} onDownload={() => void download(f.id, f.name)} /> : null}
          </li>)}</ul> : <p className="sp-muted">—</p>}
          {ticket.permissions.comment ? <div className="sp-upload">
            <label className="sp-drop compact"><input key={file?.key ?? "empty"} type="file" disabled={busy} accept=".png,.jpg,.jpeg,.pdf" onChange={(e) => { const selected = e.target.files?.[0]; if (selected) { if (selected.size > (meta?.maxFileBytes ?? MAX_FILE_BYTES)) { setError(s("File limits")); return; } setFile({ file: selected, key: supportRequestKey() }); } }} /><Icon name="upload" /><strong>{file ? file.file.name : s("Choose file")}</strong><small>{s("File limits")}</small></label>
            <div className="sp-upload-foot">
              {ticket.permissions.internal ? <label className="sp-check"><input type="checkbox" checked={fileInternal} onChange={(e) => setFileInternal(e.target.checked)} />{s("Internal attachment")}</label> : null}
              <button className="btn default" disabled={!file || busy} aria-busy={busy && Boolean(file)} type="button" onClick={() => void upload()}><Icon name="upload" />{s("Upload")}</button>
            </div>
          </div> : null}
        </section>
        <section className="sp-panel">
          <h2>{s("Conversation")}</h2>
          <ol className="sp-events">{ticket.events.map((event) => <li key={event.id} className={event.internal ? "internal" : undefined}>
            <div className="sp-event-head"><strong>{event.actorName}</strong><span>{s(event.kind)}</span>{event.internal ? <span className="sp-badge warning">{s("Internal")}</span> : null}<time dateTime={event.createdAt}>{date(event.createdAt)}</time></div>
            {event.details.to ? <p className="sp-event-move"><StatusBadge status={String(event.details.from)} /><Icon name="arrowRight" /><StatusBadge status={String(event.details.to)} /></p> : null}
            {event.body ? <p className="sp-pre">{event.body}</p> : null}
            {typeof event.details.points === "number" ? <p>{s("Thank-you points")}: {event.details.points}{typeof event.details.delta === "number" ? ` (${event.details.delta >= 0 ? "+" : ""}${event.details.delta})` : ""}</p> : null}
            {typeof event.details.reason === "string" ? <p className="sp-pre">{s("Reason")}: {event.details.reason}</p> : null}
          </li>)}</ol>
          {ticket.permissions.comment ? <form className="sp-reply" onSubmit={(e) => { e.preventDefault(); void mutate("comments", { message, internal }); }}>
            <label className="sp-field"><span className="sp-label">{s("Reply")}</span><textarea required maxLength={5000} rows={3} value={message} disabled={busy} onChange={(e) => setMessage(e.target.value)} /></label>
            <div className="sp-reply-foot">
              {ticket.permissions.internal ? <label className="sp-check"><input type="checkbox" checked={internal} disabled={busy} onChange={(e) => setInternal(e.target.checked)} />{s("Internal note")}</label> : null}
              <button type="submit" className="btn primary" disabled={busy || !message.trim()} aria-busy={busy && Boolean(message.trim())}><Icon name="send" />{s("Send")}</button>
            </div>
          </form> : null}
        </section>
      </div>
      <aside className="sp-side">
        <section className="sp-panel">
          <h2>{s("Ticket info")}</h2>
          <dl className="sp-dl">{[["Reporter", ticket.reporterName], ["Assignee", ticket.assigneeName ?? s("Unassigned")], ["Category", s(ticket.category)], ["Impact", s(ticket.impact)], ["Priority", s(ticket.priority)], ["Reported on", date(ticket.createdAt)], ["Updated", date(ticket.updatedAt)]].map(([k, v]) => <div key={k}><dt>{s(k!)}</dt><dd>{v}</dd></div>)}</dl>
        </section>
        <section className="sp-panel">
          <h2>{s("Thank-you points")}</h2>
          {ticket.recognition ? <div className="sp-recognition">
            <strong>{ticket.recognition.points ? `+${ticket.recognition.points} ${s("points")}` : s("Thanked")}</strong>
            <p className="sp-pre">{ticket.recognition.message}</p>
            <ul>{ticket.recognition.useful ? <li>{s("Useful")}</li> : null}{ticket.recognition.detailed ? <li>{s("Detailed")}</li> : null}{ticket.recognition.actionable ? <li>{s("Actionable")}</li> : null}</ul>
            <small>{s("Awarded by")} {ticket.recognition.evaluatorName} · {date(ticket.recognition.updatedAt)}</small>
          </div> : <p className="sp-muted">{s("Pending review")}</p>}
        </section>
      </aside>
    </div> : null}
    {ticket && action ? <SupportActionForm action={action} fixedTarget={fixedTarget} reporter={reporterOnly} ticket={ticket} meta={meta} busy={busy} reason={reason} setReason={setReason} assignee={assignee} setAssignee={setAssignee} category={category} setCategory={setCategory} priority={priority} setPriority={setPriority} target={target} setTarget={setTarget} targets={actionTargets} duplicate={duplicate} setDuplicate={setDuplicate} criteria={{ useful, detailed, actionable }} setCriteria={(key, value) => { if (key === "useful") { setUseful(value); if (!value) { setDetailed(false); setActionable(false); } } else if (key === "detailed") setDetailed(value); else setActionable(value); }} thanks={thanks} setThanks={setThanks} onClose={async () => { if (!busy && (await confirmDialog(s("Discard changes?"), { danger: true }))) reset(); }} onSave={(body) => void mutate(action === "claim" ? "assign" : action, body)} error={error} />
      : null}
  </section>;
}

type ActionProps = { action: string; fixedTarget: boolean; reporter: boolean; ticket: SupportTicket; meta: SupportMeta | null; busy: boolean; reason: string; setReason: (v: string) => void; assignee: string; setAssignee: (v: string) => void; category: string; setCategory: (v: string) => void; priority: string; setPriority: (v: string) => void; target: string; setTarget: (v: string) => void; targets: string[]; duplicate: string; setDuplicate: (v: string) => void; criteria: { useful: boolean; detailed: boolean; actionable: boolean }; setCriteria: (key: "useful" | "detailed" | "actionable", value: boolean) => void; thanks: string; setThanks: (v: string) => void; onClose: () => void; onSave: (body: Record<string, unknown>) => void; error: string };
function SupportActionForm(p: ActionProps) {
  const { s } = useCopy();
  const recognition = p.action.startsWith("recognition");
  const self = p.meta?.userId ?? null;
  const named = p.action === "transition" && p.fixedTarget;
  const withdraw = named && p.target === "Cancelled";
  const submit = () => p.onSave(recognition
    ? { ...p.criteria, message: p.thanks, reason: p.reason, recognitionVersion: p.ticket.recognition?.rowVersion }
    : p.action === "transition" ? { status: p.target, reason: p.reason, ...(p.duplicate ? { duplicateOf: Number(p.duplicate) } : {}) }
    : { assigneeId: p.action === "claim" ? self : p.assignee ? Number(p.assignee) : null, category: p.action === "claim" ? p.ticket.category : p.category, priority: p.action === "claim" ? p.ticket.priority : p.priority, reason: p.reason });
  const available = p.meta ? [...p.meta.users.filter((u) => u.canManage), ...p.meta.members.filter((m) => m.category_code === p.category)].filter((u, index, list) => list.findIndex((x) => x.id === u.id) === index) : [];
  const title = s(recognition ? (p.action === "recognition/adjust" ? "Adjust recognition" : "Thank reporter") : named ? (p.target === "Closed" ? "Confirm close" : withdraw ? "Withdraw" : "Reopen") : p.action === "transition" ? "Change status" : p.action === "claim" ? "Take ticket" : "Assign ticket");
  const saveLabel = s(p.action === "recognition/adjust" ? "Adjust recognition" : recognition ? (p.criteria.useful ? "Award points" : "Thank without points") : named ? (p.target === "Closed" ? "Confirm close" : withdraw ? "Withdraw" : "Reopen") : "Save");
  const footer = <>
    <button className="btn default" type="button" disabled={p.busy} onClick={p.onClose}>{s("Cancel")}</button>
    <button className={`btn ${withdraw ? "sp-destructive" : "primary"}`} type="submit" disabled={p.busy || p.action === "claim" && self === null} aria-busy={p.busy}>{saveLabel}</button>
  </>;
  return <SupportDialog title={title} size={recognition || p.action === "assign" ? "lg" : "md"} onClose={p.onClose} onSubmit={(e) => { e.preventDefault(); submit(); }} footer={footer}>
    <fieldset className="sp-form one" disabled={p.busy}>
      <p className="sp-muted">{p.ticket.ticketNo} · {p.ticket.subject}</p>
      {recognition ? <>
        <p>{p.ticket.reporterName}</p>
        <div className="sp-checks">{(["useful", "detailed", "actionable"] as const).map((key) => <label key={key} className="sp-check"><input type="checkbox" checked={p.criteria[key]} disabled={key !== "useful" && !p.criteria.useful} onChange={(e) => p.setCriteria(key, e.target.checked)} />{s(key === "useful" ? "Useful" : key === "detailed" ? "Detailed" : "Actionable")}</label>)}</div>
        <div className="sp-score">{p.criteria.useful ? `+${5 + (p.criteria.detailed ? 3 : 0) + (p.criteria.actionable ? 2 : 0)} / 10 ${s("points")}` : s("Thank without points")}</div>
        <label className="sp-field"><span className="sp-label">{s("Thank-you message")}<b aria-hidden="true">*</b></span><textarea required minLength={10} maxLength={1000} rows={4} value={p.thanks} onChange={(e) => p.setThanks(e.target.value)} /></label>
        <p className="sp-muted">{s("Policy note")}</p>
      </> : p.action === "transition" ? <>
        {named ? null : <SelectField label={s("Status")} value={p.target} onChange={p.setTarget} options={p.targets.map((v) => ({ value: v, label: s(v) }))} />}
        {p.ticket.permissions.assign && p.target === "Cancelled" ? <label className="sp-field"><span className="sp-label">{s("Duplicate ticket ID")}</span><input type="number" min={1} value={p.duplicate} onChange={(e) => p.setDuplicate(e.target.value)} /></label> : null}
      </> : p.action === "assign" ? <div className="sp-form-row">
        <SelectField label={s("Category")} value={p.category} onChange={(v) => { p.setCategory(v); p.setAssignee(""); }} options={categories.map((v) => ({ value: v, label: s(v) }))} />
        <SelectField label={s("Priority")} value={p.priority} onChange={p.setPriority} options={["Low", "Normal", "High", "Urgent"].map((v) => ({ value: v, label: s(v) }))} />
        <div className="span-2"><SelectField label={s("Assignee")} value={p.assignee} onChange={p.setAssignee} options={[{ value: "", label: s("Unassigned") }, ...available.map((u) => ({ value: String(u.id), label: u.name }))]} /></div>
      </div> : null}
      {!recognition || p.action === "recognition/adjust" ? <label className="sp-field"><span className="sp-label">{s(p.action === "recognition/adjust" ? "Adjustment reason" : p.reporter && named ? "Note to the team" : "Reason")}<b aria-hidden="true">*</b></span><textarea required minLength={p.action === "recognition/adjust" ? 10 : 1} maxLength={1000} rows={3} value={p.reason} onChange={(e) => p.setReason(e.target.value)} /></label> : null}
    </fieldset>
    <ErrorNote message={p.error} />
  </SupportDialog>;
}

function SupportMembers({ meta, onSaved, onClose }: { meta: SupportMeta; onSaved: () => void; onClose: () => void }) {
  const { s, lang } = useCopy();
  const [category, setCategory] = useState("Application"), [user, setUser] = useState(""), [award, setAward] = useState(false), [notify, setNotify] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const save = async (userId: number, enabled: boolean, canAward: boolean, notifyEmail: boolean, categoryCode = category) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await apiRequest("/api/v1/support/members", { method: "POST", body: JSON.stringify({ category: categoryCode, userId, enabled, canAward, notifyEmail }) }); onSaved(); } catch (e) { setError(supportError(e, lang)); } finally { setBusy(false); }
  };
  return <SupportDialog title={s("Support members")} size="table" onClose={onClose} footer={<button className="btn default" type="button" onClick={onClose}>{s("Close")}</button>}>
    <form className="sp-member-add" onSubmit={(e) => { e.preventDefault(); void save(Number(user), true, award, notify); }}>
      <div className="sp-form-row">
        <SelectField label={s("Category")} value={category} onChange={setCategory} options={categories.map((v) => ({ value: v, label: s(v) }))} />
        <SelectField label={s("Member")} value={user} onChange={setUser} options={[{ value: "", label: "—" }, ...meta.users.map((u) => ({ value: String(u.id), label: u.name }))]} />
      </div>
      <div className="sp-member-foot">
        <label className="sp-check"><input type="checkbox" checked={award} onChange={(e) => setAward(e.target.checked)} />{s("Can award")}</label>
        <label className="sp-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />{s("Receive email notifications")}</label>
        <button type="submit" className="btn primary" disabled={busy || !user} aria-busy={busy}><Icon name="plus" />{s("Enable member")}</button>
      </div>
    </form>
    <ErrorNote message={error} />
    <div className="sp-table embedded"><table>
      <thead><tr><th>{s("Category")}</th><th>{s("Member")}</th><th>{s("Can award")}</th><th>{s("Email")}</th><th aria-label={s("Remove member")} /></tr></thead>
      <tbody>{meta.members.map((m) => <tr key={`${m.category_code}-${m.id}`}>
        <td>{s(m.category_code)}</td><td>{m.name}</td><td>{m.can_award ? <Icon name="check" /> : <span className="sp-muted">—</span>}</td>
        <td><input type="checkbox" aria-label={s("Receive email notifications")} checked={m.notify_email} disabled={busy} onChange={() => void save(m.id, true, m.can_award, !m.notify_email, m.category_code)} /></td>
        <td className="sp-row-end"><button className="btn ghost sm sp-danger-text" type="button" disabled={busy} onClick={async () => { if (await confirmDialog(`${s("Remove member")}: ${m.name} · ${s(m.category_code)}`, { danger: true })) void save(m.id, false, false, false, m.category_code); }}>{s("Remove member")}</button></td>
      </tr>)}</tbody>
    </table></div>
  </SupportDialog>;
}
