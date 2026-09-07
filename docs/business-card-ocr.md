# Business-card OCR for customer entry

## User flow

Business-card scanning is available in both customer creation paths:

- `Master Data > Customers > Add customer`
- `Inquiry > New inquiry > ลูกค้าใหม่` and the related new-contact dialog

The scanner provides separate `เลือกรูปนามบัตร` and `ถ่ายรูปนามบัตร` actions. The camera input requests the rear camera on supported mobile browsers. Once selected, the image is resized locally, OCR runs in a Web Worker with Thai and English models, and recognized values fill only empty form fields. Existing typed values are preserved. The user reviews and edits the form before the normal save action.

The image is held in a temporary browser blob URL. It is not uploaded or stored by the OCR flow. Customer/contact creation continues through the existing audited APIs only after the user presses the form's save button.

Image preparation is best-effort and falls back to the original file after four seconds when a mobile JPEG decoder stalls. Preview cleanup does not cancel the OCR run that created it, cancellation only stops its own worker, and a two-minute watchdog returns the form to an editable state with a retry message.

## Extracted fields

- Company name
- Contact name
- Email
- Telephone
- Position
- Department
- Address/site

The result includes OCR confidence and expandable recognized text. Low-information results do not invent customer values and instead prompt the user to retake the photo.

## Build and runtime

`npm run prepare:ocr` copies the pinned Tesseract.js worker/core files and expands the packaged Thai/English trained data into `public/ocr`. The root dev and build scripts run this step automatically. Generated OCR assets are ignored by Git and remain reproducible from the exact package-lock versions.

The Team Test static server does not serve `.traineddata.gz` as a regular asset, so the preparation step intentionally expands the models and the browser worker uses `gzip: false`.

## Verification

- Business-card parser tests cover English, Thai, low-information input, mobile capture markup, local model paths, and both customer-entry integrations.
- The full root suite passes: 116 tests, with 2 expected environment skips.
- TypeScript, ESLint and the production Team Test build pass.
- A real Tesseract OCR smoke against a generated business-card image recognized company, contact, role, email, phone, and address at 91% confidence.
- Live Team Test checks return HTTP 200 for the page, API readiness, worker, three core variants, both language models, feature bundle, and scanner CSS.

## Practical limit

OCR accuracy depends on focus, glare, angle, text size, and card layout. The scanner is an entry aid: it never saves automatically, and users remain responsible for reviewing the extracted values.

## Import lifecycle correction (2026-09-06)
The preview URL effect previously invalidated the active scan whenever setPreview triggered an effect cleanup. The initial import therefore returned before OCR and skipped clearing busy because its run token had already changed. Preview changes now only revoke the old blob URL; scan invalidation/worker cleanup occurs on cancellation or unmount. Each async invocation owns its worker, so late completion of a canceled scan cannot terminate a subsequent scan. A 120-second watchdog restores the controls and explains retry/manual entry if decoding or OCR never settles; stale results cannot populate the form. Loading labels now identify image preparation, OCR library loading and worker initialization separately. Existing form values and the no-image-upload behavior remain unchanged.

Hotfix verification: 11 parser/lifecycle tests pass, including a deterministic reproduction that fails under the original preview cleanup. Includes a 4-second optional image-preparation fallback to the original file. Root typecheck and scoped ESLint pass. Released frontend PID26684; ProductionApp-B_EYK9L9.js and LAN page HTTP200; API unchanged/ready schema28. Browser interaction was not performed; lifecycle tests exercise real component handlers with simulated hook commits and deferred workers.

## Thai / English / Japanese names (2026-09-06)
OCR now loads packaged `tha`, `eng` and `jpn` models locally. Name candidates retain printed text by script; there is no translation or transliteration and no invented alternate language. When more than one company/contact name is detected, scanning pauses before autofill and offers company/contact selectors. The explicit apply button still fills empty fields only. A single-language card retains the existing automatic suggestion flow; users review before saving. The database continues to store the selected name in its existing field, not three separate multilingual fields.

The parser separates Japanese company forms, labeled/spaced personal names, job titles and addresses. English road abbreviations require word boundaries and certification strings (TUV, ISO, IATF) are excluded from inferred addresses. The original hang/cancel/timeout fixes are preserved.

Verification: 20 scanner/parser/lifecycle tests passed, including multilingual selection before applying and the screenshot's certification/address error. Typecheck and scoped lint passed. Actual OCR of a synthetic card recognized Thai, English and Japanese text with 90% OCR confidence; this is a controlled fixture, not a guarantee for real photographs. Frontend build and live HTTP checks passed. Japanese model returned HTTP200. Frontend PID32512 serves ProductionApp-BPJq7ks_.js; API unchanged and ready on schema28. No real customer data or DB schema was changed.

## Durable multilingual customer names (2026-09-06)

Customer and primary-contact names are now stored separately as Thai, English and Japanese values. OCR maps each printed language to its matching form field and continues to fill only blank fields. Position and Department remain attached to the primary contact. The English name is preferred as the compatibility display name, followed by Thai and Japanese, so older inquiry, report and integration fields still receive one stable name.

Existing customer rows keep their previous compatibility name. Their new language-specific fields start empty because the system cannot safely infer the language or invent translations for historical data. Users can complete those fields from Customer Master when the correct spelling is known.
