# HANDOFF — TMTHub (git server ของแผนก)

ส่งต่องานเฉพาะส่วน TMTHub ให้อีก session ทำต่อ · เขียนเมื่อ 2026-10-27 จาก `main` @ `8c91db80`
ก่อนเริ่ม ให้ตรวจไฟล์นี้กับ Git/source ปัจจุบันก่อน (กฎใน `AGENTS.md`) และอ่าน `docs/TMTHUB.md` (คู่มือใช้งานและผู้ดูแล)

## TMTHub คืออะไร / อยู่ตรงไหน

- Forgejo 15.0.9 (`codeberg.org/forgejo/forgejo:15.0.9`) ที่ `https://tmthub.tomastc.com:8446` อยู่หลัง Caddy บน iot VM เครื่องเดียวกับ Engineering Center
- Login ผ่าน TMT ID (Keycloak realm `internal`) เท่านั้น ส่วน git ใช้ personal access token ผ่าน HTTPS (ปิด SSH ไว้)
- Repository / LFS / attachment อยู่บน NAS `100.64.0.53` ที่ `/volume1/IoT Department/IoT Team Center/TMTHub` (volume `tmthub-nas` mount ด้วย NFS)
- SQLite + app.ini อยู่บนดิสก์ VM (volume `tmthub-data`) และ `tmthub-backup` copy ขึ้น NAS ทุกครั้งที่ deploy และทุกวัน เก็บ 14 ชุด
- Engineering Center ใช้ TMTHub เป็น backend ของแท็บ "Repository โค้ดโครงการ" ใน Download Center (`TMTHUB_API_URL=http://tmthub:3000`, token ออกโดย deploy.sh)

## ไฟล์ที่เกี่ยวข้อง

| เรื่อง | ไฟล์ |
|---|---|
| service, env ของ Forgejo, NFS volume, backup | `docker-compose.tls.yml` (service `tmthub`, `tmthub-backup`, profile `tmthub`) |
| deploy: DNS (Cloudflare), probe NFS, start, ออก API token | `scripts/macos/deploy.sh` → `deploy_tmthub()` (~บรรทัด 187+) |
| reverse proxy / TLS / HTTP สำหรับ git push | `deploy/caddy/Caddyfile` (site `:8446`) |
| backup script | `deploy/tmthub/backup.sh` |
| API ของ Download Center ที่คุยกับ Forgejo | `backend-node/src/routes/tmthub-repositories.ts` (ใช้เมื่อ `config.tmthub` มีค่า มิฉะนั้นใช้ `source-repositories.ts` แบบโฟลเดอร์บน NAS) |
| สิทธิ์สร้าง/แก้ repo | `repository.write` (migration `082_repository_write.sql`): Admin, Engineer, Engineering Manager, Project Manager |
| UI | `app/system/production/SourceRepositories.tsx` |
| เชื่อมกับ Installed Base | software asset ระบุ TMTHub repo ได้ (`backend-node/src/routes/installed-assets.ts`) |
| คู่มือ | `docs/TMTHUB.md` |

## สิ่งที่ทำเสร็จและยืนยันแล้ว

