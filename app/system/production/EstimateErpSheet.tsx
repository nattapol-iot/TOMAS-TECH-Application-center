"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EstimateModuleEditor } from "./EstimateModuleEditor";
import { EstimateModuleQuantityCells } from "./EstimateModuleQuantityCells";
import { automaticLaborCategory } from "../../../lib/erp-category-suggest";
import { classifyErpGroups, erpGroupsByMember, erpKeyOfBreakdownKey, foldErpGroupLines, splitRowsByCategory, type ErpGroup } from "../../../lib/erp-estimate-groups";
import { ERP_COST_CATEGORIES, ERP_ESTIMATE_TEMPLATE_VERSION, buildErpEstimateWorkbook, downloadErpEstimateWorkbookBytes } from "../../../lib/erp-estimate-workbook";
import { LABOR_MODULE_NAMES, breakdownModules, buildEstimateCostBreakdown, groupErpLaborSections, type BreakdownLine, type BreakdownSection } from "../../../lib/estimate-cost-breakdown";
import { ESTIMATE_OVERHEAD_ENABLED } from "../../../lib/feature-flags";
import { estimateBusinessDate, estimateUxCopy } from "../../../lib/estimate-ux";
import {
  createEstimateErpGroup, deleteEstimateErpGroup, loadEstimateErpSummary, loadEstimateModuleDetails,
  recordEstimateErpExport, updateEstimateErpGroup, updateEstimateErpMappings, updateEstimateModuleDetails,
  type EstimateCostWorkspace, type EstimateErpCategory, type EstimateErpSourceType,
  type EstimateErpSummary, type EstimateModuleDetail,
} from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { EmptyState, Icon, Modal, Panel } from "../ui";

/*
 * The ERP sheet.
 *
 * This page is the document that leaves the estimate: the seven ERP categories are
 * its headings, and every row under them is one line of the exported workbook. So
 * the page has exactly three jobs — say which heading a line belongs under, say how
 * many lines the sheet writes, and hand the file over.
 *
 * Nothing here changes what anything costs. Classifying a row moves it between
 * headings, merging rows writes them as one line, and neither touches an amount:
 * the totals at the foot always reconcile with the estimate, which is what makes
 * the sheet safe to import. Internal engineering cost only; no selling figures
 * exist anywhere in this application.
 */

type ErpLine = EstimateErpSummary["lines"][number];
type DraftCategory = EstimateErpCategory | "Unmapped";
/** One line of the sheet: a module, a standalone item, or several of either written as one. */
type SheetRow = {
  key: string; title: string; lines: BreakdownLine[]; erpKeys: string[];
  standalone: boolean; merged: number | null; source: BreakdownSection;
  amount: number; inHouse: number; outsourced: number;
};
type SheetHeading = { key: string; category: string; ordinal: number; rows: SheetRow[]; amount: number; inHouse: number; outsourced: number };

const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
const erpKey = (line: ErpLine) => `${line.sourceType}:${line.sourceId ?? "estimate"}`;
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

/**
 * The name a line is written under, edited where it is read.
 *
 * A sheet is typed into, so the field behaves the way a grid cell does: it reads
 * as text until it is pointed at, it takes the whole name however long that is,
 * and moving on commits it — Enter, or simply leaving for the next field. Escape
 * puts the old name back. There are no save buttons because a page full of them
 * is a page nobody wants to fill in.
 *
 * Hardware lines are excluded by the page, not here: their names are the purchased
 * items themselves and belong to whoever buys them.
 */
function SheetLineName({ value, onSave }: { value: string; onSave: (next: string) => Promise<void> }) {
  const say = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const committing = useRef(false);
  // The field is as tall as the name it holds; a long scope of work is not a secret.
  const fit = (node: HTMLTextAreaElement | null) => { if (node) { node.style.height = "auto"; node.style.height = node.scrollHeight + "px"; } };
  const commit = async (next: string) => {
    const wanted = next.trim();
    if (committing.current || !wanted || wanted === value.trim()) return;
    committing.current = true;
    setSaving(true); setError("");
    try { await onSave(wanted); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : say("บันทึกไม่สำเร็จ", "Could not be saved", "保存できませんでした")); }
    finally { committing.current = false; setSaving(false); }
  };
  return <div className={saving ? "cb-line-name saving" : "cb-line-name"}>
    <textarea rows={1} ref={fit} value={draft} maxLength={200} disabled={saving} spellCheck={false}
      aria-label={say("ชื่อบรรทัด", "Line name", "行の名前")}
      title={say("พิมพ์แก้ได้เลย · Enter หรือคลิกที่อื่นเพื่อบันทึก · Esc เพื่อคืนค่าเดิม", "Type to change it · Enter or click away to save · Esc to put it back", "そのまま入力 · Enter か他をクリックで保存 · Esc で元に戻す")}
      onChange={(event) => { setDraft(event.target.value); fit(event.currentTarget); }}
      onBlur={() => { void commit(draft); }}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); void commit(draft); }
        if (event.key === "Escape" && !saving) { event.preventDefault(); setDraft(value); setError(""); }
      }} />
    {error ? <small role="alert" className="soft-warn">{error}</small> : null}
  </div>;
}

