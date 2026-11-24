"use client";

import { ChartView, CrossFilterProvider, DashboardPage, EntityTable, ScreenFilterBar, StatFigureView } from "@tomas-tc/ui";
import { SAMPLE_ADAPTERS } from "../fixtures/tomas-ui.backend";
import { WORK_ORDER } from "../fixtures/tomas-ui.entities";
import { DASHBOARD_LIST_COLUMNS, OPERATIONS_DASHBOARD, OPERATIONS_FILTER_BAR } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function DashboardPageDemo() {
  const nodes = OPERATIONS_DASHBOARD.widgets.map((widget, index) =>
    widget.kind === "stat" ? (
      <StatFigureView key={index} source={widget} format={widget.format} />
    ) : widget.kind === "chart" ? (
      <div key={index} className="h-72">
        <ChartView config={widget} visualId={`dashboard-${index}`} />
      </div>
    ) : (
      <EntityTable key={index} entity={WORK_ORDER} adapters={SAMPLE_ADAPTERS} columns={DASHBOARD_LIST_COLUMNS} limit={widget.limit} />
    ),
  );
  return (
    <TomasUiDemo id="dashboard-page">
      <div className="rounded-lg border p-4">
        <CrossFilterProvider filterBar={OPERATIONS_FILTER_BAR}>
          <DashboardPage screen={OPERATIONS_DASHBOARD} nodes={nodes} toolbar={<ScreenFilterBar />} />
        </CrossFilterProvider>
      </div>
    </TomasUiDemo>
  );
}
