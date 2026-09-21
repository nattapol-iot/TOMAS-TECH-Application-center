export type DocumentKind = "Inquiry" | "Estimate";
export type LifecycleAction = "delete-draft" | "cancel" | "cancel-linked" | "archive" | "withdraw";
export type LifecycleDocument = {
  id: number; number: string; name: string; status: string; revision: number;
  ownerId: number; createdBy: number; deleted: boolean; archived: boolean;
  submitted: boolean;
};
export type LifecycleFacts = {
  kind: DocumentKind; document: LifecycleDocument; estimate: LifecycleDocument | null;
  hasProject: boolean; hasWork: boolean; fallbackRevision: number | null; parentClosed?: boolean;
  actorId: number; manager: boolean; canWrite: boolean; canWriteEstimate: boolean; canApprove: boolean;
};
export type LifecycleOption = { action: LifecycleAction; allowed: boolean; reason: string | null };

/** Same decisions feed the preview and the locked mutation; the browser is never authoritative. */
export function lifecycleOptions(f: LifecycleFacts): LifecycleOption[] {
  const d = f.document;
  const owns = f.manager || d.ownerId === f.actorId || (f.kind === "Inquiry" && d.createdBy === f.actorId);
  const common = !f.canWrite || !owns ? "owner_required" : d.deleted ? "already_deleted" : d.archived ? "already_archived" : f.parentClosed ? "parent_closed" : null;
  const draft = (e: LifecycleDocument) => ["Draft", "Engineering Input", "Revision Required"].includes(e.status) && !e.submitted;
  const approved = ["Approved", "Locked"].includes(d.status);
  const activeEstimate = f.estimate && !f.estimate.deleted && f.estimate.status !== "Cancelled" ? f.estimate : null;
  const option = (action: LifecycleAction, reason: string | null): LifecycleOption => ({ action, allowed: !(common || reason), reason: common || reason });
  return [
    option("delete-draft", f.hasProject ? "project_linked" : f.kind === "Inquiry"
      ? f.estimate ? "estimate_linked" : f.hasWork ? "work_started" : d.status !== "New" ? "draft_only" : null
      : !draft(d) ? "draft_only" : d.revision > 0 && f.fallbackRevision === null ? "no_approved_fallback" : null),
    option("cancel", f.hasProject ? "project_linked" : d.status === "Cancelled" ? "already_cancelled"
      : f.kind === "Inquiry" && activeEstimate ? "cancel_estimate_first"
      : d.status === "Engineering Review" ? "withdraw_first"
      : approved && (!f.manager || !f.canApprove) ? "approver_required" : null),
    option("cancel-linked", f.kind !== "Inquiry" || !activeEstimate ? "no_active_estimate" : d.status === "Cancelled" ? "already_cancelled" : f.hasProject ? "project_linked"
      : !f.canWriteEstimate || !(f.manager || activeEstimate.ownerId === f.actorId) ? "estimate_owner_required"
      : !draft(activeEstimate) ? "cancel_estimate_first" : null),
    option("withdraw", f.kind !== "Estimate" || d.status !== "Engineering Review" ? "review_only" : f.hasProject ? "project_linked" : null),
    option("archive", !["Approved", "Locked", "Cancelled"].includes(d.status) ? "terminal_only"
      : f.kind === "Inquiry" && activeEstimate && !["Approved", "Locked"].includes(activeEstimate.status) ? "estimate_active" : null),
  ];
}
