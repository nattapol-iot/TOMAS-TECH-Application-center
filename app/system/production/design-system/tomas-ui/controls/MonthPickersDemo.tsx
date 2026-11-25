"use client";

import { DayOfMonthPicker, Label, MonthGrid, MonthPicker, MonthRangePicker, formatMonthLabel, useUiIntl, type MonthRange } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { TOMAS_MONTH_MAX, TOMAS_MONTH_MIN } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";

export function MonthPickersDemo() {
  const t = useT();
  const intl = useUiIntl();
  const [month, setMonth] = useState<string | null>("2026-11");
  const [range, setRange] = useState<MonthRange>({ start: "2026-06", end: "2026-11" });
  const [year, setYear] = useState(2026);
  const [picked, setPicked] = useState<string | null>("2026-08");
  const [payDay, setPayDay] = useState<number | null>(21);
  return (
    <TomasUiDemo id="month-pickers">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-month">MonthPicker</Label>
          <MonthPicker id="tui-month" value={month} min={TOMAS_MONTH_MIN} max={TOMAS_MONTH_MAX} clearable onChange={setMonth} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-month-range">MonthRangePicker</Label>
          <MonthRangePicker id="tui-month-range" value={range} min={TOMAS_MONTH_MIN} max={TOMAS_MONTH_MAX} onChange={setRange} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-pay-day">DayOfMonthPicker</Label>
          <DayOfMonthPicker id="tui-pay-day" value={payDay} hint={t("TUI.payDayHint")} onChange={setPayDay} />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="tui-month-off">{t("TUI.disabled")}</Label>
          <MonthPicker id="tui-month-off" value="2026-01" disabled onChange={setMonth} />
        </div>
      </div>
      <div className="max-w-xs rounded-lg border p-3">
        <MonthGrid year={year} start={picked} min={TOMAS_MONTH_MIN} max={TOMAS_MONTH_MAX} onYearChange={setYear} onPick={setPicked} />
      </div>
      <p className="text-muted-foreground text-sm">
        formatMonthLabel:{" "}
        <span className="text-foreground font-mono">
          {formatMonthLabel(month, intl)} / {formatMonthLabel(range.start, intl)} - {formatMonthLabel(range.end, intl)} / {formatMonthLabel(picked, intl)} / {payDay ?? "-"}
        </span>
      </p>
    </TomasUiDemo>
  );
}
