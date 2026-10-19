---
name: mqtt-integration
description: Design MQTT topics and JSON payloads, choose QoS/retain/LWT, test against a broker with mosquitto_pub/sub, and debug connection or TLS problems. Use when the user mentions MQTT, a broker, topics, "ข้อมูลไม่ขึ้น cloud" or device-to-cloud messaging.
---

# MQTT Integration

## ออกแบบ topic

```
<org>/<site>/<device>/<channel>        เช่น tomas/bkk1/mdb1/telemetry
<org>/<site>/<device>/status           online/offline (retain + LWT)
<org>/<site>/<device>/cmd/<action>     คำสั่งไปยังอุปกรณ์
```

- ตัวพิมพ์เล็กทั้งหมด ไม่มีช่องว่าง ไม่ขึ้นต้นด้วย `/`
- ห้ามใส่ข้อมูลที่เปลี่ยนบ่อย (timestamp, ค่าวัด) ไว้ใน topic

## Payload

```json
{ "ts": "2026-01-31T08:15:00Z", "device": "mdb1", "values": { "kw": 12.4, "kwh": 10234.5 }, "quality": "good" }
```

- เวลาเป็น UTC แบบ ISO 8601 และหน่วยกำหนดในเอกสาร tag ไม่ใส่ซ้ำทุกข้อความ
- ส่งเป็นกลุ่มตามรอบ poll ไม่ส่งทีละค่า

## QoS / retain / LWT

| ใช้กับ | QoS | retain |
|---|---|---|
| telemetry ถี่ ๆ | 0 หรือ 1 | ไม่ |
| status | 1 | ใช่ + ตั้ง LWT = offline |
| cmd | 1 (อุปกรณ์ต้องทำซ้ำได้โดยไม่เสียหาย) | ไม่ |

## ทดสอบ

```bash
mosquitto_sub -h <broker> -p 8883 --cafile ca.crt -u <user> -P <pass> -t 'tomas/bkk1/#' -v
mosquitto_pub -h <broker> -p 8883 --cafile ca.crt -u <user> -P <pass> -t 'tomas/bkk1/test' -m '{"ping":1}'
```

## ไล่ปัญหาการเชื่อมต่อ

- `Connection refused: not authorised` เกิดจาก user/pass หรือ ACL ของ topic
- TLS handshake fail เกิดจาก CA ไม่ตรง, เวลาเครื่องผิด (cert ยังไม่เริ่ม/หมดอายุ) หรือ hostname ไม่ตรง cert
- หลุดทุก ~60 วินาที เกิดจาก keepalive หรือ client id ซ้ำกับอีกเครื่อง (broker เตะตัวเก่าออก)
- ข้อมูลหายตอนเน็ตหลุด แก้ด้วย buffer ฝั่งอุปกรณ์ หรือ persistent session (clean_session=false + QoS 1)

## กฎ

- ห้ามใส่รหัสผ่านจริงในตัวอย่างหรือโค้ด ให้ใช้ตัวแปรสภาพแวดล้อม
