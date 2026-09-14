"use client";

import { EstimateModuleEditor } from "./EstimateModuleEditor";
import { moveModule, type ReorderEstimate, type EstimateOrderSource } from "../../../lib/estimate-order";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { buildErpEstimateWorkbook, downloadErpEstimateWorkbookBytes, ERP_COST_CATEGORIES, ERP_ESTIMATE_TEMPLATE_VERSION } from "../../../lib/erp-estimate-workbook";
import { automaticLaborCategory, suggestErpCategory } from "../../../lib/erp-category-suggest";
import { LABOR_MODULE_NAMES, groupErpLaborSections, breakdownModules, breakdownLineCount, buildEstimateCostBreakdown, type BreakdownLine, type BreakdownSection } from "../../../lib/estimate-cost-breakdown";
import { ESTIMATE_OVERHEAD_ENABLED } from "../../../lib/feature-flags";
import {
  loadEstimateErpSummary,
  loadEstimateModuleDetails,
  type EstimateModuleDetail,
  recordEstimateErpExport,
  updateEstimateErpMappings,
  type EstimateCostWorkspace,
  type EstimateErpCategory,
  type EstimateErpSourceType,
  type EstimateErpSummary,
} from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { EmptyState, Icon, Modal, Panel, SearchInput } from "../ui";
import { estimateBusinessDate, estimateUxCopy } from "../../../lib/estimate-ux";

/*
 * One list for the estimate's cost and its ERP classification.
 *
 * The numbered sections (cost categories, man-hour, expenses, other project cost)
 * are the "main list" and start collapsed — the summary page shows sections and
 * their totals only. Opening a section shows its main modules in the ERP quotation layout
 * (1-1, 1-2 …, qty, unit, in-house / outsourced, unit cost, amount) with the ERP
 * category of each line editable in the last column, so there is no second list
 * for ERP mapping. Internal engineering cost only; no selling figures exist here.
 */

type ErpLine = EstimateErpSummary["lines"][number];
type DraftCategory = EstimateErpCategory | "Unmapped";

const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const erpKey = (line: ErpLine) => `${line.sourceType}:${line.sourceId ?? "estimate"}`;
/** Breakdown keys are "cost:11" / "manhour:4" …; ERP keys are "CostItem:11" / "ManhourLine:4" …. */
const ERP_SOURCE_BY_PREFIX: Record<string, EstimateErpSourceType> = { cost: "CostItem", manhour: "ManhourLine", expense: "ExpenseLine", other: "OtherCostLine" };
const erpKeyOfBreakdown = (key: string): string | null => {
  const [prefix, id] = key.split(":");
  const sourceType = prefix ? ERP_SOURCE_BY_PREFIX[prefix] : undefined;
  return sourceType && id ? `${sourceType}:${id}` : null;
};
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};
const lineMatches = (line: BreakdownLine, needle: string) => !needle
  || [line.title, line.supplierName, ...line.details].some((value) => value !== null && value.toLowerCase().includes(needle));

