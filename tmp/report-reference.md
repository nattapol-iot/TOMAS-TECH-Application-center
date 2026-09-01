# Original report workbook reference
Read-only extraction. Workbook filled values are example data, not defaults for new reports.

## Service_Report_Rev00.xlsx
Sheets: README, Doc_Control, Service_Report_Ex, Service_Report, DAILY REPORT, Rev11, SC10, SC15, SC20, SC30, DS, graph sheet, Lists

### Service_Report
Print area: 'Service_Report'!$B$2:$M$47
- B2: SERVICE REPORT / ใบรายงานการให้บริการ
- B4: Use this report to document installation, modification, support, verification, and issue resolution for hardware and software work. | J4: Doc Code: TT-FRM-SRV-001 | Revision: Rev.00
- B5: REPORT NO. / เลขที่รายงาน | D5: IOT-SRV-2603-001 | F5: REPORT DATE / วันที่ | H5: 11-Mar-2026 | J5: VISIT TYPE / ประเภทงาน | L5: Installation
- B6: CUSTOMER / ลูกค้า | D6: AH Brake (Thailand) Co., Ltd. | F6: PROJECT / SITE / โครงการ | H6: Shipping Dashboard Monitor | J6: ENVIRONMENT / สภาพแวดล้อม | L6: Production Line
- B7: CONTACT PERSON / ผู้ประสานงาน | D7: Mr. Tomoyuki Tani | F7: CONTACT / โทร / อีเมล | H7: 064-1801696 | J7: WORK MODE / รูปแบบงาน | L7: Normal
- B8: SERVICE TEAM / ทีมบริการ | D8: ME / EE / Software | F8: TICKET / CR NO. | H8: PJ260025 | J8: REPORT STATUS / สถานะ | L8: Closed
- B10: 1) SCOPE & OBJECTIVE / ขอบเขตและวัตถุประสงค์
- B11: REQUESTED BY / ผู้ร้องขอ | D11: Customer request | F11: START DATETIME / เริ่มงาน | H11: 11-Mar-2026 01:00 PM | J11: END DATETIME / สิ้นสุดงาน | L11: 11-Mar-2026 04:00 PM
- B12: WORK SUMMARY / สรุปงาน | D12: Installed new tower light (Patlite) and handheld mobile computer for monitoring at shipping line. Configured dashboard display path, verified signal tower response, and checked LAN routing to TV and signal tower.
- B14: 2) INSTALLATION / CHANGE DETAIL / รายละเอียดการติดตั้งหรือเปลี่ยนแปลง
- B15: HARDWARE INSTALLATION / CHANGE | H15: SOFTWARE INSTALLATION / CONFIGURATION
- B16: Item / อุปกรณ์ | C16: Model | D16: Serial / Asset | E16: Qty | F16: Action / งานที่ทำ | G16: Status | H16: Application / Module | I16: Version Before | J16: Version After | K16: Config / License Ref | L16: Action / งานที่ทำ | M16: Status
- B17: Tower Light | C17: Patlite | D17: - | E17: 1 | F17: Install | G17: Completed | H17: Shipping Dashboard | J17: v1.0 | K17: Display Path / IP | L17: Config / Verify | M17: Completed
- B18: Handheld Mobile Computer | D18: - | E18: 1 | F18: Install / Test | G18: Completed | H18: Signal Tower Status Logic | J18: v1.0 | K18: LAN to tower | L18: Debug / Verify | M18: Completed
- B19: Switching HUB | C19: Unprovided | D19: - | E19: 1 | F19: Pending Customer | G19: Pending
- B23: 3) ISSUE / IMPACT / RESOLUTION / ปัญหา ผลกระทบ และแนวทางแก้ไข
- B24: ISSUE / SYMPTOM / อาการปัญหา | D24: Customer requested installation support for new monitoring equipment and network connection to TV / signal tower.
- B25: IMPACT / ผลกระทบ | D25: No production stop; pending customer-supplied HUB and LAN cable set. | H25: ROOT CAUSE / สาเหตุ | J25: New point installation; some network materials not yet provided.
- B26: ACTION TAKEN / สิ่งที่ดำเนินการ | D26: Mounted TV and tower light, connected signal path, checked dashboard display, verified handheld monitoring, and informed customer of remaining required items.
- B27: DOWNTIME / เวลาที่กระทบ | D27: 0 | F27: BACKUP CHECKED | H27: N/A | J27: ROLLBACK NEEDED | L27: No
- B28: RESULT / IMAGE / แนบรูปภาพในการดำเนินการหรือผลการดำเนินงาน
- B29: 4) VALIDATION & FOLLOW-UP / การทดสอบ ผลลัพธ์ และงานค้าง
- B30: TEST PERFORMED / การทดสอบ | D30: Power-on test, dashboard display check, signal tower trigger test, handheld monitoring verification. | H30: TEST RESULT / ผลทดสอบ | J30: Pass
- B32: PENDING / NEXT STEP | D32: Customer to provide switching HUB and LAN cable 2 sets for TV and signal tower completion.
- B33: DELIVERABLES / FILES | D33: Service report, installation photo, connection sketch | H33: FOLLOW-UP OWNER | J33: Customer / Tomas Tech | L33: NEXT ACTION DATE
- B34: CUSTOMER ACCEPTANCE | D34: Accepted with Pending | H34: REVISION USED | J34: Rev.00 | L34: 12-Mar-2026
- B35: RESULT / IMAGE / แนบรูปภาพในการดำเนินการหรือผลการดำเนินงาน
- B36: 5) MATERIAL / REMARKS / รายการคงค้างและหมายเหตุ
- B37: REMAIN / PENDING ITEM | D37: - Switching HUB / - LAN Cable : 2 Set [TV & Signal Tower]
- B38: COMMENTS / REQUEST | D38: Please complete after customer provides remaining materials.
- B40: 6) ACKNOWLEDGEMENT / ลายเซ็นรับทราบ
- B41: SERVICE ENGINEER / ผู้ปฏิบัติงาน | H41: CUSTOMER REPRESENTATIVE / ผู้รับทราบ
- B42: NAME / ชื่อ | D42: Mr. Taweesak Suriyon | H42: NAME / ชื่อ | J42: Mr. Tomoyuki Tani
- B43: SIGNATURE / ลายเซ็น | H43: SIGNATURE / ลายเซ็น
- B44: DATE / วันที่ | D44: 11-Mar-2026 | H44: DATE / วันที่ | J44: 12-Mar-2026
- B46: Customer sign-off confirms that the work result has been communicated and acknowledged on the date above.

