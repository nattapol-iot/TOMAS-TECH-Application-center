import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import sql from "../../backend-node/node_modules/mssql/msnodesqlv8.js";

const sourcePath = process.argv[2];
const apply = process.argv.includes("--apply");
if (!sourcePath) throw new Error("Pass the workbook path.");

const sourceBytes = await readFile(sourcePath);
const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");
const sourceFile = sourcePath.split(/[\\/]/).at(-1);
const text = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const normalized = (value) => text(value).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
const bounded = (value, limit) => text(value).slice(0, limit);

const excelDate = (value) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 20_000 && value <= 80_000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000).toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const year = Number(value.slice(0, 4));
    return year >= 1950 ? value.slice(0, 10) : null;
  }
  return null;
};
const percent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number >= 0 && number <= 1 ? number * 100 : number));
};
const nonnegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};
const businessDays = (start, end) => {
  if (!start || !end || end < start) return 1;
  const cursor = new Date(`${start}T00:00:00.000Z`), finish = new Date(`${end}T00:00:00.000Z`);
  let count = 0;
  while (cursor <= finish) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.max(1, count);
};
const earliest = (values) => values.filter(Boolean).sort().at(0) ?? null;
const latest = (values) => values.filter(Boolean).sort().at(-1) ?? null;

const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const planRows = wb.worksheets.getItem("Overall Project Plan").getRange("A1:V1118").values;
const masterRows = wb.worksheets.getItem("Project List").getRange("A1:H639").values;
const projectMaster = new Map();
for (const row of masterRows.slice(1)) {
  const code = text(row[1]).toUpperCase();
  if (/^PJ\d+$/.test(code) && !projectMaster.has(code)) {
    projectMaster.set(code, { projectName: text(row[2]), customerName: text(row[3]) });
  }
}

const projects = [];
const regularByCode = new Map();
let current = null;
let trainingSequence = 0;
for (let index = 7; index < planRows.length; index += 1) {
  const row = planRows[index];
  const wbs = text(row[0]), name = text(row[1]);
  if (/^TEMPLATE ROWS$/i.test(wbs) || /^TEMPLATE ROWS$/i.test(name)) break;
  const header = name.match(/^\[(PJ\d+)\]\s*(.*)$/i);
  if (header) {
    const sourceCode = header[1].toUpperCase();
    const prior = regularByCode.get(sourceCode);
    if (prior && sourceCode !== "PJ000000") {
      current = prior;
      current.sourceRows.push(index + 1);
      current.tasks.push({ ...readTask(row, index + 1), name: text(header[2]) || `Schedule section ${wbs}` });
      continue;
    }
    const canonical = projectMaster.get(sourceCode);
    const suffix = sourceCode === "PJ000000" ? `-TR${String(++trainingSequence).padStart(2, "0")}` : "";
    const fallbackParts = header[2].split(/\s+:\s+/);
    current = {
      sourceCode,
      code: `${sourceCode}${suffix}`,
      sourceRows: [index + 1],
      sourceTitle: name,
      projectName: canonical?.projectName || fallbackParts[0] || sourceCode,
      customerName: canonical?.customerName || fallbackParts.slice(1).join(" : ") || "Tomas Engineering (Thailand) Co.,Ltd.",
      sourceStatus: text(row[2]),
      headerStarts: [excelDate(row[14])],
      headerEnds: [excelDate(row[15])],
      headerPercents: [percent(row[20])],
      tasks: [],
    };
    projects.push(current);
    if (sourceCode !== "PJ000000") regularByCode.set(sourceCode, current);
    continue;
  }
  if (!current || !/^\d+(?:\.\d+)*$/.test(wbs) || !name) continue;
  current.tasks.push(readTask(row, index + 1));
}

function readTask(row, rowNumber) {
  return {
    row: rowNumber,
    wbs: text(row[0]), name: text(row[1]), sourceStatus: text(row[2]), picReference: text(row[3]), department: text(row[4]),
    assigneeLabels: row.slice(5, 10).map(text).filter((value) => value && value !== "-"),
    people: nonnegative(row[10]), duration: nonnegative(row[11]), planManDays: nonnegative(row[12]), planManHours: nonnegative(row[13]),
    planStart: excelDate(row[14]), planEnd: excelDate(row[15]), days: nonnegative(row[16]),
    actualStart: excelDate(row[17]), actualEnd: excelDate(row[18]), actualManDays: nonnegative(row[19]),
    percent: percent(row[20]), workDays: typeof row[21] === "number" ? nonnegative(row[21]) : 0,
  };
}

