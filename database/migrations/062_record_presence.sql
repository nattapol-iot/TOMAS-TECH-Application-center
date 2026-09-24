-- Migration 062: who has a record open right now
--
-- Several engineers work one Estimate Cost at the same time, and until now none of them
-- could tell the others were there. dbo.activity_sessions already records presence, but
-- per application module and for KPI scoring: it knows someone is "in Estimate Cost",
-- not in which estimate, and it is read back as evidence of a working day. Folding a
-- record into it would change what those scores count, so this is a table of its own.
--
-- One row per person per open record, overwritten by a heartbeat and pruned when it
-- goes quiet. It is not a log: the table stays as large as the number of people with a
-- record open at this moment, and nothing here is ever reported on afterwards.
--
-- editing_key names what the person is changing ("cost:412", "manhour:88"), so a
-- colleague about to open the same line sees it before they type rather than after
-- they save and collide.
--
-- Two GO-separated batches, and the version is recorded last so the runner retries a
-- partial failure.

-- ── Batch 1: the presence table ─────────────────────────────────────────────
SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.record_presence', N'U') IS NULL
    CREATE TABLE dbo.record_presence (
        entity_type nvarchar(30)      NOT NULL,
        entity_id   bigint            NOT NULL,
        user_id     bigint            NOT NULL,
        editing_key nvarchar(60)      NULL,
        last_at     datetimeoffset(0) NOT NULL
            CONSTRAINT DF_record_presence_last_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_record_presence PRIMARY KEY (entity_type, entity_id, user_id),
        CONSTRAINT FK_record_presence_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
        CONSTRAINT CK_record_presence_entity_type CHECK (entity_type IN (N'Estimate', N'Inquiry'))
    );

COMMIT TRANSACTION;
GO

-- ── Batch 2: record the version last ────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 62)
    INSERT dbo.schema_versions(version, name)
    VALUES (62, N'Record-level presence for estimates and inquiries');
