# Estimate Cost — ERP Cost Summary and Excel export

Status: Draft · 11 September 2026 · Reference workbook analyzed; ERP import rules pending confirmation

## Outcome

Estimate users must be able to review the complete cost in the company's seven ERP categories and export an Excel workbook that Sales can import into ERP without manually regrouping rows.

The seven display categories are:

1. Hardware
2. Software
3. Service
4. Installation
5. License
6. Maintenance
7. Training

`Maintenance` is the normalized display spelling. If the ERP import contract literally requires another label or a category code, the export must use the ERP contract while the UI retains a readable label.

## Current evidence

- The Estimate workspace currently shows Material, Engineering, Outsource, Transportation, Accommodation, Other, Contingency and Total summary tiles in `app/system/production/EstimateScreens.tsx`.
- Cost entry currently uses ten internal discipline codes in `app/system/production/CostItemFields.tsx`: 01 Hardware, 02 Software, 03 Electrical, 04 Mechanical, 05 Robot, 06 Engineering, 07 Outsource, 08 Transportation, 09 Accommodation and 10 Other Cost.
- Man-hour lines distinguish Engineering and Installation through `costType`; expenses and other costs use different controlled types.
- The current browser export in `app/system/production/EstimateScreens.tsx` writes a flat workspace dump through `lib/export-xlsx.ts`. It is not an ERP import contract.
- The user supplied the local reference workbook `Example Estimate cost file/20260818-001_Estimate cost for Okaya x SSSC.xlsx` and identified `Summary cost` as the target sheet. The source file is intentionally ignored by Git because it contains business data.
- The inspected `Summary cost` print area is `C1:O55`. Metadata occupies rows 1–6, row 8 contains the detail headers, rows 9–50 contain cost/terms sections, and rows 51–54 contain Sub Total, Profit, Overhead and Grand Total.
- The reference currently contains four cost blocks: Hardware rows 9–18, Software rows 19–24, Service rows 25–30 and Installation rows 31–38. License, Maintenance and Training are not present and must be added to the generated layout.
- Hidden columns Q:R contain a Sale Price Guide with profit percentages and calculated selling prices. They sit outside the print area and include a broken `#REF!` grand-total formula in the supplied workbook; the ERP cost export must not copy this broken dependency.
- The reference workbook relies on formulas linking many other sheets. The system-generated ERP workbook must be standalone and write canonical Estimate values into `Summary cost` without external or removed-sheet references.
- No ERP category code table or export-specific regression test was found in the repository on 11 September 2026.

## Classification model

The ten internal disciplines remain the source for engineering entry, responsibility, permissions and existing totals. ERP category is a separate controlled classification applied to every cost-bearing source line.

Do not infer ERP category from free-text description, module name, brand or item code. A default rule may propose a category, but an authorized user must be able to review and correct it. Every line resolves to exactly one of the seven ERP categories or `Unmapped`.

Provisional defaults pending Finance/ERP confirmation:

| Estimate source | Proposed ERP default | Decision status |
| --- | --- | --- |
| Cost item 01 Hardware | Hardware | Safe default |
| Cost item 03 Electrical | Hardware | Confirm with Finance |
| Cost item 04 Mechanical | Hardware | Confirm with Finance |
| Cost item 05 Robot | Hardware | Confirm with Finance |
| Cost item 02 Software | Software | License items require explicit override |
| Man-hour with cost type Engineering | Service | Confirm with Finance |
| Man-hour with cost type Installation | Installation | Safe default |
| Cost item 07 Outsource | Service | Installation suppliers may require override |
| Transportation, accommodation, other expenses | Unmapped | Allocation rule required |
| License | Explicit classification | No reliable current field |
| Maintenance | Explicit classification | No reliable current field |
| Training | Explicit classification | No reliable current field |
| Overhead | Approved footer outside the seven category blocks | No mapping required |
| Contingency | Unmapped when non-zero | ERP allocation rule required |

Changing an ERP classification must not change the internal category, source ledger, line amount, Estimate total, revision or accounting calculation.

## ERP Cost Summary UX

Summary remains the first Estimate tab. Add an ERP Cost Summary section after the task-oriented next step and before detailed internal breakdowns.

