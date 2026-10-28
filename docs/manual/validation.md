# Illustrated employee manual — edition 2.0

## Update 2026-10-28

What changed:
- Chapter 21 now covers the Pegasus ERP purchasing flow:
  - a PR within module budgets: no supplier, substitutes and unplanned lines, Excel round trip;
  - approval by the PM, and by the Engineering Manager when a module is more than 10% over;
  - the automatic send to the ERP, the "ส่งเข้า ERP" fallback, and the ERP status and PO number.
- Chapter 23 now says that new POs are raised in the ERP; the in-app list keeps earlier POs only.
- Smaller fixes:
  - the chapter 3 purchasing row;
  - chapter 20 now says the BOM takes material lines only.
- New chapters 29 Download Center, 30 Site Monitor and 31 Installed Base. The chapters after them moved by three, and their procedures were renumbered to match.
  - These menus had no chapter before, so the build gate had been failing.

Results:
- The rebuild passes with 43 chapters and 110 procedures, matching in TH, EN and JP. It covers all 28 navigation views, and every source reference resolves.
- Every internal fragment link resolves. The HTML outside scripts and styles has balanced tags, and the embedded script passes `node --check`.

Not done:
- The screenshots are still the 2026-09-06 captures. The PR screenshot shows the older screen, with a Supplier column. The three new chapters have no screenshot.
- There was no browser visual review in this update.

The rest of this page records the 2026-09-07 validation.

Validation completed on 2026-09-07 (Asia/Bangkok), using the 2026-09-06 content and screenshot baseline.

- Thai, English and Japanese: 40 chapters, matching identifiers for all 95 procedures, and 9 tables in each language.
- All 34 current primary navigation views remain covered by the source-backed chapter manifest, including the in-app Employee Manual.
- 39 distinct actual Team Test screens, each captured with TH / EN / JP selected: 117 embedded JPEGs. Original screenshot bytes are preserved. Hashes and captions are recorded in `screenshots/manifest.json`.
- All embedded image bytes match the source captures and pass JPEG decoding. The 43 displayed figures in each language include the cover and intentional reuse in related chapters.
- The initial HTML and every localized chapter have balanced tags; IDs are unique and all internal fragment links resolve. No external libraries, scripts, font requests or image URLs are required.
- The runtime JavaScript passes `node --check`.
- The prior Chrome QA baseline confirmed that English and Japanese switches update headings, contents, instructions, controls, captions and screenshots. The current rebuild has 40 chapters and 95 matching procedures in each language, with no Thai text remaining in English or Japanese chapter text.
- Japanese search for `署名` returns 10 relevant chapters. Collapse, clear and expand preserve the expected state; clearing restores all 40 chapters. Image enlargement and closing work.
- Desktop screenshots were visually reviewed in Thai and Japanese, plus the English enlarged image. No horizontal document overflow was observed at the normal desktop viewport.
- Print preparation/restore and A4 CSS are included; physical printing and the native PDF destination dialog were not exercised.
- The former `IoT-Team-Center-Employee-Manual-TH.html` file is byte-identical to the new multilingual file for compatibility.
- `public/manual/employee-operation-manual.html` is also byte-identical and is the same-origin copy embedded by the Employee Manual application screen. `?lang=th|en|ja&embedded=1` selects the application language and compact embedded layout.
- Typography uses text-optimized Google Fonts subsets: one Noto Sans Thai file for Thai/English and one Noto Sans JP file for Japanese. Both are WOFF2 variable fonts (weight 400–800), and both OFL 1.1 license texts are embedded in the standalone HTML, so the font requires no network request. Keeping each language in one font file prevents Thai base characters and combining marks from falling into different font subsets.

Browser QA used a temporary loopback server exposing only the handbook because
the browser tool disallows `file://` navigation. The QA tab and server were closed.
The Google Font rebuild was verified statically because current browser automation
again blocked control of the local `file://` handbook tab under its URL policy.
The employee application was returned to its original Thai Master Data view with
the original navigation groups collapsed. No business records were created,
submitted, approved, signed or deleted to obtain these screenshots.

Screenshots illustrate accessible employee-account screens, including genuine
empty lists. They do not establish that every transaction or integration was
tested. The Signed Documents capture with a load error was excluded. Some strings
inside the source application remain in their original language; the handbook
does not alter or fabricate those screen contents.

Deliverables:

- `public/manual/employee-operation-manual.html` (the only copy; served at `/manual/` and offered as the download)
- `output/employee-manual-preview.jpg`
- `output/employee-manual-preview-jp.jpg`

Open the HTML file with Chrome or Edge, select ไทย / 日本語 / English in the top
bar, and use the contents or search. All screenshots are inside the HTML; copying
that one file is sufficient for offline reading.
