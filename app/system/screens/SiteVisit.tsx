"use client";

import { LocalizedText } from "../LocalizedText";
import { currentLocale, useT as useUiText } from "../i18n";
import { useMemo, useState } from "react";
import type { ScreenProps } from "../routes";
import { useT } from "../i18n";
import {
  Badge,
  Drawer,
  EmptyState,
  Icon,
  KpiCard,
  PageHeader,
  Panel,
  Person,
  Pill,
  Progress,
  SearchInput,
  Select,
  Tabs,
  Toolbar,
  toneOf,
} from "../ui";

/**
 * Demo Sales Intake & Site Visit.
 *
 * The real module is app/system/production/SiteVisitScreens.tsx — it talks to
 * the API and to SQL Server. This screen exists so the /demo prototype shows
 * the same three menus and the same shape of workflow on in-file sample data.
 * The dataset lives here rather than in data.ts so the demo can change without
 * touching the shared demo dataset, the same choice the Knowledge Hub made.
 */

type DemoIntakeStatus =
  | "Draft" | "Pending Technical Review" | "More Information Required"
  | "Ready to Schedule" | "Scheduled" | "Completed";

type DemoVisitStatus =
  | "Tentative" | "Pending Engineer Confirmation" | "Pending Customer Confirmation"
  | "Confirmed" | "In Progress" | "Report Pending" | "Report Under Review" | "Completed";

type DemoIntake = {
  id: number;
  number: string;
  subject: string;
  customer: string;
  site: string;
  salesOwner: string;
  requestDate: string;
  responseDue: string;
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: DemoIntakeStatus;
  readiness: number;
  blockers: string[];
  warnings: string[];
  purposes: string[];
  skills: string[];
  problem: string;
  expected: string;
  machine: string;
  visitNumber?: string;
  visitStatus?: DemoVisitStatus;
};

type DemoAssignment = { engineer: string; role: "Lead Engineer" | "Supporting Engineer"; status: string; match: number; skills: string[] };

type DemoVisit = {
  id: number;
  number: string;
  intakeNumber: string;
  customer: string;
  site: string;
  purpose: string;
  status: DemoVisitStatus;
  start: string;
  end: string;
  assignments: DemoAssignment[];
  engineerConfirmed: boolean;
  customerConfirmed: boolean;
  reportStatus: "None" | "Draft" | "Submitted" | "Approved";
  reportDue: string;
  reportSla: "on_track" | "due_soon" | "overdue" | "met";
  skillMatch: number;
  checklistDone: number;
  checklistTotal: number;
  findings: { kind: string; title: string; severity: string }[];
  linkedInquiry?: string;
  linkedEstimate?: string;
};

const DEMO_INTAKES: DemoIntake[] = [
  {
    id: 1, number: "SIN-2609-0001", subject: "Robot palletiser for carton line 3",
    customer: "Siam Food Products", site: "Bang Phli plant 2", salesOwner: "Chalisa N.",
    requestDate: "2026-09-01", responseDue: "2026-09-08", priority: "High",
    status: "Ready to Schedule", readiness: 92, blockers: [], warnings: ["A photo, drawing or document is attached"],
    purposes: ["Pre-sales Survey", "Robot Application Survey"], skills: ["ROBOT", "MECHANICAL", "SAFETY"],
    problem: "Two operators stack 12 kg cartons by hand for the whole shift; the line stops whenever one is on leave.",
    expected: "Palletise 15 cartons a minute onto a EUR pallet with no manual handling, and keep the existing wrapper.",
    machine: "Sidel carton sealer · line 3 discharge",
    visitNumber: "SV-2609-0001", visitStatus: "Confirmed",
  },
  {
    id: 2, number: "SIN-2609-0002", subject: "PLC retrofit — old Mitsubishi A-series",
    customer: "Thai Precision Parts", site: "Rayong works", salesOwner: "Nutthapong S.",
    requestDate: "2026-09-02", responseDue: "2026-09-05", priority: "Urgent",
    status: "Pending Technical Review", readiness: 74,
    blockers: [], warnings: ["Customer availability window is proposed", "Safety and site access are recorded"],
    purposes: ["Machine Inspection", "Software / PLC Survey"], skills: ["PLC", "ELECTRICAL"],
    problem: "The A-series CPU has failed twice this quarter and spares are no longer available in Thailand.",
    expected: "Move to a supported controller without changing the mechanical machine or losing the recipe data.",
    machine: "Okuma LB300 loader · Mitsubishi A2USH",
  },
  {
    id: 3, number: "SIN-2609-0003", subject: "Vision inspection for label position",
    customer: "Bangkok Beverage", site: "Samut Sakhon line 7", salesOwner: "Chalisa N.",
    requestDate: "2026-09-03", responseDue: "2026-09-12", priority: "Normal",
    status: "More Information Required", readiness: 48,
    blockers: ["Expected result is stated", "Site contact person is reachable"],
    warnings: ["Machine or system information is sufficient", "Expected engineering skills are indicated"],
    purposes: ["Pre-sales Survey"], skills: ["VISION"],
    problem: "Customers are complaining about crooked labels but QC cannot say how often it happens.",
    expected: "",
    machine: "Krones labeller",
  },
  {
    id: 4, number: "SIN-2609-0004", subject: "Conveyor speed control upgrade",
    customer: "Siam Food Products", site: "Bang Phli plant 1", salesOwner: "Warit C.",
    requestDate: "2026-08-28", responseDue: "2026-09-04", priority: "Normal",
    status: "Completed", readiness: 100, blockers: [], warnings: [],
    purposes: ["Mechanical Survey", "Electrical Survey"], skills: ["MECHANICAL", "ELECTRICAL"],
    problem: "The infeed conveyor runs at one speed and jams whenever the filler slows down.",
    expected: "Speed follows the filler automatically, with a manual override on the panel.",
    machine: "Interroll drum motor · Siemens G120",
    visitNumber: "SV-2608-0007", visitStatus: "Completed",
  },
  {
    id: 5, number: "SIN-2609-0005", subject: "AGV feasibility for warehouse aisle 4",
    customer: "Northern Logistics", site: "Lamphun DC", salesOwner: "Nutthapong S.",
    requestDate: "2026-09-04", responseDue: "2026-09-18", priority: "Low",
    status: "Draft", readiness: 34,
    blockers: ["Current problem is described", "Expected result is stated", "Visit purpose is selected"],
    warnings: ["A photo, drawing or document is attached", "Customer availability window is proposed"],
    purposes: [], skills: [],
    problem: "Asked about AGVs at the trade show.",
    expected: "",
    machine: "",
  },
];

