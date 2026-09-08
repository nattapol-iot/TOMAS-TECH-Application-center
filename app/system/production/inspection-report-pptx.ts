import { zipSync } from "fflate";
import {
  THEME_XML,
  SLIDE_MASTER_XML,
  SLIDE_LAYOUT_BLANK_XML,
  LOGO_BASE64,
  LOGO_EXT,
} from "./inspection-report-template";

// ── Types ──────────────────────────────────────────────────────
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
  photos?: string[];
};

export type ElectricalItem = {
  name: string; condition: NormalAbnormal; judgement: PassFail; rank: Rank; remarks: string;
  photos?: string[];
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
const W = 7560000;
const H = 10692000;
const MARGIN = 406400;  // ~1.13 cm — matches original
const INNER_W = 6747200; // 406400 to 7153600
const HEADER_H = 263447;
const DARK_BLUE = "1B3A6B";
const LIGHT_BLUE = "D6E4F7";
const GRAY_BG = "F2F2F2";
const BLACK = "000000";

function cm(c: number) { return Math.round(c * 360000); }
function pt(p: number) { return Math.round(p * 12700); }
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function solidFill(hex: string): string {
  return `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
}

// Shape ID counter — reset per slide
let _spId = 2;
function nextId() { return _spId++; }
function resetIds() { _spId = 2; }

// Yu Gothic run — matches Tomas Tech original font
function txRun(text: string, opts: { bold?: boolean; sz?: number; color?: string } = {}): string {
  const bold = opts.bold ? 'b="1"' : '';
  const sz = opts.sz ? `sz="${opts.sz * 100}"` : 'sz="800"';
  const fill = opts.color ? `<a:solidFill><a:srgbClr val="${opts.color}"/></a:solidFill>` : '';
  const font = `<a:latin typeface="Yu Gothic" panose="020B0400000000000000" pitchFamily="34" charset="-128"/>` +
               `<a:ea typeface="Yu Gothic" panose="020B0400000000000000" pitchFamily="34" charset="-128"/>`;
  return `<a:r><a:rPr kumimoji="1" lang="en-US" altLang="ja-JP" ${bold} ${sz} dirty="0">${font}${fill}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function txPara(text: string, opts: { bold?: boolean; sz?: number; color?: string; align?: string } = {}): string {
  const align = opts.align ? `algn="${opts.align}"` : '';
  return `<a:p><a:pPr ${align}/>${txRun(text, opts)}</a:p>`;
}

function txBox(x: number, y: number, w: number, h: number, content: string, bgColor?: string, borderColor?: string): string {
  const fill = bgColor ? solidFill(bgColor) : '<a:noFill/>';
  const border = borderColor
    ? `<a:ln w="${pt(0.75)}"><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${nextId()}" name="sp"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${border}
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="${cm(0.1)}" rIns="${cm(0.1)}" tIns="${cm(0.05)}" bIns="${cm(0.05)}" anchor="ctr"><a:normAutofit/></a:bodyPr>
    <a:lstStyle/>
    ${content}
  </p:txBody>
</p:sp>`;
}

function bgRect(x: number, y: number, w: number, h: number, color: string, borderColor?: string): string {
  const border = borderColor
    ? `<a:ln w="${pt(0.75)}"><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${nextId()}" name="bg"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${solidFill(color)}${border}
  </p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
</p:sp>`;
}

function noFillRect(x: number, y: number, w: number, h: number, borderColor: string): string {
  return `<p:sp>
  <p:nvSpPr><p:cNvPr id="${nextId()}" name="border"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
    <a:ln w="${pt(0.75)}"><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln>
  </p:spPr>
  <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
</p:sp>`;
}

// ── Table builder ──────────────────────────────────────────────
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
      const isDark = cell.bg ? parseInt(cell.bg, 16) < 0x888888 * 2 : false;
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
  <p:nvGraphicFramePr><p:cNvPr id="${nextId()}" name="tbl"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>
  <p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${totalW}" cy="${totalH}"/></p:xfrm>
  <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">
    <a:tbl><a:tblPr/><a:tblGrid>${gridCols}</a:tblGrid>${tblRows.join('')}</a:tbl>
  </a:graphicData></a:graphic>
</p:graphicFrame>`;
}

// ── Image shape ────────────────────────────────────────────────
function imgShape(x: number, y: number, w: number, h: number, rId: string): string {
  return `<p:pic>
  <p:nvPicPr>
    <p:cNvPr id="${nextId()}" name="img"/>
    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>
    <p:nvPr/>
  </p:nvPicPr>
  <p:blipFill>
    <a:blip r:embed="${rId}"/>
    <a:stretch><a:fillRect/></a:stretch>
  </p:blipFill>
  <p:spPr>
    <a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
  </p:spPr>
</p:pic>`;
}

// ── Slide XML wrapper ──────────────────────────────────────────
const NSP = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NSA = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NSR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function slide(shapes: string[], extraRels?: string): { xml: string; rels: string } {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NSP} ${NSA} ${NSR}>
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    ${shapes.join('\n')}
  </p:spTree></p:cSld>
</p:sld>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${extraRels ?? ''}
</Relationships>`;
  return { xml, rels };
}

// ── Header bar (original: noFill rect with black border) ──────
function pageHeader(title: string, pageNum: number): string[] {
  // Header box: x=406400 y=479503 cx=6117063 cy=263447 (from original)
  const hx = 406400, hy = 479503, hw = 6117063, hh = 263447;
  return [
    noFillRect(hx, hy, hw, hh, BLACK),
    txBox(hx + cm(0.2), hy, hw - cm(2.5), hh,
      txPara(title, { bold: true, sz: 9, color: BLACK })),
    txBox(hx + hw - cm(2.3), hy, cm(2.3), hh,
      txPara(String(pageNum), { sz: 9, color: BLACK, align: 'r' })),
  ];
}

// ── Cover slide (Slide 1) ──────────────────────────────────────
function coverSlide(report: InspectionReport, unit: InspectionUnit, pageNum: number, logoRId: string): { xml: string; rels: string } {
  resetIds();
  // Original coords from XML extraction
  const shapes: string[] = [
    // Version box top-left: x=406400 y=479502 cx=1555750 cy=283687, red border
    noFillRect(406400, 479502, 1555750, 283687, 'FF0000'),
    txBox(406400, 479502, 1555750, 283687,
      txPara(`Ver.${report.version}`, { sz: 8, color: 'FF0000', bold: true }), undefined, 'FF0000'),

    // Confidential box top-right: x=5262563 y=479502 cx=1123950 cy=283687
    noFillRect(5262563, 479502, 1123950, 283687, BLACK),
    txBox(5262563, 479502, 1123950, 283687,
      txPara('Confidential', { sz: 8, color: BLACK })),

    // Title area (right-aligned): x=724584 y=4624787 cx=5301516 cy=1200329
    txBox(724584, 4624787, 5301516, 1200329,
      txPara(report.title || 'MACHINE INSPECTION', { bold: true, sz: 28, color: BLACK, align: 'r' }) +
      txPara(`${unit.name}`, { bold: true, sz: 20, color: DARK_BLUE, align: 'r' }),
      undefined, undefined),

    // Project + customer info
    txBox(MARGIN, 6100000, INNER_W, cm(2),
      txPara(`Project : ${report.projectName}  [${report.projectNo}]`, { sz: 9, color: BLACK }) +
      txPara(`Customer : ${report.customerName}`, { sz: 9, color: BLACK }) +
      txPara(`Date : ${report.reportDate}`, { sz: 9, color: BLACK })
    ),

    // Logo: x=1917699 y=7636804 cx=3022600 cy=720006
    imgShape(1917699, 7636804, 3022600, 720006, logoRId),

    // Address footer
    txBox(MARGIN, 8500000, INNER_W, cm(1.5),
      txPara('No.1 MD Tower 16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd, Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.', { sz: 7, color: BLACK, align: 'ctr' }) +
      txPara('Tel: +66-98-271-9741  E-mail: info@tomastc.com', { sz: 7, color: BLACK, align: 'ctr' })
    ),

    // Page number
    txBox(W - MARGIN - cm(1.5), H - cm(1.5), cm(1.5), cm(0.8),
      txPara(String(pageNum), { sz: 9, color: BLACK, align: 'r' })),
  ];

  const extraRels = `\n  <Relationship Id="${logoRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${LOGO_EXT}"/>`;
  return slide(shapes, extraRels);
}

// ── Project Info slide (Slide 2) ───────────────────────────────
function projectInfoSlide(report: InspectionReport, unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();
  const colW = [cm(4.5), cm(9)];
  const row = (label: string, val: string): RowDef => ({
    cells: [
      { text: label, bold: true, bg: GRAY_BG },
      { text: val },
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
    row('Report Date', report.reportDate),
    row('HMI Model', unit.hmiModel),
    row('Communication', unit.communication),
    row('PLC Model', unit.plcModel),
    row('Power Supply', `${unit.powerPhase} / ${unit.voltage} V`),
    row('Main Breaker', `${unit.mainBreakerAmp} A.`),
    row('Main Breaker Model', unit.mainBreakerModel),
    row('Control Panel Name', unit.controlPanelName),
    row('Location', unit.location),
  ];
  let y = 479503 + HEADER_H + cm(0.3);
  const shapes: string[] = [
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    tbl(MARGIN, y, colW, infoRows),
  ];
  y += infoRows.reduce((a, r) => a + (r.h ?? cm(0.65)), 0) + cm(0.4);
  shapes.push(tbl(MARGIN, y, [cm(2), cm(11.5)], rankRows));
  return slide(shapes);
}

// ── Power slide (Slide 3) ──────────────────────────────────────
function powerSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();
  const u = unit.utility;
  const colW = [cm(1.8), cm(1.3), cm(1.3), cm(1.3), cm(1), cm(1), cm(0.8), cm(0.8), cm(0.8), cm(0.8), cm(3)];
  const hdr: CellDef[] = [{ text: 'Utility Power Supply', bold: true, bg: DARK_BLUE, span: 11 }];
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
        { text: 'Spec.', align: 'ctr' },
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
        { text: 'Spec.', align: 'ctr' },
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

  let y = 479503 + HEADER_H + cm(0.3);
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

// ── Operation Test table slide ─────────────────────────────────
function operationTableSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();
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
  const dataRows: RowDef[] = unit.operationTests.map(t => ({
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
  const y = 479503 + HEADER_H + cm(0.3);
  return slide([
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    tbl(MARGIN, y, colW, [hdrRow, subHdr, ...dataRows]),
  ]);
}

// ── Operation Photo slide (2 photos per slide) ─────────────────
// Photo positions from original: top=(0.5"≈457200, 1.121"≈1021564) size=(6.5"≈5943600, 4.127"≈3763908)
//                               bottom=(0.539"≈491242, 5.718"≈5214768) same size
function operationPhotoSlide(
  pageNum: number,
  test1: OperationTest | undefined,
  test2: OperationTest | undefined,
  photoRels: Array<{ rId: string; mediaName: string }>,
): { xml: string; rels: string } {
  resetIds();
  const PH = 3763908; // photo height EMU
  const PW = 5943600; // photo width EMU
  const PX = 457200;  // photo left
  const PY1 = 1021564; // top photo top
  const PY2 = 5214768; // bottom photo top
  const LH = cm(0.7);  // label height

  const shapes: string[] = [...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum)];

  let relIdx = 0;
  function addPhoto(test: OperationTest | undefined, px: number, py: number) {
    const labelY = py - LH - cm(0.1);
    shapes.push(txBox(px, labelY, PW, LH,
      txPara(test?.name ?? '', { bold: true, sz: 9, color: BLACK })));

    if (test?.photos?.[0] && relIdx < photoRels.length) {
      shapes.push(imgShape(px, py, PW, PH, photoRels[relIdx].rId));
      relIdx++;
    } else {
      // placeholder rect
      shapes.push(noFillRect(px, py, PW, PH, '888888'));
      shapes.push(txBox(px, py + PH / 2 - cm(0.5), PW, cm(1),
        txPara('[ No Photo ]', { sz: 9, color: '888888', align: 'ctr' })));
    }
  }

  addPhoto(test1, PX, PY1);
  addPhoto(test2, PX, PY2);

  let extraRels = '';
  for (const rel of photoRels) {
    extraRels += `\n  <Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${rel.mediaName}"/>`;
  }
  return slide(shapes, extraRels);
}

// ── Electrical Test table slide ────────────────────────────────
function electricalTableSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();
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
  const dataRows: RowDef[] = unit.electricalItems.map(item => ({
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
  const y = 479503 + HEADER_H + cm(0.3);
  return slide([
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    tbl(MARGIN, y, colW, [hdrRow, ...dataRows]),
  ]);
}

// ── Electrical Photo slide (2×2 grid, 4 photos per slide) ─────
function electricalPhotoSlide(
  pageNum: number,
  items: ElectricalItem[],
  photoRels: Array<{ rId: string; mediaName: string }>,
): { xml: string; rels: string } {
  resetIds();
  // 2-column, 2-row grid layout
  const colGap = cm(0.2);
  const rowGap = cm(0.3);
  const PW = Math.floor((INNER_W - colGap) / 2);
  const PH = Math.floor((H - 479503 - HEADER_H - cm(1.5) - rowGap) / 2 - cm(0.8));
  const col0x = MARGIN;
  const col1x = MARGIN + PW + colGap;
  const row0y = 479503 + HEADER_H + cm(0.9);
  const row1y = row0y + PH + cm(0.8) + rowGap;
  const LH = cm(0.7);

  const positions = [
    { x: col0x, y: row0y },
    { x: col1x, y: row0y },
    { x: col0x, y: row1y },
    { x: col1x, y: row1y },
  ];

  const shapes: string[] = [...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum)];

  let relIdx = 0;
  for (let i = 0; i < 4; i++) {
    const item = items[i];
    const pos = positions[i];
    shapes.push(txBox(pos.x, pos.y - LH - cm(0.05), PW, LH,
      txPara(item?.name ?? '', { bold: true, sz: 8, color: BLACK })));

    if (item?.photos?.[0] && relIdx < photoRels.length) {
      shapes.push(imgShape(pos.x, pos.y, PW, PH, photoRels[relIdx].rId));
      relIdx++;
    } else {
      shapes.push(noFillRect(pos.x, pos.y, PW, PH, '888888'));
      shapes.push(txBox(pos.x, pos.y + PH / 2 - cm(0.5), PW, cm(1),
        txPara('[ No Photo ]', { sz: 8, color: '888888', align: 'ctr' })));
    }
  }

  let extraRels = '';
  for (const rel of photoRels) {
    extraRels += `\n  <Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${rel.mediaName}"/>`;
  }
  return slide(shapes, extraRels);
}

// ── Summary slide ──────────────────────────────────────────────
function summarySlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();
  const items = unit.summaryItems.filter(s => s.trim());
  const content = items.length
    ? items.map((s, i) => txPara(`${i + 1}. ${s}`, { sz: 9 })).join('')
    : txPara('No summary items.', { sz: 9, color: '888888' });
  const y = 479503 + HEADER_H + cm(0.3);
  return slide([
    ...pageHeader('MACHINE INSPECTION CHECK LIST', pageNum),
    txBox(MARGIN, y, INNER_W, cm(0.8), txPara('SUMMARY', { bold: true, sz: 13, color: DARK_BLUE })),
    txBox(MARGIN, y + cm(1), INNER_W, H - y - MARGIN - cm(1.5), content),
  ]);
}

// ── Sign-Off slide ─────────────────────────────────────────────
function signOffSlide(report: InspectionReport, pageNum: number): { xml: string; rels: string } {
  resetIds();
  // Sign-off header height is taller: cy=345687
  const hx = 406400, hy = 479503, hw = 6117063, hh = 345687;
  const headerShapes = [
    noFillRect(hx, hy, hw, hh, BLACK),
    txBox(hx + cm(0.2), hy, hw - cm(2.5), hh,
      txPara('Sign Off', { bold: true, sz: 9, color: BLACK })),
    txBox(hx + hw - cm(2.3), hy, cm(2.3), hh,
      txPara(String(pageNum), { sz: 9, color: BLACK, align: 'r' })),
  ];

  const intro = 'With all these documents, this is part of the installation report and it is all the information of the project.';
  const colW = [cm(6.5), cm(7)];
  const sigRows = (name: string, title: string, date: string): RowDef[] => [
    { cells: [{ text: 'Sign :', bold: true, bg: GRAY_BG }, { text: '' }], h: cm(1.5) },
    { cells: [{ text: 'Name :', bold: true, bg: GRAY_BG }, { text: name }] },
    { cells: [{ text: 'Title :', bold: true, bg: GRAY_BG }, { text: title }] },
    { cells: [{ text: 'Date :', bold: true, bg: GRAY_BG }, { text: date }] },
  ];

  // Sign-off positions from original XML
  // customer name: x=406400 y=2801387
  // inspector block: x=370130 y=4630372
  // checker block: x=3383154 y=4803700
  // end text: x=471550 y=9048866
  const y = hy + hh + cm(0.3);
  const shapes: string[] = [
    ...headerShapes,
    txBox(MARGIN, y, INNER_W, cm(1.2), txPara(intro, { sz: 9 })),
    txBox(406400, 2801387, INNER_W, cm(0.7),
      txPara(report.customerName, { bold: true, sz: 10, color: DARK_BLUE })),
    tbl(MARGIN, 2801387 + cm(0.8), colW, sigRows(report.customerSignName, report.customerTitle, report.customerDate)),
    txBox(MARGIN, 4500000, INNER_W, cm(0.7),
      txPara('TOMAS TECH CO., LTD.', { bold: true, sz: 10, color: DARK_BLUE })),
    tbl(370130, 4630372, colW, sigRows(report.inspectorName, report.inspectorTitle, report.inspectorDate)),
    tbl(3383154, 4803700, colW, sigRows(report.checkerName, report.checkerTitle, report.checkerDate)),
    txBox(471550, 9048866, INNER_W - 65150, cm(0.8),
      txPara('## END OF BLUEPRINT ##', { bold: true, sz: 10, color: DARK_BLUE, align: 'ctr' })),
  ];
  return slide(shapes);
}

// ── Photo data extraction helpers ──────────────────────────────
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const b64 = dataUrl.slice(comma + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function mimeExt(dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/(\w+);/);
  return m ? m[1].replace('jpeg', 'jpg') : 'jpg';
}

// ── PPTX ZIP assembly ─────────────────────────────────────────
export function generatePptx(report: InspectionReport): Uint8Array {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {};

  // Collect all slides as {xml, rels} pairs
  const slideData: Array<{ xml: string; rels: string }> = [];

  // Embed logo
  const logoRId = 'rId2';
  const logoBytes = Uint8Array.from(atob(LOGO_BASE64), (c) => c.charCodeAt(0));
  files[`ppt/media/logo.${LOGO_EXT}`] = logoBytes;

  // Photo counter for unique media names
  let photoCounter = 0;

  for (const unit of report.units) {
    // Slide 1: Cover
    slideData.push(coverSlide(report, unit, slideData.length + 1, logoRId));

    // Slide 2: Project Info
    slideData.push(projectInfoSlide(report, unit, slideData.length + 1));

    // Slide 3: Power
    slideData.push(powerSlide(unit, slideData.length + 1));

    // Slide 4: Operation table
    slideData.push(operationTableSlide(unit, slideData.length + 1));

    // Slides 5-7: Operation photo slides (up to 3 slides, 2 photos each)
    const opTests = unit.operationTests;
    const opPhotoSlideCount = 3;
    for (let s = 0; s < opPhotoSlideCount; s++) {
      const t1 = opTests[s * 2];
      const t2 = opTests[s * 2 + 1];
      const photoRels: Array<{ rId: string; mediaName: string }> = [];
      let rIdCounter = 2;

      for (const t of [t1, t2]) {
        if (t?.photos?.[0]) {
          rIdCounter++;
          const ext = mimeExt(t.photos[0]);
          const mediaName = `photo_op_${photoCounter++}.${ext}`;
          const rId = `rId${rIdCounter}`;
          const bytes = dataUrlToBytes(t.photos[0]);
          if (bytes) {
            files[`ppt/media/${mediaName}`] = bytes;
            photoRels.push({ rId, mediaName });
          }
        }
      }
      slideData.push(operationPhotoSlide(slideData.length + 1, t1, t2, photoRels));
    }

    // Slide 8: Electrical table
    slideData.push(electricalTableSlide(unit, slideData.length + 1));

    // Slides 9-10: Electrical photo slides (up to 2 slides, 4 photos each)
    const elItems = unit.electricalItems;
    const elPhotoSlideCount = 2;
    for (let s = 0; s < elPhotoSlideCount; s++) {
      const batch = elItems.slice(s * 4, s * 4 + 4);
      const photoRels: Array<{ rId: string; mediaName: string }> = [];
      let rIdCounter = 2;

      for (const item of batch) {
        if (item?.photos?.[0]) {
          rIdCounter++;
          const ext = mimeExt(item.photos[0]);
          const mediaName = `photo_el_${photoCounter++}.${ext}`;
          const rId = `rId${rIdCounter}`;
          const bytes = dataUrlToBytes(item.photos[0]);
          if (bytes) {
            files[`ppt/media/${mediaName}`] = bytes;
            photoRels.push({ rId, mediaName });
          }
        }
      }
      slideData.push(electricalPhotoSlide(slideData.length + 1, batch, photoRels));
    }

    // Slide 11: Summary
    slideData.push(summarySlide(unit, slideData.length + 1));

    // Slide 12: Sign-off
    slideData.push(signOffSlide(report, slideData.length + 1));
  }

  // Content types
  const photoExts = new Set<string>();
  for (const key of Object.keys(files)) {
    if (key.startsWith('ppt/media/') && !key.endsWith(`.${LOGO_EXT}`)) {
      const ext = key.split('.').pop() ?? 'jpg';
      photoExts.add(ext);
    }
  }
  const photoTypeOverrides = [...photoExts].map(ext =>
    `<Default Extension="${ext}" ContentType="image/${ext === 'jpg' ? 'jpeg' : ext}"/>`
  ).join('\n  ');
  const slideOverrides = slideData.map((_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n  ');

  files['[Content_Types].xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="${LOGO_EXT}" ContentType="image/${(LOGO_EXT as string) === 'jpg' ? 'jpeg' : LOGO_EXT}"/>
  ${photoTypeOverrides}
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

  const slideRefs = slideData.map((_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`
  ).join('');
  files['ppt/presentation.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NSP} ${NSA} ${NSR} saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideRefs}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}"/>
  <p:notesSz cx="${W}" cy="${H}"/>
</p:presentation>`);

  const slideRelEntries = slideData.map((_, i) =>
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

  slideData.forEach(({ xml, rels }, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = enc(xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = enc(rels);
  });

  return zipSync(files, { level: 6 });
}
