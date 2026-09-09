import { zipSync } from "fflate";
import {
  THEME_XML,
  SLIDE_MASTER_XML,
  SLIDE_LAYOUT_BLANK_XML,
  SLIDE_LAYOUTS,
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

// ── Layout constants (A4 Portrait, EMU) ──────────────────────
const W = 6858000;
const H = 9906000;
const MARGIN = 406400;
const DARK_BLUE = "1B3A6B";
const LIGHT_BLUE = "D6E4F7";
const GRAY_BG = "F2F2F2";
const BLACK = "000000";
const BLUE_LABEL = "2C11F7";

function cm(c: number): number { return Math.round(c * 360000); }
function pt(p: number): number { return Math.round(p * 12700); }

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Shape ID counter — reset per slide ───────────────────────
let _spId = 2;
function nextId(): number { return _spId++; }
function resetIds(): void { _spId = 2; }

// ── Yu Gothic font XML ────────────────────────────────────────
function yuFont(): string {
  return `<a:latin typeface="Yu Gothic" panose="020B0400000000000000" pitchFamily="34" charset="-128"/>` +
    `<a:ea typeface="Yu Gothic" panose="020B0400000000000000" pitchFamily="34" charset="-128"/>`;
}

// ── Text run ─────────────────────────────────────────────────
function txRun(text: string, opts: { bold?: boolean; sz?: number; color?: string } = {}): string {
  const b = opts.bold ? ' b="1"' : '';
  const sz = opts.sz ? ` sz="${opts.sz * 100}"` : ' sz="800"';
  const fill = opts.color
    ? `<a:solidFill><a:srgbClr val="${opts.color}"/></a:solidFill>`
    : '';
  return `<a:r><a:rPr kumimoji="1" lang="en-US" altLang="ja-JP"${b}${sz} dirty="0">${yuFont()}${fill}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function txPara(text: string, opts: { bold?: boolean; sz?: number; color?: string; align?: string } = {}): string {
  const algn = opts.align ? ` algn="${opts.align}"` : '';
  return `<a:p><a:pPr${algn}/>${txRun(text, opts)}</a:p>`;
}

// ── Shape helpers ─────────────────────────────────────────────
function spXfrm(x: number, y: number, cx: number, cy: number): string {
  return `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
}

function textBox(
  x: number, y: number, cx: number, cy: number,
  content: string,
  border?: string,
  fill?: string,
  anchor = 'ctr',
): string {
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>';
  const lineXml = border
    ? `<a:ln w="${pt(0.75)}"><a:solidFill><a:srgbClr val="${border}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${nextId()}" name="sp"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
<p:spPr>${spXfrm(x, y, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${lineXml}</p:spPr>
<p:txBody><a:bodyPr wrap="square" lIns="${cm(0.1)}" rIns="${cm(0.1)}" tIns="${cm(0.05)}" bIns="${cm(0.05)}" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${content}</p:txBody>
</p:sp>`;
}

function borderRect(x: number, y: number, cx: number, cy: number, borderColor: string, lineW = pt(0.25)): string {
  return `<p:sp>
<p:nvSpPr><p:cNvPr id="${nextId()}" name="br"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
<p:spPr>${spXfrm(x, y, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
<a:ln w="${lineW}"><a:solidFill><a:srgbClr val="${borderColor}"/></a:solidFill></a:ln></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
</p:sp>`;
}

function imgShape(x: number, y: number, cx: number, cy: number, rId: string): string {
  return `<p:pic>
<p:nvPicPr><p:cNvPr id="${nextId()}" name="img"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>
<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>
<p:spPr>${spXfrm(x, y, cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
</p:pic>`;
}

function photoPlaceholder(x: number, y: number, cx: number, cy: number, label: string): string[] {
  const shapes: string[] = [];
  shapes.push(borderRect(x, y, cx, cy, "CCCCCC"));
  shapes.push(textBox(x, y + Math.floor(cy / 2) - cm(0.4), cx, cm(0.8),
    txPara(label || '[No Photo]', { sz: 9, color: "888888", align: 'ctr' })));
  return shapes;
}

// ── Slide XML wrapper ─────────────────────────────────────────
const NSP = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const NSA = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const NSR = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function makeSlide(shapes: string[], extraRels = ''): { xml: string; rels: string } {
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
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout7.xml"/>${extraRels}
</Relationships>`;

  return { xml, rels };
}

// ── Page header text box (noFill, noLine — matches original) ──
function pageHeaderShapes(title: string, pageNum: number): string[] {
  return [
    // Title text box: noFill noLine, black text
    textBox(406400, 479503, 6117063, 263447,
      txPara(title, { sz: 12, color: BLACK }),
      undefined, undefined, 'ctr'),
    // Slide number
    textBox(6093618, 9181401, 435769, 527403,
      txPara(String(pageNum), { sz: 8, color: BLACK, align: 'r' })),
  ];
}

// ── PPTX Table builder ────────────────────────────────────────
type CellDef = { text: string; bold?: boolean; sz?: number; bg?: string; span?: number; align?: string; color?: string };
type RowDef = { cells: CellDef[]; h?: number };

function buildTable(x: number, y: number, colW: number[], rows: RowDef[]): string {
  const totalW = colW.reduce((a, b) => a + b, 0);
  const gridCols = colW.map(w => `<a:gridCol w="${w}"/>`).join('');

  function cellBorders(): string {
    const b = (pos: string) =>
      `<a:ln${pos} w="${pt(0.5)}"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln${pos}>`;
    return ['L', 'R', 'T', 'B'].map(b).join('');
  }

  const tblRows = rows.map(row => {
    const h = row.h ?? cm(0.65);
    const cells = row.cells.map(cell => {
      const bg = cell.bg ? `<a:solidFill><a:srgbClr val="${cell.bg}"/></a:solidFill>` : '<a:noFill/>';
      // Determine text color: white on dark backgrounds
      let textColor = cell.color ?? '000000';
      if (!cell.color && cell.bg) {
        const v = parseInt(cell.bg, 16);
        if (v < 0x808080 * 2) textColor = 'FFFFFF';
      }
      const span = cell.span ? ` gridSpan="${cell.span}"` : '';
      const content = txPara(cell.text, {
        bold: cell.bold,
        sz: cell.sz ?? 7,
        color: textColor,
        align: cell.align,
      });
      return `<a:tc${span}><a:txBody><a:bodyPr/><a:lstStyle/>${content}</a:txBody><a:tcPr>${cellBorders()}${bg}</a:tcPr></a:tc>`;
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

// ── Photo data helpers ────────────────────────────────────────
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
}

function mimeExt(dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/(\w+);/);
  return m ? m[1].replace('jpeg', 'jpg') : 'jpg';
}

// ══════════════════════════════════════════════════════════════
// SLIDE BUILDERS
// ══════════════════════════════════════════════════════════════

// ── Slide 1: Cover ────────────────────────────────────────────
// Layout matches original PPTX cover: white background, black/red text.
function coverSlide(
  report: InspectionReport,
  unit: InspectionUnit,
  pageNum: number,
  logoRId: string,
): { xml: string; rels: string } {
  resetIds();
  const RED = 'FF0000';

  const shapes: string[] = [
    // Version box (top-left, red border)
    textBox(406400, 479503, 1555750, 283687,
      txPara(`Version : ${report.version}`, { sz: 12, color: RED, align: 'ctr' }),
      RED),

    // Confidential box (top-right, red border)
    textBox(5262563, 479502, 1123950, 283687,
      txPara('Confidential', { sz: 12, color: RED, align: 'ctr' }),
      RED),

    // Decorative corner: thin horizontal rule + vertical black bar (matches original group)
    textBox(406400, 5819385, 5709200, pt(2.25), txPara('', {}), undefined, BLACK),
    textBox(6179800, 3687445, 271800, 2531668, txPara('', {}), undefined, BLACK),

    // Title block: two title lines + blank + Made for + By, all right-aligned in one box
    textBox(724584, 4624787, 5301516, 1200329,
      txPara(report.title || 'Inspection Report', { sz: 13.5, color: BLACK, align: 'r' }) +
      txPara(`${unit.name} Inspection Report for MCP`, { sz: 13.5, color: BLACK, align: 'r' }) +
      txPara('', { sz: 12, color: BLACK, align: 'r' }) +
      txPara(`Made for : ${report.customerName}`, { sz: 12, color: BLACK, align: 'r' }) +
      txPara(`By : Tomas Tech Co., Ltd.`, { sz: 12, color: BLACK, align: 'r' })),

    // Tomas logo
    imgShape(1917699, 7636804, 3022600, 720006, logoRId),

    // Address + contact footer (12pt black, left-aligned)
    textBox(952199, 8356810, 4953600, 646331,
      txPara('No.1 MD Tower16 Fl., Unit C1, Soi Bangna-Trad 25, Debaratna Rd, ', { sz: 12, color: BLACK }) +
      txPara('Khwaeng Bang Na Nuea, Khet Bang Na, Bangkok 10260 Thailand.', { sz: 12, color: BLACK }) +
      txPara('Tel : +66-98-271-9741     E-mail : info@tomastc.com', { sz: 12, color: BLACK })),

    // Page number
    textBox(6087024, 9181401, 498561, 527403,
      txPara(String(pageNum), { sz: 8, color: BLACK, align: 'r' })),
  ];

  const extraRels = `\n<Relationship Id="${logoRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${LOGO_EXT}"/>`;
  return makeSlide(shapes, extraRels);
}

// ── Slide 2: Project Info + Rank Legend ──────────────────────
function projectInfoSlide(
  report: InspectionReport,
  unit: InspectionUnit,
  pageNum: number,
): { xml: string; rels: string } {
  resetIds();

  const b12 = (text: string) => txPara(text, { sz: 12, color: BLUE_LABEL });
  const b11 = (text: string) => txPara(text, { sz: 11, color: BLUE_LABEL });

  const shapes: string[] = [
    ...pageHeaderShapes('MACHINE INSPECTION CHECK LIST', pageNum),
    // Outer border box (no fill, no text, black border 0.25pt)
    borderRect(406399, 742950, 6117062, 8591553, BLACK, pt(0.25)),
    // Customer
    textBox(406398, 752476, 6117061, 263447, b12(`Customer : ${report.customerName}`)),
    // Location
    textBox(1223963, 1007288, 5299495, 263447, b12(`Location : ${unit.location}`)),
    // Contact Person
    textBox(406389, 1278993, 6117061, 263447, b12(`Contact Person : ${report.contactPerson}`)),
    // Department (left)
    textBox(406389, 1542439, 3022603, 263447, b12(`Department : ${report.department}`)),
    // Tel (right)
    textBox(3428992, 1542438, 3094458, 263447, b12(`Tel. / Fax : ${report.tel}`)),
    // Project Name
    textBox(406386, 1805884, 6117061, 263447, b12(`Project Name : ${report.projectName}`)),
    // Project No.
    textBox(406386, 2069328, 6117061, 263447, b12(`Project No. : ${report.projectNo}`)),
    // Report Date
    textBox(406386, 2332775, 6117061, 263447, b12(`Report Date : ${report.reportDate}`)),
    // Control Panel Name
    textBox(406389, 6989117, 3327411, 171453, b11(`Control Panel Name : ${unit.controlPanelName}`)),
    // Main Breaker Model
    textBox(406389, 7160571, 3124211, 171453, b11(`Main Breaker Model : ${unit.mainBreakerModel}`)),
    // Main Breaker A
    textBox(413816, 7338127, 1724547, 171453, b11(`Main Breaker : ${unit.mainBreakerAmp} A.`)),
    // Power Supply Volt
    textBox(413816, 7509785, 1724547, 171453, b11(`Power Supply : ${unit.voltage} Volt`)),
    // Power Supply Phase
    textBox(413816, 7684415, 1948382, 171453, b11(`Power Supply : ${unit.powerPhase}`)),
    // Rank legend text box
    textBox(3291203, 7344614, 3190878, 563519,
      txPara('Rank A : Can use / Need to detail check or more information.', { sz: 8.5, color: BLACK }) +
      txPara('Rank B : Still can use, but need to buy some of spare parts.', { sz: 8.5, color: BLACK }) +
      txPara('Rank C : Need to repair / Replace within 6 months.', { sz: 8.5, color: BLACK }) +
      txPara('Rank D : NG / Must repair ASAP.', { sz: 8.5, color: BLACK })),
    // PLC Model
    textBox(406389, 8782127, 2939246, 171453, b11(`PLC Model : ${unit.plcModel}`)),
    // Communication
    textBox(406392, 8959847, 2939244, 171453, b11(`Communication : ${unit.communication}`)),
    // HMI Model
    textBox(406394, 9131300, 2939242, 171453, b11(`HMI Model : ${unit.hmiModel}`)),
  ];

  return makeSlide(shapes);
}

// ── Slide 3: Power ───────────────────────────────────────────
function powerSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();
  const u = unit.utility;

  // Frame positions from original PPTX slide3.xml
  const FRAME1_X = 563563, FRAME1_Y = 1347788, FRAME1_CX = 5934075;
  const FRAME2_X = 563563, FRAME2_Y = 2617788, FRAME2_CX = 5934075;
  const FRAME3_X = 431800, FRAME3_Y = 4073525, FRAME3_CX = 6065838;

  // Utility Power Supply table — 11 cols scaled to FRAME1_CX=5934075
  const utilColW = [699000, 507000, 507000, 507000, 385000, 385000, 315000, 315000, 315000, 315000, 1679075];
  function chk(v: boolean) { return v ? '✓' : ''; }

  const utilRows: RowDef[] = [
    { cells: [{ text: 'Utility Power Supply', bold: true, bg: DARK_BLUE, span: 11 }], h: cm(0.65) },
    { cells: [
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
    ], h: cm(0.65) },
    { cells: [
      { text: 'Spec.', bold: true, bg: GRAY_BG },
      { text: u.specRS, align: 'ctr' }, { text: u.specRT, align: 'ctr' }, { text: u.specST, align: 'ctr' },
      { text: 'OK', align: 'ctr' }, { text: 'NG', align: 'ctr' },
      { text: 'A', align: 'ctr' }, { text: 'B', align: 'ctr' }, { text: 'C', align: 'ctr' }, { text: 'D', align: 'ctr' },
      { text: '' },
    ] },
    { cells: [
      { text: 'Actual', bold: true, bg: GRAY_BG },
      { text: u.actualRS, align: 'ctr' }, { text: u.actualRT, align: 'ctr' }, { text: u.actualST, align: 'ctr' },
      { text: chk(u.judgement === 'OK'), align: 'ctr' }, { text: chk(u.judgement === 'NG'), align: 'ctr' },
      { text: chk(u.rank === 'A'), align: 'ctr' }, { text: chk(u.rank === 'B'), align: 'ctr' },
      { text: chk(u.rank === 'C'), align: 'ctr' }, { text: chk(u.rank === 'D'), align: 'ctr' },
      { text: u.remarks },
    ] },
  ];

  // PLC Status — 8 cols scaled to FRAME2_CX=5934075
  const plcColW = [1399000, 420000, 420000, 350000, 350000, 350000, 350000, 2295075];
  const plcRows: RowDef[] = [
    { cells: [{ text: 'PLC Status', bold: true, bg: DARK_BLUE, span: 8 }], h: cm(0.65) },
    { cells: [
      { text: '', bg: LIGHT_BLUE },
      { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'Remarks', bold: true, bg: LIGHT_BLUE },
    ], h: cm(0.65) },
    { cells: [
      { text: 'Status', bold: true, bg: GRAY_BG },
      { text: chk(unit.plcStatus === 'OK'), align: 'ctr' }, { text: chk(unit.plcStatus === 'NG'), align: 'ctr' },
      { text: chk(unit.plcRank === 'A'), align: 'ctr' }, { text: chk(unit.plcRank === 'B'), align: 'ctr' },
      { text: chk(unit.plcRank === 'C'), align: 'ctr' }, { text: chk(unit.plcRank === 'D'), align: 'ctr' },
      { text: unit.plcRemarks },
    ] },
  ];

  // Transformer/SMPS — 10 cols scaled to FRAME3_CX=6065838
  const xfColW = [810000, 479000, 479000, 406000, 406000, 332000, 332000, 332000, 332000, 2157838];
  function xfRows(m: TransformerMeasurement, title: string): RowDef[] {
    return [
      { cells: [{ text: `${title} : ${m.model}`, bold: true, bg: DARK_BLUE, span: 10 }], h: cm(0.65) },
      { cells: [
        { text: '', bg: LIGHT_BLUE },
        { text: 'V', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' }, { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
        { text: 'Remarks', bold: true, bg: LIGHT_BLUE },
      ], h: cm(0.65) },
      { cells: [
        { text: 'Primary (Spec.)', bold: true, bg: GRAY_BG }, { text: m.primaryV, align: 'ctr' }, { text: m.primaryA || 'Spec.', align: 'ctr' },
        { text: 'OK', align: 'ctr' }, { text: 'NG', align: 'ctr' },
        { text: 'A', align: 'ctr' }, { text: 'B', align: 'ctr' }, { text: 'C', align: 'ctr' }, { text: 'D', align: 'ctr' },
        { text: '' },
      ] },
      { cells: [
        { text: 'Primary (Actual)', bold: true, bg: GRAY_BG }, { text: m.primaryV, align: 'ctr' }, { text: m.primaryA, align: 'ctr' },
        { text: chk(m.primaryJudgement === 'OK'), align: 'ctr' }, { text: chk(m.primaryJudgement === 'NG'), align: 'ctr' },
        { text: chk(m.primaryRank === 'A'), align: 'ctr' }, { text: chk(m.primaryRank === 'B'), align: 'ctr' },
        { text: chk(m.primaryRank === 'C'), align: 'ctr' }, { text: chk(m.primaryRank === 'D'), align: 'ctr' },
        { text: m.primaryRemarks },
      ] },
      { cells: [
        { text: 'Secondary (Spec.)', bold: true, bg: GRAY_BG }, { text: m.secondaryV, align: 'ctr' }, { text: 'Spec.', align: 'ctr' },
        { text: 'OK', align: 'ctr' }, { text: 'NG', align: 'ctr' },
        { text: 'A', align: 'ctr' }, { text: 'B', align: 'ctr' }, { text: 'C', align: 'ctr' }, { text: 'D', align: 'ctr' },
        { text: '' },
      ] },
      { cells: [
        { text: 'Secondary (Actual)', bold: true, bg: GRAY_BG }, { text: m.secondaryV, align: 'ctr' }, { text: m.secondaryA, align: 'ctr' },
        { text: chk(m.secondaryJudgement === 'OK'), align: 'ctr' }, { text: chk(m.secondaryJudgement === 'NG'), align: 'ctr' },
        { text: chk(m.secondaryRank === 'A'), align: 'ctr' }, { text: chk(m.secondaryRank === 'B'), align: 'ctr' },
        { text: chk(m.secondaryRank === 'C'), align: 'ctr' }, { text: chk(m.secondaryRank === 'D'), align: 'ctr' },
        { text: m.secondaryRemarks },
      ] },
    ];
  }

  const shapes: string[] = [
    ...pageHeaderShapes('MACHINE INSPECTION CHECK LIST', pageNum),
    // Outer border box
    borderRect(406399, 742950, 6117062, 8591553, BLACK, pt(0.25)),
    // Rank legend
    textBox(3298506, 765020, 3190878, 563519,
      txPara('Rank A : Can use / Need to detail check or more information.', { sz: 8.5, color: BLACK }) +
      txPara('Rank B : Still can use, but need to buy some of spare parts.', { sz: 8.5, color: BLACK }) +
      txPara('Rank C : Need to repair / Replace within 6 months.', { sz: 8.5, color: BLACK }) +
      txPara('Rank D : NG / Must repair ASAP.', { sz: 8.5, color: BLACK })),
    // Frame 1: Utility Power Supply table
    buildTable(FRAME1_X, FRAME1_Y, utilColW, utilRows),
    // Frame 2: PLC Status table
    buildTable(FRAME2_X, FRAME2_Y, plcColW, plcRows),
  ];

  // Frame 3: Transformer/SMPS tables stacked
  let y3 = FRAME3_Y;
  for (const sec of unit.powerSections) {
    const rows = xfRows(sec, sec.title);
    shapes.push(buildTable(FRAME3_X, y3, xfColW, rows));
    y3 += rows.reduce((a, r) => a + (r.h ?? cm(0.65)), 0) + cm(0.3);
  }

  return makeSlide(shapes);
}

// ── Operation Photo slide (2 photos per slide, from original coords) ──
function opPhotoSlide(
  pageNum: number,
  test1: OperationTest | undefined,
  test2: OperationTest | undefined,
  photoRels: Array<{ rId: string; mediaName: string }>,
): { xml: string; rels: string } {
  resetIds();

  // Exact coordinates from original PPTX slide4.xml
  const LBL1_X = 406398, LBL1_Y = 752476, LBL_CX = 6117061, LBL_CY = 263447;
  const PH1_X = 457200, PH1_Y = 1025449, PH_CX = 5943600, PH_CY = 3773837;
  const LBL2_X = 370469, LBL2_Y = 4965312;
  const PH2_X = 493128, PH2_Y = 5228759;

  const shapes: string[] = [
    ...pageHeaderShapes('MACHINE INSPECTION CHECK LIST', pageNum),
    // Photo 1 label
    textBox(LBL1_X, LBL1_Y, LBL_CX, LBL_CY,
      txPara(test1?.name ?? '', { sz: 12, color: BLUE_LABEL })),
    // Photo 2 label
    textBox(LBL2_X, LBL2_Y, LBL_CX, LBL_CY,
      txPara(test2?.name ?? '', { sz: 12, color: BLUE_LABEL })),
  ];

  let relIdx = 0;

  // Photo 1
  if (test1?.photos?.[0] && relIdx < photoRels.length) {
    shapes.push(imgShape(PH1_X, PH1_Y, PH_CX, PH_CY, photoRels[relIdx].rId));
    relIdx++;
  } else {
    shapes.push(...photoPlaceholder(PH1_X, PH1_Y, PH_CX, PH_CY, test1?.name ?? ''));
  }

  // Photo 2
  if (test2?.photos?.[0] && relIdx < photoRels.length) {
    shapes.push(imgShape(PH2_X, PH2_Y, PH_CX, PH_CY + 1, photoRels[relIdx].rId));
    relIdx++;
  } else {
    shapes.push(...photoPlaceholder(PH2_X, PH2_Y, PH_CX, PH_CY + 1, test2?.name ?? ''));
  }

  let extraRels = '';
  for (const rel of photoRels) {
    extraRels += `\n<Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${rel.mediaName}"/>`;
  }

  return makeSlide(shapes, extraRels);
}

