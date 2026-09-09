"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Icon, Tabs } from "../ui";
import { downloadReportEvidence, uploadReportEvidence } from "../api-client";
import {
  emptyMeasurementRow,
  emptyMeasurementSection,
  newInspectionUnit,
  type ChecklistItem,
  type InspectionBody,
  type InspectionUnit,
  type MeasurementRow,
  type MeasurementSection,
  type NormalAbnormal,
  type OperationTest,
  type PassFail,
  type Rank,
  type UnitAttribute,
} from "./inspection-body-types";
import "./inspection-report.css";

// ── Small selects (match original document's Rank A-D / OK-NG conventions) ──
function RankSelect({ value, onChange }: { value: Rank; onChange: (v: Rank) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as Rank)}>
      {["", "A", "B", "C", "D"].map(v => <option key={v} value={v}>{v || "—"}</option>)}
    </select>
  );
}

function JudgeSelect({ value, onChange }: { value: PassFail; onChange: (v: PassFail) => void }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value as PassFail)}>
      {["", "OK", "NG"].map(v => <option key={v} value={v}>{v || "—"}</option>)}
    </select>
  );
}

// ── Multi-photo gallery — backed by the real evidence upload/download API ───
function PhotoThumb({ reportId, attachmentId, onRemove }: { reportId: number; attachmentId: number; onRemove?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true, created = "";
    downloadReportEvidence(reportId, attachmentId)
      .then(blob => { if (!active) return; created = URL.createObjectURL(blob); setUrl(created); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (created) URL.revokeObjectURL(created); };
  }, [reportId, attachmentId]);
  return (
    <div className="ir-photo-thumb">
      {failed ? <span className="ir-photo-error">Unavailable</span> : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : <span className="ir-photo-loading">Loading…</span>}
      {onRemove ? <button type="button" className="ir-photo-remove" onClick={onRemove}>×</button> : null}
    </div>
  );
}

