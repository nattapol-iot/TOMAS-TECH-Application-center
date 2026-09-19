# CRM V1 implementation impact

## Baseline and boundaries

Inspected main at `fe7d525a`. CRM adds an operational sales workspace; Inquiry remains technical intake. Existing estimate calculations, approvals, project creation, resource planning, procurement, document revision and authentication are unchanged. No shared database writes or deployment are part of this local implementation.

## Reuse and additions

- Reuse `customers`, `customer_sites`, `customer_site_contacts`, `users`, effective permissions, `audit_log`, document-storage provider and inquiry numbering/creation.
- Add migration 053 for opportunities, CRM activities, follow-ups, configurable choices/inactivity thresholds and document references. Extend customer/contact metadata and inquiry source references additively.
- Add CRM API/domain helpers and screens, wire CRM & Sales navigation, existing My Work and inquiry backlink. Use existing i18n, API client, form/table/modal styling.
- Opportunity values require commercial permission; lists, detail, activity, follow-up and documents enforce the same owner/team/all scope on the server. Writes use transactions, audit and optimistic concurrency.
- Customer 360 resolves existing inquiry → estimate → project relations, rather than copying downstream records. Existing document provider continues to own bytes.

## Risks and verification

- Apply 053 only after 052; preserve all existing rows. SQL reference validation must reject mismatched customer/site/contact and cross-opportunity access.
- Conversion must be atomic with existing inquiry creation; failures must not leave orphan links. Stable opportunity numbers must not be reused.
- Verify stage/lost validation, attention calculation, commercial redaction, permission/scope checks, stale writes, conversion, translations, navigation and My Work. Run backend build, frontend typecheck and targeted tests sequentially.
- SQL/browser UAT is reported separately from static/unit verification. Service history reads existing `unified_reports` of type `SERVICE`, with the existing report/project scope. No service-request workflow is introduced.

## Delivered behavior

- CRM & Sales navigation keeps the existing Site Visit and My Assignments entries. CRM sidebar count is actionable opportunities; existing unrelated badge calculations stay intact.
- Shared customer/site/contact management, customer history by year, compact opportunities, pipeline, activity timeline and follow-ups. Activities use server pagination; pipeline/opportunity lists expose pagination.
- Stable opportunity numbers, configurable translated sources/contact roles/lost reasons and stage inactivity thresholds. Lost/Other validation, commercial redaction and row-version conflicts are enforced on the API.
- Opportunity-to-Inquiry conversion uses the existing creation handler in a transaction, retains source references and inherits existing customer/contact/site/owner/requirement data. Related estimates/projects are read from their existing records; project visibility also checks existing membership scope.
- CRM next actions and inactivity appear in My Work. Activity attachments use the current document-storage provider and scope checks; Inquiry links back to source activities/documents.
- Customer 360 includes existing Service reports and opens their source project/inquiry. The repository has no separate customer Service Request or customer Issue register to count; CRM does not create substitute workflows.

## Verification — 2026-09-19

- Backend TypeScript build, frontend typecheck, scoped ESLint and `npm run build:local`: passed.
- Backend CRM/customer/migration tests: 22 passed. Frontend CRM/i18n/My Work/Inquiry/customer regressions: 27 passed.
- Disposable SQL Server LocalDB: migrations 001–053, repeat 053, SQL fixture and role-aware API integration passed. Tests cover create/edit, Lost, stale writes, scope denial, commercial redaction, next action/My Work, conversion/backlink/audit, documents upload/download, localized names, configurable stages, site/contact edits, year filtering and existing Service reports with project/report scope.
- Browser checks against the private test API: create opportunity, pipeline, Customer 360, create meeting, timeline/next action and TH/EN/JP presentation. Fixed an i18n alias collision so existing Save labels remain unchanged.
- Browser harness uses test-only actor injection; production sign-in and configured Microsoft 365 storage are not claimed as tested. Document integration used an isolated local provider directory.
- Temporary UI route and browser tab removed; temporary frontend/API servers and disposable SQL instances stopped and removed. Shared/production data was not modified.

## Deployment handoff

Release includes upstream Support email preferences (052), followed by CRM (053). Migration 053 must be applied through the normal deployment mechanism after 052 before using CRM. Existing production data is not backfilled into fictional opportunities. No dependencies or authentication methods changed.

For business acceptance after deployment, use an actual Sales account to create an opportunity for an existing customer, add a meeting and assigned next action, verify the assignee's My Work, convert to Inquiry and follow its source link. Check an unrelated Engineer cannot open the opportunity and cannot read commercial values. Repeat key screens in TH/EN/JP and test an attachment with the configured document provider.

Release verification: rebased onto `543450fe`; CRM migration renumbered to 053 because upstream 052 was already deployed. Re-ran disposable SQL migrations 001–053 and API integration, 49 targeted tests, backend build, frontend typecheck and frontend build successfully before push.
