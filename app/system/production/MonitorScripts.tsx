"use client";

import { useEffect, useRef, useState } from "react";
import {
  decideMonitorScriptJob, getMonitorScriptJob, listMonitorScriptJobs, requestMonitorScriptJob,
  type FleetAgent, type MonitorScriptJob, type MonitorScriptShell, type MonitorScriptTarget,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, Icon, Modal, Panel, type Tone } from "../ui";
import { SCRIPT_LIMIT_BYTES, durationText, utf8Bytes } from "./fleet-model";
import "./fleet.css";

/**
 * Script jobs from the Fleet screen: write a PowerShell or cmd script for the chosen machines, someone else with
 * monitor.approve approves it, then each machine runs it (only where its owner allowed scripts in TMT Control Panel)
 * and reports exit code, output and duration here. Script text and output are shown only to people who may write
 * or approve scripts, because either can hold credentials.
 */
type Notify = (message: string) => void;

const JOB_TONE: Record<MonitorScriptJob["status"], Tone> = {
  PendingApproval: "amber", Running: "blue", Completed: "green", Rejected: "red", Cancelled: "slate",
};
const TARGET_TONE: Record<MonitorScriptTarget["status"], Tone> = {
  Waiting: "slate", Pending: "blue", Delivered: "blue", Succeeded: "green", Failed: "red", Rejected: "amber",
  Skipped: "slate", Expired: "red", Cancelled: "slate",
};
const JOB_REFRESH_MS = 15_000;
const LIVE_REFRESH_MS = 3_000;

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function useDateTime() {
  const { lang } = useLanguage();
  const format = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (iso: string | null) => (iso ? format.format(new Date(iso)) : "—");
}

// ── request ────────────────────────────────────────────────────────────────

export function ScriptRequestModal({ agents, notify, onClose, onRequested }: {
  agents: FleetAgent[]; notify: Notify; onClose: () => void; onRequested: (job: MonitorScriptJob) => void;
}) {
  const t = useT();
  const [title, setTitle] = useState("");
  const [shell, setShell] = useState<MonitorScriptShell>("powershell");
  const [script, setScript] = useState("");
  const [timeout, setTimeoutValue] = useState("300");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const bytes = utf8Bytes(script);
  const timeoutSeconds = Number(timeout);
  const offline = agents.filter((agent) => !agent.isOnline).length;
  const problem = !title.trim() ? "Script.validation.title"
    : !script.trim() ? "Script.validation.script"
    : bytes > SCRIPT_LIMIT_BYTES ? "Script.validation.tooLarge"
    : !Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600 ? "Script.validation.timeout"
    : null;

  const submit = async () => {
    setBusy(true);
    try {
      const job = await requestMonitorScriptJob({ title: title.trim(), shell, script, timeoutSeconds, note: note.trim(), agentIds: agents.map((agent) => agent.id) });
      notify(t("Script.requested"));
      onRequested(job);
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Script.requestTitle" subtitle="Script.requestHint" size="lg" onClose={onClose} footer={<>
      {problem ? <span className="site-monitor-hint"><LocalizedText text={problem} /></span> : null}
      <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" data-guide="fleet.scriptSend" disabled={busy || problem !== null} onClick={() => void submit()}>
        <Icon name="send" /><LocalizedText text={busy ? "Monitor.working" : "Script.sendForApproval"} />
      </button>
    </>}>
      <div className="fleet-script-targets">
        <strong><LocalizedText text={"Script.targets"} /> · {agents.length}</strong>
        <ul>
          {agents.map((agent) => (
            <li key={agent.id} className={agent.isOnline ? "" : "offline"}>{agent.site.name} · {agent.name}</li>
          ))}
        </ul>
        {offline > 0 ? <p className="site-monitor-stale" role="note"><Icon name="alertTriangle" /><LocalizedText text={"Script.offlineWarning"} /></p> : null}
      </div>
      <div className="form-grid two">
        <Field label="Script.title" span={2} guide="fleet.scriptTitle">
          <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder={t("Script.titlePlaceholder")} />
        </Field>
        <Field label="Script.shell">
          <select value={shell} onChange={(event) => setShell(event.target.value === "cmd" ? "cmd" : "powershell")}>
            <option value="powershell">PowerShell</option>
            <option value="cmd">cmd</option>
          </select>
        </Field>
        <Field label="Script.timeout" hint="Script.timeoutHint">
          <input type="number" min={1} max={3600} value={timeout} onChange={(event) => setTimeoutValue(event.target.value)} />
        </Field>
        <Field label="Script.script" hint="Script.scriptHint" span={2} guide="fleet.scriptBody">
          <textarea className="fleet-script-editor mono" spellCheck={false} value={script} rows={12} onChange={(event) => setScript(event.target.value)}
            placeholder={shell === "powershell" ? "Get-Service TMT* | Select-Object Name, Status" : "sc query state= all | findstr TMT"} />
        </Field>
        <p className={`fleet-script-size${bytes > SCRIPT_LIMIT_BYTES ? " over" : ""}`}>{(bytes / 1024).toFixed(1)} / 64 KB</p>
        <Field label="Script.note" span={2}>
          <input value={note} maxLength={1000} onChange={(event) => setNote(event.target.value)} placeholder={t("Script.notePlaceholder")} />
        </Field>
      </div>
      <p className="site-monitor-footnote"><LocalizedText text={"Script.optInNote"} /></p>
    </Modal>
  );
}

