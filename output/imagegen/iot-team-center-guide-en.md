# IoT Team Center — Application Overview and Working Flow

IoT Team Center is TOMAS TECH's internal workspace for engineering estimates, project coordination, material procurement, documentation and team development. It connects information across the work lifecycle so employees can maintain their assigned records and managers can review progress and decisions.

The cost scope is internal engineering cost. Access to records and actions depends on configured permissions. This guide describes the workflows represented in the current application code; it is not a deployment-readiness assessment.

## 1. Capture customer requirements

**Typical participants:** Sales, coordinators and engineers.

Create an Inquiry with customer contacts, requirements, scope information and supporting files. When a site visit is needed, assign an engineer, gather findings and prepare a visit report. Use the resulting information to clarify the inquiry and estimation scope. A site visit is not mandatory for every inquiry.

**Handoff:** The engineering team receives a documented requirement and the references needed to estimate the work.

## 2. Prepare and validate the engineering estimate

**Typical participants:** Estimate owner and contributing engineers.

Build the estimate from material cost items, engineering effort and other project expenses. Use the Price Library and supplier quotations as cost references. Assign sections to responsible people, maintain supporting information and check validation results.

Resolve critical validation errors before submission. Review warnings and missing information as part of completing the estimate.

**Handoff:** The estimate owner submits the current revision for engineering review.

## 3. Review, approve or request revision

**Typical participants:** Authorized engineering reviewers.

Review technical scope, completeness and cost accuracy. The decision has two paths:

- **Revision required:** Return the estimate for correction. The team updates it and resubmits it for review.
- **Approved:** The approved revision is locked to preserve its cost information. Subsequent changes follow the revision workflow.

**Handoff:** An approved estimate can be used to create the project. Approval does not mean project creation happens automatically.

## 4. Create the project and plan work

**Typical participants:** Project lead and managers.

Create a project linked to the approved estimate. Organize project information and documents, establish the schedule, and assign responsible team members. Use Project Timeline and Resource Plan to review planned dates and team workload.

**Handoff:** Employees receive assigned work, responsibilities and target dates. Material requirements also feed the procurement workflow.

## 5. Execute tasks and maintain progress

**Typical participants:** Assigned employees and project leads.

Use My Work to find assigned tasks and update progress. Maintain relevant findings, attachments and project evidence. Project leads and managers review the latest updates and adjust assignments or plans when needed.

Execution and procurement can proceed alongside each other. Purchasing is driven by material requirements; it is not a stage that begins only after reporting.

## 6. Supply project materials

**Typical participants:** Engineering, purchasing, inventory staff and authorized approvers.

1. Generate and release the Bill of Materials (BOM) from the approved estimate.
2. Check available inventory and material shortages.
3. If sufficient stock is available, use existing inventory through the applicable material issue workflow.
4. For shortages, create a Purchase Requisition (PR) and obtain the required approval.
5. Create a Purchase Order (PO) for the supplier from the approved requisition.
6. Record Goods Receiving as deliveries arrive.
7. Maintain inventory records and process material issues: request, approval, issue and recipient receipt.

Requests that are not approved need the appropriate correction or follow-up before purchasing proceeds.

**Handoff:** The project team receives materials, with purchasing and stock movements recorded in the system.

## 7. Prepare reports and route documents for signing

**Typical participants:** Project team, document owners and authorized signers.

Prepare structured reports and maintain project documentation. Use the signing workflow for documents that require signatures, and refer to the signed document records when reviewing completed documentation.

Reporting can occur during execution. The diagram groups these activities to explain their relationship; it does not imply that every project document must be signed or that every task must finish before any report is created.

## 8. Monitor and follow up

**Typical participants:** Executives, managers and project leads.

Use dashboards and reports to review project status, engineering costs, workload and outstanding actions. Follow up on delays and pending decisions. Feed those decisions back into project planning and task assignments.

## Shared tools across the workflow

