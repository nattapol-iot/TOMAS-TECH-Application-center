"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, Field, Icon, PageHeader, Panel, Tabs } from "../ui";
import type { BootstrapData } from "../api-client";
import { generatePptx } from "./inspection-report-pptx";
import type {
  ElectricalItem,
  InspectionReport,
  InspectionUnit,
  NormalAbnormal,
  OperationTest,
  PassFail,
  PowerMeasurement,
  PowerSection,
  Rank,
  TransformerMeasurement,
} from "./inspection-report-pptx";
import "./inspection-report.css";

// ── Re-export types for local use ────────────────────────────
export type { InspectionReport, InspectionUnit };

// ── Constants ─────────────────────────────────────────────────
const STORAGE_KEY = "tomas-inspection-reports";

function defaultPower(): PowerMeasurement {
  return {
    specRS: "220", specRT: "220", specST: "220",
    actualRS: "", actualRT: "", actualST: "",
    judgement: "", rank: "", remarks: "",
  };
}

function defaultXfMeasurement(): TransformerMeasurement {
  return {
    model: "NESB-A 50/60Hz. 750VA.",
    primaryV: "220", primaryA: "",
    primaryJudgement: "", primaryRank: "", primaryRemarks: "",
    secondaryV: "100", secondaryA: "",
    secondaryJudgement: "", secondaryRank: "", secondaryRemarks: "",
  };
}

function defaultSmpsMeasurement(): TransformerMeasurement {
  return {
    model: "S82J-10024D",
    primaryV: "100", primaryA: "2.5",
    primaryJudgement: "", primaryRank: "", primaryRemarks: "",
    secondaryV: "24", secondaryA: "4.5",
    secondaryJudgement: "", secondaryRank: "", secondaryRemarks: "",
  };
}

function emptyPowerSection(): PowerSection {
  return {
    title: "New Section", model: "",
    primaryV: "", primaryA: "",
    primaryJudgement: "" as PassFail, primaryRank: "" as Rank, primaryRemarks: "",
    secondaryV: "", secondaryA: "",
    secondaryJudgement: "" as PassFail, secondaryRank: "" as Rank, secondaryRemarks: "",
  };
}

function newUnit(name = "Unit 1"): InspectionUnit {
  return {
    id: crypto.randomUUID(), name,
    controlPanelName: "", location: "Site 1, Factory 1",
    plcModel: "", hmiModel: "", communication: "",
    powerPhase: "3 Phase 3 Wire + E", voltage: "220",
    mainBreakerAmp: "50", mainBreakerModel: "",
    utility: defaultPower(),
    plcStatus: "", plcRank: "", plcRemarks: "",
    powerSections: [
      { title: "Transformer", ...defaultXfMeasurement() },
      { title: "Switching Power Supply (SMPS)", ...defaultSmpsMeasurement() },
    ],
    operationTests: [
      { name: "", status: "" as PassFail, rank: "" as Rank, remarks: "", photos: [] },
      { name: "", status: "" as PassFail, rank: "" as Rank, remarks: "", photos: [] },
    ],
    electricalItems: [
      { name: "", condition: "" as NormalAbnormal, judgement: "" as PassFail, rank: "" as Rank, remarks: "", photos: [] },
      { name: "", condition: "" as NormalAbnormal, judgement: "" as PassFail, rank: "" as Rank, remarks: "", photos: [] },
    ],
    summaryItems: [""],
  };
}

function newReport(bootstrap?: BootstrapData): InspectionReport {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: crypto.randomUUID(),
    title: "Inspection Lifter & Cage Conveyor",
    projectName: "Inspection Motor Lifter",
    projectNo: "",
    customerName: "",
    contactPerson: "", department: "", tel: "",
    reportDate: today,
    version: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    units: [newUnit("Unit 1")],
    customerSignName: "", customerTitle: "", customerDate: "",
    inspectorName: bootstrap?.user.name ?? "",
    inspectorTitle: bootstrap?.user.role ?? "",
    inspectorDate: today,
    checkerName: "", checkerTitle: "", checkerDate: today,
  };
}

// ── Storage helpers ───────────────────────────────────────────
function loadReports(): InspectionReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as InspectionReport[];
  } catch {
    return [];
  }
}

