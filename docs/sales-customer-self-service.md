# Sales customer and contact creation

New Inquiry includes customer creation and reusable contact selection. Sales can register a new company without leaving their unfinished inquiry, then add a contact and use the saved name in the inquiry. A company name is required; a customer code can be supplied or generated. Email and phone in the new-company dialog belong to its initial contact and require a contact name.

Customer contacts reuse `customer_sites` and `customer_site_contacts`, also used by Site Visit. Choosing Main office creates the `MAIN` site if needed. Other active sites can be selected when adding a contact. Existing `customers.contact` remains available as the legacy primary contact. Inquiry continues to store a name snapshot in its existing `contact` field; this release does not introduce a contact foreign key or retroactively change existing inquiries.

The new Node endpoints are:

- `POST /api/v1/sales/customers`
- `GET /api/v1/sales/customers/:customerId/contacts`
- `POST /api/v1/sales/customers/:customerId/contacts`

Writes require `intake.write` or `master.write`. Existing standard Sales Engineer and Sales Manager roles already have `intake.write`; no broad Master Data editing permission is granted. Reads require `inquiry.read`, `intake.read`, or `master.read`. The existing Master Data editing endpoints retain their original permission requirements. No migration is needed.

The API validates customer/site ownership and active state, rejects existing customer codes/names and duplicate contact names/emails at a site, and audits company, site, and contact creation in the same transaction. These are exact case-insensitive checks after trimming, not fuzzy company-name matching. Similar spellings still need human review. No existing customer data is merged automatically.

Verification: `backend-node/tests/sales-customer-integration.ts` creates a randomly named disposable SQL database with a restricted application role. It checks sales and manager access, rejection of unauthorized writes, validation, duplicates/concurrent submissions, shared Site Visit records, New Inquiry persistence, and inactive customers. It drops only that generated database after testing. Run from repository root with `node --import ./backend-node/node_modules/tsx/dist/loader.mjs backend-node/tests/sales-customer-integration.ts`.
