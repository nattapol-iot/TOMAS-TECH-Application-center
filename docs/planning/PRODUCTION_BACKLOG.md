# แผนงานเตรียม Production

Status: Local candidate integrated; production acceptance remains open. See candidate evidence below.
Updated: 2026-09-10
Owner: Integration Lead; role assignments ด้านล่างเป็นข้อเสนอ ไม่ใช่การมอบหมายให้พนักงานจริง

Candidate integration follow-up: [CANDIDATE_INTEGRATION.md](CANDIDATE_INTEGRATION.md) records completed local portions of REL-01, CI-01, DB-01, COST-01 and COST-02. Their staging, target-database and release acceptance criteria below remain open; local unit/build success does not close those criteria.

## เป้าหมายและกติกาปิดงาน

รักษาฟีเจอร์เดิมทุกกลุ่มใน [ทะเบียน](FEATURE_REGISTER.md), ทำ source/API/schema/artifact ให้เป็น candidate เดียวกัน และเก็บหลักฐานก่อน Go-live ใช้ [audit ล่าสุด](../audits/production-readiness-2026-09-10.md) และ [flow plan เดิม](../audits/full-system-flow-audit-plan.md) เป็นขอบเขต

P0 = กั้น release, P1 = ต้องพิสูจน์ก่อน broad rollout หรือมี accepted scope exclusion; P2 = หลัง stabilization ทุก task เริ่ม Open เว้นแต่ระบุ Done ชัดเจน Owner เป็นบทบาท ต้องเติมชื่อและวันที่เป้าหมายหลัง REL-01; ไม่ตั้ง deadline โดยไม่มีวัน Go-live/กำลังทีม

## Wave 0 — ทำ baseline ให้เชื่อถือได้

| Task | Priority / Owner | Dependency | ผลส่งมอบและเกณฑ์ปิด |
| --- | --- | --- | --- |
| DOC-01 จัดเอกสาร | P0 / Documentation Lead | — | **Done ในรอบนี้**: 38 canonical moves + old-path pointers, index, preserved README, design status, manifest และ link verification; ข้อกำหนดเดิมยังอยู่ |
| REL-01 Freeze/reconcile candidate | P0 / Integration Lead | — | ตรวจทุก worktree/branch และ dirty/untracked application files; feature-to-commit matrix REC-01–06/F01–22 ไม่มีฟีเจอร์ตกหล่น; รวมผ่าน reviewed PR; candidate ระบุ full SHA และไม่มี application files ค้างนอก commit |
| REL-02 แยก build กับ runtime | P0 / Release Engineer | REL-01 | isolated build output, guard included in commit; test build ไม่เปลี่ยน served hashes; atomic promote/rollback มี integration test; เลิก release แบบผสมไฟล์โดยไม่มี manifest |
| CI-01 ซ่อม local checks | P0 / Tooling + QA | REL-01 | root lint/typecheck ตรวจ source จริงและจบปกติ; แยก temp/generated/nested worktrees; triage root failures 10 ข้อเป็น defect/stale expectation พร้อมเหตุผล; root suite fail 0 และไม่ลด assertions เพื่อให้เขียว |
| CI-02 Node release CI | P0 / Release + Backend | CI-01, DB-01 | CI checkout SHA เดียว รัน frontend checks + Node type/unit/build + SQL integration แบบไม่ skip ด้วย application least-privilege role; เก็บ artifacts/results; .NET lane ไม่ถูกนับแทน Node |
| DB-01 Migration contract | P0 / Backend/Data | REL-01 | แก้ collision ของ 037_user_role_management ใน branch กับ 037_unified_report_exports ใน local tracking main โดยตรวจ applied target/checksums ก่อน; ห้ามแก้ migration ที่ apply แล้ว; จัด forward migration/เลขใหม่เฉพาะ unapplied ตาม baseline ที่ยืนยัน; duplicate-ID validator; fresh + upgrade + restricted grants ผ่าน; readiness ปฏิเสธ schema ที่ขาด overhead/roles/exports แม้ MAX(version) สูง |
| OPS-01 Node runbook | P0 / Release/Operations | REL-01, DB-01 | runbook ระบุ Node build/start/service identity/Entra/SQL/storage/upgrade/rollback; ทดลองบน staging ใหม่ได้ตามเอกสารโดยไม่ใช้ .NET steps โดยบังเอิญ |
| REL-04 ตรวจและแก้ Mac deploy path | P0 / Release + Security | REL-01, DB-01 | ยืนยันว่า target ใช้ upstream Mac workflow หรือไม่; หากใช้ ให้ production artifact/auth config แทน dev-compose, explicit migration/backup gate แทน startup DDL ที่ไม่มี release control, expected SHA/build/schema check หลัง deploy; หากไม่ใช้ให้บันทึก inactive target พร้อมหลักฐาน |

