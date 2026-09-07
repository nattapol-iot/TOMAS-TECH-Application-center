:on error exit
-- Controlled employee roster import. Example:
-- sqlcmd -S localhost -E -v DatabaseName="IoTTeamCenter" ImportActorEmail="admin@tomastc.com" -i database/scripts/095_import_employee_master.sql
USE [$(DatabaseName)];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 22)
    THROW 51150, 'Required schema version 22 is not installed.', 1;

DECLARE @actor_id bigint = (
    SELECT id FROM dbo.users
    WHERE email = N'$(ImportActorEmail)' AND is_active = 1 AND deleted_at IS NULL
);
IF @actor_id IS NULL
    THROW 51151, 'ImportActorEmail must identify an active application user.', 1;

DECLARE @source table (
    employee_no int NOT NULL PRIMARY KEY,
    name_en nvarchar(200) NOT NULL,
    name_th nvarchar(200) NOT NULL,
    department nvarchar(100) NOT NULL,
    job_title nvarchar(500) NOT NULL,
    mobile nvarchar(50) NOT NULL,
    email nvarchar(256) NOT NULL,
    nickname nvarchar(100) NOT NULL,
    birth_date date NULL,
    uniform_size nvarchar(50) NOT NULL,
    shoe_size nvarchar(50) NOT NULL,
    start_work_date date NOT NULL,
    end_work_date date NULL,
    position nvarchar(100) NOT NULL
);

INSERT INTO @source VALUES
(8,  N'Nattapol Poeam',       N'ณัฐพล โพธิ์เอี่ยม',    N'IoT Engineer Dept.',        N'General Manager / IoT Engineer Dept. Manager / Project Leader', N'+66-85-995-0178', N'nattapol.p@tomastc.com',   N'Boy',   '19960322', N'XL (Male)', N'', '20230417', NULL, N'Technical Architect'),
(12, N'Phatthadon Inthachot', N'พัทธดนย์ อินทะโชติ',   N'IoT Engineer Dept.',        N'IoT Engineer',                                                   N'+66-99-132-8444', N'phatthadon.i@tomastc.com', N'Toy',   '19970506', N'XL (Male)', N'', '20240604', NULL, N'Junior Engineer'),
(13, N'Konlawat Saechee',     N'กลวัชร แซ่ชี้',        N'IoT Engineer Dept.',        N'IoT Engineer Dept. Assistant Manager / Project Leader',         N'+66-94-487-2879', N'konlawat.s@tomastc.com',   N'Nook',  '19920213', N'L (Male)',  N'', '20240506', NULL, N'Lead Engineer'),
(14, N'Nattapong Sukcharoen', N'ณัฐพงศ์ สุขเจริญ',     N'IoT Engineer Dept.',        N'IoT Engineer',                                                   N'+66-82-712-5067', N'nattapong.s@tomastc.com',  N'Game',  '19990915', N'L (Male)',  N'', '20240901', NULL, N'Middle Engineer'),
(16, N'Purinat Thongbaiyai',  N'ภูริณัฐ ทองใบใหญ่',    N'IoT Engineer Dept.',        N'IoT Engineer',                                                   N'+66-89-006-9992', N'purinat.t@tomastc.com',    N'Dream', '19970129', N'L (Male)',  N'', '20241021', NULL, N'Senior Engineer'),
(19, N'Soemsak Powe',         N'เสริมศักดิ์ โพธิ์หวี', N'IoT Engineer Dept.',        N'IoT Engineer',                                                   N'+66-89-897-0712', N'sermsak.p@tomastc.com',    N'Nok',   '19780902', N'L (Male)',  N'', '20241216', NULL, N'Senior Engineer'),
(22, N'Pattanasak Chaonchom', N'พัฒนศักดิ์ ฉอ้อนโฉม',  N'IoT Engineer Dept.',        N'Software Engineer',                                              N'+66-94-787-9319', N'pattanasak.c@tomastc.com', N'Kong',  '20020719', N'L (Male)',  N'', '20250310', NULL, N'Middle Engineer'),
(24, N'Suphawat Tinaso',      N'ศุภวัฒน์ ตินะโส',      N'IoT Engineer Dept.',        N'Software Engineer',                                              N'+66-93-538-4867', N'suphawat.t@tomastc.com',   N'Book',  '19951012', N'L (Male)',  N'', '20250623', NULL, N'Middle Engineer'),
(26, N'Warit Chunlaka',       N'วริษฏ์ จุลกะ',         N'Mechanical Engineer Dept.', N'Mechanical Engineering Manager',                                 N'+66-83-263-5076', N'warit.c@tomastc.com',      N'Natt',  '19891026', N'L (Male)',  N'', '20250813', NULL, N'Lead Engineer'),
(27, N'Nattawat Hannok',      N'ณัฐวัฒน์ หาญนอก',      N'Mechanical Engineer Dept.', N'Mechanical Engineering',                                         N'+66-83-516-5322', N'nattawat.h@tomastc.com',   N'Sab',   '19960610', N'L (Male)',  N'', '20250813', NULL, N'Middle Engineer'),
(28, N'Worawit Khantamool',   N'วรวิทย์ ขันธมูล',      N'IoT Engineer Dept.',        N'Software Engineer',                                              N'+66-80-043-3394', N'worawit.k@tomastc.com',    N'Aum',   '19990912', N'L (Male)',  N'', '20250804', NULL, N'Senior Engineer'),
(32, N'Taweesak Suriyon',     N'ทวีศักดิ์ สุริยนต์',   N'Mechanical Engineer Dept.', N'IoT Engineer',                                                   N'+66-87-568-1279', N'taweesak.s@tomastc.com',   N'Mos',   '19910513', N'XL (Male)', N'', '20251008', NULL, N'Senior Engineer'),
(38, N'Tachapon Mulmanee',    N'เตชภณ มูลมณี',         N'IoT Engineer Dept.',        N'SA & Software Engineer',                                         N'+66-94-145-9953', N'tachapon.m@tomastc.com',   N'Tae',   '19940318', N'L (Male)',  N'', '20260105', NULL, N'Lead Engineer'),
(48, N'Nattanun Nunet',       N'ณัฐนันท์ หนูเนตร',     N'IoT Engineer Dept.',        N'IoT Engineer',                                                   N'+66-91-003-5956', N'nattanun.n@tomastc.com',   N'Donut', '19970613', N'XL (Male)', N'', '20260518', NULL, N'Middle Engineer'),
(49, N'Chakkrit Sokun',       N'จักรกฤษ โสกูล',        N'Mechanical Engineer Dept.', N'Mechanical Engineering',                                         N'+66-94-071-4391', N'chakkrit.s@tomastc.com',   N'Boy',   '19940428', N'L (Male)',  N'', '20260521', NULL, N'Middle Engineer');

