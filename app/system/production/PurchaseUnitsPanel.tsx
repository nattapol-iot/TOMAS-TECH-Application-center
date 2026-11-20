"use client";

import { useState } from "react";
import { apiRequest } from "../api-client";
import { currentLocale, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, Icon, Panel } from "../ui";
import { useEndpoint } from "./material-endpoint";
import { DISCIPLINE_NAME, isOverdue, moduleRoom, PURCHASE_DISCIPLINES, type PurchaseUnit, type PurchaseUnits, unitTotals } from "../../../lib/purchase-units";
import { estimateBusinessDate } from "../../../lib/estimate-ux";

const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB", maximumFractionDigits: 2 }).format(Number(value) || 0);
const toError = (error: unknown) => error instanceof Error ? error.message : "The request could not be completed.";
const day = (value: string | null | undefined) => value ? new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)) : "—";
type Draft = { id: number | null; rowVersion: string; module: string; discipline: string; drawingNo: string; unitName: string; isGeneral: boolean; budget: string };
const EMPTY: Draft = { id: null, rowVersion: "", module: "", discipline: "ME", drawingNo: "", unitName: "", isGeneral: false, budget: "" };

/**
 * A project's Units, in its BOM: each Module's budget and how much of it its Units have, each Unit's budget against what was
 * asked for it, and the same by discipline. The Excel PR-Form kept one file per Unit, so a discipline's total was in nobody's view.
 */
