"use client";
import { useEffect, useState } from "react";
import { currentLocale } from "../i18n";
import {
  downloadSupplierQuotation,
  listQuotationLines,
  listSupplierQuotations,
  updateSupplierQuotation,
  type BootstrapData,
  type EstimateCostWorkspace,
  type QuotationLineItem,
  type SupplierQuotationRecord,
} from "../api-client";
import { Badge, EmptyState, Field, Icon, Modal, SearchInput } from "../ui";
import { COST_CATEGORIES } from "./CostItemFields";
import { SupplierQuotationUploadModal } from "./PlanningPricingScreens";
import { estimateApplyOwnerId, estimateForbiddenSections, estimateUxCopy } from "../../../lib/estimate-ux";

/*
 * "Add items → Supplier quotation". The engineer files the supplier's quotation without leaving
 * the estimate (the RFQ is filled in), sees every quotation filed against this RFQ, opens the
 * document, and ticks the lines that go into the estimate in one go. Prices stay on the server:
 * the client sends line ids and whole-unit quantities, and the server reads the stored price and
 * converts a JPY, USD or EUR one at the THB rate filed on the quotation.
 */

export type QuotationApplyInput = { quotationId: number; categoryCode: string; module: string; ownerId: number; lines: { lineId: number; quantity: number }[] };

const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const baht = (value: number) => new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const amountIn = (value: number, currency: string) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency, maximumFractionDigits: 4 }).format(value);
const shortDate = (value: string) => new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(value + "T00:00:00+07:00"));
const STATUS_TONE: Record<SupplierQuotationRecord["status"], "green" | "amber" | "red" | "slate"> = { Valid: "green", Expiring: "amber", Expired: "red", Superseded: "slate" };

/** The THB rate a line converts at, or why it cannot reach the estimate. */
function lineRate(line: QuotationLineItem, quotation: SupplierQuotationRecord): number | string {
  if (line.currency === "THB") return 1;
  if (line.currency !== quotation.currency) return copy(`รายการเป็น ${line.currency} แต่ใบเป็น ${quotation.currency}`, `Line is in ${line.currency}, the quotation in ${quotation.currency}`, `明細は${line.currency}、見積は${quotation.currency}`);
  return quotation.thbRate ?? copy("ยังไม่มีอัตราบาท", "No THB rate yet", "THBレート未設定");
}

/* Quotations price by the metre or by the kilogram; a cost line counts whole units, so a part
   quantity starts rounded up and the person sees and can change it. */
const startingQuantity = (qty: number) => String(Math.max(1, Math.ceil(Number(qty) || 1)));

