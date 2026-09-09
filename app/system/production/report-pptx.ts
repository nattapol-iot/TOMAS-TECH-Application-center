import { zipSync } from "fflate";
import {
  THEME_XML,
  SLIDE_MASTER_XML,
  SLIDE_LAYOUTS,
  LOGO_BASE64,
  LOGO_EXT,
} from "./report-pptx-template";
import { downloadReportEvidence } from "../api-client";
import { labels, type InputField, type ReportBody, type ReportRecord, type Section } from "./report-types";

// ── Layout constants (A4 Portrait, EMU) — match the original TOMAS TECH document
const W = 6858000;
const H = 9906000;
const MARGIN = 406400;
const DARK_BLUE = "1B3A6B";
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
  return [
    borderRect(x, y, cx, cy, "CCCCCC"),
    textBox(x, y + Math.floor(cy / 2) - cm(0.4), cx, cm(0.8),
      txPara(label || '[No Photo]', { sz: 9, color: "888888", align: 'ctr' })),
  ];
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
    textBox(406400, 479503, 6117063, 263447,
      txPara(title, { sz: 12, color: BLACK }),
      undefined, undefined, 'ctr'),
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

// OLE table origin — from original ppt/slides/slide9.xml graphicFrame
const OLE_X = 414338;
const OLE_Y = 762000; // = header_bottom (742950) + 19050 EMU gap
const OLE_W = 6105525;
const CONTENT_START_Y = 742950;
const CONTENT_W = 6117062;
const CONTENT_H = 8591553;

