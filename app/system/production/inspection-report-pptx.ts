import { zipSync } from "fflate";
import {
  THEME_XML,
  SLIDE_MASTER_XML,
  SLIDE_LAYOUT_BLANK_XML,
  LOGO_BASE64,
  LOGO_EXT,
} from "./inspection-report-template";

// ── Types (mirrored from InspectionReportScreens) ─────────────
export type Rank = "A" | "B" | "C" | "D" | "";
export type PassFail = "OK" | "NG" | "";
export type NormalAbnormal = "Normal" | "Abnormal" | "";

export type PowerMeasurement = {
  specRS: string; specRT: string; specST: string;
  actualRS: string; actualRT: string; actualST: string;
  judgement: PassFail; rank: Rank; remarks: string;
};

export type TransformerMeasurement = {
  model: string;
  primaryV: string; primaryA: string;
  primaryJudgement: PassFail; primaryRank: Rank; primaryRemarks: string;
  secondaryV: string; secondaryA: string;
  secondaryJudgement: PassFail; secondaryRank: Rank; secondaryRemarks: string;
};

export type PowerSection = { title: string } & TransformerMeasurement;

export type OperationTest = {
  name: string; status: PassFail; rank: Rank; remarks: string;
};

export type ElectricalItem = {
  name: string; condition: NormalAbnormal; judgement: PassFail; rank: Rank; remarks: string;
};

export type InspectionUnit = {
  id: string; name: string;
  controlPanelName: string; location: string;
  plcModel: string; hmiModel: string; communication: string;
  powerPhase: string; voltage: string;
  mainBreakerAmp: string; mainBreakerModel: string;
  utility: PowerMeasurement;
  plcStatus: PassFail; plcRank: Rank; plcRemarks: string;
  powerSections: PowerSection[];
  operationTests: OperationTest[];
  electricalItems: ElectricalItem[];
  summaryItems: string[];
};

export type InspectionReport = {
  id: string; title: string; projectName: string; projectNo: string;
  customerName: string; contactPerson: string; department: string; tel: string;
  reportDate: string; version: string;
  units: InspectionUnit[];
  customerSignName: string; customerTitle: string; customerDate: string;
  inspectorName: string; inspectorTitle: string; inspectorDate: string;
  checkerName: string; checkerTitle: string; checkerDate: string;
};

// ── Layout constants (A4 Portrait, EMU) ───────────────────────
const W = 7560000;   // 21 cm
const H = 10692000;  // 29.7 cm
const MARGIN = 457200; // 1.27 cm
const INNER_W = W - 2 * MARGIN;
const HEADER_H = 432000; // 1.2 cm
const DARK_BLUE = "1B3A6B";
const LIGHT_BLUE = "D6E4F7";
const GRAY_BG = "F2F2F2";

function cm(c: number) { return Math.round(c * 360000); }
function pt(p: number) { return Math.round(p * 12700); }
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function solidFill(hex: string): string {
  return `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
}

function txRun(text: string, opts: { bold?: boolean; sz?: number; color?: string } = {}): string {
  const bold = opts.bold ? 'b="1"' : '';
  const sz = opts.sz ? `sz="${opts.sz * 100}"` : 'sz="800"';
  const fill = opts.color ? `<a:solidFill><a:srgbClr val="${opts.color}"/></a:solidFill>` : '';
  return `<a:r><a:rPr lang="en-US" ${bold} ${sz} dirty="0"><a:latin typeface="Calibri"/>${fill}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function txPara(text: string, opts: { bold?: boolean; sz?: number; color?: string; align?: string } = {}): string {
  const align = opts.align ? `algn="${opts.align}"` : '';
  return `<a:p><a:pPr ${align}/>${txRun(text, opts)}</a:p>`;
}

function txBox(x: number, y: number, w: number, h: number, content: string, bgColor?: string): string {
  const fill = bgColor ? solidFill(bgColor) : '<a:noFill/>';
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="0" name="sp"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}<a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="${cm(0.1)}" rIns="${cm(0.1)}" tIns="${cm(0.05)}" bIns="${cm(0.05)}" anchor="ctr"><a:normAutofit/></a:bodyPr>
    <a:lstStyle/>
    ${content}
  </p:txBody>
</p:sp>`;
}

function bgRect(x: number, y: number, w: number, h: number, color: string): string {
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="0" name="bg"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${solidFill(color)}<a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
</p:sp>`;
}

