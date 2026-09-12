"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiClientError, createLaborPackage, installStandardLaborLibrary, listLaborPackages, loadLaborPackage, updateLaborPackage,
  type BootstrapData, type LaborPackageDetail, type LaborPackageInput, type LaborPackageSummary,
} from "../api-client";
import { Badge, EmptyState, Field, Icon, PageHeader, Pagination, Panel, SearchInput } from "../ui";
import { laborPackageInput, laborPackagePermissions, suggestedCopyCode } from "../../../lib/labor-package-master";

import { useLanguage } from "../i18n";
import { LABOR_PACKAGE_COPY } from "./labor-package-copy";
import "./labor-package-master.css";

const PAGE_SIZE = 25;
const ERP_CATEGORIES = ["Hardware", "Software", "Service", "Installation", "License", "Maintenance", "Training"];
const messageOf = (error: unknown) => error instanceof Error ? error.message : "ไม่สามารถทำรายการได้";
const unavailableMessage = (error: unknown) => error instanceof ApiClientError && error.code === "labor_packages_unavailable" ? error.message : null;
const statusTone = (status: string): "green" | "amber" | "slate" => status === "Active" ? "green" : status === "Draft" ? "amber" : "slate";

export function LaborPackageMaster({ bootstrap, initialPackageId, onClose }: {
  bootstrap: BootstrapData;
  initialPackageId?: number;
  onClose?: () => void;
}) {
  const { lang } = useLanguage();
  const t = useCallback((key: string) => lang === "TH" ? LABOR_PACKAGE_COPY[key]?.th ?? key : lang === "JP" ? LABOR_PACKAGE_COPY[key]?.jp ?? key : key, [lang]);
  const permission = useMemo(() => laborPackagePermissions(bootstrap.permissions), [bootstrap.permissions]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LaborPackageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LaborPackageDetail | null>(null);
  const [draft, setDraft] = useState<LaborPackageInput | null>(null);
  const [copying, setCopying] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [success, setSuccess] = useState("");
  const [unavailable, setUnavailable] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  const loadDetail = useCallback(async (id: number, force = false) => {
    if (!force && dirty && !window.confirm(t("Discard unsaved changes?"))) return;
    const sequence = ++detailSequence.current;
    setLoadingDetail(true);
    setError("");
    try {
      const detail = await loadLaborPackage(id);
      if (sequence !== detailSequence.current) return;
      setSelected(detail);
      setDraft(laborPackageInput(detail));
      setCopying(false);
      setDirty(false);
    } catch (requestError) {
      if (sequence === detailSequence.current) setError(messageOf(requestError));
    } finally {
      if (sequence === detailSequence.current) setLoadingDetail(false);
    }
  }, [dirty, t]);

  useEffect(() => {
    const sequence = ++listSequence.current;
    const timer = window.setTimeout(() => {
      setLoadingList(true);
      void listLaborPackages({ search: search || undefined, status: status || undefined, page, pageSize: PAGE_SIZE })
        .then((result) => {
          if (sequence !== listSequence.current) return;
          setItems(result.items); setTotal(result.total); setUnavailable(""); setListError("");
        })
        .catch((requestError) => {
          if (sequence !== listSequence.current) return;
          const reason = unavailableMessage(requestError);
          setItems([]); setTotal(0); setUnavailable(reason ?? ""); setListError(reason ? "" : messageOf(requestError));
        })
        .finally(() => { if (sequence === listSequence.current) setLoadingList(false); });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [page, refreshKey, search, status]);

  const initialLoaded = useRef<number | undefined>(undefined);
  const firstSelection = useRef(false);
  useEffect(() => {
    if (initialPackageId || firstSelection.current || selected || !items.length) return;
    const timer = window.setTimeout(() => {
      firstSelection.current = true;
      void loadDetail(items[0].id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialPackageId, items, loadDetail, selected]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (initialPackageId && initialLoaded.current !== initialPackageId) {
      initialLoaded.current = initialPackageId;
      void loadDetail(initialPackageId, true);
    }
  }, [initialPackageId, loadDetail]);

  const refresh = () => {
    if (saving || installing) return;
    setSuccess(""); setRefreshKey((value) => value + 1);
    if (selected && !copying) void loadDetail(selected.id);
  };

  const installStarterLibrary = async () => {
    if (!permission.canPublish || installing || !window.confirm(t("Install the standard labor library?"))) return;
    setInstalling(true); setError(""); setSuccess("");
    try {
      const result = await installStandardLaborLibrary();
      const created = result.createdLabor.length + result.createdSupport.length;
      setSuccess(created > 0
        ? `${t("Standard library installed")}: ${result.createdLabor.length} ${t("labor packages")}, ${result.createdSupport.length} ${t("support-cost templates")}`
        : t("The standard library is already installed."));
      setSearch(""); setStatus(""); setPage(1); setRefreshKey((value) => value + 1);
    } catch (requestError) {
      setError(messageOf(requestError));
    } finally { setInstalling(false); }
  };
  const patchHeader = (change: Partial<LaborPackageInput>) => {
    setDraft((current) => current ? { ...current, ...change } : current); setDirty(true);
  };
  const patchLine = (index: number, change: Partial<LaborPackageInput["lines"][number]>) => {
    setDraft((current) => current ? { ...current, lines: current.lines.map((line, position) => position === index ? { ...line, ...change } : line) } : current);
    setDirty(true);
  };

  const save = async (publish: boolean) => {
    if (!draft || (!copying && !selected)) return;
    const snapshot = structuredClone(draft);
    setSaving(true); setError(""); setSuccess("");
    try {
      const input = { ...snapshot, status: publish ? "Active" : "Draft" };
      if (copying) {
        const created = await createLaborPackage(input);
        setSuccess(`${t("Draft copy created")}: ${created.code}`); setRefreshKey((value) => value + 1);
        await loadDetail(created.id, true);
      } else if (selected) {
        await updateLaborPackage(selected.id, { ...input, rowVersion: selected.rowVersion });
        setSuccess(t(publish ? "Package published" : "Draft saved")); setRefreshKey((value) => value + 1);
        await loadDetail(selected.id, true);
      }
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 409 && selected && !copying) {
        setError(`${messageOf(requestError)} — ${t("Your changes are preserved. Refresh to review the latest version.")}`);
      } else setError(messageOf(requestError));
    } finally { setSaving(false); }
  };

  const startCopy = () => {
    if (!selected || !permission.canEditDraft) return;
    setDraft({ ...laborPackageInput(selected, "Draft"), code: suggestedCopyCode(selected.code), name: `${selected.name} (${t("Copy")})` });
    setCopying(true); setDirty(true); setSuccess(""); setError("");
  };
  const editable = Boolean(!saving && draft && permission.canEditDraft && (copying || selected?.status === "Draft"));

const labelStatus = (value: string) => t(value === "Active" ? "Ready to use" : value === "Retired" ? "Retired" : "Draft");
  const close = () => { if (!dirty || window.confirm(t("Discard unsaved changes?"))) onClose?.(); };
  const help = <details className="labor-guide">
    <summary><Icon name="book" />{t("How to create and use a package")}<Icon name="chevronDown" /></summary>
    <ol>{[
      ["Create from an estimate", "Use Save as labor package on an existing estimate work package. It will appear here as a draft."],
      ["Review and publish", "Check activities and defaults. An authorized master-data editor can publish the draft."],
      ["Reuse in Estimate Cost", "Open a labor package picker in your estimate and select a ready-to-use package. Internal rates use the current rate master."],
    ].map(([title, body], index) => <li key={title}><span className="labor-step">{index + 1}</span><div><strong>{t(title)}</strong><p>{t(body)}</p></div></li>)}</ol>
  </details>;

  return <div className="labor-master">
    {!onClose ? <PageHeader eyebrow={t("Labor Packages")} title={t("Labor Packages")} subtitle={t("Save time with reusable activities, staffing and durations.")} actions={<>
      {permission.canPublish ? <button className="btn primary" type="button" disabled={saving || installing} onClick={() => { void installStarterLibrary(); }}><Icon name="layers" />{installing ? t("Installing…") : t("Install standard library")}</button> : null}
      <button className="btn default" type="button" disabled={saving || installing || loadingDetail} onClick={refresh}><Icon name="refresh" />{t("Refresh")}</button>
    </>} /> : null}
    {error ? <div className="info-strip red" role="alert"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    {listError ? <div className="info-strip red" role="alert">{listError}<button type="button" className="btn ghost" onClick={refresh}>{t("Refresh")}</button></div> : null}
    {success ? <div className="info-strip green" role="status"><Icon name="checkCircle" /><span>{success}</span></div> : null}
    {!permission.canEditDraft ? <div className="info-strip"><Icon name="lock" /><span>{t("View only — you can review packages but cannot edit them.")}</span></div> : null}
    <div className="info-strip"><Icon name="book" /><span>{t("Labor packages use person-days. Travel, accommodation, tools and safety are installed as companion templates in Module Templates.")}</span></div>
    {help}
    {unavailable ? <EmptyState icon="alertCircle" title={t("Labor packages are unavailable")} message={unavailable} /> : <div className="labor-workspace">
      <section className="labor-library" aria-label={t("Labor Packages")}>
        <div className="labor-library-tools">
          <SearchInput value={search} onChange={value => { setSearch(value); setPage(1); }} placeholder={t("Search name, code or activity")} />
          <div className="labor-status-filters" role="group" aria-label={t("Labor Packages")}>
            {[["", "All"], ["Active", "Ready to use"], ["Draft", "Draft"], ["Retired", "Retired"]].map(([value, label]) => <button key={value} className={status === value ? "is-active" : ""} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }}>{t(label)}</button>)}
          </div>
          <div className="labor-result-count" aria-live="polite">{loadingList ? t("Loading packages…") : `${total} ${t("packages found")}`}</div>
        </div>
        {loadingList ? <div className="empty" role="status"><span className="spinner" />{t("Loading packages…")}</div> : items.length ? <ul className="labor-package-list">
          {items.map(item => <li key={item.id}><button className={`labor-package-card${selected?.id === item.id && !copying ? " is-selected" : ""}`} type="button" disabled={saving || copying && dirty} aria-pressed={selected?.id === item.id && !copying} onClick={() => { void loadDetail(item.id); }}>
            <span className="labor-card-top"><Badge tone={statusTone(item.status)}>{labelStatus(item.status)}</Badge><span className="muted">{t("Revision")} {item.revision}</span></span>
            <strong className="labor-card-name">{item.name}</strong>
            <span className="labor-card-code">{item.code}</span>
            <span className="labor-card-meta"><span>{item.costType} · {item.lineCount} {t("activities")}</span><Icon name="chevronRight" /></span>
          </button></li>)}
        </ul> : <EmptyState icon="search" title={t(search || status ? "No matching packages" : "No labor packages yet")} message={t(search || status ? "Try another search or clear the filters." : "Use Save as labor package on an existing estimate work package. It will appear here as a draft.")} action={search || status ? <button className="btn default" type="button" onClick={() => { setSearch(""); setStatus(""); setPage(1); }}>{t("Clear filters")}</button> : undefined} />}
        {total > PAGE_SIZE ? <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} from={total ? (page - 1) * PAGE_SIZE + 1 : 0} to={Math.min(page * PAGE_SIZE, total)} total={total} onPage={setPage} /> : null}
      </section>
      <div className="labor-detail">
        <Panel title={copying ? t("New draft copy") : selected?.name ?? t("Package details")} actions={onClose ? <button className="btn ghost sm" type="button" disabled={saving} onClick={close}>{t("Close")}</button> : undefined}>
          {loadingDetail ? <div className="empty" role="status"><span className="spinner" />{t("Loading details…")}</div> : !draft ? <div className="labor-start"><span className="labor-start-icon"><Icon name="layers" /></span><h2>{t("Select a package to get started")}</h2><p>{t("Choose a package from the list to review its activities, edit a draft or make a copy.")}</p></div> : <>
            <div className="labor-detail-meta"><Badge tone={statusTone(copying ? "Draft" : selected?.status ?? "Draft")}>{labelStatus(copying ? "Draft" : selected?.status ?? "Draft")}</Badge><span className="mono">{draft.code}</span>{selected && !copying ? <span>{t("Revision")} {selected.revision}</span> : null}{dirty ? <span className="labor-unsaved" role="status">{t("Unsaved changes")}</span> : null}</div>
            <div className="labor-next-step"><Icon name={selected?.status === "Active" && !copying ? "checkCircle" : "alertCircle"} /><p>{t(!copying && selected?.status === "Active" ? "This package is ready to use. Make a draft copy to change it." : !copying && selected?.status === "Retired" ? "This package is retired and is available for reference only." : "Review the activities, then save your draft or publish it for the team.")}</p></div>
            <section className="labor-information" aria-label={t("Package information")}>
              <h3>{t("Package information")}</h3>
              {editable ? <div className="form-grid two">
                <Field label={`${t("Package code")} *`}><input maxLength={40} value={draft.code} onChange={event => patchHeader({ code: event.target.value.toUpperCase() })} /></Field>
                <Field label={`${t("Package name")} *`}><input maxLength={200} value={draft.name} onChange={event => patchHeader({ name: event.target.value })} /></Field>
                <Field label={t("Description")} span={2}><textarea maxLength={1000} value={draft.description ?? ""} onChange={event => patchHeader({ description: event.target.value })} /></Field>
              </div> : <p className="labor-description">{draft.description || t("No description provided")}</p>}
              <div className="labor-scope"><span>{draft.costType}</span><span>{draft.department || t("All departments")}</span><span>{draft.projectType || t("All project types")}</span></div>
            </section>
            <section className="labor-activities" aria-label={t("Activity defaults")}>
              <div className="labor-section-heading"><h3>{t("Activity defaults")}</h3><span>{draft.lines.length} {t("activities")}</span></div>
              <p className="muted">{t("Defaults can be adjusted when applying this package to an estimate.")}</p>
              <div className="table-wrap"><table className="sheet">
                <thead><tr><th>{t("Activity")}</th><th className="num">{t("People")}</th><th className="num">{t("Duration")}</th><th>{t("ERP category")}</th></tr></thead>
                <tbody>{draft.lines.map((line, index) => <tr key={`${selected?.id ?? "copy"}-${index}`}>
                  <td>{editable ? <input maxLength={300} value={line.activity} aria-label={`${t("Activity")} ${index + 1}`} onChange={event => patchLine(index, { activity: event.target.value })} /> : <strong>{line.activity}</strong>}<div className="cell-primary"><span>{line.department} · {line.level}</span><span>{line.provider}</span></div></td>
                  <td className="num">{editable ? <input className="num" type="number" min="0.01" step="0.01" value={line.defaultEngineers ?? 1} aria-label={`${t("People")} ${line.activity}`} onChange={event => patchLine(index, { defaultEngineers: Number(event.target.value) })} /> : line.defaultEngineers ?? 1}</td>
                  <td className="num">{editable ? <input className="num" type="number" min="0.01" step="0.01" value={line.rateBasis === "Hourly" ? line.defaultHours ?? "" : line.defaultManDays ?? 1} aria-label={`${t("Duration")} ${line.activity}`} onChange={event => patchLine(index, line.rateBasis === "Hourly" ? { defaultHours: Number(event.target.value) } : { defaultManDays: Number(event.target.value) })} /> : line.rateBasis === "Hourly" ? line.defaultHours ?? "—" : line.defaultManDays ?? 1}<small>{t(line.rateBasis === "Hourly" ? "Hours" : "Man-days")}</small></td>
                  <td>{editable ? <select value={line.defaultErpCategory ?? ""} aria-label={`${t("ERP category")} ${line.activity}`} onChange={event => patchLine(index, { defaultErpCategory: event.target.value || null })}><option value="">{t("Choose a category")}</option>{ERP_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select> : line.defaultErpCategory || t("Choose a category")}</td>
                </tr>)}</tbody>
              </table></div>
            </section>
            <div className="labor-actions">
              {saving ? <span role="status"><span className="spinner" />{t("Saving…")}</span> : null}
              {!copying && selected?.status === "Active" && permission.canEditDraft ? <button className="btn primary" type="button" disabled={saving} onClick={startCopy}><Icon name="copy" />{t("Create draft copy")}</button> : null}
              {!copying && dirty && selected?.status === "Draft" ? <button className="btn ghost" type="button" disabled={saving} onClick={() => { if (window.confirm(t("Discard unsaved changes?"))) { setDraft(laborPackageInput(selected)); setDirty(false); } }}>{t("Discard changes")}</button> : null}
              {copying ? <button className="btn ghost" type="button" disabled={saving} onClick={() => { if (selected && window.confirm(t("Discard unsaved changes?"))) { setDraft(laborPackageInput(selected)); setCopying(false); setDirty(false); } }}>{t("Cancel copy")}</button> : null}
              {editable ? <button className={`btn ${permission.canPublish && !copying ? "default" : "primary"}`} type="button" disabled={!draft.code.trim() || !draft.name.trim()} onClick={() => { void save(false); }}><Icon name="check" />{t("Save draft")}</button> : null}
              {editable && !copying && permission.canPublish ? <button className="btn primary" type="button" disabled={!draft.code.trim() || !draft.name.trim()} onClick={() => { void save(true); }}><Icon name="checkCircle" />{t("Publish for team")}</button> : null}
            </div>
            {editable && !copying && !permission.canPublish ? <p className="muted">{t("Ask a master-data editor to review and publish this draft.")}</p> : null}
          </>}
        </Panel>
      </div>
    </div>}
  </div>;
}
