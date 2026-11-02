# Engineering Center → Pegasus ERP: ขอ tool สำหรับส่ง Estimate Cost

ถึง: ทีม Pegasus ERP · จาก: ทีม Engineering Center (IoT Team application) · วันที่ 2026-10-28
อ้างอิง: `PURCHASE-REQUEST-MCP-TH.md` ข้อ 8.1 และ 8.4 ที่ระบุว่า "ส่ง cost estimate" ยังไม่มี tool และทีม ERP วางแผนทำไว้แล้ว
สถานะ (2026-11-02): ทีม ERP ทำ `cost_estimate_submit` และ `cost_estimate_get` แล้ว ฝั่งเราเชื่อมแล้ว ดูคำตอบและสิ่งที่ทำแล้วท้ายเอกสาร

AI agent ของทีม ERP อ่านไฟล์นี้ได้ทั้งไฟล์ การเรียก MCP (endpoint, token, JSON-RPC, การ map error) ใช้แบบเดียวกับการส่ง PR ใน `PEGASUS_ERP_PR_INTEGRATION_TH.md`

## สิ่งที่ต้องการ

- ตอนนี้วิศวกร export ไฟล์ `EST-xxx_<project>_Rnn_ERP_EstimateCost.xlsx` (template `ERP_SUMMARY_V1`) จากแท็บสรุปต้นทุนของ Estimate แล้วนำไฟล์เข้า ERP เอง
- ต้องการให้ Engineering Center ส่ง Estimate Cost เข้า ERP เองเมื่อ Estimate ได้รับอนุมัติ
- เอกสาร MCP บอกให้ระบบภายนอกใช้ tool ที่รูปแบบข้อมูลคงที่ และห้ามผูกโค้ดกับ `erp_read` / `erp_write` ฝั่งเราจึงรอ tool เฉพาะสำหรับเรื่องนี้

## Flow ที่ฝั่ง Engineering Center จะทำ

1. วิศวกรส่ง Estimate ให้ตรวจ (Engineering Review)
2. ผู้มีสิทธิ์อนุมัติ Estimate กดอนุมัติ ผู้อนุมัติต้องไม่ใช่เจ้าของ Estimate
   - ระบบไม่ยอมให้อนุมัติถ้ายังมีบรรทัดที่ไม่มีหมวด ERP
   - ยอดรวมทุกหมวดบวก overhead ต้องตรงกับยอด Estimate
   - Estimate ถูกล็อกหลังอนุมัติ ข้อมูลที่ส่งจึงไม่เปลี่ยนจนกว่าจะออก revision ใหม่
3. หลังอนุมัติ backend เรียก tool ทันที **ด้วย access token ของผู้อนุมัติ**
   - ผู้อนุมัติกำลังใช้งานอยู่ตอนกด token จึงยังใช้ได้ ไม่ติดปัญหา refresh token หมดอายุแบบการส่ง PR อัตโนมัติ
   - ส่งอีเมลของเจ้าของ Estimate ไปในฟิลด์ `prepared_by_email`
4. ถ้าส่งไม่สำเร็จ Estimate ยังอนุมัติอยู่ แอปแสดง error และปุ่ม "ส่งเข้า ERP" ให้กดส่งใหม่ ไม่ retry อัตโนมัติ
5. เมื่อแก้ Estimate จะออก revision ใหม่ (R01, R02, …) พออนุมัติ revision ใหม่ จะส่งอีกครั้งด้วย `external_ref` เดิมและเลข `revision` ใหม่

## ข้อมูลที่เสนอให้ส่ง

ข้อมูลชุดเดียวกับไฟล์ `_ERP_` ที่ ERP นำเข้าอยู่ ชื่อฟิลด์เป็นข้อเสนอ ทีม ERP กำหนดใหม่ได้

ส่วนหัว:

