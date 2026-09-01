/**
 * The signature certificate: the artefact that makes a printed copy checkable.
 *
 * It carries the document identity, the source and output hashes, every block
 * with its signer, role and timestamp, the stamp code with the person who
 * applied it, and the verification code. It is generated, never typed.
 *
 * Format, and the reason for it: DSN-TC-005 §7.2 specifies the certificate as a
 * page appended to the signed PDF, with the marks rendered into the document's
 * own signature blocks. Both need a PDF library — merging pages and embedding a
 * Thai-capable font are not things to hand-roll, and choosing the library is a
 * dependency and licence decision for the team, tracked as RDL-039. Until it is
 * made the certificate is a self-contained, print-ready HTML document: UTF-8 so
 * Thai and Japanese signer names are correct, A4 @page so "print to PDF" gives
 * the intended sheet, and hashed and verified exactly like the eventual PDF.
 * The integrity model does not change when the renderer does — only the
 * container.
 */
const BLOCK_LABELS = {
    DRAWN_BY: "Drawn by",
    CHECKED_BY: "Checked by",
    APPROVED_BY: "Approved by",
    PREPARED_BY: "Prepared by",
    REQUESTED_BY: "Requested by",
    TESTED_BY: "Tested by",
    ENGINEER: "Engineer",
    CUSTOMER_APPROVED: "Customer approved",
};
const CLASS_LABELS = {
    DRAWING: "Drawing",
    SPEC: "Specification",
    MANUAL: "Manual",
    MAT_APPROVE: "Material approve",
    QUOTATION: "Quotation",
    PR_PO: "Purchase requisition / order",
    UAT_ACCEPT: "UAT acceptance",
    SERVICE_RPT: "Service report",
};
const MARK_LABELS = {
    SIGNATURE: "Signature",
    SIGNATURE_STAMP: "Signature + company stamp",
    INITIAL: "Initials + date",
    PAPER: "Signed on paper, scanned",
};
export function blockLabel(code) {
    return BLOCK_LABELS[code] ?? code;
}
export function documentClassLabel(code) {
    return CLASS_LABELS[code] ?? code;
}
function markLabel(code) {
    return MARK_LABELS[code] ?? code;
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}
function instant(value) {
    if (!value)
        return "—";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return "—";
    return `${date.toISOString().replace("T", " ").slice(0, 16)} UTC`;
}
export function buildSignatureCertificate(model) {
    const markImage = (value, label) => value && /^[A-Za-z0-9+/=]+$/.test(value)
        ? `<br><img alt="${label}" src="data:image/png;base64,${value}" style="max-width:120px;max-height:45px;object-fit:contain">` : "";
    const rows = model.signatures.map((signature) => `<tr>
      <td class="mono">${signature.stepNo}</td>
      <td>${escapeHtml(blockLabel(signature.blockCode))}</td>
      <td>${escapeHtml(signature.signerName)}${signature.signerRole ? `<br><span class="sub">${escapeHtml(signature.signerRole)}</span>` : ""}${signature.delegatedFromName ? `<br><span class="sub">delegated by ${escapeHtml(signature.delegatedFromName)}</span>` : ""}</td>
      <td>${escapeHtml(markLabel(signature.requiredMark))}${signature.stampCode ? `<br><span class="sub">stamp ${escapeHtml(signature.stampCode)} applied by ${escapeHtml(signature.signerName)}</span>` : ""}${markImage(signature.signaturePngBase64, "Signature")}${markImage(signature.stampPngBase64, "Company stamp")}</td>
      <td class="mono">${escapeHtml(instant(signature.decidedAt))}</td>
      <td class="sub">${escapeHtml(signature.authEvidence ?? "—")}</td>
    </tr>`).join("\n");
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signature certificate ${escapeHtml(model.documentNo)} ${escapeHtml(model.revisionLabel)}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #fff; color: #10161B; font-size: 11pt; line-height: 1.5;
  font-family: "IBM Plex Sans", "Noto Sans Thai", "Noto Sans JP", "Segoe UI", system-ui, sans-serif; }
