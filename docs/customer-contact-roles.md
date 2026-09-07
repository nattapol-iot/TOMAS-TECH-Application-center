# Customer contact position and department

Customer creation from Inquiry and Master Data now accepts the primary contact's Position and Department. Business-card OCR fills these fields only when blank. A contact name is required when personal role information is provided. Company-only End user creation continues to omit personal contact fields.

Both values live in the existing `customer_site_contacts` record for the matching active MAIN primary contact. No customer-level department column or new migration is added. Creating a customer and its primary contact remains a single audited transaction.

Customer Master displays the saved fields and allows editing. Omitted fields preserve existing metadata for older clients; explicit empty strings clear the value. Existing customer rowVersion validation and contact duplicate detection remain in force. Other contacts at the same company retain their own positions and departments. The Inquiry contact picker includes each person's saved role information.

Validation:

- Exact selective API build passed 38 SQL/API checks on a disposable schema28 database with a restricted application role, including save/read/bootstrap/edit, explicit clearing, omitted values, stale rowVersion and unrelated-contact preservation.
- Six backend unit checks, root/Node typechecks, focused ESLint and 30 form/OCR/End user checks passed.
- Test fixtures use synthetic identities; no real customer records were modified during testing.

Release isolation: Sales KPI migration29 was still pending separate approval. The customer API release was therefore prepared from the deployed schema28 baseline and replaced only `sales-customers`, `master`, and `bootstrap` compiled route artifacts. Existing dependencies, permissions, readiness and other API modules remain at the deployed baseline. The staged artifact manifest is validated by `scripts/Publish-CustomerContactHotfix.ps1`, which restores the previous release if readiness fails.

Live release: API 20260906-083216-customer-contact PID4364, frontendPID32620. LAN page and new customer fields bundle HTTP200; APIready28. Deployed API artifacts match the tested selective stage. OCR multilingual/hang fixes and latest KPI CSS preserved.
