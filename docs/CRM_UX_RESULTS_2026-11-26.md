# CRM UX — ผลแก้และผลตรวจ (26 พ.ย. 2026)

ตอบรายงาน `docs/CRM_UX_DEV_HANDOFF_2026-11-26.md` (ฉบับใน main checkout) · ฐานโค้ด `8f8f2ab2` (main หลัง PR #259)

## สรุปสั้น

- ฟอร์ม/โมดัล CRM ทั้งหมดย้ายไปใช้ `@tomas-tc/ui` จริงใน `app/system/tomas-ui/CrmForms.tsx` (Dialog, ComboboxControl, Input, Textarea, Checkbox, OptionSelect, Collapsible, Table, DropdownMenu, UnsavedChangesDialog, Notice) ผ่าน `TomasUi` + portal เดิม และโหลดแบบ lazy จาก `CrmScreens.tsx` ไม่มี component เก่าอยู่ใน `.tui`
- รายการยาวทุกจุดใช้ picker เดียวกัน (`EntityPicker`) มีช่องค้นหาใน popup, ค้นทีละคำไม่สนลำดับ/ตัวพิมพ์/ช่องว่าง, สองบรรทัด (ชื่อ / รหัส · ERP · สาขา), keyboard, clear, loading, empty, error + ลองอีกครั้ง
- Backend: กิจกรรมค้นหา/กรองบน server พร้อมนับตามประเภทในขอบเขตเดียวกัน, ภาพรวมแยกงานเร่งด่วนจากข้อมูลไม่ครบ, ค้นลูกค้าด้วยชื่อ TH/EN/JP ชื่อย่อ รหัส รหัส ERP, bootstrap ส่ง `shortName`, รายละเอียดดีลส่งชื่อลูกค้า
- How-to: แก้ 4 บทสอน CRM เดิมทั้ง 3 ภาษา และเพิ่ม 2 บทสอนใหม่ (`crm-find-work`, `crm-find-activity`)
- ไม่มี migration · ไม่แตะ permission/rowVersion/deep link เดิม

## สถานะแต่ละข้อ

ลำดับความสำคัญตามรายงาน · หลักฐาน: **E2E** = คลิกจริงบน Edge headless กับ API จริง + SQL LocalDB แยก, **SQL** = `crm-sql-integration.ts` บน LocalDB schema ล่าสุด, **Unit** = test ใน repo

| ID | ผลตรวจรายงาน | ผลแก้ | หลักฐาน |
|---|---|---|---|
| CRM-01 สูง | ยืนยัน: CRM ใช้ SearchSelect/Modal เดิม | แก้: ฟอร์ม/โมดัล/picker/เมนูการทำงานของดีลเป็น kit จริง หน้า list/detail ยังเป็นโครงเดิม (ดูรายการค้าง) | Unit `crm-contact-field` · E2E |
| CRM-02 สูง | ยืนยัน (live + source): owner filter, site, references, ผู้ดูแลลูกค้าใน Customer 360 เป็น select ยาว | แก้: ทุกจุดเป็น EntityPicker; owner/customer filter เป็น picker island | E2E · Unit |
| CRM-03 สูง | ยืนยัน: กิจกรรมไม่มีค้นหา/ตัวกรอง | แก้: ค้นสรุป/ลูกค้า/ดีล, กรองลูกค้า ผู้บันทึก ประเภท ช่วงวันที่ (ตามวันทำการ Asia/Bangkok), ล้างตัวกรอง, page size | Unit backend · SQL · E2E |
| CRM-04 สูง | ยืนยันฝั่ง UI (ไม่ล้าง reference); backend ตรวจความสัมพันธ์อยู่แล้ว | แก้ UI: เปลี่ยนลูกค้าล้าง ดีล/ผู้ติดต่อ/Inquiry/Estimate/Project (ดีล) และ สถานที่/ผู้ติดต่อ (ฟอร์มดีล) พร้อมข้อความแจ้ง; เปลี่ยนดีลล้าง Inquiry/Estimate/Project | SQL: A→B ส่ง ID ของ A ได้ 422 ทั้ง 4 แบบ · E2E: POST หลังเปลี่ยนลูกค้าไม่มีดีลเดิม |
| CRM-05 สูง | ยืนยัน: board/ref/Customer 360 จำกัด 100 | แก้: board โหลดทีละ 100 + "แสดงเพิ่ม" + บอกจำนวน; ดีลในฟอร์มกิจกรรมค้นจาก server; Customer 360 แบ่งหน้าจาก server | SQL 130 ดีล 2 หน้าไม่ขาด · E2E board 100→134 |
| CRM-06 กลาง | ยืนยัน (source) | แก้: ระหว่างโหลดคงผลเดิม (จางลง) + ข้อความกำลังโหลด, empty แสดงเมื่อโหลดเสร็จเท่านั้น, error แยกข้อความ | Unit · E2E |
| CRM-07 กลาง | ยืนยัน | แก้: จำนวนตามประเภทกิจกรรมมาจาก server ขอบเขตเดียวกับตัวกรอง (ยกเว้นตัวประเภท); ลบสถิติ "ในหน้านี้" ของลูกค้า/ผู้ติดต่อ | Unit backend · SQL · E2E |
| CRM-08 สูง | ยืนยัน (live): 49/50 ขึ้นต้องดำเนินการ | แก้: "ต้องดำเนินการ" = เกิน/ครบกำหนด หรือควรติดตาม; แยก "ข้อมูลไม่ครบ" และ "รอผู้อื่น"; เพิ่ม "ครบกำหนดวันนี้", "ดีลของฉัน", เรียงตามกำหนด | SQL: 130 ดีลไม่มี next action = Incomplete ไม่ใช่ Actionable · E2E |
| CRM-09 กลาง | ยืนยัน | แก้: ปุ่มหลักหนึ่งปุ่มตามขั้น (ส่งประเมิน → บันทึกส่งใบเสนอราคา → ยืนยันสั่งซื้อ) ที่เหลือในเมนู "เพิ่มเติม" + บรรทัด "ขั้นตอนถัดไป"; Engineer ไม่เห็นขั้นแก้ไข | E2E (Admin, Engineer) |
| CRM-10 กลาง | ยืนยัน (live: Cancel ไม่เตือน) | แก้: dirty guard ทุกฟอร์ม (Cancel/X/Escape/คลิกนอก), error ระบุช่อง + focus ช่องแรก, 409 คงค่าที่พิมพ์ + ปุ่มโหลดข้อมูลล่าสุด, Save กันกดซ้ำ | E2E (409 จริง) · Unit |
| CRM-11 กลาง | ยืนยัน | แก้: ใช้ kit ComboboxControl (ช่องค้นหาแยกจากค่าที่เลือก, Escape ปิดเฉพาะรายการ, virtual list ไม่ตัด 50) | E2E |
| CRM-12 กลาง | ยืนยัน: ค้นได้แค่ชื่อแสดง+รหัส | แก้: ชื่อ TH/EN/JP ชื่อย่อ รหัส รหัส ERP ทั้งใน picker และ API ค้นลูกค้า/ดีล/กิจกรรม | Unit · SQL · E2E (อิชิดะ, ISD, イシダ, C000124) |
| CRM-13 กลาง | ยืนยัน | แก้: Timeline บอกลูกค้า (รหัส) และดีลเป็นลิงก์ | E2E |
| CRM-14 กลาง | ยืนยัน | แก้: แถบขั้น 6 ขั้นเปิด + ช่องผลลัพธ์ "ชนะ / แพ้" ท้ายสุด, พักไว้แสดงป้ายแยก | E2E |
| CRM-15 กลาง | ยืนยัน | แก้: แต่ละบรรทัดบอกว่าเป็นมูลค่าหรือวันปิด, "ยังไม่ระบุ", วันที่ตามภาษา | E2E |
| CRM-16 กลาง | ยืนยัน | แก้บางส่วน: funnel บอกฐานเปอร์เซ็นต์ "จากโอกาสขายทั้งหมด N" ; ไม่ได้เพิ่มช่วงเวลา (ต้องนิยามวันอ้างอิงกับเจ้าของงาน) | E2E |
| CRM-17 | ยืนยัน (live) | แก้: สถานะใน links แปลภาษา, ประวัติใช้วันเวลาท้องถิ่น + รายการฟิลด์ที่เปลี่ยน, JSON ดิบอยู่ใต้ "ข้อมูลทางเทคนิค" | E2E |
| CRM-18 | ยืนยัน (live) | แก้: empty state ตามบริบท (ไม่มีกิจกรรมของดีลนี้ / ยังไม่มีเอกสาร ฯลฯ) และ action ตามสิทธิ์ | E2E |
| CRM-19 | ยืนยัน (live) | แก้: hint "กรอกชื่ออย่างน้อยหนึ่งภาษา" + error ชี้ช่องและ focus | E2E |

## Checklist ปุ่ม/โมดัล (ผลจริง)

| พื้นที่ | รายการ | ผล |
|---|---|---|
| Dashboard | ชิปเร่งด่วน/ไม่เร่งด่วน กรอง+เรียงตามกำหนด, ดีลของฉัน, ไม่มีคีย์ดิบ | PASS (E2E) |
| Create opportunity | เปิดใน portal, focus เข้า dialog, Save ว่าง → error 2 ช่อง + focus + ไม่ส่ง | PASS |
| Customer picker | ค้นไทย/ชื่อย่อ/ERP/ญี่ปุ่น, Escape ปิดเฉพาะรายการ, Enter เลือกไม่ submit, กว้างเท่าช่อง (1440/390) | PASS |
| Contact picker / quick add | แสดงผู้ติดต่อของลูกค้า, Enter เลือกคน, ลิงก์เพิ่มผู้ติดต่อใหม่ | PASS (พบ/แก้บั๊ก: แถว "เพิ่ม" บนสุดถูกเลือกด้วย Enter → ย้ายเป็นลิงก์) |
| เปลี่ยนลูกค้า | ล้างผู้ติดต่อ + ข้อความแจ้ง | PASS |
| Cancel ฟอร์มที่แก้แล้ว | ถาม "ทิ้งการเปลี่ยนแปลง/แก้ไขต่อ", แก้ไขต่อคงค่า | PASS |
| Save | POST 201 ครั้งเดียว เปิดดีลใหม่ | PASS |
| Deal detail | ปุ่มหลักตามขั้น, เมนูเพิ่มเติม, ขั้นตอนถัดไป, rail | PASS |
| Proposal | date+ref required, Escape (ไม่แก้) ปิดทันที, Save → PUT 200 เลื่อนขั้น | PASS |
| Edit 409 | dialog คงค่า, ข้อความ + ปิดและโหลดล่าสุด | PASS |
| History / Links | เวลาท้องถิ่น, ฟิลด์ที่เปลี่ยน, empty state | PASS |
| Board | 100 จาก 134 + แสดงเพิ่ม → 134 | PASS |
| Activities | ค้นหา, ชิปประเภท, ล้างตัวกรอง, ลิงก์ลูกค้า | PASS |
| Activity dialog | ค้นดีลจาก server, เปลี่ยนลูกค้าล้างดีล, POST 201 | PASS |
| Contact form | กฎชื่ออย่างน้อยหนึ่งภาษา + focus | PASS |
| Delete contact | ผู้ติดต่อหลักถูกล็อก (ปุ่มปิด+เหตุผล), ลบรายอื่น DELETE 200 | PASS |
| Documents (Customer 360) | empty state, upload POST 201 แสดงไฟล์ | PASS |
| Configuration | dialog เดียว drill-in แก้ตัวเลือก, Escape กลับรายการ | PASS |
| Roles | Engineer ไม่มีแก้ไข/ส่งใบเสนอราคา/สั่งซื้อ; Sales ทำได้; Admin ทั้งหมด | PASS (E2E + SQL 403) |
| มือถือ 390 | เนื้อหา CRM ไม่ล้น, dialog พอดีจอและเลื่อนได้, รายการลูกค้าอยู่ในจอ | PASS |
| EN / JP | ไม่มีคีย์ดิบใน dashboard และฟอร์ม (รวม error) | PASS |
| Convert → Inquiry | สร้างครั้งเดียว + carry-over | PASS ระดับ SQL integration (เดิม); NOT TESTED ผ่าน UI |
| Won (ยืนยันสั่งซื้อ) | — | NOT TESTED ผ่าน UI (dialog เดียวกับ Proposal); SQL integration ผ่าน |
| Follow-up เพิ่ม/แก้ไข/Done | หัวข้อ "แก้ไขสิ่งที่ต้องทำ" | NOT TESTED ผ่าน UI; SQL integration ผ่าน |
| Customer edit / Site add-edit | — | NOT TESTED ผ่าน UI; SQL integration ผ่าน |
| Board drag/drop | — | NOT TESTED (ไม่ได้แก้ตรรกะ) |
| Download เอกสาร / ERP tools / CustomerModal (สร้างลูกค้า) / ProjectHandover | — | NOT TESTED (ไม่ได้แก้; CustomerModal และ ProjectHandover ยังเป็น component เดิม) |
| Keyboard ล้วน: Tab ผ่านทุกช่อง, screen reader จริง | — | NOT TESTED ด้วย screen reader; ใช้ kit (Radix/cmdk) + aria-invalid/aria-describedby แต่ไม่ถือว่าผ่าน accessibility อัตโนมัติ |
| 768 / 1920 | — | NOT TESTED (ตรวจ 390 และ 1440) |

## รายการค้างและเหตุผล

1. หน้า list/detail ยังเป็นโครง app เดิม (Panel/Records/DealTable) — รอบนี้ย้ายฟอร์ม picker dialog และเมนูการทำงานก่อนตามลำดับในรายงาน
2. Dashboard ยังไม่มีตัวเลือกช่วงเวลา (CRM-16) — ต้องให้เจ้าของงานกำหนดวันอ้างอิง (สร้าง/ปิด/อัปเดต)
3. แถบด้านบนของแอป (topbar) ล้นแนวนอนที่ 390px ทุกหน้า (รวม "งานของฉัน") — ปัญหาเดิมของ shell ไม่อยู่ในขอบเขต CRM
4. `backend-node/tests/crm-sql-integration.ts`: ส่วน CRM และชุดตรวจใหม่ผ่านบน LocalDB ที่ deploy schema เต็ม (`database/scripts/020_deploy_fresh_database.sql`) แต่ส่วน Projects ท้ายไฟล์ล้มที่ plan health ("At Risk" vs "On Track", ขึ้นกับวันที่) เป็นของเดิม; `scripts/Test-CrmLocalDb.ps1` ยัง deploy ถึง migration 067 เท่านั้น ต้องปรับให้ใช้ schema เต็มก่อนใช้
5. ทดสอบบน LocalDB แยกเฉพาะ ไม่ได้ทดสอบบน staging/production ด้วยบัญชีจริง (TMT ID) และไม่ได้สร้าง/แก้ข้อมูล production

## วิธีทดสอบซ้ำ

- Unit: `bun test ./tests/crm-contact-field.test.mjs ./tests/crm-i18n.test.mjs ./tests/guides.test.mjs` และ `cd backend-node && bun test tests/crm.test.ts`
- SQL: สร้าง LocalDB ชื่อ `IoTCrmCI_<16 hex>` deploy `020_deploy_fresh_database.sql` ตั้ง `CRM_TEST_SERVER`/`CRM_TEST_DATABASE` แล้ว `bun backend-node/tests/crm-sql-integration.ts`

## รอบที่ 2: หน้ารายการและรายละเอียดบน @tomas-tc/ui

เจ้าของงานเลือก (26 พ.ย. 2026): หน้า CRM ใช้ kit สำหรับทุกคน และถอดหน้า CRM ออกจากปุ่ม V1/V2 ของกลุ่มงานขาย (หน้า RFQ, Site Visit, งานที่ได้รับมอบหมาย, Visit master และ Customers ยังสลับได้ตามเดิม)

- `app/system/tomas-ui/CrmPages.tsx`: หัวหน้าจอ, แถบสรุปตามขั้น, ชิป "ดีลของฉัน / ต้องดำเนินการ", ชิปเร่งด่วน/ไม่เร่งด่วน, funnel, ตัวกรอง, ตารางดีล, board (โหลดเพิ่ม + ลากการ์ด), หน้าดีล (ปุ่มหลัก + เมนูเพิ่มเติม, ขั้นตอนถัดไป, แถบขั้น, แท็บ, ประวัติเป็นชื่อแทนรหัส)
- `app/system/tomas-ui/CrmPeoplePages.tsx`: ลูกค้า, Customer 360 (9 แท็บ), ผู้ติดต่อ, กิจกรรม, เอกสาร
- `app/system/tomas-ui/CrmKitParts.tsx`: ตารางที่มีสถานะ loading / failed / empty และ paging, summary bar, chips, section
- `CrmScreens.tsx` เหลือ permission gate + My Work; `crm.css` เหลือเฉพาะ markup เดิมที่ยังใช้
- ProjectHandover, ErpMasterPanel และ CustomerModal (component เดิม) วางคั่นระหว่างเกาะ kit ไม่อยู่ใน `.tui`
- How-to: บทสอน `sales-look-v2` ย้ายไปหน้า RFQ (3 ภาษา); `crm-find-work` เพิ่มขั้นแถบสรุปตามขั้น

### ผลตรวจรอบที่ 2 (E2E บน LocalDB แยก + API จริง)

| รายการ | ผล |
|---|---|
| Dashboard: summary bar / ชิป / toolbar / ตาราง อยู่ใน `.tui`, ไม่มีปุ่ม V1/V2, ไม่มีคีย์ดิบ | PASS |
| กดช่องขั้น "ประมาณราคา" กรองตารางและค้างสถานะกด; ชิป "ข้อมูลไม่ครบ" กรอง | PASS |
| Board 100 จาก 132 + แสดงเพิ่มครบ; ลากการ์ด NEW → REQUIREMENT ส่ง PUT ครั้งเดียวพร้อม rowVersion | PASS |
| หน้าดีล: ปุ่มหลัก + เพิ่มเติม, แถบขั้นจบด้วยผลลัพธ์, ลิงก์ลูกค้า, 6 แท็บเปิดได้พร้อมเนื้อหา | PASS |
| แก้ดีล → PUT 200 → ประวัติ "คู่แข่ง: — → Keyence", "วันที่คาดว่าจะปิดงาน: — → 24 ธ.ค. 2569" (พบ/แก้: ตอนสร้างเคยแสดงรหัสดิบ) | PASS |
| บันทึกส่งใบเสนอราคา → ขั้นเลื่อน, ปุ่มหลักเป็นยืนยันสั่งซื้อ; 409 คงค่าที่พิมพ์ + โหลดล่าสุด | PASS |
| Follow-up POST 201, หัวข้อ "แก้ไขสิ่งที่ต้องทำ"; กิจกรรมจากแท็บดีล POST 201 ผูกดีล | PASS |
| Customer 360: แท็บ ผู้ติดต่อ/กิจกรรม/โอกาสขาย/เอกสาร, แก้ลูกค้า (ค้นผู้ดูแล) PUT 200, เพิ่มสถานที่ POST 201 | PASS |
| ลูกค้า: ค้น "isd" เจอ Ishida (Thailand) พร้อมรหัสและ ERP | PASS |
| ผู้ติดต่อ: ผู้ติดต่อหลักลบไม่ได้ (ปุ่มปิด + เหตุผล), ลบรายอื่น DELETE 200 | PASS |
| กิจกรรม: ชิปประเภท, ค้น "panel" เจอ 1 พร้อมลิงก์ลูกค้า | PASS |
| สร้างดีลจากหน้ารายการ: ค้นลูกค้าภาษาไทย + Enter บันทึกครั้งเดียว เปิดดีลใหม่ | PASS |
| Keyboard: โฟกัสชื่อดีลแล้ว Enter เปิดดีล | PASS |
| Engineer: ไม่มีปุ่มแก้ไข/ใบเสนอราคา/สั่งซื้อ และไม่มีปุ่มสร้างดีล | PASS |
| มือถือ 390: dashboard, กิจกรรม, ลูกค้า ไม่ล้น (ตารางเลื่อนในกรอบของตัวเอง) | PASS |
| EN / JP: ไม่มีคีย์ดิบ | PASS |
| Screen reader จริง, 768/1920px, staging/production ด้วยบัญชีจริง | NOT TESTED |

## รอบที่ 3: ช่วงเวลาของ Dashboard นับจากวันที่คาดว่าจะปิดงาน (CRM-16)

เจ้าของงานกำหนดวันอ้างอิง: วันที่คาดว่าจะปิดงาน (`expected_close`)

- API: `GET /api/v1/crm/dashboard` และ `GET /api/v1/crm/opportunities` รับ `closeFrom` / `closeTo` (YYYY-MM-DD, เปิดปลายได้, from > to = 400) ตัวเลขทุกตัว (ขั้น, ชิป, funnel) และรายการดีลใช้ช่วงเดียวกัน ดีลที่ยังไม่ระบุวันปิดไม่ถูกนับเมื่อเลือกช่วง และ dashboard ส่ง `undated` บอกจำนวนไว้
- หน้าจอ: ตัวเลือก "ทุกช่วง / เดือนนี้ / ไตรมาสนี้ / ปีนี้" (ตามวันทำการ Asia/Bangkok) หรือกรอกวันที่เอง อยู่บนสุดของ Dashboard, รายการ และ board; บรรทัดใต้บอกช่วงที่นับและจำนวนดีลที่ไม่ระบุวันปิด; อยู่บนลิงก์หน้าจอ (`closeFrom`, `closeTo`); "ล้างตัวกรอง" ล้างช่วงด้วย
- How-to: `crm-find-work` เพิ่มขั้น "เลือกช่วงวันที่คาดว่าจะปิดงาน" 3 ภาษา

| ตรวจ | ผล |
|---|---|
| Unit: ช่วงผูกกับ query ทั้ง totals, funnel และรายการ; from > to = 400 | PASS |
| SQL (LocalDB): Q1 = 40 ดีล, ไม่ระบุวันปิดนับแยก, รายการ = dashboard, ปลายเปิด = 20, ทั้งปี = 60 | PASS |
| E2E: ทุกช่วง = 130; เดือนนี้ = 40 พร้อมข้อความ "ไม่รวม 70 ดีล" และพารามิเตอร์บนลิงก์; ตารางตรงกับตัวเลข | PASS |
| E2E: กรอกวันเองไม่มีดีล → ไม่มี preset ถูกเลือก, 0, ข้อความ "ไม่พบข้อมูลที่ตรงกัน" + ล้างตัวกรอง (พบ/แก้: เดิมขึ้น "ยังไม่มีโอกาสขาย") | PASS |
| E2E: ลิงก์ที่มี closeFrom/closeTo เปิด board ตามช่วง; EN/JP แปลครบ; มือถือ 390 ไม่ล้น | PASS |
