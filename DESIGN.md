# Design

## Source of truth

- Status: Performance Pulse pilot implemented; Estimate Cost brief remains design-only
- Updated: 2026-09-07
- Product surfaces: `KPI & Growth > My KPI` and its links to `Team Activity`, Project, Inquiry, and Task records; plus `Estimate Cost > Estimate detail` (added 2026-09-07). Surface-specific rules below apply only to their named feature.
- Estimate Cost brief: [Existing-workflow study and incremental improvements](docs/estimate-cost-workspace-design.md). Updated after the user explicitly rejected a whole-page redesign; prior tab consolidation/drawer proposals are withdrawn. KPI pilot scope remains unchanged.
- Estimate evidence reviewed: user-supplied Approved R00 / Cost Items screenshot; `EstimateScreens.tsx` workspace, grouping, quick-add and workflow; `globals.css` tokens and pinned cost columns; Node estimate write routes; `docs/estimate-excel-import.md`; existing cost validation, revision and Excel import regression files. No approved target mockup or Estimate Storybook baseline was supplied. The screenshot is the current-state baseline, not a pixel-matching target.
- Design objective: add an employee-facing encouragement layer that turns existing work evidence into clear recognition, early warning, and one practical next step without becoming an automatic performance verdict.

Evidence reviewed:

- `docs/kpi-performance-reviews.md`: role-specific KPI frameworks, review privacy, evidence thresholds, and the rule that operational signals are decision support only.
- `docs/team-activity.md` and `docs/team-activity-qa.md`: reporting-discipline formula, minimum-data rules, privacy boundaries, clarifications, trial/active modes, and anti-double-counting constraints.
- `app/system/production/PerformanceScreen.tsx`: My Performance Snapshot, role KPI cards, Work Evidence, Growth focus, manager scope, and source navigation.
- `app/system/production/ActivityKpiSummary.tsx` and `app/system/production/TeamActivityScreen.tsx`: activity score, evidence drill-down, reporting calendar, and employee clarification flow.
- `backend-node/src/performance-evidence.ts` and `backend-node/src/routes/performance.ts`: Project, Inquiry, Task, Issue, Meeting, Estimate, and handover evidence; confidence calculation; role and privacy enforcement.
- `app/system/api-client.ts`: current Performance Evidence response contract.
- `app/system/i18n.ts`, `app/system/production/performance-evidence-copy.ts`, and `app/globals.css`: Thai/English/Japanese copy, localization pattern, TOMAS TECH tokens, density, and responsive rules.
- `docs/manual/screenshots/performance-th.jpg`: current Thai KPI Framework visual hierarchy and desktop density.
- `tests/performance-guardrails.test.mjs` and `tests/performance-presentation.test.mjs`: privacy, source traceability, missing-score behavior, and localized evidence guardrails.
- User account role management evidence: user-supplied Master Data > User accounts screenshot; `app/system/production/CoreScreens.tsx`; `app/system/api-client.ts`; `backend-node/src/routes/bootstrap.ts`, `backend-node/src/routes/admin.ts`, and `backend-node/src/users.ts`; `database/migrations/001_core.sql` and `004_security_seed.sql`. The current surface is read-only and exposes one primary application role per active account.

Observed facts:

- The system already knows assigned and completed work, due dates, actual delivery, overdue work, assigned customer Issues, Issue closure, Inquiry ownership, customer meetings, Estimate outcomes, and Project handovers.
- Engineering delivery suggestions already require at least three due tasks; quality suggestions require at least two assigned Issue tasks.
- Current evidence is a cycle-scoped view of live operational records, not a historical trend snapshot.
- There is no durable recognition, kudos, acknowledgement, or encouragement-history entity.

Assumptions for the pilot:

- The first release is a private, read-only insight for the employee. It derives from existing evidence and requires no new database table.
- The feature uses the selected KPI cycle, not a public leaderboard or cross-employee comparison.
- A later manager-to-employee kudos message and personal trend history are separate product slices because they require persistence and additional privacy decisions.