.sheet { max-width: 178mm; margin: 0 auto; padding: 8mm 0; }
.head { border-bottom: 2px solid #10161B; padding-bottom: 8px; }
.eyebrow { font-size: 8.5pt; letter-spacing: .14em; text-transform: uppercase; color: #005E63;
  font-weight: 600; font-family: "IBM Plex Mono", ui-monospace, monospace; }
h1 { font-size: 19pt; line-height: 1.15; margin: 6px 0 4px; letter-spacing: -.01em; }
.sub { color: #6B7880; font-size: 8.5pt; }
p.sub { margin: 0; font-size: 10pt; color: #3D4A52; }
dl.grid { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid #CBD3D2; margin: 14px 0 0; }
dl.grid > div { padding: 8px 10px 9px; border-right: 1px solid #CBD3D2; border-bottom: 1px solid #CBD3D2; }
dl.grid > div:nth-child(3n) { border-right: 0; }
dt { font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; color: #6B7880; margin: 0 0 2px;
  font-family: "IBM Plex Mono", ui-monospace, monospace; }
dd { margin: 0; font-size: 10pt; font-weight: 500; }
h2 { font-size: 11pt; letter-spacing: .1em; text-transform: uppercase; color: #6B7880; margin: 22px 0 6px;
  font-family: "IBM Plex Mono", ui-monospace, monospace; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
th, td { text-align: left; padding: 6px 9px; border-bottom: 1px solid #CBD3D2; vertical-align: top; }
thead th { background: #EAEEED; font-size: 7.5pt; letter-spacing: .08em; text-transform: uppercase;
  color: #3D4A52; font-family: "IBM Plex Mono", ui-monospace, monospace; border-bottom: 1px solid #A9B4B3; }
.mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.hash { word-break: break-all; font-size: 8.5pt; }
.code { display: inline-block; font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 15pt;
  font-weight: 600; letter-spacing: .08em; border: 1px solid #10161B; padding: 6px 12px; }
.note { border-left: 3px solid #B4531F; background: #F7E7DD; padding: 10px 14px; margin: 18px 0 0; font-size: 9pt; }
.note strong { display: block; font-size: 7.5pt; letter-spacing: .1em; text-transform: uppercase; color: #B4531F;
  margin-bottom: 3px; font-family: "IBM Plex Mono", ui-monospace, monospace; }
footer { border-top: 2px solid #10161B; margin-top: 22px; padding-top: 8px; font-size: 8.5pt; color: #6B7880; }
</style>
</head>
<body>
<div class="sheet">
<header class="head">
<div class="eyebrow">${escapeHtml(model.legalEntity)} · Signature certificate</div>
<h1>${escapeHtml(model.title)}</h1>
<p class="sub">${escapeHtml(model.documentNo)} · ${escapeHtml(model.revisionLabel)} · ${escapeHtml(documentClassLabel(model.documentClass))}</p>
</header>
<dl class="grid">
<div><dt>Document</dt><dd>${escapeHtml(model.documentNo)} ${escapeHtml(model.revisionLabel)}</dd></div>
<div><dt>Class</dt><dd>${escapeHtml(documentClassLabel(model.documentClass))}</dd></div>
<div><dt>Locale</dt><dd>${escapeHtml(model.documentLocale)}</dd></div>
<div><dt>Project</dt><dd>${escapeHtml(model.projectLabel ?? "—")}</dd></div>
<div><dt>Owner</dt><dd>${escapeHtml(model.ownerName)}</dd></div>
<div><dt>Completed</dt><dd>${escapeHtml(instant(model.completedAt))}</dd></div>
</dl>
<h2>Signatures</h2>
<table><thead><tr><th class="mono">#</th><th>Block</th><th>Signer</th><th>Mark</th><th>When</th><th>Evidence</th></tr></thead>
<tbody>
${rows}
</tbody></table>
<h2>Integrity</h2>
<table><tbody>
<tr><th style="width:38%">Source file</th><td class="mono">${escapeHtml(model.sourceFileName)}</td></tr>
<tr><th>Source SHA-256</th><td class="mono hash">${escapeHtml(model.sourceSha256)}</td></tr>
<tr><th>Event chain head</th><td class="mono hash">${escapeHtml(model.chainHead)}</td></tr>
<tr><th>Events</th><td class="mono">${model.eventCount}</td></tr>
</tbody></table>
<h2>Verification</h2>
<p><span class="code">${escapeHtml(model.verifyCode)}</span></p>
<p class="sub">Open ${escapeHtml(model.verifyUrl)} and enter the code above to check this document against the system record.</p>
<div class="note"><strong>What this certificate is</strong>
A statement of what IoT Team Center recorded. Identity comes from the company Microsoft sign-in, not from a
certification authority, and this is not a certificate issued by one. Signature blocks marked as paper were
signed on a printed copy and scanned back; the scan is held against the step.</div>
<footer>${escapeHtml(model.legalEntity)} · IoT Team Center · generated ${escapeHtml(instant(model.completedAt))} · DSN-TC-005</footer>
</div>
</body>
</html>
`;
    // No BOM: the charset meta and the served content type both declare UTF-8, and
    // a BOM would change the hash for no reader benefit.
    return Buffer.from(html, "utf8");
}
//# sourceMappingURL=signing-certificate.js.map