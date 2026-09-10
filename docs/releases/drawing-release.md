# Drawing release from a Project Task

Implemented 2026-09-05 by Codex. Reuses Node Signing, project storage, SQL transactions,
row versions, specimen/authority checks and append-only signing history.

## User flow

1. Project manager creates a leaf Design task and assigns its Member/PIC.
2. Member opens Project Schedule, clicks **Import Drawing** on that task, selects
   PDF/image (or an existing project file), and freezes the revision.
3. In Signed Documents, the Member opens the new drawing and requests signatures.
   A company stamp is optional; if selected, the named project Manager must hold
   valid Drawing stamp authority. The system does not invent or grant seals.
4. Member signs Drawn by, project `lead_engineer_id` signs Checked by, project
   `manager_id` signs Approved by. All three must be distinct active users with
   `signing.sign`. Global role-based approval is not used for Drawing.
5. A return closes the round. Member imports a replacement revision and resubmits;
   prior signatures stay with the prior frozen file. Signed means all mandatory
   blocks completed. Download the immutable signature certificate separately
   from the original Drawing.

Import requires a current task assignment, an open project and matching project
scope. The same checks run again when submitting or revising. Task-based upload
grants no general project-edit permission: it is limited to folder 02 / Drawing.
Named pending signers receive notifications. Admin alone is not a business signer;
an explicitly granted additional Management role permits named signing, without
changing the user's primary Admin role or granting company stamp authority.

## Database / API / UI

- `021_drawing_task_workflow.sql`: nullable task foreign key + index on
  signable_documents, new active Drawing template v2; v1 remains untouched.
- `rollback_021_drawing_task_workflow.sql` refuses rollback after any linked
  Drawing or request history exists. Use forward migrations then.
- GET `/api/v1/projects/:projectId/drawing-tasks`: current user's assigned leaves.
- Project document multipart upload accepts taskId for scoped Member imports.
- Signing create accepts taskId; Drawing owner is always the current Member.
- Signing request accepts optional companyStampId; validates Manager authority.
- Project Schedule row action and Signed Documents import/revision dialogs.
- Certificates now embed the specimen images referenced by completed marks and
  the applied stamp artwork. Raw specimen image endpoints remain owner-only.

## Verification

- Root lint/typecheck/tests: 80/80, including fresh SQL material/schedule flow.
- Node typecheck/unit tests: 25/25.
- `node --import tsx tests/drawing-integration.ts` from backend-node: fresh SQL
  database with restricted application role; synthetic Member/Leader/Manager only.
  Tests task listing, unauthorized import, author binding, ordered decisions,
  return, R01, all three signatures, TEST ONLY stamp, output images and chain.
  Database is dropped after the test; temporary test storage is retained locally.
- Generated `output/pdf/test-only-drawing.pdf` was rendered and visually checked.
- Managed frontend build succeeded. Browser live dashboard connected; Admin's
  Signed Documents screen has no create/sign action, as required by policy.
- No real employee signature or company stamp was created/applied.

## Deployment

Live UAT schema 21; Node release `20260905-125356`, API port 5105.
Frontend rebuilt at `http://192.168.1.160:3000/`.
Verified COPY_ONLY/CHECKSUM backup before migration:
`C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_UAT_before021_20260905_1255.bak`.

## Boundaries / pending human account setup

- Certificate is print-ready HTML with visible marks, NOT an overlay on the original
  Drawing PDF. PDF placement/renderer decision RDL-039 is still pending. No PKI or
  certificate-authority signature is claimed. Team Test signatures are test evidence.
- The example certificate comes from a disposed CI database, so its verification
  code is not a live UAT verification link.
- Current UAT setup (2026-09-05 20:29 Asia/Bangkok): Nattapol user 8 is Manager,
  Taweesak user 19 is Leader, Phatthadon user 10 is Member for PJ-2608-0001.
  Employee Master remains authoritative; primary roles are Admin/Engineer/Engineer.
  Migration 023 adds a read-only-to-app business-role table and effective signing
  permission view. Explicit additional roles contribute only signing.read/signing.sign.
  Script 096 grants Nattapol Management and assigns project approvers with audit;
  script 097 adds the explicitly selected Phatthadon as project Member with audit.
  No other Admin was granted signing. No stamp authority was granted.
- UAT Task 3 and DWG-2609-0001 R00 were created through the API, using the labelled
  TEST ONLY PDF and Phatthadon as the requested preparer. State is DRAFT, no request
  and no signatures performed. Phatthadon and Taweesak must create their own
  specimens before submission; Nattapol already has one (left untouched).
- Existing supplier index-width and frontend bundle-size warnings remain.

## Management permission release verification

- Schema 23, managed Node release `20260905-132745`, API PID 23136, readiness 200.
- Verified backup before changes:
  `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\IoTTeamCenter_UAT_before023_20260905_1325.bak`.
- Fresh SQL integration passed: primary Admin retained, explicit Management grant,
  no application self-grant, named-step ownership, ordering, immediate revoke,
  final signature and full Drawing revision/stamp/chain tests with synthetic users.
- Live trial exposed existing SQL OUTPUT-with-trigger incompatibility in Schedule
  writes. Create/edit/progress/member-detail use OUTPUT INTO without disabling the
  consistency trigger. Fresh integration exercises API task create/edit/progress.
- Node 25/25, typecheck/build, changed-file lint passed. Root 80/80 with lint/typecheck
  passed before concurrent Site Visit changes. The latest root rerun was blocked by
  in-progress SiteVisitScreens.tsx lint/type errors and lib/inquiry-visit-flow.ts type
  error outside this claim; direct root tests also fail the concurrent Sales Intake
  navigation/screen guardrails. Those files were not overwritten. No frontend changes
  or rebuild required for this release.
- `tests/integration/drawing-live-readiness.ps1` is read-only. It verifies effective
  permissions, Employee Master Admin + Management label, own specimen availability,
  inbox and health for all three users without exposing credentials.
- `tests/integration/prepare-drawing-trial.ps1` is a scoped, rerunnable UAT preparation
  script. It creates the task/import/draft only; never submits or signs for real users.