export function EstimateErpSheetPanel({ workspace, onChanged, notify }: {
  workspace: EstimateCostWorkspace;
  onChanged: (message: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const locale = currentLocale();
  const unmappedLabel = copy("ยังไม่จัดหมวด", "Unmapped", "未分類");
  const inHouseLabel = copy("ทำเอง", "In-house", "内製");
  const outsourcedLabel = copy("จ้างภายนอก", "Outsourced", "外注");
  const labels = useMemo(() => ({
    manhour: estimateUxCopy(locale, "ค่าแรงวิศวกรรม", "Engineering man-hour", "技術工数"),
    expenses: estimateUxCopy(locale, "ค่าใช้จ่ายโครงการ", "Project expenses", "プロジェクト経費"),
    other: estimateUxCopy(locale, "ต้นทุนโครงการอื่น", "Other project cost", "その他プロジェクト原価"),
    manDayUnit: estimateUxCopy(locale, "คน-วัน", "Man-day", "人日"),
  }), [locale]);

  const [summary, setSummary] = useState<EstimateErpSummary | null>(null);
  const [moduleDetails, setModuleDetails] = useState<EstimateModuleDetail[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftCategory>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [editingRemark, setEditingRemark] = useState(false);
  /* The sheet opens showing everything, because it is a document before it is a
     list; folding a heading is for working through a long one. */
  const [folded, setFolded] = useState<Set<string>>(new Set());
  /* A heading someone adds by hand holds no line, so there is nothing to store: it
     is a place to drop a row, and it lasts as long as the page is open. */
  const [addedHeadings, setAddedHeadings] = useState<string[]>([]);
  const [dragged, setDragged] = useState<{ key: string; erpKeys: string[]; category: string } | null>(null);
  const [dropTarget, setDropTarget] = useState("");
  const [merge, setMerge] = useState<{ title: string; group: ErpGroup | null; members: Array<{ sourceType: EstimateErpSourceType; sourceId: number }> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadEstimateErpSummary(workspace.header.id);
      setSummary(loaded);
      setModuleDetails(await loadEstimateModuleDetails(workspace.header.id));
      /* A reload must not discard a classification nobody has saved yet; a draft that
         now equals the stored value is simply dropped. */
      setDrafts((current) => Object.fromEntries(loaded.lines.map((line) => {
        const key = erpKey(line); const pending = current[key];
        return [key, pending !== undefined && pending !== line.erpCategory ? pending : line.erpCategory];
      })));
      setSelected((current) => new Set([...current].filter((key) => loaded.lines.some((line) => erpKey(line) === key))));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The ERP sheet could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [workspace.header.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, workspace.header.rowVersion]);

  const erpByKey = useMemo(() => new Map((summary?.lines ?? []).map((line) => [erpKey(line), line])), [summary]);
  const groups = useMemo(() => summary?.groups ?? [], [summary]);
  const groupsByMember = useMemo(() => erpGroupsByMember(groups), [groups]);
  const draftOf = useCallback((line: ErpLine) => drafts[erpKey(line)] ?? line.erpCategory, [drafts]);
  /* Null means "not a line of the sheet": a price-set component is priced inside
     its header, so the ERP side never carries it and it follows its row. */
  const categoryOfLine = useCallback((line: BreakdownLine) => {
    const key = erpKeyOfBreakdownKey(line.key);
    const erp = key ? erpByKey.get(key) : undefined;
    return erp ? draftOf(erp) : null;
  }, [erpByKey, draftOf]);

  /* A merged line the export would refuse to write must not be drawn as merged
     here, or the screen promises a line the file does not contain. It stops being
     one line when its rows are deleted down to fewer than two, or when they stop
     agreeing on a category — neither of which happens on this page, and both of
     which happen in the tabs that own the cost. */
  const { foldable, broken } = useMemo(() => classifyErpGroups(summary?.lines ?? [], groups, draftOf), [summary, groups, draftOf]);
  const foldableByMember = useMemo(() => erpGroupsByMember(foldable), [foldable]);

  const unsaved = useMemo(() => (summary?.lines ?? []).filter((line) => draftOf(line) !== line.erpCategory), [summary, draftOf]);
  const canEdit = Boolean(summary?.capabilities.canEditMappings) && !busy && !loading;
  const approvedOverhead = !ESTIMATE_OVERHEAD_ENABLED || summary?.overhead.state === "Applied" || summary?.overhead.state === "Zero";
  const overheadAmount = Number(summary?.overhead.amount ?? 0);
  const { totals, contingencyRate } = workspace.header;

  /* The cost ledgers decide what a row is; this page only decides where it sits.
     A row is a module, a standalone item or a merged line, and one whose own lines
     disagree on a category appears under each heading carrying just its part. */
  const sections = useMemo(() => {
    const labour = (summary?.lines ?? []).filter((line) => line.sourceType === "ManhourLine");
    return groupErpLaborSections(buildEstimateCostBreakdown(workspace, labels),
      new Map(labour.map((line) => ["manhour:" + line.sourceId, draftOf(line)])),
      new Set(labour.filter((line) => line.manualOverride || draftOf(line) !== line.erpCategory).map((line) => "manhour:" + line.sourceId)));
  }, [workspace, labels, summary, draftOf]);

  const headings = useMemo<SheetHeading[]>(() => {
    const collected = new Map<string, SheetRow[]>();
    for (const section of sections) {
      const modules = breakdownModules(section, (line) => {
        const key = erpKeyOfBreakdownKey(line.key);
        const group = key ? foldableByMember.get(key) : undefined;
        return group ? { id: group.id, title: group.title } : null;
      });
      for (const part of splitRowsByCategory(modules, categoryOfLine)) {
        const rows = collected.get(part.category) ?? [];
        rows.push({
          key: part.key, title: part.row.title, lines: part.lines, source: section,
          standalone: part.row.standalone, merged: part.row.merged,
          erpKeys: part.lines.map((line) => erpKeyOfBreakdownKey(line.key)).filter((key): key is string => key !== null && erpByKey.has(key)),
          amount: part.lines.reduce((total, line) => total + line.amount, 0),
          inHouse: part.lines.filter((line) => line.source === "in-house").reduce((total, line) => total + line.amount, 0),
          outsourced: part.lines.filter((line) => line.source === "outsourced").reduce((total, line) => total + line.amount, 0),
        });
        collected.set(part.category, rows);
      }
    }
    return [...ERP_COST_CATEGORIES, "Unmapped"]
      .filter((category) => collected.has(category) || addedHeadings.includes(category))
      .map((category, index) => {
        const rows = collected.get(category) ?? [];
        return {
          key: "erp:" + category, category, ordinal: index + 1, rows,
          amount: rows.reduce((total, row) => total + row.amount, 0),
          inHouse: rows.reduce((total, row) => total + row.inHouse, 0),
          outsourced: rows.reduce((total, row) => total + row.outsourced, 0),
        };
      });
  }, [sections, categoryOfLine, foldableByMember, erpByKey, addedHeadings]);

  const unusedHeadings = ERP_COST_CATEGORIES.filter((category) => !headings.some((heading) => heading.category === category));
  const rowCount = headings.reduce((total, heading) => total + heading.rows.length, 0);
  const selectedRows = headings.flatMap((heading) => heading.rows).filter((row) => row.erpKeys.length > 0 && row.erpKeys.every((key) => selected.has(key)));
  /* One written line carries one category, so a merge only ever gathers rows that
     already sit under the same heading — the sheet must not move money between
     categories to tidy up a name. */
  const mergeable = selectedRows.length >= 2 && !unsaved.length
    && new Set(selectedRows.map((row) => categoryOfLine(row.lines[0]))).size === 1
    // A row already promised to a merged line — even a broken one — cannot join another.
    && selectedRows.every((row) => row.merged === null && row.erpKeys.every((key) => !groupsByMember.has(key)));

  const classify = (erpKeys: string[], category: DraftCategory) => setDrafts((current) => {
    const next = { ...current };
    for (const key of erpKeys) if (erpByKey.has(key)) next[key] = category;
    return next;
  });
  const toggleRow = (row: SheetRow, checked: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const key of row.erpKeys) if (checked) next.add(key); else next.delete(key);
    return next;
  });

  const saveClassification = async () => {
    if (!summary || !unsaved.length) return;
    setBusy(true); setError("");
    try {
      await updateEstimateErpMappings(workspace.header.id, workspace.header.rowVersion, unsaved.map((line) => ({
        sourceType: line.sourceType, sourceId: line.sourceId,
        erpCategory: draftOf(line) as EstimateErpCategory, mappingRowVersion: line.mappingRowVersion,
      })));
      await onChanged(copy("บันทึกการจัดหมวดแล้ว", "Classification saved", "分類を保存しました"));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The classification could not be saved.");
    } finally { setBusy(false); }
  };

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
      await onChanged(draft.group ? copy("เปลี่ยนชื่อบรรทัดแล้ว", "Line renamed", "行の名前を変更しました") : copy("เขียนรวมเป็นบรรทัดเดียวแล้ว", "Written as one line", "1行にまとめました"));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The line could not be saved.");
    } finally { setBusy(false); }
  };

  const renameRow = async (row: SheetRow, detailKey: string, merged: ErpGroup | null, next: string) => {
    if (merged) await updateEstimateErpGroup(workspace.header.id, merged.id, workspace.header.rowVersion, merged.rowVersion, { title: next, quantity: merged.quantity, unit: merged.unit });
    // Quantity and unit are left out so the server keeps the ones it already has.
    else await updateEstimateModuleDetails(workspace.header.id, workspace.header.rowVersion, { moduleKey: detailKey, title: next, remark: null });
    await onChanged(copy("เปลี่ยนชื่อบรรทัดแล้ว", "Line renamed", "行の名前を変更しました"));
    await load();
  };

  const splitMerged = async (group: ErpGroup) => {
    setBusy(true); setError("");
    try {
      await deleteEstimateErpGroup(workspace.header.id, group.id, workspace.header.rowVersion);
      await onChanged(copy("แยกกลับเป็นรายการเดิมแล้ว", "Split back into lines", "まとめを解除しました"));
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The line could not be split.");
    } finally { setBusy(false); }
  };

  const exportWorkbook = async () => {
    if (!summary || workspace.header.status !== "Approved" || !summary.capabilities.canExport || unsaved.length || !approvedOverhead) return;
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
            item: line.item ?? undefined, modelPartNumber: line.modelPartNumber ?? undefined,
            supplier: line.supplier ?? undefined, brand: line.brand ?? undefined,
            leadTime: line.leadTime ?? undefined, quoteRevision: line.quoteRevision ?? undefined,
            unitPrice: line.unitPrice ?? undefined, quantity: line.quantity ?? undefined,
            unit: line.unit ?? undefined, remark: line.remark ?? undefined,
          })),
        },
        approvedOverhead: { amount: overheadAmount, approved: approvedOverhead },
      });
      const digestInput = new Uint8Array(bytes.byteLength);
      digestInput.set(bytes);
      const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
      const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      await recordEstimateErpExport(workspace.header.id, {
        estimateRowVersion: summary.estimateRowVersion, templateVersion: ERP_ESTIMATE_TEMPLATE_VERSION,
        sha256, filename, fileBase64: bytesToBase64(bytes),
      });
      downloadErpEstimateWorkbookBytes(bytes, filename);
      notify(copy("ส่งออกไฟล์ ERP แล้ว", "ERP workbook exported", "ERPファイルを出力しました"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The ERP workbook could not be created.");
    } finally { setBusy(false); }
  };

  /* Dragging is the classification: a row is dropped on the heading it belongs
     under, never at a position. The order inside a heading comes from the ledgers
     the rows were built in, and no line order can express an order across them. */
  const allowDrop = (event: React.DragEvent, category: string) => {
    if (!canEdit || !dragged || dragged.category === category) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(category);
  };
  const dropInto = (event: React.DragEvent, category: string) => {
    event.preventDefault();
    const row = dragged;
    setDragged(null); setDropTarget("");
    if (!canEdit || !row || row.category === category) return;
    classify(row.erpKeys, category as DraftCategory);
  };

  const renderRow = (heading: SheetHeading, row: SheetRow, index: number) => {
    const detailKey = row.source.kind === "manhour" && LABOR_MODULE_NAMES[row.source.title] ? row.source.key : row.key;
    const detail = moduleDetails.find((entry) => entry.moduleKey === detailKey);
    const merged = row.merged === null ? null : groups.find((group) => group.id === row.merged) ?? null;
    const title = merged ? merged.title : row.source.kind === "cost-items" ? row.title : detail?.title ?? row.title;
    const rowQuantity = merged ? merged.quantity : row.standalone ? row.lines[0].quantity : detail?.quantity ?? 1;
    const rowUnit = merged ? merged.unit : row.standalone ? row.lines[0].unit : detail?.unit ?? "Set";
    const isSelected = row.erpKeys.length > 0 && row.erpKeys.every((key) => selected.has(key));
    const open = opened.has(row.key);
    /* The rule that derives a labour category is a default, not a veto. Offering it
       back as one click keeps an override visible and reversible. */
    const derivedSet = new Set(row.erpKeys.map((key) => automaticLaborCategory(erpByKey.get(key)!)).filter((value) => value !== null));
    const derived = derivedSet.size === 1 ? [...derivedSet][0]! : null;
    /* Quantity and unit say how the line is written. On a cost module they also
       rescale its items; everywhere else the amount comes from the ledger below. */
    /* Hardware lines are the purchased items themselves, so their names are not the
       sheet's to reword. A standalone item has no module behind it to rename — its
       description belongs to the line, and is edited in the tab that owns it. */
    const nameEditable = canEdit && !unsaved.length && heading.category !== "Hardware"
      && (merged !== null || (!row.standalone && (row.source.kind === "cost-items"
        ? workspace.capabilities.canEditCostItems
        : row.source.kind === "manhour" ? Boolean(LABOR_MODULE_NAMES[row.source.title]) && workspace.capabilities.canEditAllSections
        : row.source.kind === "expenses" ? workspace.capabilities.canEditExpenses
        : workspace.capabilities.canEditOtherCosts)));
    const canEditUnit = !row.standalone && (row.source.kind === "cost-items" ? workspace.capabilities.canEditCostItems
      : row.source.kind === "manhour" ? Boolean(LABOR_MODULE_NAMES[row.source.title]) && workspace.capabilities.canEditAllSections
      : row.source.kind === "expenses" ? workspace.capabilities.canEditExpenses
      : workspace.capabilities.canEditOtherCosts);

    return <Fragment key={row.key}>
      <tr className={isSelected ? "cb-line selected" : "cb-line"}
        onDragOver={(event) => allowDrop(event, heading.category)}
        onDrop={(event) => dropInto(event, heading.category)}>
        <td className="cb-num-col muted">
          {canEdit && row.erpKeys.length ? <input type="checkbox" className="cb-check" checked={isSelected} aria-label={"Select " + title} onChange={(event) => toggleRow(row, event.target.checked)} /> : null}
          {heading.ordinal}-{index + 1}
        </td>
        <td className="cb-desc-cell">
          {nameEditable
            ? <SheetLineName key={`${row.key}:${title}`} value={title} onSave={(next) => renameRow(row, detailKey, merged, next)} />
            : <div className="cb-line-name"><strong>{title}</strong></div>}
          {/* Everything about the row that is not its name, on one line under it. */}
          <div className="cb-line-meta">
            {merged ? <span className="badge blue">{copy("รวมเป็นบรรทัดเดียว", "One line", "1行")}</span> : null}
            {/* Where the money lives. The sheet classifies the line; it does not move it. */}
            <span className="cb-code">{row.source.categoryCode ? row.source.categoryCode + " " + row.source.title : row.source.title}</span>
            <span>{row.lines.length} {copy("รายการ", "lines", "明細")}</span>
            <button type="button" className="chip" aria-expanded={open} onClick={() => setOpened((current) => { const next = new Set(current); if (next.has(row.key)) next.delete(row.key); else next.add(row.key); return next; })}>
              {open ? copy("ย่อ", "Hide", "閉じる") : copy("ดูรายการ", "Lines", "明細")}
            </button>
            {merged && !nameEditable ? <button type="button" className="chip" disabled={!canEdit} onClick={() => setMerge({ title: merged.title, group: merged, members: [] })}>{copy("เปลี่ยนชื่อ", "Rename", "名前を変更")}</button> : null}
            {merged ? <button type="button" className="chip" disabled={!canEdit} onClick={() => { void splitMerged(merged); }}>{copy("แยกกลับ", "Split back", "まとめを解除")}</button> : null}
          </div>
        </td>
        {canEditUnit || merged ? <EstimateModuleQuantityCells key={`${row.key}:${rowQuantity}:${rowUnit}`} name={title} quantity={rowQuantity} unit={rowUnit} showCostRatio={!merged && row.source.kind === "cost-items"}
          units={moduleDetails.map((entry) => entry.unit ?? "Set")} disabled={!canEdit || unsaved.length > 0}
          onSave={async (nextQuantity, nextUnit) => {
            setBusy(true);
            try {
              if (merged) await updateEstimateErpGroup(workspace.header.id, merged.id, workspace.header.rowVersion, merged.rowVersion, { title: merged.title, quantity: nextQuantity, unit: nextUnit });
              else await updateEstimateModuleDetails(workspace.header.id, workspace.header.rowVersion, { moduleKey: detailKey, title, remark: null, quantity: nextQuantity, unit: nextUnit });
              await onChanged(copy("บันทึกจำนวนและหน่วยแล้ว", "Quantity and unit saved", "数量と単位を保存しました")); await load();
            } finally { setBusy(false); }
          }} /> : <><td className="num">{quantity(rowQuantity)}</td><td>{rowUnit}</td></>}
        <td><div className="cell-primary"><span>{inHouseLabel}: {money(row.inHouse)}</span><span>{outsourcedLabel}: {money(row.outsourced)}</span></div></td>
        <td className="num">{row.lines.some((line) => line.awaitingPrice) ? <span className="soft-warn">{copy("รอราคา", "Awaiting price", "価格待ち")}</span> : money(row.amount / rowQuantity)}</td>
        <td className="num"><strong>{money(row.amount)}</strong></td>
        <td className="cb-erp-col"><div className="cb-module-controls">
          <select disabled={!canEdit || !row.erpKeys.length} aria-label={"ERP category for " + title} value={heading.category} onChange={(event) => classify(row.erpKeys, event.target.value as DraftCategory)}>
            <option value="Unmapped">{unmappedLabel}</option>
            {ERP_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          {derived && heading.category !== derived ? <button type="button" className="chip" disabled={!canEdit}
            title={copy(`ระบบอ่านรายการนี้เป็น ${derived} จาก cost type / ผู้ให้บริการ / แผนก — กดเพื่อคืนค่าอัตโนมัติ`, `The labour rule reads this as ${derived} from cost type, provider and discipline — click to hand it back`, `労務ルールでは ${derived} です — クリックで自動に戻す`)}
            onClick={() => classify(row.erpKeys, derived as DraftCategory)}>↺ {derived}</button> : null}
          <span className="row-actions"><button type="button" className="icon-btn cost-drag-handle" draggable={canEdit} disabled={!canEdit}
            title={copy("ลากไปวางที่หัวข้ออื่นเพื่อเปลี่ยนหมวด", "Drag onto another heading to change the category", "他の見出しにドラッグして分類を変更")} aria-label={"Drag " + title + " to another heading"}
            onDragStart={(event) => { setDragged({ key: row.key, erpKeys: row.erpKeys, category: heading.category }); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", row.key); }}
            onDragEnd={() => { setDragged(null); setDropTarget(""); }}>⠿</button></span>
        </div></td>
      </tr>
      {open ? row.lines.map((line) => <tr key={line.key} className="cb-line">
        <td /><td style={{ paddingLeft: 28 }}>{line.title}<div className="muted">{line.details.join(" · ")}</div></td>
        <td className="num">{quantity(line.quantity)}</td><td>{line.unit}</td>
        <td>{line.source === "in-house" ? inHouseLabel : outsourcedLabel}</td>
        <td className="num">{line.priceSetKey && !line.isPriceSet ? copy("รวมในราคาเซ็ต", "Included in the set price", "セット価格に含む") : money(line.unitCost)}</td>
        <td className="num">{line.priceSetKey && !line.isPriceSet ? "—" : money(line.amount)}</td>
        <td />
      </tr>) : null}
    </Fragment>;
  };

  const renderHeading = (heading: SheetHeading) => {
    const empty = heading.rows.length === 0;
    const open = !folded.has(heading.key);
    return <tbody key={heading.key}>
      <tr className={`cb-section${open ? " open" : ""}${dropTarget === heading.category ? " cost-drop-module" : ""}`} aria-expanded={open}
        onDragOver={(event) => allowDrop(event, heading.category)}
        onDrop={(event) => dropInto(event, heading.category)}>
        <td className="cb-num-col">
          <button type="button" className="cb-toggle" disabled={empty}
            aria-label={open ? copy("ย่อหัวข้อ", "Collapse the heading", "見出しを閉じる") : copy("ขยายหัวข้อ", "Expand the heading", "見出しを開く")}
            onClick={() => setFolded((current) => { const next = new Set(current); if (next.has(heading.key)) next.delete(heading.key); else next.add(heading.key); return next; })}>
            <Icon name={open ? "chevronDown" : "chevronRight"} />
          </button>
          <strong>{heading.ordinal}</strong>
        </td>
        <td>
          <strong className="cb-title">{heading.category === "Unmapped" ? unmappedLabel : heading.category}</strong>
          {empty ? <span className="muted small"> {copy("ลากรายการมาวางที่นี่", "Drag a line here", "ここに行をドラッグ")}</span> : null}
        </td>
        <td colSpan={3} className="cb-section-split"><span className="cb-split">
          {heading.inHouse ? <span className="cb-split-inhouse"><strong>{inHouseLabel}:</strong> {money(heading.inHouse)}</span> : null}
          {heading.outsourced ? <span className="cb-split-outsourced"><strong>{outsourcedLabel}:</strong> {money(heading.outsourced)}</span> : null}
        </span></td>
        <td className="num muted">{heading.rows.length} <LocalizedText text={"item"} /></td>
        <td className="num"><strong>{money(heading.amount)}</strong></td>
        <td className="cb-erp-col">
          {empty && addedHeadings.includes(heading.category)
            ? <button type="button" className="icon-btn danger" title={copy("เอาหัวข้อว่างออก", "Remove the empty heading", "空の見出しを削除")} aria-label={`Remove the ${heading.category} heading`}
              onClick={() => setAddedHeadings((current) => current.filter((entry) => entry !== heading.category))}><Icon name="x" /></button>
            : null}
        </td>
      </tr>
      {open ? heading.rows.map((row, index) => renderRow(heading, row, index)) : null}
    </tbody>;
  };

  const reconciliation = summary ? <div className={`info-strip ${summary.unmapped.lineCount ? "amber" : summary.reconciled ? "green" : "red"}`}>
    <Icon name={!summary.unmapped.lineCount && summary.reconciled ? "checkCircle" : "alertTriangle"} />
    <span>
      <strong>{summary.unmapped.lineCount
        ? copy(`ยังไม่จัดหมวด ${summary.unmapped.lineCount} รายการ`, `${summary.unmapped.lineCount} line(s) still unclassified`, `未分類 ${summary.unmapped.lineCount}件`)
        : summary.reconciled
          ? copy("ยอดบนใบตรงกับ Estimate", "The sheet reconciles with the estimate", "シートは見積と一致しています")
          : copy(`ยอดต่างกัน ${money(summary.difference)}`, `Difference ${money(summary.difference)}`, `差額 ${money(summary.difference)}`)}</strong>
      <br />{money(summary.classifiedTotal)} + {unmappedLabel} {money(summary.unmapped.amount)}{ESTIMATE_OVERHEAD_ENABLED ? ` + Overhead ${money(overheadAmount)}` : ""} · Estimate {money(summary.canonicalTotal)}
    </span>
  </div> : null;

  return <Panel title={copy("ใบ ERP", "ERP sheet", "ERPシート")}
    subtitle={copy(
      `${headings.length} หัวข้อ · ${rowCount} บรรทัดที่จะส่งออก · ลากบรรทัดไปวางที่หัวข้ออื่นเพื่อจัดหมวด แล้วกดบันทึก`,
      `${headings.length} heading(s) · ${rowCount} line(s) to export · drag a line onto another heading to classify it, then save`,
      `${headings.length}見出し · 出力${rowCount}行 · 行を別の見出しにドラッグして分類し、保存してください`)} flush>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span><button className="btn ghost" type="button" onClick={() => { void load(); }}><LocalizedText text={"Try again"} /></button></div> : null}
    {reconciliation}

    {loading && !summary ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading the ERP sheet…"} /></div> : null}

    {broken.length ? <div className="info-strip amber">
      <Icon name="alertTriangle" />
      <span>
        <strong>{copy(`มีบรรทัดรวม ${broken.length} รายการที่ใช้ไม่ได้แล้ว`, `${broken.length} merged line(s) no longer hold together`, `まとめた行 ${broken.length}件が成立しません`)}</strong>
        <br />{copy("ไฟล์จะเขียนแยกตามรายการเดิม — แยกกลับเพื่อเก็บกวาด แล้วรวมใหม่ถ้ายังต้องการ", "The file writes their lines separately — split them to tidy up, then merge again if you still want to.", "ファイルは元の行のまま出力します。解除して、必要なら改めてまとめてください。")}
      </span>
      <span className="spacer" />
      {broken.map(({ group, reason }) => <button key={group.id} className="btn ghost sm" type="button" disabled={!canEdit}
        title={reason === "gone"
          ? copy("รายการข้างในถูกลบจนเหลือไม่ถึงสองรายการ", "Its lines were deleted until fewer than two were left", "明細が2件未満になりました")
          : copy("รายการข้างในอยู่คนละหมวดแล้ว", "Its lines no longer share one category", "明細の分類が揃っていません")}
        onClick={() => { void splitMerged(group); }}><Icon name="x" />{group.title}</button>)}
    </div> : null}

    {headings.length ? <>
      <div className="toolbar">
        {canEdit && unusedHeadings.length ? <label className="select-field">
          <span className="sr-only">{copy("เพิ่มหัวข้อ", "Add a heading", "見出しを追加")}</span>
          <select value="" aria-label={copy("เพิ่มหัวข้อ", "Add a heading", "見出しを追加")} onChange={(event) => { if (event.target.value) setAddedHeadings((current) => [...current, event.target.value]); }}>
            <option value="">＋ {copy("เพิ่มหัวข้อ", "Add a heading", "見出しを追加")}</option>
            {unusedHeadings.map((category) => <option key={category} value={category}>{category}</option>)}
          </select><Icon name="chevronDown" />
        </label> : null}
        <button className="chip" type="button" disabled={!headings.length}
          onClick={() => setFolded((current) => current.size ? new Set() : new Set(headings.map((heading) => heading.key)))}>
          <Icon name={folded.size ? "chevronDown" : "chevronRight"} />{folded.size ? copy("ขยายทุกหัวข้อ", "Expand all", "すべて開く") : copy("ย่อทุกหัวข้อ", "Collapse all", "すべて閉じる")}
        </button>
        <button className="btn default" type="button" disabled={!canEdit || !mergeable}
          title={copy("เขียนบรรทัดที่เลือกเป็นบรรทัดเดียวบนใบ ERP — ต้นทุนแต่ละรายการไม่เปลี่ยน", "Write the selected lines as one line on the sheet — no cost changes", "選択行をシート上で1行にまとめます — 原価は変わりません")}
          onClick={() => setMerge({ title: selectedRows[0]?.title ?? "", group: null, members: selectedRows.flatMap((row) => row.erpKeys).map((key) => ({ sourceType: key.slice(0, key.lastIndexOf(":")) as EstimateErpSourceType, sourceId: Number(key.slice(key.lastIndexOf(":") + 1)) })) })}>
          <Icon name="layers" />{copy("เขียนรวมเป็นบรรทัดเดียว", "Write as one line", "1行にまとめる")}
        </button>
        {selected.size ? <button className="btn ghost" type="button" onClick={() => setSelected(new Set())}>{copy("ล้างการเลือก", "Clear selection", "選択解除")}</button> : null}
        <span className="spacer" />
        {unsaved.length ? <>
          <span className="muted small">{copy(`แก้หมวดไว้ ${unsaved.length} รายการ ยังไม่บันทึก`, `${unsaved.length} line(s) reclassified, not saved`, `未保存 ${unsaved.length}件`)}</span>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => { if (summary) setDrafts(Object.fromEntries(summary.lines.map((line) => [erpKey(line), line.erpCategory]))); }}>{copy("ยกเลิกที่แก้ไข", "Discard", "変更を破棄")}</button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => { void saveClassification(); }}><Icon name="check" />{copy("บันทึกการจัดหมวด", "Save the classification", "分類を保存")}</button>
        </> : <button className="btn primary" type="button" disabled={busy || workspace.header.status !== "Approved" || !summary?.capabilities.canExport || !approvedOverhead} onClick={() => { void exportWorkbook(); }}>
          <Icon name="download" />{copy("Export Estimate cost to ERP", "Export Estimate cost to ERP", "Estimate cost を ERP へ出力")}
        </button>}
      </div>

      <div className="table-wrap"><table className="cost-breakdown erp-lines">
        <thead><tr>
          <th className="cb-num-col">#</th>
          <th><LocalizedText text={"Description"} /></th>
          <th className="num cb-qty-col"><LocalizedText text={"Qty"} /></th>
          <th className="cb-unit-col"><LocalizedText text={"Unit"} /></th>
          <th className="cb-source-col">{copy("ทำเอง / จ้างภายนอก", "In-house / Outsourced", "内製 / 外注")}</th>
          <th className="num cb-money-col"><LocalizedText text={"Unit cost"} /></th>
          <th className="num cb-money-col"><LocalizedText text={"Amount"} /></th>
          <th className="cb-erp-col">{copy("หมวด", "Heading", "見出し")}</th>
        </tr></thead>
        {headings.map(renderHeading)}
        <tfoot>
          <tr className="cb-foot"><td colSpan={6} className="num">{copy("รวมก่อนเงินเผื่อสำรอง", "Subtotal", "小計")}</td><td className="num">{money(Number(totals.subtotal))}</td><td /></tr>
          <tr className="cb-foot"><td colSpan={6} className="num"><LocalizedText text={"Contingency"} /> {quantity(Number(contingencyRate))}%</td><td className="num">{money(Number(totals.contingency))}</td><td /></tr>
          <tr className="cb-total"><td colSpan={6} className="num"><LocalizedText text={"Total estimated cost"} /></td><td className="num"><strong>{money(Number(totals.total))}</strong></td><td /></tr>
        </tfoot>
      </table></div>

      <p className="cost-drag-help">{copy(
        "ลากปุ่ม ⠿ ไปวางที่หัวข้ออื่นเพื่อเปลี่ยนหมวด แล้วกดบันทึก · การจัดหมวดและการรวมบรรทัดไม่เปลี่ยนต้นทุนของรายการใด ยอดท้ายใบจึงตรงกับ Estimate เสมอ · ลำดับในแต่ละหัวข้อมาจากลำดับในแท็บต้นทาง",
        "Drag ⠿ onto another heading to change a line's category, then save · classifying and merging never change what anything costs, which is why the totals below always match the estimate · the order inside a heading follows the tab the lines came from",
        "⠿を別の見出しにドラッグして分類を変更し保存してください · 分類やまとめでは金額は変わらないため、合計は常に見積と一致します · 見出し内の順序は元のタブに従います")}</p>
    </> : !loading ? <EmptyState icon="package" title={copy("ยังไม่มีต้นทุนให้สรุป", "Nothing to summarise yet", "集計する原価がありません")}
      message={copy("เพิ่มรายการในแท็บ Cost Items, Man-hour หรือ Other cost แล้วรายการจะมาปรากฏที่นี่", "Add lines in Cost Items, Man-hour or Other cost and they appear here.", "Cost Items・Man-hour・Other costタブで明細を追加するとここに表示されます。")} /> : null}

    {/* Read on the sheet, written in the editor the estimate already uses for it. */}
    {summary ? <div className="estimate-summary-note">
      <div className="row"><strong>{copy("หมายเหตุท้ายใบ", "Remark at the foot of the sheet", "シート末尾の備考")}</strong><span className="spacer" />
        {workspace.capabilities.canEditAllSections ? <button type="button" className="btn default sm" disabled={busy || unsaved.length > 0} onClick={() => setEditingRemark(true)}>{copy("แก้ไขหมายเหตุ", "Edit the remark", "備考を編集")}</button> : null}
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{moduleDetails.find((entry) => entry.moduleKey === "summary")?.remark || "—"}</p>
    </div> : null}

    {editingRemark ? <EstimateModuleEditor workspace={workspace} moduleKey="summary" initialTitle="Summary"
      onClose={() => setEditingRemark(false)}
      onSaved={async () => { setEditingRemark(false); await onChanged(copy("บันทึกหมายเหตุแล้ว", "Remark saved", "備考を保存しました")); await load(); }} /> : null}

    {!approvedOverhead ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("ต้องกำหนดและอนุมัติ Overhead ก่อนส่งออกไฟล์ ERP", "Set and approve Overhead before exporting the ERP file.", "ERP出力前に間接費を設定・承認してください。")}</span></div> : null}
    {workspace.header.status !== "Approved" ? <div className="info-strip"><Icon name="alertTriangle" /><span>{copy("ส่งออกไฟล์ได้เมื่อ Estimate อนุมัติแล้ว — ระหว่างนี้จัดหมวดและรวมบรรทัดไว้ก่อนได้", "The file can be exported once the estimate is approved — classify and merge in the meantime.", "見積承認後に出力できます。それまでに分類とまとめを進められます。")}</span></div> : null}

    {merge ? <Modal size="sm"
      title={merge.group ? copy("เปลี่ยนชื่อบรรทัด", "Rename the line", "行の名前") : copy("เขียนรวมเป็นบรรทัดเดียว", "Write as one line", "1行にまとめる")}
      subtitle={merge.group ? copy(`${merge.group.members.length} รายการ`, `${merge.group.members.length} lines`, `${merge.group.members.length}件`) : copy(`${merge.members.length} รายการที่เลือก`, `${merge.members.length} selected lines`, `選択 ${merge.members.length}件`)}
      onClose={() => setMerge(null)}>
      <div className="info-strip">{copy("ชื่อนี้จะไปอยู่บนใบ ERP แทนรายการย่อย — ต้นทุน หมวด และรายการในแท็บต้นทางไม่เปลี่ยน", "This name replaces the individual lines on the ERP sheet — the costs, the categories and the source tabs do not change.", "ERPシート上でこの名前が使われます。原価・分類・元のタブは変わりません。")}</div>
      <label className="field"><span>{copy("ชื่อบรรทัด", "Line name", "行の名前")}</span>
        <input value={merge.title} maxLength={200} disabled={busy}
          onChange={(event) => setMerge((current) => current ? { ...current, title: event.target.value } : current)}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveMerge(); } }} />
      </label>
      <div className="panel-actions">
        <button className="btn ghost" type="button" disabled={busy} onClick={() => setMerge(null)}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || !merge.title.trim()} onClick={() => { void saveMerge(); }}><Icon name="check" />{merge.group ? <LocalizedText text={"Save"} /> : copy("รวมรายการ", "Merge", "まとめる")}</button>
      </div>
    </Modal> : null}
  </Panel>;
}
