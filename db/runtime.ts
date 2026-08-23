import { env } from "cloudflare:workers";

export function getD1() { if (!env.DB) throw new Error("Database binding is unavailable"); return env.DB; }

export async function ensureDatabase(db: D1Database) {
  const schema = [
    `CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'General', contact_name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS estimates (id INTEGER PRIMARY KEY AUTOINCREMENT, estimate_no TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL, running_no INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 0, project_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', assigned_to INTEGER NOT NULL, leader_id INTEGER NOT NULL, manager_id INTEGER NOT NULL, due_date TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, selected_modules TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS estimate_checklist (id INTEGER PRIMARY KEY AUTOINCREMENT, estimate_id INTEGER NOT NULL, checklist_key TEXT NOT NULL, label TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, weight INTEGER NOT NULL DEFAULT 20)`,
    `CREATE TABLE IF NOT EXISTS cost_items (id INTEGER PRIMARY KEY AUTOINCREMENT, estimate_id INTEGER NOT NULL, category TEXT NOT NULL, module TEXT NOT NULL DEFAULT 'Core', model TEXT NOT NULL DEFAULT '', description TEXT NOT NULL, supplier_id INTEGER, unit_price REAL NOT NULL DEFAULT 0, quantity REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'Set', sort_order INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS labor_rates (id INTEGER PRIMARY KEY AUTOINCREMENT, workforce_type TEXT NOT NULL, discipline TEXT NOT NULL, work_type TEXT NOT NULL, unit TEXT NOT NULL, rate REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE IF NOT EXISTS approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, estimate_id INTEGER NOT NULL, stage TEXT NOT NULL, sequence INTEGER NOT NULL, approver_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'Pending', comment TEXT NOT NULL DEFAULT '', acted_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS activity_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, estimate_id INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE INDEX IF NOT EXISTS idx_estimates_customer_status ON estimates(customer_id, status)`, `CREATE INDEX IF NOT EXISTS idx_estimates_assigned_to ON estimates(assigned_to)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_estimate_sequence ON approvals(estimate_id, sequence)`, `CREATE INDEX IF NOT EXISTS idx_cost_items_estimate ON cost_items(estimate_id)`,
  ];
  await db.batch(schema.map((statement) => db.prepare(statement)));
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM customers").first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;
  await db.batch([
    db.prepare("INSERT INTO customers (code,name,contact_name,email) VALUES (?,?,?,?)").bind("SDM","Siam DENSO Manufacturing","Purchasing Team","purchasing@sdm.example"),
    db.prepare("INSERT INTO customers (code,name,contact_name,email) VALUES (?,?,?,?)").bind("MEJ","Meiji Thailand","Engineering Team","engineering@meiji.example"),
    db.prepare("INSERT INTO customers (code,name,contact_name,email) VALUES (?,?,?,?)").bind("AAP","AAPICO Hitech","Project Team","project@aapico.example"),
    db.prepare("INSERT INTO customers (code,name,contact_name,email) VALUES (?,?,?,?)").bind("TTC","Thai Takagi Seiko","Maintenance Team","maintenance@tts.example"),
    db.prepare("INSERT INTO users (name,email,role) VALUES (?,?,?)").bind("Nattapol Poeam","nattapol@tomas-tech.com","Engineer"),
    db.prepare("INSERT INTO users (name,email,role) VALUES (?,?,?)").bind("Phatthadon","phatthadon@tomas-tech.com","Engineer"),
    db.prepare("INSERT INTO users (name,email,role) VALUES (?,?,?)").bind("Taweesak","taweesak@tomas-tech.com","Leader"),
    db.prepare("INSERT INTO users (name,email,role) VALUES (?,?,?)").bind("IoT Manager","manager@tomas-tech.com","Manager"),
    db.prepare("INSERT INTO suppliers (code,name,category,contact_name,email,phone) VALUES (?,?,?,?,?,?)").bind("SUP-KEY","Keyence Thailand","Vision & PLC","Sales Team","sales@keyence.example","02-000-0001"),
    db.prepare("INSERT INTO suppliers (code,name,category,contact_name,email,phone) VALUES (?,?,?,?,?,?)").bind("SUP-MIS","Mitsumi Electric","Electrical","Account Team","sales@mitsumi.example","02-000-0002"),
    db.prepare("INSERT INTO suppliers (code,name,category,contact_name,email,phone) VALUES (?,?,?,?,?,?)").bind("SUP-LOC","Local Fabrication Partner","Mechanical","Somchai","contact@localfab.example","081-000-0003"),
    db.prepare("INSERT INTO suppliers (code,name,category,contact_name,email,phone) VALUES (?,?,?,?,?,?)").bind("SUP-AMR","Hikrobot Logistics","AMR / CTU","Regional Sales","sales@hikrobot.example","02-000-0004"),
  ]);
  await db.batch([
    db.prepare("INSERT INTO estimates (estimate_no,customer_id,running_no,revision,project_name,status,assigned_to,leader_id,manager_id,due_date,progress,selected_modules) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("EST-SDM-2026-0001-R02",1,1,2,"Machine Learning Molding & Leak Predict System","In progress",1,3,4,"2026-08-28",78,'["CTU","AMR"]'),
    db.prepare("INSERT INTO estimates (estimate_no,customer_id,running_no,revision,project_name,status,assigned_to,leader_id,manager_id,due_date,progress,selected_modules) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("EST-MEJ-2026-0004-R00",2,4,0,"Packing Line Vision Inspection","Draft",2,3,4,"2026-08-30",52,'["Server"]'),
    db.prepare("INSERT INTO estimates (estimate_no,customer_id,running_no,revision,project_name,status,assigned_to,leader_id,manager_id,due_date,progress,selected_modules) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("EST-AAP-2026-0012-R01",3,12,1,"AMR Material Transfer Phase 2","Leader review",1,3,4,"2026-08-24",100,'["AMR","Infrastructure"]'),
    db.prepare("INSERT INTO estimates (estimate_no,customer_id,running_no,revision,project_name,status,assigned_to,leader_id,manager_id,due_date,progress,selected_modules) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("EST-TTC-2026-0018-R00",4,18,0,"IoT Energy Monitoring","Approved",1,3,4,"2026-08-20",100,'["Server","Infrastructure"]'),
  ]);
  const checks = [["project","Project & customer information",15,1],["modules","Project modules selected",10,1],["equipment","Equipment and supplier cost",30,1],["manpower","Internal manpower plan",20,1],["external","External manpower quotation",15,0],["validation","Final cost validation",10,0]] as const;
  await db.batch(checks.map(([key,label,weight,complete]) => db.prepare("INSERT INTO estimate_checklist (estimate_id,checklist_key,label,weight,completed) VALUES (1,?,?,?,?)").bind(key,label,weight,complete)));
  const rates = [["Internal","Mech","Normal","day",1800],["Internal","Mech","OT","hour",225],["Internal","Mech","Holiday","day",3600],["Internal","Mech","Holiday OT","hour",450],["Internal","Software","Normal","day",3500],["External","Mech","Normal","day",1600],["External","Mech","OT","hour",300],["External","Elec","Normal","day",1600]] as const;
  await db.batch(rates.map((rate) => db.prepare("INSERT INTO labor_rates (workforce_type,discipline,work_type,unit,rate) VALUES (?,?,?,?,?)").bind(...rate)));
  const items = [
    ["Hardware","Core","KV-8000","PLC",1,250000,1,"Set",1], ["Hardware","Core","VS-L160MX","Camera System",1,350000,2,"Set",2],
    ["Electrical","Core","CP-SDM-01","Control Panel",2,61190,1,"Set",3], ["Mechanical","Core","AL-FRAME","Machine Base",3,11500,2,"Set",4],
    ["Robot","CTU","MR-TP5-50DCH","CTU Robot & Charger",4,525000,1,"Set",5], ["Robot","AMR","MR-Q3-600LE-D","AMR Robot",4,385000,1,"Set",6],
    ["Software","Core","","System implementation and test run",null,3500,20,"Day",7],
  ] as const;
  await db.batch(items.map((item) => db.prepare("INSERT INTO cost_items (estimate_id,category,module,model,description,supplier_id,unit_price,quantity,unit,sort_order) VALUES (1,?,?,?,?,?,?,?,?,?)").bind(...item)));
  await db.batch([db.prepare("INSERT INTO approvals (estimate_id,stage,sequence,approver_id,status) VALUES (1,'Leader',1,3,'Pending')"), db.prepare("INSERT INTO approvals (estimate_id,stage,sequence,approver_id,status) VALUES (1,'Manager',2,4,'Waiting')"), db.prepare("INSERT INTO activity_logs (estimate_id,actor,action,detail) VALUES (1,'Nattapol Poeam','Updated cost','Added AMR model MR-Q3-600LE-D')")]);
  await db.prepare("PRAGMA optimize").run();
}
