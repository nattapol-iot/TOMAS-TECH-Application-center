-- Synthetic identities only. Execute exclusively on the isolated Drawing CI database.
INSERT dbo.users(entra_object_id,email,name,role_id)
SELECT v.id,v.id+N'@test.invalid',v.name,r.id FROM (VALUES
 (N'drawing-member',N'TEST Member',N'Engineer'),
 (N'drawing-leader',N'TEST Leader',N'Project Manager'),
 (N'drawing-manager',N'TEST Manager',N'Engineering Manager'),
 (N'drawing-other',N'TEST Other Member',N'Engineer'),
 (N'drawing-admin',N'TEST Administrator',N'Admin')) v(id,name,role)
JOIN dbo.roles r ON r.code=v.role;
DECLARE @member bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'drawing-member'),
 @leader bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'drawing-leader'),
 @manager bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'drawing-manager'),
 @other bigint=(SELECT id FROM dbo.users WHERE entra_object_id=N'drawing-other');
INSERT dbo.customers(code,name,created_by,updated_by) VALUES(N'TEST',N'TEST ONLY customer',@member,@member);
DECLARE @customer bigint=SCOPE_IDENTITY();
INSERT dbo.inquiries(inquiry_no,inquiry_date,customer_id,project_name,project_type,estimate_owner_id,due_date,priority,status,created_by,updated_by)
VALUES(N'TEST-INQ','20260905',@customer,N'TEST ONLY drawing','IoT',@member,'20260930','Normal','Approved',@member,@member);
DECLARE @inquiry bigint=SCOPE_IDENTITY();
INSERT dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,created_date,due_date,status,created_by,updated_by)
VALUES(N'TEST-EST',@inquiry,@customer,N'TEST ONLY drawing','IoT',@member,'20260905','20260930','Approved',@member,@member);
DECLARE @estimate bigint=SCOPE_IDENTITY();
INSERT dbo.projects(project_no,name,customer_id,project_type,status,manager_id,lead_engineer_id,inquiry_id,estimate_id,po_no,po_date,start_date,target_delivery,folder_path,created_by,updated_by)
VALUES(N'TEST-PROJ',N'TEST ONLY Drawing Release',@customer,'IoT','Design',@manager,@leader,@inquiry,@estimate,'TEST-PO','20260905','20260905','20260930','TEST-ONLY',@manager,@manager);
DECLARE @project bigint=SCOPE_IDENTITY();
INSERT dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project,@member,'Member',@manager),(@project,@other,'Member',@manager);
INSERT dbo.project_folders(project_id,folder_code,name,created_by) VALUES(@project,'02','Drawing',@manager);
INSERT dbo.schedule_tasks(project_id,sort_order,kind,name,origin,created_by,visibility,updated_by)
VALUES(@project,1,'task','TEST ONLY Design control panel','PM',@manager,'Internal',@manager);
DECLARE @task bigint=SCOPE_IDENTITY();
INSERT dbo.schedule_task_pics(task_id,user_id) VALUES(@task,@member);