## Brand

### Estimate Cost addition

Preserve the current TOMAS TECH Estimate identity, terminology and familiar controls. Improve specific clarity problems found in the existing workflow; do not replace the page with a new visual concept.

- Personality: calm, fair, specific, supportive, and engineering-minded.
- Trust signals: exact numerator/denominator, selected period, evidence-confidence label, last-updated date, and links to source work.
- Recognition should feel earned but modest. Use factual language such as “ส่งมอบตรงเวลา 8 จาก 9 งาน” before an encouraging interpretation.
- Avoid: rankings, leaderboards, streak pressure, childish trophies, confetti, employee-versus-employee comparison, moral judgement, surveillance language, and red-heavy dashboards.
- Never label a person as “มีปัญหา”, “ช้า”, or “ผลงานแย่”. Describe the work state and the next controllable action.

## Product goals

### User account role management addition

- Let an authorized Admin change an active employee login account's primary application Role from the existing User accounts table.
- Make the access impact explicit before saving, refresh effective permissions after saving, and record every change in the immutable audit log.
- Keep Employee department, level, job title, and personal data unchanged; those remain owned by the Employees tab.
- Non-goals: creating/deleting accounts, editing role definitions or permission grants, assigning additional signing/business roles, or bypassing Microsoft Entra provisioning.
- Success means an Admin can complete a role change in one modal, unauthorized users see no edit control, stale writes are rejected, and the last active Admin cannot be demoted.

### Estimate Cost addition

User correction on 2026-09-07: study existing behavior first and improve it incrementally. Success means the existing nine tabs, table, default cost breakdown and editing methods remain familiar while a demonstrated usability problem is resolved. The earlier four-group redesign and fixed visible-row target are withdrawn.

Goals:

1. Let an employee answer within ten seconds: “อะไรที่ฉันทำได้ดี”, “อะไรต้องระวัง”, and “ควรทำอะไรต่อ”.
2. Recognize strengths with traceable work evidence, not generic praise.
3. Surface delivery or quality risk early using neutral coaching language.
4. Keep Engineering and Sales insights role-relevant.
5. Preserve human judgement: the insight must never silently set or change a KPI rating.

Non-goals:

- Automatic final ratings, disciplinary decisions, attendance scoring, productivity surveillance, or replacement of manager conversations.
- Public badges, team ranking, peer comparison, or rewarding raw work volume.
- Claiming “งานไม่มีปัญหา” merely because no Issue record exists.
- Counting the same late update both in Reporting discipline and again as a generic teamwork penalty.
- Historical trend claims until a reliable frozen comparison snapshot exists.

Success signals for the pilot:

- Employees can correctly identify one evidence-backed strength and one next action without opening the detailed evidence panel.
- Every quantitative statement can be traced to the selected cycle and, when available, to its source work.
- Low-data cases show “ข้อมูลยังไม่พอ” rather than positive or negative conclusions.
- Employee feedback reports that wording feels helpful rather than punitive.
- No insight exposes manager-only written feedback or another employee’s data.

## Personas and jobs

### Estimate Cost addition

Engineer, estimate owner, reviewer/manager and authorized Sales users retain their existing jobs and role-specific controls. Review both Draft and Approved plus section-limited access before drawing conclusions from the supplied Approved Cost Items screenshot alone.

### Engineer

- Job: understand delivery reliability, open Issue load, completed technical work, and the most useful next action.
- Context: checks My KPI before self-review or during weekly work planning.

### Sales Engineer

- Job: understand customer activity, opportunity movement, Estimate coverage, forecast context, and handover quality.
- Context: checks My KPI before pipeline review or self-review.

### Engineering, Project, and Sales Manager

- Job: use the same evidence vocabulary during one-to-one coaching without turning the signal into a verdict.
- Context: existing Team progress and Work Evidence views. The pilot does not add a public manager leaderboard.

### Admin