const DEMO_VISITS: DemoVisit[] = [
  {
    id: 1, number: "SV-2609-0001", intakeNumber: "SIN-2609-0001",
    customer: "Siam Food Products", site: "Bang Phli plant 2", purpose: "Robot Application Survey",
    status: "Confirmed", start: "2026-09-09T09:00:00", end: "2026-09-09T15:00:00",
    assignments: [
      { engineer: "Warit Chunlaka", role: "Lead Engineer", status: "Accepted", match: 100, skills: ["ROBOT", "MECHANICAL", "SAFETY"] },
      { engineer: "Pimchanok R.", role: "Supporting Engineer", status: "Accepted", match: 67, skills: ["MECHANICAL", "SAFETY"] },
    ],
    engineerConfirmed: true, customerConfirmed: true,
    reportStatus: "None", reportDue: "—", reportSla: "on_track", skillMatch: 100,
    checklistDone: 0, checklistTotal: 6, findings: [],
  },
  {
    id: 2, number: "SV-2609-0002", intakeNumber: "SIN-2609-0002",
    customer: "Thai Precision Parts", site: "Rayong works", purpose: "Software / PLC Survey",
    status: "Pending Engineer Confirmation", start: "2026-09-11T13:00:00", end: "2026-09-11T17:00:00",
    assignments: [
      { engineer: "Somchai P.", role: "Lead Engineer", status: "Proposed", match: 50, skills: ["PLC"] },
    ],
    engineerConfirmed: false, customerConfirmed: false,
    reportStatus: "None", reportDue: "—", reportSla: "on_track", skillMatch: 50,
    checklistDone: 0, checklistTotal: 8, findings: [],
  },
  {
    id: 3, number: "SV-2608-0007", intakeNumber: "SIN-2609-0004",
    customer: "Siam Food Products", site: "Bang Phli plant 1", purpose: "Electrical Survey",
    status: "Completed", start: "2026-08-30T09:00:00", end: "2026-08-30T14:30:00",
    assignments: [
      { engineer: "Pimchanok R.", role: "Lead Engineer", status: "Accepted", match: 100, skills: ["ELECTRICAL", "MECHANICAL"] },
    ],
    engineerConfirmed: true, customerConfirmed: true,
    reportStatus: "Approved", reportDue: "2026-09-02T14:30:00", reportSla: "met", skillMatch: 100,
    checklistDone: 8, checklistTotal: 8,
    findings: [
      { kind: "Measurement", title: "Incoming voltage 402 V", severity: "Info" },
      { kind: "Finding", title: "No spare breaker in MCC-3", severity: "Medium" },
      { kind: "Risk", title: "Cable route crosses a forklift aisle", severity: "High" },
    ],
    linkedInquiry: "INQ-2609-0011", linkedEstimate: "EST-2609-0009",
  },
  {
    id: 4, number: "SV-2609-0003", intakeNumber: "SIN-2609-0001",
    customer: "Siam Food Products", site: "Bang Phli plant 2", purpose: "Safety Assessment",
    status: "Report Pending", start: "2026-09-03T09:00:00", end: "2026-09-03T16:00:00",
    assignments: [
      { engineer: "Warit Chunlaka", role: "Lead Engineer", status: "Accepted", match: 100, skills: ["SAFETY", "ROBOT"] },
    ],
    engineerConfirmed: true, customerConfirmed: true,
    reportStatus: "Draft", reportDue: "2026-09-06T16:00:00", reportSla: "overdue", skillMatch: 100,
    checklistDone: 6, checklistTotal: 6,
    findings: [
      { kind: "Safety Concern", title: "Light curtain muting is not documented", severity: "Critical" },
      { kind: "Proposed Solution", title: "Add a safety PLC with a documented muting sequence", severity: "Info" },
    ],
  },
];

