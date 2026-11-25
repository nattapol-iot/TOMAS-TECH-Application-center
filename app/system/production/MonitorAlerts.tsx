"use client";

import { useEffect, useState } from "react";
import {
  getMonitorAlertChannels, saveMonitorAlertChannel, testMonitorAlertChannel,
  type MonitorAlertChannel, type MonitorAlertChannelName,
} from "../api-client";
import { localeFor, useLanguage, useT } from "../i18n";
import { LocalizedText } from "../LocalizedText";
import { Badge, EmptyState, Field, Icon, Modal, Panel } from "../ui";

/**
 * A site's LINE and Microsoft Teams alert channels (Site Monitor, monitor.manage). Incidents still email the responsible
 * people; these channels hear the same open, escalation and resolve messages. The token and the webhook URL are written
 * once and never shown again: the server keeps them encrypted and only returns their last characters.
 */
type Notify = (message: string) => void;

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function AlertChannelsPanel({ siteId, notify }: { siteId: number; notify: Notify }) {
  const t = useT();
  const { lang } = useLanguage();
  const [channels, setChannels] = useState<MonitorAlertChannel[] | null>(null);
  const [vault, setVault] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState<MonitorAlertChannel | null>(null);
  const [testing, setTesting] = useState<MonitorAlertChannelName | null>(null);
  const format = new Intl.DateTimeFormat(localeFor(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    let active = true;
    getMonitorAlertChannels(siteId)
      .then((result) => { if (active) { setChannels(result.channels); setVault(result.vaultConfigured); setError(null); } })
      .catch((reason: unknown) => { if (active) setError(errorText(reason)); });
    return () => { active = false; };
  }, [siteId, tick]);

  const test = async (channel: MonitorAlertChannelName) => {
    setTesting(channel);
    try {
      await testMonitorAlertChannel(siteId, channel);
      notify(t("Alerts.testSent"));
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setTesting(null);
      setTick((value) => value + 1);
    }
  };

  return (
    <Panel guide="mon.alerts" title="Alerts.title" subtitle="Alerts.subtitle" flush>
      {error && !channels ? <EmptyState icon="alertTriangle" title="Could not load" message={error} /> : !channels ? (
        <EmptyState icon="clock" title="Loading…" message="Alerts.loading" />
      ) : (
        <>
          {!vault ? <p className="site-monitor-stale" role="note"><Icon name="alertTriangle" /><LocalizedText text={"Alerts.noVault"} /></p> : null}
          <ul className="site-monitor-list">
            {channels.map((channel) => (
              <li key={channel.channel}>
                <div>
                  <strong>{channel.channel === "Line" ? "LINE" : "Microsoft Teams"}</strong>
                  <span>
                    {channel.configured
                      ? `${t(channel.enabled ? "Alerts.on" : "Alerts.off")} · …${channel.secretHint}${channel.target ? ` · ${channel.target.slice(0, 6)}…` : ""}`
                      : t("Alerts.notSet")}
                  </span>
                  {channel.lastError ? <span className="site-monitor-alert" title={channel.lastError}>{t("Alerts.lastError")}: {channel.lastError}</span>
                    : channel.lastSentAt ? <span className="muted">{t("Alerts.lastSent")} {format.format(new Date(channel.lastSentAt))}</span> : null}
                </div>
                <div className="site-monitor-actions">
                  {channel.configured ? (
                    <button className="btn default sm" type="button" disabled={testing !== null} onClick={() => void test(channel.channel)} data-guide={`mon.alerts.test.${channel.channel}`}>
                      <Icon name="send" /><LocalizedText text={testing === channel.channel ? "Monitor.working" : "Alerts.test"} />
                    </button>
                  ) : null}
                  <button className="btn default sm" type="button" disabled={!vault} onClick={() => setEditing(channel)}>
                    <Icon name={channel.configured ? "edit" : "plus"} /><LocalizedText text={channel.configured ? "Edit" : "Alerts.setUp"} />
                  </button>
                </div>
                {channel.configured ? <Badge tone={channel.lastError ? "red" : channel.enabled ? "green" : "slate"} dot>{channel.lastError ? "Alerts.failing" : channel.enabled ? "Alerts.on" : "Alerts.off"}</Badge> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {editing ? (
        <AlertChannelModal siteId={siteId} channel={editing} notify={notify} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setTick((value) => value + 1); notify(t("Alerts.saved")); }} />
      ) : null}
    </Panel>
  );
}

function AlertChannelModal({ siteId, channel, notify, onClose, onSaved }: {
  siteId: number; channel: MonitorAlertChannel; notify: Notify; onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const line = channel.channel === "Line";
  const [enabled, setEnabled] = useState(channel.configured ? channel.enabled : true);
  const [target, setTarget] = useState(channel.target);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = line && !/^[UCR][0-9a-f]{32}$/.test(target.trim()) ? "Alerts.validation.lineTarget"
    : !channel.configured && !secret.trim() ? (line ? "Alerts.validation.lineToken" : "Alerts.validation.teamsUrl")
    : !line && secret.trim() && !/^https:\/\//i.test(secret.trim()) ? "Alerts.validation.teamsUrl"
    : null;

  const save = async (remove = false) => {
    setBusy(true);
    try {
      await saveMonitorAlertChannel(siteId, channel.channel, remove ? { enabled: false, remove: true } : {
        enabled, ...(line ? { target: target.trim() } : {}), ...(secret.trim() ? { secret: secret.trim() } : {}),
      });
      onSaved();
    } catch (reason) {
      notify(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={line ? "Alerts.lineTitle" : "Alerts.teamsTitle"} subtitle={line ? "Alerts.lineHint" : "Alerts.teamsHint"} size="md" onClose={onClose} footer={<>
      {problem ? <span className="site-monitor-hint"><LocalizedText text={problem} /></span> : null}
      {channel.configured ? <button className="btn danger" type="button" disabled={busy} onClick={() => void save(true)}><LocalizedText text={"Alerts.remove"} /></button> : null}
      <button className="btn default" type="button" onClick={onClose}><LocalizedText text={"Cancel"} /></button>
      <button className="btn primary" type="button" disabled={busy || problem !== null} onClick={() => void save()}><LocalizedText text={busy ? "Monitor.working" : "Save"} /></button>
    </>}>
      <div className="form-grid two">
        {line ? (
          <Field label="Alerts.lineTarget" hint="Alerts.lineTargetHint" span={2}>
            <input value={target} maxLength={33} onChange={(event) => setTarget(event.target.value)} placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="mono" autoComplete="off" />
          </Field>
        ) : null}
        <Field label={line ? "Alerts.lineToken" : "Alerts.teamsUrl"} hint={channel.configured ? "Alerts.secretKeep" : "Alerts.secretOnce"} span={2}>
          <input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="off" spellCheck={false}
            placeholder={channel.configured ? `…${channel.secretHint}` : line ? t("Alerts.lineTokenPlaceholder") : "https://…webhook.office.com/…"} />
        </Field>
        <Field label="Alerts.enabled" span={2}>
          <label className="site-monitor-check">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <LocalizedText text={"Alerts.enabledHint"} />
          </label>
        </Field>
      </div>
    </Modal>
  );
}
