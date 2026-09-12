import type { LaborCostType, LaborProvider } from "./labor-master.js";

export const STANDARD_LABOR_SOURCE_DATE = "2026-09-10";
export const STANDARD_LABOR_SOURCE = "Honda-PB estimate workbook 20260909-001";

export type StandardLaborLine = {
  activity: string;
  provider: LaborProvider;
  engineers: number;
  manDays: number;
  referenceDailyRate: number;
  erpCategory: "Software" | "Service" | "Installation" | "Training";
  remark?: string;
};

export type StandardLaborPackage = {
  code: string;
  name: string;
  costType: LaborCostType;
  description: string;
  lines: StandardLaborLine[];
};

export type StandardSupportCostLine = {
  itemCode: string;
  description: string;
  categoryCode: "08" | "09" | "10";
  quantity: number;
  unit: string;
  unitCost: number;
  remark?: string;
};

export type StandardSupportCostTemplate = {
  code: string;
  name: string;
  description: string;
  lines: StandardSupportCostLine[];
};

const internal = (
  activity: string,
  manDays: number,
  erpCategory: StandardLaborLine["erpCategory"],
  remark?: string,
): StandardLaborLine => ({ activity, provider: "Internal", engineers: 1, manDays, referenceDailyRate: 3_500, erpCategory, ...(remark ? { remark } : {}) });

const supplier = (
  activity: string,
  manDays: number,
  referenceDailyRate: number,
  remark?: string,
): StandardLaborLine => ({ activity, provider: "Supplier", engineers: 1, manDays, referenceDailyRate, erpCategory: "Installation", ...(remark ? { remark } : {}) });

export const STANDARD_LABOR_PACKAGES: readonly StandardLaborPackage[] = [
  {
    code: "LP-STD-SW-DEVELOPMENT",
    name: "Software development — in-house",
    costType: "Engineering",
    description: "Reusable software design and development effort from the approved Excel example. Quantities are total person-days.",
    lines: [
      internal("Specification design", 10, "Software"),
      internal("Software design & application development", 15, "Software"),
      internal("Production data & quantity calculation function", 10, "Software"),
      internal("Feeder control & PLC integration development", 10, "Software"),
      internal("DPS / DiSC system integration development", 10, "Software"),
    ],
  },
  {
    code: "LP-STD-SW-SITE",
    name: "Software installation & commissioning — on-site",
    costType: "Installation",
    description: "On-site software activities. Excel quantities are stored as total person-days, so a 2-person activity is not multiplied twice.",
    lines: [
      internal("Software installation & configuration", 4, "Installation", "Excel unit showed 2 Man / Day; 4 is the total person-days."),
      internal("Feeder / PLC / DPS integration & commissioning", 8, "Installation", "Excel unit showed 2 Man / Day; 8 is the total person-days."),
      internal("Debugging, UAT & training", 6, "Training", "Excel unit showed 2 Man / Day; 6 is the total person-days."),
    ],
  },
  {
    code: "LP-STD-ME-DESIGN",
    name: "Mechanical design & in-house test",
    costType: "Engineering",
    description: "Mechanical engineering effort separated from transportation and accommodation support costs.",
    lines: [
      internal("Concept design / specification meeting", 20, "Service"),
      internal("Drawing design", 60, "Service"),
      internal("Assembly and test (in-house)", 60, "Service"),
    ],
  },
  {
    code: "LP-STD-ME-SITE",
    name: "Mechanical installation & test — on-site",
    costType: "Installation",
    description: "Mechanical on-site labor. Travel and accommodation are provided as a companion support-cost template.",
    lines: [
      internal("Installation and test run", 30, "Installation"),
      internal("Standby", 9, "Installation"),
    ],
  },
  {
    code: "LP-STD-EE-DESIGN",
    name: "Electrical design & in-house wiring",
    costType: "Engineering",
    description: "Electrical engineering and in-house wiring effort from the Excel example.",
    lines: [
      internal("Concept design / specification meeting", 3, "Service"),
      internal("Drawing design", 3, "Service"),
      internal("Assembly + wiring (in-house)", 1, "Service"),
    ],
  },
  {
    code: "LP-STD-EE-SITE",
    name: "Electrical installation & commissioning — on-site",
    costType: "Installation",
    description: "Electrical on-site labor. Standby was zero in the source and is intentionally omitted; add it only when needed.",
    lines: [
      internal("Installation + wiring (on-site)", 6, "Installation"),
      internal("Commissioning test", 3, "Installation"),
    ],
  },
  {
    code: "LP-STD-EE-SUB-IN",
    name: "Electrical subcontract — in-site assembly",
    costType: "Installation",
    description: "Supplier manpower reference. Select the real supplier and quotation when applying the package.",
    lines: [supplier("Foreman", 2, 3_000), supplier("Worker", 2, 1_500)],
  },
  {
    code: "LP-STD-EE-SUB-OUT",
    name: "Electrical subcontract — out-site assembly",
    costType: "Installation",
    description: "Supplier manpower reference. Select the real supplier and quotation when applying the package.",
    lines: [supplier("Foreman", 10, 4_000), supplier("Worker", 50, 2_500)],
  },
  {
    code: "LP-STD-ME-SUB-ASSY",
    name: "Mechanical subcontract — in-site assembly",
    costType: "Installation",
    description: "Supplier manpower for in-site assembly, test and adjustment.",
    lines: [supplier("Foreman", 30, 3_000), supplier("Worker", 90, 1_500)],
  },
  {
    code: "LP-STD-ME-SUB-PACK",
    name: "Mechanical subcontract — transportation & packing",
    costType: "Installation",
    description: "Supplier manpower for in-site transportation and packing.",
    lines: [supplier("Foreman", 2, 3_000), supplier("Worker", 10, 1_500)],
  },
  {
    code: "LP-STD-ME-SUB-DELIVERY",
    name: "Mechanical subcontract — delivery",
    costType: "Installation",
    description: "Supplier manpower for transportation from TOMAS factory to the customer site.",
    lines: [supplier("Foreman", 1, 3_000), supplier("Worker", 7, 1_500)],
  },
] as const;

