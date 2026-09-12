# signing

[Module](../modules/signing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `1e58594b`; generated, do not edit. [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/signing/inbox` | 558–649 |
| GET | `/api/v1/signing/documents` | 654–669 |
| POST | `/api/v1/signing/documents` | 671–719 |
| GET | `/api/v1/signing/documents/:documentId` | 721–778 |
| POST | `/api/v1/signing/documents/:documentId/revisions` | 786–837 |
| POST | `/api/v1/signing/documents/:documentId/request` | 839–977 |
| GET | `/api/v1/signing/documents/:documentId/preview` | 982–1020 |
| POST | `/api/v1/signing/steps/:stepId/sign` | 1022–1171 |
| POST | `/api/v1/signing/steps/:stepId/return` | 1179–1180 |
| POST | `/api/v1/signing/steps/:stepId/reject` | 1182–1183 |
| POST | `/api/v1/signing/steps/:stepId/delegate` | 1248–1307 |
| POST | `/api/v1/signing/steps/:stepId/paper` | 1316–1391 |
| GET | `/api/v1/signing/requests/:requestId/output` | 1396–1420 |
| GET | `/api/v1/signing/verify/:code` | 1422–1482 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `number` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 94–96 |
| `text` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 98–100 |
| `loadProjectDocument` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 108–147 |
| `freezeRevision` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 149–178 |
| `liveRequestId` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 180–189 |
| `loadActiveTemplate` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 191–230 |
| `appliesToAmount` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 233–239 |
| `activateSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 241–261 |
| `mandatoryStepsRemaining` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 263–271 |
| `loadStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 273–308 |
| `demandStepIsMine` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 310–317 |
| `insertMark` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 319–350 |
| `closeStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 352–378 |
| `setRequestState` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 380–385 |
| `closeRequest` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 387–401 |
| `frozenSource` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 403–409 |
| `placedArtwork` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 411–424 |
| `produceOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 426–545 |
| `registerSigningRoutes` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 547–1483 |
| `listDocuments` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1489–1584 |
| `listRequests` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1586–1615 |
| `listSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1617–1679 |
| `listEvents` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1681–1703 |
| `loadOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1705–1721 |

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

## SQL references (literal scan, not a complete schema or write-set)

`dbo.company_stamps`, `dbo.document_files`, `dbo.estimates`, `dbo.notifications`, `dbo.permissions`, `dbo.project_docs`, `dbo.project_members`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.sign_events`, `dbo.sign_flow_steps`, `dbo.sign_flow_templates`, `dbo.sign_requests`, `dbo.sign_steps`, `dbo.signable_documents`, `dbo.signature_marks`, `dbo.signature_specimens`, `dbo.signed_documents`, `dbo.stamp_authorities`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
