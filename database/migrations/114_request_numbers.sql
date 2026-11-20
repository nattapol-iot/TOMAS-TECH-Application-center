-- Migration 114: room for the app's own request numbers, and the requester's reason for going over budget.
--
-- A request made in this app was numbered PR-2611-0007, which reads like the ERP's own PR
-- (PR2611-0001). The owner asked (2026-11-20) for a number that cannot be mistaken for one and that
-- says what the request is for: REQ-<discipline>-<project>-<drawing>-<round>, for example
-- REQ-ME-PJ260091-MZ08-U001-03. That is longer than the 30 characters pr_no had.
--
--   mat_prs.pr_no               30 -> 50 characters. Existing numbers stay as they are.
--   mat_prs.over_budget_reason  why the requester asks for more than the Unit or Module has.
--                               Asked when the request is submitted; the approver reads it.
--
-- Running this again changes nothing.
--
-- To undo: database/rollback/114_request_numbers.rollback.sql

SET XACT_ABORT ON;
SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 113)
    THROW 51114, 'Migration 113 must be applied before migration 114.', 1;
GO

BEGIN TRANSACTION;

-- Making a variable-length column longer is allowed while it sits in its unique constraint and in the two indexes that include it.
IF COL_LENGTH(N'dbo.mat_prs', N'pr_no') < 100
    ALTER TABLE dbo.mat_prs ALTER COLUMN pr_no nvarchar(50) NOT NULL;

IF COL_LENGTH(N'dbo.mat_prs', N'over_budget_reason') IS NULL
    ALTER TABLE dbo.mat_prs ADD over_budget_reason nvarchar(2000) NULL;

COMMIT TRANSACTION;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.schema_versions WHERE version = 114)
    INSERT dbo.schema_versions(version, name)
    VALUES (114, N'Request numbers and over-budget reason');
GO
