---
name: plc-tag-mapping
description: Convert a PLC IO list or a vendor Modbus register map into a standard tag list (name, unit, scale, data type, address) and export it as CSV. Use when the user says "ทำ tag list", "mapping register", "แปลง IO list" or pastes a register table or PDF excerpt.
---

# Tag list / Mapping

## รูปแบบมาตรฐานของ tag list

```
tag_name,description,device,protocol,address,function,data_type,word_order,scale,unit,access,poll_ms
```

- **tag_name**: `<site>_<device>_<quantity>` ตัวพิมพ์เล็ก ใช้ `_` เช่น `bkk1_mdb1_kwh_total`
- **address**: ใช้ค่าที่ส่งจริงบนสาย (0-based) และเก็บค่าตามเอกสารไว้ใน description ถ้าต่างกัน
- **function**: 01/02/03/04 สำหรับ Modbus หรือ node id สำหรับ OPC UA
- **data_type**: BOOL, INT16, UINT16, INT32, UINT32, FLOAT32, FLOAT64
- **scale**: ตัวคูณจากค่าดิบเป็นหน่วยจริง (เช่น 0.1) และใช้ 1 ถ้าไม่ต้องแปลง
- **access**: R หรือ RW

## ขั้นตอน

1. อ่าน register map ที่ได้รับ และระบุว่าเป็น 0-based หรือ 1-based (ดูตัวอย่าง address ในเอกสาร)
2. เลือกเฉพาะค่าที่ผู้ใช้ต้องการ ถ้าไม่ได้บอก ให้เลือกชุดพื้นฐาน: V, I, kW, kWh, PF, Hz, สถานะ และ alarm
3. ค่า 32-bit ใช้ 2 register ต่อกัน ให้ตรวจว่า address ไม่ทับกัน
4. ส่ง CSV ใน code block และสรุปสิ่งที่ไม่แน่ใจไว้ใต้ตาราง (word order และ scale ที่เอกสารไม่ระบุ)

## ตรวจก่อนส่ง

- ไม่มี tag_name ซ้ำ
- ทุกแถวมี data_type และ scale
- 32-bit ทุกตัวมี word_order
- จำนวน register ต่อการอ่านหนึ่งครั้งไม่เกินที่อุปกรณ์รองรับ (ถ้ารู้ค่า)
