"use client";

import { Button, TooltipHint, TooltipItemText, plainTooltipText } from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TOOLTIP_ITEMS, TOOLTIP_MARKUP } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function TooltipHintDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="tooltip-hint">
      <div className="flex flex-wrap gap-2">
        <TooltipHint label={TOOLTIP_MARKUP}>
          <Button variant="outline">{t("TUI.markupHint")}</Button>
        </TooltipHint>
        <TooltipHint items={TOOLTIP_ITEMS} delayDuration={0}>
          <Button variant="outline">{t("TUI.itemsHint")}</Button>
        </TooltipHint>
      </div>
      <ul className="grid gap-1 text-sm">
        {TOOLTIP_ITEMS.map((item) => (
          <li key={item.description}>
            <TooltipItemText item={item} />
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground font-mono text-xs whitespace-pre-line">plainTooltipText: {plainTooltipText(TOOLTIP_MARKUP)}</p>
    </TomasUiDemo>
  );
}