- Job: verify policy, localization, privacy, and source coverage. Admin access must not change the employee-facing tone.

## Information architecture

### User account role management addition

- Keep role management in `Master Data > User accounts`, beside the current role badge and account identity.
- Add one right-aligned Actions column. `Edit role` opens a focused modal with read-only employee/account context, current role, new role, role description, and an access-impact warning.
- Do not place application Role in the Employee edit form because Employee Master and login authorization are separate records.

### Estimate Cost addition

Retain all nine existing tabs and their order: Summary, Cost Items, Engineering Man-hour, Other Project Cost, Assignment, Validation, Revision History, Compare Revision and Engineering Review. Keep Summary as first-open default, the eight summary tiles, toolbar and current editing modals. Do not consolidate navigation, move Validation into a drawer, or collapse the cost breakdown by default. The scoped brief now documents the existing structure and a bounded investigation plan.

### KPI pilot

The new section is named **สัญญาณผลงานของฉัน / My Performance Pulse / 私のパフォーマンスシグナル**.

Placement in `KPI & Growth > My KPI`:

```text
[ My Performance Snapshot · score · review status ]

[ สัญญาณผลงานของฉัน · H2 2026 · ความเชื่อมั่นสูง ]
┌ สิ่งที่ทำได้ดี ──────┐ ┌ จุดที่ควรดูแล ──────┐ ┌ ก้าวถัดไป ─────────┐
│ ส่งมอบตรงเวลา 8/9 งาน │ │ มี 2 งานเลยกำหนด       │ │ เริ่มจากงานที่ค้างนานสุด │
│ ดูงานต้นทาง            │ │ ดูรายการ                │ │ เปิด My Work             │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘

[ Reporting discipline ]
[ Role-specific KPI cards ]
[ Work evidence · detailed sources and methodology ]
[ Growth focus ]
```

Hierarchy rules:

- Show at most three insight cards: one strength, one attention item, and one next action.
- Do not manufacture a warning to fill the second card. If no material risk is supported, show “รักษาจังหวะนี้” with a useful maintenance action.
- If evidence is insufficient, replace unsupported cards with one full-width explanation of what data is needed.
- Keep Work Evidence as the detailed audit surface. Performance Pulse summarizes and links; it does not duplicate the full evidence list.
- The employee view is the pilot’s primary surface. Manager-selected employee insight is deferred until wording and attribution are validated with staff.

## Design principles

### User account role management addition

1. **Authorization is visible and enforced twice.** Only users with `admin.manage_roles` see the control; the API independently requires the same permission.
2. **One deliberate change.** The modal edits only the primary Role and cannot silently alter department, level, sign-in state, or secondary signing roles.
3. **Safe administration.** Use optimistic concurrency, active-role validation, immutable audit history, and a last-Admin guard.
4. **Immediate truth.** Refresh bootstrap data after saving so badges, navigation, and the current user's permissions reflect the database result.

### Estimate Cost addition

Observe first, distinguish facts from hypotheses, reproduce the specific problem, then change the smallest relevant part. Keep existing keyboard shortcuts, column views, grouping, totals and permissions. Missing-data prompts and server validation have different meanings; do not unify their counts or blocking rules without a separate functional requirement.

1. **Evidence before encouragement.** State the measurable fact, then the supportive interpretation.
2. **Personal context, never peer comparison.** Compare with a target, due date, or the employee’s own future snapshot—not team rank.
3. **Positive first, honest second.** Recognition appears first, but supported risks are not hidden.
4. **Work state, not personal label.** “มี 2 งานเลยกำหนด” is acceptable; “คุณส่งงานช้า” is not.
5. **One controllable next step.** A warning must include one concrete action or source link.
6. **Absence of data is not success.** Zero recorded Issues can mean no Issues, missing linkage, or insufficient coverage.
7. **Role relevance.** Engineer and Sales messages use different evidence and vocabulary.
8. **No double punishment.** The same event may explain context in multiple places but must not become duplicate scoring deductions.

## Visual language