| Tool | Purpose |
| --- | --- |
| Price Library and Supplier Quotations | Maintain references used when preparing engineering costs. |
| Project Documents and Signing | Keep working files, reports and signing records connected to work. |
| Knowledge Hub | Make reusable team knowledge available. |
| KPI & Growth | Support performance review and employee development. |
| Support Center | Record problems and follow up on their resolution. |
| Master Data | Maintain shared reference information. |
| User Permissions and Audit Log | Control available actions and provide change history. |

## How to read the workflow infographic

- **Band A:** Define requirements, prepare costs and complete engineering review.
- **Matching green B1 markers:** Continue from the approved estimate to Create Project in Band B.
- **Band B:** Plan, execute, report and monitor project work.
- **Band C:** Supply materials alongside project execution.
- **Orange return path:** Request revision, correct the estimate and resubmit.
- **Stock-available bypass:** Use existing inventory when purchasing is unnecessary.
- **Planning feedback path:** Managers adjust plans and priorities based on progress.

## Proposed ERP interfaces

The ERP interface infographic describes proposed scope for future implementation. The current repository does not contain an operating ERP connector. The design therefore separates the intended business ownership from the application's existing workflows and leaves the field mapping, transfer mechanism and timing open for confirmation.

### Interface 1 — Customer Data

The company ERP is the proposed system of record for customer master data. New or approved customer-master changes move from ERP through the integration control into IoT Team Center. The interface validates required fields, detects duplicates and maps the ERP customer code to the corresponding IoT customer ID.

The proposed payload includes customer code, company names, address and tax data, contacts and active status. Records that fail validation return to the ERP data owner for correction. Accepted records become selectable in inquiries, site visits, estimates and projects.

### Interface 2 — Estimate Cost

IoT Team Center remains the owner of detailed engineering-estimate information. Only an approved and locked estimate revision is proposed for transfer to ERP. Draft and editable revisions remain inside the engineering workflow.

The proposed payload includes estimate number, revision, project and customer reference, cost categories and approved internal engineering-cost total. The integration control validates the approval state and maps cost categories to the ERP structure. ERP returns its document reference, accepted or rejected status and any processing error so users can reconcile both systems.

This interface covers internal engineering cost. It does not include selling price or margin.

### Interface 3 — PR–PO

IoT Team Center provides the engineering demand and BOM context. When a shortage results in an approved Purchase Requisition, the request moves through validation to ERP. The proposed integration checks supplier, item, quantity and project codes before ERP creates the official PR and continues the corporate approval and Purchase Order process.

ERP returns the PR and PO numbers, approval status, supplier, expected date and receipt status. IoT Team Center uses those results to update procurement tracking for the project team. Validation failures return to the purchase request owner for correction and resubmission.

### Integration controls to confirm

- Authorization for users and service identities
- Required fields, formats and code mappings
- Source IDs, ERP references and audit history
- Duplicate prevention, retry and reconciliation rules
- Visible exception ownership and correction paths
- Transfer timing and frequency
- Approval ownership and the system of record for each document

## Deliverables and generation method

The three PNG illustrations were generated with the built-in imagegen tool. Page 2 received a targeted connector correction after visual review. Page 3 is explicitly marked as a proposed integration concept.

- iot-team-center-overview-en.png
- iot-team-center-workflow-en.png
- iot-team-center-erp-interface-en.png
- iot-team-center-overview-en-prompt.txt
- iot-team-center-workflow-en-prompt.txt
- iot-team-center-workflow-en-correction-prompt.txt
- iot-team-center-erp-interface-en-prompt.txt

Application source basis: app/system/ProductionApp.tsx, app/system/production/EstimateScreens.tsx, app/system/production/MaterialScreens.tsx, app/system/product.ts, app/system/Brand.tsx and SITE_VISIT.md. ERP interface scope is based on the requested three interfaces and is presented as a proposal because no implemented ERP connector was found in the repository.
