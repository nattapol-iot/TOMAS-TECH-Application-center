"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError } from "../api-client";
import { localeFor, useLanguage } from "../i18n";
import { Badge, Field, Icon, Modal, Panel, type Tone } from "../ui";
import { hoursText, parseHours, type IssueState } from "../../../lib/issue-batches";
import { loadMyIssues, takeIssueAction, type MyIssue } from "./issue-batch-client";

/*
 * My Work: the customer issues whose PIC is the signed-in person (Projects > Punchlist batches), with Start and Close
 * right here. Drawn in the app's own look; the Pegasus look belongs to the Punchlist page only. Everything else about
 * an issue (pictures, edit, cancel) is on its batch, one click away.
 */

const STATE_TONE: Record<IssueState, Tone> = { Approval: "amber", Open: "slate", Doing: "blue", Done: "green", Cancelled: "slate", Rejected: "red" };
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (match, key: string) => (values[key] === undefined ? match : String(values[key])));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

function CloseIssue({ issue, onClose, onDone }: { issue: MyIssue; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const day = today();
  const [doneOn, setDoneOn] = useState(day);
  const [hours, setHours] = useState(issue.planHours === null ? "" : String(issue.planHours));
  const [fix, setFix] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const actual = parseHours(hours);
    if (!doneOn || doneOn > day || (issue.startedOn && doneOn < issue.startedOn)) { setError(t(doneOn > day ? "Issues.errFuture" : !doneOn ? "Issues.errDoneOn" : "Issues.errBeforeStart")); return; }
    if (actual === null || Number.isNaN(actual) || actual < 0 || actual > 9999) { setError(t("Issues.errActualHours")); return; }
    if (!fix.trim()) { setError(t("Issues.errFix")); return; }
    setSaving(true); setError("");
    try { await takeIssueAction(issue, "close", { doneOn, actualHours: actual, fixNote: fix.trim() }); onDone(); }
    catch (failure) { setSaving(false); setError(errorText(failure)); }
  };
  return <Modal title="Issues.act.close" subtitle={`${issue.batchNo} #${issue.lineNo}`} onClose={onClose}
    footer={<><button type="button" className="btn ghost" onClick={onClose}>{t("Issues.cancel")}</button>
      <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}><Icon name="checkCircle" />{t("Issues.act.close")}</button></>}>
    <p className="muted" style={{ marginTop: 0 }}>{issue.description}</p>
    <div className="form-grid">
      <Field label="Issues.actualEnd"><input className="input" type="date" max={day} min={issue.startedOn ?? undefined} value={doneOn} onChange={(event) => setDoneOn(event.target.value)} /></Field>
      <Field label="Issues.actualHours" hint={fill(t("Issues.planWas"), { n: hoursText(issue.planHours) })}><input className="input" inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value)} /></Field>
      <Field label="Issues.fixNote" span={2}><textarea className="input" rows={4} maxLength={4000} value={fix} onChange={(event) => setFix(event.target.value)} /></Field>
    </div>
    {error ? <div className="callout danger" role="alert">{error}</div> : null}
  </Modal>;
}

export function MyIssuesPanel({ notify, openIssueBatch }: { notify: (message: string) => void; openIssueBatch?: (batchId: number) => void }) {
  const { t, lang } = useLanguage();
  const [items, setItems] = useState<MyIssue[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [closing, setClosing] = useState<MyIssue | null>(null);
  const load = useCallback(async () => {
    try { const data = await loadMyIssues(); setItems(data.items); setWaiting(data.waitingApproval); setError(""); }
    catch (failure) { setError(errorText(failure)); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const short = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", timeZone: "UTC" });
  const day = (iso: string | null) => (iso ? short.format(new Date(`${iso}T00:00:00Z`)) : "—");
  const start = async (issue: MyIssue) => {
    setBusy(issue.id);
    try { await takeIssueAction(issue, "start", { startedOn: today() }); notify(`${issue.batchNo} #${issue.lineNo} · ${t("Issues.done.start")}`); await load(); }
    catch (failure) { notify(failure instanceof ApiClientError && failure.status === 409 ? t("Issues.changedReloaded") : errorText(failure)); await load(); }
    finally { setBusy(null); }
  };
  if (!items.length && !waiting && !error) return null;
  return <Panel title={`${t("Issues.myTitle")} (${items.length})`} subtitle="Issues.mySubtitle" guide="mywork.issues">
    {error ? <div className="callout danger" role="alert">{error}</div> : null}
    {waiting ? <div className="callout warning" role="status">{fill(t("Issues.myWaiting"), { n: waiting })}</div> : null}
    {items.length ? <div className="table-wrap"><table>
      <thead><tr><th>{t("Issues.batchNo")}</th><th>{t("Issues.description")}</th><th>{t("Issues.plan")}</th><th>{t("Issues.status")}</th><th>{t("Issues.actions")}</th></tr></thead>
      <tbody>{items.map((issue) => <tr key={issue.id}>
        <td>{openIssueBatch ? <button type="button" className="link-button mono" onClick={() => openIssueBatch(issue.batchId)}>{issue.batchNo} #{issue.lineNo}</button> : <span className="mono">{issue.batchNo} #{issue.lineNo}</span>}
          <div className="muted small">{issue.projectNo || issue.projectName}</div></td>
        <td>{issue.functionName ? <strong>{issue.functionName} · </strong> : null}{issue.description.length > 140 ? `${issue.description.slice(0, 139)}…` : issue.description}</td>
        <td className="mono">{day(issue.planStart)}{issue.planEnd && issue.planEnd !== issue.planStart ? ` – ${day(issue.planEnd)}` : ""}<div className="muted small">{issue.planHours === null ? "—" : `${hoursText(issue.planHours)} ${t("Issues.hoursShort")}`}</div></td>
        <td><Badge tone={STATE_TONE[issue.state]}>{t(`Issues.state.${issue.state}`)}</Badge></td>
        <td><div className="row-actions">
          {issue.actions.includes("start") ? <button type="button" className="btn default sm" disabled={busy === issue.id} onClick={() => void start(issue)}><Icon name="play" />{t("Issues.act.start")}</button> : null}
          {issue.actions.includes("close") ? <button type="button" className="btn primary sm" onClick={() => setClosing(issue)}><Icon name="checkCircle" />{t("Issues.act.close")}</button> : null}
        </div></td>
      </tr>)}</tbody>
    </table></div> : null}
    {closing ? <CloseIssue issue={closing} onClose={() => setClosing(null)} onDone={() => { notify(`${closing.batchNo} #${closing.lineNo} · ${t("Issues.done.close")}`); setClosing(null); void load(); }} /> : null}
  </Panel>;
}
