"use client";

import { AnalyticsSourcesDemo } from "./AnalyticsSourcesDemo";
import { ChartsDemo } from "./ChartsDemo";
import { CrossFilterDemo } from "./CrossFilterDemo";
import { StatsDemo } from "./StatsDemo";

export function VisualsSection() {
  return (
    <>
      <ChartsDemo />
      <StatsDemo />
      <CrossFilterDemo />
      <AnalyticsSourcesDemo />
    </>
  );
}
