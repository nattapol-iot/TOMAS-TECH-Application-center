"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildErpEstimateWorkbook, downloadErpEstimateWorkbookBytes, ERP_COST_CATEGORIES, ERP_ESTIMATE_TEMPLATE_VERSION } from "../../../lib/erp-estimate-workbook";
import { filterErpLines, groupErpLines, suggestErpCategory } from "../../../lib/erp-category-suggest";
import {
  loadEstimateErpSummary,
  recordEstimateErpExport,
  updateEstimateErpMappings,
  type EstimateCostWorkspace,
  type EstimateErpCategory,
  type EstimateErpSourceType,
  type EstimateErpSummary,
} from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { EmptyState, Icon, Panel, ProgressCell, SearchInput } from "../ui";
import { estimateBusinessDate, estimateUxCopy } from "../../../lib/estimate-ux";

type ErpLine = EstimateErpSummary["lines"][number];
type DraftCategory = EstimateErpCategory | "Unmapped";

const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const sourceKey = (line: ErpLine) => `${line.sourceType}:${line.sourceId ?? "estimate"}`;
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="select-field"><span className="sr-only">{label}</span><select value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Icon name="chevronDown" /></label>;
}

export function EstimateErpSummaryPanel({ workspace, onChanged, notify }: {
  workspace: EstimateCostWorkspace;
  onChanged: (message: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const unmappedLabel = copy("ยังไม่จัดหมวด", "Unmapped", "未分類");
  const [summary, setSummary] = useState<EstimateErpSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftCategory>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<EstimateErpSourceType | "All">("All");
  const [internalFilter, setInternalFilter] = useState("All");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<DraftCategory>("Hardware");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadEstimateErpSummary(workspace.header.id);
      setSummary(loaded);
      setDrafts(Object.fromEntries(loaded.lines.map((line) => [sourceKey(line), line.erpCategory])));
      setSelected(new Set());
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

  const changedLines = useMemo(() => summary?.lines.filter((line) => {
    const selectedCategory = drafts[sourceKey(line)];
    return selectedCategory !== undefined && selectedCategory !== line.erpCategory;
  }) ?? [], [drafts, summary]);
  const scopeLines = useMemo(() => summary?.lines.filter((line) => showAll || line.erpCategory === "Unmapped") ?? [], [showAll, summary]);
  const visibleLines = useMemo(() => filterErpLines(scopeLines, { search, sourceType: sourceFilter, internalCategory: internalFilter }), [internalFilter, scopeLines, search, sourceFilter]);
  const visibleGroups = useMemo(() => grouped ? groupErpLines(visibleLines) : null, [grouped, visibleLines]);
  const sourceTypeOptions = useMemo(() => [...new Set(scopeLines.map((line) => line.sourceType))], [scopeLines]);
  const internalOptions = useMemo(() => [...new Set(scopeLines.map((line) => line.internalCategory))].sort((a, b) => a.localeCompare(b)), [scopeLines]);
  const suggestions = useMemo(() => Object.fromEntries((summary?.lines ?? []).map((line) => [sourceKey(line), suggestErpCategory(line)])), [summary]);
  const classifiedLineCount = summary?.categories.reduce((total, category) => total + category.lineCount, 0) ?? 0;
  const approvedOverhead = summary?.overhead.state === "Applied" || summary?.overhead.state === "Zero";
  const overheadAmount = Number(summary?.overhead.amount ?? 0);
  const canEdit = Boolean(summary?.capabilities.canEditMappings) && !busy;
  const visibleKeys = visibleLines.map(sourceKey);
  const selectedVisible = visibleKeys.filter((key) => selected.has(key));
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;
  const filtersActive = search.trim() !== "" || sourceFilter !== "All" || internalFilter !== "All";

  const toggleKeys = (keys: string[], on: boolean) => setSelected((current) => {
    const next = new Set(current);
    for (const key of keys) { if (on) next.add(key); else next.delete(key); }
    return next;
  });
  const setDraftFor = (keys: string[], category: DraftCategory) => setDrafts((current) => {
    const next = { ...current };
    for (const key of keys) next[key] = category;
    return next;
  });
  const applyBulk = () => {
    if (!selectedVisible.length) return;
    setDraftFor(selectedVisible, bulkCategory);
    notify(copy(`กำหนด ${selectedVisible.length} รายการเป็น ${bulkCategory === "Unmapped" ? unmappedLabel : bulkCategory} แล้ว — ตรวจแล้วกดบันทึก`, `${selectedVisible.length} line(s) set to ${bulkCategory} — review and save`, `${selectedVisible.length}件を${bulkCategory}に設定しました — 確認して保存してください`));
  };
  const applySuggestions = () => {
    const targets = (selectedVisible.length ? visibleLines.filter((line) => selected.has(sourceKey(line))) : visibleLines)
      .filter((line) => (drafts[sourceKey(line)] ?? line.erpCategory) === "Unmapped");
    const applied = targets.filter((line) => suggestions[sourceKey(line)]);
    if (!applied.length) {
      notify(copy("ไม่มีรายการที่ระบบแนะนำหมวดได้ กรุณาเลือกด้วยตนเอง", "No suggestion available for these lines; choose manually.", "提案できる分類がありません。手動で選択してください。"));
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      for (const line of applied) next[sourceKey(line)] = suggestions[sourceKey(line)] as EstimateErpCategory;
      return next;
    });
    notify(copy(`แนะนำหมวดให้ ${applied.length} รายการแล้ว — ตรวจแล้วกดบันทึก`, `Suggested categories for ${applied.length} line(s) — review and save`, `${applied.length}件に分類を提案しました — 確認して保存してください`));
  };
  const resetFilters = () => { setSearch(""); setSourceFilter("All"); setInternalFilter("All"); };

  const save = async () => {
    if (!summary || !changedLines.length) return;
    setBusy(true); setError("");
    try {
      const result = await updateEstimateErpMappings(workspace.header.id, summary.estimateRowVersion, changedLines.map((line) => ({
        sourceType: line.sourceType,
        sourceId: line.sourceId,
        erpCategory: drafts[sourceKey(line)] as EstimateErpCategory,
        mappingRowVersion: line.mappingRowVersion,
      })));
      setSummary(result.erpSummary);
      setDrafts(Object.fromEntries(result.erpSummary.lines.map((line) => [sourceKey(line), line.erpCategory])));
      setSelected(new Set());
      await onChanged("ERP category mapping updated");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ERP mapping could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const exportWorkbook = async () => {
    if (!summary) return;
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

  const renderLine = (line: ErpLine) => {
    const key = sourceKey(line);
    const draft = drafts[key] ?? line.erpCategory;
    const suggestion = suggestions[key];
    const isSelected = selected.has(key);
    const changed = draft !== line.erpCategory;
    return <tr key={key} className={isSelected ? "selected" : undefined}>
      <td className="check-cell"><input type="checkbox" checked={isSelected} disabled={!canEdit} aria-label={copy(`เลือก ${line.description}`, `Select ${line.description}`, `${line.description}を選択`)} onChange={(event) => toggleKeys([key], event.target.checked)} /></td>
      <td><div className="cell-primary"><strong>{line.sourceType}</strong><span>{line.internalCategory}</span></div></td>
      <td>{line.description}{line.supplier ? <div className="muted small">{line.supplier}{line.brand ? ` · ${line.brand}` : ""}</div> : null}</td>
      <td className="num">{money(line.amount)}</td>
      <td>
        <div className="erp-map-cell">
          <select disabled={!canEdit} aria-label={`ERP category for ${line.description}`} value={draft} onChange={(event) => setDraftFor([key], event.target.value as DraftCategory)}>
            <option value="Unmapped">{unmappedLabel}</option>
            {ERP_COST_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          {changed ? <span className="pill amber" title={copy("ยังไม่บันทึก", "Not saved yet", "未保存")}>{copy("แก้ไข", "Edited", "変更")}</span> : null}
          {suggestion && suggestion !== draft && canEdit ? <button className="chip" type="button" title={copy("ใช้หมวดที่ระบบแนะนำ", "Apply suggested category", "提案された分類を適用")} onClick={() => setDraftFor([key], suggestion)}>→ {suggestion}</button> : null}
        </div>
      </td>
    </tr>;
  };

  return <Panel title={copy("สรุปต้นทุน ERP", "ERP Cost Summary", "ERP原価サマリー")} subtitle="Hardware · Software · Service · Installation · License · Maintenance · Training" flush>
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading ERP summary…"} /></div> : null}
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span><button className="btn ghost" type="button" onClick={() => { void load(); }}><LocalizedText text={"Try again"} /></button></div> : null}
    {summary ? <>
      <div className="table-wrap"><table>
        <thead><tr><th>{copy("หมวด ERP", "ERP category", "ERP分類")}</th><th className="num"><LocalizedText text={"Lines"} /></th><th className="num"><LocalizedText text={"Amount"} /></th><th>{copy("สัดส่วน", "Share", "構成比")}</th></tr></thead>
        <tbody>{ERP_COST_CATEGORIES.map((category) => {
          const row = summary.categories.find((entry) => entry.category === category) ?? { category, amount: 0, lineCount: 0 };
          const share = summary.classifiedTotal ? Math.round(row.amount / summary.classifiedTotal * 100) : 0;
          return <tr key={category}><td><strong>{category}</strong></td><td className="num">{row.lineCount}</td><td className="num">{money(row.amount)}</td><td style={{ minWidth: 120 }}><ProgressCell value={share} /></td></tr>;
        })}</tbody>
        <tfoot><tr className={summary.unmapped.lineCount ? "row-late" : "subtotal-row"}><td><strong>{summary.unmapped.lineCount ? unmappedLabel : copy("รวมที่จัดหมวดแล้ว", "ERP classified total", "分類済み合計")}</strong></td><td className="num">{summary.unmapped.lineCount || classifiedLineCount}</td><td className="num"><strong>{money(summary.unmapped.lineCount ? summary.unmapped.amount : summary.classifiedTotal)}</strong></td><td /></tr></tfoot>
      </table></div>
      <div className={`info-strip ${summary.unmapped.lineCount ? "amber" : summary.reconciled ? "green" : "red"}`}>
        <Icon name={!summary.unmapped.lineCount && summary.reconciled ? "checkCircle" : "alertTriangle"} />
        <span><strong>{summary.unmapped.lineCount ? copy(`ยังไม่ได้จัดหมวด ${summary.unmapped.lineCount} รายการ`, `${summary.unmapped.lineCount} line(s) are not mapped`, `${summary.unmapped.lineCount}件が未分類です`) : summary.reconciled ? copy("ยอด ERP ตรงกับ Estimate", "ERP total matches the Estimate", "ERP合計は見積と一致しています") : copy(`ยอดต่างกัน ${money(summary.difference)}`, `Difference ${money(summary.difference)}`, `差額 ${money(summary.difference)}`)}</strong><br />{copy("7 หมวด", "7 categories", "7分類")} {money(summary.classifiedTotal)} + {unmappedLabel} {money(summary.unmapped.amount)} + Overhead {money(overheadAmount)} · Estimate {money(summary.canonicalTotal)}</span>
      </div>

      <div className="toolbar erp-toolbar">
        <SearchInput value={search} onChange={setSearch} placeholder={copy("ค้นหารายการ / supplier / หมวดภายใน", "Search description / supplier / internal category", "品名・仕入先・内部分類で検索")} />
        <FilterSelect label={copy("ที่มา", "Source", "出典")} value={sourceFilter} onChange={(value) => setSourceFilter(value as EstimateErpSourceType | "All")} options={[{ value: "All", label: copy("ทุกที่มา", "All sources", "すべての出典") }, ...sourceTypeOptions.map((type) => ({ value: type, label: type }))]} />
        <FilterSelect label={copy("หมวดภายใน", "Internal category", "内部分類")} value={internalFilter} onChange={setInternalFilter} options={[{ value: "All", label: copy("ทุกหมวดภายใน", "All internal categories", "すべての内部分類") }, ...internalOptions.map((name) => ({ value: name, label: name }))]} />
        <button className={`chip${grouped ? " on" : ""}`} type="button" aria-pressed={grouped} onClick={() => setGrouped((current) => !current)}><Icon name="layers" /> {copy("จัดกลุ่มตามหมวดภายใน", "Group by internal category", "内部分類でグループ化")}</button>
        <button className={`chip${showAll ? " on" : ""}`} type="button" aria-pressed={showAll} onClick={() => setShowAll((current) => !current)}>{showAll ? copy("แสดงทุกรายการ", "Showing all lines", "全件表示中") : copy("เฉพาะที่ยังไม่จัดหมวด", "Unmapped only", "未分類のみ")}</button>
        <span className="spacer" />
        <span className="muted small">{copy(`แสดง ${visibleLines.length} จาก ${scopeLines.length} รายการ`, `Showing ${visibleLines.length} of ${scopeLines.length} lines`, `${scopeLines.length}件中${visibleLines.length}件を表示`)}</span>
        {filtersActive ? <button className="btn ghost" type="button" onClick={resetFilters}><Icon name="x" />{copy("ล้างตัวกรอง", "Clear filters", "フィルター解除")}</button> : null}
      </div>

      {summary.capabilities.canEditMappings ? <div className="toolbar erp-bulk-bar">
        <label className="checkbox-row"><input type="checkbox" checked={allVisibleSelected} disabled={!canEdit || !visibleKeys.length} onChange={(event) => toggleKeys(visibleKeys, event.target.checked)} /><span>{selectedVisible.length ? copy(`เลือกแล้ว ${selectedVisible.length} รายการ`, `${selectedVisible.length} selected`, `${selectedVisible.length}件選択中`) : copy("เลือกทั้งหมดที่แสดง", "Select all shown", "表示中をすべて選択")}</span></label>
        <FilterSelect label={copy("หมวด ERP สำหรับรายการที่เลือก", "ERP category for selected lines", "選択行のERP分類")} value={bulkCategory} onChange={(value) => setBulkCategory(value as DraftCategory)} options={[...ERP_COST_CATEGORIES.map((category) => ({ value: category, label: category })), { value: "Unmapped", label: unmappedLabel }]} />
        <button className="btn default" type="button" disabled={!canEdit || !selectedVisible.length} onClick={applyBulk}><Icon name="check" />{copy("กำหนดหมวดที่เลือก", "Apply to selected", "選択行に適用")}</button>
        <button className="btn default" type="button" disabled={!canEdit || !visibleLines.length} title={copy("แนะนำจากหมวดภายใน เช่น 03 Electrical → Hardware, 06 Engineering → Service, 08 Transportation → Installation", "Suggest from internal category, e.g. 03 Electrical → Hardware, 06 Engineering → Service, 08 Transportation → Installation", "内部分類から提案（例: 03 Electrical → Hardware）")} onClick={applySuggestions}><Icon name="cpu" />{selectedVisible.length ? copy("แนะนำหมวดให้ที่เลือก", "Suggest for selected", "選択行に提案") : copy("แนะนำหมวดอัตโนมัติ", "Suggest categories", "分類を自動提案")}</button>
        {selected.size ? <button className="btn ghost" type="button" onClick={() => setSelected(new Set())}>{copy("ล้างการเลือก", "Clear selection", "選択解除")}</button> : null}
      </div> : null}

      {visibleLines.length ? <div className="table-wrap"><table className="erp-lines">
        <thead><tr><th className="check-cell" /><th>{copy("ที่มา", "Source", "出典")}</th><th><LocalizedText text={"Description"} /></th><th className="num"><LocalizedText text={"Amount"} /></th><th>{copy("หมวด ERP", "ERP category", "ERP分類")}</th></tr></thead>
        {visibleGroups ? visibleGroups.map((group) => {
          const groupKeys = group.lines.map(sourceKey);
          const groupSelected = groupKeys.every((key) => selected.has(key));
          return <tbody key={group.key}>
            <tr className="subtotal-row erp-group-row">
              <td className="check-cell"><input type="checkbox" checked={groupSelected} disabled={!canEdit} aria-label={copy(`เลือกทั้งกลุ่ม ${group.key}`, `Select group ${group.key}`, `${group.key}をすべて選択`)} onChange={(event) => toggleKeys(groupKeys, event.target.checked)} /></td>
              <td colSpan={2}><strong>{group.key}</strong> <span className="muted">· {copy(`${group.lines.length} รายการ`, `${group.lines.length} line(s)`, `${group.lines.length}件`)}</span></td>
              <td className="num"><strong>{money(group.amount)}</strong></td>
              <td />
            </tr>
            {group.lines.map(renderLine)}
          </tbody>;
        }) : <tbody>{visibleLines.map(renderLine)}</tbody>}
      </table></div> : scopeLines.length ? <EmptyState icon="filter" title={copy("ไม่พบรายการตามตัวกรอง", "No lines match the filters", "条件に一致する明細がありません")} message={copy("ลองเปลี่ยนคำค้นหาหรือล้างตัวกรอง", "Adjust the search or clear the filters.", "検索条件を変更するかフィルターを解除してください。")} action={<button className="btn ghost" type="button" onClick={resetFilters}>{copy("ล้างตัวกรอง", "Clear filters", "フィルター解除")}</button>} />
        : <EmptyState icon="checkCircle" title={copy("จัดหมวดต้นทุนครบแล้ว", "All cost lines are mapped", "すべての原価明細を分類済みです")} message={copy("ครบทั้ง 7 หมวดและพร้อมตรวจยอดก่อน Export", "Review the seven categories and totals before export.", "エクスポート前に7分類と合計を確認してください。")} />}

      <div className="panel-actions">
        {changedLines.length ? <button className="btn ghost" type="button" disabled={busy} onClick={() => { setDrafts(Object.fromEntries(summary.lines.map((line) => [sourceKey(line), line.erpCategory]))); }}>{copy("ยกเลิกที่แก้ไข", "Discard changes", "変更を破棄")}</button> : null}
        <span className="spacer" />
        {changedLines.length ? <button className="btn default" type="button" disabled={busy} onClick={() => { void save(); }}><Icon name="check" />{busy ? copy("กำลังบันทึก…", "Saving…", "保存中…") : copy(`บันทึก ${changedLines.length} หมวด`, `Save ${changedLines.length} mapping(s)`, `${changedLines.length}件の分類を保存`)}</button> : null}
        <button className="btn primary" type="button" disabled={busy || changedLines.length > 0 || !summary.capabilities.canExport || !approvedOverhead} onClick={() => { void exportWorkbook(); }}><Icon name="download" />{copy("Export Excel สำหรับ ERP", "Export ERP Excel", "ERP Excelを出力")}</button>
      </div>
      {!approvedOverhead ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("ต้องกำหนดและอนุมัติ Overhead ก่อน Export ERP", "Set and approve Overhead before ERP export.", "ERP出力前に間接費を設定・承認してください。")}</span></div> : null}
      {changedLines.length ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("บันทึกหมวดที่แก้ไขก่อน Export", "Save mapping changes before export.", "エクスポート前に分類変更を保存してください。")}</span></div> : null}
    </> : null}
  </Panel>;
}
