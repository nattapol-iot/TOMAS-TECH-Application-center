"use client";

import { StatFigureView } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { AVERAGE_UPTIME, COST_TREND, OPEN_ORDERS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function StatsDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="stats">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg border p-3">
          <span className="text-muted-foreground text-sm">{t("TUI.openOrders")}</span>
          <StatFigureView source={OPEN_ORDERS} format="plain" />
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-3">
          <span className="text-muted-foreground text-sm">{t("TUI.costTrend")}</span>
          <StatFigureView source={COST_TREND} format={{ currency: "THB" }} />
        </div>
        <div className="flex flex-col gap-1 rounded-lg border p-3">
          <span className="text-muted-foreground text-sm">{t("TUI.averageUptime")}</span>
          <StatFigureView source={AVERAGE_UPTIME} format="percent" />
        </div>
      </div>
    </TomasUiDemo>
  );
}