## Wave 1 — ความปลอดภัยและความถูกต้องข้ามโมดูล

| Task | Priority / Owner | Dependency | ผลส่งมอบและเกณฑ์ปิด |
| --- | --- | --- | --- |
| SEC-01 Identity/RBAC | P0 / Security + Backend | REL-01, CI-02 | Entra issuer/audience/scope, inactive/unmapped users, expiry, role changes และ direct IDs ต่าง project มี positive/negative tests; Production ปฏิเสธ Team Test; แยก account rights จาก employee assignments |
| SEC-02 Signing/file boundaries | P0 / Security + Backend | SEC-01 | ทวน signing code metadata scope, recent authentication policy, attachment permissions และ scan/quarantine gate; cross-user fixtures ไม่อ่าน bytes/metadata ที่ไม่อนุญาต; real signatures ไม่ถูกใช้ทดสอบ |
| COST-01 Cost authority | P0 / Backend + Cost owner | DB-01, CI-02 | independent totals ครอบคลุม rate authority, rounding, revision, overhead snapshot, import duplicate/stale writes และ handover; validate derived overhead rate, hours × rate และยอดรวมสุดท้ายไม่เกิน SQL decimal(19,4) พร้อม boundary tests และ forward migration โดยไม่แก้ 040 ที่อาจ apply แล้ว; Cost owner ยืนยัน budget/hours และไม่ double-count overhead ใน labor |
| COST-02 Workbook provenance | P0 / Backend + QA | DB-01, CI-02 | parse/validate uploaded XLSX บน server และ derive/reconcile parsed rows จาก stored bytes; malformed/renamed/mismatched workbooks ถูก reject; valid original bytes/hash และ canonical imported totals ตรง; ไม่รับ checksum ของ client เป็นหลักฐาน derivation |
| UX-01 Preserve workflow | P1 / Frontend + QA | CI-01, REC baseline ใน REL-01 | เก็บ screenshots baseline desktop/narrow; 9 Estimate tabs, queue, rate guidance และ permission-filtered menus คงอยู่; TH/EN/JP, keyboard/focus, errors และ draft persistence ผ่าน; ไม่มี redesign ทั้งระบบในงานนี้ |
| QA-BASE Fixtures/traceability | P0 / QA Lead | CI-02, SEC-01 | isolated staging + synthetic users/roles/records; ทุก action/transition จาก NAV/API/spec map ไป test ID; บันทึก missing implementation เป็น Gap และจัด scope decision อย่างเปิดเผย |

## Wave 2 — งานตรวจครบทุก flow

ทุก QA task ขึ้นกับ QA-BASE และ task เฉพาะที่ระบุ ต้องทดสอบ positive/negative, permission, stale concurrent update/retry, error recovery และ persisted result ตามที่ flow รองรับ ทุก task ส่ง expected/actual + candidate/environment + redacted evidence + retest result; “ไม่มี feature” ต้องบันทึก Gap ห้ามตีความเป็น Pass

