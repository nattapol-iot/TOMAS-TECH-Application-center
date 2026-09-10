# แผน Audit ทุก Flow — IoT Team Center

วันที่ 2026-09-07 | ผู้จัดทำ Codex Audit Lead | สถานะ: แผนก่อนเริ่มงานจริง

เอกสารนี้ขยายขอบเขตจาก `pre-production-audit.md` ให้ครอบคลุมทุก Flow ที่มีใน release candidate รวมหน้ารอง, API ที่ไม่มีเมนู, import/export, external links และ operational flows รอบจัดทำแผนนี้อ่าน source/docs เท่านั้น ไม่ได้รัน test, แก้ application, deploy หรือเปลี่ยนข้อมูลและบริการ

## 1. เป้าหมายและนิยามคำว่า “ครบทุก Flow”

ตรวจว่าผู้ใช้แต่ละบทบาททำงานตั้งแต่เริ่มจนจบได้ถูกต้อง ข้อมูลคงอยู่และเชื่อมข้ามโมดูลถูกต้อง เส้นทางที่ไม่อนุญาตถูกปฏิเสธ และระบบรับมือการทำงานซ้ำ/พร้อมกัน/ล้มเหลวได้โดยไม่ทำข้อมูลเสีย

หน่วยตรวจคือ `Flow → actor → precondition → action → state transition → UI/API/DB/file/notification outcome` ไม่ใช่จำนวนเมนูหรือจำนวน test ที่ผ่าน

ก่อนเริ่ม execution ต้องเทียบทะเบียน Flow กับ (1) เมนูและทุก nested tab/dialog/action ใน `app/system/ProductionApp.tsx` และ screen components (2) API ที่ register จริงใน `backend-node/src/app.ts` รวม loop/dynamic routes (3) state/rules/service/DB constraints และ (4) เอกสารธุรกิจล่าสุด API ที่มีอยู่ไม่ได้พิสูจน์ว่า behavior ถูกต้อง; เอกสารที่ล้าสมัยไม่ได้กำหนด expected result โดยอัตโนมัติ

ทุก menu/action/endpoint/transition ต้องผูกกับ Flow ID หรือระบุ unsupported/deprecated/unreachable พร้อมหลักฐาน ถ้าขาด implementation ให้ลง Gap ไม่เงียบตัดออก ไม่ถือการทดสอบ happy path อย่างเดียวว่าครบ flow ไม่อ้างว่าครอบคลุมทุกค่าที่เป็นไปได้แบบ combinatorial; ครอบคลุมทุก documented transition และใช้ boundary/equivalence classes พร้อมเหตุผล

## 2. ขอบเขตทะเบียนเริ่มต้น

รายการต่อไปนี้เป็นกลุ่มงานสำหรับแตกเป็นกรณีทดสอบ ไม่ใช่คำรับรองว่า action ทุกอย่างในรายการ implement แล้ว สถานะ/approval policy/การ cancel หรือ reopen ต้องดึงจากระบบจริงและยืนยัน requirement ก่อนเขียน expected result

