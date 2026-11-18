"use client";
/* One revision from the history, read-only, and the way back to it (owner 2026-11-18).
   Going back never rewrites history: the server opens a new revision holding a copy of this one's lines,
   and the revision in hand stays in the history, so going back twice returns to where one was. */
import { useEffect, useState } from "react";
import { ApiClientError, loadEstimateRevision, restoreEstimateRevision, type EstimateRevision, type EstimateRevisionDetail } from "../api-client";
import { currentLocale } from "../i18n";
import { estimateUxCopy } from "../../../lib/estimate-ux";
import { revisionCostGroups } from "../../../lib/estimate-revision-view";
import { Icon, Modal } from "../ui";

/** Matches RESTORE_COMMENT_MAX in backend-node/src/routes/estimates.ts. */
const NOTE_MAX = 80;

const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
const money = (value: number | null | undefined) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const amount = (value: number) => value.toLocaleString(currentLocale(), { maximumFractionDigits: 2 });
const revisionCode = (revision: number) => `R${String(revision).padStart(2, "0")}`;

const TOTAL_LABELS: Array<[keyof NonNullable<EstimateRevisionDetail["totals"]>, () => string]> = [
  ["material", () => copy("วัสดุ", "Material", "材料")],
  ["engineering", () => copy("ค่าแรง", "Labor", "労務")],
  ["outsource", () => copy("จ้างภายนอก", "Outsource", "外注")],
  ["transportation", () => copy("เดินทาง/ขนส่ง", "Transportation", "交通・輸送")],
  ["accommodation", () => copy("ที่พัก/เบี้ยเลี้ยง", "Accommodation", "宿泊・日当")],
  ["other", () => copy("อื่น ๆ", "Other", "その他")],
  ["overhead", () => "Overhead"],
  ["contingency", () => copy("สำรอง", "Contingency", "予備費")],
];

