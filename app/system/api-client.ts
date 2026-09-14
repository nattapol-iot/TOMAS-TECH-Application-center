"use client";

import { API_BASE_URL } from "./api-origin";
import { acquireApiToken } from "./auth-client";
import { getTeamTestSession, IS_TEAM_TEST_MODE } from "./team-test-client";
import { IS_TMT_ID_MODE } from "./tmt-id.constants";
import { isTrustedWebProtocol } from "./network-origin";

export const IS_API_CONFIGURED = (() => {
  try {
    const url = new URL(API_BASE_URL);
    const trustedProtocol = isTrustedWebProtocol(url, IS_TEAM_TEST_MODE);
    const placeholderHost = url.hostname.endsWith(".invalid")
      || url.hostname === "example.tomastc.com"
      || url.hostname.endsWith(".example.tomastc.com");
    return trustedProtocol
      && !placeholderHost
      && !url.username
      && !url.password
      && url.pathname === "/"
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
})();

export type ApiUser = {
  id: number;
  entraObjectId: string;
  email: string;
  name: string;
  role: string;
  department: string;
  isActive: boolean;
};

export type AccessRole = {
  id: number;
  code: string;
  name: string;
  description: string;
};

export type BootstrapData = {
  user: ApiUser;
  employment?: {
    employeeId: number;
    employeeNo: number;
    nickname: string;
    level: string;
    startWorkDate: string;
  } | null;
  counts: { inquiries: number; estimates: number; activeProjects: number; approvals: number };
  customers: {
    id: number;
    code: string;
    name: string;
    nameTh: string;
    nameEn: string;
    nameJa: string;
    industry: string;
    contact: string;
    contactNameTh: string;
    contactNameEn: string;
    contactNameJa: string;
    contactTitleTh?: string;
    contactTitleEn?: string;
    contactTitleJa?: string;
    department?: string;
    position?: string;
    email: string;
    phone: string;
    site: string;
    inquiries: number;
    openEstimates: number;
    rowVersion: string;
  }[];
  suppliers: { id: number; code: string; name: string; category: string }[];
  team: {
    id: number;
    name: string;
    email: string;
    role: string;
    department: string;
    level: string;
    employeeId: number;
    employeeNo: number;
    nickname: string;
    startWorkDate?: string;
    canSignIn: boolean;
    rowVersion: string;
  }[];
  permissions: string[];
};

export type PerformanceCycle = {
  id: number;
  code: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  reviewDueDate: string;
  status: "OPEN" | "CALIBRATION" | "CLOSED";
  rowVersion: string;
};

export type PerformanceAssessment = {
  overallScore?: number | null;
  activity?: {mode:string;weight:number;eligible:boolean;eligibleDays:number;automatic:number|null;total:number|null;rating:number|null;frozen:boolean};
  id: number;
  employeeId: number;
  userId: number;
  name: string;
  department: string;
  level: string;
  role: string;
  frameworkCode: "ENGINEERING" | "SALES";
  areaCodes: string[];
  status: "NOT_STARTED" | "SELF_REVIEW" | "MANAGER_REVIEW" | "CALIBRATION" | "COMPLETED";
  selfScores: Array<number | null>;
  managerScores: Array<number | null>;
  displayScores: Array<number | null>;
  evidence: string[];
  selfEvidence: string[];
  managerEvidence: string[];
  selfSummary: string;
  managerSummary: string;
  developmentGoal: string;
  updatedAt: string | null;
  rowVersion: string | null;
};

export type PerformanceOverview = {
  cycles: PerformanceCycle[];
  selectedCycle: PerformanceCycle;
  canManage: boolean;
  assessments: PerformanceAssessment[];
};

export type PerformanceInsight = {
  reasonCode: string;
  kind: "STRENGTH" | "ATTENTION" | "NEXT" | "CONTEXT";
  areaCode: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  priority: number;
  facts: Record<string, number | string | boolean | null>;
  source: { type: "PROJECT" | "INQUIRY" | "TASK"; id: number; label: string } | null;
};

export type PerformanceEvidence = {
  frameworkCode: "ENGINEERING" | "SALES";
  employeeId: number;
  employeeName: string;
  cycleId: number;
  cycleCode: string;
  periodStart: string;
  periodEnd: string;
  asOf: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  methodology: string;
  insights: PerformanceInsight[];
  sources: Array<{ key: "PROJECT" | "INQUIRY" | "TASK" | "MEETING" | "ESTIMATE"; label: string; count: number; connected: boolean }>;
  metrics: {
    projectCount: number;
    inquiryCount: number;
    assignedTaskCount: number;
    completedTaskCount: number;
    dueTaskCount: number;
    onTimeTaskCount: number;
    overdueTaskCount: number;
    issueTaskCount: number;
    closedIssueCount: number;
    meetingCount?: number;
    estimateCount?: number;
    approvedEstimateCount?: number;
    handoverCount?: number;
  };
  areas: Array<{
    areaCode: string;
    suggestedScore: number | null;
    evidenceText: string;
    signals: Array<{
      id: string;
      areaCode: string;
      sourceType: "PROJECT" | "INQUIRY" | "TASK";
      sourceId: number;
      sourceLabel: string;
      title: string;
      detail: string;
      occurredAt: string | null;
      tone: "green" | "blue" | "violet" | "amber" | "slate";
    }>;
  }>;
};

export type PagedResult<T> = { items: T[]; page: number; pageSize: number; total: number };

export type SalesMaterialCatalogPayload = {
  sourceUrl: string;
  sourceFile: string;
  groups: Array<{
    id: string;
    title: string;
    materials: Array<{ row: number; title: string; language: string; format: string; filename: string; url: string | null }>;
  }>;
  updatedAt?: string;
  updatedBy?: string;
};

export type SupplierPriceHistoryRecord = {
  id: number;
  sourceKey: string;
  projectNumber: string;
  projectName: string;
  customerName: string;
  lineNumber: number;
  categoryCode: string;
  category: string;
  module: string;
  itemCode: string;
  description: string;
  brand: string;
  supplierId: number | null;
  supplierName: string;
  quantity: number;
  unit: string;
  quoteUnitPrice: number;
  actualUnitCost: number;
  actualLineCost: number;
  leadTimeDays: number;
  quotationNumber: string;
  quotationDate: string | null;
  purchaseOrderNumber: string;
  purchaseOrderStatus: string;
  remark: string;
  sourceWorkbook: string;
  sourceQuotationFile: string | null;
  importBatch: string;
  importedAt: string;
};

export type SupplierQuotationRecord = {
  id: number;
  quotationNumber: string;
  supplierReference: string;
  supplierId: number;
  supplierName: string;
  receivedDate: string;
  validUntil: string;
  inquiryId: number | null;
  inquiryNumber: string | null;
  projectName: string | null;
  currency: "THB" | "JPY" | "USD" | "EUR";
  amount: number;
  status: "Valid" | "Expiring" | "Expired" | "Superseded";
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: string;
  rowVersion: string;
};

export type InquirySummary = {
  id: number;
  number: string;
  inquiryDate: string;
  customerId: number;
  customerName: string;
  endUserCustomerId?: number | null;
  endUserName?: string | null;
  endUserCode?: string | null;
  projectName: string;
  projectType: string;
  salesOwner: string | null;
  estimateOwnerId: number;
  estimateOwnerName: string;
  dueDate: string;
  priority: string;
  projectProbability: number;
  customerInterestGrade: string;
  status: string;
  progress: number;
  revision: number;
  estimateId: number | null;
  updatedAt: string;
  rowVersion: string;
};

export type InquiryMeeting = {
  id: number;
  meetingDate: string;
  meetingType: string;
  participants: string[];
  requirement: string;
  technical: string;
  decision: string;
  openPoint: string;
  actionItem: string;
  ownerId: number | null;
  ownerName: string | null;
  dueDate: string | null;
  attachmentId: number | null;
  attachmentName: string | null;
  createdByName: string;
  createdAt: string;
  rowVersion: string;
};

export type InquiryAttachment = {
  id: number;
  fileName: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: string;
  rowVersion: string;
};

export type InquiryActivity = {
  id: number;
  entityType: string;
  entityNumber: string;
  action: string;
  actorName: string;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string | null;
  occurredAt: string;
};

export type InquiryEstimate = {
  id: number;
  number: string;
  revision: number;
  ownerId: number;
  ownerName: string;
  createdDate: string;
  dueDate: string;
  status: string;
  progress: number;
  materialTotal: number;
  engineeringTotal: number;
  outsourceTotal: number;
  otherTotal: number;
  overheadState: "Missing" | "Applied" | "Zero" | null;
  overheadTotal: number | null;
  total: number;
  rowVersion: string;
};

export type InquiryDetail = InquirySummary & {
  customerCode: string;
  contact: string;
  rfqNo: string | null;
  salesOwner: string | null;
  qualificationNote: string;
  requirement: string;
  background: string;
  scopeSummary: string;
  technical: string;
  targetDelivery: string | null;
  siteLocation: string;
  standard: string;
  special: string;
  remark: string;
  createdAt: string;
  estimate: InquiryEstimate | null;
  meetings: InquiryMeeting[];
  attachments: InquiryAttachment[];
  activity: InquiryActivity[];
};

export type EstimateSummary = {
  id: number;
  number: string;
  inquiryNumber: string;
  customerId: number;
  customerName: string;
  projectName: string;
  projectType: string;
  ownerId: number;
  ownerName: string;
  revision: number;
  createdDate: string;
  dueDate: string;
  status: string;
  progress: number;
  materialTotal: number;
  engineeringTotal: number;
  outsourceTotal: number;
  transportationTotal: number;
  accommodationTotal: number;
  otherTotal: number;
  contingencyTotal: number;
  total: number;
  updatedAt: string;
  rowVersion: string;
};

export type ProjectSummary = {
  id: number;
  number: string;
  name: string;
  customerId?: number;
  customerName: string;
  endUserCustomerId?: number | null;
  endUserName?: string | null;
  endUserCode?: string | null;
  status: string;
  projectType: string;
  managerName: string;
  startDate: string;
  targetDelivery: string;
  progress: number;
  updatedAt: string;
  rowVersion: string;
};

export type ProjectDocument = {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  folderCode: string;
  folderName: string;
  documentType: string;
  remark: string | null;
  uploadedByName: string;
  uploadedAt: string;
  sha256: string | null;
  rowVersion: string;
};

export type ItemBalance = {
  itemId: number;
  itemCode: string;
  partNumber: string;
  description: string;
  brand: string;
  unit: string;
  location: string;
  usable: number;
  quarantine: number;
  reserved: number;
  available: number;
  onOrder: number;
  averageUnitCost: number;
  reorderLevel: number;
};

export type CreateInquiryInput = {
  endUserCustomerId?: number | null;
  customerId: number;
  contact: string;
  projectName: string;
  projectType: string;
  rfqNo?: string;
  salesOwner?: string;
  estimateOwnerId: number;
  dueDate: string;
  priority: string;
  projectProbability: number;
  customerInterestGrade: string;
  qualificationNote?: string;
  requirement?: string;
  background?: string;
  scopeSummary?: string;
  technical?: string;
  targetDelivery?: string;
  siteLocation?: string;
  standard?: string;
  special?: string;
  remark?: string;
};

export type CreateEstimateInput = {
  inquiryId: number;
  ownerId: number;
  dueDate: string;
  contingencyRate: number;
};

export type CreateProjectInput = {
  endUserCustomerId?: number | null;
  estimateId: number;
  purchaseOrderNumber: string;
  purchaseOrderDate: string;
  managerId: number;
  leadEngineerId: number;
  startDate: string;
  targetDelivery: string;
  site: string;
  remark?: string;
};

export type CreateCustomerInput = {
  code: string;
  name: string;
  nameTh?: string;
  nameEn?: string;
  nameJa?: string;
  contact?: string;
  contactNameTh?: string;
  contactNameEn?: string;
  contactNameJa?: string;
  contactTitleTh?: string;
  contactTitleEn?: string;
  contactTitleJa?: string;
  department?: string;
  position?: string;
  email?: string;
  phone?: string;
  industry?: string;
  site?: string;
};

export type CreateSupplierInput = {
  code: string;
  name: string;
  category: string;
  contact?: string;
  email?: string;
  phone?: string;
  brands?: string[];
};

export type CreateInventoryItemInput = {
  itemCode: string;
  partNumber?: string;
  description: string;
  brand?: string;
  unit: string;
  location?: string;
  reorderLevel: number;
  averageUnitCost: number;
  leadTimeDays: number;
  preferredSupplierId?: number;
};

export type CreateEngineeringRateInput = {
  level: string;
  department: string;
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo?: string;
};

export type CreatedMasterRecord = {
  id: number;
  code: string;
  name: string;
  rowVersion: string;
};

export type EmployeeRecord = {
  id: number;
  employeeNo: number;
  nameEn: string;
  nameTh: string;
  department: string;
  jobTitle: string;
  mobile: string;
  email: string;
  nickname: string;
  birthDate: string | null;
  uniformSize: string;
  shoeSize: string;
  startWorkDate: string;
  endWorkDate: string | null;
  position: string;
  isActive: boolean;
  userId: number | null;
  applicationRole: string | null;
  accountActive: boolean | null;
  dailyRate: number | null;
  updatedAt: string;
  rowVersion: string;
};

export type EmployeeInput = {
  employeeNo: number;
  nameEn: string;
  nameTh?: string;
  department: string;
  jobTitle: string;
  mobile?: string;
  email: string;
  nickname?: string;
  birthDate?: string;
  uniformSize?: string;
  shoeSize?: string;
  startWorkDate: string;
  endWorkDate?: string;
  position: string;
  isActive: boolean;
};

export type EstimateCostItem = {
  id: number;
  categoryCode: string;
  category: string;
  subcategory: string;
  module: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string | null;
  supplierId: number | null;
  supplierName: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
  priceSource: string;
  referenceNumber: string | null;
  referenceProject: string | null;
  priceDate: string | null;
  remark: string | null;
  ownerId: number;
  ownerName: string;
  status: string;
  updatedAt: string;
  canEdit: boolean;
  rowVersion: string;
};

export type EstimateManhourLine = {
  id: number;
  package: string;
  activity: string;
  department: string;
  level: string;
  costType: "Engineering" | "Installation";
  provider: "Internal" | "Supplier";
  supplierId: number | null;
  supplierName: string | null;
  quotationNumber: string | null;
  priceDate: string | null;
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  dailyRate: number;
  manHours: number;
  lineCost: number;
  ownerId: number;
  ownerName: string;
  remark: string | null;
  updatedAt: string;
  canEdit: boolean;
  rowVersion: string;
};

export type EstimateExpenseLine = {
  id: number;
  package: string;
  expenseType: string;
  description: string;
  costType: "Engineering" | "Installation";
  supplierId: number | null;
  supplierName: string | null;
  referenceNumber: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
  ownerId: number;
  ownerName: string;
  remark: string | null;
  updatedAt: string;
  canEdit: boolean;
  rowVersion: string;
};

export type EstimateOtherCostLine = {
  id: number;
  category: "Outsource" | "Transportation" | "Accommodation" | "Other Cost";
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
  remark: string | null;
  canEdit: boolean;
  rowVersion: string;
};

export type EstimateAssignment = {
  id: number;
  section: string;
  ownerId: number;
  ownerName: string;
  supportId: number | null;
  supportName: string | null;
  dueDate: string;
  status: string;
  progress: number;
  comment: string | null;
  rowVersion: string;
  canEdit: boolean;
};

export type EstimateRevision = {
  id: number;
  revision: number;
  code: string;
  reason: string;
  description: string;
  createdById: number;
  createdByName: string;
  createdAt: string;
  reviewedById: number | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  status: string;
  total: number;
};

export type EstimateValidationIssue = {
  code: string;
  message: string;
  entityType: string;
  entityId: number;
  severity: "Error" | "Warning" | string;
};

export type EstimateWorkspaceCapabilities = {
  canEdit: boolean;
  canEditAllSections: boolean;
  editableSections: string[];
  canSubmit: boolean;
  canApprove: boolean;
  canRequestRevision: boolean;
  canCreateRevision: boolean;
  canManageAssignments: boolean;
  canUpdateContingency: boolean;
  canEditCostItems: boolean;
  canEditManhour: boolean;
  canEditExpenses: boolean;
  canEditOtherCosts: boolean;
};

export type EstimateCostWorkspace = {
  header: {
    overhead?: EstimateOverhead;
    id: number;
    number: string;
    inquiryId: number;
    inquiryNumber: string;
    customerId: number;
    customerCode: string;
    customerName: string;
    projectName: string;
    projectType: string;
    ownerId: number;
    ownerName: string;
    revision: number;
    createdDate: string;
    dueDate: string;
    status: string;
    progress: number;
    contingencyRate: number;
    lockedAt: string | null;
    lockedBy: number | null;
    lockedByName: string | null;
    createdAt: string;
    updatedAt: string;
    rowVersion: string;
    totals: {
      overhead?: number | null;
      material: number;
      engineering: number;
      outsource: number;
      transportation: number;
      accommodation: number;
      other: number;
      subtotal: number;
      contingency: number;
      total: number;
    };
  };
  capabilities: EstimateWorkspaceCapabilities;
  costItems: EstimateCostItem[];
  manhourLines: EstimateManhourLine[];
  expenseLines: EstimateExpenseLine[];
  otherCostLines: EstimateOtherCostLine[];
  assignments: EstimateAssignment[];
  revisionHistory: EstimateRevision[];
  validationIssues: EstimateValidationIssue[];
};

export type EstimateErpCategory = "Hardware" | "Software" | "Service" | "Installation" | "License" | "Maintenance" | "Training";
export type EstimateErpSourceType = "CostItem" | "ManhourLine" | "ExpenseLine" | "OtherCostLine" | "Contingency";

export type EstimateErpSummary = {
  estimateId: number;
  revision: number;
  estimateRowVersion: string;
  categories: Array<{ category: EstimateErpCategory; amount: number; lineCount: number }>;
  unmapped: { amount: number; lineCount: number };
  overhead: { state: "Missing" | "Applied" | "Zero"; amount: number };
  classifiedTotal: number;
  canonicalTotal: number;
  difference: number;
  reconciled: boolean;
  capabilities: { canEditMappings: boolean; canExport: boolean };
  lines: Array<{
    sourceType: EstimateErpSourceType;
    sourceId: number | null;
    description: string;
    internalCategory: string;
    amount: number;
    erpCategory: EstimateErpCategory | "Unmapped";
    mappingRowVersion: string | null;
    copiedFromRevision: number | null;
    item?: string | number | null;
    modelPartNumber?: string | null;
    supplier?: string | null;
    brand?: string | null;
    leadTime?: string | null;
    quoteRevision?: string | null;
    unitPrice?: number | null;
    quantity?: number | null;
    unit?: string | null;
    remark?: string | null;
  }>;
};

export type EstimateErpMappingInput = {
  sourceType: EstimateErpSourceType;
  sourceId: number | null;
  erpCategory: EstimateErpCategory | "Unmapped";
  mappingRowVersion: string | null;
};

export type EstimateOverhead = {
  state: "Missing" | "Applied" | "Zero";
  policyId: number | null;
  policyVersion: number | null;
  hourlyRate: number | null;
  eligibleDirectHours: number | null;
  amount: number | null;
};

export type CostItemInput = {
  estimateRowVersion: string;
  lineRowVersion?: string;
  categoryCode: string;
  category: string;
  subcategory?: string;
  module: string;
  itemCode: string;
  description: string;
  brand?: string;
  model?: string;
  specification?: string;
  supplierId?: number;
  quantity: number;
  unit: string;
  unitCost: number;
  priceSource: string;
  referenceNumber?: string;
  referenceProject?: string;
  priceDate?: string;
  remark?: string;
  ownerId: number;
};

export type EstimateManhourInput = {
  estimateRowVersion: string;
  lineRowVersion?: string;
  package: string;
  activity: string;
  department: string;
  level: string;
  costType: "Engineering" | "Installation";
  provider: "Internal" | "Supplier";
  supplierId?: number;
  quotationNumber?: string;
  priceDate?: string;
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  dailyRate: number;
  ownerId: number;
  remark?: string;
};

export type EstimateExpenseInput = {
  estimateRowVersion: string;
  lineRowVersion?: string;
  package: string;
  expenseType: string;
  description: string;
  costType: "Engineering" | "Installation";
  supplierId?: number;
  referenceNumber?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  ownerId: number;
  remark?: string;
};

export type EstimateOtherCostInput = {
  estimateRowVersion: string;
  lineRowVersion?: string;
  category: "Outsource" | "Transportation" | "Accommodation" | "Other Cost";
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  remark?: string;
};

export type EstimateAssignmentInput = {
  estimateRowVersion: string;
  lineRowVersion: string;
  ownerId: number;
  supportId?: number;
  dueDate: string;
  status: string;
  progress: number;
  comment?: string;
};

export type EstimateAssignmentCreateInput = {
  estimateRowVersion: string;
  section: string;
  ownerId: number;
  supportId?: number;
  dueDate: string;
  comment?: string;
};

export type AssignmentNotificationResult = {
  status: "sent" | "disabled" | "failed" | "not_required";
  recipients: string[];
};

export type EstimateAssignmentMutationResult = {
  id: number;
  rowVersion: string;
  estimateRowVersion: string;
  notification: AssignmentNotificationResult;
};

export class ApiClientError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

async function authorizedFetch(path: string, init?: RequestInit, timeoutMs = 30_000) {
  if (!IS_API_CONFIGURED) throw new Error("NEXT_PUBLIC_API_BASE_URL is missing or invalid.");
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (IS_TEAM_TEST_MODE) {
    const session = getTeamTestSession();
    if (!session) throw new Error("Team test session is missing. Please sign in again.");
    headers.set("X-Team-Test-Email", session.email);
    headers.set("X-Team-Test-Code", session.accessCode);
  } else if (!IS_TMT_ID_MODE) {
    const token = await acquireApiToken();
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof init?.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetch(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    signal,
    // TMT ID keeps the session in a cookie the API origin owns; a split-origin
    // deployment only sends it when the request opts into credentials.
    credentials: IS_TMT_ID_MODE ? "include" : "same-origin",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ code: "http_error", message: response.statusText })) as { code?: string; message?: string };
    const code = response.status === 401 ? "session_expired" : error.code ?? "http_error";
    const message = response.status === 401 ? "Your session is no longer valid. Please sign in again." : error.message ?? "The request failed.";
    throw new ApiClientError(response.status, code, message);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const response = await authorizedFetch(path, init, timeoutMs);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type ReportEvidenceAttachment = {
  attachmentId: number;
  attachmentName: string;
  attachmentContentType: "image/jpeg" | "image/png";
  attachmentSizeBytes: number;
  attachmentSha256: string;
};

/** Downscale camera/library photos before upload so iPad users do not wait on full-resolution images. */
export async function prepareReportEvidenceImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif|jpe?g|png)$/i.test(file.name)) throw new Error("Choose an image from the camera or photo library.");
  if (file.size > 30 * 1024 * 1024) throw new Error("The selected image is too large. Choose an image under 30 MB.");
  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("This image format cannot be opened. Choose a JPEG or PNG image.")); image.src = source; });
    const maximum = 2400,scale = Math.min(1,maximum/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas = document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext("2d");if(!context)throw new Error("This browser cannot prepare the image.");context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("The image could not be prepared.")),"image/jpeg",0.86));
    const stem=(file.name||"evidence").replace(/\.[^.]+$/,"").replace(/[^\p{L}\p{N}._ -]+/gu,"-").slice(0,120)||"evidence";
    return new File([blob],`${stem}.jpg`,{type:"image/jpeg",lastModified:Date.now()});
  } finally { URL.revokeObjectURL(source); }
}