### Estimate Cost addition

Reuse the current tokens, typography, table density and layout. Measure clipping, spacing and sticky-column behavior before a local CSS change. Do not hide summary tiles, remove subtotals or change the default column set merely to reduce visual density.

- Preserve the current TOMAS TECH navy, white, and light-grey application shell.
- Recognition: `--green-soft`, `--green-line`, `--green-text`; use a check-circle or trending-up icon plus the label “สิ่งที่ทำได้ดี”.
- Attention: `--amber-soft`, `--amber-line`, `--amber-text`; use alert-triangle plus a neutral label. Reserve red for a genuinely blocked or critical state that already uses the product’s red semantics.
- Next action: `--blue-soft` or `--violet-soft`; use arrow-right, target, or trending-up.
- Data confidence: existing green/blue/amber badge tones with explicit text; never encode confidence by color alone.
- Cards use the existing 8–12 px radius, 1 px semantic border, and `--shadow-xs` at most. Encouragement should not look like a marketing banner.
- Main fact: 18–22 px semibold. Explanation: at least 14 px. Metadata: 12–13 px. Thai line height at least 1.5.
- Motion is limited to a 150–200 ms hover/focus transition. No celebratory animation in the pilot.

## Components

### User account role management addition

- Reuse `Panel`, `Badge`, `Modal`, `Field`, `Icon`, existing buttons, form controls, callouts, and master-data layout tokens.
- Add `UserRoleModal` inside `CoreScreens.tsx`; add no new global component layer.
- The Role list is API-backed from active `dbo.roles`; the browser must not hard-code security roles.

### Estimate Cost addition

Reuse the existing PageHeader, Panel, Tabs, Badge, Field, Modal, Icon, formatters, costModuleGroups, inline add row and item editor. No new drawer, grouped action menu or global component layer is part of this scope. Changes to disabled controls require verification in Approved/Locked and section-limited editable states.

### New: `PerformancePulse`

- Inputs: selected cycle, framework code, evidence confidence, server-produced `insights`, and source-navigation callbacks.
- Renders a section heading, cycle/confidence metadata, and one to three `PerformanceSignalCard` items.
- Does not accept or render manager-only summaries.

### New: `PerformanceSignalCard`

- Variants: `strength`, `attention`, `next`, and `insufficient-data`.
- Content: category label, factual headline, one-sentence interpretation, evidence period, and one action.
- Action variants: `Open source work`, `View evidence`, `Open My Work`, or no action when no safe source exists.

### Reused

- `Badge`, `Icon`, existing buttons and semantic color tokens.
- `ActivityKpiSummary` remains separate so reporting discipline is not confused with delivery or quality.
- `WorkEvidencePanel` remains the traceable detail view.
- `Growth focus` remains the durable self-review development goal; the next-action card may suggest opening it but must not overwrite it.

### Signal selection contract for pilot v1

The existing evidence endpoint is extended additively with structured, server-produced insight candidates. The UI never parses English evidence strings to make a decision. No new table is required.

```ts
type PerformanceInsight = {
  reasonCode: string;
  kind: "STRENGTH" | "ATTENTION" | "NEXT" | "CONTEXT";
  areaCode: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  priority: number;
  facts: Record<string, number | string | boolean | null>;
  source: { type: "PROJECT" | "INQUIRY" | "TASK"; id: number; label: string } | null;
};
```

Engineering reason contract:

