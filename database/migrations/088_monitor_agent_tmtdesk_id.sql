-- Migration 088: a monitored machine can carry its TMTDesk ID.
--
-- TMTDesk (the department's remote desktop) opens a session from a tmtdesk://connect/<ID> link, so
-- Site Monitor can show a Remote button next to each machine once its 9-digit TMTDesk ID is known.
-- The ID is not a secret: connecting still needs the machine's TMTDesk password or approval.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 87)
    THROW 51880, 'Migration 087 must be applied before migration 088.', 1;
GO

BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.monitor_agents', N'tmtdesk_id') IS NULL
    ALTER TABLE dbo.monitor_agents ADD tmtdesk_id char(9) NULL;

COMMIT TRANSACTION;
GO

IF OBJECT_ID(N'dbo.CK_monitor_agents_tmtdesk_id', N'C') IS NULL
    EXEC(N'ALTER TABLE dbo.monitor_agents ADD CONSTRAINT CK_monitor_agents_tmtdesk_id
        CHECK (tmtdesk_id IS NULL OR tmtdesk_id NOT LIKE ''%[^0-9]%'');');
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 88)
    INSERT dbo.schema_versions(version, name)
    VALUES (88, N'TMTDesk ID on a monitored machine');
GO
