---
name: boq-estimate-helper
description: Break a customer requirement into a BOQ (equipment, labour, hidden costs) as a table ready for an estimate, with the assumptions that must be confirmed. Use when the user says "ทำ BOQ", "ประมาณราคา", "แตกรายการอุปกรณ์" or pastes a TOR / requirement.
---

# BOQ & Estimate Helper

## ขั้นตอน

1. สรุปขอบเขตงานจาก requirement เป็น 3–5 บรรทัด และระบุสิ่งที่ **ไม่อยู่ในขอบเขต**
2. แตกรายการเป็น 4 หมวด
   - **อุปกรณ์**: gateway, PLC/IO, sensor, meter, ตู้, อุปกรณ์เครือข่าย, license
   - **วัสดุติดตั้ง**: สาย, ท่อ, raceway, connector (คิดเผื่อ 10–15% และเขียนไว้)
   - **ค่าแรง**: สำรวจ, ออกแบบ, เขียนโปรแกรม, ติดตั้ง, commissioning, อบรม เป็น man-day ต่อระดับ (Engineer / Technician)
   - **ค่าใช้จ่ายแฝง**: เดินทาง, ที่พัก, เครื่องมือเช่า, SIM/cloud รายเดือน, ประกัน, contingency
3. ใส่ราคาเฉพาะที่ผู้ใช้ให้มา หรืออ้างอิงใบเสนอราคาได้ ที่เหลือให้เว้นเป็น `[ขอราคา]` ห้ามเดาราคา
4. ปิดท้ายด้วยสมมติฐานและคำถามที่ต้องยืนยันกับลูกค้า

## รูปแบบตาราง (นำเข้า Excel / Estimate Cost ได้)

```
หมวด | รายการ | ยี่ห้อ/รุ่น (ถ้ามี) | จำนวน | หน่วย | ราคาต่อหน่วย | รวม | ผู้จำหน่าย/แหล่งราคา | หมายเหตุ
```

- จำนวนต้องสอดคล้องกับจำนวนจุดวัดหรือจำนวนเครื่องใน requirement และบอกที่มาในหมายเหตุ
- ค่าแรงใช้หน่วย "man-day" และแยกบรรทัดตามกิจกรรม
- ถ้าผู้ใช้ขอ CSV ให้คั่นด้วย comma และใส่ header แถวแรก

## กฎ

- อย่ารวมยอดเป็นราคาขายเอง ให้หยุดที่ต้นทุน เพราะ margin และ overhead เป็นของระบบประมาณราคา
- ถ้า requirement กำกวม ให้เสนอ 2 ทางเลือก (เช่น wired / 4G) แยกตาราง
