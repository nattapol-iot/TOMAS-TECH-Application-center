# Signed file preview and placement

Released to Team Test on 2026-09-05. No database migration: migration 018 already
provides page_no/pos_x/pos_y/width/height on immutable signature_marks.

## Usage

1. Open Sign Inbox or Signed Documents, then a document.
2. For a pending step assigned to you, choose **Preview, move & resize signature**.
3. Select the page; drag the signature or resize its corner, or enter percentage
   coordinates. Keyboard arrows move; Shift + arrows resize. For an authorized
   company-stamp step, choose the stamp separately and position it too.
4. Confirm that the page and placement are correct, then **Use these positions**.
   This does not sign. **SIGN DOCUMENT** remains the explicit signing action.
5. Once mandatory steps are complete, **View signed file** previews the stored PDF
   and allows download. The request-history table also opens older signed outputs.

The source/previous-marks preview works before completion. Earlier marks without
page coordinates are identified clearly; they are preserved on the certificate,
not assigned invented positions. Completed marks/outputs cannot be moved or resized.
Use a new revision and a new approval round for changes.

## Implementation

- `SigningPreview.tsx` renders authenticated bytes with PDF.js, local bundled worker,
  page selection, pointer/keyboard controls, explicit confirmation and read-only mode.
- `signing-preview-client.ts` reuses existing apiRequest/auth; api-client.ts was not
  edited to avoid a shared-file claim. No public URLs or raw other-user specimen API.
- GET `/api/v1/signing/documents/:id/preview?fileId=...&stepId=...` validates document
  scope, revision ownership, current step/assignee and stamp authority. It returns
  normalized PDF bytes with completed positioned marks, and only the current signer's
  active specimen. Response is `Cache-Control: no-store`.
- Existing POST step/sign accepts placement, optional stampPlacement, sourceSha256
  and previewSpecimenId. Coordinates are validated against actual file geometry;
  changed source/specimen, wrong page, off-page rectangles and stale row versions
  are refused. Coordinates are inserted and recorded in the event hash chain in
  the signing transaction. Existing non-positioned API clients remain supported.
- `signing-pdf.ts` uses top-left normalized CropBox coordinates, compensates for
  rotations 0/90/180/270, preserves image aspect ratio, and generates an immutable
  PDF containing source pages plus a signature-record appendix. The original file
  is not overwritten. Downloads retain existing authorization and rate limiting.
- Old HTML certificates remain unchanged and preview in a sandboxed iframe. New
  positioned outputs are PDFs; all-anchor legacy workflows retain HTML output.

## Supported formats and limits

- Positioning: PDF, PNG, JPEG, 1–200 pages. Images are rendered on a PDF page.
- Other formats retain original download and the existing certificate workflow;
  convert to PDF to choose page coordinates. Encrypted/unreadable PDFs, PDFs with
  digital-signature fields, and unsupported geometry fail with explicit messages.
- This is an internal electronic-signing workflow, not PKI signing. It must not
  rewrite an externally digitally signed PDF or claim certificate-authority assurance.
- PDF appendix uses an ASCII built-in font (non-ASCII metadata renders as `?`);
  full names remain in API/UI/event history. A bundled licensed Unicode font/adapter
  is a follow-up for fully localized appendix text. Original page content is retained.
- Existing uploaded stamp image storage/authority conventions are unchanged; there
  are no live company stamps and no stamp authority was created by this work.
- Dependencies: pdf-lib 1.17.1 (Node) and pdfjs-dist 6.3.289 (browser), pinned.
  References: [pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfpage),
  [PDF.js canvas/viewport](https://mozilla.github.io/pdf.js/examples/index.html).
  Frontend bundle-size warning remains; PDF engine loads on demand. Existing root
  npm audit findings were not auto-fixed or used to rewrite unrelated dependencies.

## Verification and release

- Node 28/28 tests, Node typecheck/build, root typecheck and final full lint passed.
- Root regression tests 90/90 passed, including fresh SQL integration.
- Isolated Drawing SQL integration passed scoped preview, bad page/hash rejection,
  named specimen, persisted coordinates, immutable completed output, authorized
  download, Admin+Management separation, ordering, returns and revisions.
- UI harness (no real accounts): actual PDF worker/canvas, drag, resize, confirmation,
  stamp selection, read-only output, page navigation, download and narrow viewport.
- TEST ONLY PDF was rendered with Poppler and inspected visually. A headless live
  browser authenticated to Team Test and opened DWG-2609-0001 preview successfully.
  No real-person signing, signature upload, approval or stamp use was performed.
- API release `20260905-141507`, PID 44052; frontend PID 12468. Existing
  `http://192.168.1.160:3000/`; schema remains 23.
- Primary files: SigningScreens.tsx, SigningPreview.tsx, signing-preview.css,
  signing-preview-client.ts, pdf-worker.d.ts, routes/signing.ts, signing-pdf.ts,
  signing-pdf.test.ts, drawing-integration.ts, tests/ui/signing-* and package locks.
