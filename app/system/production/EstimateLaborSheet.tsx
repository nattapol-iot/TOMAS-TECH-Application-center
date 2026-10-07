"use client";

import { useEffect, useRef, useState } from "react";
import {
  apiRequest,
  type BootstrapData,
  type EstimateCostWorkspace,
  type EstimateEffortInput,
  type EstimateExpenseLine,
  type EstimateManhourInput,
  type EstimateManhourLine,
  type PagedResult,
} from "../api-client";
import { currentLocale, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Icon, Modal, Panel } from "../ui";
import { EstimateEffortCells } from "./EstimateEffortCells";
import { EstimateModuleEditor } from "./EstimateModuleEditor";
import { ApplyLaborPackageModal, SaveLaborPackageModal } from "./LaborPackagePicker";
import { LaborPackageMaster } from "./LaborPackageMaster";
import { ESTIMATE_DISCIPLINES, costTypeOfDiscipline, ratesForDiscipline, type EstimateDiscipline } from "../../../lib/estimate-disciplines";
import { estimateBusinessDate, estimateUxCopy } from "../../../lib/estimate-ux";

/*
 * The labor sheet, one section per discipline: Electrical, Mechanical, Software and
 * Installation & service. Each section holds its own man-hour, grouped by work package,
 * and its own travel, hotel and per diem, so a discipline's cost is read in one place
 * instead of being assembled from a cost-type filter and typed package names.
 * Lines written before disciplines existed, that no rule could place, sit in their own
 * section until someone picks theirs.
 */

export type LaborSeed = Partial<Pick<EstimateManhourInput, "package" | "costType" | "provider" | "discipline">>;
export type LaborExpenseSeed = { package?: string; costType?: EstimateManhourInput["costType"]; discipline?: EstimateDiscipline };

export type EngineeringRateOption = {
  id: number;
  level: string;
  department: string;
  engineeringDaily: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
};

type SectionKey = EstimateDiscipline | "unassigned";
type QuickDraft = {
  version: number; section: EstimateDiscipline; package: string; activity: string;
  department: string; level: string; engineers: number; manDays: number; hoursPerDay: number; ownerId: number; remark: string;
};

const BUSINESS_TIME_ZONE = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok";
const numberOf = (value: number | string | null | undefined) => Number(value ?? 0);
const formatMoney = (value: number | string | null | undefined) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(numberOf(value));
const formatNumber = (value: number | string | null | undefined) => numberOf(value).toLocaleString(currentLocale(), { maximumFractionDigits: 2 });
const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
const canOwnEstimate = (role: string) => ["Engineer", "Engineering Manager", "Admin"].includes(role);

/** The discipline's name in the reader's language. */
export function disciplineLabel(discipline: SectionKey): string {
  switch (discipline) {
    case "Electrical": return copy("ไฟฟ้า", "Electrical", "電気");
    case "Mechanical": return copy("เครื่องกล", "Mechanical", "機械");
    case "Software": return copy("ซอฟต์แวร์", "Software", "ソフトウェア");
    case "Installation": return copy("ติดตั้งและบริการ", "Installation & service", "据付・サービス");
    default: return copy("ยังไม่ระบุสาขา", "Discipline not chosen", "分野未選択");
  }
}

const DISCIPLINE_ICON: Record<SectionKey, "grid" | "settings" | "cpu" | "truck" | "alertTriangle"> = {
  Electrical: "grid", Mechanical: "settings", Software: "cpu", Installation: "truck", unassigned: "alertTriangle",
};

/** A work package to start a discipline with, until someone names their own. */
export function defaultWorkPackage(discipline: EstimateDiscipline): string {
  return discipline === "Installation" ? "Site installation" : `${discipline} engineering`;
}

/**
 * Rates the estimator may choose today. The options endpoint needs only estimate.write;
 * whether amounts are shown stays with master.read, as before.
 */
