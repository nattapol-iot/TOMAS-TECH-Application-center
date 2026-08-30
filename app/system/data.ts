/* ==========================================================================
   Engineering Estimate Cost Management System — demonstration dataset.

   Every screen reads from this module so numbers stay consistent across the
   dashboard, the estimate workspace, the reports and the audit log.
   No selling price, margin or markup exists anywhere in this system: the
   application controls internal engineering cost only.
   ========================================================================== */

/**
 * Product identity. Every place that names the system reads from here — the
 * sidebar, the login panel, the footer and the browser tab.
 */
export const PRODUCT = {
  company: "TOMAS TECH",
  name: "IoT Team Center",
  tagline: "Engineering Estimate Cost",
  full: "IoT Team Center — Engineering Estimate Cost Management System",
  version: "v1.0",
};

export type Role =
  | "Admin"
  | "Engineering Manager"
  | "Project Manager"
  | "Engineer"
  | "Sales Engineer"
  | "Viewer";

export type User = {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  department: string;
  level: string;
};

export type Customer = {
  id: string;
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  industry: string;
  site: string;
  inquiries: number;
};

export type Supplier = {
  id: string;
  code: string;
  name: string;
  category: string;
  contact: string;
  email: string;
  phone: string;
  brands: string[];
  status: "Active" | "Hold";
};

export type InquiryStatus =
  | "New"
  | "Estimating"
  | "Waiting Supplier Price"
  | "Estimate Completed"
  | "Engineering Review"
  | "Approved"
  | "Cancelled";

export type Priority = "Low" | "Normal" | "High" | "Urgent";

