"use client";
import { useT as useStaticCopy } from "../i18n";
import { currentLocale } from "../i18n";

import { LocalizedText } from "../LocalizedText";
import { useId, useState } from "react";
import { validCostItemNumbers } from "../../../lib/cost-item-validation";
import type { BootstrapData, ModuleTemplateDetail, ModuleTemplateInput, ModuleTemplateLineInput } from "../api-client";
import { CostItemFields, COST_CATEGORIES, COST_ITEM_TABLE_COLUMNS, type CostItemFieldsValue } from "./CostItemFields";
import { Field, Icon, Modal } from "../ui";

export const TEMPLATE_CATEGORIES = COST_CATEGORIES;
const PROJECT_TYPES = ["Automation", "IoT", "PLC", "Software", "Electrical", "Mechanical", "Robot", "AMR", "Auto Warehouse", "WMS", "WCS", "Traceability", "Vision", "Data Collection", "Other"];
const money = (value: number) => new Intl.NumberFormat(currentLocale(), { style: "currency", currency: "THB" }).format(Number.isFinite(value) ? value : 0);
const newLine = (categoryCode: string): ModuleTemplateLineInput => ({ categoryCode, itemCode: "", description: "", quantityPerModule: 1, unit: "Set", referenceUnitCost: 0, referencePriceSource: "Manual Estimate" });

