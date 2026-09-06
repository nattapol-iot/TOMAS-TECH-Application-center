"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LocalizedText } from "../LocalizedText";
import { useT } from "../i18n";
import { ActivityKpiSummary } from "./ActivityKpiSummary";
import { Badge, Icon, Modal, PageHeader, Progress, SearchInput, Select, Tabs, type IconName, type Tone } from "../ui";
import {
  completePerformanceAssessment,
  loadPerformanceEvidence,
  loadPerformanceOverview,
  updatePerformanceAssessment,
  type PerformanceAssessment,
  type PerformanceCycle,
  type PerformanceEvidence,
} from "../api-client";

type TeamMember = {
  id: string | number;
  name: string;
  initials?: string;
  department: string;
  role: string;
  level: string;
  employeeId?: number;
};

type Props = {
  team: TeamMember[];
  currentUser: TeamMember;
  notify: (message: string) => void;
  apiBacked?: boolean;
  openProjectSchedule?: (projectId: number) => void;
  openInquiry?: (inquiryId: number) => void;
  openMyWork?: () => void;
};

type ReviewStatus = "Not started" | "Self review" | "Manager review" | "Calibration" | "Completed";
type ReviewRecord = {
  activity?: PerformanceAssessment["activity"];
  employeeId: string;
  role: string;
  score: number;
  status: ReviewStatus;
  updated: string;
  scores: number[];
  selfScores: number[];
  managerScores: number[];
  evidence: string[];
  selfEvidence: string[];
  managerEvidence: string[];
  selfSummary: string;
  managerSummary: string;
  developmentGoal: string;
  rowVersion: string | null;
};

type KpiArea = { code: string; name: string; short: string; weight: number; icon: IconName; description: string; evidence: string; tone: Tone };

const ENGINEERING_KPI_AREAS: KpiArea[] = [
  { code: "DELIVERY", name: "Delivery reliability", short: "Delivery", weight: 35, icon: "calendar", description: "Committed milestones delivered on time, with risks raised early.", evidence: "Milestones, due tasks and delivery outcomes", tone: "blue" },
  { code: "QUALITY", name: "Engineering quality", short: "Quality", weight: 25, icon: "shield", description: "Design, code, commissioning and documentation completed with low rework.", evidence: "Customer issues, rework and verification outcomes", tone: "green" },
  { code: "TECHNICAL", name: "Technical contribution", short: "Technical", weight: 25, icon: "cpu", description: "Reusable IoT solutions, troubleshooting depth and knowledge shared with the team.", evidence: "Completed technical work and reusable solutions", tone: "violet" },
  { code: "TEAMWORK", name: "Ownership & teamwork", short: "Teamwork", weight: 15, icon: "users", description: "Clear handoffs, customer ownership and help given across disciplines.", evidence: "Project participation, Inquiry ownership and collaboration", tone: "amber" },
];

const SALES_KPI_AREAS: KpiArea[] = [
  { code: "PIPELINE", name: "Pipeline & conversion", short: "Pipeline", weight: 30, icon: "chart", description: "Build qualified opportunities and move them through the agreed sales stages.", evidence: "Owned inquiries, probability, interest grade and outcomes", tone: "blue" },
  { code: "CUSTOMER", name: "Customer engagement", short: "Customer", weight: 25, icon: "users", description: "Maintain useful customer contact, clear next steps and responsive follow-up.", evidence: "Customer meetings, decisions and recorded action ownership", tone: "green" },
  { code: "FORECAST", name: "Forecast discipline", short: "Forecast", weight: 20, icon: "trendingUp", description: "Keep probability, timing and opportunity status current and realistic.", evidence: "Probability calibration across approved and cancelled opportunities", tone: "violet" },
  { code: "COMMERCIAL", name: "Commercial ownership", short: "Commercial", weight: 15, icon: "quote", description: "Drive complete requirements and commercially usable estimates toward approval.", evidence: "Estimate coverage, approval status and recorded value", tone: "amber" },
  { code: "HANDOVER", name: "Handover & teamwork", short: "Handover", weight: 10, icon: "gitBranch", description: "Transfer won work cleanly into engineering and Project execution.", evidence: "Approved opportunities linked to Project records", tone: "blue" },
];

const isSalesRole = (role: string) => ["Sales Engineer", "Sales Manager"].includes(role);
const areasForRole = (role: string) => isSalesRole(role) ? SALES_KPI_AREAS : ENGINEERING_KPI_AREAS;

const STATUS_ORDER: ReviewStatus[] = ["Completed", "Calibration", "Manager review", "Self review", "Not started"];

const statusTone = (status: ReviewStatus): Tone =>
  status === "Completed" ? "green" : status === "Calibration" ? "violet" : status === "Manager review" ? "blue" : status === "Self review" ? "amber" : "slate";

const initialsFor = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
const memberKey = (member: TeamMember) => String(member.employeeId ?? member.id);
const API_STATUS: Record<PerformanceAssessment["status"], ReviewStatus> = {
  NOT_STARTED: "Not started", SELF_REVIEW: "Self review", MANAGER_REVIEW: "Manager review", CALIBRATION: "Calibration", COMPLETED: "Completed",
};
function scoreAverage(scores: number[], areas: KpiArea[]) {
  if (!scores.length || scores.some((value) => value < 1)) return 0;
  return scores.reduce((sum, value, index) => sum + value * (areas[index]?.weight ?? 0), 0) / 100;
}