| Task / Flow | Priority / Owner | เพิ่ม dependency | เกณฑ์ตรวจเฉพาะที่ต้องผ่าน |
| --- | --- | --- | --- |
| QA-01 / F01 | P0 / Security + QA | SEC-01 | login/restore/logout/expiry/disabled user; UI และ direct API ตรงสิทธิ์; ไม่ค้างข้อมูลผู้ใช้คนก่อน |
| QA-02 / F02 | P1 / Frontend + QA | QA-01 | inbox/badge/deep links/refresh/back ตรง source records และ scope; failures ไม่ทำ pending work หาย |
| QA-03 / F03 | P0 / Data + QA | QA-01 | customer/contact titles/roles/name rules, Admin role changes, rate access และ stale edit; regression 5 contact UI assertions ถูก triage และ retest |
| QA-04 / F04 | P1 / Sales + QA | QA-03 | OCR preview/cancel/correct/duplicate, TH/EN/JP contact fields; ไม่มี persistence ก่อน user confirms |
| QA-05 / F05 | P0 / Sales + QA | QA-03 | owner/team queue, attachments, status/assign, visit/estimate links; retry ไม่สร้างซ้ำและสิทธิ์ต้องตรง |
| QA-06 / F06 | P0 / Engineering + QA | QA-05 | request/assignment/confirmation/report/close + forbidden transitions; Inquiry linkage และ required evidence ครบ |
| QA-07 / F07 | P0 / Purchasing + QA | QA-03 | quotation/pricing/history currency/unit/quantity/date/provenance ตรง; invalid/stale price ไม่กลายเป็น valid cost โดยเงียบ |
| QA-08 / F08 | P0 / Cost owner + QA | COST-01, QA-05, QA-07 | independent totals, missing rate/policy, approval/rejection/revision immutability, concurrent saves; 9 tabs และ guidance ใช้งานได้ |
| QA-09 / F09 | P0 / Backend + QA | DB-01, QA-08, COST-02 | Excel original bytes/hash download scope และ server-derived rows; duplicate/stale/failed import cleanup; published template overwrite ถูกปฏิเสธและ draft-copy/apply ใช้งานได้ |
| QA-10 / F10 | P0 / Project owner + QA | QA-08, SEC-02 | approved estimate → project เก็บ cost/revision/overhead; Inquiry/Visit documents handover ครบ, ไม่ซ้ำและไม่ข้ามสิทธิ์ |
| QA-11 / F11 | P1 / Engineering + QA | QA-10 | assignment/ack/start/complete/review ตาม transitions จริง; resource availability, My Work/project timeline และ concurrent progress ตรงกัน |
| QA-12 / F12 | P0 / Purchasing + QA | QA-10 | BOM → PR → PO และ thresholds/segregation/approval chain; rejection/partial/cancel ที่รองรับไม่ทำ quantities/commitments เพี้ยน |
| QA-13 / F13 | P0 / Warehouse + QA | QA-12 | partial/duplicate receipts, damage/quarantine และ adjustment; usable/reserved/balance/ledger ตรง independent calculation |
| QA-14 / F14 | P0 / Warehouse + QA | QA-13 | reserve/issue/consume/return และ concurrent requests ไม่ทำ negative stock/duplicate ledger; actual project cost ตรง |
| QA-15 / F15 | P1 / Knowledge owner + QA | SEC-02 | draft/review/publish/archive/search/reuse; revision และ file visibility ตรง role; sales library links/preview เปิดได้ |
| QA-16 / F16 | P0 / Engineering + QA | QA-06, SEC-02 | ทุก report type, required fields, templates/version/archive, review/approve/revise, print locale; historical output/provenance คงเดิม |
| QA-17 / F17 | P0 / Security + QA | QA-16, SEC-02 | specimen/assignee/stamp, preview/sign/reject/revoke เท่าที่รองรับ; wrong actor, duplicate/replay, stale version, customer link scope; synthetic signatures เท่านั้น |
| QA-18 / F18 | P1 / Team lead + QA | QA-11 | daily/session/duty/exemption/reviewer scopes; timezone/date boundary, retries และ private reason; trial/active ไม่ปน |
| QA-19 / F19 | P1 / Management + QA | QA-18 | Engineering/Sales cycles, score/evidence/private scope, LOW-data Pulse และ historical snapshot; insight ไม่เปลี่ยนคะแนน |
| QA-20 / F20 | P0 / Support owner + QA | SEC-02 | reporter/staff/admin membership, internal notes/files, transitions, points 0–10; no self-award/duplicate retry และ deep link ตรง |
| QA-21 / F21 | P0 / Data + QA | QA-08, QA-14, QA-16, QA-20 | actor/time/entity audit ครบและ immutable; dashboards/counts/cost reconcile กับ SQL transactions และ record scope |