for (const project of projects) {
  const taskStarts = project.tasks.map((task) => task.planStart), taskEnds = project.tasks.map((task) => task.planEnd);
  project.startDate = earliest([...project.headerStarts, ...taskStarts]) || "2026-06-15";
  project.targetDelivery = latest([...project.headerEnds, ...taskEnds]) || project.startDate;
  const headerProgress = Math.max(...project.headerPercents, 0);
  const leafTasks = project.tasks.filter((task) => task.wbs.includes("."));
  const derivedProgress = leafTasks.length ? leafTasks.reduce((sum, task) => sum + task.percent, 0) / leafTasks.length : 0;
  project.progress = headerProgress > 0 ? headerProgress : derivedProgress;
  const statusKey = normalized(project.sourceStatus);
  project.status = statusKey === "done" ? "Closed"
    : statusKey === "waiting" ? "On Hold"
      : statusKey.includes("progress") ? "Development"
        : statusKey === "pending" ? "Planning"
          : project.progress >= 100 ? "Closed" : project.progress > 0 ? "Development" : "Planning";
}

const connectionString = process.env.TEAMTEST_CONNECTION;
const appRole = process.env.TEAMTEST_APP_ROLE;
const appRolePassword = process.env.TEAMTEST_APP_ROLE_PASSWORD;
if (!connectionString || !appRole || !appRolePassword) throw new Error("Team Test database environment is incomplete.");
const parsed = sql.ConnectionPool.parseConnectionString(connectionString);
const odbcValue = (value) => `{${String(value).replaceAll("}", "}}")}}`;
const usesWindowsAuthentication = /(?:^|;)\s*(?:integrated\s+security|trusted_connection)\s*=\s*(?:true|yes|sspi)\s*(?:;|$)/i.test(connectionString);
const server = parsed.options?.instanceName ? `${parsed.server}\\${parsed.options.instanceName}` : parsed.port && parsed.port !== 1433 ? `${parsed.server},${parsed.port}` : parsed.server;
const odbcConnection = ["Driver={ODBC Driver 18 for SQL Server}", `Server=${odbcValue(server)}`, `Database=${odbcValue(parsed.database)}`,
  ...(usesWindowsAuthentication ? ["Trusted_Connection=Yes"] : [`UID=${odbcValue(parsed.user ?? "")}`, `PWD=${odbcValue(parsed.password ?? "")}`]),
  "Encrypt=Yes", "TrustServerCertificate=Yes", "APP={Codex Overall Project Plan Import}"].join(";");
const pool = await new sql.ConnectionPool({ ...parsed, connectionString: odbcConnection, pool: { max: 1, min: 1, idleTimeoutMillis: 30_000 } }).connect();

const roleName = appRole.replaceAll("'", "''"), rolePassword = appRolePassword.replaceAll("'", "''");
await pool.request().query(`EXEC sys.sp_setapprole N'${roleName}', N'${rolePassword}';`);

const users = (await pool.request().query(`SELECT u.id,u.name,u.email,u.level FROM dbo.users u WHERE u.deleted_at IS NULL AND u.is_active=1;`)).recordset;
const customers = (await pool.request().query(`SELECT id,code,name FROM dbo.customers WHERE deleted_at IS NULL;`)).recordset;
const existingProjects = (await pool.request().query(`SELECT id,project_no,name,remark FROM dbo.projects WHERE deleted_at IS NULL;`)).recordset;
const userByName = new Map(users.map((user) => [normalized(user.name), user]));
const customerByName = new Map(customers.map((customer) => [normalized(customer.name), customer]));
const nattapol = userByName.get(normalized("Nattapol Poeam"));
if (!nattapol) throw new Error("Active Nattapol Poeam user was not found.");