export function PurchaseUnitsPanel({ projectId, canEdit, notify }: { projectId: number; canEdit: boolean; notify: (message: string) => void }) {
  const t = useT();
  const endpoint = useEndpoint<PurchaseUnits | null>(projectId ? `/api/v1/projects/${projectId}/purchase-units` : null, null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The Unit whose requests are listed under its row.
  const [open, setOpen] = useState<number | null>(null);
  const today = estimateBusinessDate();
  // What is still waiting to be ordered, and the earliest date one of those lines is needed by; red once that date has passed.
  const waiting = (lines: number | undefined, needBy: string | null | undefined) => <>{lines ? <span>{lines} <LocalizedText text={"รายการ"} /></span> : <span className="muted">—</span>}
    {lines && needBy ? <small className={isOverdue(needBy, today) ? "red-text" : "muted"}>{day(needBy)}{isOverdue(needBy, today) ? <> · <LocalizedText text={"เกินกำหนด"} /></> : null}</small> : null}</>;
  const data = endpoint.data;
  if (!data) return endpoint.error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{endpoint.error}</span></div> : null;
  const editing = draft?.id ? data.units.find((unit) => unit.id === draft.id) : undefined;
  // What the chosen Module can still give: its budget less its other Units' shares.
  const room = draft?.module ? moduleRoom(data.modules, draft.module, editing?.budget ?? 0) : 0;
  const budget = Number(draft?.budget ?? 0);
  const problem = !draft ? "" : !draft.module ? "เลือก Module" : !draft.isGeneral && !draft.drawingNo.trim() ? "ใส่ Drawing No." : !draft.isGeneral && !draft.unitName.trim() ? "ใส่ชื่อ Unit"
    : !Number.isFinite(budget) || budget < 0 ? "ใส่งบของ Unit" : budget > room ? "งบของ Unit เกินงบที่เหลือของ Module" : "";
  const save = async () => {
    if (!draft || problem) return;
    setBusy(true); setError("");
    try {
      const fields = { module: draft.module, discipline: draft.discipline, isGeneral: draft.isGeneral, drawingNo: draft.isGeneral ? undefined : draft.drawingNo.trim(), unitName: draft.unitName.trim() || undefined, budget };
      if (draft.id) await apiRequest(`/api/v1/purchase-units/${draft.id}`, { method: "PUT", body: JSON.stringify({ ...fields, rowVersion: draft.rowVersion }) });
      else await apiRequest(`/api/v1/projects/${projectId}/purchase-units`, { method: "POST", body: JSON.stringify(fields) });
      notify(`${draft.discipline} ${draft.isGeneral ? draft.unitName || "General / Common" : draft.drawingNo}`); setDraft(null); endpoint.reload();
    } catch (saveError) { setError(toError(saveError)); }
    finally { setBusy(false); }
  };
  const remove = async (unit: PurchaseUnit) => {
    setBusy(true); setError("");
    try { await apiRequest(`/api/v1/purchase-units/${unit.id}/remove`, { method: "POST", body: JSON.stringify({ rowVersion: unit.rowVersion }) }); endpoint.reload(); }
    catch (removeError) { setError(toError(removeError)); }
    finally { setBusy(false); }
  };
  const edit = (unit: PurchaseUnit) => { setError(""); setDraft({ id: unit.id, rowVersion: unit.rowVersion, module: unit.module, discipline: unit.discipline, drawingNo: unit.drawingNo, unitName: unit.unitName, isGeneral: unit.isGeneral, budget: String(unit.budget) }); };
  return (
    <Panel guide="bom.units" title={`${t("Unit ของโครงการ")} (${data.units.length})`} subtitle="Unit อยู่ใต้ Module และแบ่งงบจาก Module นั้น ใบขอซื้อออกให้ Unit"
      actions={canEdit && !draft ? <button className="btn ghost sm" type="button" data-guide="bom.unit-add" onClick={() => { setError(""); setDraft({ ...EMPTY, module: data.modules[0]?.module ?? "" }); }}><Icon name="plus" /><LocalizedText text={"เพิ่ม Unit"} /></button> : undefined} flush>
      {error ? <div className="callout danger" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
      {draft ? <div className="pr-unit-form">
        <label><span>Module</span><select value={draft.module} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, module: event.target.value })}>
          {data.modules.map((item) => <option key={item.module} value={item.module}>{item.module} · {t("เหลือแบ่ง")} {money(item.ungiven)}</option>)}</select></label>
        <label><span><LocalizedText text={"Discipline"} /></span><select value={draft.discipline} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, discipline: event.target.value })}>
          {PURCHASE_DISCIPLINES.map((code) => <option key={code} value={code}>{code} · {DISCIPLINE_NAME[code]}</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={draft.isGeneral} disabled={Boolean(draft.id)} onChange={(event) => setDraft({ ...draft, isGeneral: event.target.checked, drawingNo: event.target.checked ? "" : draft.drawingNo })} /><span><LocalizedText text={"Unit ทั่วไป (ไม่มี Drawing)"} /></span></label>
        <label><span>Drawing No.</span><input maxLength={100} value={draft.drawingNo} disabled={draft.isGeneral} placeholder="MZ08-U001" onChange={(event) => setDraft({ ...draft, drawingNo: event.target.value })} /></label>
        <label className="wide"><span><LocalizedText text={"ชื่อ Unit"} /></span><input maxLength={200} value={draft.unitName} placeholder={draft.isGeneral ? "General / Common" : "MASTER VALVE UNIT"} onChange={(event) => setDraft({ ...draft, unitName: event.target.value })} /></label>
        <label><span><LocalizedText text={"งบของ Unit"} /></span><input type="number" min="0" step="0.01" value={draft.budget} onChange={(event) => setDraft({ ...draft, budget: event.target.value })} />
          <small className={budget > room ? "red-text" : "muted"}>{t("Module นี้ให้ได้อีก")} {money(room)}</small></label>
        <span className="actions">{problem ? <small className="red-text">{t(problem)}</small> : null}
          <button className="btn ghost sm" type="button" disabled={busy} onClick={() => { setDraft(null); setError(""); }}><LocalizedText text={"Cancel"} /></button>
          <button className="btn primary sm" type="button" disabled={busy || Boolean(problem)} onClick={() => { void save(); }}><Icon name="check" /><LocalizedText text={draft.id ? "Save" : "เพิ่ม Unit"} /></button></span>
      </div> : null}
      {data.disciplines.length ? <div className="table-wrap"><table><thead><tr><th><LocalizedText text={"Discipline"} /></th><th className="num">Unit</th><th className="num"><LocalizedText text={"Budget"} /></th>
        <th className="num"><LocalizedText text={"ขอซื้อแล้ว"} /></th><th className="num"><LocalizedText text={"อนุมัติแล้ว"} /></th><th className="num"><LocalizedText text={"สั่งซื้อแล้ว (ประมาณ)"} /></th><th className="num"><LocalizedText text={"คงเหลือ"} /></th><th><LocalizedText text={"รอสั่งซื้อ"} /></th></tr></thead>
        <tbody>{data.disciplines.map((item) => <tr key={item.discipline}><td><strong>{item.discipline}</strong> <small className="muted">{DISCIPLINE_NAME[item.discipline]}</small></td><td className="num">{item.units}</td><td className="num">{money(item.budget)}</td>
          <td className="num">{money(item.requested)}</td><td className="num">{money(item.approved)}</td><td className="num">{money(item.ordered)}</td>
          <td className="num">{item.remaining < 0 ? <Badge tone="red">{money(item.remaining)}</Badge> : money(item.remaining)}</td><td>{waiting(item.waitingLines, item.nearestNeedBy)}</td></tr>)}</tbody></table></div> : null}
      {data.units.length ? <div className="table-wrap"><table><thead><tr>{canEdit ? <th className="pg-acts"><span className="sr-only"><LocalizedText text={"Actions"} /></span></th> : null}<th>Module</th><th><LocalizedText text={"Discipline"} /></th><th>Drawing No.</th><th>Unit</th>
        <th className="num"><LocalizedText text={"Budget"} /></th><th className="num"><LocalizedText text={"ขอซื้อแล้ว"} /></th><th className="num"><LocalizedText text={"สั่งซื้อแล้ว (ประมาณ)"} /></th><th className="num"><LocalizedText text={"คงเหลือ"} /></th><th><LocalizedText text={"รอสั่งซื้อ"} /></th></tr></thead>
        <tbody>{data.units.flatMap((unit) => [<tr key={unit.id}>{canEdit ? <td className="pg-acts"><div className="table-actions">
          <button className="pg-act" type="button" title={t("Edit")} aria-label={t("Edit")} disabled={busy} onClick={() => edit(unit)}><Icon name="edit" /></button>
          {unit.requests ? null : <button className="pg-act danger" type="button" title={t("ลบ Unit")} aria-label={t("ลบ Unit")} disabled={busy} onClick={() => { void remove(unit); }}><Icon name="trash" /></button>}</div></td> : null}
          <td>{unit.module}</td><td>{unit.discipline}</td><td className="mono">{unit.drawingNo || "—"}</td>
          <td>{unit.unitName}{unit.requestList?.length ? <small><button className="pg-doclink" type="button" aria-expanded={open === unit.id} onClick={() => setOpen(open === unit.id ? null : unit.id)}>{unit.requestList.length} <LocalizedText text={"ใบขอซื้อ"} /></button></small> : null}</td>
          <td className="num">{money(unit.budget)}</td><td className="num">{money(unit.requested)}</td><td className="num">{money(unit.ordered)}</td>
          <td className="num">{unit.remaining < 0 ? <Badge tone="red">{money(unit.remaining)}</Badge> : money(unit.remaining)}</td><td>{waiting(unit.waitingLines, unit.nearestNeedBy)}</td></tr>,
          // The Unit's requests, under its row: what each asked for, when it is needed, and how many of its lines still wait.
          ...(open === unit.id ? (unit.requestList ?? []).map((item) => <tr key={`${unit.id}-${item.id}`} className="pr-unit-request">{canEdit ? <td /> : null}<td colSpan={2} className="muted"><LocalizedText text={item.status} /></td>
            <td colSpan={2} className="mono">{item.number}</td><td className="num muted">{item.lines} <LocalizedText text={"รายการ"} /></td><td className="num">{money(item.amount)}</td><td /><td />
            <td>{waiting(item.waitingLines, item.requiredDate)}</td></tr>) : [])])}
          {data.units.length > 1 ? (() => { const all = unitTotals(data.units); return <tr className="pr-unit-total"><td colSpan={canEdit ? 5 : 4}><strong><LocalizedText text={"รวมทุก Unit"} /></strong></td>
            <td className="num"><strong>{money(all.budget)}</strong></td><td className="num"><strong>{money(all.requested)}</strong></td><td className="num"><strong>{money(all.ordered)}</strong></td>
            <td className="num">{all.remaining < 0 ? <Badge tone="red">{money(all.remaining)}</Badge> : <strong>{money(all.remaining)}</strong>}</td><td>{waiting(all.waitingLines, all.nearestNeedBy)}</td></tr>; })() : null}</tbody></table></div>
        : draft ? null : <p className="pr-unit-empty muted"><LocalizedText text={"ยังไม่มี Unit ใบขอซื้อของโครงการนี้คุมงบตาม Module อย่างเดียว เพิ่ม Unit เมื่อต้องการแบ่งงบของ Module ตาม Drawing"} /></p>}
    </Panel>
  );
}