// ── Table builder ─────────────────────────────────────────────
type CellDef = { text: string; bold?: boolean; sz?: number; bg?: string; span?: number; align?: string };
type RowDef = { cells: CellDef[]; h?: number };

function tbl(x: number, y: number, colW: number[], rows: RowDef[]): string {
  const totalW = colW.reduce((a, b) => a + b, 0);
  const gridCols = colW.map(w => `<a:gridCol w="${w}"/>`).join('');
  const border = (pos: string) =>
    `<a:ln${pos} w="${pt(0.5)}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln${pos}>`;
  const borders = ['L', 'R', 'T', 'B'].map(border).join('');

  const tblRows = rows.map(row => {
    const h = row.h ?? cm(0.65);
    const cells = row.cells.map(cell => {
      const bg = cell.bg ? solidFill(cell.bg) : '<a:noFill/>';
      const isDark = cell.bg ? parseInt(cell.bg, 16) < 0xAAAAAA * 2 : false;
      const textColor = isDark ? 'FFFFFF' : '000000';
      const span = cell.span ? `gridSpan="${cell.span}"` : '';
      return `<a:tc ${span}><a:txBody><a:bodyPr/><a:lstStyle/>` +
        txPara(cell.text, { bold: cell.bold, sz: cell.sz ?? 7, color: cell.bg ? textColor : '000000', align: cell.align }) +
        `</a:txBody><a:tcPr>${borders}${bg}</a:tcPr></a:tc>`;
    });
    return `<a:tr h="${h}">${cells.join('')}</a:tr>`;
  });

  const totalH = rows.reduce((a, r) => a + (r.h ?? cm(0.65)), 0);
  return `<p:graphicFrame>
  <p:nvGraphicFramePr><p:cNvPr id="0" name="tbl"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
  <p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${totalW}" cy="${totalH}"/></p:xfrm>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
    <a:tbl><a:tblPr/><a:tblGrid>${gridCols}</a:tblGrid>${tblRows.join('')}</a:tbl>
  </a:graphicData></a:graphic>
</p:graphicFrame>`;
}

// ── Slide XML wrapper ─────────────────────────────────────────
const NSP = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NSA = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NSR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function slide(shapes: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NSP} ${NSA} ${NSR}>
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    ${shapes.join('\n')}
  </p:spTree></p:cSld>