// ── Electrical Photo slide (3-column grid, max 9 photos/slide) ──
function elecPhotoSlide(
  pageNum: number,
  batch: ElectricalItem[],
  photoRels: Array<{ rId: string; mediaName: string }>,
): { xml: string; rels: string } {
  resetIds();

  const COLS = 3;
  const GAP_H = cm(0.2);
  const GAP_V = cm(0.3);
  const LABEL_H = cm(0.6);
  const START_Y = 742950;
  const TOTAL_W = 6117062;
  const TOTAL_H = 8591553;
  const PW = Math.floor((TOTAL_W - GAP_H * (COLS - 1)) / COLS);
  const ROWS = Math.ceil(Math.min(batch.length, 9) / COLS);
  const PH = Math.floor((TOTAL_H - GAP_V * (ROWS - 1) - LABEL_H * ROWS) / ROWS);

  const shapes: string[] = [
    ...pageHeaderShapes('MACHINE INSPECTION CHECK LIST', pageNum),
    // Outer border box
    borderRect(406399, START_Y, TOTAL_W, TOTAL_H, BLACK, pt(0.25)),
  ];

  let relIdx = 0;
  for (let i = 0; i < Math.min(batch.length, 9); i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const px = MARGIN + col * (PW + GAP_H);
    const py = START_Y + row * (PH + LABEL_H + GAP_V);
    const item = batch[i];

    // Label
    shapes.push(textBox(px, py, PW, LABEL_H,
      txPara(item.name, { sz: 8, color: BLACK })));

    // Photo
    if (item.photos?.[0] && relIdx < photoRels.length) {
      shapes.push(imgShape(px, py + LABEL_H, PW, PH, photoRels[relIdx].rId));
      relIdx++;
    } else {
      shapes.push(...photoPlaceholder(px, py + LABEL_H, PW, PH, item.name));
    }
  }

  let extraRels = '';
  for (const rel of photoRels) {
    extraRels += `\n<Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${rel.mediaName}"/>`;
  }
  return makeSlide(shapes, extraRels);
}