## UAT Report_Rev00.xlsx
Sheets: README_ISO, Doc_Control, UAT_Report, UAT List1, UAT List1 Summary, Evident #1, Evident #2, DAILY REPORT, Rev11, SC10, SC15, SC20, SC30, DS, graph sheet, Lists

### UAT_Report
Print area: 'UAT_Report'!$B$2:$M$51
- B2: UAT REPORT / ใบรายงานการให้บริการ
- B4: Use this report to document installation, modification, support, verification, and issue resolution for hardware and software work. | J4: Doc Code: TT-FRM-UAT-001 | Revision: Rev.00
- B5: REPORT NO. / เลขที่รายงาน | D5: IOT-UAT-2701-001 | F5: REPORT DATE / วันที่ | H5: 2026-07-02 00:00:00 | J5: VISIT TYPE / ประเภทงาน | L5: IoT System
- B6: CUSTOMER / ลูกค้า | D6: Thai Asahi Denso Co., Ltd. | F6: PROJECT / SITE / โครงการ | H6: IoT Monitoring System for TAD  | J6: ENVIRONMENT / สภาพแวดล้อม | L6: Production Line
- B7: CONTACT PERSON / ผู้ประสานงาน | D7: Mr. Charkkrit Buayen | F7: CONTACT / โทร / อีเมล | H7: 092-2874418 | J7: WORK MODE / รูปแบบงาน | L7: Urgent
- B8: UAT TEAM / ทีมบริการ | D8: SE | F8: TICKET / PROJECT NO. | H8: PJ260039 | J8: REPORT STATUS / สถานะ | L8: In Progress
- B10: 1) SCOPE & OBJECTIVE / ขอบเขตและวัตถุประสงค์
- B11: REQUESTED BY / ผู้ร้องขอ | D11: Mr. Charkkrit Buayen | F11: START DATETIME / เริ่มงาน | H11: 2026-07-01 08:30:00 | J11: END DATETIME / สิ้นสุดงาน | L11: -
- B12: WORK SUMMARY / สรุปงาน | D12: การยืนยันการใช้งานของระบบ IoT monitoring
- B14: 2) UAT LIST DETAIL / รายละเอียด
- B15: Page No. / หน้าที่ | C15: Page Name /ชื่อเอกสาร | G15: Comment / ความคิดเห็น | K15: YES / NO | L15: Customer Sing / รายเซ็นลูกค้า | M15: Date / วันที่
- B16: 1 | C16: สามารถ Monitoring แบบเรียลไทม์ ได้พร้อมกัน 42 ไลน์
- B17: 2
- B18: 3
- B19: 4
- B20: 5
- B21: 6
- B22: 7
- B23: 8
- B24: 9
- B25: 10
- B26: 11
- B27: 12
- B28: 13
- B32: 3) UAT SUMMARY / การทดสอบและส่งมอบระบบ
- B33: UAT DATE  /  วันที่ดำเนินการ | D33: Start Date | F33: Finish Date | H33: UAT SUMMARY RESULT  /  ผลการทดสอบ | J33: PARTIAL | L33: Remark
- B35: SUMMARY ISSUES FOUND / ปัญหาที่พบ  | D35: จำนวนปัญหาที่พบ | I35: CORRECTIVE ACTION / การแก้ไข | K35: จำนวนการแก้ไข
- B36: DELIVERABLES / FILES | H36: FOLLOW-UP OWNER | J36: MR.Chackkrit
- B37: CUSTOMER ACCEPTANCE | D37: Sign Customer | H37: REVISION USED
- B38: RESULT / IMAGE / แนบรูปภาพในการดำเนินการหรือผลการดำเนินงาน | D38: Follow up page Picture
- B39: 4) MATERIAL / REMARKS / รายการคงค้างและหมายเหตุ
- B40: REMAIN / PENDING ITEM
- B41: COMMENTS / REQUEST
- B43: 5) ACKNOWLEDGEMENT / ลายเซ็นรับทราบ
- B44: COMMISSIONED BY / ผู้ดำเนินการ | H44: CUSTOMER REPRESENTATIVE / ผู้รับทราบ
- B45: NAME / ชื่อ | H45: NAME / ชื่อ
- B46: POSITION / ตำแหน่ง | H46: POSITION / ตำแหน่ง
- B47: SIGNATURE / ลายเซ็น | H47: SIGNATURE / ลายเซ็น
- B48: DATE / วันที่ | H48: DATE / วันที่
- B50: Customer sign-off confirms that the work result has been communicated and acknowledged on the date above.