function reportBodyRow(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

// ══════════════════════════════════════════════════════════════
// SLIDE BUILDERS
// ══════════════════════════════════════════════════════════════

// ── Slide 1: Cover ────────────────────────────────────────────
// Layout matches the original TOMAS TECH document: white background, black/red text.
function coverSlide(report: ReportRecord, pageNum: number, logoRId: string): { xml: string; rels: string } {
  resetIds();
  const RED = 'FF0000';
  const typeLabel = labels[report.reportType] ?? report.reportType;

  const shapes: string[] = [
    // Version box (top-left, red border)
    textBox(406400, 479503, 1555750, 283687,
      txPara(`Rev. ${report.revision} · ${report.reportDate}`, { sz: 12, color: RED, align: 'ctr' }),
      RED),

    // Confidential box (top-right, red border)
    textBox(5262563, 479502, 1123950, 283687,
      txPara('Confidential', { sz: 12, color: RED, align: 'ctr' }),
      RED),

    // Decorative corner: thin horizontal rule + vertical black bar (matches original)
    textBox(406400, 5819385, 5709200, pt(2.25), txPara('', {}), undefined, BLACK),
    textBox(6179800, 3687445, 271800, 2531668, txPara('', {}), undefined, BLACK),

    // Title block: title + report-type subtitle + blank + Made for + By, all right-aligned
    textBox(724584, 4624787, 5301516, 1200329,
      txPara(report.title || `${typeLabel} Report`, { sz: 13.5, color: BLACK, align: 'r' }) +
      txPara(`${typeLabel} Report`, { sz: 13.5, color: BLACK, align: 'r' }) +
      txPara('', { sz: 12, color: BLACK, align: 'r' }) +
      txPara(`Made for : ${report.customer}`, { sz: 12, color: BLACK, align: 'r' }) +
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

// ── Slide 2: Report Info ─────────────────────────────────────
function infoSlide(report: ReportRecord, pageNum: number): { xml: string; rels: string } {
  resetIds();
  const b12 = (t: string) => txPara(t, { sz: 12, color: BLUE_LABEL });
  const headerTitle = `${(labels[report.reportType] ?? report.reportType).toUpperCase()} REPORT`;

  const shapes: string[] = [
    ...pageHeaderShapes(headerTitle, pageNum),
    borderRect(406399, CONTENT_START_Y, CONTENT_W, CONTENT_H, BLACK, pt(0.25)),
    textBox(406398, 752476, 6117061, 263447, b12(`Customer : ${report.customer}`)),
    textBox(406389, 1015922, 6117061, 263447, b12(`Project / Reference : ${report.sourceReference}`)),
    textBox(406386, 1279368, 6117061, 263447, b12(`Project / Site : ${report.sourceTitle}`)),
    textBox(406386, 1542814, 6117061, 263447, b12(`Report No. : ${report.number} · Rev.${report.revision}`)),
    textBox(406386, 1806260, 6117061, 263447, b12(`Report Date : ${report.reportDate}`)),
    textBox(406386, 2069706, 6117061, 263447, b12(`Status : ${labels[report.status] ?? report.status}`)),
    ...(report.template ? [textBox(406386, 2333152, 6117061, 263447, b12(`Template : ${report.template.name} · V${report.template.version}`))] : []),
  ];

  return makeSlide(shapes);
}

// ── Generic Section slide ────────────────────────────────────
function sectionSlide(section: Section, body: ReportBody, reportType: string, pageNum: number): { xml: string; rels: string } {
  resetIds();
  const headerTitle = `${(labels[reportType] ?? reportType).toUpperCase()} REPORT`;

  if (section.repeat) {
    const rows = Array.isArray(body[section.key]) ? body[section.key] as unknown[] : [];
    const colCount = Math.max(1, section.fields.length);
    const baseW = Math.floor(OLE_W / colCount);
    const colW = section.fields.map((_, i) => i === colCount - 1 ? OLE_W - baseW * (colCount - 1) : baseW);
    const tableRows: RowDef[] = [
      { cells: section.fields.map((f: InputField) => ({ text: f.label, bold: true, bg: DARK_BLUE })), h: cm(0.7) },
      ...rows.map(row => ({
        cells: section.fields.map((f: InputField) => ({ text: text(reportBodyRow(row)[f.key]) } as CellDef)),
        h: cm(0.65),
      })),
    ];
    return makeSlide([
      ...pageHeaderShapes(headerTitle, pageNum),
      buildTable(OLE_X, OLE_Y, colW, tableRows),
    ]);
  }

  const row = reportBodyRow(body[section.key]);
  const shapes: string[] = [
    ...pageHeaderShapes(headerTitle, pageNum),
    borderRect(406399, CONTENT_START_Y, CONTENT_W, CONTENT_H, BLACK, pt(0.25)),
    textBox(406398, 752476, 6117061, 6000000,
      section.fields.map((f: InputField) => txPara(`${f.label} : ${text(row[f.key])}`, { sz: 12, color: BLUE_LABEL })).join('')),
  ];
  return makeSlide(shapes);
}

// ── Evidence photo slide (3-column grid, max 9 photos/slide) ──
function evidenceSlide(
  pageNum: number,
  batch: ReportBody[],
  photoRels: Array<{ rId: string; mediaName: string } | null>,
): { xml: string; rels: string } {
  resetIds();

  const COLS = 3;
  const GAP_H = cm(0.2);
  const GAP_V = cm(0.3);
  const LABEL_H = cm(0.6);
  const PW = Math.floor((CONTENT_W - GAP_H * (COLS - 1)) / COLS);
  const ROWS = Math.ceil(Math.min(batch.length, 9) / COLS);
  const PH = Math.floor((CONTENT_H - GAP_V * (ROWS - 1) - LABEL_H * ROWS) / ROWS);
  const headerTitle = 'EVIDENCE';

  const shapes: string[] = [
    ...pageHeaderShapes(headerTitle, pageNum),
    borderRect(406399, CONTENT_START_Y, CONTENT_W, CONTENT_H, BLACK, pt(0.25)),
  ];

  for (let i = 0; i < Math.min(batch.length, 9); i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const px = MARGIN + col * (PW + GAP_H);
    const py = CONTENT_START_Y + row * (PH + LABEL_H + GAP_V);
    const label = text(batch[i].topic) || text(batch[i].description);

    shapes.push(textBox(px, py, PW, LABEL_H, txPara(label, { sz: 8, color: BLACK })));

    const rel = photoRels[i];
    if (rel) {
      shapes.push(imgShape(px, py + LABEL_H, PW, PH, rel.rId));
    } else {
      shapes.push(...photoPlaceholder(px, py + LABEL_H, PW, PH, ''));
    }
  }

  let extraRels = '';
  for (const rel of photoRels) {
    if (rel) extraRels += `\n<Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${rel.mediaName}"/>`;
  }
  return makeSlide(shapes, extraRels);
}

// ── Sign-Off slide ────────────────────────────────────────────
function signOffSlide(report: ReportRecord, pageNum: number): { xml: string; rels: string } {
  resetIds();

  const ack = report.customerAcknowledgment;
  const sigFor = (stage: string) => report.signatures.find(s => s.stage === stage)?.occurredAt ?? '';

  const shapes: string[] = [
    textBox(406400, 479503, 6117063, 345687,
      txPara('Sign Off', { sz: 14, bold: true, color: BLACK, align: 'ctr' }),
      BLACK, undefined, 'ctr'),
    textBox(406400, 1025912, 6117062, 1785104,
      txPara('With all these documents, this is part of the report and it is all the information of the project.', { sz: 11, color: BLACK }) +
      txPara('', { sz: 11, color: BLACK }) +
      txPara(`Customer : ${report.customer}`, { sz: 11, bold: true, color: BLACK }) +
      txPara('Sign :  ___________________________', { sz: 11, color: BLACK })),
    textBox(406399, 2803528, 3946525, 261610,
      txPara(`Name :  ${ack?.name ?? ''}`, { sz: 11, color: BLUE_LABEL })),
    textBox(406400, 3372967, 3139688, 261610,
      txPara(`Title :  ${ack?.title ?? ''}`, { sz: 11, color: BLUE_LABEL })),
    textBox(406400, 3948405, 1651000, 261610,
      txPara(`Date : ${ack?.date ?? ''}`, { sz: 11, color: BLUE_LABEL })),
    textBox(370469, 4632238, 3139688, 1107996,
      txPara('TOMAS TECH CO., LTD.', { sz: 11, bold: true, color: BLACK }) +
      txPara('Prepared by', { sz: 11, bold: true, color: BLACK }) +
      txPara('Sign :  ___________________________', { sz: 11, color: BLACK })),
    textBox(370469, 5786758, 3139688, 261610,
      txPara(`Name : ${report.preparedBy?.name ?? ''}`, { sz: 11, color: BLUE_LABEL })),
    textBox(370469, 6356197, 3139688, 261610,
      txPara(`Date : ${sigFor("PREPARE")}`, { sz: 11, color: BLUE_LABEL })),
    textBox(3383774, 4803439, 3139688, 938719,
      txPara('Approved', { sz: 11, bold: true, color: BLACK }) +
      txPara('Sign :  ___________________________', { sz: 11, color: BLACK })),
    textBox(3383774, 5786758, 3139688, 261610,
      txPara(`Name : ${report.approver?.name ?? ''}`, { sz: 11, color: BLUE_LABEL })),
    textBox(3383774, 6356197, 3139688, 261610,
      txPara(`Date : ${sigFor("APPROVE")}`, { sz: 11, color: BLUE_LABEL })),
    textBox(471487, 9050592, 6117062, 261610,
      txPara('## END OF BLUEPRINT ##', { sz: 11, bold: true, color: BLACK, align: 'ctr' })),
    textBox(6210299, 9181401, 328613, 527403,
      txPara(String(pageNum), { sz: 8, color: BLACK, align: 'r' })),
  ];

  return makeSlide(shapes);
}

// ══════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ══════════════════════════════════════════════════════════════
export async function generateReportPptx(report: ReportRecord, sections: Section[]): Promise<Uint8Array> {
  const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
  const files: Record<string, Uint8Array> = {};

  const LOGO_RID = 'rId2';
  files[`ppt/media/logo.${LOGO_EXT}`] = Uint8Array.from(atob(LOGO_BASE64), c => c.charCodeAt(0));

  const slideData: Array<{ xml: string; rels: string }> = [];
  const page = () => slideData.length + 1;

  slideData.push(coverSlide(report, page(), LOGO_RID));
  slideData.push(infoSlide(report, page()));

  let photoCounter = 0;
  for (const section of sections) {
    if (section.key === "evidence") {
      const rows = Array.isArray(report.body.evidence) ? report.body.evidence as ReportBody[] : [];
      const withAttachments = rows.filter(row => Number(row.attachmentId) > 0);
      if (withAttachments.length === 0) continue;
      for (let i = 0; i < withAttachments.length; i += 9) {
        const batch = withAttachments.slice(i, i + 9);
        const photoRels = await Promise.all(batch.map(async row => {
          try {
            const blob = await downloadReportEvidence(report.id, Number(row.attachmentId));
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const ext = blob.type === "image/png" ? "png" : "jpg";
            const mediaName = `evidence_${photoCounter++}.${ext}`;
            files[`ppt/media/${mediaName}`] = bytes;
            return { rId: `rId${100 + photoCounter}`, mediaName };
          } catch { return null; }
        }));
        slideData.push(evidenceSlide(page(), batch, photoRels));
      }
      continue;
    }
    const hasRepeatData = section.repeat && Array.isArray(report.body[section.key]) && (report.body[section.key] as unknown[]).length > 0;
    const hasFieldData = !section.repeat && reportBodyRow(report.body[section.key]) && Object.keys(reportBodyRow(report.body[section.key])).length > 0;
    if (!hasRepeatData && !hasFieldData) continue;
    slideData.push(sectionSlide(section, report.body, report.reportType, page()));
  }

  slideData.push(signOffSlide(report, page()));

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

  const layoutOverrides = Array.from({ length: 11 }, (_, i) =>
    `<Override PartName="/ppt/slideLayouts/slideLayout${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`
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

  const slideRefs = slideData.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('');

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
  const layoutRels = Array.from({ length: 11 }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${LAYOUT_NS}" Target="../slideLayouts/slideLayout${i + 1}.xml"/>`
  ).join('\n  ');
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${layoutRels}
  <Relationship Id="rId12" Type="${THEME_NS}" Target="../theme/theme1.xml"/>
</Relationships>`);

  for (let i = 0; i < SLIDE_LAYOUTS.length; i++) {
    files[`ppt/slideLayouts/slideLayout${i + 1}.xml`] = enc(SLIDE_LAYOUTS[i]);
  }
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
