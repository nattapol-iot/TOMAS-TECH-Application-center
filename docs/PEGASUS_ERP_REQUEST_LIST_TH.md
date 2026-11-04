# Engineering Center → Pegasus ERP: ส่งรายการที่ต้องซื้อเข้า Request List ของโครงการ

ถึง: ทีม Pegasus ERP และฝ่ายจัดซื้อ · จาก: ทีม Engineering Center (IoT Team application) · วันที่ 2026-11-04
อ้างอิง: [PEGASUS_ERP_PR_INTEGRATION_TH.md](PEGASUS_ERP_PR_INTEGRATION_TH.md) และข้อความจากทีม ERP กับฝ่ายจัดซื้อวันที่ 2026-11-04

AI agent ของทีม ERP อ่านไฟล์นี้ได้ทั้งไฟล์ การเรียก MCP (endpoint, header, JSON-RPC, token ของผู้ใช้, การ map error) ใช้แบบเดียวกับการส่ง PR ในไฟล์อ้างอิง

## สรุปสั้น

- **ปัญหา:** ฝ่ายจัดซื้อแจ้งว่า PR หนึ่งใบต้องเป็นของซัพเดียว แต่ใบขอซื้อจากแอปเข้า ERP เป็น PR ใบเดียวเสมอ และวิศวกรส่วนใหญ่ยังไม่รู้ว่าจะซื้อกับซัพไหน
  - เรื่องนี้แทนคำตอบเมื่อ 2026-10-28 ที่ว่า ERP จะแยก PR ตามซัพเอง
- **เจ้าของระบบเลือก (2026-11-04):**
  - ใบขอซื้อยังอนุมัติในแอปตามเดิม คือหัวหน้าแผนกของผู้ขอ แล้วผู้อนุมัติขั้นสุดท้าย
  - เมื่ออนุมัติครบ แอปจะส่งรายการเข้า **Request List ของโครงการ** ใน ERP แทนการเปิด PR
  - ฝ่ายจัดซื้อเลือกรายการไปออก PR แยกตามซัพเองใน ERP
- **ขอจากทีม ERP:**
  - tool 2 ตัว คือเพิ่มรายการเข้า Request List และอ่านสถานะรายการกลับ
  - ไฟล์ Excel ตัวอย่างที่หน้า Request List รับ เพื่อใช้ระหว่างที่ยังไม่มี tool

## Flow ใหม่

1. วิศวกรสร้างใบขอซื้อจาก BOM ในแอปเหมือนเดิม
2. อนุมัติในแอปเหมือนเดิม
3. เมื่ออนุมัติครบ backend เรียก `project_request_list_add` ด้วย access token ของผู้ขอ เหมือนที่ส่ง PR อยู่ตอนนี้ ทุกรายการของใบนั้นเข้า Request List ของ `project_no`
4. ฝ่ายจัดซื้อเลือกรายการใน Request List แล้วออก PR ตามซัพ บนหน้าจอที่ทีม ERP ทำไว้แล้ว
5. แอปอ่านสถานะรายการกลับด้วย `project_request_list_get` แล้วแสดงเลข PR และ PO ของ ERP ต่อรายการ
   - อ่านเมื่อมีคนเปิดหน้ารายการใบขอซื้อ หรือเปิดใบนั้น ด้วย token ของคนที่เปิด ไม่มี background job
   - ใช้กติกาเดิม คืออ่านแต่ละใบไม่เกิน 1 ครั้งต่อ 15 นาที และไม่เกิน 20 ใบต่อการเปิดหน้ารายการหนึ่งครั้ง

ระหว่างที่ยังไม่มี tool ใบที่อนุมัติครบจะมีปุ่มดาวน์โหลด Excel ตามรูปแบบของหน้า Request List ให้ผู้ขอนำไปอัปโหลดเอง ในกรณีนี้แอปจะอ่านสถานะกลับไม่ได้

## Tool ที่ขอ

ชื่อ tool และชื่อฟิลด์เป็นข้อเสนอ ทีม ERP เปลี่ยนได้

### `project_request_list_add`

| Argument | ความหมาย |
|---|---|
| `external_ref` | `ENGAPP-PR-<UUID v4>` ใบละหนึ่งค่า ถ้าส่งซ้ำด้วยค่าเดิม (timeout, กดซ้ำ) ต้องไม่สร้างรายการซ้ำ ให้คืนรายการเดิม แบบเดียวกับ `purchase_request_create` |
| `project_no` | เลขโครงการ เช่น `PJ260017` |
| `department`, `needed_by_date`, `justification`, `notes`, `est_cost_url` | ความหมายเดียวกับ `purchase_request_create` |
| `lines[].line_ref` | `<external_ref>-<ลำดับ>` key ของแต่ละรายการ ใช้อ่านสถานะกลับ |
| `lines[].item_description`, `quantity`, `est_unit_price`, `unit`, `part_number`, `brand`, `remark` | ความหมายและความยาวเดียวกับ `purchase_request_create` |
| `lines[].suggested_supplier_id` | ไม่บังคับ ใช้ภายหลังเมื่อแอปรู้ `supplier_id` ของ ERP |

