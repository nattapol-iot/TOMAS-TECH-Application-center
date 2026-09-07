# Employee operation manual — coverage and maintenance

Deliverable: [Multilingual illustrated HTML](../output/IoT-Team-Center-Employee-Manual.html)

The former `-TH.html` path contains the same standalone multilingual edition.

Content baseline: 2026-09-06. Scope: current `ProductionApp.tsx` navigation,
production screen implementations and feature completion notes, including local
uncommitted features present at authoring time. This is a source-grounded employee
manual, not a claim that every workflow has been re-tested in the deployed system.
Legacy `FEATURES.md` and demo routes are not treated as proof of available UI.

The manual is a local document artifact. No site, application bundle, database,
employee record, signature, or deployment is modified by building it.

Rebuild with `python scripts/build-employee-operation-manual.py` after reviewing
changed behavior. This checks that every current primary navigation view has a
chapter and that referenced source files exist. It does not replace a content review.
All text, styles, scripts, Google Font subsets and real screenshots are embedded; no external font request or library is required.
English/Japanese content: `scripts/employee_manual_translations.py`.
Renderer and localized captions: `scripts/employee_manual_illustrated.py`.
Capture provenance and hashes: `docs/manual/screenshots/manifest.json`.
Application integration: `docs/employee-manual-integration.md`.

The build verifies 40 chapters and matching identifiers for all 95 procedures in
each language. Screenshots were captured in Chrome from the real Team Test app
on 2026-09-06, in TH/EN/JP. No business transactions were submitted for capture.
Source UI strings that remain untranslated are preserved in the screenshots.
Images show accessible pages, not proof that every transaction was exercised.

