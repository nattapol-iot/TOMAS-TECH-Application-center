"use client";

import {
  Button,
  Input,
  Label,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@tomas-tc/ui";
import { useT } from "../../../../i18n";
import { TomasUiDemo } from "../TomasUiDemo";

export function PopoverTooltipDemo() {
  const t = useT();
  return (
    <TomasUiDemo id="popover-tooltip">
      <div className="flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">{t("DS.tuiPopover")}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <PopoverHeader>
              <PopoverTitle>{t("TUI.alarmThreshold")}</PopoverTitle>
              <PopoverDescription>{t("DS.sampleBody")}</PopoverDescription>
            </PopoverHeader>
            <div className="grid gap-2 pt-2">
              <Label htmlFor="tui-threshold">°C</Label>
              <Input id="tui-threshold" type="number" defaultValue={-15} />
            </div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverAnchor asChild>
            <span className="rounded-md border border-dashed px-3 py-1.5 text-sm">{t("TUI.anchor")}</span>
          </PopoverAnchor>
          <PopoverTrigger asChild>
            <Button variant="ghost">{t("TUI.openAtAnchor")}</Button>
          </PopoverTrigger>
          <PopoverContent>{t("DS.sampleBody")}</PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">{t("DS.tuiTooltip")}</Button>
          </TooltipTrigger>
          <TooltipContent>{t("DS.tuiTooltipBody")}</TooltipContent>
        </Tooltip>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline">{t("TUI.instantTooltip")}</Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t("DS.tuiTooltipBody")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </TomasUiDemo>
  );
}
