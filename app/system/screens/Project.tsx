"use client";

import { useState } from "react";
import {
  BOMS, CUSTOMERS, ESTIMATES, MAT_PRS, PROJECT_DOCS, PROJECT_FOLDERS,
  PROJECT_MILESTONES, PROJECT_STATUSES, PROJECT_TASKS, PROJECT_TYPES, PROJECTS,
  TASK_STATUSES, USERS, type DocType, type Priority, type Project, type ProjectStatus,
  type TaskStatus,
} from "../data";
import {
  barPosition, estimateTotals, formatDate, matKpis, matPrAmount, moneyShort, resolveSchedule,
  scheduleSummary, scheduleTone, TODAY, toDate, userName, userOf, weeksFrom,
} from "../calc";
import { useScheduleStore } from "../store";
import { useSession } from "../session";
import {
  Badge, EmptyState, Field, GridControls, Icon, Modal, Pagination, Panel, PageHeader,
  Person, Pill, Progress, ProgressCell, SearchInput, Select, StatusLegend, Tabs, Toolbar,
  usePaged, type IconName, type Tone,
} from "../ui";
import { useT } from "../i18n";
import type { ScreenProps } from "../routes";

const STATUS_TONE: Record<ProjectStatus, Tone> = {
  Planning: "slate", Design: "blue", Development: "blue", Installation: "amber",
  Commissioning: "violet", Handover: "green", Closed: "green", "On Hold": "red",
};

const TASK_TONE: Record<TaskStatus, Tone> = {
  Open: "slate", "In Progress": "blue", Blocked: "red", Done: "green",
};

const PRIORITY_TONE: Record<Priority, Tone> = {
  Urgent: "red", High: "amber", Normal: "blue", Low: "slate",
};

const DOC_ICON: Record<DocType, IconName> = {
  PDF: "file", Excel: "table", Word: "file", PowerPoint: "layers",
  Drawing: "compare", Image: "eye", Video: "play", Other: "package",
};

const docsOf = (projectId: string) => PROJECT_DOCS.filter((doc) => doc.projectId === projectId);
const tasksOf = (projectId: string) => PROJECT_TASKS.filter((task) => task.projectId === projectId);
const milestonesOf = (projectId: string) => PROJECT_MILESTONES.filter((entry) => entry.projectId === projectId);
const foldersFilled = (projectId: string) => new Set(docsOf(projectId).map((doc) => doc.folder)).size;

/* ==========================================================================
   Project list
   ========================================================================== */

