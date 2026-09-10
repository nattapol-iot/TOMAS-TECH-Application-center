SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version=40 AND name<>N'Immutable overhead policies and estimate revision snapshots')
    THROW 51400, 'Schema version 040 is already used by another migration.', 1;

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 40)
    THROW 51401, 'Migration 040 has already been applied.', 1;

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 37)
    THROW 51402, 'Migration 037 must be applied before migration 040.', 1;
GO

BEGIN TRANSACTION;
GO

-- Policies are append-only. For any business date, the policy with the latest
-- effective_from date wins. This avoids editing history when a new rate starts.
CREATE TABLE dbo.overhead_policies (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_overhead_policies PRIMARY KEY,
    policy_version int NOT NULL,
    method nvarchar(50) NOT NULL CONSTRAINT DF_overhead_policies_method DEFAULT N'InternalEngineeringHour',
    monthly_budget decimal(19,4) NOT NULL,
    normal_direct_hours decimal(19,4) NOT NULL,
    hourly_rate AS CONVERT(decimal(19,4), monthly_budget / normal_direct_hours) PERSISTED,
    effective_from date NOT NULL,
    reason nvarchar(500) NOT NULL,
    created_by bigint NOT NULL,
    created_at datetimeoffset(0) NOT NULL CONSTRAINT DF_overhead_policies_created_at DEFAULT SYSUTCDATETIME(),
    row_version rowversion NOT NULL,
    CONSTRAINT UQ_overhead_policies_version UNIQUE (policy_version),
    CONSTRAINT UQ_overhead_policies_effective_from UNIQUE (effective_from),
    CONSTRAINT CK_overhead_policies_method CHECK (method = N'InternalEngineeringHour'),
    CONSTRAINT CK_overhead_policies_budget CHECK (monthly_budget >= 0),
    CONSTRAINT CK_overhead_policies_hours CHECK (normal_direct_hours > 0),
    CONSTRAINT CK_overhead_policies_reason CHECK (LEN(LTRIM(RTRIM(reason))) > 0),
    CONSTRAINT FK_overhead_policies_created_by FOREIGN KEY (created_by) REFERENCES dbo.users(id)
);
CREATE INDEX IX_overhead_policies_effective
    ON dbo.overhead_policies(effective_from DESC, id DESC)
    INCLUDE (policy_version, monthly_budget, normal_direct_hours, created_by, created_at);

