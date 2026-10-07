"use client";

import { useEffect, useState } from "react";
import {
  createEstimate,
  listEstimates,
  type EstimateCopyResult,
  type EstimateStartFrom,
  type EstimateSummary,
} from "../api-client";
import { currentLocale } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, Icon, Modal, SearchInput } from "../ui";
import { estimateUxCopy } from "../../../lib/estimate-ux";

/*
 * "Start from a previous estimate". A new estimate does not have to start empty: the
 * person finds any estimate they may read, by number, project or customer, chooses it
 * (nothing ranks or picks for them) and chooses which ledgers to carry. The server copies
 * them in one transaction and re-resolves internal labor at today's rates.
 *
 * Used where an estimate is created (the Estimate list and the inquiry page) and by the
 * workspace of any estimate that is still empty, however it was created.
 */

export type StartLedgers = { costItems: boolean; manhour: boolean; expenses: boolean; otherCosts: boolean };
export const ALL_START_LEDGERS: StartLedgers = { costItems: true, manhour: true, expenses: true, otherCosts: true };
export const anyStartLedger = (ledgers: StartLedgers) => ledgers.costItems || ledgers.manhour || ledgers.expenses || ledgers.otherCosts;

export function startFromInput(source: EstimateSummary, ledgers: StartLedgers): EstimateStartFrom {
  return { sourceEstimateId: source.id, includeCostItems: ledgers.costItems, includeManhour: ledgers.manhour, includeExpenses: ledgers.expenses, includeOtherCosts: ledgers.otherCosts };
}