| Reason code | Eligibility and provisional pilot rule | Priority | Required facts | Safe fallback |
| --- | --- | ---: | --- | --- |
| `DELIVERY_EARLY` | At least one Project has `actualDate < targetDate` | 10 | `actualDate`, `targetDate`, `earlyProjectCount`, `deliveredProjectCount` | If dates are equal, use `DELIVERY_ON_TIME`; never say “ก่อนกำหนด” |
| `DELIVERY_ON_TIME` | At least 3 due tasks and `onTimeCount / dueCount >= 0.80` | 20 | `onTimeCount`, `dueCount` | Below sample minimum becomes context only |
| `DELIVERY_REVIEW` | At least 2 overdue tasks, or at least 4 due tasks with `overdueCount / dueCount >= 0.25` | 10 | `overdueCount`, `dueCount`, `oldestDueDate` | Neutral “มีงานเลยกำหนดที่ควรทบทวน”; never infer cause or effort |
| `ISSUE_HANDLING_STRONG` | At least 2 distinct assigned Issue tasks and `closedIssueCount / issueCount >= 0.80` | 30 | `closedIssueCount`, `issueCount` | Describe Issue handling only |
| `ISSUE_WORKLOAD_REVIEW` | At least 2 distinct assigned Issues remain open | 20 | `openIssueCount`, `issueCount`, `oldestIssueDate` | Neutral workload/context message; never claim the employee caused the Issues |
| `TECHNICAL_CONTRIBUTION` | At least one completed, non-Issue technical signal linked to source work | 40 | `completedCount` | Qualitative recognition with no invented rate |

Issue attribution invariant: v1 may say only **Issue workload** or **Issue handling**. Assignment does not prove defect origin, workmanship, cause, reopen history, or rework responsibility. The UI must never translate these reasons into “งานของคุณมีปัญหามาก/น้อย”. Defect-incidence conclusions are deferred until causal ownership is represented by trusted structured data.

Sales reason contract:

| Reason code | Eligibility and provisional pilot rule | Priority | Required facts | Safe fallback |
| --- | --- | ---: | --- | --- |
| `CUSTOMER_FOLLOWUP_COVERED` | At least 3 active owned Inquiries and distinct Inquiry coverage with a valid recorded meeting is at least 70% | 20 | `activeInquiryCount`, `inquiriesWithMeetingCount` | State coverage; never praise meeting volume |
| `CUSTOMER_FOLLOWUP_REVIEW` | At least 3 active owned Inquiries and coverage is at or below 30% | 20 | `activeInquiryCount`, `inquiriesWithMeetingCount` | “ตรวจ Inquiry ที่ยังไม่มีกิจกรรมลูกค้าที่บันทึก”; context only |
| `ESTIMATE_COVERAGE_STRONG` | At least 3 qualified Inquiries requiring an Estimate and coverage is at least 80% | 30 | `eligibleInquiryCount`, `estimateCoveredCount` | Below sample minimum becomes context only |
| `ESTIMATE_COVERAGE_REVIEW` | At least 3 eligible Inquiries and coverage is below 50% | 30 | `eligibleInquiryCount`, `estimateCoveredCount` | Link to the oldest eligible Inquiry when authorized |
| `HANDOVER_COMPLETE` | At least 2 approved opportunities and every one is linked to a Project | 10 | `approvedCount`, `handoverCount` | Show `handoverCount/approvedCount` |
| `HANDOVER_REVIEW` | At least 1 approved opportunity is not linked to a Project | 10 | `approvedCount`, `handoverCount` | Link to the oldest approved opportunity missing a handover |
| `FORECAST_CONTEXT` | Approved or cancelled opportunities exist, but no dated pre-outcome probability snapshot exists | 50 | `approvedCount`, `cancelledCount` | Context only; never strength/attention and never a numeric accuracy claim |

“Active”, “qualified”, “requires an Estimate”, “approved”, and “linked to a Project” use the server’s canonical workflow states. They must not be inferred from labels in the browser. Pipeline stage-movement praise is deferred until a reliable stage-history source exists.

Anti-gaming and deduplication:

- Count canonical distinct work identities. A Resource task linked to a Schedule task counts once.
- Issue closure uses server state. A reopened Issue is not closed; splitting one problem into several tasks does not create extra recognition.
- Customer follow-up uses distinct Inquiry coverage, not meeting count. Multiple meetings on the same Inquiry do not raise the ratio.
- Estimate coverage uses distinct eligible Inquiries, not Estimate revisions.
- Handover uses distinct approved Inquiries linked to an active, non-deleted Project.
- Deleted, duplicate, cancelled, unauthorized, and client-only events are excluded. All dates and cutoffs use Bangkok time.

