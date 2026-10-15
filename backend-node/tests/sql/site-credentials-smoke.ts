// Prints a T-SQL batch that runs the site credentials statements against a real schema, inside one
// transaction that is rolled back. Run by scripts/Test-SqlSmokeLocalDb.ps1 on a private LocalDB.
import {
  CREDENTIAL_INSERT_SQL, CREDENTIAL_LIST_SQL, CREDENTIAL_LOG_SQL, CREDENTIAL_REFERENCES_SQL, CREDENTIAL_SELECT, CREDENTIAL_SET_SECRET_SQL,
  CREDENTIAL_UPDATE_SQL,
} from "../../src/routes/site-credentials.js";

const q = (text: string) => `N'${text.replaceAll("'", "''")}'`;
const check = (label: string, condition: string) =>
  `IF NOT (${condition}) THROW 51999, N'Smoke check failed: ${label.replaceAll("'", "''")}', 1;`;
const inputParams = `N'@customer bigint, @customer_site bigint, @asset bigint, @project bigint, @kind nvarchar(20), @label nvarchar(200),
  @username nvarchar(300), @host nvarchar(300), @notes nvarchar(2000)`;

const batch = `
SET NOCOUNT ON;
SET XACT_ABORT OFF;
BEGIN TRANSACTION;
DECLARE @actor bigint, @other bigint, @customer bigint, @site bigint, @asset bigint, @id bigint, @site_cred bigint;
DECLARE @new TABLE (id bigint);
DECLARE @refs TABLE (customer_ok int, site_ok int, asset_ok int, project_ok int);

INSERT dbo.users (entra_object_id, email, name, role_id, department)
SELECT CONVERT(nvarchar(64), NEWID()), N'vault@tomastc.com', N'Vault Smoke', id, N'IoT' FROM dbo.roles WHERE code = N'Admin';
SET @actor = SCOPE_IDENTITY();
INSERT dbo.customers (code, name, created_by, updated_by) VALUES (N'VSMOKE', N'Vault Customer', @actor, @actor); SET @customer = SCOPE_IDENTITY();
INSERT dbo.customers (code, name, created_by, updated_by) VALUES (N'VOTHER', N'Other Customer', @actor, @actor); SET @other = SCOPE_IDENTITY();
INSERT dbo.customer_sites (customer_id, code, name, created_by, updated_by) VALUES (@customer, N'S1', N'Plant 1', @actor, @actor); SET @site = SCOPE_IDENTITY();
INSERT dbo.installed_assets (asset_seq, customer_id, customer_site_id, category, name, created_by, updated_by)
VALUES ((SELECT ISNULL(MAX(asset_seq), 0) + 1 FROM dbo.installed_assets WHERE deleted_at IS NULL), @customer, @site, N'PLC', N'Line PLC', @actor, @actor); SET @asset = SCOPE_IDENTITY();

-- References: the asset must be this customer's.
INSERT @refs EXEC sp_executesql ${q(CREDENTIAL_REFERENCES_SQL)}, ${inputParams}',
  @customer, @site, @asset, NULL, N'Login', N'PLC web', N'admin', N'10.0.0.10', N'';
${check("references accepted", "(SELECT customer_ok + site_ok + asset_ok + project_ok FROM @refs) = 4")}
DELETE FROM @refs;
INSERT @refs EXEC sp_executesql ${q(CREDENTIAL_REFERENCES_SQL)}, ${inputParams}',
  @other, NULL, @asset, NULL, N'Login', N'x', N'', N'', N'';
${check("another customer's asset refused", "(SELECT asset_ok FROM @refs) = 0")}

-- Insert, then seal (the id is part of the authenticated data).
INSERT @new EXEC sp_executesql ${q(CREDENTIAL_INSERT_SQL)}, ${inputParams}, @actor bigint',
  @customer, @site, @asset, NULL, N'Login', N'PLC web', N'admin', N'10.0.0.10', N'', @actor;
SELECT @id = id FROM @new;
EXEC sp_executesql ${q(CREDENTIAL_SET_SECRET_SQL)}, N'@id bigint, @cipher varbinary(max), @iv varbinary(12), @tag varbinary(16), @key_id tinyint',
  @id, 0x0102030405, 0x0A0B0C0D0E0F101112131415, 0x00112233445566778899AABBCCDDEEFF, 1;
${check("sealed", "EXISTS (SELECT 1 FROM dbo.site_credentials WHERE id = @id AND key_id = 1 AND DATALENGTH(secret_cipher) = 5)")}
EXEC sp_executesql ${q(CREDENTIAL_LOG_SQL)}, N'@id bigint, @actor bigint, @action nvarchar(20), @ip nvarchar(64)', @id, @actor, N'Created', N'100.64.0.9';
EXEC sp_executesql ${q(CREDENTIAL_LOG_SQL)}, N'@id bigint, @actor bigint, @action nvarchar(20), @ip nvarchar(64)', @id, @actor, N'Revealed', N'100.64.0.9';

-- A customer-wide credential with no asset.
DELETE FROM @new;
INSERT @new EXEC sp_executesql ${q(CREDENTIAL_INSERT_SQL)}, ${inputParams}, @actor bigint',
  @customer, NULL, NULL, NULL, N'VPN', N'Plant VPN', N'tmt', N'vpn.example', N'', @actor;
SELECT @site_cred = id FROM @new;

-- List by asset with site-wide ones, and the reveal-scope column.
DECLARE @list TABLE (id bigint, customer_id bigint, customer_name nvarchar(300), customer_site_id bigint, customer_site_name nvarchar(300),
  asset_id bigint, asset_no nvarchar(20), asset_name nvarchar(200), project_id bigint, project_no nvarchar(30), kind nvarchar(20), label nvarchar(200),
  username nvarchar(300), host nvarchar(300), notes nvarchar(2000), updated_at datetimeoffset(0), updated_by_name nvarchar(200),
  secret_changed_at datetimeoffset(0), last_revealed_at datetimeoffset(0), last_revealed_by nvarchar(200), can_reveal_scope int, row_version binary(8));
INSERT @list EXEC sp_executesql ${q(CREDENTIAL_LIST_SQL)},
  N'@actor bigint, @elevated bit, @customer bigint, @customer_site bigint, @asset bigint, @include_site_wide bit, @search nvarchar(200)',
  @actor, 0, @customer, @site, @asset, 1, NULL;
${check("asset list has its own and the customer-wide credential", "(SELECT COUNT(*) FROM @list) = 2")}
${check("last reveal shown", "EXISTS (SELECT 1 FROM @list WHERE id = @id AND last_revealed_by = N'Vault Smoke' AND can_reveal_scope = 1)")}
DELETE FROM @list;
INSERT @list EXEC sp_executesql ${q(CREDENTIAL_LIST_SQL)},
  N'@actor bigint, @elevated bit, @customer bigint, @customer_site bigint, @asset bigint, @include_site_wide bit, @search nvarchar(200)',
  @actor, 0, @customer, NULL, NULL, 0, N'VPN';
${check("search by label", "(SELECT COUNT(*) FROM @list) = 1 AND EXISTS (SELECT 1 FROM @list WHERE id = @site_cred)")}

-- Update.
EXEC sp_executesql ${q(CREDENTIAL_UPDATE_SQL)}, ${inputParams}, @actor bigint, @id bigint',
  @customer, @site, @asset, NULL, N'Login', N'PLC web (renamed)', N'admin', N'10.0.0.11', N'note', @actor, @id;
${check("updated", "(SELECT host FROM dbo.site_credentials WHERE id = @id) = N'10.0.0.11'")}
EXEC sp_executesql ${q(`${CREDENTIAL_SELECT} WHERE c.id = @id;`)}, N'@actor bigint, @elevated bit, @id bigint', @actor, 0, @id;

-- The access log refuses unknown actions.
BEGIN TRY
  INSERT dbo.site_credential_access (credential_id, user_id, action) VALUES (@id, @actor, N'Copied');
  THROW 51999, N'Smoke check failed: an unknown access action was accepted', 1;
END TRY
BEGIN CATCH
  IF ERROR_NUMBER() <> 547 THROW;
END CATCH;

ROLLBACK TRANSACTION;
PRINT N'Site credentials SQL smoke passed.';
`;

process.stdout.write(batch);
