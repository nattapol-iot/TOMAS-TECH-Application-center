import type { BlueprintPlatform, PageState, SplitRatio } from "@tomas-tc/blueprint";
import type { DiagnosticsOptions, RowActionsLayout, RowsEditing, StepperOrientation, StoredFile, TextToken, TooltipItem } from "@tomas-tc/ui";
import type { Place } from "@tomas-tc/ui/route-map";
import type {
  ApprovalStep,
  CalendarRange,
  CompactSample,
  DeviceRegistration,
  DraftNote,
  EChartKind,
  FakeFailure,
  FileSampleKind,
  PageActionCount,
  TomasBadgeVariant,
  TomasButtonSize,
  TomasButtonVariant,
  TomasDeviceRow,
  TomasDeviceStatus,
  TomasUiState,
} from "../types/tomas-ui.types";

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

export const FAKE_LATENCY_MS = 400;

export const FAKE_PAGE_SIZE = 20;

export const FULL_SITE = "site-1";

export const DEVICE_CODE_PATTERN = "[A-Z]{2,3}-[A-Z0-9]{2,4}";

export const NEW_DEVICE: DeviceRegistration = { code: "GW-A01", email: "ploy@vendor.test", site: FULL_SITE };

export const FORM_DRAFT_KEY = "iot.design-system.tomas-ui.draft.note";

export const DIALOG_DRAFT_KEY = "iot.design-system.tomas-ui.draft.reply";

export const REASON_DRAFT_KEY = "iot.design-system.tomas-ui.draft.reason";

export const DRAFT_SCOPE = "wo-3";

export const EMPTY_DRAFT_NOTE: DraftNote = { title: "", body: "" };

export const TOMAS_MONTH_MIN = "2025-01";

export const TOMAS_MONTH_MAX = "2026-12";

export const TOMAS_SWATCHES: readonly (string | null)[] = ["#16a34a", "#dc2626", "#f59e0b", "not-a-colour", null];

export const TOMAS_MESSAGE = "Hi {{technician}}, work order {{code}} at {{site}} is due {{due}}.";

export const MESSAGE_TOKENS: TextToken[] = [
  { key: "technician", label: "Technician" },
  { key: "code", label: "Work order" },
  { key: "site", label: "Site", repeatable: true },
  { key: "due", label: "Due date" },
];

export const MESSAGE_TOKEN_VALUES: Record<string, string> = { technician: "Ploy", code: "WO-0103", site: "Hillview Depot", due: "28 Nov 2026" };

export const STORED_FILES: StoredFile[] = [
  { name: "panel-wiring.pdf", size: 48213 },
  { name: "site-photo.jpg", size: 182400 },
];

export const PIVOT_STORAGE_KEY = "iot.design-system.tomas-ui.pivot";

export const COMPACT_SAMPLES: readonly CompactSample[] = [
  { value: 950 },
  { value: 12500, money: true },
  { value: 1250000, money: true },
  { value: 3200000000 },
  { value: "4500.5", suffix: " kWh" },
  { value: null },
];

export const METER_STEP = 10;

export const APPROVAL_FLOW: readonly ApprovalStep[] = [
  { value: "draft", label: "TUI.stepDraft", at: "2026-11-20T09:12" },
  { value: "review", label: "TUI.stepReview", at: "2026-11-21T14:30" },
  { value: "approval", label: "TUI.stepApproval", at: "2026-11-24T10:05" },
  { value: "ordered", label: "TUI.stepOrdered", at: "2026-11-25T08:40" },
];

export const APPROVAL_PEOPLE: readonly string[] = ["Narin Phonsri", "สมชาย บุญมี", "新井 健二", "Ploy Kaewmanee"];

export const STEPPER_ORIENTATIONS = ["horizontal", "vertical"] as const satisfies readonly StepperOrientation[];

export const REPORT_PAGE_COUNT = 12;

export const SAMPLE_LINK = "https://www.openstreetmap.org/?mlat=13.7246&mlon=100.5139";

export const PAGE_ACTION_COUNTS = ["none", "one", "many"] as const satisfies readonly PageActionCount[];

export const PAGE_ACTION_COUNT_LABELS: Record<PageActionCount, string> = { none: "TUI.noActions", one: "TUI.oneAction", many: "TUI.manyActions" };

export const ECHART_KINDS = ["bar", "pie", "gauge"] as const satisfies readonly EChartKind[];

export const SITE_IMAGE =
  "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 90'%3E%3Crect width='160' height='90' fill='%23bfdbfe'/%3E%3Crect y='60' width='160' height='30' fill='%2386efac'/%3E%3Crect x='24' y='30' width='48' height='34' fill='%231d4ed8'/%3E%3Crect x='84' y='40' width='52' height='24' fill='%232563eb'/%3E%3Crect x='96' y='18' width='8' height='22' fill='%2364748b'/%3E%3C/svg%3E";

export const BROKEN_IMAGE = "data:image/png;base64,AAAA";

export const AUTO_CLOSE_MS = 3000;

export const FAKE_FAILURES_SHOWN = ["validation", "server", "gateway"] as const satisfies readonly FakeFailure[];

export const FAKE_FAILURE_LABELS: Record<FakeFailure, string> = { validation: "TUI.failValidation", server: "TUI.failServer", gateway: "TUI.failGateway" };

export const DIAGNOSTICS_OPTIONS: DiagnosticsOptions = { appVersion: "design-system", page: () => "System > Design System > @tomas-tc/ui" };

export const SAMPLE_FETCH_URL = "data:application/json,%7B%22ok%22%3Atrue%7D";

export const REASON_RECORDS = ["wo-3"];

export const TYPED_WORD = "delete";

export const TOOLTIP_MARKUP = "**Uptime** share of the last 30 days the gateway answered\n- **Online** answered in the last 5 minutes\n- **Offline** silent for longer";

export const TOOLTIP_ITEMS: TooltipItem[] = [
  { term: "GW-A01", description: "99.9% uptime", tone: "success" },
  { term: "CAM-D02", description: "offline since 06:10", tone: "danger", details: [{ description: "Last frame at 06:09" }, { description: "Power check booked" }] },
  { description: "Sensor hub B-07 at 97.2%" },
];

export const SLIP_LINE_STEP = 16;

export const PDF_PAGE_COUNT = 5;

export const FILE_SAMPLE_KINDS = ["pdf", "docx", "xlsx", "csv", "md", "image", "text", "blob"] as const satisfies readonly FileSampleKind[];

export const MAP_PLACES: readonly Place[] = [
  { name: "Riverside Plant", detail: "Bang Kho Laem, Bangkok", point: { lat: 13.6935, lng: 100.5031 } },
  { name: "Harbour Warehouse", detail: "Laem Chabang, Chonburi", point: { lat: 13.0827, lng: 100.9171 } },
  { name: "Hillview Depot", detail: "Mueang, Chiang Mai", point: { lat: 18.7883, lng: 98.9853 } },
  { name: "Palm Bay Office", detail: "Mueang, Phuket", point: { lat: 7.8804, lng: 98.3923 } },
];

export const PLACE_LINK_POINT = /(?:@|[?&](?:q|query|ll)=)(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/;
