SET XACT_ABORT ON;
SET NOCOUNT ON;
GO
IF EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=53) RETURN;
IF NOT EXISTS(SELECT 1 FROM dbo.schema_versions WHERE version=52) THROW 51520,'Migration 052 required.',1;
BEGIN TRANSACTION;

ALTER TABLE dbo.customers ADD short_name nvarchar(100) NOT NULL DEFAULT N'', website nvarchar(500) NOT NULL DEFAULT N'', country nvarchar(120) NOT NULL DEFAULT N'Thailand', account_owner_id bigint NULL REFERENCES dbo.users(id);
ALTER TABLE dbo.customer_site_contacts ADD contact_role nvarchar(40) NOT NULL DEFAULT N'Other', messaging_address nvarchar(200) NOT NULL DEFAULT N'', note nvarchar(4000) NOT NULL DEFAULT N'';

CREATE TABLE dbo.crm_options (
 kind varchar(30) NOT NULL, code nvarchar(40) NOT NULL, label_th nvarchar(200) NOT NULL,
 label_en nvarchar(200) NOT NULL, label_ja nvarchar(200) NOT NULL,
 quiet_days int NULL CHECK(quiet_days BETWEEN 1 AND 365), is_active bit NOT NULL DEFAULT 1,
 row_version rowversion NOT NULL, PRIMARY KEY(kind,code)
);
INSERT dbo.crm_options(kind,code,label_th,label_en,label_ja,quiet_days) VALUES
('stage','NEW',N'ใหม่','New',N'新規',5),('stage','QUALIFICATION',N'คัดกรอง','Qualification',N'案件評価',5),
('stage','REQUIREMENT',N'เก็บความต้องการ','Requirement',N'要件確認',7),('stage','ESTIMATING',N'ประมาณราคา','Estimating',N'見積作成',NULL),
('stage','PROPOSAL',N'เสนอราคาแล้ว','Proposal submitted',N'提案済み',7),('stage','NEGOTIATION',N'เจรจา','Negotiation',N'交渉中',5),
('stage','WON',N'ชนะงาน','Won',N'受注',NULL),('stage','LOST',N'แพ้งาน','Lost',N'失注',NULL),('stage','ON_HOLD',N'พักงาน','On hold',N'保留',NULL);
INSERT dbo.crm_options(kind,code,label_th,label_en,label_ja) VALUES
('source','ExistingCustomer',N'ลูกค้าเดิม','Existing customer',N'既存顧客'),('source','Referral',N'แนะนำ','Referral',N'紹介'),('source','Exhibition',N'งานแสดงสินค้า','Exhibition',N'展示会'),('source','Supplier',N'ผู้ขาย','Supplier',N'仕入先'),('source','DirectInquiry',N'ติดต่อโดยตรง','Direct inquiry',N'直接問い合わせ'),('source','Management',N'ผู้บริหาร','Management',N'経営陣'),('source','Website',N'เว็บไซต์','Website',N'ウェブサイト'),('source','Partner',N'พันธมิตร','Partner',N'パートナー'),('source','Other',N'อื่นๆ','Other',N'その他'),
('lostReason','Price',N'ราคา','Price',N'価格'),('lostReason','BudgetCancelled',N'ยกเลิกงบ','Budget cancelled',N'予算中止'),('lostReason','Competitor',N'คู่แข่ง','Competitor',N'競合'),('lostReason','TechnicalLimitation',N'ข้อจำกัดเทคนิค','Technical limitation',N'技術的制約'),('lostReason','CustomerPostponed',N'ลูกค้าเลื่อน','Customer postponed',N'顧客延期'),('lostReason','NoResponse',N'ไม่ตอบกลับ','No response',N'応答なし'),('lostReason','InternalCapacity',N'กำลังคนไม่พอ','Internal capacity',N'社内能力'),('lostReason','ScopeMismatch',N'ขอบเขตไม่ตรง','Scope mismatch',N'範囲不一致'),('lostReason','Other',N'อื่นๆ','Other',N'その他'),
('contactRole','DecisionMaker',N'ผู้ตัดสินใจ','Decision maker',N'決裁者'),('contactRole','Technical',N'เทคนิค','Technical',N'技術'),('contactRole','Purchasing',N'จัดซื้อ','Purchasing',N'購買'),('contactRole','IT',N'ไอที','IT',N'IT'),('contactRole','EndUser',N'ผู้ใช้งาน','End user',N'利用者'),('contactRole','Coordinator',N'ผู้ประสานงาน','Coordinator',N'調整担当'),('contactRole','Management',N'ผู้บริหาร','Management',N'管理者'),('contactRole','Other',N'อื่นๆ','Other',N'その他');