| กลุ่ม | Flow ที่ต้องแตกและตรวจครบ | จุดเชื่อม/ผลลัพธ์สำคัญ |
| --- | --- | --- |
| F01 Identity & Session | login/logout, Entra/Team Test separation, expired/revoked session, inactive/unmapped user, role combinations, permission change | Bootstrap, menu และ direct API สอดคล้องกัน; แยก employee assignment กับสิทธิ์ login |
| F02 Shell & Personal Workspace | Dashboard, Profile, My Work/inbox, notification list/read/deep link, navigation/refresh/back, preferences | จำนวน badge/summary ตรง source และ scope; ลิงก์เปิดรายการถูกตัว; stale session ไม่แสดงข้อมูลคนก่อน |
| F03 Master Data & Administration | customer/end-user/contact/title/TH-EN-JP names, suppliers, employees, inventory items, engineering rates, settings, roles/permissions, Visit Master | create/edit/activate/deactivate เท่าที่รองรับ, duplicate/reference constraints, historical references; employee ไม่ได้รับสิทธิ์เพิ่มโดยไม่ตั้งใจ |
| F04 Customer Intake & OCR | Sales intake, customer self-service, business-card scan/import, review OCR, choose/create customer/contact, correction/cancel/duplicate | ผล OCR ต้องยืนยันก่อนใช้; ชื่อหลายภาษาและ contact role ไม่สลับ; file lifecycle และ pending draft |
| F05 Inquiry | list/search/filter/detail, create/edit, qualification/probability/interest/status, attachments, assign, initiate/link visit/estimate | Customer/end-user/owner เชื่อมถูกต้อง; duplicate action ไม่สร้างงานซ้ำ; permissions และ audit |
| F06 Site Visit & My Assignments | request/schedule, assignment/confirmation, reschedule/cancel ตาม contract, check-in/out, checklist/findings/actions/attachments, report submit/review/acknowledge/close | ผู้เกี่ยวข้องเห็นงานตรงกัน; required evidence; เชื่อมกลับ Inquiry/Estimate และไม่สร้างซ้ำ |
| F07 Pricing & Supplier Evidence | Price Library, Supplier Quotation upload/download, Waiting Supplier Price, price selection/update, historical PR lookup/reuse | supplier/item/unit/currency/effective date ตาม model; quote provenance และต้นทุนหลังเลือกข้อมูล |
| F08 Estimate Cost | draft/header/customer/modules/material/labor/expense/supplier cost, assignment, validation, submit/approve/reject/request revision, copy/revision | คำนวณ internal engineering cost อย่างอิสระ; ไม่มี selling margin แฝง; revision immutability; stale save และสิทธิ์ decision |
| F09 Import & Reusable Modules | Estimate Excel preview/mapping/validation/commit/retry, Module Template create/edit/version/apply/archive เท่าที่รองรับ | malformed/large/duplicate inputs; mapping และ rounding; transaction; repeated template ไม่ชน IDs; source version |
| F10 Project Workspace | create from approved estimate, portfolio/detail/member scope, folders/documents, schedule tab, punchlist/issues | โครงการผูก estimate revision ถูกต้อง; project scope; cost/progress summaries; task/issue close rules |
| F11 Schedule, Timeline & Resources | schedule baseline/tasks/details/progress, day requests/answers, resource availability/allocation, task preview/assign/acknowledge/start/complete/review ตาม state จริง | ผู้รับผิดชอบ/ช่วงวัน/ภาระงานถูกต้อง; overlap และการตอบพร้อมกัน; My Work ↔ Timeline ↔ Project consistency |
| F12 Procurement & Approvals | procurement dashboard, BOM generation/edit/release, stock availability, PR create/submit/decide, PO read/create/update/close ตาม capability จริง, approval inbox | threshold/segregation; estimate/BOM versions; quantities/commitments; partial/cancel/reject branches ที่รองรับ |
| F13 Inventory & Receiving | balances/ledger/reorder, goods receipt partial/full/duplicate, damage/quarantine/release, stock adjustment request/approve/reject | usable/reserved/quarantine totals; cost valuation; no negative or duplicate transactions; adjustment audit |
| F14 Material Issue & Actual Cost | reservation/issue/consume/return/cancel ตาม contract, partial fulfillment และ concurrent requests | stock ledger ↔ project quantities/actual cost กระทบครบและครั้งเดียว; availability ภายใต้ concurrent actions |
| F15 Knowledge Hub | article/solution create/edit/revision/review/publish/archive ตาม state จริง, search/tree/filter, comments/collaboration, documents, category/admin, sales-material index/preview/update | visibility/published version, attachment rights, broken links, index freshness, archive และ reuse ในงานอื่น |
| F16 Reports & Templates | report types ทุกชนิดและ entry point, draft/content/images/template apply/save/version/archive, submit/review/approve/revise, analytics/print/export | field completeness ตามชนิด, source linkage, provenance, historical output, PDF/page layout และ report locale |
| F17 Signatures, Drawing & Customer Links | own specimen, company stamp permissions, drawing from design task, upload/placement/preview, submit/assign/sign/reject/revoke ตาม contract, signed library/download/verify, customer acknowledgment link | named actor/assignee/reauthentication, immutable bytes/evidence, code/token expiry/replay/scope, superseded content; ใช้ลายเซ็นทดสอบเท่านั้น |
| F18 Team Activity | daily reporting/session/duty/policy/exemption/evidence/reviewer scopes ตาม model, missed reporting และ retries | timezone/date boundary, duplicate session, private reasons, trial/active separation และ data provenance |
| F19 KPI & Growth | engineering/sales review types, cycle/criteria/evidence/score/adjust/review/complete ตาม state จริง, own/team summaries | independent score calculation, missing evidence, activity contribution, private evidence, historical cycles และ trial labeling |
| F20 Support Center | create from current module, queue/filter/detail, membership/category scope, assign/claim, public/internal comments, attachments, lifecycle transitions, recognition/adjustment, notifications | reporter/staff/admin visibility; points 0–10, no self-award/duplicate retry; internal data ไม่รั่ว; deep links |
| F21 Audit & Reconciliation | Audit Log/filter/detail, business history, dashboards/analytics/export, document numbers | ทุกสำคัญ mutation บันทึก actor/time/entity/outcome; audit immutable; count/total ตรง transaction source และ scope |
| F22 Integrations & Operations | SQL/NAS/email/Entra/OCR assets/PDF/HTTPS, readiness, install/config, fresh DB/upgrade, service restart, backup/restore, rollback, monitoring | dependency failure handling, least privilege, schema/artifact compatibility, delivery failures, recovery และ release evidence |

