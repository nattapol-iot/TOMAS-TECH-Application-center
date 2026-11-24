"use client";

import { Label, Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@tomas-tc/ui";
import { Fragment, useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_SELECT_GROUPS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function SelectDemo() {
  const t = useT();
  const [site, setSite] = useState("Riverside Plant");
  return (
    <TomasUiDemo id="select">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="tui-site">{t("TUI.site")}</Label>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger id="tui-site" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-56">
              {TOMAS_SELECT_GROUPS.map((group, index) => (
                <Fragment key={group.label}>
                  {index > 0 && <SelectSeparator />}
                  <SelectGroup>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.sites.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tui-site-sm">sm</Label>
          <Select>
            <SelectTrigger id="tui-site-sm" size="sm" className="w-full">
              <SelectValue placeholder={t("TUI.pickOne")} />
            </SelectTrigger>
            <SelectContent>
              {TOMAS_SELECT_GROUPS.map((group) => (
                <SelectItem key={group.label} value={group.label}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="tui-site-off">{t("TUI.disabled")}</Label>
          <Select disabled defaultValue="North">
            <SelectTrigger id="tui-site-off" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="North">North</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </TomasUiDemo>
  );
}
