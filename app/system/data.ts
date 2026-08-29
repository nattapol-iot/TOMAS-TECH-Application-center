/* ==========================================================================
   Engineering Estimate Cost Management System — demonstration dataset.

   Every screen reads from this module so numbers stay consistent across the
   dashboard, the estimate workspace, the reports and the audit log.
   No selling price, margin or markup exists anywhere in this system: the
   application controls internal engineering cost only.
   ========================================================================== */

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

export type ManhourLine = {
  id: string;
  activity: string;
  department: string;
  level: string;
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  dailyRate: number;
  owner: string;
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
  hourly: number;
  daily: number;
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
  "FAT", "Internal Testing", "On-site Installation", "Commissioning", "SAT",
  "UAT Support", "Training", "Documentation", "Project Management", "Engineering Support",
];

export const ENGINEER_LEVELS = [
  "Junior Engineer", "Middle Engineer", "Senior Engineer",
  "Lead Engineer", "Technical Architect", "Manager",
];

export const DEPARTMENTS = ["PLC", "Software", "Electrical", "Mechanical", "Robotics", "IoT", "PMO"];

export const RATES: RateRecord[] = [
  { id: "r1", level: "Junior Engineer", department: "PLC", hourly: 313, daily: 2500, effective: "2026-01-01" },
  { id: "r2", level: "Middle Engineer", department: "PLC", hourly: 500, daily: 4000, effective: "2026-01-01" },
  { id: "r3", level: "Senior Engineer", department: "PLC", hourly: 625, daily: 5000, effective: "2026-01-01" },
  { id: "r4", level: "Junior Engineer", department: "Software", hourly: 344, daily: 2750, effective: "2026-01-01" },
  { id: "r5", level: "Middle Engineer", department: "Software", hourly: 563, daily: 4500, effective: "2026-01-01" },
  { id: "r6", level: "Senior Engineer", department: "Software", hourly: 688, daily: 5500, effective: "2026-01-01" },
  { id: "r7", level: "Middle Engineer", department: "Electrical", hourly: 469, daily: 3750, effective: "2026-01-01" },
  { id: "r8", level: "Senior Engineer", department: "Electrical", hourly: 594, daily: 4750, effective: "2026-01-01" },
  { id: "r9", level: "Middle Engineer", department: "Mechanical", hourly: 469, daily: 3750, effective: "2026-01-01" },
  { id: "r10", level: "Senior Engineer", department: "Mechanical", hourly: 594, daily: 4750, effective: "2026-01-01" },
  { id: "r11", level: "Middle Engineer", department: "Robotics", hourly: 531, daily: 4250, effective: "2026-01-01" },
  { id: "r12", level: "Senior Engineer", department: "IoT", hourly: 656, daily: 5250, effective: "2026-01-01" },
  { id: "r13", level: "Lead Engineer", department: "PMO", hourly: 750, daily: 6000, effective: "2026-01-01" },
  { id: "r14", level: "Manager", department: "Engineering", hourly: 875, daily: 7000, effective: "2026-01-01" },
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
  { id: "i18", categoryCode: "09", category: "Accommodation", subcategory: "Accommodation", module: "Site Support", itemCode: "AC-STY-001", description: "Site accommodation during commissioning", brand: "—", model: "—", specification: "2 rooms x 10 nights", supplier: "—", qty: 20, unit: "Day", unitCost: 1200, source: "Master Price", referenceNo: "MP-2601-0011", referenceProject: "—", priceDate: "2026-01-15", remark: "", owner: "u7", status: "Completed" },
];

