"use client";

import { EChart, toast, type ChartOption } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { ECHART_KINDS } from "../config/tomas-ui.constants";
import { PIVOT_PERIODS, pivotCost } from "../fixtures/tomas-ui.sheets";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";
import type { EChartKind } from "../types/tomas-ui.types";

const months = PIVOT_PERIODS.map((period) => period.label);

const spent = PIVOT_PERIODS.map((period) => pivotCost("parts", period.key) + pivotCost("labour", period.key) + pivotCost("travel", period.key));

const budget = PIVOT_PERIODS.map((period) => pivotCost("budget", period.key));

const OPTIONS: Record<EChartKind, ChartOption> = {
  bar: {
    tooltip: { trigger: "axis" },
    legend: {},
    grid: { left: 48, right: 16, top: 32, bottom: 24 },
    xAxis: { type: "category", data: months },
    yAxis: { type: "value" },
    series: [
      { name: "Spent", type: "bar", data: spent },
      { name: "Budget", type: "line", data: budget },
    ],
  },
  pie: {
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        data: ["parts", "labour", "travel"].map((key) => ({ name: key, value: PIVOT_PERIODS.reduce((sum, period) => sum + pivotCost(key, period.key), 0) })),
      },
    ],
  },
  gauge: { series: [{ type: "gauge", min: 0, max: 100, detail: { formatter: "{value}%" }, data: [{ value: 97.4, name: "Uptime" }] }] },
};

export function EChartDemo() {
  const t = useT();
  const [kind, setKind] = useState<EChartKind>("bar");
  return (
    <TomasUiDemo id="echart">
      <TomasUiStates options={ECHART_KINDS} value={kind} onChange={setKind} />
      <EChart option={OPTIONS[kind]} ariaLabel={t("TUI.costTrend")} className="h-64" onClick={(event) => toast(`${event.name}: ${String(event.value)}`)} />
    </TomasUiDemo>
  );
}