export function ModuleTemplateEditor({ template, duplicate, suppliers, onClose, onSave }: {
  template?: ModuleTemplateDetail;
  duplicate?: boolean;
  suppliers: BootstrapData["suppliers"];
  onClose: () => void;
  onSave: (input: ModuleTemplateInput) => Promise<void>;
}) {
  const localizeCopy = useStaticCopy();
  const formId = useId();
  const isEdit = Boolean(template && !duplicate);
  const [code, setCode] = useState(() => isEdit ? template!.code : `TPL-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`);
  const [name, setName] = useState(template ? `${template.name}${duplicate ? " (สำเนา)" : ""}`.slice(0, 200) : "");
  const [categoryCode, setCategoryCode] = useState(template?.categoryCode ?? "01");
  const [projectType, setProjectType] = useState(template?.projectType ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [status, setStatus] = useState(isEdit ? template!.status : "Draft");
  const [lines, setLines] = useState(() => (template?.lines ?? [newLine("01")]).map((line, index) => ({ key: index, value: { ...line } as ModuleTemplateLineInput })));
  const [nextKey, setNextKey] = useState(lines.length);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<{ index: number; line: typeof lines[number] } | null>(null);
  const total = lines.reduce((sum, line) => sum + (Number.isFinite(line.value.quantityPerModule) ? line.value.quantityPerModule : 0) * (Number.isFinite(line.value.referenceUnitCost) ? line.value.referenceUnitCost! : 0), 0);
  const updateLine = (key: number, patch: Partial<ModuleTemplateLineInput>) => setLines((current) => current.map((line) => line.key === key ? { ...line, value: { ...line.value, ...patch } } : line));
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };

  return <Modal title={isEdit ? localizeCopy("แก้ไข Template") : duplicate ? localizeCopy("คัดลอกเป็น Template ใหม่") : localizeCopy("สร้าง Template ใหม่")} subtitle="กำหนดรายการต่อ 1 ชุด • ตอนใช้ใน Estimate เลือกจำนวนชุดได้" size="xl" onClose={close} footer={<>
    <span className="template-editor-total">{lines.length} <LocalizedText text={"รายการ ·"} /> <strong>{money(total)}</strong> <LocalizedText text={"/ ชุด"} /></span>
    <button className="btn ghost" type="button" disabled={saving} onClick={close}><LocalizedText text={"Cancelled"} /></button>
    <button className="btn primary" type="submit" form={formId} disabled={saving || lines.length === 0}><Icon name="check" />{saving ? <LocalizedText text={"Saving…"} /> : status === "Draft" ? <LocalizedText text={"Save draft"} /> : localizeCopy("บันทึกพร้อมใช้งาน")}</button>
  </>}>
    {error ? <div className="info-strip red" role="alert"><Icon name="alertCircle" /><span>{localizeCopy(error)}</span></div> : null}
    {discard ? <div className="info-strip amber" role="alert"><span><LocalizedText text={"มีข้อมูลที่ยังไม่บันทึก ต้องการปิดฟอร์มหรือไม่?"} /></span><button type="button" className="btn default sm" onClick={() => setDiscard(false)}><LocalizedText text={"แก้ไขต่อ"} /></button><button type="button" className="btn warn sm" onClick={onClose}><LocalizedText text={"ไม่บันทึกและปิด"} /></button></div> : null}
    <form id={formId} className="template-editor" onChange={() => { setDirty(true); setDiscard(false); }} onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      if (lines.some(({ value }) => !validCostItemNumbers(value.quantityPerModule, value.referenceUnitCost ?? 0))) { setError("ตรวจสอบจำนวนและราคา: จำนวนต้องมากกว่า 0 ราคาไม่ติดลบ และทศนิยมไม่เกิน 4 ตำแหน่ง รวมทั้งยอดรายการต้องไม่เกินขีดจำกัดของ Estimate"); return; }
      if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code.trim().toUpperCase())) { setError("รหัส Template ต้องเริ่มด้วย A–Z หรือ 0–9 และใช้ได้เฉพาะ A–Z, 0–9, . _ / -"); return; }
      if (!name.trim() || lines.some(({ value }) => !value.itemCode.trim() || !value.description.trim() || !value.unit.trim())) { setError("กรุณากรอกชื่อ Template, รหัสรายการ, รายละเอียด และหน่วยให้ครบ"); return; }
      setSaving(true); setError("");
      try {
        await onSave({ code: code.trim().toUpperCase(), name: name.trim(), categoryCode, projectType, description: description.trim(), status,
          lines: lines.map(({ value }) => ({ ...value, itemCode: value.itemCode.trim(), description: value.description.trim(), unit: value.unit.trim() })) });
      } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"); }
      finally { setSaving(false); }
    }}>
      <fieldset disabled={saving}>
        <h3><LocalizedText text={"1. ข้อมูลชุด"} /></h3>
        <div className="form-grid two">
          <Field label="ชื่อ Template *"><input aria-label={localizeCopy("ชื่อ Template")} required maxLength={200} placeholder={localizeCopy("เช่น ชุด PLC ควบคุมสายพาน")} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="รหัส Template *" hint="ระบบตั้งให้แล้ว เปลี่ยนได้ ใช้ A–Z, 0–9 และ . _ / -"><input aria-label={localizeCopy("รหัส Template")} required maxLength={40} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field>
          <Field label="Discipline หลัก"><select aria-label={localizeCopy("Discipline หลัก")} value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)}>{TEMPLATE_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{id} {label}</option>)}</select></Field>
          <Field label="ประเภทโครงการ"><select aria-label={localizeCopy("ประเภทโครงการ")} value={projectType} onChange={(e) => setProjectType(e.target.value)}><option value=""><LocalizedText text={"ไม่ระบุ"} /></option>{PROJECT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></Field>
        </div>
        <Field label="คำอธิบายการใช้งาน"><textarea aria-label={localizeCopy("คำอธิบายการใช้งาน")} rows={2} maxLength={1000} placeholder={localizeCopy("เหมาะกับงานแบบไหน มีอะไรที่ต้องปรับก่อนใช้")} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <div className="template-editor-heading"><h3><LocalizedText text={"2. รายการต่อ 1 ชุด"} /></h3><button className="btn default sm" type="button" disabled={lines.length >= 500} onClick={() => { setLines([...lines, { key: nextKey, value: newLine(categoryCode) }]); setNextKey(nextKey + 1); setDirty(true); }}><Icon name="plus" /><LocalizedText text={"เพิ่มรายการ"} /></button></div>
        <p className="muted"><LocalizedText text={"ใช้ฟิลด์เดียวกับ Estimate Cost · Quantity คือจำนวนต่อ 1 ชุด เช่น Sensor 4 ตัว × 3 ชุด = 12 ตัว ชื่อโมดูลและผู้รับผิดชอบกำหนดตอนนำไปใช้"} /></p>
        {removed ? <div className="info-strip"><span><LocalizedText text={"นำรายการออกแล้ว"} /></span><button className="btn ghost sm" type="button" disabled={lines.length >= 500} onClick={() => { const restored = [...lines]; restored.splice(removed.index, 0, removed.line); setLines(restored); setRemoved(null); }}><LocalizedText text={"เลิกทำ"} /></button></div> : null}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard access is needed to scroll the wide editable table. */}
        <div className="template-items-scroll" role="region" aria-label={localizeCopy("รายการใน Template เลื่อนแนวนอนเพื่อดูทุกคอลัมน์")} tabIndex={0}>
          <table className="template-items-table">
            <thead><tr><th scope="col">#</th>{COST_ITEM_TABLE_COLUMNS.map((column) => <th scope="col" key={column.title}>{column.title}</th>)}<th scope="col"><span className="sr-only"><LocalizedText text={"นำรายการออก"} /></span></th></tr></thead>
            <tbody>{lines.map(({ key, value }, index) => <tr key={key} aria-label={`${localizeCopy("รายการ")} ${index + 1}`}>
              <th scope="row">{index + 1}</th>
          <CostItemFields layout="table" perSet suppliers={suppliers} form={{
            ...value, category: COST_CATEGORIES.find(([code]) => code === value.categoryCode)?.[1] ?? "",
            supplierId: value.supplierId ?? undefined, specification: value.specification ?? undefined, remark: value.remark ?? undefined,
            quantity: value.quantityPerModule, unitCost: value.referenceUnitCost ?? 0,
            priceSource: value.referencePriceSource ?? "", priceDate: value.referencePriceDate ?? undefined,
          }} onChange={(patch: Partial<CostItemFieldsValue>) => {
            const { quantity, unitCost, priceSource, priceDate, category: _category, ...rest } = patch;
            void _category;
            updateLine(key, { ...rest,
              ...(quantity !== undefined ? { quantityPerModule: quantity } : {}),
              ...(unitCost !== undefined ? { referenceUnitCost: unitCost } : {}),
              ...(priceSource !== undefined ? { referencePriceSource: priceSource } : {}),
              ...("priceDate" in patch ? { referencePriceDate: priceDate || null } : {}),
              ...("supplierId" in patch ? { supplierId: patch.supplierId ?? null } : {}),
            });
          }} />
              <td><button className="btn ghost sm" type="button" aria-label={`${localizeCopy("นำรายการออก")} ${index + 1}`} onClick={() => { setRemoved({ index, line: lines[index] }); setLines(lines.filter((line) => line.key !== key)); setDirty(true); }}><Icon name="trash" /></button></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!lines.length ? <p role="status"><LocalizedText text={"เพิ่มอย่างน้อย 1 รายการก่อนบันทึก"} /></p> : null}
        <h3><LocalizedText text={"3. สถานะการใช้งาน"} /></h3>
        <div className="template-editor-status"><label><input type="radio" name={`${formId}-status`} checked={status === "Draft"} onChange={() => setStatus("Draft")} /><LocalizedText text={"ฉบับร่าง — เตรียมข้อมูลก่อน ยังไม่แสดงใน Estimate"} /></label><label><input type="radio" name={`${formId}-status`} checked={status === "Active"} onChange={() => setStatus("Active")} /><LocalizedText text={"พร้อมใช้งาน — ทีมเลือกใช้ใน Estimate ได้"} /></label></div>
        <p className="muted"><LocalizedText text={"ระบบบันทึกผู้สร้าง ผู้แก้ไข และเวลาให้อัตโนมัติ"} />{isEdit ? " " + localizeCopy("· การแก้ไขจะเพิ่ม Revision และไม่เปลี่ยนรายการใน Estimate ที่ใช้ไปแล้ว") : ""}</p>
      </fieldset>
    </form>
  </Modal>;
}