function PhotoGallery({ reportId, photoIds, onChange, readOnly }: {
  reportId: number;
  photoIds: number[];
  onChange: (ids: number[]) => void;
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    Promise.all(files.map(f => uploadReportEvidence(reportId, f)))
      .then(attachments => onChange([...photoIds, ...attachments.map(a => a.attachmentId)]))
      .finally(() => setUploading(false));
  };
  const remove = (id: number) => onChange(photoIds.filter(existing => existing !== id));
  return (
    <div className="ir-photo-upload">
      <div className="ir-photo-thumbs">
        {photoIds.map(id => (
          <PhotoThumb key={id} reportId={reportId} attachmentId={id} onRemove={readOnly ? undefined : () => remove(id)} />
        ))}
        {!readOnly && (
          <button type="button" className="ir-photo-add" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "…" : "+"}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
    </div>
  );
}

// ── Tab: Units — generic identifier/location + free-form attributes ─────────
// No department-specific fields (no PLC/HMI/voltage/etc). Any department adds
// whatever attributes describe their unit ("Motor Rating", "Server IP", ...).
function AttributesEditor({ attributes, onChange }: { attributes: UnitAttribute[]; onChange: (attrs: UnitAttribute[]) => void }) {
  const set = (i: number, patch: Partial<UnitAttribute>) => onChange(attributes.map((a, idx) => idx === i ? { ...a, ...patch } : a));
  const add = () => onChange([...attributes, { label: "", value: "" }]);
  const remove = (i: number) => onChange(attributes.filter((_, idx) => idx !== i));
  return (
    <div className="ir-attributes">
      {attributes.map((attr, i) => (
        <div key={i} className="ir-attribute-row">
          <input type="text" placeholder="Attribute (e.g. PLC Model, Motor Rating, Server IP)…" value={attr.label} onChange={e => set(i, { label: e.target.value })} />
          <input type="text" placeholder="Value…" value={attr.value} onChange={e => set(i, { value: e.target.value })} />
          <button className="btn ghost sm" type="button" onClick={() => remove(i)}><Icon name="minus" /></button>
        </div>
      ))}
      <button className="btn default sm" type="button" onClick={add}><Icon name="plus" /> Add Attribute</button>
    </div>
  );
}

function UnitsTab({ units, onChange, onAdd, onRemove }: {
  units: InspectionUnit[];
  onChange: (i: number, patch: Partial<InspectionUnit>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn default" type="button" onClick={onAdd}><Icon name="plus" /> Add Unit</button>
      </div>
      <div className="ir-unit-list">
        {units.map((unit, i) => (
          <div key={unit.id} className="ir-unit-card">
            <div className="ir-unit-card-head">
              <strong>{unit.name || `Unit ${i + 1}`}</strong>
              {units.length > 1 ? <button className="btn ghost sm" type="button" onClick={() => onRemove(i)}><Icon name="trash" /></button> : null}
            </div>
            <div className="ir-unit-fields">
              <Field label="Unit Name"><input type="text" value={unit.name} onChange={e => onChange(i, { name: e.target.value })} /></Field>
              <Field label="Identifier" hint="Panel name, serial number, asset tag, hostname — whatever identifies this unit"><input type="text" value={unit.identifier} onChange={e => onChange(i, { identifier: e.target.value })} /></Field>
              <Field label="Location"><input type="text" value={unit.location} onChange={e => onChange(i, { location: e.target.value })} /></Field>
            </div>
            <div className="ir-section-title">Attributes</div>
            <AttributesEditor attributes={unit.attributes} onChange={attrs => onChange(i, { attributes: attrs })} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Measurements — fully dynamic spec-vs-actual sections, any domain ──
function MeasurementsTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const setSection = (i: number, patch: Partial<MeasurementSection>) => {
    onChange({ measurementSections: unit.measurementSections.map((s, idx) => idx === i ? { ...s, ...patch } : s) });
  };
  const addSection = () => onChange({ measurementSections: [...unit.measurementSections, emptyMeasurementSection()] });
  const removeSection = (i: number) => onChange({ measurementSections: unit.measurementSections.filter((_, idx) => idx !== i) });
  const setRow = (si: number, ri: number, patch: Partial<MeasurementRow>) => {
    const section = unit.measurementSections[si];
    setSection(si, { rows: section.rows.map((r, idx) => idx === ri ? { ...r, ...patch } : r) });
  };
  const addRow = (si: number) => setSection(si, { rows: [...unit.measurementSections[si].rows, emptyMeasurementRow()] });
  const removeRow = (si: number, ri: number) => setSection(si, { rows: unit.measurementSections[si].rows.filter((_, idx) => idx !== ri) });

  if (unit.measurementSections.length === 0) {
    return (
      <div>
        <p className="ir-empty-note">No measurement sections yet. Add one for any spec-vs-actual measurement your department records — voltage, vibration, response time, pressure, anything.</p>
        <button className="btn default" type="button" onClick={addSection}><Icon name="plus" /> Add Section</button>
      </div>
    );
  }

  return (
    <div>
      {unit.measurementSections.map((sec, si) => (
        <div key={si}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
            <input className="ir-section-title-input" type="text" value={sec.title} placeholder="Section title (e.g. Utility Power Supply, Vibration Analysis)…" onChange={e => setSection(si, { title: e.target.value })} />
            <button className="btn ghost sm" type="button" onClick={() => removeSection(si)}><Icon name="trash" /></button>
          </div>
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead><tr><th>Parameter</th><th>Unit</th><th>Spec</th><th>Actual</th><th>Judgement</th><th>Rank</th><th>Remarks</th><th></th></tr></thead>
              <tbody>
                {sec.rows.map((row, ri) => (
                  <tr key={ri}>
                    <td><input type="text" placeholder="e.g. R-S Voltage, Bearing Vibration…" value={row.parameter} onChange={e => setRow(si, ri, { parameter: e.target.value })} /></td>
                    <td><input type="text" placeholder="e.g. V, mm/s, ms…" value={row.unit} onChange={e => setRow(si, ri, { unit: e.target.value })} style={{ width: 70 }} /></td>
                    <td><input type="text" value={row.specValue} onChange={e => setRow(si, ri, { specValue: e.target.value })} style={{ width: 80 }} /></td>
                    <td><input type="text" value={row.actualValue} onChange={e => setRow(si, ri, { actualValue: e.target.value })} style={{ width: 80 }} /></td>
                    <td className="center"><JudgeSelect value={row.judgement} onChange={v => setRow(si, ri, { judgement: v })} /></td>
                    <td className="center"><RankSelect value={row.rank} onChange={v => setRow(si, ri, { rank: v })} /></td>
                    <td><input type="text" value={row.remarks} onChange={e => setRow(si, ri, { remarks: e.target.value })} /></td>
                    <td className="center"><button className="btn ghost sm" type="button" onClick={() => removeRow(si, ri)}><Icon name="minus" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn default sm" type="button" style={{ marginTop: 8 }} onClick={() => addRow(si)}><Icon name="plus" /> Add Row</button>
        </div>
      ))}
      <button className="btn default" type="button" style={{ marginTop: 16 }} onClick={addSection}><Icon name="plus" /> Add Section</button>
    </div>
  );
}

// ── Tab: Operation tests ──────────────────────────────────────
function OperationTab({ reportId, unit, onChange, readOnly }: { reportId: number; unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void; readOnly?: boolean }) {
  const setTest = (i: number, patch: Partial<OperationTest>) => onChange({ operationTests: unit.operationTests.map((t, idx) => idx === i ? { ...t, ...patch } : t) });
  const addTest = () => onChange({ operationTests: [...unit.operationTests, { name: "", status: "", rank: "", remarks: "", photoIds: [] }] });
  const removeTest = (i: number) => onChange({ operationTests: unit.operationTests.filter((_, idx) => idx !== i) });
  return (
    <div>
      <div className="ir-table-wrap">
        <table className="ir-table">
          <thead><tr><th>Test Name</th><th>Judgement</th><th>Rank</th><th>Remarks</th><th>Photos</th><th></th></tr></thead>
          <tbody>
            {unit.operationTests.map((t, i) => (
              <tr key={i}>
                <td><input type="text" value={t.name} placeholder="Test name…" onChange={e => setTest(i, { name: e.target.value })} /></td>
                <td className="center"><JudgeSelect value={t.status} onChange={v => setTest(i, { status: v })} /></td>
                <td className="center"><RankSelect value={t.rank} onChange={v => setTest(i, { rank: v })} /></td>
                <td><input type="text" value={t.remarks} onChange={e => setTest(i, { remarks: e.target.value })} /></td>
                <td><PhotoGallery reportId={reportId} photoIds={t.photoIds ?? []} onChange={ids => setTest(i, { photoIds: ids })} readOnly={readOnly} /></td>
                <td className="center"><button className="btn ghost sm" type="button" onClick={() => removeTest(i)}><Icon name="minus" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn default" type="button" style={{ marginTop: 10 }} onClick={addTest}><Icon name="plus" /> Add Row</button>
    </div>
  );
}

// ── Tab: Checklist (generic component check — any department) ─
function ChecklistTab({ reportId, unit, onChange, readOnly }: { reportId: number; unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void; readOnly?: boolean }) {
  const setItem = (i: number, patch: Partial<ChecklistItem>) => onChange({ checklistItems: unit.checklistItems.map((item, idx) => idx === i ? { ...item, ...patch } : item) });
  const addItem = () => onChange({ checklistItems: [...unit.checklistItems, { name: "", condition: "", judgement: "", rank: "", remarks: "", photoIds: [] }] });
  const removeItem = (i: number) => onChange({ checklistItems: unit.checklistItems.filter((_, idx) => idx !== i) });
  return (
    <div>
      <div className="ir-table-wrap">
        <table className="ir-table">
          <thead><tr><th>Component</th><th>Condition</th><th>Judgement</th><th>Rank</th><th>Remarks</th><th>Photos</th><th></th></tr></thead>
          <tbody>
            {unit.checklistItems.map((item, i) => (
              <tr key={i}>
                <td><input type="text" value={item.name} placeholder="Component name…" onChange={e => setItem(i, { name: e.target.value })} /></td>
                <td className="center">
                  <select value={item.condition} onChange={e => setItem(i, { condition: e.target.value as NormalAbnormal })}>
                    {["", "Normal", "Abnormal"].map(v => <option key={v} value={v}>{v || "—"}</option>)}
                  </select>
                </td>
                <td className="center"><JudgeSelect value={item.judgement} onChange={v => setItem(i, { judgement: v })} /></td>
                <td className="center"><RankSelect value={item.rank} onChange={v => setItem(i, { rank: v })} /></td>
                <td><input type="text" value={item.remarks} onChange={e => setItem(i, { remarks: e.target.value })} /></td>
                <td><PhotoGallery reportId={reportId} photoIds={item.photoIds ?? []} onChange={ids => setItem(i, { photoIds: ids })} readOnly={readOnly} /></td>
                <td className="center"><button className="btn ghost sm" type="button" onClick={() => removeItem(i)}><Icon name="minus" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn default" type="button" style={{ marginTop: 10 }} onClick={addItem}><Icon name="plus" /> Add Row</button>
    </div>
  );
}

// ── Tab: Summary ──────────────────────────────────────────────
function SummaryTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const setItem = (i: number, v: string) => onChange({ summaryItems: unit.summaryItems.map((s, idx) => idx === i ? v : s) });
  const addItem = () => onChange({ summaryItems: [...unit.summaryItems, ""] });
  const removeItem = (i: number) => {
    if (unit.summaryItems.length <= 1) return;
    onChange({ summaryItems: unit.summaryItems.filter((_, idx) => idx !== i) });
  };
  return (
    <div>
      <p className="ir-empty-note">Numbered recommendations / findings for this unit.</p>
      <div className="ir-summary-list">
        {unit.summaryItems.map((s, i) => (
          <div key={i} className="ir-summary-row">
            <span>{i + 1}.</span>
            <textarea value={s} placeholder="Enter recommendation…" rows={2} onChange={e => setItem(i, e.target.value)} />
            <button className="btn ghost sm" type="button" onClick={() => removeItem(i)} style={{ alignSelf: "flex-start", marginTop: 4 }}><Icon name="minus" /></button>
          </div>
        ))}
      </div>
      <button className="btn default" type="button" style={{ marginTop: 10 }} onClick={addItem}><Icon name="plus" /> Add Item</button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export function InspectionReportBody({ reportId, body, onChange, readOnly }: {
  reportId: number;
  body: InspectionBody;
  onChange?: (body: InspectionBody) => void;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState<"units" | "measurements" | "operation" | "checklist" | "summary">("units");
  const [selectedUnitIndex, setSelectedUnitIndex] = useState(0);
  const units = body.units.length ? body.units : [newInspectionUnit("Unit 1")];
  const updateUnits = (next: InspectionUnit[]) => onChange?.({ units: next });
  const updateUnit = (i: number, patch: Partial<InspectionUnit>) => updateUnits(units.map((u, idx) => idx === i ? { ...u, ...patch } : u));
  const addUnit = () => updateUnits([...units, newInspectionUnit(`Unit ${units.length + 1}`)]);
  const removeUnit = (i: number) => {
    if (units.length <= 1) return;
    updateUnits(units.filter((_, idx) => idx !== i));
    setSelectedUnitIndex(current => Math.min(current, units.length - 2));
  };
  const selectedUnit = units[selectedUnitIndex] ?? units[0];

  return (
    <fieldset disabled={readOnly} className="ir-body-fieldset">
      <Tabs
        tabs={[
          { id: "units", label: "Units" },
          { id: "measurements", label: "Measurements" },
          { id: "operation", label: "Operation Tests" },
          { id: "checklist", label: "Checklist" },
          { id: "summary", label: "Summary" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab !== "units" ? (
        <div style={{ margin: "12px 0" }}>
          <Field label="Unit">
            <select value={selectedUnitIndex} onChange={e => setSelectedUnitIndex(Number(e.target.value))}>
              {units.map((u, i) => <option key={u.id} value={i}>{u.name || `Unit ${i + 1}`}</option>)}
            </select>
          </Field>
        </div>
      ) : null}
      {tab === "units" ? <UnitsTab units={units} onChange={updateUnit} onAdd={addUnit} onRemove={removeUnit} /> : null}
      {tab === "measurements" && selectedUnit ? <MeasurementsTab unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} /> : null}
      {tab === "operation" && selectedUnit ? <OperationTab reportId={reportId} unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} readOnly={readOnly} /> : null}
      {tab === "checklist" && selectedUnit ? <ChecklistTab reportId={reportId} unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} readOnly={readOnly} /> : null}
      {tab === "summary" && selectedUnit ? <SummaryTab unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} /> : null}
    </fieldset>
  );
}
