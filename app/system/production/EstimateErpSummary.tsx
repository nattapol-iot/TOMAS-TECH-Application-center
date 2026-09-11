"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildErpEstimateWorkbook, downloadErpEstimateWorkbookBytes, ERP_COST_CATEGORIES, ERP_ESTIMATE_TEMPLATE_VERSION } from "../../../lib/erp-estimate-workbook";
import {
  loadEstimateErpSummary,
  recordEstimateErpExport,
  updateEstimateErpMappings,
  type EstimateCostWorkspace,
  type EstimateErpCategory,
  type EstimateErpSummary,
} from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { EmptyState, Icon, Panel, ProgressCell } from "../ui";
import { estimateBusinessDate, estimateUxCopy } from "../../../lib/estimate-ux";

const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(value);
const sourceKey = (line: EstimateErpSummary["lines"][number]) => `${line.sourceType}:${line.sourceId ?? "estimate"}`;
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

export function EstimateErpSummaryPanel({ workspace, onChanged, notify }: {
  workspace: EstimateCostWorkspace;
  onChanged: (message: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const [summary, setSummary] = useState<EstimateErpSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EstimateErpCategory | "Unmapped">>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const loaded = await loadEstimateErpSummary(workspace.header.id);
      setSummary(loaded);
      setDrafts(Object.fromEntries(loaded.lines.map((line) => [sourceKey(line), line.erpCategory])));
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
    const selected = drafts[sourceKey(line)];
    return selected !== undefined && selected !== line.erpCategory;
  }) ?? [], [drafts, summary]);
  const visibleLines = summary?.lines.filter((line) => showAll || line.erpCategory === "Unmapped") ?? [];
  const classifiedLineCount = summary?.categories.reduce((total, category) => total + category.lineCount, 0) ?? 0;
  const approvedOverhead = summary?.overhead.state === "Applied" || summary?.overhead.state === "Zero";
  const overheadAmount = Number(summary?.overhead.amount ?? 0);

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

  return <Panel title={copy("สรุปต้นทุน ERP", "ERP Cost Summary", "ERP原価サマリー")} subtitle="Hardware · Software · Service · Installation · License · Maintenance · Training" flush>
    {loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading ERP summary…"} /></div> : null}
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span><button className="btn ghost" type="button" onClick={() => { void load(); }}><LocalizedText text={"Try again"} /></button></div> : null}
    {summary ? <>
      <div className="table-wrap"><table>
        <thead><tr><th><LocalizedText text={"ERP category"} /></th><th className="num"><LocalizedText text={"Lines"} /></th><th className="num"><LocalizedText text={"Amount"} /></th><th><LocalizedText text={"Share"} /></th></tr></thead>
        <tbody>{ERP_COST_CATEGORIES.map((category) => {
          const row = summary.categories.find((entry) => entry.category === category) ?? { category, amount: 0, lineCount: 0 };
          const share = summary.classifiedTotal ? Math.round(row.amount / summary.classifiedTotal * 100) : 0;
          return <tr key={category}><td><strong>{category}</strong></td><td className="num">{row.lineCount}</td><td className="num">{money(row.amount)}</td><td style={{ minWidth: 120 }}><ProgressCell value={share} /></td></tr>;
        })}</tbody>
        <tfoot><tr className={summary.unmapped.lineCount ? "row-late" : "subtotal-row"}><td><strong>{summary.unmapped.lineCount ? "Unmapped" : "ERP classified total"}</strong></td><td className="num">{summary.unmapped.lineCount || classifiedLineCount}</td><td className="num"><strong>{money(summary.unmapped.lineCount ? summary.unmapped.amount : summary.classifiedTotal)}</strong></td><td /></tr></tfoot>
      </table></div>
      <div className={`info-strip ${summary.unmapped.lineCount ? "amber" : summary.reconciled ? "green" : "red"}`}>
        <Icon name={!summary.unmapped.lineCount && summary.reconciled ? "checkCircle" : "alertTriangle"} />
        <span><strong>{summary.unmapped.lineCount ? copy(`ยังไม่ได้จัดหมวด ${summary.unmapped.lineCount} รายการ`, `${summary.unmapped.lineCount} line(s) are not mapped`, `${summary.unmapped.lineCount}件が未分類です`) : summary.reconciled ? copy("ยอด ERP ตรงกับ Estimate", "ERP total matches the Estimate", "ERP合計は見積と一致しています") : copy(`ยอดต่างกัน ${money(summary.difference)}`, `Difference ${money(summary.difference)}`, `差額 ${money(summary.difference)}`)}</strong><br />7 categories {money(summary.classifiedTotal)} + Unmapped {money(summary.unmapped.amount)} + Overhead {money(overheadAmount)} · Estimate {money(summary.canonicalTotal)}</span>
      </div>
      {visibleLines.length ? <div className="table-wrap"><table>
        <thead><tr><th><LocalizedText text={"Source"} /></th><th><LocalizedText text={"Description"} /></th><th className="num"><LocalizedText text={"Amount"} /></th><th><LocalizedText text={"ERP category"} /></th></tr></thead>
        <tbody>{visibleLines.map((line) => <tr key={sourceKey(line)}><td><div className="cell-primary"><strong>{line.sourceType}</strong><span>{line.internalCategory}</span></div></td><td>{line.description}</td><td className="num">{money(line.amount)}</td><td><select disabled={busy || !summary.capabilities.canEditMappings} aria-label={`ERP category for ${line.description}`} value={drafts[sourceKey(line)] ?? line.erpCategory} onChange={(event) => setDrafts((current) => ({ ...current, [sourceKey(line)]: event.target.value as EstimateErpCategory | "Unmapped" }))}><option value="Unmapped">Unmapped</option>{ERP_COST_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></td></tr>)}</tbody>
      </table></div> : <EmptyState icon="checkCircle" title={copy("จัดหมวดต้นทุนครบแล้ว", "All cost lines are mapped", "すべての原価明細を分類済みです")} message={copy("ครบทั้ง 7 หมวดและพร้อมตรวจยอดก่อน Export", "Review the seven categories and totals before export.", "エクスポート前に7分類と合計を確認してください。") } />}
      <div className="panel-actions">
        <button className="btn ghost" type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? copy("แสดงเฉพาะที่ยังไม่จัดหมวด", "Show unmapped only", "未分類のみ表示") : copy("ตรวจทุกหมวด", "Review all mappings", "すべての分類を確認")}</button>
        <span className="spacer" />
        {changedLines.length ? <button className="btn default" type="button" disabled={busy} onClick={() => { void save(); }}><Icon name="check" />{busy ? copy("กำลังบันทึก…", "Saving…", "保存中…") : copy(`บันทึก ${changedLines.length} หมวด`, `Save ${changedLines.length} mapping(s)`, `${changedLines.length}件の分類を保存`)}</button> : null}
        <button className="btn primary" type="button" disabled={busy || changedLines.length > 0 || !summary.capabilities.canExport || !approvedOverhead} onClick={() => { void exportWorkbook(); }}><Icon name="download" />{copy("Export Excel สำหรับ ERP", "Export ERP Excel", "ERP Excelを出力")}</button>
      </div>
      {!approvedOverhead ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("ต้องกำหนดและอนุมัติ Overhead ก่อน Export ERP", "Set and approve Overhead before ERP export.", "ERP出力前に間接費を設定・承認してください。")}</span></div> : null}
      {changedLines.length ? <div className="info-strip amber"><Icon name="alertTriangle" /><span>{copy("บันทึกหมวดที่แก้ไขก่อน Export", "Save mapping changes before export.", "エクスポート前に分類変更を保存してください。")}</span></div> : null}
    </> : null}
  </Panel>;
}
