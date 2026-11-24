"use client";

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  toast,
} from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_MENU_ITEMS, TOMAS_SELECT_GROUPS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function ContextMenuDemo() {
  const t = useT();
  const [pinned, setPinned] = useState(false);
  const [region, setRegion] = useState("Central");
  return (
    <TomasUiDemo id="context-menu">
      <ContextMenu>
        <ContextMenuTrigger className="text-muted-foreground flex h-32 items-center justify-center rounded-lg border border-dashed text-sm">{t("TUI.rightClick")}</ContextMenuTrigger>
        <ContextMenuContent className="w-60">
          <ContextMenuLabel>Sensor hub B-07</ContextMenuLabel>
          <ContextMenuGroup>
            {TOMAS_MENU_ITEMS.slice(0, 2).map((key, index) => (
              <ContextMenuItem key={key} onSelect={() => toast(t(key))}>
                {t(key)}
                <ContextMenuShortcut>Alt+{index + 1}</ContextMenuShortcut>
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked={pinned} onCheckedChange={setPinned}>
            {t("TUI.pin")}
          </ContextMenuCheckboxItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>{t("TUI.region")}</ContextMenuSubTrigger>
            <ContextMenuPortal>
              <ContextMenuSubContent>
                <ContextMenuRadioGroup value={region} onValueChange={setRegion}>
                  {TOMAS_SELECT_GROUPS.map((group) => (
                    <ContextMenuRadioItem key={group.label} value={group.label}>
                      {group.label}
                    </ContextMenuRadioItem>
                  ))}
                </ContextMenuRadioGroup>
              </ContextMenuSubContent>
            </ContextMenuPortal>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" inset onSelect={() => toast(t("DS.tuiDelete"))}>
            {t("DS.tuiDelete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </TomasUiDemo>
  );
}
