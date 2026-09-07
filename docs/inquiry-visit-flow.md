# Inquiry-first customer workflow

Implemented 2026-09-05 following the user's approval of the reviewed flow.

Inquiry is the customer case. Its main actions are creating an estimate or requesting
a site visit. The visit request copies customer, site, contact, requirement, ownership,
priority and due date from that inquiry. Site-specific readiness and technical review
remain explicit. Requests and their visits are accessible from the inquiry's
“เข้าหน้างาน / ผลสำรวจ” tab. Site Visit provides preparation/review, scheduling,
execution and reports; its detail returns to the original inquiry for estimating.

The standalone Sales Intake navigation entry is removed. Existing requests remain
under Site Visit → คำขอ / ตรวจข้อมูล, including the technical review queue and sales
dashboard. Editable legacy requests can select an existing inquiry belonging to the
same customer. Existing unlinked visits retain their legacy conversion path. Both
Node and .NET reject creating another inquiry when the visit or its parent request
already links to one, within the transaction used for creation.

No tables were merged, historical documents overwritten, or migration applied.
The inquiry-scoped request filter runs on the server. Reports remain on their visits,
reachable through the original case; they do not overwrite customer requirements.
The new request form still applies the existing technical-review readiness rules.

The customer intake form shows five main inputs, with optional details expandable.
Inquiry and preparation tables are reduced to eight and six columns respectively.
Their second search boxes are hidden, and preparation rows explain the next action
without pretending the preparation and visit statuses are one state. My Work links
to the user's site assignments.

## Validation and local release

- Frontend typecheck, lint, and Team Test build passed; .NET build passed.
- Node tests: 25 passed; API typecheck/build passed.
- Root tests: 84 passed, two environment-dependent SQL/PowerShell checks skipped
  in the sandbox. Targeted flow tests cover copying without modifying the source,
  nullable references and next actions after a closed visit.
- Live local API regression: nine assertions passed, including scoped listing,
  customer consistency, duplicate rejection and estimating on the original inquiry.
- Script: `tests/integration/inquiry-visit-flow-uat.ps1`. Retained labeled fixtures:
  INQ-2609-0012 / EST-2609-0013; test request SIN-2609-0005 was cancelled afterward.
  SV-2609-0003 was used only for a rejected duplicate request, not modified.
- Managed Node release: `20260905-134019`. Frontend and API returned HTTP 200;
  served frontend bundle was checked for the new workflow. Browser interaction
  testing was not performed.
- Delivered on the existing local Team Test app at http://192.168.1.160:3000;
  the separate Sites cloud project was not changed.