### UAT List1
Print area: 'UAT List1'!$B$2:$M$51
- B2: UAT REPORT / ใบรายงานการให้บริการ
- B4: Use this report to document installation, modification, support, verification, and issue resolution for hardware and software work. | J4: Doc Code: TT-FRM-UAT-001 | Revision: Rev.00
- B5: REPORT NO. / เลขที่รายงาน | D5: IOT-UAT-2701-001 | F5: REPORT DATE / วันที่ | H5: 2026-07-02 00:00:00 | J5: VISIT TYPE / ประเภทงาน | L5: Programing/Website
- B6: CUSTOMER / ลูกค้า | D6: Thai Asahi Denso Co., Ltd. | F6: PROJECT / SITE / โครงการ | H6: IoT Monitoring System for TAD  | J6: ENVIRONMENT / สภาพแวดล้อม | L6: Production Line
- B7: CONTACT PERSON / ผู้ประสานงาน | D7: Mr. Charkkrit Buayen | F7: CONTACT / โทร / อีเมล | H7: 092-2874418 | J7: WORK MODE / รูปแบบงาน | L7: Urgent
- B8: UAT TEAM / ทีมบริการ | D8: SE | F8: TICKET / PROJECT NO. | H8: PJ260039 | J8: REPORT STATUS / สถานะ | L8: In Progress
- B10: 1) SCOPE & OBJECTIVE / ขอบเขตและวัตถุประสงค์
- B11: REQUESTED BY / ผู้ร้องขอ | D11: Mr. Charkkrit Buayen | F11: START DATETIME / เริ่มงาน | H11: 2026-07-01 08:30:00 | J11: END DATETIME / สิ้นสุดงาน | L11: -
- B12: WORK SUMMARY / สรุปงาน | D12: สามารถ Monitoring แบบเรียลไทม์ ได้พร้อมกัน 42 ไลน์ / Able monitor 42 lines in real time simultaneously.
- B14: 2.1) UAT LIST DETAIL / รายละเอียด
- B15: Test Scenario / หัวข้อในการทดสอบ | C15: Test Step / ลำดับในการทดสอบ | H15: Test Result  | L15: Actual Result  /  ผลการทดสอบ | M15: Remark / หมายเหตุ
- H16: Input Test | J16: Output Test
- B17: การรับข้อมูลจาก Shopfloor และส่งไปยัง HMI Production line | C17: 1. รับข้อมูล Line Number, Work order, Item name , Item ID, Q'ty และ Start time  / จาก Shopfloor | H17: เช็คข้อมูลหน้า Shopfloor monitor ผ่าน Pagasus website  | L17: PASS
- C19: 2. HMI Production Line แสดงค่า Work Order ,Item name, Item ID ,Q'Ty , Start time | H19: เช็คข้อมูลผ่านหน้า HMI Production Line  | L19: PASS | M19: test ต่อ พน
- C21: 3.สามารถส่ง Status Lamp Start ไปยัง Production Line ได้ถูกต้อง | H21: เช็ค Status Lamp ของ Production Line | L21: PASS
- C23: 4. Website สามารถแสดงการ Start ของ Production ไลน์ในหน้า Production Overview , / Production Preformance และ 3D Production ได้อย่างถูกต้อง  | H23: หน้า Product Over view แสดงสีของไลน์ในเป็นสีเขียว ,หน้า Production Performance แสดง Status Running  และ 3D Production แสดง Lamp สีเขียว | L23: PASS
- L25: PASS
- L27: PASS
- L29: PASS
- L31: PASS
- L33: PASS
- L35: PASS
- L37: PASS
- L39: PASS
- L41: PASS
- L43: PASS
- L45: PASS
- L47: PASS
- B50: Customer sign-off confirms that the work result has been communicated and acknowledged on the date above.

