# Site credentials vault, installed base and release deployments

Three connected features (migrations 075–077). This page is for the people who run the host.

## Installed base (ทะเบียนอุปกรณ์ลูกค้า)

- เมนู **Installed Base** (`asset.read` / `asset.manage`): อุปกรณ์และซอฟต์แวร์ที่ติดตั้งให้ลูกค้า ผูกกับลูกค้า, site ของลูกค้า,
  โครงการ, site ใน Site Monitor, โปรแกรมที่ถูก monitor และ repository ใน TMTHub
- เลข `AST-000001` ออกจาก identity ของแถว; serial ของยี่ห้อเดียวกันซ้ำไม่ได้; ประกันต้องไม่จบก่อนวันติดตั้ง
- ทุกการแก้ไขกลายเป็นประวัติ (ติดตั้ง, ย้าย, เปลี่ยนสถานะ, เปลี่ยนเวอร์ชัน, เข้าบริการ, บันทึก, อัปเดตโปรแกรม)

## Release deployments (อัปเดตโปรแกรมหน้างานจาก TMTHub)

1. ใน **Site Monitor → site → โปรแกรม** กด **อัปเดต** (`monitor.deploy`) — ผูกโปรแกรมกับ repository ครั้งแรก (`monitor.manage`)
2. เลือก release และไฟล์ `.zip` / `.exe` (≤ 500 MB) → ระบบคัดลอกไฟล์ไว้ที่ `monitor-deployments/` ใน storage และบันทึก SHA-256
3. **คนอื่น** ที่มี `monitor.approve` กดอนุมัติ (ผู้ขออนุมัติเองไม่ได้ — ฐานข้อมูลบังคับด้วย constraint)
4. TMT Control Panel **2.1+** ดาวน์โหลด → ตรวจขนาดและ SHA-256 → สำรอง → ติดตั้ง → เปิดและต้องทำงานต่อเนื่อง 20 วินาที →
   ไม่ผ่านจะคืนเวอร์ชันเดิมเอง (`RolledBack`)
5. สำเร็จ: เวอร์ชันของโปรแกรมและของอุปกรณ์ในทะเบียนที่ผูกไว้เปลี่ยนเอง พร้อมประวัติ "อัปเดตโปรแกรม"

เครื่องหน้างานต้องอัปเดต TMT Control Panel เป็น 2.1.0 ก่อน (repo `tmt-control-panel`) — เวอร์ชันเก่าจะตอบว่า
`Unknown command 'Update'` และคำขอจะเป็น Failed โดยไม่มีอะไรถูกแตะ

## Site credentials vault (รหัสเข้าถึงหน้างาน)

- อยู่ในรายละเอียดอุปกรณ์ของ Installed Base: `credential.read` เห็นรายการ, `credential.reveal` เปิดดูรหัส, `credential.manage` เพิ่ม/แก้/ลบ
- รหัสเก็บเป็น **AES-256-GCM** ในฐานข้อมูล; กุญแจอยู่ใน `.env` ของ Mac mini เท่านั้น (`CREDENTIAL_VAULT_KEYS`)
- ทุกการเปิดดูบันทึกใน `site_credential_access` (ใคร, เมื่อไร, IP) ใน transaction เดียวกับการเปิดดู
- รหัสที่ผูกกับโครงการ เปิดดูได้เฉพาะคนในโครงการหรือบทบาทผู้บริหาร
- ลบ = ทำลายรหัสทันที (ประวัติการเข้าถึงยังอยู่)

### กุญแจ — สำคัญที่สุด

`scripts/macos/deploy.sh` สร้าง `CREDENTIAL_VAULT_KEYS=1:<base64>` ใน `.env` ครั้งแรกครั้งเดียว

- **ถ้ากุญแจหาย รหัสที่เก็บไว้ทั้งหมดอ่านไม่ได้อีก** — backup ฐานข้อมูลไม่ช่วย เพราะกุญแจไม่ได้อยู่ในฐานข้อมูล (ตั้งใจ)
- ผู้ดูแลระบบควรคัดลอกค่า `CREDENTIAL_VAULT_KEYS` จาก `~/iot-team-center/src/.env` บน Mac mini ไปเก็บใน password manager
  ขององค์กร **แยกจาก** backup ของฐานข้อมูล
- ห้ามแก้หรือแทนที่ key `1`; จะเปลี่ยนกุญแจให้ **เพิ่ม** `,2:<base64 32 ไบต์>` ต่อท้าย — รหัสใหม่และรหัสที่แก้จะใช้ key 2
  ส่วนของเดิมยังอ่านด้วย key 1 ได้
- ไม่มีกุญแจ: หน้าจอยังแสดงรายการได้ แต่เพิ่มหรือเปิดดูรหัสไม่ได้ (API ตอบ `credential_vault_not_configured`)

## ทดสอบ SQL บนเครื่องนักพัฒนา

```bash
powershell -File scripts/Test-SqlSmokeLocalDb.ps1
```

สร้าง LocalDB ชั่วคราว → deploy migration ทั้งหมด → รัน SQL จริงของ route ทั้งสามเรื่อง (`backend-node/tests/sql/*-smoke.ts`) → ลบทิ้ง
