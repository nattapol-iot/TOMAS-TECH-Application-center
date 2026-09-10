# ทะเบียนฟีเจอร์และหลักฐาน

Status: Initial inventory — 2026-09-10
Owner: Integration Lead; เจ้าของแต่ละ flow ต้องเติมผล candidate/UAT/release

This is the pre-integration source inventory. The [main-based candidate record](CANDIDATE_INTEGRATION.md) tracks the combined implementation and fresh checks. Preserve the original observations below as dated evidence; they do not describe the final candidate's Git status or CI configuration.

“พบ source” หมายถึงพบจุดเชื่อม/ไฟล์ implementation ไม่ได้รับรองทุก transition ว่าสมบูรณ์ ทุกแถวด้านล่างยัง **ไม่ยืนยัน live Production** และยังไม่มี browser/SQL acceptance ของ candidate ที่ freeze แล้ว รายละเอียดทุก flow ใช้ [แผน F01–F22 เดิม](../audits/full-system-flow-audit-plan.md) ไม่ลดขอบเขตเดิม

## ฟีเจอร์ล่าสุดที่ต้องรักษาไว้

| ID | ฟีเจอร์ | หลักฐาน source/ประวัติ | สถานะที่ยืนยันได้ | งานติดตาม |
| --- | --- | --- | --- | --- |
| REC-01 | Project document handover | commit 35318d56; backend-node/src/project-handover.ts; CoreScreens.tsx | มี commit และ historical release record; ไฟล์มี local changes เพิ่ม | REL-01, QA-10 |
| REC-02 | Admin user roles | commit f9821c96; routes/admin.ts; migration 037 | committed baseline + local changes; root role guardrail fail | QA-03, CI-01 |
| REC-03 | Inquiry queue / Estimate next-step / rate guidance | lib/inquiry-queue.ts, lib/estimate-ux.ts, InquiryScreens.tsx, EstimateScreens.tsx; [release note](../releases/inquiry-estimate-ux-release.md) | local changes รวม untracked helpers; ยังไม่ยืนยัน deploy | REL-01, QA-05, QA-08 |
| REC-04 | Original Excel / published templates / overhead | routes/estimate-excel-import.ts, module-templates.ts, overhead-policies.ts; migration 040; [release evidence](../releases/small-team-estimate-release.md) | local implementation; note ระบุ isolated integration; audit นี้ไม่ได้รัน SQL ซ้ำ | DB-01, QA-08, QA-09 |
| REC-05 | Engineering rate access + auth restoration | engineering-rate-access.ts, api-client.ts, tests/engineering-rate-*.test.mjs, auth-restoration.test.mjs | local changes และ tests; ต้องตรวจ session/role จริง | SEC-01, QA-01, QA-03 |
| REC-06 | Build guard สำหรับ workspace ที่ให้บริการ frontend | scripts/guard-running-frontend-build.mjs, tests/frontend-build-guard.test.mjs, package.json | untracked guard และ dirty package script; ป้องกันเฉพาะ entrypoint ที่ตรง managed PID state; test อนุญาต build จาก checkout อื่น จึงไม่รับรอง cross-worktree release | REL-02, CI-01 |

## ทะเบียนครบ 22 กลุ่ม

Paths ในตารางเป็น repository-relative. Source anchors ต้องขยายเป็น action/permission/transition cases ในแต่ละ QA task; ห้ามปิดทั้งโมดูลเพียงเพราะมีไฟล์นี้