export type Attachment = {
  id: string;
  name: string;
  category: string;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type MeetingRecord = {
  id: string;
  date: string;
  type: string;
  participants: string[];
  requirement: string;
  technical: string;
  decision: string;
  openPoint: string;
  actionItem: string;
  owner: string;
  dueDate: string;
  attachment?: string;
};

export type Inquiry = {
  id: string;
  no: string;
  date: string;
  customerId: string;
  contact: string;
  projectName: string;
  projectType: string;
  rfqNo: string;
  salesOwner: string;
  estimateOwnerId: string;
  dueDate: string;
  priority: Priority;
  status: InquiryStatus;
  progress: number;
  revision: string;
  updatedAt: string;
  requirement: string;
  background: string;
  scopeSummary: string;
  technical: string;
  targetDelivery: string;
  siteLocation: string;
  standard: string;
  special: string;
  remark: string;
  attachments: Attachment[];
  meetings: MeetingRecord[];
  estimateId?: string;
};

export type PriceSource =
  | "Supplier Quotation"
  | "Previous Estimate"
  | "Previous Project Cost"
  | "Purchase Price"
  | "Master Price"
  | "Manual Estimate"
  | "Budgetary Price";

export type CostItem = {
  id: string;
  category: string;
  categoryCode: string;
  subcategory: string;
  /** Main module the item belongs to, e.g. "Main Control Box". */
  module: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string;
  supplier: string;
  qty: number;
  unit: string;
  unitCost: number;
  source: PriceSource | "";
  referenceNo: string;
  referenceProject: string;
  priceDate: string;
  remark: string;
  owner: string;
  status: SectionStatus;
};

export type SectionStatus =
  | "Not Started"
  | "In Progress"
  | "Waiting Information"
  | "Waiting Supplier"
  | "Completed"
  | "Reviewed";

/**
 * How the effort is classified and rated. Engineering cost is design,
 * programming and testing; installation & service cost is the work carried out
 * to put the system in place and service it, which carries the higher rate.
 */
export type CostType = "Engineering" | "Installation";

/** Screen labels for the two cost types — stored short, shown in full. */
export const COST_TYPE_LABEL: Record<CostType, string> = {
  Engineering: "Engineering cost",
  Installation: "Installation & Service cost",
};

export const COST_TYPE_SHORT: Record<CostType, string> = {
  Engineering: "Engineering",
  Installation: "Installation & Service",
};

/** Who supplies the man-hour: our own engineers or an outsourced supplier. */
export type ManhourProvider = "Internal" | "Supplier";

export type ManhourLine = {
  id: string;
  /** Work package the effort belongs to, e.g. "Site Installation". */
  package: string;
  activity: string;
  department: string;
  level: string;
  costType: CostType;
  /** Internal effort is rated from the master; supplier effort is quoted. */
  provider: ManhourProvider;
  /** Required when the provider is a supplier. */
  supplier: string;
  /** Supplier quotation the quoted rate came from, e.g. SQ-2608-0038. */
  quotationNo: string;
  priceDate: string;
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  dailyRate: number;
  owner: string;
  remark: string;
};

export const EXPENSE_TYPES = [
  "Travel", "Accommodation", "Per Diem", "Transportation", "Equipment Rental", "Other",
] as const;

export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export const EXPENSE_UNITS = ["Trip", "Night", "Day", "Person", "Km", "Lot", "Service"];

/**
 * Non-effort cost that belongs to a work package — travel, hotel, per diem and
 * similar. It is estimated next to the man-hour it is caused by, then reported
 * under transportation / accommodation / other cost.
 */
export type ExpenseLine = {
  id: string;
  package: string;
  type: ExpenseType;
  description: string;
  costType: CostType;
  supplier: string;
  reference: string;
  qty: number;
  unit: string;
  unitCost: number;
  owner: string;
  remark: string;
};

export type OtherCostLine = {
  id: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  remark: string;
};

export type Assignment = {
  id: string;
  section: string;
  ownerId: string;
  supportId: string;
  dueDate: string;
  status: SectionStatus;
  progress: number;
  comment: string;
};

export type Revision = {
  id: string;
  code: string;
  reason: string;
  description: string;
  createdBy: string;
  createdAt: string;
  reviewedBy: string;
  status: "Locked" | "Approved" | "Superseded" | "Active";
  total: number;
};

export type EstimateStatus =
  | "Draft"
  | "Engineering Input"
  | "Waiting Supplier Price"
  | "Estimate Completed"
  | "Engineering Review"
  | "Revision Required"
  | "Approved"
  | "Locked";

export type Estimate = {
  id: string;
  no: string;
  inquiryNo: string;
  customerId: string;
  projectName: string;
  projectType: string;
  ownerId: string;
  revision: string;
  createdDate: string;
  dueDate: string;
  status: EstimateStatus;
  progress: number;
  updatedAt: string;
  contingencyRate: number;
  items: CostItem[];
  manhours: ManhourLine[];
  expenses: ExpenseLine[];
  others: OtherCostLine[];
  assignments: Assignment[];
  revisions: Revision[];
};

export type PriceHistoryPoint = {
  date: string;
  price: number;
  supplier: string;
  reference: string;
  project: string;
  uploadedBy: string;
};

export type PriceRecord = {
  id: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  category: string;
  supplier: string;
  unit: string;
  price: number;
  priceDate: string;
  source: PriceSource;
  reference: string;
  project: string;
  lastUsed: string;
  history: PriceHistoryPoint[];
};

export type SupplierQuotation = {
  id: string;
  no: string;
  supplier: string;
  receivedDate: string;
  validUntil: string;
  inquiryNo: string;
  project: string;
  currency: string;
  amount: number;
  uploadedBy: string;
  status: "Valid" | "Expiring" | "Expired" | "Superseded";
  file: string;
  fileType: "PDF" | "Excel" | "Image";
};

export type MissingPrice = {
  id: string;
  inquiryNo: string;
  project: string;
  item: string;
  brand: string;
  model: string;
  supplier: string;
  requestedBy: string;
  requestDate: string;
  requiredDate: string;
  status:
    | "Not Requested"
    | "Requested"
    | "Waiting Supplier"
    | "Received"
    | "Price Updated";
  ownerId: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  user: string;
  estimate: string;
  revision: string;
  module: string;
  action: string;
  before: string;
  after: string;
  reason: string;
};

export type RateRecord = {
  id: string;
  level: string;
  department: string;
  /** Standard cost for engineering work — design, programming, testing. */
  engineeringHourly: number;
  engineeringDaily: number;
  /** Standard cost for installation work carried out on the system. */
  installationHourly: number;
  installationDaily: number;
  effective: string;
};

export type Notification = {
  id: string;
  kind: "due" | "overdue" | "review" | "supplier" | "approved" | "assign";
  title: string;
  detail: string;
  at: string;
  unread: boolean;
};

/* --------------------------------------------------------------------------
   Master data
   -------------------------------------------------------------------------- */

export const USERS: User[] = [
  { id: "u1", name: "Nattaphon Prasert", initials: "NP", email: "nattaphon.p@tomastc.com", role: "Engineer", department: "IoT", level: "Senior Engineer" },
  { id: "u2", name: "Trin Tintanee", initials: "TT", email: "trin.t@tomastc.com", role: "Engineer", department: "PLC", level: "Middle Engineer" },
  { id: "u3", name: "Kanokwan Sirisuk", initials: "KS", email: "kanokwan.s@tomastc.com", role: "Engineer", department: "Software", level: "Senior Engineer" },
  { id: "u4", name: "Peerapat Wongchai", initials: "PW", email: "peerapat.w@tomastc.com", role: "Engineer", department: "Electrical", level: "Middle Engineer" },
  { id: "u5", name: "Sarawut Chaiyo", initials: "SC", email: "sarawut.c@tomastc.com", role: "Engineer", department: "Mechanical", level: "Senior Engineer" },
  { id: "u6", name: "Yuki Tanaka", initials: "YT", email: "yuki.t@tomastc.com", role: "Engineering Manager", department: "Engineering", level: "Manager" },
  { id: "u7", name: "Areeya Boonmee", initials: "AB", email: "areeya.b@tomastc.com", role: "Project Manager", department: "PMO", level: "Lead Engineer" },
  { id: "u8", name: "Chatchai Pimsen", initials: "CP", email: "chatchai.p@tomastc.com", role: "Sales Engineer", department: "Sales", level: "—" },
  { id: "u9", name: "Wanida Srisuk", initials: "WS", email: "wanida.s@tomastc.com", role: "Admin", department: "IT", level: "—" },
  { id: "u10", name: "Thanaphon Rit", initials: "TR", email: "thanaphon.r@tomastc.com", role: "Engineer", department: "Robotics", level: "Middle Engineer" },
];

export const CURRENT_USER = USERS[0];

export const CUSTOMERS: Customer[] = [
  { id: "c1", code: "ASTEMO", name: "Astemo (Thailand) Co., Ltd.", contact: "K. Somsak Chareon", email: "somsak.c@astemo.example", phone: "+66 38 210 100", industry: "Automotive Parts", site: "Amata City, Chonburi", inquiries: 9 },
  { id: "c2", code: "DENSO", name: "Siam DENSO Manufacturing", contact: "K. Nipon Wattana", email: "nipon.w@denso.example", phone: "+66 38 213 500", industry: "Automotive Electronics", site: "Bangpakong, Chachoengsao", inquiries: 7 },
  { id: "c3", code: "MEIJI", name: "Meiji Food (Thailand)", contact: "K. Pornthip S.", email: "pornthip.s@meiji.example", phone: "+66 2 651 8800", industry: "Food & Beverage", site: "Bangna, Samut Prakan", inquiries: 4 },
  { id: "c4", code: "AAPICO", name: "AAPICO Hitech PCL", contact: "K. Adisak T.", email: "adisak.t@aapico.example", phone: "+66 35 350 880", industry: "Automotive Stamping", site: "Hi-Tech Industrial Estate", inquiries: 6 },
  { id: "c5", code: "FTS", name: "Fujikura Thai Solutions", contact: "K. Manop K.", email: "manop.k@fts.example", phone: "+66 2 709 2000", industry: "Electronics", site: "Lamphun", inquiries: 5 },
  { id: "c6", code: "TTS", name: "Thai Takagi Seiko", contact: "K. Wichai P.", email: "wichai.p@takagi.example", phone: "+66 38 454 200", industry: "Plastic Injection", site: "Eastern Seaboard, Rayong", inquiries: 3 },
];

export const SUPPLIERS: Supplier[] = [
  { id: "s1", code: "SUP-KEY", name: "Keyence (Thailand) Co., Ltd.", category: "Vision / Sensor / PLC", contact: "Sales Division", email: "sales@keyence.example", phone: "+66 2 369 2777", brands: ["KEYENCE"], status: "Active" },
  { id: "s2", code: "SUP-MIT", name: "Mitsubishi Electric Automation", category: "PLC / Servo / HMI", contact: "K. Surachai", email: "surachai@meat.example", phone: "+66 2 682 6522", brands: ["Mitsubishi"], status: "Active" },
  { id: "s3", code: "SUP-SIE", name: "Siemens Thailand", category: "PLC / Drive / Industrial PC", contact: "K. Duangjai", email: "duangjai@siemens.example", phone: "+66 2 715 8000", brands: ["Siemens"], status: "Active" },
  { id: "s4", code: "SUP-OMR", name: "Omron Electronics", category: "Sensor / Safety / PLC", contact: "K. Pongpat", email: "pongpat@omron.example", phone: "+66 2 942 6700", brands: ["Omron"], status: "Active" },
  { id: "s5", code: "SUP-SCH", name: "Schneider Electric Thailand", category: "Electrical / Panel", contact: "K. Nutcha", email: "nutcha@se.example", phone: "+66 2 617 5555", brands: ["Schneider"], status: "Active" },
  { id: "s6", code: "SUP-CIS", name: "Cisco Partner — Datacom Thai", category: "Network Infrastructure", contact: "K. Pattarapon", email: "pat@datacom.example", phone: "+66 2 260 1122", brands: ["Cisco"], status: "Active" },
  { id: "s7", code: "SUP-HIK", name: "HIKROBOT Thailand", category: "AMR / Vision", contact: "Regional Sales", email: "sales@hikrobot.example", phone: "+66 2 026 9600", brands: ["HIKROBOT"], status: "Active" },
  { id: "s8", code: "SUP-YAS", name: "Yaskawa Electric (Thailand)", category: "Robot / Servo", contact: "K. Kittipong", email: "kittipong@yaskawa.example", phone: "+66 2 017 0099", brands: ["Yaskawa"], status: "Active" },
  { id: "s9", code: "SUP-FAN", name: "FANUC Thai Ltd.", category: "Robot / CNC", contact: "K. Chalerm", email: "chalerm@fanuc.example", phone: "+66 2 200 1000", brands: ["FANUC"], status: "Active" },
  { id: "s10", code: "SUP-DEN", name: "DENSO Wave Robotics", category: "Cobot / Barcode", contact: "K. Ratchanon", email: "ratchanon@densowave.example", phone: "+66 2 315 9500", brands: ["DENSO"], status: "Active" },
  { id: "s11", code: "SUP-LFB", name: "TP Precision Fabrication", category: "Mechanical Fabrication", contact: "K. Somchai", email: "somchai@tpfab.example", phone: "+66 81 900 1122", brands: ["—"], status: "Active" },
  { id: "s12", code: "SUP-PAN", name: "Thai Control Panel Works", category: "Control Panel / Wiring", contact: "K. Adul", email: "adul@tcpw.example", phone: "+66 38 991 220", brands: ["—"], status: "Active" },
];

export const PROJECT_TYPES = [
  "Automation", "IoT", "PLC", "Software", "Electrical", "Mechanical",
  "Robot", "AMR", "Auto Warehouse", "WMS", "WCS", "Traceability",
  "Vision", "Data Collection", "Other",
];

export const COST_STRUCTURE: { code: string; name: string; subs: { code: string; name: string }[] }[] = [
  { code: "01", name: "Hardware", subs: [
    { code: "01.01", name: "PLC" }, { code: "01.02", name: "HMI" }, { code: "01.03", name: "Sensor" },
    { code: "01.04", name: "Network" }, { code: "01.05", name: "Industrial PC" },
  ]},
  { code: "02", name: "Software", subs: [
    { code: "02.01", name: "PLC Programming" }, { code: "02.02", name: "HMI Programming" },
    { code: "02.03", name: "Application Software" }, { code: "02.04", name: "Database" }, { code: "02.05", name: "Dashboard" },
  ]},
  { code: "03", name: "Electrical", subs: [
    { code: "03.01", name: "Electrical Design" }, { code: "03.02", name: "Control Panel" },
    { code: "03.03", name: "Wiring" }, { code: "03.04", name: "Installation" },
  ]},
  { code: "04", name: "Mechanical", subs: [
    { code: "04.01", name: "Mechanical Design" }, { code: "04.02", name: "Fabrication" }, { code: "04.03", name: "Assembly" },
  ]},
  { code: "05", name: "Robot", subs: [
    { code: "05.01", name: "Robot" }, { code: "05.02", name: "Gripper" }, { code: "05.03", name: "Robot Programming" },
  ]},
  { code: "06", name: "Engineering", subs: [
    { code: "06.01", name: "System Design" }, { code: "06.02", name: "Programming" }, { code: "06.03", name: "Testing" },
    { code: "06.04", name: "Commissioning" }, { code: "06.05", name: "Documentation" },
  ]},
  { code: "07", name: "Outsource", subs: [{ code: "07.01", name: "Outsource Service" }] },
  { code: "08", name: "Transportation", subs: [{ code: "08.01", name: "Transportation" }] },
  { code: "09", name: "Accommodation", subs: [{ code: "09.01", name: "Accommodation" }] },
  { code: "10", name: "Other Cost", subs: [{ code: "10.01", name: "Other" }] },
];

/**
 * Suggested main modules per cost category. Engineers build an estimate as
 * modules ("Main Control Box", "In-feed Conveyor") and hang the individual
 * items under them, the way the machine is actually assembled.
 */
export const MODULE_PRESETS: Record<string, string[]> = {
  "01": ["PLC Control Panel Set", "Operator Station", "Vision Station", "Traceability Station", "Network & Server"],
  "02": ["Traceability Software", "Dashboard & Report", "Database", "Interface / Integration"],
  "03": ["Main Control Box", "Sub Control Box", "Field Wiring & Cable Tray", "Power Distribution", "Site Installation"],
  "04": ["In-feed Conveyor", "Out-feed Conveyor", "Machine Base", "Safety Fence", "Gripper Tooling"],
  "05": ["Cobot Cell", "AMR Fleet", "Robot Tooling", "Charging Station"],
  "06": ["Design & Engineering", "Testing & Commissioning", "Documentation"],
  "07": ["Outsource Service"],
  "08": ["Delivery"],
  "09": ["Site Support"],
  "10": ["Other"],
};

export const ENGINEERING_ACTIVITIES = [
  "System Design", "PLC Programming", "HMI Programming", "Software Development",
  "Database Development", "Robot Programming", "Mechanical Design", "Electrical Design", "Drawing",
  "Panel Wiring & Assembly", "FAT", "Internal Testing", "On-site Installation", "Commissioning", "SAT",
  "UAT Support", "Training", "Documentation", "Project Management", "Engineering Support",
];

export const ENGINEER_LEVELS = [
  "Junior Engineer", "Middle Engineer", "Senior Engineer",
  "Lead Engineer", "Technical Architect", "Manager",
];

export const DEPARTMENTS = ["PLC", "Software", "Electrical", "Mechanical", "Robotics", "IoT", "PMO"];

export const RATES: RateRecord[] = [
  { id: "r1", level: "Junior Engineer", department: "PLC", engineeringHourly: 313, engineeringDaily: 2500, installationHourly: 394, installationDaily: 3150, effective: "2026-01-01" },
  { id: "r2", level: "Middle Engineer", department: "PLC", engineeringHourly: 500, engineeringDaily: 4000, installationHourly: 625, installationDaily: 5000, effective: "2026-01-01" },
  { id: "r3", level: "Senior Engineer", department: "PLC", engineeringHourly: 625, engineeringDaily: 5000, installationHourly: 781, installationDaily: 6250, effective: "2026-01-01" },
  { id: "r4", level: "Junior Engineer", department: "Software", engineeringHourly: 344, engineeringDaily: 2750, installationHourly: 431, installationDaily: 3450, effective: "2026-01-01" },
  { id: "r5", level: "Middle Engineer", department: "Software", engineeringHourly: 563, engineeringDaily: 4500, installationHourly: 706, installationDaily: 5650, effective: "2026-01-01" },
  { id: "r6", level: "Senior Engineer", department: "Software", engineeringHourly: 688, engineeringDaily: 5500, installationHourly: 863, installationDaily: 6900, effective: "2026-01-01" },
  { id: "r7", level: "Middle Engineer", department: "Electrical", engineeringHourly: 469, engineeringDaily: 3750, installationHourly: 588, installationDaily: 4700, effective: "2026-01-01" },
  { id: "r8", level: "Senior Engineer", department: "Electrical", engineeringHourly: 594, engineeringDaily: 4750, installationHourly: 744, installationDaily: 5950, effective: "2026-01-01" },
  { id: "r9", level: "Middle Engineer", department: "Mechanical", engineeringHourly: 469, engineeringDaily: 3750, installationHourly: 588, installationDaily: 4700, effective: "2026-01-01" },
  { id: "r10", level: "Senior Engineer", department: "Mechanical", engineeringHourly: 594, engineeringDaily: 4750, installationHourly: 744, installationDaily: 5950, effective: "2026-01-01" },
  { id: "r11", level: "Middle Engineer", department: "Robotics", engineeringHourly: 531, engineeringDaily: 4250, installationHourly: 663, installationDaily: 5300, effective: "2026-01-01" },
  { id: "r12", level: "Senior Engineer", department: "IoT", engineeringHourly: 656, engineeringDaily: 5250, installationHourly: 819, installationDaily: 6550, effective: "2026-01-01" },
  { id: "r13", level: "Lead Engineer", department: "PMO", engineeringHourly: 750, engineeringDaily: 6000, installationHourly: 938, installationDaily: 7500, effective: "2026-01-01" },
  { id: "r14", level: "Manager", department: "Engineering", engineeringHourly: 875, engineeringDaily: 7000, installationHourly: 1094, installationDaily: 8750, effective: "2026-01-01" },
];

/** Work packages suggested when an engineer starts a new effort group. */
export const PACKAGE_PRESETS: { name: string; costType: CostType }[] = [
  { name: "Design & Engineering", costType: "Engineering" },
  { name: "Programming & Software", costType: "Engineering" },
  { name: "Panel Assembly & Wiring", costType: "Engineering" },
  { name: "Factory Acceptance Test", costType: "Engineering" },
  { name: "Documentation & Project Management", costType: "Engineering" },
  { name: "Site Installation", costType: "Installation" },
  { name: "Commissioning", costType: "Installation" },
  { name: "Site Acceptance Test", costType: "Installation" },
  { name: "Training & Handover", costType: "Installation" },
];

export const UNITS = ["Set", "Pcs", "Lot", "Unit", "Meter", "Day", "Month", "Service"];

export const BRANDS = ["KEYENCE", "Mitsubishi", "Siemens", "Omron", "Schneider", "Cisco", "HIKROBOT", "Yaskawa", "FANUC", "DENSO", "Advantech", "Phoenix Contact"];

/* --------------------------------------------------------------------------
   Estimate — EST-2608-0001 R02 (the fully populated demonstration estimate)
   -------------------------------------------------------------------------- */

const items0001: CostItem[] = [
  { id: "i1", categoryCode: "01", category: "Hardware", subcategory: "PLC", module: "PLC Control Panel Set", itemCode: "HW-PLC-001", description: "PLC CPU Unit with EtherNet/IP", brand: "KEYENCE", model: "KV-8000", specification: "Ladder + Motion, 1000 steps/ms", supplier: "Keyence (Thailand) Co., Ltd.", qty: 1, unit: "Set", unitCost: 76000, source: "Supplier Quotation", referenceNo: "SQ-2608-0012", referenceProject: "FTS Traceability", priceDate: "2026-08-12", remark: "Quotation valid 60 days", owner: "u2", status: "Completed" },
  { id: "i2", categoryCode: "01", category: "Hardware", subcategory: "PLC", module: "PLC Control Panel Set", itemCode: "HW-PLC-002", description: "Expansion I/O Unit 16DI/16DO", brand: "KEYENCE", model: "KV-B16XC", specification: "24VDC sink/source", supplier: "Keyence (Thailand) Co., Ltd.", qty: 4, unit: "Pcs", unitCost: 9800, source: "Supplier Quotation", referenceNo: "SQ-2608-0012", referenceProject: "FTS Traceability", priceDate: "2026-08-12", remark: "", owner: "u2", status: "Completed" },
  { id: "i3", categoryCode: "01", category: "Hardware", subcategory: "HMI", module: "Operator Station", itemCode: "HW-HMI-001", description: "Touch Panel 12.1 inch TFT", brand: "Mitsubishi", model: "GT2712-STWD", specification: "1024x768, Ethernet + RS422", supplier: "Mitsubishi Electric Automation", qty: 1, unit: "Set", unitCost: 62500, source: "Previous Estimate", referenceNo: "EST-2604-0022", referenceProject: "AAPICO Press Line", priceDate: "2026-04-18", remark: "Confirm current list price", owner: "u2", status: "Completed" },
  { id: "i4", categoryCode: "01", category: "Hardware", subcategory: "Sensor", module: "Traceability Station", itemCode: "HW-SEN-001", description: "Barcode Reader 2D fixed mount", brand: "KEYENCE", model: "SR-X300", specification: "Auto focus, Ethernet", supplier: "Keyence (Thailand) Co., Ltd.", qty: 2, unit: "Pcs", unitCost: 48500, source: "Supplier Quotation", referenceNo: "SQ-2608-0012", referenceProject: "—", priceDate: "2026-08-12", remark: "", owner: "u2", status: "Completed" },
  { id: "i5", categoryCode: "01", category: "Hardware", subcategory: "Sensor", module: "Conveyor Station", itemCode: "HW-SEN-002", description: "Photoelectric sensor set", brand: "Omron", model: "E3Z-T61A", specification: "Through-beam, 15 m", supplier: "Omron Electronics", qty: 12, unit: "Pcs", unitCost: 2450, source: "Purchase Price", referenceNo: "PO-2605-0331", referenceProject: "DENSO Leak Test", priceDate: "2026-05-06", remark: "", owner: "u2", status: "Completed" },
  { id: "i6", categoryCode: "01", category: "Hardware", subcategory: "Network", module: "Network & Server", itemCode: "HW-NET-001", description: "Industrial Managed Switch 8 Port", brand: "Cisco", model: "IE-3300-8T2S", specification: "Layer 2, DIN rail", supplier: "Cisco Partner — Datacom Thai", qty: 2, unit: "Pcs", unitCost: 41200, source: "Supplier Quotation", referenceNo: "SQ-2607-0044", referenceProject: "—", priceDate: "2026-07-02", remark: "", owner: "u1", status: "Completed" },
  { id: "i7", categoryCode: "01", category: "Hardware", subcategory: "Industrial PC", module: "Network & Server", itemCode: "HW-IPC-001", description: "Industrial PC i7 / 32GB / 1TB SSD", brand: "Advantech", model: "IPC-240", specification: "Fanless, 24/7 operation", supplier: "Cisco Partner — Datacom Thai", qty: 1, unit: "Set", unitCost: 98500, source: "Budgetary Price", referenceNo: "BQ-2606-0009", referenceProject: "—", priceDate: "2026-06-01", remark: "Budgetary — confirm before approval", owner: "u1", status: "Waiting Supplier" },
  { id: "i8", categoryCode: "02", category: "Software", subcategory: "Application Software", module: "Traceability Software", itemCode: "SW-APP-001", description: "Traceability application license", brand: "—", model: "TT-TRACE-STD", specification: "10 station license", supplier: "TOMAS TECH", qty: 1, unit: "Lot", unitCost: 120000, source: "Master Price", referenceNo: "MP-2601-0003", referenceProject: "FTS Traceability", priceDate: "2026-01-15", remark: "Internal standard package", owner: "u3", status: "Completed" },
  { id: "i9", categoryCode: "02", category: "Software", subcategory: "Database", module: "Traceability Software", itemCode: "SW-DB-001", description: "SQL Server Standard runtime license", brand: "Microsoft", model: "SQL-STD-2Core", specification: "2 core pack", supplier: "Cisco Partner — Datacom Thai", qty: 2, unit: "Pcs", unitCost: 68000, source: "Supplier Quotation", referenceNo: "SQ-2607-0051", referenceProject: "—", priceDate: "2026-07-21", remark: "", owner: "u3", status: "Completed" },
  { id: "i10", categoryCode: "02", category: "Software", subcategory: "Dashboard", module: "Dashboard & Report", itemCode: "SW-DSH-001", description: "OEE dashboard module", brand: "—", model: "TT-DASH", specification: "5 line dashboard", supplier: "TOMAS TECH", qty: 1, unit: "Lot", unitCost: 85000, source: "Previous Project Cost", referenceNo: "PRJ-2512-0007", referenceProject: "Meiji OEE Phase 1", priceDate: "2025-12-10", remark: "Price is older than 180 days", owner: "u3", status: "Completed" },
  { id: "i11", categoryCode: "03", category: "Electrical", subcategory: "Control Panel", module: "Main Control Box", itemCode: "EL-PNL-001", description: "Main control panel 800x1800x600", brand: "Schneider", model: "CP-MAIN-01", specification: "IP54, with air conditioner", supplier: "Thai Control Panel Works", qty: 1, unit: "Set", unitCost: 168000, source: "Supplier Quotation", referenceNo: "SQ-2608-0018", referenceProject: "—", priceDate: "2026-08-19", remark: "", owner: "u4", status: "Completed" },
  { id: "i12", categoryCode: "03", category: "Electrical", subcategory: "Wiring", module: "Field Wiring & Cable Tray", itemCode: "EL-WIR-001", description: "Field wiring material and cable tray", brand: "—", model: "—", specification: "Complete set for 2 stations", supplier: "Thai Control Panel Works", qty: 1, unit: "Lot", unitCost: 96000, source: "Manual Estimate", referenceNo: "", referenceProject: "", priceDate: "2026-08-20", remark: "No price reference attached", owner: "u4", status: "In Progress" },
  { id: "i13", categoryCode: "04", category: "Mechanical", subcategory: "Fabrication", module: "In-feed Conveyor", itemCode: "ME-FAB-001", description: "Conveyor frame and guarding fabrication", brand: "—", model: "MF-CNV-2600", specification: "SS400 painted, 6 m", supplier: "TP Precision Fabrication", qty: 1, unit: "Lot", unitCost: 235000, source: "Supplier Quotation", referenceNo: "SQ-2608-0021", referenceProject: "—", priceDate: "2026-08-22", remark: "", owner: "u5", status: "Completed" },
  { id: "i14", categoryCode: "04", category: "Mechanical", subcategory: "Assembly", module: "Safety Fence", itemCode: "ME-ASM-001", description: "Safety fence with interlock door", brand: "—", model: "SF-2400", specification: "H2000, 24 m perimeter", supplier: "TP Precision Fabrication", qty: 1, unit: "Lot", unitCost: 88000, source: "Previous Estimate", referenceNo: "EST-2605-0031", referenceProject: "TTS Robot Cell", priceDate: "2026-05-28", remark: "", owner: "u5", status: "Completed" },
  { id: "i15", categoryCode: "05", category: "Robot", subcategory: "Robot", module: "Cobot Cell", itemCode: "RB-ROB-001", description: "Collaborative robot 6 axis / 12 kg", brand: "DENSO", model: "COBOTTA PRO 1300", specification: "Reach 1300 mm", supplier: "DENSO Wave Robotics", qty: 1, unit: "Set", unitCost: 1180000, source: "Supplier Quotation", referenceNo: "SQ-2608-0025", referenceProject: "—", priceDate: "2026-08-25", remark: "Includes controller and teach pendant", owner: "u10", status: "Completed" },
  { id: "i16", categoryCode: "05", category: "Robot", subcategory: "Gripper", module: "Cobot Cell", itemCode: "RB-GRP-001", description: "Vacuum gripper with sensor feedback", brand: "—", model: "VG-4Z", specification: "4 zone, custom pad", supplier: "TP Precision Fabrication", qty: 1, unit: "Set", unitCost: 142000, source: "Budgetary Price", referenceNo: "BQ-2608-0004", referenceProject: "—", priceDate: "2026-08-05", remark: "", owner: "u10", status: "Waiting Supplier" },
  { id: "i17", categoryCode: "08", category: "Transportation", subcategory: "Transportation", module: "Delivery", itemCode: "TR-DEL-001", description: "Delivery to Amata City and unloading", brand: "—", model: "—", specification: "6 wheel truck with crane", supplier: "Local Logistics", qty: 2, unit: "Service", unitCost: 12500, source: "Previous Project Cost", referenceNo: "PRJ-2603-0011", referenceProject: "Astemo Line 3", priceDate: "2026-03-11", remark: "", owner: "u7", status: "Completed" },
];

const manhours0001: ManhourLine[] = [
  { id: "m1", package: "Design & Engineering", activity: "System Design", department: "IoT", level: "Senior Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 8, hoursPerDay: 8, dailyRate: 5250, owner: "u1", remark: "" },
  { id: "m6", package: "Design & Engineering", activity: "Electrical Design", department: "Electrical", level: "Middle Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 7, hoursPerDay: 8, dailyRate: 3750, owner: "u4", remark: "" },
  { id: "m7", package: "Design & Engineering", activity: "Mechanical Design", department: "Mechanical", level: "Senior Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 9, hoursPerDay: 8, dailyRate: 4750, owner: "u5", remark: "" },
  { id: "m2", package: "Programming & Software", activity: "PLC Programming", department: "PLC", level: "Middle Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 10, hoursPerDay: 8, dailyRate: 4000, owner: "u2", remark: "" },
  { id: "m3", package: "Programming & Software", activity: "HMI Programming", department: "PLC", level: "Junior Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 6, hoursPerDay: 8, dailyRate: 2500, owner: "u2", remark: "" },
  { id: "m4", package: "Programming & Software", activity: "Software Development", department: "Software", level: "Senior Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 2, manDays: 12, hoursPerDay: 8, dailyRate: 5500, owner: "u3", remark: "" },
  { id: "m5", package: "Programming & Software", activity: "Database Development", department: "Software", level: "Middle Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 8, hoursPerDay: 8, dailyRate: 4500, owner: "u3", remark: "" },
  { id: "m8", package: "Programming & Software", activity: "Robot Programming", department: "Robotics", level: "Middle Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 8, hoursPerDay: 8, dailyRate: 4250, owner: "u10", remark: "" },
  { id: "m15", package: "Panel Assembly & Wiring", activity: "Panel Wiring & Assembly", department: "Electrical", level: "Middle Engineer", costType: "Engineering", provider: "Supplier", supplier: "Thai Control Panel Works", quotationNo: "SQ-2608-0038", priceDate: "2026-08-26", engineers: 2, manDays: 8, hoursPerDay: 8, dailyRate: 3200, owner: "u4", remark: "Outsourced wiring team, rate per quotation" },
  { id: "m9", package: "Factory Acceptance Test", activity: "FAT", department: "PLC", level: "Middle Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 2, manDays: 3, hoursPerDay: 8, dailyRate: 4000, owner: "u2", remark: "Customer witnesses the test at our workshop" },
  { id: "m10", package: "Site Installation", activity: "On-site Installation", department: "Electrical", level: "Middle Engineer", costType: "Installation", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 2, manDays: 5, hoursPerDay: 8, dailyRate: 4700, owner: "u4", remark: "Amata City — night shift allowed" },
  { id: "m16", package: "Site Installation", activity: "On-site Installation", department: "Electrical", level: "Middle Engineer", costType: "Installation", provider: "Supplier", supplier: "Thai Control Panel Works", quotationNo: "SQ-2608-0039", priceDate: "2026-08-27", engineers: 3, manDays: 4, hoursPerDay: 8, dailyRate: 3500, owner: "u4", remark: "Contractor electricians for cable pulling" },
  { id: "m11", package: "Commissioning", activity: "Commissioning", department: "IoT", level: "Senior Engineer", costType: "Installation", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 6, hoursPerDay: 8, dailyRate: 6550, owner: "u1", remark: "" },
  { id: "m14", package: "Commissioning", activity: "SAT", department: "PLC", level: "Middle Engineer", costType: "Installation", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 2, hoursPerDay: 8, dailyRate: 5000, owner: "u2", remark: "" },
  { id: "m12", package: "Documentation & Project Management", activity: "Documentation", department: "Software", level: "Junior Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 4, hoursPerDay: 8, dailyRate: 2750, owner: "u3", remark: "" },
  { id: "m13", package: "Documentation & Project Management", activity: "Project Management", department: "PMO", level: "Lead Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 10, hoursPerDay: 8, dailyRate: 6000, owner: "u7", remark: "" },
];

const expenses0001: ExpenseLine[] = [
  { id: "x1", package: "Site Installation", type: "Travel", description: "Van transfer, engineering team to Amata City", costType: "Installation", supplier: "", reference: "", qty: 2, unit: "Trip", unitCost: 3500, owner: "u4", remark: "Round trip per week" },
  { id: "x2", package: "Site Installation", type: "Accommodation", description: "Hotel near site, 2 rooms x 5 nights", costType: "Installation", supplier: "", reference: "", qty: 10, unit: "Night", unitCost: 1200, owner: "u4", remark: "" },
  { id: "x3", package: "Site Installation", type: "Per Diem", description: "Site allowance, 2 engineers x 5 days", costType: "Installation", supplier: "", reference: "", qty: 10, unit: "Day", unitCost: 500, owner: "u4", remark: "Company standard rate" },
  { id: "x4", package: "Commissioning", type: "Accommodation", description: "Hotel near site, 1 room x 8 nights", costType: "Installation", supplier: "", reference: "", qty: 8, unit: "Night", unitCost: 1200, owner: "u1", remark: "" },
  { id: "x5", package: "Commissioning", type: "Per Diem", description: "Site allowance during commissioning and SAT", costType: "Installation", supplier: "", reference: "", qty: 8, unit: "Day", unitCost: 500, owner: "u1", remark: "" },
  { id: "x6", package: "Commissioning", type: "Travel", description: "Fuel and expressway toll", costType: "Installation", supplier: "", reference: "", qty: 1, unit: "Lot", unitCost: 2500, owner: "u1", remark: "" },
];

const others0001: OtherCostLine[] = [
  { id: "o1", category: "Outsource", description: "Panel wiring outsource service", qty: 1, unit: "Lot", unitCost: 120000, remark: "Thai Control Panel Works" },
  { id: "o2", category: "Other Cost", description: "Spare part package (1 year)", qty: 1, unit: "Lot", unitCost: 45000, remark: "Customer standard requirement" },
];

const assignments0001: Assignment[] = [
  { id: "a1", section: "01 Hardware", ownerId: "u2", supportId: "u1", dueDate: "2026-09-01", status: "Completed", progress: 100, comment: "All supplier prices confirmed." },
  { id: "a2", section: "02 Software", ownerId: "u3", supportId: "u1", dueDate: "2026-09-02", status: "In Progress", progress: 60, comment: "Dashboard scope still under discussion." },
  { id: "a3", section: "03 Electrical", ownerId: "u4", supportId: "u2", dueDate: "2026-09-01", status: "Completed", progress: 100, comment: "" },
  { id: "a4", section: "04 Mechanical", ownerId: "u5", supportId: "—", dueDate: "2026-09-02", status: "Waiting Supplier", progress: 40, comment: "Waiting fabrication quotation revision." },
  { id: "a5", section: "05 Robot", ownerId: "u10", supportId: "u5", dueDate: "2026-09-02", status: "In Progress", progress: 70, comment: "Gripper design under review." },
  { id: "a6", section: "06 Engineering", ownerId: "u1", supportId: "u7", dueDate: "2026-09-03", status: "Completed", progress: 100, comment: "" },
];

const revisions0001: Revision[] = [
  { id: "rv1", code: "R00", reason: "Initial Estimate", description: "First estimate issued from RFQ and kickoff meeting.", createdBy: "Nattaphon Prasert", createdAt: "2026-08-10", reviewedBy: "Yuki Tanaka", status: "Superseded", total: 2860000 },
  { id: "rv2", code: "R01", reason: "Customer Requirement Change", description: "Added safety fence and interlock door after safety review.", createdBy: "Nattaphon Prasert", createdAt: "2026-08-18", reviewedBy: "Yuki Tanaka", status: "Superseded", total: 3105000 },
  { id: "rv3", code: "R02", reason: "Supplier Price Update", description: "Changed PLC specification to KV-8000 and updated supplier prices.", createdBy: "Trin Tintanee", createdAt: "2026-08-26", reviewedBy: "—", status: "Active", total: 0 },
];

const items0002: CostItem[] = [
  { id: "j1", categoryCode: "01", category: "Hardware", subcategory: "Industrial PC", module: "Edge Gateway Set", itemCode: "HW-IPC-002", description: "Edge gateway with 4G modem", brand: "Advantech", model: "ECU-1051", specification: "Modbus / MQTT", supplier: "Cisco Partner — Datacom Thai", qty: 8, unit: "Pcs", unitCost: 32500, source: "Supplier Quotation", referenceNo: "SQ-2608-0031", referenceProject: "—", priceDate: "2026-08-24", remark: "", owner: "u1", status: "Completed" },
  { id: "j2", categoryCode: "01", category: "Hardware", subcategory: "Sensor", module: "Metering Point", itemCode: "HW-SEN-010", description: "Three phase power meter", brand: "Schneider", model: "PM2230", specification: "Modbus RTU", supplier: "Schneider Electric Thailand", qty: 24, unit: "Pcs", unitCost: 11800, source: "Purchase Price", referenceNo: "PO-2607-0210", referenceProject: "TTS Energy Phase 1", priceDate: "2026-07-14", remark: "", owner: "u1", status: "Completed" },
  { id: "j3", categoryCode: "02", category: "Software", subcategory: "Dashboard", module: "Energy Dashboard", itemCode: "SW-DSH-002", description: "Energy monitoring dashboard", brand: "—", model: "TT-ENERGY", specification: "24 meter points", supplier: "TOMAS TECH", qty: 1, unit: "Lot", unitCost: 180000, source: "Master Price", referenceNo: "MP-2601-0008", referenceProject: "—", priceDate: "2026-01-15", remark: "", owner: "u3", status: "In Progress" },
];

const manhours0002: ManhourLine[] = [
  { id: "n1", package: "Design & Engineering", activity: "System Design", department: "IoT", level: "Senior Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 5, hoursPerDay: 8, dailyRate: 5250, owner: "u1", remark: "" },
  { id: "n2", package: "Programming & Software", activity: "Software Development", department: "Software", level: "Middle Engineer", costType: "Engineering", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 1, manDays: 15, hoursPerDay: 8, dailyRate: 4500, owner: "u3", remark: "" },
  { id: "n3", package: "Site Installation", activity: "On-site Installation", department: "Electrical", level: "Middle Engineer", costType: "Installation", provider: "Internal", supplier: "", quotationNo: "", priceDate: "", engineers: 2, manDays: 6, hoursPerDay: 8, dailyRate: 4700, owner: "u4", remark: "Weekend work only — no production stop allowed" },
];

const expenses0002: ExpenseLine[] = [
  { id: "y1", package: "Site Installation", type: "Travel", description: "Team transfer to Rayong, weekend shifts", costType: "Installation", supplier: "", reference: "", qty: 3, unit: "Trip", unitCost: 4200, owner: "u4", remark: "" },
  { id: "y2", package: "Site Installation", type: "Accommodation", description: "Hotel 2 rooms x 3 nights", costType: "Installation", supplier: "", reference: "", qty: 6, unit: "Night", unitCost: 1100, owner: "u4", remark: "" },
];

export const ESTIMATES: Estimate[] = [
  {
    id: "e1", no: "EST-2608-0001", inquiryNo: "INQ-2608-0001", customerId: "c1",
    projectName: "Cobot Picking Machine", projectType: "Robot", ownerId: "u1",
    revision: "R02", createdDate: "2026-08-10", dueDate: "2026-09-03",
    status: "Engineering Review", progress: 82, updatedAt: "2026-08-28 16:40",
    contingencyRate: 3,
    items: items0001, manhours: manhours0001, expenses: expenses0001, others: others0001,
    assignments: assignments0001, revisions: revisions0001,
  },
  {
    id: "e2", no: "EST-2608-0002", inquiryNo: "INQ-2608-0004", customerId: "c6",
    projectName: "IoT Energy Monitoring Phase 2", projectType: "IoT", ownerId: "u1",
    revision: "R00", createdDate: "2026-08-15", dueDate: "2026-09-05",
    status: "Engineering Input", progress: 55, updatedAt: "2026-08-27 11:12",
    contingencyRate: 3,
    items: items0002, manhours: manhours0002, expenses: expenses0002, others: [],
    assignments: [
      { id: "b1", section: "01 Hardware", ownerId: "u1", supportId: "—", dueDate: "2026-09-03", status: "Completed", progress: 100, comment: "" },
      { id: "b2", section: "02 Software", ownerId: "u3", supportId: "—", dueDate: "2026-09-04", status: "In Progress", progress: 45, comment: "Dashboard layout pending customer feedback." },
      { id: "b3", section: "03 Electrical", ownerId: "u4", supportId: "—", dueDate: "2026-09-04", status: "Not Started", progress: 0, comment: "" },
    ],
    revisions: [
      { id: "rb1", code: "R00", reason: "Initial Estimate", description: "Phase 2 scope from site survey.", createdBy: "Nattaphon Prasert", createdAt: "2026-08-15", reviewedBy: "—", status: "Active", total: 0 },
    ],
  },
  {
    id: "e3", no: "EST-2608-0003", inquiryNo: "INQ-2608-0006", customerId: "c2",
    projectName: "Leak Test Data Collection System", projectType: "Data Collection", ownerId: "u2",
    revision: "R01", createdDate: "2026-08-18", dueDate: "2026-08-27",
    status: "Waiting Supplier Price", progress: 61, updatedAt: "2026-08-26 09:05",
    contingencyRate: 3,
    items: items0002.slice(0, 2), manhours: manhours0002.slice(0, 2), expenses: [], others: [],
    assignments: [
      { id: "d1", section: "01 Hardware", ownerId: "u2", supportId: "—", dueDate: "2026-08-25", status: "Waiting Supplier", progress: 55, comment: "Waiting Keyence vision quotation." },
      { id: "d2", section: "02 Software", ownerId: "u3", supportId: "—", dueDate: "2026-08-26", status: "In Progress", progress: 65, comment: "" },
    ],
    revisions: [
      { id: "rd1", code: "R00", reason: "Initial Estimate", description: "Initial estimate.", createdBy: "Trin Tintanee", createdAt: "2026-08-18", reviewedBy: "Yuki Tanaka", status: "Superseded", total: 1240000 },
      { id: "rd2", code: "R01", reason: "Scope Change", description: "Added second test station.", createdBy: "Trin Tintanee", createdAt: "2026-08-24", reviewedBy: "—", status: "Active", total: 0 },
    ],
  },
  {
    id: "e4", no: "EST-2607-0018", inquiryNo: "INQ-2607-0018", customerId: "c4",
    projectName: "Press Line Vision Inspection", projectType: "Vision", ownerId: "u3",
    revision: "R01", createdDate: "2026-07-22", dueDate: "2026-08-14",
    status: "Approved", progress: 100, updatedAt: "2026-08-14 17:30",
    contingencyRate: 3,
    items: items0001.slice(0, 8), manhours: manhours0001.slice(0, 6), expenses: [], others: [],
    assignments: [
      { id: "f1", section: "01 Hardware", ownerId: "u2", supportId: "—", dueDate: "2026-08-10", status: "Reviewed", progress: 100, comment: "" },
      { id: "f2", section: "02 Software", ownerId: "u3", supportId: "—", dueDate: "2026-08-10", status: "Reviewed", progress: 100, comment: "" },
    ],
    revisions: [
      { id: "rf1", code: "R00", reason: "Initial Estimate", description: "Initial estimate.", createdBy: "Kanokwan Sirisuk", createdAt: "2026-07-22", reviewedBy: "Yuki Tanaka", status: "Superseded", total: 1650000 },
      { id: "rf2", code: "R01", reason: "Cost Update", description: "Updated camera supplier price.", createdBy: "Kanokwan Sirisuk", createdAt: "2026-08-11", reviewedBy: "Yuki Tanaka", status: "Locked", total: 1712000 },
    ],
  },
  {
    id: "e5", no: "EST-2608-0005", inquiryNo: "INQ-2608-0009", customerId: "c3",
    projectName: "Packing Line AMR Transfer", projectType: "AMR", ownerId: "u10",
    revision: "R00", createdDate: "2026-08-24", dueDate: "2026-08-31",
    status: "Estimate Completed", progress: 96, updatedAt: "2026-08-28 08:20",
    contingencyRate: 3,
    items: items0001.slice(10, 16), manhours: manhours0001.slice(6, 12), expenses: expenses0001.slice(0, 3), others: [],
    assignments: [
      { id: "g1", section: "05 Robot", ownerId: "u10", supportId: "u5", dueDate: "2026-08-29", status: "Completed", progress: 100, comment: "" },
      { id: "g2", section: "04 Mechanical", ownerId: "u5", supportId: "—", dueDate: "2026-08-29", status: "Completed", progress: 100, comment: "" },
    ],
    revisions: [
      { id: "rg1", code: "R00", reason: "Initial Estimate", description: "Initial estimate from layout study.", createdBy: "Thanaphon Rit", createdAt: "2026-08-24", reviewedBy: "—", status: "Active", total: 0 },
    ],
  },
  {
    id: "e6", no: "EST-2608-0006", inquiryNo: "INQ-2608-0011", customerId: "c5",
    projectName: "WMS / WCS Integration", projectType: "WMS", ownerId: "u3",
    revision: "R00", createdDate: "2026-08-26", dueDate: "2026-08-25",
    status: "Engineering Input", progress: 34, updatedAt: "2026-08-28 13:44",
    contingencyRate: 3,
    items: items0002.slice(2), manhours: manhours0002, expenses: expenses0002, others: [],
    assignments: [
      { id: "h1", section: "02 Software", ownerId: "u3", supportId: "u1", dueDate: "2026-08-25", status: "In Progress", progress: 34, comment: "Interface specification not received." },
    ],
    revisions: [
      { id: "rh1", code: "R00", reason: "Initial Estimate", description: "Initial estimate.", createdBy: "Kanokwan Sirisuk", createdAt: "2026-08-26", reviewedBy: "—", status: "Active", total: 0 },
    ],
  },
];

/* --------------------------------------------------------------------------
   Inquiries
   -------------------------------------------------------------------------- */

export const INQUIRIES: Inquiry[] = [
  {
    id: "q1", no: "INQ-2608-0001", date: "2026-08-06", customerId: "c1", contact: "K. Somsak Chareon",
    projectName: "Cobot Picking Machine", projectType: "Robot", rfqNo: "RFQ-AST-26-0142",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u1", dueDate: "2026-09-03",
    priority: "High", status: "Engineering Review", progress: 82, revision: "R02", updatedAt: "2026-08-28 16:40",
    requirement: "Automatic picking of moulded parts from conveyor into KLT boxes with traceability of each box by 2D code.",
    background: "Manual picking on line 3 causes ergonomic issues and inconsistent cycle time. Customer targets one operator reduction per shift.",
    scopeSummary: "Cobot cell with vacuum gripper, in-feed conveyor, 2D code reading, box traceability and MES upload.",
    technical: "Cycle time 6 s/pick, part weight 2.4 kg, KLT 600x400. Safety category PLd. Interface to customer MES over REST.",
    targetDelivery: "2027-01-15", siteLocation: "Amata City, Chonburi — Plant 2, Line 3",
    standard: "Astemo Safety Standard AS-114, ISO 10218-2", special: "Customer requests DENSO cobot to match existing spare parts.",
    remark: "Estimate must be ready before customer budget meeting on 5 Sep 2026.",
    attachments: [
      { id: "at1", name: "RFQ-AST-26-0142.pdf", category: "Customer RFQ", size: "1.8 MB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-06" },
      { id: "at2", name: "Line3-Layout-Rev C.dwg", category: "Layout", size: "4.2 MB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-06" },
      { id: "at3", name: "Part-Drawing-KLT600.pdf", category: "Drawing", size: "980 KB", uploadedBy: "Sarawut Chaiyo", uploadedAt: "2026-08-11" },
      { id: "at4", name: "Kickoff-Meeting-2026-08-08.docx", category: "Meeting Record", size: "320 KB", uploadedBy: "Nattaphon Prasert", uploadedAt: "2026-08-08" },
      { id: "at5", name: "AS-114-Safety-Standard.pdf", category: "Customer Standard", size: "2.6 MB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-07" },
    ],
    meetings: [
      {
        id: "mt1", date: "2026-08-08", type: "Kickoff Meeting",
        participants: ["Nattaphon Prasert", "Chatchai Pimsen", "K. Somsak Chareon", "K. Preecha (Production)"],
        requirement: "Pick 2.4 kg moulded part from conveyor to KLT box, 6 s cycle, with traceability per box.",
        technical: "Discussed cobot vs industrial robot. Customer prefers cobot due to floor space and existing spare parts.",
        decision: "Use DENSO COBOTTA PRO 1300 as base machine.",
        openPoint: "Gripper concept for 3 part variants not yet fixed.",
        actionItem: "Prepare gripper concept and confirm cycle time simulation.",
        owner: "Sarawut Chaiyo", dueDate: "2026-08-15", attachment: "Kickoff-Meeting-2026-08-08.docx",
      },
      {
        id: "mt2", date: "2026-08-15", type: "Technical Review",
        participants: ["Nattaphon Prasert", "Sarawut Chaiyo", "Thanaphon Rit", "K. Somsak Chareon"],
        requirement: "Safety review requires full fence with interlock door, not light curtain only.",
        technical: "Reach analysis confirmed 1300 mm arm is sufficient. Vacuum gripper 4 zone selected.",
        decision: "Add safety fence with interlock door to scope — estimate revision required.",
        openPoint: "Fence supplier price to be confirmed.",
        actionItem: "Create estimate revision R01 including safety fence.",
        owner: "Nattaphon Prasert", dueDate: "2026-08-18",
      },
      {
        id: "mt3", date: "2026-08-25", type: "Customer Meeting",
        participants: ["Nattaphon Prasert", "Chatchai Pimsen", "K. Somsak Chareon"],
        requirement: "Customer confirmed MES interface must use REST API with token authentication.",
        technical: "PLC changed to KEYENCE KV-8000 to match customer standard on new lines.",
        decision: "Update PLC specification and re-price hardware — revision R02.",
        openPoint: "Industrial PC budgetary price still to be confirmed by supplier.",
        actionItem: "Request firm quotation for industrial PC and gripper.",
        owner: "Trin Tintanee", dueDate: "2026-09-01",
      },
    ],
    estimateId: "e1",
  },
  {
    id: "q2", no: "INQ-2608-0004", date: "2026-08-13", customerId: "c6", contact: "K. Wichai P.",
    projectName: "IoT Energy Monitoring Phase 2", projectType: "IoT", rfqNo: "RFQ-TTS-26-0088",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u1", dueDate: "2026-09-05",
    priority: "Normal", status: "Estimating", progress: 55, revision: "R00", updatedAt: "2026-08-27 11:12",
    requirement: "Extend energy monitoring to 24 additional machines with dashboard and monthly report.",
    background: "Phase 1 covered 12 machines and is in operation since March 2026.",
    scopeSummary: "24 power meters, 8 edge gateways, dashboard extension, integration with existing database.",
    technical: "Modbus RTU to edge gateway, MQTT to on-premise server. Existing SQL database reused.",
    targetDelivery: "2026-12-20", siteLocation: "Eastern Seaboard, Rayong",
    standard: "TTS IT Security Policy 2025", special: "No production stop allowed — installation on weekend only.",
    remark: "",
    attachments: [
      { id: "at6", name: "RFQ-TTS-26-0088.pdf", category: "Customer RFQ", size: "740 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-13" },
      { id: "at7", name: "Machine-List-Phase2.xlsx", category: "Equipment List", size: "180 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-13" },
    ],
    meetings: [
      {
        id: "mt4", date: "2026-08-19", type: "Site Survey",
        participants: ["Nattaphon Prasert", "Peerapat Wongchai", "K. Wichai P."],
        requirement: "Confirmed 24 measuring points and available cabinet space.",
        technical: "3 machines need CT installation on busbar — extra work.",
        decision: "Include busbar CT installation in estimate.",
        openPoint: "Weekend working cost to be included in man-hour.",
        actionItem: "Add weekend installation man-days.",
        owner: "Peerapat Wongchai", dueDate: "2026-08-26",
      },
    ],
    estimateId: "e2",
  },
  {
    id: "q3", no: "INQ-2608-0006", date: "2026-08-17", customerId: "c2", contact: "K. Nipon Wattana",
    projectName: "Leak Test Data Collection System", projectType: "Data Collection", rfqNo: "RFQ-DNS-26-0451",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u2", dueDate: "2026-08-27",
    priority: "Urgent", status: "Waiting Supplier Price", progress: 61, revision: "R01", updatedAt: "2026-08-26 09:05",
    requirement: "Collect leak test results from 2 stations and store with part traceability.",
    background: "Quality issue traced to missing leak test records in July 2026.",
    scopeSummary: "Data collection from leak tester, 2D code reading, database storage, NG interlock.",
    technical: "Leak tester provides RS232 output. NG part must not pass to next station.",
    targetDelivery: "2026-11-30", siteLocation: "Bangpakong, Chachoengsao",
    standard: "DENSO Quality Standard DQS-08", special: "System must run without network connection for 24 hours.",
    remark: "Overdue — supplier price for vision system still missing.",
    attachments: [
      { id: "at8", name: "RFQ-DNS-26-0451.pdf", category: "Customer RFQ", size: "1.1 MB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-17" },
    ],
    meetings: [
      {
        id: "mt5", date: "2026-08-21", type: "Technical Review",
        participants: ["Trin Tintanee", "Kanokwan Sirisuk", "K. Nipon Wattana"],
        requirement: "Customer added a second test station after the first review.",
        technical: "Two RS232 channels needed, PLC I/O increased.",
        decision: "Create revision R01 with second station.",
        openPoint: "Vision system supplier price outstanding.",
        actionItem: "Request quotation from Keyence.",
        owner: "Trin Tintanee", dueDate: "2026-08-25",
      },
    ],
    estimateId: "e3",
  },
  {
    id: "q4", no: "INQ-2608-0009", date: "2026-08-22", customerId: "c3", contact: "K. Pornthip S.",
    projectName: "Packing Line AMR Transfer", projectType: "AMR", rfqNo: "RFQ-MEI-26-0033",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u10", dueDate: "2026-08-31",
    priority: "High", status: "Estimate Completed", progress: 96, revision: "R00", updatedAt: "2026-08-28 08:20",
    requirement: "Transfer finished goods pallets from packing line to warehouse staging using AMR.",
    background: "Forklift traffic in packing area causes safety concerns.",
    scopeSummary: "2 AMR units, charging station, traffic management software, WMS interface.",
    technical: "Payload 600 kg, 12 trips per hour, floor condition epoxy.",
    targetDelivery: "2027-02-28", siteLocation: "Bangna, Samut Prakan",
    standard: "Meiji Food Safety Standard", special: "AMR must be food-grade washable surface.",
    remark: "",
    attachments: [
      { id: "at9", name: "RFQ-MEI-26-0033.pdf", category: "Customer RFQ", size: "920 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-22" },
      { id: "at10", name: "Warehouse-Layout.pdf", category: "Layout", size: "3.1 MB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-22" },
    ],
    meetings: [],
    estimateId: "e5",
  },
  {
    id: "q5", no: "INQ-2608-0011", date: "2026-08-25", customerId: "c5", contact: "K. Manop K.",
    projectName: "WMS / WCS Integration", projectType: "WMS", rfqNo: "RFQ-FTS-26-0210",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u3", dueDate: "2026-08-25",
    priority: "High", status: "Estimating", progress: 34, revision: "R00", updatedAt: "2026-08-28 13:44",
    requirement: "Integrate existing WMS with new automated storage and retrieval system.",
    background: "New ASRS supplier delivers WCS only; integration to SAP is out of their scope.",
    scopeSummary: "WMS interface development, WCS message routing, exception handling dashboard.",
    technical: "SAP IDoc interface, WCS communicates via TCP socket protocol.",
    targetDelivery: "2027-03-31", siteLocation: "Lamphun",
    standard: "Fujikura IT Integration Guideline", special: "Interface specification from ASRS supplier not yet received.",
    remark: "Overdue — waiting interface specification from customer.",
    attachments: [
      { id: "at11", name: "RFQ-FTS-26-0210.pdf", category: "Customer RFQ", size: "1.4 MB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-25" },
    ],
    meetings: [],
    estimateId: "e6",
  },
  {
    id: "q6", no: "INQ-2608-0013", date: "2026-08-27", customerId: "c4", contact: "K. Adisak T.",
    projectName: "Stamping Line Traceability", projectType: "Traceability", rfqNo: "RFQ-AAP-26-0119",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u2", dueDate: "2026-09-10",
    priority: "Normal", status: "New", progress: 0, revision: "—", updatedAt: "2026-08-27 15:02",
    requirement: "Mark and trace stamped parts through 4 press machines.",
    background: "Customer audit requires part-level traceability from Q1 2027.",
    scopeSummary: "Laser marking interface, 2D code reading, database, report.",
    technical: "To be confirmed in kickoff meeting.",
    targetDelivery: "2027-03-01", siteLocation: "Hi-Tech Industrial Estate, Ayutthaya",
    standard: "IATF 16949", special: "",
    remark: "Estimate owner assigned, kickoff meeting to be scheduled.",
    attachments: [
      { id: "at12", name: "RFQ-AAP-26-0119.pdf", category: "Customer RFQ", size: "660 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-27" },
    ],
    meetings: [],
  },
  {
    id: "q7", no: "INQ-2608-0014", date: "2026-08-28", customerId: "c1", contact: "K. Somsak Chareon",
    projectName: "Line 5 Control Panel Renewal", projectType: "Electrical", rfqNo: "RFQ-AST-26-0151",
    salesOwner: "Chatchai Pimsen", estimateOwnerId: "u4", dueDate: "2026-09-12",
    priority: "Low", status: "New", progress: 0, revision: "—", updatedAt: "2026-08-28 09:15",
    requirement: "Replace obsolete control panel and migrate PLC program.",
    background: "Existing panel is 18 years old, spare parts no longer available.",
    scopeSummary: "New panel, PLC migration, wiring, commissioning during shutdown.",
    technical: "Migration from Mitsubishi A series to iQ-R series.",
    targetDelivery: "2026-12-28", siteLocation: "Amata City, Chonburi — Plant 1",
    standard: "Astemo Electrical Standard AE-22", special: "Work during year-end shutdown only.",
    remark: "",
    attachments: [],
    meetings: [],
  },
];

/* --------------------------------------------------------------------------
   Price library
   -------------------------------------------------------------------------- */


/**
 * Historic inquiries, generated deterministically so the lists are long enough
 * to page through. Real installations will have hundreds of these.
 */
const ARCHIVE_SEED = [
  { project: "Press Shop Andon System", type: "IoT", customer: "c4", owner: "u1", status: "Approved" as InquiryStatus },
  { project: "Weld Line Traceability", type: "Traceability", customer: "c1", owner: "u2", status: "Approved" as InquiryStatus },
  { project: "Warehouse WMS Upgrade", type: "WMS", customer: "c5", owner: "u3", status: "Estimating" as InquiryStatus },
  { project: "Injection Machine Monitoring", type: "Data Collection", customer: "c6", owner: "u1", status: "Approved" as InquiryStatus },
  { project: "Robot Cell Retrofit", type: "Robot", customer: "c2", owner: "u10", status: "Engineering Review" as InquiryStatus },
  { project: "Packaging Vision Check", type: "Vision", customer: "c3", owner: "u2", status: "Approved" as InquiryStatus },
  { project: "AGV Material Feed", type: "AMR", customer: "c4", owner: "u10", status: "Cancelled" as InquiryStatus },
  { project: "Boiler Energy Dashboard", type: "IoT", customer: "c6", owner: "u1", status: "Approved" as InquiryStatus },
  { project: "Assembly Line PLC Renewal", type: "PLC", customer: "c1", owner: "u2", status: "Estimate Completed" as InquiryStatus },
  { project: "Paint Shop Data Logger", type: "Data Collection", customer: "c2", owner: "u4", status: "Approved" as InquiryStatus },
  { project: "Cold Store WCS Interface", type: "WCS", customer: "c3", owner: "u3", status: "Waiting Supplier Price" as InquiryStatus },
  { project: "Torque Tool Traceability", type: "Traceability", customer: "c4", owner: "u2", status: "Approved" as InquiryStatus },
  { project: "Utility Meter Rollout", type: "IoT", customer: "c5", owner: "u1", status: "Approved" as InquiryStatus },
  { project: "Conveyor Safety Upgrade", type: "Electrical", customer: "c1", owner: "u4", status: "Estimating" as InquiryStatus },
  { project: "Label Print & Apply Cell", type: "Automation", customer: "c3", owner: "u5", status: "Approved" as InquiryStatus },
  { project: "Auto Warehouse Feasibility", type: "Auto Warehouse", customer: "c5", owner: "u3", status: "Engineering Review" as InquiryStatus },
  { project: "Machine Downtime Analytics", type: "Software", customer: "c6", owner: "u3", status: "Approved" as InquiryStatus },
  { project: "Gripper Redesign Study", type: "Mechanical", customer: "c2", owner: "u5", status: "Approved" as InquiryStatus },
  { project: "Line 7 Control Panel", type: "Electrical", customer: "c1", owner: "u4", status: "Approved" as InquiryStatus },
  { project: "Palletiser Retrofit", type: "Robot", customer: "c3", owner: "u10", status: "Estimate Completed" as InquiryStatus },
];

const ARCHIVE_INQUIRIES: Inquiry[] = ARCHIVE_SEED.map((seed, index) => {
  const month = 3 + (index % 5);
  const day = 4 + ((index * 3) % 24);
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `2026-${pad(month)}-${pad(day)}`;
  const due = `2026-${pad(month + 1)}-${pad(Math.min(day + 4, 28))}`;
  const priorities: Priority[] = ["Normal", "High", "Low", "Urgent"];
  return {
    id: `qa${index + 1}`,
    no: `INQ-26${pad(month)}-${pad(index + 20)}${index % 7}`,
    date,
    customerId: seed.customer,
    contact: "—",
    projectName: seed.project,
    projectType: seed.type,
    rfqNo: `RFQ-26-0${100 + index}`,
    salesOwner: "Chatchai Pimsen",
    estimateOwnerId: seed.owner,
    dueDate: due,
    priority: priorities[index % priorities.length],
    status: seed.status,
    progress: seed.status === "Approved" ? 100 : seed.status === "Cancelled" ? 0 : 40 + ((index * 7) % 50),
    revision: seed.status === "Approved" ? "R01" : "R00",
    updatedAt: `${date} 16:30`,
    requirement: "Archived inquiry kept for price and effort reference.",
    background: "",
    scopeSummary: seed.project,
    technical: "",
    targetDelivery: due,
    siteLocation: "—",
    standard: "",
    special: "",
    remark: "",
    attachments: [],
    meetings: [],
  };
});

// Archived inquiries join the live list once both are defined.
INQUIRIES.push(...ARCHIVE_INQUIRIES);

export const PRICE_LIBRARY: PriceRecord[] = [
  {
    id: "p1", itemCode: "HW-PLC-001", description: "PLC CPU Unit with EtherNet/IP", brand: "KEYENCE", model: "KV-8000",
    category: "Hardware / PLC", supplier: "Keyence (Thailand) Co., Ltd.", unit: "Set", price: 76000,
    priceDate: "2026-08-12", source: "Supplier Quotation", reference: "SQ-2608-0012", project: "FTS Traceability", lastUsed: "2026-08-18",
    history: [
      { date: "2026-01-20", price: 72000, supplier: "Keyence (Thailand) Co., Ltd.", reference: "SQ-2601-0004", project: "AAPICO Press Line", uploadedBy: "Trin Tintanee" },
      { date: "2026-04-14", price: 74500, supplier: "Keyence (Thailand) Co., Ltd.", reference: "SQ-2604-0019", project: "DENSO Leak Test", uploadedBy: "Trin Tintanee" },
      { date: "2026-08-12", price: 76000, supplier: "Keyence (Thailand) Co., Ltd.", reference: "SQ-2608-0012", project: "FTS Traceability", uploadedBy: "Nattaphon Prasert" },
    ],
  },
  {
    id: "p2", itemCode: "HW-HMI-001", description: "Touch Panel 12.1 inch TFT", brand: "Mitsubishi", model: "GT2712-STWD",
    category: "Hardware / HMI", supplier: "Mitsubishi Electric Automation", unit: "Set", price: 62500,
    priceDate: "2026-04-18", source: "Previous Estimate", reference: "EST-2604-0022", project: "AAPICO Press Line", lastUsed: "2026-08-26",
    history: [
      { date: "2025-11-05", price: 59800, supplier: "Mitsubishi Electric Automation", reference: "SQ-2511-0021", project: "TTS Robot Cell", uploadedBy: "Peerapat Wongchai" },
      { date: "2026-04-18", price: 62500, supplier: "Mitsubishi Electric Automation", reference: "EST-2604-0022", project: "AAPICO Press Line", uploadedBy: "Trin Tintanee" },
    ],
  },
  {
    id: "p3", itemCode: "HW-SEN-001", description: "Barcode Reader 2D fixed mount", brand: "KEYENCE", model: "SR-X300",
    category: "Hardware / Sensor", supplier: "Keyence (Thailand) Co., Ltd.", unit: "Pcs", price: 48500,
    priceDate: "2026-08-12", source: "Supplier Quotation", reference: "SQ-2608-0012", project: "—", lastUsed: "2026-08-26",
    history: [
      { date: "2026-02-11", price: 46000, supplier: "Keyence (Thailand) Co., Ltd.", reference: "SQ-2602-0008", project: "Meiji OEE", uploadedBy: "Trin Tintanee" },
      { date: "2026-08-12", price: 48500, supplier: "Keyence (Thailand) Co., Ltd.", reference: "SQ-2608-0012", project: "—", uploadedBy: "Trin Tintanee" },
    ],
  },
  {
    id: "p4", itemCode: "HW-NET-001", description: "Industrial Managed Switch 8 Port", brand: "Cisco", model: "IE-3300-8T2S",
    category: "Hardware / Network", supplier: "Cisco Partner — Datacom Thai", unit: "Pcs", price: 41200,
    priceDate: "2026-07-02", source: "Supplier Quotation", reference: "SQ-2607-0044", project: "—", lastUsed: "2026-08-20",
    history: [
      { date: "2025-09-18", price: 38900, supplier: "Cisco Partner — Datacom Thai", reference: "SQ-2509-0033", project: "FTS Traceability", uploadedBy: "Nattaphon Prasert" },
      { date: "2026-07-02", price: 41200, supplier: "Cisco Partner — Datacom Thai", reference: "SQ-2607-0044", project: "—", uploadedBy: "Nattaphon Prasert" },
    ],
  },
  {
    id: "p5", itemCode: "RB-ROB-001", description: "Collaborative robot 6 axis / 12 kg", brand: "DENSO", model: "COBOTTA PRO 1300",
    category: "Robot / Robot", supplier: "DENSO Wave Robotics", unit: "Set", price: 1180000,
    priceDate: "2026-08-25", source: "Supplier Quotation", reference: "SQ-2608-0025", project: "—", lastUsed: "2026-08-26",
    history: [
      { date: "2026-03-04", price: 1145000, supplier: "DENSO Wave Robotics", reference: "SQ-2603-0007", project: "Astemo Line 3", uploadedBy: "Thanaphon Rit" },
      { date: "2026-08-25", price: 1180000, supplier: "DENSO Wave Robotics", reference: "SQ-2608-0025", project: "—", uploadedBy: "Thanaphon Rit" },
    ],
  },
  {
    id: "p6", itemCode: "RB-AMR-001", description: "AMR unit payload 600 kg", brand: "HIKROBOT", model: "MR-Q3-600LE-D",
    category: "Robot / AMR", supplier: "HIKROBOT Thailand", unit: "Set", price: 985000,
    priceDate: "2026-06-19", source: "Supplier Quotation", reference: "SQ-2606-0028", project: "Meiji AMR Study", lastUsed: "2026-08-24",
    history: [
      { date: "2025-12-02", price: 950000, supplier: "HIKROBOT Thailand", reference: "SQ-2512-0016", project: "—", uploadedBy: "Thanaphon Rit" },
      { date: "2026-06-19", price: 985000, supplier: "HIKROBOT Thailand", reference: "SQ-2606-0028", project: "Meiji AMR Study", uploadedBy: "Thanaphon Rit" },
    ],
  },
  {
    id: "p7", itemCode: "EL-PNL-001", description: "Main control panel 800x1800x600", brand: "Schneider", model: "CP-MAIN-01",
    category: "Electrical / Control Panel", supplier: "Thai Control Panel Works", unit: "Set", price: 168000,
    priceDate: "2026-08-19", source: "Supplier Quotation", reference: "SQ-2608-0018", project: "—", lastUsed: "2026-08-26",
    history: [
      { date: "2026-02-27", price: 158000, supplier: "Thai Control Panel Works", reference: "SQ-2602-0012", project: "DENSO Leak Test", uploadedBy: "Peerapat Wongchai" },
      { date: "2026-08-19", price: 168000, supplier: "Thai Control Panel Works", reference: "SQ-2608-0018", project: "—", uploadedBy: "Peerapat Wongchai" },
    ],
  },
  {
    id: "p8", itemCode: "SW-DSH-001", description: "OEE dashboard module", brand: "—", model: "TT-DASH",
    category: "Software / Dashboard", supplier: "TOMAS TECH", unit: "Lot", price: 85000,
    priceDate: "2025-12-10", source: "Previous Project Cost", reference: "PRJ-2512-0007", project: "Meiji OEE Phase 1", lastUsed: "2026-08-26",
    history: [
      { date: "2025-06-16", price: 78000, supplier: "TOMAS TECH", reference: "PRJ-2506-0002", project: "TTS Energy Phase 1", uploadedBy: "Kanokwan Sirisuk" },
      { date: "2025-12-10", price: 85000, supplier: "TOMAS TECH", reference: "PRJ-2512-0007", project: "Meiji OEE Phase 1", uploadedBy: "Kanokwan Sirisuk" },
    ],
  },
  {
    id: "p9", itemCode: "HW-IPC-002", description: "Edge gateway with 4G modem", brand: "Advantech", model: "ECU-1051",
    category: "Hardware / Industrial PC", supplier: "Cisco Partner — Datacom Thai", unit: "Pcs", price: 32500,
    priceDate: "2026-08-24", source: "Supplier Quotation", reference: "SQ-2608-0031", project: "—", lastUsed: "2026-08-27",
    history: [
      { date: "2026-01-09", price: 30800, supplier: "Cisco Partner — Datacom Thai", reference: "SQ-2601-0002", project: "TTS Energy Phase 1", uploadedBy: "Nattaphon Prasert" },
      { date: "2026-08-24", price: 32500, supplier: "Cisco Partner — Datacom Thai", reference: "SQ-2608-0031", project: "—", uploadedBy: "Nattaphon Prasert" },
    ],
  },
  {
    id: "p10", itemCode: "HW-SEN-010", description: "Three phase power meter", brand: "Schneider", model: "PM2230",
    category: "Hardware / Sensor", supplier: "Schneider Electric Thailand", unit: "Pcs", price: 11800,
    priceDate: "2026-07-14", source: "Purchase Price", reference: "PO-2607-0210", project: "TTS Energy Phase 1", lastUsed: "2026-08-27",
    history: [
      { date: "2025-10-30", price: 11200, supplier: "Schneider Electric Thailand", reference: "PO-2510-0155", project: "TTS Energy Phase 1", uploadedBy: "Peerapat Wongchai" },
      { date: "2026-07-14", price: 11800, supplier: "Schneider Electric Thailand", reference: "PO-2607-0210", project: "TTS Energy Phase 1", uploadedBy: "Peerapat Wongchai" },
    ],
  },
  {
    id: "p11", itemCode: "ME-FAB-001", description: "Conveyor frame and guarding fabrication", brand: "—", model: "MF-CNV-2600",
    category: "Mechanical / Fabrication", supplier: "TP Precision Fabrication", unit: "Lot", price: 235000,
    priceDate: "2026-08-22", source: "Supplier Quotation", reference: "SQ-2608-0021", project: "—", lastUsed: "2026-08-26",
    history: [
      { date: "2026-05-28", price: 228000, supplier: "TP Precision Fabrication", reference: "SQ-2605-0017", project: "TTS Robot Cell", uploadedBy: "Sarawut Chaiyo" },
      { date: "2026-08-22", price: 235000, supplier: "TP Precision Fabrication", reference: "SQ-2608-0021", project: "—", uploadedBy: "Sarawut Chaiyo" },
    ],
  },
  {
    id: "p12", itemCode: "HW-PLC-010", description: "PLC CPU iQ-R series", brand: "Mitsubishi", model: "R08CPU",
    category: "Hardware / PLC", supplier: "Mitsubishi Electric Automation", unit: "Set", price: 58900,
    priceDate: "2026-06-05", source: "Supplier Quotation", reference: "SQ-2606-0011", project: "AAPICO Press Line", lastUsed: "2026-08-11",
    history: [
      { date: "2025-08-14", price: 55200, supplier: "Mitsubishi Electric Automation", reference: "SQ-2508-0009", project: "—", uploadedBy: "Trin Tintanee" },
      { date: "2026-06-05", price: 58900, supplier: "Mitsubishi Electric Automation", reference: "SQ-2606-0011", project: "AAPICO Press Line", uploadedBy: "Trin Tintanee" },
    ],
  },
];

/* --------------------------------------------------------------------------
   Supplier quotations, missing prices, audit log, notifications
   -------------------------------------------------------------------------- */

export const QUOTATIONS: SupplierQuotation[] = [
  { id: "sq1", no: "SQ-2608-0012", supplier: "Keyence (Thailand) Co., Ltd.", receivedDate: "2026-08-12", validUntil: "2026-10-11", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 231600, uploadedBy: "Trin Tintanee", status: "Valid", file: "SQ-2608-0012-Keyence.pdf", fileType: "PDF" },
  { id: "sq2", no: "SQ-2608-0018", supplier: "Thai Control Panel Works", receivedDate: "2026-08-19", validUntil: "2026-09-18", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 168000, uploadedBy: "Peerapat Wongchai", status: "Expiring", file: "SQ-2608-0018-Panel.pdf", fileType: "PDF" },
  { id: "sq3", no: "SQ-2608-0021", supplier: "TP Precision Fabrication", receivedDate: "2026-08-22", validUntil: "2026-11-20", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 235000, uploadedBy: "Sarawut Chaiyo", status: "Valid", file: "SQ-2608-0021-Fabrication.xlsx", fileType: "Excel" },
  { id: "sq4", no: "SQ-2608-0025", supplier: "DENSO Wave Robotics", receivedDate: "2026-08-25", validUntil: "2026-10-24", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 1180000, uploadedBy: "Thanaphon Rit", status: "Valid", file: "SQ-2608-0025-Denso.pdf", fileType: "PDF" },
  { id: "sq5", no: "SQ-2608-0031", supplier: "Cisco Partner — Datacom Thai", receivedDate: "2026-08-24", validUntil: "2026-09-23", inquiryNo: "INQ-2608-0004", project: "IoT Energy Monitoring Phase 2", currency: "THB", amount: 260000, uploadedBy: "Nattaphon Prasert", status: "Expiring", file: "SQ-2608-0031-Datacom.pdf", fileType: "PDF" },
  { id: "sq6", no: "SQ-2607-0044", supplier: "Cisco Partner — Datacom Thai", receivedDate: "2026-07-02", validUntil: "2026-08-31", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 82400, uploadedBy: "Nattaphon Prasert", status: "Expiring", file: "SQ-2607-0044-Switch.pdf", fileType: "PDF" },
  { id: "sq7", no: "SQ-2606-0028", supplier: "HIKROBOT Thailand", receivedDate: "2026-06-19", validUntil: "2026-08-18", inquiryNo: "INQ-2608-0009", project: "Packing Line AMR Transfer", currency: "THB", amount: 1970000, uploadedBy: "Thanaphon Rit", status: "Expired", file: "SQ-2606-0028-Hikrobot.pdf", fileType: "PDF" },
  { id: "sq8", no: "SQ-2606-0011", supplier: "Mitsubishi Electric Automation", receivedDate: "2026-06-05", validUntil: "2026-09-03", inquiryNo: "INQ-2607-0018", project: "Press Line Vision Inspection", currency: "THB", amount: 121400, uploadedBy: "Trin Tintanee", status: "Expiring", file: "SQ-2606-0011-Mitsubishi.xlsx", fileType: "Excel" },
  { id: "sq9", no: "SQ-2608-0034", supplier: "Schneider Electric Thailand", receivedDate: "2026-08-26", validUntil: "2026-10-25", inquiryNo: "INQ-2608-0004", project: "IoT Energy Monitoring Phase 2", currency: "THB", amount: 283200, uploadedBy: "Peerapat Wongchai", status: "Valid", file: "SQ-2608-0034-Schneider.pdf", fileType: "PDF" },
  { id: "sq11", no: "SQ-2608-0038", supplier: "Thai Control Panel Works", receivedDate: "2026-08-26", validUntil: "2026-10-25", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 51200, uploadedBy: "Peerapat Wongchai", status: "Valid", file: "SQ-2608-0038-Wiring-Manpower.pdf", fileType: "PDF" },
  { id: "sq12", no: "SQ-2608-0039", supplier: "Thai Control Panel Works", receivedDate: "2026-08-27", validUntil: "2026-10-26", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", currency: "THB", amount: 42000, uploadedBy: "Peerapat Wongchai", status: "Valid", file: "SQ-2608-0039-Site-Manpower.xlsx", fileType: "Excel" },
  { id: "sq10", no: "SQ-2605-0017", supplier: "TP Precision Fabrication", receivedDate: "2026-05-28", validUntil: "2026-07-27", inquiryNo: "INQ-2605-0009", project: "TTS Robot Cell", currency: "THB", amount: 228000, uploadedBy: "Sarawut Chaiyo", status: "Superseded", file: "SQ-2605-0017-Fab.jpg", fileType: "Image" },
];

export const MISSING_PRICES: MissingPrice[] = [
  { id: "mp1", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", item: "Industrial PC i7 / 32GB / 1TB SSD", brand: "Advantech", model: "IPC-240", supplier: "Cisco Partner — Datacom Thai", requestedBy: "Nattaphon Prasert", requestDate: "2026-08-26", requiredDate: "2026-09-01", status: "Waiting Supplier", ownerId: "u1" },
  { id: "mp2", inquiryNo: "INQ-2608-0001", project: "Cobot Picking Machine", item: "Vacuum gripper with sensor feedback", brand: "—", model: "VG-4Z", supplier: "TP Precision Fabrication", requestedBy: "Thanaphon Rit", requestDate: "2026-08-25", requiredDate: "2026-09-01", status: "Requested", ownerId: "u10" },
  { id: "mp3", inquiryNo: "INQ-2608-0006", project: "Leak Test Data Collection System", item: "Vision controller with camera set", brand: "KEYENCE", model: "CV-X420", supplier: "Keyence (Thailand) Co., Ltd.", requestedBy: "Trin Tintanee", requestDate: "2026-08-21", requiredDate: "2026-08-26", status: "Waiting Supplier", ownerId: "u2" },
  { id: "mp4", inquiryNo: "INQ-2608-0009", project: "Packing Line AMR Transfer", item: "AMR charging station", brand: "HIKROBOT", model: "MR-CS-01", supplier: "HIKROBOT Thailand", requestedBy: "Thanaphon Rit", requestDate: "2026-08-24", requiredDate: "2026-08-29", status: "Received", ownerId: "u10" },
  { id: "mp5", inquiryNo: "INQ-2608-0011", project: "WMS / WCS Integration", item: "ASRS interface middleware license", brand: "—", model: "—", supplier: "—", requestedBy: "Kanokwan Sirisuk", requestDate: "—", requiredDate: "2026-09-02", status: "Not Requested", ownerId: "u3" },
  { id: "mp6", inquiryNo: "INQ-2608-0004", project: "IoT Energy Monitoring Phase 2", item: "Busbar CT 400/5A", brand: "Schneider", model: "CT-400", supplier: "Schneider Electric Thailand", requestedBy: "Peerapat Wongchai", requestDate: "2026-08-26", requiredDate: "2026-09-03", status: "Price Updated", ownerId: "u4" },
];

export const AUDIT_LOG: AuditEntry[] = [
  { id: "al1", at: "2026-08-28 16:40", user: "Nattaphon Prasert", estimate: "EST-2608-0001", revision: "R02", module: "Workflow", action: "Submitted for engineering review", before: "Estimate Completed", after: "Engineering Review", reason: "All sections completed except industrial PC price" },
  { id: "al2", at: "2026-08-28 14:22", user: "Trin Tintanee", estimate: "EST-2608-0001", revision: "R02", module: "Hardware", action: "Changed PLC Unit Cost", before: "71,768 THB", after: "76,000 THB", reason: "Supplier quotation updated" },
  { id: "al3", at: "2026-08-28 11:07", user: "Trin Tintanee", estimate: "EST-2608-0001", revision: "R02", module: "Hardware", action: "Changed PLC model", before: "R08CPU (Mitsubishi)", after: "KV-8000 (KEYENCE)", reason: "Customer standard for new lines" },
  { id: "al4", at: "2026-08-27 17:35", user: "Kanokwan Sirisuk", estimate: "EST-2608-0002", revision: "R00", module: "Software", action: "Added cost item", before: "—", after: "Energy monitoring dashboard 180,000 THB", reason: "Scope from site survey" },
  { id: "al5", at: "2026-08-26 15:10", user: "Nattaphon Prasert", estimate: "EST-2608-0001", revision: "R02", module: "Revision", action: "Created revision R02", before: "R01", after: "R02", reason: "Supplier Price Update" },
  { id: "al6", at: "2026-08-26 09:05", user: "Trin Tintanee", estimate: "EST-2608-0003", revision: "R01", module: "Missing Price", action: "Requested supplier price", before: "Not Requested", after: "Waiting Supplier", reason: "Vision controller price required" },
  { id: "al7", at: "2026-08-25 13:48", user: "Thanaphon Rit", estimate: "EST-2608-0001", revision: "R02", module: "Robot", action: "Updated cobot unit cost", before: "1,145,000 THB", after: "1,180,000 THB", reason: "New quotation SQ-2608-0025" },
  { id: "al8", at: "2026-08-24 10:20", user: "Sarawut Chaiyo", estimate: "EST-2608-0001", revision: "R02", module: "Mechanical", action: "Updated fabrication quantity", before: "2 Lot", after: "1 Lot", reason: "Scope corrected after layout review" },
  { id: "al9", at: "2026-08-18 09:00", user: "Nattaphon Prasert", estimate: "EST-2608-0001", revision: "R01", module: "Revision", action: "Created revision R01", before: "R00", after: "R01", reason: "Customer Requirement Change — safety fence" },
  { id: "al10", at: "2026-08-14 17:30", user: "Yuki Tanaka", estimate: "EST-2607-0018", revision: "R01", module: "Approval", action: "Approved estimate cost", before: "Engineering Review", after: "Approved", reason: "Scope and cost verified" },
  { id: "al11", at: "2026-08-12 08:41", user: "Trin Tintanee", estimate: "EST-2608-0001", revision: "R01", module: "Price Library", action: "Uploaded supplier quotation", before: "—", after: "SQ-2608-0012", reason: "Keyence hardware package" },
  { id: "al12", at: "2026-08-10 09:12", user: "Nattaphon Prasert", estimate: "EST-2608-0001", revision: "R00", module: "Estimate", action: "Created estimate", before: "—", after: "EST-2608-0001 R00", reason: "From INQ-2608-0001" },
];

export const NOTIFICATIONS: Notification[] = [
  { id: "nt1", kind: "review", title: "EST-2608-0001 waiting review", detail: "Submitted by Nattaphon Prasert · R02", at: "10 min ago", unread: true },
  { id: "nt2", kind: "supplier", title: "Supplier price still missing", detail: "Industrial PC IPC-240 · required 01-Sep-2026", at: "2 hours ago", unread: true },
  { id: "nt3", kind: "overdue", title: "EST-2608-0006 is overdue", detail: "WMS / WCS Integration · due 25-Aug-2026", at: "Today 08:10", unread: true },
  { id: "nt4", kind: "due", title: "Estimate due in 3 days", detail: "EST-2608-0002 · IoT Energy Monitoring Phase 2", at: "Yesterday", unread: false },
  { id: "nt5", kind: "supplier", title: "Supplier quotation expired", detail: "SQ-2606-0028 HIKROBOT · expired 18-Aug-2026", at: "Yesterday", unread: false },
  { id: "nt6", kind: "assign", title: "New inquiry assigned to you", detail: "INQ-2608-0013 Stamping Line Traceability", at: "2 days ago", unread: false },
];

/* --------------------------------------------------------------------------
   Report series (kept static so charts and tables agree)
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Resource plan — what every engineer is holding, and when

   One row per piece of work an engineer is committed to, whether it is an
   inquiry being estimated, a section of an estimate, or a task on a project
   that has already been won. This is what the Gantt and the workload views
   read from.
   -------------------------------------------------------------------------- */

export type WorkItemType = "Inquiry" | "Estimate" | "Project";

export type WorkItem = {
  id: string;
  type: WorkItemType;
  ownerId: string;
  reference: string;
  title: string;
  customer: string;
  start: string;
  end: string;
  /** Committed effort in man-days over the period. */
  manDays: number;
  progress: number;
  status: string;
  /** Route target so a bar can be clicked through to the record. */
  linkInquiryId?: string;
  linkEstimateId?: string;
};

/** Working days an engineer can commit per week. */
export const CAPACITY_PER_WEEK = 5;

export const WORK_ITEMS: WorkItem[] = [
  // Nattaphon Prasert — IoT, senior
  { id: "w1", type: "Inquiry", ownerId: "u1", reference: "INQ-2608-0001", title: "Cobot Picking Machine — estimate owner", customer: "ASTEMO", start: "2026-08-10", end: "2026-09-03", manDays: 14, progress: 82, status: "Engineering Review", linkInquiryId: "q1", linkEstimateId: "e1" },
  { id: "w2", type: "Inquiry", ownerId: "u1", reference: "INQ-2608-0004", title: "IoT Energy Monitoring Phase 2 — estimate owner", customer: "TTS", start: "2026-08-15", end: "2026-09-05", manDays: 5, progress: 55, status: "Estimating", linkInquiryId: "q2", linkEstimateId: "e2" },
  { id: "w3", type: "Project", ownerId: "u1", reference: "PRJ-2606-0004", title: "FTS Traceability — commissioning support", customer: "FTS", start: "2026-09-08", end: "2026-09-25", manDays: 8, progress: 0, status: "Planned" },
  { id: "w4", type: "Project", ownerId: "u1", reference: "PRJ-2610-0011", title: "Cobot cell commissioning (if awarded)", customer: "ASTEMO", start: "2026-10-05", end: "2026-10-16", manDays: 6, progress: 0, status: "Tentative" },

  // Trin Tintanee — PLC, middle
  { id: "w5", type: "Inquiry", ownerId: "u2", reference: "INQ-2608-0006", title: "Leak Test Data Collection — estimate owner", customer: "DENSO", start: "2026-08-18", end: "2026-08-27", manDays: 6, progress: 61, status: "Waiting Supplier Price", linkInquiryId: "q3", linkEstimateId: "e3" },
  { id: "w6", type: "Estimate", ownerId: "u2", reference: "EST-2608-0001", title: "01 Hardware section", customer: "ASTEMO", start: "2026-08-20", end: "2026-09-01", manDays: 4, progress: 100, status: "Completed", linkEstimateId: "e1" },
  { id: "w7", type: "Inquiry", ownerId: "u2", reference: "INQ-2608-0013", title: "Stamping Line Traceability — estimate owner", customer: "AAPICO", start: "2026-08-28", end: "2026-09-10", manDays: 7, progress: 5, status: "New", linkInquiryId: "q6" },
  { id: "w8", type: "Project", ownerId: "u2", reference: "PRJ-2607-0018", title: "Press Line Vision — PLC programming", customer: "AAPICO", start: "2026-09-14", end: "2026-10-09", manDays: 18, progress: 0, status: "Planned" },

  // Kanokwan Sirisuk — Software, senior
  { id: "w9", type: "Inquiry", ownerId: "u3", reference: "INQ-2608-0011", title: "WMS / WCS Integration — estimate owner", customer: "FTS", start: "2026-08-25", end: "2026-08-25", manDays: 9, progress: 34, status: "Estimating", linkInquiryId: "q5", linkEstimateId: "e6" },
  { id: "w10", type: "Estimate", ownerId: "u3", reference: "EST-2608-0001", title: "02 Software section", customer: "ASTEMO", start: "2026-08-22", end: "2026-09-04", manDays: 6, progress: 60, status: "In Progress", linkEstimateId: "e1" },
  { id: "w11", type: "Project", ownerId: "u3", reference: "PRJ-2512-0007", title: "Meiji OEE dashboard — phase 2", customer: "MEIJI", start: "2026-09-07", end: "2026-10-02", manDays: 20, progress: 10, status: "In Progress" },

  // Peerapat Wongchai — Electrical, middle
  { id: "w12", type: "Estimate", ownerId: "u4", reference: "EST-2608-0001", title: "03 Electrical section", customer: "ASTEMO", start: "2026-08-19", end: "2026-09-01", manDays: 5, progress: 100, status: "Completed", linkEstimateId: "e1" },
  { id: "w13", type: "Project", ownerId: "u4", reference: "PRJ-2605-0009", title: "TTS Energy — site installation", customer: "TTS", start: "2026-09-05", end: "2026-09-19", manDays: 10, progress: 0, status: "Planned" },
  { id: "w14", type: "Inquiry", ownerId: "u4", reference: "INQ-2608-0014", title: "Line 5 Control Panel Renewal — estimate owner", customer: "ASTEMO", start: "2026-08-28", end: "2026-09-12", manDays: 6, progress: 10, status: "New", linkInquiryId: "q7" },

  // Sarawut Chaiyo — Mechanical, senior
  { id: "w15", type: "Estimate", ownerId: "u5", reference: "EST-2608-0001", title: "04 Mechanical section", customer: "ASTEMO", start: "2026-08-18", end: "2026-09-02", manDays: 9, progress: 40, status: "Waiting Supplier", linkEstimateId: "e1" },
  { id: "w16", type: "Project", ownerId: "u5", reference: "PRJ-2605-0031", title: "TTS Robot Cell — fabrication follow-up", customer: "TTS", start: "2026-09-03", end: "2026-09-30", manDays: 12, progress: 20, status: "In Progress" },

  // Thanaphon Rit — Robotics, middle
  { id: "w17", type: "Inquiry", ownerId: "u10", reference: "INQ-2608-0009", title: "Packing Line AMR Transfer — estimate owner", customer: "MEIJI", start: "2026-08-24", end: "2026-08-31", manDays: 8, progress: 96, status: "Estimate Completed", linkInquiryId: "q4", linkEstimateId: "e5" },
  { id: "w18", type: "Estimate", ownerId: "u10", reference: "EST-2608-0001", title: "05 Robot section", customer: "ASTEMO", start: "2026-08-20", end: "2026-09-02", manDays: 8, progress: 70, status: "In Progress", linkEstimateId: "e1" },
  { id: "w19", type: "Project", ownerId: "u10", reference: "PRJ-2610-0011", title: "Astemo cobot — robot programming", customer: "ASTEMO", start: "2026-10-19", end: "2026-11-13", manDays: 20, progress: 0, status: "Tentative" },

  // Areeya Boonmee — PMO
  { id: "w20", type: "Project", ownerId: "u7", reference: "PMO-2608", title: "Project management — running projects", customer: "Multiple", start: "2026-08-03", end: "2026-10-30", manDays: 22, progress: 40, status: "In Progress" },
];

/* --------------------------------------------------------------------------
   Purchase requisition

   Raised once an inquiry has been won and turned into a project. Every line
   points back at the estimate item it came from, so a rounded estimate figure
   can be compared with what is actually being bought.
   -------------------------------------------------------------------------- */

export const PR_STATUSES = ["Draft", "Submitted", "Approved", "Ordered", "Rejected"] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export type PrLine = {
  id: string;
  /** Cost item this line was created from — empty when it was not estimated. */
  estimateItemId: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string;
  supplier: string;
  qty: number;
  unit: string;
  unitCost: number;
  /** Snapshot of the estimate at the time the PR was raised. */
  estimateQty: number;
  estimateUnitCost: number;
  remark: string;
};

export type PurchaseRequisition = {
  id: string;
  no: string;
  projectNo: string;
  projectName: string;
  estimateId: string;
  estimateNo: string;
  revision: string;
  customer: string;
  requesterId: string;
  approverId: string;
  createdDate: string;
  requiredDate: string;
  status: PrStatus;
  purpose: string;
  lines: PrLine[];
};

export const PURCHASE_REQUISITIONS: PurchaseRequisition[] = [
  {
    id: "pr1", no: "PR-2608-0001", projectNo: "PRJ-2607-0018", projectName: "Press Line Vision Inspection",
    estimateId: "e4", estimateNo: "EST-2607-0018", revision: "R01", customer: "AAPICO",
    requesterId: "u3", approverId: "u6", createdDate: "2026-08-20", requiredDate: "2026-09-18",
    status: "Approved", purpose: "Long lead control hardware for the vision station.",
    lines: [
      { id: "pl1", estimateItemId: "i1", itemCode: "HW-PLC-001", description: "PLC CPU Unit with EtherNet/IP", brand: "KEYENCE", model: "KV-8000", specification: "Ladder + Motion", supplier: "Keyence (Thailand) Co., Ltd.", qty: 1, unit: "Set", unitCost: 74800, estimateQty: 1, estimateUnitCost: 76000, remark: "Firm price after negotiation" },
      { id: "pl2", estimateItemId: "i2", itemCode: "HW-PLC-002", description: "Expansion I/O Unit 16DI/16DO", brand: "KEYENCE", model: "KV-B16XC", specification: "24VDC sink/source", supplier: "Keyence (Thailand) Co., Ltd.", qty: 6, unit: "Pcs", unitCost: 9650, estimateQty: 4, estimateUnitCost: 9800, remark: "I/O count grew after detailed design" },
      { id: "pl3", estimateItemId: "i4", itemCode: "HW-SEN-001", description: "Barcode Reader 2D fixed mount", brand: "KEYENCE", model: "SR-X300", specification: "Auto focus, Ethernet", supplier: "Keyence (Thailand) Co., Ltd.", qty: 2, unit: "Pcs", unitCost: 51000, estimateQty: 2, estimateUnitCost: 48500, remark: "Price moved since the estimate" },
      { id: "pl4", estimateItemId: "", itemCode: "EL-ACC-001", description: "DIN rail, terminal and marking accessory set", brand: "Phoenix Contact", model: "—", specification: "Complete panel accessory set", supplier: "Thai Control Panel Works", qty: 1, unit: "Lot", unitCost: 8500, estimateQty: 0, estimateUnitCost: 0, remark: "Not estimated separately — was inside the rounded panel figure" },
    ],
  },
  {
    id: "pr2", no: "PR-2608-0002", projectNo: "PRJ-2610-0011", projectName: "Cobot Picking Machine",
    estimateId: "e1", estimateNo: "EST-2608-0001", revision: "R02", customer: "ASTEMO",
    requesterId: "u10", approverId: "u6", createdDate: "2026-08-28", requiredDate: "2026-10-02",
    status: "Submitted", purpose: "Robot and gripper — 10 week lead time, order before kickoff.",
    lines: [
      { id: "pl5", estimateItemId: "i15", itemCode: "RB-ROB-001", description: "Collaborative robot 6 axis / 12 kg", brand: "DENSO", model: "COBOTTA PRO 1300", specification: "Reach 1300 mm, incl. controller", supplier: "DENSO Wave Robotics", qty: 1, unit: "Set", unitCost: 1180000, estimateQty: 1, estimateUnitCost: 1180000, remark: "As quoted SQ-2608-0025" },
      { id: "pl6", estimateItemId: "i16", itemCode: "RB-GRP-001", description: "Vacuum gripper with sensor feedback", brand: "—", model: "VG-4Z", specification: "4 zone, 3 part variants", supplier: "TP Precision Fabrication", qty: 1, unit: "Set", unitCost: 165000, estimateQty: 1, estimateUnitCost: 142000, remark: "Budgetary price in the estimate — firm quotation is higher" },
    ],
  },
  {
    id: "pr3", no: "PR-2609-0003", projectNo: "PRJ-2610-0011", projectName: "Cobot Picking Machine",
    estimateId: "e1", estimateNo: "EST-2608-0001", revision: "R02", customer: "ASTEMO",
    requesterId: "u4", approverId: "u6", createdDate: "2026-08-30", requiredDate: "2026-10-20",
    status: "Draft", purpose: "Control panel and field wiring material.",
    lines: [
      { id: "pl7", estimateItemId: "i11", itemCode: "EL-PNL-001", description: "Main control panel 800x1800x600", brand: "Schneider", model: "CP-MAIN-01", specification: "IP54 with air conditioner", supplier: "Thai Control Panel Works", qty: 1, unit: "Set", unitCost: 172500, estimateQty: 1, estimateUnitCost: 168000, remark: "Air conditioner upgraded to 1000 BTU" },
    ],
  },
];

export const MONTHLY_COST = [
  { month: "Mar", cost: 4.1, count: 9 },
  { month: "Apr", cost: 5.6, count: 12 },
  { month: "May", cost: 3.8, count: 8 },
  { month: "Jun", cost: 6.9, count: 15 },
  { month: "Jul", cost: 5.2, count: 11 },
  { month: "Aug", cost: 7.4, count: 14 },
];

export const DEPARTMENT_MANHOURS = [
  { department: "PLC", manDays: 25, cost: 100000 },
  { department: "Software", manDays: 35, cost: 175000 },
  { department: "Mechanical", manDays: 15, cost: 60000 },
  { department: "Electrical", manDays: 12, cost: 48000 },
  { department: "Robotics", manDays: 8, cost: 34000 },
  { department: "PMO", manDays: 10, cost: 50000 },
];

export const ESTIMATE_LEAD_TIME = [
  { type: "Automation", days: 9 },
  { type: "IoT", days: 6 },
  { type: "Robot", days: 12 },
  { type: "Vision", days: 8 },
  { type: "WMS", days: 14 },
  { type: "Traceability", days: 7 },
];
