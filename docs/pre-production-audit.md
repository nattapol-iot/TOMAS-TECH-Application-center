# Pre-production Audit — IoT Team Center

จัดตั้งทีม: 7 กันยายน 2026 — Codex Audit Lead

สถานะ: ตั้งทีมและตรวจเบื้องต้นเสร็จแล้ว; ยังไม่ผ่านการรับรอง Production และยังไม่ได้ทำ full UAT

## ทีมและความรับผิดชอบ

| ผู้รับผิดชอบ | ขอบเขต | ผลงานที่ต้องส่ง |
| --- | --- | --- |
| Audit Lead (ผู้ประสานงานหลัก) | กำหนด candidate, รวมผล, จัดลำดับข้อบกพร่องและตรวจซ้ำ | Evidence register และข้อเสนอ Go/No-Go |
| Security Auditor (`security_audit`) | Entra, RBAC, record access, เอกสารและลายเซ็น | ช่องโหว่/คำถามเชิงนโยบายพร้อมหลักฐานและกรณีทดสอบ |
| Functional QA (`functional_qa`) | ต้นทุน, approval/revision, procurement/stock, reports, support, ภาษา | UAT ตามบทบาทและผลลัพธ์ที่ตรวจเทียบได้ |
| Release/Operations Auditor (`release_audit`) | Node runtime, CI, migration, recovery, monitoring, rollback | Release checklist และช่องว่างหลักฐาน |
| เจ้าของระบบ/ผู้ใช้ธุรกิจ (ยังไม่ระบุรายชื่อ) | ยืนยันผล UAT และเกณฑ์ปฏิบัติงาน | Business acceptance และการตัดสินใจปล่อยระบบ |

ผู้ตรวจทั้งสามทำ initial review แบบอ่านอย่างเดียวแล้ว ทีม AI นี้อยู่ในบริบทงานนี้ ไม่ใช่บริการเฝ้าระวังเบื้องหลังถาวร

## ขอบเขตและหลักฐานรอบนี้

- ตรวจ working tree บน HEAD `d77ec6f` ซึ่งมีทั้ง tracked modifications และ untracked features; ผลนี้ไม่ใช่ผลของ commit ล้วนหรือ artifact ที่ freeze แล้ว
- ใช้ current Node API/screens และเอกสารรายโมดูลเป็นจุดตั้งต้น เอกสารหลักบางส่วนยังอ้าง .NET และ FEATURES ระบุ legacy/full-target scope
- ไม่แก้ implementation, ไม่ deploy, ไม่ใช้ฐานข้อมูลจริง, ไม่สร้างลายเซ็นหรือข้อมูลลูกค้า และไม่เปลี่ยน shared services
- Audit Lead รัน targeted checks ทีละคำสั่งบน Node `v24.13.0`:

| คำสั่ง | ผลตรวจ 2026-09-07 |
| --- | --- |
| `node --test tests/production-guardrails.test.mjs tests/network-origin.test.mjs` (repo root) | 33 tests: 31 pass, 2 fail, 0 skip; exit 1 |
| `node --import tsx --test tests/auth.test.ts tests/http.test.ts` (backend-node) | 8 tests: 8 pass, 0 fail, 0 skip; exit 0 |

รวม 39/41 ผ่าน เป็นเพียง baseline ที่เลือกมา ไม่ใช่ full regression, browser UAT, penetration test หรือ production build verification

## ประเด็นที่ต้องติดตาม

