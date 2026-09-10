# End user companies

Inquiries and Projects retain their contracting customer and optionally reference a separate End user from the same company directory. A company can have either or both roles. Historical records remain unspecified; the migration never guesses an End user from the contracting customer.

## Use

1. New Inquiry: select the contracting customer, then optionally choose **End user**, **Same customer**, or **New company**. Sales company creation uses existing `intake.write` or `master.write` authority and does not require a duplicate contact form.
2. New Project: **Inherit from Inquiry** is checked by default. The API follows the approved estimate's Inquiry at creation time. Uncheck to choose another company or explicitly leave End user unspecified.
3. Existing Inquiry detail and Project rows expose **Edit end user** to permitted writers. A stale record requires reloading and reviewing the latest value before another save. Closed, cancelled and rejected records cannot be changed.
4. Inquiry changes affect future Projects only. Existing Projects retain their own reference.
5. Report drafts display the source's End user separately from the contracting customer. Submission freezes the company identifiers and names. Team and customer views of signed revisions use only that frozen snapshot; historical snapshots without End user stay unspecified.

## Implementation and validation

- Migration `028_end_user_companies.sql` adds nullable customer foreign keys and filtered indexes to Inquiries and Projects. Project UPDATE permission is limited to `end_user_customer_id`, `updated_by`, and `updated_at`.
- PUT `/api/v1/inquiries/:id/end-user` and `/api/v1/projects/:id/end-user` accept `{ endUserCustomerId: number | null, rowVersion }`, validate active companies, enforce write permissions and existing Project scope, and record before/after audit entries.
- Project creation distinguishes omitted End user (inherit), explicit null (unspecified), and positive ID (override). Inquiry creation defaults omission to null.
- Runtime and fresh deployment require schemas 25, 26, 27 and 28. Existing API customer/billing fields retain their meaning.
- End user isolated SQL/API integration: 50 checks with synthetic identities and a restricted application role. Protected Project commercial fields remain unwritable through that role.
- Reports isolated SQL/API integration: 85 checks including frozen unknown/named End users on team/customer views and current source data on a new revision.
- Frontend SSR: 5 End user tests; root suite 111 passed, 2 environment skips. Frontend/Node typechecks and focused ESLint passed; Node suite 63 passed.
- Browser interaction testing was not performed. The supplied Sites workflow restricts browser QA unless explicitly requested; verification uses SSR, API integration, builds and live HTTP checks.

## Team Test release

Migration 028 was applied after COPY_ONLY/CHECKSUM backup and RESTORE VERIFYONLY:
`C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_before_end_user_companies_20260906_061550.bak`.

No real customer, Inquiry, Project, or Report test fixtures were created during verification.

Live verification: Node API release 20260906-061613 PID 10808; frontend PID 928. LAN page and ProductionApp-BWUxMYpg.js / ReportScreens-B-aSaCk5.js returned HTTP 200 with End user fields. API readiness reports schema 28. Managed release reran the current Node suite: 63 passed.