Selection and conflict rules:

- Prefer HIGH-confidence evidence, then MEDIUM. LOW confidence may show context but not a strong praise or warning claim.
- A strength and attention item may coexist when they describe different dimensions.
- If multiple candidates qualify, choose by confidence, then the fixed priority above, then the largest affected ratio/count, then `reasonCode` for a stable tie-break.
- Reporting discipline and blocked-work inference are outside Pulse v1. `ActivityKpiSummary` remains a separate authorized component and no hidden Activity quality score is passed into Pulse.
- Numbers always show the base: `8/9`, not only `89%`.
- Thresholds are provisional pilot defaults used only to select copy. They do not change KPI or Activity scoring and must be versioned if changed after the pilot starts.
- The server returns stable reason codes and structured facts; localized motivational copy is selected in the UI. Do not generate employee feedback with an external AI model in the pilot.

## Accessibility

### User account role management addition

- The action button has an employee-specific accessible name; the Role select has a visible label and description.
- Error, saving, disabled, and warning states remain available without color alone. Keyboard users can open, select, save, cancel, and close the modal.

### Estimate Cost addition

Target WCAG 2.2 AA using existing table and dialog semantics. Verify focus, current keyboard shortcuts and IME behavior before changing cancellation or navigation. Avoid silently discarding entered values. Validate contrast and 200% enlargement for any visual change without claiming compliance from source inspection alone.

- Target WCAG 2.2 AA.
- Render the section as a labelled region and the cards as a semantic list.
- Each card includes an explicit text label (`ทำได้ดี`, `ควรดูแล`, `ก้าวถัดไป`); color and icon are supplemental.
- Source actions are real buttons or links with visible focus and descriptive accessible names such as “เปิดงาน PJ260022”.
- Do not auto-focus warnings or announce routine score changes with an assertive live region.
- Loading may use a polite status. Errors use `role="alert"` only when an employee action failed.
- Respect reduced-motion preferences; the feature remains fully understandable with motion and color removed.
- Localized Thai, English, and Japanese copy must fit at 200% text enlargement without clipping.

## Responsive behavior

### User account role management addition

- Preserve the horizontally scrollable account table on narrow screens. The action remains the final column and the modal uses the existing single-column mobile behavior.

### Estimate Cost addition

Preserve current responsive rules initially. Capture before/after evidence at the actual desktop viewport and a narrow viewport before changing Estimate-scoped spacing or pinned columns. Do not introduce a new responsive layout or full-screen editing flow as an assumed requirement.

- Desktop above 1180 px: three equal signal columns with aligned actions.
- Tablet 621–1180 px: two columns; the next-action card spans the second row when it is the third item.
- Mobile at 620 px and below: one-column order of strength, attention, then next action. Buttons become full width with at least 44 px touch height.
- Long Thai/Japanese text wraps naturally; no fixed card height, ellipsis, or hidden evidence count.
- At narrow widths, cycle and confidence metadata wrap below the section title rather than compressing the title.

## Interaction states

### User account role management addition

- Loading roles: disable the selector and save action.
- No change: keep Save disabled.
- Saving: disable close-sensitive controls and show the existing saving label.
- Success: close the modal, refresh bootstrap, update the badge, and show a notification.
- Stale account version: keep the modal open, show the API conflict, and require a refresh before retrying.
- Self-role change: show an amber warning that the current session's navigation and permissions will refresh immediately.
- Last active Admin: reject demotion with a specific error and leave the account unchanged.

### Estimate Cost addition

Study current loading, empty, saving, error, stale-version and read-only behavior before changing it. The directly observed quick-add reset paths on category switching and Escape require reproduction with nonempty drafts. Preserve save-and-add-next behavior, explicit saves, server concurrency and current offline limits.

