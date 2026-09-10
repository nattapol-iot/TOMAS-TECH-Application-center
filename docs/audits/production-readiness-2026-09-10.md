# ผลตรวจ Application ก่อน Production — 10 กันยายน 2026

Status: **REQUEST CHANGES — ยังไม่เสนอ Go-live**
Architectural status: **BLOCK**
Scope: current dirty worktree + local Git history/tracking refs + first-party documentation. ไม่ได้ตรวจยืนยัน live Production หรือทำ full browser/SQL UAT ในรอบนี้

## ข้อสรุป

ปัญหาไม่ได้อยู่ที่การเรียง Markdown อย่างเดียว: มีหลาย candidate/เส้นทาง deploy, migration หมายเลขซ้ำข้าม branch และ release evidence ไม่ผูก frontend/API/schema เป็นชุดเดียวกัน จึงมีความเสี่ยงที่ฟีเจอร์ซึ่งเคยปล่อยแยกจะหายเมื่อ deploy จากอีก branch เอกสารและระบบตรวจสอบยังสะท้อน baseline คนละชุด

ยังไม่สรุปว่าฟีเจอร์ของผู้ใช้ถูกทับบน Production ครั้งใด เพราะไม่มี URL/เวลา/served artifact และ database evidence ของเหตุการณ์นั้น วิธีพิสูจน์อยู่ใน [Release control](../operations/RELEASE_CONTROL.md)

## Candidate และหลักฐานที่ใช้

- Current HEAD: `aef445fd40910b49e4d2387323aed2b67ac0ef7f`, branch `feature/non-login-updates-20260907`
- ก่อนแก้เอกสารมี tracked modifications 26 ไฟล์รวม DESIGN.md พร้อม untracked app/backend/tests/migration และ temp artifacts; จึงไม่ใช่ผลตรวจ commit ล้วน
- เปรียบเทียบ local remote-tracking ref `IoT-Team-Center/main` ที่ `d43eb346d3706e78e65a92031427b4b1e1e4954f`: current HEAD มี 7 commits เฉพาะฝั่งนี้ และ main มี 125 commits เฉพาะฝั่งนั้น (`git rev-list --left-right --count HEAD...IoT-Team-Center/main`)
- ชื่อ ref นี้เป็นหลักฐานใน Git ที่มีอยู่ในเครื่อง ไม่ใช่การรับรองว่าเป็น remote ล่าสุดหรือ production deploy ล่าสุด `origin/main` เป็นอีก remote ต้องเลือก source of release ให้ชัด
- Source references ที่ขึ้นต้น `main@d43eb346:` ด้านล่างหมายถึงไฟล์จาก ref นี้ ใช้ `git show IoT-Team-Center/main:<path>` อ่านได้ ไม่ใช่ไฟล์ที่มีใน working tree ทุกไฟล์

## Findings และงานแก้