IF EXISTS (
    SELECT 1
    FROM @source source
    INNER JOIN dbo.employees employee ON employee.email = source.email
    WHERE employee.employee_no <> source.employee_no AND employee.deleted_at IS NULL
)
    THROW 51152, 'An employee email is already assigned to another employee number.', 1;

DECLARE @changed table (
    action nvarchar(10) NOT NULL,
    id bigint NOT NULL,
    employee_no int NOT NULL,
    name_en nvarchar(200) NOT NULL,
    email nvarchar(256) NOT NULL
);

BEGIN TRANSACTION;

MERGE dbo.employees WITH (HOLDLOCK) AS target
USING @source AS source
ON target.employee_no = source.employee_no AND target.deleted_at IS NULL
WHEN MATCHED THEN UPDATE SET
    name_en = source.name_en,
    name_th = source.name_th,
    department = source.department,
    job_title = source.job_title,
    mobile = source.mobile,
    email = source.email,
    nickname = source.nickname,
    birth_date = source.birth_date,
    uniform_size = source.uniform_size,
    shoe_size = source.shoe_size,
    start_work_date = source.start_work_date,
    end_work_date = source.end_work_date,
    position = source.position,
    is_active = 1,
    updated_by = @actor_id,
    updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (
    employee_no, name_en, name_th, department, job_title, mobile, email, nickname,
    birth_date, uniform_size, shoe_size, start_work_date, end_work_date, position,
    user_id, is_active, created_by, updated_by)
VALUES (
    source.employee_no, source.name_en, source.name_th, source.department, source.job_title,
    source.mobile, source.email, source.nickname, source.birth_date, source.uniform_size,
    source.shoe_size, source.start_work_date, source.end_work_date, source.position,
    NULL, 1, @actor_id, @actor_id)
OUTPUT $action, inserted.id, inserted.employee_no, inserted.name_en, inserted.email
INTO @changed(action, id, employee_no, name_en, email);

DECLARE @changed_employee_id bigint;
DECLARE changed_employee_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT id FROM @changed ORDER BY id;
OPEN changed_employee_cursor;
FETCH NEXT FROM changed_employee_cursor INTO @changed_employee_id;
WHILE @@FETCH_STATUS = 0
BEGIN
    EXEC dbo.sync_employee_directory_user @employee_id = @changed_employee_id;
    FETCH NEXT FROM changed_employee_cursor INTO @changed_employee_id;
END;
CLOSE changed_employee_cursor;
DEALLOCATE changed_employee_cursor;

INSERT INTO dbo.audit_log (
    actor_id, entity_type, entity_id, entity_no, action, after_json, reason)
SELECT
    @actor_id,
    N'Employee',
    changed.id,
    CONVERT(nvarchar(50), changed.employee_no),
    CASE changed.action WHEN N'INSERT' THEN N'Imported' ELSE N'Roster synchronized' END,
    (SELECT changed.employee_no AS employeeNo, changed.name_en AS nameEn, changed.email AS email FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
    N'Controlled employee roster import'
FROM @changed changed;

COMMIT TRANSACTION;

SELECT action, id, employee_no, name_en, email
FROM @changed
ORDER BY employee_no;
GO