function fromApi(review: PerformanceAssessment): ReviewRecord {
  const selfScores = review.selfScores.map((value) => value ?? 0);
  const managerScores = review.managerScores.map((value) => value ?? 0);
  const scores = review.displayScores.map((value) => value ?? 0);
  const areas = areasForRole(review.role);
  return {
    employeeId: String(review.employeeId), role: review.role, score: review.overallScore === undefined ? Number(scoreAverage(scores, areas).toFixed(1)) : review.overallScore ?? 0, activity:review.activity, status: API_STATUS[review.status],
    updated: review.updatedAt ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(review.updatedAt)) : "Not updated",
    scores, selfScores, managerScores, evidence: review.evidence, selfEvidence: review.selfEvidence, managerEvidence: review.managerEvidence, selfSummary: review.selfSummary,
    managerSummary: review.managerSummary, developmentGoal: review.developmentGoal, rowVersion: review.rowVersion,
  };
}

function seedReviews(team: TeamMember[]): ReviewRecord[] {
  const scores = [4.4, 3.8, 4.1, 3.5, 4.6, 4.0, 3.9, 4.2];
  const statuses: ReviewStatus[] = ["Manager review", "Completed", "Calibration", "Self review", "Completed", "Manager review", "Not started", "Calibration"];
  return team.map((member, index) => ({
    role: member.role,
    employeeId: memberKey(member),
    score: scores[index % scores.length],
    status: statuses[index % statuses.length],
    updated: index % 3 === 0 ? "Today" : index % 3 === 1 ? "Yesterday" : "3 days ago",
    scores: areasForRole(member.role).map((_, scoreIndex) => Math.max(1, Math.min(5, 4 - ((index + scoreIndex) % 3 === 0 ? 1 : 0)))),
    selfScores: areasForRole(member.role).map(() => 4), managerScores: areasForRole(member.role).map(() => 4), evidence: areasForRole(member.role).map(() => ""), selfEvidence: areasForRole(member.role).map(() => ""), managerEvidence: areasForRole(member.role).map(() => ""),
    selfSummary: "", managerSummary: "", developmentGoal: isSalesRole(member.role) ? "Strengthen opportunity qualification and customer follow-up." : "Lead two cross-discipline architecture reviews.", rowVersion: null,
  }));
}

