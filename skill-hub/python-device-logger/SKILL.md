---
name: python-device-logger
description: Scaffold a robust Python data logger that polls Modbus/Serial/MQTT devices and writes CSV or SQL, with retry, rotating logs, config file and running as a Windows service. Use when the user wants "โปรแกรมเก็บข้อมูล", "data logger", "อ่านค่ามาเก็บ" in Python.
---

# Python Device Data Logger

## โครงสร้างโปรเจกต์

```
logger/
  config.yaml          อุปกรณ์ tag รอบ poll และปลายทาง (ไม่มีรหัสผ่าน)
  .env                 รหัสผ่าน / connection string (ไม่ commit)
  main.py              loop หลัก
  sources/modbus.py    อ่านอุปกรณ์ (pymodbus)
  sinks/csv_sink.py    เขียน CSV แยกไฟล์รายวัน
  sinks/sql_sink.py    เขียน SQL Server (pyodbc) แบบ batch
  requirements.txt
  install-service.ps1  ติดตั้งเป็น Windows service (NSSM)
```

## หลักการที่ต้องมี

1. **รอบ poll คงที่**: ใช้ `time.monotonic()` คำนวณเวลารอบถัดไป ไม่ใช่ `sleep(interval)` เฉย ๆ
2. **อุปกรณ์หนึ่งตัวพังต้องไม่หยุดตัวอื่น**: try/except แยกต่ออุปกรณ์ บันทึก quality = bad แล้วไปต่อ
3. **Reconnect แบบ backoff**: 1, 2, 5, 10, 30 วินาที แล้วคงที่
4. **ไม่ทำข้อมูลหาย**: ถ้าเขียน SQL ไม่ได้ให้เก็บลง CSV/คิวในเครื่องก่อน แล้วส่งย้อนหลัง
5. **Log**: `logging.handlers.TimedRotatingFileHandler` เก็บ 14 วัน และตั้ง level ได้จาก config
6. **เวลา**: บันทึกเป็น UTC และแปลงเวลาเฉพาะตอนแสดงผล
7. **ปิดโปรแกรมได้สะอาด**: จับ SIGINT/SIGTERM แล้ว flush ข้อมูลก่อนออก

## ตัวอย่าง loop หลัก

```python
next_run = time.monotonic()
while not stop.is_set():
    for device in devices:
        try:
            rows = device.read()
        except Exception as error:
            log.warning("read failed %s: %s", device.name, error)
            rows = device.bad_quality_rows()
        sink.write(rows)
    next_run += interval
    stop.wait(max(0, next_run - time.monotonic()))
```

## ติดตั้งเป็น service (Windows)

```powershell
nssm install TMTLogger "C:\logger\.venv\Scripts\python.exe" "C:\logger\main.py"
nssm set TMTLogger AppDirectory C:\logger
nssm set TMTLogger Start SERVICE_AUTO_START
```

## กฎ

- pin เวอร์ชันใน requirements.txt
- ห้ามฝังรหัสผ่านในโค้ด ให้อ่านจาก `.env` หรือ Windows Credential Manager
- ให้คำสั่งทดสอบที่รันได้ทันที เช่น `python main.py --once --dry-run`
