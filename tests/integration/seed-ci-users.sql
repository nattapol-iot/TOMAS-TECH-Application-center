:on error exit

USE [$(DatabaseName)];
GO

SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRANSACTION;

DECLARE @fixtures TABLE (
    entra_object_id nvarchar(64) NOT NULL,
    email nvarchar(256) NOT NULL,
    name nvarchar(200) NOT NULL,
    initials nvarchar(10) NOT NULL,
    role_code nvarchar(50) NOT NULL
);

INSERT INTO @fixtures (entra_object_id, email, name, initials, role_code)
VALUES
    (N'dev-user', N'dev-user@ci.invalid', N'CI Admin', N'AD', N'Admin'),
    (N'mgr-oid', N'mgr-oid@ci.invalid', N'CI Engineering Manager', N'EM', N'Engineering Manager'),
    (N'buy-oid', N'buy-oid@ci.invalid', N'CI Purchasing', N'PU', N'Purchasing'),
    (N'wh-oid', N'wh-oid@ci.invalid', N'CI Warehouse', N'WH', N'Warehouse'),
    (N'inv-oid', N'inv-oid@ci.invalid', N'CI Inventory Controller', N'IC', N'Inventory Controller');

IF EXISTS (
    SELECT 1 FROM @fixtures fixture
    LEFT JOIN dbo.roles role_item ON role_item.code = fixture.role_code
    WHERE role_item.id IS NULL
)
    THROW 51060, 'A role required by the integration fixture is missing.', 1;

INSERT INTO dbo.users (entra_object_id, email, name, initials, role_id, department, level)
SELECT fixture.entra_object_id, fixture.email, fixture.name, fixture.initials,
       role_item.id, N'CI', N'Integration fixture'
FROM @fixtures fixture
INNER JOIN dbo.roles role_item ON role_item.code = fixture.role_code;

COMMIT TRANSACTION;
GO
