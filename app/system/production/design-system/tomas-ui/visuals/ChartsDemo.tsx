"use client";

import { ChartView } from "@tomas-tc/ui";
import { EMPTY_CHART, SAMPLE_CHARTS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function ChartsDemo() {
  return (
    <TomasUiDemo id="charts">
      <div className="grid gap-4 md:grid-cols-2">
        {[...SAMPLE_CHARTS, EMPTY_CHART].map((config) => (
          <figure key={config.title} className="flex h-80 min-w-0 flex-col gap-2 rounded-lg border p-3">
            <figcaption className="text-sm font-medium">
              {config.title} <code className="text-muted-foreground font-mono text-xs">{config.chart}</code>
            </figcaption>
            <div className="min-h-0 flex-1">
              <ChartView config={config} visualId={`chart-${config.chart}-${config.title}`} />
            </div>
          </figure>
        ))}
      </div>
    </TomasUiDemo>
  );
}