</p:sld>`;
}

// Header bar shared across non-cover slides
function pageHeader(title: string, pageNum: number): string[] {
  return [
    bgRect(MARGIN, MARGIN, INNER_W, HEADER_H, DARK_BLUE),
    txBox(MARGIN + cm(0.2), MARGIN, INNER_W - cm(2), HEADER_H,
      txPara(title, { bold: true, sz: 10, color: 'FFFFFF' })),
    txBox(W - MARGIN - cm(2), MARGIN, cm(2), HEADER_H,
      txPara(String(pageNum), { sz: 10, color: 'FFFFFF', align: 'r' })),
  ];
}

// ── Slide generators ──────────────────────────────────────────

function coverSlide(report: InspectionReport, unit: InspectionUnit, pageNum: number): string {
  const y0 = cm(5);
  const shapes: string[] = [
    bgRect(0, 0, W, H, DARK_BLUE),
    txBox(MARGIN, y0, INNER_W, cm(1.6), txPara(report.title, { bold: true, sz: 22, color: 'FFFFFF', align: 'ctr' })),
    txBox(MARGIN, y0 + cm(1.8), INNER_W, cm(1.2), txPara(`${unit.name} Inspection Report for MCP`, { sz: 14, color: 'FFFFFF', align: 'ctr' })),
    txBox(MARGIN, y0 + cm(3.5), INNER_W, cm(2.8),
      txPara(`Made for : ${report.customerName}`, { sz: 10, color: 'FFFFFF' }) +
      txPara('By : Tomas Tech Co., Ltd.', { sz: 10, color: 'FFFFFF' }) +
      txPara(`Version : ${report.version}`, { sz: 10, color: 'FFFFFF' })
    ),
    txBox(MARGIN, H - cm(3.5), INNER_W, cm(1),
      txPara('Confidential', { sz: 8, color: 'FFFFFF', align: 'ctr' })),
    txBox(MARGIN, H - cm(2.5), INNER_W, cm(1.5),
      txPara('No.1 MD Tower16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd, Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.  Tel: +66-98-271-9741  E-mail: info@tomastc.com',
        { sz: 7, color: 'FFFFFF', align: 'ctr' })),
    txBox(W - MARGIN - cm(1.5), H - cm(1.5), cm(1.5), cm(0.8),
      txPara(String(pageNum), { sz: 9, color: 'FFFFFF', align: 'r' })),
  ];
  return slide(shapes);
}

function projectInfoSlide(report: InspectionReport, unit: InspectionUnit, pageNum: number): string {
  const colW = [cm(4.5), cm(9)];
  const row = (label: string, val: string, bg?: string): RowDef => ({
    cells: [
      { text: label, bold: true, bg: bg ?? GRAY_BG },
      { text: val, bg: bg },
    ],
    h: cm(0.7),
  });
  const rankRows: RowDef[] = [
    { cells: [{ text: 'Rank', bold: true, bg: DARK_BLUE }, { text: 'Description', bold: true, bg: DARK_BLUE }], h: cm(0.65) },
    { cells: [{ text: 'A', bold: true }, { text: 'Can use / Need to detail check or more information.' }] },
    { cells: [{ text: 'B', bold: true }, { text: 'Still can use, but need to buy some of spare parts.' }] },
    { cells: [{ text: 'C', bold: true }, { text: 'Need to repair / Replace within 6 months.' }] },
    { cells: [{ text: 'D', bold: true, bg: 'FFCCCC' }, { text: 'NG / Must repair ASAP.', bg: 'FFCCCC' }] },
  ];
  const infoRows: RowDef[] = [
    row('Customer', report.customerName),
    row('Contact Person', report.contactPerson),
    row('Department', report.department),
    row('Tel. / Fax', report.tel),
    row('Project Name', report.projectName),
    row('Project No.', report.projectNo),
    row('HMI Model', unit.hmiModel),
    row('Communication', unit.communication),
    row('PLC Model', unit.plcModel),
    row('Power Supply', `${unit.powerPhase} / ${unit.voltage} V`),
    row('Main Breaker', `${unit.mainBreakerAmp} A.`),
    row('Main Breaker Model', unit.mainBreakerModel),
    row('Control Panel Name', unit.controlPanelName),
    row('Location', unit.location),
  ];
  let y = MARGIN + HEADER_H + cm(0.3);
  const shapes: string[] = [
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    tbl(MARGIN, y, colW, infoRows),
  ];
  y += infoRows.reduce((a, r) => a + (r.h ?? cm(0.65)), 0) + cm(0.4);
  shapes.push(tbl(MARGIN, y, [cm(2), cm(11.5)], rankRows));
  return slide(shapes);
}

function powerSlide(unit: InspectionUnit, pageNum: number): string {
  const u = unit.utility;
  // Column widths: label, RS, RT, ST, judgement-ok, judgement-ng, A, B, C, D, remarks
  const colW = [cm(1.8), cm(1.3), cm(1.3), cm(1.3), cm(1), cm(1), cm(0.8), cm(0.8), cm(0.8), cm(0.8), cm(3)];
  const hdr: CellDef[] = [
    { text: 'Utility Power Supply', bold: true, bg: DARK_BLUE, span: 11 },
  ];
  const subhdr: CellDef[] = [
    { text: '', bg: LIGHT_BLUE },
    { text: 'R-S (V)', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'R-T (V)', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'S-T (V)', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'Status / Remarks', bold: true, bg: LIGHT_BLUE },
  ];
  const specRow: CellDef[] = [
    { text: 'Spec.', bold: true, bg: GRAY_BG },
    { text: u.specRS, align: 'ctr' }, { text: u.specRT, align: 'ctr' }, { text: u.specST, align: 'ctr' },
    { text: 'OK', align: 'ctr' }, { text: 'NG', align: 'ctr' },
    { text: 'A', align: 'ctr' }, { text: 'B', align: 'ctr' }, { text: 'C', align: 'ctr' }, { text: 'D', align: 'ctr' },
    { text: '' },
  ];
  const actualRow: CellDef[] = [
    { text: 'Actual', bold: true, bg: GRAY_BG },
    { text: u.actualRS, align: 'ctr' }, { text: u.actualRT, align: 'ctr' }, { text: u.actualST, align: 'ctr' },
    { text: u.judgement === 'OK' ? '✓' : '', align: 'ctr' },
    { text: u.judgement === 'NG' ? '✓' : '', align: 'ctr' },
    { text: u.rank === 'A' ? '✓' : '', align: 'ctr' },
    { text: u.rank === 'B' ? '✓' : '', align: 'ctr' },
    { text: u.rank === 'C' ? '✓' : '', align: 'ctr' },
    { text: u.rank === 'D' ? '✓' : '', align: 'ctr' },
    { text: u.remarks },
  ];

  // PLC status mini-table
  const plcColW = [cm(4), cm(1), cm(1), cm(0.8), cm(0.8), cm(0.8), cm(0.8), cm(4)];
  const plcRows: RowDef[] = [
    { cells: [{ text: 'PLC Status', bold: true, bg: DARK_BLUE, span: 8 }] },
    { cells: [
      { text: '', bg: LIGHT_BLUE },
      { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'Remarks', bold: true, bg: LIGHT_BLUE },
    ]},
    { cells: [
      { text: 'Status', bold: true, bg: GRAY_BG },
      { text: unit.plcStatus === 'OK' ? '✓' : '', align: 'ctr' },
      { text: unit.plcStatus === 'NG' ? '✓' : '', align: 'ctr' },
      { text: unit.plcRank === 'A' ? '✓' : '', align: 'ctr' },
      { text: unit.plcRank === 'B' ? '✓' : '', align: 'ctr' },
      { text: unit.plcRank === 'C' ? '✓' : '', align: 'ctr' },
      { text: unit.plcRank === 'D' ? '✓' : '', align: 'ctr' },
      { text: unit.plcRemarks },
    ]},
  ];

  // Transformer table
  const xfColW = [cm(2.2), cm(1.3), cm(1.3), cm(1), cm(1), cm(0.8), cm(0.8), cm(0.8), cm(0.8), cm(3)];
  function xfRows(m: TransformerMeasurement, title: string): RowDef[] {
    return [
      { cells: [{ text: `${title} : ${m.model}`, bold: true, bg: DARK_BLUE, span: 10 }] },
      { cells: [
        { text: '', bg: LIGHT_BLUE }, { text: 'V', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'Remarks', bold: true, bg: LIGHT_BLUE },
      ]},
      { cells: [
        { text: 'Primary', bold: true, bg: GRAY_BG }, { text: m.primaryV, align: 'ctr' },
        { text: m.primaryA || 'Spec.', align: 'ctr' },
        { text: 'OK', align: 'ctr' }, { text: 'NG', align: 'ctr' },
        { text: 'A', align: 'ctr' }, { text: 'B', align: 'ctr' }, { text: 'C', align: 'ctr' }, { text: 'D', align: 'ctr' },
        { text: '' },
      ]},
      { cells: [
        { text: 'Actual', bold: true, bg: GRAY_BG }, { text: m.primaryV, align: 'ctr' },
        { text: m.primaryA, align: 'ctr' },
        { text: m.primaryJudgement === 'OK' ? '✓' : '', align: 'ctr' },
        { text: m.primaryJudgement === 'NG' ? '✓' : '', align: 'ctr' },
        { text: m.primaryRank === 'A' ? '✓' : '', align: 'ctr' },
        { text: m.primaryRank === 'B' ? '✓' : '', align: 'ctr' },
        { text: m.primaryRank === 'C' ? '✓' : '', align: 'ctr' },
        { text: m.primaryRank === 'D' ? '✓' : '', align: 'ctr' },
        { text: m.primaryRemarks },
      ]},
      { cells: [
        { text: 'Secondary', bold: true, bg: GRAY_BG }, { text: m.secondaryV, align: 'ctr' },
        { text: '', align: 'ctr' },
        { text: 'OK', align: 'ctr' }, { text: 'NG', align: 'ctr' },
        { text: 'A', align: 'ctr' }, { text: 'B', align: 'ctr' }, { text: 'C', align: 'ctr' }, { text: 'D', align: 'ctr' },
        { text: '' },
      ]},
      { cells: [
        { text: 'Actual', bold: true, bg: GRAY_BG }, { text: m.secondaryV, align: 'ctr' },
        { text: m.secondaryA, align: 'ctr' },
        { text: m.secondaryJudgement === 'OK' ? '✓' : '', align: 'ctr' },
        { text: m.secondaryJudgement === 'NG' ? '✓' : '', align: 'ctr' },
        { text: m.secondaryRank === 'A' ? '✓' : '', align: 'ctr' },
        { text: m.secondaryRank === 'B' ? '✓' : '', align: 'ctr' },
        { text: m.secondaryRank === 'C' ? '✓' : '', align: 'ctr' },
        { text: m.secondaryRank === 'D' ? '✓' : '', align: 'ctr' },
        { text: m.secondaryRemarks },
      ]},
    ];
  }

  let y = MARGIN + HEADER_H + cm(0.3);
  const shapes: string[] = [...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum)];
  shapes.push(tbl(MARGIN, y, colW, [
    { cells: hdr, h: cm(0.65) },
    { cells: subhdr, h: cm(0.65) },
    { cells: specRow },
    { cells: actualRow },
  ]));
  y += cm(0.65) * 4 + cm(0.4);
  shapes.push(tbl(MARGIN, y, plcColW, plcRows));
  y += cm(0.65) * 3 + cm(0.4);
  for (const sec of unit.powerSections) {
    shapes.push(tbl(MARGIN, y, xfColW, xfRows(sec, sec.title)));
    y += cm(0.65) * 6 + cm(0.4);
  }
  return slide(shapes);
}

function operationSlide(unit: InspectionUnit, pageNum: number, tests: OperationTest[]): string {
  const colW = [cm(7.5), cm(1.2), cm(0.8), cm(0.8), cm(0.8), cm(0.8), cm(2.6)];
  const hdrRow: RowDef = { cells: [
    { text: 'Test Name', bold: true, bg: DARK_BLUE },
    { text: 'Judgement', bold: true, bg: DARK_BLUE, span: 2, align: 'ctr' },
    { text: 'Rank', bold: true, bg: DARK_BLUE, span: 4, align: 'ctr' },
    { text: 'Remarks', bold: true, bg: DARK_BLUE },
  ], h: cm(0.7) };
  const subHdr: RowDef = { cells: [
    { text: '', bg: LIGHT_BLUE },
    { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
    { text: '', bg: LIGHT_BLUE },
  ], h: cm(0.65) };
  const dataRows: RowDef[] = tests.map(t => ({
    cells: [
      { text: t.name },
      { text: t.status === 'OK' ? '✓' : '', align: 'ctr' },
      { text: t.status === 'NG' ? '✓' : '', align: 'ctr' },
      { text: t.rank === 'A' ? '✓' : '', align: 'ctr' },
      { text: t.rank === 'B' ? '✓' : '', align: 'ctr' },
      { text: t.rank === 'C' ? '✓' : '', align: 'ctr' },
      { text: t.rank === 'D' ? '✓' : '', align: 'ctr' },
      { text: t.remarks },
    ],
    h: cm(0.9),
  }));
  const y = MARGIN + HEADER_H + cm(0.3);
  return slide([
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    tbl(MARGIN, y, colW, [hdrRow, subHdr, ...dataRows]),
  ]);
}

function electricalSlide(unit: InspectionUnit, pageNum: number, items: ElectricalItem[]): string {
  const colW = [cm(5.5), cm(1.3), cm(1.3), cm(1), cm(1), cm(0.8), cm(0.8), cm(0.8), cm(0.8), cm(3)];
  const hdrRow: RowDef = { cells: [
    { text: 'Component', bold: true, bg: DARK_BLUE },
    { text: 'Normal', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'Abnormal', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'OK', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'NG', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'A', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'B', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'C', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'D', bold: true, bg: DARK_BLUE, align: 'ctr' },
    { text: 'Remarks', bold: true, bg: DARK_BLUE },
  ], h: cm(0.7) };
  const dataRows: RowDef[] = items.map(item => ({
    cells: [
      { text: item.name },
      { text: item.condition === 'Normal' ? '✓' : '', align: 'ctr' },
      { text: item.condition === 'Abnormal' ? '✓' : '', align: 'ctr' },
      { text: item.judgement === 'OK' ? '✓' : '', align: 'ctr' },
      { text: item.judgement === 'NG' ? '✓' : '', align: 'ctr' },
      { text: item.rank === 'A' ? '✓' : '', align: 'ctr' },
      { text: item.rank === 'B' ? '✓' : '', align: 'ctr' },
      { text: item.rank === 'C' ? '✓' : '', align: 'ctr' },
      { text: item.rank === 'D' ? '✓' : '', align: 'ctr' },
      { text: item.remarks },
    ],
    h: cm(0.85),
  }));
  const y = MARGIN + HEADER_H + cm(0.3);
  return slide([
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    tbl(MARGIN, y, colW, [hdrRow, ...dataRows]),
  ]);
}

function summarySlide(unit: InspectionUnit, pageNum: number): string {
  const items = unit.summaryItems.filter(s => s.trim());
  const content = items.length
    ? items.map((s, i) => txPara(`${i + 1}. ${s}`, { sz: 9 })).join('')
    : txPara('No summary items.', { sz: 9, color: '888888' });
  const y = MARGIN + HEADER_H + cm(0.3);
  return slide([
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    txBox(MARGIN, y, INNER_W, cm(0.8), txPara('SUMMARY', { bold: true, sz: 13, color: DARK_BLUE })),
    txBox(MARGIN, y + cm(1), INNER_W, H - y - MARGIN - cm(1.5), content),
  ]);
}

function signOffSlide(report: InspectionReport, pageNum: number): string {
  const y = MARGIN + HEADER_H + cm(0.3);
  const colW = [cm(6.5), cm(7)];
  const sigRows = (name: string, title: string, date: string): RowDef[] => [
    { cells: [{ text: 'Sign :', bold: true, bg: GRAY_BG }, { text: '' }], h: cm(1.5) },
    { cells: [{ text: 'Name :', bold: true, bg: GRAY_BG }, { text: name }] },
    { cells: [{ text: 'Title :', bold: true, bg: GRAY_BG }, { text: title }] },
    { cells: [{ text: 'Date :', bold: true, bg: GRAY_BG }, { text: date }] },
  ];
  const intro = 'With all these documents, this is part of the installation report and it is all the information of the project.';
  const shapes: string[] = [
    ...pageHeader('Sign Off', pageNum),
    txBox(MARGIN, y, INNER_W, cm(1.2), txPara(intro, { sz: 9 })),
    txBox(MARGIN, y + cm(1.4), INNER_W, cm(0.7), txPara(`${report.customerName}`, { bold: true, sz: 10, color: DARK_BLUE })),
    tbl(MARGIN, y + cm(2.2), colW, sigRows(report.customerSignName, report.customerTitle, report.customerDate)),
    txBox(MARGIN, y + cm(6), INNER_W, cm(0.7), txPara('TOMAS TECH CO., LTD.', { bold: true, sz: 10, color: DARK_BLUE })),
    tbl(MARGIN, y + cm(6.8), colW,
      sigRows(report.inspectorName, report.inspectorTitle, report.inspectorDate)),
    tbl(MARGIN, y + cm(11), colW,
      sigRows(report.checkerName, report.checkerTitle, report.checkerDate)),
    txBox(MARGIN, H - cm(2), INNER_W, cm(0.8),
      txPara('## END OF BLUEPRINT ##', { bold: true, sz: 10, color: DARK_BLUE, align: 'ctr' })),
    txBox(W - MARGIN - cm(1.5), H - cm(1.5), cm(1.5), cm(0.8),
      txPara(String(pageNum), { sz: 9, color: '555555', align: 'r' })),
  ];
  return slide(shapes);
}

// ── PPTX ZIP assembly ─────────────────────────────────────────
export function generatePptx(report: InspectionReport): Uint8Array {
  const slides: string[] = [];
  let pageNum = 1;

  for (const unit of report.units) {
    slides.push(coverSlide(report, unit, pageNum++));
    slides.push(projectInfoSlide(report, unit, pageNum++));
    slides.push(powerSlide(unit, pageNum++));
    slides.push(operationSlide(unit, pageNum++, unit.operationTests));
    slides.push(electricalSlide(unit, pageNum++, unit.electricalItems));
    slides.push(summarySlide(unit, pageNum++));
    slides.push(signOffSlide(report, pageNum++));
  }

  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {};

  const slideOverrides = slides.map((_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n  ');

  files['[Content_Types].xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="${LOGO_EXT}" ContentType="image/${(LOGO_EXT as string) === 'jpg' ? 'jpeg' : LOGO_EXT}"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`);

  files['_rels/.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const slideRefs = slides.map((_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`
  ).join('');
  files['ppt/presentation.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NSP} ${NSA} ${NSR} saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideRefs}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}"/>
  <p:notesSz cx="${W}" cy="${H}"/>
</p:presentation>`);

  const slideRelEntries = slides.map((_, i) =>
    `<Relationship Id="rId${i + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('\n  ');
  files['ppt/_rels/presentation.xml.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
  ${slideRelEntries}
</Relationships>`);

  files['ppt/theme/theme1.xml'] = enc(THEME_XML);

  files['ppt/slideMasters/slideMaster1.xml'] = enc(SLIDE_MASTER_XML);

  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${LOGO_EXT}"/>
</Relationships>`);

  files['ppt/slideLayouts/slideLayout1.xml'] = enc(SLIDE_LAYOUT_BLANK_XML);

  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

  // Embed Tomas Tech logo PNG (decoded from base64 constant in inspection-report-template.ts)
  const logoBytes = Uint8Array.from(atob(LOGO_BASE64), (c) => c.charCodeAt(0));
  files[`ppt/media/logo.${LOGO_EXT}`] = logoBytes;

  const slideRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`;

  slides.forEach((xml, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = enc(xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = enc(slideRel);
  });

  return zipSync(files, { level: 6 });
}

