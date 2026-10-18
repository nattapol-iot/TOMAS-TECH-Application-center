# Design

## Source of truth
Status: Active. Updated 2026-09-19. Applies to the production application and CRM surfaces. Evidence reviewed: global tokens in `app/globals.css`, shared UI components in `app/system/ui.tsx`, production panels and the deployed CRM screenshot.

## Brand
Professional industrial engineering software: precise, calm, compact and trustworthy. Use TOMAS blue as the primary signal. Avoid excessive whitespace, floating controls and feature-specific visual systems.

## Product goals
Make daily work and decision status scannable, keep actions close to the relevant record and preserve dense operational information without looking like a raw spreadsheet.

## Personas and jobs
Sales users manage customers, opportunities, activities and follow-ups. Engineers receive technical work converted from opportunities. Managers review pipeline health, ownership, inactivity and commercial status.

## Information architecture
Global navigation owns module selection. Pages use a header and primary actions, filters, status summary, working content, then pagination or secondary actions. CRM uses Dashboard, Customers, Contacts, Opportunities, Activities and Pipeline.

## Design principles
Reuse shared tokens and controls. Group related controls inside a visible surface. Show actionable state before history. Use cards for summaries and tables for comparable records. Empty states occupy the content region.

## Visual language
Use global color, typography, spacing, radius and shadow tokens. Default spacing is 8–16 px; sections use 14–20 px. Borders and small shadows define hierarchy. Motion is limited to short hover and focus transitions.

## Components
Shared buttons, panels, badges and modals remain authoritative. CRM KPI cards, opportunity cards, pipeline columns, timeline and data tables use the same tokens and interaction states. Feature CSS does not redefine global controls.

## Accessibility
Keep semantic headings, labels and tables. Controls require visible keyboard focus. State cannot rely on color alone. Preserve readable contrast and touch targets near 38 px or larger.

## Responsive behavior
Desktop uses compact multi-column summaries and grids. Below 900 px details stack. Below 700 px filters become full width, forms use one column and pipeline remains horizontally scrollable.

## Interaction states
Loading, error, empty, disabled and selected states remain visible within the content surface. Hover adds border or elevation but is not the only affordance.

## Content voice
Use concise operational language. Labels describe records and actions directly. Thai, English and Japanese keep the same hierarchy and avoid implementation terminology.

## Implementation constraints
Use the existing React and CSS stack, shared tokens and i18n. Do not add dependencies or change business rules. Validate with typecheck, build and targeted CRM tests. Production acceptance includes a visual check at common desktop width.

## Open questions
- [ ] Confirm whether managers prefer eight dashboard KPI cards or a smaller actionable subset after real usage data is available. Owner: CRM product owner. Impact: dashboard density only.
