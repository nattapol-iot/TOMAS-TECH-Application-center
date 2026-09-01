# Report form usability correction

The Reports workspace now starts with a choice of Service, UAT, Installation, Inspection, or POC forms. The extra Reports/Analytics tab layer was replaced with an analytics link. Saved reports have visible titles and explicit open/continue actions. New-report setup separates form/template choice from project/inquiry and approval routing.

The read-only references were `Service_Report_Rev00.xlsx` (`Service_Report`, B2:M47) and `UAT Report_Rev00.xlsx` (`UAT_Report`, `UAT List1`, `UAT List1 Summary`, and evidence sheets). Filled customer examples and preselected PASS values in those files are reference content, not new-report defaults.

Service now uses paper-style metadata, numbered sections, side-by-side hardware/software tables on wide displays, diagnosis, verification, follow-up and acknowledgments. UAT separates the cover/summary, test table, punchlist, and evidence. Preview and printing include every UAT sheet. A persistent save control makes saving possible without scrolling to the end. Existing report, review, approval, customer signing, and revision endpoints remain authoritative.

Optional original-form fields are stored in the existing report body JSON: work type and ticket reference, service follow-up owner/date/revision, pending materials and UAT summary remarks. Existing keys and extension data remain intact. Reusable templates render only their existing allowed fields; no results, customer facts, or signatures are copied into templates. No database migration or report-data rewrite was performed.

This is a web-form adaptation, not an Excel round-trip exporter. Evidence still uses file/document references or URLs; direct embedded-photo upload is not added here. Customer acknowledgment applies to the approved report revision, not independently to each UAT page. Signature summaries show actual workflow records, not editable signature placeholders.

Validation: three React server-render regressions cover blank result preservation, read-only visibility of every UAT sheet and long evidence, safe evidence links, and template privacy. TypeScript and ESLint pass. A broader legacy .NET material-flow test failed with inventory usable quantity expected 5 versus 6; it does not exercise these report changes and was not modified. Browser interaction/visual QA was not performed. The managed frontend release and served report assets are checked separately.