### UAT List1 Summary
Print area: 'UAT List1 Summary'!$B$2:$M$51
- B2: UAT REPORT / ใบรายงานการให้บริการ
- B4: Use this report to document installation, modification, support, verification, and issue resolution for hardware and software work. | J4: Doc Code: TT-FRM-UAT-001 | Revision: Rev.00
- B5: REPORT NO. / เลขที่รายงาน | D5: IOT-UAT-2701-001 | F5: REPORT DATE / วันที่ | H5: 2026-07-02 00:00:00 | J5: VISIT TYPE / ประเภทงาน | L5: Programing/Website
- B6: CUSTOMER / ลูกค้า | D6: Thai Asahi Denso Co., Ltd. | F6: PROJECT / SITE / โครงการ | H6: IoT Monitoring System for TAD  | J6: ENVIRONMENT / สภาพแวดล้อม | L6: Production Line
- B7: CONTACT PERSON / ผู้ประสานงาน | D7: Mr. Charkkrit Buayen | F7: CONTACT / โทร / อีเมล | H7: 092-2874418 | J7: WORK MODE / รูปแบบงาน | L7: Urgent
- B8: UAT TEAM / ทีมบริการ | D8: SE | F8: TICKET / PROJECT NO. | H8: PJ260039 | J8: REPORT STATUS / สถานะ | L8: In Progress
- B10: 1) SCOPE & OBJECTIVE / ขอบเขตและวัตถุประสงค์
- B11: REQUESTED BY / ผู้ร้องขอ | D11: Mr. Charkkrit Buayen | F11: START DATETIME / เริ่มงาน | H11: 2026-07-01 08:30:00 | J11: END DATETIME / สิ้นสุดงาน | L11: -
- B12: WORK SUMMARY / สรุปงาน | D12: สามารถ Monitoring แบบเรียลไทม์ ได้พร้อมกัน 42 ไลน์ / Able monitor 42 lines in real time simultaneously.
- B14: 2.2 UAT PUNCH LIST DETAIL / รายละเอียด
- B15: Test Scenario / หัวข้อในการทดสอบ | C15: Topic Test Step /  / ลำดับในการทดสอบ | E15: Topic Issue  / รายการปัญหา | J15:  Date Update / วันที่อัพเดท | K15: Status / สถานะของปัญหา | L15:  Dua Date / วันที่คาดว่าจะเสร็จ | M15: Result Status / ผลลัพการแก้ไขปัญหา
- B50: Customer sign-off confirms that the work result has been communicated and acknowledged on the date above.

