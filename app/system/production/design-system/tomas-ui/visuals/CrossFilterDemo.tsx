"use client";

import { ChartView, CrossFilterProvider, ScreenFilterBar, StatFigureView } from "@tomas-tc/ui";
import { BY_STATUS, OPEN_ORDERS, OPERATIONS_FILTER_BAR } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";
import { CrossFilterPicker } from "./CrossFilterPicker";

export function CrossFilterDemo() {
  return (
    <TomasUiDemo id="cross-filter">
      <CrossFilterProvider filterBar={OPERATIONS_FILTER_BAR}>
        <ScreenFilterBar />
        <CrossFilterPicker />
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="rounded-lg border p-3">
            <StatFigureView source={OPEN_ORDERS} format="plain" />
          </div>
          <div className="h-64 min-w-0 rounded-lg border p-3">
            <ChartView config={BY_STATUS} visualId="cross-filter-status" />
          </div>
        </div>
      </CrossFilterProvider>
    </TomasUiDemo>
  );
}