| ID / ความสำคัญ | หลักฐาน | สิ่งที่ต้องทำก่อนปิดประเด็น |
| --- | --- | --- |
| AUD-01 / Release blocker | Fail ที่ `tests/production-guardrails.test.mjs:557,946` ยัง expect schema 35 แต่ `database/scripts/020_deploy_fresh_database.sql:105` require 36 | ตรวจ manifest/migration 36 แล้วทำ test ให้ตรง contract; รันทดสอบซ้ำ การ fail นี้ยังไม่พิสูจน์ว่า revision หรือ Knowledge Hub เสีย |
| AUD-02 / High | `docs/PRODUCTION_DEPLOYMENT.md:232` deploy .NET และ `:138` อ้าง schema 1–7; `backend-node/README.md:9–12` ระบุ Node native | จัดทำ runbook Node ที่ตรง candidate รวม install, service identity, config, migration และ rollback |
| AUD-03 / High | `.github/workflows/backend-integration.yml:63–64` เรียก material wrapper ที่ build/run .NET (`tests/integration/full-material-flow.ps1:17,197,212`) | เพิ่มหลักฐาน CI ของ Node + SQL restricted role และ frontend ของ release เดียวกัน; manual Node tests ในอดีตไม่ถูกนับเป็น CI ปัจจุบัน |
| AUD-04 / High, ต้องยืนยันนโยบาย | `backend-node/src/routes/signing.ts:1422` verify code ตรวจ signing.read แต่ไม่ตรวจ document scope และคืน metadata; download ที่ `:1412` ตรวจ scope | ทดลองด้วยผู้ใช้ต่าง project และยืนยันว่า policy อนุญาต disclosure นี้หรือไม่; ยังไม่สรุปเป็นช่องโหว่ที่ reproduce แล้ว |
| AUD-05 / High, external control ยังไม่ยืนยัน | project upload/download (`backend-node/src/routes/project-documents.ts:137,193`) ไม่มี application scan gate; operations runbook `:540` ต้องมีหลักฐานก่อน broad rollout | พิสูจน์ scanner/quarantine/ACL ว่าป้องกัน download ก่อน clean รวมไฟล์ quarantined; ไม่ถือ hash เป็น malware scan |
| AUD-06 / Medium, ต้องยืนยันนโยบาย | `backend-node/src/signing-core.ts:142,154` บังคับ auth_time เมื่อเปิด flag; ทางอื่นยอมรับ recent token iat | ยืนยันข้อกำหนด fresh interactive authentication และทดสอบ silent refresh/old login ตาม config ที่อนุมัติ |
| AUD-07 / Evidence gap | health source require schema 36 แต่ `docs/team-activity-qa.md:40` บันทึก release ที่ตรวจครั้งนั้น schema 35 | ตรวจ active artifact hashes/schema/asset compatibility ใหม่; รอบนี้ไม่ได้ตรวจ live runtime จึงไม่สรุปว่าระบบที่รันอยู่ผิด |
| AUD-08 / Evidence gap | README `:13–17,48` ยังระบุ Entra/HTTPS/NAS/monitoring/recovery ที่ต้องพิสูจน์; backup VERIFYONLY ไม่ใช่ restore drill (`docs/OPERATIONS_RUNBOOK.md:242`) | Entra staging จริง, SQL+files restore, RPO/RTO, alerts ถึงผู้รับผิดชอบ, restart/rollback rehearsal |
| AUD-09 / Historical regression ต้องตรวจซ้ำ | `docs/team-activity-qa.md:36` บันทึก global lint และ .NET inventory expected 5 / actual 6.0000 | Reproduce และแยก stale expectation กับ business defect รวมตรวจ Node inventory; รอบนี้ยังไม่ได้รันซ้ำ |

## UAT ที่เตรียมให้ทีม

ใช้ fixture ที่ระบุว่าเป็นข้อมูลทดสอบใน staging แยกจากข้อมูลจริง เตรียมผู้ใช้ตาม role ที่ระบบกำหนดจริง รวม inactive/unmapped account และผู้ใช้ต่าง project