const aliases = [
  ["nattapol poeam", "Nattapol Poeam"], ["nattapol poeam poeam", "Nattapol Poeam"], ["boy", "Nattapol Poeam"],
  ["suphawat tinaso", "Suphawat Tinaso"], ["supawat tinso", "Suphawat Tinaso"], ["supawat", "Suphawat Tinaso"], ["book", "Suphawat Tinaso"],
  ["taweesak suriyon", "Taweesak Suriyon"], ["taweesak", "Taweesak Suriyon"], ["mos", "Taweesak Suriyon"],
  ["phatthadon inthachot", "Phatthadon Inthachot"], ["phatthadon", "Phatthadon Inthachot"], ["toy", "Phatthadon Inthachot"],
  ["nattapong sukcharoen", "Nattapong Sukcharoen"], ["nattapong", "Nattapong Sukcharoen"], ["game", "Nattapong Sukcharoen"],
  ["pattanasak chaonchom", "Pattanasak Chaonchom"], ["pattasak", "Pattanasak Chaonchom"], ["pattanasak", "Pattanasak Chaonchom"], ["kong", "Pattanasak Chaonchom"],
  ["warit chunlaka", "Warit Chunlaka"], ["warit", "Warit Chunlaka"], ["natt", "Warit Chunlaka"],
  ["nattanun nunet", "Nattanun Nunet"], ["nattanan", "Nattanun Nunet"], ["nattanun", "Nattanun Nunet"], ["donut", "Nattanun Nunet"],
  ["purinat thongbaiyai", "Purinat Thongbaiyai"], ["purinat", "Purinat Thongbaiyai"], ["dream", "Purinat Thongbaiyai"],
  ["konlawat saechee", "Konlawat Saechee"], ["konlawat", "Konlawat Saechee"], ["nook", "Konlawat Saechee"],
  ["worawit khantamool", "Worawit Khantamool"], ["worrawit", "Worawit Khantamool"], ["worawit", "Worawit Khantamool"], ["aum", "Worawit Khantamool"],
  ["tachapon mulmanee", "Tachapon Mulmanee"], ["tachapon", "Tachapon Mulmanee"], ["tae", "Tachapon Mulmanee"],
  ["nattawat hannok", "Nattawat Hannok"], ["nattawat", "Nattawat Hannok"], ["sab", "Nattawat Hannok"],
  ["soemsak powe", "Soemsak Powe"], ["sermsak powe", "Soemsak Powe"], ["p nok", "Soemsak Powe"],
];
const aliasPatterns = aliases.map(([alias, canonical]) => ({ pattern: new RegExp(`(?:^|[^a-z])${alias.replaceAll(" ", "\\s+")}(?:$|[^a-z])`, "i"), canonical }));
function resolveAssignees(labels) {
  const ids = new Set(), unresolved = [];
  for (const label of labels) {
    const direct = userByName.get(normalized(label.replace(/^\([^)]*\)\s*/, "")));
    if (direct) { ids.add(Number(direct.id)); continue; }
    let found = false;
    for (const alias of aliasPatterns) {
      if (!alias.pattern.test(label)) continue;
      const user = userByName.get(normalized(alias.canonical));
      if (user) ids.add(Number(user.id));
      found = true;
    }
    if (!found) unresolved.push(label);
  }
  return { ids: [...ids], unresolved };
}

const existingCodes = new Set(existingProjects.map((project) => String(project.project_no).toUpperCase()));
const customerResolutions = new Map();
for (const project of projects) {
  const key = normalized(project.customerName);
  let customer = customerByName.get(key);
  if (!customer && project.sourceCode === "PJ000000") customer = customerByName.get(normalized("Tomas Engineering (Thailand) Co.,Ltd."));
  customerResolutions.set(project.code, customer ?? null);
  project.tasks.forEach((task) => Object.assign(task, resolveAssignees(task.assigneeLabels)));
}
const unmatchedCustomers = projects.filter((project) => !customerResolutions.get(project.code)).map((project) => ({ code: project.code, customer: project.customerName }));
const unresolvedAssignments = projects.flatMap((project) => project.tasks.filter((task) => task.unresolved.length).map((task) => ({ project: project.code, row: task.row, labels: task.unresolved })));
const unresolvedLabels = [...new Set(unresolvedAssignments.flatMap((item) => item.labels))].sort();
const summary = {
  mode: apply ? "apply" : "dry-run", sourceFile, sourceHash,
  parsedProjects: projects.length, parsedTasks: projects.reduce((sum, project) => sum + project.tasks.length, 0),
  newProjects: projects.filter((project) => !existingCodes.has(project.code)).length,
  skippedExistingProjects: projects.filter((project) => existingCodes.has(project.code)).map((project) => project.code),
  matchedCustomers: projects.length - unmatchedCustomers.length, unmatchedCustomers,
  resolvedTaskAssignments: projects.reduce((sum, project) => sum + project.tasks.filter((task) => task.ids.length).length, 0),
  unresolvedAssignmentRows: unresolvedAssignments.length,
  unresolvedLabels,
  unresolvedAssignmentSamples: unresolvedAssignments.slice(0, 30),
  projectStatusCounts: Object.fromEntries([...projects.reduce((m,p)=>m.set(p.status,(m.get(p.status)||0)+1),new Map())]),
  dateFallbackProjects: projects.filter((project) => project.startDate === "2026-06-15" && !project.headerStarts.some(Boolean) && !project.tasks.some((task) => task.planStart)).map((project) => project.code),
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  await pool.close();
  process.exit(0);
}
if (unmatchedCustomers.length) throw new Error(`Unmatched customers remain: ${JSON.stringify(unmatchedCustomers)}`);

