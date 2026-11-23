# Knowledge & Document Hub

## Architecture

Knowledge Hub is an API-backed production module. SQL Server stores document,
revision, workflow, relation, permission, comment, acknowledgement, article and
append-only audit metadata. File bytes use the existing `ProjectDocumentStorage`
adapter under a dedicated `knowledge/yyyy/MM/...` storage key; SQL never stores
public file URLs.

The production UI is `KnowledgeScreens.tsx`, mounted through the existing single-
workspace routing convention. The visible tabs cover the Standards Register,
Presentation Library, Technical Knowledge, Shared/Project documents,
acknowledgements and administration. Document detail is a permission-aware drawer
with overview, revisions, related records, comments, access and audit views.

## Database

- Migration 014 creates the Knowledge Hub tables, indexes, constraints, number
  allocator, append-only/no-delete/immutable triggers and RBAC capabilities.
- Migration 015 hardens the immutable-revision trigger so an approved payload
  cannot change while the controlled Approved -> Published -> Superseded workflow
  can advance. It also grants the narrow pending-approval replacement operation.
- `910_knowledge_hub_seed.sql` creates the category tree, number sequences, safe
  sample standards, presentations and articles. It reconciles allocator counters
  with seeded document numbers so the first live number cannot collide.

## Workflow and security

Controlled documents use Draft -> In Review -> Pending Approval -> Approved ->
Published, with Request Changes, Superseded and Archived states. Review and final
approval are ordered. A revision author cannot final-approve their own revision.
Publishing and superseding happen in one serializable transaction; a filtered
unique index enforces one published revision per document.

Working documents use Draft -> Shared -> Editing/Final -> Archived and always add a
new file version. Uploads validate extension and MIME, sanitize names, enforce the
configured size, compute SHA-256, detect exact duplicates and persist the malware
adapter status. Download and preview always pass server-side authorization. PDF,
image and text files can preview inline; Office files expose verified metadata and
authorized download until a conversion adapter is configured.

Capabilities:

- `knowledge.view`, `knowledge.upload`, `knowledge.comment`, `knowledge.edit`
- `knowledge.review`, `knowledge.approve`, `knowledge.publish`, `knowledge.archive`
- `knowledge.manage_permissions`, `knowledge.manage_categories`, `knowledge.view_audit`

Confidentiality is evaluated on the API for Company, Department, Project Team,
Management, Confidential and Restricted records. Explicit grants support User,
Role, Department and Project subjects. Every permission and workflow change is
written to the immutable audit ledger.

## Configuration

The module reuses existing application settings:

- `ConnectionStrings__IoTTeamCenter`
- `DocumentStorage__Mode` (`Local` for Team Test; production can point at the
  existing controlled storage root)
- `DocumentStorage__RootPath`
- `DocumentStorage__MaxFileSizeBytes` (default 50 MiB)
- the existing authentication, CORS and application-role settings

`IDocumentMalwareScanner` is an adapter. The built-in disabled implementation
records `Skipped`; it never reports an unscanned file as clean. Replace this
registration with the company scanner before production upload is enabled.

## Using the module

1. Open **Knowledge Hub** and choose **New Document**.
2. Select the controlled category, owner, confidentiality, language, review date
   and optional initial file. The number is allocated atomically.
3. Open the document, assign reviewer(s) and an approver, then submit it.
4. Reviewers act in sequence; the final approver must differ from the author.
5. A Document Controller publishes the approved revision.
6. Use **Upload revision** to change a published document. Publishing the new
   revision automatically supersedes the former revision.
7. Use Related records to link one file to Inquiry, Project, Estimate, BOM, PR, PO,
   receiving, material issue, item, supplier, customer or article records.
8. Assign read acknowledgement against the exact published revision and monitor
   progress in the register and **My Acknowledgements**.

## Verified Team Test workflow

`STD-EE-0004` was exercised against SQL Server with separate users:

- author: Revision Owner Test (Engineer)
- reviewer: Warit Chunlaka (Engineering Manager)
- final approver/controller: Nattapol Poeam (Admin)
- reader: ViewerTest

The run created and published R00, created and published R01, superseded R00,
linked Project #1, added a version-bound comment, assigned and completed read
acknowledgement, and archived/restored the document. The resulting audit timeline
contains 17 events.

## Current limitations

- No Office-to-PDF conversion service is configured, so DOCX/XLSX/PPTX preview is
  metadata plus authorized download.
- No malware engine is configured; upload state is explicitly `Skipped`.
- The repository has no Team entity, so Team grants map to Department or Project
  until a Team master is introduced.
- Review-date reminders are surfaced through due/expired dashboard queries; the
  repository has no durable notification scheduler yet.
- Full-text search is structured SQL metadata/extracted-text search. OCR and AI
  search remain intentionally out of scope.
- Real-time Office co-authoring, public links and external sharing are not enabled.
- The shared workspace currently uses categories, record relations and inherited
  document grants; a nested folder/collection model and drag-and-drop organizer are
  not present in the repository yet.
- Related records can be added from Document Detail. Dedicated **Link Document**
  entry buttons have not yet been added to every Inquiry/Project/Material screen.
- Articles support safe text/Markdown content and helpful feedback. Threaded
  comments are currently exposed for file-backed documents, not article detail.
- Presentation cards use the common secure preview/download/version flow. Favorite,
  template cloning and update-request queues need additional persistence tables.
- The current home summary exposes published, workflow, expiry, review,
  acknowledgement and article counts. Separate Management and Document Controller
  analytical dashboards are not yet split into dedicated screens.
