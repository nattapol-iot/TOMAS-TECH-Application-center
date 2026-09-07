-- =====================================================================
-- Sales Intake & Site Visit — master data seed.
--
-- Requires migration 016.
--
-- !! RUN THIS WITH  sqlcmd -f 65001  !!
-- The script contains Thai and Japanese literals. Without -f 65001 sqlcmd
-- reads the file in the system ANSI code page, stores mis-decoded bytes, and
-- reports no error at all. Migration 014's seed was corrupted exactly this way
-- and needed a repair pass; do not repeat it.
--
--   sqlcmd -S localhost -E -d <database> -f 65001 -b -i database/scripts/920_site_visit_master_seed.sql
--
-- Idempotent: every insert is guarded by NOT EXISTS on the natural key, so a
-- second run changes nothing. It seeds reference data only — no intake, no
-- visit, no customer.
-- =====================================================================
:on error exit
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 16)
    THROW 51199, 'Migration 016 must be applied before the site visit master seed.', 1;

DECLARE @actor bigint = (
    SELECT TOP (1) u.id
    FROM dbo.users u
    INNER JOIN dbo.roles r ON r.id = u.role_id
    WHERE u.is_active = 1 AND u.deleted_at IS NULL AND r.code = N'Admin'
    ORDER BY u.id);
IF @actor IS NULL
    THROW 51200, 'An active administrator is required before seeding site visit master data.', 1;


-- ---------------------------------------------------------------------
-- Visit purposes
-- ---------------------------------------------------------------------
INSERT INTO dbo.visit_types (code, name_en, name_th, name_ja, description,
    default_duration_minutes, default_engineer_count, requires_manager_approval, sort_order, created_by, updated_by)
SELECT v.code, v.name_en, v.name_th, v.name_ja, v.description,
       v.duration, v.engineers, v.manager_approval, v.sort_order, @actor, @actor
FROM (VALUES
    (N'PRE_SALES_SURVEY',        N'Pre-sales Survey',         N'สำรวจหน้างานก่อนการขาย',     N'提案前現地調査',     N'Understand the site before quoting.',                       240, 1, 0, 10),
    (N'REQUIREMENT_MEETING',     N'Requirement Meeting',      N'ประชุมเก็บความต้องการ',       N'要件ヒアリング',      N'Sit with the customer and agree what is being asked for.',  180, 1, 0, 20),
    (N'MACHINE_INSPECTION',      N'Machine Inspection',       N'ตรวจสอบเครื่องจักร',          N'機械点検',           N'Inspect an existing machine and record its condition.',     240, 1, 0, 30),
    (N'TROUBLESHOOTING',         N'Troubleshooting',          N'แก้ไขปัญหาหน้างาน',           N'トラブル対応',        N'Diagnose a fault the customer is living with today.',       300, 1, 0, 40),
    (N'MECHANICAL_SURVEY',       N'Mechanical Survey',        N'สำรวจงานเครื่องกล',           N'機械調査',           N'Measure and record the mechanical situation.',              300, 1, 0, 50),
    (N'ELECTRICAL_SURVEY',       N'Electrical Survey',        N'สำรวจงานไฟฟ้า',               N'電気調査',           N'Panel, supply, earthing and cable route survey.',           300, 1, 0, 60),
    (N'SOFTWARE_PLC_SURVEY',     N'Software / PLC Survey',    N'สำรวจซอฟต์แวร์และ PLC',       N'ソフト・PLC調査',     N'Read the existing control program and interfaces.',         300, 1, 0, 70),
    (N'ROBOT_APPLICATION_SURVEY',N'Robot Application Survey', N'สำรวจงานหุ่นยนต์',            N'ロボット適用調査',     N'Reach, payload, cycle and safety envelope for a robot cell.',360, 2, 0, 80),
    (N'SAFETY_ASSESSMENT',       N'Safety Assessment',        N'ประเมินความปลอดภัย',          N'安全性評価',          N'Risk assessment against the customer safety standard.',     300, 2, 1, 90),
    (N'INSTALLATION',            N'Installation',             N'ติดตั้ง',                     N'据付',               N'Install equipment on the customer site.',                   480, 2, 1, 100),
    (N'COMMISSIONING',           N'Commissioning',            N'ทดสอบและส่งมอบระบบ',          N'試運転',             N'Bring the system into service and prove it.',               480, 2, 1, 110),
    (N'TRAINING',                N'Training',                 N'อบรมการใช้งาน',               N'教育訓練',            N'Train the customer operators or maintenance team.',         360, 1, 0, 120),
    (N'PREVENTIVE_MAINTENANCE',  N'Preventive Maintenance',   N'บำรุงรักษาเชิงป้องกัน',       N'予防保全',            N'Scheduled maintenance visit.',                              300, 1, 0, 130),
    (N'AFTER_SALES_SUPPORT',     N'After-sales Support',      N'บริการหลังการขาย',            N'アフターサポート',     N'Support an installed system after handover.',               240, 1, 0, 140)
) AS v(code, name_en, name_th, name_ja, description, duration, engineers, manager_approval, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM dbo.visit_types t WHERE t.code = v.code);