| ID / ลำดับ | เส้นทางและผู้ทดสอบ | ผลที่คาดหวัง |
| --- | --- | --- |
| UAT-01 / P0 | Entra sign-in, ทุก role, inactive/unmapped user | issuer/audience/scope/token ถูกตรวจ; ข้อมูลและ action ตรงสิทธิ์ทั้ง UI/API; TeamTest เข้า Production ไม่ได้ |
| UAT-02 / P0 | Sales inquiry → Engineer estimate + Excel import | Customer/end user ไม่สลับ; ยอด server ตรง fixture คำนวณอิสระ; input ไม่ถูกต้องและข้อมูลจำเป็นขาดส่งอนุมัติไม่ได้ |
| UAT-03 / P0 | Estimate submit → authorized approvers → revision | ใช้ approval chain จริง; approved version แก้ไม่ได้; revision เก็บประวัติ; concurrent stale save ไม่ทับข้อมูล |
| UAT-04 / P0 | Approved estimate → BOM → PR → PO | approval ตาม threshold ที่ตั้งจริง; self-approval ถูกปฏิเสธ; rejection reason และ cost commitments ตรวจสอบย้อนกลับได้ |
| UAT-05 / P0 | Warehouse partial receipt → quarantine → reserve → issue → consume/return | damaged stock ไม่รวม usable; ไม่ double reserve; retry ไม่เพิ่ม ledger ซ้ำ; balance และ actual cost ตรงทุกขั้น |
| UAT-06 / P0 | Report → review/approve → customer acknowledgment → revision | required content ครบ; template/signature/history คงเดิม; link ไม่ยืนยันเนื้อหาผิดเวอร์ชัน; evidence จำกัดสิทธิ์; print ใช้ภาษารายงาน |
| UAT-07 / P0 | Support reporter → scoped staff → admin | ticket/internal notes/files ไม่รั่ว; transition ตรงสิทธิ์; points อยู่ 0–10 ไม่ self-award/ซ้ำจาก retry; history ถูกต้อง |
| UAT-08 / P1 | My Work/Activity/KPI, TH/EN/JP, narrow viewport | งานตรง assignment; save fail ไม่ทำ draft หาย; trial แยกชัด; private evidence จำกัดสิทธิ์; ภาษาไม่เปลี่ยนค่าธุรกิจ |
| SEC-01 / P0 | Direct record IDs และ attachment URLs ต่างผู้ใช้/project | Unauthorized reads/writes/downloads ถูกปฏิเสธ แม้ bypass UI; disabled user ถูกตัดสิทธิ์ |
| SEC-02 / P0 | Signing code, wrong assignee, stale version, duplicate sign, silent refresh | metadata ตรง policy; เฉพาะผู้มีสิทธิ์และ assurance ที่กำหนดลงนามได้; ไม่เกิดผลซ้ำ |
| SEC-03 / P0 | File traversal, size/type, integrity และ scanner fixtures ที่อนุมัติ | reject input ไม่ถูกต้อง; corrupted/quarantined/unscanned files ดาวน์โหลดไม่ได้; clean files ยังตรวจ record scope |

Coverage caveats: SQL material integration สามารถ skip เมื่อไม่มี SQL (`tests/full-material-flow.integration.test.mjs:10,30–37`); release ต้องมีผล non-skipped ส่วน UI tests บางชุดใช้ mock/static markup (`tests/end-user-ui.test.mjs:23,42`; `tests/report-workflow-ui.test.mjs:30–39`) จึงต้องทำ browser journeys จริงเพิ่มเติม

## ลำดับดำเนินงานและเกณฑ์ Go/No-Go ที่เสนอ

1. Freeze candidate และกำหนด deployment target, staging URL/database, test accounts, expected role matrix และ safe fixtures บันทึก source/artifact hashes และ migration manifest ให้ตรงกัน
2. Triage AUD-01 ถึง AUD-09 พร้อม owner; แก้และ retest บน candidate เดียวกัน รัน lint/typecheck/unit/build ทีละงานเพื่อจำกัด RAM
3. ทำ Node SQL integration แบบ isolated และไม่ skip; ต่อด้วย browser UAT/Security ทุก P0 เก็บหลักฐานหลังแต่ละขั้น
4. ทดสอบ realistic workload และกำหนดจำนวนผู้ใช้, latency/error budget, RPO/RTO กับเจ้าของระบบก่อนตัดสิน pass; ทดสอบ alerts, recovery และ rollback
5. เสนอ Go เมื่อไม่มี Critical/High ที่ยังไม่ปิด, P0 ผ่านครบ, required checks ผ่านไม่ skip, artifact ตรงรุ่น, recovery/operations มีหลักฐาน และเจ้าของธุรกิจยอมรับ UAT พร้อมรับทราบ residual risks ที่ระบุชัด

ผลรอบนี้: **ยังเสนอ Go ไม่ได้** เนื่องจาก baseline มี failure และยังขาด staging/UAT/recovery evidence; ไม่ได้หมายความว่าตรวจยืนยันว่าทุกประเด็นเป็น production defect แล้ว

Evidence record ต่อกรณี: `Case ID | candidate/hash | environment | role/fixture | steps | expected | actual | screenshot/API/SQL evidence (redacted) | pass/fail/blocked | severity | owner | retest`. ห้ามบันทึก token, access code, secret หรือข้อมูลส่วนบุคคลที่ไม่จำเป็นลงรายงาน

— Codex Audit Lead, 2026-09-07
