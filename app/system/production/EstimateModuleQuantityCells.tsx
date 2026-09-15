"use client";

import { useRef, useState } from "react";

const ADD_UNIT = "__add_unit__";
export const MODULE_UNITS = ["Set", "Job", "Lot", "Pcs", "System", "Unit", "Day", "Hour", "Month", "Year", "Meter"];

export function EstimateModuleQuantityCells({ name, quantity, unit, units, disabled, onSave, showCostRatio = true }: {
  name: string; quantity: number; unit: string; units: string[]; disabled: boolean;
  showCostRatio?: boolean;
  onSave: (quantity: number, unit: string) => Promise<void>;
}) {
  const [draftQuantity, setDraftQuantity] = useState(String(quantity));
  const [draftUnit, setDraftUnit] = useState(unit);
  const [addingUnit, setAddingUnit] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const changed = Number(draftQuantity) !== quantity || draftUnit.trim() !== unit;
  const cancel = () => { setDraftQuantity(String(quantity)); setDraftUnit(unit); setAddingUnit(false); setError(""); };
  const save = async () => {
    if (disabled || savingRef.current || !changed) return;
    const value = Number(draftQuantity), selectedUnit = draftUnit.trim();
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0 || value > 1000000 || Math.abs(value * 10000 - Math.round(value * 10000)) > 0.00001 || !selectedUnit || selectedUnit.length > 30) {
      setError("ระบุจำนวนเต็มมากกว่า 0 และหน่วยไม่เกิน 30 ตัวอักษร"); return;
    }
    savingRef.current = true; setSaving(true); setError("");
    try { await onSave(value, selectedUnit); setAddingUnit(false); }
    catch (error) { setError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const onKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === "Enter") { event.preventDefault(); void save(); }
    if (event.key === "Escape" && !saving) { event.preventDefault(); cancel(); }
  };
  const choices = [...new Set([...MODULE_UNITS, ...units, unit, ...(draftUnit.trim() ? [draftUnit.trim()] : [])])];
  return <>
    <td className="num cb-inline-quantity"><input aria-label={"จำนวน " + name} type="number" min="1" max="1000000" step="1" value={draftQuantity} disabled={disabled || saving} onChange={event => setDraftQuantity(event.target.value)} onKeyDown={onKeyDown} /></td>
    <td className="cb-inline-unit">
      {addingUnit ? <input ref={node => { node?.focus(); }} aria-label={"หน่วยใหม่ " + name} placeholder="ชื่อหน่วยใหม่" maxLength={30} value={draftUnit} disabled={disabled || saving} onChange={event => setDraftUnit(event.target.value)} onKeyDown={onKeyDown} /> : <select aria-label={"หน่วย " + name} value={draftUnit} disabled={disabled || saving} onChange={event => {
        if (event.target.value === ADD_UNIT) { setAddingUnit(true); setDraftUnit(""); } else setDraftUnit(event.target.value);
      }} onKeyDown={onKeyDown}>
        {choices.map(value => <option key={value} value={value}>{value}</option>)}
        <option value={ADD_UNIT}>+ เพิ่มหน่วยใหม่</option>
      </select>}
      {changed || addingUnit ? <div className="cb-inline-save"><button type="button" className="btn primary sm" disabled={disabled || saving || !draftUnit.trim()} onClick={() => void save()}>{saving ? "กำลังบันทึก…" : "บันทึก"}</button><button type="button" className="btn ghost sm" disabled={saving} onClick={cancel}>ยกเลิก</button></div> : null}
      {showCostRatio && Number(draftQuantity) > 0 && Number(draftQuantity) !== quantity ? <small className="muted">ต้นทุน ×{Number((Number(draftQuantity) / quantity).toFixed(4))}</small> : null}
      {error ? <small role="alert" className="soft-warn">{error}</small> : null}
    </td>
  </>;
}
