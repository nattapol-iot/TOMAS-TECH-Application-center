---
name: commissioning-checklist
description: Build a commissioning / SAT / handover checklist for an IoT installation from the project's real equipment list. Use when the user asks for "checklist ติดตั้ง", "commissioning", "SAT", "ส่งมอบงาน" or needs a test sheet before handover.
---

# Commissioning & Handover Checklist

สร้าง checklist ที่ช่างใช้ติ๊กหน้างานได้จริง จากรายการอุปกรณ์ของโครงการ ไม่ใช่ checklist ทั่วไป

## ข้อมูลที่ต้องได้ก่อน

- รายการอุปกรณ์ (gateway, PLC, meter, sensor, ตู้, จอ) พร้อมจำนวน
- โปรโตคอลที่ใช้ (Modbus RTU/TCP, MQTT, OPC UA, BACnet ฯลฯ) และปลายทางข้อมูล (cloud / server / dashboard)
- ถ้าไม่ได้รับ ให้ถามสั้น ๆ ครั้งเดียว แล้วทำส่วนที่ทำได้ก่อน

## โครงสร้าง (ตารางทุกหมวด: ลำดับ | รายการตรวจ | เกณฑ์ผ่าน | ผล ✓/✗ | หมายเหตุ)

1. **ก่อนจ่ายไฟ**: การยึดตู้ ป้ายชื่อสาย ขนาดเบรกเกอร์ กราวด์ ขั้วต่อแน่น
2. **ไฟเลี้ยง**: แรงดันที่ขั้วอุปกรณ์แต่ละตัว (ค่าที่วัดได้) UPS / surge protection
3. **เครือข่าย**: IP ตามแผน, ping ทุกอุปกรณ์, gateway/DNS/NTP, สัญญาณ 4G/Wi-Fi (dBm)
4. **การสื่อสาร**: อ่านค่าครบทุก tag, เทียบค่ากับหน้าจอเครื่องจริง, ทดสอบถอดสายแล้วกลับมาเอง
5. **ปลายทางข้อมูล**: ข้อมูลขึ้น dashboard ถูกหน่วยและ scale, timestamp ถูก timezone, alarm ทำงาน
6. **ความทนทาน**: ตัดไฟแล้วระบบกลับมาเอง, buffer ข้อมูลตอนเน็ตหลุด
7. **ความปลอดภัย**: เปลี่ยนรหัสผ่าน default, ปิดพอร์ตที่ไม่ใช้, บันทึก credential ในระบบเก็บรหัสของบริษัทเท่านั้น
8. **เอกสารส่งมอบ**: as-built drawing, IP/tag list, คู่มือ, รายชื่อผู้ติดต่อ, ลายเซ็นรับมอบ

## กฎ

- เกณฑ์ผ่านต้องวัดได้ (เช่น "24 VDC ±10%", "ping < 50 ms, loss 0%") ห้ามเขียนแค่ "ปกติ"
- แยกรายการตามอุปกรณ์จริง เช่น "Meter MDB-1 (slave 3)" ไม่ใช่ "meter ทุกตัว"
- ห้ามใส่รหัสผ่านจริงใน checklist
