import type { Entity } from "@tomas-tc/blueprint";

export const TECHNICIAN: Entity = {
  key: "technician",
  label: "Technician",
  fields: [
    { key: "name", label: "Name", type: "text" },
    {
      key: "team",
      label: "Team",
      type: "select",
      options: [
        { value: "field", label: "Field service", tone: "info" },
        { value: "lab", label: "Lab", tone: "violet" },
      ],
    },
    { key: "email", label: "Email", type: "email" },
  ],
};

export const SITE: Entity = {
  key: "site",
  label: "Site",
  fields: [
    { key: "name", label: "Name", type: "text" },
    {
      key: "region",
      label: "Region",
      type: "select",
      options: [
        { value: "north", label: "North" },
        { value: "central", label: "Central" },
        { value: "east", label: "East" },
        { value: "south", label: "South" },
      ],
    },
  ],
};

export const DEVICE: Entity = {
  key: "device",
  label: "Device",
  fields: [
    { key: "code", label: "Code", type: "text" },
    { key: "name", label: "Name", type: "text" },
    {
      key: "kind",
      label: "Kind",
      type: "select",
      options: [
        { value: "gateway", label: "Gateway", tone: "info" },
        { value: "sensor", label: "Sensor", tone: "success" },
        { value: "plc", label: "PLC", tone: "violet" },
        { value: "camera", label: "Camera", tone: "pink" },
      ],
    },
    { key: "site", label: "Site", type: "reference", reference: { entity: "site", display: "name" } },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "online", label: "Online", tone: "success" },
        { value: "maintenance", label: "Maintenance", tone: "warning" },
        { value: "offline", label: "Offline", tone: "danger" },
      ],
      transitions: [
        { from: "online", to: "maintenance", label: "Service", icon: "wrench" },
        { from: "maintenance", to: "online", label: "Bring online", icon: "power" },
        { from: "online", to: "offline", label: "Take offline", icon: "power-off" },
      ],
    },
    { key: "uptime", label: "Uptime", type: "number", format: "percent", min: 0, max: 1 },
    { key: "installed", label: "Installed", type: "date" },
  ],
  present: { title: "name", key: "code", badges: ["status"], meta: ["site", "kind"] },
};

export const WORK_ORDER: Entity = {
  key: "work-order",
  label: "Work order",
  fields: [
    { key: "code", label: "Code", type: "text" },
    { key: "title", label: "Title", type: "text", required: true, maxLength: 80 },
    { key: "device", label: "Device", type: "reference", reference: { entity: "device", display: "code" } },
    { key: "assignee", label: "Assignee", type: "reference", reference: { entity: "technician", display: "name" } },
    {
      key: "priority",
      label: "Priority",
      type: "select",
      options: [
        { value: "low", label: "Low", tone: "neutral" },
        { value: "normal", label: "Normal", tone: "info" },
        { value: "high", label: "High", tone: "warning" },
        { value: "urgent", label: "Urgent", tone: "danger" },
      ],
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "open", label: "Open", tone: "info" },
        { value: "in-progress", label: "In progress", tone: "warning" },
        { value: "done", label: "Done", tone: "success" },
        { value: "cancelled", label: "Cancelled", tone: "neutral" },
      ],
      transitions: [
        { from: "open", to: "in-progress", label: "Start", icon: "play" },
        { from: "in-progress", to: "done", label: "Finish", icon: "check" },
        { from: "open", to: "cancelled", label: "Cancel", icon: "x" },
        { from: "in-progress", to: "open", label: "Reopen", icon: "rotate-ccw" },
      ],
    },
    { key: "reported", label: "Reported", type: "datetime" },
    { key: "due", label: "Due", type: "date" },
    { key: "progress", label: "Progress", type: "number", min: 0, max: 100 },
    { key: "cost", label: "Cost", type: "number", format: { currency: "THB" }, min: 0 },
    { key: "notes", label: "Notes", type: "longtext" },
    { key: "photo", label: "Site photo", type: "file", accept: "image/*", preview: true },
  ],
  present: {
    title: "title",
    key: "code",
    subtitle: "device",
    badges: ["status", "priority"],
    meta: ["due", "reported"],
    person: "assignee",
    body: "notes",
    related: [
      { entity: "work-note", as: "feed", label: "Notes" },
      { entity: "work-part", as: "list", label: "Parts" },
    ],
  },
};

export const WORK_PART: Entity = {
  key: "work-part",
  label: "Part",
  fields: [
    { key: "work-order", label: "Work order", type: "reference", reference: { entity: "work-order", display: "code" } },
    { key: "part", label: "Part", type: "text", required: true },
    { key: "qty", label: "Qty", type: "number", min: 1 },
    { key: "unit-cost", label: "Unit cost", type: "number", format: { currency: "THB" }, min: 0 },
  ],
};

export const WORK_NOTE: Entity = {
  key: "work-note",
  label: "Note",
  fields: [
    { key: "work-order", label: "Work order", type: "reference", reference: { entity: "work-order", display: "code" } },
    { key: "author", label: "Author", type: "reference", reference: { entity: "technician", display: "name" } },
    { key: "body", label: "Note", type: "longtext" },
    { key: "posted", label: "Posted", type: "datetime" },
  ],
};

export const INSPECTION: Entity = {
  key: "inspection",
  label: "Inspection",
  fields: [
    { key: "text", label: "Text", type: "text" },
    { key: "longtext", label: "Long text", type: "longtext" },
    { key: "number", label: "Number", type: "number", min: 0 },
    { key: "boolean", label: "Yes or no", type: "boolean" },
    { key: "date", label: "Date", type: "date" },
    { key: "time", label: "Time", type: "time" },
    { key: "datetime", label: "Date and time", type: "datetime" },
    { key: "daterange", label: "Date range", type: "daterange" },
    { key: "timerange", label: "Time range", type: "timerange" },
    {
      key: "select",
      label: "Select",
      type: "select",
      options: [
        { value: "pass", label: "Pass", tone: "success" },
        { value: "fail", label: "Fail", tone: "danger" },
      ],
    },
    {
      key: "multiselect",
      label: "Multi select",
      type: "multiselect",
      options: [
        { value: "power", label: "Power" },
        { value: "network", label: "Network" },
        { value: "sensor", label: "Sensor" },
      ],
    },
    { key: "file", label: "File", type: "file", accept: ".pdf,image/*" },
    { key: "reference", label: "Reference", type: "reference", reference: { entity: "device", display: "code" } },
    { key: "color", label: "Colour", type: "color" },
    { key: "phone", label: "Phone", type: "phone" },
    { key: "email", label: "Email", type: "email" },
    { key: "url", label: "URL", type: "url" },
    { key: "year", label: "Year", type: "year" },
    { key: "icon", label: "Icon", type: "icon" },
  ],
};

export const SAMPLE_ENTITIES: Entity[] =[TECHNICIAN, SITE, DEVICE, WORK_ORDER, WORK_PART, WORK_NOTE];
