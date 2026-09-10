# Release control และการป้องกันฟีเจอร์ถูกทับ

Status: Proposed release gate; ยังไม่ได้เปลี่ยน pipeline/runtime
Updated: 2026-09-10
Owner: Release Lead + QA + Backend/Data

## ปัญหาที่พบ

มีหลาย worktree/branch และ local changes ที่ยังไม่ commit; เอกสารเดิมอ้างหลาย runtime และบันทึกการปล่อยบางฟีเจอร์แยกกัน รายละเอียดใน [audit](../audits/production-readiness-2026-09-10.md) สิ่งนี้เป็นความเสี่ยงที่พิสูจน์ได้ แต่ยังไม่ใช่หลักฐานว่า Production ถูก rollback ครั้งใด

## Candidate หนึ่งชุด

ก่อน build ให้กำหนด commit ที่รวมฟีเจอร์ที่ต้องรักษาไว้ และบันทึก:

| Field | ต้องมี |
| --- | --- |
| Source | repo, branch, full commit SHA, clean tracked/untracked application status |
| Feature baseline | F01–F22 และ REC-01–REC-06 ที่ต้องคงอยู่; accepted exclusions |
| Frontend/API | artifact SHA-256, build ID, API contract/version, build config fingerprint ที่ไม่มี secret |
| Database | exact target alias, ordered migration IDs/checksums, prerequisites, account role |
| Storage | storage target alias, document behavior และ backup set; ไม่บันทึก credentials |
| Verification | CI run, non-skipped SQL integration, role/browser UAT, recovery/rollback result |
| Release | environment, operator, timestamp, previous release, rollback trigger |

ห้ามถือ schema MAX(version) อย่างเดียวว่าครบทุก migration และห้ามสร้าง migration 038/039 ปลอมเพื่อเติมเลข: เอกสาร small-team ระบุว่าเป็น company-specific schema ที่ยังต้อง reconcile

## ลำดับปฏิบัติ

1. ตรวจ source diff และ worktrees แบบอ่านอย่างเดียว; สร้าง candidate checkout แยกจาก runtime ที่ให้บริการ
2. รวมงานผ่าน PR; เจ้าของ integration เป็นผู้แก้ shared files เช่น ProductionApp.tsx, api-client.ts, app.ts, global CSS และ migration runner
3. รัน frontend lint/typecheck/tests และ Node typecheck/unit/build บน candidate; แยก temp/generated/nested checkouts ออกจากการตรวจ
4. ทดสอบ fresh และ upgrade SQL ภายใต้ restricted application role รวม schema 040 และ compatibility ของ existing data บนฐานทดสอบที่แยกชัด
5. Build artifact ครั้งเดียว แล้วใช้ชุดเดียวกันทดสอบ staging และ promote; ห้าม copy ไฟล์ feature เก่าทับ full release โดยไม่มี baseline reconciliation
6. ตรวจ backup และ restore จริงของ SQL + document bytes; เตรียม previous artifact พร้อม schema compatibility
7. เมื่อ release gate และ business UAT ผ่าน จึงอนุมัติการ switch เป้าหมายที่ระบุแน่นอน
8. หลัง switch ตรวจ served frontend marker, API build ID, required migrations, auth mode และ regression smoke ของฟีเจอร์เดิม แล้วบันทึกหลักฐาน

## วิธีสืบเมื่อผู้ใช้บอกว่าฟีเจอร์หาย

จด URL/เวลา/role/action ที่หาย → ตรวจ frontend artifact และ API endpoint ที่ browser ใช้ → ตรวจ commit ที่สร้างสอง artifact → เทียบ migration/feature baseline → แยกว่าเป็นโค้ดเก่า, permission, configuration, cache หรือ defect → แก้สาเหตุบน candidate และทดสอบทั้งฟีเจอร์ที่หายกับฟีเจอร์ที่เพิ่งเพิ่ม

อย่าใช้วันที่ของ Markdown หรือข้อความว่า “released” แทน runtime evidence อย่า reset/cherry-pick/restart เพื่อเดาสาเหตุ