The section shows seven category rows in the fixed ERP order, each with amount and percentage of the ERP-classified total. It also shows:

- Unmapped line count and amount;
- overhead and contingency allocation state;
- ERP classified total;
- canonical Estimate total;
- reconciliation difference;
- one primary action: Review mapping or Export ERP Excel.

Selecting a category opens its contributing lines. Selecting Unmapped opens only unresolved lines with a controlled category selector. Empty categories remain visible with zero so users can verify all seven categories before export.

Export is enabled only when the user has export permission, every cost-bearing amount has an ERP category, the mapping belongs to the current Estimate revision and the ERP classified total equals the canonical total to currency precision.

## Workbook contract

The workbook must be generated from the same canonical ERP summary used by the screen. It must contain:

- a human-readable summary of all seven categories;
- the exact ERP import sheet, sheet name, headers, column order and codes required by the supplied ERP template;
- Estimate number, revision, project/customer reference, export timestamp and source line identifier where the ERP format permits them;
- numeric cells for quantity, unit price and amount;
- deterministic row order and file name;
- zero-value category rows only when required by the ERP template.

The first implementation preserves the visible `Summary cost` structure from the supplied workbook:

| Area | Reference layout |
| --- | --- |
| Title and metadata | Rows 1–6, columns C:O |
| Column headers | Row 8: Item, Model/Part Number, Description/Detail, Supplier, Brand, Lead Time, Quote Rev., Unit price, Quantity, Total, Unit, Remark |
| Cost detail | Starts at row 9 and groups lines under the seven fixed ERP category labels |
| Totals | Sub Total, Approved Overhead and Grand Total after the final category; Profit is excluded |
| Sheet name | `Summary cost` |

Category blocks must expand according to the actual number of lines instead of silently dropping lines to fit the reference workbook's fixed row counts. The generated file preserves recognizable styles and column order, but uses clean formulas or typed values that refer only to cells within the exported workbook.

Hidden Sale Price Guide columns Q:R and Profit are excluded from the ERP cost export by user decision on 11 September 2026. Overhead uses the approved Estimate overhead value or remains unavailable when the policy is missing.

Before download, validate required fields, allowed ERP category codes, numeric precision, duplicate source lines and total reconciliation. The UI must explain each failed validation and link to the lines that need correction.

The current one-sheet `lib/export-xlsx.ts` writer may be reused only if it can reproduce the ERP template exactly. If the ERP contract requires multiple sheets, preserved template formatting, formulas or locked cells, use a template-capable exporter behind a focused module rather than embedding workbook rules in the screen component.

## Audit and revision behavior

ERP classifications are revision-scoped. Creating a revision copies the previous mapping with provenance. Editing a current revision records who changed the category and when. Approved or Locked revisions remain immutable.

An export records the Estimate ID, revision, Estimate row version, template version, mapping digest, exported by, exported at, server-verified file checksum and reconciliation totals. Re-exporting unchanged data produces the same business rows while creating a separate audit event.

## Acceptance criteria

- The Summary screen always lists the seven ERP categories in the agreed order.
- Each cost-bearing line contributes once to one ERP category or appears as Unmapped.
- ERP category totals, detail rows and Excel rows use one shared mapping implementation.
- Export and approval are blocked while any active source line is Unmapped, or when ERP and canonical totals differ by more than THB 0.01. Mapping remains editable during Engineering Review and is frozen by approval.
- Internal category, line amount and canonical Estimate calculation do not change when ERP mapping changes.
- Approved and Locked revisions cannot have their mapping edited.
- Exported sheet names, headers, codes, required values and column order match the approved ERP workbook fixture exactly.
- Automated tests cover all four source ledgers, all seven ERP categories, empty categories, revisions, permissions, rounding, unmapped lines and exact workbook structure.

## Remaining business inputs

- ERP category codes corresponding to the seven display labels.
- Allocation rules for Electrical, Mechanical, Robot, Engineering labor, Outsource, travel, accommodation, other costs, overhead and contingency.
- Whether Sales imports summary rows, detail rows or both.
- Whether ERP requires fixed row positions or accepts dynamically expanded category blocks in the same column format.
