# Unified Reports

The Reports workspace records five operational report types against the work that
created them. Installation, UAT, and Service reports use a Project. Inspection can
use an Inquiry or Project. POC uses an Inquiry so trial work remains traceable before
the customer awards a project.

## Workflow

1. The preparer chooses a report type and source, writes the report, assigns an
   optional reviewer and a required approver, then saves the draft.
2. Submitting signs the exact draft snapshot with the preparer's own active signature
   specimen. Submission also checks that the common fields and the required content
   for that report type are complete. The assigned reviewer may review it when one
   was selected.
3. The assigned approver signs and approves the same snapshot. The preparer,
   reviewer, and approver must be different people.
4. The preparer or approver creates a time-limited customer link. Creating a new link
   revokes any earlier unused link.
5. The customer reads the approved revision, enters their name, position, company,
   and date, gives explicit consent, and either acknowledges it or draws a signature.
   The link is single use. Completion freezes the revision and its evidence.

Reviewers and approvers can return a report with a reason. The preparer creates a new
revision after a return, approval, completion, or void. Signatures from an older
revision never carry over to the new revision.

## Report content

### Reusable templates

Open **Reports → Report workspace → Templates** to create a reusable template,
search the team's library, or edit a template you own. Template creation requires
Report write access. Owners and users with Master Data write access can edit or
archive templates when they also have Report write access.

Create a template before a job, or open an existing report and choose **Save as
template**. Review and edit the reusable content before saving: objective, planned
hardware/software actions, UAT scenarios and steps with expected results,
inspection checkpoints, POC trial methods, and deliverable names. Remove any
customer-specific wording from these instruction fields before sharing the template.

Template extraction clears site/contact/work dates, participants, measured and actual
results, PASS/FAIL status, report summaries, evidence links, issues, customer
acceptance, and signatures. The template editor exposes only reusable fields.

Choose **Use template** in the library, or select a template in **New report**.
Preview its contents, choose the Inquiry/Project and current approvers, and create
the draft. Each report records the template name and version used and owns its own
content. Editing or archiving a template never changes reports already created from
it. If someone edits or archives a template while the create dialog is open, refresh
the template selection before creating the report.

Templates are structured report content, not Excel page-layout imports. The original
Service/UAT spreadsheets remain reference files and are not modified.

All reports share the source, customer, site, contact, work dates, team, objective,
summary, evidence references, pending actions, deliverables, and remarks. Report
content uses repeatable rows, so it is not limited by the row counts in the source
spreadsheets.

- **Installation:** hardware, software, commissioning checks, and results.
- **UAT:** scenario and test-step rows, expected and actual results, evidence, and
  punchlist actions. Blank results remain unrecorded.
- **Service:** hardware and software changes, symptom, impact, root cause, corrective
  action, downtime, backup, rollback, verification, and follow-up.
- **Inspection:** checkpoints, expected and observed values, units, results, and
  corrective actions.
- **POC:** hypothesis, success criteria, baseline, trial method, result, and limits.

Evidence fields store references or links to controlled files. They do not embed image
data in the report JSON. The only image accepted by the public acknowledgment API is
the customer's drawn PNG signature, capped and validated by the server.

## Security and audit rules

- Source membership is checked whenever an authenticated user reads or changes a
  report.
- Report write, review, and approval use separate permissions.
- Every internal signature requires explicit consent and the actor's own active
  signature specimen.
- Customer identity is self-asserted and is recorded as such. The link proves
  possession of a one-use secret; it is not Entra identity proof.
- Row-version checks reject stale edits and transitions.
- Approved content and internal signature evidence are immutable. Completed customer
  evidence is immutable.
- The public endpoint returns only the approved report snapshot needed for customer
  review. Tokens are hashed in SQL and suppressed from route logging.

## Release procedure

Run the unified-report migration only with `scripts/Apply-UnifiedReportsMigration.ps1`.
It verifies the exact local Team Test database, creates a COPY_ONLY backup with
CHECKSUM, runs RESTORE VERIFYONLY, applies migration 025, and verifies the new schema.
Publish the Node API only after type checking, automated tests, and the isolated SQL
integration test pass. After release, run `scripts/Test-UnifiedReportsReadiness.ps1`
to check the five templates, authenticated list/source routes, and fail-closed public
token handling without creating a report or signature.

The reusable-template extension uses `scripts/Apply-ReportTemplatesMigration.ps1`
for the same verified-backup procedure before migration 027. Migration 027 depends
on 025 and is independent of the reserved KPI migration 026. The current Node API
readiness checks for both 025 and 027 explicitly. After the template release, run
`scripts/Test-ReportTemplatesReadiness.ps1` for public health, anonymous-library access
rejection, frontend HTTP status, and schema verification without reading login secrets.

## Team Test release

### Reusable-template extension (2026-09-06)

Migration 027 is installed after verified COPY_ONLY/CHECKSUM backup:
`C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_before_report_templates_20260905_180721.bak`.
API release `20260905-180737` (PID 4048) and frontend PID 54944 are live at
`http://192.168.1.160:3000`. The served `ReportScreens--dYGv5Ll.js` chunk contains the
template library and picker.

Validation: 50 backend unit tests, 83 isolated SQL/API checks (the previous 50 Report
workflow checks plus 33 template checks), 99 root tests passed with two environment
skips, lint/typecheck/build, frontend reusable-field rendering checks, live health,
anonymous library rejection, exact migrations 025+027, and released-chunk checks.
The isolated checks cover unauthorized source copying, creator/master rights,
concurrent edits, stale/archived templates, discarded client-supplied results,
frozen template provenance, and readiness when a required migration is missing.
No real report/template/signature fixture or runtime signing-secret read was used.

### Original Report release

Released on 2026-09-06 (Asia/Bangkok). Migration 025 was applied after a verified
COPY_ONLY/CHECKSUM backup at
`C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_before_unified_reports_20260905_174808.bak`.
The managed Node API release is `20260905-174945` (PID 49900) and the integrated
frontend is PID 54520 at `http://192.168.1.160:3000`.

Verification completed without creating a report or signature: Node tests 46/46,
root tests 96 passed with two environment skips, typecheck, lint, frontend and API
builds, schema 25 readiness, the five template endpoints, source/list reads, fail-closed
public token handling, HTTP status checks, and a browser check of the invalid customer
link state. Staff browser inspection was not performed because automatic approval
review rejected access to the Team Test signing secret used for login.
