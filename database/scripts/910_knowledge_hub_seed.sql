:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

-- =====================================================================
-- Knowledge & Document Hub — category tree, numbering and sample content.
--
--   !! APPLY THIS FILE WITH  sqlcmd -f 65001  !!
--
--   This file is UTF-8 and contains Thai and Japanese category names.
--   sqlcmd reads an input file in the system ANSI code page unless told
--   otherwise, so running it without -f 65001 stores every non-ASCII name as
--   mojibake — silently, with no error. It happened once already:
--
--       sqlcmd -S localhost -E -d <db> -b -f 65001 -i 910_knowledge_hub_seed.sql
--
--   The database column type is fine; nvarchar holds the text correctly. The
--   damage is done on the way in, by the client. If names look like
--   "เธกเธฒเธ•เธฃ" instead of "มาตรฐาน", this is why — repair with
--   backend-node/spike/repair-category-encoding.mjs.
--
-- Safe to run more than once: every insert is guarded, so re-running adds
-- nothing and changes nothing.  Sample documents carry no confidential
-- information and no attachments; they exist so the register, the workflow
-- and the acknowledgement screens have something real to show.
--
-- This is development and demonstration content.  It is deliberately NOT
-- part of migration 014, so a production database gets the schema without
-- the sample rows.
-- =====================================================================

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 15)
    THROW 51190, 'Migration 015 must be applied before seeding the Knowledge Hub.', 1;

BEGIN TRANSACTION;

DECLARE @actor bigint = (SELECT TOP 1 id FROM dbo.users WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id);
IF @actor IS NULL
    THROW 51191, 'At least one active user must exist before seeding the Knowledge Hub.', 1;

-- ---------------------------------------------------------------------
-- Numbering sequences.  Admin maintains these; the prefix and the scope
-- together produce STD-EE-0001, SOP-PR-0004, KB-SW-0025 and so on.
-- ---------------------------------------------------------------------
;WITH seed_sequences(prefix, scope_code, scope_name) AS (
    SELECT * FROM (VALUES
        (N'STD', N'ME',    N'Mechanical'),
        (N'STD', N'EE',    N'Electrical'),
        (N'STD', N'SW',    N'Software'),
        (N'STD', N'QA',    N'Quality & Safety'),
        (N'SOP', N'PR',    N'Procurement'),
        (N'SOP', N'PROJ',  N'Project Management'),
        (N'WI',  N'WH',    N'Warehouse'),
        (N'WI',  N'INST',  N'Installation'),
        (N'TMP', N'QT',    N'Estimate & Quotation'),
        (N'TMP', N'BOM',   N'BOM & Purchase Requisition'),
        (N'PRS', N'SALES', N'Sales Presentation'),
        (N'PRS', N'TECH',  N'Technical Presentation'),
        (N'KB',  N'SW',    N'Software Knowledge'),
        (N'KB',  N'EE',    N'Electrical Knowledge'),
        (N'KB',  N'ROBOT', N'Robot & Automation'),
        (N'LL',  N'PROJ',  N'Project Lessons Learned')
    ) AS v(prefix, scope_code, scope_name)
)
INSERT INTO dbo.knowledge_number_sequences(prefix, scope_code, scope_name)
SELECT s.prefix, s.scope_code, s.scope_name
FROM seed_sequences s
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.knowledge_number_sequences existing
    WHERE existing.prefix = s.prefix AND existing.scope_code = s.scope_code);