- Loading: three low-emphasis skeleton cards without optimistic praise or warning.
- High/medium confidence: render supported facts, confidence, period, and actions.
- Low confidence: show available facts as context and a full-width “ข้อมูลยังไม่พอสำหรับสรุป” explanation.
- Empty/no linked work: explain that no assigned work was found for the selected period and link to My Work when permitted.
- Mixed result: show both strength and attention without averaging them into a vague message.
- All clear: replace the attention slot with a maintenance suggestion; do not leave an unexplained blank card.
- Error: keep the KPI snapshot usable, show a compact retry state, and do not fall back to stale or sample encouragement.
- Source unavailable or unauthorized: omit the source action and retain the aggregate fact only if the API authorizes it.
- Review completed: retain the frozen cycle insight when a frozen evidence snapshot exists; otherwise label live evidence clearly and do not imply it was the original completion-time state.
- Offline/slow network: preserve the last explicit page state only if the application already supports safe caching; otherwise show loading/error honestly.

## Content voice

### Estimate Cost addition

Clarify labels in place using existing TH/EN/JP mechanisms. Explain that document validation and module missing-data prompts are distinct; preserve canonical status values, business text and current accounting meaning. Do not rename the overall navigation or introduce new terminology without evidence of confusion.

- Lead with a fact, follow with encouragement, end with one action.
- Use short, direct Thai. English and Japanese translations preserve meaning rather than word order.
- Approved patterns:
  - “คุณส่งมอบตรงเวลา 8 จาก 9 งาน — ความสม่ำเสมอนี้ช่วยให้ทีมวางแผนต่อได้มั่นใจ”
  - “คุณปิด Issue ได้ 5 จาก 6 รายการ — เหลืออีก 1 รายการที่ควรติดตามต่อ”
  - “มี 2 งานเลยกำหนด — ลองเริ่มจากงานที่ค้างนานที่สุด หรือบันทึกอุปสรรคให้หัวหน้าช่วยปลดล็อก”
  - “ข้อมูลยังไม่พอจะสรุปคุณภาพงาน — ระบบจะแสดงใหม่เมื่อมี Issue ที่ได้รับมอบหมายอย่างน้อย 2 รายการ”
- Avoid:
  - “ยอดเยี่ยมที่สุดในทีม”, “คุณช้า”, “คุณมีปัญหาเยอะ”, “ผลงานตก”, “ไม่มีปัญหาเลย”, or “ระบบตัดสินว่าคุณควรได้คะแนน…”.
- Use `Issue`, `Project`, `Inquiry`, and `Task` consistently with the current product vocabulary.

## Implementation constraints

### User account role management addition

- Node/SQL Server remains the authorization source. Add a dedicated `admin.manage_roles` permission granted only to Admin; do not reuse broad `master.write` access held by non-admin operational roles.
- Role updates require the account row version, an active target account, and an active target Role. The transaction locks the target and protects the final active Admin.
- The application database role receives only column-scoped update access needed for `users.role_id` and `users.updated_at`.
- Tests must cover the dedicated permission, active-role lookup, concurrency check, last-Admin protection, audit write, API client contract, hidden unauthorized UI, refresh-after-save behavior, and readiness schema range.

Acceptance criteria:

1. Admin sees an Edit role action for every active user account and can choose only active Roles returned by the API.
2. A successful save updates the SQL user Role, writes an audit event, refreshes bootstrap, and updates the table without a page reload.
3. Users without `admin.manage_roles` cannot see the action and receive HTTP 403 if they call the endpoint directly.
4. Concurrent edits, unknown/inactive Roles, missing accounts, and demotion of the last active Admin fail without a partial update.

### Estimate Cost addition

Design investigation only for this correction; no application changes or restart. Preserve the existing Estimate surface and all accounting/workflow/import contracts. Search/filter additions, autosave and drawers are outside this bounded improvement scope. Before implementation, reproduce the chosen problem, add targeted behavioral coverage when needed, and verify the relevant regressions and before/after UI. See the revised scoped brief for the study sequence and acceptance criteria. Preserve unrelated KPI pilot work.

