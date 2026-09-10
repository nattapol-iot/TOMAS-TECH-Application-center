# Employee manual application integration

The authenticated application exposes the employee handbook through an
unrestricted **Employee Manual** navigation item beside Support Center and a
second shortcut in the user menu. Every signed-in employee can use it without a
new API permission.

`EmployeeManualScreen.tsx` provides a compact help-centre header, language and
offline indicators, a full-screen link, a one-file download, and a same-origin
iframe. The iframe points to
`/manual/employee-operation-manual.html?lang=th|en|ja&embedded=1`. The language
follows the application TH / EN / JP selector. Embedded mode hides the handbook's
duplicate top bar while keeping its contents, search, procedures, screenshots,
image enlargement and print support.

The handbook remains self-contained. Its Google Font files and all 117 screenshot
images are data URLs inside one HTML document, so downloading the public file is
enough for offline use. The app does not call a handbook API or write business
data when the screen opens.

## Maintenance

1. Review and update the handbook source in
   `scripts/build-employee-operation-manual.py` and its translation/renderer
   modules.
2. Run `scripts/fetch-manual-google-fonts.ps1` when new characters are added.
3. Run `python scripts/build-employee-operation-manual.py`.
4. The builder writes byte-identical copies to `output/` and
   `public/manual/employee-operation-manual.html` and verifies current navigation
   coverage.
5. Run `node --test --test-isolation=none tests/employee-manual.test.mjs`,
   `npm run typecheck`, scoped ESLint and the local production build.

Validated on 2026-09-07: 40 chapters, 95 procedures, 34 navigation views,
39 screen sets / 117 localized images, two embedded WOFF2 font files, and no
external font request. The compact handbook was visually checked in Chrome from
the generated public asset.