-- ---------------------------------------------------------------------
-- Category tree.  Top level first, then children resolved by parent code.
-- ---------------------------------------------------------------------
;WITH roots(code, name_en, name_th, name_ja, sort_order, default_type) AS (
    SELECT * FROM (VALUES
        (N'STANDARDS',    N'Standards & SOP',        N'มาตรฐานและ SOP',        N'標準・SOP',        10, N'Controlled Document'),
        (N'TEMPLATES',    N'Templates & Forms',      N'เทมเพลตและแบบฟอร์ม',     N'テンプレート・帳票', 20, N'Template'),
        (N'PRESENTATION', N'Presentation Library',   N'คลังพรีเซนเทชัน',        N'プレゼン資料',      30, N'Presentation'),
        (N'TECHNICAL',    N'Technical Knowledge',    N'ความรู้ทางเทคนิค',       N'技術ナレッジ',      40, N'Knowledge Article'),
        (N'LESSONS',      N'Lessons Learned',        N'บทเรียนจากโครงการ',      N'教訓',             50, N'Knowledge Article'),
        (N'TEAMSHARED',   N'Team Shared Documents',  N'เอกสารที่แชร์ในทีม',      N'チーム共有資料',    60, N'Working Document'),
        (N'PROJECTDOC',   N'Project Documents',      N'เอกสารโครงการ',          N'プロジェクト文書',  70, N'Project Document'),
        (N'SUPPLIERDOC',  N'Supplier Documents',     N'เอกสารผู้ขาย',           N'仕入先文書',        80, N'Supplier Document'),
        (N'ARCHIVE',      N'Archived Documents',     N'เอกสารที่จัดเก็บ',        N'アーカイブ',        90, NULL)
    ) AS v(code, name_en, name_th, name_ja, sort_order, default_type)
)
INSERT INTO dbo.knowledge_categories(code, name_en, name_th, name_ja, sort_order, default_document_type, created_by, updated_by)
SELECT r.code, r.name_en, r.name_th, r.name_ja, r.sort_order, r.default_type, @actor, @actor
FROM roots r
WHERE NOT EXISTS (SELECT 1 FROM dbo.knowledge_categories c WHERE c.code = r.code);

;WITH children(parent_code, code, name_en, name_th, name_ja, sort_order) AS (
    SELECT * FROM (VALUES
        (N'STANDARDS',    N'STD.COMPANY',   N'Company Standard',      N'มาตรฐานบริษัท',        N'全社標準',          11),
        (N'STANDARDS',    N'STD.ENG',       N'Engineering Standard',  N'มาตรฐานวิศวกรรม',      N'技術標準',          12),
        (N'STANDARDS',    N'STD.WI',        N'Work Instruction',      N'คู่มือปฏิบัติงาน',      N'作業手順書',        13),
        (N'STANDARDS',    N'STD.SAFETY',    N'Safety & Quality',      N'ความปลอดภัยและคุณภาพ', N'安全・品質',        14),
        (N'TEMPLATES',    N'TMP.ESTIMATE',  N'Estimate Template',     N'เทมเพลตประมาณการ',     N'見積テンプレート',   21),
        (N'TEMPLATES',    N'TMP.BOMPR',     N'BOM / PR Template',     N'เทมเพลต BOM / PR',     N'BOM・PRテンプレート', 22),
        (N'TEMPLATES',    N'TMP.CHECKLIST', N'Checklist',             N'เช็กลิสต์',            N'チェックリスト',     23),
        (N'TEMPLATES',    N'TMP.REPORT',    N'Report Form',           N'แบบฟอร์มรายงาน',       N'報告書式',          24),
        (N'PRESENTATION', N'PRS.COMPANY',   N'Company Profile',       N'โปรไฟล์บริษัท',        N'会社概要',          31),
        (N'PRESENTATION', N'PRS.SALES',     N'Sales Presentation',    N'พรีเซนเทชันขาย',       N'営業資料',          32),
        (N'PRESENTATION', N'PRS.TECH',      N'Technical Presentation',N'พรีเซนเทชันเทคนิค',    N'技術資料',          33),
        (N'PRESENTATION', N'PRS.TRAINING',  N'Training Material',     N'สื่อการอบรม',          N'研修資料',          34),
        (N'PRESENTATION', N'PRS.SLIDES',    N'Approved Slide Library',N'คลังสไลด์ที่อนุมัติ',   N'承認済スライド',     35),
        (N'TECHNICAL',    N'TEC.ME',        N'Mechanical',            N'เครื่องกล',            N'機械',             41),
        (N'TECHNICAL',    N'TEC.EE',        N'Electrical',            N'ไฟฟ้า',                N'電気',             42),
        (N'TECHNICAL',    N'TEC.SW',        N'Software',              N'ซอฟต์แวร์',            N'ソフトウェア',      43),
        (N'TECHNICAL',    N'TEC.ROBOT',     N'Robot / Automation',    N'หุ่นยนต์และออโตเมชัน',  N'ロボット・自動化',   44),
        (N'TECHNICAL',    N'TEC.TROUBLE',   N'Troubleshooting',       N'การแก้ปัญหา',          N'トラブルシューティング', 45)
    ) AS v(parent_code, code, name_en, name_th, name_ja, sort_order)
)
INSERT INTO dbo.knowledge_categories(parent_id, code, name_en, name_th, name_ja, sort_order, created_by, updated_by)
SELECT p.id, ch.code, ch.name_en, ch.name_th, ch.name_ja, ch.sort_order, @actor, @actor
FROM children ch
INNER JOIN dbo.knowledge_categories p ON p.code = ch.parent_code
WHERE NOT EXISTS (SELECT 1 FROM dbo.knowledge_categories c WHERE c.code = ch.code);

