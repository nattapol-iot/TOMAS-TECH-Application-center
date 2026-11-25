"use client";

import { useState } from "react";
import { type BootstrapData } from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { useT } from "../i18n";
import { Icon } from "../ui";
import { FleetScreen } from "./FleetScreen";
import { SiteMonitorScreen } from "./SiteMonitorScreen";
import "./monitor-screen.css";

type MonitorTab = "sites" | "fleet";
type Notify = (message: string) => void;

export function MonitorScreen({ bootstrap, notify }: { bootstrap: BootstrapData; notify: Notify }) {
  const [tab, setTab] = useState<MonitorTab>("sites");
  const t = useT();
  return (
    <div className="monitor-wrap">
      <nav className="monitor-tabs" aria-label={t("Monitor.views")}>
        <button type="button" className={`filter-chip${tab === "sites" ? " active" : ""}`} data-tab="sites" aria-pressed={tab === "sites"} onClick={() => setTab("sites")}>
          <Icon name="cpu" />
          <LocalizedText text={"Monitor.tab.sites"} />
        </button>
        <button type="button" className={`filter-chip${tab === "fleet" ? " active" : ""}`} data-tab="fleet" data-guide="monitor.fleet" aria-pressed={tab === "fleet"} onClick={() => setTab("fleet")}>
          <Icon name="table" />
          <LocalizedText text={"Monitor.tab.fleet"} />
        </button>
        <a className="btn default sm" href="#/command-center" data-guide="monitor.commandCenter">
          <Icon name="maximize" />
          <LocalizedText text={"Command Center"} />
        </a>
      </nav>
      {tab === "sites" ? <SiteMonitorScreen bootstrap={bootstrap} notify={notify} /> : null}
      {tab === "fleet" ? <FleetScreen bootstrap={bootstrap} notify={notify} embedded /> : null}
    </div>
  );
}
