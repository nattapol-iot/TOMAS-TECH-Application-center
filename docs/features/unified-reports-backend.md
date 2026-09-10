# Unified Reports backend

Migration 025 depends on 024 and is additive. Existing Site Visit reports and general document-signing routes remain separate. No live migration or service restart was performed during implementation.

The five report types are INSTALLATION, UAT, SERVICE, INSPECTION and POC. POC requires INQUIRY; INSTALLATION/UAT/SERVICE require PROJECT; INSPECTION accepts either. A scheduleTaskId, when supplied, must belong to the Project. Report identity/source cannot change after creation.

## HTTP contract

Base: `/api/v1/reports/workspace`.

- `GET /templates`: `{version,teamConsent,customerConsent,templates:[{reportType,sourceKinds,commonSections,sections,body:{},supportsDynamicRows:true}]}`. Empty bodies intentionally contain no invented results.
- `GET /sources?search&page&pageSize`: scoped `{items:[{id,sourceKind,reference,title}],page,pageSize,total}`.
- `GET /people?sourceKind=PROJECT&sourceId=1`: scoped `{items:[{id,name,canReview,canApprove}]}`. The preparer must select distinct named people; reviewer is optional.
- `GET /?search&reportType&status&page&pageSize`: `{items:ReportDetail[],page,pageSize,total}`; page size defaults to 50 and is capped at 100.
- `POST /`: `{reportType,sourceKind,sourceId,scheduleTaskId?,title,reportDate,locale,body,reviewerId:null|number,approverId}`. Creates revision 0. Locale: en, th or ja. Body must be a JSON object under 200 KB, preserving dynamic rows.
- `GET /:id?revision=0`: current or selected revision. Historical evidence remains readable after new revisions.
- `PUT /:id`: `{rowVersion,title,reportDate,locale,body,reviewerId,approverId}`. Current preparer's DRAFT only.
- `POST /:id/:action`: `submit`, `review`, `approve`, `return`, `revise`, `void`, `customer-link`, `revoke-customer-link`. All require the current revision rowVersion. Return, revise and void require a note. Submit/approve require `consent:true`; review signs by default but `sign:false` records review without applying a specimen.

The lifecycle is DRAFT → SUBMITTED → REVIEWED (when assigned) → APPROVED → AWAITING_CUSTOMER → COMPLETED. Return creates CHANGES_REQUESTED; the preparer uses revise to create another DRAFT rather than editing already signed content. A completed revision cannot be voided or changed. Revoking an unused customer link returns to APPROVED. A new revision requires revoking an active customer link first.

Submission (not draft save) validates common `overview.objective`, `overview.summary`, `context.start`, `context.end`, plus type-specific work evidence. Installation needs a hardware item/action, software module/action, or complete commissioning checkpoint. UAT scenarios require scenario/step/expected/actual/result; Inspection requires checkpoint/expected/observed/result; their results must be PASS, FAIL or PARTIAL. Service requires symptom/action/verification/testResult. POC trials require hypothesis/successCriteria/trial/result. Fully blank repeated rows are ignored, while partly completed rows report their missing fields. Optional evidence rows require description plus reference/URL; issues need issue/owner/status, deliverables need item/status, and UAT punchlist rows need scenario/step/issue/owner/status. Failures return HTTP 422 `report_incomplete` with `{issues:[{path,message}]}` before any signature or status mutation.

ReportDetail includes id, number, reportType, sourceKind/sourceId, scheduleTaskId, frozen sourceReference/sourceTitle/customer once signed, revision/currentRevision, title, reportDate, locale, body, status, preparedById/reviewerId/approverId, named preparedBy/reviewer/approver objects, allowedActions, customerLink `{expiresAt}` or null, rowVersion, snapshotSha256, decisionNote, timestamps, signatures, customerAcknowledgment and revision history. No customer token or token hash is returned by list/detail.

## Signing and customer evidence

Internal signing uses the actor's existing active signature_specimen and the existing signing freshness/assurance logic. It requires effective `signing.sign` as well as the report-stage permission. An Admin without a business signing grant cannot sign; an Admin with an explicit Management signing grant can. Additional roles do not confer broad source access. Prepare/review/approve records retain immutable snapshot JSON/hash, specimen version reference, actor identity, consent and assurance evidence/hash. No employee specimen image keys are exposed.

`customer-link` returns `{report,token,expiresAt,acknowledgmentPath}` once; lifetime defaults to 72 hours, capped at 168. Caller constructs the frontend URL and shares it manually. Tokens are 256-bit random, stored only as SHA-256, and public route logging is suppressed.

Public `GET /api/v1/report-acknowledgments/:token` returns only the frozen customer-visible report content, revision/hash, consent text, modes and honest assurance label `CUSTOMER_SELF_ASSERTED_LINK`. It does not authenticate an external person's identity through Entra.

Public POST accepts `{snapshotSha256,name,title,company,date,consent:true,mode:'ACKNOWLEDGMENT'|'DRAWN_SIGNATURE',signatureDataUrl?}`. A drawn signature must decode as PNG, at most 256 KB and 2048 × 2048 pixels. The server stores original PNG bytes and hash, exact report hash, identity/consent/date, timestamp, IP/user-agent and evidence hash. One atomic transaction consumes the token and completes the revision. Concurrent/replayed/expired/revoked requests cannot create a second acknowledgment. Authenticated, source-authorized detail includes customer signatureDataUrl for rendering; ACK mode has null.

Internal specimen images are referenced, not rendered into a generated signed PDF by this backend. The frontend print view can show internal signers and customer mark with evidence references; PDF cryptographic signing is not claimed.

## Verification

Build with `npm run build` in backend-node. The focused unit tests are `backend-node/tests/unified-reports.test.ts`. Run `node backend-node/dist/tests/unified-report-integration.js` from the repository root after building. It creates a uniquely named `IoTTeamCenter_ReportCI_<uuid>` SQL database, uses synthetic identities and a restricted application role, and removes only that generated database in finally. It never operates on Team Test or production databases.

Integration covers source/type validation, signer separation, explicit consent, stale updates, review ordering, frozen hashes, optional reviewer, revoke/reissue/expiry, simultaneous customer submission, drawn signature roundtrip, DB-level immutability, revision history, removed project membership, pagination and additional Management signing authority.