-- ---------------------------------------------------------------------
-- Sample documents.  Metadata only — no files, so no storage is touched.
-- Each one is created straight into a realistic state so the register
-- shows Draft, In Review and Published side by side.
-- ---------------------------------------------------------------------
DECLARE @samples TABLE (
    document_no nvarchar(40),
    title nvarchar(300),
    document_type nvarchar(30),
    category_code nvarchar(40),
    department nvarchar(200),
    status nvarchar(30),
    review_date date,
    tags nvarchar(500)
);

INSERT INTO @samples VALUES
    (N'STD-EE-0001', N'Control panel wiring and labelling standard',      N'Controlled Document', N'STD.ENG',      N'Electrical', N'Published', '2027-03-31', N'electrical;panel;wiring'),
    (N'STD-ME-0001', N'Conveyor frame fabrication tolerance standard',    N'Controlled Document', N'STD.ENG',      N'Mechanical', N'Published', '2027-06-30', N'mechanical;fabrication'),
    (N'SOP-PR-0001', N'Raising and approving a purchase requisition',     N'Controlled Document', N'STD.COMPANY',  N'Purchasing', N'Published', '2027-01-31', N'procurement;pr;approval'),
    (N'WI-WH-0001',  N'Goods receiving and quarantine work instruction',  N'Controlled Document', N'STD.WI',       N'Warehouse',  N'In Review', '2027-09-30', N'warehouse;receiving;quarantine'),
    (N'TMP-QT-0001', N'Standard estimate cost workbook',                  N'Template',            N'TMP.ESTIMATE', N'Engineering',N'Published', NULL,         N'estimate;template'),
    (N'PRS-TECH-0001', N'WMS and WCS solution overview',                  N'Presentation',        N'PRS.TECH',     N'Engineering',N'Published', NULL,         N'wms;wcs;presentation'),
    (N'PRS-SALES-0001', N'IoT team capability introduction',              N'Presentation',        N'PRS.TRAINING', N'Sales',      N'Draft',     NULL,         N'training;introduction');

DECLARE @no nvarchar(40), @title nvarchar(300), @type nvarchar(30), @catcode nvarchar(40),
        @dept nvarchar(200), @status nvarchar(30), @review date, @tags nvarchar(500);

DECLARE sample_cursor CURSOR LOCAL FAST_FORWARD FOR
    SELECT document_no, title, document_type, category_code, department, status, review_date, tags FROM @samples;
OPEN sample_cursor;
FETCH NEXT FROM sample_cursor INTO @no, @title, @type, @catcode, @dept, @status, @review, @tags;

