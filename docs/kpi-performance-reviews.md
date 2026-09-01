# KPI performance reviews

The KPI workspace stores employee self reviews, manager scoring, calibration and the final outcome in SQL Server. The demo route retains sample data; the production route uses `/api/v1/performance` exclusively.

## Role-specific review frameworks

The employee's primary role selects the framework automatically. Existing Engineering reviews retain their original four areas and weights.

### Engineering

| Area | Weight | Evidence focus |
| --- | ---: | --- |
| Delivery reliability | 35% | Milestones, forecast accuracy and early risk escalation |
| Engineering quality | 25% | Rework, escaped issues, commissioning and documentation |
| Technical contribution | 25% | Reusable solutions, troubleshooting and shared knowledge |
| Ownership & teamwork | 15% | Handoffs, customer ownership and cross-discipline support |

### Sales

| Area | Weight | Evidence focus |
| --- | ---: | --- |
| Pipeline & conversion | 30% | Owned Inquiries, qualification, probability, stage progression and outcomes |
| Customer engagement | 25% | Customer meetings, decisions, next steps and recorded action ownership |
| Forecast discipline | 20% | Probability calibration across approved and cancelled opportunities |
| Commercial ownership | 15% | Estimate coverage, approval status and recorded commercial value |
| Handover & teamwork | 10% | Approved opportunities linked cleanly to Project records |

Ratings are integers from 1 to 5. Ratings 1, 2 and 5 require concrete work evidence. The displayed overall result is the weighted average of the areas in the employee’s framework (four Engineering areas or five Sales areas).

## Workflow and privacy

1. The employee can save a partial `SELF_REVIEW` draft. Submission to `MANAGER_REVIEW` requires all role-specific ratings and evidence for ratings 1, 2 and 5.
2. A user with `performance.manage` records an independent manager assessment (ratings start blank) and submits it to `CALIBRATION`. Manager drafts may also be partial.
3. A manager records the calibration decision and completes the review. Nobody can complete their own assessment.
4. A completed assessment and its scores are immutable.

Employees can read only their own assessment. Manager scores, evidence and summary stay private from the employee until the assessment is completed, including when that employee is a manager. Project Managers and Engineering Managers manage the Engineering framework; Sales Managers manage the Sales framework; Admins can manage both. Engineers and Sales Engineers receive `performance.read` for their own review.

All mutations use SQL transactions, write audit records and use row-version concurrency. A stale edit is rejected and must be refreshed.

## Database and API

Migration `026_performance_reviews.sql` creates:

- `dbo.kpi_review_cycles`
- `dbo.kpi_assessments`
- `dbo.kpi_assessment_scores`
- the H2 2026 initial review cycle
- `performance.read` and `performance.manage` permissions
- database triggers that freeze completed reviews

Migration `029_sales_performance_reviews.sql` adds Sales KPI area codes and grants the existing Sales Engineer/Sales Manager roles the narrow KPI permissions they need. It does not alter existing assessments or completed scores.

The active application API is Node and is implemented in `backend-node/src/routes/performance.ts`. The Work Evidence engine is intentionally Node-only; no .NET runtime or endpoint is required.

Routes:

- `GET /api/v1/performance/overview`
- `GET /api/v1/performance/evidence/{employeeId}?cycleId={cycleId}`
- `POST /api/v1/performance/cycles`
- `PUT /api/v1/performance/assessments/{employeeId}`
- `POST /api/v1/performance/assessments/{employeeId}/complete`

For a fresh database, apply migrations in numeric order. Migration 027 intentionally depends on schema 25 only, so an upgraded installation must still verify that schema versions 25, 26 and 27 are all present.

## Work Evidence engine

The evidence endpoint reads existing operational records live; it does not add or duplicate KPI tables. The selected review cycle supplies the date window, and `employees.user_id` links the employee to recorded work.

- Project evidence includes project manager, lead engineer and project-member participation.
- Task evidence includes assigned Schedule tasks and Resource tasks. Resource rows linked to a Schedule task are excluded to prevent double counting.
- Inquiry evidence includes estimate ownership, inquiry creation and owned/recorded inquiry meetings.
- Delivery suggestions use only assigned tasks that are due as of the cycle's effective date. At least three due tasks and actual completion timing are required before a delivery signal is suggested.
- Quality suggestions require at least two assigned customer-issue tasks. Sparse data returns no numeric suggestion.

For Sales roles:

- Owned Inquiry evidence uses authenticated `created_by` and owned/recorded Inquiry meetings rather than relying on the free-text sales-owner label.
- Pipeline context includes current stage, qualification grade, recorded probability and weighted recorded estimate value.
- Customer engagement counts Inquiry meetings owned or recorded by the Sales user during the cycle.
- Forecast context shows approved/cancelled opportunities. A numeric accuracy suggestion is withheld because current probabilities are editable after an outcome and the evidence endpoint has no dated pre-outcome snapshots.
- Commercial evidence includes Estimate coverage, approved/locked status and recorded value.
- Handover suggestions require at least two approved opportunities and measure whether they are linked to Project records.

The response includes a framework code, source counts, coverage confidence, transparent KPI-area summaries and traceable source identifiers. These are decision-support signals only. Targets, margin, complexity and customer context remain human inputs. The employee or manager can copy a summary into the review, while the manager still selects and calibrates the final integer rating.

Read-only Team Test verification is available in `scripts/Test-KpiWorkEvidenceLive.ps1`; the existing `scripts/Test-KpiLiveSmoke.ps1` also verifies that the served frontend bundles include the Work Evidence contract.

## Sales KPI completion release (2026-09-06)

Apply only `029_sales_performance_reviews.sql` to the existing Team Test database with migrations 026 and 028 already installed. It is independent of later customer/import migrations. `scripts/Apply-SalesKpiMigration.ps1` validates the exact Team Test target, makes and verifies a COPY_ONLY/CHECKSUM backup, applies 029, then reads installed markers. The user explicitly authorized Sales KPI completion; the earlier pending-approval note no longer blocks this scoped migration.

Deploy the compiled Node `routes/performance.js`, `performance-framework.js` and `performance-evidence.js` modules together, plus the integrated frontend containing `PerformanceScreen.tsx`. Existing app registration and API client contracts are already present. `Test-KpiPerformanceReadiness.ps1` verifies SQL markers, Sales permissions and API readiness. A max schema version alone is insufficient because 029 can be missing beneath a higher marker.

Verification: fresh migrations 001–033 ran successfully in a newly created disposable SQL database. `backend-node/scripts/test-sales-kpi-integration.ts` passed 29 API/SQL checks covering Sales read/manage scope, partial drafts, submitted-score validation, stale versions, employee and manager privacy, independent completion, immutable completed scores and audit. Run it with `KPI_UAT_DATABASE` set only to a disposable database matching `IoTTeamCenter_SalesKpi_UAT_[0-9_]+`; it creates UAT users/reviews there and must never target Team Test. Evidence unit tests (4) and guardrail tests (5) also pass.

No numeric forecast-accuracy rating is generated from editable current probabilities. Existing evidence is live operational context, not a historical snapshot, and estimate amounts represent recorded costs rather than booked revenue or margin. The manager chooses and calibrates the final rating. Unrated/partial reviews do not depress the team average as zero scores.