// OLE table origin — from original ppt/slides/slide9.xml graphicFrame
const OLE_X = 414338;
const OLE_Y = 762000;  // = header_bottom (742950) + 19050 EMU gap

// ── Operation Check Table slide ───────────────────────────────
function opTableSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();

  // 8 columns summing to OLE cx=6105525 EMU
  // TestName(7.5) | OK(1.3) | NG(1.05) | A(1.0) | B(1.0) | C(1.0) | D(1.0) | Remarks(3.11)
  const colW = [2700000, 468000, 378000, 360000, 360000, 360000, 360000, 1119525];
  function chk(v: boolean) { return v ? '✓' : ''; }

  const rows: RowDef[] = [
    // Header — 1+2(span)+4(span)+1 = 8 columns
    { cells: [
      { text: 'Test Name', bold: true, bg: DARK_BLUE },
      { text: 'Judgement', bold: true, bg: DARK_BLUE, span: 2, align: 'ctr' },
      { text: 'Rank', bold: true, bg: DARK_BLUE, span: 4, align: 'ctr' },
      { text: 'Remarks', bold: true, bg: DARK_BLUE },
    ], h: cm(0.7) },
    // Sub-header — 8 separate cells
    { cells: [
      { text: '', bg: LIGHT_BLUE },
      { text: 'OK', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'NG', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'A', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'B', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'C', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: 'D', bold: true, bg: LIGHT_BLUE, align: 'ctr' },
      { text: '', bg: LIGHT_BLUE },
    ], h: cm(0.65) },
    // Data rows — 8 cells each
    ...unit.operationTests.map(t => ({
      cells: [
        { text: t.name },
        { text: chk(t.status === 'OK'), align: 'ctr' },
        { text: chk(t.status === 'NG'), align: 'ctr' },
        { text: chk(t.rank === 'A'), align: 'ctr' },
        { text: chk(t.rank === 'B'), align: 'ctr' },
        { text: chk(t.rank === 'C'), align: 'ctr' },
        { text: chk(t.rank === 'D'), align: 'ctr' },
        { text: t.remarks },
      ] as CellDef[],
      h: cm(0.85),
    })),
  ];

  return makeSlide([
    ...pageHeaderShapes('MACHINE INSPECTION CHECK LIST', pageNum),
    buildTable(OLE_X, OLE_Y, colW, rows),
  ]);
}

