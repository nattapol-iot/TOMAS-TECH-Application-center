"use client";

import { useState } from "react";
import { DEPARTMENTS, USERS, WORK_ITEMS, CAPACITY_PER_WEEK, type WorkItem } from "../data";
import {
  barPosition, engineerLoads, formatDate, loadTone, toDate, TODAY, weeksFrom,
} from "../calc";
import {
  Badge, BarChart, EmptyState, Icon, KpiCard, Panel, PageHeader, Progress,
  SearchInput, Select, Tabs, Toolbar, type Tone,
} from "../ui";
import type { ScreenProps } from "../routes";

const TYPE_TONE: Record<WorkItem["type"], Tone> = {
  Inquiry: "blue",
  Estimate: "violet",
  Project: "green",
};

const HORIZONS: Record<string, number> = { "8 weeks": 8, "12 weeks": 12, "16 weeks": 16, "24 weeks": 24 };

export default function ResourcePlan({ go, notify }: ScreenProps) {
  const [tab, setTab] = useState<"gantt" | "workload">("gantt");
  const [department, setDepartment] = useState("All departments");
  const [type, setType] = useState("All work");
  const [horizon, setHorizon] = useState("12 weeks");
  const [search, setSearch] = useState("");

  const weeks = weeksFrom(new Date(TODAY.getTime() - 14 * 86_400_000), HORIZONS[horizon] ?? 12);
  const team = USERS.filter((user) => user.role === "Engineer" || user.role === "Project Manager")
    .filter((user) => department === "All departments" || user.department === department)
    .filter((user) => !search || user.name.toLowerCase().includes(search.toLowerCase()));

  const items = WORK_ITEMS
    .filter((item) => type === "All work" || item.type === type)
    .filter((item) => !search || `${item.reference} ${item.title} ${item.customer}`.toLowerCase().includes(search.toLowerCase())
      || team.some((user) => user.id === item.ownerId && user.name.toLowerCase().includes(search.toLowerCase())));

  const loads = engineerLoads(team, items, weeks);
  const gridStart = weeks[0].start.getTime();
  const gridSpan = weeks[weeks.length - 1].end.getTime() + 86_400_000 - gridStart;
  const todayLeft = ((TODAY.getTime() - gridStart) / gridSpan) * 100;

  const overloaded = loads.filter((load) => load.peakUtilisation > 100).length;
  const idle = loads.filter((load) => load.averageUtilisation < 60).length;
  const overdue = loads.reduce((sum, load) => sum + load.overdueItems, 0);
  const committed = loads.reduce((sum, load) => sum + load.committedManDays, 0);

  return (
    <>
      <PageHeader
        eyebrow="ENGINEERING RESOURCE"
        title="Resource Plan & Workload"
        subtitle="Who is holding which inquiry, estimate and project — and how full their weeks are."
        actions={
          <>
            <button className="btn default" type="button" onClick={() => notify("Resource plan exported to Excel")}>
              <Icon name="download" />Export plan
            </button>
            <button className="btn primary" type="button" onClick={() => go({ name: "inquiries" })}>
              <Icon name="inbox" />Assign an inquiry
            </button>
          </>
        }
      />

      <section className="kpi-grid">
        <KpiCard label="Engineers on the plan" value={loads.length} note={`${items.length} work items`} tone="blue" icon="users" />
        <KpiCard label="Committed man-days" value={Math.round(committed)} note={`${CAPACITY_PER_WEEK} days/week capacity each`} tone="slate" icon="clock" />
        <KpiCard label="Over capacity" value={overloaded} note="Peak week above 100%" tone="red" icon="alertTriangle" onClick={() => setTab("workload")} />
        <KpiCard label="Overdue work" value={overdue} note="Past the committed end date" tone="amber" icon="calendar" />
      </section>

      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search engineer, inquiry, project or customer…" />
        <Select label="Department" value={department} onChange={setDepartment} options={["All departments", ...DEPARTMENTS]} />
        <Select label="Work type" value={type} onChange={setType} options={["All work", "Inquiry", "Estimate", "Project"]} />
        <Select label="Horizon" value={horizon} onChange={setHorizon} options={Object.keys(HORIZONS)} />
        <span className="spacer" />
        <span className="row tight">
          <Badge tone="blue">Inquiry</Badge>
          <Badge tone="violet">Estimate</Badge>
          <Badge tone="green">Project</Badge>
        </span>
      </Toolbar>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "gantt", label: "Assignment timeline", count: items.length },
          { id: "workload", label: "Workload", count: overloaded },
        ]}
      />

      {tab === "gantt" ? (
        <Panel title="Assignment timeline" subtitle="Each bar is one commitment; the shaded part is progress" flush>
          {loads.length ? (
            <div className="gantt-wrap">
              <div className="gantt" style={{ ["--weeks" as string]: weeks.length }}>
                <div className="gantt-head">
                  <div className="gantt-side">Engineer</div>
                  <div className="gantt-weeks">
                    {weeks.map((week) => (
                      <span key={week.label} className={week.isCurrent ? "current" : undefined}>
                        <b>{week.label}</b>
                        <em>{week.month}</em>
                      </span>
                    ))}
                  </div>
                </div>

                {loads.map((load) => (
                  <div className="gantt-row" key={load.user.id}>
                    <div className="gantt-side">
                      <span className="avatar sm">{load.user.initials}</span>
                      <div>
                        <strong>{load.user.name}</strong>
                        <small>{load.user.department} · {load.items.length} item(s) · {Math.round(load.committedManDays)} MD</small>
                      </div>
                      <Badge tone={loadTone(load.peakUtilisation)}>{Math.round(load.peakUtilisation)}%</Badge>
                    </div>
                    <div className="gantt-track">
                      <span className="gantt-today" style={{ left: `${todayLeft}%` }} />
                      {load.items.length ? load.items.map((item) => {
                        const position = barPosition(item, weeks);
                        if (!position) return null;
                        const late = item.progress < 100 && toDate(item.end) < TODAY;
                        return (
                          <div className="gantt-line" key={item.id}>
                            <button
                              type="button"
                              className={`gantt-bar ${TYPE_TONE[item.type]}${late ? " late" : ""}`}
                              style={{ left: `${position.left}%`, width: `${position.width}%` }}
                              title={`${item.reference} · ${item.title}\n${formatDate(item.start)} → ${formatDate(item.end)} · ${item.manDays} MD · ${item.progress}% · ${item.status}`}
                              onClick={() => {
                                if (item.linkEstimateId) go({ name: "estimate", id: item.linkEstimateId });
                                else if (item.linkInquiryId) go({ name: "inquiry", id: item.linkInquiryId });
                                else go({ name: "projects" });
                              }}
                            >
                              <i style={{ width: `${item.progress}%` }} />
                              <span>{item.reference} · {item.title}</span>
                            </button>
                          </div>
                        );
                      }) : <div className="gantt-line"><span className="gantt-empty">No work assigned</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState icon="users" title="Nobody matches the filter" message="Clear the department or search filter to see the team again." />
          )}
        </Panel>
      ) : null}

      {tab === "workload" ? (
        <>
          <Panel title="Weekly load" subtitle={`Man-days committed per week against ${CAPACITY_PER_WEEK} available days · green under 85%, orange up to 100%, red above`} flush>
            <div className="table-wrap">
              <table className="heat">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Engineer</th>
                    {weeks.map((week) => <th key={week.label} className={week.isCurrent ? "num current" : "num"}>{week.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {loads.map((load) => (
                    <tr key={load.user.id}>
                      <td>
                        <div className="person">
                          <span className="avatar sm">{load.user.initials}</span>
                          <span>
                            <strong>{load.user.name}</strong>
                            <small className="muted"> · {load.user.department}</small>
                          </span>
                        </div>
                      </td>
                      {load.weekly.map((entry) => (
                        <td key={entry.week.label} className="num">
                          <span className={`heat-cell ${loadTone(entry.utilisation)}`} title={`${entry.manDays.toFixed(1)} MD · ${Math.round(entry.utilisation)}%`}>
                            {entry.manDays ? `${Math.round(entry.utilisation)}%` : "—"}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div style={{ height: 14 }} />

          <section className="grid-main">
            <Panel title="Engineer workload" subtitle="Average and peak utilisation over the horizon" flush>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Engineer</th><th>Department</th><th>Level</th>
                      <th className="num">Open items</th><th className="num">Committed</th>
                      <th style={{ minWidth: 150 }}>Average load</th>
                      <th className="num">Peak</th><th>Next due</th><th className="num">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load) => (
                      <tr key={load.user.id}>
                        <td>
                          <div className="person"><span className="avatar sm">{load.user.initials}</span>{load.user.name}</div>
                        </td>
                        <td>{load.user.department}</td>
                        <td className="muted">{load.user.level}</td>
                        <td className="num">{load.openItems}</td>
                        <td className="num">{Math.round(load.committedManDays)} MD</td>
                        <td>
                          <div className="progress-cell">
                            <Progress value={Math.min(load.averageUtilisation, 100)} tone={loadTone(load.averageUtilisation)} />
                            <span>{Math.round(load.averageUtilisation)}%</span>
                          </div>
                        </td>
                        <td className="num"><Badge tone={loadTone(load.peakUtilisation)}>{Math.round(load.peakUtilisation)}%</Badge></td>
                        <td>
                          {load.nextDue
                            ? <span className={toDate(load.nextDue.end) < TODAY ? "red-text" : undefined}>{formatDate(load.nextDue.end)} · {load.nextDue.reference}</span>
                            : <span className="muted">—</span>}
                        </td>
                        <td className="num">{load.overdueItems ? <span className="red-text">{load.overdueItems}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div className="stack">
              <Panel title="Load by department" subtitle="Committed man-days">
                <BarChart
                  data={DEPARTMENTS.map((entry) => ({
                    label: entry,
                    value: Math.round(loads.filter((load) => load.user.department === entry).reduce((sum, load) => sum + load.committedManDays, 0)),
                  })).filter((entry) => entry.value > 0)}
                  unit=" MD"
                />
              </Panel>
              <Panel title="Needs a decision">
                <ul className="check-list">
                  {loads.filter((load) => load.peakUtilisation > 100).map((load) => (
                    <li className="check-item error" key={load.user.id}>
                      <Icon name="alertTriangle" />
                      <div>
                        <strong>{load.user.name} is over capacity</strong>
                        <p>Peak {Math.round(load.peakUtilisation)}% — move a task or extend a due date.</p>
                      </div>
                    </li>
                  ))}
                  {loads.filter((load) => load.overdueItems).map((load) => (
                    <li className="check-item warning" key={`late-${load.user.id}`}>
                      <Icon name="clock" />
                      <div>
                        <strong>{load.user.name} has {load.overdueItems} overdue item(s)</strong>
                        <p>{load.nextDue ? `${load.nextDue.reference} — ${load.nextDue.title}` : ""}</p>
                      </div>
                    </li>
                  ))}
                  {idle ? (
                    <li className="check-item pass">
                      <Icon name="checkCircle" />
                      <div>
                        <strong>{idle} engineer(s) below 60% load</strong>
                        <p>Capacity available for the next inquiry.</p>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </Panel>
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