export async function uploadReportEvidence(reportId: number, file: File): Promise<ReportEvidenceAttachment> {
  const body=new FormData();body.set("file",await prepareReportEvidenceImage(file));
  return (await authorizedFetch(`/api/v1/reports/workspace/${reportId}/evidence`,{method:"POST",body},120_000)).json() as Promise<ReportEvidenceAttachment>;
}

export async function downloadReportEvidence(reportId: number, attachmentId: number): Promise<Blob> {
  return (await authorizedFetch(`/api/v1/reports/workspace/${reportId}/evidence/${attachmentId}/content`,{headers:{Accept:"image/*"}},120_000)).blob();
}

export type ReportExportRecord = {
  id: number; revision: number; format: "pdf" | "pptx"; fileName: string;
  contentType: string; sizeBytes: number; sha256: string; createdAt: string;
};

/** Archive a generated PDF/PPTX export to NAS-backed document storage so every export is retained. */
export async function uploadReportExport(reportId: number, format: "pdf" | "pptx", bytes: Uint8Array, fileName: string): Promise<ReportExportRecord> {
  const contentType = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const body = new FormData();
  body.set("file", new File([bytes as BlobPart], fileName, { type: contentType }));
  return (await authorizedFetch(`/api/v1/reports/workspace/${reportId}/exports`, { method: "POST", body }, 120_000)).json() as Promise<ReportExportRecord>;
}

export async function listReportExports(reportId: number): Promise<{ items: ReportExportRecord[] }> {
  return apiRequest(`/api/v1/reports/workspace/${reportId}/exports`);
}

export async function downloadReportExport(reportId: number, exportId: number): Promise<Blob> {
  return (await authorizedFetch(`/api/v1/reports/workspace/${reportId}/exports/${exportId}/content`, {}, 120_000)).blob();
}

export const loadBootstrap = () => apiRequest<BootstrapData>("/api/v1/bootstrap");

export async function downloadSupportAttachment(ticketId: number, attachmentId: number) {
  return (await authorizedFetch(`/api/v1/support/tickets/${ticketId}/attachments/${attachmentId}/content`, { headers: { Accept: "application/octet-stream" } }, 120_000)).blob();
}

export async function uploadSupportAttachment(ticketId: number, file: File, requestKey: string, internal = false) {
  const body = new FormData();
  body.append("file", file); body.append("requestKey", requestKey); body.append("internal", String(internal));
  return (await authorizedFetch(`/api/v1/support/tickets/${ticketId}/attachments`, { method: "POST", body }, 120_000)).json() as Promise<{ id: number }>;
}

export async function downloadHistoricalPrSource(id: number): Promise<Blob> {
  const response = await authorizedFetch(`/api/v1/historical-pr/${id}/source`, { headers: { Accept: "application/octet-stream" } });
  return response.blob();
}

export const loadPerformanceOverview = (cycleId?: number) =>
  apiRequest<PerformanceOverview>(`/api/v1/performance/overview${cycleId ? `?cycleId=${cycleId}` : ""}`);

export const loadPerformanceEvidence = (employeeId: number, cycleId: number) =>
  apiRequest<PerformanceEvidence>(`/api/v1/performance/evidence/${employeeId}?cycleId=${cycleId}`);

export const updatePerformanceAssessment = (employeeId: number, input: {
  cycleId: number;
  scores: Array<{ areaCode: string; score: number; evidence?: string }>;
  summary: string;
  developmentGoal: string;
  submit: boolean;
  rowVersion?: string | null;
}) => apiRequest<{ id: number; status: string; rowVersion: string }>(`/api/v1/performance/assessments/${employeeId}`, {
  method: "PUT",
  body: JSON.stringify(input),
});

export const completePerformanceAssessment = (employeeId: number, input: {
  cycleId: number;
  calibrationNote: string;
  rowVersion: string;
}) => apiRequest<{ id: number; status: "COMPLETED"; rowVersion: string }>(`/api/v1/performance/assessments/${employeeId}/complete`, {
  method: "POST",
  body: JSON.stringify(input),
});

const queryString = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : "";
};

export const listInquiries = (values: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  customerId?: number;
  projectType?: string;
  ownerId?: number;
  priority?: string;
  interestGrade?: string;
  probabilityFrom?: number;
  probabilityTo?: number;
  inquiryFrom?: string;
  inquiryTo?: string;
  dueFrom?: string;
  dueTo?: string;
}) =>
  apiRequest<PagedResult<InquirySummary>>(`/api/v1/inquiries/${queryString(values)}`);

export const createInquiry = (input: CreateInquiryInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>("/api/v1/inquiries/", { method: "POST", body: JSON.stringify(input) });

export const loadInquiry = (id: number) => apiRequest<InquiryDetail>(`/api/v1/inquiries/${id}`);

export const assignInquiryOwner = (id: number, estimateOwnerId: number, rowVersion: string) =>
  apiRequest<{ id: number; estimateOwnerId: number; estimateOwnerName: string; rowVersion: string }>(`/api/v1/inquiries/${id}/assignment`, {
    method: "PUT",
    body: JSON.stringify({ estimateOwnerId, rowVersion }),
  });

export type UpdateInquiryQualificationInput = {
  projectProbability: number;
  customerInterestGrade: string;
  qualificationNote?: string;
  rowVersion: string;
};

export const updateInquiryQualification = (id: number, input: UpdateInquiryQualificationInput) =>
  apiRequest<{ id: number; projectProbability: number; customerInterestGrade: string; qualificationNote: string | null; rowVersion: string }>(`/api/v1/inquiries/${id}/qualification`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

export type CreateInquiryMeetingInput = {
  meetingDate: string;
  meetingType: string;
  participants: string[];
  requirement?: string;
  technical?: string;
  decision?: string;
  openPoint?: string;
  actionItem?: string;
  ownerId?: number;
  dueDate?: string;
  attachmentId?: number;
};

export const createInquiryMeeting = (id: number, input: CreateInquiryMeetingInput) =>
  apiRequest<{ id: number; rowVersion: string }>(`/api/v1/inquiries/${id}/meetings`, { method: "POST", body: JSON.stringify(input) });

export async function uploadInquiryAttachment(id: number, input: { file: File; category: string }) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("category", input.category);
  const response = await authorizedFetch(`/api/v1/inquiries/${id}/attachments`, { method: "POST", body }, 120_000);
  return response.json() as Promise<InquiryAttachment>;
}

export async function downloadInquiryAttachment(id: number, attachmentId: number) {
  const response = await authorizedFetch(`/api/v1/inquiries/${id}/attachments/${attachmentId}/content`, { headers: { Accept: "application/octet-stream" } }, 120_000);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  let fileName = quotedName;
  if (encodedName) {
    try { fileName = decodeURIComponent(encodedName); } catch { fileName = encodedName; }
  }
  return { blob: await response.blob(), fileName };
}

export const listEstimates = (values: {
  mine?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  customerId?: number;
  projectType?: string;
  ownerId?: number;
  department?: string;
  confidentiality?: string;
  language?: string;
  revision?: number;
}) =>
  apiRequest<PagedResult<EstimateSummary>>(`/api/v1/estimates/${queryString(values)}`);

export type CostItemLookupField = "itemCode" | "description" | "brand" | "supplier";
export type CostItemLookupRecord = {
  key: string;
  sourceKind: "Estimate" | "Historical Purchase";
  sourceNumber: string;
  projectName: string;
  categoryCode: string;
  category: string;
  subcategory: string;
  module: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string | null;
  supplierId: number | null;
  supplierName: string | null;
  unit: string;
  unitCost: number;
  priceSource: string;
  referenceNumber: string | null;
  referenceProject: string | null;
  priceDate: string | null;
  uses: number;
};
/** Type-ahead over every current-revision cost line and the imported purchase history; one row per distinct part. */
export const lookupCostItems = (values: { q: string; field?: CostItemLookupField; limit?: number }, signal?: AbortSignal) =>
  apiRequest<{ items: CostItemLookupRecord[] }>(`/api/v1/estimates/cost-item-lookup${queryString(values)}`, signal ? { signal } : undefined);

export const listSupplierPriceHistory = (values: { page?: number; pageSize?: number; search?: string; supplierId?: number } = {}) =>
  apiRequest<PagedResult<SupplierPriceHistoryRecord>>(`/api/v1/pricing/history${queryString(values)}`);

export const listSupplierQuotations = (values: { page?: number; pageSize?: number; search?: string; supplierId?: number; status?: string } = {}) =>
  apiRequest<PagedResult<SupplierQuotationRecord>>(`/api/v1/supplier-quotations/${queryString(values)}`);

export async function createSupplierQuotation(input: {
  file: File;
  supplierId: number;
  supplierReference?: string;
  receivedDate: string;
  validUntil: string;
  inquiryId?: number;
  currency: SupplierQuotationRecord["currency"];
  amount: number;
}) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("supplierId", String(input.supplierId));
  body.set("supplierReference", input.supplierReference ?? "");
  body.set("receivedDate", input.receivedDate);
  body.set("validUntil", input.validUntil);
  if (input.inquiryId) body.set("inquiryId", String(input.inquiryId));
  body.set("currency", input.currency);
  body.set("amount", String(input.amount));
  const response = await authorizedFetch("/api/v1/supplier-quotations/", { method: "POST", body }, 120_000);
  return response.json() as Promise<{ id: number; quotationNumber: string; rowVersion: string }>;
}

