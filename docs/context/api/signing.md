# signing

[Module](../modules/signing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `c2f7d169`; generated, do not edit. [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/signing/inbox` | 562–653 |
| GET | `/api/v1/signing/documents` | 658–673 |
| POST | `/api/v1/signing/documents` | 675–723 |
| GET | `/api/v1/signing/documents/:documentId` | 725–782 |
| POST | `/api/v1/signing/documents/:documentId/revisions` | 790–841 |
| POST | `/api/v1/signing/documents/:documentId/request` | 843–981 |
| GET | `/api/v1/signing/documents/:documentId/preview` | 986–1024 |
| POST | `/api/v1/signing/steps/:stepId/sign` | 1026–1175 |
| POST | `/api/v1/signing/steps/:stepId/return` | 1183–1184 |
| POST | `/api/v1/signing/steps/:stepId/reject` | 1186–1187 |
| POST | `/api/v1/signing/steps/:stepId/delegate` | 1252–1311 |
| POST | `/api/v1/signing/steps/:stepId/paper` | 1320–1395 |
| GET | `/api/v1/signing/requests/:requestId/output` | 1400–1424 |
| GET | `/api/v1/signing/verify/:code` | 1426–1486 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `number` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 95–97 |
| `text` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 99–101 |
| `loadProjectDocument` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 109–151 |
| `freezeRevision` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 153–182 |
| `liveRequestId` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 184–193 |
| `loadActiveTemplate` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 195–234 |
| `appliesToAmount` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 237–243 |
| `activateSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 245–265 |
| `mandatoryStepsRemaining` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 267–275 |
| `loadStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 277–312 |
| `demandStepIsMine` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 314–321 |
| `insertMark` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 323–354 |
| `closeStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 356–382 |
| `setRequestState` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 384–389 |
| `closeRequest` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 391–405 |
| `frozenSource` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 407–413 |
| `placedArtwork` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 415–428 |
| `produceOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 430–549 |
| `registerSigningRoutes` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 551–1487 |
| `listDocuments` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1493–1588 |
| `listRequests` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1590–1619 |
| `listSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1621–1683 |
| `listEvents` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1685–1707 |
| `loadOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1709–1725 |

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

## SQL references (literal scan, not a complete schema or write-set)

`dbo.company_stamps`, `dbo.document_files`, `dbo.estimates`, `dbo.notifications`, `dbo.permissions`, `dbo.project_docs`, `dbo.project_members`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.sign_events`, `dbo.sign_flow_steps`, `dbo.sign_flow_templates`, `dbo.sign_requests`, `dbo.sign_steps`, `dbo.signable_documents`, `dbo.signature_marks`, `dbo.signature_specimens`, `dbo.signed_documents`, `dbo.stamp_authorities`, `dbo.users`, `dbo.withdraw_project_document`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
