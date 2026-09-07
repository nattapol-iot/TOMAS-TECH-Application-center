# Application agent team

Established by user request on 2026-09-05. Main manager coordinates work in task
`01a071cd-d0a4-70f1-97ce-9cbf0b42b3d0`.

| Role | Agent handle | Responsibility |
| --- | --- | --- |
| Main manager | `/root` | Clarify outcomes, assign bounded work, coordinate file ownership, integrate and report results |
| Frontend | `/root/frontend` | Production screens, interaction, responsive layout and API integration |
| Backend & Data | `/root/backend` | API contracts, business rules, data access and scoped migrations |
| QA & Integration | `/root/qa` | Acceptance criteria, regression checks and integration verification |

These are subagents of the manager task, not separate sidebar tasks. They run
when assigned work; this setup does not create a background monitoring schedule.
If agent handles are no longer available in a later session, recreate the roles
with a concrete assignment and consult this document and COORDINATION.md.

## Work protocol

1. The user supplies the desired application change to Main manager.
2. Main manager checks existing tasks and COORDINATION.md before assigning work.
3. Assign an outcome, acceptance criteria and explicit file scope to each agent.
   Claim files in COORDINATION.md before editing; one writer per shared file.
4. Parallelize independent work. Sequence shared shell, API client, global CSS,
   route registration, dependencies and migration changes through one owner.
5. Agents report changed files, verification results and unresolved dependencies.
   Main manager reviews integration before reporting completion.
6. Do not overwrite other tasks' uncommitted changes. Review the current diff
   before edits; coordinate builds and runtime restarts separately.

## Existing task routing at setup

| Existing task title | Task ID | Context |
| --- | --- | --- |
| Review Inquiry and Sale visit | `01a071b9-edb9-76c1-97d9-e8464b082273` | Active at setup; coordinate Inquiry / Site Visit work here |
| ตรวจสอบ Project | `01a05217-7140-7e12-9fd1-501dda832c01` | Active at setup; check current scope before overlapping platform work |
| อัปเดต Solution ใน Knowledge Hub | `01a071c1-20d6-7963-b6d1-a4a65f862f71` | Existing Knowledge Hub context |

Task statuses and file claims are snapshots: inspect them again before each job.
Initial team assignment is read-only onboarding, with no application changes.

— Codex Main manager, 2026-09-05
