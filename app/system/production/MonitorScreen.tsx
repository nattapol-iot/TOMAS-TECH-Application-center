"use client";

import { useState } from "react";
import { type BootstrapData } from "../api-client";
import { LocalizedText } from "../LocalizedText";
import { Icon } from "../ui";
import { FleetScreen } from "./FleetScreen";
import { SiteMonitorScreen } from "./SiteMonitorScreen";
import "./monitor-screen.css";

type MonitorTab = "sites" | "fleet";
type Notify = (message: string) => void;

export function MonitorScreen({ bootstrap, notify }: { bootstrap: BootstrapData; notify: Notify }) {
  const [tab, setTab] = useState<MonitorTab>("sites");
  return (
    <div className="monitor-wrap">
      <nav className="monitor-tabs" aria-label="Monitor views">
        <button type="button" className={`filter-chip${tab === "sites" ? " active" : ""}`}
          aria-pressed={tab === "sites"} onClick={() => setTab("sites")}>
          <Icon name="cpu" /><LocalizedText text={"Monitor.tab.sites"} />
        </button>
        <button type="button" className={`filter-chip${tab === "fleet" ? " active" : ""}`}
          aria-pressed={tab === "fleet"} onClick={() => setTab("fleet")}>
          <Icon name="table" /><LocalizedText text={"Monitor.tab.fleet"} />
        </button>
        <a className="btn default sm" href="#/command-center">
          <Icon name="maximize" /><LocalizedText text={"Command Center"} />
        </a>
      </nav>
      {tab === "sites" ? <SiteMonitorScreen bootstrap={bootstrap} notify={notify} /> : null}
      {tab === "fleet" ? <FleetScreen bootstrap={bootstrap} notify={notify} embedded /> : null}
    </div>
  );
}
