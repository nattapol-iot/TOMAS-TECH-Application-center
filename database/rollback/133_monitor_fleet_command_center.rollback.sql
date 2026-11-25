-- Undo of migration 133: Fleet, Command Center, script jobs and LINE / Teams alert channels.
--
-- Run by hand, on a database at schema version 133, together with a release of the API from before migration 133.
-- Script jobs, their results, alert channel secrets, resource samples and TMTDeskUnhealthy incidents are deleted.

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version > 133)
    THROW 51933, 'Roll back the migrations after 133 first.', 1;
GO

BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.monitor_script_targets', N'U') IS NOT NULL DROP TABLE dbo.monitor_script_targets;
IF OBJECT_ID(N'dbo.monitor_script_jobs', N'U') IS NOT NULL DROP TABLE dbo.monitor_script_jobs;
IF OBJECT_ID(N'dbo.monitor_site_alert_channels', N'U') IS NOT NULL DROP TABLE dbo.monitor_site_alert_channels;
IF OBJECT_ID(N'dbo.monitor_agent_samples', N'U') IS NOT NULL DROP TABLE dbo.monitor_agent_samples;

DELETE FROM dbo.monitor_commands WHERE verb = N'RunScript';
IF OBJECT_ID(N'dbo.CK_monitor_commands_program', N'C') IS NOT NULL
    ALTER TABLE dbo.monitor_commands DROP CONSTRAINT CK_monitor_commands_program;
IF OBJECT_ID(N'dbo.CK_monitor_commands_verb', N'C') IS NOT NULL
    ALTER TABLE dbo.monitor_commands DROP CONSTRAINT CK_monitor_commands_verb;
ALTER TABLE dbo.monitor_commands ADD CONSTRAINT CK_monitor_commands_verb CHECK (verb IN (N'Start', N'Stop', N'Restart', N'Update'));
DROP INDEX UX_monitor_commands_in_flight ON dbo.monitor_commands;
ALTER TABLE dbo.monitor_commands DROP CONSTRAINT FK_monitor_commands_program;
ALTER TABLE dbo.monitor_commands ALTER COLUMN program_id bigint NOT NULL;
ALTER TABLE dbo.monitor_commands ADD CONSTRAINT FK_monitor_commands_program FOREIGN KEY (program_id) REFERENCES dbo.monitor_programs(id);
CREATE UNIQUE INDEX UX_monitor_commands_in_flight ON dbo.monitor_commands(program_id) WHERE status IN (N'Pending', N'Delivered');

DELETE FROM dbo.monitor_incidents WHERE kind = N'TMTDeskUnhealthy';
ALTER TABLE dbo.monitor_incidents DROP CONSTRAINT CK_monitor_incidents_program;
ALTER TABLE dbo.monitor_incidents DROP CONSTRAINT CK_monitor_incidents_kind;
ALTER TABLE dbo.monitor_incidents ADD CONSTRAINT CK_monitor_incidents_kind CHECK (kind IN (N'ProgramStopped', N'AgentOffline'));
ALTER TABLE dbo.monitor_incidents ADD CONSTRAINT CK_monitor_incidents_program
    CHECK ((kind = N'ProgramStopped' AND program_id IS NOT NULL) OR (kind = N'AgentOffline' AND program_id IS NULL));

IF OBJECT_ID(N'dbo.CK_monitor_sites_position', N'C') IS NOT NULL
    ALTER TABLE dbo.monitor_sites DROP CONSTRAINT CK_monitor_sites_position;
IF COL_LENGTH(N'dbo.monitor_sites', N'latitude') IS NOT NULL
    ALTER TABLE dbo.monitor_sites DROP COLUMN latitude, longitude;

IF OBJECT_ID(N'dbo.CK_monitor_agents_tmtdesk_sessions', N'C') IS NOT NULL
    ALTER TABLE dbo.monitor_agents DROP CONSTRAINT CK_monitor_agents_tmtdesk_sessions;
IF COL_LENGTH(N'dbo.monitor_agents', N'tmtdesk_installed') IS NOT NULL
BEGIN
    ALTER TABLE dbo.monitor_agents DROP CONSTRAINT DF_monitor_agents_tmtdesk_installed, DF_monitor_agents_tmtdesk_running,
        DF_monitor_agents_tmtdesk_helper, DF_monitor_agents_tmtdesk_sessions, DF_monitor_agents_tmtdesk_manual;
    ALTER TABLE dbo.monitor_agents DROP COLUMN tmtdesk_installed, tmtdesk_running, tmtdesk_version, tmtdesk_mode,
        tmtdesk_rendezvous, tmtdesk_helper_running, tmtdesk_active_sessions, tmtdesk_capture_method, tmtdesk_health,
        tmtdesk_last_frame_at, tmtdesk_updated_at, tmtdesk_reported_at, tmtdesk_unhealthy_since, tmtdesk_id_manual,
        last_sample_at;
END;

DELETE rp FROM dbo.role_permissions rp INNER JOIN dbo.permissions p ON p.id = rp.permission_id WHERE p.code = N'monitor.script';
DELETE FROM dbo.permissions WHERE code = N'monitor.script';

COMMIT TRANSACTION;
GO

DELETE FROM dbo.schema_versions WHERE version = 133;
GO
