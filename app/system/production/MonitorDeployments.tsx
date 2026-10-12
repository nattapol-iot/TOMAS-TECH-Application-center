"use client";

import { useEffect, useMemo, useState } from "react";
import {
  decideMonitorDeployment, getMonitorProgramReleases, listMonitorDeployments, requestMonitorDeployment, setMonitorProgramRepository,
  type MonitorDeployment, type MonitorDeploymentStatus, type MonitorProgram, type MonitorRelease,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, Icon, Modal, Panel, type Tone } from "../ui";

type Notify = (message: string) => void;

const STATUS_TONE: Record<MonitorDeploymentStatus, Tone> = {
  PendingApproval: "amber", Approved: "blue", Delivered: "blue", Succeeded: "green", Failed: "red", RolledBack: "red",
  Rejected: "slate", Cancelled: "slate", Expired: "slate",
};

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Release updates for monitored programs: a site's history, or (no siteId) every update waiting for
 * approval. Approve / reject is offered only to someone other than the requester.
 */
export function DeploymentsPanel({ siteId, revision, notify, onChanged, onlyPending }: {
  siteId?: number; revision: number; notify: Notify; onChanged: () => void; onlyPending?: boolean;
}) {
  const { lang } = useLanguage();
  const dateTime = useMemo(() => new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), [lang]);
  const [items, setItems] = useState<MonitorDeployment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ deployment: MonitorDeployment; decision: "approve" | "reject" | "cancel" } | null>(null);

  useEffect(() => {
    let active = true;
    listMonitorDeployments({ siteId, status: onlyPending ? "PendingApproval" : undefined })
      .then((result) => { if (active) { setItems(result.items); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [siteId, onlyPending, revision]);

  if (onlyPending && (!items || items.length === 0)) return null;

  return (
    <Panel title={onlyPending ? "Deploy.waitingTitle" : "Deploy.title"} subtitle={onlyPending ? "Deploy.waitingHint" : "Deploy.hint"} flush>
      {error ? <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        : !items ? <EmptyState icon="clock" title="Loading…" message="Deploy.loading" />
        : items.length === 0 ? <EmptyState icon="package" title="Deploy.emptyTitle" message="Deploy.emptyMessage" />
        : (
          <ul className="monitor-deployments">
            {items.map((item) => (
              <li key={item.id}>
                <div className="monitor-deployment-main">
                  <div className="monitor-deployment-title">
                    <Badge tone={STATUS_TONE[item.status]}><LocalizedText text={`Deploy.status.${item.status}`} /></Badge>
                    <strong>{item.program.name}</strong>
                    <span className="mono">{item.previousVersion || "—"} → {item.newVersion || item.releaseTag}</span>
                  </div>
                  <span className="muted">
                    {onlyPending || !siteId ? `${item.site.name} · ` : ""}{item.agent.name} · {item.repository} <span className="mono">{item.releaseTag}</span> · {item.assetName} ({formatSize(item.assetSize)})
                  </span>
                  <span className="muted">
                    <LocalizedText text={"Deploy.requestedBy"} /> {item.requestedBy}{item.requestedAt ? ` · ${dateTime.format(new Date(item.requestedAt))}` : ""}
                    {item.decidedBy ? <> · <LocalizedText text={"Deploy.decidedBy"} /> {item.decidedBy}</> : null}
                  </span>
                  {item.note ? <span className="monitor-deployment-note">“{item.note}”</span> : null}
                  {item.decisionNote ? <span className="monitor-deployment-note">“{item.decisionNote}”</span> : null}
                  {item.resultMessage ? <span className={`monitor-deployment-result ${item.status === "Succeeded" ? "ok" : "bad"}`}>{item.resultMessage}</span> : null}
                  <span className="mono muted" title={item.sha256}>SHA-256 {item.sha256.slice(0, 16)}…</span>
                </div>
                <div className="monitor-deployment-actions">
                  {item.canDecide ? (
                    <>
                      <button className="btn primary sm" type="button" onClick={() => setDeciding({ deployment: item, decision: "approve" })}><Icon name="check" /><LocalizedText text={"Deploy.approve"} /></button>
                      <button className="btn danger sm" type="button" onClick={() => setDeciding({ deployment: item, decision: "reject" })}><Icon name="x" /><LocalizedText text={"Deploy.reject"} /></button>
                    </>
                  ) : null}
                  {item.canCancel && item.isOwn ? (
                    <button className="btn default sm" type="button" onClick={() => setDeciding({ deployment: item, decision: "cancel" })}><LocalizedText text={"Deploy.cancel"} /></button>
                  ) : null}
                  {item.status === "PendingApproval" && item.isOwn && !item.canDecide ? <span className="muted"><LocalizedText text={"Deploy.waitingForOther"} /></span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      {deciding ? (
        <DecisionModal deployment={deciding.deployment} decision={deciding.decision} notify={notify}
          onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); onChanged(); }} />
      ) : null}
    </Panel>
  );
}

function DecisionModal({ deployment, decision, notify, onClose, onDone }: {
  deployment: MonitorDeployment; decision: "approve" | "reject" | "cancel"; notify: Notify; onClose: () => void; onDone: () => void;
}) {
  const t = useT();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const noteRequired = decision === "reject";
  const submit = async () => {
    setBusy(true);
    try {
      await decideMonitorDeployment(deployment.id, decision, note.trim());
      notify(t(`Deploy.done.${decision}`));
      onDone();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={`Deploy.confirm.${decision}`} subtitle={`${deployment.program.name} · ${deployment.agent.name}`} size="sm" onClose={onClose}
      footer={<>
        <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className={`btn ${decision === "approve" ? "primary" : "danger"}`} type="button" disabled={busy || (noteRequired && !note.trim())} onClick={() => void submit()}>
          <LocalizedText text={`Deploy.${decision}`} />
        </button>
      </>}>
      <div className="stack">
        <dl className="monitor-deployment-facts">
          <dt><LocalizedText text={"Deploy.release"} /></dt><dd><span className="mono">{deployment.releaseTag}</span> · {deployment.assetName} ({formatSize(deployment.assetSize)})</dd>
          <dt><LocalizedText text={"Deploy.version"} /></dt><dd className="mono">{deployment.previousVersion || "—"} → {deployment.releaseTag}</dd>
          <dt>SHA-256</dt><dd className="mono monitor-deployment-hash">{deployment.sha256}</dd>
          <dt><LocalizedText text={"Deploy.requestedBy"} /></dt><dd>{deployment.requestedBy}{deployment.note ? ` — “${deployment.note}”` : ""}</dd>
        </dl>
        {decision === "approve" ? <p className="monitor-deployment-warning"><Icon name="alertTriangle" /><LocalizedText text={"Deploy.approveWarning"} /></p> : null}
        <Field label={noteRequired ? "Deploy.reasonRequired" : "Deploy.noteOptional"}>
          <textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/** Request a release for one program: pick a release and its .zip / .exe, say why, send for approval. */
export function DeployModal({ program, agentName, canLinkRepository, notify, onClose, onRequested }: {
  program: MonitorProgram; agentName: string; canLinkRepository: boolean; notify: Notify; onClose: () => void; onRequested: () => void;
}) {
  const t = useT();
  const [repository, setRepository] = useState(program.repository);
  const [repositoryDraft, setRepositoryDraft] = useState(program.repository);
  const [releases, setReleases] = useState<MonitorRelease[] | null>(null);
  const [currentVersion, setCurrentVersion] = useState(program.version);
  const [error, setError] = useState<string | null>(null);
  const [releaseId, setReleaseId] = useState<number | null>(null);
  const [assetName, setAssetName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!repository) return undefined;
    let active = true;
    getMonitorProgramReleases(program.id)
      .then((result) => {
        if (!active) return;
        setReleases(result.releases);
        setCurrentVersion(result.currentVersion);
        setError(null);
        const first = result.releases.find((release) => release.assets.some((asset) => asset.deployable));
        if (first) {
          setReleaseId(first.id);
          setAssetName(first.assets.find((asset) => asset.deployable)?.name ?? "");
        }
      })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [program.id, repository]);

  const release = releases?.find((item) => item.id === releaseId) ?? null;
  const linkRepository = async () => {
    setBusy(true);
    try {
      const saved = await setMonitorProgramRepository(program.id, repositoryDraft.trim());
      setReleases(null);
      setRepository(saved.repository);
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!release || !assetName) return;
    setBusy(true);
    try {
      await requestMonitorDeployment(program.id, { releaseId: release.id, assetName, note: note.trim() });
      notify(t("Deploy.requested"));
      onRequested();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Deploy.requestTitle" subtitle={`${program.name} · ${agentName}`} size="md" onClose={busy ? () => undefined : onClose}
      footer={<>
        <button className="btn default" type="button" disabled={busy} onClick={onClose}><LocalizedText text={"Cancel"} /></button>
        <button className="btn primary" type="button" disabled={busy || !release || !assetName} onClick={() => void submit()}>
          <Icon name="send" /><LocalizedText text={busy && repository ? "Deploy.copying" : "Deploy.sendForApproval"} />
        </button>
      </>}>
      <div className="stack">
        <div className="monitor-deployment-repo">
          <Field label="Deploy.repository" hint={canLinkRepository ? "Deploy.repositoryHint" : undefined}>
            {canLinkRepository ? (
              <div className="monitor-deployment-repo-edit">
                <input value={repositoryDraft} maxLength={100} onChange={(event) => setRepositoryDraft(event.target.value.trim())} placeholder="fts-plc-collect-data" />
                <button className="btn default" type="button" disabled={busy || repositoryDraft === repository} onClick={() => void linkRepository()}>
                  <LocalizedText text={"Deploy.link"} />
                </button>
              </div>
            ) : <span className="mono">{repository || "—"}</span>}
          </Field>
        </div>
        {!repository ? (
          <EmptyState icon="gitBranch" title="Deploy.noRepositoryTitle" message={canLinkRepository ? "Deploy.noRepositoryManage" : "Deploy.noRepositoryMessage"} />
        ) : error ? (
          <EmptyState icon="alertTriangle" title="Could not load" message={error} />
        ) : !releases ? (
          <EmptyState icon="clock" title="Loading…" message="Deploy.loadingReleases" />
        ) : releases.length === 0 ? (
          <EmptyState icon="package" title="Deploy.noReleasesTitle" message="Deploy.noReleasesMessage" />
        ) : (
          <>
            <Field label="Deploy.release">
              <select value={releaseId ?? ""} onChange={(event) => {
                const next = releases.find((item) => item.id === Number(event.target.value)) ?? null;
                setReleaseId(next?.id ?? null);
                setAssetName(next?.assets.find((asset) => asset.deployable)?.name ?? "");
              }}>
                {releases.map((item) => (
                  <option key={item.id} value={item.id}>{item.tag}{item.name && item.name !== item.tag ? ` — ${item.name}` : ""}{item.prerelease ? ` (${t("Deploy.prerelease")})` : ""}</option>
                ))}
              </select>
            </Field>
            {release ? (
              <fieldset className="monitor-deployment-assets">
                <legend><LocalizedText text={"Deploy.file"} /></legend>
                {release.assets.length === 0 ? <p className="muted"><LocalizedText text={"Deploy.noAssets"} /></p> : null}
                {release.assets.map((asset) => (
                  <label key={asset.id} className={`checkbox-row${asset.deployable ? "" : " disabled"}`}>
                    <input type="radio" name="asset" disabled={!asset.deployable} checked={assetName === asset.name} onChange={() => setAssetName(asset.name)} />
                    <span className="mono">{asset.name}</span> <span className="muted">{formatSize(asset.size)}</span>
                    {!asset.deployable ? <span className="muted"> · <LocalizedText text={"Deploy.notDeployable"} /></span> : null}
                  </label>
                ))}
              </fieldset>
            ) : null}
            <dl className="monitor-deployment-facts">
              <dt><LocalizedText text={"Deploy.version"} /></dt><dd className="mono">{currentVersion || "—"} → {release?.tag ?? "—"}</dd>
            </dl>
            <Field label="Deploy.noteOptional">
              <textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("Deploy.notePlaceholder")} />
            </Field>
            <p className="monitor-deployment-warning"><Icon name="shield" /><LocalizedText text={"Deploy.howItWorks"} /></p>
          </>
        )}
      </div>
    </Modal>
  );
}
