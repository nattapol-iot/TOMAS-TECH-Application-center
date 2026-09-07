/** Read-only management reporting contract. Amounts are costs, never revenue. */
export const DASHBOARD_ROLES = ["Admin", "Management", "CEO", "Engineering Manager", "Project Manager", "Sales Manager"];
export type DashboardLink = "projects" | "inquiries" | "estimates" | "resources" | "purchase" | "pos" | "receiving" | "signing" | "reports";
export type ExecutiveProject = {
  id: number; inquiryId: number; number: string; name: string; customerId: number; customer: string; department: string;
  managerId: number; manager: string; status: string; start: string; due: string; progress: number;
  budget: number | null; materialBudget: number | null; forecast: string | null; overdue: number;
  blocked: number; taskCount: number; unknownSchedule: boolean; plannedProgress: number | null;
};
export type ExecutiveInquiry = {
  id: number; number: string; name: string; customerId: number; customer: string; department: string;
  ownerId: number; owner: string; status: string; date: string; due: string; probability: number;
};
export type ExecutiveEstimate = {
  id: number; inquiryId: number; number: string; name: string; customerId: number; department: string;
  owner: string; status: string; date: string; due: string; cost: number;
};
export type ExecutiveTask = {
  id: number; projectId: number | null; inquiryId: number | null; name: string; status: string;
  start: string | null; due: string | null; baselineDue: string | null; forecast: string | null;
  completed: string | null; milestone: boolean; progress: number; manDays: number; owners: number[];
};
export type ExecutiveProcurement = {
  id: number; projectId: number; number: string; kind: "PR" | "PO" | "GRN";
  supplier: string; owner: string; status: string; date: string; due: string | null;
  value: number; openValue: number; held: number; waitingMe: boolean;
};
export type ExecutiveAction = {
  key: string; number: string; name: string; owner: string; kind: string; destination: DashboardLink;
  projectId: number | null; inquiryId: number | null; due: string | null; since: string | null; amount: number | null;
};
export type ExecutiveData = {
  asOf: string; today: string; mode: "executive" | "manager"; scope: string;
  projects: ExecutiveProject[]; inquiries: ExecutiveInquiry[]; estimates: ExecutiveEstimate[];
  tasks: ExecutiveTask[]; procurement: ExecutiveProcurement[]; actions: ExecutiveAction[];
  team: { id: number; name: string; department: string; capacity: number | null }[];
  projectManagers: { id: number; name: string; department: string }[];
  efforts: { kind: "Inquiry" | "Estimate"; id: number; ownerId: number; start: string | null; end: string | null; manDays: number | null }[];
  holidays: string[]; warnings: string[];
};

export const shiftDay = (date: string, amount: number) => new Date(Date.parse(date + "T00:00:00Z") + amount * 86400000).toISOString().slice(0, 10);
export const overdueTask = (task: ExecutiveTask, today: string) => task.status !== "Done" && !!(task.baselineDue ?? task.due) && (task.baselineDue ?? task.due)! < today;
export function projectHealth(project: ExecutiveProject, procurement: ExecutiveProcurement[], today: string): "critical" | "watch" | "unknown" | "healthy" | "closed" {
  if (project.status === "Closed") return "closed";
  if (project.blocked || project.due < today || (project.forecast && project.forecast > project.due)) return "critical";
  if (project.status === "On Hold" || project.overdue || procurement.some(p => p.projectId === project.id && p.status !== "Cancelled" && ((p.kind === "PO" && p.status !== "Draft" && p.openValue > 0 && p.due !== null && p.due < today) || p.held > 0))) return "watch";
  if (project.unknownSchedule || !project.taskCount) return "unknown";
  return "healthy";
}