ทุกกลุ่มต้องตรวจ desktop และ viewport ที่ตกลงใช้จริง พร้อม TH/EN/JP; shared component ตรวจเชิงลึกครั้งเดียวได้แต่ต้องมี smoke ในทุก screen ที่ใช้งาน และ flow ที่ locale กระทบตัวเลข/วันที่/print ต้องมี localized functional cases

## 3. มิติทดสอบที่ใช้กับทุก Flow

| มิติ | กรณีขั้นต่ำ |
| --- | --- |
| เส้นทางปกติ | เริ่มจาก fixture ใหม่ ทำครบจนสถานะสุดท้าย เปิดอ่านซ้ำและตรวจ persisted result |
| ทางเลือก/สถานะ | approve/reject/revise/cancel/reassign/reopen/partial ตามที่รองรับ; ทุก transition ที่อนุญาตและทุก forbidden transition |
| Validation/boundaries | required/empty/whitespace, zero/negative/decimal/max/overflow, malformed dates/IDs/files, duplicate/reference/inactive records |
| Permissions | actor ที่มีสิทธิ์, ไม่มีสิทธิ์, owner/non-owner, same/different project/department, multi-role, disabled user, direct API/download |
| Concurrent/retry | double-click, identical retry, two-user stale update, simultaneous approval/reservation/issue, refresh หลัง timeout; exactly-once effect ใน flow ที่ต้องการ |
| Failure/recovery | network/server/SQL/file/email failure ก่อนและหลัง commit; no partial corruption/orphaned files, draft recovery และ actionable errors |
| Data integrity | UI ↔ API ↔ SQL/ledger/file hash; independent totals/scores; document numbering; relation and history preservation |
| Usability/accessibility | loading/empty/error states, search/filter/sort/pagination, keyboard/focus/modal/labels, unsaved navigation, overflow/print |
| Observability | audit trail, notifications/recipient/deep link, log redaction และ error correlation โดยไม่เปิดเผย secret |

กรณีที่ไม่เกี่ยวข้องลง N/A พร้อมเหตุผล ตัวอย่าง read-only list ไม่ต้องสร้าง approval case ขณะที่ทุก critical write ต้องมี unauthorized/state/concurrency/failure checks ที่เกี่ยวข้อง

