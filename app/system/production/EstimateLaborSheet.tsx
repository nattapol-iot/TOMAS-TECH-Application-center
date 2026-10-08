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
  // Activity, cost type, provider, level, people, days, hours, man-days, cost, actions — plus rate, man-hours, owner and remark.
  const extraColumns = showAllColumns ? 4 : 0;
  const columnCount = 10 + extraColumns;

  const [moduleEditor, setModuleEditor] = useState<{ key: string; title: string } | null>(null);
  const [quickDraft, setQuickDraft] = useState<QuickDraft | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [libraryFor, setLibraryFor] = useState<EstimateDiscipline | null>(null);
  const [laborMasterOpen, setLaborMasterOpen] = useState(false);
  const [laborMasterFromLibrary, setLaborMasterFromLibrary] = useState<EstimateDiscipline | null>(null);
  const [savedLaborPackageId, setSavedLaborPackageId] = useState<number | undefined>();
  const [laborSaveTarget, setLaborSaveTarget] = useState<{ name: string; costType: EstimateManhourInput["costType"]; lineCount: number } | null>(null);
  /* One discipline is open at a time; the others show their totals on one line. "none" folds them all. */
  const [openState, setOpenState] = useState<SectionKey | "none" | null>(null);
  const [rowActions, setRowActions] = useState<string | null>(null);
  const [packageActions, setPackageActions] = useState<string | null>(null);
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
  const defaultOpen = sections.find((section) => summary(section).manhours.length || summary(section).expenses.length) ?? sections[0];
  const open: SectionKey | null = openState === "none" ? null : openState && sections.includes(openState) ? openState : defaultOpen;
  // The bar's buttons act on the open discipline.
  const target: EstimateDiscipline | null = open && open !== "unassigned" ? open : null;
  const totals = sections.map(summary).reduce((sum, section) => ({ labor: sum.labor + section.labor, site: sum.site + section.site, manDays: sum.manDays + section.manDays }), { labor: 0, site: 0, manDays: 0 });

  const startQuickRow = (section: EstimateDiscipline, packageName?: string) => {
    const lines = workspace.manhourLines.filter((line) => line.discipline === section);
    const reference = lines.find((line) => line.provider === "Internal" && (!packageName || line.package === packageName));
    const options = disciplineRates(rates, section);
    const rate = options.find((option) => option.department === reference?.department && option.level === reference?.level) ?? options[0];
    setOpenState(section);
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

  /* Edit and delete sit behind one ⋯ per line. A lock marks a line someone else's section owns. */
  const lineActions = (key: string, canEdit: boolean, editable: boolean, label: string, onEdit: () => void, onRemove: () => void) => !canEdit
    ? (editable ? <Icon name="lock" /> : null)
    : rowActions === key
      ? <span className="row-actions"><button className="icon-btn" type="button" disabled={busy} onClick={() => { setRowActions(null); onEdit(); }} aria-label={`${t("Edit")} ${label}`}><Icon name="edit" /></button><button className="icon-btn danger" type="button" disabled={busy} onClick={() => { setRowActions(null); onRemove(); }} aria-label={`${t("Remove")} ${label}`}><Icon name="trash" /></button><button className="icon-btn" type="button" aria-label={copy("ปิดตัวเลือก", "Close actions", "操作を閉じる")} onClick={() => setRowActions(null)}><Icon name="x" /></button></span>
      : <button className="icon-btn" type="button" disabled={busy} title={copy("แก้ไข · ลบ", "Edit · delete", "編集・削除")} aria-label={`${copy("ตัวเลือก", "Actions", "操作")} ${label}`} onClick={() => setRowActions(key)}><Icon name="more" /></button>;
  const inHouse = copy("ภายใน", "In-house", "社内");
  const provider = (line: EstimateManhourLine) => line.provider === "Supplier"
    ? <>Supplier man-hour{line.supplierName ? ` · ${line.supplierName}` : ""}{line.quotationNumber ? <span className="est-lab-ref"> · {line.quotationNumber}</span> : null}</>
    : inHouse;

  const manhourRow = (line: EstimateManhourLine) => <tr className="est-lab-row" key={`manhour-${line.id}`}>
    <td className="est-lab-indent" title={line.activity}>{line.activity}</td>
    <td>{line.costType}</td>
    <td title={[line.supplierName, line.quotationNumber].filter(Boolean).join(" · ")}>{provider(line)}</td>
    <td title={line.department}>{line.level}</td>
    <EstimateEffortCells line={line} full={showAllColumns} busy={busy || quickSaving} money={formatMoney} number={formatNumber} onSave={(effort, rowVersion) => onSaveEffort(line, effort, rowVersion)} />
    {showAllColumns ? <><td>{line.ownerName}</td><td title={line.remark ?? ""}>{line.remark || "—"}</td></> : null}
    <td className="est-lab-act">{lineActions(`manhour-${line.id}`, line.canEdit, canAddManhour, line.activity, () => onEditManhour(line), () => onRemoveManhour(line))}</td>
  </tr>;
  const expenseRow = (line: EstimateExpenseLine) => <tr className="est-lab-row est-lab-exp" key={`expense-${line.id}`}>
    <td colSpan={4} className="est-lab-indent" title={line.description}><span className="est-type-pill">{t(line.expenseType)}</span>{line.description}{line.supplierName ? <span className="muted"> · {line.supplierName}</span> : null}</td>
    <td colSpan={4} className="num muted">{line.unit} {formatNumber(line.quantity)} × {formatMoney(line.unitCost)}</td>
    <td className="num"><strong>{formatMoney(line.lineTotal)}</strong></td>
    {showAllColumns ? <><td colSpan={2} className="muted">{line.referenceNumber || ""}</td><td>{line.ownerName}</td><td title={line.remark ?? ""}>{line.remark || "—"}</td></> : null}
    <td className="est-lab-act">{lineActions(`expense-${line.id}`, line.canEdit, canAddExpense, line.description, () => onEditExpense(line), () => onRemoveExpense(line))}</td>
  </tr>;
  const quickRow = (draft: QuickDraft) => {
    const options = disciplineRates(rates, draft.section);
    const chosen = options.find((option) => option.department === draft.department && option.level === draft.level);
    return <tr className="inline-draft-row est-lab-row est-lab-draft" key={`quick-${draft.section}-${draft.package}-${draft.version}`} title={t("Enter: save and create the next row · Esc: cancel")} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); setQuickDraft(null); }
      if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void saveQuickRow(); }
    }}>
      <td className="est-lab-indent"><input ref={quickActivityRef} required aria-label={t("New activity")} maxLength={300} placeholder={t("Activity *")} value={draft.activity} onChange={(event) => updateQuick("activity", event.target.value)} /></td>
      <td>{costTypeOfDiscipline(draft.section)}</td>
      <td>{inHouse}</td>
      <td>{options.length ? <select aria-label={t("Department & level")} value={chosen?.id ?? ""} onChange={(event) => { const rate = options.find((option) => option.id === Number(event.target.value)); if (rate) setQuickDraft((current) => current ? { ...current, department: rate.department, level: rate.level } : current); }}>
          {chosen ? null : <option value="">{copy("เลือกแผนกและระดับ", "Choose department and level", "部門とレベルを選択")}</option>}
          {options.map((rate) => <option key={rate.id} value={rate.id}>{rate.department} — {rate.level}{canSeeRates ? ` · ${formatMoney(draft.section === "Installation" ? rate.installationDaily : rate.engineeringDaily)}` : ""}</option>)}
        </select>
        : <div className="cell-stack"><select aria-label={t("Department")} value={draft.department} onChange={(event) => updateQuick("department", event.target.value)}>{teamDepartments.map((department) => <option key={department}>{department}</option>)}</select><select aria-label={t("Engineer level")} value={draft.level} onChange={(event) => updateQuick("level", event.target.value)}>{teamLevels.map((level) => <option key={level}>{level}</option>)}</select></div>}</td>
      <td><input className="num" aria-label={t("Engineer quantity")} type="number" min="0.01" max="10000" step="0.01" value={draft.engineers} onChange={(event) => updateQuick("engineers", Number(event.target.value))} /></td>
      <td><input className="num" aria-label={t("Man-days")} type="number" min="0.01" max="100000" step="0.01" value={draft.manDays} onChange={(event) => updateQuick("manDays", Number(event.target.value))} /></td>
      <td><input className="num" aria-label={t("Hours per day")} type="number" min="0.01" max="24" step="0.01" value={draft.hoursPerDay} onChange={(event) => updateQuick("hoursPerDay", Number(event.target.value))} /></td>
      <td className="num">{formatNumber(draft.engineers * draft.manDays)}</td>
      <td className="num muted"><LocalizedText text={"On save"} /></td>
      {showAllColumns ? <><td className="num muted"><LocalizedText text={"Rate master"} /></td><td className="num">{formatNumber(draft.engineers * draft.manDays * draft.hoursPerDay)} HR</td>
        <td><select aria-label={t("Activity owner")} value={draft.ownerId} onChange={(event) => updateQuick("ownerId", Number(event.target.value))}>{owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></td>
        <td><input aria-label={t("Activity remark")} maxLength={20000} placeholder={t("Remark")} value={draft.remark} onChange={(event) => updateQuick("remark", event.target.value)} /></td></> : null}
      <td className="est-lab-act"><span className="row-actions"><button className="row-action save" type="button" disabled={!quickValid || busy || quickSaving} onClick={() => { void saveQuickRow(); }} aria-label={t("Save activity")}><Icon name="check" /></button><button className="row-action" type="button" disabled={busy || quickSaving} onClick={() => setQuickDraft(null)} aria-label={t("Cancel new activity")}><Icon name="x" /></button></span></td>
    </tr>;
  };
  // Cells after man-days and cost: the extra columns, then the action cell.
  const tail = (key: string) => [showAllColumns ? <td key={`${key}-extra`} colSpan={extraColumns} /> : null, <td key={`${key}-act`} />];

  const disciplineRow = (section: SectionKey, isOpen: boolean) => {
    const { manhours, labor, site, manDays } = summary(section);
    const discipline = section === "unassigned" ? null : section;
    return <tr className={isOpen ? "est-lab-disc open" : "est-lab-disc"} key={`discipline-${section}`}><td colSpan={columnCount}><div className="est-lab-line">
      <button type="button" className="est-lab-toggle" aria-expanded={isOpen} onClick={() => setOpenState(isOpen ? "none" : section)}><Icon name={isOpen ? "chevronDown" : "chevronRight"} /><strong>{disciplineLabel(section)}</strong></button>
      {section === "unassigned" ? <Badge tone="amber">{copy("แก้แต่ละบรรทัดเพื่อเลือกสาขา", "Edit each line to choose its discipline", "各行を編集して分野を選択")}</Badge> : null}
      <span className="muted">{copy(`${manhours.length} กิจกรรม`, `${manhours.length} activities`, `作業 ${manhours.length}`)} · {site ? `${copy("เดินทาง ที่พัก", "Travel & stay", "旅費・宿泊")} ${formatMoney(site)}` : copy("ยังไม่มีค่าเดินทาง", "No travel yet", "旅費なし")}</span>
      {isOpen && discipline && canAddManhour ? <>
        <button type="button" className="link-btn est-lab-link" disabled={busy} onClick={() => onNewPackage(discipline)}><Icon name="plus" />{copy("Work package ใหม่", "New work package", "新しいワークパッケージ")}</button>
        <button type="button" className="link-btn est-lab-link" disabled={busy} onClick={() => onAddManhour({ package: manhours[0]?.package ?? defaultWorkPackage(discipline), discipline, costType: costTypeOfDiscipline(discipline), provider: "Supplier" })}><Icon name="plus" />{copy("ค่าแรงผู้ขาย (Supplier man-hour)", "Supplier man-hour", "外注工数 (Supplier man-hour)")}</button>
      </> : null}
      <span className="spacer" />
      <span className="muted">{formatNumber(manDays)} Man-day</span>
      <span className="est-lab-sep" aria-hidden="true" />
      <span className="muted">{copy("ค่าแรง", "Labor", "労務費")}</span>
      <strong className="est-lab-amount">{formatMoney(labor)}</strong>
    </div></td></tr>;
  };
  const columnHeads = (section: SectionKey) => <tr className="est-lab-cols" key={`cols-${section}`}>
    <th scope="col">{copy("กิจกรรม", "Activity", "作業")}</th>
    <th scope="col">{copy("ประเภทต้นทุน", "Cost type", "原価種別")}</th>
    <th scope="col">{copy("ผู้ให้บริการ", "Provider", "提供者")}</th>
    <th scope="col">{copy("ระดับ", "Level", "レベル")}</th>
    <th scope="col" className="num">{copy("คน", "People", "人数")}</th>
    <th scope="col" className="num">{copy("วัน", "Days", "日数")}</th>
    <th scope="col" className="num">{copy("ชม./วัน", "Hours/day", "時間/日")}</th>
    <th scope="col" className="num">Man-day</th>
    <th scope="col" className="num">{copy("ต้นทุน", "Cost", "原価")}</th>
    {showAllColumns ? <>
      <th scope="col" className="num">{copy("อัตรา/วัน", "Daily rate", "日額")}</th>
      <th scope="col" className="num">{copy("ชั่วโมงรวม", "Man-hours", "総時間")}</th>
      <th scope="col">{copy("ผู้รับผิดชอบ", "Owner", "担当")}</th>
      <th scope="col">{copy("หมายเหตุ", "Remark", "備考")}</th>
    </> : null}
    <th scope="col" aria-label={t("Action")} />
  </tr>;

  const sectionRows = (section: SectionKey) => {
    const isOpen = open === section;
    const rows = [disciplineRow(section, isOpen)];
    if (!isOpen) return rows;
    const { manhours, expenses, labor, site, total, manDays } = summary(section);
    const discipline = section === "unassigned" ? null : section;
    const packages = [...new Set(manhours.map((line) => line.package))];
    const draftHere = quickDraft && discipline && quickDraft.section === discipline ? quickDraft : null;
    // A draft for a work package that has no saved line yet still needs its band.
    if (draftHere && !packages.includes(draftHere.package)) packages.push(draftHere.package);
    rows.push(columnHeads(section));
    for (const packageName of packages) {
      const lines = manhours.filter((line) => line.package === packageName);
      const costType = lines[0]?.costType ?? (discipline ? costTypeOfDiscipline(discipline) : "Engineering");
      const key = `${section}:${packageName}`;
      rows.push(<tr className="est-lab-pkg" key={`package-${key}`}>
        <td colSpan={7}><div className="est-lab-line">
          {lines.length && lines.every((line) => line.canEdit) ? <button type="button" className="module-name-edit" disabled={busy || quickSaving} title={t("แก้ชื่อ Main Module / Rename Main Module")} onClick={() => setModuleEditor({ key: "package:" + costType + ":" + packageName, title: packageName })}><strong>{packageName}</strong><Icon name="edit" /></button> : <strong>{packageName}</strong>}
          {canAddManhour && lines.length ? (packageActions === key
            ? <span className="row-actions"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => { setPackageActions(null); setLaborSaveTarget({ name: packageName, costType, lineCount: lines.length }); }}><Icon name="package" /><LocalizedText text={"Save as labor package"} /></button><button className="icon-btn" type="button" aria-label={copy("ปิดตัวเลือก", "Close actions", "操作を閉じる")} onClick={() => setPackageActions(null)}><Icon name="x" /></button></span>
            : <button className="icon-btn" type="button" disabled={busy} title={copy("บันทึกเป็นชุดค่าแรง", "Save as labor package", "工数パッケージとして保存")} aria-label={`${copy("ตัวเลือก", "Actions", "操作")} ${packageName}`} onClick={() => setPackageActions(key)}><Icon name="more" /></button>) : null}
          <span className="muted">{copy(`${lines.length} กิจกรรม`, `${lines.length} activities`, `作業 ${lines.length}`)}</span>
          {lines.some((line) => line.disciplineInferred) ? <Badge tone="slate">{copy("สาขาเดาจากชื่อ Work Package", "Discipline read from the package name", "パッケージ名から分野を推定")}</Badge> : null}
        </div></td>
        <td className="num"><strong>{formatNumber(lines.reduce((sum, line) => sum + numberOf(line.engineers) * numberOf(line.manDays), 0))}</strong></td>
        <td className="num"><strong>{formatMoney(lines.reduce((sum, line) => sum + numberOf(line.lineCost), 0))}</strong></td>
        {tail(key)}
      </tr>);
      rows.push(...lines.map(manhourRow));
      if (draftHere && draftHere.package === packageName) rows.push(quickRow(draftHere));
      else if (discipline && canAddManhour) rows.push(<tr className="est-lab-add" key={`add-${key}`}><td colSpan={columnCount}><button type="button" className="link-btn est-lab-link" disabled={busy || quickSaving} onClick={() => startQuickRow(discipline, packageName)}><Icon name="plus" />{copy("เพิ่มกิจกรรม", "Add activity", "作業を追加")}</button></td></tr>);
    }
    if (!manhours.length && !draftHere) rows.push(<tr className="est-lab-add" key={`empty-${section}`}><td colSpan={columnCount}>
      {discipline && canAddManhour
        ? <button type="button" className="link-btn est-lab-link" disabled={busy} onClick={() => startQuickRow(discipline)}><Icon name="plus" />{copy(`ยังไม่มีค่าแรง${disciplineLabel(discipline)} · กดเพื่อเพิ่มงาน`, `No ${disciplineLabel(discipline)} labor yet · add an activity`, `${disciplineLabel(discipline)}の工数はまだありません · 作業を追加`)}</button>
        : <span className="muted">{copy("ยังไม่มีค่าแรง", "No labor yet", "工数はまだありません")}</span>}
    </td></tr>);
    if (expenses.length || (discipline && canAddExpense)) {
      rows.push(<tr className="est-lab-pkg est-lab-travel" key={`site-${section}`}>
        <td colSpan={8}><div className="est-lab-line">
          <strong>{copy(`ค่าเดินทาง ที่พัก เบี้ยเลี้ยง · ${disciplineLabel(section)}`, `Travel, hotel and per diem · ${disciplineLabel(section)}`, `旅費・宿泊・日当 · ${disciplineLabel(section)}`)}</strong>
          {discipline && canAddExpense ? <button type="button" className="link-btn est-lab-link" disabled={busy} onClick={() => onAddExpense({ discipline, costType: costTypeOfDiscipline(discipline), package: packages[0] ?? defaultWorkPackage(discipline) })}><Icon name="plus" />{copy("เพิ่มค่าเดินทาง", `Add travel, hotel or per diem for ${disciplineLabel(discipline)}`, `${disciplineLabel(discipline)}の旅費・宿泊・日当を追加`)}</button> : null}
        </div></td>
        <td className="num"><strong>{formatMoney(site)}</strong></td>
        {tail(`site-${section}`)}
      </tr>);
      rows.push(...expenses.map(expenseRow));
    }
    rows.push(<tr className="est-lab-total" key={`subtotal-${section}`}>
      <td colSpan={7}><strong>{copy("รวม", "Total", "合計")} {disciplineLabel(section)}</strong> <span className="muted">{copy("ค่าแรง", "Labor", "労務費")} {formatMoney(labor)} · {copy("เดินทาง ที่พัก", "Travel & stay", "旅費・宿泊")} {formatMoney(site)}</span></td>
      <td className="num"><strong>{formatNumber(manDays)}</strong></td>
      <td className="num"><strong>{formatMoney(total)}</strong></td>
      {tail(`subtotal-${section}`)}
    </tr>);
    return rows;
  };

  return <Panel className="est-labor-panel" flush>
    {moduleEditor ? <EstimateModuleEditor workspace={workspace} moduleKey={moduleEditor.key} initialTitle={moduleEditor.title} onClose={() => setModuleEditor(null)} onSaved={() => onLaborLibraryChanged("Work package updated")} /> : null}
    <div className="est-sheet-bar">
      <span className="est-lab-note"><Icon name="alertCircle" />{canAddManhour
        ? copy("อัตราค่าแรงภายในดึงจาก Rate Master ที่มีผลวันนี้ · แก้ คน / วัน / ชม. ในช่องแล้วกด Enter", "In-house rates come from today's Rate Master · edit people, days and hours in place, then press Enter", "社内単価は本日有効のレートマスターから · 人数・日数・時間をその場で編集しEnter")
        : t("Revision นี้ไม่เปิดให้แก้ไขค่าแรงในสถานะปัจจุบัน หรือบัญชีนี้ไม่มีสิทธิ์แก้ไข")}</span>
      <span className="spacer" />
      <button type="button" className={showAllColumns ? "btn ghost sm active" : "btn ghost sm"} aria-pressed={showAllColumns} onClick={() => setShowAllColumns((current) => !current)}><Icon name="table" />{copy("คอลัมน์เพิ่มเติม", "More columns", "列を追加")}</button>
      {target && canAddManhour ? <>
        <button type="button" className="btn default sm" disabled={busy} onClick={() => setLibraryFor(target)}><Icon name="package" />{copy("ใช้ชุดค่าแรง", "Add from library", "工数パッケージを使用")} · {disciplineLabel(target)}</button>
        <button type="button" className="btn primary sm" disabled={busy || quickSaving} onClick={() => startQuickRow(target)}><Icon name="plus" />{copy("เพิ่มงาน", "Add activity", "作業を追加")} · {disciplineLabel(target)}</button>
      </> : null}
    </div>
    <div className="table-wrap est-labor-wrap">
      <table className="est-labor-sheet" style={{ minWidth: showAllColumns ? 1820 : 1260 }}>
        <colgroup>
          <col style={{ width: 260 }} /><col style={{ width: 120 }} /><col style={{ width: 220 }} /><col style={{ width: 140 }} />
          <col style={{ width: 72 }} /><col style={{ width: 72 }} /><col style={{ width: 84 }} /><col style={{ width: 84 }} /><col style={{ width: 124 }} />
          {showAllColumns ? <><col style={{ width: 120 }} /><col style={{ width: 110 }} /><col style={{ width: 150 }} /><col style={{ width: 180 }} /></> : null}
          <col style={{ width: 84 }} />
        </colgroup>
        <tbody>{sections.flatMap(sectionRows)}</tbody>
      </table>
      {!workspace.manhourLines.length && !workspace.expenseLines.length && !canAddManhour ? <EmptyState icon="layers" title="No work package yet" message={copy("ยังไม่มีค่าแรงหรือค่าเดินทางใน revision นี้", "This revision has no labor or travel yet.", "この版には工数・旅費がまだありません。")} /> : null}
    </div>
    {libraryFor ? <ApplyLaborPackageModal workspace={workspace} currentUserId={bootstrap.user.id} busy={busy} discipline={libraryFor} onClose={() => setLibraryFor(null)} onApplied={onLaborLibraryChanged} onManageLibrary={() => { setLaborMasterFromLibrary(libraryFor); setLibraryFor(null); setSavedLaborPackageId(undefined); setLaborMasterOpen(true); }} /> : null}
    {laborSaveTarget ? <SaveLaborPackageModal estimateId={workspace.header.id} packageName={laborSaveTarget.name} costType={laborSaveTarget.costType} lineCount={laborSaveTarget.lineCount} busy={busy} onClose={() => setLaborSaveTarget(null)} onSaved={onLaborLibraryChanged} onOpenSaved={(id) => { setLaborSaveTarget(null); setSavedLaborPackageId(id); setLaborMasterFromLibrary(null); setLaborMasterOpen(true); }} /> : null}
    {laborMasterOpen ? <Modal title="Labor Package Master" size="xl" onClose={closeLaborMaster}><LaborPackageMaster bootstrap={bootstrap} initialPackageId={savedLaborPackageId} onClose={closeLaborMaster} onBack={laborMasterFromLibrary ? () => { const back = laborMasterFromLibrary; closeLaborMaster(); setLibraryFor(back); } : undefined} /></Modal> : null}
    <div className="sticky-foot">
      <span className="spacer" />
      <span className="muted">{copy("รวมค่าแรง", "Labor total", "労務費合計")}</span>
      <strong>{formatNumber(totals.manDays)} Man-day</strong>
      <span className="muted">·</span>
      <strong>{formatMoney(totals.labor)}</strong>
      <span className="est-lab-sep" aria-hidden="true" />
      <span className="muted">{copy("เดินทาง ที่พัก", "Travel & stay", "旅費・宿泊")}</span>
      <strong>{formatMoney(totals.site)}</strong>
    </div>
  </Panel>;
}