// ── Electrical Check Table slide ──────────────────────────────
function elecTableSlide(unit: InspectionUnit, pageNum: number): { xml: string; rels: string } {
  resetIds();

  // 10 columns summing to OLE cx=6105525 EMU
  // Component(5.3) | Normal(1.2) | Abnormal(1.2) | OK(1.2) | NG(1.0) | A(0.95) | B(0.95) | C(0.95) | D(0.95) | Remarks(3.26)
  const colW = [1908000, 432000, 432000, 432000, 360000, 342000, 342000, 342000, 342000, 1173525];
  function chk(v: boolean) { return v ? '✓' : ''; }

  const hdrCells: CellDef[] = [
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
  ];

  const rows: RowDef[] = [
    { cells: hdrCells, h: cm(0.7) },
    ...unit.electricalItems.map(item => ({
      cells: [
        { text: item.name },
        { text: chk(item.condition === 'Normal'), align: 'ctr' },
        { text: chk(item.condition === 'Abnormal'), align: 'ctr' },
        { text: chk(item.judgement === 'OK'), align: 'ctr' },
        { text: chk(item.judgement === 'NG'), align: 'ctr' },
        { text: chk(item.rank === 'A'), align: 'ctr' },
        { text: chk(item.rank === 'B'), align: 'ctr' },
        { text: chk(item.rank === 'C'), align: 'ctr' },
        { text: chk(item.rank === 'D'), align: 'ctr' },
        { text: item.remarks },
      ] as CellDef[],
      h: cm(0.85),
    })),
  ];

  return makeSlide([
    ...pageHeaderShapes('MACHINE INSPECTION CHECK LIST', pageNum),
    buildTable(OLE_X, OLE_Y, colW, rows),
  ]);
}

