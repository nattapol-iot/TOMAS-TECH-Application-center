import type { BlueprintPlatform, PageState, SplitRatio } from "@tomas-tc/blueprint";
import type { RowActionsLayout, RowsEditing } from "@tomas-tc/ui";
import type { CalendarRange, TomasBadgeVariant, TomasButtonSize, TomasButtonVariant, TomasDeviceRow, TomasDeviceStatus, TomasUiState } from "../types/tomas-ui.types";

export const TOMAS_UI_FRAME_DOC = "<!doctype html><html><head></head><body></body></html>";

export const TOMAS_UI_LOOKS = ["pegasus", "custom"] as const satisfies readonly BlueprintPlatform[];

export const TOMAS_UI_LOOK_LABELS: Record<BlueprintPlatform, string> = { pegasus: "TUI.lookPegasus", custom: "TUI.lookDefault" };

export const TOMAS_UI_LOOK_KEY = "iot.design-system.tomas-ui.look";

export const TOMAS_UI_LOCALES = { TH: "th", EN: "en", JP: "ja" } as const;

export const MOCK_ORIGIN = "https://sample.invalid";

export const MOCK_API_BASE = "/sample-api";

export const SAMPLE_HREF = "#sample";

export const TOMAS_BUTTON_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const satisfies readonly TomasButtonVariant[];

export const TOMAS_BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const satisfies readonly TomasButtonSize[];

export const TOMAS_ICON_BUTTON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const satisfies readonly TomasButtonSize[];

export const TOMAS_BADGE_VARIANTS = ["default", "secondary", "outline", "ghost", "destructive", "link"] as const satisfies readonly TomasBadgeVariant[];

export const TOMAS_AVATAR_SIZES = ["sm", "default", "lg"] as const;

export const TOMAS_AVATAR_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Crect width='40' height='40' fill='%232563eb'/%3E%3Ccircle cx='20' cy='16' r='7' fill='%23dbeafe'/%3E%3Cpath d='M6 38c2-8 8-12 14-12s12 4 14 12' fill='%23dbeafe'/%3E%3C/svg%3E";

export const TOMAS_LONG_NOTE =
  "Firmware 4.3 is staged on the PLC bridge. Flash it during the Friday stop, confirm the line counters resume, then export the new program and attach it to this work order before closing it.";

export const TOMAS_PEOPLE = ["NP", "PK", "KA", "SB"] as const;

export const TOMAS_PRIORITIES = [
  { value: "low", label: "DS.tuiLow" },
  { value: "high", label: "DS.tuiHigh" },
];

export const TOMAS_SELECT_GROUPS = [
  { label: "North", sites: ["Hillview Depot", "Mountain Relay", "Lakeside Pump"] },
  { label: "Central", sites: ["Riverside Plant", "City Hub", "Rail Yard", "Canal Pump"] },
  { label: "East", sites: ["Harbour Warehouse", "Dock 4", "Cold Store", "Container Yard"] },
  { label: "South", sites: ["Palm Bay Office", "Beach Relay", "Island Gateway"] },
];

export const TOMAS_DEVICE_ROWS: readonly TomasDeviceRow[] = [
  { name: "Gateway A-01", status: "online", uptime: "99.9%" },
  { name: "Sensor hub B-07", status: "online", uptime: "97.2%" },
  { name: "PLC bridge C-03", status: "offline", uptime: "71.4%" },
];

export const TOMAS_STATUS_BADGES: Record<TomasDeviceStatus, { label: string; variant: TomasBadgeVariant }> = {
  online: { label: "DS.tuiOnline", variant: "default" },
  offline: { label: "DS.tuiOffline", variant: "destructive" },
};

export const TOMAS_SKELETON_ROWS = [0, 1, 2] as const;

export const TOMAS_MENU_ITEMS = ["DS.tuiEdit", "DS.tuiDuplicate", "DS.tuiDelete"];

export const TOMAS_LOG_LINES = Array.from({ length: 24 }, (_, index) => `08:${String(index * 2).padStart(2, "0")} gateway heartbeat ok`);

export const TOMAS_COMMANDS = [
  {
    group: "Devices",
    items: [
      { label: "Open Gateway A-01", shortcut: "G A" },
      { label: "Open Sensor hub B-07", shortcut: "G B" },
    ],
  },
  {
    group: "Work orders",
    items: [
      { label: "New work order", shortcut: "N" },
      { label: "Assign to me", shortcut: "A" },
    ],
  },
];

export const TOMAS_ICON_NAMES = [
  "house",
  "cpu",
  "router",
  "wifi",
  "thermometer",
  "gauge",
  "wrench",
  "clipboard-list",
  "map-pin",
  "users",
  "bell",
  "settings",
  "power",
  "shield-check",
  "calendar",
  "not-an-icon",
] as const;

export const TOMAS_STATES: readonly TomasUiState[] = ["loaded", "loading", "empty", "error"];

export const TOMAS_TABLE_STATES: readonly TomasUiState[] = ["loaded", "loading", "empty"];

export const TOMAS_STATE_LABELS: Record<TomasUiState, string> = {
  loaded: "TUI.stateLoaded",
  loading: "TUI.stateLoading",
  empty: "TUI.stateEmpty",
  error: "TUI.stateError",
};

export const TOMAS_PER_PAGE_OPTIONS = [5, 10];

export const TOMAS_LIST_OPTIONS = { perPage: 5 };

export const TOMAS_REFRESH_SECONDS = 30;

export const TOMAS_TOAST_DELAY_MS = 1500;

export const TOMAS_SHEET_SIDES = ["right", "left", "top", "bottom"] as const;

export const TOMAS_SPLIT_RATIOS = ["1:2", "1:1", "2:1"] as const satisfies readonly SplitRatio[];

export const TOMAS_TEMPLATE = "{{code}} for {{device}}, picked {{state.picked}}";

export const TOMAS_UI_LOCALE_SAMPLES = ["th", "en", "ja"] as const;

export const ROWS_EDITING = ["inline", "panel"] as const satisfies readonly RowsEditing[];

export const ROW_ACTION_LAYOUTS = ["icons", "menu"] as const satisfies readonly RowActionsLayout[];

export const TOMAS_CALENDAR_MONTH = new Date(2026, 10, 24);

export const TOMAS_CALENDAR_RANGE: CalendarRange = { from: new Date(2026, 10, 24), to: new Date(2026, 10, 28) };

export const TOMAS_PAGE_STATE: PageState[] = [{ key: "picked", initial: "wo-3" }, { key: "tab" }];

export const TOMAS_VIEWER_ROLES = ["admin"];

export const TOMAS_DEMO_STATE: PageState[] = [{ key: "picked", initial: "wo-1" }];

export const TOMAS_ROLES: readonly string[] = ["admin", "viewer"];