const support = (
  itemCode: string,
  description: string,
  categoryCode: StandardSupportCostLine["categoryCode"],
  quantity: number,
  unit: string,
  unitCost: number,
  remark?: string,
): StandardSupportCostLine => ({ itemCode, description, categoryCode, quantity, unit, unitCost, ...(remark ? { remark } : {}) });

const safetyRemark = "Reference value equals 10% of the source workbook subtotal. Recalculate after changing manpower or support quantities.";

export const STANDARD_SUPPORT_COST_TEMPLATES: readonly StandardSupportCostTemplate[] = [
  {
    code: "MT-LAB-SW-SITE-SUPPORT",
    name: "Software on-site — travel & accommodation",
    description: "Companion support costs for LP-STD-SW-SITE.",
    lines: [support("SW-SITE-TRAVEL", "Travelling, accommodation & on-site expenses", "10", 18, "Lot", 5_000)],
  },
  {
    code: "MT-LAB-ME-SUPPORT",
    name: "Mechanical labor — transportation & accommodation",
    description: "Companion support costs for the mechanical internal labor packages.",
    lines: [
      support("ME-IN-TRANSPORT", "Transportation — in-house", "08", 30, "Day", 1_000),
      support("ME-OUT-TRANSPORT", "Transportation — on-site", "08", 13, "Day", 2_000),
      support("ME-OUT-ACCOM", "Accommodation — on-site", "09", 36, "Room night", 950),
    ],
  },
  {
    code: "MT-LAB-EE-INTERNAL-SUPPORT",
    name: "Electrical internal labor — accommodation",
    description: "Companion support costs for LP-STD-EE-SITE.",
    lines: [support("EE-INT-ACCOM", "Accommodation", "09", 9, "Room night", 950)],
  },
  {
    code: "MT-LAB-EE-SUB-IN-SUPPORT",
    name: "Electrical subcontract in-site — support costs",
    description: "Transportation, tools and source safety allowance for LP-STD-EE-SUB-IN.",
    lines: [
      support("EE-SUB-IN-TRANSPORT", "Transportation", "08", 2, "Day", 1_500),
      support("EE-SUB-IN-TOOLS", "Tools and equipment", "10", 2, "Set", 2_000),
      support("EE-SUB-IN-SAFETY", "Safety cost", "10", 1, "Set", 1_600, safetyRemark),
    ],
  },
  {
    code: "MT-LAB-EE-SUB-OUT-SUPPORT",
    name: "Electrical subcontract out-site — support costs",
    description: "Accommodation, transportation, tools and source safety allowance for LP-STD-EE-SUB-OUT.",
    lines: [
      support("EE-SUB-OUT-ACCOM", "Accommodation", "09", 30, "Room night", 800),
      support("EE-SUB-OUT-TRANSPORT", "Transportation", "08", 10, "Day", 1_500),
      support("EE-SUB-OUT-TOOLS", "Tools and equipment", "10", 1, "Set", 10_000),
      support("EE-SUB-OUT-SAFETY", "Safety cost", "10", 1, "Set", 21_400, safetyRemark),
    ],
  },
  {
    code: "MT-LAB-ME-SUB-ASSY-SUPPORT",
    name: "Mechanical subcontract assembly — support costs",
    description: "Transportation, tools and source safety allowance for LP-STD-ME-SUB-ASSY.",
    lines: [
      support("ME-SUB-ASSY-TRANSPORT", "Transportation", "08", 30, "Set", 2_000),
      support("ME-SUB-ASSY-TOOLS", "Tools and equipment", "10", 30, "Set", 2_000),
      support("ME-SUB-ASSY-SAFETY", "Safety cost", "10", 1, "Set", 34_500, safetyRemark),
    ],
  },
  {
    code: "MT-LAB-ME-SUB-PACK-SUPPORT",
    name: "Mechanical subcontract packing — support costs",
    description: "Transportation, packing tools, heavy tools and source safety allowance for LP-STD-ME-SUB-PACK.",
    lines: [
      support("ME-SUB-PACK-TRANSPORT", "Transportation", "08", 2, "Set", 2_000),
      support("ME-SUB-PACK-TOOLS", "Tools and equipment — packing tools", "10", 1, "Set", 10_000),
      support("ME-SUB-PACK-HEAVY", "Heavy tools — rental forklift + transport", "10", 1, "Set", 25_000),
      support("ME-SUB-PACK-SAFETY", "Safety cost", "10", 1, "Set", 6_000, safetyRemark),
    ],
  },
  {
    code: "MT-LAB-ME-SUB-DELIVERY-SUPPORT",
    name: "Mechanical subcontract delivery — support costs",
    description: "Transportation equipment and source safety allowance for LP-STD-ME-SUB-DELIVERY.",
    lines: [
      support("ME-SUB-DELIVERY-TRANSPORT", "Transportation", "08", 2, "Set", 2_000),
      support("ME-SUB-DELIVERY-TRUCK", "Tools and equipment — 6-wheel truck with liftgate", "10", 8, "Set", 20_000),
      support("ME-SUB-DELIVERY-FORKLIFT", "Heavy tools — rental forklift + transport", "10", 1, "Set", 25_000),
      support("ME-SUB-DELIVERY-SAFETY", "Safety cost", "10", 1, "Set", 20_250, safetyRemark),
    ],
  },
] as const;

export function laborReferenceTotal(pkg: StandardLaborPackage): number {
  return pkg.lines.reduce((sum, line) => sum + line.engineers * line.manDays * line.referenceDailyRate, 0);
}

export function supportReferenceTotal(template: StandardSupportCostTemplate): number {
  return template.lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
}
