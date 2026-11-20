# ตัวอ่าน PR-Form และ Dry run การนำเข้าข้อมูลเก่า

ส่วนแรกของ phase (f) ในแผนเลิกใช้ Excel PR-Form (owner brief 2026-11-20): อ่านไฟล์ PR-Form ทั้งหมดใน
"Purchase - PR-Requests" แล้วรายงานว่าถ้านำเข้าจะได้อะไร และไฟล์ไหนมีปัญหาอะไร **ไม่แก้ไฟล์ที่อ่าน**
ไม่แตะฐานข้อมูล ไม่เรียก ERP ไม่ใช้ network

- ตัวอ่าน: `lib/pr-form.ts` (pure, ไม่มี import) ใช้ร่วมกับการนำเข้าใบขอซื้อจาก PR-Form ในขั้นถัดไป
- คำสั่ง: `scripts/pr-form-dry-run.mjs`
- Test: `tests/pr-form.test.mjs` (ไฟล์ตัวอย่างจริง PJ260091 ไม่อยู่ใน repository; test ชุดนั้นรันเฉพาะเครื่องที่มีไฟล์ใน folder project และ skip ใน CI)

## วิธีรัน

```bash
# ทั้ง library ที่ sync ลงเครื่องด้วย OneDrive
node scripts/pr-form-dry-run.mjs "C:\Users\<you>\OneDrive - <company>\Purchase - PR-Requests"

# บาง folder หรือบางไฟล์ เก็บ JSON ไว้ดูละเอียด แสดงปัญหาไฟล์ละ 40 รายการ
node scripts/pr-form-dry-run.mjs "<folder>" "<file.xlsx>" --json report.json --issues 40

# Workbook สำหรับตรวจ: Projects, Forms, Issues, Lines
node scripts/pr-form-dry-run.mjs "<folder>" --xlsx "dry-run-review.xlsx"
```

Workbook สำหรับตรวจมี 4 sheet ทุก sheet ตรึงหัวตารางและเปิด filter ไว้:

- **Projects**: ยอดต่อโครงการ แยก discipline
- **Forms**: หนึ่งแถวต่อ sheet ฟอร์ม คอลัมน์แรก **Import (Y/N)** ให้ผู้ตรวจกรอกว่าจะนำเข้าหรือไม่ ฟอร์มที่เป็น copy ใส่ N ไว้ให้แล้ว
- **Issues**: ปัญหาทุกรายการ พร้อมไฟล์ sheet และแถว
- **Lines**: ทุกบรรทัดตามที่อ่านได้ (Rev., part, material, จำนวน, ราคา, PO, สถานะ, แถวแม่ของชิ้นส่วน)

ชื่อไฟล์รายงานห้ามขึ้นต้นด้วย `PR` เพราะการรันครั้งถัดไปจะอ่านไฟล์นั้นเป็น PR-Form และห้ามเก็บไว้ใน library ที่ sync กับ SharePoint

อ่านเฉพาะไฟล์ `.xlsx` ที่ชื่อขึ้นต้นด้วย `PR` (ข้าม quotation, drawing, lock file `~$` และ template เปล่า
`PR-[Customer]-[PJ_Number]-YYYYMMDD-001.xlsx`) ไฟล์ใหญ่เกิน 20 MB หรือเกิน 80 MB หลังแตก zip จะขึ้นเป็น unreadable

## อ่านอย่างไร

- **หาคอลัมน์จากหัวตาราง ไม่ใช่ตำแหน่ง cell**: แบบฟอร์มเปลี่ยนหลายครั้ง (ปี 2025 ไม่มีคอลัมน์ Rev./Total, หัวตารางอยู่แถว 9,
  บางไฟล์เขียน "PO" แทน "PO Number") ตัวอ่านหาแถวหัวตารางที่มี Model/Part Number (หรือ Discription), Quantity, Unit price
  และอย่างน้อยหนึ่งใน Rev., PO, Actual cost; "Unit" ตัวแรกคือหน่วยนับ ตัวที่สองคือสกุลเงิน
