# Project document handover: Mac mini release

Prepared for https://iot-team-center.tomastc.com:8444/ on 2026-09-10.

This isolated change is based on `pattana1902/IoT-Team-Center` main commit
`1bb0b679349a248753763ca6eeb835ec2e1ee31b`. It ports the Inquiry-to-Project
handover from `35318d56`, retaining the host's `mssql` (tedious) driver and
all existing authentication, NAS settings, and unrelated features.

New projects receive 15 physical folders, copied source documents and requirement,
estimate, and approved visit-report snapshots. Existing projects are not backfilled.
No schema migration is required. A restricted SQL application identity needs the
four review/history SELECT grants included in `010_application_login.sql`;
inspect effective grants before release and do not rerun the complete login script.

Validation of this port: backend build, 101 backend unit tests, frontend TypeScript
check, and 7 Inquiry/Site Visit regression tests passed. The prior Windows release
passed 56 SQL-backed full-flow checks; those have not been repeated against this
Mac mini port or its live database. The integration entry point currently requires
Windows SQL integrated authentication and is not a Mac mini test command.

Deployment uses the existing GitHub deployment workflow and its production
environment gate. The earlier PowerShell credential probe gave a false negative;
the established `outputs/company-github-access.mjs` script verified repository
write access. SSH is not required. Preserve the host's existing `.env`, database
connection and document volume. Verify the deployed frontend, API readiness and
document handover before reporting completion.
