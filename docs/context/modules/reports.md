# Reports / Inspection / Report Templates

[Context index](../../../AGENTS.md) · [Architecture](../ARCHITECTURE.md) · [Change guide](../WORKFLOW.md)

แก้รายงาน workflow หลักฐาน ส่งออก PDF/PPTX และ customer acknowledgment

Evidence: snapshot `056c73a4`; source map, not a live availability claim. Test candidates use filename matching and are not exhaustive coverage.

## Read only the operation you change

- [unified-reports API and function map](../api/unified-reports.md) — registered in Node app
- [report-templates API and function map](../api/report-templates.md) — registered in Node app
- [reports API and function map](../api/reports.md) — registered in Node app

## UI function locator

Shared screens contain other modules: use the symbol and line range instead of reading the whole file.

| Symbol | Source | Lines |
|---|---|---|
| `errorText` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 34–34 |
| `today` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 35–35 |
| `ReportBodyEditor` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 36–39 |
| `ReportWorkflow` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 41–45 |
| `allows` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 50–50 |
| `json` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 51–51 |
| `CustomerAcknowledgmentView` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 53–59 |
| `ReportScreens` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 61–106 |
| `useReportSigners` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 108–118 |
| `ParticipantFields` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 120–123 |
| `NewReportModal` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 125–188 |
| `ReportCoverPage` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 193–215 |
| `ReportPrintInfoPage` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 220–235 |
| `ReportSignOffPage` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 240–276 |
| `ReportDocumentHeader` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 278–286 |
| `ReportSignatureSummary` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 288–292 |
| `ReportDetail` | [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>) | 294–400 |
| `object` | [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>) | 12–12 |
| `text` | [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>) | 13–13 |
| `FieldControl` | [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>) | 23–33 |
| `EvidenceImage` | [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>) | 35–50 |
| `EvidenceCard` | [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>) | 52–74 |
| `ReportDocumentForm` | [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>) | 76–130 |
| `messageOf` | [app/system/production/ReportTemplateLibrary.tsx](<../../../app/system/production/ReportTemplateLibrary.tsx>) | 16–16 |
| `ReportTemplateLibrary` | [app/system/production/ReportTemplateLibrary.tsx](<../../../app/system/production/ReportTemplateLibrary.tsx>) | 19–51 |
| `ReportTemplateEditor` | [app/system/production/ReportTemplateLibrary.tsx](<../../../app/system/production/ReportTemplateLibrary.tsx>) | 53–73 |
| `ReportTemplatePicker` | [app/system/production/ReportTemplateLibrary.tsx](<../../../app/system/production/ReportTemplateLibrary.tsx>) | 75–96 |
| `RankSelect` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 24–30 |
| `JudgeSelect` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 32–38 |
| `PhotoThumb` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 41–60 |
| `PhotoGallery` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 62–95 |
| `AttributesEditor` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 100–116 |
| `UnitsTab` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 118–148 |
| `MeasurementsTab` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 151–206 |
| `OperationTab` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 209–235 |
| `ChecklistTab` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 238–269 |
| `SummaryTab` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 272–294 |
| `InspectionReportBody` | [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>) | 297–345 |

## Domain helpers / direct dependencies

- [backend-node/src/document-number.ts](<../../../backend-node/src/document-number.ts>)
- [backend-node/src/signing-core.ts](<../../../backend-node/src/signing-core.ts>)
- [backend-node/src/report-template-service.ts](<../../../backend-node/src/report-template-service.ts>)
- [backend-node/src/document-storage.ts](<../../../backend-node/src/document-storage.ts>)
- [backend-node/src/unified-report-service.ts](<../../../backend-node/src/unified-report-service.ts>)
- [backend-node/src/project-scope.ts](<../../../backend-node/src/project-scope.ts>)
- [app/system/api-client.ts](<../../../app/system/api-client.ts>)
- [app/system/ui.tsx](<../../../app/system/ui.tsx>)
- [app/system/production/report-workspace.css](<../../../app/system/production/report-workspace.css>)
- [backend-node/src/report-template-rules.ts](<../../../backend-node/src/report-template-rules.ts>)
- [app/system/production/ReportTemplateLibrary.tsx](<../../../app/system/production/ReportTemplateLibrary.tsx>)
- [app/system/production/useReportUnsavedChanges.ts](<../../../app/system/production/useReportUnsavedChanges.ts>)
- [app/system/production/report-locale.ts](<../../../app/system/production/report-locale.ts>)
- [app/system/production/ReportDocumentForm.tsx](<../../../app/system/production/ReportDocumentForm.tsx>)
- [app/system/production/report-pptx.ts](<../../../app/system/production/report-pptx.ts>)
- [app/system/production/inspection-report-pptx.ts](<../../../app/system/production/inspection-report-pptx.ts>)
- [app/system/production/inspection-report-pdf.ts](<../../../app/system/production/inspection-report-pdf.ts>)
- [app/system/production/InspectionReportBody.tsx](<../../../app/system/production/InspectionReportBody.tsx>)
- [app/system/production/inspection-body-types.ts](<../../../app/system/production/inspection-body-types.ts>)
- [app/system/production/report-pptx-template.ts](<../../../app/system/production/report-pptx-template.ts>)
- [app/system/LocalizedText.tsx](<../../../app/system/LocalizedText.tsx>)
- [app/system/i18n.ts](<../../../app/system/i18n.ts>)
- [app/system/production/report-ui-copy.ts](<../../../app/system/production/report-ui-copy.ts>)
- [app/system/production/report-types.ts](<../../../app/system/production/report-types.ts>)
- [app/system/production/report-document.css](<../../../app/system/production/report-document.css>)
- [app/system/production/ReportScreens.tsx](<../../../app/system/production/ReportScreens.tsx>)
- [app/system/production/inspection-report.css](<../../../app/system/production/inspection-report.css>)

## Candidate regression tests

- [tests/report-document-form.test.mjs](<../../../tests/report-document-form.test.mjs>)
- [tests/report-workflow-ui.test.mjs](<../../../tests/report-workflow-ui.test.mjs>)
- [backend-node/tests/report-templates.test.ts](<../../../backend-node/tests/report-templates.test.ts>)
- [backend-node/tests/unified-reports.test.ts](<../../../backend-node/tests/unified-reports.test.ts>)

## Client contract lookup

Search the selected API path or function in [app/system/api-client.ts](<../../../app/system/api-client.ts>); follow its screen callers. Common UI/language changes require [app/system/ui.tsx](<../../../app/system/ui.tsx>) and [app/system/i18n.ts](<../../../app/system/i18n.ts>). For SQL changes use [schema map](../SCHEMA.md).
