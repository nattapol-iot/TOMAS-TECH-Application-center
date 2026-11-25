"use client";

import { Button, CompactNumber, DOT_FILL, DotRating, Meter, SummaryBar, cn, formatCompact, formatExact, isCompacted, toNumber, useUiIntl } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { COMPACT_SAMPLES, METER_STEP } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { ClassTable } from "../utilities/ClassTable";

export function NumbersDemo() {
  const t = useT();
  const intl = useUiIntl();
  const [rating, setRating] = useState<number | null>(4);
  const [load, setLoad] = useState(72);
  const typed = toNumber("1250000.5");
  return (
    <TomasUiDemo id="numbers">
      <SummaryBar
        items={[
          { label: t("TUI.openOrders"), value: "12", hint: "+3", note: t("TUI.sinceMonday") },
          { label: t("TUI.costTrend"), value: formatCompact(184300, intl), average: formatCompact(36860, intl) },
          { label: t("TUI.averageUptime"), value: "97.4%", tone: "text-emerald-600" },
          { label: t("TUI.overdue"), value: "2", tone: "text-destructive" },
        ]}
      />
      <div className="flex flex-wrap items-baseline gap-4 text-sm">
        {COMPACT_SAMPLES.map((sample) => (
          <span key={String(sample.value)} className="flex flex-col">
            <CompactNumber value={sample.value} money={sample.money} suffix={sample.suffix} className="text-base font-semibold" />
            <span className="text-muted-foreground font-mono text-xs">{String(sample.value)}</span>
          </span>
        ))}
      </div>
      <ClassTable
        rows={[
          ['toNumber("1250000.5")', String(typed)],
          ["formatCompact", typed === null ? "-" : formatCompact(typed, intl)],
          ["formatExact", typed === null ? "-" : formatExact(typed, intl, 2)],
          ["isCompacted(950)", String(isCompacted(950))],
          ["isCompacted(1250000)", String(isCompacted(1250000))],
        ]}
      />
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{t("TUI.technicianRating")}</span>
          <DotRating value={rating} ghost={3} label={t("TUI.technicianRating")} onChange={setRating} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{t("TUI.readOnly")}</span>
          <DotRating value={2} readOnly label={t("TUI.readOnly")} />
        </div>
        <div className="flex items-center gap-1" aria-label="DOT_FILL">
          {Object.entries(DOT_FILL).map(([level, fill]) => (
            <span key={level} title={level} className={cn("size-4 rounded-full border", fill)} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Meter value={load} max={100} marker={85} label={`${t("TUI.gatewayLoad")} ${load}%`} />
        <Meter value={36} max={50} tone="success" label={t("TUI.partsInStock")} />
        <Meter value={8} max={10} tone="secondary" />
        <div className="flex gap-2">
          <Button size="xs" variant="outline" onClick={() => setLoad(Math.max(0, load - METER_STEP))}>
            -{METER_STEP}
          </Button>
          <Button size="xs" variant="outline" onClick={() => setLoad(Math.min(100, load + METER_STEP))}>
            +{METER_STEP}
          </Button>
        </div>
      </div>
    </TomasUiDemo>
  );
}