| ID / Severity | หลักฐาน | ผลกระทบ / วิธีแก้ | Task |
| --- | --- | --- | --- |
| AR-01 / CRITICAL | `database/migrations/037_user_role_management.sql:6,41`; `main@d43eb346:database/migrations/037_unified_report_exports.sql:5,28`; `main@d43eb346:backend-node/src/migrate.ts:63–90` | migration 037 หมายถึงคนละงาน แต่การตรวจ applied ใช้เลข version; merge อาจข้าม schema/permission โดยเงียบ ต้องตรวจ applied target/name/checksum และออก safe forward migration; ห้ามเปลี่ยน migration ที่ apply แล้ว; เพิ่ม duplicate-ID validation | DB-01 |
| AR-02 / HIGH | `main@d43eb346:.github/workflows/deploy.yml:11–15,31–40`; `main@d43eb346:scripts/macos/deploy.sh:48–52`; Git divergence ข้างต้น | deploy checkout main แล้ว rsync --delete มีสิทธิ์แทนที่ manual feature release ที่ไม่อยู่ใน candidate; freeze/reconcile features และใช้ immutable artifacts พร้อม SHA verification ไม่ใช่ copy feature files ตามลำพัง | REL-01, REL-02 |
| AR-03 / HIGH | `main@d43eb346:docker-compose.dev.yml:10–12,56–78`; deploy workflow เรียก `scripts/macos/deploy.sh` | production-labelled path ใช้ development compose/source mount/npm run dev และ default Development auth configuration; actual env ยังไม่ยืนยัน ต้องตรวจ target แล้วเปลี่ยนเป็น production runtime/config ที่ fail closed | REL-04, SEC-01 |
| AR-04 / HIGH | `main@d43eb346:backend-node/src/server.ts:19–26`; `main@d43eb346:backend-node/src/migrate.ts:100–118` | startup apply pending DDL ก่อน listen แต่ไม่มีหลักฐาน backup/schema approval gate ในเส้นทาง deploy นี้; แยก migration release gate พร้อม tested upgrade/recovery | REL-04, DB-01, OPS-02 |
| AR-05 / HIGH | `scripts/Start-TeamTestHost.ps1:40–46,101–124`; `scripts/Start-TeamTestLanFrontend.ps1:27–30,63–87`; `scripts/TeamTestLanFrontendProcess.ps1:44–50` | API เลือก ReleasePath แต่ frontend สร้างจาก caller worktree และ health ใช้ HTTP 200; คนละ worktree อาจให้ code/API คนละรุ่น ต้อง bind artifacts และ expected build ID เดียวกัน | REL-02 |
| AR-06 / HIGH | `backend-node/src/routes/health.ts:7,38–42`; `database/scripts/020_deploy_fresh_database.sql:102,107`; [small-team release](../releases/small-team-estimate-release.md) | current readiness ต้องการ 37 แต่ local overhead implementation ต้องการ 040; green health ไม่พิสูจน์ schema ครบ ต้องใช้ required migration set/checksums ที่ตรง release และ negative tests | DB-01 |
| AR-07 / HIGH | `.github/workflows/backend-integration.yml:63–64`; `tests/integration/full-material-flow.ps1:17,197,212`; `backend-node/README.md:3–12` | CI ใน checkout ตรวจ .NET wrapper แทน Node release API; ต้องเพิ่ม frontend/Node/SQL restricted-role integration ของ candidate เดียวกัน | CI-02 |
| AR-08 / HIGH | [README เดิม](../archive/README-before-2026-09-10.md); `docs/PRODUCTION_DEPLOYMENT.md` ส่วน Configure and publish the API; `docs/OPERATIONS_RUNBOOK.md` | docs อ้าง .NET/IIS/schema เก่า ขณะที่ source เป็น Node; รอบนี้แก้ entry point และติด historical status แล้ว แต่ executable Node runbook ยังต้องเขียนและซ้อม | OPS-01 |
| QA-OBS-01 / HIGH gate | [local check evidence](local-checks-2026-09-10.md); `tsconfig.json:22–31`; `eslint.config.mjs:11–19` | lint เข้า generated/nested checkout; typecheck fail 29 diagnostics ใน outputs/company-cutover; root tests fail 10 ข้อ ต้องแยก scope และ triage defect vs stale test ก่อนรับรอง release | CI-01 |
| CR-02 / HIGH | `backend-node/src/routes/estimate-excel-import.ts:47,78–92`; `backend-node/tests/estimate-original-integration.ts:27–31` | importer รับ parsed lines จาก client แต่ uploaded bytes ตรวจเพียงชื่อ/.xlsx; fixture ใช้ invalid workbook bytes และคาด 201 ทำให้ checksum ยืนยัน bytes ได้แต่ไม่ยืนยันว่าต้นทุนมาจาก workbook นั้น ต้อง parse/reconcile XLSX บน server และ reject malformed/mismatched content | COST-02, QA-09 |
| CR-03 / MEDIUM | `backend-node/src/routes/overhead-policies.ts:49–51`; `database/migrations/040_estimate_overhead_policy.sql:28`; `backend-node/src/overhead.ts:25–28` | accepted budget 999,999,999,999 / hours 0.0001 ให้ rate ประมาณ 9.999e15 เกิน decimal(19,4) ซึ่งรองรับส่วนจำนวนเต็ม 15 หลัก; ตรวจได้จาก declared bounds ยังไม่ได้ execute SQL overflow; validate derived rate ก่อน insert และทดสอบ boundary | COST-01 |
| CR-04 / MEDIUM | `app/system/production/CoreScreens.tsx:52`; `AdminAnalyticsScreens.tsx:8`; `tests/customer-contact-role-ui.test.mjs:43`; `customer-contact-titles-ui.test.mjs:34` | frontend import pure predicate จาก backend source ทำให้ harness 5 tests ปฏิเสธ dependency ใหม่; เป็น test/coupling regression ไม่ได้พิสูจน์ว่า customer form จริงเสีย ย้าย shared pure contract หรือรองรับ dependency อย่างตั้งใจใน harness แล้ว retest | CI-01, QA-03 |

Severity CRITICAL ของ AR-01 เป็นความเสี่ยงของ integration/deployment ที่ยืนยันจาก source ไม่ใช่คำกล่าวว่าข้อมูล Production สูญหายแล้ว

## สิ่งที่สนับสนุนอาการ “อัปเดตแล้วเหมือนโดนทับ”

1. **คนละ branch/artifact:** AR-02/AR-05 ทำให้ feature release และรอบ deploy ถัดไปอาจไม่ได้รวมโค้ดเดียวกัน
2. **schema ข้ามงาน:** AR-01 ทำให้เลข migration ดูถูกต้อง แต่ schema ของอีก feature อาจไม่ถูก apply
3. **serving stale code:** commit `3c8305a1` ในประวัติ upstream บันทึกการแก้ด้วย `--force-recreate`; comment ใน `main@d43eb346:scripts/macos/deploy.sh:62–68` อธิบายว่าก่อนหน้านั้น rsync เปลี่ยนไฟล์แต่ dev server ยังเสิร์ฟโค้ดเดิมได้ เป็น historical evidence ไม่ใช่การยืนยันว่าบั๊กเดิมยังอยู่ใน deployment ปัจจุบัน
4. **เอกสารปนสถานะ:** คำว่า implemented/released/Production Candidate ถูกใช้กับหลาย environment; ทะเบียนใหม่แยก state และ evidence เพื่อไม่ถือข้อความเก่าเป็น runtime truth