-- ---------------------------------------------------------------------
-- Engineering skills
-- ---------------------------------------------------------------------
INSERT INTO dbo.visit_skills (code, name_en, name_th, name_ja, discipline, sort_order, created_by, updated_by)
SELECT v.code, v.name_en, v.name_th, v.name_ja, v.discipline, v.sort_order, @actor, @actor
FROM (VALUES
    (N'MECHANICAL',         N'Mechanical',         N'เครื่องกล',            N'機械',        N'Mechanical', 10),
    (N'ELECTRICAL',         N'Electrical',         N'ไฟฟ้า',                N'電気',        N'Electrical', 20),
    (N'PLC',                N'PLC',                N'พีแอลซี',              N'PLC',        N'Control',    30),
    (N'ROBOT',              N'Robot',              N'หุ่นยนต์',             N'ロボット',     N'Control',    40),
    (N'VISION',             N'Vision System',      N'ระบบวิชั่น',           N'ビジョン',     N'Control',    50),
    (N'SOFTWARE',           N'Software',           N'ซอฟต์แวร์',            N'ソフトウェア', N'Software',   60),
    (N'SAFETY',             N'Safety',             N'ความปลอดภัย',          N'安全',        N'Safety',     70),
    (N'PROCESS',            N'Process',            N'กระบวนการผลิต',        N'プロセス',     N'Process',    80),
    (N'PROJECT_MANAGEMENT', N'Project Management', N'บริหารโครงการ',        N'プロジェクト管理', N'Management', 90)
) AS v(code, name_en, name_th, name_ja, discipline, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM dbo.visit_skills s WHERE s.code = v.code);


-- ---------------------------------------------------------------------
-- SLA. One organisation-wide default plus two tighter ones where the
-- requirement implies a faster turnaround.
-- ---------------------------------------------------------------------
INSERT INTO dbo.visit_sla_policies (code, name, visit_type_id, review_response_days, schedule_lead_days,
    report_due_days, report_warning_hours, is_default, created_by, updated_by)
SELECT v.code, v.name, t.id, v.review_days, v.lead_days, v.report_days, v.warning_hours, v.is_default, @actor, @actor
FROM (VALUES
    (N'DEFAULT',         N'Standard site visit SLA',    CAST(NULL AS nvarchar(40)), 2, 5, 3, 24, CAST(1 AS bit)),
    (N'TROUBLESHOOTING', N'Breakdown response SLA',     N'TROUBLESHOOTING',         1, 1, 1, 8,  CAST(0 AS bit)),
    (N'SAFETY',          N'Safety assessment SLA',      N'SAFETY_ASSESSMENT',       2, 5, 5, 24, CAST(0 AS bit))
) AS v(code, name, visit_type_code, review_days, lead_days, report_days, warning_hours, is_default)
LEFT JOIN dbo.visit_types t ON t.code = v.visit_type_code
WHERE NOT EXISTS (SELECT 1 FROM dbo.visit_sla_policies p WHERE p.code = v.code)
  AND (v.visit_type_code IS NULL OR t.id IS NOT NULL);


