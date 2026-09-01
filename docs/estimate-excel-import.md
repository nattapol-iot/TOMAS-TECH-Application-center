# Excel Estimate Cost import

Open an editable Estimate → Cost Items → Import → choose the company `.xlsx` workbook → review the source customer/project, source price date, hours/day, categories, excluded rows and reconciled total → Confirm import.

Supported company layout: `Summary cost`, description E, unit price J, quantity K, amount L and direct-cost `SUM(L9:L...)`. Referenced detail SUM ranges are expanded; Summary quantities determine scope. The supplied HOWA and TOYO R3 workbooks are verified. Other layouts use the existing header-table CSV/TSV/XLSX importer. Maximum file size 20 MB, expanded archive 80 MB, 1,000 imported rows. Excel must have saved calculated values; formulas and external links are not executed.

Internal labor becomes Man-hour lines with the historical daily rate, source price date and explicit hours/day (default 8); the imported daily rate is preserved when adjusting quantities. Outsourced work remains cost items. Customer-provided equipment is recorded in import history with zero purchase cost. Profit/overhead beyond direct cost are excluded to avoid counting them twice. Unknown suppliers retain their source name in notes. The original file bytes are not stored.

Only the estimate owner, Engineering Manager or Admin with estimate.write may import. Editable states: Draft, Engineering Input, Revision Required. Every insert is in one transaction; invalid rows, unavailable suppliers, duplicates and stale row versions roll back all rows. An identical canonical import in the same revision returns the original receipt. It never approves an estimate, changes a project or edits historical revisions. Revision cloning carries immutable import provenance to copied labor lines. Normal Rate Master validation and approval rules continue to apply.

Migration 032 updates historical-rate validation using audited original rate/date/department/type and must be installed before API import. For the existing Team Test runtime use Apply-EstimateExcelImportMigration.ps1 (verified COPY_ONLY backup first) then Publish-EstimateExcelImportHotfix.ps1 with a tested selective stage. Pending migration029 is not part of this hotfix.

Verification: six synthetic parser cases and two API payload tests; real-workbook SQL UAT and exact staged API passed 26 endpoint checks covering totals, owner permission, repeat import, all-or-nothing rollback, concurrency, locked estimates, revision cloning, quantity edits/removal and rejection of a tampered historical rate. HOWA: 28 cost + 6 labor + 3 customer references = 60,950.00 THB. TOYO: 56 cost + 13 labor = 618,944.01 THB. Existing manually entered HOWA/TOYO estimates are not converted or reimported by this release.


The opt-in tests/integration/estimate-excel-import-uat.mjs runner requires an isolated EXCEL_IMPORT_UAT_DATABASE (name prefix enforced), migrations through032, and cached-cell JSON fixtures at EXCEL_IMPORT_HOWA_FIXTURE / EXCEL_IMPORT_TOYO_FIXTURE. Customer workbook data stays in ignored tmp files. Run from repository root after backend build with node --experimental-strip-types.
