/* ==========================================================================
   Engineering Estimate Cost Management System — demonstration dataset.

   Every screen reads from this module so numbers stay consistent across the
   dashboard, the estimate workspace, the reports and the audit log.
   No selling price, margin or markup exists anywhere in this system: the
   application controls internal engineering cost only.
   ========================================================================== */

export { PRODUCT } from "./product";

export type Role =
  | "Admin"
  | "Engineering Manager"
  | "Project Manager"
  | "Engineer"
  | "Sales Engineer"
  | "Purchasing"
  | "Warehouse"
  | "Inventory Controller"
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
  { id: "u11", name: "Chakkrit Manee", initials: "CM", email: "chakkrit.m@tomastc.com", role: "Engineer", department: "Electrical", level: "Middle Engineer" },
  { id: "u12", name: "Suchada Klinmai", initials: "SK", email: "suchada.k@tomastc.com", role: "Purchasing", department: "Purchasing", level: "—" },
  { id: "u13", name: "Prasit Wongsa", initials: "PS", email: "prasit.w@tomastc.com", role: "Warehouse", department: "Warehouse", level: "—" },
  { id: "u14", name: "Malee Chantra", initials: "MC", email: "malee.c@tomastc.com", role: "Inventory Controller", department: "Warehouse", level: "—" },
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
  { id: "i1", categoryCode: "01", category: "Hardware", subcategory: "PLC", module: "PLC Control Panel Set", itemCode: "HW-PLC-001", description: "PLC CPU 64 I/O transistor output", brand: "Mitsubishi", model: "FX5U-64MT/ES", specification: "Ethernet built-in, 64 pt", supplier: "Mitsubishi Electric Automation", qty: 1, unit: "Set", unitCost: 28900, source: "Supplier Quotation", referenceNo: "SQ-2608-0027", referenceProject: "—", priceDate: "2026-08-20", remark: "R03 — re-specified from KEYENCE per customer standard", owner: "u2", status: "Completed" },
  { id: "i2", categoryCode: "01", category: "Hardware", subcategory: "PLC", module: "PLC Control Panel Set", itemCode: "HW-PLC-002", description: "Expansion input unit 16DI", brand: "Mitsubishi", model: "FX5-16EX/ES", specification: "24VDC sink/source", supplier: "Mitsubishi Electric Automation", qty: 2, unit: "Pcs", unitCost: 6400, source: "Supplier Quotation", referenceNo: "SQ-2608-0027", referenceProject: "—", priceDate: "2026-08-20", remark: "", owner: "u2", status: "Completed" },
  { id: "i3", categoryCode: "01", category: "Hardware", subcategory: "HMI", module: "Operator Station", itemCode: "HW-HMI-001", description: "Touch Panel 5.7 inch TFT", brand: "Mitsubishi", model: "GT2505-VTBD", specification: "640x480, Ethernet", supplier: "Mitsubishi Electric Automation", qty: 1, unit: "Set", unitCost: 24500, source: "Supplier Quotation", referenceNo: "SQ-2608-0027", referenceProject: "—", priceDate: "2026-08-20", remark: "", owner: "u2", status: "Completed" },
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
  { id: "rv3", code: "R02", reason: "Supplier Price Update", description: "Changed PLC specification to KV-8000 and updated supplier prices.", createdBy: "Trin Tintanee", createdAt: "2026-08-26", reviewedBy: "Yuki Tanaka", status: "Superseded", total: 3480000 },
  { id: "rv4", code: "R03", reason: "Customer Requirement Change", description: "Panel re-specified to Mitsubishi per Astemo plant standard; customer supplies the safety fence. Approved for order.", createdBy: "Nattaphon Prasert", createdAt: "2026-08-05", reviewedBy: "Yuki Tanaka", status: "Active", total: 0 },
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
    revision: "R03", createdDate: "2026-08-10", dueDate: "2026-09-03",
    status: "Approved", progress: 100, updatedAt: "2026-08-28 16:40",
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

/* --------------------------------------------------------------------------
   Project management

   A won inquiry becomes a project with its own number (PJ26xxxx). The team
   already files everything in OneDrive under fifteen standard folders per
   project; the application mirrors exactly that structure so nobody has to
   learn a new filing system — every document, task and milestone hangs off the
   same folder codes.
   -------------------------------------------------------------------------- */

export const PROJECT_FOLDERS: { code: string; name: string; hint: string }[] = [
  { code: "00", name: "To do list", hint: "Open points and actions for the team" },
  { code: "01", name: "Concept Design and Proposal", hint: "Concept, proposal and customer presentation" },
  { code: "02", name: "Drawing", hint: "Layout, GA, electrical and mechanical drawing" },
  { code: "03", name: "Estimate cost", hint: "Estimate cost sheet and its revisions" },
  { code: "04", name: "Quote", hint: "Commercial documents — filed, not priced here" },
  { code: "05", name: "PO", hint: "Customer purchase order document" },
  { code: "06", name: "Specifications and Documentation", hint: "Specification, standard and requirement" },
  { code: "07", name: "Development", hint: "Program, source and development notes" },
  { code: "08", name: "Schedule", hint: "Project schedule and milestone plan" },
  { code: "09", name: "Installation", hint: "Site installation record and checklist" },
  { code: "10", name: "Report", hint: "Progress, test and handover report" },
  { code: "11", name: "Manual and Document", hint: "Operation and maintenance manual" },
  { code: "12", name: "DATA & EXAMPLE", hint: "Sample data, master data and examples" },
  { code: "13", name: "Pic and Video", hint: "Site photo and video record" },
  { code: "14", name: "Ref", hint: "Reference from other projects" },
];

