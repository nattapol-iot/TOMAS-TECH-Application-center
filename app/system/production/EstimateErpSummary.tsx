"use client";

import { EstimateModuleQuantityCells } from "./EstimateModuleQuantityCells";
import { EstimateModuleEditor } from "./EstimateModuleEditor";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { buildErpEstimateWorkbook, downloadErpEstimateWorkbookBytes, ERP_COST_CATEGORIES, ERP_ESTIMATE_TEMPLATE_VERSION } from "../../../lib/erp-estimate-workbook";
import { automaticLaborCategory, suggestErpCategory } from "../../../lib/erp-category-suggest";
import { LABOR_MODULE_NAMES, groupErpLaborSections, breakdownModules, breakdownLineCount, buildEstimateCostBreakdown, type BreakdownLine, type BreakdownSection } from "../../../lib/estimate-cost-breakdown";
import { ESTIMATE_OVERHEAD_ENABLED } from "../../../lib/feature-flags";
import { foldErpGroupLines, erpGroupsByMember, splitRowsByCategory, type ErpGroup } from "../../../lib/erp-estimate-groups";
import {
  loadEstimateErpSummary,
  loadEstimateModuleDetails,
  updateEstimateModuleDetails,
  type EstimateModuleDetail,
  recordEstimateErpExport,
  updateEstimateErpMappings,
  createEstimateErpGroup,
  updateEstimateErpGroup,
  deleteEstimateErpGroup,
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
/** One row of the sheet: a module, a standalone item or a merged line, under the ERP category it is exported beneath. */
type SummaryRow = {
  key: string; title: string; lines: BreakdownLine[]; standalone: boolean; merged: number | null;
  source: BreakdownSection; amount: number; inHouse: number; outsourced: number;
};
type ErpHeading = { key: string; category: string; ordinal: number; rows: SummaryRow[]; allRows: SummaryRow[]; amount: number; lineCount: number };
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

export function EstimateErpSummaryPanel({ workspace, onChanged, notify, onOpenCategory, reorderBusy }: {
  workspace: EstimateCostWorkspace;
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
  const [categoryFilter, setCategoryFilter] = useState("");
  const unmappedOnly = categoryFilter === "Unmapped";
  const toggleCategory = (category: string) => setCategoryFilter((current) => current === category ? "" : category);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<DraftCategory>("Hardware");
  const [merge, setMerge] = useState<{ title: string; group: ErpGroup | null; members: Array<{ sourceType: EstimateErpSourceType; sourceId: number }> } | null>(null);
  /* A heading added by hand is a drop target and nothing more: it holds no line,
     so it lives in this view only and is gone on the next load. */
  const [addedCategories, setAddedCategories] = useState<string[]>([]);
  const [draggedRow, setDraggedRow] = useState<{ key: string; erpKeys: string[]; category: string } | null>(null);
  const [dropCategory, setDropCategory] = useState("");

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
  const sections = useMemo(() => {
    const labour = (summary?.lines ?? []).filter(line => line.sourceType === "ManhourLine");
    /* A draft that is not saved yet still decides which section the line sits in,
       so the row moves under the heading it will be exported beneath. */
    const category = (line: EstimateErpSummary["lines"][number]) => drafts[erpKey(line)] ?? line.erpCategory;
    return groupErpLaborSections(buildEstimateCostBreakdown(workspace, labels),
      new Map(labour.map(line => ["manhour:" + line.sourceId, category(line)])),
      new Set(labour.filter(line => line.manualOverride || category(line) !== line.erpCategory).map(line => "manhour:" + line.sourceId)));
  }, [workspace, labels, summary, drafts]);
  const moduleDetail = (section: BreakdownSection, module: { key: string; title: string }) => {
    const key = section.kind === "manhour" && LABOR_MODULE_NAMES[section.title] ? section.key : module.key;
    const detail = moduleDetails.find(row => row.moduleKey === key);
    return { key, title: section.kind === "cost-items" ? module.title : detail?.title ?? module.title, descriptionRows: detail?.descriptionRows ?? [], quantity: detail?.quantity ?? 1, unit: detail?.unit ?? "Set" };
  };
  const erpByKey = useMemo(() => new Map((summary?.lines ?? []).map((line) => [erpKey(line), line])), [summary]);
  /* A merged line is how the ERP sheet is written, so it is also one row here —
     it outranks the module its members belong to, and the members keep their own
     amounts, categories and identities underneath. */
  const groups = useMemo(() => summary?.groups ?? [], [summary]);
  const groupsByMember = useMemo(() => erpGroupsByMember(groups), [groups]);
  const groupOf = useCallback((line: BreakdownLine) => {
    const key = erpKeyOfBreakdown(line.key);
    const group = key ? groupsByMember.get(key) : undefined;
    return group ? { id: group.id, title: group.title } : null;
  }, [groupsByMember]);
  const modulesOf = useCallback((section: BreakdownSection) => breakdownModules(section, groupOf), [groupOf]);
  const erpOf = useCallback((line: BreakdownLine) => { const key = erpKeyOfBreakdown(line.key); return key ? erpByKey.get(key) : undefined; }, [erpByKey]);
  const draftOf = (erp: ErpLine) => drafts[erpKey(erp)] ?? erp.erpCategory;
  const contingencyErp = summary?.lines.find((line) => line.sourceType === "Contingency") ?? null;
  const suggestions = useMemo(() => Object.fromEntries((summary?.lines ?? []).map((line) => [erpKey(line), suggestErpCategory(line)])), [summary]);
  const changedLines = useMemo(() => summary?.lines.filter((line) => {
    const draft = drafts[erpKey(line)];
    return draft !== undefined && draft !== line.erpCategory;
  }) ?? [], [drafts, summary]);

  const needle = search.trim().toLowerCase();
  const filtering = needle !== "" || categoryFilter !== "";
  /* The page is the ERP sheet, so its headings are the ERP categories. A row is a
     module, a standalone item or a merged line; a module whose own lines do not
     agree on a category appears under each heading carrying only the part that
     belongs there, because the sheet cannot write it twice in full. */
  const headings = useMemo<ErpHeading[]>(() => {
    const collected = new Map<string, SummaryRow[]>();
    const categoryOf = (line: BreakdownLine) => { const erp = erpOf(line); return erp ? drafts[erpKey(erp)] ?? erp.erpCategory : "Unmapped"; };
    for (const section of sections) for (const part of splitRowsByCategory(modulesOf(section), categoryOf)) {
      const rows = collected.get(part.category) ?? [];
      rows.push({
        key: part.key, title: part.row.title, lines: part.lines,
        standalone: part.row.standalone, merged: part.row.merged, source: section,
        amount: part.lines.reduce((total, line) => total + line.amount, 0),
        inHouse: part.lines.filter((line) => line.source === "in-house").reduce((total, line) => total + line.amount, 0),
        outsourced: part.lines.filter((line) => line.source === "outsourced").reduce((total, line) => total + line.amount, 0),
      });
      collected.set(part.category, rows);
    }
    return [...ERP_COST_CATEGORIES, "Unmapped"]
      .filter((category) => collected.has(category) || addedCategories.includes(category))
      .map((category, index) => {
        const allRows = collected.get(category) ?? [];
        const rows = filtering
          ? allRows.filter((row) => row.lines.some((line) => lineMatches(line, needle)) && (!categoryFilter || categoryFilter === category))
          : allRows;
        return { key: "erp:" + category, category, ordinal: index + 1, rows, allRows,
          amount: allRows.reduce((total, row) => total + row.amount, 0),
          lineCount: allRows.reduce((total, row) => total + row.lines.length, 0) };
      })
      .filter((heading) => !filtering || heading.rows.length);
  }, [sections, modulesOf, erpOf, drafts, addedCategories, filtering, categoryFilter, needle]);
  const isExpanded = (key: string) => filtering || expanded.has(key);
  const shownLines = headings.flatMap((heading) => isExpanded(heading.key) ? heading.rows.flatMap((row) => row.lines) : []);
  const shownErpKeys = shownLines.map((line) => erpKeyOfBreakdown(line.key)).filter((key): key is string => key !== null && erpByKey.has(key));
  const selectedShown = shownErpKeys.filter((key) => selected.has(key));
  const allShownSelected = shownErpKeys.length > 0 && selectedShown.length === shownErpKeys.length;
  /* One merged row carries one ERP category — which, under these headings, simply
     means the lines have to be sitting under the same one. */
  const mergeable = selectedShown.length >= 2 && changedLines.length === 0
    && new Set(selectedShown.map((key) => draftOf(erpByKey.get(key)!))).size === 1
    && selectedShown.every((key) => !groupsByMember.has(key));
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
  /* Every selected line takes the category, labour included: the rule that derives
     a labour category is a default, not a veto, and the count in the toast used to
     include lines this quietly skipped. */
  const setDraftFor = (keys: string[], category: DraftCategory) => setDrafts((current) => {
    const next = { ...current };
    for (const key of keys) if (erpByKey.has(key)) next[key] = category;
    return next;
  });
  /* Merging and splitting change no cost line, so both reload rather than keep a
     local draft: the server owns which lines a merged line holds. */
  const saveMerge = async () => {
    const draft = merge;
    if (!draft || !draft.title.trim()) return;
    setBusy(true); setError("");
    try {
      if (draft.group) {
        await updateEstimateErpGroup(workspace.header.id, draft.group.id, workspace.header.rowVersion, draft.group.rowVersion,
          { title: draft.title.trim(), quantity: draft.group.quantity, unit: draft.group.unit });
      } else {
        await createEstimateErpGroup(workspace.header.id, workspace.header.rowVersion, { title: draft.title.trim(), members: draft.members });
      }
      setMerge(null); setSelected(new Set());
      await onChanged(draft.group ? copy("เปลี่ยนชื่อบรรทัดรวมแล้ว", "Merged line renamed", "まとめた行の名前を変更しました") : copy("รวมเป็นบรรทัดเดียวแล้ว", "Lines merged", "行をまとめました"));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The merged line could not be saved.");
    } finally { setBusy(false); }
  };
  const splitGroup = async (group: ErpGroup) => {
    setBusy(true); setError("");
    try {
      await deleteEstimateErpGroup(workspace.header.id, group.id, workspace.header.rowVersion);
      await onChanged(copy("แยกกลับเป็นรายการเดิมแล้ว", "Merged line split", "まとめを解除しました"));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The merged line could not be split.");
    } finally { setBusy(false); }
  };
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
  const resetFilters = () => { setSearch(""); setCategoryFilter(""); };

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
          // Merged lines are written as one row; the amounts behind them are unchanged.
          lines: foldErpGroupLines(summary.lines, groups).map((line) => ({
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


  /* Moving a row to another heading is how a line is classified, so a drag lands on
     a heading rather than on a position. The order inside a heading follows the
     ledgers the rows came from; the sheet does not get to decide it. */
  const dragReady = canEdit && !loading && !filtering;
  const clearRowDrag = () => { setDraggedRow(null); setDropCategory(""); };
  const allowRowDrop = (event: React.DragEvent, category: string) => {
    if (!dragReady || !draggedRow || draggedRow.category === category) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropCategory(category);
  };
  const dropRowInto = (event: React.DragEvent, category: string) => {
    event.preventDefault();
    const row = draggedRow;
    clearRowDrag();
    if (!dragReady || !row || row.category === category) return;
    setDraftFor(row.erpKeys, category as DraftCategory);
  };
  const unusedCategories = ERP_COST_CATEGORIES.filter((category) => !headings.some((heading) => heading.category === category));

  const renderRow = (heading: ErpHeading, row: SummaryRow, index: number) => {
    const section = row.source;
    const keys = row.lines.map((line) => erpKeyOfBreakdown(line.key)).filter((key): key is string => key !== null && erpByKey.has(key));
    /* Labour still derives a category from cost type, provider and discipline.
       Offering that value back as one click makes an override visible and
       reversible, instead of a divergence nobody can see or undo. */
    const derivedSet = new Set(keys.map((key) => automaticLaborCategory(erpByKey.get(key)!)).filter((value) => value !== null));
    const derived = derivedSet.size === 1 ? [...derivedSet][0]! : null;
    const isSelected = keys.length > 0 && keys.every((key) => selected.has(key));
    const detail = moduleDetail(section, row);
    /* A merged row belongs to the ERP sheet, not to a module: its name, quantity
       and unit live on the group, and the module editors that would rename a real
       module are not offered on it. */
    const merged = row.merged === null ? null : groups.find((entry) => entry.id === row.merged) ?? null;
    const rowQuantity = merged ? merged.quantity : row.standalone ? row.lines[0].quantity : detail.quantity;
    const rowUnit = merged ? merged.unit : row.standalone ? row.lines[0].unit : detail.unit;
    const canEditModule = !row.standalone && !merged && (section.kind === "cost-items" ? workspace.capabilities.canEditCostItems : section.kind === "manhour" && Boolean(LABOR_MODULE_NAMES[section.title]) && workspace.capabilities.canEditAllSections);
    /* Quantity and unit are how the row is written on the ERP sheet. On a cost
       module they also rescale its items; on the other ledgers the amount comes
       from the lines themselves, so they only change how it is expressed. */
    const canEditUnit = !row.standalone && (section.kind === "cost-items" ? workspace.capabilities.canEditCostItems
      : section.kind === "manhour" ? Boolean(LABOR_MODULE_NAMES[section.title]) && workspace.capabilities.canEditAllSections
      : section.kind === "expenses" ? workspace.capabilities.canEditExpenses
      : workspace.capabilities.canEditOtherCosts);
    return <Fragment key={row.key}><tr className={"cb-line" + (isSelected ? " selected" : "")}
      onDragOver={(event) => allowRowDrop(event, heading.category)}
      onDrop={(event) => dropRowInto(event, heading.category)}>
      <td className="cb-num-col muted">
        {canEdit && keys.length ? <input type="checkbox" className="cb-check" checked={isSelected} aria-label={"Select " + row.title} onChange={(event) => toggleKeys(keys, event.target.checked)} /> : null}
        {heading.ordinal}-{index + 1}
      </td>
      <td><div className="cell-primary cb-desc"><strong>{merged ? merged.title : detail.title}</strong>{merged ? null : detail.descriptionRows.map((line, position) => <span key={position} style={{ whiteSpace: "pre-wrap" }}>{line}</span>)}<span>
        {merged ? <span className="badge blue">{copy("รวมบนใบ ERP", "Merged on the ERP sheet", "ERPシートで1行")}</span> : null}
        {/* Where the money actually lives: the row is classified here, but it is still that ledger's cost. */}
        <span className="cb-code">{section.categoryCode ? section.categoryCode + " " + section.title : section.title}</span>
        {row.lines.length} {copy("รายการต้นทุน", "cost lines", "原価明細")}</span></div>
        <button type="button" className="chip" aria-expanded={openModules.has(row.key)} onClick={() => setOpenModules(current => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}>{openModules.has(row.key) ? "ย่อรายการ / Hide details" : "ดูรายการต้นทุน / View cost lines"}</button>
        {merged ? <>
          <button type="button" className="chip" disabled={!canEdit || busy} onClick={() => setMerge({ title: merged.title, group: merged, members: [] })}>{copy("เปลี่ยนชื่อ", "Rename", "名前を変更")}</button>
          <button type="button" className="chip" disabled={!canEdit || busy} onClick={() => { void splitGroup(merged); }}>{copy("แยกกลับเป็นรายการเดิม", "Split back into lines", "まとめを解除")}</button>
        </> : <>
          {canEditModule ? <button type="button" className="chip" disabled={busy || reorderBusy || changedLines.length > 0} onClick={() => setEditingModule(detail)}>แก้ไขโมดูล / Edit module</button> : null}
          {section.categoryCode && onOpenCategory ? <button type="button" className="chip" onClick={() => onOpenCategory(section.categoryCode!, row.standalone ? undefined : row.title, row.standalone ? Number(row.lines[0].key.split(":")[1]) : undefined)}>{row.standalone ? "แก้ไขรายการ / Edit item" : copy("เปิดโมดูล / แก้ไข", "Open module / edit", "モジュールを編集")}</button> : null}
        </>}
      </td>
      {canEditUnit || merged ? <EstimateModuleQuantityCells key={`${row.key}:${rowQuantity}:${rowUnit}`} name={merged ? merged.title : detail.title} quantity={rowQuantity} unit={rowUnit} showCostRatio={!merged && section.kind === "cost-items"}
        units={moduleDetails.map(entry => entry.unit ?? "Set")} disabled={(merged ? !canEdit : false) || busy || reorderBusy || loading || changedLines.length > 0}
        onSave={async (nextQuantity, nextUnit) => {
          setBusy(true);
          try {
            if (merged) await updateEstimateErpGroup(workspace.header.id, merged.id, workspace.header.rowVersion, merged.rowVersion, { title: merged.title, quantity: nextQuantity, unit: nextUnit });
            else await updateEstimateModuleDetails(workspace.header.id, workspace.header.rowVersion, { moduleKey: detail.key, title: detail.title, remark: null, quantity: nextQuantity, unit: nextUnit });
            await onChanged("Module quantity / unit updated"); await load();
          } finally { setBusy(false); }
        }} /> : <><td className="num">{quantity(rowQuantity)}</td><td>{rowUnit}</td></>}
      <td><div className="cell-primary"><span>{inHouseLabel}: {money(row.inHouse)}</span><span>{outsourcedLabel}: {money(row.outsourced)}</span></div></td>
      <td className="num">{row.lines.some((line) => line.awaitingPrice) ? <span className="soft-warn">{copy("รอราคา", "Awaiting price", "価格待ち")}</span> : !merged && row.standalone ? money(row.lines[0].unitCost) : money(row.amount / rowQuantity)}</td>
      <td className="num"><strong>{money(row.amount)}</strong></td>
      <td className="cb-erp-col"><div className="cb-module-controls">
        <select disabled={!canEdit || !keys.length} aria-label={"ERP category for " + row.title} value={heading.category} onChange={(event) => setDraftFor(keys, event.target.value as DraftCategory)}>
          <option value="Unmapped">{unmappedLabel}</option>
          {ERP_COST_CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
        </select>
        {derived && heading.category !== derived ? <button type="button" className="chip" disabled={!canEdit} title={copy(`ระบบจัดหมวดนี้เป็น ${derived} จาก cost type / ผู้ให้บริการ / แผนก — กดเพื่อคืนค่าอัตโนมัติ`, `The labour rule reads this as ${derived} from cost type, provider and discipline — click to hand it back`, `労務ルールでは ${derived} です — クリックで自動に戻す`)} onClick={() => setDraftFor(keys, derived as DraftCategory)}>↺ {derived}</button> : null}
        <span className="row-actions"><button type="button" className="icon-btn cost-drag-handle" draggable={dragReady} disabled={!dragReady} title={filtering ? copy("ล้างตัวกรองก่อนจึงจะย้ายได้", "Clear the filters to move a row", "移動するにはフィルターを解除してください") : copy("ลากไปวางที่หัวข้ออื่นเพื่อเปลี่ยนหมวด ERP", "Drag onto another heading to change the ERP category", "他の見出しにドラッグしてERP分類を変更")} aria-label={"Drag " + row.title + " to another ERP category"}
          onDragStart={(event) => { setDraggedRow({ key: row.key, erpKeys: keys, category: heading.category }); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", row.key); }} onDragEnd={clearRowDrag}>⠿</button></span>
      </div></td>
    </tr>{openModules.has(row.key) ? row.lines.map(line => <tr key={line.key} className="cb-line">
      <td /><td style={{ paddingLeft: 28 }}>{line.title}<div className="muted">{line.details.join(" · ")}</div></td>
      <td className="num">{quantity(line.quantity)}</td><td>{line.unit}</td><td>{line.source === "in-house" ? inHouseLabel : outsourcedLabel}</td>
      <td className="num">{line.priceSetKey && !line.isPriceSet ? copy("รวมในราคาเซ็ต", "Included in the set price", "セット価格に含む") : money(line.unitCost)}</td><td className="num">{line.priceSetKey && !line.isPriceSet ? "—" : money(line.amount)}</td><td>{line.priceSetKey && !line.isPriceSet ? copy("รวมในราคาเซ็ต", "Included in the set price", "セット価格に含む") : erpOf(line)?.erpCategory ?? unmappedLabel}</td>
    </tr>) : null}</Fragment>;
  };

  const renderHeading = (heading: ErpHeading) => {
    const open = isExpanded(heading.key);
    const headingKeys = heading.rows.flatMap((row) => row.lines.map((line) => erpKeyOfBreakdown(line.key))).filter((key): key is string => key !== null && erpByKey.has(key));
    const headingSelected = headingKeys.length > 0 && headingKeys.every((key) => selected.has(key));
    const empty = heading.allRows.length === 0;
    const inHouse = heading.allRows.reduce((total, row) => total + row.inHouse, 0);
    const outsourced = heading.allRows.reduce((total, row) => total + row.outsourced, 0);
    return <tbody key={heading.key}>
      <tr className={`cb-section${open ? " open" : ""}${dropCategory === heading.category ? " cost-drop-module" : ""}`} aria-expanded={open}
        onClick={() => { if (!filtering && !empty) toggleSection(heading.key); }}
        onDragOver={(event) => allowRowDrop(event, heading.category)}
        onDrop={(event) => dropRowInto(event, heading.category)}>
        <td className="cb-num-col">
          <button type="button" className="cb-toggle" aria-label={open ? copy("ย่อหัวข้อ", "Collapse heading", "見出しを閉じる") : copy("ขยายหัวข้อ", "Expand heading", "見出しを開く")} disabled={filtering || empty} onClick={(event) => { event.stopPropagation(); toggleSection(heading.key); }}>
            <Icon name={open ? "chevronDown" : "chevronRight"} />
          </button>
          <strong>{heading.ordinal}</strong>
        </td>
        <td>
          <strong className="cb-title">{heading.category === "Unmapped" ? unmappedLabel : heading.category}</strong>
          {empty ? <span className="muted small"> {copy("ลากรายการมาวางที่หัวข้อนี้", "Drag a row onto this heading", "この見出しに行をドラッグ")}</span> : null}
        </td>
        <td colSpan={3} className="cb-section-split"><span className="cb-split">
          {inHouse ? <span className="cb-split-inhouse"><strong>{inHouseLabel}:</strong> {money(inHouse)}</span> : null}
          {outsourced ? <span className="cb-split-outsourced"><strong>{outsourcedLabel}:</strong> {money(outsourced)}</span> : null}
        </span></td>
        <td className="num muted">{heading.rows.length !== heading.allRows.length ? `${heading.rows.length}/${heading.allRows.length}` : heading.allRows.length} <LocalizedText text={"item"} /></td>
        <td className="num"><strong>{money(heading.amount)}</strong></td>
        <td className="cb-erp-col" onClick={(event) => event.stopPropagation()}>
          <div className="cb-erp-status">
            {canEdit && open && headingKeys.length ? <input type="checkbox" className="cb-check" checked={headingSelected} title={copy("เลือกทั้งหัวข้อ", "Select the whole heading", "見出し内をすべて選択")} aria-label={copy(`เลือกทุกรายการใน ${heading.category}`, `Select every row in ${heading.category}`, `${heading.category}の行をすべて選択`)} onChange={(event) => toggleKeys(headingKeys, event.target.checked)} /> : null}
            {empty && addedCategories.includes(heading.category) ? <button type="button" className="icon-btn danger" aria-label={`Remove the ${heading.category} heading`} title={copy("เอาหัวข้อว่างออก", "Remove the empty heading", "空の見出しを削除")} onClick={() => setAddedCategories((current) => current.filter((entry) => entry !== heading.category))}><Icon name="x" /></button> : null}
          </div>
        </td>
      </tr>
      {open ? heading.rows.map((row, index) => renderRow(heading, row, index)) : null}
    </tbody>;
  };

  const statusStrip = summary ? <div className={`info-strip ${summary.unmapped.lineCount ? "amber" : summary.reconciled ? "green" : "red"}`}>
    <Icon name={!summary.unmapped.lineCount && summary.reconciled ? "checkCircle" : "alertTriangle"} />
    <span><strong>{summary.unmapped.lineCount ? copy(`ยังไม่ได้จัดหมวด ERP ${summary.unmapped.lineCount} รายการ`, `${summary.unmapped.lineCount} line(s) are not mapped to an ERP category`, `${summary.unmapped.lineCount}件がERP未分類です`) : summary.reconciled ? copy("ยอด ERP ตรงกับ Estimate", "ERP total matches the Estimate", "ERP合計は見積と一致しています") : copy(`ยอดต่างกัน ${money(summary.difference)}`, `Difference ${money(summary.difference)}`, `差額 ${money(summary.difference)}`)}</strong><br />{copy("7 หมวด", "7 categories", "7分類")} {money(summary.classifiedTotal)} + {unmappedLabel} {money(summary.unmapped.amount)}{ESTIMATE_OVERHEAD_ENABLED ? ` + Overhead ${money(overheadAmount)}` : ""} · Estimate {money(summary.canonicalTotal)}</span>
  </div> : null;

  return <Panel title={copy("ใบสรุปตามหมวด ERP", "The ERP sheet", "ERP区分の集計")} subtitle={copy(`${headings.length} หัวข้อ · ${lineCount} รายการ · ลากรายการไปวางที่หัวข้ออื่นเพื่อเปลี่ยนหมวด แล้วกดบันทึก · ต้นทุนภายในเท่านั้น`, `${headings.length} heading(s) · ${lineCount} line(s) · drag a row onto another heading to change its category, then save · internal cost only`, `${headings.length}見出し · ${lineCount}明細 · 行を別の見出しにドラッグして分類を変更し保存 · 内部原価のみ`)} flush>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span><button className="btn ghost" type="button" onClick={() => { void load(); }}><LocalizedText text={"Try again"} /></button></div> : null}
    {statusStrip}
    {summary ? (() => {
      /* ERP category names are contract values for the ERP import, so they are rendered verbatim (not through the UI translator). */
      const rows = [
        ...ERP_COST_CATEGORIES.map((category) => {
          const row = summary.categories.find((entry) => entry.category === category);
          return { category: category as string, label: category as string, amount: row?.amount ?? 0, lineCount: row?.lineCount ?? 0 };
        }),
        { category: "Unmapped", label: unmappedLabel, amount: summary.unmapped.amount, lineCount: summary.unmapped.lineCount },
      ];
      const funded = rows.filter((row) => row.lineCount > 0);
      const total = funded.reduce((sum, row) => sum + row.amount, 0);
      const tone = (row: typeof rows[number], index: number) => row.category === "Unmapped" ? "var(--amber)" : `var(--c${(index % 8) + 1})`;
      return <div className="erp-distribution">
        {/* The strip above already reconciles the total against the estimate;
            repeating it here would be the third printing of one number. This
            head says what the strip cannot: how many categories carry it. */}
        <div className="erp-distribution-head">
          <strong>{funded.length}</strong>
          <span>{copy(`จาก ${rows.length} หมวด ERP ที่มีต้นทุน`, `of ${rows.length} ERP categories carry cost`, `/ ${rows.length} ERP区分に原価あり`)}</span>
        </div>
        <div className="erp-distribution-bar">
          {funded.map((row, index) => <button
            key={row.category}
            type="button"
            className={`erp-seg${categoryFilter === row.category ? " active" : ""}`}
            style={{ flexGrow: Math.max(row.amount, total * 0.01), background: tone(row, index) }}
            aria-pressed={categoryFilter === row.category}
            title={`${row.label} · ${money(row.amount)} · ${row.lineCount} item`}
            onClick={() => toggleCategory(row.category)}
          />)}
        </div>
        <div className="erp-legend">
          {funded.map((row, index) => <button
            key={row.category}
            type="button"
            className={categoryFilter === row.category ? "active" : undefined}
            aria-pressed={categoryFilter === row.category}
            onClick={() => toggleCategory(row.category)}
          ><i className="erp-dot" style={{ background: tone(row, index) }} />{row.label}<strong>{money(row.amount)}</strong><em>{row.lineCount}</em></button>)}
        </div>
      </div>;
    })() : loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading ERP summary…"} /></div> : null}

    {sections.length ? <>
      <div className="toolbar erp-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder={copy("ค้นหารายการ / supplier / โมดูล", "Search description / supplier / module", "品名・仕入先・モジュールで検索")} />
        <button className={`chip${unmappedOnly ? " on" : ""}`} type="button" aria-pressed={unmappedOnly} disabled={!summary} onClick={() => toggleCategory("Unmapped")}>{copy("เฉพาะที่ยังไม่จัดหมวด ERP", "Unmapped ERP only", "ERP未分類のみ")}</button>
        <button className="chip" type="button" disabled={filtering} onClick={() => setExpanded(new Set(headings.map((heading) => heading.key)))}><Icon name="chevronDown" /> {copy("ขยายทุกหัวข้อ", "Expand all", "すべて開く")}</button>
        <button className="chip" type="button" disabled={filtering || !expanded.size} onClick={() => setExpanded(new Set())}><Icon name="chevronRight" /> {copy("ย่อทุกหัวข้อ", "Collapse all", "すべて閉じる")}</button>
        {/* A heading with nothing in it is only a place to drop a row, so it is added here and kept nowhere else. */}
        {canEdit && unusedCategories.length ? <label className="select-field"><span className="sr-only">{copy("เพิ่มหัวข้อหมวด ERP", "Add an ERP heading", "ERP見出しを追加")}</span>
          <select value="" aria-label={copy("เพิ่มหัวข้อหมวด ERP", "Add an ERP heading", "ERP見出しを追加")} onChange={(event) => { if (event.target.value) setAddedCategories((current) => [...current, event.target.value]); }}>
            <option value="">＋ {copy("เพิ่มหัวข้อ", "Add heading", "見出しを追加")}</option>
            {unusedCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select><Icon name="chevronDown" /></label> : null}
        <span className="spacer" />
        {filtering ? <span className="muted small">{copy(`พบ ${shownLines.length} จาก ${lineCount} รายการ`, `${shownLines.length} of ${lineCount} lines match`, `${lineCount}件中${shownLines.length}件が一致`)}</span>
          : expanded.size ? <span className="muted small">{copy(`เปิดอยู่ ${expanded.size} จาก ${headings.length} หัวข้อ`, `${expanded.size} of ${headings.length} headings open`, `${headings.length}見出し中${expanded.size}を展開中`)}</span>
          : summary?.capabilities.canEditMappings ? <span className="muted small">{copy("กดหัวข้อเพื่อดูรายการ แล้วลากย้ายหมวดได้", "Open a heading to see its rows, then drag them between headings", "見出しを開いて行を確認し、ドラッグで分類を変更できます")}</span> : null}
        {filtering ? <button className="btn ghost" type="button" onClick={resetFilters}><Icon name="x" />{copy("ล้างตัวกรอง", "Clear filters", "フィルター解除")}</button> : null}
      </div>
      {summary?.capabilities.canEditMappings && (shownErpKeys.length > 0 || filtering) ? <div className="toolbar erp-bulk-bar">
        <label className="checkbox-row"><input type="checkbox" checked={allShownSelected} disabled={!canEdit || !shownErpKeys.length} onChange={(event) => toggleKeys(shownErpKeys, event.target.checked)} /><span>{selectedShown.length ? copy(`เลือกแล้ว ${selectedShown.length} รายการ`, `${selectedShown.length} selected`, `${selectedShown.length}件選択中`) : copy("เลือกทั้งหมดที่แสดง", "Select all shown", "表示中をすべて選択")}</span></label>
        <label className="select-field"><span className="sr-only">{copy("หมวด ERP สำหรับรายการที่เลือก", "ERP category for selected lines", "選択行のERP分類")}</span><select value={bulkCategory} aria-label={copy("หมวด ERP สำหรับรายการที่เลือก", "ERP category for selected lines", "選択行のERP分類")} onChange={(event) => setBulkCategory(event.target.value as DraftCategory)}>{ERP_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}<option value="Unmapped">{unmappedLabel}</option></select><Icon name="chevronDown" /></label>
        <button className="btn default" type="button" disabled={!canEdit || !selectedShown.length} onClick={applyBulk}><Icon name="check" />{copy("กำหนดหมวดที่เลือก", "Apply to selected", "選択行に適用")}</button>
        <button className="btn default" type="button" disabled={!canEdit || !shownErpKeys.length} title={copy("แนะนำจากหมวดภายใน เช่น 03 Electrical → Hardware, 06 Engineering → Service, 08 Transportation → Installation", "Suggest from internal category, e.g. 03 Electrical → Hardware, 06 Engineering → Service, 08 Transportation → Installation", "内部分類から提案（例: 03 Electrical → Hardware）")} onClick={applySuggestions}><Icon name="cpu" />{selectedShown.length ? copy("แนะนำหมวดให้ที่เลือก", "Suggest for selected", "選択行に提案") : copy("แนะนำหมวดอัตโนมัติ", "Suggest categories", "分類を自動提案")}</button>
        <button className="btn default" type="button" disabled={!canEdit || !mergeable} title={copy("เขียนรายการที่เลือกเป็นบรรทัดเดียวบนใบ ERP — ต้นทุนแต่ละรายการไม่เปลี่ยน", "Write the selected lines as one row on the ERP sheet — no cost line changes", "選択行をERPシート上で1行にまとめます — 原価は変わりません")} onClick={() => setMerge({ title: erpByKey.get(selectedShown[0]!)?.description ?? "", group: null, members: selectedShown.map((key) => ({ sourceType: key.slice(0, key.lastIndexOf(":")) as EstimateErpSourceType, sourceId: Number(key.slice(key.lastIndexOf(":") + 1)) })) })}><Icon name="layers" />{copy("รวมเป็นบรรทัดเดียว", "Merge into one line", "1行にまとめる")}</button>
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
        {headings.map(renderHeading)}
        {/* The footer (and its Contingency ERP editor) must stay reachable even when a filter matches no line — e.g. when Contingency is the last unmapped line. */}
        {!headings.length ? <tbody><tr className="cb-empty"><td colSpan={8}>
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
      {canEdit ? <p className="cost-drag-help">{copy("ลากปุ่ม ⠿ ไปวางที่หัวข้ออื่นเพื่อเปลี่ยนหมวด ERP แล้วกดบันทึกการจัดหมวด · ลำดับในแต่ละหัวข้อมาจากลำดับในแท็บต้นทาง · การจัดหมวดไม่เปลี่ยนยอดเงินของรายการใด", "Drag ⠿ onto another heading to change a row's ERP category, then save the classification · the order inside a heading follows the tab the rows came from · classifying never changes any amount", "⠿を別の見出しにドラッグしてERP分類を変更し、保存してください · 見出し内の順序は元のタブに従います · 分類しても金額は変わりません")}</p> : null}
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
    {merge ? <Modal size="sm" title={merge.group ? copy("เปลี่ยนชื่อบรรทัดรวม", "Rename the merged line", "まとめた行の名前") : copy("รวมเป็นบรรทัดเดียว", "Merge into one line", "1行にまとめる")}
      subtitle={merge.group ? copy(`${merge.group.members.length} รายการ`, `${merge.group.members.length} lines`, `${merge.group.members.length}件`) : copy(`${merge.members.length} รายการที่เลือก`, `${merge.members.length} selected lines`, `選択 ${merge.members.length}件`)}
      onClose={() => setMerge(null)}>
      <div className="info-strip">{copy("ชื่อนี้จะไปอยู่บนใบ ERP แทนรายการย่อย — ต้นทุน หมวด และรายการในแท็บ Cost Items ไม่เปลี่ยน", "This name replaces the individual lines on the ERP sheet — the costs, the categories and the Cost Items tab do not change.", "ERPシート上でこの名前が使われます。原価・分類・Cost Itemsタブは変わりません。")}</div>
      <label className="field"><span>{copy("ชื่อบรรทัด", "Line name", "行の名前")}</span>
        <input value={merge.title} maxLength={200} disabled={busy} onChange={(event) => setMerge(current => current ? { ...current, title: event.target.value } : current)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveMerge(); } }} />
      </label>
      <div className="panel-actions">
        <button className="btn ghost" type="button" disabled={busy} onClick={() => setMerge(null)}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || !merge.title.trim()} onClick={() => { void saveMerge(); }}><Icon name="check" />{merge.group ? <LocalizedText text={"Save"} /> : copy("รวมรายการ", "Merge", "まとめる")}</button>
      </div>
    </Modal> : null}

    {preview && summary ? <Modal size="wide" title={copy("ตัวอย่างข้อมูล Export ERP", "ERP export data preview", "ERP出力データのプレビュー")} subtitle={workspace.header.number + " · R" + workspace.header.revision + " · " + workspace.header.status} onClose={() => setPreview(false)}>
      <p>{workspace.header.projectName} · {workspace.header.customerName}</p>
      <div className="info-strip amber">{copy("ตัวอย่างข้อมูลที่บันทึกแล้วสำหรับไฟล์ ERP — ไม่ใช่การส่งออก", "Preview of saved ERP workbook data — no file is exported.", "保存済みERPデータのプレビューです。")}{changedLines.length ? copy(" มีการแก้ไขที่ยังไม่ได้บันทึก", " Unsaved mapping changes are not included.", " 未保存の変更は含まれません。") : ""}</div>
      {[...ERP_COST_CATEGORIES, "Unmapped"].map((category) => {
        const rows = foldErpGroupLines(summary.lines, groups).filter((line) => line.erpCategory === category);
        return <section key={category}><h3>{category} · {money(rows.reduce((sum, line) => sum + line.amount, 0))}</h3>
          {sections.flatMap(section => modulesOf(section).map(module => ({ section, module, rows: module.lines.map(erpOf).filter((line): line is ErpLine => Boolean(line) && line!.erpCategory === category) })))
            .filter(group => group.rows.length).map(({ section, module, rows: children }) => {
              const detail = moduleDetail(section, module);
              return <details key={module.key} className="panel" style={{ padding: 12, marginBottom: 8 }}>
                <summary style={{ cursor: "pointer" }}><strong>{detail.title}</strong> · {module.standalone ? quantity(module.lines[0].quantity) : quantity(detail.quantity)} {module.standalone ? module.lines[0].unit : detail.unit} · {children.length} lines · {money(children.reduce((sum, line) => sum + line.amount, 0))}</summary>
                {detail.descriptionRows.map((row, index) => <p key={index} style={{ whiteSpace: "pre-wrap" }}>{row}</p>)}
                <div className="table-wrap"><table><thead><tr><th>Description</th><th>Supplier</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Amount</th><th>Remark</th></tr></thead>
                  <tbody>{children.map(line => <tr key={erpKey(line)}><td>{line.description}{(() => { const header=workspace.costItems.find(item=>item.id===line.sourceId&&item.isPriceSet&&line.sourceType==="CostItem"); const components=header?workspace.costItems.filter(item=>item.priceSetKey===header.priceSetKey&&!item.isPriceSet):[]; return components.length?<details><summary>อุปกรณ์ในเซ็ต ({components.length})</summary><ul>{components.map(item=><li key={item.id}>{item.itemCode} · {item.description} · {item.quantity} {item.unit} — {copy("รวมในราคาเซ็ต", "Included in the set price", "セット価格に含む")}</li>)}</ul></details>:null; })()}</td><td>{line.supplier || "—"}</td><td>{line.quantity ?? "—"}</td><td>{line.unit || "—"}</td><td>{line.unitPrice == null ? "—" : money(line.unitPrice)}</td><td>{money(line.amount)}</td><td>{line.remark || "—"}</td></tr>)}</tbody>
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
