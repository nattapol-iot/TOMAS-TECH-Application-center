# Manager and executive dashboard

The production app selects the management overview for primary roles Admin,
Management (the current CEO-level role), CEO, Engineering Manager, Project Manager,
and Sales Manager. The personal dashboard, including Master-backed start date and
tenure, remains available through the **My dashboard** tab. No role records or
employee Master data are changed by this feature.

## Data and access

`GET /api/v1/dashboard/management` is a read-only Node API endpoint. The server
restricts projects and related records before returning any data:

- Admin, Management and CEO: company reporting summary.
- Project Manager: projects they manage or lead, and related permitted sources.
- Engineering Manager: assigned projects plus projects staffed by their department.
- Sales Manager: assigned projects plus projects from inquiries created by their department.
- Additional signing roles do not grant company reporting access.

Company summary access does not grant editing, approval or global source-module
access. Source links retain the existing module permissions and scope. Some
executive records therefore expose summary details only. PR/PO/receiving/signing
links currently open the corresponding workspace; inquiry, estimate and project
links select the source record.

The project-manager filter combines assigned managers from visible projects with
active primary-role Project Managers from Master, including those without a project.
Role-based options are server-scoped to company reporting, the actor, manager
departments or managers of visible projects. Options are deduplicated by user ID
and respect the department filter; selecting an unassigned PM shows no projects
and never expands project access.

## Metric definitions

- Today/week/month/quarter are period-to-date using Bangkok business dates.
  Comparisons use the immediately preceding equal number of calendar days.
- Inquiry conversion follows distinct inquiries created in the selected period,
  not a sum of unrelated document counts.
- Active work and procurement are current snapshots, not historical snapshots.
- Completed work requires Done status and an actual completion date in the period.
- Overdue work uses baseline finish where recorded, otherwise the current plan.
  Moving a forecast cannot remove baseline lateness.
- Project health uses delivery, blocked/overdue leaf tasks and material signals.
  Missing/invalid schedules are unknown, never automatically healthy.
- Actual progress is planned-effort-weighted leaf progress. Plan progress is a
  time-based interpolation, not earned value or contractual acceptance.
- Capacity splits task effort across PICs and includes scoped inquiry/estimate
  planning. Weekends and configured holidays are excluded. Leave and out-of-scope
  work are not included. Missing capacity is distinct from zero capacity.
- PO commitments exclude drafts/cancellations. Outstanding quantity deducts
  confirmed received quantity. Damaged/rejected items remain visible as risks.
- PR, PO and receipt values overlap and must not be added together. Estimate cost
  and receipt value are not revenue, invoiced expense, profit or cash flow.

No schema migration or demo data is required. Loading errors are shown explicitly;
failed refreshes identify the retained previous data and its timestamp.

## Local verification and runtime

- Pure metrics: `node --test tests/executive-dashboard.test.mjs`
- Backend suite: `npm.cmd --prefix backend-node test`
- Saved-database read-only check: `scripts/Test-ExecutiveDashboardReadiness.ps1`
- Running API/authentication check: same script with `-Live`

Use PowerShell 7 and the saved Team Test settings. Refresh the Node API through
`scripts/Update-TeamTestHostRelease.ps1`; refresh the frontend through the managed
Stop/Start-TeamTestLanFrontend scripts. Do not start an unrelated backend or generic
`npm run dev`. The saved LAN origin is authoritative; it can change with the network.