CREATE SEQUENCE dbo.crm_opportunity_numbers AS bigint START WITH 1 INCREMENT BY 1;
CREATE TABLE dbo.crm_opportunities (
 id bigint IDENTITY PRIMARY KEY, opportunity_no nvarchar(80) NOT NULL UNIQUE,
 name nvarchar(300) NOT NULL, customer_id bigint NOT NULL REFERENCES dbo.customers(id),
 site_id bigint NULL REFERENCES dbo.customer_sites(id), contact_id bigint NULL REFERENCES dbo.customer_site_contacts(id),
 sales_owner_id bigint NOT NULL REFERENCES dbo.users(id), technical_owner_id bigint NULL REFERENCES dbo.users(id),
 source nvarchar(40) NOT NULL DEFAULT N'DirectInquiry', need nvarchar(max) NOT NULL DEFAULT N'', scope nvarchar(max) NOT NULL DEFAULT N'',
 expected_value decimal(19,4) NULL CHECK(expected_value>=0), expected_close date NULL,
 stage nvarchar(40) NOT NULL DEFAULT N'NEW' CHECK(stage IN('NEW','QUALIFICATION','REQUIREMENT','ESTIMATING','PROPOSAL','NEGOTIATION','WON','LOST','ON_HOLD')),
 probability int NULL CHECK(probability BETWEEN 0 AND 100), competitor nvarchar(300) NOT NULL DEFAULT N'',
 priority nvarchar(20) NOT NULL DEFAULT N'Normal' CHECK(priority IN('Low','Normal','High','Urgent')),
 lost_reason nvarchar(40) NULL, lost_detail nvarchar(2000) NOT NULL DEFAULT N'', internal_note nvarchar(max) NOT NULL DEFAULT N'',
 stage_changed_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
 created_by bigint NOT NULL REFERENCES dbo.users(id), created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_by bigint NOT NULL REFERENCES dbo.users(id), updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(), row_version rowversion NOT NULL,
 CHECK(stage<>'LOST' OR (lost_reason IS NOT NULL AND (lost_reason<>'Other' OR LEN(LTRIM(RTRIM(lost_detail)))>0)))
);
CREATE INDEX IX_crm_opportunities_owner ON dbo.crm_opportunities(sales_owner_id,technical_owner_id,stage);
CREATE INDEX IX_crm_opportunities_customer ON dbo.crm_opportunities(customer_id,expected_close);
CREATE TABLE dbo.crm_activities (
 id bigint IDENTITY PRIMARY KEY, customer_id bigint NOT NULL REFERENCES dbo.customers(id),
 opportunity_id bigint NULL REFERENCES dbo.crm_opportunities(id), contact_id bigint NULL REFERENCES dbo.customer_site_contacts(id),
 inquiry_id bigint NULL REFERENCES dbo.inquiries(id), estimate_id bigint NULL REFERENCES dbo.estimates(id), project_id bigint NULL REFERENCES dbo.projects(id),
 activity_type nvarchar(40) NOT NULL CHECK(activity_type IN('Meeting','Call','Email','SiteVisit','CustomerUpdate','InternalDiscussion','MessageLINE','Note','Other')),
 occurred_at datetimeoffset NOT NULL, owner_id bigint NOT NULL REFERENCES dbo.users(id), participants nvarchar(2000) NOT NULL DEFAULT N'',
 summary nvarchar(4000) NOT NULL, decision nvarchar(4000) NOT NULL DEFAULT N'', action_items nvarchar(4000) NOT NULL DEFAULT N'',
 created_by bigint NOT NULL REFERENCES dbo.users(id), created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(), row_version rowversion NOT NULL
);
CREATE INDEX IX_crm_activities_timeline ON dbo.crm_activities(customer_id,opportunity_id,occurred_at DESC);
CREATE TABLE dbo.crm_followups (
 id bigint IDENTITY PRIMARY KEY, opportunity_id bigint NOT NULL REFERENCES dbo.crm_opportunities(id),
 activity_id bigint NULL REFERENCES dbo.crm_activities(id), action nvarchar(1000) NOT NULL,
 owner_id bigint NOT NULL REFERENCES dbo.users(id), due_date date NOT NULL,
 priority nvarchar(20) NOT NULL DEFAULT N'Normal' CHECK(priority IN('Low','Normal','High','Urgent')),
 status nvarchar(30) NOT NULL DEFAULT N'Open' CHECK(status IN('Open','WaitingCustomer','WaitingInternal','WaitingSupplier','Done','Cancelled')),
 created_by bigint NOT NULL REFERENCES dbo.users(id), created_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_by bigint NOT NULL REFERENCES dbo.users(id), updated_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME(), row_version rowversion NOT NULL
);
CREATE INDEX IX_crm_followups_due ON dbo.crm_followups(owner_id,status,due_date);
ALTER TABLE dbo.inquiries ADD opportunity_id bigint NULL REFERENCES dbo.crm_opportunities(id), customer_site_id bigint NULL REFERENCES dbo.customer_sites(id), customer_contact_id bigint NULL REFERENCES dbo.customer_site_contacts(id);