WHILE @@FETCH_STATUS = 0
BEGIN
    IF NOT EXISTS (SELECT 1 FROM dbo.knowledge_documents WHERE document_no = @no)
    BEGIN
        DECLARE @cat bigint = (SELECT id FROM dbo.knowledge_categories WHERE code = @catcode);
        DECLARE @doc bigint, @ver bigint;

        INSERT INTO dbo.knowledge_documents(
            document_no, title, description, document_type, category_id, department_code,
            owner_id, confidentiality, current_status, language, tags, next_review_date,
            created_by, updated_by)
        VALUES (@no, @title, N'Seeded sample content for development and demonstration.',
                @type, @cat, @dept, @actor, N'Company', @status, 'EN', @tags, @review, @actor, @actor);
        SET @doc = SCOPE_IDENTITY();

        IF @status = N'Published'
            INSERT INTO dbo.knowledge_document_versions(
                document_id, revision, version_number, change_type, change_summary, status,
                effective_date, created_by, reviewed_by, reviewed_at, approved_by, approved_at,
                published_by, published_at)
            VALUES (@doc, N'R00', 1, N'Major', N'Initial issue', N'Published',
                    CAST(DATEADD(day, -30, SYSUTCDATETIME()) AS date), @actor, @actor, SYSUTCDATETIME(),
                    @actor, SYSUTCDATETIME(), @actor, SYSUTCDATETIME());
        ELSE
            INSERT INTO dbo.knowledge_document_versions(
                document_id, revision, version_number, change_type, change_summary, status, created_by)
            VALUES (@doc, N'R00', 1, N'Major', N'Initial issue', @status, @actor);

        SET @ver = SCOPE_IDENTITY();

        UPDATE dbo.knowledge_documents SET current_version_id = @ver WHERE id = @doc;

        INSERT INTO dbo.knowledge_audit_events(document_id, document_version_id, actor_id, actor_role, action, after_json, reason)
        VALUES (@doc, @ver, @actor, N'Seed', N'Create',
                (SELECT @no AS documentNumber, @title AS title FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
                N'Seeded development content');
    END

    FETCH NEXT FROM sample_cursor INTO @no, @title, @type, @catcode, @dept, @status, @review, @tags;
END

CLOSE sample_cursor;
DEALLOCATE sample_cursor;

-- The sample rows above use human-readable document numbers. Keep the
-- allocator at or beyond those values so the first real document can never
-- collide with a seeded number (for example STD-EE-0001).
;WITH issued AS (
    SELECT
        s.id,
        MAX(TRY_CONVERT(int, RIGHT(d.document_no, s.padding))) AS highest_number
    FROM dbo.knowledge_number_sequences s
    LEFT JOIN dbo.knowledge_documents d
      ON d.document_no LIKE s.prefix + N'-' + s.scope_code + N'-%'
    GROUP BY s.id
)
UPDATE s
   SET last_number = issued.highest_number,
       updated_at = SYSUTCDATETIME()
FROM dbo.knowledge_number_sequences s
INNER JOIN issued ON issued.id = s.id
WHERE issued.highest_number IS NOT NULL
  AND issued.highest_number > s.last_number;

-- ---------------------------------------------------------------------
-- Sample knowledge articles
-- ---------------------------------------------------------------------
;WITH articles(slug, title, summary, article_type, category_code, status, content) AS (
    SELECT * FROM (VALUES
        (N'keyence-scanner-frame-timeout',
         N'KEYENCE scanner interface times out under sustained load',
         N'Connection pool exhaustion when a malformed frame is not released.',
         N'Troubleshooting', N'TEC.TROUBLE', N'Published',
         N'## Symptom
The scan service stops responding after roughly 200 consecutive reads and needs a restart.

## Root cause
A malformed frame that is not in the published protocol document leaves its connection unreleased, so the pool is exhausted.

## Countermeasure
Release the connection in a finally block and reject unknown frame types explicitly rather than silently.

## Verification
Run 500 consecutive scans at 5 per second and confirm the pool size returns to its idle value.'),
        (N'commissioning-effort-underestimated',
         N'Commissioning effort is routinely underestimated on multi-CTU sites',
         N'Eight closed projects show commissioning actuals averaging 92% above estimate.',
         N'Lessons Learned', N'LESSONS', N'Published',
         N'## What happened
Across eight closed projects, commissioning man-days averaged 92% above the estimated figure, while PLC and electrical stayed within 6%.

## Why
The template standard was written for a single-CTU site and was never revised for multi-CTU work, where integration testing scales faster than the equipment count.

## What to do
Raise the commissioning standard in the project template by 60% for sites with three or more CTUs, and review again after four more projects close.')
    ) AS v(slug, title, summary, article_type, category_code, status, content)
)
INSERT INTO dbo.knowledge_articles(slug, title, summary, content, article_type, category_id, owner_id, status, created_by, updated_by)
SELECT a.slug, a.title, a.summary, a.content, a.article_type, c.id, @actor, a.status, @actor, @actor
FROM articles a
INNER JOIN dbo.knowledge_categories c ON c.code = a.category_code
WHERE NOT EXISTS (SELECT 1 FROM dbo.knowledge_articles existing WHERE existing.slug = a.slug);

COMMIT TRANSACTION;

PRINT 'Knowledge Hub seed complete.';
SELECT
    (SELECT COUNT(*) FROM dbo.knowledge_categories)       AS categories,
    (SELECT COUNT(*) FROM dbo.knowledge_number_sequences) AS sequences,
    (SELECT COUNT(*) FROM dbo.knowledge_documents)        AS documents,
    (SELECT COUNT(*) FROM dbo.knowledge_document_versions) AS versions,
    (SELECT COUNT(*) FROM dbo.knowledge_articles)         AS articles;
GO
