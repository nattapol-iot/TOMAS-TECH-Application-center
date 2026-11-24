"use client";

import { AnalyticsProvider, Badge, ChartView, RefreshContext, StatFigureView, useAnalytics, useEntityData } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOMAS_REFRESH_SECONDS } from "../config/tomas-ui.constants";
import { SAMPLE_ADAPTERS, SERVER_ANALYTICS } from "../fixtures/tomas-ui.backend";
import { DEVICE } from "../fixtures/tomas-ui.entities";
import { SERVER_CHART, SERVER_COUNT } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function AnalyticsSourcesDemo() {
  const t = useT();
  const view = useAnalytics().useView(DEVICE.key);
  const devices = useEntityData(DEVICE, SAMPLE_ADAPTERS);
  return (
    <TomasUiDemo id="analytics-sources">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="font-mono">rowsAnalyticsSource + useAnalytics</dt>
        <dd>
          <Badge variant={view.loaded ? "default" : "outline"}>{view.loaded ? t("TUI.stateLoaded") : t("TUI.stateLoading")}</Badge> {view.entity?.label}
        </dd>
        <dt className="font-mono">useEntityData</dt>
        <dd>
          {devices ? devices.rows.length : "..."} {t("TUI.devices")}
        </dd>
      </dl>
      <p className="text-muted-foreground text-sm">{t("TUI.serverNote")}</p>
      <AnalyticsProvider source={SERVER_ANALYTICS}>
        <RefreshContext.Provider value={TOMAS_REFRESH_SECONDS}>
          <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="rounded-lg border p-3">
              <StatFigureView source={SERVER_COUNT} format="plain" />
            </div>
            <div className="h-64 min-w-0 rounded-lg border p-3">
              <ChartView config={SERVER_CHART} visualId="server-status" />
            </div>
          </div>
        </RefreshContext.Provider>
      </AnalyticsProvider>
    </TomasUiDemo>
  );
}