export async function downloadSupplierQuotation(id: number) {
  const response = await authorizedFetch(`/api/v1/supplier-quotations/${id}/content`, { headers: { Accept: "application/octet-stream" } }, 120_000);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  let fileName = quotedName;
  if (encodedName) { try { fileName = decodeURIComponent(encodedName); } catch { fileName = encodedName; } }
  return { blob: await response.blob(), fileName };
}

export type QuotationLineItem = {
  id?: number; lineNo: number; itemCode: string; description: string;
  brand: string; model: string; qty: number; unit: string;
  unitPrice: number; lineTotal?: number; currency: string; remark: string;
};

export type QuotationLineForPriceLibrary = QuotationLineItem & {
  quotationId: number; quotationNumber: string; supplierReference: string;
  receivedDate: string; validUntil: string;
  supplierId: number; supplierName: string;
};

export const saveQuotationLines = (quotationId: number, lines: QuotationLineItem[]) =>
  apiRequest<void>(`/api/v1/supplier-quotations/${quotationId}/lines`, { method: "PUT", body: JSON.stringify({ lines }) });

export const listQuotationLines = (quotationId: number) =>
  apiRequest<QuotationLineItem[]>(`/api/v1/supplier-quotations/${quotationId}/lines`);

export const listAllQuotationLinesForPriceLibrary = () =>
  apiRequest<QuotationLineForPriceLibrary[]>("/api/v1/supplier-quotation-lines");

export const updateSupplierQuotation = (
  id: number,
  patch: {
    supplierId?: number;
    supplierReference?: string;
    receivedDate?: string;
    validUntil?: string;
    currency?: SupplierQuotationRecord["currency"];
    amount?: number;
    inquiryId?: number | null;
    rowVersion: string;
  },
) => apiRequest<{ rowVersion: string }>(`/api/v1/supplier-quotations/${id}`, {
  method: "PATCH",
  body: JSON.stringify(patch),
})

export const deleteSupplierQuotation = (id: number) =>
  apiRequest<void>(`/api/v1/supplier-quotations/${id}`, { method: "DELETE" })

export const updateSupplier = (
  id: number,
  input: { name: string; category: string; contact?: string; email?: string; phone?: string; brands?: string[] },
) => apiRequest<{ id: number }>(`/api/v1/master/suppliers/${id}`, {
  method: "PUT",
  body: JSON.stringify(input),
})

export const deleteSupplier = (id: number) =>
  apiRequest<void>(`/api/v1/master/suppliers/${id}`, { method: "DELETE" })

export const findOrCreateSupplier = (input: { name: string; taxId: string; category?: string }) =>
  apiRequest<{ id: number; name: string; created: boolean }>("/api/v1/master/suppliers/find-or-create", {
    method: "POST", body: JSON.stringify(input),
  });

// PDF quotation parsing — proxied through the Node backend to the Python pdf-parser service
export type ParsedQuotationResult = {
  supplierName: string; supplierTaxId: string; quotationNumber: string;
  receivedDate: string; validUntil: string;
  currency: "THB" | "JPY" | "USD" | "EUR";
  totalAmount: number;
  lines: QuotationLineItem[];
  rawText: string; requiresOcr: boolean;
  confidence: Record<string, "high" | "low" | "none">;
};

export async function parsePdfViaBackend(file: File): Promise<ParsedQuotationResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  // authorizedFetch injects auth headers and throws ApiClientError on non-2xx.
  // FormData body lets the browser set the correct multipart/form-data boundary automatically.
  const response = await authorizedFetch(
    "/api/v1/supplier-quotations/parse-pdf",
    { method: "POST", body: form },
    120_000, // OCR on large scanned PDFs can take up to 2 minutes
  );
  return response.json() as Promise<ParsedQuotationResult>;
}