-- ---------------------------------------------------------------------
-- Checklist templates. One per survey discipline the engineers actually run,
-- plus a general template used when the visit type has none of its own.
-- ---------------------------------------------------------------------
INSERT INTO dbo.visit_checklist_templates (code, name, visit_type_id, description, created_by, updated_by)
SELECT v.code, v.name, t.id, v.description, @actor, @actor
FROM (VALUES
    (N'CL_GENERAL',    N'General site visit checklist',   CAST(NULL AS nvarchar(40)),  N'Used when the visit type has no template of its own.'),
    (N'CL_PRESALES',   N'Pre-sales survey checklist',     N'PRE_SALES_SURVEY',         N'What an estimator needs before a price can be built.'),
    (N'CL_ELECTRICAL', N'Electrical survey checklist',    N'ELECTRICAL_SURVEY',        N'Supply, panel, earthing and cable route.'),
    (N'CL_MECHANICAL', N'Mechanical survey checklist',    N'MECHANICAL_SURVEY',        N'Space, fixing, load and interference.'),
    (N'CL_ROBOT',      N'Robot application checklist',    N'ROBOT_APPLICATION_SURVEY', N'Reach, payload, cycle time and safety envelope.'),
    (N'CL_SAFETY',     N'Safety assessment checklist',    N'SAFETY_ASSESSMENT',        N'Hazards, guarding and the customer safety standard.'),
    (N'CL_TROUBLE',    N'Troubleshooting checklist',      N'TROUBLESHOOTING',          N'Symptom, evidence, cause and the fix that was applied.')
) AS v(code, name, visit_type_code, description)
LEFT JOIN dbo.visit_types t ON t.code = v.visit_type_code
WHERE NOT EXISTS (SELECT 1 FROM dbo.visit_checklist_templates c WHERE c.code = v.code)
  AND (v.visit_type_code IS NULL OR t.id IS NOT NULL);

