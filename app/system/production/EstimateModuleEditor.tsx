"use client";

import { useEffect, useState } from "react";
import { loadEstimateModuleDetails, updateEstimateModuleDetails, type EstimateCostWorkspace } from "../api-client";
import { Field, Modal } from "../ui";

export function EstimateModuleEditor({ workspace, moduleKey, initialTitle, onClose, onSaved }: {
  workspace: EstimateCostWorkspace; moduleKey: string; initialTitle: string;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const summaryNote = moduleKey === "summary";
  const supportsQuantity = moduleKey.startsWith("category:");
  const [quantity, setQuantity] = useState(1);
  const [originalQuantity, setOriginalQuantity] = useState(1);
  const [unit, setUnit] = useState("Set");
  const [descriptionRows, setDescriptionRows] = useState<string[]>([]);
  const [title, setTitle] = useState(initialTitle);
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void loadEstimateModuleDetails(workspace.header.id).then(rows => {
      if (!active) return;
      const saved = rows.find(row => row.moduleKey === moduleKey);
      if (saved) { setQuantity(saved.quantity ?? 1); setOriginalQuantity(saved.quantity ?? 1); setUnit(saved.unit ?? "Set"); setTitle(saved.title); setRemark(saved.remark ?? ""); setDescriptionRows(saved.descriptionRows ?? []); }
      setLoaded(true);
    }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Could not load module details"); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [workspace.header.id, moduleKey]);
  const save = async () => {
    setBusy(true); setError("");
    try {
      await updateEstimateModuleDetails(workspace.header.id, workspace.header.rowVersion, { moduleKey, ...(supportsQuantity ? { quantity, unit: unit.trim() } : {}), title: title.trim(), remark: summaryNote ? remark.trim() || null : null, descriptionRows: descriptionRows.map(row => row.trim()).filter(Boolean) });
      await onSaved(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save module details"); }
    finally { setBusy(false); }
  };
  return <Modal size={summaryNote ? "lg" : "xl"} title={summaryNote ? "หมายเหตุรวม / Summary Remark" : "แก้ไข Main Module / Edit Main Module"} onClose={onClose} footer={<>
    <button type="button" className="btn default" disabled={busy} onClick={onClose}>Cancel</button>
    <button type="button" className="btn primary" disabled={busy || !loaded || !title.trim() || (supportsQuantity && (!(quantity > 0) || !unit.trim()))} onClick={() => void save()}>Save</button>
  </>}>
    {error ? <div role="alert" className="callout danger">{error}</div> : null}
    {summaryNote ? <Field label="Summary Remark"><textarea style={{ height: "min(45vh, 420px)", minHeight: 180 }} value={remark} maxLength={2000} rows={14} disabled={busy} onChange={event => setRemark(event.target.value)} /></Field> : <>
      <section className="engineering-module-heading"><span className="engineering-module-kicker">MODULE / WORK PACKAGE</span><Field label="ชื่อโมดูล / Module name"><textarea value={title} maxLength={200} rows={3} disabled={busy} onChange={event => setTitle(event.target.value)} /></Field><span className="muted">{title.length}/200</span></section>
      {supportsQuantity ? <section style={{ marginBlock: 16 }}><div className="form-grid two">
        <Field label="จำนวนโมดูล / Quantity"><input type="number" min="0.0001" max="1000000" step="0.0001" value={quantity} disabled={busy} onChange={event => setQuantity(Number(event.target.value))} /></Field>
        <Field label="หน่วย / Unit"><input value={unit} maxLength={30} list="module-unit-options" disabled={busy} onChange={event => setUnit(event.target.value)} /><datalist id="module-unit-options">{["Set", "Job", "Lot", "Pcs", "System"].map(value => <option key={value} value={value} />)}</datalist></Field>
      </div><p className="info-strip">จำนวนและต้นทุนรายการลูกจะปรับตามสัดส่วน {originalQuantity} → {quantity} {unit} (×{Number((quantity / originalQuantity).toFixed(4))}) โดยราคาต่อหน่วยของรายการลูกคงเดิม</p></section> : null}
      <div className="engineering-scope-heading"><strong>ขอบเขตงาน / Scope of work</strong><span className="muted">{descriptionRows.length}/20 รายละเอียด</span></div><p className="muted">แยกกิจกรรมหรือข้อกำหนดเป็นบรรทัด ทั้งหมดอยู่ภายใต้โมดูลเดียวกันและไม่เพิ่มยอดต้นทุน</p>{!descriptionRows.length ? <div className="engineering-scope-empty">เพิ่มรายละเอียด เช่น Design, Assembly, Wiring, Internal Test หรือ BuyOff เพื่อระบุขอบเขตงานของโมดูลนี้</div> : null}
      {descriptionRows.map((row, index) => <div className="engineering-scope-row" key={index}>
        <span className="engineering-scope-number">{String(index + 1).padStart(2, "0")}</span><Field label={"รายละเอียด / Scope " + (index + 1)}><textarea value={row} maxLength={500} rows={3} disabled={busy} onChange={event => setDescriptionRows(current => current.map((value, position) => position === index ? event.target.value : value))} /></Field>
        <button type="button" className="btn default" disabled={busy} aria-label={"Remove detail " + (index + 1)} onClick={() => setDescriptionRows(current => current.filter((_, position) => position !== index))}>ลบ</button>
      </div>)}
      <button type="button" className="btn default" disabled={busy || descriptionRows.length >= 20} onClick={() => setDescriptionRows(current => [...current, ""])}>+ เพิ่มบรรทัดรายละเอียด / Add detail row</button>
    </>}
  </Modal>;
}