-- One immutable policy snapshot belongs to one estimate revision. No row means
-- "Missing"; a row whose monthly budget is zero means an explicit zero policy.
CREATE TABLE dbo.estimate_overhead_snapshots (
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    policy_id bigint NOT NULL,
    policy_version int NOT NULL,
    method nvarchar(50) NOT NULL,
    monthly_budget decimal(19,4) NOT NULL,
    normal_direct_hours decimal(19,4) NOT NULL,
    hourly_rate decimal(19,4) NOT NULL,
    effective_from date NOT NULL,
    reason nvarchar(500) NOT NULL,
    applied_by bigint NOT NULL,
    applied_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_overhead_snapshots_applied_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_estimate_overhead_snapshots PRIMARY KEY (estimate_id, revision),
    CONSTRAINT FK_estimate_overhead_snapshots_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_estimate_overhead_snapshots_policy FOREIGN KEY (policy_id) REFERENCES dbo.overhead_policies(id),
    CONSTRAINT FK_estimate_overhead_snapshots_applied_by FOREIGN KEY (applied_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_estimate_overhead_snapshots_method CHECK (method = N'InternalEngineeringHour'),
    CONSTRAINT CK_estimate_overhead_snapshots_budget CHECK (monthly_budget >= 0),
    CONSTRAINT CK_estimate_overhead_snapshots_hours CHECK (normal_direct_hours > 0),
    CONSTRAINT CK_estimate_overhead_snapshots_rate CHECK (hourly_rate >= 0)
);

CREATE TABLE dbo.estimate_submission_snapshots (
    id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_estimate_submission_snapshots PRIMARY KEY,
    estimate_id bigint NOT NULL,
    revision int NOT NULL,
    snapshot_json nvarchar(max) NOT NULL,
    snapshot_sha256 char(64) NOT NULL,
    submitted_by bigint NOT NULL,
    submitted_at datetimeoffset(0) NOT NULL CONSTRAINT DF_estimate_submission_snapshots_submitted_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_estimate_submission_snapshots UNIQUE (estimate_id, revision),
    CONSTRAINT FK_estimate_submission_snapshots_estimate FOREIGN KEY (estimate_id) REFERENCES dbo.estimates(id),
    CONSTRAINT FK_estimate_submission_snapshots_submitted_by FOREIGN KEY (submitted_by) REFERENCES dbo.users(id),
    CONSTRAINT CK_estimate_submission_snapshots_json CHECK (ISJSON(snapshot_json)=1),
    CONSTRAINT CK_estimate_submission_snapshots_hash CHECK (snapshot_sha256 NOT LIKE '%[^0-9a-f]%' AND LEN(snapshot_sha256)=64)
);
GO

-- Snapshot rows are append-only and may only be inserted for the current
-- revision. Approved history therefore cannot be silently recalculated.
CREATE OR ALTER TRIGGER dbo.trg_estimate_overhead_snapshots_immutable
ON dbo.estimate_overhead_snapshots
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (SELECT 1 FROM deleted)
        THROW 51403, 'Estimate overhead snapshots are immutable.', 1;
    IF EXISTS (
        SELECT 1 FROM inserted snapshot
        INNER JOIN dbo.estimates estimate ON estimate.id = snapshot.estimate_id
        WHERE snapshot.revision <> estimate.revision
    )
        THROW 51404, 'Overhead can be snapshotted only for the current estimate revision.', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.trg_estimate_submission_snapshots_immutable
ON dbo.estimate_submission_snapshots
AFTER UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM inserted) OR EXISTS(SELECT 1 FROM deleted)
        THROW 51405, 'Estimate submission snapshots are immutable.', 1;
END;
GO