| ID | กลุ่ม | จุดเริ่มตรวจ source | Owner role | Acceptance task |
| --- | --- | --- | --- | --- |
| F01 | Identity & Session | app/system/auth-client.ts; api-client.ts; backend-node/src/auth.ts | Security + Frontend | QA-01 |
| F02 | Shell / My Work / Notifications | ProductionApp.tsx; PlanningPricingScreens.tsx; routes/bootstrap.ts | Frontend | QA-02 |
| F03 | Masters / Admin / Roles / Rates | AdminAnalyticsScreens.tsx; routes/master.ts; admin.ts; visit-master.ts | Backend/Data | QA-03 |
| F04 | Customer intake / OCR | BusinessCardScanner.tsx; InquiryCustomerFields.tsx; routes/sales-customers.ts | Frontend + Sales | QA-04 |
| F05 | Inquiry | InquiryScreens.tsx; routes/inquiries.ts; inquiry-attachments.ts | Backend + Sales | QA-05 |
| F06 | Site Visit / Assignments | SiteVisitScreens.tsx; routes/site-visits-workflow.ts; site-visits-read.ts | Backend + Engineering | QA-06 |
| F07 | Pricing / Supplier Evidence | PlanningPricingScreens.tsx; HistoricalPrPanel.tsx; routes/pricing.ts; supplier-quotations.ts | Backend + Purchasing | QA-07 |
| F08 | Estimate / Approval / Revision / Overhead | EstimateScreens.tsx; EstimateOverheadPanel.tsx; routes/estimates.ts; estimate-cost-write.ts | Backend + Cost owner | QA-08 |
| F09 | Excel Import / Module Templates | EstimateExcelImport.tsx; ModuleTemplateEditor.tsx; routes/estimate-excel-import.ts; module-templates.ts | Backend + Frontend | QA-09 |
| F10 | Project / Folders / Handover | CoreScreens.tsx; routes/projects.ts; project-documents.ts; project-handover.ts | Backend + Project owner | QA-10 |
| F11 | Schedule / Resources / Tasks | ProjectTimelineScreen.tsx; ResourceTaskWorkspace.tsx; routes/schedule.ts; resource-tasks.ts | Engineering + QA | QA-11 |
| F12 | Procurement / BOM / PR / PO | MaterialScreens.tsx; routes/boms.ts; purchase-requisitions.ts | Purchasing + Backend | QA-12 |
| F13 | Inventory / Receiving | MaterialScreens.tsx; routes/inventory.ts; goods-receipts.ts; stock-control.ts | Warehouse + Backend | QA-13 |
| F14 | Material Issue / Actual Cost | MaterialScreens.tsx; routes/material-issues.ts; stock-control.ts | Warehouse + Backend | QA-14 |
| F15 | Knowledge Hub | KnowledgeScreens.tsx; routes/knowledge-workflow.ts; knowledge-documents.ts | Knowledge owner | QA-15 |
| F16 | Reports / Templates | ReportScreens.tsx; ReportDocumentForm.tsx; routes/unified-reports.ts; report-templates.ts | Engineering + QA | QA-16 |
| F17 | Signing / Drawing / Customer links | SigningScreens.tsx; SigningPreview.tsx; routes/signing.ts; signature-master.ts | Security + QA | QA-17 |
| F18 | Team Activity | TeamActivityScreen.tsx; routes/activity.ts | Team lead + QA | QA-18 |
| F19 | KPI / Growth / Pulse | PerformanceScreen.tsx; PerformancePulse.tsx; routes/performance.ts | Management + QA | QA-19 |
| F20 | Support Center | SupportScreens.tsx; routes/support.ts | Support owner + QA | QA-20 |
| F21 | Audit / Reconciliation / Analytics | ExecutiveDashboard.tsx; routes/admin.ts; executive-dashboard.ts; backend-node/src/audit.ts | Data + QA | QA-21 |
| F22 | Integrations / Operations | routes/health.ts; backend-node/src/config.ts; database/scripts; scripts; .github/workflows | Release/Operations | QA-22 |

Frontend screen names without a prefix are under `app/system/production/`; `routes/` means `backend-node/src/routes/`. ProductionApp.tsx and api-client.ts are under `app/system/`.

## รูปแบบหลักฐานต่อฟีเจอร์

`Feature ID | Requirement/decision | Commit | UI/API entry | Migration | Automated result | Browser/role result | Environment | Artifact hashes | Deployed at | Owner | Open gaps`

ผลวันที่ 2026-09-10 บน HEAD `aef445fd40910b49e4d2387323aed2b67ac0ef7f` พร้อม dirty worktree: Node unit ผ่าน 110 ข้อ; root tests ผ่าน 211/222, fail 10, skip SQL 1 ดู [ผลและคำสั่งที่ใช้](../audits/local-checks-2026-09-10.md) จึงยังไม่กรอกทุกฟีเจอร์ว่า Tested/Done การย้าย Markdown ครั้งนี้ไม่มีการตัดฟีเจอร์ใดออกจาก baseline

Workflow anchor ของ F22 ใน checkout นี้มี `backend-integration.yml` ซึ่งตรวจ .NET wrapper เท่านั้น เส้นทาง deploy/CI อีกชุดพบใน local tracking ref `IoT-Team-Center/main` ที่ `d43eb346d3706e78e65a92031427b4b1e1e4954f`; ต้อง reconcile ใน REL-01/REL-04 ไม่ถือว่า workflow สองชุดอยู่บน candidate เดียวกันหรือเป็น remote ล่าสุด
