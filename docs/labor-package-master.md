# Labor Package Master

Use **Administration → Labor Package Master** to find saved packages, including
Draft packages that do not appear in the Estimate's published-package picker.
The Estimate man-hour tab also has **จัดการ Labor Package**.

After **Save as labor package**, the confirmation shows the saved code and Draft
status. **เปิดรายการที่บันทึก** opens that exact package without leaving the Estimate.

Drafts may be edited with `estimate.write`. Publishing requires both
`estimate.write` and `master.write`. Published packages are immutable; create a
new draft copy for changes. Publishing is an explicit action, never part of save.
Once Active, a package appears in **Labor package library** for use in Estimates.

Saving a package preserves activity, effort, supplier/internal provider, rate
reference and ERP category. Applying an internal activity still resolves the
current rate from the rate master. Editing the library does not reprice existing
Estimate lines.

This UI uses the existing schema 44 API and row-version concurrency checks.
No additional database migration is required.

## Verification — 2026-09-11

- Root tests: 279 passed; lint and typecheck passed.
- Existing labor backend tests: 39 passed.
- Browser verified under the existing Engineer session: navigation, all-status
  list, stored Draft LP-SOFTWARE-DEVELOPMENT (3 activities), detail and Active filter.
- Engineer session exposes Draft editing and explains the publishing permission.
  No existing package was edited or published during this verification.
- Save confirmation and publishing payload/permission logic were checked in code
  and tests; live creation and publishing were not exercised.
