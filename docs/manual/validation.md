# Illustrated employee manual — edition 2.0

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

- `output/IoT-Team-Center-Employee-Manual.html`
- `output/IoT-Team-Center-Employee-Manual-TH.html` (compatible previous path)
- `public/manual/employee-operation-manual.html` (in-application copy)
- `output/employee-manual-preview.jpg`
- `output/employee-manual-preview-jp.jpg`

Open the HTML file with Chrome or Edge, select ไทย / 日本語 / English in the top
bar, and use the contents or search. All screenshots are inside the HTML; copying
that one file is sufficient for offline reading.