-- Contingency keeps its established basis: direct base x contingency rate.
-- Overhead is added after contingency, so it is never charged contingency and
-- is not mixed into direct cost categories. Missing overhead contributes zero
-- to the numeric total while overhead_state remains visibly "Missing".
CREATE OR ALTER VIEW dbo.v_estimate_totals
AS
WITH material AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category_code IN ('01','02','03','04','05') THEN line_total ELSE 0 END) AS material_total,
           SUM(CASE WHEN category_code = '07' THEN line_total ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category_code = '08' THEN line_total ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category_code = '09' THEN line_total ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category_code IN ('06','10') THEN line_total ELSE 0 END) AS other_total
    FROM dbo.cost_items WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), effort AS (
    SELECT estimate_id, revision, SUM(line_cost) AS engineering_total,
           SUM(CASE WHEN provider=N'Internal' THEN engineers*man_days*hours_per_day ELSE 0 END) AS internal_direct_hours
    FROM dbo.manhour_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), expense AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN expense_type IN (N'Travel',N'Transportation') THEN line_total ELSE 0 END) AS transportation_expense,
           SUM(CASE WHEN expense_type IN (N'Accommodation',N'Per Diem') THEN line_total ELSE 0 END) AS accommodation_expense,
           SUM(CASE WHEN expense_type NOT IN (N'Travel',N'Transportation',N'Accommodation',N'Per Diem') THEN line_total ELSE 0 END) AS other_expense
    FROM dbo.expense_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), other_cost AS (
    SELECT estimate_id, revision,
           SUM(CASE WHEN category=N'Outsource' THEN line_total ELSE 0 END) AS outsource_total,
           SUM(CASE WHEN category=N'Transportation' THEN line_total ELSE 0 END) AS transportation_total,
           SUM(CASE WHEN category=N'Accommodation' THEN line_total ELSE 0 END) AS accommodation_total,
           SUM(CASE WHEN category NOT IN (N'Outsource',N'Transportation',N'Accommodation') THEN line_total ELSE 0 END) AS other_total
    FROM dbo.other_cost_lines WHERE deleted_at IS NULL GROUP BY estimate_id, revision
), base AS (
    SELECT e.id estimate_id,
           COALESCE(m.material_total,0) material_total,
           COALESCE(f.engineering_total,0) engineering_total,
           COALESCE(m.outsource_total,0)+COALESCE(o.outsource_total,0) outsource_total,
           COALESCE(m.transportation_total,0)+COALESCE(x.transportation_expense,0)+COALESCE(o.transportation_total,0) transportation_total,
           COALESCE(m.accommodation_total,0)+COALESCE(x.accommodation_expense,0)+COALESCE(o.accommodation_total,0) accommodation_total,
           COALESCE(m.other_total,0)+COALESCE(x.other_expense,0)+COALESCE(o.other_total,0) other_total,
           COALESCE(f.internal_direct_hours,0) internal_direct_hours,e.contingency_rate,
           snapshot.policy_id,snapshot.policy_version,snapshot.hourly_rate,snapshot.monthly_budget overhead_monthly_budget
    FROM dbo.estimates e
    LEFT JOIN material m ON m.estimate_id=e.id AND m.revision=e.revision
    LEFT JOIN effort f ON f.estimate_id=e.id AND f.revision=e.revision
    LEFT JOIN expense x ON x.estimate_id=e.id AND x.revision=e.revision
    LEFT JOIN other_cost o ON o.estimate_id=e.id AND o.revision=e.revision
    LEFT JOIN dbo.estimate_overhead_snapshots snapshot ON snapshot.estimate_id=e.id AND snapshot.revision=e.revision
    WHERE e.deleted_at IS NULL
), calculated AS (
    SELECT *,CONVERT(decimal(19,4),material_total+engineering_total+outsource_total+transportation_total+accommodation_total+other_total) base_total,
      CASE WHEN policy_id IS NULL THEN NULL ELSE CONVERT(decimal(19,4),ROUND(internal_direct_hours*hourly_rate,4)) END overhead_total
    FROM base
)
SELECT estimate_id,material_total,engineering_total,outsource_total,transportation_total,accommodation_total,other_total,
       base_total,internal_direct_hours,policy_id overhead_policy_id,policy_version overhead_policy_version,
       CASE WHEN policy_id IS NULL THEN N'Missing' WHEN overhead_monthly_budget=0 THEN N'Zero' ELSE N'Applied' END overhead_state,
       hourly_rate overhead_hourly_rate,overhead_total,
       CONVERT(decimal(19,4),ROUND(base_total*contingency_rate/100.0,0)) contingency_total,
       CONVERT(decimal(19,4),base_total+COALESCE(overhead_total,0)+ROUND(base_total*contingency_rate/100.0,0)) total
FROM calculated;
GO

IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
    GRANT SELECT, INSERT ON OBJECT::dbo.overhead_policies TO [iot_team_app_role];
    GRANT SELECT, INSERT ON OBJECT::dbo.estimate_overhead_snapshots TO [iot_team_app_role];
    GRANT SELECT, INSERT ON OBJECT::dbo.estimate_submission_snapshots TO [iot_team_app_role];
    DENY UPDATE, DELETE ON OBJECT::dbo.overhead_policies TO [iot_team_app_role];
    DENY UPDATE, DELETE ON OBJECT::dbo.estimate_overhead_snapshots TO [iot_team_app_role];
    DENY UPDATE, DELETE ON OBJECT::dbo.estimate_submission_snapshots TO [iot_team_app_role];
END;

INSERT INTO dbo.schema_versions(version,name)
VALUES(40,N'Immutable overhead policies and estimate revision snapshots');

COMMIT TRANSACTION;
GO
