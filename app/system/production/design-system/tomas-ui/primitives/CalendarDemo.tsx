"use client";

import { Calendar, CalendarDayButton } from "@tomas-tc/ui";
import { useState } from "react";
import { TOMAS_CALENDAR_MONTH, TOMAS_CALENDAR_RANGE } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import type { CalendarRange } from "../types/tomas-ui.types";

export function CalendarDemo() {
  const [day, setDay] = useState<Date | undefined>(TOMAS_CALENDAR_MONTH);
  const [range, setRange] = useState<CalendarRange | undefined>(TOMAS_CALENDAR_RANGE);
  return (
    <TomasUiDemo id="calendar">
      <div className="flex flex-wrap gap-4">
        <Calendar mode="single" selected={day} onSelect={setDay} defaultMonth={TOMAS_CALENDAR_MONTH} className="rounded-md border" components={{ DayButton: CalendarDayButton }} />
        <Calendar mode="range" selected={range} onSelect={setRange} defaultMonth={TOMAS_CALENDAR_MONTH} captionLayout="dropdown" className="rounded-md border" />
      </div>
    </TomasUiDemo>
  );
}
