"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tomas-tc/ui";
import { useT } from "../../i18n";
import { TOMAS_MENU_ITEMS } from "./config/design-system.constants";
import { TomasUiSection } from "./TomasUiSection";

export function TomasUiOverlays() {
  const t = useT();
  return (
    <TomasUiSection title="DS.tuiOverlays">
      <div className="flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("DS.sampleDialog")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("DS.sampleDialog")}</DialogTitle>
              <DialogDescription>{t("DS.sampleBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button>{t("Close")}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">{t("DS.tuiPopover")}</Button>
          </PopoverTrigger>
          <PopoverContent>{t("DS.sampleBody")}</PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">{t("DS.tuiMenu")}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {TOMAS_MENU_ITEMS.map((key) => (
              <DropdownMenuItem key={key}>{t(key)}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost">{t("DS.tuiTooltip")}</Button>
          </TooltipTrigger>
          <TooltipContent>{t("DS.tuiTooltipBody")}</TooltipContent>
        </Tooltip>
      </div>
    </TomasUiSection>
  );
}