- **Push ล้มเหลว "premature end of pack file"** (PR #17, #18, #19)
  - สาเหตุจริงคือ `index-pack` แบบหลาย thread อ่านไฟล์ pack ที่กำลังเขียนผ่าน NFS แล้วได้ข้อมูลไม่ครบ
  - แก้ด้วย `FORGEJO__git_0X2E_config__pack_0X2E_threads: "1"`; member ยืนยันแล้วว่า push ผ่าน
  - #17 และ #18 (HTTP/1.1, full-duplex) เป็นการวินิจฉัยที่ไม่ใช่สาเหตุ แต่ยังคงไว้: Caddy validate ก่อน deploy และ git ใช้ HTTP/1 แบบ full-duplex
- **หน้า Repository ใน Download Center** จัดกลุ่มตามโครงการ แสดงแบบ GitHub และมีคอลัมน์ About/Clone (PR #20)
- **Engineer สร้าง repo ได้** (PR #23, migration 082)
- Deploy ล่าสุดของ #33 (2026-10-21): `TMTHub is healthy`

## งานที่ยังค้าง (เรียงตามความสำคัญ)

1. **Rotate client secret ของ TMTHub ใน Keycloak** (ค้างจากรอบก่อน ผู้ใช้ต้องทำเองหรืออนุญาตก่อน)
   - ออก secret ใหม่ที่ client `tmthub` ใน realm `internal`
   - deploy.sh (~บรรทัด 299–310) อ่านค่าจาก GitHub Actions secret `TMTHUB_OIDC_CLIENT_SECRET` (หรือ `.env`) แล้วสั่ง Forgejo `update-oauth` ให้เองทุก deploy
   - ขั้นตอน: ผู้ใช้ออก secret ใหม่ใน Keycloak → ใส่ใน GitHub secret `TMTHUB_OIDC_CLIENT_SECRET` (`gh secret set` ทำได้ถ้าผู้ใช้ส่งค่าผ่านช่องทางที่ไม่ใช่ chat) → re-run Deploy → ทดสอบ login ด้วย TMT ID
   - ห้ามขอ secret ทาง chat
2. **NFS 4.1 ใช้ไม่ได้ทุกครั้งที่ deploy**
   - Log มี `tmthub-nfs-probe docker: Error ... error while mounting volume` สองครั้ง (4.1 ทั้งสอง path) แล้ว fallback เป็น `nfsvers=3,nolock` ซึ่งใช้งานได้
   - ไม่กระทบการใช้งาน แต่ deploy ช้าลงและ log ดูเหมือน error
   - ทางเลือก (เลือกอย่างใดอย่างหนึ่ง):
     - pin ค่าใน `.env` ของ server: `TMTHUB_NFS_PATH=/volume1/IoT Department/IoT Team Center/TMTHub` และ `TMTHUB_NFS_OPTIONS=nfsvers=3,nolock,hard,timeo=600,retrans=2,noresvport` (deploy.sh รองรับแล้ว จะข้าม probe)
     - เปิด NFSv4.1 บน Synology แล้วให้ probe เลือกเอง
   - ถ้าย้ายไป 4.1 ให้ทดสอบ push ที่มี delta ใหญ่ซ้ำ เพราะปัญหาข้อแรกผูกกับ NFS
3. **ความเร็ว push / clone**
   - `pack.threads=1` ทำให้ push repo ใหญ่ช้าลง
   - ถ้าย้ายไป NFSv4.1 หรือย้าย repo ออกจาก NFS ได้ ค่อยลองคืนค่า threads แล้วทดสอบ push ใหญ่ซ้ำ
   - ห้ามเอา `pack.threads` ออกโดยไม่ได้ทดสอบ
4. **Repo ที่ member clone มาจาก GitHub**
   - member เคย push repo ที่ clone จาก GitHub เข้า TMTHub (เช่น cpf-pegasus)
   - ถ้าต้องการให้แสดงใต้โครงการใน Download Center ต้องผูก topic `project-<id>` (ตั้งได้จากหน้า Repository หรือ API `setTopics`)
5. (ทางเลือก) mirror จาก GitHub อัตโนมัติด้วย Forgejo pull mirror ยังไม่ได้ทำ และต้องถามผู้ใช้ก่อนว่าต้องการไหม

## วิธีเข้าถึง / ตรวจสอบ

- Server: ต่อ VPN แล้ว `ssh -i "C:\Users\TMT-E14-002\Downloads\LINE WORKS\iot-team-center-handoff\iot-guest_ed25519" tomastc@100.64.0.3`
- Container: `src-tmthub-1`, `src-tmthub-backup-1`, API อยู่ที่ `src-api-1`
- ดู log: `docker logs --tail 100 src-tmthub-1` หรือดู log file ใน volume `tmthub-data` ที่ `/data/gitea/log`
- Health: `curl -s https://tmthub.tomastc.com:8446/api/healthz`
- Deploy ทำผ่าน GitHub Actions เท่านั้น
  - merge เข้า `main` แล้ว workflow "Deploy" จะรันหลัง CI ผ่าน
  - ตรวจด้วย `gh run list --branch main --workflow Deploy` และ `gh run view <id> --log | grep -E "TMTHub|nfs"`
- **ข้อจำกัด:** session ก่อนอ่าน secret ใน production (`.env`, API token) ไม่ได้ (classifier ปฏิเสธ) อย่าพยายามเลี่ยง ให้ตรวจผ่าน behaviour เช่น health, push ทดสอบ หรือคำสั่งที่ไม่แสดงค่า secret

## กฎของ repo ที่ต้องทำตาม

- งานที่เสร็จและผ่านการทดสอบแล้ว: commit, เปิด PR, รอ CI, merge, deploy, ตรวจ health แล้วรายงานเป็นภาษาไทย (อนุญาตไว้แล้วใน `AGENTS.md`)
- ห้าม force-push และห้ามขอรหัสผ่านทาง chat
- หลังแก้โค้ดให้รัน `node docs/context/generate.mjs`
