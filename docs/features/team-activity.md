# Team Activity and reporting discipline

Team Activity is available from Organisation. Staff see their own history; Admin sees all active accounts. Department managers (Engineering Manager, Sales Manager, or primary Management role) see their department. Project managers and named lead engineers see reporting activity for projects they lead. An additional Management **signing** role does not expand access. Project-only access never reveals company-wide login history or aggregate KPI scores. KPI quality review additionally requires `performance.manage`, department scope, and a different reviewer.

## Starting a trial

1. Open Team Activity and select a member.
2. Add a reporting commitment using an existing assigned leaf schedule task, approved resource task, or owned open Inquiry. Select weekdays, a Bangkok deadline, start and end dates. Commitments start tomorrow or later; no historical obligations are invented.
3. Staff update their existing work or submit the three-field daily report from their own activity detail. The daily report is evidence; it does not silently change the source task's percentage.
4. Review the reporting calendar, timeline, and cycle score. Quality review requires a written explanation and 1–20 actual update IDs from that employee and cycle. If the server confirms there were no updates in the entire cycle, a manager may record zero in all three quality areas with a written explanation and no evidence IDs. This allows a fully missing-report cycle to be finalized. Staff can append a clarification.
5. Existing cycles default to TRIAL. Admin can create a new KPI cycle and publish its TRIAL or ACTIVE policy **before** it starts. An ACTIVE policy contributes 10% with a minimum of 10 assessed reporting days. Published policies are immutable.

No production commitments, quality awards, exemptions or active KPI policies are automatically seeded by the migration. This allows leaders to agree on reporting frequency before scores accrue. Successful work updates begin recording immediately after installation; account sessions begin on the next authenticated foreground navigation or interaction. Existing audit records are not backfilled as login history.

## Formula version 1

- Timeliness: sum of daily credit / assessed duty days × 60. Credit is 1 for an on-time report, 0.5 for a late report within the same Bangkok day, 0 for missing or backdated work.
- Coverage: distinct duty occurrences updated on their due day / expected duty occurrences × 25. A task appearing in both Resource Plan and Schedule has one canonical Schedule Task identity.
- Quality: clarity, next step and evidence/blocker quality, each 0–5, totaling 15. Rubric: 0 absent, 3 needs follow-up, 5 clear and actionable. Login count and session duration earn no points.
- The current day is excluded from numerical scores until its final duty deadline has passed, including when one task has already been updated early.
- No-data dates, holidays, approved exceptions and days without duties are excluded. A future stop never changes previous days. Native Done/Closed updates stop associated reporting commitments from tomorrow. Leaders stop commitments when responsibility otherwise changes.
- No quality review means an automatic score out of 85, with total and rating pending. Fewer than 10 assessed days is N/A for KPI weighting, not a zero.
- Rating = 1 + total / 25. Active KPI = original role-weighted rating × 0.9 + activity rating × 0.1. Trial and insufficient-data cycles retain the original KPI at 100%. Existing role framework percentages retain their relative proportions. Avoid using missing app updates as a second deduction in the existing teamwork rubric.

Only a successful server-side business transaction earns an event. Schedule progress, resource task progress and Inquiry qualification/meeting changes supply automatic work-update evidence. Other audited mutations supply action metadata, and page visits remain usage-only. Repeated report bodies, request retries, page refreshes, polling and token refreshes do not earn additional reporting credit. Client timestamps and actor IDs are never trusted. Several tabs/devices share one user session until 30 minutes of inactivity. Presence is approximate app activity, not attendance or hours worked.

## Review integrity

The existing Self Review → Manager Review → Calibration → Completed workflow remains. Manager quality drafts are hidden from the employee until finalized. An active cycle cannot complete before its period ends or, when there are sufficient days, while quality is pending. Completion writes the activity snapshot in the same transaction as KPI completion. If the KPI update fails, the snapshot rolls back. Completed snapshots and quality cannot be edited. Exceptions also fail if any overlapping review is already closed or finalized. Original timestamps and the selected evidence IDs remain available.

The default reporting formula, 10% weight and 10-day minimum are fixed in version 1. A future formula change should introduce a new policy version, not edit historical cycles. Department scope currently follows the account's department, not a free-text job-title hierarchy. Multi-department access is intentionally not inferred from title text.

## Storage and deployment

Migration `035_team_activity.sql` adds activity settings, sessions, immutable events, effective-dated reporting commitments, approved exceptions, cycle policies, quality reviews, clarifications and final snapshots. It records the start of tracking and adds object-scoped application-role grants. Fresh-deployment and readiness checks require schema 35.

This checkout retains old Sites metadata, but its operational runtime is the established private-LAN frontend and Windows Node/SQL Server API. Preserve that architecture and the existing `.openai/hosting.json`; do not publish private-LAN configuration or SQL credentials to an unrelated hosted Site.

Validation: `backend-node/tests/activity-rules.test.ts` covers formula/time boundaries; `backend-node/tests/activity-integration.ts` creates and removes its own isolated database, applies all migrations, uses restricted application-role permissions, and exercises session deduplication, scope, idempotency, exemptions, quality, rollback and trial/active KPI completion. `ACTIVITY_TEST_APP` can target the exact staged release. No real business fixtures are created.

## Released validation — 7 September 2026

The managed Team Test application at http://192.168.1.160:3000/ serves this feature. API release `20260906-173538-team-activity` passed all 63 isolated SQL/API integration checks before installation; all 333 installed artifacts match the tested stage. Migration 035 was applied after a verified COPY_ONLY/CHECKSUM SQL backup. The frontend production build is running, and all 12 referenced JS/CSS assets match the local build byte-for-byte.

Backend unit tests passed 86/86, focused UI/performance/i18n checks passed 22/22, and production/site-visit guardrails passed 41/41. Frontend/backend typechecks and scoped lint passed. Live browser verification confirmed the Thai navigation, eight-column activity table, own-only employee scope, real session history, reporting calendar, trial score breakdown and no-duty state without creating business fixtures.

The complete repository test command is not green: its global lint includes old generated/backup files and unrelated existing errors. The standalone root suite also exposed an existing .NET inventory-flow expectation (`5` versus `6.0000` usable quantity); activity does not alter inventory. A stale navigation-count assertion was corrected and its affected guardrails passed. These broader limitations are recorded separately from the passing activity checks. Existing KPI cycles remain TRIAL, and no reporting rules, quality awards or active policies were seeded.

The subsequent independent testing-team review found and fixed LAN HTTP reporting, project-only exception privacy, hidden-score inference, all-missing KPI completion, draft target switching and oversized date validation. See [the QA report](../audits/team-activity-qa.md) for reproductions, final checks and release details.