export function ProjectList({ go, notify }: ScreenProps) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [customer, setCustomer] = useState("All customers");
  const [manager, setManager] = useState("All owners");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const rows = PROJECTS.filter((project) => {
    const customerRecord = CUSTOMERS.find((entry) => entry.id === project.customerId);
    const haystack = `${project.no} ${project.name} ${customerRecord?.name} ${project.poNo} ${project.inquiryNo}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (status !== "All status" && project.status !== status) return false;
    if (customer !== "All customers" && customerRecord?.code !== customer) return false;
    if (manager !== "All owners" && userName(project.leadEngineerId) !== manager) return false;
    return true;
  });

  const paged = usePaged(rows, pageSize, page);
  const running = PROJECTS.filter((project) => project.status !== "Closed" && project.status !== "On Hold").length;
  const onSite = PROJECTS.filter((project) => project.status === "Installation" || project.status === "Commissioning").length;
  const dueSoon = PROJECTS.filter((project) => {
    const days = Math.round((toDate(project.targetDelivery).getTime() - TODAY.getTime()) / 86_400_000);
    return project.status !== "Closed" && days >= 0 && days <= 30;
  }).length;
  const openTasks = PROJECT_TASKS.filter((task) => task.status !== "Done").length;

  return (
    <>
      <PageHeader
        eyebrow={t("PROJECT MANAGEMENT")}
        title={t("Projects")}
        subtitle={t("Every won inquiry becomes a project with its own number and the same fifteen folders the team already uses on OneDrive.")}
        actions={
          <>
            <button className="btn default" type="button" onClick={() => notify("Project list exported to Excel")}>
              <Icon name="download" />{t("Export")}
            </button>
            <button className="btn primary" type="button" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" />{t("New Project")}
            </button>
          </>
        }
      />

      <section className="kpi-grid">
        <div className="kpi blue"><span className="kpi-icon"><Icon name="folder" /></span><span className="kpi-body"><span className="kpi-label">{t("Running projects")}</span><strong className="kpi-value">{running}</strong><span className="kpi-note">{PROJECTS.length} {t("in total")}</span></span></div>
        <div className="kpi amber"><span className="kpi-icon"><Icon name="truck" /></span><span className="kpi-body"><span className="kpi-label">{t("On site now")}</span><strong className="kpi-value">{onSite}</strong><span className="kpi-note">{t("Installation and commissioning")}</span></span></div>
        <div className="kpi violet"><span className="kpi-icon"><Icon name="calendar" /></span><span className="kpi-body"><span className="kpi-label">{t("Delivery within 30 days")}</span><strong className="kpi-value">{dueSoon}</strong><span className="kpi-note">{t("Watch the schedule")}</span></span></div>
        <div className="kpi red"><span className="kpi-icon"><Icon name="checkCircle" /></span><span className="kpi-body"><span className="kpi-label">{t("Open tasks")}</span><strong className="kpi-value">{openTasks}</strong><span className="kpi-note">{t("Across every project")}</span></span></div>
      </section>

      <Toolbar>
        <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder={t("Search project no., name, customer or PO no.…")} />
        <Select label={t("Status")} value={status} onChange={setStatus} options={["All status", ...PROJECT_STATUSES]} />
        <Select label={t("Customer")} value={customer} onChange={setCustomer} options={["All customers", ...CUSTOMERS.map((entry) => entry.code)]} />
        <Select label={t("Lead engineer")} value={manager} onChange={setManager} options={["All owners", ...USERS.filter((user) => user.role === "Engineer").map((user) => user.name)]} />
      </Toolbar>

      <StatusLegend items={[
        { label: t("Planning"), kind: "wait" },
        { label: t("Design"), kind: "new" },
        { label: t("Development"), kind: "approved" },
        { label: t("Installation"), kind: "revised" },
        { label: t("Handover"), kind: "confirmed" },
        { label: t("On Hold"), kind: "canceled" },
      ]} />

      <Panel
        title={`${rows.length} ${t("projects")}`}
        subtitle={t("Document completeness counts how many of the fifteen standard folders already hold a file")}
        flush
      >
        <GridControls pageSize={pageSize} onPageSize={(size) => { setPageSize(size); setPage(1); }} search={search} onSearch={(value) => { setSearch(value); setPage(1); }} />
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Project No.")}</th>
                  <th>{t("Project Name")}</th>
                  <th>{t("Customer")}</th>
                  <th>{t("Project Type")}</th>
                  <th>{t("Lead engineer")}</th>
                  <th>{t("Start")}</th>
                  <th>{t("Target delivery")}</th>
                  <th>{t("Progress")}</th>
                  <th>{t("Documents")}</th>
                  <th className="num">{t("Open tasks")}</th>
                  <th>{t("Status")}</th>
                  <th aria-label="Action" />
                </tr>
              </thead>
              <tbody>
                {paged.pageRows.map((project) => {
                  const late = project.status !== "Closed" && toDate(project.targetDelivery) < TODAY;
                  const filled = foldersFilled(project.id);
                  const open = tasksOf(project.id).filter((task) => task.status !== "Done").length;
                  return (
                    <tr
                      key={project.id}
                      className={`clickable ${late ? "row-late" : project.status === "Closed" || project.status === "Handover" ? "row-ok" : project.status === "On Hold" ? "row-wait" : ""}`}
                      onClick={() => go({ name: "project", id: project.id })}
                    >
                      <td><strong className="mono">{project.no}</strong></td>
                      <td>
                        <div className="cell-primary">
                          <strong>{project.name}</strong>
                          <span className="mono">{project.inquiryNo}</span>
                        </div>
                      </td>
                      <td>{CUSTOMERS.find((entry) => entry.id === project.customerId)?.code}</td>
                      <td>{project.projectType}</td>
                      <td><Person initials={userOf(project.leadEngineerId)?.initials ?? "—"} name={userName(project.leadEngineerId)} /></td>
                      <td>{formatDate(project.startDate)}</td>
                      <td className={late ? "red-text" : undefined}>{formatDate(project.targetDelivery)}</td>
                      <td style={{ minWidth: 120 }}><ProgressCell value={project.progress} /></td>
                      <td>
                        <span className="doc-chip">
                          <Icon name="folder" />{filled}/{PROJECT_FOLDERS.length}
                        </span>
                      </td>
                      <td className="num">{open || "—"}</td>
                      <td><Badge tone={STATUS_TONE[project.status]}>{t(project.status)}</Badge></td>
                      <td><span className="row-action"><Icon name="chevronRight" /></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={paged.current} pageCount={paged.pageCount} from={paged.from} to={paged.to} total={paged.total} onPage={setPage} />
          </div>
        ) : (
          <EmptyState icon="folder" title={t("No project matches the filter")} message={t("Clear a filter, or create a project from an approved estimate.")} />
        )}
      </Panel>

      {createOpen ? <CreateProjectModal onClose={() => setCreateOpen(false)} onCreate={(no) => { setCreateOpen(false); notify(`${no} created with the 15 standard folders`); }} /> : null}
    </>
  );
}

/* ==========================================================================
   Project workspace
   ========================================================================== */

type ProjectTab = "overview" | "documents" | "tasks" | "schedule" | "cost" | "team";

export function ProjectDetail({ id, go, notify }: ScreenProps & { id: string }) {
  const t = useT();
  const project = PROJECTS.find((entry) => entry.id === id) ?? PROJECTS[0];
  const customer = CUSTOMERS.find((entry) => entry.id === project.customerId);
  const estimate = ESTIMATES.find((entry) => entry.id === project.estimateId);
  const [tab, setTab] = useState<ProjectTab>("overview");
  const [folder, setFolder] = useState(() => docsOf(id)[0]?.folder ?? "00");
  const [tasks, setTasks] = useState(tasksOf(project.id));

  const docs = docsOf(project.id);
  const milestones = milestonesOf(project.id);
  const openTasks = tasks.filter((task) => task.status !== "Done");
  const late = project.status !== "Closed" && toDate(project.targetDelivery) < TODAY;

  return (
    <>
      <div className="breadcrumb">
        <button type="button" onClick={() => go({ name: "projects" })}>{t("Projects")}</button>
        <Icon name="chevronRight" />
        <span>{project.no}</span>
      </div>

      <PageHeader
        eyebrow={`${project.no} · ${project.inquiryNo}`}
        title={project.name}
        subtitle={`${customer?.name} · ${project.site}`}
        meta={
          <>
            <div><span>{t("Status")}</span><strong><Badge tone={STATUS_TONE[project.status]}>{t(project.status)}</Badge></strong></div>
            <div><span>{t("Lead engineer")}</span><strong>{userName(project.leadEngineerId)}</strong></div>
            <div><span>{t("Project manager")}</span><strong>{userName(project.managerId)}</strong></div>
            <div><span>{t("Target delivery")}</span><strong className={late ? "red-text" : undefined}>{formatDate(project.targetDelivery)}</strong></div>
            <div><span>{t("Progress")}</span><strong style={{ minWidth: 130 }}><ProgressCell value={project.progress} /></strong></div>
          </>
        }
        actions={
          <>
            {estimate ? (
              <button className="btn default" type="button" onClick={() => go({ name: "estimate", id: estimate.id })}>
                <Icon name="file" />{t("Estimate Cost")}
              </button>
            ) : null}
            <button className="btn default" type="button" onClick={() => go({ name: "purchase" })}>
              <Icon name="package" />{t("Purchase Requisition")}
            </button>
            <button className="btn primary" type="button" onClick={() => notify(`Opening ${project.folderPath} in OneDrive`)}>
              <Icon name="folder" />{t("Open in OneDrive")}
            </button>
          </>
        }
      />

      <div className="folder-path">
        <Icon name="folder" />
        <span>{project.folderPath}</span>
        <span className="spacer" />
        <button className="link-btn" type="button" onClick={() => { setTab("documents"); }}>
          {docs.length} {t("files")} · {foldersFilled(project.id)}/{PROJECT_FOLDERS.length} {t("folders in use")}
          <Icon name="arrowRight" />
        </button>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: t("Overview") },
          { id: "documents", label: t("Documents"), count: docs.length },
          { id: "tasks", label: t("To do list"), count: openTasks.length },
          { id: "schedule", label: t("Schedule"), count: milestones.length },
          { id: "cost", label: t("Cost") },
          { id: "team", label: t("Team") },
        ]}
      />

      {tab === "overview" ? (
        <section className="grid-main">
          <div className="stack">
            <Panel title={t("Project information")}>
              <dl className="def-list">
                <div><dt>{t("Project No.")}</dt><dd className="mono">{project.no}</dd></div>
                <div><dt>{t("Customer")}</dt><dd>{customer?.name}</dd></div>
                <div><dt>{t("Project Type")}</dt><dd>{project.projectType}</dd></div>
                <div><dt>{t("Site")}</dt><dd>{project.site}</dd></div>
                <div><dt>{t("Inquiry")}</dt><dd className="mono">{project.inquiryNo}</dd></div>
                <div><dt>{t("Estimate")}</dt><dd className="mono">{estimate ? `${estimate.no} ${estimate.revision}` : "—"}</dd></div>
                <div><dt>{t("Customer PO")}</dt><dd className="mono">{project.poNo || "—"}{project.poDate ? ` · ${formatDate(project.poDate)}` : ""}</dd></div>
                <div><dt>{t("Start")}</dt><dd>{formatDate(project.startDate)}</dd></div>
                <div><dt>{t("Target delivery")}</dt><dd className={late ? "red-text" : undefined}>{formatDate(project.targetDelivery)}</dd></div>
                <div><dt>{t("Actual delivery")}</dt><dd>{project.actualDelivery ? formatDate(project.actualDelivery) : "—"}</dd></div>
                <div style={{ gridColumn: "span 2" }}><dt>{t("Remark")}</dt><dd>{project.remark}</dd></div>
              </dl>
            </Panel>

            <Panel title={t("Folder completeness")} subtitle={t("The same fifteen folders as OneDrive — click one to open its files")} flush>
              <div className="folder-grid">
                {PROJECT_FOLDERS.map((entry) => {
                  const count = docs.filter((doc) => doc.folder === entry.code).length;
                  return (
                    <button
                      key={entry.code}
                      type="button"
                      className={count ? "folder-tile filled" : "folder-tile"}
                      onClick={() => { setFolder(entry.code); setTab("documents"); }}
                    >
                      <span className="folder-tile-icon"><Icon name="folder" /></span>
                      <span className="folder-tile-body">
                        <strong>{entry.code}. {entry.name}</strong>
                        <small>{count ? `${count} ${t("files")}` : t("empty")}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="stack">
            <Panel title={t("Open tasks")} subtitle={`${openTasks.length} ${t("open")}`}>
              {openTasks.length ? (
                <ul className="check-list">
                  {openTasks.slice(0, 6).map((task) => (
                    <li className={`check-item ${task.status === "Blocked" ? "error" : toDate(task.due) < TODAY ? "warning" : "pass"}`} key={task.id}>
                      <Icon name={task.status === "Blocked" ? "alertTriangle" : "checkCircle"} />
                      <div>
                        <strong>{task.title}</strong>
                        <p>{userName(task.ownerId)} · {formatDate(task.due)} · <Badge tone={TASK_TONE[task.status]}>{task.status}</Badge> <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge></p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">{t("Nothing open — every task is done.")}</p>}
              <button className="btn default block" type="button" style={{ marginTop: 10 }} onClick={() => setTab("tasks")}>
                {t("Open the to do list")}<Icon name="arrowRight" />
              </button>
            </Panel>

            <Panel title={t("Recent documents")} flush>
              <div className="panel-body">
                {docs.slice(-5).reverse().map((doc) => (
                  <div className="file-row" key={doc.id}>
                    <span className="file-icon"><Icon name={DOC_ICON[doc.type]} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{doc.name}</strong>
                      <small>{doc.folder}. {PROJECT_FOLDERS.find((entry) => entry.code === doc.folder)?.name} · {doc.uploadedBy} · {formatDate(doc.uploadedAt)}</small>
                    </div>
                    <Pill>{doc.type}</Pill>
                  </div>
                ))}
                {!docs.length ? <EmptyState icon="folder" title={t("No document yet")} message={t("Upload the first file into one of the fifteen folders.")} /> : null}
              </div>
            </Panel>

            <Panel title={t("Milestones")} flush>
              <div className="panel-body">
                {milestones.map((entry) => (
                  <div className="file-row" key={entry.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{entry.name}</strong>
                      <small>{formatDate(entry.start)} → {formatDate(entry.end)}</small>
                      <Progress value={entry.progress} />
                    </div>
                    <span className="muted">{entry.progress}%</span>
                  </div>
                ))}
                {!milestones.length ? <p className="muted">{t("No milestone planned yet.")}</p> : null}
              </div>
            </Panel>
          </div>
        </section>
      ) : null}

      {tab === "documents" ? (
        <DocumentsTab project={project} folder={folder} onFolder={setFolder} notify={notify} onOpenTasks={() => setTab("tasks")} />
      ) : null}

      {tab === "tasks" ? (
        <TasksTab
          tasks={tasks}
          onPatch={(taskId, patch) => setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)))}
          onAdd={() => {
            setTasks((prev) => [...prev, {
              id: `nt-${prev.length + 1}`, projectId: project.id, title: "", ownerId: project.leadEngineerId,
              due: "2026-09-15", status: "Open", priority: "Normal", folder: "00", remark: "",
            }]);
            notify("Task added to the project to do list");
          }}
          onRemove={(taskId) => setTasks((prev) => prev.filter((task) => task.id !== taskId))}
        />
      ) : null}

      {tab === "schedule" ? <ScheduleTab project={project} go={go} /> : null}

      {tab === "cost" ? <CostTab project={project} go={go} /> : null}

      {tab === "team" ? (
        <Panel title={t("Project team")} subtitle={t("Who is on this project and what they are holding")} flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t("Member")}</th><th>{t("Role on the project")}</th><th>{t("Department")}</th><th>{t("Level")}</th><th className="num">{t("Open tasks")}</th></tr>
              </thead>
              <tbody>
                {[project.managerId, project.leadEngineerId, ...project.members.filter((memberId) => memberId !== project.leadEngineerId)]
                  .filter((memberId, index, list) => list.indexOf(memberId) === index)
                  .map((memberId, index) => {
                    const member = userOf(memberId);
                    return (
                      <tr key={memberId}>
                        <td><Person initials={member?.initials ?? "—"} name={member?.name ?? "—"} /></td>
                        <td>{index === 0 ? t("Project manager") : index === 1 ? t("Lead engineer") : t("Engineer")}</td>
                        <td>{member?.department}</td>
                        <td className="muted">{member?.level}</td>
                        <td className="num">{tasks.filter((task) => task.ownerId === memberId && task.status !== "Done").length}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------------------
   Documents — the OneDrive folder tree, inside the application
   -------------------------------------------------------------------------- */

function DocumentsTab({ project, folder, onFolder, notify, onOpenTasks }: {
  project: Project;
  folder: string;
  onFolder: (code: string) => void;
  notify: (message: string) => void;
  onOpenTasks: () => void;
}) {
  const t = useT();
  const [search, setSearch] = useState("");
  const docs = docsOf(project.id);
  const active = PROJECT_FOLDERS.find((entry) => entry.code === folder) ?? PROJECT_FOLDERS[0];
  const files = docs
    .filter((doc) => doc.folder === active.code)
    .filter((doc) => !search || `${doc.name} ${doc.uploadedBy} ${doc.remark}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="doc-browser">
      <Panel title={t("Folders")} subtitle={`${foldersFilled(project.id)}/${PROJECT_FOLDERS.length} ${t("in use")}`} flush>
        <ul className="folder-list">
          {PROJECT_FOLDERS.map((entry) => {
            const count = docs.filter((doc) => doc.folder === entry.code).length;
            return (
              <li key={entry.code}>
                <button type="button" className={entry.code === active.code ? "folder-row active" : "folder-row"} onClick={() => onFolder(entry.code)}>
                  <Icon name="folder" />
                  <span>{entry.code}. {entry.name}</span>
                  <em>{count || ""}</em>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title={`${active.code}. ${active.name}`}
        subtitle={active.hint}
        actions={
          <>
            <button className="btn default sm" type="button" onClick={() => notify(`Opening ${project.folderPath} / ${active.code}. ${active.name}`)}>
              <Icon name="folder" />{t("Open in OneDrive")}
            </button>
            <button className="btn primary sm" type="button" onClick={() => notify(`Upload dialog for ${active.code}. ${active.name}`)}>
              <Icon name="upload" />{t("Upload")}
            </button>
          </>
        }
        flush
      >
        <div className="grid-controls">
          <span className="muted">{project.folderPath} / {active.code}. {active.name}</span>
          <span className="spacer" />
          <SearchInput value={search} onChange={setSearch} placeholder={t("Search in this folder…")} />
        </div>

        {files.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t("File")}</th><th>{t("Type")}</th><th className="num">{t("Size")}</th><th>{t("Uploaded by")}</th><th>{t("Date")}</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {files.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="doc-name">
                        <span className="file-icon sm"><Icon name={DOC_ICON[doc.type]} /></span>
                        <div>
                          <strong>{doc.name}</strong>
                          {doc.remark ? <small>{doc.remark}</small> : null}
                        </div>
                      </div>
                    </td>
                    <td><Pill>{doc.type}</Pill></td>
                    <td className="num muted">{doc.size}</td>
                    <td>{doc.uploadedBy}</td>
                    <td>{formatDate(doc.uploadedAt)}</td>
                    <td>
                      <div className="doc-actions">
                        <button className="row-action" type="button" title={t("Preview")} onClick={() => notify(`${doc.name} opened in the viewer`)}><Icon name="eye" /></button>
                        <button className="row-action" type="button" title={t("Download")} onClick={() => notify(`${doc.name} downloading`)}><Icon name="download" /></button>
                        <button className="row-action" type="button" title={t("Copy link")} onClick={() => notify("OneDrive link copied")}><Icon name="paperclip" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="folder"
            title={t("This folder is empty")}
            message={`${active.hint}. ${t("Drop a file here or upload it — it lands in the same OneDrive folder.")}`}
            action={active.code === "00"
              ? <button className="btn primary" type="button" onClick={onOpenTasks}><Icon name="checkCircle" />{t("Open the to do list")}</button>
              : <button className="btn primary" type="button" onClick={() => notify(`Upload dialog for ${active.code}. ${active.name}`)}><Icon name="upload" />{t("Upload")}</button>}
          />
        )}
      </Panel>
    </section>
  );
}

/* --------------------------------------------------------------------------
   To do list (folder 00)
   -------------------------------------------------------------------------- */

function TasksTab({ tasks, onPatch, onAdd, onRemove }: {
  tasks: ReturnType<typeof tasksOf>;
  onPatch: (id: string, patch: Partial<(typeof PROJECT_TASKS)[number]>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const t = useT();
  const done = tasks.filter((task) => task.status === "Done").length;

  return (
    <Panel
      title={t("To do list")}
      subtitle={`${done}/${tasks.length} ${t("done")} · ${t("the same list the team keeps in folder 00")}`}
      actions={<button className="btn primary sm" type="button" onClick={onAdd}><Icon name="plus" />{t("Add task")}</button>}
      flush
    >
      <div className="table-wrap">
        <table className="sheet" style={{ minWidth: 1080 }}>
          <thead>
            <tr>
              <th style={{ width: 320 }}>{t("Task")}</th>
              <th style={{ width: 170 }}>{t("Owner")}</th>
              <th style={{ width: 130 }}>{t("Due")}</th>
              <th style={{ width: 140 }}>{t("Status")}</th>
              <th style={{ width: 120 }}>{t("Priority")}</th>
              <th style={{ width: 170 }}>{t("Folder")}</th>
              <th style={{ width: 180 }}>{t("Remark")}</th>
              <th style={{ width: 50 }} aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => {
              const overdue = task.status !== "Done" && toDate(task.due) < TODAY;
              return (
                <tr key={task.id} className={overdue ? "row-late" : task.status === "Done" ? "row-ok" : ""}>
                  <td><input value={task.title} placeholder={t("What has to be done?")} onChange={(event) => onPatch(task.id, { title: event.target.value })} /></td>
                  <td>
                    <select value={task.ownerId} onChange={(event) => onPatch(task.id, { ownerId: event.target.value })}>
                      {USERS.filter((user) => user.role === "Engineer" || user.role === "Project Manager").map((user) => (
                        <option key={user.id} value={user.id}>{user.name}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="date" value={task.due} onChange={(event) => onPatch(task.id, { due: event.target.value })} /></td>
                  <td>
                    <select value={task.status} onChange={(event) => onPatch(task.id, { status: event.target.value as TaskStatus })}>
                      {TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={task.priority} onChange={(event) => onPatch(task.id, { priority: event.target.value as Priority })}>
                      {["Urgent", "High", "Normal", "Low"].map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={task.folder} onChange={(event) => onPatch(task.id, { folder: event.target.value })}>
                      {PROJECT_FOLDERS.map((entry) => <option key={entry.code} value={entry.code}>{entry.code}. {entry.name}</option>)}
                    </select>
                  </td>
                  <td><input value={task.remark} onChange={(event) => onPatch(task.id, { remark: event.target.value })} /></td>
                  <td>
                    <button className="row-action" type="button" onClick={() => onRemove(task.id)} aria-label={t("Delete")}><Icon name="trash" /></button>
                  </td>
                </tr>
              );
            })}
            {!tasks.length ? (
              <tr><td colSpan={8}><EmptyState icon="checkCircle" title={t("No task yet")} message={t("Add the open points for this project.")} /></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="sticky-foot">
        <div className="foot-item"><span>{t("Open")}</span><strong>{tasks.filter((task) => task.status === "Open").length}</strong></div>
        <div className="foot-item"><span>{t("In Progress")}</span><strong>{tasks.filter((task) => task.status === "In Progress").length}</strong></div>
        <div className="foot-item"><span>{t("Blocked")}</span><strong>{tasks.filter((task) => task.status === "Blocked").length}</strong></div>
        <div className="foot-total">
          <span>{t("Done")}</span>
          <strong>{done} / {tasks.length}</strong>
        </div>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------------------
   Schedule (folder 08)
   -------------------------------------------------------------------------- */

function ScheduleTab({ project, go }: { project: Project; go: ScreenProps["go"] }) {
  const t = useT();
  const session = useSession();
  const store = useScheduleStore();
  const rows = resolveSchedule(store.tasks, project.id, store.updates);
  const summary = scheduleSummary(rows);
  const phases = rows.filter((row) => row.depth === 1);
  const mine = rows.filter((row) => !row.hasChildren && row.picIds.includes(session.user.id) && row.status !== "Done").length;

  if (!phases.length) {
    return (
      <Panel title={t("Schedule")} flush>
        <EmptyState
          icon="calendar"
          title={t("This project has no schedule yet")}
          message={t("Build the plan in the schedule workspace — the standard phase template gets it started in one click.")}
          action={
            <button className="btn primary" type="button" onClick={() => go({ name: "schedule", id: project.id })}>
              <Icon name="calendar" />{t("Open schedule workspace")}
            </button>
          }
        />
      </Panel>
    );
  }

  const weeks = weeksFrom(toDate(summary?.start ?? project.startDate), 16);
  const gridStart = weeks[0].start.getTime();
  const gridSpan = weeks[weeks.length - 1].end.getTime() + 86_400_000 - gridStart;
  const todayLeft = ((TODAY.getTime() - gridStart) / gridSpan) * 100;

  return (
    <Panel
      title={t("Schedule")}
      subtitle={summary ? `${formatDate(summary.start)} → ${formatDate(summary.end)} · ${summary.percent}% · ${summary.doneCount}/${summary.taskCount} ${t("done")}` : undefined}
      actions={
        <>
          {mine ? (
            <button className="btn default sm" type="button" onClick={() => go({ name: "my-work" })}>
              <Icon name="user" />{t("My tasks")} ({mine})
            </button>
          ) : null}
          <button className="btn primary sm" type="button" onClick={() => go({ name: "schedule", id: project.id })}>
            <Icon name="calendar" />{t("Open schedule workspace")}
          </button>
        </>
      }
      flush
    >
      <div className="gantt-wrap">
        <div className="gantt" style={{ ["--weeks" as string]: weeks.length }}>
          <div className="gantt-head">
            <div className="gantt-side">{t("Phase")}</div>
            <div className="gantt-weeks">
              {weeks.map((week) => (
                <span key={week.label} className={week.isCurrent ? "current" : undefined}>
                  <b>{week.label}</b>
                  <em>{week.month}</em>
                </span>
              ))}
            </div>
          </div>
          {phases.map((phase) => {
            const position = barPosition({ start: phase.start, end: phase.end } as never, weeks);
            return (
              <div className="gantt-row" key={phase.id}>
                <div className="gantt-side">
                  <span className="folder-badge">{phase.wbs}</span>
                  <div>
                    <strong>{phase.name}</strong>
                    <small>{formatDate(phase.start)} → {formatDate(phase.end)} · {phase.doneLeaves}/{phase.totalLeaves} {t("done")}</small>
                  </div>
                  <Badge tone={scheduleTone(phase)}>{phase.percentDone}%</Badge>
                </div>
                <div className="gantt-track">
                  <span className="gantt-today" style={{ left: `${Math.min(99.5, Math.max(0, todayLeft))}%` }} />
                  <div className="gantt-line">
                    {position ? (
                      <span className={`gantt-bar ${phase.status === "Done" ? "green" : "blue"} ${phase.isLate ? "late" : ""}`} style={{ left: `${position.left}%`, width: `${position.width}%` }}>
                        <i style={{ width: `${phase.percentDone}%` }} />
                        <span>{phase.name}</span>
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/* --------------------------------------------------------------------------
   Cost (folders 03 and 05)
   -------------------------------------------------------------------------- */

function CostTab({ project, go }: { project: Project; go: ScreenProps["go"] }) {
  const t = useT();
  const estimate = ESTIMATES.find((entry) => entry.id === project.estimateId);
  const totals = estimate ? estimateTotals(estimate) : undefined;
  const kpis = matKpis(project.id);
  const requisitions = MAT_PRS.filter((pr) => pr.projectId === project.id);
  const bom = BOMS.find((entry) => entry.projectId === project.id);

  return (
    <section className="grid-main">
      <Panel title={t("Estimated versus committed")} subtitle={t("Internal engineering cost only — no selling price in this system")} flush>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("Cost block")}</th><th className="num">{t("Estimated")}</th><th className="num">{t("Actual + committed")}</th></tr></thead>
            <tbody>
              <tr><td>{t("Material")}</td><td className="num">{totals ? moneyShort(totals.material) : "—"}</td><td className="num">{moneyShort(kpis.actualConsumed + kpis.openCommitment)}</td></tr>
              <tr><td>{t("Reserved stock")}</td><td className="num muted">—</td><td className="num">{moneyShort(kpis.reservedValue)}</td></tr>
              <tr><td>{t("Engineering")}</td><td className="num">{totals ? moneyShort(totals.effortEngineering) : "—"}</td><td className="num muted">—</td></tr>
              <tr><td>{t("Installation & Service")}</td><td className="num">{totals ? moneyShort(totals.effortInstallation) : "—"}</td><td className="num muted">—</td></tr>
              <tr className="subtotal-row">
                <td>{t("Material forecast vs budget")}</td>
                <td className="num">{moneyShort(kpis.approvedBudget)}</td>
                <td className="num"><strong className={kpis.remaining < 0 ? "red-text" : "green-text"}>{moneyShort(kpis.forecast)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="stack">
        <Panel title={t("Estimate")} flush>
          <div className="panel-body">
            {estimate ? (
              <>
                <dl className="def-list one">
                  <div><dt>{t("Estimate No.")}</dt><dd className="mono">{estimate.no} {estimate.revision}</dd></div>
                  <div><dt>{t("Status")}</dt><dd>{estimate.status}</dd></div>
                  <div><dt>{t("Total Cost")}</dt><dd><strong>{totals ? moneyShort(totals.total) : "—"} THB</strong></dd></div>
                </dl>
                <button className="btn default block" type="button" style={{ marginTop: 10 }} onClick={() => go({ name: "estimate", id: estimate.id })}>
                  {t("Open estimate workspace")}<Icon name="arrowRight" />
                </button>
              </>
            ) : <p className="muted">{t("No estimate linked to this project.")}</p>}
            {bom ? (
              <button className="btn default block" type="button" style={{ marginTop: 8 }} onClick={() => go({ name: "bom", id: bom.id })}>
                {t("Open BOM")} {bom.no} {bom.revision}<Icon name="arrowRight" />
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel title={t("Purchase Requisition")} subtitle={requisitions.length + " " + t("raised")} flush>
          <div className="panel-body">
            {requisitions.length ? requisitions.map((pr) => (
              <div className="file-row" key={pr.id}>
                <span className="file-icon"><Icon name="package" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{pr.no}</strong>
                  <small>{pr.lines.length} {t("lines")} · {moneyShort(matPrAmount(pr))} THB · {formatDate(pr.requiredDate)}</small>
                </div>
                <Badge tone={pr.status === "Approved" || pr.status === "Converted to PO" ? "green" : pr.status === "Rejected" ? "red" : "blue"}>{t(pr.status)}</Badge>
              </div>
            )) : <p className="muted">{t("No requisition raised yet.")}</p>}
            <button className="btn default block" type="button" style={{ marginTop: 10 }} onClick={() => go({ name: "purchase" })}>
              {t("Open purchase requisitions")}<Icon name="arrowRight" />
            </button>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------------
   New project
   -------------------------------------------------------------------------- */

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (no: string) => void }) {
  const t = useT();
  const [estimateId, setEstimateId] = useState(ESTIMATES[0].id);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("2027-01-30");
  const estimate = ESTIMATES.find((entry) => entry.id === estimateId) ?? ESTIMATES[0];
  const nextNo = "PJ260153";

  return (
    <Modal
      title={t("New project")}
      subtitle={t("A project takes its number, its customer and its cost from the approved estimate, and gets the fifteen standard folders straight away.")}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="muted">{t("Folders created")}: {PROJECT_FOLDERS.length}</span>
          <span className="spacer" />
          <button className="btn default" type="button" onClick={onClose}>{t("Cancel")}</button>
          <button className="btn primary" type="button" onClick={() => onCreate(nextNo)}><Icon name="check" />{t("Create project")}</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t("Project No.")} hint={t("Generated automatically — never typed")}>
          <input value={nextNo} readOnly />
        </Field>
        <Field label={t("From estimate")} span={3}>
          <select value={estimateId} onChange={(event) => { setEstimateId(event.target.value); setName(""); }}>
            {ESTIMATES.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.no} {entry.revision} — {entry.projectName} ({entry.status})</option>
            ))}
          </select>
        </Field>
        <Field label={t("Project Name")} span={2}>
          <input value={name || estimate.projectName} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label={t("Customer")}>
          <input readOnly value={CUSTOMERS.find((entry) => entry.id === estimate.customerId)?.name ?? ""} />
        </Field>
        <Field label={t("Target delivery")}>
          <input type="date" value={target} onChange={(event) => setTarget(event.target.value)} />
        </Field>
        <Field label={t("Project Type")}>
          <select defaultValue={estimate.projectType}>
            {PROJECT_TYPES.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label={t("Project manager")}>
          <select defaultValue="u7">
            {USERS.filter((user) => user.role === "Project Manager" || user.role === "Engineering Manager").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t("Lead engineer")} span={2}>
          <select defaultValue={estimate.ownerId}>
            {USERS.filter((user) => user.role === "Engineer").map((user) => <option key={user.id} value={user.id}>{user.name} — {user.department}</option>)}
          </select>
        </Field>
      </div>

      <div className="form-section">
        <div className="form-section-title"><h3>{t("Folders created with the project")}</h3><span /></div>
        <div className="folder-grid compact">
          {PROJECT_FOLDERS.map((entry) => (
            <span className="folder-tile static" key={entry.code}>
              <span className="folder-tile-icon"><Icon name="folder" /></span>
              <span className="folder-tile-body"><strong>{entry.code}. {entry.name}</strong></span>
            </span>
          ))}
        </div>
      </div>

      <div className="info-strip" style={{ marginTop: 14 }}>
        <Icon name="alertCircle" />
        {t("The same structure is created on OneDrive / SharePoint, so the team keeps working exactly as today — the application indexes those files instead of replacing them.")}
      </div>
    </Modal>
  );
}