const manhours0001: ManhourLine[] = [
  { id: "m1", activity: "System Design", department: "IoT", level: "Senior Engineer", engineers: 1, manDays: 8, hoursPerDay: 8, dailyRate: 5250, owner: "u1" },
  { id: "m2", activity: "PLC Programming", department: "PLC", level: "Middle Engineer", engineers: 1, manDays: 10, hoursPerDay: 8, dailyRate: 4000, owner: "u2" },
  { id: "m3", activity: "HMI Programming", department: "PLC", level: "Junior Engineer", engineers: 1, manDays: 6, hoursPerDay: 8, dailyRate: 2500, owner: "u2" },
  { id: "m4", activity: "Software Development", department: "Software", level: "Senior Engineer", engineers: 2, manDays: 12, hoursPerDay: 8, dailyRate: 5500, owner: "u3" },
  { id: "m5", activity: "Database Development", department: "Software", level: "Middle Engineer", engineers: 1, manDays: 8, hoursPerDay: 8, dailyRate: 4500, owner: "u3" },
  { id: "m6", activity: "Electrical Design", department: "Electrical", level: "Middle Engineer", engineers: 1, manDays: 7, hoursPerDay: 8, dailyRate: 3750, owner: "u4" },
  { id: "m7", activity: "Mechanical Design", department: "Mechanical", level: "Senior Engineer", engineers: 1, manDays: 9, hoursPerDay: 8, dailyRate: 4750, owner: "u5" },
  { id: "m8", activity: "Robot Programming", department: "Robotics", level: "Middle Engineer", engineers: 1, manDays: 8, hoursPerDay: 8, dailyRate: 4250, owner: "u10" },
  { id: "m9", activity: "FAT", department: "PLC", level: "Middle Engineer", engineers: 2, manDays: 3, hoursPerDay: 8, dailyRate: 4000, owner: "u2" },
  { id: "m10", activity: "On-site Installation", department: "Electrical", level: "Middle Engineer", engineers: 2, manDays: 5, hoursPerDay: 8, dailyRate: 3750, owner: "u4" },
  { id: "m11", activity: "Commissioning", department: "IoT", level: "Senior Engineer", engineers: 1, manDays: 6, hoursPerDay: 8, dailyRate: 5250, owner: "u1" },
  { id: "m12", activity: "Documentation", department: "Software", level: "Junior Engineer", engineers: 1, manDays: 4, hoursPerDay: 8, dailyRate: 2750, owner: "u3" },
  { id: "m13", activity: "Project Management", department: "PMO", level: "Lead Engineer", engineers: 1, manDays: 10, hoursPerDay: 8, dailyRate: 6000, owner: "u7" },
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
  { id: "n1", activity: "System Design", department: "IoT", level: "Senior Engineer", engineers: 1, manDays: 5, hoursPerDay: 8, dailyRate: 5250, owner: "u1" },
  { id: "n2", activity: "Software Development", department: "Software", level: "Middle Engineer", engineers: 1, manDays: 15, hoursPerDay: 8, dailyRate: 4500, owner: "u3" },
  { id: "n3", activity: "On-site Installation", department: "Electrical", level: "Middle Engineer", engineers: 2, manDays: 6, hoursPerDay: 8, dailyRate: 3750, owner: "u4" },
];

export const ESTIMATES: Estimate[] = [
  {
    id: "e1", no: "EST-2608-0001", inquiryNo: "INQ-2608-0001", customerId: "c1",
    projectName: "Cobot Picking Machine", projectType: "Robot", ownerId: "u1",
    revision: "R02", createdDate: "2026-08-10", dueDate: "2026-09-03",
    status: "Engineering Review", progress: 82, updatedAt: "2026-08-28 16:40",
    contingencyRate: 3,
    items: items0001, manhours: manhours0001, others: others0001,
    assignments: assignments0001, revisions: revisions0001,
  },
  {
    id: "e2", no: "EST-2608-0002", inquiryNo: "INQ-2608-0004", customerId: "c6",
    projectName: "IoT Energy Monitoring Phase 2", projectType: "IoT", ownerId: "u1",
    revision: "R00", createdDate: "2026-08-15", dueDate: "2026-09-05",
    status: "Engineering Input", progress: 55, updatedAt: "2026-08-27 11:12",
    contingencyRate: 3,
    items: items0002, manhours: manhours0002, others: [],
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
    items: items0002.slice(0, 2), manhours: manhours0002.slice(0, 2), others: [],
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
    items: items0001.slice(0, 8), manhours: manhours0001.slice(0, 6), others: [],
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
    items: items0001.slice(10, 16), manhours: manhours0001.slice(6, 12), others: [],
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
    items: items0002.slice(2), manhours: manhours0002, others: [],
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