const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
const formatMoney = (value: number | string | null | undefined) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const revisionCode = (revision: number) => `R${String(revision).padStart(2, "0")}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";

/** What the toast says once a new estimate exists, with what came across from the source. */
export function startFromCreatedMessage(number: string, copied: Omit<EstimateCopyResult, "estimateRowVersion"> | null): string {
  if (!copied) return `${number} created`;
  return copy(
    `สร้าง ${number} แล้ว · คัดลอกจาก ${copied.sourceNumber}: อุปกรณ์ ${copied.costItems} · ค่าแรง ${copied.manhourLines} · ค่าเดินทาง/ที่พัก ${copied.expenseLines} · อื่นๆ ${copied.otherCostLines} รายการ`,
    `${number} created · copied from ${copied.sourceNumber}: ${copied.costItems} equipment · ${copied.manhourLines} labor · ${copied.expenseLines} travel · ${copied.otherCostLines} other line(s)`,
    `${number} を作成 · ${copied.sourceNumber} からコピー：機器 ${copied.costItems} · 工数 ${copied.manhourLines} · 旅費 ${copied.expenseLines} · その他 ${copied.otherCostLines} 件`);
}

export function EstimateSourcePicker({ excludeId, source, onSource, ledgers, onLedgers }: {
  excludeId: number | null; source: EstimateSummary | null; onSource: (source: EstimateSummary) => void;
  ledgers: StartLedgers; onLedgers: (ledgers: StartLedgers) => void;
}) {
  const [sourceSearch, setSourceSearch] = useState("");
  const [sources, setSources] = useState<{ items: EstimateSummary[]; loading: boolean; error: string }>({ items: [], loading: true, error: "" });
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSources((current) => ({ ...current, loading: true, error: "" }));
      void listEstimates({ page: 1, pageSize: 8, search: sourceSearch.trim() || undefined })
        .then((result) => { if (!cancelled) setSources({ items: result.items.filter((item) => item.id !== excludeId), loading: false, error: "" }); })
        .catch((requestError) => { if (!cancelled) setSources({ items: [], loading: false, error: errorText(requestError) }); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [sourceSearch, excludeId]);
  const key = excludeId ?? "new";
  const ledgerChoices: [keyof StartLedgers, string][] = [
    ["costItems", copy("อุปกรณ์และวัสดุ", "Equipment and materials", "機器・材料")],
    ["manhour", copy("ค่าแรงทุกสาขา", "Labor in every discipline", "全分野の工数")],
    ["expenses", copy("ค่าเดินทาง ที่พัก เบี้ยเลี้ยง", "Travel, hotel and per diem", "旅費・宿泊・日当")],
    ["otherCosts", copy("ค่าใช้จ่ายอื่น", "Other project costs", "その他費用")],
  ];
  return <div className="stack">
    <SearchInput value={sourceSearch} onChange={setSourceSearch} placeholder="Search estimate, inquiry, project or customer…" />
    {sources.error ? <div className="info-strip red" role="alert"><Icon name="alertTriangle" /><span>{sources.error}</span></div> : null}
    <div className="table-wrap"><table>
      <thead><tr><th aria-label={copy("เลือก", "Select", "選択")} /><th><LocalizedText text={"Estimate No."} /></th><th><LocalizedText text={"Project"} /></th><th><LocalizedText text={"Customer"} /></th><th><LocalizedText text={"Status"} /></th><th className="num"><LocalizedText text={"Total"} /></th></tr></thead>
      <tbody>{sources.items.map((item) => <tr key={item.id} className="clickable" onClick={() => onSource(item)}>
        <td><input type="radio" name={`estimate-source-${key}`} aria-label={item.number} checked={source?.id === item.id} onChange={() => onSource(item)} /></td>
        <td><strong className="mono">{item.number}</strong> <span className="pill">{revisionCode(item.revision)}</span></td>
        <td><div className="cell-primary"><strong>{item.projectName}</strong><span>{item.projectType}</span></div></td>
        <td>{item.customerName}</td><td><Badge>{item.status}</Badge></td><td className="num">{formatMoney(item.total)}</td>
      </tr>)}</tbody>
    </table></div>
    {sources.loading ? <div className="empty"><span className="spinner" /><LocalizedText text={"Loading…"} /></div>
      : !sources.items.length ? <div className="info-strip">{copy("ไม่พบ Estimate ที่ตรงกับคำค้น", "No estimate matches the search", "検索に一致する見積はありません")}</div> : null}
    {source ? <div className="settings-list">{ledgerChoices.map(([ledger, label]) => <div key={ledger} className="check-row"><input id={`estimate-source-${key}-${ledger}`} type="checkbox" checked={ledgers[ledger]} onChange={(event) => onLedgers({ ...ledgers, [ledger]: event.target.checked })} /><label htmlFor={`estimate-source-${key}-${ledger}`}><strong>{label}</strong></label></div>)}</div> : null}
    <div className="info-strip"><Icon name="shield" /><span><LocalizedText text={"ต้นฉบับไม่ถูกแก้ไข สถานะอนุมัติ ประวัติการอนุมัติและผู้รับผิดชอบ section เดิมไม่ถูกคัดลอก อัตราค่าแรงภายในคำนวณใหม่ตามอัตราที่มีผลวันนี้"} /></span></div>
  </div>;
}

/** "Start empty" or "copy from a similar previous estimate", with the picker when copying. */
export function StartFromChoice({ idPrefix, startFrom, onStartFrom, source, onSource, ledgers, onLedgers }: {
  idPrefix: string; startFrom: "blank" | "copy"; onStartFrom: (value: "blank" | "copy") => void;
  source: EstimateSummary | null; onSource: (source: EstimateSummary) => void; ledgers: StartLedgers; onLedgers: (ledgers: StartLedgers) => void;
}) {
  return <fieldset className="span-2 estimate-start-from">
    <legend>{copy("เริ่มจาก", "Start from", "開始方法")}</legend>
    <div className="settings-list">
      <div className="check-row"><input id={`${idPrefix}-blank`} type="radio" name={`${idPrefix}-start`} checked={startFrom === "blank"} onChange={() => onStartFrom("blank")} /><label htmlFor={`${idPrefix}-blank`}><strong>{copy("เริ่มว่าง", "Start empty", "空で開始")}</strong><small>{copy("เพิ่มอุปกรณ์และค่าแรงเองทีละรายการ", "Add equipment and labor yourself", "機器と工数を自分で追加します")}</small></label></div>
      <div className="check-row"><input id={`${idPrefix}-copy`} type="radio" name={`${idPrefix}-start`} checked={startFrom === "copy"} onChange={() => onStartFrom("copy")} /><label htmlFor={`${idPrefix}-copy`}><strong>{copy("คัดลอกจาก Estimate เดิมที่คล้ายกัน", "Copy from a similar previous estimate", "類似の過去見積からコピー")}</strong><small>{copy("ค้นหาด้วยเลข Estimate ชื่อโปรเจกต์ หรือชื่อลูกค้า", "Search by estimate number, project or customer", "見積番号・案件名・顧客名で検索")}</small></label></div>
    </div>
    {startFrom === "copy" ? <div style={{ marginTop: 12 }}><EstimateSourcePicker excludeId={null} source={source} onSource={onSource} ledgers={ledgers} onLedgers={onLedgers} /></div> : null}
  </fieldset>;
}

/**
 * "Create estimate" on an inquiry. It used to create an empty R00 straight away; it now asks
 * first whether to start empty or from a previous estimate.
 */
export function CreateEstimateFromInquiryDialog({ inquiry, onClose, onCreated }: {
  inquiry: { id: number; number: string; ownerId: number; dueDate: string };
  onClose: () => void;
  onCreated: (created: { id: number; number: string; copied: Omit<EstimateCopyResult, "estimateRowVersion"> | null }) => Promise<void>;
}) {
  const [startFrom, setStartFrom] = useState<"blank" | "copy">("copy");
  const [source, setSource] = useState<EstimateSummary | null>(null);
  const [ledgers, setLedgers] = useState<StartLedgers>(ALL_START_LEDGERS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = startFrom === "blank" || (source !== null && anyStartLedger(ledgers));
  const submit = async () => {
    setBusy(true); setError("");
    try {
      await onCreated(await createEstimate({ inquiryId: inquiry.id, ownerId: inquiry.ownerId, dueDate: inquiry.dueDate, contingencyRate: 0,
        copyFrom: startFrom === "copy" && source ? startFromInput(source, ledgers) : undefined }));
    } catch (requestError) { setError(errorText(requestError)); }
    finally { setBusy(false); }
  };
  return <Modal title={copy("สร้าง Estimate", "Create estimate", "見積を作成")} subtitle={inquiry.number} size="lg" onClose={() => { if (!busy) onClose(); }}
    footer={<><button className="btn ghost" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn primary" type="button" disabled={busy || !ready} onClick={() => { void submit(); }}><Icon name="check" />{busy ? <LocalizedText text={"Creating…"} /> : startFrom === "copy" ? copy("สร้างจาก Estimate ที่เลือก", "Create from the chosen estimate", "選択した見積から作成") : copy("สร้าง Estimate ว่าง", "Create an empty estimate", "空の見積を作成")}</button></>}>
    {error ? <div className="info-strip red" role="alert" style={{ marginBottom: 12 }}><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="form-grid two">
      <StartFromChoice idPrefix="inquiry-estimate" startFrom={startFrom} onStartFrom={setStartFrom} source={source} onSource={setSource} ledgers={ledgers} onLedgers={setLedgers} />
    </div>
  </Modal>;
}