| ฟิลด์ | ค่า |
|---|---|
| `external_ref` | `ENGAPP-EST-<UUID v4>` ออกครั้งเดียวต่อ Estimate ใช้ค่าเดิมทุก revision และทุกครั้งที่ลองส่งซ้ำ |
| `revision` | เลข revision (R00 = 0) |
| `estimate_no` | เช่น `EST-2610-0023` |
| `project_no` | เลขโครงการ ถ้ายังเป็นตัวยึด `PJ000000` จะไม่ส่งฟิลด์นี้ |
| `project_name`, `customer`, `short_name` | ชื่อโครงการ ลูกค้า ชื่อย่อ |
| `revision_description` | เหตุผลของ revision |
| `prepared_by_email` | อีเมลเจ้าของ Estimate |
| `approved_at` | เวลาที่อนุมัติ (ISO 8601) |
| `currency` | `THB` |
| `est_cost_url` | `https://<Engineering Center>/#/estimates/<id>` ต้องเปิด VPN |
| `summary[]` | `{category, amount}` ครบ 7 หมวด: `Hardware`, `Software`, `Service`, `Installation`, `License`, `Maintenance`, `Training` |
| `overhead_amount` | ยอด overhead (0 ถ้าไม่มี) |
| `total` | ยอดรวม = ผลรวม `summary[].amount` + `overhead_amount` |

รายการ `lines[]` (หนึ่งแถวต่อหนึ่งบรรทัดต้นทุน):

| ฟิลด์ | ค่า |
|---|---|
| `category` | หมวด ERP หนึ่งใน 7 หมวด |
| `source_type` | `CostItem`, `ManhourLine`, `ExpenseLine`, `OtherCostLine` หรือ `Contingency` |
| `internal_category` | หมวดฝั่งเรา เช่น `01 Hardware` |
| `module` | Module ใน Estimate |
| `part_number`, `description`, `brand` | Part No. / Model, Description, Brand |
| `supplier` | ชื่อ Supplier ที่ใช้ประเมินราคา (ข้อความ ไม่ใช่รหัส Supplier ของ ERP) |
| `lead_time`, `quote_revision` | Lead time และ revision ของใบเสนอราคา |
| `unit_price`, `quantity`, `unit`, `amount` | ราคาต่อหน่วย จำนวน หน่วย และยอดรวม (บาท) |
| `remark` | หมายเหตุ |

ข้อมูลทั้งหมดเป็นต้นทุนภายในของฝ่ายวิศวกรรมเท่านั้น ไม่มีราคาขาย margin หรือ markup

## คำตอบจากทีม ERP (2026-11-02)

ทีม ERP ทำ tool แล้ว และใช้บน production ได้ ทั้งการส่ง JSON และไฟล์แนบ `source_file` endpoint และ token ใช้แบบเดียวกับ `purchase_request_create`

| ข้อ | คำตอบ | ฝั่ง Engineering Center |
|---|---|---|
| 1. Tool และ schema | `cost_estimate_submit` สำหรับส่ง `cost_estimate_get` สำหรับอ่านผล schema คงที่ ชื่อฟิลด์ตรงกับที่เสนอทุกตัว | ใช้ทั้งสอง tool |
| 2. การผูก | บังคับ `external_ref`, `revision`, `estimate_no`, `currency`, `summary`, `total`, `lines` ส่วน `project_no` ไม่บังคับ ถ้ามีโครงการใน ERP จะผูกให้ ถ้ายังไม่มีก็รับไว้แล้วผูกทีหลังได้ `customer` ผูกเมื่อชื่อตรงกับลูกค้าใน ERP ทุกตัวอักษรโดยไม่สนตัวพิมพ์ | ไม่ส่ง `project_no` ถ้ายังเป็น `PJ000000` |
| 3. Revision ใหม่ | ใช้ Cost Sheet ใบเดิม บรรทัดถูกแทนด้วยของ revision ใหม่ ERP เก็บเฉพาะ revision ล่าสุด revision เท่าเดิมได้ `unchanged` revision ต่ำกว่าได้ `errors.revision` ใบที่ LINKED แล้วยังรับ revision ใหม่ได้ ใบที่ถูกลบใน ERP ได้ `errors.external_ref` | `external_ref` เดียวต่อ Estimate ทุก revision ไม่ส่งซ้ำถ้า ERP มี revision นั้นแล้ว |
| 4. สิทธิ์ | ส่งต้องมีสิทธิ์แก้ Cost Sheet ใน ERP อ่านต้องมีสิทธิ์เปิดดู ถ้า `tools/list` ไม่มี `cost_estimate_submit` แปลว่าไม่มีสิทธิ์ | ถ้าผู้อนุมัติไม่มีสิทธิ์ ข้อความ error จะบอก และคนที่มีสิทธิ์กดส่งใหม่ได้ |
| 5. ไฟล์แนบ | ไม่บังคับ `source_file = {name, content_base64}` รับ .xlsx/.xls ไม่เกิน 10 MB | ยังไม่แนบ ส่ง JSON อย่างเดียว |
| 6. หมวด | ใช้ 7 หมวดเดียวกัน `summary[].amount` ต้องเท่ากับผลรวม `lines[].amount` ของหมวดนั้น `total` ต้องเท่ากับผลรวมบรรทัดบวก `overhead_amount` คลาดได้ไม่เกิน 0.01 | ปัดยอดแต่ละบรรทัดเป็นสตางค์ก่อน แล้วรวม summary และ total จากยอดที่ส่งจริง |
| 7. อ่านผล | `cost_estimate_submit` ตอบ `result` (created, revised, unchanged) พร้อมข้อมูล Cost Sheet และเลขที่ `cost_estimate_get` ตอบเลข Cost Sheet สถานะ revision ล่าสุด และยอดรวม สถานะ CONFIRMED หรือ LINKED และ Cost Sheet ที่ส่งเข้าไปอนุมัติทันที | แสดงเลข Cost Sheet สถานะ และ revision ในแท็บ ERP ของ Estimate |
| 8. ขนาด | `lines` ไม่เกิน 2,000 บรรทัด ไฟล์แนบไม่เกิน 10 MB request ทั้งหมดไม่เกิน 105 MB | ไม่ส่งถ้าเกิน 2,000 บรรทัด และบอกเหตุผล |