export function useEngineeringRateOptions(enabled: boolean): { rates: EngineeringRateOption[]; loading: boolean; error: string } {
  const [state, setState] = useState<{ rates: EngineeringRateOption[]; loading: boolean; error: string }>({ rates: [], loading: enabled, error: "" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const first = await apiRequest<PagedResult<EngineeringRateOption>>("/api/v1/estimates/engineering-rate-options?page=1&pageSize=100");
        const pageCount = Math.ceil(first.total / Math.max(first.pageSize, 1));
        const rest = pageCount > 1
          ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => apiRequest<PagedResult<EngineeringRateOption>>(`/api/v1/estimates/engineering-rate-options?page=${index + 2}&pageSize=100`)))
          : [];
        if (cancelled) return;
        const today = estimateBusinessDate(new Date(), BUSINESS_TIME_ZONE);
        const rates = [first, ...rest].flatMap((page) => page.items)
          .filter((rate) => rate.isActive && rate.effectiveFrom <= today && (!rate.effectiveTo || rate.effectiveTo >= today));
        setState({ rates, loading: false, error: "" });
      } catch (requestError) {
        if (!cancelled) setState({ rates: [], loading: false, error: requestError instanceof Error ? requestError.message : String(requestError) });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}

/** Rates a discipline's line can use: its own department first, with a positive daily rate for its cost type. */
export function disciplineRates(rates: readonly EngineeringRateOption[], discipline: EstimateDiscipline): EngineeringRateOption[] {
  const costType = costTypeOfDiscipline(discipline);
  return ratesForDiscipline(rates.filter((rate) => (costType === "Installation" ? rate.installationDaily : rate.engineeringDaily) > 0), discipline);
}

