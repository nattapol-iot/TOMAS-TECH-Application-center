"use client";

import { AnalyticsSourcesDemo } from "./AnalyticsSourcesDemo";
import { ChartsDemo } from "./ChartsDemo";
import { CrossFilterDemo } from "./CrossFilterDemo";
import { EChartDemo } from "./EChartDemo";
import { ImagesDemo } from "./ImagesDemo";
import { StatsDemo } from "./StatsDemo";

export function VisualsSection() {
  return (
    <>
      <ChartsDemo />
      <StatsDemo />
      <CrossFilterDemo />
      <AnalyticsSourcesDemo />
      <EChartDemo />
      <ImagesDemo />
    </>
  );
}
