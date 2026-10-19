---
name: code-review-th
description: Review a diff or branch before merge for real bugs, security holes and deploy breakers, ranked by severity, and report concisely in Thai. Use when the user says "รีวิวโค้ด", "ตรวจ PR", "ช่วยดู diff ก่อน merge" or "review".
---

# Code Review (รายงานภาษาไทย)

## ขั้นตอน

1. ดู diff: `git diff <base>...HEAD` (ถ้าไม่บอก base ให้ใช้ `main`) และอ่านไฟล์รอบ ๆ จุดที่แก้เท่าที่จำเป็น
2. ตรวจตามลำดับความสำคัญ
   - **ความถูกต้อง**: logic ผิด, edge case (ค่าว่าง, 0, ติดลบ, รายการว่าง), race condition, transaction ไม่ครบ
   - **ความปลอดภัย**: SQL injection, ไม่ตรวจสิทธิ์ที่ route, path traversal, secret ในโค้ด, XSS
   - **พังตอน deploy**: migration ไม่รันซ้ำได้, env/config ที่ต้องเพิ่ม, breaking API, ลืมสิทธิ์ DB
   - **ข้อมูล**: ลบหรือแก้ข้อมูลเดิมโดยไม่ตั้งใจ, timezone, ทศนิยมเงิน
   - **ทดสอบ**: กรณีสำคัญที่ยังไม่มี test
3. ยืนยันทุกข้อด้วยโค้ดจริง ถ้าไม่แน่ใจให้เขียนว่า "ควรตรวจ" ไม่ใช่ "เป็น bug"

## รูปแบบรายงาน

```
สรุป: <ผ่าน / ผ่านแบบมีเงื่อนไข / ไม่ควร merge> — 1 บรรทัด

🔴 ร้ายแรง
- path/file.ts:42 — <ปัญหา> → <ผลที่เกิด> → <วิธีแก้สั้น ๆ>

🟡 ควรแก้
- ...

🟢 ข้อเสนอแนะ (ไม่บังคับ)
- ...
```

## กฎ

- ไม่เกิน 10 ข้อ เรียงจากร้ายแรงที่สุด
- ไม่ติเรื่องสไตล์ที่ formatter/linter จัดการได้
- ทุกข้อต้องบอกไฟล์และบรรทัด
- ถ้าไม่พบปัญหา ให้เขียนว่า "ไม่พบปัญหา" พร้อมบอกว่าตรวจอะไรไปแล้ว