export function EstimateLaborTab({ bootstrap, workspace, busy, onNewPackage, onAddManhour, onQuickAddManhour, onEditManhour, onRemoveManhour, onAddExpense, onEditExpense, onRemoveExpense, onLaborLibraryChanged, onSaveEffort }: {
  bootstrap: BootstrapData;
  workspace: EstimateCostWorkspace;
  busy: boolean;
  onNewPackage: (discipline: EstimateDiscipline) => void;
  onAddManhour: (seed: LaborSeed) => void;
  onQuickAddManhour: (input: EstimateManhourInput) => Promise<boolean>;
  onEditManhour: (line: EstimateManhourLine) => void;
  onRemoveManhour: (line: EstimateManhourLine) => void;
  onAddExpense: (seed: LaborExpenseSeed) => void;
  onEditExpense: (line: EstimateExpenseLine) => void;
  onRemoveExpense: (line: EstimateExpenseLine) => void;
  onLaborLibraryChanged: (message: string) => Promise<void>;
  onSaveEffort: (line: EstimateManhourLine, effort: EstimateEffortInput, rowVersion: string) => Promise<boolean>;
}) {
  const t = useT();
  const canAddManhour = workspace.capabilities.canEditManhour;
  const canAddExpense = workspace.capabilities.canEditExpenses;
  const canSeeRates = bootstrap.permissions.includes("master.read");
  const { rates } = useEngineeringRateOptions(canAddManhour);
  const [filter, setFilter] = useState<SectionKey | "all">("all");
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [columnsReady, setColumnsReady] = useState(false);
  const columnsKey = "estimate-manhour-columns";
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { setShowAllColumns(window.localStorage.getItem(columnsKey) === "true"); } catch { /* site data blocked: start collapsed */ }
      setColumnsReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!columnsReady) return;
    try { window.localStorage.setItem(columnsKey, String(showAllColumns)); } catch { /* nothing to remember it with */ }
  }, [showAllColumns, columnsReady]);
  const columnCount = showAllColumns ? 16 : 12;

  const [moduleEditor, setModuleEditor] = useState<{ key: string; title: string } | null>(null);
  const [quickDraft, setQuickDraft] = useState<QuickDraft | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [libraryFor, setLibraryFor] = useState<EstimateDiscipline | null>(null);
  const [laborMasterOpen, setLaborMasterOpen] = useState(false);
  const [laborMasterFromLibrary, setLaborMasterFromLibrary] = useState<EstimateDiscipline | null>(null);
  const [savedLaborPackageId, setSavedLaborPackageId] = useState<number | undefined>();
  const [laborSaveTarget, setLaborSaveTarget] = useState<{ name: string; costType: EstimateManhourInput["costType"]; lineCount: number } | null>(null);
  const closeLaborMaster = () => { setLaborMasterOpen(false); setLaborMasterFromLibrary(null); };
  const quickActivityRef = useRef<HTMLInputElement>(null);
  const quickDraftVersion = quickDraft?.version;
  useEffect(() => { if (quickDraftVersion !== undefined) quickActivityRef.current?.focus(); }, [quickDraftVersion]);

  const owners = bootstrap.team.filter((member) => canOwnEstimate(member.role));
  const defaultOwnerId = !workspace.capabilities.canEditAllSections ? bootstrap.user.id
    : owners.find((owner) => owner.id === workspace.header.ownerId)?.id ?? owners.find((owner) => owner.id === bootstrap.user.id)?.id ?? owners[0]?.id ?? 0;
  const teamDepartments = [...new Set(bootstrap.team.map((member) => member.department.trim()).filter(Boolean))].sort();
  const teamLevels = [...new Set(bootstrap.team.map((member) => member.level.trim()).filter(Boolean))].sort();

  const sectionOf = (line: { discipline: EstimateDiscipline | null }): SectionKey => line.discipline ?? "unassigned";
  const sections: SectionKey[] = [...ESTIMATE_DISCIPLINES,
    ...(workspace.manhourLines.some((line) => !line.discipline) || workspace.expenseLines.some((line) => !line.discipline) ? ["unassigned" as const] : [])];
  const summary = (section: SectionKey) => {
    const manhours = workspace.manhourLines.filter((line) => sectionOf(line) === section);
    const expenses = workspace.expenseLines.filter((line) => sectionOf(line) === section);
    const labor = manhours.reduce((sum, line) => sum + numberOf(line.lineCost), 0);
    const site = expenses.reduce((sum, line) => sum + numberOf(line.lineTotal), 0);
    return { manhours, expenses, labor, site, total: labor + site, manDays: manhours.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0) };
  };
  const visibleSections = filter === "all" ? sections : sections.filter((section) => section === filter);
  const totalOf = (key: "labor" | "site" | "total" | "manDays") => visibleSections.reduce((sum, section) => sum + summary(section)[key], 0);

  const startQuickRow = (section: EstimateDiscipline, packageName?: string) => {
    const lines = workspace.manhourLines.filter((line) => line.discipline === section);
    const reference = lines.find((line) => line.provider === "Internal" && (!packageName || line.package === packageName));
    const options = disciplineRates(rates, section);
    const rate = options.find((option) => option.department === reference?.department && option.level === reference?.level) ?? options[0];
    setQuickDraft({
      version: (quickDraft?.version ?? 0) + 1,
      section,
      package: packageName ?? lines[0]?.package ?? defaultWorkPackage(section),
      activity: "",
      department: rate?.department ?? reference?.department ?? bootstrap.user.department ?? teamDepartments[0] ?? "",
      level: rate?.level ?? reference?.level ?? teamLevels[0] ?? "",
      engineers: 1, manDays: 1, hoursPerDay: 8, ownerId: defaultOwnerId, remark: "",
    });
  };
  const updateQuick = <K extends keyof QuickDraft>(key: K, value: QuickDraft[K]) => setQuickDraft((current) => current ? { ...current, [key]: value } : current);
  const quickValid = Boolean(quickDraft && quickDraft.activity.trim() && quickDraft.department.trim() && quickDraft.level.trim()
    && quickDraft.engineers > 0 && quickDraft.manDays > 0 && quickDraft.hoursPerDay > 0 && quickDraft.ownerId);
  const saveQuickRow = async () => {
    if (!quickDraft || !quickValid || busy || quickSaving) return;
    setQuickSaving(true);
    const saved = await onQuickAddManhour({
      estimateRowVersion: workspace.header.rowVersion, package: quickDraft.package, activity: quickDraft.activity.trim(),
      department: quickDraft.department, level: quickDraft.level, costType: costTypeOfDiscipline(quickDraft.section), discipline: quickDraft.section,
      provider: "Internal", engineers: quickDraft.engineers, manDays: quickDraft.manDays, hoursPerDay: quickDraft.hoursPerDay,
      dailyRate: 0, ownerId: quickDraft.ownerId, remark: quickDraft.remark,
    });
    setQuickSaving(false);
    if (saved) setQuickDraft({ ...quickDraft, version: quickDraft.version + 1, activity: "", remark: "" });
  };

  const manhourRow = (line: EstimateManhourLine, index: number) => <tr className="mh-row" key={`manhour-${line.id}`}>
    <td><span className="cell-text muted">{index + 1}</span></td>
    <td><span className="cell-text"><Badge tone={line.provider === "Supplier" ? "violet" : "slate"}>{line.provider === "Supplier" ? "Supplier MH" : t("Own engineer")}</Badge></span></td>
    <td><span className="cell-text"><strong>{line.activity}</strong>{!showAllColumns && line.provider === "Supplier" && line.supplierName ? <small className="cell-sub">{line.supplierName}</small> : null}</span></td>
    <td><span className="cell-text">{line.department}<small className="cell-sub">{line.level}</small></span></td>
    <EstimateEffortCells line={line} busy={busy || quickSaving} money={formatMoney} number={formatNumber} onSave={(effort, rowVersion) => onSaveEffort(line, effort, rowVersion)} />
    {showAllColumns ? <><td><span className="cell-text">{line.supplierName ?? "TOMAS TECH"}</span></td><td><span className="cell-text">{line.quotationNumber || "—"}</span></td><td><span className="cell-text">{line.ownerName}</span></td><td><span className="cell-text">{line.remark || "—"}</span></td></> : null}
    <td><div className="row-actions">{line.canEdit ? <><button className="row-action" type="button" disabled={busy} onClick={() => onEditManhour(line)} aria-label={`${t("Edit")} ${line.activity}`}><Icon name="edit" /></button><button className="row-action" type="button" disabled={busy} onClick={() => onRemoveManhour(line)} aria-label={`${t("Remove")} ${line.activity}`}><Icon name="trash" /></button></> : <Icon name="lock" />}</div></td>
  </tr>;
  const expenseRow = (line: EstimateExpenseLine, index: number) => <tr key={`expense-${line.id}`} className="expense-row mh-row">
    <td><span className="cell-text muted">{index + 1}</span></td>
    <td><span className="cell-text"><Badge tone="amber">{t(line.expenseType)}</Badge></span></td>
    <td><span className="cell-text"><strong>{line.description}</strong>{!showAllColumns && line.supplierName ? <small className="cell-sub">{line.supplierName}</small> : null}</span></td>
    <td><span className="cell-text muted">{line.package}</span></td>
    <td><span className="cell-text num">{formatNumber(line.quantity)}</span></td><td><span className="cell-text">{line.unit}</span></td>
    <td><span className="cell-text muted">—</span></td><td><span className="cell-text muted">—</span></td>
    <td className="computed">{formatMoney(line.unitCost)}</td><td><span className="cell-text muted">—</span></td>
    <td className="computed"><strong>{formatMoney(line.lineTotal)}</strong></td>
    {showAllColumns ? <><td><span className="cell-text">{line.supplierName ?? "—"}</span></td><td><span className="cell-text">{line.referenceNumber || "—"}</span></td><td><span className="cell-text">{line.ownerName}</span></td><td><span className="cell-text">{line.remark || "—"}</span></td></> : null}
    <td><div className="row-actions">{line.canEdit ? <><button className="row-action" type="button" disabled={busy} onClick={() => onEditExpense(line)} aria-label={`${t("Edit")} ${line.description}`}><Icon name="edit" /></button><button className="row-action" type="button" disabled={busy} onClick={() => onRemoveExpense(line)} aria-label={`${t("Remove")} ${line.description}`}><Icon name="trash" /></button></> : <Icon name="lock" />}</div></td>
  </tr>;
  const quickRow = (draft: QuickDraft) => {
    const options = disciplineRates(rates, draft.section);
    const chosen = options.find((option) => option.department === draft.department && option.level === draft.level);
    return <tr className="inline-draft-row mh-row" key={`quick-${draft.section}-${draft.package}-${draft.version}`} title={t("Enter: save and create the next row · Esc: cancel")} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setQuickDraft(null); }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void saveQuickRow(); }
    }}>
      <td><span className="cell-text quick-new"><LocalizedText text={"New"} /></span></td>
      <td><span className="cell-text"><Badge tone="slate"><LocalizedText text={"Own engineer"} /></Badge></span></td>
      <td><input ref={quickActivityRef} required aria-label={t("New activity")} maxLength={300} placeholder={t("Activity *")} value={draft.activity} onChange={(event) => updateQuick("activity", event.target.value)} /></td>
      <td>{options.length ? <select aria-label={t("Department & level")} value={chosen?.id ?? ""} onChange={(event) => { const rate = options.find((option) => option.id === Number(event.target.value)); if (rate) setQuickDraft((current) => current ? { ...current, department: rate.department, level: rate.level } : current); }}>
          {chosen ? null : <option value="">{copy("เลือกแผนกและระดับ", "Choose department and level", "部門とレベルを選択")}</option>}
          {options.map((rate) => <option key={rate.id} value={rate.id}>{rate.department} — {rate.level}{canSeeRates ? ` · ${formatMoney(draft.section === "Installation" ? rate.installationDaily : rate.engineeringDaily)}` : ""}</option>)}
        </select>
        : <div className="cell-stack"><select aria-label={t("Department")} value={draft.department} onChange={(event) => updateQuick("department", event.target.value)}>{teamDepartments.map((department) => <option key={department}>{department}</option>)}</select><select aria-label={t("Engineer level")} value={draft.level} onChange={(event) => updateQuick("level", event.target.value)}>{teamLevels.map((level) => <option key={level}>{level}</option>)}</select></div>}</td>
      <td><input className="num" aria-label={t("Engineer quantity")} type="number" min="0.01" max="10000" step="0.01" value={draft.engineers} onChange={(event) => updateQuick("engineers", Number(event.target.value))} /></td>
      <td><span className="cell-text"><LocalizedText text={"Engineer"} /></span></td>
      <td><input className="num" aria-label={t("Man-days")} type="number" min="0.01" max="100000" step="0.01" value={draft.manDays} onChange={(event) => updateQuick("manDays", Number(event.target.value))} /></td>
      <td><input className="num" aria-label={t("Hours per day")} type="number" min="0.01" max="24" step="0.01" value={draft.hoursPerDay} onChange={(event) => updateQuick("hoursPerDay", Number(event.target.value))} /></td>
      <td className="computed"><span className="muted"><LocalizedText text={"Rate master"} /></span></td>
      <td className="computed">{formatNumber(draft.engineers * draft.manDays * draft.hoursPerDay)} <LocalizedText text={"HR"} /></td>
      <td className="computed"><span className="muted"><LocalizedText text={"On save"} /></span></td>
      {showAllColumns ? <><td><span className="cell-text">TOMAS TECH</span></td><td><span className="cell-text muted">—</span></td>
        <td><select aria-label={t("Activity owner")} value={draft.ownerId} onChange={(event) => updateQuick("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></td>
        <td><input aria-label={t("Activity remark")} maxLength={20000} placeholder={t("Remark")} value={draft.remark} onChange={(event) => updateQuick("remark", event.target.value)} /></td></> : null}
      <td><div className="row-actions"><button className="row-action save" type="button" disabled={!quickValid || busy || quickSaving} onClick={() => { void saveQuickRow(); }} aria-label={t("Save activity")}><Icon name="check" /></button><button className="row-action" type="button" disabled={busy || quickSaving} onClick={() => setQuickDraft(null)} aria-label={t("Cancel new activity")}><Icon name="x" /></button></div></td>
    </tr>;
  };

  const sectionRows = (section: SectionKey) => {
    const { manhours, expenses, labor, site, total, manDays } = summary(section);
    const discipline = section === "unassigned" ? null : section;
    const packages = [...new Set(manhours.map((line) => line.package))];
    const draftHere = quickDraft && discipline && quickDraft.section === discipline ? quickDraft : null;
    // A draft for a work package that has no saved line yet still needs its band.
    if (draftHere && !packages.includes(draftHere.package)) packages.push(draftHere.package);
    const rows = [
      <tr className="module-row labor-discipline-row" key={`discipline-${section}`}><td colSpan={columnCount}><div className="row band">
        <span className="module-bullet"><Icon name={DISCIPLINE_ICON[section]} /></span>
        <strong>{disciplineLabel(section)}</strong>
        {section === "unassigned" ? <Badge tone="amber">{copy("แก้แต่ละบรรทัดเพื่อเลือกสาขา", "Edit each line to choose its discipline", "各行を編集して分野を選択")}</Badge> : null}
        <span className="muted">{formatNumber(manDays)} <LocalizedText text={"MD"} /> · {copy("ค่าแรง", "Labor", "労務費")} {formatMoney(labor)} · {copy("ค่าเดินทาง/ที่พัก", "Travel & stay", "旅費・宿泊")} {formatMoney(site)}</span>
        <strong className="num">{formatMoney(total)}</strong>
        {discipline && canAddManhour ? <>
          <button type="button" className="group-action" disabled={busy || quickSaving} onClick={() => startQuickRow(discipline)}><Icon name="plus" />{copy("เพิ่มงาน", "Add activity", "作業を追加")}</button>
          <button type="button" className="group-action" disabled={busy} onClick={() => setLibraryFor(discipline)}><Icon name="package" /><LocalizedText text={"Add from library"} /></button>
          <button type="button" className="group-action" disabled={busy} onClick={() => onAddManhour({ package: packages[0] ?? defaultWorkPackage(discipline), discipline, costType: costTypeOfDiscipline(discipline), provider: "Supplier" })}><Icon name="quote" /><LocalizedText text={"Supplier man-hour"} /></button>
          <button type="button" className="group-action" disabled={busy} onClick={() => onNewPackage(discipline)}><Icon name="layers" /><LocalizedText text={"New Work Package"} /></button>
        </> : null}
      </div></td></tr>,
    ];
    for (const packageName of packages) {
      const lines = manhours.filter((line) => line.package === packageName);
      const costType = lines[0]?.costType ?? (discipline ? costTypeOfDiscipline(discipline) : "Engineering");
      const packageTotal = lines.reduce((sum, line) => sum + numberOf(line.lineCost), 0);
      rows.push(<tr className="labor-package-row" key={`package-${section}-${packageName}`}><td colSpan={columnCount}><div className="row band">
        {lines.length && lines.every((line) => line.canEdit) ? <button type="button" className="module-name-edit" disabled={busy || quickSaving} title={t("แก้ชื่อ Main Module / Rename Main Module")} onClick={() => setModuleEditor({ key: "package:" + costType + ":" + packageName, title: packageName })}><strong>{packageName}</strong><Icon name="edit" /></button> : <strong>{packageName}</strong>}
        <span className="muted">{formatNumber(lines.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0))} <LocalizedText text={"MD"} /></span>
        {lines.some((line) => line.disciplineInferred) ? <Badge tone="slate">{copy("สาขาเดาจากชื่อ Work Package", "Discipline read from the package name", "パッケージ名から分野を推定")}</Badge> : null}
        <strong className="num">{formatMoney(packageTotal)}</strong>
        {discipline && canAddManhour ? <button type="button" className="group-action" disabled={busy || quickSaving} onClick={() => startQuickRow(discipline, packageName)}><Icon name="plus" /><LocalizedText text={"Add activity"} /></button> : null}
        {canAddManhour && lines.length ? <button type="button" className="group-action" disabled={busy} onClick={() => setLaborSaveTarget({ name: packageName, costType, lineCount: lines.length })}><Icon name="package" /><LocalizedText text={"Save as labor package"} /></button> : null}
      </div></td></tr>);
      rows.push(...lines.map(manhourRow));
      if (draftHere && draftHere.package === packageName) rows.push(quickRow(draftHere));
    }
    if (!manhours.length && !draftHere) rows.push(<tr className="add-row" key={`empty-${section}`}><td colSpan={columnCount}>
      {discipline && canAddManhour
        ? <button type="button" className="add-row-btn" disabled={busy} onClick={() => startQuickRow(discipline)}><span><Icon name="plus" />{copy(`ยังไม่มีค่าแรง${disciplineLabel(discipline)} · กดเพื่อเพิ่มงาน`, `No ${disciplineLabel(discipline)} labor yet · add an activity`, `${disciplineLabel(discipline)}の工数はまだありません · 作業を追加`)}</span></button>
        : <span className="cell-text muted">{copy("ยังไม่มีค่าแรง", "No labor yet", "工数はまだありません")}</span>}
    </td></tr>);
    if (expenses.length || (discipline && canAddExpense)) {
      rows.push(<tr className="labor-package-row labor-expense-row" key={`site-${section}`}><td colSpan={columnCount}><div className="row band">
        <Icon name="truck" /><strong>{copy(`ค่าเดินทาง ที่พัก เบี้ยเลี้ยง · ${disciplineLabel(section)}`, `Travel, hotel and per diem · ${disciplineLabel(section)}`, `旅費・宿泊・日当 · ${disciplineLabel(section)}`)}</strong>
        <strong className="num">{formatMoney(site)}</strong>
      </div></td></tr>);
      rows.push(...expenses.map(expenseRow));
      if (discipline && canAddExpense) rows.push(<tr className="add-row" key={`add-expense-${section}`}><td colSpan={columnCount}><button type="button" className="add-row-btn expense" disabled={busy} onClick={() => onAddExpense({ discipline, costType: costTypeOfDiscipline(discipline), package: packages[0] ?? defaultWorkPackage(discipline) })}><span><Icon name="truck" />{copy(`เพิ่มค่าเดินทาง ที่พัก หรือเบี้ยเลี้ยงของ${disciplineLabel(discipline)}`, `Add travel, hotel or per diem for ${disciplineLabel(discipline)}`, `${disciplineLabel(discipline)}の旅費・宿泊・日当を追加`)}</span></button></td></tr>);
    }
    rows.push(<tr className="subtotal-row labor-package-subtotal" key={`subtotal-${section}`}><td colSpan={10} className="labor-subtotal-label">{copy("รวม", "Total", "合計")} {disciplineLabel(section)}</td><td className="num"><strong>{formatMoney(total)}</strong></td><td colSpan={columnCount - 11} /></tr>);
    rows.push(<tr className="labor-package-gap" key={`gap-${section}`} aria-hidden="true"><td colSpan={columnCount} /></tr>);
    return rows;
  };

  return <Panel
    title={copy("ค่าแรงและค่าใช้จ่ายหน้างาน แยกตามสาขา", "Labor and site expense by discipline", "分野別の工数・現場費用")}
    subtitle={copy("ไฟฟ้า · เครื่องกล · ซอฟต์แวร์ · ติดตั้งและบริการ — แต่ละสาขามีค่าแรงและค่าเดินทางของตัวเอง", "Electrical · Mechanical · Software · Installation & service — each with its own labor and travel", "電気・機械・ソフトウェア・据付 — 分野ごとに工数と旅費")}
    flush
  >
    {moduleEditor ? <EstimateModuleEditor workspace={workspace} moduleKey={moduleEditor.key} initialTitle={moduleEditor.title} onClose={() => setModuleEditor(null)} onSaved={() => onLaborLibraryChanged("Work package updated")} /> : null}
    <div className="info-strip"><LocalizedText text={canAddManhour ? "แก้ Qty / Man-days / Hours ได้ในช่อง · Enter หรือ ✓ เพื่อบันทึก · เพิ่มแถวแล้วกด Enter เพื่อเพิ่มต่อเนื่อง" : "Revision นี้ไม่เปิดให้แก้ไขค่าแรงในสถานะปัจจุบัน หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข"} /></div>
    <div className="subtabs" role="tablist" aria-label={copy("สาขา", "Discipline", "分野")}>
      <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? "subtab active" : "subtab"} onClick={() => setFilter("all")}><LocalizedText text={"All work"} /><em>{formatMoney(sections.reduce((sum, section) => sum + summary(section).total, 0))}</em></button>
      {sections.map((section) => <button key={section} type="button" role="tab" aria-selected={filter === section} className={filter === section ? "subtab active" : "subtab"} onClick={() => setFilter(section)}><Icon name={DISCIPLINE_ICON[section]} />{disciplineLabel(section)}<em>{formatMoney(summary(section).total)}</em></button>)}
      <span className="spacer" /><button type="button" className="btn ghost sm" aria-pressed={showAllColumns} onClick={() => setShowAllColumns((current) => !current)}><Icon name="table" /><LocalizedText text={showAllColumns ? "Fewer columns" : "More columns"} /></button>
    </div>
    <div className="table-wrap tall">
      <table className="sheet manhour-sheet" style={{ minWidth: showAllColumns ? 2110 : 1440 }}>
        <thead><tr><th style={{ width: 44 }}><LocalizedText text={"No."} /></th><th style={{ width: 130 }}><LocalizedText text={"Type"} /></th><th style={{ width: 250 }}><LocalizedText text={"Activity / Description"} /></th><th style={{ width: 190 }}><LocalizedText text={"Department & level"} /></th><th className="num" style={{ width: 80 }}><LocalizedText text={"Qty"} /></th><th style={{ width: 110 }}><LocalizedText text={"Unit"} /></th><th className="num" style={{ width: 90 }}><LocalizedText text={"Man-days"} /></th><th className="num" style={{ width: 160 }}><LocalizedText text={"Hours / Day"} /></th><th className="num" style={{ width: 120 }}><LocalizedText text={"Rate"} /></th><th className="num" style={{ width: 100 }}><LocalizedText text={"Man-hours"} /></th><th className="num" style={{ width: 130 }}><LocalizedText text={"Cost"} /></th>{showAllColumns ? <th style={{ width: 190 }}><LocalizedText text={"Supplier"} /></th> : null}{showAllColumns ? <th style={{ width: 150 }}><LocalizedText text={"Quotation No."} /></th> : null}{showAllColumns ? <th style={{ width: 150 }}><LocalizedText text={"Owner"} /></th> : null}{showAllColumns ? <th style={{ width: 180 }}><LocalizedText text={"Remark"} /></th> : null}<th style={{ width: 72 }} aria-label={t("Action")} /></tr></thead>
        <tbody>{visibleSections.flatMap(sectionRows)}</tbody>
      </table>
      {!workspace.manhourLines.length && !workspace.expenseLines.length && !canAddManhour ? <EmptyState icon="layers" title="No work package yet" message={copy("ยังไม่มีค่าแรงหรือค่าเดินทางใน revision นี้", "This revision has no labor or travel yet.", "この版には工数・旅費がまだありません。")} /> : null}
    </div>
    {libraryFor ? <ApplyLaborPackageModal workspace={workspace} currentUserId={bootstrap.user.id} busy={busy} discipline={libraryFor} onClose={() => setLibraryFor(null)} onApplied={onLaborLibraryChanged} onManageLibrary={() => { setLaborMasterFromLibrary(libraryFor); setLibraryFor(null); setSavedLaborPackageId(undefined); setLaborMasterOpen(true); }} /> : null}
    {laborSaveTarget ? <SaveLaborPackageModal estimateId={workspace.header.id} packageName={laborSaveTarget.name} costType={laborSaveTarget.costType} lineCount={laborSaveTarget.lineCount} busy={busy} onClose={() => setLaborSaveTarget(null)} onSaved={onLaborLibraryChanged} onOpenSaved={(id) => { setLaborSaveTarget(null); setSavedLaborPackageId(id); setLaborMasterFromLibrary(null); setLaborMasterOpen(true); }} /> : null}
    {laborMasterOpen ? <Modal title="Labor Package Master" size="xl" onClose={closeLaborMaster}><LaborPackageMaster bootstrap={bootstrap} initialPackageId={savedLaborPackageId} onClose={closeLaborMaster} onBack={laborMasterFromLibrary ? () => { const back = laborMasterFromLibrary; closeLaborMaster(); setLibraryFor(back); } : undefined} /></Modal> : null}
    <div className="sticky-foot">
      {ESTIMATE_DISCIPLINES.map((discipline) => <div className="foot-item" key={discipline}><span>{disciplineLabel(discipline)}</span><strong>{formatMoney(summary(discipline).total)}</strong></div>)}
      <div className="foot-item"><span><LocalizedText text={"Travel / hotel / per diem"} /></span><strong>{formatMoney(totalOf("site"))}</strong></div>
      <div className="foot-item"><span><LocalizedText text={"Man-days"} /></span><strong>{formatNumber(totalOf("manDays"))} <LocalizedText text={"MD"} /></strong></div>
      <div className="foot-total"><span><LocalizedText text={filter === "all" ? "Shown" : "subtotal"} /></span><strong>{formatMoney(totalOf("total"))}</strong></div>
    </div>
  </Panel>;
}