// ── Sign-Off slide ────────────────────────────────────────────
function signOffSlide(report: InspectionReport, pageNum: number): { xml: string; rels: string } {
  resetIds();

  const {
    customerName, customerSignName, customerTitle, customerDate,
    inspectorName, inspectorTitle, inspectorDate,
    checkerName, checkerTitle, checkerDate,
  } = report;

  const shapes: string[] = [
    // 1. Header: black border, black text
    textBox(406400, 479503, 6117063, 345687,
      txPara('Sign Off', { sz: 14, bold: true, color: BLACK, align: 'ctr' }),
      BLACK, undefined, 'ctr'),
    // 2. Intro text box (no border, no fill)
    textBox(406400, 1025912, 6117062, 1785104,
      txPara('With all these documents, this is part of the installation report and it is all the information of the project.', { sz: 11, color: BLACK }) +
      txPara('', { sz: 11, color: BLACK }) +
      txPara(`Customer : ${customerName}`, { sz: 11, bold: true, color: BLACK }) +
      txPara('Sign :  ___________________________', { sz: 11, color: BLACK })),
    // 3. Customer Name
    textBox(406399, 2803528, 3946525, 261610,
      txPara(`Name :  ${customerSignName}`, { sz: 11, color: BLUE_LABEL })),
    // 4. Customer Title
    textBox(406400, 3372967, 3139688, 261610,
      txPara(`Title :  ${customerTitle}`, { sz: 11, color: BLUE_LABEL })),
    // 5. Customer Date
    textBox(406400, 3948405, 1651000, 261610,
      txPara(`Date : ${customerDate}`, { sz: 11, color: BLUE_LABEL })),
    // 6. TOMAS/Inspector block
    textBox(370469, 4632238, 3139688, 1107996,
      txPara('TOMAS TECH CO., LTD.', { sz: 11, bold: true, color: BLACK }) +
      txPara('Prepare / Inspector', { sz: 11, bold: true, color: BLACK }) +
      txPara('Sign :  ___________________________', { sz: 11, color: BLACK })),
    // 7. Inspector Name
    textBox(370469, 5786758, 3139688, 261610,
      txPara(`Name : ${inspectorName}`, { sz: 11, color: BLUE_LABEL })),
    // 8. Inspector Title
    textBox(370469, 6356197, 3139688, 261610,
      txPara(`Title : ${inspectorTitle}`, { sz: 11, color: BLUE_LABEL })),
    // 9. Inspector Date
    textBox(370469, 6931634, 3139688, 261610,
      txPara(`Date : ${inspectorDate}`, { sz: 11, color: BLUE_LABEL })),
    // 10. Checker block
    textBox(3383774, 4803439, 3139688, 938719,
      txPara('Checked', { sz: 11, bold: true, color: BLACK }) +
      txPara('Sign :  ___________________________', { sz: 11, color: BLACK })),
    // 11. Checker Name
    textBox(3383774, 5786758, 3139688, 261610,
      txPara(`Name : ${checkerName}`, { sz: 11, color: BLUE_LABEL })),
    // 12. Checker Title
    textBox(3383774, 6356197, 3139688, 261610,
      txPara(`Title : ${checkerTitle}`, { sz: 11, color: BLUE_LABEL })),
    // 13. Checker Date
    textBox(3383774, 6931634, 3139688, 261610,
      txPara(`Date : ${checkerDate}`, { sz: 11, color: BLUE_LABEL })),
    // 14. End text
    textBox(471487, 9050592, 6117062, 261610,
      txPara('## END OF BLUEPRINT ##', { sz: 11, bold: true, color: BLACK, align: 'ctr' })),
    // 15. Page number (different position for sign-off slide)
    textBox(6210299, 9181401, 328613, 527403,
      txPara(String(pageNum), { sz: 8, color: BLACK, align: 'r' })),
  ];

  return makeSlide(shapes);
}