const DEMO_ASSIGNMENTS = DEMO_VISITS.flatMap((visit) =>
  visit.assignments.map((assignment) => ({ visit, assignment })));

const formatDate = (value: string) => value === "—" ? "—"
  : new Intl.DateTimeFormat(currentLocale(), { dateStyle: "medium" }).format(new Date(value.length <= 10 ? `${value}T00:00:00` : value));
const formatDateTime = (value: string) => value === "—" ? "—"
  : new Intl.DateTimeFormat(currentLocale(), { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat(currentLocale(), { timeStyle: "short" }).format(new Date(value));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const readinessTone = (score: number, blockers: number) =>
  blockers > 0 ? "red" as const : score >= 90 ? "green" as const : score >= 70 ? "blue" as const : "amber" as const;
const slaTone = (state: string) =>
  state === "overdue" ? "red" as const : state === "due_soon" ? "amber" as const
    : state === "met" ? "green" as const : "blue" as const;
const matchTone = (percent: number) =>
  percent >= 100 ? "green" as const : percent >= 60 ? "blue" as const : percent >= 30 ? "amber" as const : "red" as const;
const priorityTone = (priority: string) =>
  priority === "Urgent" ? "red" as const : priority === "High" ? "amber" as const : priority === "Normal" ? "blue" as const : "slate" as const;

function DemoNote({ children }: { children: React.ReactNode }) {
  return <div className="callout" role="note"><Icon name="alertCircle" /><span>{children}</span></div>;
}

/* ==========================================================================
   Sales Intake
   ========================================================================== */

export function SalesIntakeDemo({ notify }: ScreenProps) {
  const uiText = useUiText();
  const t = useT();
  const [tab, setTab] = useState<"intakes" | "review" | "dashboard">("intakes");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All status");
  const [open, setOpen] = useState<DemoIntake | null>(null);

  const rows = useMemo(() => DEMO_INTAKES.filter((intake) =>
    (status === "All status" || intake.status === status)
    && [intake.number, intake.subject, intake.customer, intake.site].join(" ").toLowerCase().includes(search.toLowerCase())),
    [search, status]);
  const queue = DEMO_INTAKES.filter((intake) =>
    intake.status === "Pending Technical Review" || intake.status === "More Information Required" || intake.status === "Ready to Schedule");

  return <>
    <PageHeader eyebrow="SALES TO ENGINEERING" title={t("Sales Intake")}
      subtitle={t("Everything the customer told sales, in one record, before an engineer is sent anywhere.")}
      actions={<button className="btn primary" type="button" onClick={() => notify(t("Demo only — the production workspace writes to SQL Server."))}>
        <Icon name="plus" />{t("New Intake")}</button>} />
    <DemoNote>{t("This is the /demo prototype on sample data. The production workspace is the API-backed one.")}</DemoNote>
    <Tabs tabs={[
      { id: "intakes", label: t("Sales Intake List") },
      { id: "review", label: t("Technical Review Queue") },
      { id: "dashboard", label: t("Sales Dashboard") },
    ]} active={tab} onChange={setTab} />

    <div style={{ marginTop: 14 }}>
      {tab === "intakes" ? <>
        <Toolbar>
          <SearchInput value={search} onChange={setSearch} placeholder={t("Search intake no., subject, customer or site…")} />
          <Select label={t("Status")} value={status} onChange={setStatus} options={[
            "All status", "Draft", "Pending Technical Review", "More Information Required",
            "Ready to Schedule", "Scheduled", "Completed"]} />
        </Toolbar>
        <Panel title={`${rows.length} ${t("intakes")}`} subtitle={t("Readiness is what decides whether an intake may be submitted")} flush>
          {rows.length ? <div className="table-wrap"><table>
            <thead><tr>
              <th>{t("Intake No.")}</th><th>{t("Subject")}</th><th>{t("Customer")}</th><th>{t("Site")}</th>
              <th>{t("Sales Owner")}</th><th>{t("Response Due")}</th><th>{t("Readiness")}</th>
              <th>{t("Priority")}</th><th>{t("Status")}</th><th>{t("Site Visit")}</th><th aria-label={uiText("Action")} />
            </tr></thead>
            <tbody>{rows.map((intake) => <tr key={intake.id} className="clickable" onClick={() => setOpen(intake)}>
              <td><strong className="mono">{intake.number}</strong></td>
              <td><strong>{intake.subject}</strong></td>
              <td>{intake.customer}</td>
              <td>{intake.site}</td>
              <td><Person initials={initials(intake.salesOwner)} name={intake.salesOwner} /></td>
              <td>{formatDate(intake.responseDue)}</td>
              <td style={{ minWidth: 130 }}><Progress value={intake.readiness} tone={readinessTone(intake.readiness, intake.blockers.length)} /></td>
              <td><Badge tone={priorityTone(intake.priority)}>{intake.priority}</Badge></td>
              <td><Badge tone={toneOf(intake.status)}>{intake.status}</Badge></td>
              <td>{intake.visitNumber ? <span className="mono">{intake.visitNumber}</span> : "—"}</td>
              <td><span className="row-action"><Icon name="chevronRight" /></span></td>
            </tr>)}</tbody>
          </table></div> : <EmptyState icon="inbox" title={t("No intake matches the filter")} message={t("Adjust the filters above.")} />}
        </Panel>
      </> : null}

      {tab === "review" ? <>
        <div className="kpi-grid">
          <KpiCard label={t("Waiting for review")} value={String(queue.filter((row) => row.status === "Pending Technical Review").length)} icon="clock" tone="amber" />
          <KpiCard label={t("Returned to sales")} value={String(queue.filter((row) => row.status === "More Information Required").length)} icon="arrowLeft" tone="red" />
          <KpiCard label={t("Ready to schedule")} value={String(queue.filter((row) => row.status === "Ready to Schedule").length)} icon="checkCircle" tone="green" />
        </div>
        <Panel title={t("Technical Review Queue")} subtitle={t("Check the information is complete before an engineer is committed to a date.")} flush>
          <div className="table-wrap"><table>
            <thead><tr><th>{t("Intake No.")}</th><th>{t("Subject")}</th><th>{t("Readiness")}</th><th>{t("Missing")}</th><th>{t("Priority")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>{queue.map((intake) => <tr key={intake.id} className="clickable" onClick={() => setOpen(intake)}>
              <td><strong className="mono">{intake.number}</strong></td>
              <td>{intake.subject}</td>
              <td style={{ minWidth: 130 }}><Progress value={intake.readiness} tone={readinessTone(intake.readiness, intake.blockers.length)} /></td>
              <td>{intake.blockers.length ? <Badge tone="red">{`${intake.blockers.length} ${t("blocker")}`}</Badge> : null}
                {intake.warnings.length ? <Badge tone="amber">{`${intake.warnings.length} ${t("warning")}`}</Badge> : null}
                {!intake.blockers.length && !intake.warnings.length ? <Badge tone="green">{t("Complete")}</Badge> : null}</td>
              <td><Badge tone={priorityTone(intake.priority)}>{intake.priority}</Badge></td>
              <td><Badge tone={toneOf(intake.status)}>{intake.status}</Badge></td>
            </tr>)}</tbody>
          </table></div>
        </Panel>
      </> : null}

      {tab === "dashboard" ? <>
        <div className="kpi-grid">
          <KpiCard label={t("My intakes")} value={String(DEMO_INTAKES.length)} icon="inbox" />
          <KpiCard label={t("Pending technical review")} value="1" icon="clock" tone="amber" />
          <KpiCard label={t("Returned for information")} value="1" icon="alertTriangle" tone="red" />
          <KpiCard label={t("Upcoming visits")} value="2" icon="calendar" tone="blue" />
          <KpiCard label={t("Completed visits")} value="1" icon="checkCircle" tone="green" />
          <KpiCard label={t("Waiting for a report")} value="1" icon="file" tone="amber" />
          <KpiCard label={t("Converted to inquiry")} value="1" icon="arrowRight" tone="green" />
        </div>
        <Panel title={t("Intake by status")}>
          <div className="hbar-list">
            {(["Draft", "Pending Technical Review", "More Information Required", "Ready to Schedule", "Completed"] as const).map((label) => {
              const count = DEMO_INTAKES.filter((intake) => intake.status === label).length;
              return <div className="hbar-top" key={label}>
                <span>{t(label)}</span>
                <span className="hbar-track"><i style={{ width: `${count * 40}%` }} /></span>
                <strong>{count}</strong>
              </div>;
            })}
          </div>
        </Panel>
      </> : null}
    </div>

    {open ? <Drawer title={`${open.number} · ${open.subject}`} subtitle={`${open.customer} · ${open.site}`} width={560}
      onClose={() => setOpen(null)}
      footer={<button className="btn default" type="button" onClick={() => setOpen(null)}>{t("Close")}</button>}>
      <div className="workflow-steps" role="list">
        {["Draft", "Pending Technical Review", "Ready to Schedule", "Scheduled", "Completed"].map((step) => <span
          key={step} role="listitem"
          className={`workflow-step${step === open.status ? " active" : ""}`}>{t(step)}</span>)}
      </div>
      <Panel title={t("Readiness")}>
        <Progress value={open.readiness} tone={readinessTone(open.readiness, open.blockers.length)} />
        <ul className="check-list">
          {open.blockers.map((item) => <li key={item}><Icon name="alertTriangle" /><strong className="red-text">{t(item)}</strong></li>)}
          {open.warnings.map((item) => <li key={item}><Icon name="alertCircle" />{t(item)}</li>)}
          {!open.blockers.length && !open.warnings.length ? <li><Icon name="checkCircle" />{t("Everything is present.")}</li> : null}
        </ul>
      </Panel>
      <Panel title={t("What the customer wants")}>
        <dl className="def-list">
          <div><dt>{t("Current problem")}</dt><dd>{open.problem || "—"}</dd></div>
          <div><dt>{t("Expected result")}</dt><dd>{open.expected || "—"}</dd></div>
          <div><dt>{t("Machine")}</dt><dd>{open.machine || "—"}</dd></div>
        </dl>
      </Panel>
      <Panel title={t("Visit purpose and skills")}>
        <div className="chip-select">{open.purposes.map((purpose) => <span className="chip on" key={purpose}>{purpose}</span>)}</div>
        <div className="chip-select" style={{ marginTop: 8 }}>{open.skills.map((skill) => <span className="chip" key={skill}>{skill}</span>)}</div>
      </Panel>
    </Drawer> : null}
  </>;
}

/* ==========================================================================
   Site Visit
   ========================================================================== */

export function SiteVisitDemo({ notify }: ScreenProps) {
  const uiText = useUiText();
  const t = useT();
  const [tab, setTab] = useState<"requests" | "calendar" | "dashboard">("requests");
  const [open, setOpen] = useState<DemoVisit | null>(null);

  const days = ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12"];

  return <>
    <PageHeader eyebrow="ENGINEERING" title={t("Site Visit")}
      subtitle={t("Every requested, scheduled and completed visit, with who is going and whether the report has landed.")} />
    <DemoNote>{t("This is the /demo prototype on sample data. The production workspace is the API-backed one.")}</DemoNote>
    <Tabs tabs={[
      { id: "requests", label: t("Site Visit Requests") },
      { id: "calendar", label: t("Engineer Availability Calendar") },
      { id: "dashboard", label: t("Engineering Dashboard") },
    ]} active={tab} onChange={setTab} />

    <div style={{ marginTop: 14 }}>
      {tab === "requests" ? <Panel title={`${DEMO_VISITS.length} ${t("site visits")}`} flush>
        <div className="table-wrap"><table>
          <thead><tr>
            <th>{t("Visit No.")}</th><th>{t("Intake")}</th><th>{t("Customer / Site")}</th><th>{t("Purpose")}</th>
            <th>{t("Scheduled")}</th><th>{t("Team")}</th><th>{t("Skill match")}</th><th>{t("Confirmed")}</th>
            <th>{t("Report SLA")}</th><th>{t("Status")}</th><th aria-label={uiText("Action")} />
          </tr></thead>
          <tbody>{DEMO_VISITS.map((visit) => <tr key={visit.id} className="clickable" onClick={() => setOpen(visit)}>
            <td><strong className="mono">{visit.number}</strong></td>
            <td className="mono muted">{visit.intakeNumber}</td>
            <td><div className="cell-primary"><strong>{visit.customer}</strong><span>{visit.site}</span></div></td>
            <td>{visit.purpose}</td>
            <td>{formatDate(visit.start)}<br /><small className="muted">{formatTime(visit.start)} – {formatTime(visit.end)}</small></td>
            <td>{visit.assignments.map((assignment) => assignment.engineer).join(", ")}</td>
            <td><Badge tone={matchTone(visit.skillMatch)}>{`${visit.skillMatch}%`}</Badge></td>
            <td><Badge tone={visit.engineerConfirmed ? "green" : "slate"}><LocalizedText text={"E"} /></Badge><Badge tone={visit.customerConfirmed ? "green" : "slate"}><LocalizedText text={"C"} /></Badge></td>
            <td>{visit.reportStatus === "None" ? "—" : <Badge tone={slaTone(visit.reportSla)}>{visit.reportSla}</Badge>}</td>
            <td><Badge tone={toneOf(visit.status)}>{visit.status}</Badge></td>
            <td><span className="row-action"><Icon name="chevronRight" /></span></td>
          </tr>)}</tbody>
        </table></div>
      </Panel> : null}

      {tab === "calendar" ? <Panel title={t("Engineer Availability Calendar")}
        subtitle={t("Colour follows the visit status, so an unconfirmed appointment never looks like a firm one.")}>
        <div className="cal-grid week">
          {days.map((day) => <div className="cal-day" key={day}>
            <div className="cal-day-head">
              <strong>{new Date(`${day}T00:00:00`).getDate()}</strong>
              <span className="muted">{new Intl.DateTimeFormat(currentLocale(), { weekday: "short" }).format(new Date(`${day}T00:00:00`))}</span>
            </div>
            {DEMO_VISITS.filter((visit) => visit.start.slice(0, 10) === day).map((visit) => <button
              key={visit.id} type="button" className={`cal-chip ${toneOf(visit.status)}`} onClick={() => setOpen(visit)}>
              <strong>{formatTime(visit.start)}</strong> {visit.number}
              <small>{visit.customer}</small>
            </button>)}
            {day === "2026-09-10" ? <span className="cal-block">{t("Somchai P.")} <LocalizedText text={"·"} /> {t("Leave")}</span> : null}
          </div>)}
        </div>
      </Panel> : null}

      {tab === "dashboard" ? <>
        <div className="kpi-grid">
          <KpiCard label={t("Waiting for assignment")} value="0" icon="users" />
          <KpiCard label={t("Waiting for confirmation")} value="1" icon="clock" tone="amber" />
          <KpiCard label={t("Visits today")} value="1" icon="calendar" tone="blue" />
          <KpiCard label={t("Visits this week")} value="2" icon="calendar" />
          <KpiCard label={t("Conflict overrides")} value="0" icon="alertTriangle" />
          <KpiCard label={t("Reports overdue")} value="1" icon="file" tone="red" />
        </div>
        <div className="grid-2">
          <Panel title={t("Workload by engineer")}>
            <div className="hbar-list">
              {["Warit Chunlaka", "Pimchanok R.", "Somchai P."].map((name, index) => <div className="hbar-top" key={name}>
                <span>{name}</span>
                <span className="hbar-track"><i style={{ width: `${[100, 66, 33][index]}%` }} /></span>
                <strong>{[2, 2, 1][index]}</strong>
              </div>)}
            </div>
          </Panel>
          <Panel title={t("Skill demand")}>
            <div className="hbar-list">
              {["MECHANICAL", "SAFETY", "ROBOT", "ELECTRICAL", "PLC", "VISION"].map((skill, index) => <div className="hbar-top" key={skill}>
                <span>{skill}</span>
                <span className="hbar-track"><i style={{ width: `${100 - index * 15}%` }} /></span>
                <strong>{3 - Math.floor(index / 2)}</strong>
              </div>)}
            </div>
          </Panel>
        </div>
      </> : null}
    </div>

    {open ? <Drawer title={`${open.number} · ${open.purpose}`} subtitle={`${open.customer} · ${open.site}`} width={620}
      onClose={() => setOpen(null)}
      footer={<>
        <button className="btn default" type="button" onClick={() => setOpen(null)}>{t("Close")}</button>
        <button className="btn primary" type="button" onClick={() => notify(t("Demo only — the production workspace writes to SQL Server."))}>
          <Icon name="arrowRight" />{t("Create inquiry")}
        </button>
      </>}>
      <div className="workflow-steps" role="list">
        {["Tentative", "Pending Engineer Confirmation", "Pending Customer Confirmation", "Confirmed",
          "In Progress", "Report Pending", "Completed"].map((step) => <span key={step} role="listitem"
            className={`workflow-step${step === open.status ? " active" : ""}`}>{t(step)}</span>)}
      </div>
      <Panel title={t("Team")}>
        <ul className="link-list">
          {open.assignments.map((assignment) => <li key={assignment.engineer}>
            <Person initials={initials(assignment.engineer)} name={assignment.engineer} />
            <Pill>{assignment.role}</Pill>
            <Badge tone={assignment.status === "Accepted" ? "green" : "amber"}>{assignment.status}</Badge>
            <Badge tone={matchTone(assignment.match)}>{`${assignment.match}%`}</Badge>
          </li>)}
        </ul>
      </Panel>
      <Panel title={t("Checklist")}>
        <Progress value={Math.round((open.checklistDone / open.checklistTotal) * 100)} tone={open.checklistDone === open.checklistTotal ? "green" : "amber"} />
        <p className="muted">{open.checklistDone} <LocalizedText text={"of"} /> {open.checklistTotal} {t("answered")}</p>
      </Panel>
      <Panel title={t("Findings, measurements and risks")}>
        {open.findings.length ? <div className="timeline">
          {open.findings.map((finding) => <div className="timeline-item" key={finding.title}>
            <div className="timeline-head">
              <Pill>{finding.kind}</Pill><strong>{finding.title}</strong>
              <Badge tone={finding.severity === "Critical" || finding.severity === "High" ? "red" : finding.severity === "Medium" ? "amber" : "slate"}>{finding.severity}</Badge>
            </div>
          </div>)}
        </div> : <EmptyState icon="edit" title={t("Nothing recorded")} message={t("The visit has not happened yet.")} />}
      </Panel>
      <Panel title={t("Traceability")}>
        <div className="trace-chain">
          {[
            [t("Sales Intake"), open.intakeNumber, true],
            [t("Site Visit"), open.number, true],
            [t("Report"), open.reportStatus === "None" ? "—" : open.reportStatus, open.reportStatus !== "None"],
            [t("Inquiry"), open.linkedInquiry ?? "—", Boolean(open.linkedInquiry)],
            [t("Estimate"), open.linkedEstimate ?? "—", Boolean(open.linkedEstimate)],
          ].map(([label, value, done]) => <span key={String(label)} className={done ? "trace-step done" : "trace-step"}>
            <small>{label}</small><strong className="mono">{value}</strong>
          </span>)}
        </div>
      </Panel>
    </Drawer> : null}
  </>;
}

/* ==========================================================================
   My Assignments
   ========================================================================== */

export function MyAssignmentsDemo({ notify }: ScreenProps) {
  const t = useT();
  const mine = DEMO_ASSIGNMENTS.filter(({ assignment }) => assignment.engineer === "Warit Chunlaka");

  return <>
    <PageHeader eyebrow="ENGINEER" title={t("My Assignments")}
      subtitle={t("Accept the job, check in when you arrive, and write the report before the clock runs out.")} />
    <DemoNote>{t("This is the /demo prototype on sample data. The production workspace is the API-backed one.")}</DemoNote>
    <Panel title={`${mine.length} ${t("assignments")}`} flush>
      <div className="assignment-list">
        {mine.map(({ visit, assignment }) => <div className="assignment-card" key={visit.id}>
          <div className="assignment-card-head">
            <div>
              <strong className="mono">{visit.number}</strong>
              <Badge tone={toneOf(visit.status)}>{visit.status}</Badge>
              <Badge tone={assignment.status === "Accepted" ? "green" : "amber"}>{assignment.status}</Badge>
              <Pill>{t(assignment.role)}</Pill>
            </div>
            <Badge tone={matchTone(assignment.match)}>{`${assignment.match}%`}</Badge>
          </div>
          <div className="assignment-card-body">
            <strong>{visit.customer}</strong>
            <span>{visit.purpose}</span>
            <span className="muted">{visit.site}</span>
            <span className="muted"><Icon name="calendar" />{formatDateTime(visit.start)} → {formatTime(visit.end)}</span>
            {visit.reportStatus !== "None" ? <span className={visit.reportSla === "overdue" ? "red-text" : "muted"}>
              <Icon name="file" />{t("Report due")} {formatDateTime(visit.reportDue)}
            </span> : null}
          </div>
          <div className="assignment-card-foot">
            <button className="btn default big" type="button" onClick={() => notify(t("Demo only — the production workspace writes to SQL Server."))}>
              <Icon name="user" />{t("Call site")}
            </button>
            <button className="btn primary big" type="button" onClick={() => notify(t("Demo only — the production workspace writes to SQL Server."))}>
              <Icon name="play" />{visit.status === "Report Pending" ? t("Write report") : t("Check in")}
            </button>
          </div>
        </div>)}
      </div>
    </Panel>
  </>;
}

/* ==========================================================================
   Visit Master Data
   ========================================================================== */

export function VisitMasterDataDemo() {
  const t = useT();
  const [tab, setTab] = useState<"types" | "skills" | "checklists" | "sla">("types");

  const types = [
    { code: "PRE_SALES_SURVEY", name: "Pre-sales Survey", duration: 4, engineers: 1, approval: false },
    { code: "ROBOT_APPLICATION_SURVEY", name: "Robot Application Survey", duration: 6, engineers: 2, approval: false },
    { code: "SAFETY_ASSESSMENT", name: "Safety Assessment", duration: 5, engineers: 2, approval: true },
    { code: "COMMISSIONING", name: "Commissioning", duration: 8, engineers: 2, approval: true },
  ];
  const skills = [
    { code: "MECHANICAL", name: "Mechanical", discipline: "Mechanical", engineers: 3 },
    { code: "ELECTRICAL", name: "Electrical", discipline: "Electrical", engineers: 2 },
    { code: "PLC", name: "PLC", discipline: "Control", engineers: 2 },
    { code: "ROBOT", name: "Robot", discipline: "Control", engineers: 1 },
    { code: "SAFETY", name: "Safety", discipline: "Safety", engineers: 2 },
  ];
  const checklist = [
    { section: "Supply", prompt: "Incoming voltage measured", type: "Measurement", unit: "V", required: true },
    { section: "Panel", prompt: "Existing panel photographed inside and out", type: "Photo", unit: "", required: true },
    { section: "Route", prompt: "Cable route length measured", type: "Measurement", unit: "m", required: true },
    { section: "Earthing", prompt: "Earthing arrangement recorded", type: "Text", unit: "", required: true },
  ];
  const sla = [
    { code: "DEFAULT", name: "Standard site visit SLA", type: "All", review: 2, lead: 5, report: 3, warn: 24, isDefault: true },
    { code: "TROUBLESHOOTING", name: "Breakdown response SLA", type: "Troubleshooting", review: 1, lead: 1, report: 1, warn: 8, isDefault: false },
  ];

  return <>
    <PageHeader eyebrow="ADMINISTRATION" title={t("Visit Master Data")}
      subtitle={t("Visit purposes, skills, checklists, service levels, engineer profiles and unavailability.")} />
    <DemoNote>{t("This is the /demo prototype on sample data. The production workspace is the API-backed one.")}</DemoNote>
    <Tabs tabs={[
      { id: "types", label: t("Visit Types") },
      { id: "skills", label: t("Skills") },
      { id: "checklists", label: t("Checklist Templates") },
      { id: "sla", label: t("SLA") },
    ]} active={tab} onChange={setTab} />
    <div style={{ marginTop: 14 }}>
      {tab === "types" ? <Panel title={t("Visit Types")} flush><div className="table-wrap"><table>
        <thead><tr><th>{t("Code")}</th><th>{t("English")}</th><th>{t("Duration")}</th><th>{t("Engineers")}</th><th>{t("Manager approval")}</th></tr></thead>
        <tbody>{types.map((type) => <tr key={type.code}>
          <td><strong className="mono">{type.code}</strong></td><td>{type.name}</td>
          <td>{type.duration} {t("h")}</td><td>{type.engineers}</td>
          <td>{type.approval ? <Badge tone="amber">{t("Required")}</Badge> : "—"}</td>
        </tr>)}</tbody>
      </table></div></Panel> : null}
      {tab === "skills" ? <Panel title={t("Skills")} flush><div className="table-wrap"><table>
        <thead><tr><th>{t("Code")}</th><th>{t("English")}</th><th>{t("Discipline")}</th><th>{t("Engineers holding it")}</th></tr></thead>
        <tbody>{skills.map((skill) => <tr key={skill.code}>
          <td><strong className="mono">{skill.code}</strong></td><td>{skill.name}</td>
          <td>{skill.discipline}</td><td>{skill.engineers}</td>
        </tr>)}</tbody>
      </table></div></Panel> : null}
      {tab === "checklists" ? <Panel title={t("Checklist Templates")} subtitle="CL_ELECTRICAL" flush><div className="table-wrap"><table>
        <thead><tr><th>#</th><th>{t("Section")}</th><th>{t("Prompt")}</th><th>{t("Type")}</th><th>{t("Unit")}</th><th>{t("Required")}</th></tr></thead>
        <tbody>{checklist.map((item, index) => <tr key={item.prompt}>
          <td>{index + 1}</td><td>{item.section}</td><td>{item.prompt}</td>
          <td>{item.type}</td><td>{item.unit || "—"}</td>
          <td>{item.required ? <Icon name="check" /> : "—"}</td>
        </tr>)}</tbody>
      </table></div></Panel> : null}
      {tab === "sla" ? <Panel title={t("SLA")} flush><div className="table-wrap"><table>
        <thead><tr><th>{t("Code")}</th><th>{t("Name")}</th><th>{t("Visit type")}</th><th>{t("Review (days)")}</th>
          <th>{t("Lead (days)")}</th><th>{t("Report due (days)")}</th><th>{t("Warn (hours)")}</th><th>{t("Default")}</th></tr></thead>
        <tbody>{sla.map((policy) => <tr key={policy.code}>
          <td><strong className="mono">{policy.code}</strong></td><td>{policy.name}</td><td>{policy.type}</td>
          <td>{policy.review}</td><td>{policy.lead}</td><td>{policy.report}</td><td>{policy.warn}</td>
          <td>{policy.isDefault ? <Badge tone="green">{t("Default")}</Badge> : "—"}</td>
        </tr>)}</tbody>
      </table></div></Panel> : null}
    </div>
  </>;
}
