# Design

## Source of truth
Status: Active. Updated 2026-10-18. Applies to the production application and CRM surfaces, with the current implementation scope limited by the user to RFQ / create Inquiry. Evidence reviewed: `app/globals.css`, `app/system/ui.tsx`, `InquiryScreens.tsx`, `InquiryCustomerFields.tsx`, `ExistingRfqWork.tsx`, the shared SearchSelect, and `docs/manual/screenshots/inquiry-detail-en.jpg` (historical reference, not current production evidence). Live visual inspection remains unavailable after the earlier browser access denial; no current intake screenshot is available.

## Brand
Professional industrial engineering software: precise, calm, compact and trustworthy. Use TOMAS blue as the primary signal. Avoid excessive whitespace, floating controls and feature-specific visual systems.

## Product goals
Make daily work and decision status scannable, keep actions close to the relevant record and preserve dense operational information without looking like a raw spreadsheet.

For RFQ intake: make customer, job, estimator and deadline easy to identify; keep the optional CRM relationship explicit without a prominent warning on every new request. Success means one visible save action, an estimator that is not hidden, searchable customer selection, retained source identity and all existing fields reachable. Non-goals: redesign other modules, change defaults or permissions, add steps, or change the API payload.

## Personas and jobs
Sales users manage customers, opportunities, activities and follow-ups. Engineers receive technical work converted from opportunities. Managers review pipeline health, ownership, inactivity and commercial status.

## Information architecture
Global navigation owns module selection. Pages use a header and primary actions, filters, status summary, working content, then pagination or secondary actions. CRM uses Dashboard, Customers, Contacts, Opportunities, Activities and Pipeline.

RFQ creation is one form: main column = customer/contact/end user, job/RFQ reference/requirements/attachments, optional technical and sales context. Secondary column = sales owner/estimator/deadline/priority, followed by pending CRM source or existing work. A single footer contains Cancel and Save Inquiry. The Inquiry number is issued after save; the customer RFQ reference is optional and separate.

## Design principles
Reuse shared tokens and controls. Group related controls inside a visible surface. Show actionable state before history. Use cards for summaries and tables for comparable records. Empty states occupy the content region.

RFQ uses neutral section surfaces and thin separators; blue is reserved for the primary action and selected source. Remove repeated explanatory alerts. Keep essential assignments visible; optional fields use native disclosure. Preserve existing Inquiry/open and opportunity/select distinctions.

## Visual language
Use global color, typography, spacing, radius and shadow tokens. Default spacing is 8–16 px; sections use 14–20 px. Borders and small shadows define hierarchy. Motion is limited to short hover and focus transitions.

## Components
Shared buttons, panels, badges and modals remain authoritative. CRM KPI cards, opportunity cards, pipeline columns, timeline and data tables use the same tokens and interaction states. Feature CSS does not redefine global controls.

RFQ reuses Panel, Field, PageHeader, Icon, SearchSelect and the existing customer/end-user controls. `inquiry-intake.css` is scoped beneath `.rfq-intake`; it owns layout/spacing only. It must not depend on CRM CSS having been loaded earlier. The sticky footer stays in document flow and does not float over form fields.

## Accessibility
Keep semantic headings, labels and tables. Controls require visible keyboard focus. State cannot rely on color alone. Preserve readable contrast and touch targets near 38 px or larger.

RFQ input labels must have accessible names, disclosure summaries must work with the keyboard, and the footer must not hide focused content. No new animation. Keep visible error text and disable editing while a save/upload is in progress.

## Responsive behavior
Desktop uses compact multi-column summaries and grids. Below 900 px details stack. Below 700 px filters become full width, forms use one column and pipeline remains horizontally scrollable.

For the RFQ form, use existing breakpoints: two columns above 1180 px, one below; field grids become a single column at 720 px. Long company names and match rows wrap. At 620 px the footer is static to avoid taking keyboard space. These are scoped rules, not new global breakpoints.

## Interaction states
Loading, error, empty, disabled and selected states remain visible within the content surface. Hover adds border or elevation but is not the only affordance.

RFQ source: no source means direct intake is allowed; selected source explicitly says it will link on save and names the opportunity; existing work has initial/loading/empty/error states. Files retain queued names/category/removal and the existing partial-upload recovery behavior. Saving must not accept a second submission or mutable form edits.

## Content voice
Use concise operational language. Labels describe records and actions directly. Thai, English and Japanese keep the same hierarchy and avoid implementation terminology.

## Implementation constraints
Use the existing React and CSS stack, shared tokens and i18n. Do not add dependencies or change business rules. Validate with typecheck, build and targeted CRM tests. Production acceptance includes a visual check at common desktop width.

RFQ validation uses the existing executable form regressions (direct/linked/unlinked/existing Inquiry) plus source-compatible lint/typecheck and CI build. Record any visual verification gap explicitly; automated behavior and deployment health are not visual acceptance.

## Open questions
- [ ] Confirm whether managers prefer eight dashboard KPI cards or a smaller actionable subset after real usage data is available. Owner: CRM product owner. Impact: dashboard density only.
- [ ] Verify the redesigned RFQ form visually at desktop and mobile widths when browser access is available. Owner: UI verification. Impact: responsive visual acceptance; no claim based on historical screenshots.
