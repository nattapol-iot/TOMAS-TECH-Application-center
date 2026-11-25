# signing

[Module](../modules/signing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `8825cd4a`; generated, do not edit. [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/signing/inbox` | 547–647 |
| GET | `/api/v1/signing/documents` | 652–667 |
| POST | `/api/v1/signing/documents` | 669–718 |
| GET | `/api/v1/signing/documents/:documentId` | 720–780 |
| POST | `/api/v1/signing/documents/:documentId/revisions` | 788–838 |
| POST | `/api/v1/signing/documents/:documentId/request` | 840–982 |
| GET | `/api/v1/signing/documents/:documentId/preview` | 987–1047 |
| POST | `/api/v1/signing/steps/:stepId/sign` | 1049–1205 |
| POST | `/api/v1/signing/steps/:stepId/return` | 1213–1213 |
| POST | `/api/v1/signing/steps/:stepId/reject` | 1215–1215 |
| POST | `/api/v1/signing/steps/:stepId/delegate` | 1279–1339 |
| POST | `/api/v1/signing/steps/:stepId/paper` | 1348–1426 |
| GET | `/api/v1/signing/requests/:requestId/output` | 1431–1463 |
| GET | `/api/v1/signing/verify/:code` | 1465–1535 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `number` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 89–91 |
| `text` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 93–95 |
| `loadProjectDocument` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 103–140 |
| `freezeRevision` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 142–167 |
| `liveRequestId` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 169–180 |
| `loadActiveTemplate` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 182–220 |
| `appliesToAmount` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 223–229 |
| `activateSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 231–253 |
| `mandatoryStepsRemaining` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 255–265 |
| `loadStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 267–304 |
| `demandStepIsMine` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 306–313 |
| `insertMark` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 315–346 |
| `closeStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 348–367 |
| `setRequestState` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 369–374 |
| `closeRequest` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 376–385 |
| `frozenSource` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 387–394 |
| `placedArtwork` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 396–418 |
| `produceOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 420–539 |
| `registerSigningRoutes` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 541–1536 |
| `listDocuments` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1542–1641 |
| `listRequests` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1643–1677 |
| `listSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1679–1751 |
| `listEvents` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1753–1780 |
| `loadOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1782–1803 |

## Direct local dependencies

- [backend-node/src/signing-pdf.ts](<../../../backend-node/src/signing-pdf.ts>)
- [backend-node/src/config.ts](<../../../backend-node/src/config.ts>)
- [backend-node/src/db.ts](<../../../backend-node/src/db.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/errors.ts](<../../../backend-node/src/errors.ts>)
- [backend-node/src/http.ts](<../../../backend-node/src/http.ts>)
- [backend-node/src/audit.ts](<../../../backend-node/src/audit.ts>)
- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/drawing-workflow.ts](<../../../backend-node/src/drawing-workflow.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [backend-node/src/signing-certificate.ts](<../../../backend-node/src/signing-certificate.ts>)
- [backend-node/src/signing-core.ts](<../../../backend-node/src/signing-core.ts>)
- [backend-node/src/types.ts](<../../../backend-node/src/types.ts>)
- [backend-node/src/users.ts](<../../../backend-node/src/users.ts>)
- [backend-node/src/business-date.ts](<../../../backend-node/src/business-date.ts>)
- [backend-node/src/user-roles.ts](<../../../backend-node/src/user-roles.ts>)

## SQL references (literal scan, not a complete schema or write-set)

`dbo.company_stamps`, `dbo.document_files`, `dbo.estimates`, `dbo.notifications`, `dbo.permissions`, `dbo.project_docs`, `dbo.project_members`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.sign_events`, `dbo.sign_flow_steps`, `dbo.sign_flow_templates`, `dbo.sign_requests`, `dbo.sign_steps`, `dbo.signable_documents`, `dbo.signature_marks`, `dbo.signature_specimens`, `dbo.signed_documents`, `dbo.stamp_authorities`, `dbo.user_effective_roles`, `dbo.users`, `dbo.withdraw_project_document`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
