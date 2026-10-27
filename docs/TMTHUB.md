# TMTHub — git server ของแผนก

TMTHub คือ [Forgejo](https://forgejo.org) (git server แบบ GitHub) ที่รันบน Mac mini ตัวเดียวกับ Engineering Center
ใช้ `git clone / pull / push` ได้จริง มี branch, tag, Pull Request, Issues และหน้าเว็บดูโค้ด

| | |
|---|---|
| URL | `https://tmthub.tomastc.com:8446/` |
| เข้าถึง | ผ่าน VPN (tailnet) เท่านั้น — DNS ชี้ไปที่ `100.64.0.3` แบบ DNS-only |
| เข้าสู่ระบบ | ปุ่ม **Sign in with TMT-ID** (บัญชีเดียวกับ Engineering Center) |
| git บน command line | HTTPS + Personal Access Token (ไม่มี SSH) |
| Organization | `TMT` องค์กรเดียวรวมทุกโครงการ ตั้งชื่อ repo ขึ้นต้นด้วยเลขโครงการ เช่น `PJ-26-012-gateway-firmware` |
| สมาชิก | ทุกบัญชี TMT ID เข้าทีม `TMT/Members` อัตโนมัติเมื่อ login (อ่าน/เขียนทุก repo และสร้าง repo ใน org ได้) — ทีม `Owners` ยังจัดการเองตามเดิม |
| ผู้ดูแล | admin กำหนดใน `TMTHUB_ADMIN_EMAIL` (ค่าเริ่มต้นใน `scripts/macos/deploy.sh`) |

## เริ่มใช้งาน (ครั้งแรก)

1. ต่อ VPN แล้วเปิด `https://tmthub.tomastc.com:8446/` → **Sign in with TMT-ID** (บัญชีถูกสร้างอัตโนมัติครั้งแรก)
2. สร้าง token สำหรับ git: มุมขวาบน → **Settings → Applications → Generate New Token**
   เลือก scope `repository: Read and Write` (และ `user: Read`) แล้วเก็บ token ไว้ — จะเห็นแค่ครั้งเดียว
3. Clone ครั้งแรก git จะถามชื่อผู้ใช้และรหัสผ่าน: ใส่ **ชื่อผู้ใช้ TMTHub** และใช้ **token เป็นรหัสผ่าน**
   (Git Credential Manager บน Windows จะจำไว้ให้)

```bash
git clone https://tmthub.tomastc.com:8446/TMT/PJ-26-012-gateway-firmware.git
```

## งานประจำวัน

```bash
git pull
git add .
git commit -m "แก้การอ่าน Modbus"
git push
```

ย้ายโปรเจคที่มีอยู่แล้ว (เช่นจาก GitHub หรือโฟลเดอร์ในเครื่อง) เข้า TMTHub: สร้าง repo เปล่าในหน้าเว็บก่อน แล้ว

```bash
git remote add tmthub https://tmthub.tomastc.com:8446/TMT/<ชื่อ-repo>.git
git push tmthub --all
git push tmthub --tags
```

หรือใช้เมนู **+ → New Migration** ในหน้าเว็บเพื่อดึงจาก GitHub ทั้ง issue และ PR

## การทำงานเบื้องหลัง (สำหรับผู้ดูแล)

- Service `tmthub` และ `tmthub-backup` อยู่ใน `docker-compose.tls.yml`; Caddy เปิด site
  `{$TMTHUB_HOST}:{$TMTHUB_PORT}` ใน `deploy/caddy/Caddyfile` (cert จาก Cloudflare DNS-01 แบบเดียวกับแอป)
- `scripts/macos/deploy.sh` ทำให้ทุกครั้งที่ deploy:
  - สร้าง `TMTHUB_SECRET_KEY` ใน `.env` ครั้งแรกครั้งเดียว (ห้ามเปลี่ยน — ใช้เข้ารหัส OAuth secret / 2FA)
  - สร้าง DNS `tmthub.tomastc.com A <ip เดียวกับ PUBLIC_HOST>` (DNS-only) ถ้ายังไม่มี และจะไม่เขียนทับ record ที่มีอยู่
  - ตั้งค่า login ผ่าน TMT ID (auth source `TMT-ID`, Keycloak client เดียวกับแอป) และอัปเดต secret ทุกครั้ง
  - สร้างบัญชี admin (`TMTHUB_ADMIN_EMAIL`) ก่อนใครเข้า แล้ว TMT ID จะผูกบัญชีให้ด้วย email
  - สร้างทีม `TMT/Members` ครั้งแรกครั้งเดียว และตั้ง auth source `TMT-ID` ให้ใช้ claim `iss` (realm `internal`
    ซึ่งมีแต่บัญชีบริษัท) เป็น group → map เข้าทีมนี้ทุกครั้งที่ login (`--group-team-map`, ไม่เปิด removal
    สมาชิกที่ owner เพิ่มเองจึงไม่หาย) และเพิ่มบัญชี TMT ID เดิมที่ยังไม่อยู่ใน org ให้ตอน deploy
- **ที่เก็บข้อมูล = NAS** `IoT Department\IoT Team Center\TMTHub\`
  - `repositories\` (git repo ทั้งหมด), `lfs\`, `attachments\` — VM ของ Mac mini mount ผ่าน **NFS** (volume `tmthub-nas`)
    ไม่ใช้ SMB ของ macOS เพราะ macOS สร้างไฟล์ `._*` ข้างไฟล์ และ `._pack-*.idx` ทำให้ git อ่าน repo เสีย
  - `backups\tmthub-db-*.zip` — ฐานข้อมูล (ผู้ใช้ สิทธิ์ issue PR) + `app.ini` จาก `tmthub-backup` ทุก deploy และทุก 24 ชม. เก็บ 14 ชุด
  - บน Mac mini เหลือแค่ฐานข้อมูล SQLite (`tmthub-data`) เพราะ SQLite บน network share เสียหายง่ายเมื่อมีการ lock
- **ถ้า NAS ยังไม่เปิด NFS** deploy จะข้าม TMTHub พร้อมคำเตือน `TMTHub skipped` (แอปหลัก deploy ตามปกติ)
- Keycloak realm `internal` มี client แยกของ TMTHub คือ `tmthub` (redirect URI
  `https://tmthub.tomastc.com:8446/user/oauth2/TMT-ID/callback`) secret เก็บใน GitHub Actions secret
  `TMTHUB_OIDC_CLIENT_SECRET` ซึ่ง deploy.yml ส่งให้ deploy.sh (หรือใส่ `TMTHUB_OIDC_CLIENT_SECRET` ใน `.env` บน Mac mini)
  หมุน secret ได้โดยเปลี่ยนค่าแล้ว deploy ใหม่

### เชื่อมกับศูนย์ดาวน์โหลดของ Engineering Center

เมื่อ TMTHub ทำงานแล้ว `deploy.sh` จะสร้างบัญชีบริการ `engineering-center` และ token (`TMTHUB_API_TOKEN` ใน `.env`)
แล้ว restart API — แท็บ **Repository โค้ดโครงการ** ในศูนย์ดาวน์โหลดจะเปลี่ยนเป็น repo ของ TMTHub ทันที:

- รายการ = repo ทั้งหมดใน org `TMT`; โครงการที่ผูกไว้เก็บเป็น topic `project-<id>` ของ repo
- สร้าง repo จากหน้านี้ = สร้างใน TMTHub (private, branch `main`, มี README) พร้อม topic โครงการ
- ดู tree / โค้ด / README, ดาวน์โหลดไฟล์ หรือ ZIP ทั้ง repo, ประวัติ = commit ล่าสุด 30 รายการ
- อัปโหลด .zip หรือไฟล์ / ลบไฟล์-โฟลเดอร์ = commit ในชื่อผู้ใช้ที่กด
  - ขนาดสูงสุดต่อไฟล์ที่อัปโหลด **200 MB** (`DocumentStorage__RepositoryUploadMaxBytes` ใน `.env`, ไม่เกิน 500 MB) แยกจากเพดานเอกสารทั่วไป
  - zip ใหญ่ถูกแตกและ commit เป็นชุดละประมาณ 24 MB (`Upload x.zip (part 1/3)` …) เพื่อไม่ให้ API ใช้หน่วยความจำเกิน
  - สูงสุด 5,000 ไฟล์ต่อครั้ง; ใหญ่หรือมากกว่านั้นใช้ `git push` (ไม่มีเพดาน)
- มีปุ่ม **เปิดใน TMTHub** และคำสั่ง `git clone` ให้คัดลอก
- ถ้ายังไม่มี token (TMTHub ยังไม่พร้อม) หน้านี้ยังใช้โฟลเดอร์บน NAS แบบเดิม

### ตั้งค่า NFS บน NAS (ครั้งเดียว, ผู้ดูแล NAS)

ตัวอย่างสำหรับ Synology DSM:

1. **Control Panel → File Services → NFS**: เปิด NFS service และ NFSv4.1
2. **Control Panel → Shared Folder → `IoT Department` → Edit → NFS Permissions → Create**
   - Hostname or IP: `100.64.0.3` (Mac mini บน tailnet — VM ออกเน็ตผ่านเครื่องนี้)
   - Privilege: Read/Write · Squash: **Map all users to admin** · Security: `sys`
   - เปิด **Allow connections from non-privileged ports** และ **Allow users to access mounted subfolders**
3. ถ้า path ของ share ไม่ใช่ `/volume1/IoT Department` ให้ใส่ `TMTHUB_NFS_PATH=/volumeX/IoT Department/IoT Team Center/TMTHub`
   ใน `.env` บน Mac mini (ดู path ได้ที่หน้า NFS Permissions ด้านล่าง "Mount path")

**NFSv4.1 กับ v3:** deploy ลอง v4.1 ก่อนแล้วถอยไป v3 เอง ใช้ได้ทั้งคู่ (ใช้เวลา probe ไม่ถึง 1 วินาที)
- ถ้า log ขึ้น `NFSv4.1 is not offered by the NAS; using NFSv3` แปลว่า NAS ตอบ v4 ว่า `no such file or directory`
  ทุก path รวมถึง `/` (ตรวจจาก VM เมื่อ 2026-10-27) คือ NFSv4 ยังปิดอยู่ที่ DSM
  → **File Services → NFS → Maximum NFS protocol = NFSv4.1** แล้ว deploy ใหม่ probe จะเลือก v4.1 เอง
- หลังย้ายไป v4.1 ให้ทดสอบ push ที่มี delta ใหญ่ก่อน และอย่าเอา `pack.threads=1` ออกโดยไม่ได้ทดสอบ

### กู้คืนจาก backup

repo อยู่บน NAS อยู่แล้ว (NAS snapshot ของ share ใช้กู้ไฟล์ได้) ส่วนฐานข้อมูลกู้จาก `backups\tmthub-db-*.zip`
ตามขั้นตอนใน https://forgejo.org/docs/latest/admin/upgrade/#backup-and-restore