// ══════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ══════════════════════════════════════════════════════════════
export function generatePptx(report: InspectionReport): Uint8Array {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {};

  // Embed logo once
  const LOGO_RID = 'rId2';
  files[`ppt/media/logo.${LOGO_EXT}`] = Uint8Array.from(atob(LOGO_BASE64), c => c.charCodeAt(0));

  const slideData: Array<{ xml: string; rels: string }> = [];
  let photoCounter = 0;

  function addPhoto(
    dataUrl: string,
    prefix: string,
    rIdStart: number,
  ): { rId: string; mediaName: string } | null {
    const bytes = dataUrlToBytes(dataUrl);
    if (!bytes) return null;
    const ext = mimeExt(dataUrl);
    const mediaName = `${prefix}_${photoCounter++}.${ext}`;
    files[`ppt/media/${mediaName}`] = bytes;
    return { rId: `rId${rIdStart}`, mediaName };
  }

  for (const unit of report.units) {
    const unitPage = (offset: number) => slideData.length + 1 + offset;

    // Slide 1: Cover
    slideData.push(coverSlide(report, unit, unitPage(0), LOGO_RID));

    // Slide 2: Project Info
    slideData.push(projectInfoSlide(report, unit, unitPage(0)));

    // Slide 3: Power
    slideData.push(powerSlide(unit, unitPage(0)));

    // Slides 4+: Operation Photo slides (2 tests per slide)
    if (unit.operationTests.length > 0) {
      const slideCount = Math.ceil(unit.operationTests.length / 2);
      for (let s = 0; s < slideCount; s++) {
        const t1 = unit.operationTests[s * 2];
        const t2 = unit.operationTests[s * 2 + 1];
        const photoRels: Array<{ rId: string; mediaName: string }> = [];
        let rId = 2;

        for (const t of [t1, t2]) {
          if (t?.photos?.[0]) {
            rId++;
            const rel = addPhoto(t.photos[0], 'op', rId);
            if (rel) photoRels.push({ ...rel, rId: `rId${rId}` });
          }
        }
        slideData.push(opPhotoSlide(unitPage(0), t1, t2, photoRels));
      }
    }

    // Electrical Photo slides (max 9 per slide)
    const elecWithPhotos = unit.electricalItems.filter(i => i.photos?.[0]);
    if (elecWithPhotos.length > 0) {
      const batches: ElectricalItem[][] = [];
      for (let i = 0; i < elecWithPhotos.length; i += 9) {
        batches.push(elecWithPhotos.slice(i, i + 9));
      }
      for (const batch of batches) {
        const photoRels: Array<{ rId: string; mediaName: string }> = [];
        let rId = 2;
        for (const item of batch) {
          if (item.photos?.[0]) {
            rId++;
            const rel = addPhoto(item.photos[0], 'el', rId);
            if (rel) photoRels.push({ ...rel, rId: `rId${rId}` });
          }
        }
        slideData.push(elecPhotoSlide(unitPage(0), batch, photoRels));
      }
    } else if (unit.electricalItems.length > 0) {
      // Show placeholder slide if items exist but no photos
      slideData.push(elecPhotoSlide(unitPage(0), unit.electricalItems.slice(0, 9), []));
    }

    // Operation Check Table
    slideData.push(opTableSlide(unit, unitPage(0)));

    // Electrical Check Table
    slideData.push(elecTableSlide(unit, unitPage(0)));

    // Sign-Off
    slideData.push(signOffSlide(report, unitPage(0)));
  }

  // ── Collect photo content types ───────────────────────────
  const photoExts = new Set<string>();
  for (const key of Object.keys(files)) {
    if (key.startsWith('ppt/media/') && !key.includes('logo.')) {
      const ext = key.split('.').pop() ?? 'jpg';
      photoExts.add(ext);
    }
  }
  const photoTypeDefaults = [...photoExts].map(ext =>
    `<Default Extension="${ext}" ContentType="image/${ext === 'jpg' ? 'jpeg' : ext}"/>`
  ).join('\n  ');

  const slideOverrides = slideData.map((_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n  ');

  const layoutOverrides = Array.from({length: 11}, (_, i) =>
    `<Override PartName="/ppt/slideLayouts/slideLayout${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
  ).join('\n  ');

  files['[Content_Types].xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="${LOGO_EXT}" ContentType="image/${(LOGO_EXT as string) === 'jpg' ? 'jpeg' : LOGO_EXT}"/>
  ${photoTypeDefaults}
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  ${layoutOverrides}
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  ${slideOverrides}
</Types>`);

  files['_rels/.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const NSP2 = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const NSA2 = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
  const NSR2 = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

  const slideRefs = slideData.map((_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`
  ).join('');

  files['ppt/presentation.xml'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NSP2} ${NSA2} ${NSR2} saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideRefs}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}" type="A4"/>
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
  const LAYOUT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";
  const THEME_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
  const layoutRels = Array.from({length: 11}, (_, i) =>
    `<Relationship Id="rId${i+1}" Type="${LAYOUT_NS}" Target="../slideLayouts/slideLayout${i+1}.xml"/>`
  ).join('\n  ');
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${layoutRels}
  <Relationship Id="rId12" Type="${THEME_NS}" Target="../theme/theme1.xml"/>
</Relationships>`);

  // Include all 11 original layouts in the ZIP (layout7 is the blank layout used by slides)
  for (let i = 0; i < SLIDE_LAYOUTS.length; i++) {
    files[`ppt/slideLayouts/slideLayout${i + 1}.xml`] = enc(SLIDE_LAYOUTS[i]);
  }
  // Keep SLIDE_LAYOUT_BLANK_XML usage via SLIDE_LAYOUTS[6] (layout7, index 6)
  void SLIDE_LAYOUT_BLANK_XML; // retained export, used as reference for layout7
  for (let i = 1; i <= 11; i++) {
    files[`ppt/slideLayouts/_rels/slideLayout${i}.xml.rels`] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
  }

  slideData.forEach(({ xml, rels }, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = enc(xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = enc(rels);
  });

  return zipSync(files, { level: 6 });
}
