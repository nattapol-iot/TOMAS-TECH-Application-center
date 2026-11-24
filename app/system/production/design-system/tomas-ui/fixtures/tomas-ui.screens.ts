import type { BlockStyle, ChartConfig, CreateButtonAction, DashboardScreen, Entity, Field, FilterBar, FormRowsSection, FormScreen, ListScreen, MediaHint, RepeatColumnHead, Row, RowValues, StatSource, WriteReachMap } from "@tomas-tc/blueprint";
import type { AppNavGroup, CrossFilter, DataTableColumn, FieldCellProps, FieldOption, FormRows, NavCount, RecordTarget, RowScope, ScopeValues, ViewRowsOptions } from "@tomas-tc/ui";
import { DEVICE, WORK_ORDER, WORK_PART } from "./tomas-ui.entities";
import { DEVICE_ROWS, TECHNICIAN_ROWS, WORK_ORDER_ROWS, WORK_PART_ROWS } from "./tomas-ui.rows";

const fieldOf = (entity: Entity, key: string): Field => {
  const field = entity.fields.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`${entity.key} has no field ${key}`);
  return field;
};

export const WORK_ORDER_LIST: ListScreen = {
  kind: "list",
  key: "work-orders",
  title: "Work orders",
  entity: "work-order",
  columns: ["code", "title", "device", "assignee", "priority", "status", "due", "progress"],
  columnDisplay: { assignee: "avatar", due: "relative-date", progress: "progress" },
  search: ["code", "title"],
  filters: ["status", "priority"],
  sort: { field: "due", direction: "asc" },
  rowActions: [
    { kind: "edit", form: "work-order-form" },
    { kind: "transition", field: "status", to: "in-progress" },
    { kind: "transition", field: "status", to: "done" },
    { kind: "delete", confirm: "Delete this work order?" },
  ],
  bulkActions: [
    { kind: "transition", field: "status", to: "cancelled" },
    { kind: "delete", confirm: "Delete the selected work orders?" },
  ],
  create: { form: "work-order-form" },
};

export const PARTS_SECTION: FormRowsSection = { kind: "rows", title: "Parts", entity: "work-part", link: "work-order", columns: ["part", "qty", "unit-cost"] };

export const WORK_ORDER_ASIDE: NonNullable<FormScreen["aside"]> = { title: "Site photo", fields: ["photo", "reported", "status"] };

export const WORK_ORDER_FORM: FormScreen = {
  kind: "form",
  key: "work-order-form",
  title: "Work order",
  entity: "work-order",
  mode: "dialog",
  sections: [
    { kind: "fields", title: "Job", fields: ["code", "title", "device", "assignee", "priority", "due"] },
    { kind: "fields", title: "Progress", fields: ["progress", "cost", "notes"], columns: 2 },
    PARTS_SECTION,
  ],
  aside: WORK_ORDER_ASIDE,
};

export const FORM_CHILDREN: Entity[] = [WORK_PART];

const optionsOf = (rows: Row[], label: string): FieldOption[] => rows.map((row) => ({ value: row.id, label: String(row[label]) }));

export const DEVICE_OPTIONS = optionsOf(DEVICE_ROWS, "code");

export const TECHNICIAN_OPTIONS = optionsOf(TECHNICIAN_ROWS, "name");

export const PRIORITY_OPTIONS: FieldOption[] = (fieldOf(WORK_ORDER, "priority").options ?? []).map(({ value, label }) => ({ value, label }));

export const FIELD_CELL_SAMPLES: readonly FieldCellProps[] = [
  { field: fieldOf(WORK_ORDER, "code"), value: "WO-0103", display: "text" },
  { field: fieldOf(WORK_ORDER, "status"), value: "in-progress", display: "badge" },
  { field: fieldOf(WORK_ORDER, "priority"), value: "urgent", display: "badge" },
  { field: fieldOf(WORK_ORDER, "progress"), value: 60, display: "progress" },
  { field: fieldOf(DEVICE, "uptime"), value: 0.714, display: "progress" },
  { field: fieldOf(WORK_ORDER, "cost"), value: 8800, display: "databar", scale: 8800 },
  { field: fieldOf(WORK_ORDER, "assignee"), value: "tech-4", display: "avatar", referenceLabels: { "tech-4": "Somchai Boonmee" } },
  { field: fieldOf(WORK_ORDER, "assignee"), value: "tech-4", display: "text", labelsPending: true },
  { field: fieldOf(WORK_ORDER, "due"), value: "2026-11-28", display: "relative-date" },
  { field: fieldOf(WORK_ORDER, "reported"), value: "2026-08-02T14:05", display: "text" },
  { field: fieldOf(WORK_ORDER, "notes"), value: "Firmware staged on the bridge; waiting for the production window to flash it.", display: "text" },
  { field: fieldOf(WORK_ORDER, "photo"), value: "plc-panel.jpg", display: "text" },
];

export const COST_SCALE_SCREEN: Pick<ListScreen, "columns" | "columnDisplay"> = { columns: ["cost", "progress"], columnDisplay: { cost: "databar", progress: "databar" } };

