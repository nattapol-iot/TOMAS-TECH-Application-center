"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  NamedIcon,
  toast,
} from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_MENU_ITEMS, TOMAS_SELECT_GROUPS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function DropdownMenuDemo() {
  const t = useT();
  const [showOffline, setShowOffline] = useState(true);
  const [region, setRegion] = useState("North");
  return (
    <TomasUiDemo id="dropdown-menu">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="self-start">
            {t("DS.tuiMenu")}
            <NamedIcon name="chevron-down" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60" align="start">
          <DropdownMenuLabel>Gateway A-01</DropdownMenuLabel>
          <DropdownMenuGroup>
            {TOMAS_MENU_ITEMS.slice(0, 2).map((key, index) => (
              <DropdownMenuItem key={key} onSelect={() => toast(t(key))}>
                {t(key)}
                <DropdownMenuShortcut>Ctrl+{index + 1}</DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem disabled>{t("TUI.disabled")}</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={showOffline} onCheckedChange={setShowOffline}>
            {t("TUI.showOffline")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("TUI.region")}</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={region} onValueChange={setRegion}>
                  {TOMAS_SELECT_GROUPS.map((group) => (
                    <DropdownMenuRadioItem key={group.label} value={group.label}>
                      {group.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => toast(t("DS.tuiDelete"))}>
            {t("DS.tuiDelete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TomasUiDemo>
  );
}