export function EstimateQuotationSource({ workspace, bootstrap, busy, target, sources, onClose, onApply }: {
  workspace: EstimateCostWorkspace;
  bootstrap: BootstrapData;
  busy: boolean;
  target: { categoryCode: string; category: string; module: string } | null;
  sources?: (locked: boolean) => React.ReactNode;
  onClose: () => void;
  onApply: (input: QuotationApplyInput) => Promise<boolean>;
}) {
  const header = workspace.header;
  const [scope, setScope] = useState<"rfq" | "all">(header.inquiryId ? "rfq" : "all");
  const [search, setSearch] = useState("");
  const [quotations, setQuotations] = useState<SupplierQuotationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<SupplierQuotationRecord | null>(null);
  const [lines, setLines] = useState<QuotationLineItem[] | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [rateDraft, setRateDraft] = useState("");
  const [savingRate, setSavingRate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const allowedCategories = COST_CATEGORIES.filter(([code]) => workspace.capabilities.canEditAllSections || workspace.capabilities.editableSections.includes(code));
  const [categoryChoice, setCategoryChoice] = useState<string>(allowedCategories[0]?.[0] ?? "01");
  const [moduleChoice, setModuleChoice] = useState("");
  const categoryCode = target?.categoryCode ?? categoryChoice;
  const moduleName = target ? target.module : moduleChoice.trim();
  const ownerId = estimateApplyOwnerId(workspace.capabilities, header.ownerId, bootstrap.user.id);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void listSupplierQuotations({
        pageSize: 50,
        inquiryId: scope === "rfq" && header.inquiryId ? header.inquiryId : undefined,
        search: scope === "all" ? search.trim() || undefined : undefined,
      })
        .then((result) => { if (active) { setQuotations(result.items); setTotal(result.total); setError(""); } })
        .catch((requestError) => { if (active) setError(toError(requestError)); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [scope, search, refreshKey, header.inquiryId]);

  const choose = async (record: SupplierQuotationRecord) => {
    setSelected(record); setLines(null); setPicked([]); setError("");
    setRateDraft(record.thbRate ? String(record.thbRate) : "");
    try {
      const loaded = await listQuotationLines(record.id);
      setLines(loaded);
      setQuantities(Object.fromEntries(loaded.map((line) => [line.id ?? 0, startingQuantity(line.qty)])));
      setPicked(loaded.filter((line) => line.id && typeof lineRate(line, record) === "number").map((line) => line.id!));
    } catch (requestError) { setError(toError(requestError)); }
  };

  const download = async (record: SupplierQuotationRecord) => {
    setDownloadingId(record.id);
    try {
      const file = await downloadSupplierQuotation(record.id);
      const href = URL.createObjectURL(file.blob);
      const anchor = document.createElement("a");
      anchor.href = href; anchor.download = file.fileName || record.fileName;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      URL.revokeObjectURL(href);
    } catch (requestError) { setError(toError(requestError)); }
    finally { setDownloadingId(null); }
  };

  /* An older foreign quotation may have been filed before rates existed; it is fixed here rather
     than by sending the engineer to another menu. */
  const saveRate = async () => {
    if (!selected) return;
    setSavingRate(true); setError("");
    try {
      const rate = Number(rateDraft);
      const saved = await updateSupplierQuotation(selected.id, { thbRate: rate, rowVersion: selected.rowVersion });
      const next = { ...selected, thbRate: rate, rowVersion: saved.rowVersion };
      setSelected(next);
      setQuotations((current) => current.map((record) => record.id === next.id ? next : record));
      if (lines) setPicked(lines.filter((line) => line.id && typeof lineRate(line, next) === "number").map((line) => line.id!));
    } catch (requestError) { setError(toError(requestError)); }
    finally { setSavingRate(false); }
  };

  if (uploading) {
    return <SupplierQuotationUploadModal bootstrap={bootstrap}
      defaultInquiry={header.inquiryId ? { id: header.inquiryId, number: header.inquiryNumber, projectName: header.projectName, customerName: header.customerName } : undefined}
      onClose={() => setUploading(false)}
      onCreated={async (quotationNumber, lineCount, quotationId) => {
        setUploading(false);
        setNotice(copy(`อัปโหลด ${quotationNumber} แล้ว · ${lineCount} รายการราคา`, `${quotationNumber} uploaded · ${lineCount} price line(s)`, `${quotationNumber} をアップロード · 価格明細 ${lineCount} 件`));
        setRefreshKey((value) => value + 1);
        try {
          const found = (await listSupplierQuotations({ search: quotationNumber, pageSize: 5 })).items.find((record) => record.id === quotationId);
          if (found) await choose(found);
        } catch (requestError) { setError(toError(requestError)); }
      }} />;
  }

  const rateValue = Number(rateDraft);
  const rateDraftValid = Boolean(rateDraft.trim()) && Number.isFinite(rateValue) && rateValue > 0 && rateValue <= 100_000;
  const projected = selected && lines ? lines.filter((line) => line.id && picked.includes(line.id)).map((line) => {
    const rate = lineRate(line, selected);
    const quantity = Number(quantities[line.id!] ?? "");
    const unitCost = typeof rate === "number" ? Math.round(line.unitPrice * rate * 10_000) / 10_000 : 0;
    return { line, quantity, unitCost, valid: typeof rate === "number" && Number.isInteger(quantity) && quantity >= 1 };
  }) : [];
  const projectedTotal = projected.reduce((sum, entry) => sum + entry.quantity * entry.unitCost, 0);
  const alreadyAdded = selected ? workspace.costItems.filter((item) => item.referenceNumber === selected.quotationNumber).length : 0;
  const forbidden = estimateForbiddenSections(workspace.capabilities, [categoryCode]);
  const blocker = !workspace.capabilities.canEditCostItems
    ? copy("คุณเพิ่มรายการต้นทุนใน Estimate นี้ไม่ได้", "You cannot add cost lines to this estimate.", "この見積には原価明細を追加できません。")
    : forbidden.length ? copy(`หมวด ${forbidden.join(", ")} ไม่ได้มอบหมายให้คุณ`, `Section ${forbidden.join(", ")} is not assigned to you.`, `区分 ${forbidden.join(", ")} は担当外です。`) : "";
  const valid = Boolean(selected && projected.length && projected.every((entry) => entry.valid)) && !blocker;
  const moduleOptions = [...new Set(workspace.costItems.filter((item) => item.categoryCode === categoryCode).map((item) => item.module).filter(Boolean))];
  const usableCount = selected && lines ? lines.filter((line) => typeof lineRate(line, selected) === "number").length : 0;

  return <Modal title={copy("เพิ่มรายการจากใบเสนอราคา", "Add items from a supplier quotation", "仕入先見積から明細を追加")}
    subtitle={copy("อัปโหลดหรือเลือกใบเสนอราคาของงานนี้ แล้วติ๊กรายการที่จะลง Estimate", "Upload or pick this job's quotation, then tick the lines that go into the estimate", "この案件の見積をアップロードまたは選択し、見積へ入れる明細を選びます")}
    size="wide" onClose={onClose} footer={<>
      {selected && projected.length ? <span className="muted">{copy("รวม", "Total", "合計")} <strong>{baht(projectedTotal)}</strong> THB</span> : null}
      <span className="spacer" />
      <button className="btn ghost" type="button" disabled={busy || saving} onClick={onClose}>{copy("ยกเลิก", "Cancel", "キャンセル")}</button>
      <button className="btn primary" type="button" disabled={!valid || busy || saving} onClick={async () => {
        if (!selected) return;
        setSaving(true);
        await onApply({ quotationId: selected.id, categoryCode, module: moduleName, ownerId, lines: projected.map((entry) => ({ lineId: entry.line.id!, quantity: entry.quantity })) });
        setSaving(false);
      }}><Icon name="plus" />{saving ? copy("กำลังเพิ่ม…", "Adding…", "追加中…") : copy(`เพิ่ม ${projected.length} รายการ`, `Add ${projected.length} item(s)`, `${projected.length}件を追加`)}</button>
    </>}>
    {sources?.(busy || saving || savingRate)}
    {notice ? <div className="info-strip green"><Icon name="checkCircle" /><span>{notice}</span></div> : null}
    {error ? <div className="info-strip red"><Icon name="alertCircle" /><span>{error}</span></div> : null}

    <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {header.inquiryId ? <div className="est-source-tabs" role="group" aria-label={copy("ขอบเขต", "Scope", "範囲")}>
        <button type="button" className={scope === "rfq" ? "est-source active" : "est-source"} aria-pressed={scope === "rfq"} onClick={() => setScope("rfq")}><Icon name="inbox" />{copy(`ของ RFQ ${header.inquiryNumber}`, `Filed for RFQ ${header.inquiryNumber}`, `RFQ ${header.inquiryNumber} の見積`)}</button>
        <button type="button" className={scope === "all" ? "est-source active" : "est-source"} aria-pressed={scope === "all"} onClick={() => setScope("all")}><Icon name="search" />{copy("ค้นทุกใบ", "Search all", "すべて検索")}</button>
      </div> : null}
      {scope === "all" ? <SearchInput value={search} onChange={setSearch} placeholder="Search quotation no., supplier, inquiry, project or file…" /> : null}
      <span className="spacer" />
      {bootstrap.permissions.includes("estimate.write") ? <button className="btn primary" type="button" disabled={busy || saving} onClick={() => { setNotice(""); setUploading(true); }}><Icon name="upload" />{copy("อัปโหลดใบเสนอราคา", "Upload quotation", "見積をアップロード")}</button> : null}
    </div>

    {loading ? <div className="empty"><span className="spinner" />{copy("กำลังโหลดใบเสนอราคา…", "Loading supplier quotations…", "見積を読み込み中…")}</div> : quotations.length ? <div className="table-wrap" style={{ marginTop: 12, maxHeight: 260 }}><table>
      <thead><tr>
        <th>{copy("เลขที่", "Quotation", "見積番号")}</th><th>{copy("ผู้ขาย", "Supplier", "仕入先")}</th><th>{copy("วันที่ / ใช้ได้ถึง", "Received / valid until", "受領日 / 有効期限")}</th>
        <th>{copy("สกุลเงิน", "Currency", "通貨")}</th><th className="num">{copy("ยอด", "Amount", "金額")}</th><th className="num">{copy("รายการ", "Lines", "明細")}</th><th />
      </tr></thead>
      <tbody>{quotations.map((record) => <tr key={record.id} className={selected?.id === record.id ? "selected" : undefined}>
        <td><div className="cell-primary"><strong className="mono">{record.quotationNumber}</strong><span>{record.supplierReference || record.inquiryNumber || "—"}</span></div></td>
        <td>{record.supplierName}</td>
        <td><div className="cell-primary"><strong>{shortDate(record.receivedDate)}</strong><span>{shortDate(record.validUntil)} <Badge tone={STATUS_TONE[record.status]}>{record.status}</Badge></span></div></td>
        <td><Badge>{record.currency}</Badge>{record.currency !== "THB" && !record.thbRate ? <> <Badge tone="amber">{copy("ไม่มีอัตรา", "No rate", "レートなし")}</Badge></> : null}</td>
        <td className="num">{amountIn(record.amount, record.currency)}</td>
        <td className="num">{record.lineCount}</td>
        <td><div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {record.sourceKind === "WebReference"
            ? <a className="btn ghost sm" href={record.sourceUrl} target="_blank" rel="noopener noreferrer"><Icon name="externalLink" />{copy("เปิดลิงก์", "Open link", "リンクを開く")}</a>
            : <button className="btn ghost sm" type="button" disabled={downloadingId === record.id} onClick={() => { void download(record); }}><Icon name="download" />{copy("ไฟล์", "File", "ファイル")}</button>}
          <button className="btn default sm" type="button" disabled={busy || saving || !record.lineCount} onClick={() => { void choose(record); }}>{selected?.id === record.id ? copy("เลือกแล้ว", "Selected", "選択中") : copy("เลือก", "Select", "選択")}</button>
        </div></td>
      </tr>)}</tbody>
    </table></div> : <EmptyState icon="quote" title={scope === "rfq" ? copy("ยังไม่มีใบเสนอราคาของ RFQ นี้", "No quotation filed for this RFQ yet", "このRFQの見積はまだありません") : copy("ไม่พบใบเสนอราคา", "No supplier quotation found", "見積が見つかりません")}
      message={copy("กดอัปโหลดใบเสนอราคา ระบบจะอ่าน PDF และผูกกับ RFQ ของงานนี้ให้", "Upload the quotation; the PDF is read for you and filed against this job's RFQ", "見積をアップロードすると PDF を読み取り、この案件の RFQ に紐付けます")} />}
    {total > quotations.length ? <p className="muted">{copy(`แสดง ${quotations.length} จาก ${total} ใบ · ค้นให้แคบลง`, `Showing ${quotations.length} of ${total} · narrow the search`, `${total}件中${quotations.length}件を表示`)}</p> : null}

    {selected ? <>
      <div className="info-strip est-add-target" style={{ marginTop: 12 }}><Icon name="layers" /><span>{target
        ? <>{copy("เพิ่มเข้าโมดูล", "Adding to module", "追加先モジュール")}: <strong>{target.module}</strong> · {target.categoryCode} {target.category}</>
        : <>{selected.quotationNumber} · {selected.supplierName}{alreadyAdded ? <> · <strong>{copy(`มี ${alreadyAdded} รายการจากใบนี้ใน Estimate แล้ว`, `${alreadyAdded} line(s) from this quotation are already in the estimate`, `この見積の明細が既に ${alreadyAdded} 件あります`)}</strong></> : null}</>}</span></div>
      {blocker ? <div className="info-strip red"><Icon name="alertCircle" /><span>{blocker}</span></div> : null}
      <div className="form-grid three" style={{ marginTop: 12 }}>
        {target ? null : <>
          <Field label={copy("หมวด *", "Section *", "区分 *")}>
            <select value={categoryChoice} onChange={(event) => setCategoryChoice(event.target.value)}>
              {allowedCategories.map(([code, name]) => <option key={code} value={code}>{code} {name}</option>)}
            </select>
          </Field>
          <Field label={copy("โมดูล", "Module", "モジュール")} hint={copy("เว้นว่าง = รายการทั่วไป (ไม่อยู่ในโมดูล)", "Blank = general items (no module)", "空欄 = 一般明細（モジュールなし）")}>
            <input maxLength={200} list="estimate-quotation-modules" value={moduleChoice} onChange={(event) => setModuleChoice(event.target.value)} />
            <datalist id="estimate-quotation-modules">{moduleOptions.map((name) => <option key={name} value={name} />)}</datalist>
          </Field>
        </>}
        {selected.currency !== "THB" ? <Field label={copy(`1 ${selected.currency} = กี่บาท *`, `THB per 1 ${selected.currency} *`, `1 ${selected.currency} = THB *`)}
          hint={selected.thbRate ? copy("อัตราที่บันทึกไว้กับใบนี้", "The rate filed on this quotation", "この見積に登録されたレート") : copy("ใส่อัตราแล้วกดบันทึก จึงจะเพิ่มรายการได้", "Enter and save the rate before adding lines", "レートを保存すると追加できます")}>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="number" min="0.000001" max="100000" step="0.0001" inputMode="decimal" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} />
            {rateDraftValid && rateValue !== selected.thbRate ? <button className="btn default sm" type="button" disabled={savingRate} onClick={() => { void saveRate(); }}><Icon name="check" />{savingRate ? copy("กำลังบันทึก…", "Saving…", "保存中…") : copy("บันทึกอัตรา", "Save rate", "レートを保存")}</button> : null}
          </div>
        </Field> : null}
      </div>
      {lines === null ? <div className="empty"><span className="spinner" />{copy("กำลังโหลดรายการ…", "Loading lines…", "明細を読み込み中…")}</div> : <div className="table-wrap tall" style={{ marginTop: 12 }}><table>
        <thead><tr>
          <th className="est-pick-col"><input type="checkbox" aria-label={copy("เลือกทั้งหมด", "Select all", "すべて選択")} disabled={!usableCount} checked={usableCount > 0 && picked.length === usableCount}
            onChange={(event) => setPicked(event.target.checked ? lines.filter((line) => line.id && typeof lineRate(line, selected) === "number").map((line) => line.id!) : [])} /></th>
          <th>{copy("รหัส", "Item code", "品番")}</th><th>{copy("รายละเอียด", "Description", "内容")}</th><th>{copy("ยี่ห้อ / รุ่น", "Brand / model", "メーカー / 型式")}</th>
          <th className="num">{copy("จำนวนในใบ", "Quoted qty", "見積数量")}</th><th className="num" style={{ width: 110 }}>{copy("จำนวนลง Estimate", "Estimate qty", "見積へ入れる数量")}</th>
          <th className="num">{copy("ราคา/หน่วย", "Unit price", "単価")}</th><th className="num">{copy("ต้นทุน/หน่วย (THB)", "Unit cost (THB)", "原価単価 (THB)")}</th><th className="num">{copy("รวม (THB)", "Total (THB)", "合計 (THB)")}</th>
        </tr></thead>
        <tbody>{lines.map((line) => {
          const id = line.id ?? 0;
          const rate = lineRate(line, selected);
          const usable = typeof rate === "number";
          const isPicked = picked.includes(id);
          const quantity = Number(quantities[id] ?? "");
          const unitCost = usable ? Math.round(line.unitPrice * rate * 10_000) / 10_000 : 0;
          return <tr key={id} className={isPicked ? "est-picked" : undefined}>
            <td><input type="checkbox" aria-label={copy("เลือก", "Select", "選択") + " " + (line.itemCode || line.description)} disabled={!usable || busy || saving} checked={isPicked}
              onChange={(event) => { const checked = event.target.checked; setPicked((current) => checked ? [...current, id] : current.filter((value) => value !== id)); }} /></td>
            <td className="mono">{line.itemCode || "—"}</td>
            <td className="wrap">{line.description}{usable ? null : <div><Badge tone="amber">{rate}</Badge></div>}</td>
            <td>{[line.brand, line.model].filter(Boolean).join(" · ") || "—"}</td>
            <td className="num">{line.qty} {line.unit}</td>
            <td className="num"><input className="num" type="number" min="1" step="1" style={{ width: 90 }} disabled={!isPicked} value={quantities[id] ?? ""}
              aria-label={copy("จำนวนลง Estimate", "Estimate qty", "見積へ入れる数量")} onChange={(event) => setQuantities((current) => ({ ...current, [id]: event.target.value }))} />
              {isPicked && Number(line.qty) !== quantity ? <div className="muted">{copy("ปรับจาก", "was", "元")} {line.qty}</div> : null}</td>
            <td className="num">{amountIn(line.unitPrice, line.currency)}</td>
            <td className="num">{usable ? baht(unitCost) : "—"}</td>
            <td className="num"><strong>{usable && isPicked && Number.isInteger(quantity) && quantity >= 1 ? baht(unitCost * quantity) : "—"}</strong></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </> : null}
  </Modal>;
}
