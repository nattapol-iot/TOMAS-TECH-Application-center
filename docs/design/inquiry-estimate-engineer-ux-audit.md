# Inquiry and Estimate: Engineer usability audit

Date: 2026-09-10. Status: Draft. Supporting contract: [DESIGN.md](../../DESIGN.md), especially Product goals, Information architecture, Design principles, Content voice and Interaction states. Preserve the existing nine Estimate tabs, summary breakdown, table and editing patterns; this is a targeted improvement brief, not a replacement layout.

## Evidence and limits

Reviewed the live production desktop UI in Thai under an Admin account: Inquiry list, INQ-2609-0014 (HOWA through SATO), its one-click Open Estimate transition to EST-2609-0014 R00 Draft, Summary, Validation and the missing-manhour Open line action; also IMP-EST-PJ260013 R00 Locked. Inspected the rendered Cost Items screenshot, local InquiryScreens.tsx, EstimateScreens.tsx, globals.css, existing DESIGN.md and estimate-cost-workspace-design.md. Live evidence takes precedence where local source differs. No records were saved or submitted.

No actual Engineer-account session, timed participant study, mobile walkthrough, keyboard/IME test, import/save test or network-failure test was conducted. No approved target mockup or Storybook baseline was supplied for this audit. This is a heuristic walkthrough, not proof of productivity improvement.

## Verdict

Existing reuse tools can reduce repeated entry; the workflow is not yet self-explanatory for a first-time Engineer. The strongest friction is inconsistent cost meaning and validation recovery, followed by task discovery and terminology. Actual time saved remains unmeasured.

## Findings and acceptance criteria

| Priority | Observed evidence | Engineer impact | Proposed acceptance criterion |
| --- | --- | --- | --- |
| P1 | HOWA has 30,000 THB in discipline 06 Engineering in Cost Items, but the top Engineering total is zero and Other cost is 30,000 THB. Validation also requires a manhour line. | A user may enter the same labor again to satisfy the error, risking double counting. | Define imported lump-sum labor versus calculated manhour explicitly. Reclassification/conversion preserves the overall total, shows its source, and never silently duplicates labor. Do not change accounting rules without confirming the intended model. |
| P1 | Clicking Open line for engineering manhour required (entity Estimate #56) opens Cost Items instead of Engineering Man-hour. Local EstimateScreens.tsx routes only on entityType and loses entityId. | Recovery sends the user to the wrong place. | Route by issue code plus entity type and ID; missing manhour opens the add-manhour context, and item errors focus/highlight the exact row. Respect edit permissions and locked state. |
| P1 | Customer-provided Keyence module has three zero-cost items blocked by missing unit cost. | If customer-supplied status is intended, entering a fictitious price would distort cost. Module name alone does not establish that policy. | Add or confirm a structured customer-supplied classification and explicit zero-cost reason; permit zero only under the agreed rule. Keep ordinary missing-price validation. |
| P2 | HOWA shows 41 validation issues: four errors and 37 advisory stale-price warnings; messages expose English codes and internal IDs in Thai mode. | Long repetitive warnings obscure the few actions needed to submit. | Present four blocking actions first; group 37 stale-price warnings with expandable detail and a clear advisory label. Show item names and localized remedies; preserve server severities. |
| P2 | Locked IMP-EST-PJ260013 shows 100%, zero lines, two errors, and an empty summary saying every item has price/supplier. | Completion, readiness and historical data completeness look contradictory. | Explain what the percentage measures. Zero lines must say no cost data, not all complete. Imported/locked records explain current validation versus historical approval; no automatic unlocking. |
| P2 | Inquiry list defaults to all owners and exposes nine filters; no immediate My inquiries control in the inspected list. Overview places commercial qualification prominently while scope/contact/site are empty in HOWA. | Engineer must locate their work and reconstruct missing requirements. | Provide a quick My assigned work filter and a concise required-input/next-action summary using existing data. Distinguish missing scope from a confirmed empty scope. Preserve Sales qualification controls. |
| P2 | Thai mode displays grade C as ลค. in the filter, while detail correctly shows C; Share is translated as แชร์; review tab says อยู่ระหว่างตรวจสอบ even on Draft. | Labels change meaning or imply the wrong state. | Keep grade codes A/B/C/D literal; label Share as สัดส่วนต้นทุน and review tab as การตรวจทาน. Translate remedies consistently. |

## Existing strengths to preserve

- Inquiry links to its existing Estimate in one click and carries customer/work identity; the user does not need to search a second list.
- Cost Items exposes Price Library, Excel import, copy-from-estimate, module templates and quick row entry. Local source documents Enter-to-save-and-continue. These are existing capabilities, not proposed new features; write paths were not exercised here.
- Module grouping, subtotals, eight summary tiles, revision history and comparison support review and traceability.
- The inspected Draft distinguishes blocking errors from advisory warnings and disables submission when errors exist; Locked explains revision-based editing.

## Incremental design direction

Keep current navigation and components. Add one concise task-oriented sentence and relevant action: review missing requirements, complete assigned cost section, resolve four blockers, or wait for reviewer. Do not conflate document status, commercial probability, task progress and submission readiness.

Reuse globals.css tokens, existing Tabs, badges, banners, tables, modals and localization helpers. Existing desktop table interaction remains primary. Validate keyboard focus after issue navigation, text in addition to color, readable Thai labels, and touch reachability at existing responsive breakpoints before any implementation is released. Loading/error/save states must retain drafts and explain retry; offline durability is not established by this audit.

## Validation plan before claiming time saved

Ask 3–5 Engineers to perform the same representative tasks in their current method and in this app, with comparable data and task order varied: find assigned Inquiry and scope, create/reuse a 20-line estimate, resolve a missing price and labor issue, submit review, and respond to a revision request. Use test data and actual Engineer permissions.

Record active task time, clicks/navigation, repeated entries, wrong turns, help requests and cost accuracy. Proposed targets (not achieved results): at least 20% lower median active time, no double-counted labor, no incorrect submission, and at least 80% of participants identify the next action within ten seconds without help. Compare import/template-heavy and new-item tasks separately.

## Open questions

- [ ] Engineering/accounting owner: should imported lump-sum labor satisfy the manhour requirement, or require an explicit conversion? Affects totals and submit rules.
- [ ] Engineering/Sales owner: which structured rule identifies customer-supplied equipment? Affects valid zero cost.
- [ ] Engineer representative: typical estimate size and dominant entry method (Excel, templates, new rows)? Affects expected benefit.
- [ ] QA owner: repeat under Engineer and section-limited accounts, on supported devices and with slow network. Admin UI cannot prove Engineer usability or permissions.

No application code, production data or deployment was changed by this audit.
