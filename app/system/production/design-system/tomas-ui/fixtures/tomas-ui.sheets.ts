import type { GridSuggestion, PivotPeriod, PivotSeries, TableBuilderColumn, TableBuilderRow } from "@tomas-tc/ui";
import type { GridPartRow } from "../types/tomas-ui.types";

export const PIVOT_SERIES: PivotSeries[] = [
  { key: "parts", label: "Spare parts" },
  { key: "labour", label: "Labour" },
  { key: "travel", label: "Travel" },
  { key: "credits", label: "Warranty credits", tone: "negative" },
  { key: "budget", label: "Budget", tone: "reference" },
  { key: "balance", label: "Under budget", tone: "result" },
];

export const PIVOT_PERIODS: PivotPeriod[] = [
  { key: "2026-07", label: "Jul 2026" },
  { key: "2026-08", label: "Aug 2026" },
  { key: "2026-09", label: "Sep 2026" },
  { key: "2026-10", label: "Oct 2026" },
  { key: "2026-11", label: "Nov 2026" },
];

const SPENT: Record<string, number[]> = {
  parts: [18200, 9400, 22100, 7600, 12800],
  labour: [14000, 11500, 16800, 9900, 13200],
  travel: [3200, 2100, 4700, 1800, 2600],
  credits: [-2500, 0, -4100, 0, -1200],
};

const BUDGET = [36000, 36000, 36000, 30000, 30000];

const COSTS: Record<string, number[]> = {
  ...SPENT,
  budget: BUDGET,
  balance: BUDGET.map((amount, index) => amount - Object.values(SPENT).reduce((sum, values) => sum + (values[index] ?? 0), 0)),
};

export const pivotCost = (series: string, period: string) => COSTS[series]?.[PIVOT_PERIODS.findIndex((item) => item.key === period)] ?? 0;

export const PIVOT_TOTALS: Record<string, number> = Object.fromEntries(Object.entries(COSTS).map(([key, values]) => [key, values.reduce((sum, value) => sum + value, 0)]));

export const INSPECTION_COLUMNS: TableBuilderColumn[] = [
  { id: "point", name: "Check point", type: "string" },
  { id: "pressure", name: "Pressure (bar)", type: "float" },
  { id: "count", name: "Cycle count", type: "number" },
  { id: "level", name: "Fill level (%)", type: "num-step", step: 5 },
  { id: "date", name: "Checked on", type: "date" },
  { id: "time", name: "At", type: "time" },
  { id: "photo", name: "Photo", type: "file" },
];

export const INSPECTION_ROWS: TableBuilderRow[] = [
  { point: "Pump P-01 outlet", pressure: 4.2, count: 1820, level: 85, date: "2026-11-24", time: "09:10", photo: null },
  { point: "Pump P-02 outlet", pressure: 3.9, count: 1764, level: 70, date: "2026-11-24", time: "09:25", photo: null },
];

export const PART_SUGGESTIONS: GridSuggestion[] = [
  { value: "PSU-24V", label: "24 V power supply", description: "DIN rail, 60 W" },
  { value: "RLY-8CH", label: "8-channel relay board", description: "24 V coil" },
  { value: "ANT-LTE", label: "LTE antenna", description: "SMA, 3 m cable" },
  { value: "SEN-HUM", label: "Humidity probe", description: "4 to 20 mA" },
  { value: "FUS-2A", label: "Fuse 2 A", description: "5 x 20 mm, slow blow" },
];

export const TECHNICIAN_SUGGESTIONS: GridSuggestion[] = [
  { value: "tech-1", label: "Narin Phonsri" },
  { value: "tech-2", label: "Ploy Kaewmanee" },
  { value: "tech-3", label: "Kenji Arai" },
];

export const NOTE_SNIPPETS: GridSuggestion[] = [
  { value: "Bring the old unit back for warranty.", label: "Return old unit" },
  { value: "Check torque after one week.", label: "Recheck torque" },
  { value: "Photo before and after.", label: "Photos" },
];

export const GRID_PART_ROWS: GridPartRow[] = [
  { id: "line-1", part: "24 V power supply", quantity: 2, technician: "Narin Phonsri", note: "" },
  { id: "line-2", part: "Fuse 2 A", quantity: 10, technician: "", note: "Bring the old unit back for warranty." },
];

export const GRID_KIT_ROWS: GridPartRow[] = [
  { id: "kit-1", part: "LTE antenna", quantity: 1, technician: "", note: "" },
  { id: "kit-2", part: "8-channel relay board", quantity: 1, technician: "", note: "" },
];