export function EstimateErpSummaryPanel({ workspace, onChanged, notify, onOpenCategory, onReorder, reorderBusy }: {
  workspace: EstimateCostWorkspace;
  onReorder: ReorderEstimate;
  reorderBusy: boolean;
  onChanged: (message: string) => Promise<void>;
  notify: (message: string) => void;
  /** Opens a cost category in the Cost Items tab for editing. */
  onOpenCategory?: (categoryCode: string, module?: string, itemId?: number) => void;
}) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const unmappedLabel = copy("ยังไม่จัดหมวด", "Unmapped", "未分類");
  const inHouseLabel = copy("ทำเอง", "In-house", "内製");
  const outsourcedLabel = copy("จ้างภายนอก", "Outsourced", "外注");
  const locale = currentLocale();
  const labels = useMemo(() => ({
    manhour: estimateUxCopy(locale, "ค่าแรงวิศวกรรม", "Engineering man-hour", "技術工数"),
    expenses: estimateUxCopy(locale, "ค่าใช้จ่ายโครงการ", "Project expenses", "プロジェクト経費"),
    other: estimateUxCopy(locale, "ต้นทุนโครงการอื่น", "Other project cost", "その他プロジェクト原価"),
    manDayUnit: estimateUxCopy(locale, "คน-วัน", "Man-day", "人日"),
  }), [locale]);

  const [summary, setSummary] = useState<EstimateErpSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftCategory>>({});
  const [loading, setLoading] = useState(true);
  const [moduleDetails, setModuleDetails] = useState<EstimateModuleDetail[]>([]);
  const [editingModule, setEditingModule] = useState<{ key: string; title: string } | null>(null);
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<DraftCategory>("Hardware");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadEstimateErpSummary(workspace.header.id);
      setSummary(loaded);
      setModuleDetails(await loadEstimateModuleDetails(workspace.header.id));
      /* A refresh (this panel saved, another tab changed the estimate) must not throw away
         edits the user has not saved yet; a draft equal to the server value is simply dropped. */
      setDrafts((current) => Object.fromEntries(loaded.lines.map((line) => {
        const key = erpKey(line); const pending = current[key];
        return [key, pending !== undefined && pending !== line.erpCategory ? pending : line.erpCategory];
      })));
      setSelected((current) => new Set([...current].filter((key) => loaded.lines.some((line) => erpKey(line) === key))));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ERP summary could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [workspace.header.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, workspace.header.rowVersion]);

  /* Cost lines come from the workspace (always available); the ERP column joins the
     ERP summary onto them by source type and id once it has loaded. */
  const sections = useMemo(() => groupErpLaborSections(buildEstimateCostBreakdown(workspace, labels),
    new Map((summary?.lines ?? []).filter(line => line.sourceType === "ManhourLine").map(line => ["manhour:" + line.sourceId, line.erpCategory]))), [workspace, labels, summary]);
  const moduleDetail = (section: BreakdownSection, module: { key: string; title: string }) => {
    const key = section.kind === "manhour" && LABOR_MODULE_NAMES[section.title] ? section.key : module.key;
    const detail = moduleDetails.find(row => row.moduleKey === key);
    return { key, title: section.kind === "cost-items" ? module.title : detail?.title ?? module.title, descriptionRows: detail?.descriptionRows ?? [] };
  };
  const erpByKey = useMemo(() => new Map((summary?.lines ?? []).map((line) => [erpKey(line), line])), [summary]);
  const erpOf = useCallback((line: BreakdownLine) => { const key = erpKeyOfBreakdown(line.key); return key ? erpByKey.get(key) : undefined; }, [erpByKey]);
  const draftOf = (erp: ErpLine) => drafts[erpKey(erp)] ?? erp.erpCategory;
  const contingencyErp = summary?.lines.find((line) => line.sourceType === "Contingency") ?? null;
  const suggestions = useMemo(() => Object.fromEntries((summary?.lines ?? []).map((line) => [erpKey(line), suggestErpCategory(line)])), [summary]);
  const changedLines = useMemo(() => summary?.lines.filter((line) => {
    const draft = drafts[erpKey(line)];
    return draft !== undefined && draft !== line.erpCategory;
  }) ?? [], [drafts, summary]);

  const needle = search.trim().toLowerCase();
  const filtering = needle !== "" || unmappedOnly;
  const visibleSections = useMemo(() => sections
    .map((section) => ({
      section,
      lines: breakdownModules(section).filter((module) => module.lines.some((line) => {
        if (!lineMatches(line, needle)) return false;
        if (!unmappedOnly) return true;
        const erp = erpOf(line);
        return erp ? (drafts[erpKey(erp)] ?? erp.erpCategory) === "Unmapped" : false;
      })).flatMap((module) => module.lines),
    }))
    .filter((entry) => !filtering || entry.lines.length), [sections, needle, unmappedOnly, erpOf, drafts, filtering]);
  const isExpanded = (key: string) => filtering || expanded.has(key);
  const shownLines = visibleSections.flatMap((entry) => isExpanded(entry.section.key) ? entry.lines : []);
  const shownErpKeys = shownLines.map((line) => erpKeyOfBreakdown(line.key)).filter((key): key is string => key !== null && erpByKey.has(key));
  const selectedShown = shownErpKeys.filter((key) => selected.has(key));
  const allShownSelected = shownErpKeys.length > 0 && selectedShown.length === shownErpKeys.length;
  const lineCount = breakdownLineCount(sections);
  const canEdit = Boolean(summary?.capabilities.canEditMappings) && !busy && !reorderBusy;
  const approvedOverhead = !ESTIMATE_OVERHEAD_ENABLED || summary?.overhead.state === "Applied" || summary?.overhead.state === "Zero";
  const overheadAmount = Number(summary?.overhead.amount ?? 0);
  const { totals, contingencyRate } = workspace.header;

  const toggleSection = (key: string) => {
    const closing = expanded.has(key);
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    /* Collapsing a section also drops its lines from the selection so the bulk bar never
       acts on rows the user can no longer see. */
    if (closing) {
      const hidden = new Set(sections.find((section) => section.key === key)?.lines.map((line) => erpKeyOfBreakdown(line.key)) ?? []);
      setSelected((current) => new Set([...current].filter((selectedKey) => !hidden.has(selectedKey))));
    }
  };
  const toggleKeys = (keys: string[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const key of keys) { if (on) next.add(key); else next.delete(key); }
    return next;
  });
  const setDraftFor = (keys: string[], category: DraftCategory) => setDrafts((current) => {
    const next = { ...current };
    for (const key of keys) { const line = erpByKey.get(key); if (!line || !automaticLaborCategory(line)) next[key] = category; }
    return next;
  });
  const applyBulk = () => {
    if (!selectedShown.length) return;
    setDraftFor(selectedShown, bulkCategory);
    notify(copy(`กำหนด ${selectedShown.length} รายการเป็น ${bulkCategory === "Unmapped" ? unmappedLabel : bulkCategory} แล้ว — ตรวจแล้วกดบันทึก`, `${selectedShown.length} line(s) set to ${bulkCategory} — review and save`, `${selectedShown.length}件を${bulkCategory}に設定しました — 確認して保存してください`));
  };
  const applySuggestions = () => {
    const targets = (selectedShown.length ? selectedShown : shownErpKeys)
      .map((key) => erpByKey.get(key)).filter((erp): erp is ErpLine => Boolean(erp))
      .filter((erp) => draftOf(erp) === "Unmapped" && suggestions[erpKey(erp)]);
    if (!targets.length) {
      notify(copy("ไม่มีรายการที่ระบบแนะนำหมวดได้ กรุณาเลือกด้วยตนเอง", "No suggestion available for these lines; choose manually.", "提案できる分類がありません。手動で選択してください。"));
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      for (const erp of targets) next[erpKey(erp)] = suggestions[erpKey(erp)] as EstimateErpCategory;
      return next;
    });
    notify(copy(`แนะนำหมวดให้ ${targets.length} รายการแล้ว — ตรวจแล้วกดบันทึก`, `Suggested categories for ${targets.length} line(s) — review and save`, `${targets.length}件に分類を提案しました — 確認して保存してください`));
  };
  const resetFilters = () => { setSearch(""); setUnmappedOnly(false); };

  const save = async () => {
    if (!summary || !changedLines.length) return;
    setBusy(true); setError("");
    try {
      const result = await updateEstimateErpMappings(workspace.header.id, summary.estimateRowVersion, changedLines.map((line) => ({
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        erpCategory: drafts[erpKey(line)] as EstimateErpCategory,
        mappingRowVersion: line.mappingRowVersion,
      })));
      setSummary(result.erpSummary);
      setDrafts(Object.fromEntries(result.erpSummary.lines.map((line) => [erpKey(line), line.erpCategory])));
      setSelected(new Set());
      await onChanged("ERP category mapping updated");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ERP mapping could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const exportWorkbook = async () => {
    if (!summary || workspace.header.status !== "Approved" || !summary.capabilities.canExport || changedLines.length || !approvedOverhead) return;
    setBusy(true); setError("");
    try {
      const filename = `${workspace.header.number}_R${String(workspace.header.revision).padStart(2, "0")}_ERP_EstimateCost.xlsx`;
      const bytes = buildErpEstimateWorkbook({
        metadata: {
          projectName: workspace.header.projectName,
          customer: workspace.header.customerName,
          shortName: workspace.header.projectName,
          projectNumber: workspace.header.inquiryNumber,
          revision: `R${String(workspace.header.revision).padStart(2, "0")}`,
          revisionDescription: workspace.header.status,
          creator: workspace.header.ownerName,
          exportDate: estimateBusinessDate(new Date(), process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "Asia/Bangkok"),
        },
        summary: {
          ...summary,
          lines: summary.lines.map((line) => ({
            ...line,
            item: line.item ?? undefined,
            modelPartNumber: line.modelPartNumber ?? undefined,
            supplier: line.supplier ?? undefined,
            brand: line.brand ?? undefined,
            leadTime: line.leadTime ?? undefined,
            quoteRevision: line.quoteRevision ?? undefined,
            unitPrice: line.unitPrice ?? undefined,
            quantity: line.quantity ?? undefined,
            unit: line.unit ?? undefined,
            remark: line.remark ?? undefined,
          })),
        },
        approvedOverhead: { amount: overheadAmount, approved: approvedOverhead },
      });
      const digestInput = new Uint8Array(bytes.byteLength);
      digestInput.set(bytes);
      const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      await recordEstimateErpExport(workspace.header.id, {
        estimateRowVersion: summary.estimateRowVersion,
        templateVersion: ERP_ESTIMATE_TEMPLATE_VERSION,
        sha256,
        filename,
        fileBase64: bytesToBase64(bytes),
      });
      downloadErpEstimateWorkbookBytes(bytes, filename);
      notify("ERP Estimate Cost exported");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ERP workbook could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const erpSelect = (erp: ErpLine, label: string) => {
    const key = erpKey(erp);
    const draft = draftOf(erp);
    const suggestion = suggestions[key];
    return <div className="erp-map-cell">
      <select disabled={!canEdit} aria-label={`ERP category for ${label}`} value={draft} onChange={(event) => setDraftFor([key], event.target.value as DraftCategory)}>
        <option value="Unmapped">{unmappedLabel}</option>
        {ERP_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
      </select>
      {draft !== erp.erpCategory ? <span className="pill amber" title={copy("ยังไม่บันทึก", "Not saved yet", "未保存")}>{copy("แก้ไข", "Edited", "変更")}</span> : null}
      {suggestion && suggestion !== draft && canEdit ? <button className="chip" type="button" title={copy("ใช้หมวดที่ระบบแนะนำ", "Apply suggested category", "提案された分類を適用")} onClick={() => setDraftFor([key], suggestion)}>→ {suggestion}</button> : null}
    </div>;
  };

  /* Always summarises the whole section, even while a filter hides some of its lines. */
  const sectionErpStatus = (section: BreakdownSection) => {
    if (!summary) return null;
    const erps = section.lines.map(erpOf).filter((erp): erp is ErpLine => Boolean(erp));
    const unmapped = erps.filter((erp) => draftOf(erp) === "Unmapped").length;
    if (!erps.length) return null;
    return unmapped
      ? <span className="badge amber">{copy(`ยังไม่จัดหมวด ${unmapped}`, `${unmapped} unmapped`, `未分類 ${unmapped}`)}</span>
      : <span className="badge green"><Icon name="check" /> {copy("จัดหมวด ERP ครบ", "ERP mapped", "ERP分類済み")}</span>;
  };

  const moveSummaryModule = (section: BreakdownSection, title: string, direction: -1 | 1) => {
    const sourceType: EstimateOrderSource = section.kind === "cost-items" ? "CostItem" : section.kind === "manhour" ? "ManhourLine" : section.kind === "expenses" ? "ExpenseLine" : "OtherCostLine";
    const moved = moveModule(section.lines, line => section.kind === "cost-items" && !line.module?.trim() ? (line.priceSetKey ? section.key + ":set:" + line.priceSetKey : section.key + ":item:" + line.key) : section.key + ":" + (line.module?.trim() || "Unassigned module"), title, direction);
    const all = sections.filter(entry => entry.kind === section.kind).flatMap(entry => entry.key === section.key ? moved : entry.lines);
    void onReorder(sourceType, all.map(line => Number(line.key.split(":")[1])));
  };
  const renderSection = ({ section, lines }: { section: BreakdownSection; lines: BreakdownLine[] }) => {
    const open = isExpanded(section.key);
    const sectionErpKeys = lines.map((line) => erpKeyOfBreakdown(line.key)).filter((key): key is string => key !== null && erpByKey.has(key));
    const sectionSelected = sectionErpKeys.length > 0 && sectionErpKeys.every((key) => selected.has(key));
    return <tbody key={section.key}>
      <tr className={`cb-section${open ? " open" : ""}`} onClick={() => { if (!filtering) toggleSection(section.key); }} aria-expanded={open}>
        <td className="cb-num-col">
          <button type="button" className="cb-toggle" aria-label={open ? copy("ย่อหมวด", "Collapse section", "区分を閉じる") : copy("ขยายหมวด", "Expand section", "区分を開く")} disabled={filtering} onClick={(event) => { event.stopPropagation(); toggleSection(section.key); }}>
            <Icon name={open ? "chevronDown" : "chevronRight"} />
          </button>
          <strong>{section.ordinal}</strong>
        </td>
        <td>
          <strong className="cb-title">{section.title}</strong>
          {section.categoryCode ? <span className="cb-code">{section.categoryCode}</span> : null}
          {section.categoryCode && onOpenCategory ? <button type="button" className="cb-open" title={copy("แก้ไขในแท็บ Cost Items", "Edit in the Cost Items tab", "Cost Itemsタブで編集")} aria-label={copy(`แก้ไข ${section.title} ในแท็บ Cost Items`, `Edit ${section.title} in the Cost Items tab`, `${section.title}をCost Itemsタブで編集`)} onClick={(event) => { event.stopPropagation(); onOpenCategory(section.categoryCode!); }}><Icon name="edit" /></button> : null}
        </td>
        <td colSpan={3} className="cb-section-split"><span className="cb-split">
          {section.inHouseCount ? <span className="cb-split-inhouse"><strong>{inHouseLabel}:</strong> {money(section.inHouseAmount)} <span className="muted">({section.inHouseCount})</span></span> : null}
          {section.outsourcedCount ? <span className="cb-split-outsourced"><strong>{outsourcedLabel}:</strong> {money(section.outsourcedAmount)} <span className="muted">({section.outsourcedCount})</span></span> : null}
        </span></td>
        <td className="num muted">{filtering && lines.length !== section.lines.length ? `${lines.length}/${section.lines.length}` : section.lines.length} <LocalizedText text={"item"} /></td>
        <td className="num"><strong>{money(section.amount)}</strong></td>
        <td className="cb-erp-col" onClick={(event) => event.stopPropagation()}>
          <div className="cb-erp-status">
            {canEdit && open && sectionErpKeys.length ? <input type="checkbox" className="cb-check" checked={sectionSelected} title={copy("เลือกทั้งหมวด", "Select the whole section", "区分内をすべて選択")} aria-label={copy(`เลือกทุกรายการใน ${section.title}`, `Select every line in ${section.title}`, `${section.title}の明細をすべて選択`)} onChange={(event) => toggleKeys(sectionErpKeys, event.target.checked)} /> : null}
            {sectionErpStatus(section)}
          </div>
        </td>
      </tr>
      {open ? breakdownModules(section).filter((module) => module.lines.some((line) => lines.includes(line))).map((module, index) => {
        const keys = module.lines.map((line) => erpKeyOfBreakdown(line.key)).filter((key): key is string => key !== null && erpByKey.has(key));
        const categories = new Set(keys.map((key) => draftOf(erpByKey.get(key)!)));
        const category = categories.size === 1 ? [...categories][0] : "Mixed";
        const moduleIndex = breakdownModules(section).findIndex(entry => entry.key === module.key);
        const canReorder = section.kind === "manhour" ? false : section.kind === "other" ? workspace.capabilities.canEditOtherCosts : section.kind === "expenses" ? workspace.capabilities.canEditExpenses : workspace.capabilities.canEditCostItems;
        const isSelected = keys.length > 0 && keys.every((key) => selected.has(key));
        const detail = moduleDetail(section, module);
        const canEditModule = !module.standalone && (section.kind === "cost-items" ? workspace.capabilities.canEditCostItems : section.kind === "manhour" && Boolean(LABOR_MODULE_NAMES[section.title]) && workspace.capabilities.canEditAllSections);
        return <Fragment key={module.key}><tr className={isSelected ? "cb-line selected" : "cb-line"}>
          <td className="cb-num-col muted">
            {canEdit && keys.length ? <input type="checkbox" className="cb-check" checked={isSelected} aria-label={"Select module " + module.title} onChange={(event) => toggleKeys(keys, event.target.checked)} /> : null}
            {section.ordinal}-{index + 1}
          </td>
          <td><div className="cell-primary cb-desc"><strong>{detail.title}</strong>{detail.descriptionRows.map((row, index) => <span key={index} style={{ whiteSpace: "pre-wrap" }}>{row}</span>)}<span>{module.lines.length} {copy("รายการต้นทุน", "cost lines", "原価明細")}</span></div>
            <button type="button" className="chip" aria-expanded={openModules.has(module.key)} onClick={() => setOpenModules(current => { const next = new Set(current); if (next.has(module.key)) next.delete(module.key); else next.add(module.key); return next; })}>{openModules.has(module.key) ? "ย่อรายการ / Hide details" : "ดูรายการต้นทุน / View cost lines"}</button>
            {canEditModule ? <button type="button" className="chip" disabled={busy || reorderBusy || changedLines.length > 0} onClick={() => setEditingModule(detail)}>แก้ไขโมดูล / Edit module</button> : null}
            {section.categoryCode && onOpenCategory ? <button type="button" className="chip" onClick={() => onOpenCategory(section.categoryCode!, module.standalone ? undefined : module.title, module.standalone ? Number(module.lines[0].key.split(":")[1]) : undefined)}>{module.standalone ? "แก้ไขรายการ / Edit item" : copy("เปิดโมดูล / แก้ไข", "Open module / edit", "モジュールを編集")}</button> : null}
          </td>
          <td className="num">{module.standalone ? quantity(module.lines[0].quantity) : module.lines.length}</td><td>{module.standalone ? module.lines[0].unit : copy("รายการ", "lines", "明細")}</td>
          <td><div className="cell-primary"><span>{inHouseLabel}: {money(module.inHouse)}</span><span>{outsourcedLabel}: {money(module.outsourced)}</span></div></td>
          <td className="num">{module.lines.some((line) => line.awaitingPrice) ? <span className="soft-warn">{copy("รอราคา", "Awaiting price", "価格待ち")}</span> : module.standalone ? money(module.lines[0].unitCost) : "—"}</td>
          <td className="num"><strong>{money(module.amount)}</strong></td>
          <td className="cb-erp-col"><div className="cb-module-controls"><select disabled={!canEdit || !keys.length || keys.some(key => automaticLaborCategory(erpByKey.get(key)!))} aria-label={"ERP category for module " + module.title} value={category} onChange={(event) => setDraftFor(keys, event.target.value as DraftCategory)}>
            <option value="Mixed" disabled>{copy("หลายหมวด ERP", "Mixed ERP categories", "複数のERP分類")}</option>
            <option value="Unmapped">{unmappedLabel}</option>
            {ERP_COST_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>{canReorder ? <span className="row-actions">{([-1, 1] as const).map(direction => <button key={direction} className="icon-btn" type="button" title={direction === -1 ? "ขยับขึ้น / Move up" : "ขยับลง / Move down"} aria-label={(direction === -1 ? "Move up " : "Move down ") + module.title} disabled={busy || reorderBusy || changedLines.length > 0 || filtering || moduleIndex + direction < 0 || moduleIndex + direction >= breakdownModules(section).length} onClick={() => moveSummaryModule(section, module.key, direction)}>{direction === -1 ? "▲" : "▼"}</button>)}</span> : null}</div></td>
        </tr>{openModules.has(module.key) ? module.lines.map(line => <tr key={line.key} className="cb-line">
          <td /><td style={{ paddingLeft: 28 }}>{line.title}<div className="muted">{line.details.join(" · ")}</div></td>
          <td className="num">{quantity(line.quantity)}</td><td>{line.unit}</td><td>{line.source === "in-house" ? inHouseLabel : outsourcedLabel}</td>
          <td className="num">{line.priceSetKey && !line.isPriceSet ? "รวมในราคาเซ็ต" : money(line.unitCost)}</td><td className="num">{line.priceSetKey && !line.isPriceSet ? "—" : money(line.amount)}</td><td>{line.priceSetKey && !line.isPriceSet ? "รวมในราคาเซ็ต" : erpOf(line)?.erpCategory ?? unmappedLabel}</td>
        </tr>) : null}</Fragment>;
      }) : null}
    </tbody>;
  };

  const statusStrip = summary ? <div className={`info-strip ${summary.unmapped.lineCount ? "amber" : summary.reconciled ? "green" : "red"}`}>
    <Icon name={!summary.unmapped.lineCount && summary.reconciled ? "checkCircle" : "alertTriangle"} />
    <span><strong>{summary.unmapped.lineCount ? copy(`ยังไม่ได้จัดหมวด ERP ${summary.unmapped.lineCount} รายการ`, `${summary.unmapped.lineCount} line(s) are not mapped to an ERP category`, `${summary.unmapped.lineCount}件がERP未分類です`) : summary.reconciled ? copy("ยอด ERP ตรงกับ Estimate", "ERP total matches the Estimate", "ERP合計は見積と一致しています") : copy(`ยอดต่างกัน ${money(summary.difference)}`, `Difference ${money(summary.difference)}`, `差額 ${money(summary.difference)}`)}</strong><br />{copy("7 หมวด", "7 categories", "7分類")} {money(summary.classifiedTotal)} + {unmappedLabel} {money(summary.unmapped.amount)}{ESTIMATE_OVERHEAD_ENABLED ? ` + Overhead ${money(overheadAmount)}` : ""} · Estimate {money(summary.canonicalTotal)}</span>
  </div> : null;

  return <Panel title={copy("รายการต้นทุนและหมวด ERP", "Cost list & ERP categories", "原価明細とERP分類")} subtitle={copy(`${sections.length} หมวด · ${lineCount} รายการ · กดหมวดเพื่อดูโมดูล · ต้นทุนภายในเท่านั้น`, `${sections.length} section(s) · ${lineCount} line(s) · open a section to see its modules · internal cost only`, `${sections.length}区分 · ${lineCount}明細 · 区分をクリックで明細表示 · 内部原価のみ`)} flush>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span><button className="btn ghost" type="button" onClick={() => { void load(); }}><LocalizedText text={"Try again"} /></button></div> : null}
    {statusStrip}
    {summary ? <div className="erp-tiles">
      {/* ERP category names are contract values for the ERP import, so they are rendered verbatim (not through the UI translator). */}
      {ERP_COST_CATEGORIES.map((category) => {
        const row = summary.categories.find((entry) => entry.category === category) ?? { category, amount: 0, lineCount: 0 };
        return <div key={category} className={`summary-tile${row.lineCount ? " blue" : ""}`}><span>{category}</span><strong>{money(row.amount)}</strong><em>{row.lineCount} item</em></div>;
      })}
      <div className={`summary-tile ${summary.unmapped.lineCount ? "amber" : "green"}`}><span>{unmappedLabel}</span><strong>{money(summary.unmapped.amount)}</strong><em>{summary.unmapped.lineCount} item</em></div>
    </div> : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading ERP summary…"} /></div> : null}

    {sections.length ? <>
      <div className="toolbar erp-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder={copy("ค้นหารายการ / supplier / โมดูล", "Search description / supplier / module", "品名・仕入先・モジュールで検索")} />
        <button className={`chip${unmappedOnly ? " on" : ""}`} type="button" aria-pressed={unmappedOnly} disabled={!summary} onClick={() => setUnmappedOnly((current) => !current)}>{copy("เฉพาะที่ยังไม่จัดหมวด ERP", "Unmapped ERP only", "ERP未分類のみ")}</button>
        <button className="chip" type="button" disabled={filtering} onClick={() => setExpanded(new Set(sections.map((section) => section.key)))}><Icon name="chevronDown" /> {copy("ขยายทุกหมวด", "Expand all", "すべて開く")}</button>
        <button className="chip" type="button" disabled={filtering || !expanded.size} onClick={() => setExpanded(new Set())}><Icon name="chevronRight" /> {copy("ย่อทุกหมวด", "Collapse all", "すべて閉じる")}</button>
        <span className="spacer" />
        {filtering ? <span className="muted small">{copy(`พบ ${shownLines.length} จาก ${lineCount} รายการ`, `${shownLines.length} of ${lineCount} lines match`, `${lineCount}件中${shownLines.length}件が一致`)}</span>
          : expanded.size ? <span className="muted small">{copy(`เปิดอยู่ ${expanded.size} จาก ${sections.length} หมวด`, `${expanded.size} of ${sections.length} sections open`, `${sections.length}区分中${expanded.size}区分を展開中`)}</span>
          : summary?.capabilities.canEditMappings ? <span className="muted small">{copy("กดหมวดเพื่อดูรายการและจัดหมวด ERP", "Open a section to see its lines and set ERP categories", "区分をクリックすると明細とERP分類を編集できます")}</span> : null}
        {filtering ? <button className="btn ghost" type="button" onClick={resetFilters}><Icon name="x" />{copy("ล้างตัวกรอง", "Clear filters", "フィルター解除")}</button> : null}
      </div>
      {summary?.capabilities.canEditMappings && (shownErpKeys.length > 0 || filtering) ? <div className="toolbar erp-bulk-bar">
        <label className="checkbox-row"><input type="checkbox" checked={allShownSelected} disabled={!canEdit || !shownErpKeys.length} onChange={(event) => toggleKeys(shownErpKeys, event.target.checked)} /><span>{selectedShown.length ? copy(`เลือกแล้ว ${selectedShown.length} รายการ`, `${selectedShown.length} selected`, `${selectedShown.length}件選択中`) : copy("เลือกทั้งหมดที่แสดง", "Select all shown", "表示中をすべて選択")}</span></label>
        <label className="select-field"><span className="sr-only">{copy("หมวด ERP สำหรับรายการที่เลือก", "ERP category for selected lines", "選択行のERP分類")}</span><select value={bulkCategory} aria-label={copy("หมวด ERP สำหรับรายการที่เลือก", "ERP category for selected lines", "選択行のERP分類")} onChange={(event) => setBulkCategory(event.target.value as DraftCategory)}>{ERP_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}<option value="Unmapped">{unmappedLabel}</option></select><Icon name="chevronDown" /></label>
        <button className="btn default" type="button" disabled={!canEdit || !selectedShown.length} onClick={applyBulk}><Icon name="check" />{copy("กำหนดหมวดที่เลือก", "Apply to selected", "選択行に適用")}</button>
        <button className="btn default" type="button" disabled={!canEdit || !shownErpKeys.length} title={copy("แนะนำจากหมวดภายใน เช่น 03 Electrical → Hardware, 06 Engineering → Service, 08 Transportation → Installation", "Suggest from internal category, e.g. 03 Electrical → Hardware, 06 Engineering → Service, 08 Transportation → Installation", "内部分類から提案（例: 03 Electrical → Hardware）")} onClick={applySuggestions}><Icon name="cpu" />{selectedShown.length ? copy("แนะนำหมวดให้ที่เลือก", "Suggest for selected", "選択行に提案") : copy("แนะนำหมวดอัตโนมัติ", "Suggest categories", "分類を自動提案")}</button>
        {selectedShown.length ? <button className="btn ghost" type="button" onClick={() => setSelected(new Set())}>{copy("ล้างการเลือก", "Clear selection", "選択解除")}</button> : null}
      </div> : null}

      <div className="table-wrap"><table className="cost-breakdown erp-lines">
        <thead><tr>
          <th className="cb-num-col">#</th>
          <th><LocalizedText text={"Description"} /></th>
          <th className="num cb-qty-col"><LocalizedText text={"Qty"} /></th>
          <th className="cb-unit-col"><LocalizedText text={"Unit"} /></th>
          <th className="cb-source-col">{copy("ทำเอง / จ้างภายนอก", "In-house / Outsourced", "内製 / 外注")}</th>
          <th className="num cb-money-col"><LocalizedText text={"Unit cost"} /></th>
          <th className="num cb-money-col"><LocalizedText text={"Amount"} /></th>
          <th className="cb-erp-col">{copy("หมวด ERP", "ERP category", "ERP分類")}</th>
        </tr></thead>
        {visibleSections.map(renderSection)}
        {/* The footer (and its Contingency ERP editor) must stay reachable even when a filter matches no line — e.g. when Contingency is the last unmapped line. */}
        {!visibleSections.length ? <tbody><tr className="cb-empty"><td colSpan={8}>
          <Icon name="filter" /> {copy("ไม่พบรายการตามตัวกรอง", "No lines match the filters", "条件に一致する明細がありません")}
          {unmappedOnly && contingencyErp && draftOf(contingencyErp) === "Unmapped" ? <> — {copy("เหลือเฉพาะ Contingency ด้านล่างที่ยังไม่จัดหมวด", "only Contingency below is still unmapped", "未分類は下のContingencyのみです")}</> : null}
          <button className="btn ghost" type="button" onClick={resetFilters}><Icon name="x" />{copy("ล้างตัวกรอง", "Clear filters", "フィルター解除")}</button>
        </td></tr></tbody> : null}
        {/* Estimate-level figures stay visible under any filter; the contingency ERP category is only editable here. */}
        <tfoot>
          <tr className="cb-foot"><td colSpan={6} className="num">{copy("รวมก่อนเงินเผื่อสำรอง", "Subtotal", "小計")}</td><td className="num">{money(Number(totals.subtotal))}</td><td /></tr>
          <tr className={`cb-foot${contingencyErp && draftOf(contingencyErp) === "Unmapped" ? " cb-unmapped" : ""}`}><td colSpan={6} className="num"><LocalizedText text={"Contingency"} /> {quantity(Number(contingencyRate))}%</td><td className="num">{money(Number(totals.contingency))}</td><td className="cb-erp-col">{contingencyErp ? erpSelect(contingencyErp, "Contingency") : null}</td></tr>
          <tr className="cb-total"><td colSpan={6} className="num"><LocalizedText text={"Total estimated cost"} /></td><td className="num"><strong>{money(Number(totals.total))}</strong></td><td /></tr>
        </tfoot>
      </table></div>
    </> : <EmptyState icon="package" title={copy("ยังไม่มีรายการต้นทุน", "No cost lines yet", "原価明細がありません")} message={copy("เพิ่มรายการในแท็บ Cost Items, Man-hour หรือ Other cost แล้วรายการจะแสดงที่นี่", "Add lines in Cost Items, Man-hour or Other cost and they appear here.", "Cost Items・Man-hour・Other costタブで明細を追加するとここに表示されます。")} />}

    {summary ? <>
      <div className="estimate-summary-note">
        <div className="row"><strong>{copy("หมายเหตุรวม", "Summary Remark", "見積全体の備考")}</strong><span className="spacer" />
          {workspace.capabilities.canEditAllSections ? <button type="button" className="btn default sm" disabled={busy || reorderBusy || changedLines.length > 0} onClick={() => setEditingModule({ key: "summary", title: "Summary" })}>{copy("แก้ไขหมายเหตุ", "Edit remark", "備考を編集")}</button> : null}
        </div>
        <p style={{ whiteSpace: "pre-wrap" }}>{moduleDetails.find(detail => detail.moduleKey === "summary")?.remark || "—"}</p>
      </div>
      <div className="panel-actions">
        {changedLines.length ? <button className="btn ghost" type="button" disabled={busy} onClick={() => { setDrafts(Object.fromEntries(summary.lines.map((line) => [erpKey(line), line.erpCategory]))); }}>{copy("ยกเลิกที่แก้ไข", "Discard changes", "変更を破棄")}</button> : null}
        <span className="spacer" />
        {changedLines.length ? <button className="btn default" type="button" disabled={busy} onClick={() => { void save(); }}><Icon name="check" />{busy ? copy("กำลังบันทึก…", "Saving…", "保存中…") : copy(`บันทึก ${changedLines.length} หมวด`, `Save ${changedLines.length} mapping(s)`, `${changedLines.length}件の分類を保存`)}</button> : null}
        <button className="btn default" type="button" onClick={() => setPreview(true)}>{copy("ดูตัวอย่างก่อน Export", "Preview export", "出力プレビュー")}</button>
        <button className="btn primary" type="button" disabled={workspace.header.status !== "Approved" || busy || changedLines.length > 0 || !summary.capabilities.canExport || !approvedOverhead} onClick={() => { void exportWorkbook(); }}><Icon name="download" />{copy("Export Excel สำหรับ ERP", "Export ERP Excel", "ERP Excelを出力")}</button>
      </div>
      {workspace.header.status !== "Approved" ? <div className="info-strip amber">{copy("ดูตัวอย่างได้ — ต้องอนุมัติ Estimate ก่อน Export", "Preview is available. Approve this estimate before export.", "出力前に見積を承認してください。")}</div> : null}
      {!approvedOverhead ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("ต้องกำหนดและอนุมัติ Overhead ก่อน Export ERP", "Set and approve Overhead before ERP export.", "ERP出力前に間接費を設定・承認してください。")}</span></div> : null}
      {changedLines.length ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("บันทึกหมวดที่แก้ไขก่อน Export", "Save mapping changes before export.", "エクスポート前に分類変更を保存してください。")}</span></div> : null}
    </> : null}
    {preview && summary ? <Modal size="wide" title={copy("ตัวอย่างข้อมูล Export ERP", "ERP export data preview", "ERP出力データのプレビュー")} subtitle={workspace.header.number + " · R" + workspace.header.revision + " · " + workspace.header.status} onClose={() => setPreview(false)}>
      <p>{workspace.header.projectName} · {workspace.header.customerName}</p>
      <div className="info-strip amber">{copy("ตัวอย่างข้อมูลที่บันทึกแล้วสำหรับไฟล์ ERP — ไม่ใช่การส่งออก", "Preview of saved ERP workbook data — no file is exported.", "保存済みERPデータのプレビューです。")}{changedLines.length ? copy(" มีการแก้ไขที่ยังไม่ได้บันทึก", " Unsaved mapping changes are not included.", " 未保存の変更は含まれません。") : ""}</div>
      {[...ERP_COST_CATEGORIES, "Unmapped"].map((category) => {
        const rows = summary.lines.filter((line) => line.erpCategory === category);
        return <section key={category}><h3>{category} · {money(rows.reduce((sum, line) => sum + line.amount, 0))}</h3>
          {sections.flatMap(section => breakdownModules(section).map(module => ({ section, module, rows: module.lines.map(erpOf).filter((line): line is ErpLine => Boolean(line) && line!.erpCategory === category) })))
            .filter(group => group.rows.length).map(({ section, module, rows: children }) => {
              const detail = moduleDetail(section, module);
              return <details key={module.key} className="panel" style={{ padding: 12, marginBottom: 8 }}>
                <summary style={{ cursor: "pointer" }}><strong>{detail.title}</strong> · {children.length} lines · {money(children.reduce((sum, line) => sum + line.amount, 0))}</summary>
                {detail.descriptionRows.map((row, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{row}</p>)}
                <div className="table-wrap"><table><thead><tr><th>Description</th><th>Supplier</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Amount</th><th>Remark</th></tr></thead>
                  <tbody>{children.map(line => <tr key={erpKey(line)}><td>{line.description}{(() => { const header=workspace.costItems.find(item=>item.id===line.sourceId&&item.isPriceSet&&line.sourceType==="CostItem"); const components=header?workspace.costItems.filter(item=>item.priceSetKey===header.priceSetKey&&!item.isPriceSet):[]; return components.length?<details><summary>อุปกรณ์ในเซ็ต ({components.length})</summary><ul>{components.map(item=><li key={item.id}>{item.itemCode} · {item.description} · {item.quantity} {item.unit} — รวมในราคาเซ็ต</li>)}</ul></details>:null; })()}</td><td>{line.supplier || "—"}</td><td>{line.quantity ?? "—"}</td><td>{line.unit || "—"}</td><td>{line.unitPrice == null ? "—" : money(line.unitPrice)}</td><td>{money(line.amount)}</td><td>{line.remark || "—"}</td></tr>)}</tbody>
                </table></div>
              </details>;
            })}
          {rows.filter(line => line.sourceType === "Contingency").map(line => <p key={erpKey(line)}>{line.description} · {money(line.amount)}</p>)}
          {!rows.length ? <p>—</p> : null}
        </section>;
      })}
      {moduleDetails.find(detail => detail.moduleKey === "summary")?.remark ? <section className="estimate-summary-note"><strong>Summary Remark</strong><p style={{ whiteSpace: "pre-wrap" }}>{moduleDetails.find(detail => detail.moduleKey === "summary")?.remark}</p></section> : null}
      <p><strong>{copy("รวมต้นทุน", "Total estimated cost", "見積原価合計")}: {money(summary.canonicalTotal)}</strong></p>
    </Modal> : null}
    {editingModule ? <EstimateModuleEditor workspace={workspace} moduleKey={editingModule.key} initialTitle={editingModule.title} onClose={() => setEditingModule(null)} onSaved={async () => { await onChanged("Module details updated"); await load(); }} /> : null}
  </Panel>;
}