export const createEstimate = (input: CreateEstimateInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>("/api/v1/estimates/", { method: "POST", body: JSON.stringify(input) });

export const estimateWorkflow = (id: number, action: "submit" | "approve" | "request-revision" | "create-revision", rowVersion: string, comment = "") =>
  apiRequest<{ id: number; status: string; rowVersion: string }>(`/api/v1/estimates/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ comment, rowVersion }),
  });

export const loadEstimateCostWorkspace = (id: number) =>
  apiRequest<EstimateCostWorkspace>(`/api/v1/estimates/${id}/cost-workspace`);

export const loadEstimateErpSummary = (id: number) =>
  apiRequest<EstimateErpSummary>(`/api/v1/estimates/${id}/erp-summary`);

export const updateEstimateErpMappings = (id: number, estimateRowVersion: string, mappings: EstimateErpMappingInput[]) =>
  apiRequest<{ estimateRowVersion: string; erpSummary: EstimateErpSummary }>(`/api/v1/estimates/${id}/erp-mappings`, {
    method: "PUT",
    body: JSON.stringify({ estimateRowVersion, mappings }),
  });

export const recordEstimateErpExport = (id: number, input: { estimateRowVersion: string; templateVersion: string; sha256: string; filename: string; fileBase64: string }) =>
  apiRequest<{ recorded: true }>(`/api/v1/estimates/${id}/erp-export-events`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const createCostItem = (estimateId: number, input: CostItemInput) =>
  apiRequest<{ id: number; rowVersion: string; estimateRowVersion: string }>(`/api/v1/estimates/${estimateId}/cost-items`, { method: "POST", body: JSON.stringify(input) });

export const updateCostItem = (estimateId: number, lineId: number, input: CostItemInput) =>
  apiRequest<{ id: number; rowVersion: string; estimateRowVersion: string }>(`/api/v1/estimates/${estimateId}/cost-items/${lineId}`, { method: "PUT", body: JSON.stringify(input) });

export const removeCostItem = (estimateId: number, lineId: number, estimateRowVersion: string, lineRowVersion: string, reason = "") =>
  apiRequest<{ id: number; estimateRowVersion: string }>(`/api/v1/estimates/${estimateId}/cost-items/${lineId}/remove`, {
    method: "POST",
    body: JSON.stringify({ estimateRowVersion, lineRowVersion, reason }),
  });

type EstimateLineMutationResult = { id: number; rowVersion: string; estimateRowVersion: string };
type EstimateLineRemoveResult = { id: number; estimateRowVersion: string };

export const createEstimateManhour = (estimateId: number, input: EstimateManhourInput) =>
  apiRequest<EstimateLineMutationResult>(`/api/v1/estimates/${estimateId}/manhour-lines`, { method: "POST", body: JSON.stringify(input) });

export const updateEstimateManhour = (estimateId: number, lineId: number, input: EstimateManhourInput) =>
  apiRequest<EstimateLineMutationResult>(`/api/v1/estimates/${estimateId}/manhour-lines/${lineId}`, { method: "PUT", body: JSON.stringify(input) });

export const removeEstimateManhour = (estimateId: number, lineId: number, estimateRowVersion: string, lineRowVersion: string, reason = "") =>
  apiRequest<EstimateLineRemoveResult>(`/api/v1/estimates/${estimateId}/manhour-lines/${lineId}/remove`, { method: "POST", body: JSON.stringify({ estimateRowVersion, lineRowVersion, reason }) });

export const createEstimateExpense = (estimateId: number, input: EstimateExpenseInput) =>
  apiRequest<EstimateLineMutationResult>(`/api/v1/estimates/${estimateId}/expense-lines`, { method: "POST", body: JSON.stringify(input) });

export const updateEstimateExpense = (estimateId: number, lineId: number, input: EstimateExpenseInput) =>
  apiRequest<EstimateLineMutationResult>(`/api/v1/estimates/${estimateId}/expense-lines/${lineId}`, { method: "PUT", body: JSON.stringify(input) });

export const removeEstimateExpense = (estimateId: number, lineId: number, estimateRowVersion: string, lineRowVersion: string, reason = "") =>
  apiRequest<EstimateLineRemoveResult>(`/api/v1/estimates/${estimateId}/expense-lines/${lineId}/remove`, { method: "POST", body: JSON.stringify({ estimateRowVersion, lineRowVersion, reason }) });

export const createEstimateOtherCost = (estimateId: number, input: EstimateOtherCostInput) =>
  apiRequest<EstimateLineMutationResult>(`/api/v1/estimates/${estimateId}/other-cost-lines`, { method: "POST", body: JSON.stringify(input) });

export const updateEstimateOtherCost = (estimateId: number, lineId: number, input: EstimateOtherCostInput) =>
  apiRequest<EstimateLineMutationResult>(`/api/v1/estimates/${estimateId}/other-cost-lines/${lineId}`, { method: "PUT", body: JSON.stringify(input) });

export const removeEstimateOtherCost = (estimateId: number, lineId: number, estimateRowVersion: string, lineRowVersion: string, reason = "") =>
  apiRequest<EstimateLineRemoveResult>(`/api/v1/estimates/${estimateId}/other-cost-lines/${lineId}/remove`, { method: "POST", body: JSON.stringify({ estimateRowVersion, lineRowVersion, reason }) });

export const updateEstimateAssignment = (estimateId: number, assignmentId: number, input: EstimateAssignmentInput) =>
  apiRequest<EstimateAssignmentMutationResult>(`/api/v1/estimates/${estimateId}/assignments/${assignmentId}`, { method: "PUT", body: JSON.stringify(input) });

export const createEstimateAssignment = (estimateId: number, input: EstimateAssignmentCreateInput) =>
  apiRequest<EstimateAssignmentMutationResult>(`/api/v1/estimates/${estimateId}/assignments`, { method: "POST", body: JSON.stringify(input) });

export type EstimateCopyInput = {
  estimateRowVersion: string;
  sourceEstimateId: number;
  ownerId: number;
  sections?: string[];
  includeCostItems?: boolean;
  includeManhour?: boolean;
  includeExpenses?: boolean;
  includeOtherCosts?: boolean;
  includeErpCategories?: boolean;
};

export type EstimateCopyResult = {
  sourceEstimateId: number;
  sourceNumber: string;
  sourceRevision: number;
  sourceProjectName: string;
  sections: string[];
  costItems: number;
  manhourLines: number;
  expenseLines: number;
  otherCostLines: number;
  erpCategories: number;
  renamedItemCodes: Array<{ original: string; applied: string }>;
  droppedSuppliers: Array<{ line: string; supplierId: number }>;
  estimateRowVersion: string;
};

/** One transactional copy of another estimate's ledgers into this revision. */
export const copyEstimateContent = (estimateId: number, input: EstimateCopyInput) =>
  apiRequest<EstimateCopyResult>(`/api/v1/estimates/${estimateId}/copy-from`, { method: "POST", body: JSON.stringify(input) });

export type MyEstimateAssignment = {
  assignmentId: number;
  estimateId: number;
  estimateNumber: string;
  inquiryNumber: string;
  projectName: string;
  customerName: string;
  revision: number;
  estimateStatus: string;
  estimateDueDate: string | null;
  estimateOwnerId: number;
  estimateOwnerName: string;
  section: string;
  sectionCode: string;
  role: string;
  ownerId: number;
  ownerName: string;
  supportId: number | null;
  supportName: string | null;
  dueDate: string | null;
  status: string;
  progress: number;
  comment: string | null;
  costLineCount: number;
  updatedAt: string;
};

/** Estimate sections assigned to the signed-in engineer, started or not. */
export const listMyEstimateAssignments = (values: { includeClosed?: boolean } = {}) =>
  apiRequest<MyEstimateAssignment[]>(`/api/v1/me/estimate-assignments${queryString(values)}`);

export const updateEstimateContingency = (estimateId: number, contingencyRate: number, rowVersion: string) =>
  apiRequest<{ id: number; contingencyRate: number; rowVersion: string }>(`/api/v1/estimates/${estimateId}/contingency`, {
    method: "PUT",
    body: JSON.stringify({ contingencyRate, rowVersion }),
  });

export const listProjects = (values: { page?: number; pageSize?: number; search?: string; status?: string }) =>
  apiRequest<PagedResult<ProjectSummary>>(`/api/v1/projects/${queryString(values)}`);

export const createProject = (input: CreateProjectInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>("/api/v1/projects/", { method: "POST", body: JSON.stringify(input) });

export const listProjectDocuments = (projectId: number) =>
  apiRequest<ProjectDocument[]>(`/api/v1/projects/${projectId}/documents`);

export type DrawingTask = { id: number; name: string; leaderId: number | null; managerId: number | null; leaderName: string | null; managerName: string | null };
export const listDrawingTasks = (projectId: number) => apiRequest<DrawingTask[]>(`/api/v1/projects/${projectId}/drawing-tasks`);

export async function uploadProjectDocument(projectId: number, input: { file: File; folderCode: string; documentType: string; remark?: string; taskId?: number }) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("folderCode", input.folderCode);
  if (input.taskId) body.set("taskId", String(input.taskId));
  body.set("documentType", input.documentType);
  body.set("remark", input.remark ?? "");
  const response = await authorizedFetch(`/api/v1/projects/${projectId}/documents`, { method: "POST", body }, 120_000);
  return response.json() as Promise<ProjectDocument>;
}

export async function downloadProjectDocument(projectId: number, documentId: number) {
  const response = await authorizedFetch(`/api/v1/projects/${projectId}/documents/${documentId}/content`, { headers: { Accept: "application/octet-stream" } }, 120_000);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  let fileName = quotedName;
  if (encodedName) {
    try { fileName = decodeURIComponent(encodedName); } catch { fileName = encodedName; }
  }
  return { blob: await response.blob(), fileName };
}

export const createCustomer = (input: CreateCustomerInput) =>
  apiRequest<CreatedMasterRecord>("/api/v1/master/customers", { method: "POST", body: JSON.stringify(input) });

export const createSupplier = (input: CreateSupplierInput) =>
  apiRequest<CreatedMasterRecord>("/api/v1/master/suppliers", { method: "POST", body: JSON.stringify(input) });

export const createInventoryItem = (input: CreateInventoryItemInput) =>
  apiRequest<CreatedMasterRecord>("/api/v1/master/inventory-items", { method: "POST", body: JSON.stringify(input) });

export const createEngineeringRate = (input: CreateEngineeringRateInput) =>
  apiRequest<{ id: number; level: string; department: string; rowVersion: string }>("/api/v1/master/engineering-rates", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const listEmployees = (values: { search?: string; activeOnly?: boolean } = {}) =>
  apiRequest<EmployeeRecord[]>(`/api/v1/master/employees${queryString(values)}`);

export const createEmployee = (input: EmployeeInput) =>
  apiRequest<{ id: number; employeeNo: number; nameEn: string; rowVersion: string }>("/api/v1/master/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateEmployee = (id: number, input: EmployeeInput & { rowVersion: string }) =>
  apiRequest<{ id: number; employeeNo: number; nameEn: string; rowVersion: string }>(`/api/v1/master/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const listAccessRoles = () =>
  apiRequest<{ items: AccessRole[] }>("/api/v1/admin/roles");

export const updateUserRole = (id: number, input: { roleCode: string; rowVersion: string }) =>
  apiRequest<{ id: number; role: string; rowVersion: string }>(`/api/v1/admin/users/${id}/role`, {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const listInventory = (values: { search?: string; reorderOnly?: boolean }) =>
  apiRequest<ItemBalance[]>(`/api/v1/inventory/items${queryString(values)}`);

// ---------------------------------------------------------------------------
// Knowledge & Document Hub
// ---------------------------------------------------------------------------

export type KnowledgeCategory = {
  id: number;
  parentId: number | null;
  code: string;
  nameEn: string;
  nameTh: string;
  nameJa: string;
  defaultDocumentType: string | null;
  defaultConfidentiality: string;
  sortOrder: number;
  isActive: boolean;
  documentCount: number;
};

export type KnowledgeDocumentRow = {
  id: number;
  documentNumber: string;
  title: string;
  documentType: string;
  categoryId: number;
  categoryName: string;
  department: string;
  ownerId: number;
  ownerName: string;
  confidentiality: string;
  /** Display status: adds Review Due, Expired and Archived over the workflow status. */
  status: string;
  workflowStatus: string;
  language: string;
  tags: string;
  nextReviewDate: string | null;
  updatedAt: string;
  archivedAt: string | null;
  currentRevision: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  currentVersionId: number | null;
  acknowledgementTotal: number;
  acknowledgementDone: number;
};

export type KnowledgeDocumentVersion = {
  id: number;
  revision: string;
  versionNumber: number;
  status: string;
  changeType: string;
  changeSummary: string;
  effectiveDate: string | null;
  expiryDate: string | null;
  createdAt: string;
  createdByName: string;
  approvedAt: string | null;
  approvedByName: string | null;
  publishedAt: string | null;
  publishedByName: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  supersededByVersionId: number | null;
};

export type KnowledgeApprovalStep = {
  id: number;
  versionId: number;
  sequence: number;
  stepType: string;
  approverId: number;
  approverName: string;
  status: string;
  comment: string;
  actedAt: string | null;
};

export type KnowledgeRelation = {
  id: number;
  entityType: string;
  entityId: number;
  relationType: string;
  createdAt: string;
  createdByName: string;
};

export type KnowledgeDocumentDetail = {
  document: KnowledgeDocumentRow & { description: string; rowVersion: string; createdAt: string };
  versions: KnowledgeDocumentVersion[];
  approvals: KnowledgeApprovalStep[];
  relations: KnowledgeRelation[];
};

export type KnowledgeAcknowledgement = {
  id: number;
  documentId: number;
  documentNumber: string;
  title: string;
  versionId: number;
  revision: string;
  assignedAt: string;
  dueAt: string | null;
  status: string;
  overdue: boolean;
};

export type KnowledgeAuditEvent = {
  id: number;
  occurredAt: string;
  actorName: string;
  actorRole: string;
  action: string;
  versionId: number | null;
  revision: string | null;
  before: string | null;
  after: string | null;
  reason: string;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
};

export type KnowledgeComment = {
  id: number;
  versionId: number | null;
  parentCommentId: number | null;
  authorId: number;
  authorName: string;
  content: string;
  mentionedUserIds: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgePermission = {
  id: number;
  subjectType: string;
  subjectId: number | null;
  subjectName: string;
  department: string | null;
  permissionLevel: string;
  grantedByName: string;
  createdAt: string;
};

export type KnowledgeArticleRow = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  articleType: string;
  categoryId: number;
  categoryName: string;
  ownerId: number;
  ownerName: string;
  status: string;
  confidentiality: string;
  language: string;
  tags: string;
  reviewDate: string | null;
  helpfulCount: number;
  notHelpfulCount: number;
  viewCount: number;
  updatedAt: string;
};

export type KnowledgeArticleDetail = KnowledgeArticleRow & {
  content: string;
  createdAt: string;
  rowVersion: string;
};

export type KnowledgeNumberSequence = {
  id: number;
  prefix: string;
  scopeCode: string;
  scopeName: string;
  lastNumber: number;
  padding: number;
  isActive: boolean;
  updatedAt: string;
};

export type KnowledgeDashboard = {
  totalDocuments: number; published: number; inWorkflow: number; expired: number;
  reviewDueWithin90Days: number; myDrafts: number; presentations: number;
  assignedReviews: number; assignedApprovals: number; acknowledgementsRequired: number; articles: number;
};

export const getKnowledgeDashboard = () =>
  apiRequest<KnowledgeDashboard>("/api/v1/knowledge/dashboard");

export const getSalesMaterialCatalog = () =>
  apiRequest<SalesMaterialCatalogPayload>("/api/v1/knowledge/sales-materials");

export const updateSalesMaterialCatalog = (catalog: SalesMaterialCatalogPayload) =>
  apiRequest<SalesMaterialCatalogPayload>("/api/v1/knowledge/sales-materials", {
    method: "PUT",
    body: JSON.stringify(catalog),
  });

export const listKnowledgeCategories = (includeInactive = false) =>
  apiRequest<{ items: KnowledgeCategory[] }>(`/api/v1/knowledge/categories${queryString({ includeInactive: includeInactive || undefined })}`);

export const createKnowledgeCategory = (input: {
  parentId?: number; code: string; nameEn: string; nameTh?: string; nameJa?: string;
  defaultDocumentType?: string; defaultConfidentiality?: string; sortOrder: number; isActive: boolean;
}) => apiRequest<{ id: number }>("/api/v1/knowledge/categories", { method: "POST", body: JSON.stringify(input) });

export const updateKnowledgeCategory = (id: number, input: {
  parentId?: number; code: string; nameEn: string; nameTh?: string; nameJa?: string;
  defaultDocumentType?: string; defaultConfidentiality?: string; sortOrder: number; isActive: boolean;
}) => apiRequest<{ id: number }>(`/api/v1/knowledge/categories/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const listKnowledgeNumberSequences = () =>
  apiRequest<{ items: KnowledgeNumberSequence[] }>("/api/v1/knowledge/number-sequences");

export const createKnowledgeNumberSequence = (input: Omit<KnowledgeNumberSequence, "id" | "updatedAt">) =>
  apiRequest<{ id: number }>("/api/v1/knowledge/number-sequences", { method: "POST", body: JSON.stringify(input) });

export const updateKnowledgeNumberSequence = (id: number, input: Omit<KnowledgeNumberSequence, "id" | "updatedAt">) =>
  apiRequest<{ id: number }>(`/api/v1/knowledge/number-sequences/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const listKnowledgeDocuments = (values: {
  search?: string;
  documentType?: string;
  status?: string;
  department?: string;
  confidentiality?: string;
  language?: string;
  categoryId?: number;
  ownerId?: number;
  reviewDue?: boolean;
  includeArchived?: boolean;
  workspace?: boolean;
  page?: number;
  pageSize?: number;
}) =>
  apiRequest<PagedResult<KnowledgeDocumentRow>>(`/api/v1/knowledge/documents${queryString(values)}`);

export const getKnowledgeDocument = (id: number) =>
  apiRequest<KnowledgeDocumentDetail>(`/api/v1/knowledge/documents/${id}`);

export async function createKnowledgeDocument(input: {
  title: string;
  documentType: string;
  categoryId: number;
  numberPrefix: string;
  numberScope: string;
  description?: string;
  department?: string;
  confidentiality?: string;
  language?: string;
  tags?: string;
  ownerId?: number;
  nextReviewDate?: string;
  file?: File;
}) {
  const body = new FormData();
  body.set("title", input.title);
  body.set("documentType", input.documentType);
  body.set("categoryId", String(input.categoryId));
  body.set("numberPrefix", input.numberPrefix);
  body.set("numberScope", input.numberScope);
  if (input.description) body.set("description", input.description);
  if (input.department) body.set("department", input.department);
  if (input.confidentiality) body.set("confidentiality", input.confidentiality);
  if (input.language) body.set("language", input.language);
  if (input.tags) body.set("tags", input.tags);
  if (input.ownerId) body.set("ownerId", String(input.ownerId));
  if (input.nextReviewDate) body.set("nextReviewDate", input.nextReviewDate);
  if (input.file) body.set("file", input.file);
  const response = await authorizedFetch("/api/v1/knowledge/documents", { method: "POST", body }, 120_000);
  return response.json() as Promise<{ id: number; documentNumber: string; versionId: number }>;
}

export async function uploadKnowledgeVersion(documentId: number, input: {
  file: File;
  changeSummary: string;
  changeType?: "Major" | "Minor";
  baseVersionId?: number;
}) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("changeSummary", input.changeSummary);
  body.set("changeType", input.changeType ?? "Major");
  if (input.baseVersionId) body.set("baseVersionId", String(input.baseVersionId));
  const response = await authorizedFetch(
    `/api/v1/knowledge/documents/${documentId}/versions`, { method: "POST", body }, 120_000);
  return response.json() as Promise<{ versionId: number; revision: string }>;
}

export const submitKnowledgeReview = (versionId: number, input: {
  reviewerIds: number[];
  approverId: number;
  comment?: string;
}) =>
  apiRequest<{ versionId: number; status: string }>(`/api/v1/knowledge/versions/${versionId}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const decideKnowledgeVersion = (versionId: number, input: {
  decision: "Approved" | "Request Changes" | "Rejected";
  comment?: string;
}) =>
  apiRequest<{ versionId: number; status: string }>(`/api/v1/knowledge/versions/${versionId}/decide`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const publishKnowledgeVersion = (versionId: number, input: {
  effectiveDate?: string;
  expiryDate?: string;
  comment?: string;
}) =>
  apiRequest<{ versionId: number; status: string; supersededVersionId: number | null }>(
    `/api/v1/knowledge/versions/${versionId}/publish`, {
      method: "POST",
      body: JSON.stringify(input),
    });

export const linkKnowledgeDocument = (documentId: number, input: {
  entityType: string;
  entityId: number;
  relationType?: string;
}) =>
  apiRequest<{ id: number }>(`/api/v1/knowledge/documents/${documentId}/relations`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const unlinkKnowledgeDocument = (documentId: number, relationId: number) =>
  apiRequest<void>(`/api/v1/knowledge/documents/${documentId}/relations/${relationId}`, { method: "DELETE" });

export const listRelatedKnowledge = (entityType: string, entityId: number) =>
  apiRequest<{ items: Array<{
    relationId: number;
    relationType: string;
    documentId: number;
    documentNumber: string;
    title: string;
    documentType: string;
    status: string;
    revision: string | null;
    ownerName: string;
    updatedAt: string;
  }> }>(`/api/v1/knowledge/related${queryString({ entityType, entityId })}`);

export const assignKnowledgeAcknowledgement = (versionId: number, input: { userIds: number[]; dueAt?: string }) =>
  apiRequest<{ versionId: number; assigned: number }>(
    `/api/v1/knowledge/versions/${versionId}/acknowledgements`, {
      method: "POST",
      body: JSON.stringify(input),
    });

export const acknowledgeKnowledge = (acknowledgementId: number) =>
  apiRequest<{ acknowledgementId: number; status: string }>(
    `/api/v1/knowledge/acknowledgements/${acknowledgementId}/acknowledge`, { method: "POST" });

export const listMyKnowledgeAcknowledgements = () =>
  apiRequest<{ items: KnowledgeAcknowledgement[] }>("/api/v1/knowledge/me/acknowledgements");

export const listKnowledgeAudit = (documentId: number) =>
  apiRequest<{ items: KnowledgeAuditEvent[] }>(`/api/v1/knowledge/documents/${documentId}/audit`);

export const archiveKnowledgeDocument = (documentId: number, reason: string) =>
  apiRequest<{ id: number; status: string }>(`/api/v1/knowledge/documents/${documentId}/archive`, {
    method: "POST", body: JSON.stringify({ reason }),
  });

export const setKnowledgeWorkingStatus = (documentId: number, status: "Shared" | "Editing" | "Final", reason?: string) =>
  apiRequest<{ id: number; versionId: number; status: string }>(`/api/v1/knowledge/documents/${documentId}/working-status`, {
    method: "POST", body: JSON.stringify({ status, reason }),
  });

export const restoreKnowledgeDocument = (documentId: number, reason: string) =>
  apiRequest<{ id: number; status: string }>(`/api/v1/knowledge/documents/${documentId}/restore`, {
    method: "POST", body: JSON.stringify({ reason }),
  });

export const listKnowledgeComments = (documentId: number) =>
  apiRequest<{ items: KnowledgeComment[] }>(`/api/v1/knowledge/documents/${documentId}/comments`);

export const createKnowledgeComment = (documentId: number, input: {
  content: string; versionId?: number; parentCommentId?: number; mentionedUserIds?: number[];
}) => apiRequest<{ id: number }>(`/api/v1/knowledge/documents/${documentId}/comments`, {
  method: "POST", body: JSON.stringify(input),
});

export const setKnowledgeCommentResolution = (commentId: number, resolved: boolean) =>
  apiRequest<{ id: number; resolved: boolean }>(`/api/v1/knowledge/comments/${commentId}/resolution`, {
    method: "POST", body: JSON.stringify({ resolved }),
  });

export const listKnowledgePermissions = (documentId: number) =>
  apiRequest<{ items: KnowledgePermission[] }>(`/api/v1/knowledge/documents/${documentId}/permissions`);

export const grantKnowledgePermission = (documentId: number, input: {
  subjectType: string; subjectId?: number; department?: string; permissionLevel: string;
}) => apiRequest<{ id: number }>(`/api/v1/knowledge/documents/${documentId}/permissions`, {
  method: "POST", body: JSON.stringify(input),
});

export const revokeKnowledgePermission = (documentId: number, permissionId: number) =>
  apiRequest<void>(`/api/v1/knowledge/documents/${documentId}/permissions/${permissionId}`, { method: "DELETE" });

export const listKnowledgeArticles = (values: {
  search?: string; articleType?: string; status?: string; includeArchived?: boolean; page?: number; pageSize?: number;
}) => apiRequest<PagedResult<KnowledgeArticleRow>>(`/api/v1/knowledge/articles${queryString(values)}`);

export const getKnowledgeArticle = (id: number) =>
  apiRequest<KnowledgeArticleDetail>(`/api/v1/knowledge/articles/${id}`);

export const createKnowledgeArticle = (input: {
  title: string; summary?: string; content: string; articleType: string; categoryId: number;
  ownerId?: number; status?: string; confidentiality?: string; language?: string; tags?: string; reviewDate?: string;
}) => apiRequest<{ id: number; slug: string }>("/api/v1/knowledge/articles", {
  method: "POST", body: JSON.stringify(input),
});

export const updateKnowledgeArticle = (id: number, input: {
  title: string; summary?: string; content: string; articleType: string; categoryId: number;
  ownerId?: number; status?: string; confidentiality?: string; language?: string; tags?: string; reviewDate?: string;
}) => apiRequest<{ id: number }>(`/api/v1/knowledge/articles/${id}`, {
  method: "PUT", body: JSON.stringify(input),
});

export const sendKnowledgeArticleFeedback = (id: number, helpful: boolean) =>
  apiRequest<{ id: number; helpful: boolean }>(`/api/v1/knowledge/articles/${id}/feedback`, {
    method: "POST", body: JSON.stringify({ helpful }),
  });

export async function downloadKnowledgeVersion(versionId: number) {
  const response = await authorizedFetch(
    `/api/v1/knowledge/versions/${versionId}/content`,
    { headers: { Accept: "application/octet-stream" } }, 120_000);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const fileName = encodedName ? decodeURIComponent(encodedName) : quotedName ?? `document-${versionId}`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function previewKnowledgeVersion(versionId: number) {
  const response = await authorizedFetch(
    `/api/v1/knowledge/versions/${versionId}/content?preview=true`,
    { headers: { Accept: "application/pdf,image/*,text/*" } }, 120_000);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const preview = window.open(url, "_blank", "noopener,noreferrer");
  if (!preview) {
    URL.revokeObjectURL(url);
    throw new Error("The browser blocked the preview window. Allow pop-ups and try again.");
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/* ==========================================================================
   Sales Intake & Engineer Site Visit

   Appended block — nothing above is touched. The shapes match
   backend/IoTTeamCenter.Api/Models/SiteVisitModels.cs field for field, so a
   change on either side shows up as a type error rather than as an undefined
   at runtime.
   ========================================================================== */

export type IntakeStatus =
  | "Draft" | "Pending Technical Review" | "More Information Required" | "Ready to Schedule"
  | "Scheduled" | "Completed" | "On Hold" | "Cancelled" | "Closed";

export type VisitStatus =
  | "Tentative" | "Pending Engineer Confirmation" | "Pending Customer Confirmation" | "Confirmed"
  | "In Progress" | "Report Pending" | "Report Under Review" | "Completed" | "On Hold"
  | "Reschedule Requested" | "Cancelled" | "Customer No-show" | "Closed";

export type ReportSlaState = "not_applicable" | "on_track" | "due_soon" | "overdue" | "met" | "missed";

export type VisitTypeRecord = {
  id: number; code: string; nameEn: string; nameTh: string; nameJa: string; description: string;
  defaultDurationMinutes: number; defaultEngineerCount: number; requiresManagerApproval: boolean;
  sortOrder: number; isActive: boolean; checklistTemplateId: number | null; rowVersion: string;
};

export type VisitSkillRecord = {
  id: number; code: string; nameEn: string; nameTh: string; nameJa: string; discipline: string;
  sortOrder: number; isActive: boolean; engineerCount: number; rowVersion: string;
};

export type ChecklistItemRecord = {
  id: number; sortOrder: number; section: string; prompt: string; responseType: string;
  unit: string; isRequired: boolean; guidance: string; isActive: boolean;
};

export type ChecklistTemplateRecord = {
  id: number; code: string; name: string; visitTypeId: number | null; visitTypeName: string | null;
  description: string; version: number; isActive: boolean; rowVersion: string; items: ChecklistItemRecord[];
};

export type SlaPolicyRecord = {
  id: number; code: string; name: string; visitTypeId: number | null; visitTypeName: string | null;
  reviewResponseDays: number; scheduleLeadDays: number; reportDueDays: number; reportWarningHours: number;
  isDefault: boolean; isActive: boolean; rowVersion: string;
};

export type EngineerSkillRecord = {
  id: number; userId: number; userName: string; department: string; skillId: number;
  skillCode: string; skillName: string; proficiency: string; note: string; rowVersion: string;
};

export type EngineerAvailabilityRecord = {
  id: number; userId: number; userName: string; kind: string; reason: string;
  startsAt: string; endsAt: string; rowVersion: string;
};

export type VisitMasterData = {
  visitTypes: VisitTypeRecord[];
  skills: VisitSkillRecord[];
  checklistTemplates: ChecklistTemplateRecord[];
  slaPolicies: SlaPolicyRecord[];
  engineerSkills: EngineerSkillRecord[];
  availability: EngineerAvailabilityRecord[];
};

export type CustomerSiteContactRecord = {
  id: number; siteId: number; name: string; department: string; position: string;
  phone: string; email: string; preferredChannel: string; isPrimary: boolean; isActive: boolean; rowVersion: string;
};

export type CustomerSiteRecord = {
  id: number; customerId: number; customerName: string; code: string; name: string; branch: string;
  address: string; province: string; country: string; latitude: number | null; longitude: number | null;
  travelMinutes: number; accessNote: string; isActive: boolean; rowVersion: string;
  contacts: CustomerSiteContactRecord[];
};

export type SalesIntakeSummary = {
  id: number; number: string; status: IntakeStatus; customerId: number; customerName: string;
  siteName: string; subject: string; requestDate: string; salesOwnerId: number; salesOwnerName: string;
  priority: string; requiredResponseDate: string | null; readinessScore: number;
  blockerCount: number; warningCount: number; purposeCount: number; attachmentCount: number;
  visitId: number | null; visitNumber: string | null; visitStatus: string | null;
  scheduledStart: string | null; updatedAt: string; rowVersion: string; isArchived: boolean;
};

export type SalesIntakeRequirement = {
  problemStatement: string; desiredCapability: string; expectedResult: string; expectedScope: string;
  outOfScope: string; existingProcess: string; currentPainPoint: string; targetCycleTime: string;
  productInformation: string; qualityRequirement: string; specialRequirement: string; budgetRange: string;
  expectedTimeline: string; competitorInformation: string; additionalNotes: string;
};

export type SalesIntakeMachine = {
  machineName: string; machineModel: string; machineSerialNo: string; manufacturer: string;
  existingSystem: string; controllerBrand: string; availableDrawing: string; utilityInformation: string;
  installationArea: string; spaceLimitation: string; workingEnvironment: string; safetyRequirement: string;
  productionSchedule: string; shutdownWindow: string; ppeRequirement: string; siteAccessRequirement: string;
  photographyRestricted: boolean; ndaRequired: boolean;
};

export type SalesIntakeContact = {
  siteId: number | null; siteContactId: number | null; customerBranch: string; siteName: string;
  siteAddress: string; contactName: string; contactDepartment: string; contactPosition: string;
  contactPhone: string; contactEmail: string; contactChannel: string;
};

export type IntakeWindowRecord = { id: number; startsAt: string; endsAt: string; preference: number; note: string };
export type IntakePurposeRecord = { visitTypeId: number; code: string; name: string; note: string };
export type IntakeSkillRecord = { skillId: number; code: string; name: string; source: string; isMandatory: boolean; note: string };

export type IntakeAttachmentRecord = {
  id: number; name: string; category: string; description: string; version: number; contentType: string;
  sizeBytes: number; scanStatus: string; uploadedByName: string; uploadedAt: string; rowVersion: string;
};

export type IntakeReviewRecord = {
  id: number; reviewerId: number; reviewerName: string; decision: string; comment: string; visitScope: string;
  engineerCount: number; estimatedDurationMinutes: number; requiredEquipment: string; riskAssessment: string;
  safetyConcern: string; requiresManagerApproval: boolean; managerApprovedByName: string | null;
  managerApprovedAt: string | null; missingInformation: string; readinessScoreAtReview: number; createdAt: string;
};

export type StatusHistoryRecord = {
  id: number; entityType: string; entityId: number; entityNumber: string; previousStatus: string | null;
  newStatus: string; reason: string | null; changedByName: string; changedAt: string;
};

export type ReadinessCheckResult = {
  key: string; label: string; weight: number; severity: "blocker" | "warning"; hint: string; passed: boolean;
};

export type ReadinessResult = {
  score: number; blockerCount: number; warningCount: number; canSubmit: boolean; checks: ReadinessCheckResult[];
};

export type DuplicateReferenceRecord = { id: number; number: string; subject: string; requestDate: string; status: string };

export type TraceabilityLinkRecord = {
  id: number; sourceType: string; sourceId: number; targetType: string; targetId: number;
  targetNumber: string; relation: string; note: string; createdByName: string; createdAt: string;
};

export type SiteVisitSummary = {
  id: number; number: string; intakeId: number; intakeNumber: string; status: VisitStatus;
  customerId: number; customerName: string; siteName: string; subject: string;
  visitTypeId: number; visitTypeName: string;
  scheduledStart: string | null; scheduledEnd: string | null; timeZoneId: string;
  requiredEngineerCount: number; assignedCount: number; acceptedCount: number;
  leadEngineerName: string | null; engineerNames: string;
  engineerConfirmed: boolean; customerConfirmed: boolean;
  checkedInAt: string | null; checkedOutAt: string | null;
  reportDueAt: string | null; reportStatus: string | null; reportSlaState: ReportSlaState;
  skillMatchPercent: number; updatedAt: string; rowVersion: string; isArchived: boolean;
};

export type SalesIntakeDetail = {
  id: number; number: string; status: IntakeStatus; customerId: number; customerCode: string; customerName: string;
  subject: string; customerReferenceNo: string; requestDate: string; salesOwnerId: number; salesOwnerName: string;
  priority: string; requiredResponseDate: string | null; customerExpectedCompletion: string | null; source: string;
  relatedInquiryId: number | null; relatedInquiryNumber: string | null;
  relatedProjectId: number | null; relatedProjectNumber: string | null;
  contact: SalesIntakeContact; requirement: SalesIntakeRequirement; machine: SalesIntakeMachine;
  readinessScore: number; blockerCount: number; warningCount: number;
  submittedAt: string | null; submittedByName: string | null; department: string;
  createdByName: string; createdAt: string; updatedByName: string; updatedAt: string;
  isArchived: boolean; rowVersion: string;
  purposes: IntakePurposeRecord[]; skills: IntakeSkillRecord[]; windows: IntakeWindowRecord[];
  attachments: IntakeAttachmentRecord[]; reviews: IntakeReviewRecord[]; visits: SiteVisitSummary[];
  statusHistory: StatusHistoryRecord[]; links: TraceabilityLinkRecord[];
  duplicateReferences: DuplicateReferenceRecord[];
  readiness: ReadinessResult; allowedTransitions: string[];
};

export type SaveIntakeWindowInput = { startsAt: string; endsAt: string; preference: number; note?: string };

export type SaveSalesIntakeInput = {
  customerId: number; subject: string; customerReferenceNo?: string; requestDate?: string;
  salesOwnerId: number; priority: string; requiredResponseDate?: string | null;
  customerExpectedCompletion?: string | null; source: string;
  relatedInquiryId?: number | null; relatedProjectId?: number | null;
  contact: SalesIntakeContact; requirement: SalesIntakeRequirement; machine: SalesIntakeMachine;
  visitTypeIds: number[]; skillIds: number[]; windows: SaveIntakeWindowInput[]; rowVersion?: string;
};

export type VisitAssignmentRecord = {
  id: number; engineerId: number; engineerName: string; department: string; assignmentRole: string;
  status: string; skillMatchPercent: number; skills: string[]; missingSkills: string[];
  conflictOverride: boolean; overrideReason: string | null; overrideByName: string | null; overrideAt: string | null;
  respondedAt: string | null; responseNote: string | null; proposedStart: string | null; proposedEnd: string | null;
  isActive: boolean; assignedByName: string; assignedAt: string; rowVersion: string;
};

export type VisitConfirmationRecord = {
  id: number; party: string; outcome: string; channel: string; confirmedByName: string;
  confirmedAt: string; comment: string; evidenceAttachmentId: number | null;
  recordedByName: string; recordedAt: string;
};

export type VisitScheduleHistoryRecord = {
  id: number; previousStart: string | null; previousEnd: string | null; newStart: string | null;
  newEnd: string | null; reason: string; changedByName: string; changedAt: string;
};

export type VisitChecklistResponseRecord = {
  itemId: number; sortOrder: number; section: string; prompt: string; responseType: string; itemUnit: string;
  isRequired: boolean; guidance: string; responseId: number | null; responseValue: string | null;
  numericValue: number | null; unit: string; isNotApplicable: boolean; note: string | null;
  answeredByName: string | null; answeredAt: string | null; rowVersion: string | null;
};

export type VisitFindingRecord = {
  id: number; kind: string; title: string; detail: string; measurementValue: number | null;
  measurementUnit: string; severity: string; sortOrder: number; createdByName: string;
  createdAt: string; rowVersion: string;
};

export type VisitAttachmentRecord = {
  id: number; findingId: number | null; name: string; category: string; description: string; version: number;
  contentType: string; sizeBytes: number; scanStatus: string; uploadedByName: string; uploadedAt: string; rowVersion: string;
};

export type VisitActionItemRecord = {
  id: number; title: string; detail: string; ownerId: number | null; ownerName: string;
  dueDate: string | null; status: string; completedAt: string | null; createdByName: string;
  createdAt: string; rowVersion: string;
};

export type VisitReportRevisionRecord = {
  id: number; revision: number; status: string; visitSummary: string; customerRequirement: string;
  existingCondition: string; findingsSummary: string; measurementSummary: string; rootCause: string;
  recommendedSolution: string; proposedScope: string; assumption: string; exclusion: string; risk: string;
  safetyConcern: string; customerAdditionalRequest: string; engineerConclusion: string;
  salesFollowUp: string; nextStep: string; changeSummary: string;
  createdByName: string; createdAt: string; approvedByName: string | null; approvedAt: string | null; rowVersion: string;
};

export type VisitReportRecord = {
  id: number; number: string; visitId: number; visitNumber: string; status: string; currentRevision: number;
  authorId: number; authorName: string; submittedAt: string | null; reviewedByName: string | null;
  reviewedAt: string | null; reviewComment: string; customerAcknowledgedBy: string;
  customerAcknowledgedAt: string | null; hasCustomerSignature: boolean; dueAt: string | null;
  slaState: ReportSlaState; createdAt: string; updatedAt: string; rowVersion: string;
  current: VisitReportRevisionRecord | null; revisions: VisitReportRevisionRecord[];
};

export type SiteVisitDetail = {
  id: number; number: string; status: VisitStatus; intakeId: number; intakeNumber: string; intakeSubject: string;
  customerId: number; customerCode: string; customerName: string; siteName: string; siteAddress: string;
  contactName: string; contactPhone: string; contactEmail: string;
  visitTypeId: number; visitTypeName: string; checklistTemplateId: number | null; checklistTemplateName: string | null;
  slaPolicyId: number | null; slaPolicyName: string | null; reportDueDays: number;
  scheduledStart: string | null; scheduledEnd: string | null; timeZoneId: string;
  travelMinutesBefore: number; travelMinutesAfter: number; meetingPoint: string; requiredEquipment: string;
  internalNote: string; customerNote: string; requiredEngineerCount: number;
  engineerConfirmedAt: string | null; customerConfirmedAt: string | null;
  checkedInAt: string | null; checkedInByName: string | null;
  checkInLatitude: number | null; checkInLongitude: number | null; locationConsentGiven: boolean;
  checkedOutAt: string | null; checkedOutByName: string | null;
  actualAttendees: string; customerAttendees: string; executionNote: string;
  reportDueAt: string | null; reportSlaState: ReportSlaState;
  closedAt: string | null; closedByName: string | null; closeReason: string;
  department: string; createdByName: string; createdAt: string; updatedByName: string; updatedAt: string;
  isArchived: boolean; rowVersion: string;
  requiredSkills: string[]; teamSkillMatchPercent: number; missingSkills: string[];
  assignments: VisitAssignmentRecord[]; confirmations: VisitConfirmationRecord[];
  scheduleHistory: VisitScheduleHistoryRecord[]; checklist: VisitChecklistResponseRecord[];
  findings: VisitFindingRecord[]; attachments: VisitAttachmentRecord[]; actionItems: VisitActionItemRecord[];
  statusHistory: StatusHistoryRecord[]; links: TraceabilityLinkRecord[];
  report: VisitReportRecord | null; allowedTransitions: string[]; canExecute: boolean;
};

export type EngineerCandidateRecord = {
  id: number; name: string; email: string; department: string; role: string;
  skills: string[]; skillMatchPercent: number; missingSkills: string[];
  openAssignments: number; scheduledMinutesInWindow: number; conflictCount: number; conflictDetail: string;
  travelMinutes: number; isActive: boolean; isAssigned: boolean;
};

export type CalendarEntryRecord = {
  visitId: number; visitNumber: string; status: VisitStatus; customerName: string; siteName: string;
  visitTypeName: string; startsAt: string; endsAt: string;
  travelMinutesBefore: number; travelMinutesAfter: number; engineerIds: number[]; engineerNames: string;
};

export type CalendarUnavailableRecord = {
  id: number; userId: number; userName: string; kind: string; reason: string; startsAt: string; endsAt: string;
};

export type CalendarResult = {
  from: string; to: string; visits: CalendarEntryRecord[]; unavailable: CalendarUnavailableRecord[];
};

export type PreviousVisitRecord = {
  id: number; number: string; visitTypeName: string; status: string;
  scheduledStart: string | null; engineerNames: string; reportStatus: string | null;
};

export type PreVisitBriefRecord = {
  visit: SiteVisitDetail; requirement: SalesIntakeRequirement; machine: SalesIntakeMachine;
  purposes: IntakePurposeRecord[]; intakeAttachments: IntakeAttachmentRecord[];
  openQuestions: string[]; previousVisits: PreviousVisitRecord[]; emergencyContact: string;
};

export type MyAssignmentRecord = {
  visitId: number; visitNumber: string; visitStatus: VisitStatus; assignmentId: number; assignmentStatus: string;
  assignmentRole: string; customerName: string; siteName: string; siteAddress: string; subject: string;
  visitTypeName: string; scheduledStart: string | null; scheduledEnd: string | null;
  contactName: string; contactPhone: string; checkedInAt: string | null; checkedOutAt: string | null;
  reportDueAt: string | null; reportSlaState: ReportSlaState; reportStatus: string | null;
  skillMatchPercent: number; rowVersion: string; assignmentRowVersion: string;
};

export type CountByLabel = { label: string; value: number };

export type SalesVisitDashboard = {
  intakesCreated: number; pendingTechnicalReview: number; moreInformationRequired: number;
  waitingCustomerConfirmation: number; upcomingVisits: number; completedVisits: number;
  waitingReport: number; convertedToInquiry: number; convertedToEstimate: number;
  byStatus: CountByLabel[]; attention: SalesIntakeSummary[];
};

export type EngineeringVisitDashboard = {
  awaitingAssignment: number; awaitingConfirmation: number; visitsToday: number; visitsThisWeek: number;
  scheduleConflicts: number; reportsOverdue: number;
  workloadByEngineer: CountByLabel[]; skillDemand: CountByLabel[]; attention: SiteVisitSummary[];
};

export type ManagementVisitDashboard = {
  totalIntakes: number; totalVisits: number; averageLeadTimeDays: number; completionRatePercent: number;
  reportSlaCompliancePercent: number; visitToEstimateConversionPercent: number;
  visitToProjectConversionPercent: number; cancelledRatePercent: number;
  rescheduledRatePercent: number; noShowRatePercent: number;
  byCustomer: CountByLabel[]; bySalesOwner: CountByLabel[]; byEngineer: CountByLabel[];
  byDepartment: CountByLabel[]; byVisitType: CountByLabel[];
};

export type NotificationRecord = {
  id: number; kind: string; title: string; detail: string; entityType: string | null; entityId: number | null;
  isRead: boolean; createdAt: string; readAt: string | null;
};

/* ------------------------------ Intake calls ----------------------------- */

export const listSalesIntakes = (values: {
  page?: number; pageSize?: number; search?: string; status?: string; customerId?: number;
  salesOwnerId?: number; priority?: string; requestFrom?: string; requestTo?: string;
  mine?: boolean; includeArchived?: boolean; relatedInquiryId?: number;
} = {}) => apiRequest<PagedResult<SalesIntakeSummary>>(`/api/v1/sales-intakes/${queryString(values)}`);

export const loadSalesIntake = (id: number) => apiRequest<SalesIntakeDetail>(`/api/v1/sales-intakes/${id}`);

export const loadTechnicalReviewQueue = () => apiRequest<SalesIntakeSummary[]>("/api/v1/sales-intakes/review-queue");

export const loadSalesVisitDashboard = () => apiRequest<SalesVisitDashboard>("/api/v1/sales-intakes/dashboard");

export const createSalesIntake = (input: SaveSalesIntakeInput) =>
  apiRequest<{ id: number; number: string; readiness: ReadinessResult }>("/api/v1/sales-intakes/", {
    method: "POST", body: JSON.stringify(input),
  });

export const saveSalesIntake = (id: number, input: SaveSalesIntakeInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string; readiness: ReadinessResult }>(`/api/v1/sales-intakes/${id}`, {
    method: "PUT", body: JSON.stringify(input),
  });

export const changeIntakeStatus = (id: number, input: { status: string; reason?: string; rowVersion: string }) =>
  apiRequest<{ id: number; number: string; status: string; rowVersion: string; readiness: ReadinessResult }>(
    `/api/v1/sales-intakes/${id}/status`, { method: "POST", body: JSON.stringify(input) });

export type SubmitTechnicalReviewInput = {
  decision: string; comment?: string; visitScope?: string; engineerCount: number;
  estimatedDurationMinutes: number; requiredEquipment?: string; riskAssessment?: string;
  safetyConcern?: string; requiresManagerApproval: boolean; skillIds?: number[]; rowVersion: string;
};

export const submitTechnicalReview = (id: number, input: SubmitTechnicalReviewInput) =>
  apiRequest<{ id: number; number: string; reviewId: number; status: string; rowVersion: string; readiness: ReadinessResult }>(
    `/api/v1/sales-intakes/${id}/review`, { method: "POST", body: JSON.stringify(input) });

export async function uploadIntakeAttachment(id: number, input: { file: File; category: string; description?: string }) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("category", input.category);
  if (input.description) body.set("description", input.description);
  const response = await authorizedFetch(`/api/v1/sales-intakes/${id}/attachments`, { method: "POST", body }, 120_000);
  return response.json() as Promise<IntakeAttachmentRecord>;
}

export const deleteIntakeAttachment = (id: number, attachmentId: number) =>
  apiRequest<{ id: number; attachmentId: number; readiness: ReadinessResult }>(
    `/api/v1/sales-intakes/${id}/attachments/${attachmentId}`, { method: "DELETE" });

export const downloadIntakeAttachment = (id: number, attachmentId: number) =>
  downloadNamedFile(`/api/v1/sales-intakes/${id}/attachments/${attachmentId}/content`);

/* ---------------------------- Site visit calls --------------------------- */

export const listSiteVisits = (values: {
  page?: number; pageSize?: number; search?: string; status?: string; customerId?: number;
  engineerId?: number; visitTypeId?: number; from?: string; to?: string;
  unassigned?: boolean; reportOverdue?: boolean; includeArchived?: boolean;
} = {}) => apiRequest<PagedResult<SiteVisitSummary>>(`/api/v1/site-visits/${queryString(values)}`);

export const loadSiteVisit = (id: number) => apiRequest<SiteVisitDetail>(`/api/v1/site-visits/${id}`);

export const loadPreVisitBrief = (id: number) => apiRequest<PreVisitBriefRecord>(`/api/v1/site-visits/${id}/brief`);

export const loadEngineerCandidates = (id: number) =>
  apiRequest<EngineerCandidateRecord[]>(`/api/v1/site-visits/${id}/candidates`);

export const loadVisitCalendar = (values: { from?: string; to?: string; engineerId?: number; department?: string } = {}) =>
  apiRequest<CalendarResult>(`/api/v1/site-visits/calendar${queryString(values)}`);

export const loadMyAssignments = (values: { includeClosed?: boolean } = {}) =>
  apiRequest<MyAssignmentRecord[]>(`/api/v1/site-visits/my-assignments${queryString(values)}`);

export const loadEngineeringVisitDashboard = () =>
  apiRequest<EngineeringVisitDashboard>("/api/v1/site-visits/dashboard/engineering");

export const loadManagementVisitDashboard = () =>
  apiRequest<ManagementVisitDashboard>("/api/v1/site-visits/dashboard/management");

export type CreateSiteVisitInput = {
  intakeId: number; visitTypeId: number; checklistTemplateId?: number | null; proposedWindowId?: number | null;
  scheduledStart?: string | null; scheduledEnd?: string | null; timeZoneId?: string;
  travelMinutesBefore: number; travelMinutesAfter: number; meetingPoint?: string; requiredEquipment?: string;
  internalNote?: string; customerNote?: string; requiredEngineerCount: number;
};

export const createSiteVisit = (input: CreateSiteVisitInput) =>
  apiRequest<{ id: number; number: string; intakeId: number }>("/api/v1/site-visits/", {
    method: "POST", body: JSON.stringify(input),
  });

export const changeVisitStatus = (id: number, input: { status: string; reason?: string; rowVersion: string }) =>
  apiRequest<{ id: number; number: string; status: string; rowVersion: string }>(`/api/v1/site-visits/${id}/status`, {
    method: "POST", body: JSON.stringify(input),
  });

export type RescheduleVisitInput = {
  scheduledStart: string; scheduledEnd: string; timeZoneId?: string;
  travelMinutesBefore: number; travelMinutesAfter: number; meetingPoint?: string; reason: string; rowVersion: string;
};

export const rescheduleSiteVisit = (id: number, input: RescheduleVisitInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>(`/api/v1/site-visits/${id}/schedule`, {
    method: "PUT", body: JSON.stringify(input),
  });

export const assignVisitEngineer = (id: number, input: {
  engineerId: number; assignmentRole: string; conflictOverride: boolean; overrideReason?: string; rowVersion: string;
}) => apiRequest<{
  id: number; assignmentId: number; matchPercent: number; missingSkills: string[];
  conflicts: number; conflictDetail: string; rowVersion: string;
}>(`/api/v1/site-visits/${id}/assignments`, { method: "POST", body: JSON.stringify(input) });

export const respondToAssignment = (id: number, assignmentId: number, input: {
  response: string; note?: string; proposedStart?: string | null; proposedEnd?: string | null; rowVersion: string;
}) => apiRequest<{ id: number; assignmentId: number; status: string; rowVersion: string }>(
  `/api/v1/site-visits/${id}/assignments/${assignmentId}/response`, { method: "POST", body: JSON.stringify(input) });

export const withdrawAssignment = (id: number, assignmentId: number) =>
  apiRequest<{ id: number; assignmentId: number }>(`/api/v1/site-visits/${id}/assignments/${assignmentId}`, { method: "DELETE" });

export const recordVisitConfirmation = (id: number, input: {
  party: string; outcome: string; channel: string; confirmedByName?: string; confirmedAt?: string | null;
  comment?: string; evidenceAttachmentId?: number | null; rowVersion: string;
}) => apiRequest<{ id: number; confirmationId: number; rowVersion: string }>(
  `/api/v1/site-visits/${id}/confirmations`, { method: "POST", body: JSON.stringify(input) });

export const checkInSiteVisit = (id: number, input: {
  actualAttendees?: string; customerAttendees?: string; locationConsentGiven: boolean;
  latitude?: number | null; longitude?: number | null; rowVersion: string;
}) => apiRequest<{ id: number; status: string; rowVersion: string }>(
  `/api/v1/site-visits/${id}/check-in`, { method: "POST", body: JSON.stringify(input) });

export const checkOutSiteVisit = (id: number, input: { executionNote?: string; rowVersion: string }) =>
  apiRequest<{ id: number; status: string; reportDueAt: string; reportNumber: string; rowVersion: string }>(
    `/api/v1/site-visits/${id}/check-out`, { method: "POST", body: JSON.stringify(input) });

export type SaveChecklistResponseInput = {
  checklistItemId: number; responseValue?: string | null; numericValue?: number | null;
  unit?: string; isNotApplicable: boolean; note?: string | null;
};

export const saveVisitChecklist = (id: number, answers: SaveChecklistResponseInput[]) =>
  apiRequest<{ id: number; saved: number }>(`/api/v1/site-visits/${id}/checklist`, {
    method: "PUT", body: JSON.stringify(answers),
  });

export const saveVisitFinding = (id: number, input: {
  kind: string; title: string; detail?: string; measurementValue?: number | null;
  measurementUnit?: string; severity: string; sortOrder: number;
}) => apiRequest<{ id: number; findingId: number }>(`/api/v1/site-visits/${id}/findings`, {
  method: "POST", body: JSON.stringify(input),
});

export const deleteVisitFinding = (id: number, findingId: number) =>
  apiRequest<{ id: number; findingId: number }>(`/api/v1/site-visits/${id}/findings/${findingId}`, { method: "DELETE" });

export const saveVisitActionItem = (id: number, input: {
  title: string; detail?: string; ownerId?: number | null; ownerName?: string;
  dueDate?: string | null; status: string;
}) => apiRequest<{ id: number; actionItemId: number }>(`/api/v1/site-visits/${id}/action-items`, {
  method: "POST", body: JSON.stringify(input),
});

export async function uploadVisitAttachment(id: number, input: {
  file: File; category: string; description?: string; findingId?: number;
}) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("category", input.category);
  if (input.description) body.set("description", input.description);
  if (input.findingId) body.set("findingId", String(input.findingId));
  const response = await authorizedFetch(`/api/v1/site-visits/${id}/attachments`, { method: "POST", body }, 180_000);
  return response.json() as Promise<VisitAttachmentRecord>;
}

export const downloadVisitAttachment = (id: number, attachmentId: number) =>
  downloadNamedFile(`/api/v1/site-visits/${id}/attachments/${attachmentId}/content`);

export type SaveVisitReportInput = {
  visitSummary?: string; customerRequirement?: string; existingCondition?: string; findingsSummary?: string;
  measurementSummary?: string; rootCause?: string; recommendedSolution?: string; proposedScope?: string;
  assumption?: string; exclusion?: string; risk?: string; safetyConcern?: string;
  customerAdditionalRequest?: string; engineerConclusion?: string; salesFollowUp?: string;
  nextStep?: string; changeSummary?: string; rowVersion: string;
};

export const saveVisitReport = (id: number, input: SaveVisitReportInput) =>
  apiRequest<{ visitId: number; reportId: number; number: string; rowVersion: string }>(
    `/api/v1/site-visits/${id}/report`, { method: "PUT", body: JSON.stringify(input) });

export const submitVisitReport = (id: number, rowVersion: string) =>
  apiRequest<{ visitId: number; reportId: number; status: string; rowVersion: string }>(
    `/api/v1/site-visits/${id}/report/submit`, { method: "POST", body: JSON.stringify({ status: "Submitted", rowVersion }) });

export const reviewVisitReport = (id: number, input: { decision: string; comment?: string; rowVersion: string }) =>
  apiRequest<{ visitId: number; reportId: number; status: string; rowVersion: string }>(
    `/api/v1/site-visits/${id}/report/review`, { method: "POST", body: JSON.stringify(input) });

export const acknowledgeVisitReport = (id: number, input: {
  acknowledgedBy: string; acknowledgedAt?: string | null; signatureDataUrl?: string | null; rowVersion: string;
}) => apiRequest<{ visitId: number; reportId: number; status: string; rowVersion: string }>(
  `/api/v1/site-visits/${id}/report/acknowledge`, { method: "POST", body: JSON.stringify(input) });

export const closeSiteVisit = (id: number, input: { reason: string; rowVersion: string }) =>
  apiRequest<{ id: number; status: string; hasApprovedReport: boolean; rowVersion: string }>(
    `/api/v1/site-visits/${id}/close`, { method: "POST", body: JSON.stringify(input) });

export const linkVisitRecord = (id: number, input: { targetType: string; targetId: number; relation?: string; note?: string }) =>
  apiRequest<{ id: number; targetType: string; targetId: number; targetNumber: string }>(
    `/api/v1/site-visits/${id}/links`, { method: "POST", body: JSON.stringify(input) });

export const createInquiryFromVisit = (id: number, input: {
  projectName: string; projectType: string; estimateOwnerId: number; dueDate: string;
  priority: string; projectProbability: number; customerInterestGrade: string; remark?: string;
}) => apiRequest<{ visitId: number; inquiryId: number; number: string }>(
  `/api/v1/site-visits/${id}/inquiry`, { method: "POST", body: JSON.stringify(input) });

export const createEstimateFromVisit = (id: number) =>
  apiRequest<{
    visitId: number; estimateId: number; number: string; inquiryId?: number;
    status?: string; created: boolean; message?: string;
  }>(`/api/v1/site-visits/${id}/estimate`, { method: "POST", body: JSON.stringify({}) });

/* --------------------------- Master data calls --------------------------- */

export const loadVisitMasterData = () => apiRequest<VisitMasterData>("/api/v1/visit-master/");

export const saveVisitType = (input: {
  code: string; nameEn: string; nameTh?: string; nameJa?: string; description?: string;
  defaultDurationMinutes: number; defaultEngineerCount: number; requiresManagerApproval: boolean;
  sortOrder: number; isActive: boolean;
}) => apiRequest<{ id: number; code: string }>("/api/v1/visit-master/visit-types", {
  method: "POST", body: JSON.stringify(input),
});

export const saveVisitSkill = (input: {
  code: string; nameEn: string; nameTh?: string; nameJa?: string; discipline?: string;
  sortOrder: number; isActive: boolean;
}) => apiRequest<{ id: number; code: string }>("/api/v1/visit-master/skills", {
  method: "POST", body: JSON.stringify(input),
});

export const saveChecklistTemplate = (input: {
  code: string; name: string; visitTypeId?: number | null; description?: string; isActive: boolean;
  items: { sortOrder: number; section: string; prompt: string; responseType: string; unit?: string; isRequired: boolean; guidance?: string }[];
}) => apiRequest<{ id: number; code: string; items: number }>("/api/v1/visit-master/checklist-templates", {
  method: "POST", body: JSON.stringify(input),
});

export const saveSlaPolicy = (input: {
  code: string; name: string; visitTypeId?: number | null; reviewResponseDays: number;
  scheduleLeadDays: number; reportDueDays: number; reportWarningHours: number; isDefault: boolean; isActive: boolean;
}) => apiRequest<{ id: number; code: string }>("/api/v1/visit-master/sla-policies", {
  method: "POST", body: JSON.stringify(input),
});

export const saveEngineerSkill = (input: { userId: number; skillId: number; proficiency: string; note?: string }) =>
  apiRequest<{ id: number }>("/api/v1/visit-master/engineer-skills", { method: "POST", body: JSON.stringify(input) });

export const deleteEngineerSkill = (id: number) =>
  apiRequest<{ id: number }>(`/api/v1/visit-master/engineer-skills/${id}`, { method: "DELETE" });

export const saveEngineerAvailability = (input: {
  userId: number; kind: string; reason?: string; startsAt: string; endsAt: string;
}) => apiRequest<{ id: number; conflictingVisits: string[] }>("/api/v1/visit-master/availability", {
  method: "POST", body: JSON.stringify(input),
});

export const deleteEngineerAvailability = (id: number) =>
  apiRequest<{ id: number }>(`/api/v1/visit-master/availability/${id}`, { method: "DELETE" });

export const listCustomerSites = (customerId: number) =>
  apiRequest<CustomerSiteRecord[]>(`/api/v1/visit-master/customers/${customerId}/sites`);

export const saveCustomerSite = (customerId: number, input: {
  customerId: number; code: string; name: string; branch?: string; address?: string; province?: string;
  country?: string; latitude?: number | null; longitude?: number | null; travelMinutes: number;
  accessNote?: string; isActive: boolean;
}) => apiRequest<{ id: number; code: string }>(`/api/v1/visit-master/customers/${customerId}/sites`, {
  method: "POST", body: JSON.stringify(input),
});

export const saveCustomerSiteContact = (siteId: number, input: {
  name: string; department?: string; position?: string; phone?: string; email?: string;
  preferredChannel?: string; isPrimary: boolean; isActive: boolean;
}) => apiRequest<{ id: number; siteId: number }>(`/api/v1/visit-master/sites/${siteId}/contacts`, {
  method: "POST", body: JSON.stringify(input),
});

/* ---------------------------- Notification feed -------------------------- */

export const listNotifications = (values: { unreadOnly?: boolean; limit?: number } = {}) =>
  apiRequest<NotificationRecord[]>(`/api/v1/me/notifications/${queryString(values)}`);

export const markNotificationsRead = (input: { ids?: number[]; all?: boolean }) =>
  apiRequest<{ updated: number }>("/api/v1/me/notifications/read", {
    method: "POST", body: JSON.stringify({ ids: input.ids ?? [], all: input.all ?? false }),
  });

/**
 * Content-Disposition carries the real file name, which may be Thai. The
 * RFC 5987 form is preferred and the quoted form is the fallback, the same
 * order the inquiry download uses.
 */
export async function downloadNamedFile(path: string) {
  const response = await authorizedFetch(path, { headers: { Accept: "application/octet-stream" } }, 180_000);
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  let fileName = quotedName;
  if (encodedName) {
    try { fileName = decodeURIComponent(encodedName); } catch { fileName = encodedName; }
  }
  return { blob: await response.blob(), fileName };
}

// ---------------------------------------------------------------------------
// Document signing (DSN-TC-005)
//
// Signing is not approving. The estimate and PR approval endpoints record a
// decision about a record; these record a mark placed on one exact file,
// identified by its SHA-256.
// ---------------------------------------------------------------------------

export type SignDocumentClass =
  | "DRAWING" | "SPEC" | "MANUAL" | "MAT_APPROVE"
  | "QUOTATION" | "PR_PO" | "UAT_ACCEPT" | "SERVICE_RPT";

export type SignableDocumentSummary = {
  scheduleTaskId: number | null;
  id: number;
  documentNo: string;
  documentClass: SignDocumentClass;
  title: string;
  projectId: number | null;
  projectNumber: string | null;
  projectName: string | null;
  estimateId: number | null;
  estimateNumber: string | null;
  documentLocale: string;
  amount: number | null;
  ownerId: number;
  ownerName: string;
  signingState: string;
  currentRevisionLabel: string | null;
  currentSha256: string | null;
  liveRequestId: number | null;
  signedStepCount: number;
  totalStepCount: number;
  dueDate: string | null;
  updatedAt: string;
  rowVersion: string;
};

export type SignTask = {
  stepId: number;
  stepNo: number;
  totalSteps: number;
  blockCode: string;
  requiredMark: string;
  stampCode: string | null;
  holdsStampAuthority: boolean;
  stampAuthorityValidTo: string | null;
  requestId: number;
  documentId: number;
  documentNo: string;
  documentClass: SignDocumentClass;
  title: string;
  projectNumber: string | null;
  projectName: string | null;
  amount: number | null;
  revisionLabel: string;
  initiatorId: number;
  initiatorName: string;
  requestedAt: string;
  dueDate: string | null;
  assignedByRole: boolean;
  rowVersion: string;
};

export type SignInbox = {
  waitingMe: SignTask[];
  returnedToMe: SignableDocumentSummary[];
  initiatedByMe: SignableDocumentSummary[];
  signedLast30Days: number;
  hasSpecimen: boolean;
};

export type DocumentFileRevision = {
  id: number;
  revisionLabel: string;
  source: string;
  projectDocumentId: number | null;
  projectId: number | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  pageCount: number | null;
  renderedFromEntity: string | null;
  renderedFromId: number | null;
  frozenAt: string;
  frozenByName: string;
  requestId: number | null;
  requestState: string | null;
};

export type SignMarkDetail = {
  id: number;
  kind: string;
  stampCode: string | null;
  stampAuthorityId: number | null;
  anchorCode: string | null;
  pageNo: number | null;
  posX: number | null;
  posY: number | null;
  textValue: string | null;
  scanDocumentId: number | null;
  renderedAt: string;
};

export type SignStepDetail = {
  id: number;
  stepNo: number;
  blockCode: string;
  requiredMark: string;
  stampCode: string | null;
  assigneeUserId: number | null;
  assigneeName: string | null;
  assigneeRole: string | null;
  delegatedFromName: string | null;
  isOptional: boolean;
  parallelGroup: number | null;
  anchorCode: string;
  dueDate: string | null;
  state: string;
  decision: string | null;
  reason: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  marks: SignMarkDetail[];
  rowVersion: string;
};

export type SignEventDetail = {
  seq: number;
  action: string;
  actorName: string | null;
  stepNo: number | null;
  detail: string | null;
  ip: string | null;
  authEvidence: string | null;
  authAt: string | null;
  payloadHash: string;
  prevHash: string | null;
  hash: string;
  occurredAt: string;
};

export type SignedOutputSummary = {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  verifyCode: string;
  pageCount: number | null;
  producedAt: string;
};

export type SignRequestDetail = {
  id: number;
  documentFileId: number;
  revisionLabel: string;
  templateId: number;
  templateVersion: number;
  initiatorName: string;
  dueDate: string | null;
  state: string;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
  steps: SignStepDetail[];
  rowVersion: string;
};

export type SignableDocumentWorkspace = {
  document: SignableDocumentSummary;
  revisions: DocumentFileRevision[];
  liveRequest: SignRequestDetail | null;
  closedRequests: SignRequestDetail[];
  events: SignEventDetail[];
  output: SignedOutputSummary | null;
  chainVerified: boolean;
};

export type SignatureSpecimenSummary = {
  id: number;
  version: number;
  source: string;
  hasInitials: boolean;
  initialsText: string | null;
  activeFrom: string;
  activeTo: string | null;
  usedInDocuments: number;
};

export type SignatureSpecimenView = {
  active: SignatureSpecimenSummary | null;
  history: SignatureSpecimenSummary[];
};

export type StampAuthoritySummary = {
  id: number;
  holderKind: "ROLE" | "USER";
  holderId: number;
  holderName: string;
  documentClass: string | null;
  grantedByName: string;
  validFrom: string;
  validTo: string | null;
  revokedAt: string | null;
  usedCount: number;
};

export type CompanyStampSummary = {
  id: number;
  code: string;
  nameTh: string;
  nameEn: string;
  nameJa: string;
  legalEntity: string;
  hasImage: boolean;
  scope: string[];
  custodianRole: string;
  validFrom: string;
  validTo: string | null;
  status: string;
  appliedCount: number;
  authorities: StampAuthoritySummary[];
  rowVersion: string;
};

export type SignFlowStepSummary = {
  id: number;
  stepNo: number;
  blockCode: string;
  assigneeKind: string;
  assigneeRole: string | null;
  assigneeName: string | null;
  requiredMark: string;
  stampCode: string | null;
  isOptional: boolean;
  parallelGroup: number | null;
  anchorCode: string;
  dueDays: number | null;
  minAmount: number | null;
  maxAmount: number | null;
};

export type SignFlowTemplateSummary = {
  id: number;
  documentClass: SignDocumentClass;
  version: number;
  ordered: boolean;
  noSamePerson: boolean;
  returnTarget: string;
  allowManagerSkip: boolean;
  status: string;
  runningRequests: number;
  steps: SignFlowStepSummary[];
};

export type SignVerificationBlock = {
  blockCode: string;
  signerName: string;
  signerRole: string | null;
  requiredMark: string;
  stampCode: string | null;
  authEvidence: string | null;
  decidedAt: string | null;
};

export type SignVerification = {
  valid: boolean;
  documentNo: string;
  revisionLabel: string;
  documentClass: SignDocumentClass;
  title: string;
  projectName: string | null;
  legalEntity: string;
  completedAt: string | null;
  sourceSha256: string;
  outputSha256: string;
  chainHead: string;
  chainVerified: boolean;
  blocks: SignVerificationBlock[];
  statement: string;
};

export const loadSignInbox = () => apiRequest<SignInbox>("/api/v1/signing/inbox");

export const listSignableDocuments = (values: {
  state?: string;
  docClass?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}) => apiRequest<PagedResult<SignableDocumentSummary>>(`/api/v1/signing/documents${queryString(values)}`);

export const loadSignableDocument = (documentId: number) =>
  apiRequest<SignableDocumentWorkspace>(`/api/v1/signing/documents/${documentId}`);

export const createSignableDocument = (input: {
  taskId?: number;
  documentClass: SignDocumentClass;
  title: string;
  projectId?: number;
  estimateId?: number;
  documentLocale: string;
  amount?: number;
  ownerId?: number;
  projectDocumentId: number;
  revisionLabel?: string;
}) => apiRequest<{ id: number; documentNo: string; revisionLabel: string; fileId: number }>(
  "/api/v1/signing/documents", { method: "POST", body: JSON.stringify(input) });

export const freezeDocumentRevision = (documentId: number, input: {
  projectDocumentId: number;
  revisionLabel: string;
  rowVersion: string;
}) => apiRequest<{ documentId: number; fileId: number; revisionLabel: string; supersededRequestId: number | null }>(
  `/api/v1/signing/documents/${documentId}/revisions`, { method: "POST", body: JSON.stringify(input) });

export const openSignatureRequest = (documentId: number, input: { dueDate?: string; rowVersion: string; companyStampId?: number }) =>
  apiRequest<{ requestId: number; steps: number; templateVersion: number }>(
    `/api/v1/signing/documents/${documentId}/request`, { method: "POST", body: JSON.stringify(input) });

/**
 * Forces a fresh interactive sign-in so the API can evidence that the signer
 * was present, then reports the evidence label the chain will record. A
 * team-test session cannot be re-authenticated and is labelled as such forever.
 */
export async function prepareSigningSession(): Promise<"entra" | "team-test"> {
  if (IS_TEAM_TEST_MODE) return "team-test";
  const { reauthenticateForSigning } = await import("./auth-client");
  await reauthenticateForSigning();
  return "entra";
}

export const signStep = (stepId: number, input: {
  note?: string;
  placement?: { pageNo: number; x: number; y: number; width: number; height: number };
  rowVersion: string;
}) => apiRequest<{ stepId: number; state: string; requestComplete: boolean }>(
  `/api/v1/signing/steps/${stepId}/sign`, { method: "POST", body: JSON.stringify(input) });

export const returnStep = (stepId: number, reason: string, rowVersion: string) =>
  apiRequest<{ stepId: number; state: string; documentState: string }>(
    `/api/v1/signing/steps/${stepId}/return`, { method: "POST", body: JSON.stringify({ reason, rowVersion }) });

export const rejectStep = (stepId: number, reason: string, rowVersion: string) =>
  apiRequest<{ stepId: number; state: string; documentState: string }>(
    `/api/v1/signing/steps/${stepId}/reject`, { method: "POST", body: JSON.stringify({ reason, rowVersion }) });

export const delegateStep = (stepId: number, toUserId: number, reason: string, rowVersion: string) =>
  apiRequest<{ stepId: number; assigneeUserId: number }>(
    `/api/v1/signing/steps/${stepId}/delegate`,
    { method: "POST", body: JSON.stringify({ toUserId, reason, rowVersion }) });

export const attachPaperSignature = (stepId: number, input: {
  scanProjectDocumentId: number;
  note?: string;
  rowVersion: string;
}) => apiRequest<{ stepId: number; state: string; requestComplete: boolean }>(
  `/api/v1/signing/steps/${stepId}/paper`, { method: "POST", body: JSON.stringify(input) });

export const verifySignedDocument = (code: string) =>
  apiRequest<SignVerification>(`/api/v1/signing/verify/${encodeURIComponent(code)}`);

export async function downloadSignedOutput(requestId: number) {
  const response = await authorizedFetch(
    `/api/v1/signing/requests/${requestId}/output`,
    { headers: { Accept: "application/octet-stream" } },
    120_000);
  return { blob: await response.blob() };
}

export const loadMySignature = () => apiRequest<SignatureSpecimenView>("/api/v1/me/signature/");

export const replaceMySignature = (input: {
  source: "DRAWN" | "UPLOADED" | "TYPED";
  imageBase64: string;
  initialsBase64?: string;
  initialsText?: string;
}) => apiRequest<{ id: number; version: number; source: string }>(
  "/api/v1/me/signature/", { method: "PUT", body: JSON.stringify(input) });

/** The caller's own specimen. There is deliberately no route for anyone else's. */
export async function loadMySignatureImage(initials = false) {
  const response = await authorizedFetch(
    `/api/v1/me/signature/preview${initials ? "?initials=true" : ""}`,
    { headers: { Accept: "image/png" } });
  return URL.createObjectURL(await response.blob());
}

export const listCompanyStamps = () => apiRequest<CompanyStampSummary[]>("/api/v1/master/company-stamps");

export const createCompanyStamp = (input: {
  code: string;
  nameTh: string;
  nameEn: string;
  nameJa: string;
  legalEntity: string;
  scope: string[];
  custodianRole: string;
  validFrom: string;
  validTo?: string;
}) => apiRequest<{ id: number; code: string }>(
  "/api/v1/master/company-stamps", { method: "POST", body: JSON.stringify(input) });

export const setCompanyStampImage = (stampId: number, imageBase64: string, rowVersion: string) =>
  apiRequest<{ id: number }>(`/api/v1/master/company-stamps/${stampId}/image`, {
    method: "PUT",
    body: JSON.stringify({ imageBase64, rowVersion }),
  });

export const grantStampAuthority = (stampId: number, input: {
  holderKind: "ROLE" | "USER";
  holderId: number;
  /** Role code for a ROLE grant; the API resolves it so the client never needs an id. */
  holderRole?: string;
  documentClass?: string;
  validFrom: string;
  validTo?: string;
}) => apiRequest<{ id: number }>(`/api/v1/master/company-stamps/${stampId}/authorities`, {
  method: "POST",
  body: JSON.stringify(input),
});

export const revokeStampAuthority = (stampId: number, authorityId: number, reason: string) =>
  apiRequest<{ id: number; revoked: boolean }>(
    `/api/v1/master/company-stamps/${stampId}/authorities/${authorityId}/revoke`,
    { method: "POST", body: JSON.stringify({ reason }) });

export const listSignatureFlows = () => apiRequest<SignFlowTemplateSummary[]>("/api/v1/master/signature-flows");

/* Master module templates — a reusable group of equipment an engineer drops into an
   estimate instead of retyping it or copying a whole previous project. */
export type ModuleTemplateSummary = {
  id: number;
  code: string;
  name: string;
  categoryCode: string;
  category: string;
  projectType: string;
  description: string;
  status: string;
  revision: number;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  referenceTotal: number;
  oldestPriceDate: string | null;
  usageCount: number;
  rowVersion: string;
};

export type ModuleTemplateLine = {
  id: number;
  sortOrder: number;
  categoryCode: string;
  category: string;
  subcategory: string;
  itemCode: string;
  description: string;
  brand: string;
  model: string;
  specification: string | null;
  supplierId: number | null;
  supplierName: string | null;
  quantityPerModule: number;
  unit: string;
  referenceUnitCost: number;
  referencePriceSource: string;
  referencePriceDate: string | null;
  remark: string | null;
};

export type ModuleTemplateDetail = ModuleTemplateSummary & { lines: ModuleTemplateLine[] };

export type ModuleTemplateLineInput = {
  categoryCode: string;
  subcategory?: string;
  itemCode: string;
  description: string;
  brand?: string;
  model?: string;
  specification?: string | null;
  supplierId?: number | null;
  quantityPerModule: number;
  unit: string;
  referenceUnitCost?: number;
  referencePriceSource?: string;
  referencePriceDate?: string | null;
  remark?: string | null;
};

export type ModuleTemplateInput = {
  code: string;
  name: string;
  categoryCode: string;
  projectType?: string;
  description?: string;
  status?: string;
  lines: ModuleTemplateLineInput[];
};

export const listModuleTemplates = (values: { page?: number; pageSize?: number; search?: string; categoryCode?: string; status?: string } = {}) =>
  apiRequest<PagedResult<ModuleTemplateSummary>>(`/api/v1/module-templates${queryString(values)}`);

export const loadModuleTemplate = (id: number) =>
  apiRequest<ModuleTemplateDetail>(`/api/v1/module-templates/${id}`);

export const createModuleTemplate = (input: ModuleTemplateInput) =>
  apiRequest<{ id: number; code: string }>("/api/v1/module-templates", { method: "POST", body: JSON.stringify(input) });

export const updateModuleTemplate = (id: number, input: ModuleTemplateInput & { rowVersion: string }) =>
  apiRequest<{ id: number; revision: number; rowVersion: string }>(`/api/v1/module-templates/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const retireModuleTemplate = (id: number, rowVersion: string) =>
  apiRequest<{ id: number; status: string }>(`/api/v1/module-templates/${id}/retire`, { method: "POST", body: JSON.stringify({ rowVersion }) });

export const createModuleTemplateFromEstimate = (input: {
  estimateId: number;
  categoryCode: string;
  module: string;
  code: string;
  name: string;
  projectType?: string;
  description?: string;
}) =>
  apiRequest<{ id: number; code: string; lineCount: number }>("/api/v1/module-templates/from-estimate", { method: "POST", body: JSON.stringify(input) });

export const applyModuleTemplate = (estimateId: number, input: {
  templateId: number;
  module: string;
  modules: number;
  ownerId: number;
  keepReferencePrices: boolean;
  estimateRowVersion: string;
}) =>
  apiRequest<{ lines: number; module: string; reference: string; estimateRowVersion: string }>(`/api/v1/estimates/${estimateId}/apply-template`, {
    method: "POST",
    body: JSON.stringify(input),
  });

/* Labor rate master and reusable labor work packages. The rate picker is a
   read an estimator may perform; the lifecycle actions stay behind master.write
   and the Engineering Manager / Admin rate check. */

export type LaborRate = {
  id: number;
  code: string | null;
  level: string;
  department: string;
  roleActivity: string;
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  version: number;
  defaultErpCategory: string | null;
  supersededByRateId: number | null;
  notes: string | null;
  createdByName: string;
  status: "Effective" | "Future" | "Expired" | "Inactive";
  costType: "Engineering" | "Installation" | null;
  /** The rate the server would freeze on a line for the requested cost type. */
  dailyRate: number | null;
  hourlyRate: number | null;
};

export type LaborRatePage = PagedResult<LaborRate> & {
  on: string;
  costType: "Engineering" | "Installation" | null;
  /** False on a database without migration 044: code, role and ERP are null. */
  masterFieldsAvailable: boolean;
};

export const listLaborRates = (values: {
  page?: number;
  pageSize?: number;
  search?: string;
  costType?: "Engineering" | "Installation";
  department?: string;
  level?: string;
  on?: string;
  effectiveOnly?: boolean;
  includeInactive?: boolean;
} = {}) => apiRequest<LaborRatePage>(`/api/v1/labor-rates${queryString(values)}`);

export const supersedeLaborRate = (id: number, input: {
  rowVersion: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  engineeringHourly: number;
  engineeringDaily: number;
  installationHourly: number;
  installationDaily: number;
  code?: string;
  roleActivity?: string;
  defaultErpCategory?: string | null;
  notes?: string;
  reason: string;
}) => apiRequest<{
  supersededRateId: number;
  supersededEffectiveTo: string;
  rateId: number;
  level: string;
  department: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  rowVersion: string;
}>(`/api/v1/master/engineering-rates/${id}/supersede`, { method: "POST", body: JSON.stringify(input) });

export const retireLaborRate = (id: number, input: { rowVersion: string; effectiveTo: string; reason: string }) =>
  apiRequest<{ id: number; effectiveTo: string; alreadyClosed: boolean; rowVersion?: string }>(
    `/api/v1/master/engineering-rates/${id}/retire`, { method: "POST", body: JSON.stringify(input) });

export type LaborPackageSummary = {
  id: number;
  code: string;
  name: string;
  costType: "Engineering" | "Installation";
  department: string;
  projectType: string;
  description: string;
  status: string;
  revision: number;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  /** Indicative: an applied internal line is re-priced from the live master. */
  referenceTotal: number;
  referenceManDays: number;
  rowVersion: string;
};

export type LaborPackageLine = {
  id: number;
  sortOrder: number;
  activity: string;
  department: string;
  level: string;
  costType: "Engineering" | "Installation";
  provider: "Internal" | "Supplier";
  rateId: number | null;
  rateCode: string | null;
  rateStillEffective: boolean | null;
  rateBasis: "Daily" | "Hourly";
  defaultEngineers: number;
  defaultManDays: number;
  defaultHours: number | null;
  defaultHoursPerDay: number;
  referenceDailyRate: number;
  defaultErpCategory: string | null;
  remark: string | null;
};

export type LaborPackageDetail = LaborPackageSummary & { lines: LaborPackageLine[] };

export type LaborPackageLineInput = {
  activity: string;
  department: string;
  level: string;
  costType?: "Engineering" | "Installation";
  provider?: "Internal" | "Supplier";
  rateId?: number | null;
  rateBasis?: "Daily" | "Hourly";
  defaultEngineers?: number;
  defaultManDays?: number;
  defaultHours?: number | null;
  defaultHoursPerDay?: number;
  referenceDailyRate?: number;
  defaultErpCategory?: string | null;
  remark?: string | null;
};

export type LaborPackageInput = {
  code: string;
  name: string;
  costType: "Engineering" | "Installation";
  department?: string;
  projectType?: string;
  description?: string;
  status?: string;
  lines: LaborPackageLineInput[];
};

export const listLaborPackages = (values: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  costType?: "Engineering" | "Installation";
  department?: string;
} = {}) => apiRequest<PagedResult<LaborPackageSummary>>(`/api/v1/labor-packages${queryString(values)}`);

export const loadLaborPackage = (id: number) =>
  apiRequest<LaborPackageDetail>(`/api/v1/labor-packages/${id}`);

export const createLaborPackage = (input: LaborPackageInput) =>
  apiRequest<{ id: number; code: string }>("/api/v1/labor-packages", { method: "POST", body: JSON.stringify(input) });

export type StandardLaborLibraryInstallResult = {
  createdLabor: string[];
  skippedLabor: string[];
  createdSupport: string[];
  skippedSupport: string[];
  laborPackages: number;
  supportTemplates: number;
  source: string;
  sourceDate: string;
};

export const installStandardLaborLibrary = () =>
  apiRequest<StandardLaborLibraryInstallResult>("/api/v1/labor-packages/install-standard-library", {
    method: "POST",
  });

export const updateLaborPackage = (id: number, input: LaborPackageInput & { rowVersion: string }) =>
  apiRequest<{ id: number; revision: number; rowVersion: string }>(`/api/v1/labor-packages/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const retireLaborPackage = (id: number, rowVersion: string) =>
  apiRequest<{ id: number; status: string }>(`/api/v1/labor-packages/${id}/retire`, { method: "POST", body: JSON.stringify({ rowVersion }) });

export const createLaborPackageFromEstimate = (input: {
  estimateId: number;
  package: string;
  costType: "Engineering" | "Installation";
  code: string;
  name: string;
  department?: string;
  projectType?: string;
  description?: string;
}) => apiRequest<{ id: number; code: string; lineCount: number }>("/api/v1/labor-packages/from-estimate", {
  method: "POST",
  body: JSON.stringify(input),
});

export type LaborPackageApplyOverride = {
  lineId: number;
  skip?: boolean;
  activity?: string;
  engineers?: number;
  manDays?: number;
  hours?: number;
  hoursPerDay?: number;
  dailyRate?: number;
  supplierId?: number;
  quotationNumber?: string;
  priceDate?: string;
  remark?: string | null;
  erpCategory?: string | null;
};

export type LaborPackageAppliedLine = {
  packageLineId: number;
  manhourLineId: number;
  activity: string;
  level: string;
  department: string;
  costType: string;
  provider: string;
  engineers: number;
  manDays: number;
  hoursPerDay: number;
  requestedHours: number | null;
  effectiveHours: number;
  dailyRate: number;
  priceDate: string;
  rateSource: string;
  erpCategory: string | null;
};

export const applyLaborPackage = (estimateId: number, input: {
  packageId: number;
  ownerId: number;
  package?: string;
  lines?: LaborPackageApplyOverride[];
  estimateRowVersion: string;
}) => apiRequest<{
  packageId: number;
  reference: string;
  workPackage: string;
  lines: number;
  skipped: number;
  appliedLines: LaborPackageAppliedLine[];
  estimateRowVersion: string;
}>(`/api/v1/estimates/${estimateId}/apply-labor-package`, { method: "POST", body: JSON.stringify(input) });

export type StorageCheckResult = {
  ok: boolean;
  mode: "Local" | "Nas";
  rootPath: string;
  durationMs: number;
  error?: string;
};
export const checkAdminStorage = () => apiRequest<StorageCheckResult>("/api/v1/admin/storage-check");

export type NasSettingsInput = { server: string; share: string; destinationPath: string; username: string };
export type NasSettingsDraft = NasSettingsInput & {
  updatedAt: string;
  updatedByName: string;
  rowVersion: string;
};
export type NasSettingsResult = {
  active: { mode: "Local" | "Nas"; rootPath: string };
  draft: NasSettingsDraft | null;
};
export type NasConnectionTestResult = { ok: boolean; durationMs: number; uncPath?: string; error?: string };
export const loadNasSettings = () => apiRequest<NasSettingsResult>("/api/v1/admin/nas-settings");
export const saveNasSettings = (input: NasSettingsInput) =>
  apiRequest<NasSettingsDraft>("/api/v1/admin/nas-settings", { method: "PUT", body: JSON.stringify(input) });
export const testNasConnection = (input: NasSettingsInput) =>
  apiRequest<NasConnectionTestResult>("/api/v1/admin/nas-settings/test", { method: "POST", body: JSON.stringify(input) });

export type EstimateModuleDetail = { moduleKey: string; title: string; remark: string | null; descriptionRows?: string[] };
export const loadEstimateModuleDetails = (id: number) => apiRequest<EstimateModuleDetail[]>(`/api/v1/estimates/${id}/module-details`);
export const updateEstimateModuleDetails = (id: number, estimateRowVersion: string, detail: EstimateModuleDetail) =>
  apiRequest<{ estimateRowVersion: string }>(`/api/v1/estimates/${id}/module-details`, { method: "PUT", body: JSON.stringify({ estimateRowVersion, ...detail }) });

export type EstimateEffortInput = { engineers: number; manDays: number; hoursPerDay: number };
export const updateEstimateManhourEffort = (id: number, lineId: number, estimateRowVersion: string, lineRowVersion: string, effort: EstimateEffortInput) =>
  apiRequest<{ rowVersion: string; estimateRowVersion: string }>(`/api/v1/estimates/${id}/manhour-lines/${lineId}/effort`, {
    method: "PUT", body: JSON.stringify({ estimateRowVersion, lineRowVersion, ...effort }),
  });
