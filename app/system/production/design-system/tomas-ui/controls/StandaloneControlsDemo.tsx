"use client";

import type { RangeValue } from "@tomas-tc/blueprint";
import { ColorPickerControl, ColorSwatch, DatePickerControl, DateTimePickerControl, Label, NumberControl, TimeRangePickerControl, YearPickerControl } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_SWATCHES } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function StandaloneControlsDemo() {
  const t = useT();
  const [quantity, setQuantity] = useState<number | null>(12);
  const [due, setDue] = useState<string | null>("2026-11-28");
  const [reported, setReported] = useState<string | null>("2026-11-25T09:30");
  const [shift, setShift] = useState<RangeValue | null>({ start: "08:00", end: "17:00" });
  const [year, setYear] = useState<number | null>(2026);
  const [color, setColor] = useState<string | null>("#2563eb");
  return (
    <TomasUiDemo id="standalone-controls">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-number">NumberControl</Label>
          <NumberControl id="tui-number" value={quantity} min={0} max={500} stepper onChange={setQuantity} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-date">DatePickerControl</Label>
          <DatePickerControl id="tui-date" value={due} min="2026-11-01" max="2026-12-31" onChange={setDue} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-date-time">DateTimePickerControl</Label>
          <DateTimePickerControl id="tui-date-time" value={reported} onChange={setReported} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-time-range">TimeRangePickerControl</Label>
          <TimeRangePickerControl id="tui-time-range" value={shift} hint={t("TUI.shiftHint")} onChange={setShift} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-year">YearPickerControl</Label>
          <YearPickerControl id="tui-year" value={year} min={2020} max={2030} prefix="FY" onChange={setYear} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-color">ColorPickerControl</Label>
          <ColorPickerControl id="tui-color" value={color} onChange={setColor} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-number-off">{t("TUI.disabled")}</Label>
          <NumberControl id="tui-number-off" value={3.5} decimals={1} disabled onChange={setQuantity} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-date-invalid">{t("TUI.invalid")}</Label>
          <DatePickerControl id="tui-date-invalid" value={null} ariaInvalid placeholder={t("TUI.pickOne")} onChange={setDue} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        ColorSwatch:
        {[color, ...TOMAS_SWATCHES].map((swatch, index) => (
          <span key={`${swatch}-${index}`} className="flex items-center gap-1.5 font-mono text-xs">
            <ColorSwatch value={swatch} />
            {swatch ?? "null"}
          </span>
        ))}
      </div>
    </TomasUiDemo>
  );
}