| Chapter | Menu / additional view coverage | Reviewed sources |
| --- | --- | --- |
| 01 เริ่มใช้งานและเข้าใจสิทธิ์ | profile | `app/system/ProductionApp.tsx`, `app/system/production/ProfileScreen.tsx` |
| 02 เมนู การค้นหา และการแจ้งเตือน | manual | `app/system/ProductionApp.tsx`, `app/system/production/EmployeeManualScreen.tsx`, `app/system/api-client.ts` |
| 03 ลำดับงานประจำวันตามหน้าที่ | Dashboard → งานที่เกี่ยวข้อง | `app/system/ProductionApp.tsx`, `docs/resource-task-workflow.md`, `docs/inquiry-visit-flow.md` |
| 04 Dashboard: ภาพรวมและงานที่ต้องติดตาม | dashboard | `app/system/production/CoreScreens.tsx` |
| 05 ลูกค้า ผู้ติดต่อ และ End user | customers | `app/system/production/InquiryCustomerFields.tsx`, `app/system/production/EndUserCompanyField.tsx`, `app/system/production/BusinessCardScanner.tsx`, `docs/customer-multilingual-names.md`, `docs/customer-contact-titles.md`, `docs/customer-contact-roles.md`, `docs/end-user-companies.md` |
| 06 Inquiry: รับงานและรวบรวมความต้องการ | inquiries | `app/system/production/InquiryScreens.tsx`, `docs/inquiry-visit-flow.md` |
| 07 ขอเข้าหน้างานและตรวจความพร้อม | sales-intake | `app/system/production/SiteVisitScreens.tsx`, `docs/inquiry-visit-flow.md`, `lib/inquiry-visit-flow.ts` |
| 08 Site Visit: จัดทีม นัดหมาย และสำรวจ | site-visits | `app/system/production/SiteVisitScreens.tsx`, `docs/site-visit-workspace.md`, `lib/site-visit-rules.ts` |
| 09 My Assignments และรายงานผลสำรวจ | my-assignments | `app/system/production/SiteVisitScreens.tsx`, `docs/site-visit-workspace.md` |
| 10 Estimate Cost: สร้างและจัดรายการต้นทุน | estimates | `app/system/production/EstimateScreens.tsx`, `app/system/production/CostItemFields.tsx` |
| 11 Man-hour ค่าใช้จ่าย และ Contingency | Estimate → Engineering Man-hour / Other Project Cost | `app/system/production/EstimateScreens.tsx`, `backend-node/src/routes/estimate-workspace-write.ts` |
| 12 นำเข้า Excel Estimate และใช้ Module Templates | module-templates | `docs/estimate-excel-import.md`, `app/system/production/EstimateExcelImport.tsx`, `app/system/production/ModuleTemplateScreens.tsx`, `app/system/production/ModuleTemplateEditor.tsx` |
| 13 มอบหมาย ตรวจสอบ อนุมัติ และ Revision ของ Estimate | Estimate → Assignment / Validation / Engineering Review | `app/system/production/EstimateScreens.tsx`, `docs/estimate-assignment-email.md`, `backend-node/src/routes/estimates.ts` |
| 14 ราคาอ้างอิงและใบเสนอราคาผู้ขาย | price, quotations, missing | `app/system/production/PlanningPricingScreens.tsx` |
| 15 Projects และเอกสารโครงการ | projects | `app/system/production/CoreScreens.tsx`, `app/system/api-client.ts` |
| 16 Project Schedule และ Baseline | Projects → Project Schedule | `app/system/production/PlanningPricingScreens.tsx`, `docs/resource-task-workflow.md` |
| 17 Resource Plan และ Project Timeline | resources, project-timeline | `app/system/production/ResourcePlanningScreen.tsx`, `app/system/production/ResourceTaskWorkspace.tsx`, `app/system/production/ProjectTimelineScreen.tsx`, `docs/resource-planning.md`, `docs/resource-task-workflow.md` |
| 18 My Work และ Team Activity: รับงาน รายงาน และติดตามคะแนน | my-work, activity | `app/system/production/ResourceTaskWorkspace.tsx`, `app/system/production/PlanningPricingScreens.tsx`, `app/system/production/TeamActivityScreen.tsx`, `app/system/ProductionApp.tsx` |
| 19 Punchlist: ติดตาม Issue ของลูกค้าจนปิด | Projects → Punchlist · Issue ลูกค้า | `app/system/production/ResourceTaskWorkspace.tsx`, `docs/resource-task-workflow.md` |
| 20 Procurement Dashboard และ BOM | procurement, boms | `app/system/production/MaterialScreens.tsx`, `backend-node/src/routes/boms.ts`, `backend-node/src/routes/stock-control.ts` |
| 21 Purchase Requisition: ขอซื้อและอนุมัติ | purchase | `app/system/production/MaterialScreens.tsx`, `backend-node/src/procurement-rules.ts`, `backend-node/src/routes/purchase-requisitions.ts` |
| 22 PR ย้อนหลัง: นำเข้า เก็บประวัติ และเทียบงบ | Purchase Requisition → PR ย้อนหลัง | `docs/historical-pr-import.md`, `app/system/production/HistoricalPrPanel.tsx`, `backend-node/src/routes/historical-pr.ts` |
| 23 Purchase Orders: ออก PO และติดตามของ | pos | `app/system/production/MaterialScreens.tsx`, `backend-node/src/routes/purchase-requisitions.ts` |
| 24 Goods Receiving: รับของเต็มและบางส่วน | receiving | `app/system/production/MaterialScreens.tsx`, `backend-node/src/routes/goods-receipts.ts` |
| 25 Inventory: ยอดคงเหลือ ปรับยอด และ Quarantine | inventory | `app/system/production/CoreScreens.tsx`, `app/system/production/MaterialScreens.tsx`, `backend-node/src/routes/inventory.ts`, `backend-node/src/routes/stock-control.ts` |
| 26 Material Issues: ขอเบิก จ่าย รับ และคืน | issues | `app/system/production/MaterialScreens.tsx`, `backend-node/src/routes/material-issues.ts` |
| 27 Approvals: รวมคิวอนุมัติวัสดุ | approvals | `app/system/production/MaterialScreens.tsx` |
| 28 Knowledge Hub: ค้นหาและควบคุมความรู้ทีม | knowledge | `app/system/production/KnowledgeScreens.tsx`, `app/system/SolutionLibrary.tsx`, `docs/knowledge-sales-library.md`, `backend-node/src/routes/knowledge-workflow.ts` |
| 29 ตั้งค่าลายเซ็นส่วนตัวและตราบริษัท | signature, stamps | `app/system/production/SigningScreens.tsx`, `backend-node/src/routes/signature-master.ts` |
| 30 Sign Inbox และ Signed Documents | signing, documents | `app/system/production/SigningScreens.tsx`, `app/system/production/SigningPreview.tsx`, `docs/signing-preview.md`, `docs/drawing-release.md` |
| 31 Reports: รายงานปฏิบัติงาน 5 ประเภท | reports | `docs/unified-reports.md`, `app/system/production/ReportScreens.tsx`, `app/system/production/ReportDocumentForm.tsx`, `docs/four-feature-completion.md` |
| 32 Template รายงานและการรับรองจากลูกค้า | Reports → Templates / รายงาน → Customer signing | `docs/unified-reports.md`, `app/system/production/ReportTemplateLibrary.tsx`, `app/system/ReportCustomerSign.tsx` |
| 33 Reports: รายงานวิเคราะห์ | Reports → Analytics | `app/system/production/AdminAnalyticsScreens.tsx`, `app/system/ProductionApp.tsx` |
| 34 KPI & Growth: ประเมินตนเองและพัฒนางาน | performance | `app/system/production/PerformanceScreen.tsx`, `docs/kpi-performance-reviews.md`, `docs/four-feature-completion.md` |
| 35 Support Center: แจ้งปัญหาและติดตามคำตอบ | support | `app/system/production/SupportScreens.tsx`, `app/system/support-copy.ts`, `docs/support-center-implementation.md`, `backend-node/src/support-rules.ts` |
| 36 Master Data และ Engineering rates | master, rates | `app/system/production/CoreScreens.tsx`, `app/system/production/AdminAnalyticsScreens.tsx` |
| 37 Visit Master Data: ตั้งค่าการออกหน้างาน | visit-master | `app/system/production/SiteVisitScreens.tsx`, `backend-node/src/routes/visit-master.ts` |
| 38 Audit Log และ Settings | audit, settings | `app/system/production/AdminAnalyticsScreens.tsx` |
| 39 เมื่อทำต่อไม่ได้: วิธีตรวจและแก้เบื้องต้น | ใช้ได้ทุกโมดูล | `app/system/api-client.ts`, `docs/resource-planning.md`, `docs/unified-reports.md`, `docs/support-center-implementation.md` |
| 40 คำศัพท์ สถานะ และรายการตรวจงาน | ภาคอ้างอิง | `app/system/ProductionApp.tsx`, `docs/four-feature-completion.md`, `docs/support-center-implementation.md` |

Important distinctions preserved in the manual:

- Team Test versus Microsoft company sign-in; permission and project scope.
- Inquiry-first visits; legacy Sales Intake accessible through preparation.
- Governed resource Tasks versus legacy Project schedule tasks and site assignments.
- Done versus verified Closed; proposed plans versus committed workload.
- Current supplier follow-up is derived from source prices, not an RFQ dispatch tool.
- Historical PR archives create no live PO, receipt or stock transaction.
- Site Visit reports versus five unified operational report types.
- Latest positioned PDF signing alongside legacy HTML certificate outputs.
- Report document language versus interface language; one-use customer links.
- Four analytics tabs, not the legacy prototype's thirteen-report target.
- Read-only Settings and account references, not fictional configuration editors.
- Support recognition does not automatically contribute KPI ratings.

Validation performed for this artifact is recorded in the task delivery. Future
releases should re-check button wording, permissions, input requirements, file limits,
workflow states, translations and screenshots whenever the application changes.