// ── job list ───────────────────────────────────────────────────────────────

export function ScriptJobsPanel({ revision, notify, onOpen, onChanged }: {
  revision: number; notify: Notify; onOpen: (jobId: number) => void; onChanged: () => void;
}) {
  const t = useT();
  const dateTime = useDateTime();
  const [jobs, setJobs] = useState<MonitorScriptJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listMonitorScriptJobs()
      .then((result) => { if (active) { setJobs(result.items); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [revision, tick]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") setTick((value) => value + 1); }, JOB_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const decide = async (job: MonitorScriptJob, decision: "approve" | "reject" | "cancel") => {
    setBusy(job.id);
    try {
      const result = await decideMonitorScriptJob(job.id, decision);
      notify(decision === "approve" ? `${t("Script.approved")} · ${result.queued ?? 0} ${t("Script.machinesQueued")}` : t(decision === "reject" ? "Script.rejected" : "Script.cancelled"));
      setTick((value) => value + 1);
      onChanged();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Script.jobs" subtitle="Script.jobsHint" flush guide="fleet.jobs">
      {error && jobs === null ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        : jobs === null ? <EmptyState icon="clock" title="Loading…" message="Script.loading" />
        : jobs.length === 0 ? <EmptyState icon="play" title="Script.noJobsTitle" message="Script.noJobsMessage" />
        : (
          <div className="table-wrap">
            <table className="grid fleet-jobs">
              <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 210 }} /><col style={{ width: 170 }} /><col style={{ width: 230 }} /></colgroup>
              <thead>
                <tr>
                  <th><LocalizedText text={"Script.title"} /></th>
                  <th><LocalizedText text={"Monitor.status"} /></th>
                  <th><LocalizedText text={"Script.results"} /></th>
                  <th><LocalizedText text={"Script.requestedBy"} /></th>
                  <th aria-label={t("Script.actions")} />
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="wrap">
                      <div className="cell-primary">
                        <strong title={job.title}>{job.title}</strong>
                        <span>{job.shell} · {job.timeoutSeconds}s · {(job.scriptBytes / 1024).toFixed(1)} KB</span>
                      </div>
                    </td>
                    <td><Badge tone={JOB_TONE[job.status]} dot>{`Script.status.${job.status}`}</Badge></td>
                    <td>
                      <div className="fleet-job-counts">
                        <span title={t("Script.count.succeeded")} className="ok">✓ {job.counts.succeeded}</span>
                        <span title={t("Script.count.failed")} className="bad">✕ {job.counts.failed}</span>
                        <span title={t("Script.count.rejected")} className="warn">⊘ {job.counts.rejected}</span>
                        <span title={t("Script.count.running")}>⋯ {job.counts.running + job.counts.waiting}</span>
                        <span className="muted">/ {job.counts.targets}</span>
                      </div>
                    </td>
                    <td className="wrap"><div className="cell-primary"><strong>{job.requestedBy}</strong><span>{dateTime(job.requestedAt)}</span></div></td>
                    <td>
                      <div className="site-monitor-actions">
                        <button className="btn default sm" type="button" onClick={() => onOpen(job.id)}><Icon name="eye" /><LocalizedText text={"Script.view"} /></button>
                        {job.canDecide ? <>
                          <button className="btn primary sm" type="button" disabled={busy === job.id} onClick={() => void decide(job, "approve")}><LocalizedText text={"Script.approve"} /></button>
                          <button className="btn danger sm" type="button" disabled={busy === job.id} onClick={() => void decide(job, "reject")}><LocalizedText text={"Script.reject"} /></button>
                        </> : null}
                        {job.canCancel && !job.canDecide ? (
                          <button className="btn default sm" type="button" disabled={busy === job.id} onClick={() => void decide(job, "cancel")}><LocalizedText text={"Cancel"} /></button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Panel>
  );
}

// ── job detail with live results ───────────────────────────────────────────

export function ScriptJobModal({ jobId, notify, onClose, onChanged }: { jobId: number; notify: Notify; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const dateTime = useDateTime();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getMonitorScriptJob>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  useEffect(() => {
    let active = true;
    getMonitorScriptJob(jobId)
      .then((result) => { if (active) { setDetail(result); setError(null); live.current = result.job.status === "Running" || result.job.status === "PendingApproval"; } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [jobId, tick]);

  // Results arrive while the job runs; poll quickly until it is decided and finished.
  useEffect(() => {
    const timer = window.setInterval(() => { if (live.current && document.visibilityState === "visible") setTick((value) => value + 1); }, LIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const decide = async (decision: "approve" | "reject" | "cancel") => {
    setBusy(true);
    try {
      await decideMonitorScriptJob(jobId, decision);
      setTick((value) => value + 1);
      onChanged();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  const job = detail?.job;
  return (
    <Modal title="Script.jobTitle" subtitle={job ? undefined : "Script.loading"} size="xl" onClose={onClose} footer={<>
      {job?.canDecide ? <>
        <button className="btn danger" type="button" disabled={busy} onClick={() => void decide("reject")}><LocalizedText text={"Script.reject"} /></button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void decide("approve")}><LocalizedText text={"Script.approveRun"} /></button>
      </> : null}
      {job?.canCancel && !job.canDecide ? <button className="btn default" type="button" disabled={busy} onClick={() => void decide("cancel")}><LocalizedText text={"Script.cancelJob"} /></button> : null}
      <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Close"} /></button>
    </>}>
      {error && !detail ? <EmptyState icon="alertTriangle" title="Could not load" message={error} /> : !detail || !job ? (
        <EmptyState icon="clock" title="Loading…" message="Script.loading" />
      ) : (
        <div className="fleet-job">
          <div className="fleet-job-head">
            <div>
              <h3>{job.title}</h3>
              <p className="muted">
                {job.shell} · {t("Script.timeout")} {job.timeoutSeconds}s · {t("Script.requestedBy")} {job.requestedBy} · {dateTime(job.requestedAt)}
                {job.decidedBy ? ` · ${t("Script.decidedBy")} ${job.decidedBy}` : ""}
              </p>
              {job.note ? <p>{job.note}</p> : null}
            </div>
            <Badge tone={JOB_TONE[job.status]} dot>{`Script.status.${job.status}`}</Badge>
          </div>
          {job.canDecide ? <p className="site-monitor-stale" role="note"><Icon name="alertTriangle" /><LocalizedText text={"Script.reviewWarning"} /></p> : null}
          <pre className="fleet-script-view mono">{detail.script}</pre>
          <div className="table-wrap">
            <table className="grid fleet-results">
              <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 90 }} /><col style={{ width: 100 }} /><col style={{ width: 120 }} /></colgroup>
              <thead>
                <tr>
                  <th><LocalizedText text={"Monitor.machine"} /></th>
                  <th><LocalizedText text={"Monitor.status"} /></th>
                  <th className="num"><LocalizedText text={"Script.exitCode"} /></th>
                  <th className="num"><LocalizedText text={"Script.duration"} /></th>
                  <th aria-label={t("Script.output")} />
                </tr>
              </thead>
              <tbody>
                {detail.targets.map((target) => (
                  <ResultRows key={target.id} target={target} open={open === target.id} onToggle={() => setOpen(open === target.id ? null : target.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ResultRows({ target, open, onToggle }: { target: MonitorScriptTarget; open: boolean; onToggle: () => void }) {
  const hasOutput = target.stdout || target.stderr || target.resultMessage;
  return (
    <>
      <tr>
        <td className="wrap">
          <div className="cell-primary">
            <strong>{target.agentName}</strong>
            <span>{target.siteName}{target.machineName ? ` · ${target.machineName}` : ""}</span>
          </div>
        </td>
        <td><Badge tone={TARGET_TONE[target.status]} dot>{`Script.target.${target.status}`}</Badge></td>
        <td className={`num mono${target.exitCode !== null && target.exitCode !== 0 ? " fleet-bad" : ""}`}>{target.exitCode ?? "—"}</td>
        <td className="num mono">{durationText(target.durationMs)}</td>
        <td>
          {hasOutput ? (
            <button className="btn ghost sm" type="button" aria-expanded={open} onClick={onToggle}>
              <Icon name={open ? "chevronDown" : "chevronRight"} /><LocalizedText text={"Script.output"} />
            </button>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr className="fleet-output-row">
          <td colSpan={5} className="wrap">
            {target.resultMessage ? <p className="muted">{target.resultMessage}</p> : null}
            {target.stdout ? <><h4>stdout{target.stdoutTruncated ? <span className="fleet-cut"> · <LocalizedText text={"Script.truncated"} /></span> : null}</h4><pre className="fleet-output mono">{target.stdout}</pre></> : null}
            {target.stderr ? <><h4>stderr{target.stderrTruncated ? <span className="fleet-cut"> · <LocalizedText text={"Script.truncated"} /></span> : null}</h4><pre className="fleet-output err mono">{target.stderr}</pre></> : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