INSERT INTO dbo.visit_checklist_items (template_id, sort_order, section, prompt, response_type, unit, is_required, guidance)
SELECT c.id, v.sort_order, v.section, v.prompt, v.response_type, v.unit, v.is_required, v.guidance
FROM (VALUES
    -- General
    (N'CL_GENERAL', 10,  N'Arrival',     N'Site induction and PPE completed',                 N'YesNo',       N'',      CAST(1 AS bit), N'Record the induction reference if the customer issues one.'),
    (N'CL_GENERAL', 20,  N'Arrival',     N'Customer attendees confirmed',                     N'Text',        N'',      CAST(1 AS bit), N'Names and roles of everyone who joined.'),
    (N'CL_GENERAL', 30,  N'Survey',      N'Overall area photograph taken',                    N'Photo',       N'',      CAST(1 AS bit), N'One wide shot so the office can orient itself.'),
    (N'CL_GENERAL', 40,  N'Survey',      N'Current problem observed first-hand',              N'Text',        N'',      CAST(1 AS bit), N'What you saw, not what you were told.'),
    (N'CL_GENERAL', 50,  N'Survey',      N'Requirement confirmed with the customer',          N'YesNo',       N'',      CAST(1 AS bit), N'Read the intake requirement back to them.'),
    (N'CL_GENERAL', 60,  N'Close-out',   N'Open questions listed with an owner',              N'Text',        N'',      CAST(0 AS bit), N'Anything that still needs an answer.'),
    (N'CL_GENERAL', 70,  N'Close-out',   N'Next step agreed with the customer',               N'Text',        N'',      CAST(1 AS bit), N'Who does what, by when.'),
    -- Pre-sales
    (N'CL_PRESALES', 10, N'Scope',       N'Process boundary agreed (start and end)',          N'Text',        N'',      CAST(1 AS bit), N'Where our scope begins and where it stops.'),
    (N'CL_PRESALES', 20, N'Product',     N'Workpiece dimensions measured',                    N'Measurement', N'mm',    CAST(1 AS bit), N'Largest and smallest part the system must handle.'),
    (N'CL_PRESALES', 30, N'Product',     N'Workpiece weight measured',                        N'Measurement', N'kg',    CAST(1 AS bit), N''),
    (N'CL_PRESALES', 40, N'Capacity',    N'Required cycle time',                              N'Measurement', N'sec',   CAST(1 AS bit), N'Target, not current.'),
    (N'CL_PRESALES', 50, N'Capacity',    N'Shifts per day and days per week',                 N'Text',        N'',      CAST(0 AS bit), N''),
    (N'CL_PRESALES', 60, N'Site',        N'Available floor area measured',                    N'Measurement', N'm²',    CAST(1 AS bit), N'Including the space needed to open panels.'),
    (N'CL_PRESALES', 70, N'Site',        N'Ceiling height and access route measured',         N'Measurement', N'mm',    CAST(1 AS bit), N'Can the largest assembly physically get in.'),
    (N'CL_PRESALES', 80, N'Utility',     N'Electrical supply available at the location',      N'Text',        N'',      CAST(1 AS bit), N'Voltage, phases, spare breaker capacity.'),
    (N'CL_PRESALES', 90, N'Utility',     N'Compressed air available at the location',         N'Text',        N'',      CAST(0 AS bit), N'Pressure and flow.'),
    (N'CL_PRESALES', 100,N'Integration', N'Existing controller brand and model recorded',     N'Text',        N'',      CAST(1 AS bit), N''),
    (N'CL_PRESALES', 110,N'Integration', N'Data or MES interface required',                   N'YesNo',       N'',      CAST(0 AS bit), N''),
    -- Electrical
    (N'CL_ELECTRICAL', 10, N'Supply',    N'Incoming voltage measured',                        N'Measurement', N'V',     CAST(1 AS bit), N'Measure, do not read the nameplate.'),
    (N'CL_ELECTRICAL', 20, N'Supply',    N'Phases and frequency confirmed',                   N'Text',        N'',      CAST(1 AS bit), N''),
    (N'CL_ELECTRICAL', 30, N'Supply',    N'Spare breaker capacity available',                 N'Measurement', N'A',     CAST(1 AS bit), N''),
    (N'CL_ELECTRICAL', 40, N'Panel',     N'Existing panel photographed inside and out',       N'Photo',       N'',      CAST(1 AS bit), N'Open the door — the label alone is not enough.'),
    (N'CL_ELECTRICAL', 50, N'Panel',     N'Free DIN rail space measured',                     N'Measurement', N'mm',    CAST(0 AS bit), N''),
    (N'CL_ELECTRICAL', 60, N'Earthing',  N'Earthing arrangement recorded',                    N'Text',        N'',      CAST(1 AS bit), N'TN-S, TT, or as found.'),
    (N'CL_ELECTRICAL', 70, N'Route',     N'Cable route length measured',                      N'Measurement', N'm',     CAST(1 AS bit), N'Route the cable will actually take, not the straight line.'),
    (N'CL_ELECTRICAL', 80, N'Route',     N'Cable tray or conduit availability',               N'Text',        N'',      CAST(0 AS bit), N''),
    -- Mechanical
    (N'CL_MECHANICAL', 10, N'Space',     N'Installation footprint measured',                  N'Measurement', N'mm',    CAST(1 AS bit), N'Length × width, with the tape in the photograph.'),
    (N'CL_MECHANICAL', 20, N'Space',     N'Clearance for maintenance access measured',        N'Measurement', N'mm',    CAST(1 AS bit), N''),
    (N'CL_MECHANICAL', 30, N'Structure', N'Floor type and condition recorded',                N'Text',        N'',      CAST(1 AS bit), N'Concrete thickness or mezzanine rating if known.'),
    (N'CL_MECHANICAL', 40, N'Structure', N'Anchor or fixing method feasible',                 N'YesNo',       N'',      CAST(1 AS bit), N''),
    (N'CL_MECHANICAL', 50, N'Interface', N'Conveyor or machine interface height measured',    N'Measurement', N'mm',    CAST(1 AS bit), N''),
    (N'CL_MECHANICAL', 60, N'Risk',      N'Interference with existing equipment checked',     N'Text',        N'',      CAST(1 AS bit), N'Doors, pipework, overhead services.'),
    -- Robot
    (N'CL_ROBOT', 10, N'Application',    N'Pick and place positions measured',                N'Measurement', N'mm',    CAST(1 AS bit), N'Furthest reach the robot must achieve.'),
    (N'CL_ROBOT', 20, N'Application',    N'Payload including gripper',                        N'Measurement', N'kg',    CAST(1 AS bit), N'Do not forget the gripper and the cable.'),
    (N'CL_ROBOT', 30, N'Application',    N'Required cycle time',                              N'Measurement', N'sec',   CAST(1 AS bit), N''),
    (N'CL_ROBOT', 40, N'Cell',           N'Available cell envelope measured',                 N'Measurement', N'mm',    CAST(1 AS bit), N''),
    (N'CL_ROBOT', 50, N'Safety',         N'Guarding or scanner arrangement agreed',           N'Text',        N'',      CAST(1 AS bit), N''),
    (N'CL_ROBOT', 60, N'Safety',         N'Operator access points identified',                N'Photo',       N'',      CAST(1 AS bit), N''),
    -- Safety
    (N'CL_SAFETY', 10, N'Standard',      N'Customer safety standard identified',              N'Text',        N'',      CAST(1 AS bit), N'Their document number, not a generic reference.'),
    (N'CL_SAFETY', 20, N'Hazard',        N'Hazard list completed with the customer',          N'Text',        N'',      CAST(1 AS bit), N''),
    (N'CL_SAFETY', 30, N'Hazard',        N'Existing guarding photographed',                   N'Photo',       N'',      CAST(1 AS bit), N''),
    (N'CL_SAFETY', 40, N'Control',       N'Emergency stop coverage checked',                  N'YesNo',       N'',      CAST(1 AS bit), N''),
    (N'CL_SAFETY', 50, N'Control',       N'Lock-out / tag-out procedure recorded',            N'Text',        N'',      CAST(1 AS bit), N''),
    (N'CL_SAFETY', 60, N'Outcome',       N'Required safety category or PLr agreed',           N'Text',        N'',      CAST(0 AS bit), N''),
    -- Troubleshooting
    (N'CL_TROUBLE', 10, N'Symptom',      N'Reported symptom reproduced on site',              N'YesNo',       N'',      CAST(1 AS bit), N'If it could not be reproduced, say so explicitly.'),
    (N'CL_TROUBLE', 20, N'Evidence',     N'Alarm or error code captured',                     N'Text',        N'',      CAST(1 AS bit), N''),
    (N'CL_TROUBLE', 30, N'Evidence',     N'Fault condition photographed',                     N'Photo',       N'',      CAST(1 AS bit), N''),
    (N'CL_TROUBLE', 40, N'Analysis',     N'Probable root cause recorded',                     N'Text',        N'',      CAST(1 AS bit), N'Say "not yet identified" rather than guessing.'),
    (N'CL_TROUBLE', 50, N'Action',       N'Temporary action taken on site',                   N'Text',        N'',      CAST(0 AS bit), N''),
    (N'CL_TROUBLE', 60, N'Action',       N'Machine returned to the customer in what state',   N'Text',        N'',      CAST(1 AS bit), N'Running, running with a restriction, or stopped.')
) AS v(template_code, sort_order, section, prompt, response_type, unit, is_required, guidance)
INNER JOIN dbo.visit_checklist_templates c ON c.code = v.template_code
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.visit_checklist_items i
    WHERE i.template_id = c.id AND i.sort_order = v.sort_order);


-- ---------------------------------------------------------------------
-- Point every visit type at its checklist. Types without a dedicated
-- template are left null; the API falls back to CL_GENERAL at scheduling
-- time rather than storing the same pointer 14 times.
-- ---------------------------------------------------------------------
SELECT
    N'visit_types'              AS master_table, COUNT_BIG(*) AS rows_present FROM dbo.visit_types
UNION ALL SELECT N'visit_skills',               COUNT_BIG(*) FROM dbo.visit_skills
UNION ALL SELECT N'visit_sla_policies',         COUNT_BIG(*) FROM dbo.visit_sla_policies
UNION ALL SELECT N'visit_checklist_templates',  COUNT_BIG(*) FROM dbo.visit_checklist_templates
UNION ALL SELECT N'visit_checklist_items',      COUNT_BIG(*) FROM dbo.visit_checklist_items;

COMMIT TRANSACTION;
GO
