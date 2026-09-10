# ศูนย์เอกสาร IoT Team Center

ปรับโครงสร้าง: 10 กันยายน 2026 — สถานะปัจจุบัน **ยังไม่รับรอง Production**

เริ่มอ่านตามลำดับนี้:

1. [ผลตรวจ Application รอบล่าสุด](audits/production-readiness-2026-09-10.md)
2. [แผนงานและผู้รับผิดชอบ](planning/PRODUCTION_BACKLOG.md)
3. [ทะเบียนฟีเจอร์และหลักฐาน](planning/FEATURE_REGISTER.md)
4. [ข้อกำหนดการออกแบบ](../DESIGN.md)
5. [วิธีจัดการ release และป้องกันฟีเจอร์ถูกทับ](operations/RELEASE_CONTROL.md)

## หมวดเอกสาร

| หมวด | ใช้สำหรับ | ข้อจำกัด |
| --- | --- | --- |
| [features](features/README.md) | พฤติกรรมรายโมดูลและรายละเอียด implementation | คำว่า implemented ไม่เท่ากับ deployed |
| [design](design/README.md) | ข้อเสนอ UX และ design briefs | ใช้ร่วมกับ DESIGN.md; ข้อเสนอไม่ใช่ฟีเจอร์ที่เปิดใช้แล้ว |
| [releases](releases/README.md) | หลักฐานการส่งมอบในวันที่และ environment ที่ระบุ | ไม่ใช่สถานะ live ล่าสุด |
| [audits](audits/README.md) | ผลตรวจและขอบเขต UAT | ผลเก่าต้องตรวจซ้ำบน candidate ใหม่ |
| [planning](planning/PRODUCTION_BACKLOG.md) | งานที่ต้องทำ ลำดับ dependency และเกณฑ์ปิด | เป็นทะเบียนงานหลักของรอบเตรียม Production |
| [operations](operations/README.md) | การปล่อยระบบและดูแลบริการ | runbook .NET เดิมยังต้องปรับเป็น Node ก่อนใช้ |
| [team](team/README.md) | วิธีแบ่งงานและประสานเจ้าของไฟล์ | agent handles เก่าไม่ใช่ทีมที่กำลังทำงานอยู่ |
| [manual](manual/validation.md) | หลักฐานคู่มือและทรัพยากรสร้างคู่มือ | คง path เพื่อไม่กระทบ builder |
| [archive](archive/document-map-2026-09-10.md) | แผนผังย้ายไฟล์และเอกสารเก่า | ใช้สืบประวัติ ไม่ใช้สั่ง deploy |

## เอกสารไหนมีอำนาจตอบเรื่องอะไร

- โค้ดของ candidate + ผลทดสอบ: ยืนยัน implementation ของเวอร์ชันนั้น
- Release record ที่มี commit/hash/environment/schema: ยืนยันสิ่งที่ปล่อยใน environment นั้น
- FEATURE_REGISTER: เชื่อม requirement → โค้ด → test → release; ช่องไม่มีหลักฐานให้ลง Unknown
- DESIGN.md: ข้อกำหนด UX และรายการคำถาม; ห้ามใช้คำว่า Draft ตัดสินว่าโค้ดไม่มีฟีเจอร์
- FEATURES.md, KNOWLEDGE_HUB.md, SITE_VISIT.md: ข้อกำหนดเดิม/เป้าหมายรายโดเมน ต้องเทียบ implementation
- COORDINATION.md: ประวัติประสานงานแบบ append-only; IP, PID, branch และ claim เก่ามีอายุ ไม่ใช่สถานะ runtime ปัจจุบัน

เมื่อข้อมูลขัดกัน ให้เพิ่มประเด็นใน backlog พร้อมหลักฐานทั้งสองด้าน ห้ามลบ requirement หรือเลือกข้อความที่ใหม่ที่สุดโดยไม่ดู environment และ candidate

## กติกาเพิ่มหรือแก้เอกสาร

1. หาเอกสาร canonical ของเรื่องนั้นก่อน แล้วแก้ไฟล์เดิม; เอกสารใหม่ต้องมีเหตุผลและลิงก์จากหมวด
2. ระบุ Status, Updated, Owner role, Scope และ Evidence ทุกงานใหม่ แยก Proposed / Local / Tested / Deployed
3. การเปลี่ยนฟีเจอร์ต้องปรับทะเบียนฟีเจอร์และเกณฑ์ทดสอบใน PR เดียวกัน
4. Release note เป็นหลักฐานตามวัน ให้สร้างฉบับใหม่เมื่อต่าง candidate หรือ environment
5. ไฟล์สั้นที่เขียนว่า Document moved เป็น compatibility pointer ห้ามเติม spec ซ้ำตรงนั้น
6. เก็บผลดิบขนาดใหญ่ใน CI/artifact storage; ใน Markdown เก็บผลย่อและลิงก์ ไม่เก็บ secret หรือข้อมูลลูกค้า

ย้ายเอกสารรายเรื่อง 38 ไฟล์โดยเก็บเนื้อหาเดิมและปรับ relative links ดู [manifest พร้อม SHA-256](archive/document-map-2026-09-10.md) เอกสาร dependency, nested worktree และ generated output ไม่อยู่ในทะเบียนข้อกำหนดนี้

## Main integration follow-up

Current work: [candidate integration record](planning/CANDIDATE_INTEGRATION.md). Historical audit statements describe the pre-integration snapshot; use the candidate record for new verification.

Follow-up: [estimate aggregate boundary hardening](planning/COST_TOTAL_GUARD.md) records migration042, transactional validation and isolated SQL evidence after the integration checkpoint.
