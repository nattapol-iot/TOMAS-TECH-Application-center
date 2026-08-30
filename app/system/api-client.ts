"use client";

import { acquireApiToken } from "./auth-client";
import { getTeamTestSession, IS_TEAM_TEST_MODE } from "./team-test-client";
import { isTrustedWebProtocol } from "./network-origin";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export const IS_API_CONFIGURED = (() => {
  try {
    const url = new URL(apiBaseUrl);
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

export type BootstrapData = {
  user: ApiUser;
  counts: { inquiries: number; estimates: number; activeProjects: number; approvals: number };
  customers: { id: number; code: string; name: string }[];
  suppliers: { id: number; code: string; name: string; category: string }[];
  team: { id: number; name: string; email: string; role: string; department: string; level: string }[];
  permissions: string[];
};

export type PagedResult<T> = { items: T[]; page: number; pageSize: number; total: number };

export type InquirySummary = {
  id: number;
  number: string;
  inquiryDate: string;
  customerId: number;
  customerName: string;
  projectName: string;
  projectType: string;
  estimateOwnerId: number;
  estimateOwnerName: string;
  dueDate: string;
  priority: string;
  status: string;
  progress: number;
  revision: number;
  estimateId: number | null;
  updatedAt: string;
  rowVersion: string;
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
  dueDate: string;
  status: string;
  progress: number;
  materialTotal: number;
  engineeringTotal: number;
  total: number;
  updatedAt: string;
  rowVersion: string;
};

export type ProjectSummary = {
  id: number;
  number: string;
  name: string;
  customerName: string;
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
  customerId: number;
  contact: string;
  projectName: string;
  projectType: string;
  rfqNo?: string;
  salesOwner?: string;
  estimateOwnerId: number;
  dueDate: string;
  priority: string;
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
  contact?: string;
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
  supplierId: number | null;
  supplierName: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  lineTotal: number;
  priceSource: string;
  referenceNumber: string | null;
  priceDate: string | null;
  ownerId: number;
  ownerName: string;
  status: string;
  rowVersion: string;
};

export type EstimateCostWorkspace = {
  header: {
    id: number;
    number: string;
    revision: number;
    status: string;
    contingencyRate: number;
    rowVersion: string;
    totals: {
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
  costItems: EstimateCostItem[];
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
  } else {
    const token = await acquireApiToken();
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof init?.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  const response = await fetch(`${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ code: "http_error", message: response.statusText })) as { code?: string; message?: string };
    const code = response.status === 401 ? "session_expired" : error.code ?? "http_error";
    const message = response.status === 401 ? "Your session is no longer valid. Please sign in again." : error.message ?? "The request failed.";
    throw new ApiClientError(response.status, code, message);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const loadBootstrap = () => apiRequest<BootstrapData>("/api/v1/bootstrap");

const queryString = (values: Record<string, string | number | boolean | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : "";
};

export const listInquiries = (values: { page?: number; pageSize?: number; search?: string; status?: string }) =>
  apiRequest<PagedResult<InquirySummary>>(`/api/v1/inquiries/${queryString(values)}`);

export const createInquiry = (input: CreateInquiryInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>("/api/v1/inquiries/", { method: "POST", body: JSON.stringify(input) });

export const listEstimates = (values: { page?: number; pageSize?: number; search?: string; status?: string }) =>
  apiRequest<PagedResult<EstimateSummary>>(`/api/v1/estimates/${queryString(values)}`);

export const createEstimate = (input: CreateEstimateInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>("/api/v1/estimates/", { method: "POST", body: JSON.stringify(input) });

export const estimateWorkflow = (id: number, action: "submit" | "approve" | "request-revision", rowVersion: string, comment = "") =>
  apiRequest<{ id: number; status: string; rowVersion: string }>(`/api/v1/estimates/${id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ comment, rowVersion }),
  });

export const loadEstimateCostWorkspace = (id: number) =>
  apiRequest<EstimateCostWorkspace>(`/api/v1/estimates/${id}/cost-workspace`);

export const createCostItem = (estimateId: number, input: CostItemInput) =>
  apiRequest<{ id: number; rowVersion: string; estimateRowVersion: string }>(`/api/v1/estimates/${estimateId}/cost-items`, { method: "POST", body: JSON.stringify(input) });

export const removeCostItem = (estimateId: number, lineId: number, estimateRowVersion: string, lineRowVersion: string, reason = "") =>
  apiRequest<{ id: number; estimateRowVersion: string }>(`/api/v1/estimates/${estimateId}/cost-items/${lineId}/remove`, {
    method: "POST",
    body: JSON.stringify({ estimateRowVersion, lineRowVersion, reason }),
  });

export const listProjects = (values: { page?: number; pageSize?: number; search?: string; status?: string }) =>
  apiRequest<PagedResult<ProjectSummary>>(`/api/v1/projects/${queryString(values)}`);

export const createProject = (input: CreateProjectInput) =>
  apiRequest<{ id: number; number: string; rowVersion: string }>("/api/v1/projects/", { method: "POST", body: JSON.stringify(input) });

export const listProjectDocuments = (projectId: number) =>
  apiRequest<ProjectDocument[]>(`/api/v1/projects/${projectId}/documents`);

export async function uploadProjectDocument(projectId: number, input: { file: File; folderCode: string; documentType: string; remark?: string }) {
  const body = new FormData();
  body.set("file", input.file);
  body.set("folderCode", input.folderCode);
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

export const listInventory = (values: { search?: string; reorderOnly?: boolean }) =>
  apiRequest<ItemBalance[]>(`/api/v1/inventory/items${queryString(values)}`);
