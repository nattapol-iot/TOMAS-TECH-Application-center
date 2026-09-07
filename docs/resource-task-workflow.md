# Resource Plan tasks and Project Punchlist

Released to the existing Local Team Test application on 2026-09-05.

## User workflow

1. Resource Plan opens with Tasks. Create a task against an accessible Inquiry or
   Project, choose one responsible member, start date, working-day duration and
   effort in man-days. Project assignees must be active project members able to
   acknowledge and update work.
2. Review weekly workload before and after the proposal. Changing an existing
   plan removes its old allocation before applying the new allocation. Missing
   capacity and incomplete effort are identified rather than treated as zero.
3. Submit for approval. Pending proposals do not alter committed workload.
4. The responsible planner with schedule.plan approves or returns the proposal.
   Above-capacity or incomplete calculations require an explicit override reason.
   The server recalculates impact within the approval transaction.
5. The member sees the assignment in My Work → Task inbox and acknowledges it
   personally. The inbox refreshes periodically; the sidebar includes pending
   acknowledgment actions. No email, Teams or external notifications are sent.
6. Members may propose revised dates, duration and effort with a reason. The
   approved plan remains in force while review is pending. Approval resets the
   acknowledgment so the member accepts the new plan explicitly.
7. Members update progress and actual dates. A planner verifies completed work
   with a note before closing it.

Projects → Punchlist uses the same workflow for customer issues, retaining the
reporter, description, priority and issue-to-task link. A Project schedule task
is created only on approval, atomically with that link.

## Data ownership and scope

- Existing Project schedules remain canonical; approved Project task dates,
  effort, progress and PIC are read from schedule_tasks. The new resource_tasks
  row records proposal, approval, acknowledgment and issue metadata.
- New Inquiry tasks store their own approved plan. Approving the first detailed
  task explicitly activates task mode for that Inquiry. Its previous aggregate
  resource_effort is retained for history but no longer counted or editable;
  planners must itemize all remaining work. The UI explains this before approval.
- Existing schedule tasks are retained and monitored through the existing
  Timeline, Workload and Project schedule views. They are not retroactively
  submitted for approval or acknowledged on behalf of their existing PICs.
- New governed tasks are independent leaf tasks with one accountable assignee.
  Legacy WBS/PIC editing remains available for legacy tasks. Governed plan changes
  cannot bypass approval through legacy schedule routes, including encoded IDs.
- Source scope and existing schedule.read/plan/progress permissions are retained.
  Only the assignee can acknowledge or progress a governed task. Removed project
  members and inactive assignees are rejected.
- Monday–Friday and company holidays define working days; saved weekly capacity
  defines availability. Personal leave is not yet subtracted. Completed/cancelled
  work does not reserve open workload. Estimate effort remains a separate activity.
- Approval totals include other work assigned to the member without exposing
  other projects' titles or customer information in the impact response.

## Implementation and verification

Migration 024 adds resource_tasks and resource_task_sources with foreign keys,
state/JSON checks, a unique schedule link and restricted app-role grants.
Every mutation uses a transaction, row-version validation and an audit entry.

- Node source tests: 32 passed.
- Isolated fresh SQL database with restricted application role: 43 API checks
  passed, including approval races, repeated approval, encoded-route guards,
  personal acknowledgment, reassignment, actual-date persistence, proposal
  rejection/approval, completed-task replan rejection and member removal.
- Root tests: 88 passed, 2 skipped in the sandbox (separate .NET SQL integration
  and PowerShell child-process check). The fresh Node SQL integration above ran.
- Frontend/backend type checks and scoped lint passed.
- Managed frontend build passed; authenticated Local API reads and non-mutating
  workload preview passed. Page, JS and CSS all returned HTTP 200 with feature
  markers verified. No browser interaction/visual QA was performed in this task.

## Local release

- SQL schema: 24. Existing business records were not deleted or merged.
- Verified COPY_ONLY/CHECKSUM backup:
  `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_before_resource_tasks_20260905_153728.bak`
- API release: `20260905-153948`, process 51492 at verification.
- Frontend process: 32952 at verification.
- URL: http://192.168.1.160:3000/
- Served assets: ProductionApp-eXya1eJ7.js and ProductionApp.C6E_vBcx.css.
- `scripts/Apply-ResourceTaskMigration.ps1` backs up and verifies the explicitly
  named Local database before migration; `scripts/Test-ResourceTaskReadiness.ps1`
  authenticates without exposing credentials and does not create or approve work.

Runtime IDs are snapshots; other coordinated tasks may publish newer releases.
