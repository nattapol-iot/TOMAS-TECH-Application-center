"use client";
import { useState } from "react";
import { apiRequest, type BootstrapData, type EstimateCostWorkspace } from "../api-client";
import { currentLocale } from "../i18n";
import { estimateUxCopy } from "../../../lib/estimate-ux";
import { Panel, Field } from "../ui";

export function EstimateOverheadPanel({ workspace, bootstrap, onSaved }: { workspace: EstimateCostWorkspace; bootstrap: BootstrapData; onSaved: () => Promise<void> }) {
  const copy = (th: string, en: string, ja: string) => estimateUxCopy(currentLocale(), th, en, ja);
  const overhead = workspace.header.overhead;
  const [setting, setSetting] = useState(false);
  const [budget, setBudget] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canConfigure = bootstrap.permissions.includes("master.write") && ["Admin", "Engineering Manager"].includes(bootstrap.user.role);
  const canApply = workspace.capabilities.canEditAllSections && workspace.capabilities.canEdit && (!overhead || overhead.state === "Missing");
  const money = (value: number) => value.toLocaleString(currentLocale(), { style: "currency", currency: "THB" });
  async function act(configure: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      if (configure) {
        await apiRequest("/api/v1/overhead-policies", { method: "POST", body: JSON.stringify({ monthlyBudget: Number(budget), normalDirectHours: Number(hours), effectiveFrom: date, reason }) });
        setSetting(false); setMessage(copy("บันทึกนโยบายกลางแล้ว กดใช้กับร่างนี้เมื่อต้องการ", "Policy saved. Apply it to this draft when ready.", "方針を保存しました。この下書きに適用できます。"));
      } else {
        await apiRequest(`/api/v1/estimates/${workspace.header.id}/overhead/apply`, { method: "POST", body: JSON.stringify({ rowVersion: workspace.header.rowVersion }) });
        await onSaved();
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Request failed"); }
    finally { setBusy(false); }
  }
  return <Panel title="Overhead" subtitle={copy("ค่าใช้จ่ายส่วนกลาง แยกจากต้นทุนตรงและเงินเผื่อความเสี่ยง", "Shared expenses, separate from direct costs and contingency", "間接費：直接費と予備費とは分けて計算") }>
    {overhead && overhead.state !== "Missing" ? <p><strong>{money(overhead.amount ?? 0)}</strong> · {overhead.eligibleDirectHours} h × {money(overhead.hourlyRate ?? 0)}/h · Policy V{overhead.policyVersion}</p> : <p role="status">{copy("ยังไม่ได้ตั้ง Overhead สำหรับฉบับนี้ ยอดรวมยังไม่รวมค่าใช้จ่ายส่วนนี้", "Overhead is not set for this revision; the total excludes it.", "この版には間接費が未設定のため、合計に含まれていません。")}</p>}
    {error ? <p role="alert">{error}</p> : null}{message ? <p role="status">{message}</p> : null}
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {canApply ? <button type="button" className="btn default" disabled={busy} onClick={() => { void act(false); }}>{copy("ใช้นโยบายปัจจุบันกับร่างนี้", "Apply current policy to this draft", "現在の方針を下書きに適用")}</button> : null}
      {canConfigure ? <button type="button" className="btn ghost" disabled={busy} onClick={() => setSetting(!setting)}>{copy("ตั้งนโยบาย Overhead ของทีม", "Set team overhead policy", "チームの間接費方針を設定")}</button> : null}
    </div>
    {setting ? <form onSubmit={(event) => { event.preventDefault(); void act(true); }} style={{ marginTop: 12 }}>
      <p>{copy("รวมค่าใช้จ่ายที่ทีมใช้ร่วมกัน เช่น Software, IT/NAS และสำนักงาน แล้วหารด้วยชั่วโมงที่ทีมทำงานให้โครงการได้ตามปกติ ไม่รวมค่าแรงและค่าเดินทางที่ลงเป็นต้นทุนตรงแล้ว", "Include shared software, IT/NAS and office expenses, divided by normal project hours. Exclude labor and travel already charged directly to projects.", "共通ソフトウェア、IT/NAS、事務所費用を通常のプロジェクト作業時間で割ります。直接費に計上済みの労務費・旅費は除いてください。")}</p>
      <div className="form-grid two">
        <Field label={copy("ค่าใช้จ่ายส่วนกลางต่อเดือน (บาท)", "Monthly shared budget (THB)", "月間共通費予算 (THB)")}><input required type="number" min="0" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} /></Field>
        <Field label={copy("ชั่วโมงงานตรงปกติต่อเดือน", "Normal direct hours per month", "通常の月間直接作業時間")}><input required type="number" min="0.01" step="0.01" value={hours} onChange={event => setHours(event.target.value)} /></Field>
        <Field label={copy("เริ่มใช้วันที่", "Effective from", "適用開始日")}><input required type="date" value={date} onChange={event => setDate(event.target.value)} /></Field>
        <Field label={copy("เหตุผล / ฐานข้อมูลที่ใช้", "Reason / budget basis", "理由・予算の根拠")}><input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></Field>
      </div>
      <p>{budget !== "" && Number(hours) > 0 ? `${money(Number(budget) / Number(hours))}/h` : "—"} · {copy("ตรวจว่าค่าแรงกลางไม่รวมค่าใช้จ่ายนี้ซ้ำ นโยบายใหม่ไม่เปลี่ยนฉบับเก่า", "Check that labor rates do not already include these costs. Existing revisions stay unchanged.", "労務単価との二重計上を確認してください。既存の版は変更されません。")}</p>
      <button className="btn primary" type="submit" disabled={busy || budget === "" || Number(hours) <= 0 || !date || !reason.trim()}>{copy("บันทึกนโยบายกลาง", "Save team policy", "チーム方針を保存")}</button>
    </form> : null}
  </Panel>;
}