export function EstimateRevisionView({ estimateId, estimateNumber, revision, currentRevision, rowVersion, canRestore, onClose, onRestored }: {
  estimateId: number; estimateNumber: string; revision: EstimateRevision; currentRevision: number; rowVersion: string; canRestore: boolean;
  onClose: () => void; onRestored: (message: string) => Promise<void> | void;
}) {
  const [detail, setDetail] = useState<EstimateRevisionDetail | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const code = revision.code || revisionCode(revision.revision);
  const currentCode = revisionCode(currentRevision);

  useEffect(() => {
    let alive = true;
    loadEstimateRevision(estimateId, revision.revision)
      .then((loaded) => { if (alive) setDetail(loaded); })
      .catch((requestError: unknown) => { if (alive) setError(requestError instanceof Error ? requestError.message : String(requestError)); });
    return () => { alive = false; };
  }, [estimateId, revision.revision]);

  const restore = async () => {
    setBusy(true); setError("");
    try {
      const result = await restoreEstimateRevision(estimateId, revision.revision, rowVersion, note);
      const opened = revisionCode(result.revision);
      await onRestored(copy(`${estimateNumber} เปิด ${opened} จากรายการของ ${code} แล้ว · ${currentCode} ยังอยู่ในประวัติ`,
        `${estimateNumber} opened ${opened} from the lines of ${code} · ${currentCode} stays in the history`,
        `${estimateNumber}：${code} の明細から ${opened} を開きました · ${currentCode} は履歴に残ります`));
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      // Someone changed the estimate meanwhile: close and reload it, so the next try starts from what is there now.
      if (requestError instanceof ApiClientError && requestError.status === 409) { await onRestored(message); return; }
      setError(message);
      setBusy(false);
    }
  };

  const groups = detail ? revisionCostGroups(detail.costItems) : [];
  const empty = detail !== null && !detail.costItems.length && !detail.manhourLines.length && !detail.expenseLines.length && !detail.otherCostLines.length;
  const footer = confirming
    ? <><button className="btn ghost" type="button" disabled={busy} onClick={() => { setError(""); setConfirming(false); }}>{copy("ย้อนกลับ", "Back", "戻る")}</button>
      <button className="btn primary" type="button" data-guide="estimate.revisionConfirm" disabled={busy} onClick={() => { void restore(); }}><Icon name="gitBranch" />{busy ? copy("กำลังเปิด Revision…", "Opening the revision…", "改訂を開いています…") : copy(`ยืนยัน กลับไปใช้ ${code}`, `Confirm: go back to ${code}`, `${code} に戻すことを確定`)}</button></>
    : <><button className="btn ghost" type="button" onClick={onClose}>{copy("ปิด", "Close", "閉じる")}</button>
      {canRestore ? <button className="btn primary" type="button" data-guide="estimate.revisionRestore" disabled={!detail} onClick={() => setConfirming(true)}><Icon name="gitBranch" />{copy("ใช้ Revision นี้ทำต่อ", "Continue from this revision", "この改訂から続ける")}</button> : null}</>;

  return <Modal title={`${estimateNumber} · ${code}`} subtitle={copy("รายการของ Revision นี้ตามที่บันทึกไว้ · อ่านอย่างเดียว", "The lines of this revision as they were recorded · read-only", "この改訂の記録済み明細 · 読み取り専用")} size="xl" onClose={() => { if (!busy) onClose(); }} footer={footer}>
    {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    {confirming ? <div className="stack">
      <div className="info-strip amber"><Icon name="alertTriangle" /><ul className="est-rev-points">
        <li>{copy(`ระบบจะเปิด Revision ใหม่ที่คัดลอกรายการจาก ${code}`, `A new revision opens holding a copy of the lines of ${code}.`, `${code} の明細をコピーした新しい改訂を開きます。`)}</li>
        <li>{copy(`${currentCode} ที่ทำอยู่ตอนนี้ยังเก็บไว้ในประวัติ กลับไปใช้ได้อีก`, `${currentCode}, the one in hand, stays in the history and can be gone back to.`, `作業中の ${currentCode} は履歴に残り、あとで戻せます。`)}</li>
        <li>{copy(`Revision ใหม่ต้องส่งอนุมัติตามปกติ ยอดรวมอาจต่างจาก ${code} เดิม เพราะใช้อัตรา Overhead ของวันนี้`, `The new revision is sent for approval as usual. Its total may differ from ${code} because it takes today's overhead rate.`, `新しい改訂は通常どおり承認依頼が必要です。本日の間接費レートを使うため、合計が ${code} と異なる場合があります。`)}</li>
      </ul></div>
      <label className="field"><span>{copy("เหตุผล (ไม่บังคับ)", "Reason (optional)", "理由（任意）")}</span>
        <input value={note} maxLength={NOTE_MAX} disabled={busy} onChange={(event) => setNote(event.target.value)} placeholder={copy("เช่น ลูกค้ากลับไปใช้ขอบเขตเดิม", "e.g. the customer returned to the earlier scope", "例：顧客が以前の範囲に戻した")} /></label>
    </div> : !detail ? (error ? null : <p className="muted">{copy("กำลังโหลดรายการ…", "Loading the lines…", "明細を読み込み中…")}</p>) : <div className="stack">
      <div className="est-rev-totals">
        {detail.totals ? TOTAL_LABELS.filter(([key]) => detail.totals?.[key] !== null && detail.totals?.[key] !== undefined && Math.abs(Number(detail.totals[key])) > 0.005)
          .map(([key, label]) => <span className="est-rev-total" key={key}><small>{label()}</small><strong>{money(detail.totals?.[key])}</strong></span>) : null}
        <span className="est-rev-total grand"><small>{copy("ยอดรวมที่บันทึกไว้", "Recorded total", "記録された合計")}</small><strong>{money(detail.total)}</strong></span>
      </div>
      {empty ? <p className="muted">{copy("Revision นี้ไม่มีรายการ", "This revision holds no lines.", "この改訂には明細がありません。")}</p> : null}
      {groups.length ? <section><h4 className="est-rev-heading">{copy("รายการต้นทุน", "Cost items", "原価明細")} · {detail.costItems.length}</h4>
        <div className="table-wrap"><table className="est-rev-table">
          <thead><tr><th>{copy("รายการ", "Item", "品目")}</th><th>{copy("ผู้ขาย", "Supplier", "仕入先")}</th><th className="num">{copy("จำนวน", "Qty", "数量")}</th><th className="num">{copy("ราคาต่อหน่วย", "Unit cost", "単価")}</th><th className="num">{copy("รวม", "Amount", "金額")}</th></tr></thead>
          <tbody>{groups.map((group, index) => [
            <tr className="est-rev-group" key={`${index}:${group.key}`}><td colSpan={4}><strong>{group.title || "—"}</strong>{group.multiplied ? <span className="est-sub"> · {copy("คูณจำนวน Module แล้ว", "times the module quantity", "モジュール数量を乗算")}</span> : null}</td><td className="num"><strong>{amount(group.counted)}</strong></td></tr>,
            ...group.lines.map((line) => <tr key={line.id}>
              <td className="wrap">{line.description || line.itemCode}<div className="est-sub">{[line.itemCode, line.brand, line.model].filter(Boolean).join(" · ")}</div></td>
              <td>{line.supplierName ?? "—"}</td><td className="num">{amount(line.quantity)} {line.unit}</td><td className="num">{amount(line.unitCost)}</td><td className="num">{amount(line.lineTotal)}</td></tr>),
          ])}</tbody>
        </table></div></section> : null}
      {detail.manhourLines.length ? <section><h4 className="est-rev-heading">{copy("ค่าแรง", "Labor", "労務")} · {detail.manhourLines.length}</h4>
        <div className="table-wrap"><table className="est-rev-table">
          <thead><tr><th>{copy("งาน", "Activity", "作業")}</th><th>{copy("ผู้ทำ", "By", "担当")}</th><th className="num">{copy("คน × วัน", "People × days", "人数 × 日数")}</th><th className="num">{copy("อัตราต่อวัน", "Daily rate", "日額")}</th><th className="num">{copy("รวม", "Amount", "金額")}</th></tr></thead>
          <tbody>{detail.manhourLines.map((line) => <tr key={line.id}>
            <td className="wrap">{line.activity}<div className="est-sub">{[line.package, line.discipline].filter(Boolean).join(" · ")}</div></td>
            <td>{line.provider === "Supplier" ? line.supplierName ?? copy("ผู้ขาย", "Supplier", "仕入先") : copy("ภายใน", "In-house", "社内")}</td>
            <td className="num">{amount(line.engineers)} × {amount(line.manDays)}</td><td className="num">{amount(line.dailyRate)}</td><td className="num">{amount(line.lineCost)}</td></tr>)}</tbody>
        </table></div></section> : null}
      {detail.expenseLines.length ? <section><h4 className="est-rev-heading">{copy("ค่าใช้จ่าย", "Expenses", "経費")} · {detail.expenseLines.length}</h4>
        <div className="table-wrap"><table className="est-rev-table">
          <thead><tr><th>{copy("รายการ", "Item", "項目")}</th><th>{copy("ประเภท", "Type", "種類")}</th><th className="num">{copy("จำนวน", "Qty", "数量")}</th><th className="num">{copy("ราคาต่อหน่วย", "Unit cost", "単価")}</th><th className="num">{copy("รวม", "Amount", "金額")}</th></tr></thead>
          <tbody>{detail.expenseLines.map((line) => <tr key={line.id}>
            <td className="wrap">{line.description}<div className="est-sub">{line.package}</div></td><td>{line.expenseType}</td>
            <td className="num">{amount(line.quantity)} {line.unit}</td><td className="num">{amount(line.unitCost)}</td><td className="num">{amount(line.lineTotal)}</td></tr>)}</tbody>
        </table></div></section> : null}
      {detail.otherCostLines.length ? <section><h4 className="est-rev-heading">{copy("ต้นทุนอื่น", "Other costs", "その他原価")} · {detail.otherCostLines.length}</h4>
        <div className="table-wrap"><table className="est-rev-table">
          <thead><tr><th>{copy("รายการ", "Item", "項目")}</th><th>{copy("หมวด", "Category", "区分")}</th><th className="num">{copy("จำนวน", "Qty", "数量")}</th><th className="num">{copy("ราคาต่อหน่วย", "Unit cost", "単価")}</th><th className="num">{copy("รวม", "Amount", "金額")}</th></tr></thead>
          <tbody>{detail.otherCostLines.map((line) => <tr key={line.id}>
            <td className="wrap">{line.description}</td><td>{line.category}</td>
            <td className="num">{amount(line.quantity)} {line.unit}</td><td className="num">{amount(line.unitCost)}</td><td className="num">{amount(line.lineTotal)}</td></tr>)}</tbody>
        </table></div></section> : null}
      {!canRestore ? <p className="est-sub">{copy("เจ้าของ Estimate หรือผู้จัดการกลับไปใช้ Revision นี้ได้ เมื่อ Estimate อนุมัติแล้วหรือกำลังแก้ไข (ระหว่างรอตรวจให้ถอนการส่งก่อน)",
        "The estimate's owner or a manager can go back to this revision while the estimate is approved or being edited (withdraw a review first).",
        "見積の担当者または管理者は、承認済みまたは編集中のときにこの改訂へ戻せます（レビュー中は先に取り下げます）。")}</p> : null}
    </div>}
  </Modal>;
}