## 4. เส้นทาง End-to-End ข้ามโมดูล

1. Customer/OCR → Inquiry → Site Visit → approved visit report → Estimate → approval/revision → Project โดยเทียบ entity IDs และเวอร์ชันตลอดสาย
2. Quote/Price Library/Historical PR/Module Template/Excel → Estimate totals → BOM → PR → PO → partial receipt → quarantine → issue/consume/return → project actual cost; แตก branch ที่ระบบรองรับ
3. Project → Resource Plan → assignment/inbox → acknowledgment → schedule/progress/day request → task completion/review → Timeline/My Work → Activity/KPI evidence
4. Design task → drawing/document → request signing → sequential/parallel approvers ตาม model → stamped/signed output → verify/download; ตรวจ revision และ invalidated requests
5. Task/Site Visit/Project → report template → draft/evidence → review/approve → customer link → acknowledgment → historical read/print → revision
6. Knowledge content → review/publish → search/reuse/download → new revision/archive → verify references; sales-material update กับ index/preview
7. Issue จากทุกโมดูล → Support → category/assignee → internal/public discussion → resolution/recognition → notification/profile contribution
8. เปลี่ยน member/role/deactivate → ตรวจ My Work/Projects/Reports/Files/KPI/Support ใหม่ → audit history; permission change ไม่ทำ ownership/history เสีย
9. Backup SQL+files → failure/restart/restore → replay selected critical reads/writes → reconcile → rollback rehearsal บน isolated environment

## 5. ทีมและวิธีแบ่งงาน

คง 4 คนทำงานพร้อมกันสูงสุด: Lead + ผู้ตรวจ 3 คน หน้าที่เป็น workstreams; เรียกทำงานเป็นรอบ ไม่เปิดทุก module เป็น agent แยก

| ผู้รับผิดชอบ | หน้าที่ในรอบเต็ม |
| --- | --- |
| Lead / Integration | ดูทะเบียนครบถ้วน, candidate/environment, expected-result disagreements, cross-module reconciliation, runtime/test queue และรายงาน |
| Functional Flow Auditor | แตก/เดินทุก lifecycle ใน F02–F20 พร้อม browser evidence และ negative branches; วาง fixture ร่วมกับ Lead |
| Security & Data Auditor | role/record isolation ทุกกลุ่ม, business invariants, concurrency, signing/files และ audit integrity; ทวน findings ของ Functional |
| Release & Reliability Auditor | Node integration/CI, dependencies, performance/recovery, deployment/runbooks; ช่วย coverage mapping/test harness และทวน environment evidence |

แยก reviewer กับผู้แก้ของประเด็นเดียวกันเท่าที่ทำได้ หลังอนุมัติเริ่ม audit จึงจัด bounded tasks ตาม wave; implementation fixes เป็นขั้นงานแยก ไม่แก้ test ให้เขียวเพื่อปิด finding โดยไม่ตรวจ expected behavior

เครื่องมี RAM จำกัด: lint/typecheck/build/test/load และคำสั่งหนักทีละงาน; ไม่มี watch หรือ worktree ใหม่; ไม่ชน shared service slots; หนึ่ง writer ต่อไฟล์พร้อม claim ใน COORDINATION ก่อนแก้ ทดสอบ concurrent users ผ่าน harness ที่ควบคุม ไม่ต้องรัน build หลายชุด

## 6. ลำดับงานและจุดส่งมอบ

