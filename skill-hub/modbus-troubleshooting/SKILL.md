---
name: modbus-troubleshooting
description: Diagnose Modbus RTU/TCP failures step by step — no response, timeouts, CRC errors, wrong or swapped values from meters, PLCs or gateways. Use when the user says "อ่าน modbus ไม่ได้", "ค่าเพี้ยน", "timeout", "CRC error" or shares a register map and a wrong reading.
---

# Modbus RTU / TCP Troubleshooting

ไล่จากชั้นล่างขึ้นบน หยุดเมื่อเจอสาเหตุ และบอกผู้ใช้ว่าต้องวัดหรือลองอะไรต่อทีละข้อ

## 1. ไม่มีการตอบกลับเลย

**RTU (RS-485)**
- สาย A/B สลับหรือไม่ (บางยี่ห้อเรียก D+/D- หรือ A/B กลับกัน) ให้ลองสลับก่อนอย่างอื่น
- มี terminator 120 Ω ที่ปลายบัสสองข้างเท่านั้น และสายเป็น daisy-chain ไม่แตกเป็นดาว
- baud / parity / stop bits ตรงกันทุกตัว (ค่าที่พบบ่อย 9600 8N1, 19200 8E1)
- slave id ไม่ซ้ำกัน และอยู่ในช่วง 1–247
- converter USB-485 รุ่นที่ต้องสลับ TX/RX เองหรือไม่

**TCP**
- ping ได้ไหม, พอร์ต 502 เปิดไหม (`Test-NetConnection <ip> -Port 502`)
- gateway TCP→RTU ต้องใช้ unit id = slave id ฝั่ง RTU
- จำนวน connection พร้อมกันเกินที่อุปกรณ์รับได้หรือไม่

## 2. Timeout เป็นช่วง ๆ หรือ CRC error

- timeout ตั้งต่ำไป (RTU ควร ≥ 500 ms ที่ 9600) หรือ poll ถี่เกินไป
- อ่านทีละมากเกินไป (บางอุปกรณ์รับได้ไม่เกิน 32–64 register ต่อคำสั่ง)
- สัญญาณรบกวน: สายไม่ใช่ twisted pair หรือไม่ได้ต่อชีลด์ลงกราวด์ข้างเดียว หรือเดินคู่สายกำลัง

## 3. อ่านได้แต่ค่าไม่ถูก

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| ค่าเลื่อนไป 1 ช่อง | address offset: เอกสารเขียน 40001 แต่ต้องส่ง 0 (หรือ 1-based กับ 0-based) |
| ค่าเป็นเลขมหาศาล / ติดลบแปลก | word order ของ 32-bit (ABCD / CDAB / BADC / DCBA) |
| ค่าผิดเป็นสิบเท่า | scale factor / จุดทศนิยม หรือหน่วย (W กับ kW) |
| ได้ 0 ตลอด | อ่านผิด function code (03 holding กับ 04 input) |
| float ผิด | อุปกรณ์ส่ง INT32 แต่ถอดเป็น FLOAT32 หรือกลับกัน |

วิธีพิสูจน์: อ่าน raw register เป็น hex แล้วลองถอดทั้ง 4 word order เทียบกับค่าบนหน้าจอเครื่อง

## เครื่องมือที่แนะนำ

- Modbus Poll / QModMaster / `mbpoll` สำหรับทดสอบนอกระบบ
- Python: `pymodbus` อ่าน raw แล้วถอดเอง

## กฎ

- ขอ register map ของรุ่นนั้นจริงเสมอ อย่าเดา address จากรุ่นอื่น
- ห้ามแนะนำให้เขียน (function 06/16) ไปยังอุปกรณ์ที่ใช้งานจริง โดยไม่เตือนผลกระทบก่อน
