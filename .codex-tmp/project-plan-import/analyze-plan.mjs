import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Pass the workbook path.");

const wb = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const plan = wb.worksheets.getItem("Overall Project Plan").getRange("A1:V1118").values;
const masterRows = wb.worksheets.getItem("Project List").getRange("A1:H639").values;

const text = (value) => String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const master = new Map();
for (const row of masterRows.slice(1)) {
  const code = text(row[1]).toUpperCase();
  if (!/^PJ\d+$/.test(code) || master.has(code)) continue;
  master.set(code, { projectName: text(row[2]), customerName: text(row[3]) });
}

const projects = [];
let current = null;
for (let index = 7; index < plan.length; index += 1) {
  const row = plan[index];
  const wbs = text(row[0]);
  const name = text(row[1]);
  if (/^TEMPLATE ROWS$/i.test(name)) break;
  const header = name.match(/^\[(PJ\d+)\]\s*(.*)$/i);
  if (header) {
    const code = header[1].toUpperCase();
    const canonical = master.get(code);
    current = {
      row: index + 1,
      code,
      sourceTitle: name,
      projectName: canonical?.projectName || header[2].split(/\s+:\s+/)[0] || code,
      customerName: canonical?.customerName || header[2].split(/\s+:\s+/).slice(1).join(" : ") || "Unspecified customer",
      status: text(row[2]),
      ownerReference: text(row[3]),
      planStart: row[14],
      planEnd: row[15],
      percent: row[20],
      tasks: [],
    };
    projects.push(current);
    continue;
  }
  if (!current || !wbs || !/^\d+(?:\.\d+)*$/.test(wbs) || !name) continue;
  current.tasks.push({
    row: index + 1,
    wbs,
    name,
    status: text(row[2]),
    picReference: text(row[3]),
    department: text(row[4]),
    assignees: row.slice(5, 10).map(text).filter(Boolean),
    people: row[10],
    duration: row[11],
    planManDays: row[12],
    planManHours: row[13],
    planStart: row[14],
    planEnd: row[15],
    days: row[16],
    actualStart: row[17],
    actualEnd: row[18],
    percent: row[20],
    workDays: row[21],
  });
}

const count = (values) => Object.fromEntries([...values.reduce((m, v) => m.set(v || "(blank)", (m.get(v || "(blank)") || 0) + 1), new Map())].sort((a,b)=>b[1]-a[1]));
const duplicateCodes = [...projects.reduce((m,p)=>m.set(p.code,(m.get(p.code)||0)+1),new Map())].filter(([,n])=>n>1);
const duplicateWbs = [];
for (const p of projects) {
  const d = [...p.tasks.reduce((m,t)=>m.set(t.wbs,(m.get(t.wbs)||0)+1),new Map())].filter(([,n])=>n>1);
  if (d.length) duplicateWbs.push({code:p.code,duplicates:d});
}
const allTasks = projects.flatMap((p) => p.tasks);
const summary = {
  projectCount: projects.length,
  taskCount: allTasks.length,
  phaseCount: allTasks.filter((t) => !t.wbs.includes(".")).length,
  leafCount: allTasks.filter((t) => t.wbs.includes(".")).length,
  zeroTaskProjects: projects.filter((p) => !p.tasks.length).map((p) => ({code:p.code,row:p.row,title:p.sourceTitle})),
  duplicateCodes,
  duplicateWbs,
  projectStatuses: count(projects.map((p) => p.status)),
  taskStatuses: count(allTasks.map((t) => t.status)),
  projectRows: projects.map((p) => ({row:p.row,code:p.code,name:p.projectName,customer:p.customerName,status:p.status,tasks:p.tasks.length,firstTaskRow:p.tasks[0]?.row,lastTaskRow:p.tasks.at(-1)?.row})),
  assigneeLabels: count(allTasks.flatMap((t) => t.assignees)),
};
console.log(JSON.stringify(summary, null, 2));
