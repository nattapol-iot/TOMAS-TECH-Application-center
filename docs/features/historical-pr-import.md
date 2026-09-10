# Historical PR import

Open **Purchase Requisition → PR ย้อนหลัง → Import PR ย้อนหลัง**. Select the original `.xlsx`, preview all rows and totals, then confirm. Maximum file size: 8 MB. Supported template: TOMAS PR sheet with Project Number at C2 and Model/Part Number / PO Number at E8 / V8; currency THB. Hidden template and duplicate summary sheets are not imported.

- Strikethrough means PR issued; it never cancels or removes demand.
- Cancelled PO lines remain in history and can be linked manually to a replacement PO item from the same workbook. No replacement association is guessed.
- Approved, pending, cancelled and unknown PO amounts are separate. Active amount is approved plus pending, not all historical quotations.
- Blank actual costs remain unspecified; quoted totals are used as reference where actual is absent. Missing or zero estimate budget is not evidence of an overrun.
- Import stores the original file, source hash, all item rows, author/date/revision and audit actor. It does not create live purchase orders, inventory movements, goods receipts, notifications or new purchase demand.
- Identical source bytes for the same source project are idempotent. Revised files create immutable versions after an explicit preview; previous versions and their mappings remain available. A new version starts with no reconciliation mappings.
- Link each historical item to the project's current estimate item/module when known. The comparison is for this document's mapped active rows only, not project-wide spending. Old cancelled PO costs are excluded.
- When the project does not exist, Admin / Purchasing / Engineering Manager with procurement request permission may archive against its original project number. The UI marks it **รอเชื่อม Project**. Create the real project separately, then use **เชื่อม Project**; the project number must match exactly.
- Project scope and procurement permissions apply server-side. Source downloads require the same access. Concurrent mapping edits or stale import previews are rejected instead of silently overwriting another user's work.

## Deployment and verification

The Node API requires migration `033_historical_pr_import.sql` and pinned `fflate` / `fast-xml-parser` dependencies in `backend-node/package-lock.json`. Fresh database deployment includes migration 33. `Apply-HistoricalPrMigration.ps1` first creates and verifies a copy-only backup of the configured local Team Test database. `Deploy-HistoricalPrApi.ps1` stages only the historical-import modules in a copy of the current API release and keeps the previous release for rollback.

Unit tests: `cd backend-node` then `node --import tsx --test tests/historical-pr.test.ts`.

SQL integration tests: `node --import ./backend-node/node_modules/tsx/dist/loader.mjs backend-node/tests/historical-pr-integration.ts`. These use a separately named disposable test database, exercise permissions, idempotency, revisions, reconciliation, source downloads, unlinked projects and least-privilege grants, then remove only that test database.

`Import-HistoricalPrTeamTest.ps1 -Path <original.xlsx>` previews against the saved local Team Test API. Add `-Apply` only for an explicitly authorized import. It uses the supplied actor's Team Test authentication without printing credentials and verifies stored hash and row count afterward.

Completion checks (2026-09-06): 36 isolated SQL/API assertions plus parser and reconciliation tests. Zero estimate budget shows unavailable comparison, explicit actual cost 0 stays 0, and quoted fallbacks are identified. Stale estimate revisions remain visible and must be rematched before save. Closing or changing source version warns about unsaved mappings. Prior unlinked archives retain their original access scope even after a Project is created.
