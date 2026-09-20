"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClientError,
  applyLaborPackage,
  createLaborPackageFromEstimate,
  listLaborPackages,
  listLaborRates,
  loadLaborPackage,
  type EstimateCostWorkspace,
  type LaborPackageDetail,
  type LaborPackageSummary,
  type LaborRate,
} from "../api-client";
import { currentLocale, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { EmptyState, Field, Icon, Modal, Pagination, SearchInput } from "../ui";
import { estimateApplyOwnerId, estimateBusinessDate } from "../../../lib/estimate-ux";
import {
  applyOverrides,
  draftFromPackageLine,
  packageApplyBlocker,
  previewLaborLine,
  rateDailyFor,
  rateLabel,
  rateWindowLabel,
  summarizeLaborApply,
  type LaborCostType,
  type LaborLineDraft,
  type LaborPackageLinePreview,
} from "../../../lib/labor-master";

/* The entry-time half of the labor lane: pick a rate, or pull a whole work
   package out of the library, adjust the people and the duration, and see what
   the estimate will actually be charged before anything is written.

   Nothing here decides a price. Internal rates come from GET /api/v1/labor-rates
   and are re-resolved by the server at apply time, so what this shows is a
   preview of the real value rather than a second opinion about it. */

const PAGE_SIZE = 25;
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const number = (value: number, maximumFractionDigits = 2) => value.toLocaleString(currentLocale(), { maximumFractionDigits });
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

/* Migration 044 is reserved rather than required, so a database that predates it
   answers 503 labor_packages_unavailable. That is an environment fact, not an
   empty library: telling the estimator to "build one" would send them at a
   button that answers 503 as well. */
const unavailableReason = (error: unknown): string | null =>
  error instanceof ApiClientError && error.code === "labor_packages_unavailable" ? error.message : null;

const ERP_CATEGORIES = ["Hardware", "Software", "Service", "Installation", "License", "Maintenance", "Training"] as const;

function statusTone(status: LaborRate["status"]): string {
  return status === "Effective" ? "pill ok" : status === "Future" ? "pill" : "pill muted";
}

/* The dictionary already owns "Effective" as the date-window column header
   ("มีผลตั้งแต่"), which does not read as a status. The badge gets its own
   words rather than a second meaning welded onto one key. */
const RATE_STATUS_TEXT: Record<LaborRate["status"], string> = {
  Effective: "In effect", Future: "Starts later", Expired: "Expired", Inactive: "Inactive",
};

/**
 * Rate master search.
 *
 * Future, expired and inactive rows stay visible — an estimator needs to see
 * that next quarter's card is already loaded — but only an effective row can be
 * chosen, because anything else would write a line the API would reject.
 */
export function LaborRatePickerModal({ costType, department, busy, onClose, onSelect }: {
  costType: LaborCostType;
  department?: string;
  busy: boolean;
  onClose: () => void;
  onSelect: (rate: LaborRate) => void;
}) {
  const today = estimateBusinessDate(new Date());
  const [search, setSearch] = useState("");
  const [onlyEffective, setOnlyEffective] = useState(true);
  const [page, setPage] = useState(1);
  const [rates, setRates] = useState<LaborRate[]>([]);
  const [total, setTotal] = useState(0);
  const [masterFields, setMasterFields] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const localizeCopy = useT();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listLaborRates({
        costType, search: search || undefined, department: department || undefined,
        on: today, effectiveOnly: onlyEffective, page, pageSize: PAGE_SIZE,
      })
        .then((result) => {
          if (!active) return;
          setRates(result.items);
          setTotal(result.total);
          setMasterFields(result.masterFieldsAvailable);
          setError("");
        })
        .catch((requestError) => { if (active) setError(errorText(requestError)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [costType, department, onlyEffective, page, search, today]);

  return <Modal
    title="Rate master"
    subtitle="Search the rate master and fill in the rate, level and department"
    size="lg"
    onClose={onClose}
    footer={<button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>}
  >
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    {!masterFields ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>
      <LocalizedText text={"This database has no rate code, role or ERP default yet. Rates and their amounts are correct; the extra master fields arrive with migration 044."} />
    </span></div> : null}
    <div className="row" style={{ gap: 8 }}>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search code, level, department or role" />
      <label className="check-inline">
        <input type="checkbox" checked={onlyEffective} onChange={(event) => { setOnlyEffective(event.target.checked); setPage(1); }} />
        <LocalizedText text={"Effective today only"} />
      </label>
    </div>
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading rates…"} /></div>
      : rates.length ? <div className="table-wrap" style={{ maxHeight: 340, marginTop: 10 }}><table>
        <thead><tr>
          <th><LocalizedText text={"Rate"} /></th>
          <th style={{ width: 180 }}><LocalizedText text={"Effective"} /></th>
          <th className="num" style={{ width: 120 }}><LocalizedText text={"Per hour"} /></th>
          <th className="num" style={{ width: 120 }}><LocalizedText text={"Per day"} /></th>
          <th style={{ width: 120 }}><LocalizedText text={"ERP"} /></th>
          <th style={{ width: 90 }} />
        </tr></thead>
        <tbody>{rates.map((rate) => <tr key={rate.id}>
          <td><div className="cell-primary"><strong>{rateLabel(rate)}</strong><span>
            <span className={statusTone(rate.status)}><LocalizedText text={RATE_STATUS_TEXT[rate.status]} /></span> <LocalizedText text={"· version"} /> {rate.version}
          </span></div></td>
          <td>{rateWindowLabel(rate)}</td>
          <td className="num">{rate.hourlyRate === null ? "—" : money(rate.hourlyRate)}</td>
          <td className="num"><strong>{rate.dailyRate === null ? "—" : money(rate.dailyRate)}</strong></td>
          <td>{rate.defaultErpCategory ?? "—"}</td>
          <td><button
            className="btn default sm"
            type="button"
            disabled={busy || rate.status !== "Effective"}
            title={rate.status === "Effective" ? undefined : localizeCopy("Only an effective rate can price a new line")}
            onClick={() => onSelect(rate)}
          ><LocalizedText text={"Use"} /></button></td>
        </tr>)}</tbody>
      </table></div>
        : <EmptyState icon="search" title="No rate found" message="No engineering rate matches this search. An Engineering Manager or Admin maintains the rate master." />}
    <Pagination
      page={page}
      pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      from={total ? (page - 1) * PAGE_SIZE + 1 : 0}
      to={Math.min(page * PAGE_SIZE, total)}
      total={total}
      onPage={setPage}
    />
  </Modal>;
}

function linePreviewShape(line: LaborPackageDetail["lines"][number]): LaborPackageLinePreview {
  return {
    id: line.id, activity: line.activity, department: line.department, level: line.level,
    costType: line.costType, provider: line.provider, rateBasis: line.rateBasis,
    defaultEngineers: line.defaultEngineers, defaultManDays: line.defaultManDays,
    defaultHours: line.defaultHours, defaultHoursPerDay: line.defaultHoursPerDay,
    referenceDailyRate: line.referenceDailyRate, defaultErpCategory: line.defaultErpCategory,
  };
}

/**
 * Apply a published labor package.
 *
 * Every stored default is editable here, and each line is costed against the
 * live master rate for its own level, department and cost type. A line the
 * server would reject is blocked with the reason, and the whole apply waits:
 * the estimator fixes it or skips it on purpose, rather than discovering later
 * that a line quietly went missing.
 */
export function ApplyLaborPackageModal({ workspace, currentUserId, busy, onClose, onApplied, onManageLibrary }: {
  workspace: EstimateCostWorkspace;
  currentUserId: number;
  busy: boolean;
  onClose: () => void;
  onApplied: (message: string) => Promise<void>;
  /* Maintaining the library is a different act on different data, so it sits
     apart from the actions that write to this estimate. */
  onManageLibrary?: () => void;
}) {
  const today = estimateBusinessDate(new Date());
  const [search, setSearch] = useState("");
  const [costType, setCostType] = useState<LaborCostType | "">("");
  const [page, setPage] = useState(1);
  const [packages, setPackages] = useState<LaborPackageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LaborPackageDetail | null>(null);
  const [drafts, setDrafts] = useState<LaborLineDraft[]>([]);
  const [workPackage, setWorkPackage] = useState("");
  const [rates, setRates] = useState<LaborRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState("");
  const [choosing, setChoosing] = useState<number | null>(null);
  const localizeCopy = useT();

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listLaborPackages({ status: "Active", search: search || undefined, costType: costType || undefined, page, pageSize: PAGE_SIZE })
        .then((result) => { if (active) { setPackages(result.items); setTotal(result.total); setError(""); setUnavailable(""); } })
        .catch((requestError) => {
          if (!active) return;
          const reason = unavailableReason(requestError);
          setPackages([]);
          setTotal(0);
          setUnavailable(reason ?? "");
          setError(reason ? "" : errorText(requestError));
        })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [costType, page, search]);

  /* One rate read per selected package covers every line in it: the picker needs
     the live daily rate for each level and department to cost the preview. */
  const loadRates = useCallback(async (detail: LaborPackageDetail) => {
    const result = await listLaborRates({ costType: detail.costType, on: today, effectiveOnly: true, pageSize: 200 });
    setRates(result.items);
  }, [today]);

  const choose = async (summary: LaborPackageSummary) => {
    setError("");
    setChoosing(summary.id);
    try {
      const detail = await loadLaborPackage(summary.id);
      setSelected(detail);
      setDrafts(detail.lines.map((line) => draftFromPackageLine(linePreviewShape(line), today)));
      setWorkPackage(detail.name);
      await loadRates(detail);
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setChoosing(null); }
  };

  /* Back to the library with the search still where they left it. */
  const clearSelection = () => { setSelected(null); setDrafts([]); setRates([]); setWorkPackage(""); setError(""); };

  const masterRateFor = useCallback((line: LaborPackageDetail["lines"][number]): number | null => {
    const match = rates.find((rate) => rate.level === line.level && rate.department === line.department && rate.status === "Effective");
    return match ? rateDailyFor(line.costType, match) : null;
  }, [rates]);

  const lines = useMemo(() => selected?.lines ?? [], [selected]);
  const previews = useMemo(
    () => lines.map((line, index) => previewLaborLine(
      linePreviewShape(line),
      drafts[index] ?? draftFromPackageLine(linePreviewShape(line), today),
      masterRateFor(line),
    )),
    [drafts, lines, masterRateFor, today],
  );
  const summary = useMemo(() => summarizeLaborApply(previews, drafts), [drafts, previews]);
  const blocker = selected ? packageApplyBlocker(selected.status, selected.lineCount, workspace.capabilities.canEditManhour) : null;

  const updateDraft = (index: number, change: Partial<LaborLineDraft>) =>
    setDrafts((current) => current.map((draft, position) => position === index ? { ...draft, ...change } : draft));

  const apply = async () => {
    if (!selected || !summary.canApply || !workPackage.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = await applyLaborPackage(workspace.header.id, {
        packageId: selected.id,
        /* An assigned engineer may only add a line in their own name; only the
           estimate owner, an engineering manager or an administrator may write
           a line for somebody else. */
        ownerId: estimateApplyOwnerId(workspace.capabilities, workspace.header.ownerId, currentUserId),
        package: workPackage.trim(),
        lines: applyOverrides(lines.map(linePreviewShape), drafts, today),
        estimateRowVersion: workspace.header.rowVersion,
      });
      await onApplied(`${result.lines} activity line(s) added from ${result.reference}`);
      onClose();
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  return <Modal
    title="Labor work package"
    subtitle="Pull a reusable set of activities from the library, adjust people and duration, then add them in one go"
    size="xl"
    onClose={onClose}
    footer={<>
      <button className="btn ghost" type="button" disabled={busy || saving} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button
        className="btn primary"
        type="button"
        disabled={!selected || !summary.canApply || !workPackage.trim() || Boolean(blocker) || busy || saving}
        onClick={() => { void apply(); }}
      ><Icon name="plus" /><LocalizedText text={saving ? "Adding…" : "Add activities"} />{!saving && summary.included ? ` · ${summary.included}` : ""}</button>
      {onManageLibrary ? <><span className="spacer" /><button className="btn ghost sm" type="button" disabled={busy || saving} onClick={onManageLibrary}>
        <Icon name="layers" /><LocalizedText text={"Manage library"} />
      </button></> : null}
    </>}
  >
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    {unavailable ? <EmptyState icon="alertCircle" title="Labor package library is not available on this database" message={unavailable} /> : <>
    {selected ? null : <>
    <div className="row" style={{ gap: 8 }}>
      <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search code, name, activity or level" />
      <label className="select-field">
        <span className="sr-only">{localizeCopy("Cost type")}</span>
        <select value={costType} onChange={(event) => { setCostType(event.target.value as LaborCostType | ""); setPage(1); }} aria-label={localizeCopy("Cost type")}>
          <option value="">{localizeCopy("All cost types")}</option>
          <option value="Engineering">{localizeCopy("Engineering")}</option>
          <option value="Installation">{localizeCopy("Installation & service")}</option>
        </select>
        <Icon name="chevronDown" />
      </label>
    </div>
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading packages…"} /></div>
      : packages.length ? <div className="table-wrap package-list" style={{ maxHeight: 360, marginTop: 10 }}><table>
        <thead><tr>
          <th><LocalizedText text={"Package"} /></th>
          <th style={{ width: 150 }}><LocalizedText text={"Cost type"} /></th>
          <th className="num" style={{ width: 80 }}><LocalizedText text={"Lines"} /></th>
          <th className="num" style={{ width: 90 }}><LocalizedText text={"MD"} /></th>
          <th style={{ width: 90 }} />
        </tr></thead>
        <tbody>{packages.map((item) => <tr key={item.id} className="clickable" onClick={() => { if (!busy && choosing === null) void choose(item); }}>
          <td><div className="cell-primary"><strong>{item.code} · {item.name}</strong><span>{item.description || `${localizeCopy("Revision")} ${item.revision} · ${item.department || localizeCopy("all departments")}`}</span></div></td>
          <td><LocalizedText text={item.costType} /></td>
          <td className="num">{item.lineCount}</td>
          <td className="num">{number(item.referenceManDays)}</td>
          <td><button className="btn default sm" type="button" disabled={busy || choosing !== null} onClick={(event) => { event.stopPropagation(); void choose(item); }}>
            {choosing === item.id ? <span className="spinner" /> : null}<LocalizedText text={"Select"} />
          </button></td>
        </tr>)}</tbody>
      </table></div>
        : <EmptyState icon="layers" title="No published package" message="No labor package is published yet. Build one from an existing work package with Save as labor package." action={onManageLibrary ? <button className="btn default sm" type="button" onClick={onManageLibrary}><Icon name="layers" /><LocalizedText text={"Manage library"} /></button> : undefined} />}
    <Pagination
      page={page}
      pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      from={total ? (page - 1) * PAGE_SIZE + 1 : 0}
      to={Math.min(page * PAGE_SIZE, total)}
      total={total}
      onPage={setPage}
    />
    </>}

    {selected ? <>
      {blocker ? <div className="info-strip red"><Icon name="alertCircle" /><span>{blocker}</span></div> : null}
      <div className="info-strip picker-chosen"><Icon name="package" /><span>
        {selected.code} · {selected.name} <LocalizedText text={"· revision"} /> {selected.revision}
        <LocalizedText text={" · internal rates are read from the rate master when you add them, not from this package"} />
      </span><button className="btn ghost sm" type="button" disabled={busy || saving} onClick={clearSelection}>
        <Icon name="chevronLeft" /><LocalizedText text={"Choose another package"} />
      </button></div>
      <div className="form-grid two" style={{ marginTop: 12 }}>
        <Field label="Work package name in this estimate *">
          <input required maxLength={200} value={workPackage} onChange={(event) => setWorkPackage(event.target.value)} />
        </Field>
        <Field label="Rate date">
          <input value={today} readOnly title={localizeCopy("Internal rates are resolved on the business date the lines are added")} />
        </Field>
      </div>
      <div className="table-wrap" style={{ maxHeight: "44vh", marginTop: 10 }}><table>
        <thead><tr>
          <th style={{ width: 44 }}><LocalizedText text={"Use"} /></th>
          <th><LocalizedText text={"Activity"} /></th>
          <th style={{ width: 150 }}><LocalizedText text={"Level"} /></th>
          <th className="num" style={{ width: 90 }}><LocalizedText text={"Qty"} /></th>
          <th className="num" style={{ width: 110 }}><LocalizedText text={"Duration"} /></th>
          <th className="num" style={{ width: 95 }}><LocalizedText text={"Hours / day"} /></th>
          <th className="num" style={{ width: 130 }}><LocalizedText text={"Rate"} /></th>
          <th style={{ width: 130 }}><LocalizedText text={"ERP"} /></th>
          <th className="num" style={{ width: 140 }}><LocalizedText text={"Line cost"} /></th>
        </tr></thead>
        <tbody>{lines.map((line, index) => {
          const draft = drafts[index];
          const preview = previews[index];
          if (!draft || !preview) return null;
          const supplier = line.provider === "Supplier";
          return <tr key={line.id} className={draft.skip ? "muted-row" : undefined}>
            <td><input
              type="checkbox"
              checked={!draft.skip}
              aria-label={`Include ${line.activity}`}
              onChange={(event) => updateDraft(index, { skip: !event.target.checked })}
            /></td>
            <td><div className="cell-primary">
              <strong>{line.activity}</strong>
              <span>
                {line.department} · <LocalizedText text={supplier ? "Supplier man-hour" : "Own engineer"} />
                {line.rateId && line.rateStillEffective === false ? <> · <LocalizedText text={"the rate this line was written against has been superseded"} /></> : null}
              </span>
              {preview.blocker ? <span className="warn">{preview.blocker}</span> : null}
            </div></td>
            <td>{line.level}</td>
            <td><input
              className="num" type="number" min="0.01" max="10000" step="0.01"
              aria-label={`Engineers for ${line.activity}`}
              value={draft.engineers}
              onChange={(event) => updateDraft(index, { engineers: Number(event.target.value) })}
            /></td>
            <td>
              {draft.hours === null
                ? <input
                    className="num" type="number" min="0.01" max="100000" step="0.01"
                    aria-label={`Man-days for ${line.activity}`}
                    value={draft.manDays}
                    onChange={(event) => updateDraft(index, { manDays: Number(event.target.value) })}
                  />
                : <input
                    className="num" type="number" min="0.01" max="100000" step="0.01"
                    aria-label={`Hours for ${line.activity}`}
                    value={draft.hours}
                    onChange={(event) => updateDraft(index, { hours: Number(event.target.value) })}
                  />}
              <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
                {draft.hours === null
                  ? "MD"
                  : `HR → ${number(preview.manDays)} MD${preview.hoursDiffer ? ` (${number(preview.effectiveHours)} HR)` : ""}`}
              </span>
            </td>
            <td><input
              className="num" type="number" min="0.01" max="24" step="0.01"
              aria-label={`Hours per day for ${line.activity}`}
              value={draft.hoursPerDay}
              onChange={(event) => updateDraft(index, { hoursPerDay: Number(event.target.value) })}
            /></td>
            <td className="num">
              {supplier
                ? <input
                    className="num" type="number" min="0" step="0.0001"
                    aria-label={`Quoted daily rate for ${line.activity}`}
                    value={draft.dailyRate ?? 0}
                    onChange={(event) => updateDraft(index, { dailyRate: Number(event.target.value) })}
                  />
                : <span className="computed">{masterRateFor(line) === null ? <LocalizedText text={"no rate"} /> : money(masterRateFor(line)!)}</span>}
            </td>
            <td><select
              aria-label={`ERP category for ${line.activity}`}
              value={draft.erpCategory ?? ""}
              onChange={(event) => updateDraft(index, { erpCategory: event.target.value || null })}
            >
              <option value="">{localizeCopy("Decide at submit")}</option>
              {ERP_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select></td>
            <td className="num"><strong>{preview.estimatedCost === null ? "—" : money(preview.estimatedCost)}</strong></td>
          </tr>;
        })}</tbody>
      </table></div>
      {lines.some((line) => line.provider === "Supplier") ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>
        <LocalizedText text={"A supplier activity needs its own supplier, quotation number and price date before it can be added. Fill those in on the line, or leave it unticked."} />
      </span></div> : null}
      {summary.blocked ? <div className="info-strip red"><Icon name="alertCircle" /><span>
        {summary.blocked} <LocalizedText text={"activity line(s) cannot be added yet. Fix them, or untick them to leave them out."} />
      </span></div> : null}
      <div className="sticky-foot" style={{ marginTop: 0 }}>
        <div className="foot-item"><span><LocalizedText text={"Activities"} /></span><strong>{summary.included}</strong></div>
        <div className="foot-item"><span><LocalizedText text={"Left out"} /></span><strong>{summary.skipped}</strong></div>
        <div className="foot-item"><span><LocalizedText text={"Man-days"} /></span><strong>{number(summary.manDays)} MD</strong></div>
        <div className="foot-total"><span><LocalizedText text={"Added to estimate"} /></span><strong>{money(summary.estimatedCost)}</strong></div>
      </div>
    </> : null}
    </>}
  </Modal>;
}

/**
 * The other half: a work package that turned out well becomes a library draft.
 *
 * It captures the activities, the levels, the effort and the ERP category the
 * estimator already chose — publishing it stays a master-data act.
 */
export function SaveLaborPackageModal({ estimateId, packageName, costType, lineCount, busy, onClose, onSaved, onOpenSaved }: {
  estimateId: number;
  packageName: string;
  costType: LaborCostType;
  lineCount: number;
  busy: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onOpenSaved: (id: number) => void;
}) {
  const suggested = packageName.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  const [code, setCode] = useState(suggested ? `LP-${suggested}`.slice(0, 40) : "LP-PACKAGE");
  const [name, setName] = useState(packageName);
  const [savedPackage, setSavedPackage] = useState<{ id: number; code: string } | null>(null);
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const localizeCopy = useT();
  const valid = Boolean(code.trim() && name.trim());

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await createLaborPackageFromEstimate({
        estimateId, package: packageName, costType,
        code: code.trim().toUpperCase(), name: name.trim(),
        department: department.trim() || undefined,
        description: description.trim() || undefined,
      });
      setSavedPackage({ id: result.id, code: result.code });
      await onSaved(`Labor package ${result.code} drafted with ${result.lineCount} activity line(s)`);
    } catch (requestError) {
      setError(errorText(requestError));
    } finally {
      setSaving(false);
    }
  };

  if (savedPackage) return <Modal title="Saved to the labor package library" size="sm" onClose={onClose} footer={<>
    <button className="btn ghost" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>
    <button className="btn primary" type="button" onClick={() => onOpenSaved(savedPackage.id)}><Icon name="layers" /><LocalizedText text={"Open the saved package"} /></button>
  </>}>
    <p><strong>{savedPackage.code}</strong> <LocalizedText text={"is saved as a draft in the labor package library."} /></p>
    <p className="muted"><LocalizedText text={"Find it under Estimating library → Labor Packages. A draft cannot be pulled into an estimate until somebody publishes it as Active."} /></p>
    {error ? <div className="info-strip amber" role="alert"><Icon name="alertTriangle" /><span>
      <LocalizedText text={"Saved, but the screen behind could not be refreshed:"} /> {error}
    </span></div> : null}
  </Modal>;

  return <Modal
    title="Save as labor package"
    subtitle={`${packageName} · ${lineCount} ${localizeCopy("activity lines")}`}
    size="sm"
    onClose={onClose}
    footer={<>
      <button className="btn ghost" type="button" disabled={busy || saving} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={!valid || busy || saving} onClick={() => { void save(); }}>
        <Icon name="layers" /><LocalizedText text={saving ? "Saving…" : "Save to library"} />
      </button>
    </>}
  >
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}
    <div className="form-grid two">
      <Field label="Package code *"><input required maxLength={40} value={code} onChange={(event) => setCode(event.target.value)} placeholder={localizeCopy("e.g. LP-COMMISSIONING")} /></Field>
      <Field label="Package name *"><input required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Department"><input maxLength={100} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder={localizeCopy("Leave blank for every department")} /></Field>
      <Field label="Cost type"><input value={costType} readOnly /></Field>
    </div>
    <Field label="Description">
      <textarea rows={3} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={localizeCopy("What kind of job is this package for, and what should someone know before pulling it in?")} />
    </Field>
    <div className="info-strip" style={{ marginTop: 10 }}><Icon name="alertCircle" /><span>
      <LocalizedText text={"Rates are stored as a reference with the rate master row they came from. Applying the package re-reads the live rate, so an old rate card can never be copied into a new estimate. The package is saved as a draft; publishing it needs master data access."} />
    </span></div>
  </Modal>;
}
