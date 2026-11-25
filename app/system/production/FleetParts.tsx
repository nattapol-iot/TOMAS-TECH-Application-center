"use client";

import type { MonitorAgent } from "../api-client";
import { useT } from "../i18n";
import { Badge, Progress } from "../ui";
import { DESK_TONE, deskState } from "./fleet-model";
import "./fleet.css";

/** A machine's TMTDesk at a glance: state, version and active sessions, with the details in the tooltip. */
export function TmtdeskChip({ agent, compact }: { agent: Pick<MonitorAgent, "isOnline" | "tmtdesk">; compact?: boolean }) {
  const t = useT();
  const state = deskState(agent);
  const desk = agent.tmtdesk;
  const details = desk
    ? [
        `${t("Fleet.desk.health")}: ${desk.health}`,
        desk.mode ? `${t("Fleet.desk.mode")}: ${desk.mode}` : "",
        desk.captureMethod ? `${t("Fleet.desk.capture")}: ${desk.captureMethod}` : "",
        `${t("Fleet.desk.helper")}: ${t(desk.helperRunning ? "Fleet.desk.yes" : "Fleet.desk.no")}`,
        desk.rendezvous ? `${t("Fleet.desk.rendezvous")}: ${desk.rendezvous}` : "",
      ].filter(Boolean).join("\n")
    : t("Fleet.desk.noneHint");
  return (
    <span className="fleet-desk" title={details}>
      <Badge tone={DESK_TONE[state]} dot>{`Fleet.desk.${state}`}</Badge>
      {desk && !compact ? (
        <span className="fleet-desk-meta">
          {desk.version ? <span className="mono">v{desk.version}</span> : null}
          {desk.activeSessions > 0 ? <span className="fleet-desk-sessions">{desk.activeSessions} {t("Fleet.desk.sessions")}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

/** A percentage with its bar; amber from 75 % (80 % for disk), red from 90 %. */
export function LoadMeter({ value, warnAt = 75, label }: { value: number | null; warnAt?: number; label?: string }) {
  if (value === null) return <span className="muted">—</span>;
  return (
    <div className="fleet-meter" title={label}>
      <Progress value={value} tone={value >= 90 ? "red" : value >= warnAt ? "amber" : "blue"} />
      <span>{value}%</span>
    </div>
  );
}