| Phase | งาน | เงื่อนไขจบ |
| --- | --- | --- |
| 0 — Scope & candidate | enumerate menus/tabs/actions/dynamic endpoints/transitions/jobs, resolve stale docs, fix candidate fingerprint, role matrix, test environment and fixtures | Flow register ที่ไม่มี unassigned entry; requirement ambiguity อยู่ใน decision list; candidate/schema ระบุแน่นอน |
| 1 — Cases & readiness | แตก case ทุก Flow/role/transition, map existing automated coverage, independent expected totals, fixture/reset plan, staging access/dependency readiness | ทุก Flow มี cases/owner/expected/evidence plan; critical blockers ของ test environment ถูกแยก |
| 2 — Module execution | auth/master ก่อน → intake/visit/pricing/estimate/templates → project/resource/procurement/stock → knowledge/report/signing/activity/KPI/support/admin; ใช้ actual dependency graph | ทุก case ถูก execute หรือมี blocked reason; UI/API/data evidence ผูก case และ candidate |
| 3 — Cross-module & adversarial | 9 E2E journeys, permissions, concurrent/retry, failure handling, all-language and browser matrix | ตรวจ reconciliation และ business invariants; ไม่มี missing branches ที่ไม่ถูกบันทึก |
| 4 — Production rehearsal | production-equivalent Entra/HTTPS/NAS/mail, representative workload, backup/restore/rollback, alerts | วัดผลเทียบ agreed SLO/RPO/RTO; recovered data และ artifacts reconcile; evidence เก็บครบ |
| 5 — Triage, remediation & retest | สรุป root cause/reproduction/impact/owner; เมื่ออนุมัติแก้จึงทำ fixes, regression และ impacted E2E | reviewer ยืนยัน closure บน candidate สุดท้าย; change impact ทุกครั้งมี retest |
| 6 — Acceptance | สรุป coverage, remaining risk, UAT business sign-off และ Go/No-Go | เจ้าของระบบตัดสินจากหลักฐานของ release เดียวกัน |

P0/P1 ใช้จัดลำดับก่อนหลัง ทุก Flow ยังคงอยู่ใน scope P0 ได้แก่สิทธิ์/ข้อมูลรั่ว/สูญหาย, เงินต้นทุน/สต็อก, approval/signature และ recovery; P1 ได้แก่ flow อื่นที่ทำงานประจำ; P2 ได้แก่ usability/presentation รายละเอียด ไม่ใช้ priority เพื่อตัด feature ออกจาก audit

ยังไม่กำหนดเวลาเสร็จหรือจำนวน case แบบเดา หลัง Phase 1 จึงประมาณจากจำนวน transitions × applicable dimensions, fixture/recovery setup, จำนวน role/browser และข้อจำกัด dependency แยก effort ตรวจออกจาก effort แก้บั๊ก ส่งผลเป็น wave ได้โดยไม่ต้องรอจบทั้งระบบ

## 7. ข้อมูลและสภาพแวดล้อมก่อนเริ่ม execution

- ต้องมี staging ที่ระบุชัดว่าใช้ข้อมูลสังเคราะห์ได้ รวม SQL database, file root, application URL, release/schema, isolated email sink และ test identities ผู้ใช้ลูกค้าจำลอง
- Dataset: อย่างน้อยสอง project/department ที่ไม่เกี่ยวกัน, owner/non-owner/approver/requester, active/inactive/multi-role, customer/end-user แตกต่างกัน, records ทุกสถานะ, empty/normal/boundary/large data และ cost/stock/score fixtures คำนวณแยกจาก implementation
- ใช้ค่าเริ่มต้นสำหรับแผน: Node เป็น API เป้าหมาย; .NET เก็บเป็น legacy reference จนยืนยัน deployment target อื่น; UI ตรวจ TH/EN/JP, desktop และ narrow viewport; browser/version จริงและจำนวนผู้ใช้ต้องยืนยันก่อน execution
- ต้องตกลง peak concurrency/data size, latency/error targets, availability และ RPO/RTO ก่อนตัดสิน performance/recovery pass; ไม่ตั้งตัวเลขโดยไม่มี business context
- ชุดทดสอบที่เขียนข้อมูล, load, simulated outages, migration และ restore ใช้ isolated targets พร้อม reset/cleanup ตรวจ path/database ก่อนทุก destructive operation; ไม่ส่งข้อความหรือสร้างลายเซ็นจริง
- เมื่อขาด dependency ให้สถานะ Blocked ไม่ใช้ mock result รับรอง integration จริง Secrets อยู่ในช่องทางที่เหมาะสม ไม่ลง report/fixtures/screenshots

