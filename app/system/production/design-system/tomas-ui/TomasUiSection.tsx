"use client";

import { Badge } from "@tomas-tc/ui";
import { useT } from "../../../i18n";
import { TOMAS_UI_DEMOS } from "./config/tomas-ui.coverage";
import type { TomasUiSectionProps } from "./types/tomas-ui.types";

export function TomasUiSection({ spec, children }: TomasUiSectionProps) {
  const t = useT();
  const count = TOMAS_UI_DEMOS.filter((demo) => demo.section === spec.id).reduce((sum, demo) => sum + demo.exports.length, 0);
  return (
    <section id={`tui-${spec.id}`} aria-labelledby={`tui-${spec.id}-title`} className="flex scroll-mt-16 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b pb-3">
        <div className="flex flex-col gap-1">
          <h2 id={`tui-${spec.id}-title`} className="text-xl font-semibold">
            {t(spec.title)}
          </h2>
          <p className="text-muted-foreground text-sm">{t(spec.note)}</p>
        </div>
        <Badge variant="secondary">
          {count} {t("TUI.exports")}
        </Badge>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">{children}</div>
    </section>
  );
}
