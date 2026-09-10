# Inquiry-first customer workflow

Implemented 2026-09-05 following the user's approval of the reviewed flow.

Inquiry is the customer case. Its main actions are creating an estimate or requesting
a site visit. The visit request copies customer, site, contact, requirement, ownership,
priority and due date from that inquiry. Site-specific readiness and technical review
remain explicit. Requests and their visits are accessible from the inquiry's
“เข้าหน้างาน / ผลสำรวจ” tab. Site Visit provides preparation/review, scheduling,
execution and reports; its detail returns to the original inquiry for estimating.

The standalone Sales Intake navigation entry is removed. Existing requests remain
under Site Visit → คำขอ / ตรวจข้อมูล, including the technical review queue and sales
dashboard. Editable legacy requests can select an existing inquiry belonging to the
same customer. Existing unlinked visits retain their legacy conversion path. Both
Node and .NET reject creating another inquiry when the visit or its parent request
already links to one, within the transaction used for creation.

No tables were merged, historical documents overwritten, or migration applied.
The inquiry-scoped request filter runs on the server. Reports remain on their visits,
reachable through the original case; they do not overwrite customer requirements.
The new request form still applies the existing technical-review readiness rules.

## Project document handover (Node API)

Creating a Project from an approved estimate also copies active source documents
into the Project document register and configured storage. Source files remain
unchanged. This is a snapshot at creation, not continuous synchronization or a
retroactive update to existing projects.

- Inquiry attachments, active inquiry-linked supplier quotations, and related
  Sales Intake / Site Visit attachments are categorized into the 15-folder
  template. Deleted attachments are excluded; intake/visit files marked Infected
  or Failed block creation until reviewed, rather than silently disappearing.
- Drawing / Layout → 02; Estimate → 03; Quotation → 04; PO → 05;
  RFQ / requirements / specifications → 06; meeting notes / measurements /
  reports → 10; manuals → 11; photos / videos → 13; other references → 14.
  Explicit business categories take priority over image/video MIME types.
- The Inquiry requirement, approved Estimate totals, and current approved Site
  Visit report are also saved as UTF-8 `.txt` snapshots. These are data snapshots,
  not generated signed PDFs or replacement quotation documents.
- Each copied document retains its original name, uploader and upload time. Its
  remark records the source number, attachment ID, category and version. Different
  documents with identical filenames remain separate.
- Copies receive distinct Project storage keys. Size/checksum failures abort
  Project creation and roll back its folders, members and document metadata.
  Newly written files are removed after a definite rollback; an unknown database
  commit outcome preserves them and logs an error for reconciliation.
- The creation response includes `documentsTransferred` (copies plus snapshots),
  and the Project audit records the count. Existing Project membership checks
  protect listing and downloading the copies.

No database migration is required. All 15 template directories are created in
configured storage and their keys saved on the folder records. Synchronous
handover is limited to 200 source files and 500 MB per project; larger sets are
rejected before file copying rather than holding revision locks indefinitely.

### Handover verification — 2026-09-10

- `backend-node\node_modules\.bin\tsx.cmd backend-node\tests\project-document-carryover-integration.ts`
  from the repository root: **56 SQL/API checks passed** against a disposable
  SQL Server database and restricted application role. Customer/Inquiry,
  attachments, intake submission/review, visit assignment/acceptance/confirmation,
  check-in/out, report approval, estimate man-hour input/approval and Project
  creation all use real API requests. Seven documents are transferred; all 15
  physical folders, byte integrity, source provenance, authorized downloads,
  unrelated Inquiry isolation, corrupt-file rollback and failed-scan rejection
  are asserted. No shared business data is used.
- Backend build/typecheck and **105 unit tests passed**. Existing End User SQL
  integration passed **50 API checks** during implementation. Targeted Inquiry,
  Site Visit and Report UI regression tests passed **9 checks**.
- Frontend scoped typecheck, lint on both changed screens, and isolated Team Test
  build passed. Repository-wide typecheck still encounters unrelated dependency
  errors in `outputs/company-cutover/backend-node`; the scoped check excludes
  these generated release copies. Browser interaction testing was not performed.
- End-to-end testing also found and fixed two existing blockers: man-hour INSERT
  now uses trigger-compatible `OUTPUT INTO`; the application-role setup grants
  SELECT on intake reviews and visit confirmations/schedule/status history,
  while keeping those records immutable. Existing installations need these
  additive read grants when the change is released.
- Changed implementation: `backend-node/src/project-handover.ts`,
  `backend-node/src/document-storage.ts`, `backend-node/src/routes/projects.ts`,
  `backend-node/src/routes/estimate-workspace-write.ts`,
  `database/scripts/010_application_login.sql`, and handover copy in
  `InquiryScreens.tsx` / the Project modals in `CoreScreens.tsx`.
- Validation is local and isolated. The shared running app and the separate
  Sites cloud project have not been redeployed by this task.

The customer intake form shows five main inputs, with optional details expandable.
Inquiry and preparation tables are reduced to eight and six columns respectively.
Their second search boxes are hidden, and preparation rows explain the next action
without pretending the preparation and visit statuses are one state. My Work links
to the user's site assignments.

## Validation and local release

- Frontend typecheck, lint, and Team Test build passed; .NET build passed.
- Node tests: 25 passed; API typecheck/build passed.
- Root tests: 84 passed, two environment-dependent SQL/PowerShell checks skipped
  in the sandbox. Targeted flow tests cover copying without modifying the source,
  nullable references and next actions after a closed visit.
- Live local API regression: nine assertions passed, including scoped listing,
  customer consistency, duplicate rejection and estimating on the original inquiry.
- Script: `tests/integration/inquiry-visit-flow-uat.ps1`. Retained labeled fixtures:
  INQ-2609-0012 / EST-2609-0013; test request SIN-2609-0005 was cancelled afterward.
  SV-2609-0003 was used only for a rejected duplicate request, not modified.
- Managed Node release: `20260905-134019`. Frontend and API returned HTTP 200;
  served frontend bundle was checked for the new workflow. Browser interaction
  testing was not performed.
- Delivered on the existing local Team Test app at http://192.168.1.160:3000;
  the separate Sites cloud project was not changed.
