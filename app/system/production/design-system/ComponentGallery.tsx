"use client";

import { Avatar, Badge, BarChart, EmptyState, ICON_NAMES, Icon, KpiCard, Panel, Person, Pill, Progress, ProgressCell, StatusLegend, SummaryTile } from "../../ui";
import { BAR_SAMPLE, BUTTON_SIZES, BUTTON_VARIANTS, LEGEND_SAMPLE, PROGRESS_SAMPLES, TONES } from "./config/design-system.constants";
import { ControlsDemo } from "./ControlsDemo";
import { OverlayDemo } from "./OverlayDemo";

export function ComponentGallery() {
  return (
    <div className="ds-stack">
      <Panel title="DS.buttons" subtitle={`className="btn <variant> [sm|big]"`}>
        <div className="ds-row">
          {BUTTON_VARIANTS.map((variant) => (
            <button key={variant} type="button" className={`btn ${variant}`}>
              {variant}
            </button>
          ))}
        </div>
        <div className="ds-row">
          {BUTTON_SIZES.map((size) => (
            <button key={size} type="button" className={`btn default ${size}`}>
              {size}
            </button>
          ))}
          <button type="button" className="btn primary" disabled>
            disabled
          </button>
          <button type="button" className="icon-btn" aria-label="icon-btn">
            <Icon name="settings" />
          </button>
        </div>
      </Panel>

      <Panel title="DS.badges" subtitle="Badge, Pill, Avatar, Person">
        <div className="ds-row">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
          {TONES.map((tone) => (
            <Badge key={`dot-${tone}`} tone={tone} dot>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="ds-row">
          {TONES.map((tone) => (
            <Pill key={tone} tone={tone}>
              {tone}
            </Pill>
          ))}
          <Avatar initials="TT" name="Tomas Tech" />
          <Avatar initials="TT" name="Tomas Tech" size="md" />
          <Person initials="TT" name="Tomas Tech" />
        </div>
      </Panel>

      <Panel title="DS.cards" subtitle="KpiCard, SummaryTile, Progress">
        <div className="kpi-grid">
          <KpiCard label="DS.kpiOpen" value={42} note="DS.kpiNote" tone="blue" icon="folder" />
          <KpiCard label="DS.kpiDone" value={128} tone="green" icon="checkCircle" />
          <KpiCard label="DS.kpiLate" value={7} tone="amber" icon="clock" />
          <KpiCard label="DS.kpiBlocked" value={2} tone="red" icon="alertTriangle" />
        </div>
        <div className="ds-row">
          <SummaryTile label="DS.kpiOpen" value="42" note="DS.kpiNote" />
          <SummaryTile label="DS.kpiDone" value="128" strong tone="green" />
        </div>
        <div className="ds-row">
          {PROGRESS_SAMPLES.map((value) => (
            <span key={value} className="ds-progress">
              <Progress value={value} />
            </span>
          ))}
          <ProgressCell value={64} />
        </div>
      </Panel>

      <ControlsDemo />

      <Panel title="DS.dataDisplay" subtitle="BarChart, StatusLegend, EmptyState">
        <BarChart data={BAR_SAMPLE} />
        <StatusLegend items={LEGEND_SAMPLE} />
        <EmptyState icon="inbox" title="DS.emptyTitle" message="DS.emptyMessage" />
      </Panel>

      <OverlayDemo />

      <Panel title="DS.icons" subtitle={`${ICON_NAMES.length}`}>
        <div className="ds-icons">
          {ICON_NAMES.map((name) => (
            <span key={name} className="ds-icon">
              <Icon name={name} />
              <code>{name}</code>
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