## 8. หลักฐานและผลส่งมอบ

สร้างเมื่อเริ่ม execution ภายใต้ `docs/audit/` (รอบวางแผนยังไม่สร้างผลทดสอบเปล่าให้ดูเหมือนรันแล้ว):

| Artifact | ข้อมูล |
| --- | --- |
| Flow register | Flow ID, module/menu/tab/action, method/path หรือ job, actor, states, source/requirement refs, priority, owner, case IDs |
| Test case register | Case ID, Flow ID, candidate/environment, prerequisites/fixture, steps/input, expected result และ invariant, evidence needed |
| Execution/evidence index | Run ID, Case ID, actual, status, timestamp, tester, UI/API/SQL/file evidence ที่ redact, related defect |
| Defect register | severity, impact, exact repro, expected source, actual, affected flows, root cause เมื่อทราบ, owner, fix version, retest/closure |
| Coverage report | registered/executed/passed/failed/blocked/not-run/N/A แยก module/role/state/dimension และ E2E; ไม่รวม skip เป็น pass |
| Release decision | final artifact/schema hashes, test coverage, operations evidence, open risks, business acceptance และ Go/No-Go |

สถานะ case: Not run → Pass / Fail / Blocked; N/A ต้องมีเหตุผล ข้อค้นพบ static review, historical report และ reproduced defect ต้องแยกกันชัด ผล 39/41 ในเอกสารเดิมเป็น historical targeted baseline ไม่ใช่ execution ของแผนนี้

## 9. เกณฑ์จบ Audit และเกณฑ์ปล่อยระบบ

Audit ครบ scope เมื่อทะเบียนเทียบทุกหน้าจอ/action/API/transition แล้วไม่มีรายการตกหล่น ทุก applicable case มีผลและหลักฐานหรือระบุ Blocked ชัดเจน ถ้ายัง Blocked ให้สรุปว่าตรวจได้บางส่วน ห้ามเรียกผ่านทั้งระบบ

เสนอ Go เมื่อ:

1. ทุก applicable Flow และ required case รวม P1/P2 ถูกทดสอบบน final candidate; ไม่มี required case เป็น Not run/Blocked หรือ skipped integration ที่ถูกนับผ่าน
2. ไม่มี unresolved Critical/High; ทุก critical transition และ cross-module reconciliation ผ่าน; Medium/Low ที่เหลือมีผลกระทบ/ทางแก้ชั่วคราว/owner และผู้มีอำนาจยอมรับความเสี่ยงเป็นลายลักษณ์อักษร
3. Build/lint/typecheck/Node tests/SQL integration/UI journeys ผ่านตาม release checklist บนรุ่นเดียวกัน; stale tests ต้องแก้โดยตรวจ contract ไม่ลดข้อกำหนด
4. Production identity/security/file controls, workload targets, SQL+files restore, monitoring และ rollback มีหลักฐานจริงตาม environment เป้าหมาย
5. เจ้าของกระบวนการธุรกิจยอมรับผล UAT และเจ้าของระบบตัดสิน go-live หากลด scope ต้องบันทึก exclusion และปรับคำกล่าวอ้าง coverage ให้ตรง

## 10. จุดหยุดของรอบนี้

ส่งแผนให้ผู้ใช้พิจารณาก่อนเริ่ม Phase 0–6 ตามคำขอ “วางแผนก่อนเริ่มงานจริง” งานที่ทำในรอบนี้มีเพียง source inventory เพื่อวางแผนและเอกสาร ไม่เริ่ม audit execution/fixes/deployment จนผู้ใช้สั่งเริ่ม ข้อมูล environment/role/production targets ที่ยังขาดรวบรวมเป็น readiness checklist ข้างต้น ไม่ขัดขวางการส่งแผนนี้

— Codex Audit Lead, 2026-09-07