## Wave 3 — กู้คืนได้และปล่อยได้

| Task | Priority / Owner | Dependency | ผลส่งมอบและเกณฑ์ปิด |
| --- | --- | --- | --- |
| OPS-02 Recovery/monitoring/load | P0 / Operations + QA | OPS-01, CI-02 | เจ้าของระบบกำหนด concurrent users, latency/error budget, RPO/RTO; วัด load ตามเป้า; SQL + bytes restore ลง environment แยกแล้ว reconciliation ผ่าน; alert ถึงผู้รับผิดชอบ; rollback rehearsal ผ่าน |
| QA-22 / F22 Integration & Operations acceptance | P0 / Release + QA | OPS-01, OPS-02 | Entra/SQL/storage/email outage, readiness, restart/upgrade/rollback/restore และ alert delivery ผ่าน; ใช้เกณฑ์ QA-BASE และ evidence ไม่ skip |
| REL-03 Release decision | P0 / Release Lead + Business owner | ทุก P0 อื่น, disposition ของ P1 | Critical/High ปิดพร้อม retest; P0 ผ่านทั้งหมด; business UAT ลงชื่อ; full manifest/recovery evidence; ระบุ known risks และ accepted exclusions; จึงตัดสิน Go/No-Go |
| DOC-02 Documentation maintenance | P2 / Documentation owner | REL-03 | update feature/release evidence ทุก PR; archive historical snapshots; review stale claims; ลบ compatibility pointers ได้เมื่อพิสูจน์ว่าไม่มี consumers แล้ว |

## แบ่งทีมโดยไม่แย่งไฟล์กัน

- Integration Lead: candidate, conflict resolution, shared-file changes, migration numbering และรวม evidence
- Backend/Data: DB-01, COST-01, API fixes; Security เป็นผู้ตรวจอิสระ
- Frontend/UX: UX-01, contact/session/menu regressions; ประสานการแก้ ProductionApp/api-client/global CSS กับ Lead
- QA/Release: CI, fixture/UAT/recovery; business owners รับรอง expected results

ทำขนานได้เฉพาะ scope ที่ไม่ใช้ shared file/runtime เดียวกัน ใช้สูงสุด Lead + 3 lanes ต่อรอบ; reviewers ไม่แก้งานที่ตนรับรอง เลือก runtime ที่รองรับจริงและบันทึกการมอบหมายใน audit/session record

## การเชื่อมกับ audit เดิม

AUD-01/AUD-09 → CI-01 และ QA-13; AUD-02 → OPS-01; AUD-03 → CI-02; AUD-04/AUD-05/AUD-06 → SEC-02; AUD-07 → REL-01/REL-02/DB-01; AUD-08 → OPS-02/SEC-01. เก็บหลักฐานเก่าไว้ แต่ผลผ่านต้องมาจาก candidate ใหม่

## ข้อมูลที่ต้องเติมก่อน release execution

Production target/URL และ API host ที่เลือก, วัน Go-live, named owners, role test accounts, exact staging/database/storage aliases, required feature scope, RPO/RTO/load targets และ overhead inputs. ข้อมูลเหล่านี้ไม่ขวางการจัดเอกสาร แต่ห้ามเดาเมื่อต้อง deploy หรือใช้ข้อมูลจริง
