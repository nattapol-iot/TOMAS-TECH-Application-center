# Site Visit workspace simplification

2026-09-05 — user approved simplifying Execution and Report after reviewing screenshots.

- Three main stages: preparation, survey, and report/review. Assignment, scheduling
  and pre-visit briefing remain within preparation; links and history are secondary.
- Existing reports open directly on the report stage. Status guidance distinguishes
  survey work, report drafting, waiting for review, approved and cancelled visits.
- Checklist sections expand individually, show completion counts, and can filter to
  unanswered mandatory items. Notes expand on demand. Numeric zero counts as an answer.
- Closed/completed/reviewing visits show survey answers as text instead of editable
  controls, even when an accepted assignment remains active. Existing server rules
  continue to enforce writes.
- Attachments use compact lists. Reports show existing findings, measurements and
  file downloads; saved draft fields are preserved. Only empty draft summary/evidence
  fields are prefilled. Raw evidence is separate from approved report content.
- Report editing emphasizes four fields: visit summary, engineer conclusion,
  recommended solution and next step. Other existing fields remain expandable.
  Submission explains the API's minimum 20 characters for summary and conclusion.
- Non-editable reports render paragraphs and headings, with expanded details available,
  instead of disabled textareas. Review, acknowledgement, action items and revisions remain.
- Stage switches keep survey and report editor state mounted. Autosave keeps edits made
  during an in-flight save dirty, shows failures, and offers an explicit retry. Checkout
  waits until the current survey answers are saved.

Validation: frontend typecheck and scoped ESLint passed; 43 Site Visit rule, guardrail
and workspace tests passed. No schema, permissions or API contract changes. Browser
interaction testing was not performed. Local Team Test frontend release is coordinated
with the concurrent Master Data task to avoid competing restarts.

Released on http://192.168.1.160:3000 using the managed frontend launcher (PID 43724).
Current page, JavaScript and stylesheet returned HTTP 200; both the served JS and CSS
include the survey accordion/report reading markers. A follow-up build restored the
missing scoped CSS import after the first coordinated build. Master Data source was
preserved. No API restart or database mutation was needed for this change.