### Evident #1
Print area: 'Evident #1'!$A$1:$P$51
- B2: PICTURE REPORT / ใบรายงานการให้บริการ
- B4: Use this report to document installation, modification, support, verification, and issue resolution for hardware and software work. | J4: Doc Code: TT-FRM-SRV-001 | Revision: Rev.00
- B5: REPORT NO. / เลขที่รายงาน | D5: IOT-UAT-2607-001 | F5: REPORT DATE / วันที่ | H5: 2026-07-02 00:00:00 | J5: VISIT TYPE / ประเภทงาน | L5: Programing/Website
- B6: CUSTOMER / ลูกค้า | D6: Thai Asahi Denso Co., Ltd. | F6: PROJECT / SITE / โครงการ | H6: IoT Monitoring System for TAD  | J6: ENVIRONMENT / สภาพแวดล้อม | L6: Production Line
- B7: CONTACT PERSON / ผู้ประสานงาน | D7: Mr. Charkkrit Buayen | F7: CONTACT / โทร / อีเมล | H7: 092-2874418 | J7: WORK MODE / รูปแบบงาน | L7: Urgent
- B8: SERVICE TEAM / ทีมบริการ | D8: SE | F8: TICKET / CR NO. | H8: PJ260039 | J8: REPORT STATUS / สถานะ | L8: In Progress
- B40: ACKNOWLEDGEMENT / ลายเซ็นรับทราบ
- B41: COMMISSIONED BY / ผู้ดำเนินการ | H41: CUSTOMER REPRESENTATIVE / ผู้รับทราบ
- B42: NAME / ชื่อ | H42: NAME / ชื่อ
- B43: SIGNATURE / ลายเซ็น | H43: SIGNATURE / ลายเซ็น
- B44: DATE / วันที่ | H44: DATE / วันที่
- B45: Customer sign-off confirms that the work result has been communicated and acknowledged on the date above.

### Evident #2
Print area: 'Evident #2'!$A$1:$M$51
- B2: PICTURE REPORT / ใบรายงานการให้บริการ
- B4: Use this report to document installation, modification, support, verification, and issue resolution for hardware and software work. | J4: Doc Code: TT-FRM-SRV-001 | Revision: Rev.00
- B5: REPORT NO. / เลขที่รายงาน | D5: IOT-UAT-2607-001 | F5: REPORT DATE / วันที่ | H5: 2026-07-02 00:00:00 | J5: VISIT TYPE / ประเภทงาน | L5: Programing/Website
- B6: CUSTOMER / ลูกค้า | D6: Thai Asahi Denso Co., Ltd. | F6: PROJECT / SITE / โครงการ | H6: IoT Monitoring System for TAD  | J6: ENVIRONMENT / สภาพแวดล้อม | L6: Production Line
- B7: CONTACT PERSON / ผู้ประสานงาน | D7: Mr. Charkkrit Buayen | F7: CONTACT / โทร / อีเมล | H7: 092-2874418 | J7: WORK MODE / รูปแบบงาน | L7: Urgent
- B8: SERVICE TEAM / ทีมบริการ | D8: SE | F8: TICKET / CR NO. | H8: PJ260039 | J8: REPORT STATUS / สถานะ | L8: In Progress
- B45: Customer sign-off confirms that the work result has been communicated and acknowledged on the date above.
