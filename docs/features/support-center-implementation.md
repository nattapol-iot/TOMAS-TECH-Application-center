# Support Center — implemented release

Implemented and enabled on the managed Team Test app on 6 September 2026:
http://192.168.1.160:3000/#support

## Using the feature

- The **แจ้งปัญหา / Report an issue** topbar button opens a dialog while retaining the source page. Reporters choose a category, describe the issue and impact, optionally add context and attach evidence. Successful creation shows the ticket number and a thank-you message; contribution points remain pending review.
- **Support Center** contains the reporter's own tickets and contribution history. Lists support search, status/category filters and pagination. Authorized staff also see the category queue, including assigned-to-me and unassigned filters.
- Ticket details provide replies, evidence, assignment, priority and status actions. Staff can add internal notes and internal files; reporters cannot read these, including when the reporter also has staff privileges.
- Admins configure category members under **ผู้ดูแลแต่ละหมวด** and may separately enable **ให้สิทธิ์มอบคะแนน**. Admins can manage all categories without membership setup. Category staff can claim unassigned tickets in their scope; Admins can reassign them.
- Authorized reviewers can thank a reporter with zero points or award **useful +5**, **detailed +3**, **actionable +2**, up to 10 per ticket. The latter two require the useful criterion. Self-awards and duplicate awards are blocked. Admin adjustments require a reason, preserve history and update the reporter's total by the difference.
- Notifications use the existing in-app bell and open the associated ticket. Own contribution history shows the awarded criteria, message and total. Labels support TH/EN/JP; submitted content stays in its original language.

## Persistence and boundaries

Migration `034_support_center.sql` introduces categories, scoped membership, tickets, append-only events, private attachment metadata and one recognition record per ticket. Dedicated API modules are `support-rules.ts`, `support-service.ts` and `routes/support.ts`; UI components are in `SupportScreens.tsx` with scoped translations and styles.

Mutations use request UUIDs for replay protection and row versions for concurrent edits. Recognition, event history, audit and notification writes are transactional. Downloads enforce ticket scope and internal-file visibility. Notification previews use generic text so changing category access cannot expose ticket content through old notifications.

Attachments accept PNG, JPEG and PDF, up to 10 MB each and five files per ticket. The implementation checks content type, file signatures and hashes and stores files privately. It does not include malware scanning. Automatic source context includes only the module name; additional steps or references are entered explicitly. There is no external email/Teams delivery, public leaderboard, automatic KPI score or reward redemption. The original design documents remain proposals for any further scope; this document describes the delivered behavior.

## Validation

- Backend unit suite: 79/79 passed.
- Isolated SQL/API integration: 53/53 passed against source and another 53/53 against the exact staged release, using restricted database permissions. Includes access scope, internal notes/files, assignment, workflow, recognition adjustment, no self-awards, idempotency and immutable history. Disposable databases and files were removed.
- Production guardrails: 30/30 passed. Root regression run: 173 passed and one stale schema-version expectation failed; corrected that expectation and reran its complete affected suite, 10/10 passed.
- Frontend typecheck, scoped ESLint, backend compilation and managed frontend production build passed. Final navigation/display changes were followed by another typecheck, scoped lint and managed frontend rebuild.
- Browser checks confirmed reporter versus Admin tabs, the category-membership screen, TH/EN/JP labels, empty contribution data and retaining a dirty report form when dismissing the close confirmation. Scoring writes were exercised in isolated API integration, not submitted through a live business ticket.
- Readiness reports schema 34 with storage available; LAN frontend returns HTTP 200. All 321 deployed API artifact hashes match the tested manifest. Final read-only SQL check found zero support tickets and zero recognition awards in the live database, and no remaining SupportCI databases.

## Managed release

- API release: `20260906-145718-support-center`, API PID 16572.
- Final frontend PID: 11784, managed through the existing Team Test launchers. A stale in-memory asset manifest after the first restart was resolved by rebuilding and restarting the frontend. All 12 JS/CSS assets referenced by the served page were then byte-verified against the current build (`ProductionApp-Dn3Ej7Qn.js`). Browser session restoration, initial `#support` entry, same-document hash navigation and clearing the hash when leaving Support all passed.
- Runtime: `C:\Users\natta\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache\Local\IoTTeamCenter\TeamTest`.
- Database: `IoTTeamCenter_CodexTest_20260830_04` on localhost.
- Verified SQL COPY_ONLY/CHECKSUM backup before migration: `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_before_support_20260906-145718.bak`.
- Previous API release retained: `20260906-135916-four-feature-completion`. The new API was staged selectively from that release, preserving its other released features. Publish automation is in `stage-support-release.mjs` and `Publish-SupportCenter.ps1`.

The managed app is intentionally left running. No actual tickets, recognition awards or member assignments were created as test fixtures.
