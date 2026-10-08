"use client";

import { useRef, useState } from "react";
import type { EstimateEffortInput, EstimateManhourLine } from "../api-client";
import { Icon } from "../ui";
import { useDraftHold } from "./RecordPresence";

type Draft = { engineers: string; manDays: string; hoursPerDay: string; rowVersion: string };

/**
 * Edit the three effort fields together, retaining the source version and daily rate.
 * Cells: people, days, hours per day (with save / cancel while edited), man-days and cost;
 * `full` adds the daily rate and man-hours after the cost.
 */
export function EstimateEffortCells({ line, busy, full = false, onSave, money, number }: {
  line: EstimateManhourLine; busy: boolean; full?: boolean;
  onSave: (effort: EstimateEffortInput, rowVersion: string) => Promise<boolean>;
  money: (value: number) => string; number: (value: number) => string;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const saving = useRef(false);
  // The draft outlives the field losing focus, so a live reload has to be told about it.
  useDraftHold(draft !== null);
  const values = {
    engineers: Number(draft?.engineers ?? line.engineers),
    manDays: Number(draft?.manDays ?? line.manDays),
    hoursPerDay: Number(draft?.hoursPerDay ?? line.hoursPerDay),
  };
  const valid = Object.entries(values).every(([key, value]) => Number.isFinite(value) && value >= 0.01
    && value <= (key === "hoursPerDay" ? 24 : 1_000_000) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001);
  const save = async () => {
    if (!draft || !valid || busy || saving.current) return;
    saving.current = true;
    try { if (await onSave(values, draft.rowVersion)) setDraft(null); }
    finally { saving.current = false; }
  };
  const input = (key: keyof EstimateEffortInput, label: string) => line.canEdit ? <input
    className="num" type="number" step="0.01" min="0.01" max={key === "hoursPerDay" ? 24 : 1_000_000}
    aria-label={`${label}: ${line.activity}`} disabled={busy} aria-invalid={Boolean(draft) && !valid}
    value={draft?.[key] ?? String(line[key])}
    title="Enter: บันทึกแถว / Save row · Esc: ยกเลิก / Cancel"
    onChange={event => setDraft(current => ({ engineers: String(line.engineers), manDays: String(line.manDays), hoursPerDay: String(line.hoursPerDay), rowVersion: line.rowVersion, ...current, [key]: event.target.value }))}
    onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void save(); } if (event.key === "Escape") { event.preventDefault(); setDraft(null); } }}
  /> : <span className="cell-text num">{number(line[key])}</span>;
  return <>
    <td className="num">{input("engineers", "Qty")}</td>
    <td className="num">{input("manDays", "Man-days")}</td>
    <td className="num effort-hours"><div className="effort-edit-controls">{input("hoursPerDay", "Hours / Day")}
      {draft ? <span className="row-actions">
        <button className="row-action save" type="button" disabled={busy || !valid} aria-label={`Save effort: ${line.activity}`} title="บันทึกแถว / Save row" onClick={() => void save()}><Icon name="check" /></button>
        <button className="row-action" type="button" disabled={busy} aria-label={`Cancel effort: ${line.activity}`} onClick={() => setDraft(null)}><Icon name="x" /></button>
      </span> : null}
    </div>{draft && !valid ? <small className="soft-warn" role="alert" title="ค่าต้องมากกว่า 0 · Hours ≤ 24 · ทศนิยมไม่เกิน 2 ตำแหน่ง">ค่าไม่ถูกต้อง</small> : null}</td>
    <td className="num">{number(valid ? values.engineers * values.manDays : line.engineers * line.manDays)}</td>
    <td className="num effort-cost"><strong>{money(valid ? values.engineers * values.manDays * line.dailyRate : line.lineCost)}</strong>{draft ? <small className="muted">ยังไม่บันทึก</small> : null}</td>
    {full ? <>
      <td className="num">{money(line.dailyRate)}</td>
      <td className="num">{number(valid ? values.engineers * values.manDays * values.hoursPerDay : line.manHours)} HR</td>
    </> : null}
  </>;
}
