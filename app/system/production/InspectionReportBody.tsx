"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Icon, Tabs } from "../ui";
import { downloadReportEvidence, uploadReportEvidence } from "../api-client";
import {
  emptyPowerSection,
  newInspectionUnit,
  type ChecklistItem,
  type InspectionBody,
  type InspectionUnit,
  type NormalAbnormal,
  type OperationTest,
  type PassFail,
  type PowerMeasurement,
  type PowerSection,
  type Rank,
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

// ── Tab: Units ────────────────────────────────────────────────
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
              <Field label="Control Panel Name"><input type="text" value={unit.controlPanelName} onChange={e => onChange(i, { controlPanelName: e.target.value })} /></Field>
              <Field label="Location"><input type="text" value={unit.location} onChange={e => onChange(i, { location: e.target.value })} /></Field>
            </div>
            <label className="ir-checkbox-field">
              <input type="checkbox" checked={unit.includePowerCheck} onChange={e => onChange(i, { includePowerCheck: e.target.checked })} />
              This unit needs electrical/power measurement checks (PLC, voltage, breaker, transformer, SMPS)
            </label>
            {unit.includePowerCheck ? (
              <div className="ir-unit-fields">
                <Field label="PLC Model"><input type="text" value={unit.plcModel} onChange={e => onChange(i, { plcModel: e.target.value })} /></Field>
                <Field label="HMI Model"><input type="text" value={unit.hmiModel} onChange={e => onChange(i, { hmiModel: e.target.value })} /></Field>
                <Field label="Communication"><input type="text" value={unit.communication} onChange={e => onChange(i, { communication: e.target.value })} /></Field>
                <Field label="Power Phase"><input type="text" value={unit.powerPhase} onChange={e => onChange(i, { powerPhase: e.target.value })} /></Field>
                <Field label="Voltage (V)"><input type="text" value={unit.voltage} onChange={e => onChange(i, { voltage: e.target.value })} /></Field>
                <Field label="Main Breaker (A)"><input type="text" value={unit.mainBreakerAmp} onChange={e => onChange(i, { mainBreakerAmp: e.target.value })} /></Field>
                <Field label="Main Breaker Model"><input type="text" value={unit.mainBreakerModel} onChange={e => onChange(i, { mainBreakerModel: e.target.value })} /></Field>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Power measurements ───────────────────────────────────
function PowerTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const u = unit.utility;
  const setU = (patch: Partial<PowerMeasurement>) => onChange({ utility: { ...u, ...patch } });
  const setSection = (i: number, patch: Partial<PowerSection>) => {
    onChange({ powerSections: unit.powerSections.map((s, idx) => idx === i ? { ...s, ...patch } : s) });
  };
  const addSection = () => onChange({ powerSections: [...unit.powerSections, emptyPowerSection()] });
  const removeSection = (i: number) => {
    if (unit.powerSections.length <= 1) return;
    onChange({ powerSections: unit.powerSections.filter((_, idx) => idx !== i) });
  };

  if (!unit.includePowerCheck) {
    return <p className="ir-empty-note">Not applicable for this unit — enable &quot;electrical/power measurement checks&quot; in the Units tab if needed.</p>;
  }

  return (
    <div>
      <div className="ir-section-title">Utility Power Supply</div>
      <div className="ir-table-wrap">
        <table className="ir-table">
          <thead><tr><th>Row</th><th>R-S (V)</th><th>R-T (V)</th><th>S-T (V)</th><th>Judgement</th><th>Rank</th><th>Remarks</th></tr></thead>
          <tbody>
            <tr>
              <td>Spec</td>
              <td><input type="text" value={u.specRS} onChange={e => setU({ specRS: e.target.value })} /></td>
              <td><input type="text" value={u.specRT} onChange={e => setU({ specRT: e.target.value })} /></td>
              <td><input type="text" value={u.specST} onChange={e => setU({ specST: e.target.value })} /></td>
              <td className="center">—</td><td className="center">—</td><td>—</td>
            </tr>
            <tr>
              <td>Actual</td>
              <td><input type="text" value={u.actualRS} onChange={e => setU({ actualRS: e.target.value })} /></td>
              <td><input type="text" value={u.actualRT} onChange={e => setU({ actualRT: e.target.value })} /></td>
              <td><input type="text" value={u.actualST} onChange={e => setU({ actualST: e.target.value })} /></td>
              <td className="center"><JudgeSelect value={u.judgement} onChange={v => setU({ judgement: v })} /></td>
              <td className="center"><RankSelect value={u.rank} onChange={v => setU({ rank: v })} /></td>
              <td><input type="text" value={u.remarks} onChange={e => setU({ remarks: e.target.value })} /></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="ir-section-title">PLC Status</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Field label="Judgement"><JudgeSelect value={unit.plcStatus} onChange={v => onChange({ plcStatus: v })} /></Field>
        <Field label="Rank"><RankSelect value={unit.plcRank} onChange={v => onChange({ plcRank: v })} /></Field>
        <div style={{ flex: 1, minWidth: 200 }}><Field label="Remarks"><input type="text" value={unit.plcRemarks} onChange={e => onChange({ plcRemarks: e.target.value })} /></Field></div>
      </div>

      {unit.powerSections.map((sec, i) => (
        <div key={i}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0 8px" }}>
            <input className="ir-section-title-input" type="text" value={sec.title} placeholder="Section title…" onChange={e => setSection(i, { title: e.target.value })} />
            {unit.powerSections.length > 1 && <button className="btn ghost sm" type="button" onClick={() => removeSection(i)}><Icon name="trash" /></button>}
          </div>
          <div style={{ marginBottom: 8 }}><Field label="Model"><input type="text" value={sec.model} onChange={e => setSection(i, { model: e.target.value })} /></Field></div>
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead><tr><th>Side</th><th>V (Spec)</th><th>A (Spec)</th><th>Judgement</th><th>Rank</th><th>Remarks</th></tr></thead>
              <tbody>
                <tr>
                  <td>Primary</td>
                  <td><input type="text" value={sec.primaryV} onChange={e => setSection(i, { primaryV: e.target.value })} /></td>
                  <td><input type="text" value={sec.primaryA} onChange={e => setSection(i, { primaryA: e.target.value })} /></td>
                  <td className="center"><JudgeSelect value={sec.primaryJudgement} onChange={v => setSection(i, { primaryJudgement: v })} /></td>
                  <td className="center"><RankSelect value={sec.primaryRank} onChange={v => setSection(i, { primaryRank: v })} /></td>
                  <td><input type="text" value={sec.primaryRemarks} onChange={e => setSection(i, { primaryRemarks: e.target.value })} /></td>
                </tr>
                <tr>
                  <td>Secondary</td>
                  <td><input type="text" value={sec.secondaryV} onChange={e => setSection(i, { secondaryV: e.target.value })} /></td>
                  <td><input type="text" value={sec.secondaryA} onChange={e => setSection(i, { secondaryA: e.target.value })} /></td>
                  <td className="center"><JudgeSelect value={sec.secondaryJudgement} onChange={v => setSection(i, { secondaryJudgement: v })} /></td>
                  <td className="center"><RankSelect value={sec.secondaryRank} onChange={v => setSection(i, { secondaryRank: v })} /></td>
                  <td><input type="text" value={sec.secondaryRemarks} onChange={e => setSection(i, { secondaryRemarks: e.target.value })} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <button className="btn default" type="button" style={{ marginTop: 12 }} onClick={addSection}><Icon name="plus" /> Add Section</button>
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
  const [tab, setTab] = useState<"units" | "power" | "operation" | "checklist" | "summary">("units");
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
          { id: "power", label: "Power" },
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
      {tab === "power" && selectedUnit ? <PowerTab unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} /> : null}
      {tab === "operation" && selectedUnit ? <OperationTab reportId={reportId} unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} readOnly={readOnly} /> : null}
      {tab === "checklist" && selectedUnit ? <ChecklistTab reportId={reportId} unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} readOnly={readOnly} /> : null}
      {tab === "summary" && selectedUnit ? <SummaryTab unit={selectedUnit} onChange={p => updateUnit(selectedUnitIndex, p)} /> : null}
    </fieldset>
  );
}
