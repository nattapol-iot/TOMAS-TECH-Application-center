import { apiRequest, downloadIssueImage, uploadIssueImage } from "../api-client";
import type { IssueAction, IssueCategory, IssueItemPayload, IssueState } from "../../../lib/issue-batches";

/* The issue batch API (backend-node/src/routes/issue-batches.ts) as the Punchlist, Plan and My Work read it. */

export type IssueBatchTab = "all" | "open" | "approval" | "mine" | "closed";

type BatchHeader = {
  id: number; batchNo: string; projectId: number | null; projectNo: string; projectName: string; projectClosed: boolean;
  externalProject: string; customerName: string; reportedOn: string; reportedBy: string; note: string;
  createdBy: number; createdByName: string; createdAt: string; updatedAt: string; closedAt: string | null; rowVersion: string;
};

export type IssueBatchSummary = BatchHeader & {
  itemCount: number; approvalCount: number; openCount: number; doingCount: number; doneCount: number; droppedCount: number;
  planHours: number; actualHours: number; mineCount: number;
};

export type IssueBatchList = {
  items: IssueBatchSummary[]; page: number; pageSize: number; total: number;
  tabs: Record<IssueBatchTab, number>; canWrite: boolean; isApprover: boolean;
};

export type IssueImage = { id: number; itemId: number; fileName: string; sizeBytes: number; uploadedBy: number; uploadedAt: string };

export type IssueItem = {
  id: number; batchId: number; lineNo: number; category: IssueCategory; functionName: string; description: string;
  assigneeId: number | null; assigneeName: string; planStart: string | null; planEnd: string | null; planHours: number | null;
  state: IssueState; startedOn: string | null; doneOn: string | null; actualHours: number | null; fixNote: string; reason: string;
  decidedByName: string; decidedAt: string | null; createdBy: number; createdByName: string; createdAt: string; updatedAt: string; rowVersion: string;
};

export type IssueBatchItem = IssueItem & { images: IssueImage[]; actions: IssueAction[]; mayEdit: boolean };
export type IssueBatch = BatchHeader & { isApprover: boolean; mayEdit: boolean; mayAdd: boolean; items: IssueBatchItem[] };

export type MyIssue = IssueItem & { batchNo: string; projectId: number | null; projectNo: string; projectName: string; customerName: string; actions: IssueAction[] };
export type ProjectIssue = IssueItem & { batchNo: string };

export type IssueBatchHeaderInput = {
  projectId: number | null; externalProject: string; customerName: string; reportedOn: string; reportedBy: string; note: string;
};

/** What an action sends besides the version: a reason (reject, cancel), the day started, or the close-out. */
export type IssueActionInput = { reason?: string; startedOn?: string; doneOn?: string; actualHours?: number | null; fixNote?: string };

export function loadIssueBatches(query: { tab: IssueBatchTab; search: string; projectId: number | null; page: number; pageSize: number }) {
  const params = new URLSearchParams({ tab: query.tab, page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search.trim()) params.set("search", query.search.trim());
  if (query.projectId) params.set("projectId", String(query.projectId));
  return apiRequest<IssueBatchList>(`/api/v1/issue-batches?${params}`);
}

export const loadIssueBatch = (id: number) => apiRequest<IssueBatch>(`/api/v1/issue-batches/${id}`);

export const createIssueBatch = (header: IssueBatchHeaderInput, items: IssueItemPayload[]) =>
  apiRequest<IssueBatch>("/api/v1/issue-batches", { method: "POST", body: JSON.stringify({ ...header, items }) });

export const updateIssueBatch = (id: number, rowVersion: string, header: IssueBatchHeaderInput) =>
  apiRequest<IssueBatch>(`/api/v1/issue-batches/${id}`, { method: "PUT", body: JSON.stringify({ ...header, rowVersion }) });

export const addIssueItems = (id: number, items: IssueItemPayload[]) =>
  apiRequest<IssueBatch>(`/api/v1/issue-batches/${id}/items`, { method: "POST", body: JSON.stringify({ items }) });

export const updateIssueItem = (item: { id: number; rowVersion: string }, input: IssueItemPayload) =>
  apiRequest<IssueBatch>(`/api/v1/issue-items/${item.id}`, { method: "PUT", body: JSON.stringify({ ...input, rowVersion: item.rowVersion }) });

export const takeIssueAction = (item: { id: number; rowVersion: string }, action: IssueAction, input: IssueActionInput = {}) =>
  apiRequest<IssueBatch>(`/api/v1/issue-items/${item.id}/${action}`, { method: "POST", body: JSON.stringify({ ...input, rowVersion: item.rowVersion }) });

export const addIssueImage = (itemId: number, file: File) => uploadIssueImage<IssueImage>(itemId, file);
export const issueImageBlob = (itemId: number, imageId: number) => downloadIssueImage(itemId, imageId);
export const removeIssueImage = (itemId: number, imageId: number) =>
  apiRequest<void>(`/api/v1/issue-items/${itemId}/images/${imageId}`, { method: "DELETE" });

export const loadMyIssues = () => apiRequest<{ items: MyIssue[]; waitingApproval: number }>("/api/v1/me/issues");
export const loadProjectIssues = (projectId: number) => apiRequest<{ items: ProjectIssue[] }>(`/api/v1/projects/${projectId}/issues`);