function saveReports(reports: InspectionReport[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
}

// ── PDF export (print window) ─────────────────────────────────
function exportPdf(report: InspectionReport) {
  const w = window.open("", "_blank");
  if (!w) { alert("Pop-up blocked. Please allow pop-ups for this site."); return; }

  const rankTable = `
<table class="pt" style="width:100%;border-collapse:collapse;font-size:9pt;margin-bottom:10pt">
<tr><th style="background:#1b3a6b;color:#fff;padding:4pt 6pt;border:0.5pt solid #000">Rank</th><th style="background:#1b3a6b;color:#fff;padding:4pt 6pt;border:0.5pt solid #000">Description</th></tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 6pt"><b>A</b></td><td style="border:0.5pt solid #000;padding:3pt 6pt">Can use / Need to detail check or more information.</td></tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 6pt"><b>B</b></td><td style="border:0.5pt solid #000;padding:3pt 6pt">Still can use, but need to buy some of spare parts.</td></tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 6pt"><b>C</b></td><td style="border:0.5pt solid #000;padding:3pt 6pt">Need to repair / Replace within 6 months.</td></tr>
<tr style="background:#ffcccc"><td style="border:0.5pt solid #000;padding:3pt 6pt"><b>D</b></td><td style="border:0.5pt solid #000;padding:3pt 6pt">NG / Must repair ASAP.</td></tr>
</table>`;

  function th(t: string) { return `<th style="background:#1b3a6b;color:#fff;padding:4pt 5pt;border:0.5pt solid #000;font-size:8pt">${t}</th>`; }
  function td(t: string, center = false) { return `<td style="border:0.5pt solid #000;padding:3pt 5pt;${center ? 'text-align:center' : ''}">${t}</td>`; }
  function chk(val: string, target: string) { return val === target ? "✓" : ""; }
  function ph() { return `<div style="page-break-before:always"></div>`; }

  const unitPages = report.units.map((unit, ui) => {
    const cover = `
<div style="background:#1b3a6b;color:#fff;min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:30mm;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact">
  <h1 style="font-size:22pt;margin:0 0 8pt">${report.title}</h1>
  <h2 style="font-size:16pt;margin:0 0 24pt;font-weight:400">${unit.name} Inspection Report for MCP</h2>
  <p style="margin:4pt 0">Made for : ${report.customerName}</p>
  <p style="margin:4pt 0">By : Tomas Tech Co., Ltd.</p>
  <p style="margin:4pt 0">Version : ${report.version}</p>
  <p style="margin-top:auto;font-size:9pt;opacity:0.7">Confidential · No.1 MD Tower16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd, Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.</p>
</div>`;

    const infoTable = `
${ph()}<div style="padding:15mm 20mm;font-family:Calibri,Arial,sans-serif;font-size:10pt">
<div style="background:#1b3a6b;color:#fff;padding:6pt 10pt;font-weight:700;font-size:11pt;-webkit-print-color-adjust:exact;print-color-adjust:exact">MACHINE INSPECTION CHECK LIST · ${ui * 11 + 2}</div>
<table style="width:100%;border-collapse:collapse;font-size:9pt;margin:10pt 0">
${[
  ["Customer", report.customerName],
  ["Contact Person", report.contactPerson],
  ["Department", report.department],
  ["Tel. / Fax", report.tel],
  ["Project Name", report.projectName],
  ["Project No.", report.projectNo],
  ["HMI Model", unit.hmiModel],
  ["Communication", unit.communication],
  ["PLC Model", unit.plcModel],
  ["Power Supply", `${unit.powerPhase} / ${unit.voltage} V`],
  ["Main Breaker", `${unit.mainBreakerAmp} A.  Model: ${unit.mainBreakerModel}`],
  ["Control Panel", unit.controlPanelName],
  ["Location", unit.location],
].map(([l, v]) => `<tr><td style="border:0.5pt solid #000;padding:3pt 6pt;background:#f2f2f2;width:35%;font-weight:600">${l}</td><td style="border:0.5pt solid #000;padding:3pt 6pt">${v}</td></tr>`).join('')}
</table>
${rankTable}
</div>`;

    const u = unit.utility;
    const powerPage = `
${ph()}<div style="padding:15mm 20mm;font-family:Calibri,Arial,sans-serif;font-size:10pt">
<div style="background:#1b3a6b;color:#fff;padding:6pt 10pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact">MACHINE INSPECTION CHECK LIST · ${ui * 11 + 3}</div>
<p style="font-weight:700;color:#1b3a6b;margin:10pt 0 4pt">Utility Power Supply</p>
<table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:8pt">
<tr>${th("")}${th("R-S (V)")}${th("R-T (V)")}${th("S-T (V)")}${th("OK")}${th("NG")}${th("A")}${th("B")}${th("C")}${th("D")}${th("Remarks")}</tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 5pt;background:#f2f2f2;font-weight:600">Spec.</td>${td(u.specRS,true)}${td(u.specRT,true)}${td(u.specST,true)}${td("OK",true)}${td("NG",true)}${td("A",true)}${td("B",true)}${td("C",true)}${td("D",true)}${td("")}</tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 5pt;background:#f2f2f2;font-weight:600">Actual</td>${td(u.actualRS,true)}${td(u.actualRT,true)}${td(u.actualST,true)}${td(chk(u.judgement,"OK"),true)}${td(chk(u.judgement,"NG"),true)}${td(chk(u.rank,"A"),true)}${td(chk(u.rank,"B"),true)}${td(chk(u.rank,"C"),true)}${td(chk(u.rank,"D"),true)}${td(u.remarks)}</tr>
</table>
<p style="font-weight:700;color:#1b3a6b;margin:10pt 0 4pt">PLC Status</p>
<table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:8pt">
<tr>${th("Status")}${th("OK")}${th("NG")}${th("A")}${th("B")}${th("C")}${th("D")}${th("Remarks")}</tr>
<tr>${td("PLC")}${td(chk(unit.plcStatus,"OK"),true)}${td(chk(unit.plcStatus,"NG"),true)}${td(chk(unit.plcRank,"A"),true)}${td(chk(unit.plcRank,"B"),true)}${td(chk(unit.plcRank,"C"),true)}${td(chk(unit.plcRank,"D"),true)}${td(unit.plcRemarks)}</tr>
</table>
${unit.powerSections.map(sec => {
  const m = sec;
  const title = sec.title;
  return `<p style="font-weight:700;color:#1b3a6b;margin:10pt 0 4pt">${title} : ${m.model}</p>
<table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:8pt">
<tr>${th("")}${th("V")}${th("A")}${th("OK")}${th("NG")}${th("A")}${th("B")}${th("C")}${th("D")}${th("Remarks")}</tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 5pt;background:#f2f2f2;font-weight:600">Primary Spec.</td>${td(m.primaryV,true)}${td("",true)}${td("OK",true)}${td("NG",true)}${td("A",true)}${td("B",true)}${td("C",true)}${td("D",true)}${td("")}</tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 5pt;background:#f2f2f2;font-weight:600">Primary Actual</td>${td(m.primaryV,true)}${td(m.primaryA,true)}${td(chk(m.primaryJudgement,"OK"),true)}${td(chk(m.primaryJudgement,"NG"),true)}${td(chk(m.primaryRank,"A"),true)}${td(chk(m.primaryRank,"B"),true)}${td(chk(m.primaryRank,"C"),true)}${td(chk(m.primaryRank,"D"),true)}${td(m.primaryRemarks)}</tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 5pt;background:#f2f2f2;font-weight:600">Secondary Spec.</td>${td(m.secondaryV,true)}${td("",true)}${td("OK",true)}${td("NG",true)}${td("A",true)}${td("B",true)}${td("C",true)}${td("D",true)}${td("")}</tr>
<tr><td style="border:0.5pt solid #000;padding:3pt 5pt;background:#f2f2f2;font-weight:600">Secondary Actual</td>${td(m.secondaryV,true)}${td(m.secondaryA,true)}${td(chk(m.secondaryJudgement,"OK"),true)}${td(chk(m.secondaryJudgement,"NG"),true)}${td(chk(m.secondaryRank,"A"),true)}${td(chk(m.secondaryRank,"B"),true)}${td(chk(m.secondaryRank,"C"),true)}${td(chk(m.secondaryRank,"D"),true)}${td(m.secondaryRemarks)}</tr>
</table>`;
}).join('')}
</div>`;

    const opRows = unit.operationTests.map(t =>
      `<tr>${td(t.name)}${td(chk(t.status,"OK"),true)}${td(chk(t.status,"NG"),true)}${td(chk(t.rank,"A"),true)}${td(chk(t.rank,"B"),true)}${td(chk(t.rank,"C"),true)}${td(chk(t.rank,"D"),true)}${td(t.remarks)}</tr>`
    ).join('');
    const opPage = `
${ph()}<div style="padding:15mm 20mm;font-family:Calibri,Arial,sans-serif;font-size:10pt">
<div style="background:#1b3a6b;color:#fff;padding:6pt 10pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact">MACHINE INSPECTION CHECK LIST · ${ui * 11 + 4}</div>
<table style="width:100%;border-collapse:collapse;font-size:8pt;margin:10pt 0">
<tr>${th("Test Name")}${th("OK")}${th("NG")}${th("A")}${th("B")}${th("C")}${th("D")}${th("Remarks")}</tr>
${opRows}
</table>
</div>`;

    const elRows = unit.electricalItems.map(item =>
      `<tr>${td(item.name)}${td(chk(item.condition,"Normal"),true)}${td(chk(item.condition,"Abnormal"),true)}${td(chk(item.judgement,"OK"),true)}${td(chk(item.judgement,"NG"),true)}${td(chk(item.rank,"A"),true)}${td(chk(item.rank,"B"),true)}${td(chk(item.rank,"C"),true)}${td(chk(item.rank,"D"),true)}${td(item.remarks)}</tr>`
    ).join('');
    const elPage = `
${ph()}<div style="padding:15mm 20mm;font-family:Calibri,Arial,sans-serif;font-size:10pt">
<div style="background:#1b3a6b;color:#fff;padding:6pt 10pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact">MACHINE INSPECTION CHECK LIST · ${ui * 11 + 7}</div>
<table style="width:100%;border-collapse:collapse;font-size:8pt;margin:10pt 0">
<tr>${th("Component")}${th("Normal")}${th("Abnormal")}${th("OK")}${th("NG")}${th("A")}${th("B")}${th("C")}${th("D")}${th("Remarks")}</tr>
${elRows}
</table>
</div>`;

    const summItems = unit.summaryItems.filter(s => s.trim());
    const summPage = `
${ph()}<div style="padding:15mm 20mm;font-family:Calibri,Arial,sans-serif;font-size:10pt">
<div style="background:#1b3a6b;color:#fff;padding:6pt 10pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact">MACHINE INSPECTION CHECK LIST · ${ui * 11 + 10}</div>
<p style="font-weight:700;color:#1b3a6b;margin:10pt 0 4pt">SUMMARY</p>
${summItems.map((s, i) => `<p style="margin:4pt 0">${i + 1}. ${s}</p>`).join('')}
</div>`;

    const signPage = `
${ph()}<div style="padding:15mm 20mm;font-family:Calibri,Arial,sans-serif;font-size:10pt">
<div style="background:#1b3a6b;color:#fff;padding:6pt 10pt;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact">Sign Off · ${ui * 11 + 11}</div>
<p>With all these documents, this is part of the installation report and it is all the information of the project.</p>
<div style="display:flex;gap:16pt;margin-top:12pt;flex-wrap:wrap">
${[
  { label: report.customerName, name: report.customerSignName, title: report.customerTitle, date: report.customerDate },
  { label: "TOMAS TECH CO., LTD. — Prepare / Inspector", name: report.inspectorName, title: report.inspectorTitle, date: report.inspectorDate },
  { label: "TOMAS TECH CO., LTD. — Checked", name: report.checkerName, title: report.checkerTitle, date: report.checkerDate },
].map(s => `<div style="flex:1;min-width:180pt;border:0.5pt solid #000;padding:8pt">
  <p style="font-weight:700;color:#1b3a6b;margin:0 0 6pt;font-size:9pt;text-transform:uppercase">${s.label}</p>
  <div style="border-bottom:0.5pt solid #000;height:28pt;margin:6pt 0"></div>
  <p style="margin:2pt 0;font-size:9pt">Name : ${s.name}</p>
  <p style="margin:2pt 0;font-size:9pt">Title : ${s.title}</p>
  <p style="margin:2pt 0;font-size:9pt">Date : ${s.date}</p>
</div>`).join('')}
</div>
<p style="text-align:center;font-weight:700;color:#1b3a6b;margin-top:20pt">## END OF BLUEPRINT ##</p>
</div>`;

    return `${ui > 0 ? ph() : ''}${cover}${infoTable}${powerPage}${opPage}${elPage}${summPage}${signPage}`;
  }).join('');

  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${report.title}</title>
<style>
  body { margin: 0; font-family: Calibri, Arial, sans-serif; }
  @media print {
    body { margin: 0; }
    @page { margin: 0; size: A4 portrait; }
  }
</style>
</head><body>${unitPages}</body></html>`);
  w.document.close();
  setTimeout(() => { w.print(); }, 500);
}

// ── Tab labels ────────────────────────────────────────────────
const FORM_TABS = ["General", "Units", "Power", "Operation", "Electrical", "Summary", "Sign Off"];

// ── Main component ────────────────────────────────────────────
export function InspectionReportScreen({ bootstrap, notify }: { bootstrap: BootstrapData; notify: (msg: string) => void }) {
  const [reports, setReports] = useState<InspectionReport[]>(() => loadReports());
  const [editId, setEditId] = useState<string | null>(null);
  const report = editId ? reports.find(r => r.id === editId) ?? null : null;

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistReports = useCallback((next: InspectionReport[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveReports(next); }, 500);
  }, []);

  const updateReport = useCallback((patch: Partial<InspectionReport>) => {
    setReports(prev => {
      const next = prev.map(r => r.id === editId ? { ...r, ...patch } : r);
      persistReports(next);
      return next;
    });
  }, [editId, persistReports]);

  const createNew = () => {
    const r = newReport(bootstrap);
    const next = [r, ...reports];
    setReports(next);
    saveReports(next);
    setEditId(r.id);
  };

  const deleteReport = (id: string) => {
    if (!window.confirm("Delete this inspection report? This cannot be undone.")) return;
    const next = reports.filter(r => r.id !== id);
    setReports(next);
    saveReports(next);
    if (editId === id) setEditId(null);
  };

  if (editId && report) {
    return <ReportEditor
      report={report}
      onChange={updateReport}
      onBack={() => setEditId(null)}
      onDelete={() => deleteReport(editId)}
      notify={notify}
      bootstrap={bootstrap}
    />;
  }

  return (
    <div>
      <PageHeader
        eyebrow="INSPECTION"
        title="Inspection Reports"
        subtitle="Machine inspection checklist for Lifter & Cage Conveyor systems"
        actions={
          <button className="btn primary" type="button" onClick={createNew}>
            <Icon name="plus" /> New Report
          </button>
        }
      />
      {reports.length === 0 ? (
        <EmptyState
          icon="file"
          title="No inspection reports yet"
          message="Click New Report to create your first inspection report."
        />
      ) : (
        <div className="ir-list">
          {reports.map(r => (
            <div key={r.id} className="ir-card" onClick={() => setEditId(r.id)}>
              <Icon name="file" />
              <div className="ir-card-body">
                <div className="ir-card-title">{r.title || "Untitled"}</div>
                <div className="ir-card-meta">
                  {r.projectNo || "No project no."} · {r.customerName} · {r.units.length} unit{r.units.length !== 1 ? "s" : ""} · {r.reportDate}
                </div>
              </div>
              <div className="ir-card-actions">
                <button
                  className="btn default sm"
                  type="button"
                  onClick={e => { e.stopPropagation(); setEditId(r.id); }}
                >
                  <Icon name="edit" /> Open
                </button>
                <button
                  className="btn ghost sm"
                  type="button"
                  onClick={e => { e.stopPropagation(); deleteReport(r.id); }}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Report editor ─────────────────────────────────────────────
function ReportEditor({
  report, onChange, onBack, onDelete, notify, bootstrap,
}: {
  report: InspectionReport;
  onChange: (patch: Partial<InspectionReport>) => void;
  onBack: () => void;
  onDelete: () => void;
  notify: (msg: string) => void;
  bootstrap: BootstrapData;
}) {
  const [tab, setTab] = useState(0);
  const [unitIdx, setUnitIdx] = useState(0);
  const safeUnitIdx = Math.min(unitIdx, report.units.length - 1);
  const unit = report.units[safeUnitIdx];

  const pptxExport = () => {
    try {
      const bytes = generatePptx(report);
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title || "inspection-report"}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      notify("PPTX exported");
    } catch (e) {
      notify("Export failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const addUnit = () => {
    const next = [...report.units, newUnit(`Unit ${report.units.length + 1}`)];
    onChange({ units: next });
    setUnitIdx(next.length - 1);
  };

  const removeUnit = (i: number) => {
    if (report.units.length <= 1) { notify("A report must have at least one unit."); return; }
    if (!window.confirm(`Remove "${report.units[i].name}"?`)) return;
    const next = report.units.filter((_, idx) => idx !== i);
    onChange({ units: next });
    setUnitIdx(Math.min(i, next.length - 1));
  };

  const updateUnit = (patch: Partial<InspectionUnit>) => {
    const next = report.units.map((u, i) => i === safeUnitIdx ? { ...u, ...patch } : u);
    onChange({ units: next });
  };

  return (
    <div>
      <div className="ir-form-header">
        <button className="btn ghost" type="button" onClick={onBack}><Icon name="arrowLeft" /> Back</button>
        <h2>{report.title || "Untitled"}</h2>
        <div className="ir-form-actions">
          <button className="btn default" type="button" onClick={() => exportPdf(report)}><Icon name="download" /> Export PDF</button>
          <button className="btn primary" type="button" onClick={pptxExport}><Icon name="download" /> Export PPTX</button>
          <button className="btn ghost" type="button" onClick={onDelete}><Icon name="trash" /></button>
        </div>
      </div>

      <Tabs
        tabs={FORM_TABS.map((label, id) => ({ id: String(id), label }))}
        active={String(tab)}
        onChange={v => setTab(Number(v))}
      />

      <div style={{ marginTop: 16 }}>
        {tab === 0 && <GeneralTab report={report} onChange={onChange} bootstrap={bootstrap} />}
        {tab === 1 && <UnitsTab report={report} onChange={onChange} onAdd={addUnit} onRemove={removeUnit} />}
        {(tab === 2 || tab === 3 || tab === 4 || tab === 5) && (
          <>
            <div className="ir-unit-bar">
              <label>Unit:</label>
              <select value={safeUnitIdx} onChange={e => setUnitIdx(Number(e.target.value))}>
                {report.units.map((u, i) => <option key={u.id} value={i}>{u.name}</option>)}
              </select>
            </div>
            {tab === 2 && <PowerTab unit={unit} onChange={updateUnit} />}
            {tab === 3 && <OperationTab unit={unit} onChange={updateUnit} />}
            {tab === 4 && <ElectricalTab unit={unit} onChange={updateUnit} />}
            {tab === 5 && <SummaryTab unit={unit} onChange={updateUnit} />}
          </>
        )}
        {tab === 6 && <SignOffTab report={report} onChange={onChange} bootstrap={bootstrap} />}
      </div>
    </div>
  );
}

// ── Tab: General ──────────────────────────────────────────────
function GeneralTab({ report, onChange, bootstrap }: {
  report: InspectionReport;
  onChange: (p: Partial<InspectionReport>) => void;
  bootstrap: BootstrapData;
}) {
  const handleCustomerPick = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cust = bootstrap.customers.find(c => String(c.id) === e.target.value);
    if (!cust) return;
    onChange({
      customerName: cust.nameEn || cust.name,
      contactPerson: cust.contactNameEn || cust.contact,
      department: cust.department ?? "",
      tel: cust.phone,
    });
  };

  return (
    <Panel>
      <div style={{ marginBottom: 16, maxWidth: 400 }}>
        <Field label="Pick Customer (auto-fill)" hint="Selects customer info from your master list">
          <select defaultValue="" onChange={handleCustomerPick}>
            <option value="">— select to auto-fill —</option>
            {bootstrap.customers.map(c => (
              <option key={c.id} value={c.id}>{c.nameEn || c.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
        <Field label="Report Title"><input type="text" value={report.title} onChange={e => onChange({ title: e.target.value })} /></Field>
        <Field label="Project Name"><input type="text" value={report.projectName} onChange={e => onChange({ projectName: e.target.value })} /></Field>
        <Field label="Project No."><input type="text" value={report.projectNo} onChange={e => onChange({ projectNo: e.target.value })} /></Field>
        <Field label="Customer Name"><input type="text" value={report.customerName} onChange={e => onChange({ customerName: e.target.value })} /></Field>
        <Field label="Contact Person"><input type="text" value={report.contactPerson} onChange={e => onChange({ contactPerson: e.target.value })} /></Field>
        <Field label="Department"><input type="text" value={report.department} onChange={e => onChange({ department: e.target.value })} /></Field>
        <Field label="Tel. / Fax"><input type="tel" value={report.tel} onChange={e => onChange({ tel: e.target.value })} /></Field>
        <Field label="Report Date"><input type="date" value={report.reportDate} onChange={e => onChange({ reportDate: e.target.value })} /></Field>
        <Field label="Version"><input type="text" value={report.version} onChange={e => onChange({ version: e.target.value })} /></Field>
      </div>
    </Panel>
  );
}

// ── Tab: Units ────────────────────────────────────────────────
function UnitsTab({ report, onChange, onAdd, onRemove }: {
  report: InspectionReport;
  onChange: (p: Partial<InspectionReport>) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const updateUnit = (i: number, patch: Partial<InspectionUnit>) => {
    const next = report.units.map((u, idx) => idx === i ? { ...u, ...patch } : u);
    onChange({ units: next });
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn default" type="button" onClick={onAdd}><Icon name="plus" /> Add Unit</button>
      </div>
      <div className="ir-unit-list">
        {report.units.map((unit, i) => (
          <div key={unit.id} className="ir-unit-card">
            <div className="ir-unit-card-head">
              <strong>{unit.name || `Unit ${i + 1}`}</strong>
              <button className="btn ghost sm" type="button" onClick={() => onRemove(i)}><Icon name="trash" /></button>
            </div>
            <div className="ir-unit-fields">
              <Field label="Unit Name"><input type="text" value={unit.name} onChange={e => updateUnit(i, { name: e.target.value })} /></Field>
              <Field label="Control Panel Name"><input type="text" value={unit.controlPanelName} onChange={e => updateUnit(i, { controlPanelName: e.target.value })} /></Field>
              <Field label="Location"><input type="text" value={unit.location} onChange={e => updateUnit(i, { location: e.target.value })} /></Field>
              <Field label="PLC Model"><input type="text" value={unit.plcModel} onChange={e => updateUnit(i, { plcModel: e.target.value })} /></Field>
              <Field label="HMI Model"><input type="text" value={unit.hmiModel} onChange={e => updateUnit(i, { hmiModel: e.target.value })} /></Field>
              <Field label="Communication"><input type="text" value={unit.communication} onChange={e => updateUnit(i, { communication: e.target.value })} /></Field>
              <Field label="Power Phase"><input type="text" value={unit.powerPhase} onChange={e => updateUnit(i, { powerPhase: e.target.value })} /></Field>
              <Field label="Voltage (V)"><input type="text" value={unit.voltage} onChange={e => updateUnit(i, { voltage: e.target.value })} /></Field>
              <Field label="Main Breaker (A)"><input type="text" value={unit.mainBreakerAmp} onChange={e => updateUnit(i, { mainBreakerAmp: e.target.value })} /></Field>
              <Field label="Main Breaker Model"><input type="text" value={unit.mainBreakerModel} onChange={e => updateUnit(i, { mainBreakerModel: e.target.value })} /></Field>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Power measurements ───────────────────────────────────
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

// ── Photo upload ──────────────────────────────────────────────
function PhotoUpload({ photos, onChange, max = 3 }: {
  photos: string[];
  onChange: (p: string[]) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const toAdd = files.slice(0, max - photos.length);
    if (!toAdd.length) return;
    Promise.all(
      toAdd.map(f => new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(f);
      }))
    ).then(newPhotos => onChange([...photos, ...newPhotos]));
    e.target.value = "";
  };
  const remove = (i: number) => onChange(photos.filter((_, idx) => idx !== i));
  return (
    <div className="ir-photo-upload">
      <div className="ir-photo-thumbs">
        {photos.map((src, i) => (
          <div key={i} className="ir-photo-thumb">
            <img src={src} alt="" />
            <button type="button" className="ir-photo-remove" onClick={() => remove(i)}>×</button>
          </div>
        ))}
        {photos.length < max && (
          <button type="button" className="ir-photo-add" onClick={() => inputRef.current?.click()}>+</button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFiles} />
    </div>
  );
}

function PowerTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const u = unit.utility;
  const setU = (patch: Partial<PowerMeasurement>) => onChange({ utility: { ...u, ...patch } });

  const setSection = (i: number, patch: Partial<PowerSection>) => {
    const next = unit.powerSections.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    onChange({ powerSections: next });
  };
  const addSection = () => onChange({ powerSections: [...unit.powerSections, emptyPowerSection()] });
  const removeSection = (i: number) => {
    if (unit.powerSections.length <= 1) return;
    onChange({ powerSections: unit.powerSections.filter((_, idx) => idx !== i) });
  };

  return (
    <div>
      <div className="ir-section-title">Utility Power Supply</div>
      <div className="ir-table-wrap">
        <table className="ir-table">
          <thead>
            <tr><th>Row</th><th>R-S (V)</th><th>R-T (V)</th><th>S-T (V)</th><th>Judgement</th><th>Rank</th><th>Remarks</th></tr>
          </thead>
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
            <input
              className="ir-section-title-input"
              type="text"
              value={sec.title}
              placeholder="Section title…"
              onChange={e => setSection(i, { title: e.target.value })}
            />
            {unit.powerSections.length > 1 && (
              <button className="btn ghost sm" type="button" onClick={() => removeSection(i)}><Icon name="trash" /></button>
            )}
          </div>
          <div style={{ marginBottom: 8 }}>
            <Field label="Model"><input type="text" value={sec.model} onChange={e => setSection(i, { model: e.target.value })} /></Field>
          </div>
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead><tr><th>Side</th><th>V (Spec)</th><th>A (Spec)</th><th>V (Actual)</th><th>A (Actual)</th><th>Judgement</th><th>Rank</th><th>Remarks</th></tr></thead>
              <tbody>
                <tr>
                  <td>Primary</td>
                  <td><input type="text" value={sec.primaryV} onChange={e => setSection(i, { primaryV: e.target.value })} /></td>
                  <td><input type="text" value={sec.primaryA} onChange={e => setSection(i, { primaryA: e.target.value })} /></td>
                  <td><input type="text" value={sec.primaryV} readOnly style={{ background: "#f5f7fa" }} /></td>
                  <td><input type="text" value={sec.primaryA} onChange={e => setSection(i, { primaryA: e.target.value })} /></td>
                  <td className="center"><JudgeSelect value={sec.primaryJudgement} onChange={v => setSection(i, { primaryJudgement: v })} /></td>
                  <td className="center"><RankSelect value={sec.primaryRank} onChange={v => setSection(i, { primaryRank: v })} /></td>
                  <td><input type="text" value={sec.primaryRemarks} onChange={e => setSection(i, { primaryRemarks: e.target.value })} /></td>
                </tr>
                <tr>
                  <td>Secondary</td>
                  <td><input type="text" value={sec.secondaryV} onChange={e => setSection(i, { secondaryV: e.target.value })} /></td>
                  <td><input type="text" value={sec.secondaryA} onChange={e => setSection(i, { secondaryA: e.target.value })} /></td>
                  <td><input type="text" value={sec.secondaryV} readOnly style={{ background: "#f5f7fa" }} /></td>
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
      <button className="btn default" type="button" style={{ marginTop: 12 }} onClick={addSection}>
        <Icon name="plus" /> Add Section
      </button>
    </div>
  );
}

// ── Tab: Operation tests ──────────────────────────────────────
function OperationTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const setTest = (i: number, patch: Partial<OperationTest>) => {
    const next = unit.operationTests.map((t, idx) => idx === i ? { ...t, ...patch } : t);
    onChange({ operationTests: next });
  };
  const addTest = () => onChange({ operationTests: [...unit.operationTests, { name: "", status: "" as PassFail, rank: "" as Rank, remarks: "", photos: [] }] });
  const removeTest = (i: number) => onChange({ operationTests: unit.operationTests.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div className="ir-table-wrap">
        <table className="ir-table">
          <thead>
            <tr><th>Test Name</th><th>Judgement</th><th>Rank</th><th>Remarks</th><th>Photo</th><th></th></tr>
          </thead>
          <tbody>
            {unit.operationTests.map((t, i) => (
              <tr key={i}>
                <td><input type="text" value={t.name} placeholder="Test name…" onChange={e => setTest(i, { name: e.target.value })} /></td>
                <td className="center"><JudgeSelect value={t.status} onChange={v => setTest(i, { status: v })} /></td>
                <td className="center"><RankSelect value={t.rank} onChange={v => setTest(i, { rank: v })} /></td>
                <td><input type="text" value={t.remarks} onChange={e => setTest(i, { remarks: e.target.value })} /></td>
                <td><PhotoUpload photos={t.photos ?? []} onChange={p => setTest(i, { photos: p })} max={1} /></td>
                <td className="center">
                  <button className="btn ghost sm" type="button" onClick={() => removeTest(i)}><Icon name="minus" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn default" type="button" style={{ marginTop: 10 }} onClick={addTest}>
        <Icon name="plus" /> Add Row
      </button>
    </div>
  );
}

// ── Tab: Electrical inspection ────────────────────────────────
function ElectricalTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const setItem = (i: number, patch: Partial<ElectricalItem>) => {
    const next = unit.electricalItems.map((item, idx) => idx === i ? { ...item, ...patch } : item);
    onChange({ electricalItems: next });
  };
  const addItem = () => onChange({ electricalItems: [...unit.electricalItems, { name: "", condition: "" as NormalAbnormal, judgement: "" as PassFail, rank: "" as Rank, remarks: "", photos: [] }] });
  const removeItem = (i: number) => onChange({ electricalItems: unit.electricalItems.filter((_, idx) => idx !== i) });

  return (
    <div>
      <div className="ir-table-wrap">
        <table className="ir-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Condition</th>
              <th>Judgement</th>
              <th>Rank</th>
              <th>Remarks</th>
              <th>Photos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {unit.electricalItems.map((item, i) => (
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
                <td><PhotoUpload photos={item.photos ?? []} onChange={p => setItem(i, { photos: p })} max={3} /></td>
                <td className="center">
                  <button className="btn ghost sm" type="button" onClick={() => removeItem(i)}><Icon name="minus" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn default" type="button" style={{ marginTop: 10 }} onClick={addItem}>
        <Icon name="plus" /> Add Row
      </button>
    </div>
  );
}

// ── Tab: Summary ──────────────────────────────────────────────
function SummaryTab({ unit, onChange }: { unit: InspectionUnit; onChange: (p: Partial<InspectionUnit>) => void }) {
  const setItem = (i: number, v: string) => {
    const next = unit.summaryItems.map((s, idx) => idx === i ? v : s);
    onChange({ summaryItems: next });
  };
  const addItem = () => onChange({ summaryItems: [...unit.summaryItems, ""] });
  const removeItem = (i: number) => {
    if (unit.summaryItems.length <= 1) return;
    onChange({ summaryItems: unit.summaryItems.filter((_, idx) => idx !== i) });
  };
  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
        Numbered recommendations / findings for this unit.
      </p>
      <div className="ir-summary-list">
        {unit.summaryItems.map((s, i) => (
          <div key={i} className="ir-summary-row">
            <span>{i + 1}.</span>
            <textarea
              value={s}
              placeholder="Enter recommendation…"
              rows={2}
              onChange={e => setItem(i, e.target.value)}
            />
            <button className="btn ghost sm" type="button" onClick={() => removeItem(i)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
              <Icon name="minus" />
            </button>
          </div>
        ))}
      </div>
      <button className="btn default" type="button" style={{ marginTop: 10 }} onClick={addItem}>
        <Icon name="plus" /> Add Item
      </button>
    </div>
  );
}

// ── Tab: Sign off ─────────────────────────────────────────────
function SignOffTab({ report, onChange, bootstrap }: {
  report: InspectionReport;
  onChange: (p: Partial<InspectionReport>) => void;
  bootstrap: BootstrapData;
}) {
  const pickInspector = (memberId: string) => {
    const m = bootstrap.team.find(t => String(t.id) === memberId);
    if (!m) return;
    onChange({ inspectorName: m.name, inspectorTitle: m.role });
  };
  const pickChecker = (memberId: string) => {
    const m = bootstrap.team.find(t => String(t.id) === memberId);
    if (!m) return;
    onChange({ checkerName: m.name, checkerTitle: m.role });
  };

  return (
    <div className="ir-signoff-grid">
      <div className="ir-signoff-block">
        <h4>{report.customerName || "Customer"}</h4>
        <Field label="Name"><input type="text" value={report.customerSignName} onChange={e => onChange({ customerSignName: e.target.value })} /></Field>
        <Field label="Title"><input type="text" value={report.customerTitle} onChange={e => onChange({ customerTitle: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={report.customerDate} onChange={e => onChange({ customerDate: e.target.value })} /></Field>
      </div>
      <div className="ir-signoff-block">
        <h4>Prepare / Inspector</h4>
        <Field label="Pick from team">
          <select defaultValue="" onChange={e => pickInspector(e.target.value)}>
            <option value="">— select —</option>
            {bootstrap.team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Name"><input type="text" value={report.inspectorName} onChange={e => onChange({ inspectorName: e.target.value })} /></Field>
        <Field label="Title"><input type="text" value={report.inspectorTitle} onChange={e => onChange({ inspectorTitle: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={report.inspectorDate} onChange={e => onChange({ inspectorDate: e.target.value })} /></Field>
      </div>
      <div className="ir-signoff-block">
        <h4>Checked By</h4>
        <Field label="Pick from team">
          <select defaultValue="" onChange={e => pickChecker(e.target.value)}>
            <option value="">— select —</option>
            {bootstrap.team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Name"><input type="text" value={report.checkerName} onChange={e => onChange({ checkerName: e.target.value })} /></Field>
        <Field label="Title"><input type="text" value={report.checkerTitle} onChange={e => onChange({ checkerTitle: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={report.checkerDate} onChange={e => onChange({ checkerDate: e.target.value })} /></Field>
      </div>
    </div>
  );
}