## Verification วันที่ 2026-09-10

| Check | Result | ข้อจำกัด |
| --- | --- | --- |
| Node typecheck | PASS | current backend-node source |
| Node unit | 110 pass / 0 fail / 0 skip | ไม่ได้พิสูจน์ SQL integration |
| Root tests | 222 total: 211 pass / 10 fail / 1 skip | SQL ถูก skip อย่างชัดเจน; ทดสอบหลังจัดเอกสารได้ผลเดิม exit 1 |
| Root lint | INCOMPLETE | หยุด audit lint หลังยืนยันว่าไล่ generated bundles ใน nested worktrees |
| Root typecheck | FAIL, 29 diagnostics | พบ dependencies/type drift ใน outputs/company-cutover; ไม่เหมารวมเป็น defects ใน active source |
| Production build / browser / SQL / restore | NOT RUN | ไม่เปลี่ยน dist ที่อาจให้บริการ, shared runtime หรือข้อมูลจริง |

Root failures ตาม code reviewer: contact role/title dependency harness 5 ข้อ, pre-existing production menu count 1 ข้อ, stale migration/schema count assertions 4 ข้อ ห้ามอ้างทั้ง 10 ว่าเป็น functional bugs ที่ reproduce แล้ว และต้องแก้ expectation โดยอ้าง release contract ไม่ใช่ลด assertions ดูชื่อและคำสั่งใน [local evidence](local-checks-2026-09-10.md)

## สิ่งที่แก้ในรอบนี้

- ย้าย topical documents 38 ไฟล์เข้าหมวด features/design/releases/audits/team; เก็บ compatibility pointers ที่ path เดิมและ [manifest พร้อม hash](../archive/document-map-2026-09-10.md)
- README ใหม่ชี้ Node/current audit; เก็บ README เดิม; historical deployment/runbook ติดสถานะชัด
- DESIGN.md คงข้อกำหนดและทุก required section แก้ข้อความที่ปน proposal กับ subsequent local implementation
- [Feature register](../planning/FEATURE_REGISTER.md) ครบ F01–F22 และ 6 recent feature groups; [backlog](../planning/PRODUCTION_BACKLOG.md) ระบุ owners/dependencies/acceptance และ release gate
- ไม่แก้ application implementation, ไม่ reset/stage/commit งานค้างของผู้ใช้, ไม่ apply migration/deploy/restart หรือทดสอบด้วยข้อมูลจริง

## Independent review และข้อจำกัด

ใช้ code-reviewer และ architect แยก lane แบบ read-only; leader เขียนเอกสารและรัน local verification. OMX Team/tmux ใช้ไม่ได้ใน session นี้ จึงไม่ได้สร้าง persistent Team, pane หรือ mailbox runtime

Code-review lane: **REQUEST CHANGES**, 48 files reviewed (44 implementation/test/deployment + 4 supporting spec/runtime), 4 findings: HIGH 2 / MEDIUM 2. Readiness finding ถูกรวมกับ AR-06; อีกสามข้อคือ CR-02–04. ไม่มีการรัน SQL ใหม่เพื่อยืนยัน fixture ของ workbook หรือ overflow ในรอบนี้; หลักฐานเป็น source/test contract inspection

Architecture lane: **BLOCK**, 56 unique repository paths รวม current/ref-specific versions; ตรวจ release boundaries, Git divergence, migration identity, runtime provenance และเอกสารขัดกันเป็นอิสระจาก code-review lane ไม่มี network fetch/external request; counts ของสอง lanes มีไฟล์ทับกันจึงไม่นำมาบวกเป็น unique total

รวมรายงานที่ deduplicate readiness แล้ว: **12 findings/gaps — CRITICAL 1 / HIGH 9 / MEDIUM 2 / LOW 0** (รวม QA verification gate หนึ่งข้อ). Findings table คือขอบเขตของจำนวนนี้ ไม่ใช่การนับทุกความเสี่ยงใน historical audits

Independent documentation review โดย architect พบและแก้: audit link ที่ยังไม่ได้สร้าง, build-guard scope ที่กว้างเกินจริง, missing candidate/evidence references, migration applied-safety, QA-22 dependency อยู่ผิด wave และการปน session history ใน durable plan. ตรวจ links/content preservation ใหม่หลังรวมผลก่อนส่งมอบ

Final recommendation: **REQUEST CHANGES**. การจัดเอกสารเสร็จไม่ได้หมายความว่า Application พร้อม merge/deploy; ต้องปิด blockers ตาม backlog และมีผลตรวจใหม่

บทบาท/ขอบเขตใน plan ไม่ใช่การส่งงานหรือข้อความถึงพนักงานจริง วันที่ Go-live, target environment และ named owners ยังต้องกำหนดก่อน execution ที่เกี่ยวกับ Production