### KPI pilot constraints

- Frontend remains React/Vinext with the existing component and CSS-token system. Active application APIs remain Node/SQL Server; this design does not introduce .NET work.
- Pilot extends `/api/v1/performance/evidence/{employeeId}` with the structured `insights` array defined above. Calculations and reason selection are server-owned and deterministic; the client owns localization and layout only. No new persistence is required.
- Preserve current role scope: employees see only their own evidence; managers and Admin remain constrained by existing performance/activity authorization.
- Preserve current privacy: manager evidence and summaries remain hidden until the review workflow allows them.
- Preserve current decision-support disclaimer. Performance Pulse never writes a KPI rating or Growth focus automatically.
- Preserve cycle dates, Bangkok time handling, Activity minimum-data logic, approved exceptions, and missing-data semantics.
- Existing Project/Task evidence does not expose a trusted blocked, customer-delay, reassignment, or approved-delay-exception reason. Until it does, overdue insight is a neutral review prompt, never a negative performance conclusion.
- Reuse existing TH/EN/JP localization mechanisms; no hard-coded English-only operational strings.
- Performance budget: no new charting or AI dependency; compute at most a small fixed set of signal candidates per loaded evidence response.
- Required tests before implementation release:
  - deterministic signal selection and priority;
  - minimum sample and LOW-confidence behavior;
  - zero Issues does not become “no problems”;
  - assigned Issues are described only as workload/handling and never defect causation;
  - “early” appears only with actual-before-target evidence;
  - canonical task/Issue/Inquiry/Estimate/handover deduplication and anti-gaming rules;
  - deterministic Sales eligibility, thresholds, priorities, fallbacks, and tie-breaks;
  - role-specific Engineering/Sales copy;
  - privacy and unauthorized source links;
  - TH/EN/JP presentation;
  - mobile wrapping and keyboard focus;
  - existing KPI, Activity, typecheck, lint, and production build regression checks.

Acceptance criteria:

1. My KPI shows no more than three concise, role-specific insight cards for the selected cycle.
2. Every praise or warning contains a measurable fact, its data base/period, confidence, and a safe drill-down where available.
3. Insufficient evidence produces no personal conclusion.
4. The wording never ranks employees or attributes a work state, assigned Issue, or delay cause to personality, effort, or workmanship.
5. The feature is read-only and cannot alter KPI scores, activity scores, or written review content.
6. Thai, English, and Japanese states are complete and accessible on desktop and mobile.

## Open questions

- [ ] Estimate product owner/QA: confirm the specific friction after an existing-workflow walkthrough; preserve all nine tabs and defaults in the meantime.
- [ ] Estimate QA: reproduce nonempty quick-add cancellation/navigation behavior and section-limited access before changing it.
- [ ] Estimate QA: capture the current desktop/narrow layout before proposing local spacing or sticky-column fixes.

- [ ] Product owner + Engineering/Sales managers: validate the provisional pilot thresholds after two weeks of shadow results (80% on-time, 25% overdue, two open Issues, and the Sales coverage thresholds). Impact: determines which message appears in the next version, never KPI scoring.
- [ ] Product owner + staff representatives: confirm whether managers should see the same synthesized Pulse after the employee-only pilot. Impact: privacy perception and coaching workflow.
- [ ] Product owner + HR/management: decide whether phase 2 needs a private “ส่งคำชื่นชม” message with acknowledgement/history. Impact: new storage, notification, retention, and moderation requirements.
- [ ] Backend owner: define a frozen personal-baseline snapshot before adding “ดีขึ้นจากรอบก่อน”. Impact: historical accuracy and migration/API scope.
- [ ] Engineering/Sales managers + backend owner: define trusted structured reason/exception fields for blocked work, customer-caused delay, and reassignment. Until then, overdue cards remain neutral review prompts. Impact: future coaching specificity and false-positive prevention.