export default function Performance({ team, currentUser, notify, apiBacked = false, openProjectSchedule, openInquiry, openMyWork }: Props) {
  const t = useT();
  const members = useMemo(() => team.filter((member) => ["Engineer", "Engineering Manager", "Project Manager", "Sales Engineer", "Sales Manager"].includes(member.role)), [team]);
  const currentMember = members.find((member) => String(member.id) === String(currentUser.id)) ?? currentUser;
  const hasOwnAssessment = !apiBacked || members.some((member) => String(member.id) === String(currentUser.id));
  const [reviews, setReviews] = useState<ReviewRecord[]>(() => apiBacked ? [] : seedReviews(members));
  const roleCanManage = ["Admin", "Engineering Manager", "Project Manager", "Sales Manager"].includes(currentUser.role);
  const [apiCanManage, setApiCanManage] = useState(roleCanManage);
  const managerView = apiBacked ? apiCanManage : roleCanManage;
  const [tab, setTab] = useState<"mine" | "team" | "framework">(roleCanManage ? "team" : "mine");
  const [cycle, setCycle] = useState("H2 2026");
  const [cycles, setCycles] = useState<PerformanceCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<PerformanceCycle | null>(null);
  const [loading, setLoading] = useState(apiBacked);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All departments");
  const [status, setStatus] = useState("All statuses");
  const [selectedId, setSelectedId] = useState(memberKey(currentMember));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [workEvidence, setWorkEvidence] = useState<PerformanceEvidence | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");

  const selected = members.find((member) => memberKey(member) === selectedId) ?? members[0] ?? currentMember;
  const selectedReview = reviews.find((review) => review.employeeId === memberKey(selected)) ?? seedReviews([selected])[0];
  const mine = reviews.find((review) => review.employeeId === memberKey(currentMember)) ?? seedReviews([currentMember])[0];
  const selectedAreas = areasForRole(selected.role);
  const departments = [...new Set(members.map((member) => member.department))].sort();
  const visible = members.filter((member) => {
    const review = reviews.find((entry) => entry.employeeId === memberKey(member));
    const text = `${member.name} ${member.department} ${member.role} ${member.level}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (department === "All departments" || member.department === department)
      && (status === "All statuses" || review?.status === status);
  });
  const complete = reviews.filter((review) => review.status === "Completed").length;
  const inCalibration = reviews.filter((review) => review.status === "Calibration").length;
  const ratedReviews = reviews.filter((review) => review.score > 0);
  const average = ratedReviews.length ? ratedReviews.reduce((sum, review) => sum + review.score, 0) / ratedReviews.length : 0;
  const editingAsManager = Boolean(editingId && managerView && editingId !== memberKey(currentMember));
  const evidenceEmployeeId = tab === "team" && managerView ? Number(memberKey(selected)) : Number(memberKey(currentMember));

  const applyOverview = useCallback((data: Awaited<ReturnType<typeof loadPerformanceOverview>>) => {
    setReviews(data.assessments.map(fromApi));
    setCycles(data.cycles);
    setSelectedCycle(data.selectedCycle);
    setCycle(data.selectedCycle.code);
    setApiCanManage(data.canManage);
    if (!data.canManage) setTab("mine");
  }, []);

  const reload = useCallback(async (cycleId?: number) => {
    setLoading(true); setLoadError("");
    try { applyOverview(await loadPerformanceOverview(cycleId)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load KPI reviews."); }
    finally { setLoading(false); }
  }, [applyOverview]);

  useEffect(() => {
    if (!apiBacked) return;
    let cancelled = false;
    void loadPerformanceOverview().then((data) => { if (!cancelled) applyOverview(data); })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "Unable to load KPI reviews."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [apiBacked, applyOverview]); // the production endpoint owns the initial cycle selection

  const reloadWorkEvidence = useCallback(async (employeeId: number, cycleId: number) => {
    setEvidenceLoading(true);
    setEvidenceError("");
    try { setWorkEvidence(await loadPerformanceEvidence(employeeId, cycleId)); }
    catch (error) { setWorkEvidence(null); setEvidenceError(error instanceof Error ? error.message : "Unable to load work evidence."); }
    finally { setEvidenceLoading(false); }
  }, []);

  useEffect(() => {
    if (!apiBacked || !selectedCycle || tab === "framework" || !Number.isSafeInteger(evidenceEmployeeId)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void reloadWorkEvidence(evidenceEmployeeId, selectedCycle.id);
    });
    return () => { cancelled = true; };
  }, [apiBacked, evidenceEmployeeId, reloadWorkEvidence, selectedCycle, tab]);

  const openEvidenceSource = (sourceType: PerformanceEvidence["areas"][number]["signals"][number]["sourceType"], sourceId: number) => {
    if (!sourceId) return;
    if (sourceType === "PROJECT") openProjectSchedule?.(sourceId);
    else if (sourceType === "INQUIRY") openInquiry?.(sourceId);
    else openMyWork?.();
  };

  const updateReview = async (employeeId: string, nextScores: number[], nextEvidence: string[], nextStatus: ReviewStatus, summary: string, developmentGoal: string, submit: boolean, asManager: boolean) => {
    if (apiBacked) {
      const review = reviews.find((entry) => entry.employeeId === employeeId);
      if (!selectedCycle) throw new Error("No KPI review cycle is selected.");
      const areas = areasForRole(review?.role ?? currentMember.role);
      await updatePerformanceAssessment(Number(employeeId), {
        cycleId: selectedCycle.id,
        scores: nextScores.map((score, index) => ({ areaCode: areas[index].code, score, evidence: nextEvidence[index] ?? "" })),
        summary, developmentGoal, submit, rowVersion: review?.rowVersion,
      });
      await reload(selectedCycle.id);
      return;
    }
    const targetRole = reviews.find((entry) => entry.employeeId === employeeId)?.role ?? currentMember.role;
    const weighted = scoreAverage(nextScores, areasForRole(targetRole));
    setReviews((current) => current.map((review) => review.employeeId === employeeId
      ? { ...review, scores: nextScores, selfScores: asManager ? review.selfScores : nextScores, managerScores: asManager ? nextScores : review.managerScores, evidence: nextEvidence, selfEvidence: asManager ? review.selfEvidence : nextEvidence, managerEvidence: asManager ? nextEvidence : review.managerEvidence, score: Number(weighted.toFixed(1)), status: nextStatus, updated: "Just now", selfSummary: asManager ? review.selfSummary : summary, managerSummary: asManager ? summary : review.managerSummary, developmentGoal }
      : review));
  };

  const changeCycle = (code: string) => {
    setCycle(code);
    if (!apiBacked) return;
    const target = cycles.find((entry) => entry.code === code);
    if (target) void reload(target.id);
  };

  if (apiBacked && (loading || loadError)) {
    return (
      <div className="performance-page">
        <PageHeader eyebrow="PEOPLE & PERFORMANCE" title="KPI & Growth" subtitle="Fair, evidence-based reviews connected to the work each role delivers." />
        <section className="panel"><div className="panel-body performance-api-state">
          <span className={`performance-area-icon ${loadError ? "amber" : "blue"}`}><Icon name={loadError ? "alertTriangle" : "refresh"} /></span>
          <div><strong>{loadError ? <LocalizedText text={"KPI reviews could not be loaded"} /> : <LocalizedText text={"Loading KPI reviews…"} />}</strong><p>{loadError || "Reading the current cycle and your permitted assessments."}</p></div>
          {loadError ? <button className="btn default" type="button" onClick={() => { void reload(); }}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button> : null}
        </div></section>
      </div>
    );
  }

  return (
    <div className="performance-page">
      <PageHeader
        eyebrow="PEOPLE & PERFORMANCE"
        title="KPI & Growth"
        subtitle="Fair, evidence-based reviews connected to the work each role delivers."
        actions={
          <>
            <Select label="Review cycle" value={cycle} onChange={changeCycle} options={apiBacked ? cycles.map((entry) => entry.code) : ["H2 2026", "H1 2026", "H2 2025"]} width={130} />
            <button className="btn default" type="button" onClick={() => notify("KPI summary exported")}> <Icon name="download" /><LocalizedText text={"Export summary"} /></button>
          </>
        }
      />

      <section className="performance-cycle" aria-label="Current review cycle">
        <div className="performance-cycle-mark"><Icon name="chart" /></div>
        <div className="performance-cycle-copy">
          <span><LocalizedText text={"CURRENT CYCLE"} /></span>
          <strong>{cycle} · {selectedCycle?.name ?? t("Performance review")}</strong>
          <p>{selectedCycle ? `Performance period ${formatCycleDate(selectedCycle.periodStart)}–${formatCycleDate(selectedCycle.periodEnd)} · Reviews due ${formatCycleDate(selectedCycle.reviewDueDate)}` : <LocalizedText text={"Performance period 1 Jul–31 Dec · Reviews due 18 Jan 2027"} />}</p>
        </div>
        <div className="performance-cycle-progress">
          <span><b>{complete}</b>  <LocalizedText text={"of"} /> {reviews.length}  <LocalizedText text={"completed"} /></span>
          <Progress value={reviews.length ? Math.round((complete / reviews.length) * 100) : 0} tone="green" />
        </div>
        <Badge tone={inCalibration ? "violet" : "green"} dot>{inCalibration ? `${inCalibration} ${t("in calibration")}` : <LocalizedText text={"Calibration clear"} />}</Badge>
      </section>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          ...(hasOwnAssessment ? [{ id: "mine" as const, label: "My KPI" }] : []),
          ...(managerView ? [{ id: "team" as const, label: "Team progress", count: reviews.filter((review) => review.status !== "Completed").length }] : []),
          { id: "framework", label: "KPI framework" },
        ]}
      />

      {tab === "mine" ? (
        <MyKpi
          member={currentMember}
          review={mine}
          canEdit={!apiBacked || ["Not started", "Self review"].includes(mine.status)}
          onEdit={() => setEditingId(memberKey(currentMember))}
          evidence={workEvidence?.employeeId === Number(memberKey(currentMember)) ? workEvidence : null}
          evidenceLoading={evidenceLoading}
          evidenceError={evidenceError}
          onRetry={() => selectedCycle && void reloadWorkEvidence(Number(memberKey(currentMember)), selectedCycle.id)}
          onOpenSource={openEvidenceSource}
        />
      ) : null}

      {tab === "team" && managerView ? (
        <>
          <section className="kpi-grid performance-summary">
            <SummaryCard label="Team score" value={ratedReviews.length ? average.toFixed(1) : "—"} note="out of 5.0" tone="blue" icon="chart" />
            <SummaryCard label="Completed" value={`${complete}/${reviews.length}`} note={`${Math.round((complete / Math.max(reviews.length, 1)) * 100)}% ${t("of team")}`} tone="green" icon="checkCircle" />
            <SummaryCard label="In calibration" value={inCalibration} note="needs manager alignment" tone="violet" icon="compare" />
            <SummaryCard label="Needs action" value={reviews.filter((review) => review.status === "Not started" || review.status === "Self review").length} note="self reviews outstanding" tone="amber" icon="alertTriangle" />
          </section>

          <div className="performance-team-layout">
            <section className="panel performance-roster">
              <div className="performance-filters">
                <SearchInput value={query} onChange={setQuery} placeholder="Search team member or department…" />
                <Select label="Department" value={department} onChange={setDepartment} options={["All departments", ...departments]} />
                <Select label="Status" value={status} onChange={setStatus} options={["All statuses", ...STATUS_ORDER]} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th><LocalizedText text={"Employee"} /></th><th><LocalizedText text={"Role"} /></th><th><LocalizedText text={"Overall"} /></th><th><LocalizedText text={"Status"} /></th><th><LocalizedText text={"Updated"} /></th><th><span className="sr-only"><LocalizedText text={"Open"} /></span></th></tr></thead>
                  <tbody>
                    {visible.map((member) => {
                      const review = reviews.find((entry) => entry.employeeId === memberKey(member)) ?? seedReviews([member])[0];
                      const active = memberKey(member) === memberKey(selected);
                      return (
                        <tr key={member.id} className={active ? "selected" : undefined}>
                          <td><button className="performance-person" type="button" onClick={() => setSelectedId(memberKey(member))}><span className="avatar md">{member.initials ?? initialsFor(member.name)}</span><span><strong>{member.name}</strong><small>{member.department}</small></span></button></td>
                          <td><strong className="performance-role">{t(member.level || member.role)}</strong><small className="performance-meta">{t(member.role)}</small></td>
                          <td><Score value={review.score} /></td>
                          <td><Badge tone={statusTone(review.status)} dot>{review.status}</Badge></td>
                          <td className="muted">{t(review.updated)}</td>
                          <td><button className="row-action" type="button" aria-label={`View ${member.name}`} onClick={() => setSelectedId(memberKey(member))}><Icon name="chevronRight" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!visible.length ? <div className="performance-empty"><LocalizedText text={"No team member matches these filters."} /></div> : null}
              </div>
            </section>

            <aside className="panel performance-profile">
              <div className="performance-profile-head">
                <span className="avatar md">{selected.initials ?? initialsFor(selected.name)}</span>
                <div><strong>{selected.name}</strong><span>{t(selected.level || selected.role)} · {t(selected.department)}</span></div>
                <Badge tone={statusTone(selectedReview.status)}>{selectedReview.status}</Badge>
              </div>
              <div className="performance-score-hero">
                <div className="performance-score-ring" style={{ ["--score" as string]: `${selectedReview.score * 20}%` }}><strong>{selectedReview.score.toFixed(1)}</strong><span>/ 5.0</span></div>
                <div><span><LocalizedText text={"Overall performance"} /></span><strong>{t(ratingLabel(selectedReview.score))}</strong><p><LocalizedText text={"Weighted across the role-specific KPI framework"} /></p></div>
              </div>
              <div className="performance-area-list">
                {selectedAreas.map((area, index) => (
                  <div key={area.name}>
                    <span className={`performance-area-icon ${area.tone}`}><Icon name={area.icon} /></span>
                    <span><strong>{t(area.name)}</strong><small>{area.weight * (selectedReview.activity?.mode === "ACTIVE" && selectedReview.activity.eligible ? 0.9 : 1)}<LocalizedText text={"% weight"} /></small></span>
                    <b>{selectedReview.scores[index] ? `${selectedReview.scores[index]}.0` : "—"}</b>
                  </div>
                ))}
              </div>
              {selectedReview.status === "Calibration" && apiBacked && memberKey(selected) !== memberKey(currentMember)
                ? <button className="btn success block" type="button" onClick={() => setCompletingId(memberKey(selected))}><Icon name="checkCircle" /><LocalizedText text={"Complete calibration"} /></button>
                : <button className="btn primary block" type="button" disabled={memberKey(selected) === memberKey(currentMember) || selectedReview.status === "Completed" || (apiBacked && !["Manager review", "Calibration"].includes(selectedReview.status))} onClick={() => setEditingId(memberKey(selected))}><Icon name={selectedReview.status === "Completed" ? "lock" : "edit"} />{selectedReview.status === "Completed" ? <LocalizedText text={"Review completed"} /> : apiBacked && !["Manager review", "Calibration"].includes(selectedReview.status) ? t("Awaiting self review") : t("Open assessment")}</button>}
              <p className="performance-private"><Icon name="lock" /><LocalizedText text={"Only the employee and review managers can see written feedback."} /></p>
            </aside>
          </div>
          <ActivityKpiSummary activity={selectedReview.activity}/>
          <WorkEvidencePanel
            role={selected.role}
            evidence={workEvidence?.employeeId === Number(memberKey(selected)) ? workEvidence : null}
            loading={evidenceLoading}
            error={evidenceError}
            onRetry={() => selectedCycle && void reloadWorkEvidence(Number(memberKey(selected)), selectedCycle.id)}
            onOpenSource={openEvidenceSource}
          />
        </>
      ) : null}

      {tab === "framework" ? <Framework role={currentMember.role} canManage={managerView} /> : null}

      {editingId ? (
        <AssessmentModal
          member={members.find((member) => memberKey(member) === editingId) ?? currentMember}
          review={reviews.find((review) => review.employeeId === editingId) ?? mine}
          isManager={editingAsManager}
          workEvidence={workEvidence?.employeeId === Number(editingId) ? workEvidence : null}
          onClose={() => setEditingId(null)}
          onSave={async (scores, evidence, submit, summary, developmentGoal) => {
            await updateReview(editingId, scores, evidence, submit ? (editingAsManager ? "Calibration" : "Manager review") : (editingAsManager ? "Manager review" : "Self review"), summary, developmentGoal, submit, editingAsManager);
            notify(submit ? "Assessment submitted for the next review step" : "Assessment draft saved");
            setEditingId(null);
          }}
        />
      ) : null}
      {completingId && selectedCycle ? <CalibrationModal member={members.find((member) => memberKey(member) === completingId) ?? selected} onClose={() => setCompletingId(null)} onComplete={async (note) => { const review = reviews.find((entry) => entry.employeeId === completingId); if (!review?.rowVersion) throw new Error("Refresh the assessment before completing it."); await completePerformanceAssessment(Number(completingId), { cycleId: selectedCycle.id, calibrationNote: note, rowVersion: review.rowVersion }); await reload(selectedCycle.id); notify("KPI review completed and frozen"); setCompletingId(null); }} /> : null}
    </div>
  );
}

function SummaryCard({ label, value, note, tone, icon }: { label: string; value: string | number; note: string; tone: Tone; icon: "chart" | "checkCircle" | "compare" | "alertTriangle" }) {
  const t = useT();
  return <div className={`kpi ${tone}`}><span className="kpi-icon"><Icon name={icon} /></span><span className="kpi-body"><span className="kpi-label">{t(label)}</span><strong className="kpi-value">{value}</strong><span className="kpi-note">{t(note)}</span></span></div>;
}

function Score({ value }: { value: number }) {
  const tone = value >= 4.2 ? "green" : value >= 3.5 ? "blue" : value > 0 ? "amber" : "slate";
  return <span className={`performance-score ${tone}`}><strong>{value ? value.toFixed(1) : "—"}</strong><small>/ 5</small></span>;
}

function ratingLabel(score: number) {
  return score >= 4.5 ? "Exceptional impact" : score >= 4 ? "Exceeds expectations" : score >= 3 ? "Strong contribution" : score > 0 ? "Needs support" : "Not rated";
}

function formatCycleDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function MyKpi({ member, review, canEdit, onEdit, evidence, evidenceLoading, evidenceError, onRetry, onOpenSource }: {
  member: TeamMember;
  review: ReviewRecord;
  canEdit: boolean;
  onEdit: () => void;
  evidence: PerformanceEvidence | null;
  evidenceLoading: boolean;
  evidenceError: string;
  onRetry: () => void;
  onOpenSource: (sourceType: "PROJECT" | "INQUIRY" | "TASK", sourceId: number) => void;
}) {
  const t = useT();
  const areas = areasForRole(member.role);
  return (
    <div className="performance-my-layout">
      <section className="performance-my-hero">
        <div className="performance-my-copy">
          <span className="avatar md">{member.initials ?? initialsFor(member.name)}</span>
          <div><p><LocalizedText text={"MY PERFORMANCE SNAPSHOT"} /></p><h2>{member.name}</h2><span>{t(member.level || member.role)} · {t(member.department)}</span></div>
        </div>
        <div className="performance-my-result"><span><LocalizedText text={"Weighted score"} /></span><strong>{review.score.toFixed(1)}<small>/5.0</small></strong><Badge tone={statusTone(review.status)} dot>{review.status}</Badge></div>
        <button className="btn primary" type="button" disabled={!canEdit} onClick={onEdit}><Icon name={canEdit ? "edit" : "lock"} />{review.status === "Not started" ? <LocalizedText text={"Start self review"} /> : canEdit ? <LocalizedText text={"Update self review"} /> : review.status === "Completed" ? <LocalizedText text={"Review completed"} /> : <LocalizedText text={"Submitted to manager"} />}</button>
      </section>

      <ActivityKpiSummary activity={review.activity}/>
      <section className="performance-goal-grid">
        {areas.map((area, index) => (
          <article className="performance-goal" key={area.name}>
            <header><span className={`performance-area-icon ${area.tone}`}><Icon name={area.icon} /></span><Badge tone={area.tone}>{area.weight * (review.activity?.mode === "ACTIVE" && review.activity.eligible ? 0.9 : 1)}%</Badge></header>
            <h3>{t(area.name)}</h3><p>{t(area.description)}</p>
            <div className="performance-goal-result"><span>{review.evidence[index] || t(area.evidence)}</span><Score value={review.scores[index]} /></div>
          </article>
        ))}
      </section>

      <WorkEvidencePanel role={member.role} evidence={evidence} loading={evidenceLoading} error={evidenceError} onRetry={onRetry} onOpenSource={onOpenSource} />
      <section className="panel"><div className="panel-head"><div><h2><LocalizedText text={"Growth focus"} /></h2><p><LocalizedText text={"One practical capability to strengthen this cycle"} /></p></div></div><div className="panel-body"><div className="performance-growth"><span><Icon name="trendingUp" /></span><div><strong>{review.developmentGoal || t("Set one growth outcome in your review")}</strong><p>{review.developmentGoal ? <LocalizedText text={"This development goal is saved with the current KPI cycle."} /> : <LocalizedText text={"Choose a capability that can be practiced and observed in real work."} />}</p></div></div></div></section>
    </div>
  );
}

function WorkEvidencePanel({ role, evidence, loading, error, onRetry, onOpenSource }: {
  role: string;
  evidence: PerformanceEvidence | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpenSource: (sourceType: "PROJECT" | "INQUIRY" | "TASK", sourceId: number) => void;
}) {
  const t = useT();
  const areas = areasForRole(role);
  const confidenceTone: Tone = evidence?.confidence === "HIGH" ? "green" : evidence?.confidence === "MEDIUM" ? "blue" : "amber";
  if (loading && !evidence) {
    return <section className="panel"><div className="panel-body performance-api-state"><span className="performance-area-icon blue"><Icon name="refresh" /></span><div><strong><LocalizedText text={"Gathering work evidence…"} /></strong><p><LocalizedText text={isSalesRole(role) ? "Reading owned Inquiry, Meeting, Estimate and Project handover activity for this review cycle." : "Reading assigned Project, Inquiry and Task activity for this review cycle."} /></p></div></div></section>;
  }
  if (error) {
    return <section className="panel"><div className="panel-body performance-api-state"><span className="performance-area-icon amber"><Icon name="alertTriangle" /></span><div><strong><LocalizedText text={"Work evidence could not be loaded"} /></strong><p>{error}</p></div><button className="btn default" type="button" onClick={onRetry}><Icon name="refresh" /><LocalizedText text={"Try again"} /></button></div></section>;
  }
  if (!evidence) return null;
  return (
    <section className="panel performance-work-evidence">
      <div className="panel-head performance-evidence-head">
        <div><h2><LocalizedText text={"Work evidence · ข้อมูลผลงานจริง"} /></h2><p><LocalizedText text={"Connected to assigned work from"} /> {formatCycleDate(evidence.periodStart)}  <LocalizedText text={"to"} /> {formatCycleDate(evidence.periodEnd)}</p></div>
        <Badge tone={confidenceTone} dot>{evidence.confidence.toLowerCase()}  <LocalizedText text={"confidence"} /></Badge>
      </div>
      <div className="panel-body">
        <div className="performance-source-strip">
          {evidence.sources.map((source) => (
            <div className="performance-source-card" key={source.key}><span className="performance-source-icon"><Icon name={source.key === "PROJECT" ? "folder" : source.key === "INQUIRY" ? "inbox" : source.key === "MEETING" ? "calendar" : source.key === "ESTIMATE" ? "quote" : "checkCircle"} /></span><div className="performance-source-copy"><strong>{source.count}</strong><small>{source.label}</small></div><Badge tone={source.count ? "green" : "slate"}>{source.count ? <LocalizedText text={"Connected"} /> : <LocalizedText text={"No records"} />}</Badge></div>
          ))}
          {evidence.frameworkCode !== "SALES" ? <div className="performance-source-card"><span className="performance-source-icon"><Icon name="calendar" /></span><div className="performance-source-copy"><strong>{evidence.metrics.onTimeTaskCount}/{evidence.metrics.dueTaskCount}</strong><small><LocalizedText text={"Due tasks on time"} /></small></div><Badge tone={evidence.metrics.overdueTaskCount ? "amber" : "green"}>{evidence.metrics.overdueTaskCount}  <LocalizedText text={"overdue"} /></Badge></div> : null}
        </div>
        <div className="performance-method"><Icon name="shield" /><span><strong><LocalizedText text={"Decision support, not an automatic final rating."} /></strong> {evidence.methodology}</span><small><LocalizedText text={"Data as of"} /> {formatCycleDate(evidence.asOf)}</small></div>
        <div className="performance-evidence-areas">
          {areas.map((area) => {
            const areaEvidence = evidence.areas.find((entry) => entry.areaCode === area.code);
            return (
              <article key={area.name}>
                <header><span className={`performance-area-icon ${area.tone}`}><Icon name={area.icon} /></span><div><h3>{t(area.short)}</h3><small>{area.weight}<LocalizedText text={"% of final KPI"} /></small></div>{areaEvidence?.suggestedScore !== null && areaEvidence?.suggestedScore !== undefined ? <Badge tone={area.tone}><LocalizedText text={"Signal"} /> {areaEvidence.suggestedScore.toFixed(1)}/5</Badge> : <Badge tone="slate"><LocalizedText text={"Manager judgement"} /></Badge>}</header>
                <p>{areaEvidence?.evidenceText ?? t("No measurable signal is available for this area.")}</p>
                <ul>
                  {areaEvidence?.signals.length ? areaEvidence.signals.map((signal) => (
                    <li key={signal.id}>
                      <span className={`performance-signal-dot ${signal.tone}`} />
                      <span><strong>{signal.title}</strong><small>{signal.sourceLabel} · {signal.detail}</small></span>
                      {signal.sourceId ? <button type="button" onClick={() => onOpenSource(signal.sourceType, signal.sourceId)} aria-label={`Open ${signal.sourceLabel}`}><Icon name="externalLink" /></button> : null}
                    </li>
                  )) : <li className="performance-no-signal"><span><LocalizedText text={"No source records for this area in the selected cycle."} /></span></li>}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Framework({ role, canManage }: { role: string; canManage: boolean }) {
  const t = useT();
  const showEngineeringFramework = canManage || !isSalesRole(role);
  const showSalesFramework = canManage || isSalesRole(role);
  const renderFramework = (title: string, subtitle: string, areas: KpiArea[]) => (
    <section className="panel"><div className="panel-head"><div><h2>{t(title)}</h2><p>{t(subtitle)}</p></div><Badge tone="green"><LocalizedText text={"100% total weight"} /></Badge></div><div className="panel-body"><div className="performance-framework-list">{areas.map((area) => <article key={area.name}><span className={`performance-area-icon ${area.tone}`}><Icon name={area.icon} /></span><div><h3>{t(area.name)}<Badge tone={area.tone}>{area.weight}%</Badge></h3><p>{t(area.description)}</p><small><LocalizedText text={"Typical evidence:"} /> {t(area.evidence)}</small></div></article>)}</div></div></section>
  );
  return (
    <div className="performance-framework">
      {showEngineeringFramework ? renderFramework("Engineering KPI framework", "Delivery, quality, technical contribution and teamwork", ENGINEERING_KPI_AREAS) : null}
      {showSalesFramework ? renderFramework("Sales KPI framework", "Pipeline, customer engagement, forecast, commercial ownership and handover", SALES_KPI_AREAS) : null}
      <section className="panel"><div className="panel-head"><div><h2><LocalizedText text={"Rating guide"} /></h2><p><LocalizedText text={"Use evidence and impact, not effort or visibility"} /></p></div></div><div className="panel-body"><ol className="performance-ratings">{[[5,"Exceptional","Creates impact beyond the role and lifts team capability."],[4,"Exceeds","Consistently delivers above the agreed expectation."],[3,"Strong","Reliably meets the expectation for the role."],[2,"Developing","Partly meets expectations; a clear support plan is needed."],[1,"Critical","Does not yet meet the essential expectation."]].map(([score,label,copy]) => <li key={score}><b>{score}</b><span><strong>{t(String(label))}</strong><small>{t(String(copy))}</small></span></li>)}</ol><div className="performance-rule"><Icon name="shield" /><p><strong><LocalizedText text={"Calibration rule"} /></strong>  <LocalizedText text={"Ratings 1, 2 and 5 require concrete work evidence. Another manager must complete your own review."} /></p></div></div></section>
    </div>
  );
}

function AssessmentModal({ member, review, isManager, workEvidence, onClose, onSave }: { member: TeamMember; review: ReviewRecord; isManager: boolean; workEvidence: PerformanceEvidence | null; onClose: () => void; onSave: (scores: number[], evidence: string[], submit: boolean, summary: string, developmentGoal: string) => Promise<void> }) {
  const t = useT();
  const areas = areasForRole(member.role);
  const perspectiveScores = isManager ? review.managerScores : review.selfScores;
  const [scores, setScores] = useState(perspectiveScores);
  const [evidence, setEvidence] = useState(() => areas.map((_, index) => (isManager ? review.managerEvidence[index] : review.selfEvidence[index]) ?? ""));
  const [summary, setSummary] = useState(isManager ? review.managerSummary : review.selfSummary);
  const [developmentGoal, setDevelopmentGoal] = useState(review.developmentGoal);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const weighted = scoreAverage(scores, areas);
  const valid = scores.every((score, index) => score >= 1 && score <= 5 && (score === 3 || score === 4 || Boolean(evidence[index]?.trim())));
  const save = async (submit: boolean) => {
    if (!valid) { setError(t(`Rate all ${areas.length} areas and add evidence for every rating of 1, 2 or 5.`)); return; }
    setBusy(true); setError("");
    try { await onSave(scores, evidence, submit, summary, developmentGoal); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("The assessment could not be saved.")); setBusy(false); }
  };
  return (
    <Modal title={`${t(isManager ? "Manager assessment" : "Self review")} · ${member.name}`} subtitle="Rate demonstrated impact and add a specific example where it helps." size="xl" onClose={onClose} footer={<><button className="btn default" type="button" disabled={busy} onClick={() => { void save(false); }}><LocalizedText text={"Save draft"} /></button><button className="btn primary" type="button" disabled={busy || !valid} onClick={() => { void save(true); }}><Icon name="send" />{busy ? <LocalizedText text={"Saving…"} /> : t(isManager ? "Send to calibration" : "Submit self review")}</button></>}>
      {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
      <div className="performance-modal-summary"><div className="performance-score-ring compact" style={{ ["--score" as string]: `${weighted * 20}%` }}><strong>{weighted.toFixed(1)}</strong><span>/ 5.0</span></div><div><strong>{t(ratingLabel(weighted))}</strong><p><LocalizedText text={"Weighted score updates as you rate each area."} /></p></div></div>
      <div className="performance-score-editor">
        {areas.map((area, index) => {
          const suggestion = workEvidence?.areas.find((entry) => entry.areaCode === area.code);
          return <section key={area.name}>
            <div className="performance-score-title"><span className={`performance-area-icon ${area.tone}`}><Icon name={area.icon} /></span><div><strong>{t(area.name)}</strong><small>{area.weight}% · {t(area.description)}</small>{isManager && review.selfEvidence[index] ? <em className="performance-employee-evidence"><LocalizedText text={"Employee evidence:"} /> {review.selfEvidence[index]}</em> : null}</div></div>
            <div className="performance-rating-buttons" role="radiogroup" aria-label={`${t(area.name)} ${t("rating")}`}>{[1,2,3,4,5].map((value) => <button key={value} type="button" role="radio" aria-checked={scores[index] === value} className={scores[index] === value ? "active" : undefined} onClick={() => setScores((current) => current.map((score, scoreIndex) => scoreIndex === index ? value : score))}><b>{value}</b><small>{t(value === 1 ? "Critical" : value === 2 ? "Developing" : value === 3 ? "Strong" : value === 4 ? "Exceeds" : "Exceptional")}</small></button>)}</div>
            {suggestion ? <div className="performance-evidence-suggestion"><span><Icon name="database" /><span><strong>{suggestion.suggestedScore !== null ? `${t("Measured signal")} ${suggestion.suggestedScore.toFixed(1)}/5` : <LocalizedText text={"Context signal only"} />}</strong><small>{suggestion.evidenceText}</small></span></span><button type="button" onClick={() => setEvidence((current) => current.map((item, evidenceIndex) => evidenceIndex === index ? suggestion.evidenceText : item))}><LocalizedText text={"Use evidence"} /></button></div> : null}
            <label className="performance-area-evidence"><span>{isManager ? <LocalizedText text={"Manager evidence"} /> : <LocalizedText text={"Work evidence"} />}{[1, 2, 5].includes(scores[index]) ? <LocalizedText text="· required for this rating" /> : <LocalizedText text="· optional" />}</span><textarea value={evidence[index]} onChange={(event) => setEvidence((current) => current.map((item, evidenceIndex) => evidenceIndex === index ? event.target.value : item))} rows={2} maxLength={1000} placeholder={t(isSalesRole(member.role) ? "Link the rating to an Inquiry, customer meeting, estimate outcome or Project handover…" : "Link the rating to a milestone, quality signal, technical contribution or team outcome…")} /></label>
          </section>;
        })}
      </div>
      <label className="performance-comment"><span>{isManager ? <LocalizedText text={"Manager summary"} /> : <LocalizedText text={"Reflection and evidence"} />}</span><textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} maxLength={1000} placeholder={t("Describe the impact, a concrete example, and what should happen next…")} /><small>{summary.length}/1000</small></label>
      <label className="performance-comment"><span><LocalizedText text={"Development goal"} /></span><textarea value={developmentGoal} onChange={(event) => setDevelopmentGoal(event.target.value)} rows={2} maxLength={1000} placeholder={t("Define one practical capability or outcome for the next cycle…")} /><small>{developmentGoal.length}/1000</small></label>
    </Modal>
  );
}

function CalibrationModal({ member, onClose, onComplete }: { member: TeamMember; onClose: () => void; onComplete: (note: string) => Promise<void> }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const complete = async () => {
    if (!note.trim()) { setError(t("Record the calibration decision before completing the review.")); return; }
    setBusy(true); setError("");
    try { await onComplete(note); }
    catch (caught) { setError(caught instanceof Error ? caught.message : t("The review could not be completed.")); setBusy(false); }
  };
  return <Modal title={`${t("Complete calibration")} · ${member.name}`} subtitle="This freezes the final manager scores and written feedback." size="sm" onClose={onClose} footer={<><button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button><button className="btn success" type="button" disabled={busy || !note.trim()} onClick={() => { void complete(); }}><Icon name="checkCircle" />{busy ? <LocalizedText text={"Completing…"} /> : <LocalizedText text={"Complete review"} />}</button></>}>
    {error ? <div className="callout error" role="alert"><Icon name="alertTriangle" /><span>{error}</span></div> : null}
    <div className="performance-rule"><Icon name="lock" /><p><strong><LocalizedText text={"Final review"} /></strong>  <LocalizedText text={"Completed assessments are immutable and remain available in the audit history."} /></p></div>
    <label className="performance-comment"><span><LocalizedText text={"Calibration decision"} /></span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={1000} placeholder={t("Summarise the evidence considered and the agreed final outcome…")} /><small>{note.length}/1000</small></label>
  </Modal>;
}