export const REFERENCE_OPTIONS: Record<string, FieldOption[]> = { device: DEVICE_OPTIONS, assignee: TECHNICIAN_OPTIONS };

export const WORK_ORDER_DRAFT: RowValues = {
  code: "WO-0109",
  title: "",
  device: "dev-3",
  assignee: "tech-4",
  priority: "high",
  status: "open",
  due: "2026-12-05",
  progress: 0,
  cost: 1800,
  notes: "Replace the PLC backup battery during the next stop.",
  photo: "plc-panel.jpg",
  reported: "2026-11-24T09:00",
};

export const WORK_ORDER_DRAFT_ROWS: FormRows = { "work-part": WORK_PART_ROWS.filter((row) => row["work-order"] === "wo-3") };

export const OPEN_ORDERS: StatSource = { entity: "work-order", aggregate: "count", filters: [{ field: "status", op: "in", value: ["open", "in-progress"] }] };

export const COST_TREND: StatSource = { entity: "work-order", aggregate: "sum", field: "cost", trend: { field: "reported", bucket: "month", sparkline: true } };

export const AVERAGE_UPTIME: StatSource = { entity: "device", aggregate: "avg", field: "uptime" };

export const BY_STATUS: ChartConfig = {
  title: "Work orders by status",
  chart: "donut",
  format: "plain",
  query: { entity: "work-order", groupBy: { field: "status" }, measures: [{ aggregate: "count" }] },
  options: { legend: true },
};

export const MONTHLY_BY_PRIORITY: ChartConfig = {
  title: "Reported per month by priority",
  chart: "column",
  format: "plain",
  query: { entity: "work-order", groupBy: { field: "reported", bucket: "month" }, series: "priority", measures: [{ aggregate: "count" }] },
  options: { stacked: true, legend: true },
  controls: { dateRange: true, granularity: true },
};

export const SAMPLE_CHARTS: readonly ChartConfig[] = [
  MONTHLY_BY_PRIORITY,
  {
    title: "Cost per assignee",
    chart: "bar",
    format: { currency: "THB" },
    query: { entity: "work-order", groupBy: { field: "assignee" }, measures: [{ aggregate: "sum", field: "cost" }], sort: { by: "value", direction: "desc" } },
    options: { labels: true },
    controls: { sort: true, topN: true },
  },
  {
    title: "Cost per month",
    chart: "line",
    format: { currency: "THB" },
    query: { entity: "work-order", groupBy: { field: "reported", bucket: "month" }, measures: [{ aggregate: "sum", field: "cost" }] },
    options: { smooth: true },
  },
  {
    title: "Running cost",
    chart: "area",
    format: "compact",
    query: { entity: "work-order", groupBy: { field: "reported", bucket: "month" }, measures: [{ aggregate: "sum", field: "cost", key: "cost" }] },
    series: [{ key: "running", measure: { derived: "runningTotal", of: "cost" }, label: "Running total", type: "area", axis: "left" }],
  },
  BY_STATUS,
  {
    title: "Devices by kind",
    chart: "pie",
    format: "plain",
    query: { entity: "device", groupBy: { field: "kind" }, measures: [{ aggregate: "count" }] },
    controls: { filters: ["status"] },
  },
  {
    title: "Orders and cost per month",
    chart: "combo",
    format: "plain",
    query: { entity: "work-order", groupBy: { field: "reported", bucket: "month" }, measures: [{ aggregate: "count", key: "orders" }, { aggregate: "sum", field: "cost", key: "cost" }] },
    series: [
      { key: "orders", measure: "orders", label: "Orders", type: "bar", axis: "left" },
      { key: "cost", measure: "cost", label: "Cost", type: "line", axis: "right", format: { currency: "THB" }, tone: "warning" },
    ],
    options: { legend: true },
  },
  {
    title: "Average progress",
    chart: "gauge",
    format: { unit: "%" },
    query: { entity: "work-order", measures: [{ aggregate: "avg", field: "progress" }] },
    options: { goal: 100 },
  },
  {
    title: "Devices per site",
    chart: "treemap",
    format: "plain",
    query: { entity: "device", groupBy: { field: "site" }, measures: [{ aggregate: "count" }] },
  },
];

export const EMPTY_CHART: ChartConfig = {
  ...BY_STATUS,
  title: "Filtered to nothing",
  query: { ...BY_STATUS.query, filters: [{ field: "status", op: "eq", value: "archived" }] },
};

export const SERVER_CHART: ChartConfig = { ...BY_STATUS, title: "By status, answered by the server", query: { ...BY_STATUS.query, entity: "work-order-server" } };

export const SERVER_COUNT: StatSource = { entity: "work-order-server", aggregate: "count" };

export const OPERATIONS_FILTER_BAR: FilterBar = { entity: "work-order", dateRange: { field: "reported", default: "all" }, filters: ["priority", "assignee"] };

export const URGENT_PICK: CrossFilter = { entity: "work-order", field: "priority", value: "urgent", label: "Priority: Urgent", source: "playground" };