- **Sheet "Summary" / "001_Summary cost"** เป็นแค่สูตรรวม (มักเป็น #REF!) ไม่นับ
- **หัวฟอร์ม**: Project Number, Project Name, Customer, Drawing No., Unit Name, Part delivery date, Estimate,
  ส่วนประกอบของ estimate ด้านขวา (เช่น ME | 800000 | Item 22-30) และ link estimate
- **รอบคำขอ (△)** = 1 request; บรรทัดที่ไม่มี Rev. ของตัวเองนับอยู่ในรอบของบรรทัดบน (ฟอร์มเก่าเขียน △ เฉพาะบรรทัดแรกของรอบ);
  ฟอร์มที่ไม่มี Rev. เลยนับเป็น 1 รอบ
- **Child line**: แถวที่มีแค่ part number (ไม่มี Rev. ไม่มี Item ไม่มี Discription) เป็นชิ้นส่วนของบรรทัดบน เช่น valve ของ manifold
- **แถวที่ไม่ได้ขออะไร** (ไม่มี quantity, ราคา, PO, actual cost) ไม่นับเป็นบรรทัด: หัวหน้าที่ฟอร์มเก่าพิมพ์ซ้ำทุกหน้า และ sheet ที่แค่ชี้ไปไฟล์อื่น
- **PO status** สะกดได้หลายแบบ ("Already Apporve", "Order Lots", "OrderMastervalve") แปลงเป็นสถานะ:
  Approved, Pending, Ordered, Bundled (ซื้อรวมใน order อื่น เช่น Order Lot / Master Valve / EE ORDER จึงไม่มีราคาของตัวเอง),
  Stock, Cancelled, Rejected; คอลัมน์ PO ที่เขียน "Online", "Shopee" เก็บเป็นหมายเหตุ ไม่ใช่เลข PO
- **Committed** = actual cost ถ้ามี ไม่งั้นใช้ total price (ไม่นับ Cancelled/Rejected); ช่อง Remain ของฟอร์มนับแค่ actual cost
  รายงานจึงบอกทั้งสองตัวเลขเมื่อเกินงบ
- **Estimate ที่ทุกฟอร์มของ discipline เดียวกันใส่ตัวเลขเดียวกัน** (งบ ME ทั้งโครงการ ไม่ใช่งบ Unit) นับครั้งเดียว
- **ไฟล์ที่ copy กัน**: ฟอร์มที่บรรทัด (part, discription, quantity, ราคา) อยู่ในอีกฟอร์มของโครงการเดียวกันเกิน 9 ใน 10
  ถือเป็น copy ไม่นับในยอดรวม (ถ้าเท่ากันเก็บไฟล์ที่ใหม่กว่า) เช่นไฟล์ `_Confirm` และไฟล์รอบหลังที่ copy ไฟล์รอบแรกทั้งหมด
- **ชื่อไฟล์**: อ่านได้ทั้งแบบมาตรฐาน `PR-[ME]-[PJ260091]-20260813-013_MZ08-U001-MASTER VALVE UNIT` และแบบเก่า
  (ไม่มีวงเล็บ, วันที่ ddmmyyyy / ddmmyy / yymmdd, ชื่อลูกค้าแทน discipline, `_Confirm`) แต่รายงานว่าไม่ตรงมาตรฐาน;
  discipline ที่ชื่อไฟล์ไม่บอกเอามาจากชื่อ sheet (`001_EE`) หรือ folder (`ME-PJ260091`)

## ปัญหาที่รายงาน

| Code | ความหมาย |
|---|---|
| `missing_price` / `missing_supplier` | มี quantity แต่ไม่มีราคา / supplier (ยกเว้น Bundled, Stock, Cancelled, Rejected) |
| `missing_actual` | มี PO หรือ Approved/Ordered แล้วแต่ไม่มี actual cost |
| `malformed_po` | เลข PO ไม่ใช่ `PO-` + 11 หลัก |
| `unknown_po_status` / `unknown_unit` | สถานะ PO หรือหน่วยนับที่ตัวอ่านไม่รู้จัก |
| `bad_currency` | คอลัมน์สกุลเงินเขียนอย่างอื่น (เช่น "Set") รายงานครั้งเดียวต่อ sheet และถือเป็น THB |
| `foreign_currency` | ราคาเป็น USD ฯลฯ ยอดรวมบวกตามตัวเลขที่เขียน ไม่ได้แปลงเป็น THB |
| `total_mismatch` | quantity x unit price ไม่เท่ากับ total price |
| `over_budget` / `no_estimate` | committed เกิน estimate / ฟอร์มไม่มี estimate |
| `missing_revision` | บรรทัดไม่มี Rev. (นับเข้ารอบบน หรือเป็นรอบเดียวถ้าทั้งฟอร์มไม่มี) |
| `ref_error` | สูตรเสีย #REF! ในบรรทัดหรือ estimate |
| `multiple_projects` | ฟอร์มเขียนหลายเลขโครงการ นับเข้าตัวแรก |
| `name_format` / `name_mismatch` | ชื่อไฟล์ไม่ตรงมาตรฐาน / ชื่อไฟล์กับหัวฟอร์มบอกโครงการหรือ drawing ไม่ตรงกัน |
| `duplicate_form` | ฟอร์มนี้เป็น copy ของอีกฟอร์ม ไม่นับในยอดรวม |
| `no_form` | ไม่มี sheet ไหนเป็น PR-Form |

## ยังไม่ทำในขั้นนี้

- การเขียนข้อมูลเก่าเข้าฐานข้อมูล (phase f ส่วนที่ 2) รอเจ้าของดูรายงานก่อน: ข้อมูลเก่าเป็น historical อ่านอย่างเดียว
  ไม่ส่ง ERP ไม่มี external_ref เก็บเลข PO และสถานะเดิม; โครงการเก่าบางโครงการอาจยังไม่มีในแอป
- ยอด USD ยังไม่แปลงค่าเงิน
