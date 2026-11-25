"use client";

import { Button, EmptyState, Label, LoadingOverlay, NamedIcon, Notice, Switch } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_DEVICE_ROWS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function StatesDemo() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [compact, setCompact] = useState(false);
  return (
    <TomasUiDemo id="states">
      <Notice tone="error" message={t("TUI.noticeError")} />
      <Notice tone="warning" message={t("TUI.noticeWarning")} />
      <Notice tone="info">
        {t("TUI.noticeInfo")} <code className="font-mono">GW-A01</code>
      </Notice>
      <EmptyState>
        <NamedIcon name="router" className="mx-auto mb-2 size-6" />
        {t("DS.emptyTitle")}
      </EmptyState>
      <div className="flex flex-wrap items-center gap-4">
        <Label>
          <Switch checked={loading} onCheckedChange={setLoading} />
          LoadingOverlay
        </Label>
        <Label>
          <Switch checked={compact} onCheckedChange={setCompact} />
          compact
        </Label>
      </div>
      <div className="relative rounded-lg border p-3">
        <ul className="grid gap-1 text-sm">
          {TOMAS_DEVICE_ROWS.map((row) => (
            <li key={row.name} className="flex justify-between">
              {row.name}
              <span className="text-muted-foreground">{row.uptime}</span>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="outline" className="mt-2">
          {t("TUI.open")}
        </Button>
        {loading && <LoadingOverlay label={t("TUI.stateLoading")} compact={compact} />}
      </div>
    </TomasUiDemo>
  );
}