Error ของสอง tool นี้ไม่มีฟิลด์ `code` ถ้าข้อมูลไม่ผ่านจะได้ `isError: true` พร้อม `structuredContent = {"message", "errors": {"<ฟิลด์>": [...]}}` และไม่มีข้อมูลใดถูกบันทึก

## สิ่งที่ฝั่ง Engineering Center ทำแล้ว

- **ส่งตอนอนุมัติ:** อนุมัติ Estimate แล้ว backend เรียก `cost_estimate_submit` ด้วย token ของผู้อนุมัติทันที
- **ส่งไม่สำเร็จ:** Estimate ยังอนุมัติอยู่ แท็บ ERP แสดงเหตุผล และมีปุ่ม "ส่งเข้า ERP" ให้เจ้าของ Estimate, Engineering Manager, Admin หรือผู้มีสิทธิ์อนุมัติกดส่งใหม่ด้วย token ของคนกด
- **ตรวจสถานะ:** ปุ่ม "ตรวจสถานะใน ERP" เรียก `cost_estimate_get` ด้วย token ของคนกด ไม่มีการดึงเป็นรอบ
- **ข้อมูลที่ส่ง:** ชุดเดียวกับแท็บ ERP และไฟล์ `_ERP_` หนึ่งแถวต่อหนึ่งบรรทัดต้นทุน รวม Contingency
- **ที่เก็บ:** `dbo.estimate_erp_links` (migration 093) เก็บ `external_ref` เลข Cost Sheet สถานะ revision ล่าสุดที่ ERP รับ ยอดรวม และ error ล่าสุด ตารางแยกจาก `dbo.estimates` เพื่อไม่ให้ row version ของ Estimate เปลี่ยน

## ยังต้องยืนยันกับทีม ERP

1. **ชื่อฟิลด์ในคำตอบ:** ฝั่งเราอ่านเลข Cost Sheet, `status`, `revision`, `total` และ `url` ได้ทั้งจาก object ซ้อน (`cost_sheet`) และจากระดับบนสุด ช่วยยืนยันชื่อฟิลด์จริง โดยเฉพาะชื่อของเลข Cost Sheet และบอกด้วยว่ามีลิงก์ไปหน้า Cost Sheet ไหม
2. **ทดสอบบน production:** ส่งครั้งแรกจะใช้ Estimate จริงที่อนุมัติแล้ว ถ้าทีม ERP อยากให้ส่งใบทดสอบก่อน แจ้งเลข Estimate หรือช่วงเวลาที่จะลบใบทดสอบให้

## ติดต่อ

ทีม Engineering Center: nattapol.p@tomastc.com