const tx = new sql.Transaction(pool);
await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
const imported = [];
try {
  for (const project of projects) {
    if (existingCodes.has(project.code)) continue;
    const customer = customerResolutions.get(project.code);
    const projectNote = `Imported from ${sourceFile}; sheet Overall Project Plan; source row(s) ${project.sourceRows.join(", ")}; SHA-256 ${sourceHash}. Original status: ${project.sourceStatus || "blank"}.`;
    const inquiryNo = `IMP-INQ-${project.code}`.slice(0, 30), estimateNo = `IMP-EST-${project.code}`.slice(0, 30);

    const inquiryRequest = new sql.Request(tx);
    inquiryRequest.input("number", sql.NVarChar(30), inquiryNo).input("date", sql.Date, project.startDate).input("customer", sql.BigInt, Number(customer.id))
      .input("name", sql.NVarChar(300), bounded(project.projectName, 300)).input("owner", sql.BigInt, Number(nattapol.id)).input("due", sql.Date, project.targetDelivery)
      .input("remark", sql.NVarChar(sql.MAX), projectNote).input("actor", sql.BigInt, Number(nattapol.id));
    const inquiryId = Number((await inquiryRequest.query(`INSERT INTO dbo.inquiries(inquiry_no,inquiry_date,customer_id,contact,project_name,project_type,rfq_no,sales_owner,estimate_owner_id,due_date,priority,status,progress,revision,remark,created_by,updated_by) OUTPUT inserted.id VALUES(@number,@date,@customer,N'',@name,N'IoT',NULL,N'Nattapol Poeam',@owner,@due,N'Normal',N'Approved',100,0,@remark,@actor,@actor);`)).recordset[0].id);

    const estimateRequest = new sql.Request(tx);
    estimateRequest.input("number", sql.NVarChar(30), estimateNo).input("inquiry", sql.BigInt, inquiryId).input("customer", sql.BigInt, Number(customer.id))
      .input("name", sql.NVarChar(300), bounded(project.projectName, 300)).input("owner", sql.BigInt, Number(nattapol.id)).input("created", sql.Date, project.startDate)
      .input("due", sql.Date, project.targetDelivery).input("actor", sql.BigInt, Number(nattapol.id));
    const estimateId = Number((await estimateRequest.query(`INSERT INTO dbo.estimates(estimate_no,inquiry_id,customer_id,project_name,project_type,owner_id,revision,created_date,due_date,status,progress,contingency_rate,locked_at,locked_by,created_by,updated_by) OUTPUT inserted.id VALUES(@number,@inquiry,@customer,@name,N'IoT',@owner,0,@created,@due,N'Locked',100,0,SYSUTCDATETIME(),@actor,@actor,@actor);`)).recordset[0].id);
    const revision = new sql.Request(tx);
    revision.input("estimate", sql.BigInt, estimateId).input("actor", sql.BigInt, Number(nattapol.id)).input("description", sql.NVarChar(sql.MAX), projectNote);
    await revision.query(`INSERT INTO dbo.estimate_revisions(estimate_id,revision,reason,description,created_by,reviewed_by,reviewed_at,status,total) VALUES(@estimate,0,N'Imported project schedule',@description,@actor,@actor,SYSUTCDATETIME(),N'Approved',0);`);
    const linkInquiry = new sql.Request(tx);
    linkInquiry.input("estimate", sql.BigInt, estimateId).input("inquiry", sql.BigInt, inquiryId);
    await linkInquiry.query(`UPDATE dbo.inquiries SET estimate_id=@estimate,updated_at=SYSUTCDATETIME() WHERE id=@inquiry;`);

    const projectRequest = new sql.Request(tx);
    projectRequest.input("number", sql.NVarChar(30), project.code).input("name", sql.NVarChar(300), bounded(project.projectName, 300))
      .input("customer", sql.BigInt, Number(customer.id)).input("status", sql.NVarChar(50), project.status).input("manager", sql.BigInt, Number(nattapol.id))
      .input("inquiry", sql.BigInt, inquiryId).input("estimate", sql.BigInt, estimateId).input("start", sql.Date, project.startDate)
      .input("target", sql.Date, project.targetDelivery).input("actual", sql.Date, project.status === "Closed" ? project.targetDelivery : null)
      .input("progress", sql.Decimal(5, 2), project.progress).input("remark", sql.NVarChar(sql.MAX), projectNote)
      .input("folder", sql.NVarChar(1000), `IoT Team - Documents / Project - ${project.startDate.slice(0,4)} / [${project.code}] ${bounded(project.projectName, 300)}`)
      .input("actor", sql.BigInt, Number(nattapol.id));
    const projectId = Number((await projectRequest.query(`INSERT INTO dbo.projects(project_no,name,customer_id,project_type,status,manager_id,lead_engineer_id,inquiry_id,estimate_id,po_no,po_date,start_date,target_delivery,actual_delivery,progress,site,remark,folder_path,created_by,updated_by) OUTPUT inserted.id VALUES(@number,@name,@customer,N'IoT',@status,@manager,@manager,@inquiry,@estimate,N'Imported schedule',@start,@start,@target,@actual,@progress,N'',@remark,@folder,@actor,@actor);`)).recordset[0].id);

    const memberIds = new Set([Number(nattapol.id)]);
    for (const task of project.tasks) task.ids.forEach((id) => memberIds.add(id));
    for (const userId of memberIds) {
      const member = new sql.Request(tx);
      member.input("project", sql.BigInt, projectId).input("user", sql.BigInt, userId).input("role", sql.NVarChar(100), userId === Number(nattapol.id) ? "Project Manager" : "Schedule Member").input("actor", sql.BigInt, Number(nattapol.id));
      await member.query(`INSERT INTO dbo.project_members(project_id,user_id,role_on_project,created_by) VALUES(@project,@user,@role,@actor);`);
    }
    const standardFolders = [["00","To do list"],["01","Concept Design and Proposal"],["02","Drawing"],["03","Estimate cost"],["04","Quote"],["05","PO"],["06","Specifications and Documentation"],["07","Development"],["08","Schedule"],["09","Installation"],["10","Report"],["11","Manual and Document"],["12","DATA & EXAMPLE"],["13","Pic and Video"],["14","Ref"]];
    for (const [code, name] of standardFolders) {
      const folder = new sql.Request(tx);
      folder.input("project", sql.BigInt, projectId).input("code", sql.Char(2), code).input("name", sql.NVarChar(200), name).input("actor", sql.BigInt, Number(nattapol.id));
      await folder.query(`INSERT INTO dbo.project_folders(project_id,folder_code,name,storage_key,created_by) VALUES(@project,@code,@name,N'',@actor);`);
    }

    const lastByWbs = new Map(), sortByParent = new Map();
    for (const task of project.tasks) {
      const segments = task.wbs.split(".");
      const parentWbs = segments.slice(0, -1).join(".");
      const parentId = parentWbs ? lastByWbs.get(parentWbs) ?? null : null;
      const sortKey = parentId == null ? "root" : String(parentId);
      const sortOrder = (sortByParent.get(sortKey) || 0) + 1;
      sortByParent.set(sortKey, sortOrder);
      const planDays = Math.max(1, Math.min(3650, Math.round(task.workDays || businessDays(task.planStart, task.planEnd) || task.duration || task.days || 1)));
      const statusKey = normalized(task.sourceStatus);
      const taskStatus = task.percent >= 100 || statusKey === "done" ? "Done" : task.percent > 0 || statusKey.includes("progress") ? "In Progress" : statusKey === "delay" || statusKey === "waiting" || statusKey === "cancel" || statusKey === "watiing" ? "Blocked" : "Not Started";
      const taskNote = `Imported from Overall Project Plan row ${task.row}; source WBS ${task.wbs}; source status ${task.sourceStatus || "blank"}; department ${task.department || "blank"}; PIC reference ${task.picReference || "blank"}; source file SHA-256 ${sourceHash}.`;
      const external = bounded(task.unresolved.join("; "), 300);
      const insertTask = new sql.Request(tx);
      insertTask.input("project", sql.BigInt, projectId).input("parent", sql.BigInt, parentId).input("sort", sql.Int, sortOrder)
        .input("kind", sql.NVarChar(20), segments.length === 1 ? "phase" : segments.length >= 3 ? "detail" : "task")
        .input("name", sql.NVarChar(500), bounded(task.name, 500)).input("actor", sql.BigInt, Number(nattapol.id)).input("start", sql.Date, task.planStart)
        .input("days", sql.Int, planDays).input("external", sql.NVarChar(300), external).input("planMd", sql.Decimal(9, 2), Math.min(9_999_999, task.planManDays))
        .input("actualStart", sql.Date, task.actualStart).input("actualEnd", sql.Date, task.actualEnd).input("percent", sql.Decimal(5, 2), task.percent)
        .input("status", sql.NVarChar(30), taskStatus).input("blocked", sql.NVarChar(sql.MAX), taskStatus === "Blocked" ? `Imported source status: ${task.sourceStatus}` : null)
        .input("note", sql.NVarChar(sql.MAX), taskNote).input("actualMd", sql.Decimal(9, 2), Math.min(9_999_999, task.actualManDays));
      const taskId = Number((await insertTask.query(`DECLARE @changed TABLE(id bigint); INSERT INTO dbo.schedule_tasks(project_id,parent_id,sort_order,kind,name,is_milestone,origin,created_by,visibility,plan_start,plan_days,start_mode,predecessor_id,lag_days,pic_external,plan_man_days,actual_start,actual_end,forecast_end,percent_done,status,blocked_reason,note,actual_man_days,updated_by) OUTPUT inserted.id INTO @changed VALUES(@project,@parent,@sort,@kind,@name,0,N'PM',@actor,N'Internal',@start,@days,N'manual',NULL,0,@external,@planMd,@actualStart,@actualEnd,NULL,@percent,@status,@blocked,@note,@actualMd,@actor); SELECT id FROM @changed;`)).recordset[0].id);
      lastByWbs.set(task.wbs, taskId);
      for (const userId of task.ids) {
        const pic = new sql.Request(tx);
        pic.input("task", sql.BigInt, taskId).input("user", sql.BigInt, userId);
        await pic.query(`INSERT INTO dbo.schedule_task_pics(task_id,user_id) VALUES(@task,@user);`);
      }
    }
    const audit = new sql.Request(tx);
    audit.input("actor", sql.BigInt, Number(nattapol.id)).input("entity", sql.BigInt, projectId).input("number", sql.NVarChar(50), project.code)
      .input("after", sql.NVarChar(sql.MAX), JSON.stringify({ projectId, projectNo: project.code, taskCount: project.tasks.length, sourceFile, sourceHash, sourceRows: project.sourceRows }))
      .input("reason", sql.NVarChar(sql.MAX), "Imported project and schedule from the Overall Project Plan workbook at the user's request.");
    await audit.query(`INSERT INTO dbo.audit_log(actor_id,entity_type,entity_id,entity_no,action,before_json,after_json,reason) VALUES(@actor,N'Project',@entity,@number,N'Imported project schedule',NULL,@after,@reason);`);
    imported.push({ id: projectId, projectNo: project.code, name: project.projectName, taskCount: project.tasks.length, status: project.status });
  }
  await tx.commit();
} catch (error) {
  await tx.rollback().catch(() => undefined);
  throw error;
} finally {
  await pool.close();
}
console.log(JSON.stringify({ ...summary, importedProjects: imported.length, importedTasks: imported.reduce((sum, project) => sum + project.taskCount, 0), imported }, null, 2));
