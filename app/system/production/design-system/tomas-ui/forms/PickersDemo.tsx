"use client";

import type { RangeValue, RowValue } from "@tomas-tc/blueprint";
import { ComboboxControl, DateRangePickerControl, IconPickerControl, Label, MultiSelectControl, OptionSelect, TimePickerControl, formatDateLabel, useUiIntl } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { DEVICE_OPTIONS, PRIORITY_OPTIONS } from "../fixtures/tomas-ui.screens";
import { TomasUiDemo } from "../TomasUiDemo";

export function PickersDemo() {
  const t = useT();
  const intl = useUiIntl();
  const [device, setDevice] = useState<string | null>("dev-1");
  const [devices, setDevices] = useState<string[]>(["dev-1", "dev-2"]);
  const [priority, setPriority] = useState<RowValue>("normal");
  const [icon, setIcon] = useState<string | null>("cpu");
  const [time, setTime] = useState<string | null>("09:30");
  const [range, setRange] = useState<RangeValue | null>({ start: "2026-11-24", end: "2026-11-28" });
  return (
    <TomasUiDemo id="pickers">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tui-combobox">ComboboxControl</Label>
          <ComboboxControl id="tui-combobox" value={device} options={DEVICE_OPTIONS} clearable placeholder={t("TUI.pickOne")} onChange={setDevice} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-multi">MultiSelectControl</Label>
          <MultiSelectControl id="tui-multi" value={devices} options={DEVICE_OPTIONS} placeholder={t("TUI.pickSome")} onChange={setDevices} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-option">OptionSelect</Label>
          <OptionSelect id="tui-option" value={priority} options={PRIORITY_OPTIONS} clearable onChange={setPriority} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-icon">IconPickerControl</Label>
          <IconPickerControl id="tui-icon" value={icon} onChange={setIcon} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-time">TimePickerControl</Label>
          <TimePickerControl id="tui-time" value={time} clearable onChange={setTime} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-range">DateRangePickerControl</Label>
          <DateRangePickerControl id="tui-range" value={range} onChange={setRange} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-combobox-off">{t("TUI.disabled")}</Label>
          <ComboboxControl id="tui-combobox-off" value="dev-3" options={DEVICE_OPTIONS} disabled onChange={setDevice} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="tui-option-invalid">{t("TUI.invalid")}</Label>
          <OptionSelect id="tui-option-invalid" value={null} options={PRIORITY_OPTIONS} required ariaInvalid placeholder={t("TUI.pickOne")} onChange={setPriority} />
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        formatDateLabel: <span className="text-foreground font-mono">{range?.start ? formatDateLabel(range.start, intl) : "-"}</span>
      </p>
    </TomasUiDemo>
  );
}