export const PROJECT_STATUSES = [
  "Planning", "Design", "Development", "Installation", "Commissioning", "Handover", "Closed", "On Hold",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type Project = {
  id: string;
  /** PJ + year + running number, as used on the OneDrive folder name. */
  no: string;
  name: string;
  customerId: string;
  projectType: string;
  status: ProjectStatus;
  managerId: string;
  leadEngineerId: string;
  members: string[];
  inquiryNo: string;
  estimateId: string;
  /** Customer PO number — the document reference only, never its value. */
  poNo: string;
  poDate: string;
  startDate: string;
  targetDelivery: string;
  actualDelivery: string;
  progress: number;
  site: string;
  remark: string;
  /** Where the same project lives on OneDrive / SharePoint. */
  folderPath: string;
};

export const DOC_TYPES = ["PDF", "Excel", "Word", "PowerPoint", "Drawing", "Image", "Video", "Other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export type ProjectDoc = {
  id: string;
  projectId: string;
  /** Folder code from PROJECT_FOLDERS. */
  folder: string;
  name: string;
  type: DocType;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
  remark: string;
};

export const TASK_STATUSES = ["Open", "In Progress", "Blocked", "Done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type ProjectTask = {
  id: string;
  projectId: string;
  title: string;
  ownerId: string;
  due: string;
  status: TaskStatus;
  priority: Priority;
  folder: string;
  remark: string;
};

export type ProjectMilestone = {
  id: string;
  projectId: string;
  name: string;
  folder: string;
  start: string;
  end: string;
  progress: number;
  owner: string;
};

export const PROJECTS: Project[] = [
  {
    id: "p1", no: "PJ260152", name: "Katolec - Ink Jet Machine (Modify)", customerId: "c4", projectType: "Automation",
    status: "Development", managerId: "u7", leadEngineerId: "u2", members: ["u2", "u3", "u4"],
    inquiryNo: "INQ-2608-0001", estimateId: "e1", poNo: "PO-KTL-26-0451", poDate: "2026-08-18",
    startDate: "2026-08-20", targetDelivery: "2026-12-19", actualDelivery: "", progress: 42,
    site: "Ayutthaya — Hi-Tech Industrial Estate", remark: "Modify existing ink jet marking line.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260152] Katolec - Ink Jet Machine (Modify)",
  },
  {
    id: "p2", no: "PJ260104", name: "JCU - Robot Palletizer project", customerId: "c2", projectType: "Robot",
    status: "Installation", managerId: "u7", leadEngineerId: "u10", members: ["u10", "u5", "u4", "u1"],
    inquiryNo: "INQ-2608-0009", estimateId: "e5", poNo: "PO-JCU-26-0088", poDate: "2026-07-02",
    startDate: "2026-07-08", targetDelivery: "2026-09-30", actualDelivery: "", progress: 78,
    site: "Chonburi — Amata City", remark: "Palletizer cell with safety fence and conveyor.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260104] JCU - Robot Palletizer project",
  },
  {
    id: "p3", no: "PJ260052", name: "Monitoring Traceability System & PM Management for TBGT", customerId: "c1",
    projectType: "Traceability", status: "Commissioning", managerId: "u7", leadEngineerId: "u1", members: ["u1", "u3"],
    inquiryNo: "INQ-2608-0004", estimateId: "e2", poNo: "PO-TBGT-26-0210", poDate: "2026-05-14",
    startDate: "2026-05-20", targetDelivery: "2026-09-12", actualDelivery: "", progress: 88,
    site: "Rayong — Eastern Seaboard", remark: "Traceability plus preventive maintenance dashboard.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260052] Monitoring Traceability System & PM Management for TBGT",
  },
  {
    id: "p4", no: "PJ260067", name: "Inspection Machine for SIAM GOSHI", customerId: "c6", projectType: "Vision",
    status: "Design", managerId: "u7", leadEngineerId: "u5", members: ["u5", "u2"],
    inquiryNo: "INQ-2608-0006", estimateId: "e3", poNo: "PO-SGS-26-0117", poDate: "2026-08-06",
    startDate: "2026-08-12", targetDelivery: "2027-01-16", actualDelivery: "", progress: 24,
    site: "Chachoengsao — Bangpakong", remark: "Vision inspection with reject station.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260067] Inspection Machine for SIAM GOSHI",
  },
  {
    id: "p5", no: "PJ260050", name: "Production management system for JCU", customerId: "c2", projectType: "Software",
    status: "Handover", managerId: "u7", leadEngineerId: "u3", members: ["u3", "u1"],
    inquiryNo: "INQ-2607-0018", estimateId: "e4", poNo: "PO-JCU-26-0061", poDate: "2026-04-09",
    startDate: "2026-04-15", targetDelivery: "2026-08-29", actualDelivery: "2026-08-26", progress: 100,
    site: "Chonburi — Amata City", remark: "Production dashboard and shift report.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260050] Production management system for JCU",
  },
  {
    id: "p6", no: "PJ260035", name: "Traceability system for TOYO ADVANCED", customerId: "c5", projectType: "Traceability",
    status: "On Hold", managerId: "u7", leadEngineerId: "u2", members: ["u2"],
    inquiryNo: "INQ-2608-0011", estimateId: "e6", poNo: "", poDate: "",
    startDate: "2026-06-01", targetDelivery: "2026-11-28", actualDelivery: "", progress: 18,
    site: "Lamphun", remark: "Waiting customer decision on line 3 scope.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260035] Traceability system for TOYO ADVANCED",
  },
  {
    id: "p7", no: "PJ260025", name: "Shipping dashboard monitor for AHT", customerId: "c3", projectType: "IoT",
    status: "Closed", managerId: "u7", leadEngineerId: "u1", members: ["u1", "u3"],
    inquiryNo: "INQ-2606-0233", estimateId: "e2", poNo: "PO-AHT-26-0033", poDate: "2026-03-11",
    startDate: "2026-03-18", targetDelivery: "2026-06-28", actualDelivery: "2026-06-24", progress: 100,
    site: "Samut Prakan — Bangna", remark: "Closed and handed over.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260025] Shipping dashboard monitor for AHT",
  },
  {
    id: "p8", no: "PJ260153", name: "Cobot Picking Machine", customerId: "c1", projectType: "Robot",
    status: "Development", managerId: "u7", leadEngineerId: "u1", members: ["u1", "u11", "u4", "u10"],
    inquiryNo: "INQ-2608-0001", estimateId: "e1", poNo: "PO-AST-26-0290", poDate: "2026-08-17",
    startDate: "2026-08-18", targetDelivery: "2027-01-30", actualDelivery: "", progress: 18,
    site: "Chonburi — Amata City", remark: "Cobot picking cell with vision and traceability.",
    folderPath: "IoT Team - Documents / Project - 2026 / [PJ260153] Cobot Picking Machine",
  },
];

export const PROJECT_DOCS: ProjectDoc[] = [
  // PJ260152 Katolec
  { id: "d1", projectId: "p1", folder: "01", name: "Concept-Proposal-Katolec-InkJet-Rev2.pptx", type: "PowerPoint", size: "8.4 MB", uploadedBy: "Trin Tintanee", uploadedAt: "2026-08-21", remark: "Presented on 22-Aug" },
  { id: "d2", projectId: "p1", folder: "02", name: "GA-Drawing-InkJet-Line-RevA.dwg", type: "Drawing", size: "3.1 MB", uploadedBy: "Sarawut Chaiyo", uploadedAt: "2026-08-24", remark: "" },
  { id: "d3", projectId: "p1", folder: "03", name: "EST-2608-0001_R02_EstimateCost.xlsx", type: "Excel", size: "412 KB", uploadedBy: "Nattaphon Prasert", uploadedAt: "2026-08-26", remark: "Exported from the estimate workspace" },
  { id: "d4", projectId: "p1", folder: "04", name: "Quotation-Katolec-2608.pdf", type: "PDF", size: "620 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-14", remark: "Filed for reference only" },
  { id: "d5", projectId: "p1", folder: "05", name: "PO-KTL-26-0451.pdf", type: "PDF", size: "540 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-08-18", remark: "" },
  { id: "d6", projectId: "p1", folder: "06", name: "Customer-Spec-InkJet-Marking.pdf", type: "PDF", size: "2.2 MB", uploadedBy: "Trin Tintanee", uploadedAt: "2026-08-20", remark: "" },
  { id: "d7", projectId: "p1", folder: "07", name: "PLC-Program-KV8000-v0.3.zip", type: "Other", size: "14.8 MB", uploadedBy: "Trin Tintanee", uploadedAt: "2026-08-28", remark: "Work in progress" },
  { id: "d8", projectId: "p1", folder: "08", name: "Project-Schedule-PJ260152.xlsx", type: "Excel", size: "180 KB", uploadedBy: "Areeya Boonmee", uploadedAt: "2026-08-22", remark: "" },
  { id: "d9", projectId: "p1", folder: "12", name: "Sample-Part-Data.csv", type: "Excel", size: "96 KB", uploadedBy: "Kanokwan Sirisuk", uploadedAt: "2026-08-27", remark: "" },
  { id: "d10", projectId: "p1", folder: "13", name: "Site-Survey-Photos-2026-08-19.zip", type: "Image", size: "48 MB", uploadedBy: "Peerapat Wongchai", uploadedAt: "2026-08-19", remark: "" },
  { id: "d11", projectId: "p1", folder: "14", name: "Ref-PJ250107-Traceability-NTMT.pdf", type: "PDF", size: "1.4 MB", uploadedBy: "Trin Tintanee", uploadedAt: "2026-08-20", remark: "Similar past project" },

  // PJ260104 JCU palletizer
  { id: "d12", projectId: "p2", folder: "02", name: "Palletizer-Cell-Layout-RevC.dwg", type: "Drawing", size: "4.6 MB", uploadedBy: "Sarawut Chaiyo", uploadedAt: "2026-07-15", remark: "" },
  { id: "d13", projectId: "p2", folder: "03", name: "EST-2608-0005_R00_EstimateCost.xlsx", type: "Excel", size: "388 KB", uploadedBy: "Thanaphon Rit", uploadedAt: "2026-07-04", remark: "" },
  { id: "d14", projectId: "p2", folder: "05", name: "PO-JCU-26-0088.pdf", type: "PDF", size: "480 KB", uploadedBy: "Chatchai Pimsen", uploadedAt: "2026-07-02", remark: "" },
  { id: "d15", projectId: "p2", folder: "07", name: "Robot-Program-Backup-2026-08-20.zip", type: "Other", size: "22 MB", uploadedBy: "Thanaphon Rit", uploadedAt: "2026-08-20", remark: "" },
  { id: "d16", projectId: "p2", folder: "09", name: "Installation-Checklist-Week1.xlsx", type: "Excel", size: "142 KB", uploadedBy: "Peerapat Wongchai", uploadedAt: "2026-08-25", remark: "" },
  { id: "d17", projectId: "p2", folder: "09", name: "Site-Wiring-Record.pdf", type: "PDF", size: "1.1 MB", uploadedBy: "Peerapat Wongchai", uploadedAt: "2026-08-27", remark: "" },
  { id: "d18", projectId: "p2", folder: "10", name: "Weekly-Progress-Report-W35.pdf", type: "PDF", size: "760 KB", uploadedBy: "Areeya Boonmee", uploadedAt: "2026-08-28", remark: "" },
  { id: "d19", projectId: "p2", folder: "13", name: "Installation-Photos-W35.zip", type: "Image", size: "63 MB", uploadedBy: "Thanaphon Rit", uploadedAt: "2026-08-28", remark: "" },

  // PJ260052 TBGT
  { id: "d20", projectId: "p3", folder: "06", name: "Traceability-Interface-Spec-v1.2.pdf", type: "PDF", size: "1.9 MB", uploadedBy: "Kanokwan Sirisuk", uploadedAt: "2026-06-11", remark: "" },
  { id: "d21", projectId: "p3", folder: "07", name: "Dashboard-Source-v2.1.zip", type: "Other", size: "31 MB", uploadedBy: "Kanokwan Sirisuk", uploadedAt: "2026-08-12", remark: "" },
  { id: "d22", projectId: "p3", folder: "10", name: "SAT-Report-Draft.docx", type: "Word", size: "540 KB", uploadedBy: "Nattaphon Prasert", uploadedAt: "2026-08-26", remark: "Waiting customer sign-off" },
  { id: "d23", projectId: "p3", folder: "11", name: "Operation-Manual-TH-EN.pdf", type: "PDF", size: "6.8 MB", uploadedBy: "Kanokwan Sirisuk", uploadedAt: "2026-08-24", remark: "" },

  // PJ260067 SIAM GOSHI
  { id: "d24", projectId: "p4", folder: "01", name: "Concept-Vision-Inspection.pptx", type: "PowerPoint", size: "5.2 MB", uploadedBy: "Sarawut Chaiyo", uploadedAt: "2026-08-14", remark: "" },
  { id: "d25", projectId: "p4", folder: "03", name: "EST-2608-0003_R01_EstimateCost.xlsx", type: "Excel", size: "352 KB", uploadedBy: "Trin Tintanee", uploadedAt: "2026-08-24", remark: "" },
  { id: "d26", projectId: "p4", folder: "06", name: "Inspection-Criteria-DQS-08.pdf", type: "PDF", size: "2.4 MB", uploadedBy: "Trin Tintanee", uploadedAt: "2026-08-18", remark: "" },

  // PJ260050 JCU production management
  { id: "d27", projectId: "p5", folder: "10", name: "Handover-Report-Signed.pdf", type: "PDF", size: "3.4 MB", uploadedBy: "Areeya Boonmee", uploadedAt: "2026-08-26", remark: "Customer signed" },
  { id: "d28", projectId: "p5", folder: "11", name: "User-Manual-Production-Dashboard.pdf", type: "PDF", size: "5.1 MB", uploadedBy: "Kanokwan Sirisuk", uploadedAt: "2026-08-20", remark: "" },
  { id: "d29", projectId: "p5", folder: "13", name: "Handover-Ceremony.mp4", type: "Video", size: "120 MB", uploadedBy: "Areeya Boonmee", uploadedAt: "2026-08-26", remark: "" },
];

export const PROJECT_TASKS: ProjectTask[] = [
  { id: "pt1", projectId: "p1", title: "Confirm ink jet controller model with Katolec", ownerId: "u2", due: "2026-09-02", status: "In Progress", priority: "High", folder: "06", remark: "" },
  { id: "pt2", projectId: "p1", title: "Issue PR for marking head and cabling", ownerId: "u4", due: "2026-09-05", status: "Open", priority: "High", folder: "05", remark: "PR-2609-0003 draft" },
  { id: "pt3", projectId: "p1", title: "Finish GA drawing revision B", ownerId: "u5", due: "2026-09-08", status: "Open", priority: "Normal", folder: "02", remark: "" },
  { id: "pt4", projectId: "p1", title: "Prepare test data set for trial run", ownerId: "u3", due: "2026-09-15", status: "Open", priority: "Low", folder: "12", remark: "" },
  { id: "pt5", projectId: "p1", title: "Kick-off meeting minutes to customer", ownerId: "u7", due: "2026-08-25", status: "Done", priority: "Normal", folder: "00", remark: "" },

  { id: "pt6", projectId: "p2", title: "Complete safety fence installation", ownerId: "u5", due: "2026-09-03", status: "In Progress", priority: "Urgent", folder: "09", remark: "" },
  { id: "pt7", projectId: "p2", title: "Robot teaching for 3 pallet patterns", ownerId: "u10", due: "2026-09-06", status: "Open", priority: "High", folder: "07", remark: "" },
  { id: "pt8", projectId: "p2", title: "Weekly progress report W36", ownerId: "u7", due: "2026-09-04", status: "Open", priority: "Normal", folder: "10", remark: "" },
  { id: "pt9", projectId: "p2", title: "Waiting customer power supply at site", ownerId: "u4", due: "2026-09-01", status: "Blocked", priority: "Urgent", folder: "09", remark: "Customer facility team" },

  { id: "pt10", projectId: "p3", title: "SAT with customer QA", ownerId: "u1", due: "2026-09-05", status: "In Progress", priority: "High", folder: "10", remark: "" },
  { id: "pt11", projectId: "p3", title: "Hand over operation manual", ownerId: "u3", due: "2026-09-10", status: "Open", priority: "Normal", folder: "11", remark: "" },

  { id: "pt12", projectId: "p4", title: "Confirm inspection criteria with customer QA", ownerId: "u5", due: "2026-09-09", status: "Open", priority: "High", folder: "06", remark: "" },
  { id: "pt13", projectId: "p4", title: "Camera and lens selection study", ownerId: "u2", due: "2026-09-12", status: "In Progress", priority: "Normal", folder: "01", remark: "" },
];

export const PROJECT_MILESTONES: ProjectMilestone[] = [
  { id: "pm1", projectId: "p1", name: "Concept & proposal", folder: "01", start: "2026-08-20", end: "2026-09-05", progress: 100, owner: "u2" },
  { id: "pm2", projectId: "p1", name: "Design & drawing", folder: "02", start: "2026-09-01", end: "2026-09-30", progress: 45, owner: "u5" },
  { id: "pm3", projectId: "p1", name: "Procurement", folder: "05", start: "2026-09-08", end: "2026-10-24", progress: 10, owner: "u4" },
  { id: "pm4", projectId: "p1", name: "Development & FAT", folder: "07", start: "2026-10-05", end: "2026-11-21", progress: 0, owner: "u2" },
  { id: "pm5", projectId: "p1", name: "Installation & commissioning", folder: "09", start: "2026-11-23", end: "2026-12-12", progress: 0, owner: "u4" },
  { id: "pm6", projectId: "p1", name: "Report & handover", folder: "10", start: "2026-12-14", end: "2026-12-19", progress: 0, owner: "u7" },

  { id: "pm7", projectId: "p2", name: "Design & drawing", folder: "02", start: "2026-07-08", end: "2026-07-31", progress: 100, owner: "u5" },
  { id: "pm8", projectId: "p2", name: "Procurement", folder: "05", start: "2026-07-15", end: "2026-08-14", progress: 100, owner: "u4" },
  { id: "pm9", projectId: "p2", name: "Assembly & FAT", folder: "07", start: "2026-08-03", end: "2026-08-21", progress: 100, owner: "u10" },
  { id: "pm10", projectId: "p2", name: "Site installation", folder: "09", start: "2026-08-24", end: "2026-09-12", progress: 60, owner: "u4" },
  { id: "pm11", projectId: "p2", name: "Commissioning & SAT", folder: "10", start: "2026-09-14", end: "2026-09-26", progress: 0, owner: "u10" },
  { id: "pm12", projectId: "p2", name: "Handover", folder: "11", start: "2026-09-28", end: "2026-09-30", progress: 0, owner: "u7" },
];

/* ==========================================================================
   Project schedule (folder 08)

   One WBS tree per project replaces both spreadsheets: the customer-facing
   "Plan" sheet AND every member's private "Task list". The customer plan is a
   filter (visibility), a member's list is a filter (picIds), and the master
   Gantt is a projection — so a member update can never fail to reach the
   master plan, because there is nothing to propagate between.

   Nothing here is money. The schedule carries work days and man-days only;
   cost lives on the estimate.
   ========================================================================== */

export const SCHEDULE_KINDS = ["phase", "task", "detail"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
// phase  = Excel level 1. Roll-up row: dates and % are computed, never typed.
// task   = Excel level 2. The commitment: PM owns the dates, the PIC owns progress.
// detail = Sheet 2's "Work detail ( Please input your task )": the member owns it.

export const SCHEDULE_STATUSES = ["Not Started", "In Progress", "Blocked", "Done", "Cancelled"] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export type ScheduleTask = {
  id: string;
  projectId: string;
  /** "" = level 1 (phase). WBS numbers are derived from the tree, never stored. */
  parentId: string;
  /** Sibling sort key, seeded 10/20/30 so an insert never renumbers. */
  order: number;
  kind: ScheduleKind;
  name: string;
  /** Milestones (design review, buyoff, go-live) draw as a diamond. */
  milestone: boolean;
  origin: "PM" | "Member";
  createdBy: string;
  /** Customer rows appear on the exported plan; Internal rows never leave the team. */
  visibility: "Customer" | "Internal";

  /* ---- PLAN lane — the project manager ---- */
  planStart: string;
  /** DAYS column: calendar days, END = START + DAYS - 1 exactly as the sheet. */
  planDays: number;
  /** linked = start follows the predecessor like "=F27+1"; manual = typed date. */
  startMode: "manual" | "linked";
  predecessorId: string;
  /** Calendar days of lag after the predecessor finishes. */
  lagDays: number;
  picIds: string[];
  /** Customer or supplier PIC, verbatim from the plan: "JCU", "Hik", "RNB"… */
  picExternal: string;
  planManDays: number;

  /* ---- BASELINE lane — written only by freezing a baseline ---- */
  baselineStart: string;
  baselineEnd: string;
  baselineDays: number;
  /** Which revision froze this row; 0 = added after the current baseline. */
  baselineRev: number;

  /* ---- PROGRESS lane — the task owner ---- */
  actualStart: string;
  actualEnd: string;
  /** The owner's honest finish date when the plan date is no longer true. */
  forecastEnd: string;
  percentDone: number;
  status: ScheduleStatus;
  blockedReason: string;
  note: string;
  actualManDays: number;
  updatedBy: string;
  updatedAt: string;
};

/** Append-only: the update feed, the audit trail AND the request-more-days queue. */
export type ScheduleUpdate = {
  id: string;
  projectId: string;
  taskId: string;
  by: string;
  at: string;
  field: "percentDone" | "status" | "actualStart" | "actualEnd" | "forecastEnd"
    | "note" | "plan" | "baseline" | "created" | "deleted" | "request";
  from: string;
  to: string;
  comment: string;
  /** > 0 = a member asking for more days. Changes no date until the PM accepts. */
  requestDays: number;
  answer: "" | "Accepted" | "Rejected";
  answerBy: string;
  answerNote: string;
};

export type ScheduleBaseline = {
  id: string;
  projectId: string;
  rev: number;
  label: string;
  takenAt: string;
  takenBy: string;
  reason: string;
  taskCount: number;
  promisedFinish: string;
};

export type ScheduleTemplateRow = {
  /** "1" = phase, "1.1" = task under the first phase. */
  path: string;
  name: string;
  days: number;
  visibility: "Customer" | "Internal";
  milestone?: boolean;
  /** Start the row the work day after the previous sibling ends. */
  linkPrev?: boolean;
};

export type ScheduleTemplate = { id: string; name: string; projectType: string; rows: ScheduleTemplateRow[] };

/** Thai public holidays — excluded from every work-day count. */
export const HOLIDAYS: string[] = [
  "2026-01-01", "2026-02-11", "2026-04-06", "2026-04-13", "2026-04-14", "2026-04-15",
  "2026-05-01", "2026-05-04", "2026-06-03", "2026-07-28", "2026-08-12", "2026-10-13",
  "2026-10-23", "2026-12-05", "2026-12-10", "2026-12-31",
  "2027-01-01", "2027-02-01", "2027-04-06", "2027-04-13", "2027-04-14", "2027-04-15",
];

/** The nine phases of the team's own robot plan, ready to apply on day one. */
export const SCHEDULE_TEMPLATES: ScheduleTemplate[] = [
  {
    id: "tpl-robot", name: "Machine / Robot project (9 phases)", projectType: "Robot",
    rows: [
      { path: "1", name: "Kick-off & Requirements", days: 0, visibility: "Customer" },
      { path: "1.1", name: "P/O Confirmation", days: 3, visibility: "Customer" },
      { path: "1.2", name: "Requirements confirmation", days: 7, visibility: "Customer" },
      { path: "1.3", name: "Data organization / confirmation", days: 7, visibility: "Customer" },
      { path: "2", name: "Design", days: 0, visibility: "Customer" },
      { path: "2.1", name: "System Design", days: 10, visibility: "Customer" },
      { path: "2.2", name: "Hardware Design", days: 10, visibility: "Customer" },
      { path: "2.3", name: "Electrical Design", days: 8, visibility: "Customer" },
      { path: "2.4", name: "Design Review (confirm advance order)", days: 1, visibility: "Customer", milestone: true, linkPrev: true },
      { path: "2.5", name: "Drawing confirm", days: 5, visibility: "Customer", linkPrev: true },
      { path: "3", name: "Software Development", days: 0, visibility: "Customer" },
      { path: "3.1", name: "Software Design", days: 10, visibility: "Customer" },
      { path: "3.2", name: "Software development", days: 20, visibility: "Customer" },
      { path: "3.3", name: "Software test", days: 7, visibility: "Customer", linkPrev: true },
      { path: "4", name: "Procurement", days: 0, visibility: "Customer" },
      { path: "4.1", name: "Long lead-time order", days: 30, visibility: "Customer" },
      { path: "4.2", name: "Parts drawing and release", days: 10, visibility: "Internal" },
      { path: "4.3", name: "Standard parts order", days: 15, visibility: "Internal" },
      { path: "4.4", name: "Parts receive and check", days: 5, visibility: "Customer", linkPrev: true },
      { path: "5", name: "Assembly & Integration", days: 0, visibility: "Customer" },
      { path: "5.1", name: "Control panel assembly", days: 7, visibility: "Customer" },
      { path: "5.2", name: "Mechanical assembly", days: 10, visibility: "Customer" },
      { path: "5.3", name: "Field wiring + I/O check", days: 7, visibility: "Customer", linkPrev: true },
      { path: "5.4", name: "Adjustment", days: 5, visibility: "Customer", linkPrev: true },
      { path: "6", name: "Factory Acceptance Test (FAT)", days: 0, visibility: "Customer" },
      { path: "6.1", name: "Test run", days: 7, visibility: "Customer" },
      { path: "6.2", name: "Buyoff", days: 3, visibility: "Customer", milestone: true, linkPrev: true },
      { path: "7", name: "Shipping", days: 0, visibility: "Customer" },
      { path: "7.1", name: "Dismantle / packing / shipping", days: 5, visibility: "Customer" },
      { path: "8", name: "Installation & SAT", days: 0, visibility: "Customer" },
      { path: "8.1", name: "Machine installation", days: 10, visibility: "Customer" },
      { path: "8.2", name: "Electrical & software installation", days: 5, visibility: "Customer", linkPrev: true },
      { path: "8.3", name: "Full unit test & adjustment", days: 10, visibility: "Customer", linkPrev: true },
      { path: "9", name: "UAT & Handover / Go live", days: 0, visibility: "Customer" },
      { path: "9.1", name: "User testing & training", days: 10, visibility: "Customer" },
      { path: "9.2", name: "Go live", days: 1, visibility: "Customer", milestone: true, linkPrev: true },
    ],
  },
  {
    id: "tpl-trace", name: "Traceability / software project (6 phases)", projectType: "Traceability",
    rows: [
      { path: "1", name: "Kick-off & Requirements", days: 0, visibility: "Customer" },
      { path: "1.1", name: "Requirement confirmation", days: 7, visibility: "Customer" },
      { path: "1.2", name: "Machine data survey", days: 5, visibility: "Customer" },
      { path: "2", name: "System Design", days: 0, visibility: "Customer" },
      { path: "2.1", name: "Specification design", days: 7, visibility: "Customer" },
      { path: "2.2", name: "Design review", days: 1, visibility: "Customer", milestone: true, linkPrev: true },
      { path: "3", name: "Development", days: 0, visibility: "Customer" },
      { path: "3.1", name: "PLC / machine interface", days: 15, visibility: "Customer" },
      { path: "3.2", name: "Application & database", days: 20, visibility: "Customer" },
      { path: "3.3", name: "SIT", days: 5, visibility: "Customer", linkPrev: true },
      { path: "4", name: "Installation", days: 0, visibility: "Customer" },
      { path: "4.1", name: "Network and hardware installation", days: 5, visibility: "Customer" },
      { path: "4.2", name: "Software installation", days: 5, visibility: "Customer", linkPrev: true },
      { path: "5", name: "Validation", days: 0, visibility: "Customer" },
      { path: "5.1", name: "Data validation check", days: 5, visibility: "Customer" },
      { path: "6", name: "UAT & Handover", days: 0, visibility: "Customer" },
      { path: "6.1", name: "Teaching / user testing / trial", days: 10, visibility: "Customer" },
      { path: "6.2", name: "Go live", days: 1, visibility: "Customer", milestone: true, linkPrev: true },
    ],
  },
];

const task = (
  id: string, projectId: string, parentId: string, order: number, kind: ScheduleKind, name: string,
  rest: Partial<ScheduleTask>,
): ScheduleTask => ({
  id, projectId, parentId, order, kind, name,
  milestone: false, origin: "PM", createdBy: "u7", visibility: "Customer",
  planStart: "", planDays: 1, startMode: "manual", predecessorId: "", lagDays: 0,
  picIds: [], picExternal: "", planManDays: 0,
  baselineStart: "", baselineEnd: "", baselineDays: 0, baselineRev: 0,
  actualStart: "", actualEnd: "", forecastEnd: "", percentDone: 0, status: "Not Started",
  blockedReason: "", note: "", actualManDays: 0, updatedBy: "u7", updatedAt: "2026-07-08",
  ...rest,
});

/** Frozen with the rev-1 baseline: baseline = the plan as agreed at the PO. */
const frozen = (start: string, days: number): Partial<ScheduleTask> => {
  const end = new Date(new Date(`${start}T00:00:00+07:00`).getTime() + (days - 1) * 86_400_000);
  const iso = `${end.getFullYear()}-${`${end.getMonth() + 1}`.padStart(2, "0")}-${`${end.getDate()}`.padStart(2, "0")}`;
  return { planStart: start, planDays: days, baselineStart: start, baselineEnd: iso, baselineDays: days, baselineRev: 1 };
};

export const SCHEDULE_TASKS: ScheduleTask[] = [
  /* ------------------------------------------------------------------
     PJ260104 JCU — Robot Palletizer (p2). The team's real plan shape,
     baseline Rev 1 frozen at the PO. Today is 29 Aug 2026.
     ------------------------------------------------------------------ */
  // 1 Kick-off & Requirements — done
  task("st01", "p2", "", 10, "phase", "Kick-off & Requirements", {}),
  task("st02", "p2", "st01", 10, "task", "P/O Confirmation", {
    ...frozen("2026-07-08", 3), picExternal: "JCU", percentDone: 100, status: "Done",
    actualStart: "2026-07-08", actualEnd: "2026-07-10", updatedBy: "u10", updatedAt: "2026-07-10",
  }),
  task("st03", "p2", "st01", 20, "task", "Requirements confirmation", {
    ...frozen("2026-07-09", 7), picIds: ["u10"], picExternal: "JCU", planManDays: 5,
    percentDone: 100, status: "Done", actualStart: "2026-07-09", actualEnd: "2026-07-16",
    actualManDays: 5, updatedBy: "u10", updatedAt: "2026-07-16",
  }),
  task("st04", "p2", "st01", 30, "task", "HIKROBOT AMR specification", {
    ...frozen("2026-07-14", 2), picIds: ["u10"], picExternal: "Hik", planManDays: 2,
    percentDone: 100, status: "Done", actualStart: "2026-07-14", actualEnd: "2026-07-15",
    actualManDays: 2, updatedBy: "u10", updatedAt: "2026-07-15",
  }),

  // 2 Design — done
  task("st05", "p2", "", 20, "phase", "Design", {}),
  task("st06", "p2", "st05", 10, "task", "System Design", {
    ...frozen("2026-07-15", 10), picIds: ["u10"], planManDays: 8,
    percentDone: 100, status: "Done", actualStart: "2026-07-15", actualEnd: "2026-07-24",
    actualManDays: 8, updatedBy: "u10", updatedAt: "2026-07-24",
  }),
  task("st07", "p2", "st05", 20, "task", "Hardware Design — palletizer zone", {
    ...frozen("2026-07-20", 10), picIds: ["u5"], planManDays: 8,
    percentDone: 100, status: "Done", actualStart: "2026-07-20", actualEnd: "2026-07-30",
    actualManDays: 9, updatedBy: "u5", updatedAt: "2026-07-30",
  }),
  task("st08", "p2", "st05", 30, "task", "Electrical Design", {
    ...frozen("2026-07-22", 8), picIds: ["u4"], planManDays: 6,
    percentDone: 100, status: "Done", actualStart: "2026-07-22", actualEnd: "2026-07-30",
    actualManDays: 6, updatedBy: "u4", updatedAt: "2026-07-30",
  }),
  task("st09", "p2", "st05", 40, "task", "Design Review with JCU", {
    ...frozen("2026-08-03", 1), milestone: true, picIds: ["u10"], picExternal: "JCU",
    percentDone: 100, status: "Done", actualStart: "2026-08-03", actualEnd: "2026-08-03",
    updatedBy: "u10", updatedAt: "2026-08-03",
  }),
  task("st10", "p2", "st05", 50, "task", "Drawing confirm", {
    ...frozen("2026-08-04", 4), startMode: "linked", predecessorId: "st09",
    picExternal: "JCU", percentDone: 100, status: "Done",
    actualStart: "2026-08-04", actualEnd: "2026-08-07", updatedBy: "u10", updatedAt: "2026-08-07",
  }),

  // 3 Software Development — in progress
  task("st11", "p2", "", 30, "phase", "Software Development", {}),
  task("st12", "p2", "st11", 10, "task", "PLC & robot program", {
    ...frozen("2026-07-27", 20), picIds: ["u10"], planManDays: 15,
    percentDone: 85, status: "In Progress", actualStart: "2026-07-27",
    actualManDays: 13, note: "Pallet pattern 4 remains", updatedBy: "u10", updatedAt: "2026-08-27",
  }),
  task("st13", "p2", "st11", 20, "task", "PMS / WCS integration", {
    ...frozen("2026-08-03", 15), picIds: ["u1"], planManDays: 12,
    percentDone: 70, status: "In Progress", actualStart: "2026-08-03",
    actualManDays: 9, updatedBy: "u1", updatedAt: "2026-08-28",
  }),
  // u1 broke his task down himself — Sheet 2's "Work detail ( Please input your task )"
  task("st14", "p2", "st13", 10, "detail", "Interface spec with JCU WMS", {
    origin: "Member", createdBy: "u1", visibility: "Internal",
    planStart: "2026-08-03", planDays: 4, picIds: ["u1"],
    percentDone: 100, status: "Done", actualStart: "2026-08-03", actualEnd: "2026-08-06",
    updatedBy: "u1", updatedAt: "2026-08-06",
  }),
  task("st15", "p2", "st13", 20, "detail", "Pallet pattern editor screen", {
    origin: "Member", createdBy: "u1", visibility: "Internal",
    planStart: "2026-08-07", planDays: 6, picIds: ["u1"],
    percentDone: 80, status: "In Progress", actualStart: "2026-08-07",
    updatedBy: "u1", updatedAt: "2026-08-28",
  }),
  task("st16", "p2", "st13", 30, "detail", "Alarm & recovery handling", {
    origin: "Member", createdBy: "u1", visibility: "Internal",
    planStart: "2026-08-14", planDays: 4, picIds: ["u1"],
    percentDone: 30, status: "In Progress", actualStart: "2026-08-20",
    updatedBy: "u1", updatedAt: "2026-08-28",
  }),
  task("st17", "p2", "st11", 30, "task", "Software test with line data", {
    ...frozen("2026-08-24", 9), startMode: "linked", predecessorId: "st13",
    picIds: ["u1", "u10"], planManDays: 6, updatedBy: "u7", updatedAt: "2026-07-08",
  }),

  // 4 Procurement — done, one internal chase row
  task("st18", "p2", "", 40, "phase", "Procurement", {}),
  task("st19", "p2", "st18", 10, "task", "Order robot NACHI (long lead)", {
    ...frozen("2026-07-13", 25), picIds: ["u5"], planManDays: 2,
    percentDone: 100, status: "Done", actualStart: "2026-07-13", actualEnd: "2026-08-06",
    updatedBy: "u5", updatedAt: "2026-08-06",
  }),
  task("st20", "p2", "st18", 20, "task", "Order conveyor set + rack", {
    ...frozen("2026-07-15", 20), picIds: ["u5"], picExternal: "RNB", planManDays: 2,
    percentDone: 100, status: "Done", actualStart: "2026-07-15", actualEnd: "2026-08-03",
    updatedBy: "u5", updatedAt: "2026-08-03",
  }),
  task("st21", "p2", "st18", 30, "task", "Chase RNB fence drawing approval", {
    visibility: "Internal", ...frozen("2026-07-27", 5), baselineRev: 0, baselineStart: "", baselineEnd: "", baselineDays: 0,
    picIds: ["u5"], picExternal: "RNB",
    percentDone: 100, status: "Done", actualStart: "2026-07-27", actualEnd: "2026-07-31",
    note: "Needed two reminders", updatedBy: "u5", updatedAt: "2026-07-31",
  }),
  task("st22", "p2", "st18", 40, "task", "Parts receive and check", {
    ...frozen("2026-08-13", 5), picIds: ["u4"], planManDays: 3,
    percentDone: 100, status: "Done", actualStart: "2026-08-13", actualEnd: "2026-08-18",
    actualManDays: 3, updatedBy: "u4", updatedAt: "2026-08-18",
  }),

  // 5 Assembly & Integration — the live phase, one task late
  task("st23", "p2", "", 50, "phase", "Assembly & Integration", {}),
  task("st24", "p2", "st23", 10, "task", "Control panel assembly", {
    ...frozen("2026-08-10", 7), picIds: ["u4"], planManDays: 5,
    percentDone: 100, status: "Done", actualStart: "2026-08-10", actualEnd: "2026-08-17",
    actualManDays: 5, updatedBy: "u4", updatedAt: "2026-08-17",
  }),
  task("st25", "p2", "st23", 20, "task", "Mechanical assembly", {
    // Baseline said 8 days; the PM later extended the plan to 10 — the slip is visible.
    planStart: "2026-08-17", planDays: 10,
    baselineStart: "2026-08-17", baselineEnd: "2026-08-24", baselineDays: 8, baselineRev: 1,
    picIds: ["u5"], planManDays: 8,
    percentDone: 60, status: "In Progress", actualStart: "2026-08-17",
    forecastEnd: "2026-09-01", actualManDays: 7,
    note: "Rack anchor holes mismatch — re-drilled", updatedBy: "u5", updatedAt: "2026-08-28",
  }),
  task("st26", "p2", "st25", 10, "detail", "Safety fence + door switch", {
    origin: "Member", createdBy: "u5", visibility: "Internal",
    planStart: "2026-08-17", planDays: 4, picIds: ["u5"],
    percentDone: 100, status: "Done", actualStart: "2026-08-17", actualEnd: "2026-08-20",
    updatedBy: "u5", updatedAt: "2026-08-20",
  }),
  task("st27", "p2", "st25", 20, "detail", "Conveyor alignment + rack anchor", {
    origin: "Member", createdBy: "u5", visibility: "Internal",
    planStart: "2026-08-21", planDays: 6, picIds: ["u5"],
    percentDone: 40, status: "In Progress", actualStart: "2026-08-21",
    note: "Anchor holes off by 12 mm — re-drilling", updatedBy: "u5", updatedAt: "2026-08-28",
  }),
  task("st28", "p2", "st23", 30, "task", "Field wiring + I/O check", {
    ...frozen("2026-08-27", 7), startMode: "linked", predecessorId: "st25",
    picIds: ["u4"], planManDays: 5, updatedBy: "u7", updatedAt: "2026-07-08",
  }),

  // 6 FAT
  task("st29", "p2", "", 60, "phase", "Factory Acceptance Test (FAT)", {}),
  task("st30", "p2", "st29", 10, "task", "Test run — conveyor + palletizer + robot", {
    ...frozen("2026-09-07", 5), picIds: ["u10", "u1"], planManDays: 8, updatedBy: "u7", updatedAt: "2026-07-08",
  }),
  task("st31", "p2", "st29", 20, "task", "Buyoff by JCU", {
    ...frozen("2026-09-14", 3), milestone: true, startMode: "linked", predecessorId: "st30",
    picExternal: "JCU", updatedBy: "u7", updatedAt: "2026-07-08",
  }),

  // 7 Shipping & Installation
  task("st32", "p2", "", 70, "phase", "Shipping & Installation", {}),
  task("st33", "p2", "st32", 10, "task", "Dismantle / packing / transport", {
    ...frozen("2026-09-17", 3), picIds: ["u5"], planManDays: 4, updatedBy: "u7", updatedAt: "2026-07-08",
  }),
  task("st34", "p2", "st32", 20, "task", "Installation at JCU site", {
    ...frozen("2026-09-21", 5), startMode: "linked", predecessorId: "st33",
    picIds: ["u5", "u4"], planManDays: 8, updatedBy: "u7", updatedAt: "2026-07-08",
  }),

  // 8 SAT & Handover
  task("st35", "p2", "", 80, "phase", "SAT & Handover", {}),
  task("st36", "p2", "st35", 10, "task", "SAT & user training", {
    ...frozen("2026-09-28", 2), picIds: ["u10", "u1"], picExternal: "JCU", planManDays: 3,
    updatedBy: "u7", updatedAt: "2026-07-08",
  }),
  task("st37", "p2", "st35", 20, "task", "Go live", {
    ...frozen("2026-09-30", 1), milestone: true, startMode: "linked", predecessorId: "st36",
    picExternal: "JCU", updatedBy: "u7", updatedAt: "2026-07-08",
  }),

  /* ------------------------------------------------------------------
     PJ260152 Katolec — Ink Jet Machine (p1). Planned but NOT baselined
     yet, so the "Freeze baseline" state is visible.
     ------------------------------------------------------------------ */
  task("st50", "p1", "", 10, "phase", "Kick-off & Requirements", {}),
  task("st51", "p1", "st50", 10, "task", "Requirement confirmation with Katolec", {
    planStart: "2026-08-20", planDays: 5, picIds: ["u2"], picExternal: "Katolec", planManDays: 3,
    percentDone: 100, status: "Done", actualStart: "2026-08-20", actualEnd: "2026-08-25",
    updatedBy: "u2", updatedAt: "2026-08-25",
  }),
  task("st52", "p1", "st50", 20, "task", "Survey existing marking line", {
    planStart: "2026-08-25", planDays: 3, picIds: ["u2", "u4"], planManDays: 4,
    percentDone: 100, status: "Done", actualStart: "2026-08-25", actualEnd: "2026-08-27",
    updatedBy: "u4", updatedAt: "2026-08-27",
  }),
  task("st53", "p1", "", 20, "phase", "Design", {}),
  task("st54", "p1", "st53", 10, "task", "Modification design — marking head", {
    planStart: "2026-08-28", planDays: 10, picIds: ["u2"], planManDays: 8,
    percentDone: 20, status: "In Progress", actualStart: "2026-08-28",
    updatedBy: "u2", updatedAt: "2026-08-28",
  }),
  task("st55", "p1", "st53", 20, "task", "Electrical modification design", {
    planStart: "2026-09-02", planDays: 7, picIds: ["u4"], planManDays: 5,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st56", "p1", "st53", 30, "task", "Design review with Katolec", {
    planStart: "2026-09-14", planDays: 1, milestone: true, startMode: "linked", predecessorId: "st54",
    picIds: ["u2"], picExternal: "Katolec", updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st57", "p1", "", 30, "phase", "Software", {}),
  task("st58", "p1", "st57", 10, "task", "Inkjet controller data interface", {
    planStart: "2026-09-15", planDays: 15, picIds: ["u3"], planManDays: 12,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st59", "p1", "st57", 20, "task", "Line PLC modification", {
    planStart: "2026-09-22", planDays: 10, picIds: ["u2"], planManDays: 8,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st60", "p1", "", 40, "phase", "Procurement", {}),
  task("st61", "p1", "st60", 10, "task", "Order marking head + cabling", {
    planStart: "2026-09-15", planDays: 25, picIds: ["u4"], planManDays: 2,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st62", "p1", "", 50, "phase", "Installation & Test", {}),
  task("st63", "p1", "st62", 10, "task", "Site modification during line stop", {
    planStart: "2026-11-16", planDays: 6, picIds: ["u2", "u4"], planManDays: 10,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st64", "p1", "st62", 20, "task", "Test run and buyoff", {
    planStart: "2026-11-23", planDays: 5, startMode: "linked", predecessorId: "st63",
    picIds: ["u2"], picExternal: "Katolec", planManDays: 5,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
  task("st65", "p1", "", 60, "phase", "Handover", {}),
  task("st66", "p1", "st65", 10, "task", "Documentation & handover", {
    planStart: "2026-12-14", planDays: 5, picIds: ["u2"], picExternal: "Katolec", planManDays: 3,
    updatedBy: "u7", updatedAt: "2026-08-20",
  }),
];

export const SCHEDULE_UPDATES: ScheduleUpdate[] = [
  { id: "su01", projectId: "p2", taskId: "st25", by: "u5", at: "2026-08-28 16:40", field: "percentDone", from: "40", to: "60", comment: "Fence and door switch done, conveyor alignment in progress", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su02", projectId: "p2", taskId: "st25", by: "u5", at: "2026-08-28 16:41", field: "forecastEnd", from: "", to: "2026-09-01", comment: "Rack anchor holes mismatch — re-drilled", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su03", projectId: "p2", taskId: "st25", by: "u5", at: "2026-08-28 16:45", field: "request", from: "", to: "+3 days", comment: "Rack anchor rework — need 3 more days to finish alignment safely", requestDays: 3, answer: "", answerBy: "", answerNote: "" },
  { id: "su04", projectId: "p2", taskId: "st13", by: "u1", at: "2026-08-28 11:20", field: "percentDone", from: "60", to: "70", comment: "Pallet pattern editor nearly done", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su05", projectId: "p2", taskId: "st12", by: "u10", at: "2026-08-27 17:05", field: "percentDone", from: "75", to: "85", comment: "Pattern 1-3 verified on simulator", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su06", projectId: "p2", taskId: "st16", by: "u1", at: "2026-08-28 11:22", field: "status", from: "Not Started", to: "In Progress", comment: "", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su07", projectId: "p2", taskId: "st12", by: "u10", at: "2026-08-21 09:10", field: "request", from: "", to: "+2 days", comment: "Robot IO map changed by HIKROBOT firmware update", requestDays: 2, answer: "Accepted", answerBy: "u7", answerNote: "Absorbed inside the software phase — test task starts 2 days later" },
  { id: "su08", projectId: "p2", taskId: "st24", by: "u4", at: "2026-08-17 15:30", field: "actualEnd", from: "", to: "2026-08-17", comment: "Panel powered and checked", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su09", projectId: "p1", taskId: "st54", by: "u2", at: "2026-08-28 10:02", field: "percentDone", from: "0", to: "20", comment: "Head mounting concept drafted", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
  { id: "su10", projectId: "p2", taskId: "st27", by: "u5", at: "2026-08-28 16:38", field: "note", from: "", to: "Anchor holes off by 12 mm — re-drilling", comment: "", requestDays: 0, answer: "", answerBy: "", answerNote: "" },
];

export const SCHEDULE_BASELINES: ScheduleBaseline[] = [
  {
    id: "sb1", projectId: "p2", rev: 1, label: "Rev 1 — PO PO-JCU-26-0088",
    takenAt: "2026-07-08", takenBy: "u7", reason: "",
    taskCount: 22, promisedFinish: "2026-09-30",
  },
];

/* ==========================================================================
   BOM, procurement & inventory control

   One chain of custody from the approved estimate to the hand that receives
   the part: Estimate line → BOM line → PR line → PO line → Goods receipt →
   Stock transaction → Material issue. Stock balances are never stored — they
   are computed from the immutable transaction ledger, so a balance can never
   be overwritten and every quantity has a person and a document behind it.

   Money here is INTERNAL COST only, same as everywhere else in the system.
   ========================================================================== */

/* ---- Item master ---------------------------------------------------------- */

export type MatItem = {
  id: string;
  itemCode: string;
  partNo: string;
  description: string;
  brand: string;
  unit: string;
  /** Default shelf in the Chonburi store. */
  location: string;
  reorderLevel: number;
  avgUnitCost: number;
  leadTimeDays: number;
  preferredSupplier: string;
};

export const WAREHOUSES = [{ id: "wh1", name: "WH1 — Chonburi Store" }];

export const MAT_ITEMS: MatItem[] = [
  { id: "mi1", itemCode: "EL-PLC-101", partNo: "FX5U-64MT/ES", description: "PLC CPU 64 I/O transistor output", brand: "Mitsubishi", unit: "Pcs", location: "WH1-A1", reorderLevel: 1, avgUnitCost: 28900, leadTimeDays: 14, preferredSupplier: "Mitsubishi Electric Automation" },
  { id: "mi2", itemCode: "EL-PLC-102", partNo: "FX5-16EX/ES", description: "Expansion input unit 16DI", brand: "Mitsubishi", unit: "Pcs", location: "WH1-A1", reorderLevel: 2, avgUnitCost: 6400, leadTimeDays: 14, preferredSupplier: "Mitsubishi Electric Automation" },
  { id: "mi3", itemCode: "EL-HMI-101", partNo: "GT2505-VTBD", description: "Touch panel 5.7 inch TFT", brand: "Mitsubishi", unit: "Pcs", location: "WH1-A2", reorderLevel: 0, avgUnitCost: 24500, leadTimeDays: 21, preferredSupplier: "Mitsubishi Electric Automation" },
  { id: "mi4", itemCode: "EL-BRK-101", partNo: "NF63-CV 3P 20A", description: "MCCB 3 pole 20 A", brand: "Mitsubishi", unit: "Pcs", location: "WH1-B1", reorderLevel: 2, avgUnitCost: 1850, leadTimeDays: 7, preferredSupplier: "RS Components Thailand" },
  { id: "mi5", itemCode: "EL-BRK-102", partNo: "CP30-BA 5A", description: "Circuit protector 5 A", brand: "Mitsubishi", unit: "Pcs", location: "WH1-B1", reorderLevel: 4, avgUnitCost: 890, leadTimeDays: 7, preferredSupplier: "RS Components Thailand" },
  { id: "mi6", itemCode: "EL-RLY-101", partNo: "MY4N-GS 24VDC", description: "Relay 4 pole with socket", brand: "Omron", unit: "Pcs", location: "WH1-B2", reorderLevel: 10, avgUnitCost: 320, leadTimeDays: 7, preferredSupplier: "RS Components Thailand" },
  { id: "mi7", itemCode: "EL-PSU-101", partNo: "S8FS-G24024CD", description: "Switching power supply 24 V 10 A", brand: "Omron", unit: "Pcs", location: "WH1-B3", reorderLevel: 1, avgUnitCost: 3150, leadTimeDays: 10, preferredSupplier: "RS Components Thailand" },
  { id: "mi8", itemCode: "EL-RLY-102", partNo: "G9SE-401", description: "Safety relay unit 4 contacts", brand: "Omron", unit: "Pcs", location: "WH1-B2", reorderLevel: 1, avgUnitCost: 4890, leadTimeDays: 21, preferredSupplier: "RS Components Thailand" },
  { id: "mi9", itemCode: "EL-SEN-101", partNo: "FS-N43N + FU-35FA", description: "Fiber optic sensor with amplifier", brand: "KEYENCE", unit: "Set", location: "WH1-C1", reorderLevel: 2, avgUnitCost: 1750, leadTimeDays: 10, preferredSupplier: "Keyence (Thailand) Co., Ltd." },
  { id: "mi10", itemCode: "EL-SEN-102", partNo: "D4NS-4CF", description: "Safety door switch with connector", brand: "Omron", unit: "Pcs", location: "WH1-C2", reorderLevel: 1, avgUnitCost: 2450, leadTimeDays: 14, preferredSupplier: "RS Components Thailand" },
  { id: "mi11", itemCode: "ME-GRP-101", partNo: "MHZ2-25D", description: "Pneumatic parallel gripper", brand: "SMC", unit: "Pcs", location: "WH1-D1", reorderLevel: 0, avgUnitCost: 8900, leadTimeDays: 21, preferredSupplier: "SMC (Thailand) Ltd." },
  { id: "mi12", itemCode: "HW-SEN-001", partNo: "SR-X300", description: "Barcode reader 2D fixed mount", brand: "KEYENCE", unit: "Pcs", location: "WH1-C3", reorderLevel: 0, avgUnitCost: 48500, leadTimeDays: 30, preferredSupplier: "Keyence (Thailand) Co., Ltd." },
  { id: "mi13", itemCode: "HW-NET-001", partNo: "IE-3300-8T2S", description: "Industrial managed switch 8 port", brand: "Cisco", unit: "Pcs", location: "WH1-E1", reorderLevel: 1, avgUnitCost: 41200, leadTimeDays: 45, preferredSupplier: "Cisco Partner — Datacom Thai" },
  { id: "mi14", itemCode: "HW-IPC-001", partNo: "IPC-240", description: "Industrial PC i7 / 32GB / 1TB SSD", brand: "Advantech", unit: "Set", location: "WH1-E2", reorderLevel: 0, avgUnitCost: 98500, leadTimeDays: 45, preferredSupplier: "Cisco Partner — Datacom Thai" },
  { id: "mi15", itemCode: "RB-ROB-001", partNo: "COBOTTA PRO 1300", description: "Collaborative robot 6 axis / 12 kg", brand: "DENSO", unit: "Set", location: "—", reorderLevel: 0, avgUnitCost: 1180000, leadTimeDays: 60, preferredSupplier: "DENSO Wave Robotics" },
  { id: "mi16", itemCode: "EL-ENC-101", partNo: "AE1380 600x800", description: "Panel enclosure 600x800x300", brand: "Rittal", unit: "Pcs", location: "WH1-F1", reorderLevel: 0, avgUnitCost: 12400, leadTimeDays: 30, preferredSupplier: "Rittal Thailand" },
];

/* ---- Immutable stock transaction ledger ----------------------------------- */

export const STOCK_TXN_TYPES = [
  "Goods Receipt", "Material Issue", "Material Return", "Stock Transfer",
  "Stock Adjustment", "Scrap", "Cycle Count Adjustment", "Quarantine In", "Quarantine Release",
] as const;
export type StockTxnType = (typeof STOCK_TXN_TYPES)[number];

export type StockTxn = {
  id: string;
  at: string;
  type: StockTxnType;
  itemId: string;
  /** Signed quantity. "stock" moves usable stock, "quarantine" the hold area. */
  qty: number;
  bucket: "stock" | "quarantine";
  location: string;
  /** GRN / MIR / ADJ / CC document behind the movement — nothing moves without one. */
  refNo: string;
  projectId: string;
  byId: string;
  note: string;
};

export const STOCK_TXNS: StockTxn[] = [
  // Opening balances — August cycle count, plus leftovers from finished projects.
  { id: "mt1", at: "2026-08-01 09:00", type: "Cycle Count Adjustment", itemId: "mi1", qty: 3, bucket: "stock", location: "WH1-A1", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August — 2 pcs left over from TTS Energy" },
  { id: "mt2", at: "2026-08-01 09:00", type: "Cycle Count Adjustment", itemId: "mi2", qty: 4, bucket: "stock", location: "WH1-A1", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt3", at: "2026-08-01 09:05", type: "Cycle Count Adjustment", itemId: "mi4", qty: 1, bucket: "stock", location: "WH1-B1", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt4", at: "2026-08-01 09:05", type: "Cycle Count Adjustment", itemId: "mi5", qty: 10, bucket: "stock", location: "WH1-B1", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt5", at: "2026-08-01 09:10", type: "Cycle Count Adjustment", itemId: "mi6", qty: 30, bucket: "stock", location: "WH1-B2", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt6", at: "2026-08-01 09:10", type: "Cycle Count Adjustment", itemId: "mi7", qty: 1, bucket: "stock", location: "WH1-B3", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt7", at: "2026-08-01 09:15", type: "Cycle Count Adjustment", itemId: "mi9", qty: 2, bucket: "stock", location: "WH1-C1", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt8", at: "2026-08-01 09:15", type: "Cycle Count Adjustment", itemId: "mi10", qty: 4, bucket: "stock", location: "WH1-C2", refNo: "CC-2608-0001", projectId: "", byId: "u14", note: "Count August" },
  { id: "mt9", at: "2026-07-02 14:20", type: "Goods Receipt", itemId: "mi12", qty: 1, bucket: "stock", location: "WH1-C3", refNo: "GRN-2607-0006", projectId: "", byId: "u13", note: "Returned unused from FTS Traceability" },
  { id: "mt10", at: "2026-03-12 10:40", type: "Goods Receipt", itemId: "mi13", qty: 1, bucket: "stock", location: "WH1-E1", refNo: "GRN-2603-0002", projectId: "", byId: "u13", note: "Spare from Meiji OEE Phase 1" },
  { id: "mt11", at: "2026-05-20 11:10", type: "Goods Receipt", itemId: "mi14", qty: 1, bucket: "stock", location: "WH1-E2", refNo: "GRN-2605-0004", projectId: "", byId: "u13", note: "Cancelled DENSO leak test project" },
  { id: "mt12", at: "2026-02-06 15:30", type: "Goods Receipt", itemId: "mi16", qty: 1, bucket: "stock", location: "WH1-F1", refNo: "GRN-2602-0001", projectId: "", byId: "u13", note: "Left over — project cancelled at design stage" },

  // GRN-2608-0012 — fiber sensors, partial delivery 6 of 10 (1 damaged).
  { id: "mt13", at: "2026-08-26 10:35", type: "Goods Receipt", itemId: "mi9", qty: 5, bucket: "stock", location: "WH1-C1", refNo: "GRN-2608-0012", projectId: "p8", byId: "u13", note: "Partial delivery 6 of 10 — 5 accepted" },
  { id: "mt14", at: "2026-08-26 10:35", type: "Quarantine In", itemId: "mi9", qty: 1, bucket: "quarantine", location: "WH1-QC", refNo: "GRN-2608-0012", projectId: "p8", byId: "u13", note: "Amplifier housing cracked — damage report DR-2608-0002" },

  // MIR-2608-0007 — panel components issued to the Cobot project.
  { id: "mt15", at: "2026-08-27 09:20", type: "Material Issue", itemId: "mi1", qty: -1, bucket: "stock", location: "WH1-A1", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "Main control panel assembly" },
  { id: "mt16", at: "2026-08-27 09:20", type: "Material Issue", itemId: "mi2", qty: -2, bucket: "stock", location: "WH1-A1", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "" },
  { id: "mt17", at: "2026-08-27 09:22", type: "Material Issue", itemId: "mi4", qty: -1, bucket: "stock", location: "WH1-B1", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "" },
  { id: "mt18", at: "2026-08-27 09:22", type: "Material Issue", itemId: "mi5", qty: -6, bucket: "stock", location: "WH1-B1", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "" },
  { id: "mt19", at: "2026-08-27 09:25", type: "Material Issue", itemId: "mi6", qty: -12, bucket: "stock", location: "WH1-B2", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "" },
  { id: "mt20", at: "2026-08-27 09:25", type: "Material Issue", itemId: "mi7", qty: -1, bucket: "stock", location: "WH1-B3", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "" },
  { id: "mt21", at: "2026-08-27 09:30", type: "Material Issue", itemId: "mi9", qty: -5, bucket: "stock", location: "WH1-C1", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "" },

  // Two relays over-picked, returned next day.
  { id: "mt22", at: "2026-08-28 16:10", type: "Material Return", itemId: "mi6", qty: 2, bucket: "stock", location: "WH1-B2", refNo: "MIR-2608-0007", projectId: "p8", byId: "u13", note: "Over-picked — returned unused by Chakkrit Manee" },
];

/* ---- Reservations — one quantity, one project, never two ------------------ */

export type Reservation = {
  id: string;
  itemId: string;
  projectId: string;
  bomLineId: string;
  qty: number;
  requiredDate: string;
  ownerId: string;
  status: "Active" | "Consumed" | "Released";
  createdAt: string;
};

export const RESERVATIONS: Reservation[] = [
  // JCU palletizer holds one PLC spare — the cross-project contention the module exists to expose.
  { id: "rsv1", itemId: "mi1", projectId: "p2", bomLineId: "", qty: 1, requiredDate: "2026-09-07", ownerId: "u10", status: "Active", createdAt: "2026-08-05" },
  // Cobot allocations (consumed ones were issued on MIR-2608-0007).
  { id: "rsv2", itemId: "mi1", projectId: "p8", bomLineId: "bl4", qty: 1, requiredDate: "2026-08-27", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  { id: "rsv3", itemId: "mi2", projectId: "p8", bomLineId: "bl5", qty: 2, requiredDate: "2026-08-27", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  { id: "rsv4", itemId: "mi4", projectId: "p8", bomLineId: "bl7", qty: 1, requiredDate: "2026-08-27", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  { id: "rsv5", itemId: "mi5", projectId: "p8", bomLineId: "bl8", qty: 6, requiredDate: "2026-08-27", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  { id: "rsv6", itemId: "mi6", projectId: "p8", bomLineId: "bl9", qty: 12, requiredDate: "2026-08-27", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  { id: "rsv7", itemId: "mi7", projectId: "p8", bomLineId: "bl10", qty: 1, requiredDate: "2026-08-27", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  { id: "rsv8", itemId: "mi9", projectId: "p8", bomLineId: "bl12", qty: 2, requiredDate: "2026-09-10", ownerId: "u1", status: "Consumed", createdAt: "2026-08-19" },
  // Received fiber sensors put straight on reservation for the project (3 consumed on issue, 1 still held).
  { id: "rsv9", itemId: "mi9", projectId: "p8", bomLineId: "bl12", qty: 3, requiredDate: "2026-09-10", ownerId: "u13", status: "Consumed", createdAt: "2026-08-26" },
  { id: "rsv10", itemId: "mi9", projectId: "p8", bomLineId: "bl12", qty: 1, requiredDate: "2026-09-10", ownerId: "u13", status: "Active", createdAt: "2026-08-26" },
  { id: "rsv11", itemId: "mi12", projectId: "p8", bomLineId: "bl2", qty: 1, requiredDate: "2026-09-05", ownerId: "u1", status: "Active", createdAt: "2026-08-20" },
  { id: "rsv12", itemId: "mi13", projectId: "p8", bomLineId: "bl20", qty: 1, requiredDate: "2026-09-15", ownerId: "u1", status: "Active", createdAt: "2026-08-20" },
  { id: "rsv13", itemId: "mi14", projectId: "p8", bomLineId: "bl19", qty: 1, requiredDate: "2026-09-05", ownerId: "u1", status: "Active", createdAt: "2026-08-20" },
];

/* ---- BOM ------------------------------------------------------------------ */

export const BOM_SECTIONS: { code: string; name: string; parent: string }[] = [
  { code: "HW", name: "Hardware", parent: "" },
  { code: "HW.STD", name: "Standard Equipment", parent: "HW" },
  { code: "HW.EL", name: "Electrical", parent: "HW" },
  { code: "HW.ME", name: "Mechanical", parent: "HW" },
  { code: "HW.PC", name: "Server / PC", parent: "HW" },
  { code: "HW.INF", name: "Infrastructure", parent: "HW" },
  { code: "SW", name: "Software", parent: "" },
  { code: "SVC", name: "Service & Installation", parent: "" },
  { code: "MP", name: "Manpower", parent: "" },
];

export type Bom = {
  id: string;
  no: string;
  revision: string;
  status: "Draft" | "Released" | "Superseded";
  projectId: string;
  estimateId: string;
  estimateRev: string;
  generatedAt: string;
  generatedBy: string;
  releasedAt: string;
  releasedBy: string;
};

export type BomLine = {
  id: string;
  bomId: string;
  section: string;
  /** "" for non-stock lines (software, service). */
  itemId: string;
  itemCode: string;
  partNo: string;
  description: string;
  brand: string;
  specification: string;
  qtyRequired: number;
  unit: string;
  estUnitCost: number;
  /** Quantity the customer supplies — never purchased, never issued from stock. */
  customerSupplied: number;
  requiredDate: string;
  preferredSupplier: string;
  leadTimeDays: number;
  /** The estimate line this BOM line draws its budget from. */
  estimateLineId: string;
  ownerId: string;
  nonStock: boolean;
  remark: string;
};

export const BOMS: Bom[] = [
  {
    id: "bom1", no: "BOM-2608-0001", revision: "R01", status: "Released",
    projectId: "p8", estimateId: "e1", estimateRev: "R03",
    generatedAt: "2026-08-18", generatedBy: "u1", releasedAt: "2026-08-19", releasedBy: "u7",
  },
];

export const BOM_LINES: BomLine[] = [
  // --- Hardware · Standard Equipment ---
  { id: "bl1", bomId: "bom1", section: "HW.STD", itemId: "mi15", itemCode: "RB-ROB-001", partNo: "COBOTTA PRO 1300", description: "Collaborative robot 6 axis / 12 kg", brand: "DENSO", specification: "Reach 1300 mm, controller + pendant", qtyRequired: 1, unit: "Set", estUnitCost: 1180000, customerSupplied: 0, requiredDate: "2026-10-30", preferredSupplier: "DENSO Wave Robotics", leadTimeDays: 60, estimateLineId: "i15", ownerId: "u10", nonStock: false, remark: "Long lead — advance order" },
  { id: "bl2", bomId: "bom1", section: "HW.STD", itemId: "mi12", itemCode: "HW-SEN-001", partNo: "SR-X300", description: "Barcode reader 2D fixed mount", brand: "KEYENCE", specification: "Auto focus, Ethernet", qtyRequired: 2, unit: "Pcs", estUnitCost: 48500, customerSupplied: 0, requiredDate: "2026-09-20", preferredSupplier: "Keyence (Thailand) Co., Ltd.", leadTimeDays: 30, estimateLineId: "i4", ownerId: "u1", nonStock: false, remark: "" },
  { id: "bl3", bomId: "bom1", section: "HW.STD", itemId: "", itemCode: "RB-GRP-001", partNo: "VG-4Z", description: "Vacuum gripper with sensor feedback", brand: "—", specification: "4 zone, custom pad", qtyRequired: 1, unit: "Set", estUnitCost: 142000, customerSupplied: 0, requiredDate: "2026-10-15", preferredSupplier: "TP Precision Fabrication", leadTimeDays: 40, estimateLineId: "i16", ownerId: "u10", nonStock: false, remark: "Waiting final pad drawing before PR" },
  // --- Hardware · Electrical (panel explode of EL-PNL-001 plus the PLC/HMI estimate lines) ---
  { id: "bl4", bomId: "bom1", section: "HW.EL", itemId: "mi1", itemCode: "EL-PLC-101", partNo: "FX5U-64MT/ES", description: "PLC CPU 64 I/O transistor output", brand: "Mitsubishi", specification: "Ethernet built-in, 64 pt", qtyRequired: 1, unit: "Pcs", estUnitCost: 28900, customerSupplied: 0, requiredDate: "2026-08-27", preferredSupplier: "Mitsubishi Electric Automation", leadTimeDays: 14, estimateLineId: "i1", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl5", bomId: "bom1", section: "HW.EL", itemId: "mi2", itemCode: "EL-PLC-102", partNo: "FX5-16EX/ES", description: "Expansion input unit 16DI", brand: "Mitsubishi", specification: "24VDC sink/source", qtyRequired: 2, unit: "Pcs", estUnitCost: 6400, customerSupplied: 0, requiredDate: "2026-08-27", preferredSupplier: "Mitsubishi Electric Automation", leadTimeDays: 14, estimateLineId: "i2", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl6", bomId: "bom1", section: "HW.EL", itemId: "mi3", itemCode: "EL-HMI-101", partNo: "GT2505-VTBD", description: "Touch panel 5.7 inch TFT", brand: "Mitsubishi", specification: "640x480, Ethernet", qtyRequired: 1, unit: "Pcs", estUnitCost: 24500, customerSupplied: 0, requiredDate: "2026-09-20", preferredSupplier: "Mitsubishi Electric Automation", leadTimeDays: 21, estimateLineId: "i3", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl7", bomId: "bom1", section: "HW.EL", itemId: "mi4", itemCode: "EL-BRK-101", partNo: "NF63-CV 3P 20A", description: "MCCB 3 pole 20 A", brand: "Mitsubishi", specification: "20 A, 3 pole", qtyRequired: 2, unit: "Pcs", estUnitCost: 1850, customerSupplied: 0, requiredDate: "2026-09-20", preferredSupplier: "RS Components Thailand", leadTimeDays: 7, estimateLineId: "i11", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl8", bomId: "bom1", section: "HW.EL", itemId: "mi5", itemCode: "EL-BRK-102", partNo: "CP30-BA 5A", description: "Circuit protector 5 A", brand: "Mitsubishi", specification: "1 pole, 5 A", qtyRequired: 6, unit: "Pcs", estUnitCost: 890, customerSupplied: 0, requiredDate: "2026-08-27", preferredSupplier: "RS Components Thailand", leadTimeDays: 7, estimateLineId: "i11", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl9", bomId: "bom1", section: "HW.EL", itemId: "mi6", itemCode: "EL-RLY-101", partNo: "MY4N-GS 24VDC", description: "Relay 4 pole with socket", brand: "Omron", specification: "24 VDC coil", qtyRequired: 12, unit: "Pcs", estUnitCost: 320, customerSupplied: 0, requiredDate: "2026-08-27", preferredSupplier: "RS Components Thailand", leadTimeDays: 7, estimateLineId: "i11", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl10", bomId: "bom1", section: "HW.EL", itemId: "mi7", itemCode: "EL-PSU-101", partNo: "S8FS-G24024CD", description: "Switching power supply 24 V 10 A", brand: "Omron", specification: "24 VDC, 10 A", qtyRequired: 2, unit: "Pcs", estUnitCost: 3150, customerSupplied: 0, requiredDate: "2026-09-20", preferredSupplier: "RS Components Thailand", leadTimeDays: 10, estimateLineId: "i11", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl11", bomId: "bom1", section: "HW.EL", itemId: "mi8", itemCode: "EL-RLY-102", partNo: "G9SE-401", description: "Safety relay unit 4 contacts", brand: "Omron", specification: "24 VDC, 4 NO", qtyRequired: 2, unit: "Pcs", estUnitCost: 4890, customerSupplied: 0, requiredDate: "2026-09-20", preferredSupplier: "RS Components Thailand", leadTimeDays: 21, estimateLineId: "i11", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl12", bomId: "bom1", section: "HW.EL", itemId: "mi9", itemCode: "EL-SEN-101", partNo: "FS-N43N + FU-35FA", description: "Fiber optic sensor with amplifier", brand: "KEYENCE", specification: "Through-beam fiber set", qtyRequired: 8, unit: "Set", estUnitCost: 1750, customerSupplied: 0, requiredDate: "2026-09-10", preferredSupplier: "Keyence (Thailand) Co., Ltd.", leadTimeDays: 10, estimateLineId: "i5", ownerId: "u11", nonStock: false, remark: "" },
  { id: "bl13", bomId: "bom1", section: "HW.EL", itemId: "mi10", itemCode: "EL-SEN-102", partNo: "D4NS-4CF", description: "Safety door switch with connector", brand: "Omron", specification: "Slow action, M12 connector", qtyRequired: 2, unit: "Pcs", estUnitCost: 2450, customerSupplied: 0, requiredDate: "2026-09-25", preferredSupplier: "RS Components Thailand", leadTimeDays: 14, estimateLineId: "i11", ownerId: "u11", nonStock: false, remark: "In stock — allocate before purchasing" },
  { id: "bl14", bomId: "bom1", section: "HW.EL", itemId: "", itemCode: "EL-PNL-001", partNo: "CP-MAIN-01", description: "Panel enclosure 800x1800 + fabrication", brand: "Schneider", specification: "IP54, with air conditioner", qtyRequired: 1, unit: "Set", estUnitCost: 82000, customerSupplied: 0, requiredDate: "2026-09-25", preferredSupplier: "Thai Control Panel Works", leadTimeDays: 30, estimateLineId: "i11", ownerId: "u4", nonStock: false, remark: "Fabricated to drawing" },
  { id: "bl15", bomId: "bom1", section: "HW.EL", itemId: "", itemCode: "EL-WIR-001", partNo: "—", description: "Field wiring material and cable tray", brand: "—", specification: "Complete set, 2 stations", qtyRequired: 1, unit: "Lot", estUnitCost: 96000, customerSupplied: 0, requiredDate: "2026-10-05", preferredSupplier: "Thai Control Panel Works", leadTimeDays: 21, estimateLineId: "i12", ownerId: "u4", nonStock: false, remark: "" },
  // --- Hardware · Mechanical ---
  { id: "bl16", bomId: "bom1", section: "HW.ME", itemId: "mi11", itemCode: "ME-GRP-101", partNo: "MHZ2-25D", description: "Pneumatic parallel gripper", brand: "SMC", specification: "Bore 25, with auto switch", qtyRequired: 2, unit: "Pcs", estUnitCost: 8900, customerSupplied: 0, requiredDate: "2026-09-25", preferredSupplier: "SMC (Thailand) Ltd.", leadTimeDays: 21, estimateLineId: "i13", ownerId: "u5", nonStock: false, remark: "" },
  { id: "bl17", bomId: "bom1", section: "HW.ME", itemId: "", itemCode: "ME-FAB-001", partNo: "MF-CNV-2600", description: "Conveyor frame and guarding fabrication", brand: "—", specification: "SS400 painted, 6 m", qtyRequired: 1, unit: "Lot", estUnitCost: 217200, customerSupplied: 0, requiredDate: "2026-10-20", preferredSupplier: "TP Precision Fabrication", leadTimeDays: 45, estimateLineId: "i13", ownerId: "u5", nonStock: false, remark: "" },
  { id: "bl18", bomId: "bom1", section: "HW.ME", itemId: "", itemCode: "ME-ASM-001", partNo: "SF-2400", description: "Safety fence with interlock door", brand: "—", specification: "H2000, 24 m perimeter", qtyRequired: 1, unit: "Lot", estUnitCost: 88000, customerSupplied: 1, requiredDate: "2026-11-10", preferredSupplier: "—", leadTimeDays: 0, estimateLineId: "i14", ownerId: "u5", nonStock: false, remark: "Astemo reuses the existing line fence (R03)" },
  // --- Hardware · Server / PC ---
  { id: "bl19", bomId: "bom1", section: "HW.PC", itemId: "mi14", itemCode: "HW-IPC-001", partNo: "IPC-240", description: "Industrial PC i7 / 32GB / 1TB SSD", brand: "Advantech", specification: "Fanless, 24/7 operation", qtyRequired: 1, unit: "Set", estUnitCost: 98500, customerSupplied: 0, requiredDate: "2026-09-05", preferredSupplier: "Cisco Partner — Datacom Thai", leadTimeDays: 45, estimateLineId: "i7", ownerId: "u1", nonStock: false, remark: "Covered by stock — do not purchase" },
  // --- Hardware · Infrastructure ---
  { id: "bl20", bomId: "bom1", section: "HW.INF", itemId: "mi13", itemCode: "HW-NET-001", partNo: "IE-3300-8T2S", description: "Industrial managed switch 8 port", brand: "Cisco", specification: "Layer 2, DIN rail", qtyRequired: 2, unit: "Pcs", estUnitCost: 41200, customerSupplied: 0, requiredDate: "2026-09-15", preferredSupplier: "Cisco Partner — Datacom Thai", leadTimeDays: 45, estimateLineId: "i6", ownerId: "u1", nonStock: false, remark: "" },
  // --- Software ---
  { id: "bl21", bomId: "bom1", section: "SW", itemId: "", itemCode: "SW-APP-001", partNo: "TT-TRACE-STD", description: "Traceability application license", brand: "—", specification: "10 station license", qtyRequired: 1, unit: "Lot", estUnitCost: 120000, customerSupplied: 0, requiredDate: "2026-11-20", preferredSupplier: "TOMAS TECH", leadTimeDays: 0, estimateLineId: "i8", ownerId: "u3", nonStock: true, remark: "Internal package — no stock" },
  { id: "bl22", bomId: "bom1", section: "SW", itemId: "", itemCode: "SW-DB-001", partNo: "SQL-STD-2Core", description: "SQL Server Standard runtime license", brand: "Microsoft", specification: "2 core pack", qtyRequired: 2, unit: "Pcs", estUnitCost: 68000, customerSupplied: 0, requiredDate: "2026-11-20", preferredSupplier: "Cisco Partner — Datacom Thai", leadTimeDays: 14, estimateLineId: "i9", ownerId: "u3", nonStock: true, remark: "" },
  // --- Service & Installation ---
  { id: "bl23", bomId: "bom1", section: "SVC", itemId: "", itemCode: "TR-DEL-001", partNo: "—", description: "Delivery to Amata City and unloading", brand: "—", specification: "6 wheel truck with crane", qtyRequired: 2, unit: "Service", estUnitCost: 12500, customerSupplied: 0, requiredDate: "2026-12-15", preferredSupplier: "Local Logistics", leadTimeDays: 7, estimateLineId: "i17", ownerId: "u7", nonStock: true, remark: "" },
];

/* ---- Purchase requisitions ------------------------------------------------- */

export const MAT_PR_STATUSES = ["Draft", "In Approval", "Approved", "Rejected", "Converted to PO", "Cancelled"] as const;
export type MatPrStatus = (typeof MAT_PR_STATUSES)[number];

export type MatApprovalStep = {
  name: string;
  approverId: string;
  status: "Completed" | "Current" | "Pending" | "Not Required" | "Auto-added";
  at: string;
  comment: string;
  /** Why the step exists when a rule added it automatically. */
  rule: string;
};

export type MatPrLine = {
  id: string;
  prId: string;
  bomLineId: string;
  itemId: string;
  itemCode: string;
  partNo: string;
  description: string;
  qtyRequired: number;
  /** Stock available at the moment the PR was raised — the audit snapshot. */
  stockSnapshot: number;
  qty: number;
  estUnitCost: number;
  unitPrice: number;
  priceSource: "Price Library" | "Supplier Quotation" | "Manual" | "Previous Purchase";
  supplier: string;
  leadTimeDays: number;
  budgetSection: string;
  reason: string;
  attachment: string;
  unplanned: boolean;
  unplannedJustification: string;
};

export type MatPr = {
  id: string;
  no: string;
  sourceBomId: string;
  sourceLabel: string;
  projectId: string;
  requestedBy: string;
  department: string;
  requestDate: string;
  requiredDate: string;
  priority: "Normal" | "High" | "Emergency";
  status: MatPrStatus;
  steps: MatApprovalStep[];
  lines: MatPrLine[];
};

export const MAT_PRS: MatPr[] = [
  {
    // Advance order for the long-lead items, already converted to POs.
    id: "mpr1", no: "PR-2608-0004", sourceBomId: "bom1", sourceLabel: "BOM-2608-0001 R01",
    projectId: "p8", requestedBy: "u1", department: "Engineering",
    requestDate: "2026-08-19", requiredDate: "2026-10-30", priority: "High", status: "Converted to PO",
    steps: [
      { name: "Submitted by Requester", approverId: "u1", status: "Completed", at: "2026-08-19 10:12", comment: "", rule: "" },
      { name: "Section Owner Review", approverId: "u10", status: "Completed", at: "2026-08-19 14:40", comment: "Robot spec confirmed with DENSO", rule: "" },
      { name: "Budget Owner Approval", approverId: "u7", status: "Completed", at: "2026-08-20 09:05", comment: "Long-lead advance order per project plan", rule: "" },
      { name: "Purchasing Review", approverId: "u12", status: "Completed", at: "2026-08-20 15:30", comment: "Split into 4 POs by supplier; fiber order raised to 10 pcs to restock", rule: "" },
      { name: "Management Approval", approverId: "u6", status: "Completed", at: "2026-08-21 08:50", comment: "Approved — value above 1M THB", rule: "PR value exceeds 1,000,000 THB" },
      { name: "PO Creation", approverId: "u12", status: "Completed", at: "2026-08-21 11:20", comment: "PO-2608-0009 / 0010 / 0011 / 0012", rule: "" },
    ],
    lines: [
      { id: "mprl1", prId: "mpr1", bomLineId: "bl1", itemId: "mi15", itemCode: "RB-ROB-001", partNo: "COBOTTA PRO 1300", description: "Collaborative robot 6 axis / 12 kg", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 1180000, unitPrice: 1180000, priceSource: "Supplier Quotation", supplier: "DENSO Wave Robotics", leadTimeDays: 60, budgetSection: "HW.STD", reason: "60 day lead time", attachment: "SQ-2608-0025.pdf", unplanned: false, unplannedJustification: "" },
      { id: "mprl2", prId: "mpr1", bomLineId: "bl12", itemId: "mi9", itemCode: "EL-SEN-101", partNo: "FS-N43N + FU-35FA", description: "Fiber optic sensor with amplifier", qtyRequired: 8, stockSnapshot: 2, qty: 10, estUnitCost: 1750, unitPrice: 1750, priceSource: "Price Library", supplier: "RS Components Thailand", leadTimeDays: 10, budgetSection: "HW.EL", reason: "6 short for BOM + 4 buffer (pack of 10)", attachment: "", unplanned: false, unplannedJustification: "" },
      { id: "mprl3", prId: "mpr1", bomLineId: "bl14", itemId: "", itemCode: "EL-PNL-001", partNo: "CP-MAIN-01", description: "Panel enclosure 800x1800 + fabrication", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 82000, unitPrice: 82000, priceSource: "Supplier Quotation", supplier: "Thai Control Panel Works", leadTimeDays: 30, budgetSection: "HW.EL", reason: "", attachment: "SQ-2608-0018.pdf", unplanned: false, unplannedJustification: "" },
      { id: "mprl4", prId: "mpr1", bomLineId: "bl15", itemId: "", itemCode: "EL-WIR-001", partNo: "—", description: "Field wiring material and cable tray", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 96000, unitPrice: 96000, priceSource: "Supplier Quotation", supplier: "Thai Control Panel Works", leadTimeDays: 21, budgetSection: "HW.EL", reason: "", attachment: "SQ-2608-0018.pdf", unplanned: false, unplannedJustification: "" },
      { id: "mprl5", prId: "mpr1", bomLineId: "bl17", itemId: "", itemCode: "ME-FAB-001", partNo: "MF-CNV-2600", description: "Conveyor frame and guarding fabrication", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 217200, unitPrice: 217200, priceSource: "Supplier Quotation", supplier: "TP Precision Fabrication", leadTimeDays: 45, budgetSection: "HW.ME", reason: "45 day fabrication", attachment: "SQ-2608-0021.pdf", unplanned: false, unplannedJustification: "" },
    ],
  },
  {
    // The requisition currently sitting with the budget owner — the module's demo star.
    id: "mpr2", no: "PR-2608-0005", sourceBomId: "bom1", sourceLabel: "BOM-2608-0001 R01",
    projectId: "p8", requestedBy: "u11", department: "Engineering",
    requestDate: "2026-08-29", requiredDate: "2026-09-20", priority: "Normal", status: "In Approval",
    steps: [
      { name: "Submitted by Requester", approverId: "u11", status: "Completed", at: "2026-08-29 09:30", comment: "", rule: "" },
      { name: "Section Owner Review", approverId: "u1", status: "Completed", at: "2026-08-29 11:15", comment: "Quantities checked against BOM shortage", rule: "" },
      { name: "Budget Owner Approval", approverId: "u7", status: "Current", at: "", comment: "", rule: "" },
      { name: "Purchasing Review", approverId: "u12", status: "Pending", at: "", comment: "", rule: "" },
      { name: "Management Approval", approverId: "u6", status: "Auto-added", at: "", comment: "", rule: "G9SE-401 unit price is 12.5% above the estimate (limit 10%)" },
      { name: "PO Creation", approverId: "u12", status: "Pending", at: "", comment: "", rule: "" },
    ],
    lines: [
      { id: "mprl6", prId: "mpr2", bomLineId: "bl6", itemId: "mi3", itemCode: "EL-HMI-101", partNo: "GT2505-VTBD", description: "Touch panel 5.7 inch TFT", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 24500, unitPrice: 24500, priceSource: "Supplier Quotation", supplier: "Mitsubishi Electric Automation", leadTimeDays: 21, budgetSection: "HW.EL", reason: "No stock", attachment: "SQ-2608-0027.pdf", unplanned: false, unplannedJustification: "" },
      { id: "mprl7", prId: "mpr2", bomLineId: "bl7", itemId: "mi4", itemCode: "EL-BRK-101", partNo: "NF63-CV 3P 20A", description: "MCCB 3 pole 20 A", qtyRequired: 2, stockSnapshot: 0, qty: 1, estUnitCost: 1850, unitPrice: 1850, priceSource: "Price Library", supplier: "RS Components Thailand", leadTimeDays: 7, budgetSection: "HW.EL", reason: "1 issued from stock, 1 short", attachment: "", unplanned: false, unplannedJustification: "" },
      { id: "mprl8", prId: "mpr2", bomLineId: "bl10", itemId: "mi7", itemCode: "EL-PSU-101", partNo: "S8FS-G24024CD", description: "Switching power supply 24 V 10 A", qtyRequired: 2, stockSnapshot: 0, qty: 1, estUnitCost: 3150, unitPrice: 3150, priceSource: "Price Library", supplier: "RS Components Thailand", leadTimeDays: 10, budgetSection: "HW.EL", reason: "1 issued from stock, 1 short", attachment: "", unplanned: false, unplannedJustification: "" },
      { id: "mprl9", prId: "mpr2", bomLineId: "bl11", itemId: "mi8", itemCode: "EL-RLY-102", partNo: "G9SE-401", description: "Safety relay unit 4 contacts", qtyRequired: 2, stockSnapshot: 0, qty: 2, estUnitCost: 4890, unitPrice: 5501, priceSource: "Manual", supplier: "RS Components Thailand", leadTimeDays: 21, budgetSection: "HW.EL", reason: "RS list price increased — manual price", attachment: "RS-pricelist-aug26.pdf", unplanned: false, unplannedJustification: "" },
      { id: "mprl10", prId: "mpr2", bomLineId: "bl16", itemId: "mi11", itemCode: "ME-GRP-101", partNo: "MHZ2-25D", description: "Pneumatic parallel gripper", qtyRequired: 2, stockSnapshot: 0, qty: 2, estUnitCost: 8900, unitPrice: 8900, priceSource: "Supplier Quotation", supplier: "SMC (Thailand) Ltd.", leadTimeDays: 21, budgetSection: "HW.ME", reason: "No stock", attachment: "SQ-2608-0033.pdf", unplanned: false, unplannedJustification: "" },
      { id: "mprl11", prId: "mpr2", bomLineId: "bl2", itemId: "mi12", itemCode: "HW-SEN-001", partNo: "SR-X300", description: "Barcode reader 2D fixed mount", qtyRequired: 2, stockSnapshot: 1, qty: 1, estUnitCost: 48500, unitPrice: 48500, priceSource: "Price Library", supplier: "Keyence (Thailand) Co., Ltd.", leadTimeDays: 30, budgetSection: "HW.STD", reason: "1 reserved from stock, 1 short", attachment: "", unplanned: false, unplannedJustification: "" },
      { id: "mprl12", prId: "mpr2", bomLineId: "bl20", itemId: "mi13", itemCode: "HW-NET-001", partNo: "IE-3300-8T2S", description: "Industrial managed switch 8 port", qtyRequired: 2, stockSnapshot: 1, qty: 1, estUnitCost: 41200, unitPrice: 41200, priceSource: "Supplier Quotation", supplier: "Cisco Partner — Datacom Thai", leadTimeDays: 45, budgetSection: "HW.INF", reason: "1 reserved from stock, 1 short", attachment: "SQ-2607-0044.pdf", unplanned: false, unplannedJustification: "" },
    ],
  },
  {
    // Legacy requisitions migrated from the previous module (Katolec Ink Jet).
    id: "mpr3", no: "PR-2608-0002", sourceBomId: "", sourceLabel: "EST-2608-0001 (no BOM)",
    projectId: "p1", requestedBy: "u2", department: "Engineering",
    requestDate: "2026-08-24", requiredDate: "2026-10-02", priority: "Normal", status: "In Approval",
    steps: [
      { name: "Submitted by Requester", approverId: "u2", status: "Completed", at: "2026-08-24 10:00", comment: "", rule: "" },
      { name: "Section Owner Review", approverId: "u6", status: "Completed", at: "2026-08-24 13:00", comment: "", rule: "" },
      { name: "Budget Owner Approval", approverId: "u7", status: "Completed", at: "2026-08-25 09:00", comment: "", rule: "" },
      { name: "Purchasing Review", approverId: "u12", status: "Current", at: "", comment: "", rule: "" },
      { name: "Management Approval", approverId: "u6", status: "Not Required", at: "", comment: "", rule: "" },
      { name: "PO Creation", approverId: "u12", status: "Pending", at: "", comment: "", rule: "" },
    ],
    lines: [
      { id: "mprl13", prId: "mpr3", bomLineId: "", itemId: "", itemCode: "HW-MRK-001", partNo: "MK-G1000", description: "Ink jet marking head", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 186000, unitPrice: 186000, priceSource: "Supplier Quotation", supplier: "KEYENCE (Thailand) Co., Ltd.", leadTimeDays: 30, budgetSection: "HW.STD", reason: "", attachment: "", unplanned: false, unplannedJustification: "" },
      { id: "mprl14", prId: "mpr3", bomLineId: "", itemId: "", itemCode: "EL-WIR-002", partNo: "—", description: "Marking head cabling set", qtyRequired: 1, stockSnapshot: 0, qty: 1, estUnitCost: 42500, unitPrice: 42500, priceSource: "Price Library", supplier: "RS Components Thailand", leadTimeDays: 14, budgetSection: "HW.EL", reason: "", attachment: "", unplanned: false, unplannedJustification: "" },
    ],
  },
];

/* ---- Purchase orders -------------------------------------------------------- */

export type MatPoLine = {
  id: string;
  poId: string;
  prLineId: string;
  bomLineId: string;
  itemId: string;
  itemCode: string;
  partNo: string;
  description: string;
  qty: number;
  unitPrice: number;
};

export type MatPo = {
  id: string;
  no: string;
  prId: string;
  projectId: string;
  supplier: string;
  orderDate: string;
  confirmedDate: string;
  expectedDate: string;
  createdBy: string;
  status: "Ordered" | "Confirmed" | "Partially Received" | "Received" | "Closed";
  lines: MatPoLine[];
};

export const MAT_POS: MatPo[] = [
  {
    id: "mpo1", no: "PO-2608-0009", prId: "mpr1", projectId: "p8", supplier: "DENSO Wave Robotics",
    orderDate: "2026-08-21", confirmedDate: "2026-08-24", expectedDate: "2026-10-20", createdBy: "u12", status: "Confirmed",
    lines: [
      { id: "mpol1", poId: "mpo1", prLineId: "mprl1", bomLineId: "bl1", itemId: "mi15", itemCode: "RB-ROB-001", partNo: "COBOTTA PRO 1300", description: "Collaborative robot 6 axis / 12 kg", qty: 1, unitPrice: 1180000 },
    ],
  },
  {
    id: "mpo2", no: "PO-2608-0010", prId: "mpr1", projectId: "p8", supplier: "RS Components Thailand",
    orderDate: "2026-08-21", confirmedDate: "2026-08-22", expectedDate: "2026-08-31", createdBy: "u12", status: "Partially Received",
    lines: [
      { id: "mpol2", poId: "mpo2", prLineId: "mprl2", bomLineId: "bl12", itemId: "mi9", itemCode: "EL-SEN-101", partNo: "FS-N43N + FU-35FA", description: "Fiber optic sensor with amplifier", qty: 10, unitPrice: 1750 },
    ],
  },
  {
    id: "mpo3", no: "PO-2608-0011", prId: "mpr1", projectId: "p8", supplier: "Thai Control Panel Works",
    orderDate: "2026-08-21", confirmedDate: "2026-08-25", expectedDate: "2026-09-25", createdBy: "u12", status: "Confirmed",
    lines: [
      { id: "mpol3", poId: "mpo3", prLineId: "mprl3", bomLineId: "bl14", itemId: "", itemCode: "EL-PNL-001", partNo: "CP-MAIN-01", description: "Panel enclosure 800x1800 + fabrication", qty: 1, unitPrice: 82000 },
      { id: "mpol4", poId: "mpo3", prLineId: "mprl4", bomLineId: "bl15", itemId: "", itemCode: "EL-WIR-001", partNo: "—", description: "Field wiring material and cable tray", qty: 1, unitPrice: 96000 },
    ],
  },
  {
    id: "mpo4", no: "PO-2608-0012", prId: "mpr1", projectId: "p8", supplier: "TP Precision Fabrication",
    orderDate: "2026-08-21", confirmedDate: "", expectedDate: "2026-10-20", createdBy: "u12", status: "Ordered",
    lines: [
      { id: "mpol5", poId: "mpo4", prLineId: "mprl5", bomLineId: "bl17", itemId: "", itemCode: "ME-FAB-001", partNo: "MF-CNV-2600", description: "Conveyor frame and guarding fabrication", qty: 1, unitPrice: 217200 },
    ],
  },
];

/* ---- Goods receiving --------------------------------------------------------- */

export type GrnLine = {
  id: string;
  grnId: string;
  poLineId: string;
  itemId: string;
  itemCode: string;
  partNo: string;
  orderedQty: number;
  previouslyReceived: number;
  receivedQty: number;
  acceptedQty: number;
  damagedQty: number;
  rejectedQty: number;
  unit: string;
  lotNo: string;
  serialNo: string;
  location: string;
  qcStatus: "Pending" | "Passed" | "Failed";
  projectAllocation: string;
  remark: string;
};

export type Grn = {
  id: string;
  no: string;
  poId: string;
  prId: string;
  supplier: string;
  deliveryNote: string;
  invoiceRef: string;
  receivedBy: string;
  receivedAt: string;
  warehouse: string;
  status: "Draft" | "Confirmed";
  deliveryStatus: "Partial Delivery" | "Full Delivery";
  damageReport: string;
  photos: number;
  lines: GrnLine[];
};

export const GRNS: Grn[] = [
  {
    id: "grn1", no: "GRN-2608-0012", poId: "mpo2", prId: "mpr1", supplier: "RS Components Thailand",
    deliveryNote: "DN-RS-260826-114", invoiceRef: "INV-RS-88712", receivedBy: "u13", receivedAt: "2026-08-26 10:35",
    warehouse: "WH1 — Chonburi Store", status: "Confirmed", deliveryStatus: "Partial Delivery",
    damageReport: "DR-2608-0002 — 1 amplifier housing cracked in transit", photos: 3,
    lines: [
      {
        id: "grnl1", grnId: "grn1", poLineId: "mpol2", itemId: "mi9", itemCode: "EL-SEN-101", partNo: "FS-N43N + FU-35FA",
        orderedQty: 10, previouslyReceived: 0, receivedQty: 6, acceptedQty: 5, damagedQty: 1, rejectedQty: 0,
        unit: "Set", lotNo: "LOT-KE-26082", serialNo: "—", location: "WH1-C1", qcStatus: "Passed",
        projectAllocation: "PJ260153 (4) + Stock (1)", remark: "Balance 4 confirmed by RS for 31 Aug",
      },
    ],
  },
];

/* ---- Material issue requests --------------------------------------------------- */

export const MIR_STATUSES = ["Draft", "Pending Approval", "Approved", "Picking", "Issued", "Received", "Completed"] as const;
export type MirStatus = (typeof MIR_STATUSES)[number];

export type MirLine = {
  id: string;
  mirId: string;
  bomLineId: string;
  itemId: string;
  itemCode: string;
  partNo: string;
  bomQty: number;
  previouslyIssued: number;
  requestedQty: number;
  issueQty: number;
  returnedQty: number;
  location: string;
  purpose: string;
  workArea: string;
  lotNo: string;
};

export type Mir = {
  id: string;
  no: string;
  projectId: string;
  bomId: string;
  requestedBy: string;
  requestedAt: string;
  requiredDate: string;
  status: MirStatus;
  approvedBy: string;
  approvedAt: string;
  pickedBy: string;
  issuedBy: string;
  issuedAt: string;
  receivedBy: string;
  receivedAt: string;
  purpose: string;
  workArea: string;
  lines: MirLine[];
};

export const MIRS: Mir[] = [
  {
    id: "mir1", no: "MIR-2608-0007", projectId: "p8", bomId: "bom1",
    requestedBy: "u11", requestedAt: "2026-08-26 13:00", requiredDate: "2026-08-27", status: "Completed",
    approvedBy: "u1", approvedAt: "2026-08-26 15:20", pickedBy: "u13",
    issuedBy: "u13", issuedAt: "2026-08-27 09:30", receivedBy: "u11", receivedAt: "2026-08-27 09:45",
    purpose: "Main control panel assembly", workArea: "Workshop Bay 2",
    lines: [
      { id: "mirl1", mirId: "mir1", bomLineId: "bl4", itemId: "mi1", itemCode: "EL-PLC-101", partNo: "FX5U-64MT/ES", bomQty: 1, previouslyIssued: 0, requestedQty: 1, issueQty: 1, returnedQty: 0, location: "WH1-A1", purpose: "Panel assembly", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl2", mirId: "mir1", bomLineId: "bl5", itemId: "mi2", itemCode: "EL-PLC-102", partNo: "FX5-16EX/ES", bomQty: 2, previouslyIssued: 0, requestedQty: 2, issueQty: 2, returnedQty: 0, location: "WH1-A1", purpose: "Panel assembly", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl3", mirId: "mir1", bomLineId: "bl7", itemId: "mi4", itemCode: "EL-BRK-101", partNo: "NF63-CV 3P 20A", bomQty: 2, previouslyIssued: 0, requestedQty: 1, issueQty: 1, returnedQty: 0, location: "WH1-B1", purpose: "Panel assembly", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl4", mirId: "mir1", bomLineId: "bl8", itemId: "mi5", itemCode: "EL-BRK-102", partNo: "CP30-BA 5A", bomQty: 6, previouslyIssued: 0, requestedQty: 6, issueQty: 6, returnedQty: 0, location: "WH1-B1", purpose: "Panel assembly", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl5", mirId: "mir1", bomLineId: "bl9", itemId: "mi6", itemCode: "EL-RLY-101", partNo: "MY4N-GS 24VDC", bomQty: 12, previouslyIssued: 0, requestedQty: 12, issueQty: 12, returnedQty: 2, location: "WH1-B2", purpose: "Panel assembly", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl6", mirId: "mir1", bomLineId: "bl10", itemId: "mi7", itemCode: "EL-PSU-101", partNo: "S8FS-G24024CD", bomQty: 2, previouslyIssued: 0, requestedQty: 1, issueQty: 1, returnedQty: 0, location: "WH1-B3", purpose: "Panel assembly", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl7", mirId: "mir1", bomLineId: "bl12", itemId: "mi9", itemCode: "EL-SEN-101", partNo: "FS-N43N + FU-35FA", bomQty: 8, previouslyIssued: 0, requestedQty: 5, issueQty: 5, returnedQty: 0, location: "WH1-C1", purpose: "Conveyor sensor rail", workArea: "Workshop Bay 2", lotNo: "LOT-KE-26082" },
    ],
  },
  {
    id: "mir2", no: "MIR-2608-0008", projectId: "p8", bomId: "bom1",
    requestedBy: "u11", requestedAt: "2026-08-29 10:40", requiredDate: "2026-09-05", status: "Pending Approval",
    approvedBy: "", approvedAt: "", pickedBy: "", issuedBy: "", issuedAt: "", receivedBy: "", receivedAt: "",
    purpose: "Vision station bring-up", workArea: "Workshop Bay 2",
    lines: [
      { id: "mirl8", mirId: "mir2", bomLineId: "bl19", itemId: "mi14", itemCode: "HW-IPC-001", partNo: "IPC-240", bomQty: 1, previouslyIssued: 0, requestedQty: 1, issueQty: 0, returnedQty: 0, location: "WH1-E2", purpose: "Vision processing PC", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl9", mirId: "mir2", bomLineId: "bl2", itemId: "mi12", itemCode: "HW-SEN-001", partNo: "SR-X300", bomQty: 2, previouslyIssued: 0, requestedQty: 1, issueQty: 0, returnedQty: 0, location: "WH1-C3", purpose: "Station 1 reader", workArea: "Workshop Bay 2", lotNo: "—" },
      { id: "mirl10", mirId: "mir2", bomLineId: "bl13", itemId: "mi10", itemCode: "EL-SEN-102", partNo: "D4NS-4CF", bomQty: 2, previouslyIssued: 0, requestedQty: 2, issueQty: 0, returnedQty: 0, location: "WH1-C2", purpose: "Fence door interlock", workArea: "Workshop Bay 2", lotNo: "—" },
    ],
  },
];

/* ---- Stock adjustments awaiting the inventory controller ----------------------- */

export type StockAdjustment = {
  id: string;
  no: string;
  itemId: string;
  qtyChange: number;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: "Pending Approval" | "Approved" | "Rejected";
  approvedBy: string;
};

export const STOCK_ADJUSTMENTS: StockAdjustment[] = [
  { id: "adj1", no: "ADJ-2608-0003", itemId: "mi5", qtyChange: -1, reason: "Cycle count 29 Aug found 3 pcs, ledger says 4 — one unit missing", requestedBy: "u13", requestedAt: "2026-08-29 08:30", status: "Pending Approval", approvedBy: "" },
];

/* ---- Material audit trail — append-only, never edited --------------------------- */

export type MatAudit = {
  id: string;
  at: string;
  actorId: string;
  role: string;
  action: string;
  entity: "BOM" | "PR" | "PO" | "GRN" | "MIR" | "Stock" | "Reservation" | "Adjustment";
  entityNo: string;
  before: string;
  after: string;
  qty: number;
  projectId: string;
  reason: string;
  attachment: string;
  approverId: string;
};

export const MAT_AUDIT: MatAudit[] = [
  { id: "mau1", at: "2026-08-18 09:12", actorId: "u1", role: "Engineer", action: "Generated BOM from Estimate", entity: "BOM", entityNo: "BOM-2608-0001 R01", before: "—", after: "23 lines from EST-2608-0001 R03", qty: 0, projectId: "p8", reason: "", attachment: "", approverId: "" },
  { id: "mau2", at: "2026-08-19 08:40", actorId: "u7", role: "Project Manager", action: "Released BOM", entity: "BOM", entityNo: "BOM-2608-0001 R01", before: "Draft", after: "Released", qty: 0, projectId: "p8", reason: "Budget reconciled with R03", attachment: "", approverId: "u7" },
  { id: "mau3", at: "2026-08-19 09:00", actorId: "u1", role: "Engineer", action: "Reserved stock for project", entity: "Reservation", entityNo: "EL-PLC-101", before: "Available 2", after: "Reserved 1 → PJ260153", qty: 1, projectId: "p8", reason: "BOM allocation", attachment: "", approverId: "" },
  { id: "mau4", at: "2026-08-19 10:12", actorId: "u1", role: "Engineer", action: "Submitted PR", entity: "PR", entityNo: "PR-2608-0004", before: "Draft", after: "In Approval", qty: 0, projectId: "p8", reason: "Long-lead advance order", attachment: "", approverId: "" },
  { id: "mau5", at: "2026-08-21 08:50", actorId: "u6", role: "Engineering Manager", action: "Approved PR (management)", entity: "PR", entityNo: "PR-2608-0004", before: "In Approval", after: "Approved", qty: 0, projectId: "p8", reason: "Value above 1,000,000 THB threshold", attachment: "", approverId: "u6" },
  { id: "mau6", at: "2026-08-21 11:20", actorId: "u12", role: "Purchasing", action: "Converted PR to PO", entity: "PO", entityNo: "PO-2608-0009 / 0010 / 0011 / 0012", before: "PR-2608-0004", after: "4 purchase orders by supplier", qty: 0, projectId: "p8", reason: "Fiber order consolidated to 10 pcs (+4 restock)", attachment: "", approverId: "" },
  { id: "mau7", at: "2026-08-26 10:35", actorId: "u13", role: "Warehouse", action: "Confirmed goods receipt (partial)", entity: "GRN", entityNo: "GRN-2608-0012", before: "Ordered 10 / received 0", after: "Received 6 — accepted 5, damaged 1", qty: 6, projectId: "p8", reason: "Partial delivery, balance 4 due 31 Aug", attachment: "DN-RS-260826-114", approverId: "" },
  { id: "mau8", at: "2026-08-26 10:36", actorId: "u13", role: "Warehouse", action: "Sent to quarantine", entity: "Stock", entityNo: "EL-SEN-101", before: "—", after: "1 pc quarantine WH1-QC", qty: 1, projectId: "p8", reason: "Amplifier housing cracked — DR-2608-0002", attachment: "DR-2608-0002.pdf", approverId: "" },
  { id: "mau9", at: "2026-08-26 15:20", actorId: "u1", role: "Engineer", action: "Approved material issue", entity: "MIR", entityNo: "MIR-2608-0007", before: "Pending Approval", after: "Approved", qty: 0, projectId: "p8", reason: "", attachment: "", approverId: "u1" },
  { id: "mau10", at: "2026-08-27 09:30", actorId: "u13", role: "Warehouse", action: "Issued material", entity: "MIR", entityNo: "MIR-2608-0007", before: "Picking", after: "Issued — 7 lines, 28 pcs", qty: 28, projectId: "p8", reason: "", attachment: "PICK-2608-0007", approverId: "" },
  { id: "mau11", at: "2026-08-27 09:45", actorId: "u11", role: "Engineer", action: "Confirmed member receipt", entity: "MIR", entityNo: "MIR-2608-0007", before: "Issued", after: "Received by Chakkrit Manee", qty: 28, projectId: "p8", reason: "", attachment: "", approverId: "" },
  { id: "mau12", at: "2026-08-28 16:10", actorId: "u13", role: "Warehouse", action: "Processed material return", entity: "MIR", entityNo: "MIR-2608-0007", before: "MY4N-GS issued 12", after: "2 returned to WH1-B2", qty: 2, projectId: "p8", reason: "Over-picked", attachment: "", approverId: "" },
  { id: "mau13", at: "2026-08-29 08:30", actorId: "u13", role: "Warehouse", action: "Requested stock adjustment", entity: "Adjustment", entityNo: "ADJ-2608-0003", before: "CP30-BA ledger 4", after: "Count 3 (−1)", qty: -1, projectId: "", reason: "Cycle count discrepancy", attachment: "CC-2608-0002", approverId: "" },
  { id: "mau14", at: "2026-08-29 09:30", actorId: "u11", role: "Engineer", action: "Submitted PR", entity: "PR", entityNo: "PR-2608-0005", before: "Draft", after: "In Approval", qty: 0, projectId: "p8", reason: "BOM shortage after stock allocation", attachment: "", approverId: "" },
  { id: "mau15", at: "2026-08-29 10:40", actorId: "u11", role: "Engineer", action: "Submitted material issue request", entity: "MIR", entityNo: "MIR-2608-0008", before: "—", after: "Pending Approval — 3 lines", qty: 4, projectId: "p8", reason: "Vision station bring-up", attachment: "", approverId: "" },
];