export const OPERATIONS_DASHBOARD: DashboardScreen = {
  kind: "dashboard",
  key: "operations",
  title: "Operations",
  filterBar: OPERATIONS_FILTER_BAR,
  widgets: [
    { kind: "stat", label: "Open work orders", ...OPEN_ORDERS, format: "plain" },
    { kind: "stat", label: "Cost this month", ...COST_TREND, format: { currency: "THB" } },
    { kind: "stat", label: "Average device uptime", ...AVERAGE_UPTIME, format: "percent" },
    { kind: "chart", ...BY_STATUS, span: 2 },
    { kind: "chart", ...MONTHLY_BY_PRIORITY, span: 2 },
    { kind: "list", screen: "work-orders", limit: 5 },
  ],
};

export const WORK_ORDER_COLUMNS: DataTableColumn[] = ["code", "title", "priority", "status", "due", "cost"].map((key): DataTableColumn => {
  const field = fieldOf(WORK_ORDER, key);
  return {
    key,
    label: field.label,
    field,
    sortable: true,
    align: field.type === "number" ? "right" : undefined,
    filter: field.options ? { kind: "select", multiple: true, options: field.options.map(({ value, label }) => ({ value, label })) } : undefined,
  };
});

export const PLC_UPDATE: RecordTarget = { entity: WORK_ORDER, id: "wo-3" };

const plcRow = WORK_ORDER_ROWS.find((row) => row.id === PLC_UPDATE.id) ?? { id: PLC_UPDATE.id };

export const WORK_ORDER_SCOPE: RowScope = { row: plcRow, entity: WORK_ORDER, referenceLabels: { device: { "dev-3": "PLC-C03" }, assignee: { "tech-4": "Somchai Boonmee" } } };

export const WORK_ORDER_SCOPE_VALUES: ScopeValues = { row: WORK_ORDER_SCOPE, state: { picked: "wo-3" } };

export const STOCK_HINT: MediaHint = { query: "industrial gateway", orientation: "landscape" };

export const SAMPLE_BLOCK_STYLE: BlockStyle = { surface: "card", padding: "md", height: "auto", span: 6 };

export const NEW_ORDER_VALUES: CreateButtonAction["values"] = { title: "Check {{device}} after storm", priority: "high", device: "dev-4", progress: "0" };

export const PANE_DEVICE_IDS: readonly string[] = ["dev-3", "dev-4", "dev-404"];

export const NEXT_DUE_ROWS:ViewRowsOptions = { filters: [{ field: "status", op: "in", value: ["open", "in-progress"] }], sort: { field: "due", direction: "asc" }, limit: 3 };

export const URGENT_ROWS: ViewRowsOptions = { filters: [{ field: "priority", op: "eq", value: "urgent" }] };

export const REPEAT_HEADS:RepeatColumnHead[] = [{ field: "code" }, { field: "title", label: "Work order" }, { field: "status" }, { field: "assignee" }];

export const SAMPLE_WRITE_REACH: WriteReachMap = {
  technician: ["technician"],
  site: ["site"],
  device: ["device"],
  "work-order": ["work-order"],
  "work-part": ["work-part", "work-order"],
  "work-note": ["work-note"],
};

export const DEVICE_TABLE_COLUMNS = ["code", "name", "site", "status", "uptime"];

export const DASHBOARD_LIST_COLUMNS = ["code", "title", "status", "due"];

export const NAV_MENU = [
  {
    label: "Devices",
    links: [
      { title: "Gateways", note: "Edge gateways and their uplinks" },
      { title: "Sensors", note: "Temperature, humidity and vibration probes" },
      { title: "Cameras", note: "Dock and perimeter cameras" },
    ],
  },
  {
    label: "Sites",
    links: [
      { title: "Riverside Plant", note: "Central region, 2 devices" },
      { title: "Harbour Warehouse", note: "East region, 2 devices" },
    ],
  },
];

export const OPEN_ORDER_COUNT: NavCount ={ entity: WORK_ORDER, filters: [{ field: "status", op: "eq", value: "open" }] };

export const NAV_GROUPS: AppNavGroup[] = [
  {
    key: "work",
    label: "Work",
    items: [
      { key: "home", label: "Overview", icon: "house", href: "#overview", active: true },
      { key: "orders", label: "Work orders", icon: "clipboard-list", href: "#orders", count: OPEN_ORDER_COUNT },
      {
        key: "assets",
        label: "Assets",
        icon: "folder",
        children: [
          { key: "devices", label: "Devices", icon: "cpu", href: "#devices", count: { entity: DEVICE } },
          { key: "sites", label: "Sites", icon: "map-pin", href: "#sites" },
        ],
      },
    ],
  },
  {
    key: "admin",
    label: "Admin",
    roles: ["admin"],
    items: [
      { key: "people", label: "Technicians", icon: "users", href: "#people" },
      { key: "settings", label: "Settings", icon: "settings", href: "#settings", roles: ["admin"] },
    ],
  },
];
