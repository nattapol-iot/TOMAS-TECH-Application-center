:on error exit
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;

-- Checks migration 070 against estimate-labor-discipline-seed.sql, for
-- scripts/Test-EstimateDisciplineLocalDb.ps1. Runs only in that script's generated database.
DECLARE @fixture_database sysname=DB_NAME();
IF LEFT(@fixture_database,LEN(N'IoTTeamCenter_DisciplineUpgradeCI_'))<>N'IoTTeamCenter_DisciplineUpgradeCI_'
   OR LEN(@fixture_database)<>LEN(N'IoTTeamCenter_DisciplineUpgradeCI_')+32
   OR RIGHT(@fixture_database,32) COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
    THROW 51980, 'The discipline check refuses to run outside its synthetic CI database.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=70 AND name=N'Estimate labor and site expense disciplines')
    THROW 51981, 'Migration 070 is not recorded.', 1;

DECLARE @expected TABLE(kind nvarchar(10), name nvarchar(300), discipline nvarchar(20) NULL);
INSERT @expected VALUES
(N'labor',N'DC history',NULL),               -- an earlier revision is frozen and never backfilled
(N'labor',N'DC software',N'Software'),
(N'labor',N'DC electrical',N'Electrical'),   -- department text is trimmed and case-insensitive
(N'labor',N'DC installation',N'Installation'),
(N'labor',N'DC unplaced',NULL),              -- no rule places a department named after a team
(N'labor',N'DC mechanical',N'Mechanical'),
(N'expense',N'DC hotel',N'Installation'),
(N'expense',N'DC mechanical trip',N'Mechanical'), -- its package is staffed by one discipline
(N'expense',N'DC mixed trip',NULL),               -- its package mixes disciplines
(N'expense',N'DC no labor',NULL);

IF EXISTS (
    SELECT 1 FROM @expected x
    LEFT JOIN dbo.manhour_lines l ON x.kind=N'labor' AND l.activity=x.name
    LEFT JOIN dbo.expense_lines e ON x.kind=N'expense' AND e.description=x.name
    WHERE COALESCE(l.id,e.id) IS NULL
       OR EXISTS (SELECT COALESCE(l.discipline,e.discipline) EXCEPT SELECT x.discipline)
)
BEGIN
    SELECT x.kind,x.name,x.discipline expected,COALESCE(l.discipline,e.discipline) actual
    FROM @expected x
    LEFT JOIN dbo.manhour_lines l ON x.kind=N'labor' AND l.activity=x.name
    LEFT JOIN dbo.expense_lines e ON x.kind=N'expense' AND e.description=x.name;
    THROW 51982, 'Migration 070 backfilled a discipline other than expected.', 1;
END;

-- The constraint keeps the discipline and the cost type in step on every later write.
DECLARE @estimate bigint=(SELECT id FROM dbo.estimates WHERE estimate_no=N'DC-1');
DECLARE @admin bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'discipline-ci-admin');
DECLARE @refused int=0;
BEGIN TRY
    INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,discipline,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
    VALUES(@estimate,1,N'P',N'DC bad 1',N'Software',N'Engineer',N'Engineering',N'Installation',N'Internal',1,1,8,1,@admin,@admin,@admin);
END TRY BEGIN CATCH IF ERROR_NUMBER()=547 SET @refused+=1; ELSE THROW; END CATCH;
BEGIN TRY
    INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,discipline,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
    VALUES(@estimate,1,N'P',N'DC bad 2',N'Software',N'Engineer',N'Installation',N'Software',N'Internal',1,1,8,1,@admin,@admin,@admin);
END TRY BEGIN CATCH IF ERROR_NUMBER()=547 SET @refused+=1; ELSE THROW; END CATCH;
BEGIN TRY
    INSERT dbo.expense_lines(estimate_id,revision,package,expense_type,description,cost_type,discipline,qty,unit,unit_cost,owner_id,created_by,updated_by)
    VALUES(@estimate,1,N'P',N'Travel',N'DC bad 3',N'Engineering',N'Plumbing',1,N'Trip',1,@admin,@admin,@admin);
END TRY BEGIN CATCH IF ERROR_NUMBER()=547 SET @refused+=1; ELSE THROW; END CATCH;
IF @refused<>3 THROW 51983, 'CK_*_discipline accepted a discipline its cost type does not allow.', 1;

INSERT dbo.manhour_lines(estimate_id,revision,package,activity,department,level,cost_type,discipline,provider,engineers,man_days,hours_per_day,daily_rate,owner_id,created_by,updated_by)
VALUES(@estimate,1,N'P',N'DC ok',N'IoT Engineer Dept.',N'Engineer',N'Engineering',N'Electrical',N'Internal',1,1,8,1,@admin,@admin,@admin);
INSERT dbo.expense_lines(estimate_id,revision,package,expense_type,description,cost_type,discipline,qty,unit,unit_cost,owner_id,created_by,updated_by)
VALUES(@estimate,1,N'P',N'Travel',N'DC ok trip',N'Installation',N'Installation',1,N'Trip',1,@admin,@admin,@admin);
PRINT 'PASS: migration 070 backfill and discipline constraints.';
GO
