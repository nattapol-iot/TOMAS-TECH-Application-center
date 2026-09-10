# Signing and Module Templates — Team Test release

Date: 2026-09-05. User approved both Signing deployment and migration 020.

## Running release

- Frontend: http://192.168.1.160:3000/, managed Team Test frontend launcher.
- Node API: port 5105, release `20260905-121632`, managed release updater.
- SQL: `IoTTeamCenter_CodexTest_20260830_04`, migrations 1–20 installed.
- Before 020: COPY_ONLY/CHECKSUM backup verified with RESTORE VERIFYONLY:
  `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_UAT_before020_20260905_1205.bak`.
- Earlier API release directories remain available for rollback. Migration is
  additive; do not drop the new tables as a routine application rollback.

## Corrections made while verifying

1. Rename the local `module` binding without changing the JSON/API field name.
2. Set the SQL options required for the filtered index in standalone migration 020.
   The first attempt rolled back; the corrected migration completed successfully.
3. Include 020 in fresh deployment, production baseline, role grants and test
   expectations. Preserve grants for Resource Plan when the role is normalized.
4. Parse numeric JSON `templateId`, `estimateId`, and `supplierId` as positive
   integers, not query-string values. Regression test covers frontend number types.
5. Applying the same module twice now allocates a unique item code (suffix -2,
   -3, etc.) within the existing estimate transaction and SQL collation. Original
   and allocated codes are recorded in the audit entry. Models/specifications are
   preserved; no business uniqueness constraint was removed.
6. Module Template list and detail tables now default to Show 50 with page-size
   controls and pagination. Library paging is server-side, not a silent 200-row cap.
7. Search totals now share the row filter, so filtered pagination no longer shows
   the count of the entire library. Regression test and real UI search both verified.

## Verification

- Backend tests: 22/22; typecheck/build passed.
- Full root tests: 80/80, including fresh SQL material/schedule/reporting integration;
  lint and typecheck passed after table changes. Final search-total backend changes
  separately linted/typechecked/built and covered in the 22-test backend suite.
- `tests/integration/signing-template-release-uat.ps1`: 21 live checks passed.
  It reads Signing metadata, verifies anonymous and Viewer restrictions, then creates
  only labelled UAT Inquiry/Estimate/Template records. It never uploads a specimen,
  stamps, signs a document, or changes a signing flow.
- Verified template create, edit/revision, stale row-version conflict, quantity
  multiplication, repeat apply, zero-price apply, save from estimate, and retirement.
- Completed fixture: Inquiry INQ-2609-0009, Estimate EST-2609-0010 (id 14),
  reusable template UAT-COPY-20260905-121134 (id 5). Reference total 750 THB.
- Earlier failed diagnostic runs also left clearly labelled UAT fixtures; no real
  project records were deleted or overwritten.
- Browser: `/verify?code=TC-2222-2222-2222` opens the authenticated verification
  panel and reports unknown code, not false validity. A separate unauthenticated
  tab shows Team Test login before any signing metadata. New routes no longer 404.

## User workflow

- Signing: **Sign Inbox**, **Signed Documents**, **Company Stamps**, and user menu
  **My signature**. Own-specimen management is authenticated-user-only by design;
  it does not grant signing authority. Seeded Viewer has signing.read, not signing.sign.
- Verification link: `/verify?code=...`, login required, then auto-check.
- Templates: **Module Templates** under Administration; or Estimate → Cost Items →
  **From Master Template**. Save a module with **Save as template** on its module bar.
- Reference prices are historical, not confirmed current supplier quotations.

## Boundaries still unchanged

- Company stamps remain empty pending the user's legal-entity/seal decisions.
- Certificate remains print-ready HTML; PDF generation/library decision is pending.
- This release check does not claim a new full legal-signature workflow was executed:
  no person was impersonated and no actual signing event was created by this task.
- Team Test remains LAN/UAT, not Entra Production. Optional SIGNING_* variables
  retain existing defaults; require a separate configured production rollout.
- Existing migration 013 supplier storage-key index-width warning and frontend
  bundle-size warning are outside this release fix and remain visible in test/build logs.
