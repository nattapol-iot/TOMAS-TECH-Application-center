# Engineering Center → Pegasus ERP: การส่ง Purchase Request ผ่าน MCP

ถึง: ทีม Pegasus ERP · จาก: ทีม Engineering Center (IoT Team application) · วันที่ 2026-10-28
อ้างอิง: `PURCHASE-REQUEST-MCP-TH.md` ที่ทีม ERP ส่งมา

ไฟล์นี้มีสองส่วน คือสิ่งที่ฝั่ง Engineering Center ทำไปแล้ว และสิ่งที่ขอให้ทีม ERP ช่วยตั้งค่าหรือยืนยัน ใช้เป็น context ให้ AI agent ของทีม ERP อ่านได้ทั้งไฟล์ ฟิลด์ เครื่องมือ และค่าคงที่ทั้งหมดตรงกับโค้ดที่ deploy อยู่บน production แล้ว (Engineering Center PR #43 merge `ff5e14c6` schema 90 และการอ่านสถานะตอนเปิดหน้ารายการ PR ที่เพิ่มในวันเดียวกัน)

## สรุปสั้น

- ทีม ERP เพิ่ม audience `pegasus-erp-mcp` ให้แล้ว (2026-10-28) และยืนยันว่าเริ่มใช้งานได้ทันที
- PR ที่อนุมัติครบหลังจากนี้จะถูกส่งเข้า ERP อัตโนมัติ ส่วน PR ที่อนุมัติไปก่อนหน้าและค้างอยู่ที่ "รอส่ง ERP" ผู้ขอต้องกด "ส่งเข้า ERP" เอง

## Flow ที่ทำไว้

1. วิศวกรสร้าง PR จาก BOM ใน Engineering Center แล้วเลือก "แผนกใน ERP" (ระบบเลือกแผนกของผู้ขอไว้ให้ก่อน)
2. อนุมัติตามงบในแอป: PM อนุมัติ และถ้า Module เกินงบเกิน 10% Engineering Manager อนุมัติเพิ่ม
3. เมื่ออนุมัติครบ backend เรียก `purchase_request_create` ทันที **ด้วย access token ของผู้ขอ** (ไม่ใช่ของผู้อนุมัติ) ERP จึงบันทึกผู้ขอเป็น requester
4. ถ้าส่งไม่สำเร็จ PR จะค้างที่ Approved พร้อมข้อความ error และผู้ขอได้แจ้งเตือนให้กดปุ่ม "ส่งเข้า ERP" เอง
5. หลังจากนั้นฝ่ายจัดซื้อทำงานใน ERP ทั้งหมด ทั้งขอใบเสนอราคา เลือก Supplier อนุมัติ และออก PO ฝั่งเราตัดขั้น Purchasing Review การเลือก Supplier และการบันทึกเลข PO ออกจากแอปแล้ว
6. เมื่อมีคนเปิดหน้ารายการ PR หรือเปิดดู PR ในแอป backend เรียก `purchase_request_get` ด้วย token ของคนที่เปิด ถ้าได้ `CONVERTED` ระบบบันทึก `po_no` และเปลี่ยนสถานะ PR เป็น "สั่งซื้อใน ERP แล้ว" เมื่อสถานะเป็นสถานะสุดท้ายแล้วจะไม่อ่านซ้ำอีก

## การเรียก MCP

| รายการ | ค่า |
|---|---|
| Endpoint | `POST https://pegasus-erp.tomastc.com/mcp` (env `PEGASUS_MCP_URL`; ตั้งเป็น `off` เพื่อปิด) |
| ผู้เรียก | backend ของ Engineering Center เท่านั้น browser ไม่ได้เรียก ERP โดยตรง |
| Body | JSON-RPC 2.0 `{"jsonrpc":"2.0","id":<ms>,"method":"tools/call","params":{"name":<tool>,"arguments":{...}}}` |
| Headers | `Authorization: Bearer <access token ของผู้ใช้>`, `Content-Type: application/json`, `Accept: application/json`, `User-Agent: TOMAS-Engineering-Center/1.0` |
| Timeout | 90 วินาทีต่อครั้ง |
| Token | access token จาก TMT ID (Keycloak) ของผู้ใช้คนนั้นเท่านั้น ไม่ใช้ id_token ไม่ใช้ service account และไม่ใช้ client_credentials |
| Scope ตอน sign-in | `openid email profile` (ไม่ได้ขอ `offline_access`) |
| การอ่านสถานะ | ไม่มี background job อ่านเมื่อมีคนเปิดหน้ารายการ PR หรือเปิด PR ใบนั้น ด้วย token ของคนที่เปิด อ่านแต่ละใบไม่เกิน 1 ครั้งต่อ 15 นาที และไม่เกิน 20 ใบต่อการเปิดหน้ารายการหนึ่งครั้ง (ตามที่ทีม ERP แนะนำ 2026-10-28) |

Tools ที่ใช้:

- `purchasing_options_get`: ดึงรายชื่อแผนก เพื่อแสดงตัวเลือกและเดาแผนกของผู้ขอ
- `purchase_request_create`: ส่ง PR
- `purchase_request_get` (ด้วย `external_ref`): อ่านสถานะ

ยังไม่ได้ใช้: `purchasing_projects_list`, `purchasing_suppliers_list`, `whoami`

### การเก็บ token

- ตอน sign-in ระบบเก็บ refresh token ของผู้ใช้ไว้ในฐานข้อมูล เข้ารหัส AES-256-GCM และผูกกับ subject ของผู้ใช้คนนั้น
- access token อยู่ในหน่วยความจำเท่านั้น
- ลบ refresh token ทิ้งเมื่อผู้ใช้ sign-out หรือเมื่อ Keycloak ตอบ `invalid_grant`
- การ refresh ทำทีละครั้งต่อผู้ใช้ เพราะ Keycloak หมุน refresh token ทุกครั้งที่ใช้

## ข้อมูลที่ส่งใน `purchase_request_create`

| ฟิลด์ ERP | ค่าที่ส่ง |
|---|---|
| `external_ref` | `ENGAPP-PR-<UUID v4>` ออกครั้งเดียวต่อ PR และบันทึกก่อนเรียก ERP ทุกครั้งที่ลองส่งซ้ำ (timeout, กดซ้ำ, หลัง error) ใช้ค่าเดิม |
| `department` | ค่า `value` จาก `purchasing_options_get` ที่ผู้ขอเลือก หรือที่ระบบเดาจากชื่อแผนกของผู้ขอ |
| `needed_by_date` | Required date ของ PR (`YYYY-MM-DD`) |
| `justification` | Purpose ของ PR ถ้าว่างใช้ `Material for <project_no> <project_name> (<PR no.>)` |
| `project_no` | เลขโครงการ เช่น `PJ260017` ถ้าเลขเป็นตัวยึดที่แอปใช้ระหว่างที่โครงการยังไม่มีเลข ERP (`PJ000000`) จะไม่ส่งฟิลด์นี้ |
| `est_cost_url` | `https://<Engineering Center>/#/purchase` (หน้ารายการ PR ยังไม่ใช่ลิงก์ไปที่ PR ใบนั้น) |
| `notes` | `Engineering Center <PR no.> · BOM <BOM no.>` |
| `lines[].item_description` | Description (ตัดที่ 2,000 ตัวอักษร) |
| `lines[].quantity` | Qty (สูงสุด 1,000,000) |
| `lines[].est_unit_price` | ราคาต่อหน่วยที่วิศวกรประเมิน (บาท) |
| `lines[].unit` | หน่วย (ตัดที่ 20 ตัวอักษร ถ้าว่างใช้ `PCS`) |
| `lines[].part_number` | Part No. หรือ Item code (ตัดที่ 100 ตัวอักษร) |
| `lines[].brand` | Brand (ตัดที่ 100 ตัวอักษร) |
| `lines[].remark` | ประเภทรายการ, Module และ Item code คั่นด้วย ` · ` |

รูปแบบของ `lines[].remark`:

- รายการที่เปลี่ยนรุ่นจาก Estimate: `Substitute for <code เดิม> · Module Panel · …`
- รายการนอก Estimate: `Not in the estimate · Module Panel · …`
- ERP ไม่มีแนวคิด Module และรายการทดแทน เราจึงใส่ข้อมูลนี้ไว้ใน remark
- ฟิลด์ที่ยาวเกินจะถูกตัดให้สั้นลง แต่ไม่ถูกตัดทิ้ง
- PR หนึ่งใบฝั่งเรามีได้ถึง 2,000 รายการ

## การ map สถานะและ error

| ERP | Engineering Center |
|---|---|
| `QUOTES_PENDING`, `PENDING_MANAGER`, `APPROVED` | PR ยังเป็น Approved และแสดงเลข PR ของ ERP กับ `status_label` |
| `CONVERTED` | "Converted to PO" (แสดงเป็น "สั่งซื้อใน ERP แล้ว") พร้อม `po_no` ไม่อ่านซ้ำ |
| `REJECTED`, `CANCELLED` | Rejected พร้อม `rejection_reason` ไม่อ่านซ้ำ |

| คำตอบจาก ERP | สิ่งที่เราทำ |
|---|---|
| HTTP 401 | refresh token แล้วลองใหม่ **1 ครั้ง** ถ้ายังไม่ผ่าน แจ้งผู้ใช้ให้ sign-in ใหม่ |
| `isError` + `errors` | แสดง message และ error รายฟิลด์ (สูงสุด 500 ตัวอักษร) ให้ผู้ขอแก้แล้วส่งใหม่ |
| `access_denied`, `not_found`, `not_employee` | แสดง message ไม่ลองใหม่เอง |
| `ref_deleted` | แสดง message **ไม่ลองใหม่เอง** และไม่ออก ref ใหม่ |
| HTTP 413 | แจ้งว่า PR ใหญ่เกินไป |
| HTTP 429, 5xx, 52x, เชื่อมต่อไม่ได้, ไม่ใช่ JSON | แจ้งว่า ERP ใช้งานไม่ได้ชั่วคราว ให้กดส่งใหม่ภายหลัง ไม่ retry อัตโนมัติ |

## คำตอบจากทีม ERP (2026-10-28)

| ข้อ | คำตอบ | ฝั่ง Engineering Center |
|---|---|---|
| 1. Audience | เพิ่มให้แล้ว | เริ่มส่งจริงได้ |
| 3. จำนวนรายการ | ERP ไม่จำกัดจำนวนรายการ แต่ PR 2,000 รายการใหญ่เกินกว่าที่คนจะตรวจไหว ERP จะแยก PR ตาม Supplier เอง | คงเพดาน 2,000 รายการไว้ ไม่แบ่งส่ง |
| 4. แจ้งสถานะ | ยังไม่มี webhook MCP เป็นแบบถาม-ตอบอย่างเดียว ให้ฝั่งเราดึงสถานะเป็นรอบ เช่น ทุก 5-15 นาที หรือดึงตอนผู้ใช้เปิดหน้านั้น ถ้าต้องการ webhook จริงให้แจ้ง | ดึงตอนเปิดหน้ารายการ PR และตอนเปิด PR แต่ละใบไม่เกิน 1 ครั้งต่อ 15 นาที |
| 9. `est_cost_url` | ต้องเปิด VPN ในอนาคต ERP จะย้ายเข้า VPN ด้วย | คงลิงก์เดิม |

## สิ่งที่ยังรอคำตอบจากทีม ERP

ข้อ 1, 3, 4 และ 9 ตอบแล้ว (ดูตารางด้านบน) ข้อที่เหลือ:

2. **อายุของ refresh token / `offline_access`**
   - PR มักอนุมัติครบหลังผู้ขอ sign-in ไปหลายชั่วโมงหรือหลายวัน
   - ตอนนี้ refresh token ผูกกับ SSO session ของ Keycloak พอ session หมด การส่งอัตโนมัติจะไม่สำเร็จ และผู้ขอต้องกดส่งเอง
   - ขอคำแนะนำว่าควร (ก) อนุญาตให้ client ของเราขอ `offline_access` หรือ (ข) คงไว้แบบนี้ แล้วใช้การกดส่งเองเป็นทางหลัก
3. **ขนาด payload สูงสุด (HTTP body)** ของ PR 2,000 รายการ ส่งผ่าน Cloudflare ได้ไหม
5. **`ref_deleted`** ถ้า PR ถูกลบใน ERP แล้ว และผู้ขอ*กดส่งใหม่เอง* ฝั่งเราออก `external_ref` ใหม่ได้หรือไม่
6. **แผนก**
   - ระบบเดาแผนก ERP จากชื่อแผนกของพนักงานในแอปโดยเทียบกับ `label` และ `keywords`
   - ช่วยใส่ `keywords` ให้แผนกที่ตรงกับชื่อเหล่านี้: `IoT Engineer Dept.`, `Application Engineer Dept.`, `Mechanical Engineer Dept.`, `Electrical Engineer Dept.`, `System Architect & System Engineer Dept.`
7. **ความยาวสูงสุดของ `lines[].remark`** และยืนยันว่าใส่ข้อมูล Module กับรายการทดแทนไว้ในช่องนี้ได้
8. **`project_no`** ถ้าโครงการยังไม่มีใน ERP ควรส่ง PR แบบไม่มี `project_no` (แบบที่ทำอยู่) หรือรอจนโครงการมีใน ERP ก่อน
9. **`est_cost_url`** ถ้าทีม ERP ต้องการลิงก์ไปที่ PR ใบนั้นโดยตรงแทนหน้ารายการ แจ้งได้
10. **Rate limit** ค่า 429 คือกี่ครั้งต่อนาทีต่อผู้ใช้ (ฝั่งเราเรียกตอนอนุมัติ กดส่ง เปิด PR และเปิดหน้ารายการ PR ซึ่งอ่านไม่เกิน 20 ใบต่อครั้ง ทีละใบ และแต่ละใบไม่เกิน 1 ครั้งต่อ 15 นาที)
11. **Cloudflare** ช่วยยืนยันว่า `User-Agent: TOMAS-Engineering-Center/1.0` จาก IP ของ server เราผ่าน Cloudflare ได้
12. **ทดสอบร่วมกัน**
    - มี endpoint สำหรับทดสอบ (staging) หรือพนักงานทดสอบไหม
    - ถ้าไม่มี ขอนัดทดสอบบน production ด้วย PR ทดสอบ 1 ใบ แล้วให้ทีม ERP ยกเลิกให้

## ติดต่อ

ทีม Engineering Center: nattapol.p@tomastc.com
