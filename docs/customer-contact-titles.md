# Customer contact titles

Customer Master and inline New Inquiry customer/contact entry support optional Thai, English and Japanese honorifics. Each field accepts a suggested value or custom text, up to 50 characters. Thai and English titles appear before the name; Japanese honorifics appear after it. Names and titles are stored separately; titles do not change legacy canonical names or contact matching. No gender inference or translation is performed.

Customer payloads use `contactTitleTh`, `contactTitleEn`, `contactTitleJa`. Contact payloads and directory records use `titleTh`, `titleEn`, `titleJa`. A personal name is required when providing a title. Company-only End user entry omits personal data. Master edits preserve omitted title fields for older clients and clear explicitly empty values, with existing row-version checks and audit history.

Migration 031 adds three default-empty `nvarchar(50)` columns to `customer_site_contacts`. It requires migration 030 and leaves existing names intact. The managed migration runner makes and verifies a COPY_ONLY/CHECKSUM backup before applying it. The selective API release uses the deployed baseline and replaces only sales-customers, master and bootstrap artifacts, preserving unrelated pending migration 029 work.

Validation: seven backend unit tests and 43 SQL/API checks against the exact staged API with a disposable database, migrations 28 + 30 + 31, and a restricted application role. Coverage includes saving all titles, directory/bootstrap reads, editing, omitted-field preservation, explicit clearing, stale edits, unrelated contacts and title validation. No live customer fixtures are created.

Frontend validation: root typecheck, scoped ESLint and23 form/OCR regression tests passed, including Japanese suffix display and raw Inquiry contact selection. Live: API20260906-093737-customer-contact-titles schema31, all300 deployed artifacts match the tested stage; frontendPID20736, ProductionApp-DVeFfPh7.js andLANpage HTTP200. Verified backup completed before031; schema029 remains absent.
