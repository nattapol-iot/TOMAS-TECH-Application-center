"use client";

import { useMemo } from "react";
import { breakdownLineCount, buildEstimateCostBreakdown, type BreakdownSection } from "../../../lib/estimate-cost-breakdown";
import { estimateUxCopy } from "../../../lib/estimate-ux";
import type { EstimateCostWorkspace } from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { currentLocale } from "../i18n";
import { EmptyState, Icon, Panel } from "../ui";

const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const quantity = (value: number) => new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);

/**
 * The read-only cost list of an estimate, laid out like the ERP quotation: numbered
 * sections with the subtotal on the header row, lines numbered 1-1, 1-2 … and an
 * in-house / outsourced badge. Internal engineering cost only.
 */
export function EstimateCostBreakdown({ workspace, onOpenSection }: {
  workspace: EstimateCostWorkspace;
  /** Called with the cost category code when a cost-item section header is clicked. */
  onOpenSection?: (categoryCode: string) => void;
}) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const labels = useMemo(() => ({
    manhour: copy("ค่าแรงวิศวกรรม", "Engineering man-hour", "技術工数"),
    expenses: copy("ค่าใช้จ่ายโครงการ", "Project expenses", "プロジェクト経費"),
    other: copy("ต้นทุนโครงการอื่น", "Other project cost", "その他プロジェクト原価"),
    manDayUnit: copy("คน-วัน", "Man-day", "人日"),
  }), []);
  const sections = useMemo(() => buildEstimateCostBreakdown(workspace, labels), [workspace, labels]);
  const { totals, contingencyRate } = workspace.header;
  const inHouseLabel = copy("ทำเอง", "In-house", "内製");
  const outsourcedLabel = copy("จ้างภายนอก", "Outsourced", "外注");
  const lineCount = breakdownLineCount(sections);

  const sectionSplit = (section: BreakdownSection) => <span className="cb-split">
    {section.inHouseCount ? <span className="cb-split-inhouse"><strong>{inHouseLabel}:</strong> {money(section.inHouseAmount)} <span className="muted">({section.inHouseCount})</span></span> : null}
    {section.outsourcedCount ? <span className="cb-split-outsourced"><strong>{outsourcedLabel}:</strong> {money(section.outsourcedAmount)} <span className="muted">({section.outsourcedCount})</span></span> : null}
  </span>;

  return <Panel title={copy("รายการต้นทุน", "Cost breakdown", "原価明細")} subtitle={copy(`${sections.length} หมวด · ${lineCount} รายการ · ต้นทุนภายในเท่านั้น`, `${sections.length} section(s) · ${lineCount} line(s) · internal cost only`, `${sections.length}区分 · ${lineCount}明細 · 内部原価のみ`)} flush>
    {sections.length ? <div className="table-wrap"><table className="cost-breakdown">
      <thead><tr>
        <th className="cb-num-col">#</th>
        <th><LocalizedText text={"Description"} /></th>
        <th className="num cb-qty-col"><LocalizedText text={"Qty"} /></th>
        <th className="cb-unit-col"><LocalizedText text={"Unit"} /></th>
        <th className="cb-source-col">{copy("ทำเอง / จ้างภายนอก", "In-house / Outsourced", "内製 / 外注")}</th>
        <th className="num cb-money-col"><LocalizedText text={"Unit cost"} /></th>
        <th className="num cb-money-col"><LocalizedText text={"Amount"} /></th>
      </tr></thead>
      {sections.map((section) => <tbody key={section.key}>
        <tr className={`cb-section${section.categoryCode && onOpenSection ? " link-row" : ""}`} onClick={section.categoryCode && onOpenSection ? () => onOpenSection(section.categoryCode!) : undefined}>
          <td className="cb-num-col"><strong>{section.ordinal}</strong></td>
          <td><strong className="cb-title">{section.title}</strong>{section.categoryCode ? <span className="cb-code">{section.categoryCode}</span> : null}</td>
          <td colSpan={3} className="cb-section-split">{sectionSplit(section)}</td>
          <td className="num muted">{section.lines.length} <LocalizedText text={"item"} /></td>
          <td className="num"><strong>{money(section.amount)}</strong></td>
        </tr>
        {section.lines.map((line) => <tr key={line.key} className="cb-line">
          <td className="cb-num-col muted">{line.number}</td>
          <td><div className="cell-primary cb-desc"><strong>{line.title}</strong>{line.details.length || line.supplierName ? <span>{[...line.details, line.supplierName].filter(Boolean).join(" · ")}</span> : null}</div></td>
          <td className="num">{quantity(line.quantity)}</td>
          <td>{line.unit}</td>
          <td><span className={`badge ${line.source === "outsourced" ? "amber" : "green"}`}>{line.source === "outsourced" ? outsourcedLabel : inHouseLabel}</span></td>
          <td className="num">{line.awaitingPrice ? <span className="soft-warn">{copy("รอราคา", "Awaiting price", "価格待ち")}</span> : money(line.unitCost)}</td>
          <td className="num"><strong>{money(line.amount)}</strong></td>
        </tr>)}
      </tbody>)}
      <tfoot>
        <tr className="cb-foot"><td colSpan={6} className="num">{copy("รวมก่อนเงินเผื่อสำรอง", "Subtotal", "小計")}</td><td className="num">{money(Number(totals.subtotal))}</td></tr>
        <tr className="cb-foot"><td colSpan={6} className="num"><LocalizedText text={"Contingency"} /> {quantity(Number(contingencyRate))}%</td><td className="num">{money(Number(totals.contingency))}</td></tr>
        <tr className="cb-total"><td colSpan={6} className="num"><LocalizedText text={"Total estimated cost"} /></td><td className="num"><strong>{money(Number(totals.total))}</strong></td></tr>
      </tfoot>
    </table></div> : <EmptyState icon="package" title={copy("ยังไม่มีรายการต้นทุน", "No cost lines yet", "原価明細がありません")} message={copy("เพิ่มรายการในแท็บ Cost Items, Man-hour หรือ Other cost แล้วสรุปจะแสดงที่นี่", "Add lines in Cost Items, Man-hour or Other cost and the breakdown appears here.", "Cost Items・Man-hour・Other costタブで明細を追加するとここに表示されます。")} />}
    {sections.length && onOpenSection ? <div className="cb-hint muted"><Icon name="arrowRight" /> {copy("กดหัวหมวดต้นทุนเพื่อเปิดตารางแก้ไขในแท็บ Cost Items", "Click a cost category header to open it in the Cost Items tab.", "原価区分の見出しをクリックするとCost Itemsタブで開きます。")}</div> : null}
  </Panel>;
}