-- Metadata only: bytes are managed by the existing document-storage provider.
CREATE TABLE dbo.crm_documents (
 id bigint IDENTITY PRIMARY KEY, customer_id bigint NOT NULL REFERENCES dbo.customers(id),
 opportunity_id bigint NULL REFERENCES dbo.crm_opportunities(id), activity_id bigint NULL REFERENCES dbo.crm_activities(id),
 name nvarchar(500) NOT NULL, content_type nvarchar(200) NOT NULL, size_bytes bigint NOT NULL,
 storage_key nvarchar(1000) NOT NULL, sha256 char(64) NOT NULL, uploaded_by bigint NOT NULL REFERENCES dbo.users(id),
 uploaded_at datetimeoffset NOT NULL DEFAULT SYSUTCDATETIME()
);

INSERT dbo.permissions(code,description) VALUES
('crm.read','Read CRM records in assigned scope'),('crm.write','Manage opportunities and follow-ups'),
('crm.activity.write','Add customer activities'),('crm.contact.write','Manage shared customer contacts'),
('crm.read.team','Read CRM records owned by department members'),('crm.read.all','Read all CRM records'),
('crm.commercial.read','View CRM commercial values'),('crm.configure','Configure CRM choices and follow-up thresholds'),
('crm.convert','Create technical inquiries from opportunities');
INSERT dbo.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM dbo.roles r CROSS JOIN dbo.permissions p WHERE p.code LIKE 'crm.%' AND
 (r.code=N'Admin'
 OR (r.code IN(N'Sales',N'Sales Engineer') AND p.code IN('crm.read','crm.write','crm.activity.write','crm.contact.write','crm.commercial.read','crm.convert'))
 OR (r.code=N'Engineer' AND p.code IN('crm.read','crm.activity.write'))
 OR (r.code IN(N'Leader',N'Engineering Manager') AND p.code IN('crm.read','crm.write','crm.activity.write','crm.contact.write','crm.read.team','crm.convert'))
 OR (r.code IN(N'Manager',N'Management') AND p.code IN('crm.read','crm.write','crm.activity.write','crm.contact.write','crm.read.all','crm.commercial.read','crm.convert')));
IF DATABASE_PRINCIPAL_ID(N'iot_team_app_role') IS NOT NULL
BEGIN
 GRANT SELECT,INSERT,UPDATE ON dbo.crm_opportunities TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.crm_options TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.crm_activities TO iot_team_app_role;
 GRANT SELECT,INSERT,UPDATE ON dbo.crm_followups TO iot_team_app_role;
 GRANT SELECT,INSERT ON dbo.crm_documents TO iot_team_app_role;
 GRANT UPDATE ON OBJECT::dbo.crm_opportunity_numbers TO iot_team_app_role;
END;
INSERT dbo.schema_versions(version,name) VALUES(53,N'CRM opportunities and customer follow-up');
COMMIT;
