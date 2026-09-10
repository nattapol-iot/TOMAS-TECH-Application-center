# Four-feature completion and runtime recovery — 2026-09-06

The integrated Team Test release includes language switching, Reports, Sales KPI and historical Excel PR import.

- Language: TH/EN/JP is stored per browser. Static controls and date/number presentation follow the selected language. Customer names, entered content and canonical API values are preserved. A report has its own saved document language for forms, preview, print and customer view.
- Reports: choose Service/UAT/Installation/Inspection/POC or a reusable team template; choose the source work and eligible approver; save a draft, sign/submit, review/approve, then create a customer signature link. Links use the currently configured private LAN origin. Evidence fields currently store file/document references or links.
- Sales KPI: Sales Engineer can review their own KPI; Sales Manager has the management flow. Reviews use role-specific criteria and real work evidence, retain draft ratings and prohibit completing one's own manager review. Migration029 is installed. Active account/employee linkage is still required.
- PR import: Purchase Requisition → Import historical PR → select XLSX → Preview → Confirm import. Original revisions/cancelled rows remain traceable; estimate matching warns about stale revisions. SAMTECH has16 imported rows; its PJ250076 association awaits the real project record.

Validation: exact staged Report API87 SQL checks, Sales KPI29, PR36; reportUI8, i18n12, KPIguardrails5, productionguardrails30 and focused existing customer/OCR/import tests passed. Typechecks, scoped lint, production build and installed312 API artifact hashes passed. Browser checks covered TH/JP/EN, report chooser and Service form, KPI evidence and PR import dialog, without saving test records in live data.

The crash/permission-mode transition exposed Windows packaged-app file virtualization: the runtime was present in the Codex package LocalCache, while ordinary PowerShell searched the logical LocalAppData path. Recovery linked the original path to the existing runtime and corrected ReleasePath. Database, documents and secrets were preserved; no reinstall or credential rotation occurred. Live SQL still has3 reports,1 historical PR import and migrations25–33.

Open http://192.168.1.160:3000/ on the same private network. To resume outside Codex, double-click Start-IoT-Team-Center.cmd in this workspace. It runs the existing managed API/frontend launchers and verifies readiness. It does not install an automatic Windows startup task.

Follow-through fixes on 2026-09-06:

- Completed 92 additional TH/EN/JP entries across templates, resource planning, profiles and Excel estimate import; localized conditional controls and errors while preserving business data and submitted values.
- KPI production rosters now use only API-authorized assessments, with no demo scores or bootstrap roster fallback. Unrated scores show an em dash. Partial drafts can be saved; submission still validates all required scores/evidence. Closed cycles stay read-only, and stale evidence responses cannot replace the selected employee's evidence.
- Report revisions can start when a historical signer has lost authority, allowing an eligible replacement before saving/submission. Historical signatures remain unchanged. Internal workspace navigation guards unsaved changes once; printed template captions use the saved document language.
- Validation: 173/173 combined root regressions, 89/89 isolated Report SQL checks, frontend typecheck, backend build and scoped lint passed. After browser QA exposed additional generated KPI phrases, eight targeted KPI component/helper regressions and scoped lint passed, followed by the final frontend typecheck/build. The API patch replaces only the report route module over the installed baseline.
- SAMTECH PR association with PJ250076 is explicitly deferred by the user. No project is created or linked for this item.

Final installed API release: 20260906-135916-four-feature-completion (312 artifact hashes verified). Managed frontend build succeeded; API readiness schema33 and LAN HTTP200 passed. Browser confirmed real unrated KPI, translated JP evidence and all three existing reports. Original English Dashboard restored after verification.