คำตอบ: `{ "created": true|false, "items": [{ "line_ref", "item_id", "status" }] }`

### `project_request_list_get`

| Argument | ความหมาย |
|---|---|
| `external_ref` | ค่าเดียวกับตอน add |

คำตอบ:

```json
{
  "external_ref": "ENGAPP-PR-...",
  "project_no": "PJ260017",
  "items": [{
    "line_ref": "ENGAPP-PR-...-1",
    "item_id": 123,
    "status": "WAITING | IN_PR | ORDERED | CANCELLED",
    "status_label": "...",
    "orders": [{ "pr_no": "PR2611-0001", "po_no": "PO2611-0003", "quantity": 2, "supplier_name": "..." }],
    "cancelled_reason": null,
    "url": "https://pegasus-erp.tomastc.com/..."
  }]
}
```

- `orders` เป็น array เผื่อว่าจัดซื้อแยกรายการเดียวไปหลาย PR หรือหลายซัพ
- error ใช้แบบเดิม เช่น `not_found`, `ref_deleted`, `access_denied`, `not_employee`

## สิ่งที่ฝั่ง Engineering Center จะทำเมื่อมี tool

1. ใบที่อนุมัติครบจะส่งเข้า Request List แทน `purchase_request_create`
   - ใบที่เข้า ERP เป็น PR ไปแล้วยังอ่านสถานะด้วย `purchase_request_get` ตามเดิม
2. หน้าใบขอซื้อแสดงสถานะต่อรายการ ได้แก่ รอจัดซื้อ, อยู่ใน PR เลขอะไร, สั่งซื้อแล้ว PO เลขอะไร, หรือยกเลิก
   - ใบจะเป็น "สั่งซื้อครบ" เมื่อทุกรายการมี PO หรือถูกยกเลิก
3. ผู้ขอยังได้แจ้งเตือนและอีเมลตามเดิม ทั้งตอนอนุมัติ และตอนที่ส่งเข้า ERP สำเร็จหรือไม่สำเร็จ
4. ปุ่มดาวน์โหลด Excel จะยังอยู่ สำหรับตอนที่ ERP ใช้งานไม่ได้

## สิ่งที่ต้องการคำตอบจากทีม ERP

1. **ชื่อ tool และฟิลด์** ใช้ตามข้อเสนอได้ไหม ถ้าเปลี่ยน ขอ schema ที่ใช้จริง
2. **`project_no`** ต้องมีโครงการใน ERP ก่อนหรือไม่ ถ้าโครงการยังไม่มีใน ERP (ในแอปเลขยังเป็นตัวยึด `PJ000000`) ควรทำอย่างไร
3. **ไฟล์ Excel ตัวอย่าง** ของหน้า Request List ช่วยระบุชื่อชีต ชื่อคอลัมน์ และลำดับคอลัมน์ ฝั่งเราจะทำปุ่มดาวน์โหลดให้ตรงตามไฟล์
4. **สิทธิ์** วิศวกร (role STAFF) เรียก `project_request_list_add` ด้วย token ของตัวเองได้ไหม
5. **ยกเลิกหลังส่ง** ถ้าผู้ขอดึงใบกลับไปแก้หรือยกเลิกหลังส่งเข้า Request List แล้ว จะให้ฝั่งเราเรียก tool ยกเลิกรายการที่ยังไม่ออก PR (ขอเพิ่ม `project_request_list_cancel`) หรือให้ฝ่ายจัดซื้อลบใน ERP เอง
6. **จัดซื้อแก้รายการ** ฝ่ายจัดซื้อแก้จำนวน รวม หรือแยกรายการได้ไหม ถ้าได้ `project_request_list_get` จะคืนข้อมูลอย่างไร
7. **`department`** ยังต้องส่งไหม ถ้า PR ไปออกที่ฝ่ายจัดซื้อ แผนกของ PR จะเป็นแผนกผู้ขอหรือแผนกจัดซื้อ
8. **ทดสอบร่วม** ขอนัดทดสอบบน production ด้วยใบทดสอบ 1 ใบ เหมือนตอนเริ่มส่ง PR

## ติดต่อ

ทีม Engineering Center: nattapol.p@tomastc.com
