# Inquiry and Estimate usability update — 2026-09-10

Local frontend update at http://192.168.1.171:3000/. Company-domain frontend was not deployed in this task.

- Inquiry now has one next-step guide and primary Estimate action, with read-only guidance for Approved/Locked estimates.
- Estimate Summary offers shortcuts to equipment/templates, engineering effort, optional other costs and validation; all nine tabs remain.
- Validation explains common issues in Thai/English/Japanese, keeps diagnostic details expandable, and opens editable affected records. Estimate-level missing engineering effort correctly routes to the manhour tab.
- Internal effort loads all available rate pages for accounts with master.read, offers effective positive rates and never substitutes an arbitrary department/level. Missing rates are explained before save. API remains authoritative; supplier quotations and imported Excel rates retain their existing handling.
- Empty equipment lists no longer claim every item has a price.

Verification: focused frontend TypeScript check, scoped ESLint, local build, whitespace check and six targeted regression tests passed. Browser walkthrough on INQ-2609-0015 → EST-2609-0015 confirmed the new Inquiry action, Summary shortcuts, Thai validation guidance, missing-effort navigation and early missing-rate warning with disabled save. The browser check did not save additional effort or approve the estimate. No active rate exists in the connected master data, so successful internal-effort persistence remains unverified.

Repository-wide checks remain limited by existing archived backend dependency/type conflicts in outputs/company-cutover and a navigation-count guardrail expecting 33 rather than 34 entries. No measured engineer time-saving or full Engineer-role/mobile test is claimed.
