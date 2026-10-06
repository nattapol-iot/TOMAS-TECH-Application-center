# signing

[Module](../modules/signing.md) · [Index](../../../AGENTS.md)

Evidence: source snapshot `68f83bd3`; generated, do not edit. [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>). Ranges are hints: search symbol after edits.

## API operations

| Method | Path | Source lines |
|---|---|---|
| GET | `/api/v1/signing/inbox` | 559–650 |
| GET | `/api/v1/signing/documents` | 655–670 |
| POST | `/api/v1/signing/documents` | 672–720 |
| GET | `/api/v1/signing/documents/:documentId` | 722–779 |
| POST | `/api/v1/signing/documents/:documentId/revisions` | 787–838 |
| POST | `/api/v1/signing/documents/:documentId/request` | 840–978 |
| GET | `/api/v1/signing/documents/:documentId/preview` | 983–1021 |
| POST | `/api/v1/signing/steps/:stepId/sign` | 1023–1172 |
| POST | `/api/v1/signing/steps/:stepId/return` | 1180–1181 |
| POST | `/api/v1/signing/steps/:stepId/reject` | 1183–1184 |
| POST | `/api/v1/signing/steps/:stepId/delegate` | 1249–1308 |
| POST | `/api/v1/signing/steps/:stepId/paper` | 1317–1392 |
| GET | `/api/v1/signing/requests/:requestId/output` | 1397–1421 |
| GET | `/api/v1/signing/verify/:code` | 1423–1483 |

## Named functions

| Symbol | Source | Lines |
|---|---|---|
| `number` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 95–97 |
| `text` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 99–101 |
| `loadProjectDocument` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 109–148 |
| `freezeRevision` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 150–179 |
| `liveRequestId` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 181–190 |
| `loadActiveTemplate` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 192–231 |
| `appliesToAmount` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 234–240 |
| `activateSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 242–262 |
| `mandatoryStepsRemaining` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 264–272 |
| `loadStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 274–309 |
| `demandStepIsMine` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 311–318 |
| `insertMark` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 320–351 |
| `closeStep` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 353–379 |
| `setRequestState` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 381–386 |
| `closeRequest` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 388–402 |
| `frozenSource` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 404–410 |
| `placedArtwork` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 412–425 |
| `produceOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 427–546 |
| `registerSigningRoutes` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 548–1484 |
| `listDocuments` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1490–1585 |
| `listRequests` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1587–1616 |
| `listSteps` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1618–1680 |
| `listEvents` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1682–1704 |
| `loadOutput` | [backend-node/src/routes/signing.ts](<../../../backend-node/src/routes/signing.ts>) | 1706–1722 |

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

`dbo.company_stamps`, `dbo.document_files`, `dbo.estimates`, `dbo.notifications`, `dbo.permissions`, `dbo.project_docs`, `dbo.project_members`, `dbo.projects`, `dbo.role_permissions`, `dbo.roles`, `dbo.sign_events`, `dbo.sign_flow_steps`, `dbo.sign_flow_templates`, `dbo.sign_requests`, `dbo.sign_steps`, `dbo.signable_documents`, `dbo.signature_marks`, `dbo.signature_specimens`, `dbo.signed_documents`, `dbo.stamp_authorities`, `dbo.users`

## Change boundary

Read the selected handler and helpers it calls, then its caller in api-client.ts. Verify permission checks, record scope, transaction, rowVersion and audit on that path; a route name alone does not prove authorization. Dynamic routes/SQL, helper side effects and runtime config require source inspection.
