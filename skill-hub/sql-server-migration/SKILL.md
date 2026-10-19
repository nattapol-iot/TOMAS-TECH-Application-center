---
name: sql-server-migration
description: Write idempotent, re-runnable SQL Server (T-SQL) migrations with version guards, transactions, least-privilege grants and indexes, and test them on LocalDB before production. Use when the user adds or changes tables, columns, procedures or permissions in SQL Server.
---

# SQL Server Migration (re-runnable)

## แม่แบบ

```sql
-- Migration NNN: <what and why, 1-3 lines>.
SET XACT_ABORT ON;
SET NOCOUNT ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = NNN-1)
    THROW 5xxxx, 'Migration NNN-1 must be applied before migration NNN.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.example', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.example (
        id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_example PRIMARY KEY,
        name nvarchar(200) NOT NULL,
        created_at datetime2(0) NOT NULL CONSTRAINT DF_example_created_at DEFAULT SYSUTCDATETIME()
    );
END;

IF COL_LENGTH(N'dbo.example', N'note') IS NULL
    ALTER TABLE dbo.example ADD note nvarchar(1000) NULL;

COMMIT TRANSACTION;
GO

-- Grants in their own batch, only when the role exists.
IF DATABASE_PRINCIPAL_ID(N'app_role') IS NOT NULL
    GRANT SELECT, INSERT ON OBJECT::dbo.example TO [app_role];
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = NNN)
    INSERT dbo.schema_versions(version, name) VALUES (NNN, N'<name>');
GO
```

## กฎ

- **รันซ้ำได้เสมอ**: ทุก CREATE/ALTER ต้องมี guard (`OBJECT_ID`, `COL_LENGTH`, `sys.indexes`) หรือใช้ `CREATE OR ALTER` สำหรับ procedure/view
- **บันทึกเวอร์ชันเป็นขั้นสุดท้าย** เพื่อให้ migration ที่ล้มกลางทางรันใหม่ได้
- **ห้ามแก้ migration ที่ขึ้น production แล้ว** ให้เขียนไฟล์ใหม่แทน
- ตั้งชื่อ constraint เองทุกตัว (PK_, FK_, DF_, IX_, UQ_) ไม่ปล่อยให้ระบบตั้งชื่อสุ่ม
- เปลี่ยนชนิดหรือเพิ่ม NOT NULL ให้ทำ 3 ขั้น: เพิ่มเป็น NULL, เติมข้อมูล, แล้วค่อยเปลี่ยนเป็น NOT NULL
- ให้สิทธิ์แบบน้อยที่สุดกับ role ของแอป ไม่ใช้ `db_owner`
- procedure ที่ต้องสิทธิ์สูงกว่าแอป ใช้ `WITH EXECUTE AS OWNER` และตรวจ input ในตัว

## ทดสอบก่อนขึ้นจริง

```powershell
SqlLocalDB create MigTest -s
sqlcmd -S "(localdb)\MigTest" -E -b -i 001.sql -i 002.sql ... -i NNN.sql   # จากฐานว่าง
sqlcmd -S "(localdb)\MigTest" -E -b -d <db> -i NNN.sql                       # รันซ้ำต้องผ่าน
SqlLocalDB stop MigTest; SqlLocalDB delete MigTest
```
